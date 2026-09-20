import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { wireCoverageAnalysis, type StaticComponentSummary } from "../coverageAnalysisWiring";

async function waitUntil<T>(
  get: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = get();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Reuses 5a's own fixture project (same one src/test/staticAnalysis.test.ts
// exercises) rather than inventing a second one just for this wiring test --
// this suite only cares that analyzeWorkspace's result reaches the webview
// in the right shape, not about any particular analysis result.
const FIXTURE_ROOT = path.join(__dirname, "..", "..", "spike", "fixtures", "static-analysis-app");

interface SentMessage {
  type?: string;
  components?: StaticComponentSummary[];
  message?: string;
}

function createFakeWebview(): {
  webview: vscode.Webview;
  sent: SentMessage[];
  trigger: (message: unknown) => void;
} {
  let handler: ((message: unknown) => void) | undefined;
  const sent: SentMessage[] = [];
  const webview = {
    onDidReceiveMessage: (listener: (message: unknown) => void) => {
      handler = listener;
      return { dispose() {} };
    },
    postMessage: (message: SentMessage) => {
      sent.push(message);
      return Promise.resolve(true);
    },
  } as unknown as vscode.Webview;

  return { webview, sent, trigger: (message: unknown) => handler?.(message) };
}

suite("wireCoverageAnalysis", () => {
  test("answers a runCoverageAnalysis request with the fixture's statically-known components", async () => {
    const { webview, sent, trigger } = createFakeWebview();
    const disposable = wireCoverageAnalysis(webview, FIXTURE_ROOT);
    try {
      trigger({ type: "runCoverageAnalysis" });

      const response = await waitUntil(
        () => sent.find((m) => m.type === "staticComponents"),
        (m) => m !== undefined,
      );

      const components = response?.components ?? [];
      assert.ok(components.length > 0, "expected at least one statically-known component");
      assert.ok(
        components.some((c) => c.displayName === "AllPropsUsed"),
        "expected the fixture's AllPropsUsed component in the result",
      );
      for (const component of components) {
        assert.strictEqual(typeof component.displayName, "string");
        assert.strictEqual(typeof component.filePath, "string");
        assert.strictEqual(typeof component.line, "number");
        assert.strictEqual(typeof component.column, "number");
      }
    } finally {
      disposable.dispose();
    }
  });

  test("ignores a second runCoverageAnalysis request fired while the first is still in flight", async () => {
    const { webview, sent, trigger } = createFakeWebview();
    const disposable = wireCoverageAnalysis(webview, FIXTURE_ROOT);
    try {
      // Both fire synchronously, before the first request's setImmediate
      // yield -- the second must see the in-flight guard and be a no-op.
      trigger({ type: "runCoverageAnalysis" });
      trigger({ type: "runCoverageAnalysis" });

      await waitUntil(
        () => sent.filter((m) => m.type === "staticComponents").length,
        (count) => count > 0,
      );
      // A further beat in case a wrongly-re-entrant second request were
      // also about to post its own response.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const responses = sent.filter((m) => m.type === "staticComponents");
      assert.strictEqual(
        responses.length,
        1,
        "a second concurrent request must not produce a second response",
      );
    } finally {
      disposable.dispose();
    }
  });

  test("accepts a new request once the previous one has completed", async () => {
    const { webview, sent, trigger } = createFakeWebview();
    const disposable = wireCoverageAnalysis(webview, FIXTURE_ROOT);
    try {
      trigger({ type: "runCoverageAnalysis" });
      await waitUntil(
        () => sent.filter((m) => m.type === "staticComponents").length,
        (count) => count > 0,
      );

      trigger({ type: "runCoverageAnalysis" });
      await waitUntil(
        () => sent.filter((m) => m.type === "staticComponents").length,
        (count) => count > 1,
      );

      assert.strictEqual(sent.filter((m) => m.type === "staticComponents").length, 2);
    } finally {
      disposable.dispose();
    }
  });

  test("ignores messages of any other type", async () => {
    const { webview, sent, trigger } = createFakeWebview();
    const disposable = wireCoverageAnalysis(webview, FIXTURE_ROOT);
    try {
      trigger({ type: "wall", message: { event: "operations", payload: [] } });
      trigger({ type: "openSource", fileName: "x", lineNumber: 1, columnNumber: 1 });
      trigger({});
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.strictEqual(sent.length, 0);
    } finally {
      disposable.dispose();
    }
  });

  test("stops posting once disposed", async () => {
    const { webview, sent, trigger } = createFakeWebview();
    const disposable = wireCoverageAnalysis(webview, FIXTURE_ROOT);
    disposable.dispose();
    trigger({ type: "runCoverageAnalysis" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(sent.length, 0, "a disposed wiring must not post any message");
  });
});
