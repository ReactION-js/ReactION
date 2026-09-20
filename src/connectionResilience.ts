import type { LogFn } from "./logging";

// Minimal structural slices of DevtoolsBridge/Puppeteer this module actually
// uses -- narrower than importing the concrete classes so a unit test can
// pass lightweight fakes (a real class with private fields can't be
// satisfied by an object literal; a real DevtoolsBridge/Puppeteer instance
// satisfies these interfaces structurally, so production callers are
// unaffected).
export interface ResilienceBridge {
  onBackendConnected(handler: () => void): void;
  onBackendDisconnected(handler: () => void): void;
}

export interface ResilientPage {
  onBrowserDisconnected(handler: () => void): void;
  reconnect(url: string): Promise<boolean>;
}

// How long to wait, after a backend disconnect, for a natural reconnect (the
// client's own full-page reload finishing, per client/storeBridge.ts +
// spike/run-phase1.js Part 2 -- already proven to work unmodified) before
// treating the disconnect as "the dev server might have died" and actively
// re-navigating ourselves. A normal reload's disconnect->reconnect round trip
// is well under a second; this sits comfortably above that so it never fires
// for the already-working case, while still noticing a real outage promptly.
const RECONNECT_GRACE_MS = 1500;

// Re-navigation attempts once the grace period elapses with nothing
// reconnecting on its own: first attempt immediate, then back off 1s/2s/3s/4s.
// Five attempts spanning ~10s (plus the 1.5s grace period, ~11.5s total) is
// enough to ride out a typical dev-server recompile-and-relisten without
// retrying forever.
const RECONNECT_DELAYS_MS = [0, 1000, 2000, 3000, 4000];

// A setTimeout-backed delay that can be woken up early (see `cancelDelay`
// below) -- without this, a browser-lost/dispose during an in-flight backoff
// wait would leave that one timer sitting in the event loop until it expired
// (up to 4s) even though its continuation would do nothing on firing. Waking
// it immediately means teardown leaves provably no pending timer at all.
function cancelableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveNow: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveNow = resolve;
    timer = setTimeout(() => {
      timer = undefined;
      resolve();
    }, ms);
  });
  return {
    promise,
    // Resolves immediately (rather than just clearing the timer) so the
    // awaiting loop actually wakes up, hits its own terminal/isTornDown
    // check, and unwinds through its `finally` -- not left permanently
    // suspended at the await.
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
        resolveNow?.();
      }
    },
  };
}

export interface ConnectionResilienceHooks {
  bridge: ResilienceBridge;
  page: ResilientPage;
  url: string;
  log: LogFn;
  // The owning panel's own "am I being intentionally torn down" flag --
  // reconnection must never fire once the user has closed the panel.
  isTornDown: () => boolean;
  onReconnectExhausted: () => void;
  onBrowserLost: () => void;
}

export interface ConnectionResilience {
  dispose(): void;
}

// Wires DevtoolsBridge's connect/disconnect events and Puppeteer's browser
// 'disconnected' event into the two failure modes Task 4a's research found
// genuinely unhandled: (1) the dev server dying and coming back mid-session,
// and (2) the launched Chrome browser itself going away. Reconnection and
// browser-loss handling both stop permanently once torn down, disposed, or
// (for reconnection) once the browser itself is gone -- see `terminal` below.
export function wireConnectionResilience(hooks: ConnectionResilienceHooks): ConnectionResilience {
  const { bridge, page, url, log, isTornDown, onReconnectExhausted, onBrowserLost } = hooks;

  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeBackoffCancel: (() => void) | undefined;
  let reconnecting = false;
  // Set once the browser is gone or this is disposed; once true, no further
  // grace timers or reconnect attempts may start (a dead browser must not be
  // left with a dangling retry loop still poking at it).
  let terminal = false;

  const clearGrace = () => {
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  };

  // Immediately unwinds any in-flight grace timer or backoff wait so a
  // terminal transition (browser lost, disposed) leaves no pending timer.
  const haltPendingWork = () => {
    clearGrace();
    activeBackoffCancel?.();
  };

  async function attemptReconnect(): Promise<void> {
    reconnecting = true;
    try {
      for (let attempt = 0; attempt < RECONNECT_DELAYS_MS.length; attempt += 1) {
        if (terminal || isTornDown()) {
          return;
        }
        const wait = RECONNECT_DELAYS_MS[attempt];
        if (wait > 0) {
          const { promise, cancel } = cancelableDelay(wait);
          activeBackoffCancel = cancel;
          await promise;
          activeBackoffCancel = undefined;
          if (terminal || isTornDown()) {
            return;
          }
        }
        log(
          `Reconnect attempt ${attempt + 1}/${RECONNECT_DELAYS_MS.length}: re-navigating to ${url}`,
        );
        const reached = await page.reconnect(url);
        if (reached) {
          log("Reconnect navigation succeeded; expecting the injected backend to re-establish the relay connection on this load");
          return;
        }
      }
      if (!terminal && !isTornDown()) {
        log("Could not reconnect to the dev server after repeated attempts; giving up");
        onReconnectExhausted();
      }
    } finally {
      reconnecting = false;
    }
  }

  bridge.onBackendConnected(() => {
    // A natural reconnect (e.g. the page's own full reload) beat the grace
    // timer -- this is the already-working case; nothing more to do.
    clearGrace();
  });

  bridge.onBackendDisconnected(() => {
    if (terminal || isTornDown() || reconnecting) {
      return;
    }
    clearGrace();
    log(`Backend disconnected; waiting ${RECONNECT_GRACE_MS}ms for a natural reconnect before re-navigating`);
    graceTimer = setTimeout(() => {
      graceTimer = undefined;
      if (!terminal && !isTornDown() && !reconnecting) {
        void attemptReconnect();
      }
    }, RECONNECT_GRACE_MS);
  });

  page.onBrowserDisconnected(() => {
    if (terminal) {
      return;
    }
    terminal = true;
    haltPendingWork();
    log("Chrome browser disconnected unexpectedly (closed or crashed)");
    if (!isTornDown()) {
      onBrowserLost();
    }
  });

  return {
    dispose(): void {
      terminal = true;
      haltPendingWork();
    },
  };
}
