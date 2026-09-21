/*
 * Phase 4b verification harness (throwaway).
 *
 * Exercises the REAL compiled host modules (out/devtoolsBridge.js,
 * out/puppeteer.js, out/connectionResilience.js) end-to-end with real Chrome,
 * modeled on spike/run-phase1.js. Two parts:
 *
 *   Part A: dev server dies mid-session and comes back -- proves
 *           connectionResilience's grace-period + bounded-backoff reconnect
 *           re-establishes the relay connection and the Store repopulates,
 *           with NO manual re-navigation once the trigger below fires.
 *
 *           Trigger used: after killing the HTTP server, we call the real
 *           Puppeteer.reconnect(url) ONCE ourselves. This stands in for
 *           whatever externally triggers a reload while a real dev server is
 *           down (webpack-dev-server/Vite's own HMR client noticing ITS
 *           websocket to the dev server drop and calling location.reload());
 *           reproducing a live HMR client is out of scope for this task
 *           (fixture work is 4c). The one manual call only supplies that
 *           external trigger -- the actual disconnect detection, grace
 *           period, backoff schedule and repeated re-navigation afterward are
 *           all driven by connectionResilience.js itself, unassisted.
 *
 *   Part B: the launched Chrome process is SIGKILLed out from under the
 *           extension (simulating a crash / the user closing the window).
 *           Proves Puppeteer's 'disconnected' handler fires, the
 *           connectionResilience onBrowserLost hook is reached, and no
 *           reconnect loop is left running afterward.
 */
"use strict";

const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");

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
const { wireConnectionResilience } = require("../out/connectionResilience.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase4b]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirrors client/storeBridge.ts's create-on-connect/teardown-on-disconnect
// pair (NOT run-phase1.js's simplified version, which only resets on
// connect). That matters here specifically: without clearing `store` on
// disconnect, a stale pre-outage Store would make "repopulated" true even if
// reconnection never actually happened.
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

  const teardown = () => {
    listeners = [];
    frontendBridge = undefined;
    store = undefined;
  };

  bridge.onBackendConnected(reset);
  bridge.onBackendDisconnected(teardown);
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

async function waitUntil(predicate, timeoutMs, intervalMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await delay(intervalMs);
  }
  return predicate();
}

// A fresh server bound to a fixed port so it can be killed and re-listened on
// the SAME port (the extension keeps trying the same URL, exactly like a real
// dev server restarting on its configured port). Tracks live sockets so
// "killing" it is instant and total, like an OS-level kill of a real
// process -- not Node's graceful server.close(), which waits out keep-alives.
function serveSampleAppOn(port, appJs) {
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase4b</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(appJs);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(appHtml);
    }
  });
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, sockets }));
  });
}

function killServer({ server, sockets }) {
  for (const socket of sockets) {
    socket.destroy();
  }
  return new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase4b] FAIL: overall timeout");
    process.exit(1);
  }, 180_000);

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

  // --- Part A: dev server dies mid-session and comes back. -------------------
  let { server, sockets } = await serveSampleAppOn(0, appJs);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  log(`Part A: sample app served at ${url}`);

  const bridgeA = new DevtoolsBridge((m) => log(`[bridgeA] ${m}`));
  const relayPortA = await bridgeA.start();
  const webviewA = simulateWebview(bridgeA);

  const resilienceLogLines = [];
  const pageA = new Puppeteer(
    {
      system: process.platform,
      executablePath: CHROME_PATH,
      localhost: url,
      headless_browser: true,
      headless_embedded: true,
      reactTheme: "dark",
    },
    (m) => log(`[puppeteerA] ${m}`),
  );

  await pageA.start(relayPortA);
  log(`Part A: connectedUrl = ${pageA.connectedUrl}`);

  let reconnectExhausted = false;
  let browserLostA = false;
  const resilienceA = wireConnectionResilience({
    bridge: bridgeA,
    page: pageA,
    url: pageA.connectedUrl,
    log: (m) => {
      resilienceLogLines.push(m);
      log(`[resilienceA] ${m}`);
    },
    isTornDown: () => false,
    onReconnectExhausted: () => {
      reconnectExhausted = true;
    },
    onBrowserLost: () => {
      browserLostA = true;
    },
  });

  const initialCount = await waitForElements(webviewA.getStore, 20_000);
  log(`Part A: initial store.numElements = ${initialCount}`);

  let backendDisconnectedA = false;
  bridgeA.onBackendDisconnected(() => {
    backendDisconnectedA = true;
  });

  log("Part A: killing the dev server");
  await killServer({ server, sockets });

  log("Part A: triggering the failed-reload-while-down (stand-in for the dev server's own HMR client reacting to its dropped socket)");
  const reconnectDuringOutage = await pageA.reconnect(url);
  log(`Part A: reconnect-while-down attempt returned ${reconnectDuringOutage} (expected false)`);

  const sawDisconnect = await waitUntil(() => backendDisconnectedA, 5_000);
  log(`Part A: backend-disconnected observed = ${sawDisconnect}`);

  const treeWentEmpty = await waitUntil(() => webviewA.getStore() === undefined, 5_000);
  log(`Part A: Store was torn down during the outage = ${treeWentEmpty}`);

  const sawReconnectAttempt = await waitUntil(
    () => resilienceLogLines.some((l) => l.includes("Reconnect attempt")),
    8_000,
  );
  log(`Part A: connectionResilience began its own reconnect attempts = ${sawReconnectAttempt}`);

  log("Part A: bringing the dev server back up on the same port");
  const revived = await serveSampleAppOn(port, appJs);
  server = revived.server;
  sockets = revived.sockets;

  const repopulatedCount = await waitForElements(webviewA.getStore, 20_000);
  log(`Part A: after-revival store.numElements = ${repopulatedCount}`);

  await pageA.close();
  bridgeA.dispose();
  resilienceA.dispose();
  await killServer({ server, sockets });

  const partAPass =
    initialCount > 0 &&
    sawDisconnect &&
    treeWentEmpty &&
    sawReconnectAttempt &&
    repopulatedCount > 0 &&
    !reconnectExhausted &&
    !browserLostA;

  // --- Part B: the launched Chrome process is killed out from under us. ------
  const revivedApp = await serveSampleAppOn(0, appJs);
  const portB = revivedApp.server.address().port;
  const urlB = `http://127.0.0.1:${portB}/`;
  log(`Part B: sample app served at ${urlB}`);

  const bridgeB = new DevtoolsBridge((m) => log(`[bridgeB] ${m}`));
  const relayPortB = await bridgeB.start();
  const webviewB = simulateWebview(bridgeB);

  const pageB = new Puppeteer(
    {
      system: process.platform,
      executablePath: CHROME_PATH,
      localhost: urlB,
      headless_browser: true,
      headless_embedded: true,
      reactTheme: "dark",
    },
    (m) => log(`[puppeteerB] ${m}`),
  );
  await pageB.start(relayPortB);

  let browserLostB = false;
  let reconnectExhaustedB = false;
  const resilienceLogLinesB = [];
  const resilienceB = wireConnectionResilience({
    bridge: bridgeB,
    page: pageB,
    url: pageB.connectedUrl,
    log: (m) => {
      resilienceLogLinesB.push(m);
      log(`[resilienceB] ${m}`);
    },
    isTornDown: () => false,
    onReconnectExhausted: () => {
      reconnectExhaustedB = true;
    },
    onBrowserLost: () => {
      browserLostB = true;
    },
  });

  const initialCountB = await waitForElements(webviewB.getStore, 20_000);
  log(`Part B: initial store.numElements = ${initialCountB}`);

  const pid = pageB.browserPid;
  log(`Part B: killing Chrome process pid=${pid} (SIGKILL) -- this exact pid only`);
  if (!pid) {
    throw new Error("Part B: pageB.browserPid was not available; cannot simulate a crash");
  }
  process.kill(pid, "SIGKILL");

  const sawBrowserLost = await waitUntil(() => browserLostB, 10_000);
  log(`Part B: onBrowserLost fired = ${sawBrowserLost}`);

  // No dangling retry loop should still be poking at the dead browser: wait
  // well past the full reconnect schedule (~11.5s) and confirm nothing fired.
  await delay(13_000);
  const noStrayReconnectAttempts = !resilienceLogLinesB.some((l) => l.includes("Reconnect attempt"));
  log(`Part B: no reconnect attempts were made against the dead browser = ${noStrayReconnectAttempts}`);
  log(`Part B: onReconnectExhausted fired (should be false) = ${reconnectExhaustedB}`);

  let closeAfterCrashOk = true;
  try {
    await pageB.close();
  } catch (err) {
    closeAfterCrashOk = false;
    log(`Part B: pageB.close() after crash threw: ${err && err.stack}`);
  }

  bridgeB.dispose();
  resilienceB.dispose();
  await killServer(revivedApp);

  const partBPass =
    initialCountB > 0 &&
    sawBrowserLost &&
    noStrayReconnectAttempts &&
    !reconnectExhaustedB &&
    closeAfterCrashOk;

  clearTimeout(watchdog);

  console.log("\n=== PHASE 4b HARNESS RESULT ===");
  console.log(`Part A initial elements          : ${initialCount}`);
  console.log(`Part A backend-disconnected seen  : ${sawDisconnect}`);
  console.log(`Part A tree torn down during outage: ${treeWentEmpty}`);
  console.log(`Part A auto reconnect attempted   : ${sawReconnectAttempt}`);
  console.log(`Part A elements after revival     : ${repopulatedCount}`);
  console.log(`Part A reconnectExhausted fired   : ${reconnectExhausted} (expected false)`);
  console.log(`Part A PASS                       : ${partAPass}`);
  console.log(`Part B initial elements           : ${initialCountB}`);
  console.log(`Part B onBrowserLost fired        : ${sawBrowserLost}`);
  console.log(`Part B no stray reconnect attempts: ${noStrayReconnectAttempts}`);
  console.log(`Part B close() after crash OK     : ${closeAfterCrashOk}`);
  console.log(`Part B PASS                       : ${partBPass}`);
  const pass = partAPass && partBPass;
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase4b] uncaught error:", err);
  process.exit(1);
});
