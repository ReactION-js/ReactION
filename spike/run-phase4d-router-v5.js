/*
 * Phase 4d router-v5 verification harness (throwaway), modeled on
 * spike/run-phase1.js and spike/run-phase4c-multiroot.js.
 *
 * GitHub issue #72, verbatim: "nice tools! Can it work with react-router
 * v5+?" -- reporter's stack was react@16.9.0, react-dom@16.9.0,
 * react-router@5.0.1, react-router-dom@^5.0.1, and their actual symptom was
 * "it look like cannt working in my project. nothing is displayed...". That
 * was reported against the OLD hand-rolled fiber walk
 * (_reactRootContainer/__reactFiber$ internals), which this project's Phase
 * 0-3 rearchitecture replaced with the official React DevTools protocol
 * (react-devtools-core backend + react-devtools-inline Store, relayed by
 * DevtoolsBridge). This harness reproduces the reporter's EXACT dependency
 * combination -- a dedicated, isolated fixture at
 * spike/fixtures/router-v5-app/ with its own node_modules pinning those
 * exact versions, entirely separate from the root project's React 19 --
 * bundles it with esbuild resolving from the fixture's own node_modules, and
 * drives it through the REAL compiled host modules (out/devtoolsBridge.js,
 * out/puppeteer.js) against real Chrome. Asserts store.numElements > 0 (the
 * direct fix for issue #72's "nothing is displayed" symptom) and that the
 * router-rendered components show up correctly in the tree.
 */
"use strict";

const fs = require("fs");
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

const FIXTURE_DIR = path.join(__dirname, "fixtures", "router-v5-app");

const log = (...a) => console.log("[phase4d-router-v5]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Same wiring as run-phase4c-multiroot.js: drives the REAL client/storeBridge.ts
// StoreConnection exactly as the extension host <-> webview protocol does.
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

// Confirms which react/react-dom/react-router-dom copy esbuild will resolve
// BEFORE bundling: the fixture's own (16.9.0/16.9.0/5.0.1), not the root
// project's (react/react-dom 19.3.0). If this ever reports the root's
// versions, esbuild resolution picked the wrong node_modules and the whole
// premise of this harness (testing the OLD version combo) would be void.
function logResolvedFixtureVersions() {
  for (const pkg of ["react", "react-dom", "react-router-dom"]) {
    const pkgJsonPath = path.join(FIXTURE_DIR, "node_modules", pkg, "package.json");
    const version = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).version;
    log(`fixture node_modules/${pkg} version (pre-bundle, from disk): ${version}`);
  }
}

// Bundles spike/fixtures/router-v5-app/app.jsx with entry point AND
// absWorkingDir set to the fixture directory, so esbuild's module resolution
// walks up from THAT directory (finding its own node_modules) rather than
// the root project's. jsx: "transform" (esbuild's classic React.createElement
// mode, not "automatic") because React 16.9 predates the react/jsx-runtime
// module the automatic transform requires.
async function serveRouterV5App() {
  const entryPoint = path.join(FIXTURE_DIR, "app.jsx");
  const built = await esbuild.build({
    entryPoints: [entryPoint],
    absWorkingDir: FIXTURE_DIR,
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "transform",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const appJs = built.outputFiles[0].text;

  // Empirical proof the BUNDLE ITSELF embeds React 16.9's code, not the
  // root's React 19: React's source bakes its version into a string literal
  // (`var ReactVersion = '16.9.0';` in react.development.js) that survives
  // bundling verbatim in a dev build. Fail loudly if that's not what's here.
  const has16_9 = appJs.includes("16.9.0");
  const has19 = /19\.3\.\d+/.test(appJs) || appJs.includes("'19.");
  log(`bundle contains React 16.9.0 version string: ${has16_9}`);
  log(`bundle contains a React 19.x version string: ${has19}`);
  if (!has16_9 || has19) {
    throw new Error(
      "esbuild resolved the WRONG React copy into the bundle -- expected 16.9.0 only",
    );
  }

  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase4d-router-v5</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

// Walks a ComponentNode subtree for a node whose name matches exactly OR
// (esbuild bundling can rename a function that collides with an outer
// binding -- see run-phase3-inspect.js) starts with this prefix.
function findByNamePrefix(node, prefix) {
  if (node.name === prefix || (typeof node.name === "string" && node.name.startsWith(prefix))) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findByNamePrefix(child, prefix);
    if (found) return found;
  }
  return null;
}

function collectNames(node, out) {
  if (node.name) out.push(node.name);
  for (const child of node.children ?? []) collectNames(child, out);
  return out;
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase4d-router-v5] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  log(
    "This reproduces GitHub issue #72's exact dependency versions " +
      "(react/react-dom 16.9.0, react-router-dom 5.0.1) against the current " +
      "DevTools-protocol pipeline.",
  );

  logResolvedFixtureVersions();

  const { StoreConnection } = await requireCompiled(
    path.join(__dirname, "..", "client", "storeBridge.ts"),
  );

  const { server, url } = await serveRouterV5App();
  log(`router-v5 app served at ${url}`);

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
  log(`store.numElements = ${elementCount}`);

  const tree = webview.getTree();
  const names = tree ? collectNames(tree, []) : [];

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const checks = [];
  const check = (label, condition) => {
    checks.push({ label, pass: !!condition });
    log(`${condition ? "PASS" : "FAIL"}: ${label}`);
  };

  check("store.numElements > 0 (direct fix for issue #72's empty tree)", elementCount > 0);
  check("a ComponentNode tree was produced", !!tree);
  check("tree contains the Nav component (renders NavLink/Link)", tree && !!findByNamePrefix(tree, "Nav"));
  check("tree contains the Users component (nested route)", tree && !!findByNamePrefix(tree, "Users"));
  check("tree contains UserDetails children of the nested route", tree && !!findByNamePrefix(tree, "UserDetails"));
  check("tree contains the top-level App component", tree && !!findByNamePrefix(tree, "App"));

  const pass = checks.every((c) => c.pass);
  console.log("\n=== PHASE 4d ROUTER-V5 HARNESS RESULT ===");
  console.log(`store.numElements: ${elementCount}`);
  console.log(`component names seen in tree: ${JSON.stringify(names)}`);
  console.log(JSON.stringify(tree, null, 2));
  console.log(
    pass
      ? "RESULT: PASS ✅ -- issue #72 (react-router v5 + React 16.9) is fixed by the DevTools-protocol pipeline"
      : "RESULT: FAIL ❌",
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase4d-router-v5] uncaught error:", err);
  process.exit(1);
});
