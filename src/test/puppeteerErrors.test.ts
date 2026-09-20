import * as assert from "node:assert";
import * as fs from "node:fs";
import Puppeteer, {
  BackendInjectionError,
  ChromeLaunchError,
  DevServerUnreachableError,
  describeStartFailure,
} from "../puppeteer";
import type { ReactionConfig } from "../config";

const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function baseConfig(overrides: Partial<ReactionConfig> = {}): ReactionConfig {
  return {
    system: process.platform,
    executablePath: "",
    localhost: "localhost:3000",
    headless_browser: true,
    headless_embedded: true,
    reactTheme: "dark",
    ...overrides,
  };
}

suite("Puppeteer start-failure diagnostics", () => {
  test("describeStartFailure distinguishes a Chrome launch failure from an unreachable dev server", () => {
    const launchMessage = describeStartFailure(
      new ChromeLaunchError(new Error("spawn ENOENT")),
    );
    assert.match(launchMessage, /could not launch Chrome/);
    assert.match(launchMessage, /executablePath/);
    assert.match(launchMessage, /ENOENT/);

    const unreachableMessage = describeStartFailure(
      new DevServerUnreachableError(
        "http://localhost:3000",
        new Error("net::ERR_CONNECTION_REFUSED"),
      ),
    );
    assert.match(unreachableMessage, /could not reach the dev server/);
    assert.match(unreachableMessage, /http:\/\/localhost:3000/);
    assert.match(unreachableMessage, /"localhost".*reactION-config\.json/);
  });

  test("describeStartFailure falls back to a generic Chrome-launch message for an unrecognized error", () => {
    const message = describeStartFailure(new Error("boom"));
    assert.match(message, /could not launch Chrome/);
    assert.match(message, /boom/);
  });

  test("Puppeteer can be constructed without a logger", () => {
    assert.doesNotThrow(() => {
      new Puppeteer(baseConfig());
    });
  });

  test("Puppeteer invokes the provided logger and throws ChromeLaunchError when Chrome can't launch", async function () {
    this.timeout(20_000);
    const lines: string[] = [];
    const page = new Puppeteer(
      baseConfig({ executablePath: "/definitely/not/a/real/chrome-binary" }),
      (message) => lines.push(message),
    );

    await assert.rejects(page.start(0), ChromeLaunchError);
    assert.ok(
      lines.some((line) => line.includes("Launching Chrome")),
      "should log the launch attempt",
    );
    assert.ok(
      lines.some((line) => line.includes("Chrome launch failed")),
      "should log the launch failure with full detail",
    );
  });
});

suite("Puppeteer errorDetail() on non-Error thrown values", () => {
  test("preserves inspectable detail instead of degrading to '[object Object]'", () => {
    // The exact repro from code review: a plain object whose toString()
    // returns undefined, which String() would collapse to the literal
    // string "undefined".
    const weird = {
      code: "WEIRD",
      toString(): string | undefined {
        return undefined;
      },
    };

    const launchMessage = new ChromeLaunchError(weird).message;
    assert.ok(!launchMessage.includes("[object Object]"));
    assert.notStrictEqual(launchMessage, "Chrome failed to launch: undefined");
    assert.match(launchMessage, /WEIRD/);

    const unreachableMessage = new DevServerUnreachableError("http://x", weird).message;
    assert.match(unreachableMessage, /WEIRD/);

    const injectionMessage = new BackendInjectionError(weird).message;
    assert.match(injectionMessage, /WEIRD/);
  });

  test("still handles a bare string or number thrown value without throwing", () => {
    assert.doesNotThrow(() => new ChromeLaunchError("just a string"));
    assert.doesNotThrow(() => new ChromeLaunchError(42));
    assert.match(new ChromeLaunchError("just a string").message, /just a string/);
  });
});

// Chrome-gated: skips (not fails) when CHROME_PATH/the default macOS path
// doesn't exist, so `npm test` stays green without Chrome installed, while
// still exercising the real code path wherever Chrome IS available.
suite("Puppeteer backend-injection failure (previously-uncovered middle section of start())", () => {
  test("a failure between a successful Chrome launch and gotoWithRetry throws BackendInjectionError, not ChromeLaunchError", async function () {
    if (!fs.existsSync(CHROME_PATH)) {
      this.skip();
      return;
    }
    this.timeout(30_000);

    // CdpBrowser.prototype is shared by every Browser instance puppeteer-core
    // hands back, including the one Puppeteer.start() launches internally --
    // patching it here (and restoring it in `finally`) simulates a real
    // failure in the launch->goto gap (e.g. a corrupted install, or the page
    // closing itself) without needing to fake Chrome's own CDP handshake.
    // Not a typed named import: puppeteer-core's .d.ts doesn't re-export
    // CdpBrowser at the top level even though the runtime module does (a
    // default `import puppeteer from "puppeteer-core"` also only binds the
    // launch()-able singleton, not the module namespace) -- require() it
    // directly to reach the real class the same way Puppeteer.start() does.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CdpBrowser = (require("puppeteer-core") as { CdpBrowser: { prototype: Record<string, unknown> } })
      .CdpBrowser;
    const originalPages = CdpBrowser.prototype.pages;
    // Also doubles as end-to-end proof of the errorDetail() fix: a non-Error
    // thrown value flowing through the real code path must still produce a
    // readable log line, not "[object Object]"/"undefined".
    const weirdFailure = {
      code: "EFAKE_PAGES",
      toString(): string | undefined {
        return undefined;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CdpBrowser.prototype as any).pages = function patchedPages(): Promise<unknown[]> {
      return Promise.reject(weirdFailure);
    };

    const lines: string[] = [];
    const page = new Puppeteer(
      {
        system: process.platform,
        executablePath: CHROME_PATH,
        localhost: "127.0.0.1:1",
        headless_browser: true,
        headless_embedded: true,
        reactTheme: "dark",
      },
      (message) => lines.push(message),
    );

    let caught: unknown;
    try {
      await page.start(0);
    } catch (error) {
      caught = error;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (CdpBrowser.prototype as any).pages = originalPages;
      await page.close();
    }

    assert.ok(
      caught instanceof BackendInjectionError,
      `expected BackendInjectionError, got ${String(caught)}`,
    );
    assert.ok(lines.some((line) => line.includes("Chrome launched successfully")));
    assert.ok(
      lines.some(
        (line) => line.includes("Backend injection failed") && line.includes("EFAKE_PAGES"),
      ),
      "log should include the full, inspectable detail of the non-Error thrown value",
    );

    const message = describeStartFailure(caught);
    assert.match(message, /backend could not be injected/);
    assert.ok(
      !/executablePath/.test(message),
      "must not blame executablePath when Chrome demonstrably launched",
    );
  });
});
