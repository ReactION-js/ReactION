/*
 * Phase 4c fixture capture script (manual/occasional -- NOT part of npm
 * test/test:e2e).
 *
 * Regenerate spike/fixtures/sample-app-operations.json by re-running this
 * script whenever spike/sample-app.jsx's component shape changes, or the
 * pinned react-devtools-core/react-devtools-inline versions bump (a wire
 * protocol change could alter the recorded event names/payload shapes) --
 * the checked-in fixture is a frozen snapshot, not something the shipped
 * code regenerates or validates against those versions itself.
 *
 * Drives the REAL pipeline (real Puppeteer + real DevtoolsBridge, same as
 * spike/run-phase1.js's simulateWebview(bridge) pattern) against the
 * unmodified spike/sample-app.jsx, intercepts every raw wall message crossing
 * bridge.onPageMessage(...), and writes the full recorded sequence to
 * spike/fixtures/sample-app-operations.json.
 *
 * EMPIRICAL FINDING on which wall event(s) carry tree-mutation data:
 * bridge.onPageMessage delivers DevtoolsBridge's WallMessage shape
 * ({event, payload}, see src/devtoolsBridge.ts), which is exactly what a
 * react-devtools-inline Wall's `listen(fn)` callback expects to receive (both
 * client/storeBridge.ts's real `case "wall": ... fn(message.message)` path
 * and run-phase1.js's simulateWebview forward this object unmodified). A real
 * run of this script against the sample app (mount + a 2.5s settle window,
 * long enough to span three of the app's 800ms setInterval re-renders)
 * recorded exactly this sequence -- see the checked-in fixture for the full
 * payloads:
 *
 *   backendInitialized, operations, isReloadAndProfileSupportedByBackend,
 *   profilingStatus, bridgeProtocol, backendVersion, hookSettings
 *
 * Two things worth calling out because they weren't obvious beforehand:
 *  - "operations" (a typed-array-shaped op-code stream: adds/removes/reorders
 *    per fiber) is the actual tree-mutation event, but it appeared only ONCE
 *    for the whole window -- the sample app's periodic setCount() re-renders
 *    change no props DevTools tracks structurally and add/remove nothing, so
 *    the backend never emits a second "operations" record for them. A
 *    faithful replay of "mount populates the tree" therefore needs only the
 *    single captured "operations" message, not a stream of them.
 *  - Without also replaying "bridgeProtocol" (version handshake) and
 *    "backendVersion"/"backendInitialized", DevtoolsStore's Bridge has no way
 *    to decide the backend is protocol-compatible, so this script captures
 *    the full raw sequence unfiltered rather than hand-picking "operations"
 *    alone, so replay behaves identically to a live run.
 *
 * Usage: node spike/capture-operations-fixture.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const { stubVscodeModule, setupJsdomGlobals } = require("./testHarness");

stubVscodeModule();
setupJsdomGlobals();

// eslint-disable-next-line
const { createBridge, createStore } = require("react-devtools-inline/frontend");
const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[capture-operations-fixture]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Same shape as run-phase1.js's simulateWebview, but every message crossing
// onPageMessage is also pushed onto `recorded` in arrival order, before
// fan-out to the wall listeners the Store/Bridge registered.
function simulateWebview(bridge, recorded) {
  let listeners = [];
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
    const frontendBridge = createBridge(global.window, wall);
    store = createStore(frontendBridge);
  };

  bridge.onBackendConnected(reset);
  bridge.onPageMessage((message) => {
    recorded.push(message);
    listeners.forEach((fn) => fn(message));
  });

  return { getStore: () => store };
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>capture</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[capture-operations-fixture] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { server, url } = await serveSampleApp();
  log(`sample app served at ${url}`);

  const recorded = [];
  const bridge = new DevtoolsBridge();
  const relayPort = await bridge.start();
  const webview = simulateWebview(bridge, recorded);
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

  const mountCount = await waitForElements(webview.getStore, 20_000);
  log(`store.numElements after mount = ${mountCount}`);

  // Sample app's setInterval(() => setCount(...), 800) fires every 800ms;
  // capture a couple of update commits too so the fixture isn't mount-only.
  await delay(2_500);
  const finalStore = webview.getStore();
  const finalCount = finalStore ? finalStore.numElements : 0;

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const eventCounts = {};
  for (const m of recorded) {
    eventCounts[m.event] = (eventCounts[m.event] || 0) + 1;
  }
  log(`recorded ${recorded.length} wall messages: ${JSON.stringify(eventCounts)}`);
  log(`final store.numElements = ${finalCount}`);

  if (mountCount === 0 || recorded.length === 0) {
    console.error("RESULT: FAIL -- nothing captured");
    process.exit(1);
  }
  if (!eventCounts.operations) {
    console.error('RESULT: FAIL -- no "operations" events captured');
    process.exit(1);
  }

  const fixture = {
    capturedFrom: "spike/sample-app.jsx",
    capturedAt: new Date().toISOString(),
    expectedNumElements: finalCount,
    eventCounts,
    messages: recorded,
  };
  const outPath = path.join(__dirname, "fixtures", "sample-app-operations.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  log(`wrote ${outPath}`);
  console.log("RESULT: PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("[capture-operations-fixture] uncaught error:", err);
  process.exit(1);
});
