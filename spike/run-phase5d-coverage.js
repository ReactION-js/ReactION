/*
 * Phase 5d verification harness (throwaway): drives the REAL compiled
 * runtime pipeline (real Puppeteer + Chrome, real DevtoolsBridge, a real
 * react-devtools-inline Store) against the dedicated
 * spike/fixtures/coverage-app/app.jsx fixture to populate an "ever-rendered"
 * displayName set, separately runs the REAL src/staticAnalysis.ts's
 * analyzeWorkspace() against that same fixture's source directory, and
 * asserts the REAL client/coverage.ts's correlateCoverage() correctly
 * identifies NeverRenderedPanel as not-rendered while correctly clearing
 * every component the fixture actually renders (Header, Counter, Footer,
 * App itself).
 *
 * Run `npm run compile` first (this uses out/staticAnalysis.js).
 */
"use strict";

const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const { stubVscodeModule, setupJsdomGlobals, requireCompiled } = require("./testHarness");

stubVscodeModule();
const teardownJsdomGlobals = setupJsdomGlobals();

// eslint-disable-next-line
const { createBridge, createStore } = require("react-devtools-inline/frontend");
const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;
const { analyzeWorkspace } = require("../out/staticAnalysis.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE_DIR = path.join(__dirname, "fixtures", "coverage-app");

const log = (...a) => console.log("[phase5d-coverage]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Node stand-in for the webview, extended with the REAL client/everRendered.ts
// accumulation logic (via requireCompiled) so this exercises the actual
// shipped code, not a reimplementation of it -- mirrors run-phase1.js's own
// simulateWebview, plus useEverRendered.ts's "merge on every mutated event"
// behavior.
function simulateWebviewWithEverRendered(bridge, mergeDisplayNames) {
  let listeners = [];
  let frontendBridge;
  let store;
  const everRendered = new Set();

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
    store.addListener("mutated", () => mergeDisplayNames(everRendered, store));
    mergeDisplayNames(everRendered, store);
  };

  bridge.onBackendConnected(reset);
  bridge.onPageMessage((message) => listeners.forEach((fn) => fn(message)));

  return { getStore: () => store, getEverRendered: () => everRendered };
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

async function serveFixtureApp() {
  const built = await esbuild.build({
    entryPoints: [path.join(FIXTURE_DIR, "app.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const appJs = built.outputFiles[0].text;
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase5d</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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
    console.error("[phase5d-coverage] FAIL: overall timeout");
    process.exit(1);
  }, 60_000);

  const { mergeDisplayNames } = await requireCompiled(
    path.join(__dirname, "..", "client", "everRendered.ts"),
  );
  const { correlateCoverage } = await requireCompiled(
    path.join(__dirname, "..", "client", "coverage.ts"),
  );

  const { server, url } = await serveFixtureApp();
  log(`fixture app served at ${url}`);

  const bridge = new DevtoolsBridge();
  const relayPort = await bridge.start();
  const webview = simulateWebviewWithEverRendered(bridge, mergeDisplayNames);
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
  // A settle beat: the initial render already committed everything this
  // fixture ever mounts (no interval/async mount like sample-app.jsx's
  // Counter), but this guards against a slow last "mutated" event landing
  // after waitForElements's numElements check already passed.
  await delay(500);

  const everRenderedNames = webview.getEverRendered();
  await page.close();
  bridge.dispose();
  server.close();

  const staticResult = analyzeWorkspace(FIXTURE_DIR);
  const staticComponents = staticResult.components.map((component) => ({
    displayName: component.displayName,
    filePath: component.location.filePath,
    line: component.location.line,
    column: component.location.column,
  }));

  const coverage = correlateCoverage(staticComponents, everRenderedNames);
  const notRenderedNames = coverage.notRendered.map((c) => c.displayName).sort();

  clearTimeout(watchdog);
  teardownJsdomGlobals();

  log(`static components: ${staticComponents.map((c) => c.displayName).sort().join(", ")}`);
  log(`ever-rendered live: ${[...everRenderedNames].sort().join(", ")}`);
  log(`not rendered (correlated): ${notRenderedNames.join(", ")}`);
  log(`coverage: ${coverage.totalComponents - coverage.notRendered.length}/${coverage.totalComponents} (${Math.round(coverage.coverageFraction * 100)}%)`);

  const checks = [
    ["store actually populated", elementCount > 0],
    ["static analysis found all 5 fixture components", staticComponents.length === 5],
    [
      "NeverRenderedPanel is correctly flagged as not-rendered",
      notRenderedNames.length === 1 && notRenderedNames[0] === "NeverRenderedPanel",
    ],
    ["Header was actually rendered live", everRenderedNames.has("Header")],
    ["Counter was actually rendered live", everRenderedNames.has("Counter")],
    ["Footer was actually rendered live", everRenderedNames.has("Footer")],
    ["App itself was actually rendered live", everRenderedNames.has("App")],
    [
      "none of the genuinely-rendered components were flagged not-rendered",
      ["Header", "Counter", "Footer", "App"].every((name) => !notRenderedNames.includes(name)),
    ],
    [
      "coverage fraction is 4/5",
      Math.abs(coverage.coverageFraction - 4 / 5) < 1e-9,
    ],
  ];

  console.log("\n=== PHASE 5D HARNESS RESULT ===");
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase5d-coverage] uncaught error:", err);
  process.exit(1);
});
