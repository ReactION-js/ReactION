import * as assert from "node:assert";
import {
  wireConnectionResilience,
  type ResilienceBridge,
  type ResilientPage,
} from "../connectionResilience";

// Deterministic fake standing in for DevtoolsBridge: onBackendConnected/
// onBackendDisconnected support multiple subscribers, matching the real
// module (both bridgeWiring.ts and connectionResilience.ts subscribe
// independently in production).
function fakeBridge(): ResilienceBridge & { fireConnected(): void; fireDisconnected(): void } {
  const connected: Array<() => void> = [];
  const disconnected: Array<() => void> = [];
  return {
    onBackendConnected: (h) => connected.push(h),
    onBackendDisconnected: (h) => disconnected.push(h),
    fireConnected: () => connected.forEach((h) => h()),
    fireDisconnected: () => disconnected.forEach((h) => h()),
  };
}

function fakePage(
  reconnectImpl: (url: string) => Promise<boolean>,
): ResilientPage & { fireBrowserDisconnected(): void; reconnectCalls: string[] } {
  const disconnected: Array<() => void> = [];
  const reconnectCalls: string[] = [];
  return {
    onBrowserDisconnected: (h) => disconnected.push(h),
    reconnect: async (url) => {
      reconnectCalls.push(url);
      return reconnectImpl(url);
    },
    fireBrowserDisconnected: () => disconnected.forEach((h) => h()),
    reconnectCalls,
  };
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("timed out waiting for condition"));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite("connectionResilience", () => {
  test("does not react to a disconnect that self-heals within the grace period", async () => {
    const bridge = fakeBridge();
    const page = fakePage(async () => true);
    const lines: string[] = [];
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: (m) => lines.push(m),
      isTornDown: () => false,
      onReconnectExhausted: () => assert.fail("should not give up"),
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    bridge.fireDisconnected();
    // Reconnects almost immediately, well inside the grace window -- the
    // normal full-reload case (see client/storeBridge.ts).
    bridge.fireConnected();

    await delay(2000);
    assert.strictEqual(page.reconnectCalls.length, 0, "must not have re-navigated");
    resilience.dispose();
  });

  test("re-navigates after the grace period when nothing reconnects on its own, and stops once it succeeds", async function () {
    this.timeout(15_000);
    const bridge = fakeBridge();
    let attempts = 0;
    const page = fakePage(async () => {
      attempts += 1;
      return attempts >= 2;
    });
    const lines: string[] = [];
    let exhausted = false;
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: (m) => lines.push(m),
      isTornDown: () => false,
      onReconnectExhausted: () => {
        exhausted = true;
      },
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    bridge.fireDisconnected();
    await waitUntil(() => page.reconnectCalls.length >= 2, 10_000);

    assert.strictEqual(exhausted, false);
    assert.ok(lines.some((l) => l.includes("Reconnect navigation succeeded")));
    resilience.dispose();
  });

  test("gives up after exhausting all attempts and does not retry forever", async function () {
    this.timeout(20_000);
    const bridge = fakeBridge();
    const page = fakePage(async () => false);
    let exhausted = false;
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => false,
      onReconnectExhausted: () => {
        exhausted = true;
      },
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    bridge.fireDisconnected();
    await waitUntil(() => exhausted, 15_000);

    const callsAtExhaustion = page.reconnectCalls.length;
    assert.strictEqual(callsAtExhaustion, 5, "expected exactly 5 bounded attempts");

    // Bounded means bounded: no further calls after giving up.
    await delay(1000);
    assert.strictEqual(page.reconnectCalls.length, callsAtExhaustion);
    resilience.dispose();
  });

  test("never retries once the panel is intentionally torn down", async () => {
    const bridge = fakeBridge();
    const page = fakePage(async () => true);
    let tornDown = false;
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => tornDown,
      onReconnectExhausted: () => assert.fail("should not give up; should never have started"),
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    tornDown = true;
    bridge.fireDisconnected();

    await delay(2500); // past the 1.5s grace period
    assert.strictEqual(page.reconnectCalls.length, 0, "torn-down panel must never re-navigate");
    resilience.dispose();
  });

  test("stops an in-flight backoff wait immediately when the panel is disposed mid-retry", async function () {
    this.timeout(10_000);
    const bridge = fakeBridge();
    const page = fakePage(async () => false);
    let exhausted = false;
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => false,
      onReconnectExhausted: () => {
        exhausted = true;
      },
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    bridge.fireDisconnected();
    // Let the grace period elapse and the first (immediate) attempt fail, so
    // we're now inside a backoff wait between attempts.
    await waitUntil(() => page.reconnectCalls.length >= 1, 5_000);
    resilience.dispose();

    const callsAtDispose = page.reconnectCalls.length;
    await delay(6000); // longer than the remaining backoff schedule
    assert.strictEqual(page.reconnectCalls.length, callsAtDispose, "no further attempts after dispose");
    assert.strictEqual(exhausted, false, "must not report exhaustion after an intentional dispose");
  });

  test("a backend disconnect while a reconnect attempt is already running does not start a second, concurrent loop", async function () {
    this.timeout(10_000);
    const bridge = fakeBridge();
    const page = fakePage(async () => false);
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => false,
      onReconnectExhausted: () => undefined,
      onBrowserLost: () => assert.fail("should not report browser lost"),
    });

    bridge.fireDisconnected();
    await waitUntil(() => page.reconnectCalls.length >= 1, 5_000);
    // Fire a second disconnect while the first loop is actively mid-flight;
    // it must be ignored, not start a parallel retry loop.
    bridge.fireDisconnected();
    bridge.fireDisconnected();

    await delay(2000);
    // A second loop would have interleaved extra reconnect() calls on its own
    // grace+backoff schedule; the single-loop invariant means the call count
    // only ever grows by exactly what one loop would produce in this window.
    const callsDuringWindow = page.reconnectCalls.length;
    await delay(1500);
    assert.ok(
      page.reconnectCalls.length - callsDuringWindow <= 1,
      "at most one loop should be advancing the retry schedule at a time",
    );
    resilience.dispose();
  });

  test("browser-lost stops any in-flight reconnect loop and suppresses the give-up callback", async function () {
    this.timeout(10_000);
    const bridge = fakeBridge();
    const page = fakePage(async () => false);
    let exhausted = false;
    let browserLost = false;
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => false,
      onReconnectExhausted: () => {
        exhausted = true;
      },
      onBrowserLost: () => {
        browserLost = true;
      },
    });

    bridge.fireDisconnected();
    await waitUntil(() => page.reconnectCalls.length >= 1, 5_000);

    page.fireBrowserDisconnected();
    const callsAtCrash = page.reconnectCalls.length;

    await delay(6000);
    assert.strictEqual(browserLost, true);
    assert.strictEqual(exhausted, false, "give-up must not fire once the browser itself is gone");
    assert.strictEqual(page.reconnectCalls.length, callsAtCrash, "no reconnect attempts against a dead browser");
    resilience.dispose();
  });

  test("browser-lost is not reported if the panel was already torn down", async () => {
    const bridge = fakeBridge();
    const page = fakePage(async () => true);
    const resilience = wireConnectionResilience({
      bridge,
      page,
      url: "http://x",
      log: () => undefined,
      isTornDown: () => true,
      onReconnectExhausted: () => assert.fail("should not give up"),
      onBrowserLost: () => assert.fail("dispose already happened; must not surface a warning"),
    });

    page.fireBrowserDisconnected();
    resilience.dispose();
  });
});
