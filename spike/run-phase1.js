/*
 * Phase 1 verification harness (throwaway).
 *
 * Exercises the REAL compiled host modules (out/devtoolsBridge.js and
 * out/puppeteer.js) end-to-end, with a Node/JSDOM stand-in for the webview
 * (react-devtools-inline Store). Run `npm run compile` first.
 *
 *   Part 1: real Puppeteer + real DevtoolsBridge -> Store populates on load.
 *   Part 2: real DevtoolsBridge + a harness-driven page -> Store populates,
 *           survives a full reload (reconnect + store reset).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");

// Stub the `vscode` module so compiled host code (config.ts imports it for user
// messages) can be required outside the extension host. Node 22 bypasses a
// Module._load override, so redirect resolution to a stub file instead.
const Module = require("module");
const vscodeStubPath = path.join(__dirname, "vscode-stub.js");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "vscode") {
    return vscodeStubPath;
  }
  return originalResolveFilename.call(this, request, ...rest);
};

// --- JSDOM globals so react-devtools-inline/frontend loads in Node. ----------
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

const log = (...a) => console.log("[phase1]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Node stand-in for the webview: mirrors client/storeBridge.ts + bridgeWiring.ts.
// A fresh Store is created on every backend connection (reset-on-reconnect).
function simulateWebview(bridge) {
  let listeners = [];
  let frontendBridge;
  let store;

  const reset = () => {
    // Do not shutdown() the old bridge: the relay socket now points at the new
    // backend and shutdown() would kill it. Drop it and reset the wall listeners.
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

// Bundle + serve the shared sample app.
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase1</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

// Same injection technique as src/puppeteer.ts, for the harness-controlled page.
function connectSource(port) {
  return `(function () {
  try {
    var b = window.ReactDevToolsBackend;
    if (!b || typeof b.connectToDevTools !== 'function') return;
    if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && typeof b.initialize === 'function') { try { b.initialize(); } catch (e) {} }
    b.connectToDevTools({ host: '127.0.0.1', port: ${port} });
  } catch (e) {}
})();`;
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase1] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { server, url } = await serveSampleApp();
  log(`sample app served at ${url}`);

  // --- Part 1: real Puppeteer + real DevtoolsBridge. ------------------------
  const bridge1 = new DevtoolsBridge();
  const port1 = await bridge1.start();
  const webview1 = simulateWebview(bridge1);
  log(`Part 1: DevtoolsBridge relay on ${port1}; launching via real Puppeteer…`);

  const page = new Puppeteer({
    system: process.platform,
    executablePath: CHROME_PATH,
    localhost: url,
    headless_browser: true,
    headless_embedded: true,
    reactTheme: "dark",
  });
  await page.start(port1);
  const count1 = await waitForElements(webview1.getStore, 20_000);
  log(`Part 1: store.numElements = ${count1}`);
  await page.close();
  bridge1.dispose();

  // --- Part 2: reconnect through the real relay after a full reload. --------
  const bridge2 = new DevtoolsBridge();
  const port2 = await bridge2.start();
  const webview2 = simulateWebview(bridge2);
  log(`Part 2: DevtoolsBridge relay on ${port2}; testing reload/reconnect…`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const p2 = await browser.newPage();
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
  await p2.evaluateOnNewDocument(backendSource);
  await p2.evaluateOnNewDocument(connectSource(port2));
  await p2.goto(url, { waitUntil: "load" });
  const count2a = await waitForElements(webview2.getStore, 20_000);
  log(`Part 2: initial store.numElements = ${count2a}`);

  await p2.reload({ waitUntil: "load" });
  const count2b = await waitForElements(webview2.getStore, 20_000);
  log(`Part 2: after-reload store.numElements = ${count2b}`);

  await browser.close();
  bridge2.dispose();
  server.close();
  clearTimeout(watchdog);

  const pass = count1 > 0 && count2a > 0 && count2b > 0;
  console.log("\n=== PHASE 1 HARNESS RESULT ===");
  console.log(`part1 real Puppeteer      : ${count1}`);
  console.log(`part2 initial            : ${count2a}`);
  console.log(`part2 after reload       : ${count2b}`);
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase1] uncaught error:", err);
  process.exit(1);
});
