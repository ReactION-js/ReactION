import puppeteer, { type Browser, type Page } from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { type ReactionConfig, toUrl } from "./config";
import { type LogFn, noopLog } from "./logging";

// Full detail for the log (stack when available), not just String(error) --
// issue #73 asked for verbose logs, and `String(error)` on a puppeteer launch
// failure typically collapses to an unhelpful "Error: <message>". A thrown
// value that isn't an Error (realistic: puppeteer-core and Node's fs/
// child_process APIs can reject with plain objects) needs the same treatment
// -- String() on those degrades to "[object Object]" (or literally
// "undefined" if the value has a toString() that returns undefined), which is
// exactly the useless-log-line failure mode this function exists to avoid.
function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return util.inspect(error, { depth: 3 });
}

// Thrown when Chrome itself never came up (bad executablePath, sandbox issue,
// binary crashed, etc). Distinct from DevServerUnreachableError so callers can
// show an accurate message instead of one generic "could not launch Chrome"
// string for two very different failures.
export class ChromeLaunchError extends Error {
  public constructor(public readonly cause: unknown) {
    super(`Chrome failed to launch: ${errorDetail(cause)}`);
    this.name = "ChromeLaunchError";
  }
}

// Thrown when Chrome launched fine but gotoWithRetry exhausted its attempts --
// almost always means the configured dev server isn't up/reachable, not a
// Chrome problem.
export class DevServerUnreachableError extends Error {
  public constructor(
    public readonly url: string,
    public readonly cause: unknown,
  ) {
    super(`Could not reach ${url}: ${errorDetail(cause)}`);
    this.name = "DevServerUnreachableError";
  }
}

// Thrown when Chrome launched fine but the setup between launch and
// navigation failed: getting/opening a page, reading the react-devtools-core
// bundle off disk, or injecting it via evaluateOnNewDocument. Distinct from
// ChromeLaunchError so a corrupted install or a page that closed itself isn't
// misreported as an executablePath problem when Chrome demonstrably launched.
export class BackendInjectionError extends Error {
  public constructor(public readonly cause: unknown) {
    super(`Chrome launched, but backend injection failed: ${errorDetail(cause)}`);
    this.name = "BackendInjectionError";
  }
}

// Builds the vscode.window.showErrorMessage text for a Puppeteer.start()
// failure, distinguishing "Chrome itself failed to launch" from "Chrome
// launched but couldn't reach the dev server" from "Chrome launched but the
// backend couldn't be injected" (see the error classes above). Kept here
// (vscode-free) so ViewPanel/EmbeddedViewPanel don't duplicate this logic.
export function describeStartFailure(error: unknown): string {
  if (error instanceof DevServerUnreachableError) {
    return (
      `ReactION: Chrome launched, but could not reach the dev server at ${error.url}. ` +
      'Check the "localhost" setting in reactION-config.json and confirm the dev server is running.'
    );
  }
  if (error instanceof BackendInjectionError) {
    return (
      "ReactION: Chrome launched, but the ReactION DevTools backend could not be injected " +
      `(a corrupted install or an unexpected internal error). ${String(error.cause)}`
    );
  }
  const detail = error instanceof ChromeLaunchError ? error.cause : error;
  return `ReactION: could not launch Chrome. Check "executablePath" in reactION-config.json. ${String(detail)}`;
}

// Locates the prebuilt react-devtools-core backend bundle to inject into the page.
function backendSourcePath(): string {
  const pkgPath = require.resolve("react-devtools-core/package.json");
  return path.join(path.dirname(pkgPath), "dist", "backend.js");
}

// Page script (runs before React) that installs the DevTools hook and points the
// backend at the host relay on the given port.
function connectSource(port: number): string {
  return `(function () {
  try {
    var backend = window.ReactDevToolsBackend;
    if (!backend || typeof backend.connectToDevTools !== 'function') { return; }
    if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && typeof backend.initialize === 'function') {
      try { backend.initialize(); } catch (e) { /* hook may already be installed */ }
    }
    backend.connectToDevTools({ host: '127.0.0.1', port: ${port} });
  } catch (e) { /* nothing the page can do */ }
})();`;
}

export default class Puppeteer {
  private browser: Browser | undefined;
  private page: Page | undefined;
  private readonly headless: boolean;
  private readonly executablePath: string;
  private readonly url: string;
  private readonly log: LogFn;

  // `log` is optional and defaults to a no-op so every existing call site
  // (spike/*.js, ViewPanel/EmbeddedViewPanel before this change) keeps working
  // unmodified.
  public constructor(config: ReactionConfig, log?: LogFn) {
    this.headless = config.headless_browser;
    this.executablePath = config.executablePath;
    this.url = toUrl(config.localhost);
    this.log = log ?? noopLog;
  }

  // Launches Chrome, injects the React DevTools backend BEFORE any app script so
  // the global hook is present when React initializes, then navigates to the app.
  public async start(relayPort: number): Promise<void> {
    this.log(
      `Launching Chrome (executablePath="${this.executablePath}", headless=${this.headless}) -> ${this.url}`,
    );
    try {
      this.browser = await puppeteer.launch({
        headless: this.headless,
        executablePath: this.executablePath,
        pipe: true,
      });
    } catch (error) {
      this.log(`Chrome launch failed: ${errorDetail(error)}`);
      throw new ChromeLaunchError(error);
    }
    this.log("Chrome launched successfully");

    // Own try/catch: none of this is "launching Chrome" (which just
    // succeeded) -- a failure here (corrupted react-devtools-core install,
    // the page closing itself, an injection error) must not be mislabeled as
    // a ChromeLaunchError telling the user to check "executablePath".
    try {
      const pages = await this.browser.pages();
      this.page = pages[0] ?? (await this.browser.newPage());

      const backendSource = fs.readFileSync(backendSourcePath(), "utf8");
      await this.page.evaluateOnNewDocument(backendSource);
      await this.page.evaluateOnNewDocument(connectSource(relayPort));
    } catch (error) {
      this.log(`Backend injection failed: ${errorDetail(error)}`);
      throw new BackendInjectionError(error);
    }

    try {
      await this.gotoWithRetry(this.url);
    } catch (error) {
      throw new DevServerUnreachableError(this.url, error);
    }
  }

  // Dev servers may still be booting when the panel opens; retry navigation for
  // a few seconds before giving up.
  private async gotoWithRetry(url: string, attempts = 10): Promise<void> {
    if (!this.page) {
      return;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
        this.log(`Reached ${url} on attempt ${attempt + 1}/${attempts}`);
        return;
      } catch (error) {
        lastError = error;
        this.log(
          `Attempt ${attempt + 1}/${attempts} to reach ${url} failed: ${errorDetail(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }
}
