import * as assert from "node:assert";
import * as vscode from "vscode";
import DevtoolsBridge from "../devtoolsBridge";
import { startLiveTreePipeline, type LiveTreePipelinePage } from "../liveTreePipeline";

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// A real vscode.Webview supports any number of independent
// onDidReceiveMessage subscribers (ViewPanel's static-phase wiring --
// sourceOpeningWiring/coverageAnalysisWiring/staticComponentTreeWiring --
// and this pipeline's own bridgeWiring/diagnosticsWiring each register
// their own on the SAME tree webview in production) -- a fake that only
// remembers the last listener would silently drop the earlier ones.
function fakeTreeWebview(): {
  webview: vscode.Webview;
  trigger: (message: unknown) => void;
} {
  const handlers: Array<(message: unknown) => void> = [];
  const webview = {
    onDidReceiveMessage: (listener: (message: unknown) => void) => {
      handlers.push(listener);
      return {
        dispose() {
          const index = handlers.indexOf(listener);
          if (index >= 0) {
            handlers.splice(index, 1);
          }
        },
      };
    },
    postMessage: () => Promise.resolve(true),
  } as unknown as vscode.Webview;
  return { webview, trigger: (message) => handlers.forEach((handler) => handler(message)) };
}

function fakeOutputChannel(): { channel: vscode.OutputChannel; lines: string[] } {
  const lines: string[] = [];
  const channel = {
    appendLine: (line: string) => lines.push(line),
    show: () => undefined,
  } as unknown as vscode.OutputChannel;
  return { channel, lines };
}

// Deliberately NOT the concrete Puppeteer class -- LiveTreePipelinePage is
// the narrow structural slice startLiveTreePipeline actually needs, so this
// can drive it without a real Chrome.
//
// connectedUrl is a genuine state transition, not a fixed value: it mirrors
// the real Puppeteer.connectedUrl getter (`this.activeUrl || this.url`),
// which only becomes the actually-reached URL once start() resolves. A fake
// whose connectedUrl never changes can't distinguish "wired after the real
// URL is known" from "wired too early" -- both would read the same value
// regardless of when the caller captured it, which is exactly the bug this
// fake needs to be able to catch. Pass a single string when a test doesn't
// care about the distinction (configured and connected are then the same).
function fakePage(
  start: (relayPort: number) => Promise<void>,
  urls: string | { configuredUrl: string; connectedUrl: string },
): LiveTreePipelinePage & { startCalls: number[]; closeCalls: number } {
  const { configuredUrl, connectedUrl } =
    typeof urls === "string" ? { configuredUrl: urls, connectedUrl: urls } : urls;
  let resolvedUrl = configuredUrl;
  const page = {
    startCalls: [] as number[],
    closeCalls: 0,
    get connectedUrl(): string {
      return resolvedUrl;
    },
    start: async (relayPort: number) => {
      page.startCalls.push(relayPort);
      await start(relayPort);
      // Only flips once "launch" has actually completed -- see the header
      // comment above.
      resolvedUrl = connectedUrl;
    },
    close: async () => {
      page.closeCalls += 1;
    },
    onBrowserDisconnected: () => undefined,
    reconnect: async () => true,
  };
  return page;
}

suite("startLiveTreePipeline", () => {
  test("wires everything and reaches Chrome launch on a normal successful start", async () => {
    const bridge = new DevtoolsBridge();
    const pushed: vscode.Disposable[] = [];
    const { channel } = fakeOutputChannel();
    const { webview } = fakeTreeWebview();
    const page = fakePage(async () => undefined, "http://localhost:5173");

    try {
      await startLiveTreePipeline({
        bridge,
        page,
        treeWebview: webview,
        outputChannel: channel,
        pushDisposable: (disposable) => pushed.push(disposable),
        isDisposed: () => false,
      });

      assert.deepStrictEqual(page.startCalls, [bridge.relayPort]);
      assert.strictEqual(pushed.length, 3, "bridge-to-webview, diagnostics, resilience");
    } finally {
      pushed.forEach((disposable) => disposable.dispose());
      bridge.dispose();
    }
  });

  test("disposed becoming true while bridge.start() is still pending skips all wiring and never launches Chrome", async () => {
    const bridge = new DevtoolsBridge();
    let disposeCalled = false;
    const originalDispose = bridge.dispose.bind(bridge);
    bridge.dispose = () => {
      disposeCalled = true;
      originalDispose();
    };

    let disposed = false;
    const pushed: vscode.Disposable[] = [];
    const { channel } = fakeOutputChannel();
    const { webview } = fakeTreeWebview();
    const page = fakePage(
      async () => {
        throw new Error("Chrome must never be launched once disposed pre-empted bridge.start()");
      },
      "http://localhost:5173",
    );

    // bridge.start()'s WebSocket server bind is genuinely asynchronous (an OS
    // syscall via Node's net.Server -- see node_modules/ws's use of
    // http.Server.prototype.listen()), so this synchronous continuation is
    // guaranteed to run, and to set `disposed` to true, before that bind's
    // "listening" callback can fire on a later event-loop turn.
    const pipelinePromise = startLiveTreePipeline({
      bridge,
      page,
      treeWebview: webview,
      outputChannel: channel,
      pushDisposable: (disposable) => pushed.push(disposable),
      isDisposed: () => disposed,
    });
    disposed = true;

    await pipelinePromise;

    assert.strictEqual(pushed.length, 0, "no wiring disposables should be pushed");
    assert.strictEqual(page.startCalls.length, 0, "Chrome must never be launched");
    assert.strictEqual(disposeCalled, true, "the bridge itself must be torn down");
  });

  test("skips the error toast if the panel was already disposed when page.start() rejects", async () => {
    const bridge = new DevtoolsBridge();
    let disposed = false;
    const pushed: vscode.Disposable[] = [];
    const { channel } = fakeOutputChannel();
    const { webview } = fakeTreeWebview();

    let rejectPageStart: ((error: unknown) => void) | undefined;
    const page = fakePage(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPageStart = reject;
        }),
      "http://localhost:5173",
    );

    const originalShowErrorMessage = vscode.window.showErrorMessage;
    let toastShown = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).showErrorMessage = (..._args: unknown[]) => {
      toastShown = true;
      return Promise.resolve(undefined);
    };

    try {
      const pipelinePromise = startLiveTreePipeline({
        bridge,
        page,
        treeWebview: webview,
        outputChannel: channel,
        pushDisposable: (disposable) => pushed.push(disposable),
        isDisposed: () => disposed,
      });

      await waitUntil(() => rejectPageStart !== undefined);
      assert.strictEqual(
        pushed.length,
        1,
        "the pre-launch wiring (bridge-to-webview) should already be done",
      );

      disposed = true;
      rejectPageStart?.(new Error("dev server unreachable (simulated for this test)"));
      await pipelinePromise;

      assert.strictEqual(toastShown, false, "must not show a toast for an already-disposed panel");
    } finally {
      vscode.window.showErrorMessage = originalShowErrorMessage;
      pushed.forEach((disposable) => disposable.dispose());
      bridge.dispose();
    }
  });

  test("wires empty-state diagnostics with the actually-connected URL, not any pre-detection one", async () => {
    const bridge = new DevtoolsBridge();
    const pushed: vscode.Disposable[] = [];
    const { channel, lines } = fakeOutputChannel();
    const { webview, trigger } = fakeTreeWebview();

    // Stands in for devServerProbe.ts's fallback-port detection: the
    // configured URL is what a caller would have known before page.start()
    // ran; connectedUrl is the different, actually-reached one this fake's
    // connectedUrl only switches to once "launch" completes (see fakePage's
    // header comment) -- exactly like the real Puppeteer's own connectedUrl
    // getter. If wireEmptyStateDiagnostics were ever wired before page.start()
    // resolves again, it would capture CONFIGURED_URL instead, and the first
    // assertion below would fail.
    const CONFIGURED_URL = "http://localhost:3000";
    const CONNECTED_URL = "http://localhost:3001";
    const page = fakePage(async () => undefined, {
      configuredUrl: CONFIGURED_URL,
      connectedUrl: CONNECTED_URL,
    });

    try {
      await startLiveTreePipeline({
        bridge,
        page,
        treeWebview: webview,
        outputChannel: channel,
        pushDisposable: (disposable) => pushed.push(disposable),
        isDisposed: () => false,
      });

      trigger({ type: "noReactDetected", elapsedMs: 4242 });
      await waitUntil(() => lines.some((line) => line.includes("No React detected")));

      assert.ok(
        lines.some((line) => line.includes(CONNECTED_URL)),
        "expected the diagnostics log to report the actually-connected URL",
      );
      assert.ok(
        !lines.some((line) => line.includes(CONFIGURED_URL)),
        "must not report the pre-detection configured URL",
      );
    } finally {
      pushed.forEach((disposable) => disposable.dispose());
      bridge.dispose();
    }
  });

  test("a bridge.start() rejection is caught, logged, and never reaches Chrome launch", async () => {
    // Same technique as devtoolsBridge.test.ts's own bind-failure test: `ws`
    // calls http.Server.prototype.listen() internally, so patching it here
    // simulates a real bind failure (e.g. EADDRINUSE) without needing one.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require("node:http") as typeof import("node:http");
    const originalListen = http.Server.prototype.listen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (http.Server.prototype as any).listen = function patchedListen(
      this: import("node:http").Server,
    ) {
      setImmediate(() => this.emit("error", new Error("EADDRINUSE (simulated for this test)")));
      return this;
    };

    const bridge = new DevtoolsBridge();
    const pushed: vscode.Disposable[] = [];
    const { channel, lines } = fakeOutputChannel();
    const { webview } = fakeTreeWebview();
    const page = fakePage(async () => undefined, "http://localhost:5173");

    const originalShowErrorMessage = vscode.window.showErrorMessage;
    let toastMessage: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).showErrorMessage = (message: string) => {
      toastMessage = message;
      return Promise.resolve(undefined);
    };

    try {
      await assert.doesNotReject(() =>
        startLiveTreePipeline({
          bridge,
          page,
          treeWebview: webview,
          outputChannel: channel,
          pushDisposable: (disposable) => pushed.push(disposable),
          isDisposed: () => false,
        }),
      );

      assert.strictEqual(
        page.startCalls.length,
        0,
        "Chrome must never be launched after a relay start failure",
      );
      assert.strictEqual(pushed.length, 0, "no wiring should be attempted");
      assert.ok(
        lines.some((line) => line.includes("EADDRINUSE (simulated for this test)")),
        "expected the relay failure to be logged",
      );
      assert.ok(
        toastMessage?.includes("could not start the DevTools relay"),
        `expected a user-facing toast describing the relay failure, got: ${toastMessage}`,
      );
    } finally {
      http.Server.prototype.listen = originalListen;
      vscode.window.showErrorMessage = originalShowErrorMessage;
      bridge.dispose();
    }
  });
});
