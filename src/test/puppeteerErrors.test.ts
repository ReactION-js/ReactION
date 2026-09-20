import * as assert from "node:assert";
import Puppeteer, {
  ChromeLaunchError,
  DevServerUnreachableError,
  describeStartFailure,
} from "../puppeteer";
import type { ReactionConfig } from "../config";

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
