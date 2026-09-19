/*
 * Phase 3d live-protocol verification harness (throwaway).
 *
 * Exercises the REAL compiled host modules (out/devtoolsBridge.js and
 * out/puppeteer.js) end-to-end, with a Node/JSDOM stand-in for the webview
 * (react-devtools-inline Store + Bridge), modeled on
 * spike/run-phase3-inspect.js / run-phase3-profiler.js.
 *
 * Unlike those, this replicates client/useContextMap.ts's own traversal
 * directly against the real Store (rather than importing the TSX hook, which
 * needs a React render tree to run), but calls through a REAL
 * ElementInspector.inspectOnce() (the actual, esbuild-compiled client module)
 * for every candidate, and feeds the results into the REAL, esbuild-compiled
 * client/contextMap.ts's buildContextMap(). So the only thing reimplemented
 * here is the plain tree walk (visit store.roots/children) -- every piece of
 * actual logic under test (request/response correlation, the nearest-
 * ancestor matching heuristic) is the real shipped code.
 *
 * Asserts the built map attributes Header as a ThemeContext consumer, and
 * does NOT list Counter/Panel/FancyButton/Item as a consumer of anything.
 */
"use strict";

const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");

const Module = require("module");
const vscodeStubPath = path.join(__dirname, "vscode-stub.js");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "vscode") {
    return vscodeStubPath;
  }
  return originalResolveFilename.call(this, request, ...rest);
};

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.self = dom.window;
global.document = dom.window.document;
try {
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
} catch {
  /* keep Node's built-in navigator */
}
global.location = dom.window.location;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
try {
  global.localStorage = dom.window.localStorage;
} catch {
  /* ignore */
}

// eslint-disable-next-line
const { createBridge, createStore } = require("react-devtools-inline/frontend");
const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase3-contextmap-live]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Compile the REAL client modules under test to requirable CJS, same
// technique as run-phase3-renderstats.js / run-phase3-profiler.js.
function loadCompiled(relativeClientPath) {
  const built = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "..", "client", relativeClientPath)],
    bundle: false,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node18",
  });
  const code = built.outputFiles[0].text;
  const filename = path.join(__dirname, `${relativeClientPath.replace(/[\\/]/g, "_")}.compiled.js`);
  const mod = new Module(filename, null);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(code, mod.filename);
  return mod.exports;
}

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

function findElementByDisplayNamePrefix(store, prefix) {
  for (let i = 0; i < store.numElements; i++) {
    const id = store.getElementIDAtIndex(i);
    if (id == null) continue;
    const element = store.getElementByID(id);
    if (element && element.displayName && element.displayName.startsWith(prefix)) {
      return element;
    }
  }
  return null;
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase3d</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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
    console.error("[phase3-contextmap-live] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { buildContextMap, CANDIDATE_CONSUMER_TYPES } = loadCompiled("contextMap.ts");

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
  if (!store || !frontendBridge) {
    throw new Error("Store/bridge never materialized");
  }

  // Build a real ElementInspector via the real (esbuild-compiled)
  // elementInspection.ts, exactly as App.tsx does, and drive its real
  // inspectOnce() -- NOT a reimplementation of the request/response
  // correlation.
  const { ElementInspector } = loadCompiled("elementInspection.ts");
  let latestState = null;
  const inspector = new ElementInspector(frontendBridge, store, (state) => {
    latestState = state;
  });

  const providerElement = findElementByDisplayNamePrefix(store, "Context.Provider");
  log(`Context.Provider element displayName (empirical): ${JSON.stringify(providerElement && providerElement.displayName)}`);

  // --- Replicate useContextMap.ts's traversal (visit + inspectOnce) --------
  const elements = new Map();
  const consumerIds = [];
  const visit = (id) => {
    const element = store.getElementByID(id);
    if (!element) return;
    elements.set(id, {
      id: element.id,
      parentID: element.parentID,
      displayName: element.displayName,
      type: element.type,
    });
    if (CANDIDATE_CONSUMER_TYPES.has(element.type)) {
      consumerIds.push(id);
    }
    for (const childId of element.children) visit(childId);
  };
  for (const rootId of store.roots) visit(rootId);
  log(`candidate consumer ids: ${JSON.stringify(consumerIds)}`);

  const responses = await Promise.all(
    consumerIds.map((id) => inspector.inspectOnce(id).catch((err) => ({ type: "harness-error", message: err.message }))),
  );

  const hooksByElementId = new Map();
  consumerIds.forEach((id, index) => {
    const response = responses[index];
    if (response && response.type === "full-data" && response.value.hooks) {
      const hooksData = response.value.hooks.data;
      if (Array.isArray(hooksData)) {
        hooksByElementId.set(id, hooksData);
      }
    }
  });

  const contextMap = buildContextMap(elements, hooksByElementId);
  log(`built context map: ${JSON.stringify(contextMap)}`);

  // --- Assertions ------------------------------------------------------------

  const headerElement = findElementByDisplayNamePrefix(store, "Header");
  const headerEntry = contextMap.find(
    (entry) => headerElement && entry.consumers.some((c) => c.id === headerElement.id),
  );
  const headerAttributed = !!headerElement && !!headerEntry;
  log(`Header (id=${headerElement && headerElement.id}) attributed as a consumer: ${headerAttributed}`);

  const negativeNames = ["Counter", "Panel", "FancyButton", "Item"];
  const negativeResults = negativeNames.map((name) => {
    const element = findElementByDisplayNamePrefix(store, name);
    const listedAsConsumer = !!element && contextMap.some((entry) =>
      entry.consumers.some((c) => c.id === element.id),
    );
    return { name, id: element && element.id, listedAsConsumer };
  });
  log(`negative checks: ${JSON.stringify(negativeResults)}`);
  const negativesClean = negativeResults.every((r) => !r.listedAsConsumer);

  inspector.dispose();
  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const pass = elementCount > 0 && headerAttributed && negativesClean && contextMap.length === 1;

  console.log("\n=== PHASE 3d LIVE CONTEXTMAP HARNESS RESULT ===");
  console.log(`store.numElements                 : ${elementCount}`);
  console.log(`Context.Provider displayName       : ${JSON.stringify(providerElement && providerElement.displayName)}`);
  console.log(`context map entries                : ${JSON.stringify(contextMap)}`);
  console.log(`Header attributed as consumer       : ${headerAttributed}`);
  console.log(`Counter/Panel/FancyButton/Item clean : ${negativesClean} (${JSON.stringify(negativeResults)})`);
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3-contextmap-live] uncaught error:", err);
  process.exit(1);
});
