/*
 * Phase 3c verification harness (throwaway).
 *
 * Exercises the REAL compiled host modules (out/devtoolsBridge.js and
 * out/puppeteer.js) end-to-end, with a Node/JSDOM stand-in for the webview
 * (react-devtools-inline Store + Bridge), modeled on spike/run-phase3-inspect.js.
 *
 * Drives the real profiler protocol: sets store.recordChangeDescriptions,
 * calls store.profilerStore.startProfiling(), lets the sample app's periodic
 * setInterval drive a couple of Counter re-renders, stops profiling, waits
 * for the real 'isProcessingData' completion event (see
 * client/react-devtools-inline.d.ts for why that's the real "data ready"
 * signal rather than a 'profilingData' event), and asserts the shape of the
 * real hydrated commit data against client/renderStats.ts's real (esbuild-
 * compiled) exports.
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
  Object.defineProperty(global, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
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

const log = (...a) => console.log("[phase3-profiler]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Compile the REAL client/renderStats.ts to a requirable CJS module, same
// technique as spike/run-phase3-renderstats.js -- this harness tests the
// live protocol data against the actual shipped classifier, not a
// reimplementation of its logic.
function loadRenderStats() {
  const built = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "..", "client", "renderStats.ts")],
    bundle: false,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node18",
  });
  const code = built.outputFiles[0].text;
  const mod = new Module(path.join(__dirname, "renderStats.compiled.js"), null);
  mod.filename = path.join(__dirname, "renderStats.compiled.js");
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

// Same esbuild-bundle-renaming quirk documented in run-phase3-inspect.js.
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase3-profiler</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

// Resolves once ProfilerStore's 'isProcessingData' event fires with the
// getter now false -- see client/react-devtools-inline.d.ts's ProfilerStore
// doc comment for why this (not a 'profilingData' event) is the real
// completion signal for a live start/stop capture.
function waitForProfilingDataReady(profilerStore, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!profilerStore.isProcessingData && profilerStore.didRecordCommits) {
      resolve();
      return;
    }
    const onEvent = () => {
      if (!profilerStore.isProcessingData) {
        profilerStore.removeListener("isProcessingData", onEvent);
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      profilerStore.removeListener("isProcessingData", onEvent);
      reject(new Error("Timed out waiting for isProcessingData to settle"));
    }, timeoutMs);
    profilerStore.addListener("isProcessingData", onEvent);
  });
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase3-profiler] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { isWastedRender, computeRenderCounts } = loadRenderStats();

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
  if (!store) {
    throw new Error("Store never materialized");
  }

  const counterElement = findElementByDisplayNamePrefix(store, "Counter");
  log(`Counter element: ${JSON.stringify(counterElement)}`);

  // --- Drive a real profiling session -------------------------------------

  store.recordChangeDescriptions = true;
  store.profilerStore.startProfiling();
  log(
    `profiling started; isProfilingBasedOnUserInput=${store.profilerStore.isProfilingBasedOnUserInput}`,
  );

  // The sample app's Counter-driving interval fires every 800ms; wait long
  // enough for several commits.
  await delay(2600);

  store.profilerStore.stopProfiling();
  log("stopProfiling() called; waiting for isProcessingData to settle…");
  await waitForProfilingDataReady(store.profilerStore, 20_000);
  log(
    `profiling data ready; isProcessingData=${store.profilerStore.isProcessingData}, didRecordCommits=${store.profilerStore.didRecordCommits}`,
  );

  const commitsByRoot = new Map();
  const allCommits = [];
  for (const rootID of store.roots) {
    try {
      const dataForRoot = store.profilerStore.getDataForRoot(rootID);
      commitsByRoot.set(rootID, dataForRoot.commitData);
      allCommits.push(...dataForRoot.commitData);
    } catch (err) {
      log(`no commit data for root ${rootID}: ${err.message}`);
    }
  }
  log(`collected ${allCommits.length} commit(s) across ${commitsByRoot.size} root(s)`);

  if (process.env.PHASE3_DEBUG_DUMP) {
    for (let i = 0; i < store.numElements; i++) {
      const id = store.getElementIDAtIndex(i);
      const el = id == null ? null : store.getElementByID(id);
      if (!el) continue;
      const appearances = allCommits
        .map((commit, index) => ({ index, change: commit.changeDescriptions?.get(el.id) }))
        .filter((entry) => entry.change !== undefined);
      log(
        `element id=${el.id} displayName=${JSON.stringify(el.displayName)} appearances=${JSON.stringify(appearances)}`,
      );
    }
  }

  const renderCounts = computeRenderCounts(allCommits);
  log(`renderCounts = ${JSON.stringify(Array.from(renderCounts.entries()))}`);

  // --- Assertions ----------------------------------------------------------

  let counterCheck = false;
  let counterCommitsInfo;
  if (counterElement) {
    const counterCount = renderCounts.get(counterElement.id) ?? 0;
    const counterChangeDescriptions = allCommits
      .map((commit) => commit.changeDescriptions?.get(counterElement.id))
      .filter((change) => change !== undefined);
    const hasCountPropChange = counterChangeDescriptions.some(
      (change) => Array.isArray(change.props) && change.props.includes("count"),
    );
    const noneWasted = counterChangeDescriptions.every((change) => !isWastedRender(change));
    counterCommitsInfo = {
      counterCount,
      changeCount: counterChangeDescriptions.length,
      hasCountPropChange,
      noneWasted,
    };
    counterCheck = counterCount >= 1 && hasCountPropChange && noneWasted;
  }
  log(`Counter check: ${JSON.stringify(counterCommitsInfo)}`);

  // Sibling that the task expected to never re-render at all. Real React
  // semantics (verified by reading react-devtools-inline's own
  // getChangeDescription/didFiberRender in node_modules) say a
  // non-memoized sibling whose parent recreates its JSX element every
  // render (App does, for all of Panel/FancyButton/the <ul>/Item) still
  // gets its PerformedWork flag set and DOES appear in changeDescriptions
  // -- it just has no actual prop/state/context/hook VALUE changes, so it's
  // classified as a wasted render rather than being absent. Assert against
  // whichever of these two the harness actually observes, per the task's
  // own instruction not to assume.
  const siblingNames = ["FancyButton", "Item", "Panel"];
  let siblingResult;
  for (const name of siblingNames) {
    const element = findElementByDisplayNamePrefix(store, name);
    if (!element) continue;
    const changes = allCommits
      .map((commit) => commit.changeDescriptions?.get(element.id))
      .filter((change) => change !== undefined);
    if (changes.length === 0) {
      siblingResult = { name, id: element.id, outcome: "never appeared in any commit" };
      break;
    }
    const allWasted = changes.every((change) => isWastedRender(change));
    siblingResult = {
      name,
      id: element.id,
      outcome: allWasted
        ? "appeared but every appearance was a wasted render (no real prop/state/context/hook change)"
        : "appeared with at least one non-wasted change",
      changeCount: changes.length,
      allWasted,
    };
    break;
  }
  log(`Sibling check: ${JSON.stringify(siblingResult)}`);
  const siblingCheck =
    siblingResult !== undefined &&
    (siblingResult.outcome === "never appeared in any commit" || siblingResult.allWasted === true);

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const pass = elementCount > 0 && !!counterElement && counterCheck && siblingCheck;

  console.log("\n=== PHASE 3c PROFILER HARNESS RESULT ===");
  console.log(`store.numElements            : ${elementCount}`);
  console.log(`Counter element found        : ${!!counterElement}`);
  console.log(`Counter render-count/props/wasted check : ${counterCheck} (${JSON.stringify(counterCommitsInfo)})`);
  console.log(`Sibling bailout/wasted check  : ${siblingCheck} (${JSON.stringify(siblingResult)})`);
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3-profiler] uncaught error:", err);
  process.exit(1);
});
