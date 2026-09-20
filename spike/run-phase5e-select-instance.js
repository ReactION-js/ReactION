/*
 * Phase 5e verification harness (throwaway): drives the REAL compiled
 * runtime pipeline (real Puppeteer + Chrome, real DevtoolsBridge, a real
 * react-devtools-inline Store) against the shared spike/sample-app.jsx
 * fixture, and exercises the REAL client/selectByComponent.ts +
 * client/elementInspection.ts modules (via esbuild, unbundled -- the actual
 * shipped source, not a reimplementation) the way App.tsx's "selectByComponent"
 * message handler uses them together: resolve live element ids by
 * displayName, then feed the result straight into ElementInspector.select
 * and confirm its resulting state settles on the right element.
 *
 * Covers all three cases the Task 5e spec calls out:
 *   - zero matches  (a name nothing in the fixture renders)
 *   - one match     (Header, rendered exactly once)
 *   - multiple matches (Item, rendered 3x as <ul> list children -- the
 *     fixture's own "existing repeated same-name instances" case)
 *
 * Run `npm run compile` first (this uses out/devtoolsBridge.js and
 * out/puppeteer.js).
 */
"use strict";

const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const { stubVscodeModule, setupJsdomGlobals, requireCompiled } = require("./testHarness");

stubVscodeModule();
const teardownJsdomGlobals = setupJsdomGlobals();

// eslint-disable-next-line
const { createBridge, createStore } = require("react-devtools-inline/frontend");
const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase5e-select-instance]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Node stand-in for the webview: mirrors client/storeBridge.ts's wall wiring
// (same technique as run-phase3-inspect.js/run-phase5d-coverage.js).
function simulateWebview(bridge) {
  let listeners = [];
  let frontendBridge;
  let store;

  const reset = () => {
    listeners = [];
    const wall = {
      listen(fn) {
        listeners.push(fn);
        return () => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      send(event, payload) {
        bridge.sendToPage({ event, payload });
      },
    };
    frontendBridge = createBridge(global.window, wall);
    store = createStore(frontendBridge);
  };

  bridge.onBackendConnected(reset);
  bridge.onPageMessage((message) => listeners.forEach((fn) => fn(message)));

  return { getStore: () => store, getBridge: () => frontendBridge };
}

async function waitForElements(getStore, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const store = getStore();
    if (store && store.numElements > 0) return store.numElements;
    await delay(200);
  }
  const store = getStore();
  return store ? store.numElements : 0;
}

async function serveSampleApp() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "sample-app.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const appJs = built.outputFiles[0].text;
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase5e</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(appJs);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(appHtml);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

// Waits for a real ElementInspector's onChange callback to report a
// terminal (non-loading) state for the given elementId -- mirrors what a
// real InspectorPanel would observe once the selection resolves from
// "loading" to "full-data" (or an error).
function waitForInspectorSettled(getLatestState, elementId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getLatestState();
      if (state && state.elementId === elementId && !state.loading) {
        resolve(state);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`timed out waiting for inspector to settle on elementId=${elementId}`));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

// Exercises findMountedElementIdsByDisplayName + a real ElementInspector
// together for one displayName, exactly as client/App.tsx's
// "selectByComponent" handler does: resolve ids, select the first, wait for
// the selection to settle. Returns { ids, settledState }.
async function selectByDisplayName(
  findMountedElementIdsByDisplayName,
  ElementInspector,
  store,
  frontendBridge,
  displayName,
) {
  const ids = findMountedElementIdsByDisplayName(store, displayName);
  if (ids.length === 0) {
    return { ids, settledState: null };
  }
  let latest = null;
  const inspector = new ElementInspector(frontendBridge, store, (state) => {
    latest = state;
  });
  try {
    inspector.select(ids[0]);
    const settledState = await waitForInspectorSettled(() => latest, ids[0], 10_000);
    return { ids, settledState };
  } finally {
    inspector.dispose();
  }
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase5e-select-instance] FAIL: overall timeout");
    process.exit(1);
  }, 60_000);

  const { findMountedElementIdsByDisplayName } = await requireCompiled(
    path.join(__dirname, "..", "client", "selectByComponent.ts"),
  );
  const { ElementInspector } = await requireCompiled(
    path.join(__dirname, "..", "client", "elementInspection.ts"),
  );

  const { server, url } = await serveSampleApp();
  log(`sample app served at ${url}`);

  const bridge = new DevtoolsBridge();
  const relayPort = await bridge.start();
  const webview = simulateWebview(bridge);
  log(`DevtoolsBridge relay on ${relayPort}; launching via real Puppeteer…`);

  const page = new Puppeteer({
    system: process.platform,
    executablePath: CHROME_PATH,
    localhost: url,
    headless_browser: true,
    headless_embedded: true,
    reactTheme: "dark",
  });
  await page.start(relayPort);

  const elementCount = await waitForElements(webview.getStore, 20_000);
  log(`store.numElements = ${elementCount}`);
  const store = webview.getStore();
  const frontendBridge = webview.getBridge();

  const zero = await selectByDisplayName(
    findMountedElementIdsByDisplayName,
    ElementInspector,
    store,
    frontendBridge,
    "TotallyNotAComponent",
  );
  const single = await selectByDisplayName(
    findMountedElementIdsByDisplayName,
    ElementInspector,
    store,
    frontendBridge,
    "Header",
  );
  const multi = await selectByDisplayName(
    findMountedElementIdsByDisplayName,
    ElementInspector,
    store,
    frontendBridge,
    "Item",
  );

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);
  teardownJsdomGlobals();

  log(`zero-match ids: ${JSON.stringify(zero.ids)}`);
  log(`single-match ids: ${JSON.stringify(single.ids)}, settled: ${JSON.stringify(single.settledState && { elementId: single.settledState.elementId, error: single.settledState.error })}`);
  log(`multi-match ids: ${JSON.stringify(multi.ids)}, settled elementId: ${multi.settledState && multi.settledState.elementId}`);

  const checks = [
    ["store actually populated", elementCount > 0],
    ["zero matches for a displayName nothing renders", zero.ids.length === 0],
    ["exactly one live Header instance found", single.ids.length === 1],
    [
      "selecting the Header instance settles on the same elementId",
      !!single.settledState && single.settledState.elementId === single.ids[0],
    ],
    ["Header selection resolved without error", !!single.settledState && !single.settledState.error],
    ["exactly three live Item instances found (the <ul> list children)", multi.ids.length === 3],
    [
      "selecting the first Item instance settles on that same elementId, not a different one",
      !!multi.settledState && multi.settledState.elementId === multi.ids[0],
    ],
  ];

  console.log("\n=== PHASE 5E HARNESS RESULT ===");
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase5e-select-instance] uncaught error:", err);
  process.exit(1);
});
