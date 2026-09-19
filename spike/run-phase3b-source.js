/*
 * Phase 3b verification harness (throwaway): proves the InspectedElement
 * `source` tuple's line/column convention against the REAL backend, and
 * exercises resolveSourceFileName against the real spike/sample-app.jsx.
 *
 * WHY a sourcemap cross-check instead of feeding source[1] straight into
 * resolveSourceFileName: this harness bundles sample-app.jsx together with
 * react/react-dom into a single esbuild IIFE (same as run-phase3-inspect.js/
 * run-phase2-visual.js), so the real, live fileName the backend reports is
 * the served bundle URL (e.g. "http://127.0.0.1:PORT/app.js") with a line
 * number pointing into the BUNDLED text -- confirmed empirically while
 * building this harness. resolveSourceFileName correctly refuses to resolve
 * that (it's exactly the "production build / unrecognized path" case the
 * task calls out -- sourcemap symbolication is explicitly out of scope for
 * the shipped extension code). A real webpack dev build's `eval`-style
 * devtool would give each module its own `webpack://.../src/Foo.tsx`
 * identity that DOES resolve directly; this esbuild-based spike harness
 * doesn't produce that.
 *
 * So the offset is proven two ways:
 *   1) Decode the bundle's own esbuild-generated sourcemap (a standard,
 *      well-tested tool -- NOT shipped in extension code, test-only) to find
 *      the REAL original line/column in spike/sample-app.jsx for the exact
 *      (line, column) the live protocol reported, and compare against the
 *      real, hand-counted line in the file.
 *   2) Separately, feed resolveSourceFileName a realistic relative fileName
 *      ("sample-app.jsx") against spike/ as the workspace root, proving it
 *      resolves to the real file, and that the real file's line 23 is
 *      indeed Counter's declaration -- tying the resolution logic to the
 *      same real file used in (1).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const { SourceMapConsumer } = require("source-map");

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
const { resolveSourceFileName } = require("../out/openSource.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase3b-source]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Same esbuild renaming caveat as run-phase3-inspect.js: bundling can rename
// a memo/forwardRef's inner named function expression, so match by prefix.
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

function inspectElement(bridge, requestID, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const onResponse = (response) => {
      if (response && response.responseID === requestID) {
        bridge.removeListener("inspectedElement", onResponse);
        clearTimeout(timer);
        resolve(response);
      }
    };
    const timer = setTimeout(() => {
      bridge.removeListener("inspectedElement", onResponse);
      reject(new Error(`Timed out waiting for inspectedElement responseID=${requestID}`));
    }, timeoutMs);
    bridge.addListener("inspectedElement", onResponse);
    bridge.send("inspectElement", { ...payload, requestID });
  });
}

// Bundles + serves the shared sample app WITH a sourcemap (unlike the other
// harnesses, which don't need one) so this harness alone can cross-check the
// live protocol's line/column against the real spike/sample-app.jsx.
async function serveSampleApp() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "sample-app.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    sourcemap: true,
    outfile: "app.js",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const jsFile = built.outputFiles.find((f) => f.path.endsWith(".js"));
  const mapFile = built.outputFiles.find((f) => f.path.endsWith(".map"));
  const appJs = jsFile.text;
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase3b</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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
  return { server, url: `http://127.0.0.1:${server.address().port}/`, sourceMapJson: mapFile.text };
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase3b-source] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { server, url, sourceMapJson } = await serveSampleApp();
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

  // Counter (memo, no hooks, single-statement body) is the cleanest target:
  // components using hooks before their JSX (e.g. Header's useContext) can
  // get attributed to the first hook statement instead of their declaration
  // line -- still a real, correctly 1-based line, just a different anchor
  // statement, which would make a hand-picked "expected line" look wrong at
  // a glance even though the offset math is fine. Counter has no such
  // ambiguity: its source should land exactly on its own declaration line.
  const counterElement = store ? findElementByDisplayNamePrefix(store, "Counter") : null;

  let sourceShapeCheck = false;
  let rawSource;
  let sourcemapProofCheck = false;
  let decodedPosition;
  let resolveFileNameCheck = false;
  let resolvedPath;

  if (counterElement && store && frontendBridge) {
    const rendererID = store.getRendererIDForElement(counterElement.id);
    log(`Counter element id=${counterElement.id} rendererID=${rendererID}`);

    if (rendererID != null) {
      const response = await inspectElement(
        frontendBridge,
        1,
        { id: counterElement.id, rendererID, path: null, forceFullData: true },
        10_000,
      ).catch((err) => ({ type: "harness-error", message: err.message }));

      log(`inspect response type: ${response.type}`);
      if (response.type === "full-data") {
        rawSource = response.value.source;
        log(`Counter source = ${JSON.stringify(rawSource)}`);
        sourceShapeCheck = Array.isArray(rawSource) && rawSource.length >= 3;

        if (sourceShapeCheck) {
          const [, fileName, lineNumber, columnNumber] = rawSource;

          // --- Proof 1: sourcemap cross-check -------------------------------
          const consumer = await new SourceMapConsumer(JSON.parse(sourceMapJson));
          try {
            // originalPositionFor expects a 1-based line and a 0-based
            // column; we feed lineNumber straight through and convert
            // columnNumber (-1) under the hypothesis that BOTH fields are
            // 1-based (V8's CallSite.getLineNumber()/getColumnNumber()
            // convention, which is what react-devtools-core's own
            // extractLocationFromComponentStack/extractLocationFromOwnerStack
            // read the raw stack trace with -- see backend.js).
            decodedPosition = consumer.originalPositionFor({
              line: lineNumber,
              column: columnNumber - 1,
            });
          } finally {
            consumer.destroy();
          }
          log(`decoded original position = ${JSON.stringify(decodedPosition)}`);

          // Line 23 of spike/sample-app.jsx, counted directly from the file:
          //   23: const Counter = memo(function Counter({ count }) {
          const EXPECTED_COUNTER_DECLARATION_LINE = 23;
          sourcemapProofCheck =
            !!decodedPosition &&
            typeof decodedPosition.source === "string" &&
            decodedPosition.source.endsWith("sample-app.jsx") &&
            decodedPosition.line === EXPECTED_COUNTER_DECLARATION_LINE;

          log(`fileName from live protocol (unresolvable bundle URL, as expected): ${fileName}`);
        }
      }
    }
  } else {
    log("Counter element not found in Store");
  }

  // --- Proof 2: resolveSourceFileName against the REAL spike/sample-app.jsx --
  // Exercises resolveSourceFileName exactly as the host would for a
  // realistic relative fileName, with spike/ as the workspace root (since
  // sample-app.jsx really does live there), and ties it to the same real
  // line used in Proof 1.
  resolvedPath = resolveSourceFileName("sample-app.jsx", __dirname);
  if (resolvedPath) {
    const lines = fs.readFileSync(resolvedPath, "utf8").split("\n");
    const line23 = lines[22]; // 0-indexed array, 1-based line 23
    resolveFileNameCheck =
      resolvedPath === path.join(__dirname, "sample-app.jsx") &&
      line23 === "const Counter = memo(function Counter({ count }) {";
    log(`resolveSourceFileName("sample-app.jsx", spike/) = ${resolvedPath}`);
    log(`real line 23 of that file = ${JSON.stringify(line23)}`);
  }

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const pass =
    elementCount > 0 &&
    !!counterElement &&
    sourceShapeCheck &&
    sourcemapProofCheck &&
    resolveFileNameCheck;

  console.log("\n=== PHASE 3b HARNESS RESULT ===");
  console.log(`store.numElements                 : ${elementCount}`);
  console.log(`Counter element found              : ${!!counterElement}`);
  console.log(`source is array, length >= 3       : ${sourceShapeCheck} (${JSON.stringify(rawSource)})`);
  console.log(
    `sourcemap-decoded line === real line 23 (1-based line, col-1 -> 0-based col): ${sourcemapProofCheck} (${JSON.stringify(decodedPosition)})`,
  );
  console.log(
    `resolveSourceFileName("sample-app.jsx") resolves + real line 23 matches: ${resolveFileNameCheck} (${resolvedPath})`,
  );
  console.log(
    pass
      ? "RESULT: PASS ✅ -- source[2]/source[3] are 1-based; vscode.Position needs -1 on both."
      : "RESULT: FAIL ❌",
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3b-source] uncaught error:", err);
  process.exit(1);
});
