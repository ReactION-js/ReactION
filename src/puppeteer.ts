import puppeteer, { type Browser, type Page } from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { type ReactionConfig, toUrl } from "./config";
import { type LogFn, noopLog } from "./logging";
import { detectDevServerUrl } from "./devServerProbe";

// Full detail for the log (stack when available), not just String(error) --
// issue #73 asked for verbose logs, and `String(error)` on a puppeteer launch
// failure typically collapses to an unhelpful "Error: <message>". A thrown
// value that isn't an Error (realistic: puppeteer-core and Node's fs/
// child_process APIs can reject with plain objects) needs the same treatment
// -- String() on those degrades to "[object Object]" (or literally
// "undefined" if the value has a toString() that returns undefined), which is
// exactly the useless-log-line failure mode this function exists to avoid.
export function errorDetail(error: unknown): string {
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
// (vscode-free) so ViewPanel doesn't duplicate this logic.
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
      `(a corrupted install or an unexpected internal error). ${errorDetail(error.cause)}`
    );
  }
  const detail = error instanceof ChromeLaunchError ? error.cause : error;
  return `ReactION: could not launch Chrome. Check "executablePath" in reactION-config.json. ${errorDetail(detail)}`;
}

// Concise, webview-facing counterpart to describeStartFailure: the same
// three-way diagnosis, but as a short title + actionable hint with none of the
// raw errorDetail stacks (those still go to the error toast + Output channel).
// Shown as inline copy in the empty panel so a stopped dev server reads as
// "start your app" instead of an endless "Connecting…".
export interface StartFailureNotice {
  title: string;
  hint: string;
}

export function describeStartFailureBrief(error: unknown): StartFailureNotice {
  if (error instanceof DevServerUnreachableError) {
    return {
      title: `Can't reach your dev server at ${error.url}.`,
      hint:
        "Start your React app (for example `npm run dev` or `npm start`), then reopen this " +
        'panel. If it runs on a different port, update "localhost" in reactION-config.json.',
    };
  }
  if (error instanceof BackendInjectionError) {
    return {
      title: "Chrome launched, but the ReactION DevTools backend couldn't be injected.",
      hint: "Close and reopen the panel. If it keeps happening, reinstall the extension.",
    };
  }
  return {
    title: "Couldn't launch Chrome.",
    hint: 'Check that "executablePath" in reactION-config.json points to your browser binary.',
  };
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
  // Set before our own browser.close() so the 'disconnected' listener can
  // tell "we did this" apart from an actual crash/user-closed-the-window.
  private closing = false;
  private activeUrl = "";
  private browserDisconnectHandler: (() => void) | undefined;

  // `log` is optional and defaults to a no-op so every existing call site
  // (spike/*.js, ViewPanel before this change) keeps working
  // unmodified.
  public constructor(config: ReactionConfig, log?: LogFn) {
    this.headless = config.headless_browser;
    this.executablePath = config.executablePath;
    this.url = toUrl(config.localhost);
    this.log = log ?? noopLog;
  }

  // The URL actually navigated to at startup (after dev-server auto-detection
  // may have picked a fallback port) -- what reconnect() should keep targeting.
  public get connectedUrl(): string {
    return this.activeUrl || this.url;
  }

  // Fires when puppeteer-core's Browser reports the whole browser process is
  // gone (crash, or the user closing the Chrome window it launched) -- but
  // NOT when our own close() causes that same event. Single-subscriber (like
  // Puppeteer's other lifecycle hooks): only one owner (the panel) ever wires
  // resilience to a given instance.
  public onBrowserDisconnected(handler: () => void): void {
    this.browserDisconnectHandler = handler;
  }

  // The pid of the exact Chrome process this instance launched, if any.
  // Exists so verification tooling can simulate a real crash by killing
  // precisely this process -- never any other Chrome window on the machine.
  public get browserPid(): number | undefined {
    return this.browser?.process()?.pid ?? undefined;
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
        // Without this, Puppeteer forces a fixed 800x600 viewport regardless
        // of the actual window size, so a visible (non-headless) Chrome
        // window renders the page in a small top-left rectangle and leaves
        // the rest blank. `null` makes the viewport track the window's real
        // inner size instead.
        defaultViewport: null,
        // Our relay is loopback-only (see devtoolsBridge.ts) and `pipe: true`
        // above means no remote-debugging TCP port -- so macOS's built-in
        // firewall already exempts all of our traffic. These flags additionally
        // silence Chrome's own background/outbound chatter (telemetry, safe-
        // browsing, component/sync updates) so outbound firewalls like Little
        // Snitch/LuLu and strict corporate endpoint agents don't prompt or block
        // on launch. `--proxy-bypass-list` keeps the loopback relay direct even
        // if a corporate PAC/policy tries to route localhost through a proxy.
        args: [
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
          "--disable-domain-reliability",
          "--proxy-bypass-list=127.0.0.1;localhost;[::1]",
          ...(this.headless ? [] : ["--start-maximized"]),
        ],
      });
    } catch (error) {
      this.log(`Chrome launch failed: ${errorDetail(error)}`);
      throw new ChromeLaunchError(error);
    }
    this.log("Chrome launched successfully");

    this.browser.on("disconnected", () => {
      if (this.closing) {
        return;
      }
      this.log("Chrome browser disconnected unexpectedly (not our own close())");
      this.browserDisconnectHandler?.();
    });

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

    // Cheap reachability probe before committing to the (much slower)
    // goto-retry loop below -- see devServerProbe.ts. Always tried first
    // against the configured URL; only probes fallback ports if that doesn't
    // answer quickly, and never makes a genuine cold start slower since a
    // fully-unreachable probe pass just falls back to the configured URL.
    const detected = await detectDevServerUrl(this.url, this.log);
    const targetUrl = detected.url;

    try {
      await this.gotoWithRetry(targetUrl);
    } catch (error) {
      throw new DevServerUnreachableError(targetUrl, error);
    }
    this.activeUrl = targetUrl;
  }

  // Dev servers may still be booting when the panel opens; retry navigation for
  // a few seconds before giving up.
  private async gotoWithRetry(url: string, attempts = 10): Promise<void> {
    if (!this.page) {
      return;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!this.page) {
        // The page/browser was torn down (panel closed) mid-retry; stop
        // instead of throwing an opaque TypeError on the next .goto() call.
        throw lastError ?? new Error("page closed while retrying navigation");
      }
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

  // Single re-navigation attempt to `url` on the existing page, used after the
  // initial successful start() to recover from a backend disconnect that
  // didn't self-heal (see connectionResilience.ts, which owns the retry
  // schedule). Never throws: a failed attempt is just `false`, so the caller's
  // own bounded backoff loop stays in control.
  public async reconnect(url: string): Promise<boolean> {
    if (!this.page || this.closing) {
      return false;
    }
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
      this.log(`Reconnect: reached ${url}`);
      return true;
    } catch (error) {
      this.log(`Reconnect attempt to ${url} failed: ${errorDetail(error)}`);
      return false;
    }
  }

  public async close(): Promise<void> {
    this.closing = true;
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }
}
