/*
 * Phase 4c multi-root verification harness (throwaway), modeled on
 * spike/run-phase1.js.
 *
 * client/storeBridge.ts's buildTree() maps store.roots and wraps more than
 * one root under a synthetic {name: "Roots", id: "roots", ...} node, but this
 * was completely untested: the shared spike/sample-app.jsx only ever mounts
 * one root. This harness drives the REAL compiled host modules
 * (out/devtoolsBridge.js, out/puppeteer.js) plus the REAL, esbuild-compiled
 * client/storeBridge.ts (StoreConnection, same technique as
 * spike/run-phase3-renderstats.js) against a real Chrome tab running the
 * dedicated spike/fixtures/multi-root-app.jsx, which mounts two independent
 * `createRoot(...).render(...)` trees. Asserts store.roots.length === 2 and
 * that buildTree()'s real "Roots" wrapper has exactly two children whose
 * subtrees correctly correspond to AppOne/AppTwo without being merged or
 * confused with each other.
 */
"use strict";

const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const { stubVscodeModule, setupJsdomGlobals, requireCompiled } = require("./testHarness");

stubVscodeModule();
setupJsdomGlobals();

const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase4c-multiroot]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Wires DevtoolsBridge directly into the REAL StoreConnection exactly as the
// extension host <-> webview protocol does (see client/storeBridge.ts's
// handleHostMessage switch): "backend-connected" on connect, then one
// {type: "wall", message} per raw wall message.
function wireStoreConnection(bridge, StoreConnection) {
  let latestTree;
  const conn = new StoreConnection({ postMessage: () => {} }, (tree) => {
    latestTree = tree;
  });
  bridge.onBackendConnected(() => conn.handleHostMessage({ type: "backend-connected" }));
  bridge.onPageMessage((message) => conn.handleHostMessage({ type: "wall", message }));
  return { getStore: () => conn.getStore(), getTree: () => latestTree };
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

async function waitForRoots(getStore, count, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const store = getStore();
    if (store && store.roots.length >= count) return store.roots.length;
    await delay(200);
  }
  const store = getStore();
  return store ? store.roots.length : 0;
}

async function serveMultiRootApp() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "fixtures", "multi-root-app.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const appJs = built.outputFiles[0].text;
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase4c-multiroot</title></head>' +
    '<body><div id="root-one"></div><div id="root-two"></div><script src="/app.js"></script></body></html>';
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

// Walks a ComponentNode subtree looking for a node with this exact name.
function subtreeContains(node, name) {
  if (node.name === name) return true;
  return (node.children ?? []).some((child) => subtreeContains(child, name));
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase4c-multiroot] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  const { StoreConnection } = await requireCompiled(
    path.join(__dirname, "..", "client", "storeBridge.ts"),
  );

  const { server, url } = await serveMultiRootApp();
  log(`multi-root app served at ${url}`);

  const bridge = new DevtoolsBridge();
  const relayPort = await bridge.start();
  const webview = wireStoreConnection(bridge, StoreConnection);
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
  const rootCount = await waitForRoots(webview.getStore, 2, 20_000);
  log(`store.numElements = ${elementCount}, store.roots.length = ${rootCount}`);

  const tree = webview.getTree();

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const checks = [];
  const check = (label, condition) => {
    checks.push({ label, pass: !!condition });
    log(`${condition ? "PASS" : "FAIL"}: ${label}`);
  };

  check("store.roots.length === 2", rootCount === 2);
  check("a ComponentNode tree was produced", !!tree);
  check('top-level node is the synthetic "Roots" wrapper', tree && tree.name === "Roots" && tree.id === "roots");
  check("Roots wrapper has exactly two children", tree && Array.isArray(tree.children) && tree.children.length === 2);

  let oneChild, twoChild;
  if (tree && Array.isArray(tree.children)) {
    oneChild = tree.children.find((c) => subtreeContains(c, "ChildOne"));
    twoChild = tree.children.find((c) => subtreeContains(c, "ChildTwo"));
  }
  check("one child's subtree contains AppOne's ChildOne", !!oneChild);
  check("one child's subtree contains AppTwo's ChildTwo", !!twoChild);
  check("AppOne's and AppTwo's subtrees are different children (not merged)", oneChild && twoChild && oneChild !== twoChild);
  check("AppOne's subtree does NOT also contain ChildTwo (no cross-contamination)", oneChild && !subtreeContains(oneChild, "ChildTwo"));
  check("AppTwo's subtree does NOT also contain ChildOne (no cross-contamination)", twoChild && !subtreeContains(twoChild, "ChildOne"));
  // Each root wraps its app in its own "Root"-labeled node (same shape the
  // single-root case produces -- confirmed empirically, see the dumped tree
  // below), so AppOne/AppTwo sit one level under Roots.children[i], not at it.
  check("AppOne's subtree contains a Function-typed AppOne node", oneChild && subtreeContains(oneChild, "AppOne"));
  check("AppTwo's subtree contains a Function-typed AppTwo node", twoChild && subtreeContains(twoChild, "AppTwo"));

  const pass = checks.every((c) => c.pass);
  console.log("\n=== PHASE 4c MULTI-ROOT HARNESS RESULT ===");
  console.log(`store.numElements: ${elementCount}`);
  console.log(`store.roots.length: ${rootCount}`);
  console.log(JSON.stringify(tree, null, 2));
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase4c-multiroot] uncaught error:", err);
  process.exit(1);
});
