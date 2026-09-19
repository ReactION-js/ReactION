import puppeteer, { type Browser, type Page } from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import { type ReactionConfig, toUrl } from "./config";

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

  public constructor(config: ReactionConfig) {
    this.headless = config.headless_browser;
    this.executablePath = config.executablePath;
    this.url = toUrl(config.localhost);
  }

  // Launches Chrome, injects the React DevTools backend BEFORE any app script so
  // the global hook is present when React initializes, then navigates to the app.
  public async start(relayPort: number): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.headless,
      executablePath: this.executablePath,
      pipe: true,
    });

    const pages = await this.browser.pages();
    this.page = pages[0] ?? (await this.browser.newPage());

    const backendSource = fs.readFileSync(backendSourcePath(), "utf8");
    await this.page.evaluateOnNewDocument(backendSource);
    await this.page.evaluateOnNewDocument(connectSource(relayPort));

    await this.gotoWithRetry(this.url);
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
        return;
      } catch (error) {
        lastError = error;
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
