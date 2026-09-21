/*
 * Phase 0 de-risk spike (throwaway).
 *
 * Proves the target architecture's protocol path end-to-end:
 *   react-devtools-core backend  (injected into a real Chrome page via CDP,
 *     before any app script runs)
 *     --WebSocket-->  ws relay (this process)
 *     --custom wall-->  react-devtools-inline Store (co-located here in Node/JSDOM)
 *
 * Success = the Store reports numElements > 0 for a real React app, and again
 * after a full page reload (reconnect). No production code under src/ is touched.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const { WebSocketServer } = require("ws");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");

// --- 1. JSDOM globals: react-devtools-inline/frontend is a browser bundle and
// reads these on load, so they must exist before we require it. --------------
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.self = dom.window;
global.document = dom.window.document;
// Node 22 exposes a read-only global `navigator`; override it only if possible.
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
// jsdom supplies window.localStorage; expose it as a bare global too.
try {
  global.localStorage = dom.window.localStorage;
} catch {
  /* ignore */
}

// eslint-disable-next-line
const { createBridge, createStore } = require("react-devtools-inline/frontend");

// Approximate ElementType enum (react-devtools-shared) for readable dumps.
const ELEMENT_TYPE = {
  1: "Class",
  2: "Context",
  5: "Function",
  6: "ForwardRef",
  7: "Host",
  8: "Memo",
  9: "Other",
  10: "Profiler",
  11: "Root",
  12: "Suspense",
  13: "SuspenseList",
  14: "TracingMarker",
};

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OVERALL_TIMEOUT_MS = 90_000;
const ELEMENTS_TIMEOUT_MS = 20_000;

function log(...args) {
  console.log("[spike]", ...args);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// State shared with the ws relay handler.
let currentStore = null;
let currentBridge = null;
let protocolMismatch = false;

// --- 2. The ws relay: the backend connects here; we wrap the socket as a wall
// and feed a co-located react-devtools-inline Store. -------------------------
function wireBackendConnection(socket) {
  log("backend WebSocket connected");
  const listeners = [];
  const wall = {
    listen(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    send(event, payload) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ event, payload }));
      }
    },
  };

  // Fresh bridge/store per connection so a reload starts clean.
  if (currentBridge) {
    try {
      currentBridge.shutdown();
    } catch {
      /* ignore */
    }
  }
  const bridge = createBridge(global.window, wall);
  const store = createStore(bridge);
  currentBridge = bridge;
  currentStore = store;
  protocolMismatch = false;

  store.addListener("unsupportedBridgeProtocolDetected", () => {
    protocolMismatch = true;
    log("!! unsupportedBridgeProtocolDetected (version mismatch)");
  });

  socket.on("message", (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    listeners.forEach((fn) => fn(parsed));
  });
  socket.on("close", () => log("backend WebSocket closed"));
  socket.on("error", (err) => log("backend socket error:", err.message));
}

function dumpStore(store, max = 60) {
  const n = store.numElements;
  const lines = [];
  for (let i = 0; i < Math.min(n, max); i += 1) {
    const id = store.getElementIDAtIndex(i);
    const el = id != null ? store.getElementByID(id) : null;
    if (el) {
      const type = ELEMENT_TYPE[el.type] || `type${el.type}`;
      lines.push(
        `${"  ".repeat(el.depth || 0)}${el.displayName || "(anonymous)"}  <${type}>`,
      );
    }
  }
  return lines.join("\n");
}

async function waitForElements(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (currentStore && currentStore.numElements > 0) {
      return currentStore.numElements;
    }
    await delay(200);
  }
  return currentStore ? currentStore.numElements : 0;
}

function makeConnectSource(port) {
  // Runs in the page before React. Installs the hook (if needed) and connects
  // the backend to our relay.
  return `(function () {
  console.log('[spike-backend] connect script start; backendType=' + (typeof window.ReactDevToolsBackend));
  try {
    var backend = window.ReactDevToolsBackend;
    if (!backend || typeof backend.connectToDevTools !== 'function') {
      console.error('[spike-backend] ReactDevToolsBackend unavailable');
      return;
    }
    var hookBefore = !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hookBefore && typeof backend.initialize === 'function') {
      try { backend.initialize(); } catch (e) { console.error('[spike-backend] initialize failed', e && e.message); }
    }
    backend.connectToDevTools({ host: '127.0.0.1', port: ${port} });
    console.log('[spike-backend] connect called; hookBefore=' + hookBefore + ' hookNow=' + (!!window.__REACT_DEVTOOLS_GLOBAL_HOOK__));
  } catch (e) {
    console.error('[spike-backend] error', e && e.message);
  }
})();`;
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[spike] FAIL: overall timeout exceeded");
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  // --- 3. Bundle the sample app (dev build so DevTools has names). -----------
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
  log(`bundled sample app (${(appJs.length / 1024).toFixed(0)} KiB)`);

  const backendSource = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "node_modules",
      "react-devtools-core",
      "dist",
      "backend.js",
    ),
    "utf8",
  );

  // --- 4. Static server for the app. ----------------------------------------
  const appHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>ReactION spike app</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(appJs);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(appHtml);
    }
  });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const httpPort = httpServer.address().port;
  const appUrl = `http://127.0.0.1:${httpPort}/`;
  log(`app served at ${appUrl}`);

  // --- 5. ws relay. ---------------------------------------------------------
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => wss.on("listening", resolve));
  const wsPort = wss.address().port;
  wss.on("connection", wireBackendConnection);
  log(`ws relay listening on ${wsPort}`);

  // --- 6. Launch Chrome, inject the backend before React, navigate. ---------
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.on("console", (msg) => log(`page> ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => log(`page error> ${err.message}`));

  // Diagnostic marker (function form) to confirm evaluateOnNewDocument runs at all.
  await page.evaluateOnNewDocument(() => {
    window.__SPIKE_MARKER__ = "ran";
    console.log("[spike-marker] injected function ran");
  });
  // Inject via puppeteer's own API (handles Page-domain enabling); wrap the
  // backend bundle so any evaluation error is surfaced to the page console.
  const wrappedBackend = `try {\n${backendSource}\n} catch (e) { console.error('[spike-backend] bundle threw', e && e.message); }`;
  await page.evaluateOnNewDocument(wrappedBackend);
  await page.evaluateOnNewDocument(makeConnectSource(wsPort));

  log("navigating to app (initial load)...");
  await page.goto(appUrl, { waitUntil: "load" });

  const hookInfo = await page.evaluate(() => ({
    marker: window.__SPIKE_MARKER__ || "(none)",
    hook: typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
    backend: typeof window.ReactDevToolsBackend,
    reactishGlobals: Object.getOwnPropertyNames(window).filter((k) =>
      /react|devtools/i.test(k),
    ),
  }));
  log("page globals:", JSON.stringify(hookInfo));

  const count1 = await waitForElements(ELEMENTS_TIMEOUT_MS);
  log(`initial load: store.numElements = ${count1}`);
  if (count1 > 0) {
    log("store contents:\n" + dumpStore(currentStore));
  }

  // --- 7. Reconnect test: full reload should repopulate the Store. ----------
  log("reloading page (reconnect test)...");
  currentStore = null; // force waitForElements to observe the *new* store
  await page.reload({ waitUntil: "load" });
  const count2 = await waitForElements(ELEMENTS_TIMEOUT_MS);
  log(`after reload: store.numElements = ${count2}`);

  // --- 8. Report + teardown. ------------------------------------------------
  await browser.close();
  wss.close();
  httpServer.close();
  clearTimeout(watchdog);

  const pass = count1 > 0 && count2 > 0 && !protocolMismatch;
  console.log("\n=== PHASE 0 SPIKE RESULT ===");
  console.log(`initial numElements : ${count1}`);
  console.log(`reload  numElements : ${count2}`);
  console.log(`protocol mismatch   : ${protocolMismatch}`);
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[spike] uncaught error:", err);
  process.exit(1);
});
