/*
 * Phase 5f verification harness (throwaway): the final Phase 5 integration
 * checkpoint. Drives the REAL compiled runtime pipeline (real Puppeteer +
 * Chrome, real DevtoolsBridge, a real react-devtools-inline Store) against
 * the dedicated spike/fixtures/kitchen-sink-app/ fixture, and separately runs
 * the REAL src/staticAnalysis.ts / src/propDrilling.ts / src/dependencyMetrics.ts
 * against that same fixture's source -- proving every Phase 5 feature works
 * TOGETHER against one coherent app, and specifically exercising two React
 * patterns nothing in this project has exercised live before now:
 * React.lazy()/Suspense and ReactDOM.createPortal().
 *
 * The static-only half of this fixture's checks (unused components, dead
 * props, prop drilling, dependency metrics -- no live Chrome needed for any
 * of those) is covered by the permanent spike/kitchenSink.test.js instead,
 * mirroring how run-phase5d-coverage.js/run-phase5e-select-instance.js split
 * from coverage.test.js/selectByComponent.test.js. This harness re-derives
 * the same static result only insofar as it needs it to correlate against
 * live data (coverage) or drive a live selection (CodeLens flow).
 *
 * Run `npm run compile` first (this uses out/*.js).
 */
"use strict";

const fs = require("fs");
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
const { analyzeWorkspace, computeUnusedComponents, computeDeadProps } = require("../out/staticAnalysis.js");
const { computePropDrilling } = require("../out/propDrilling.js");
const { computeDependencyMetrics } = require("../out/dependencyMetrics.js");
const { SelectInstanceCodeLensProvider } = require("../out/selectInstanceCodeLens.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE_ROOT = path.join(__dirname, "fixtures", "kitchen-sink-app");
const FIXTURE_SRC = path.join(FIXTURE_ROOT, "src");

const log = (...a) => console.log("[phase5f-kitchen-sink]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Node stand-in for the webview, same technique as run-phase5d-coverage.js:
// real react-devtools-inline Store, plus the real client/everRendered.ts
// accumulation folded in on every 'mutated' event.
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

  return { getStore: () => store, getBridge: () => frontendBridge, getEverRendered: () => everRendered };
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

// Walks the store's CURRENT tree looking for a displayName -- distinct from
// waitForElements: the initial commit only ever contains LazyChart's
// Suspense FALLBACK (a plain div), not LazyChart itself, so "store has
// elements" is not the same question as "the lazy chunk has resolved and
// LazyChart actually mounted."
function findByDisplayName(store, displayName) {
  const matches = [];
  const visit = (id) => {
    const el = store.getElementByID(id);
    if (!el) return;
    if (el.displayName === displayName) matches.push(el);
    for (const childId of el.children) visit(childId);
  };
  for (const rootId of store.roots) visit(rootId);
  return matches;
}

async function waitForDisplayName(getStore, displayName, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const store = getStore();
    if (store) {
      const matches = findByDisplayName(store, displayName);
      if (matches.length > 0) return matches;
    }
    await delay(200);
  }
  return [];
}

// Walks UP from `elementId` via each element's own parentID (not the
// root-down `.children` traversal above) -- the direct way to answer "is
// this element correctly parented", independent of whatever
// filtering/compression the Store applies to `.children`.
function ancestorChain(store, elementId) {
  const chain = [];
  let currentId = elementId;
  const guard = new Set();
  for (let i = 0; i < 64; i++) {
    const el = store.getElementByID(currentId);
    if (!el) break;
    chain.push({ id: currentId, displayName: el.displayName, type: el.type });
    if (!el.parentID || guard.has(el.parentID)) break;
    guard.add(el.parentID);
    currentId = el.parentID;
  }
  return chain;
}

async function serveFixtureApp() {
  const built = await esbuild.build({
    entryPoints: [path.join(FIXTURE_SRC, "index.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const appJs = built.outputFiles[0].text;
  // portal-root is a sibling of root, genuinely OUTSIDE the React root's own
  // DOM container -- see PortalOverlay.tsx's own comment for why that's the
  // point.
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase5f</title></head>' +
    '<body><div id="root"></div><div id="portal-root"></div><script src="/app.js"></script></body></html>';
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

function waitForInspectorSettled(getLatestState, elementId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getLatestState();
      if (state && state.elementId === elementId && !state.loading) {
        resolve(state);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`timed out waiting for inspector to settle on elementId=${elementId}`));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

// The source -> live instance flow exactly as Task 5e wired it: the REAL
// SelectInstanceCodeLensProvider computes {displayName} from the component's
// OWN source file text (a fake vscode.TextDocument -- just the two fields
// analysisPathFor/provideCodeLenses actually read), then that displayName
// feeds findMountedElementIdsByDisplayName + a real ElementInspector, exactly
// like run-phase5e-select-instance.js's selectByDisplayName and like the
// "ReactION.selectInstance" command itself.
async function selectViaCodeLens(
  findMountedElementIdsByDisplayName,
  ElementInspector,
  store,
  frontendBridge,
  fixtureFilePath,
) {
  const fileText = fs.readFileSync(fixtureFilePath, "utf8");
  const document = { getText: () => fileText, fileName: fixtureFilePath, languageId: "typescriptreact" };
  const provider = new SelectInstanceCodeLensProvider();
  const lenses = provider.provideCodeLenses(document);
  if (lenses.length === 0) {
    return { displayName: undefined, ids: [], settledState: null };
  }
  const { displayName } = lenses[0].command.arguments[0];
  const ids = findMountedElementIdsByDisplayName(store, displayName);
  if (ids.length === 0) {
    return { displayName, ids, settledState: null };
  }
  let latest = null;
  const inspector = new ElementInspector(frontendBridge, store, (state) => {
    latest = state;
  });
  try {
    inspector.select(ids[0]);
    const settledState = await waitForInspectorSettled(() => latest, ids[0], 10_000);
    return { displayName, ids, settledState };
  } finally {
    inspector.dispose();
  }
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[phase5f-kitchen-sink] FAIL: overall timeout");
    process.exit(1);
  }, 90_000);

  const { mergeDisplayNames } = await requireCompiled(path.join(__dirname, "..", "client", "everRendered.ts"));
  const { correlateCoverage } = await requireCompiled(path.join(__dirname, "..", "client", "coverage.ts"));
  const { findMountedElementIdsByDisplayName } = await requireCompiled(
    path.join(__dirname, "..", "client", "selectByComponent.ts"),
  );
  const { ElementInspector } = await requireCompiled(path.join(__dirname, "..", "client", "elementInspection.ts"));

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
  log(`initial store.numElements = ${elementCount}`);

  const lazyMatches = await waitForDisplayName(webview.getStore, "LazyChart", 15_000);
  const portalMatches = await waitForDisplayName(webview.getStore, "PortalBadge", 15_000);
  // Settle beat for any trailing mutation (mirrors run-phase5d-coverage.js).
  await delay(500);

  const store = webview.getStore();
  const frontendBridge = webview.getBridge();

  const lazyAncestry = lazyMatches.length > 0 ? ancestorChain(store, lazyMatches[0].id) : [];
  const portalAncestry = portalMatches.length > 0 ? ancestorChain(store, portalMatches[0].id) : [];
  log(`LazyChart ancestry: ${JSON.stringify(lazyAncestry)}`);
  log(`PortalBadge ancestry: ${JSON.stringify(portalAncestry)}`);
  log(`store.roots = ${JSON.stringify(store.roots)}`);

  const everRenderedNames = webview.getEverRendered();
  log(`ever-rendered live: ${[...everRenderedNames].sort().join(", ")}`);

  const portalCodeLens = await selectViaCodeLens(
    findMountedElementIdsByDisplayName,
    ElementInspector,
    store,
    frontendBridge,
    path.join(FIXTURE_SRC, "components", "PortalBadge.tsx"),
  );
  const actionButtonCodeLens = await selectViaCodeLens(
    findMountedElementIdsByDisplayName,
    ElementInspector,
    store,
    frontendBridge,
    path.join(FIXTURE_SRC, "components", "ActionButton.tsx"),
  );
  log(
    `PortalBadge CodeLens select: ids=${JSON.stringify(portalCodeLens.ids)} settled=${JSON.stringify(
      portalCodeLens.settledState && { elementId: portalCodeLens.settledState.elementId, error: portalCodeLens.settledState.error },
    )}`,
  );
  log(
    `ActionButton CodeLens select: ids=${JSON.stringify(actionButtonCodeLens.ids)} settled=${JSON.stringify(
      actionButtonCodeLens.settledState && { elementId: actionButtonCodeLens.settledState.elementId, error: actionButtonCodeLens.settledState.error },
    )}`,
  );

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);
  teardownJsdomGlobals();

  // --- Static analysis (out/staticAnalysis.js / propDrilling.js / dependencyMetrics.js). ---
  const staticResult = analyzeWorkspace(FIXTURE_ROOT);
  const unusedNames = computeUnusedComponents(staticResult).map((c) => c.displayName);
  const deadProps = computeDeadProps(staticResult);
  const chains = computePropDrilling(staticResult);
  const metrics = computeDependencyMetrics(staticResult);
  const metricsByName = new Map(metrics.map((entry) => [entry.component.displayName, entry]));

  const staticComponents = staticResult.components.map((component) => ({
    displayName: component.displayName,
    filePath: component.location.filePath,
    line: component.location.line,
    column: component.location.column,
  }));
  const coverage = correlateCoverage(staticComponents, everRenderedNames);
  const notRenderedNames = coverage.notRendered.map((c) => c.displayName).sort();

  log(`static components (${staticComponents.length}): ${staticComponents.map((c) => c.displayName).sort().join(", ")}`);
  log(`unused: ${unusedNames.join(", ")}`);
  log(`dead props: ${JSON.stringify(deadProps.map((d) => d.component.displayName))}`);
  log(`prop-drilling chains: ${JSON.stringify(chains.map((c) => ({ prop: c.propName, layers: c.components.map((x) => x.displayName), terminal: c.terminal })))}`);
  log(`not rendered (correlated): ${notRenderedNames.join(", ")}`);
  log(`coverage: ${coverage.totalComponents - coverage.notRendered.length}/${coverage.totalComponents} (${Math.round(coverage.coverageFraction * 100)}%)`);

  const suspenseAncestor = lazyAncestry.find((node) => node.type === 12);
  const portalOverlayAncestor = portalAncestry.find((node) => node.displayName === "PortalOverlay");

  const checks = [
    ["store actually populated", elementCount > 0],
    ["static analysis found all 17 fixture components", staticComponents.length === 17],
    ["computeUnusedComponents flags only UnusedGizmo (no false delete on LazyChart)", unusedNames.length === 1 && unusedNames[0] === "UnusedGizmo"],
    ["no dead props detected anywhere in the fixture", deadProps.length === 0],
    [
      "exactly one prop-drilling chain: Toolbar -> ToolbarSection, consumed by ActionButton",
      chains.length === 1 &&
        chains[0].propName === "labelText" &&
        chains[0].components.map((c) => c.displayName).join(">") === "Toolbar>ToolbarSection" &&
        chains[0].terminal.kind === "consumed" &&
        chains[0].terminal.component.displayName === "ActionButton",
    ],
    ["dependency metrics computed for every component, IconButton fan-in is 3", metricsByName.size === 17 && metricsByName.get("IconButton").fanIn === 3],
    ["LazyChart eventually mounted live (Suspense resolved)", lazyMatches.length === 1],
    ["LazyChart's live ancestry includes a Suspense-type (12) element", !!suspenseAncestor],
    ["PortalBadge (portaled content) is present in the live Store's tree", portalMatches.length === 1],
    ["PortalBadge is parented under PortalOverlay in the live tree, not orphaned", !!portalOverlayAncestor],
    ["the portal did not create a second, disconnected root", store.roots.length === 1],
    [
      "coverage correctly flags UnusedGizmo and DormantFeaturePanel as not-rendered, nothing else",
      notRenderedNames.length === 2 && notRenderedNames[0] === "DormantFeaturePanel" && notRenderedNames[1] === "UnusedGizmo",
    ],
    ["LazyChart (once resolved) counts as ever-rendered, not not-rendered", everRenderedNames.has("LazyChart")],
    ["PortalBadge (portaled) counts as ever-rendered, not not-rendered", everRenderedNames.has("PortalBadge")],
    ["MemoBadge (memo-wrapped) counts as ever-rendered under its static displayName", everRenderedNames.has("MemoBadge")],
    ["FancyInput (forwardRef-wrapped) counts as ever-rendered under its static displayName", everRenderedNames.has("FancyInput")],
    [
      "CodeLens flow selects the live PortalBadge instance (the portaled one) by displayName",
      portalCodeLens.displayName === "PortalBadge" &&
        portalCodeLens.ids.length === 1 &&
        !!portalCodeLens.settledState &&
        portalCodeLens.settledState.elementId === portalCodeLens.ids[0] &&
        !portalCodeLens.settledState.error,
    ],
    [
      "CodeLens flow selects the live ActionButton instance (drilled-prop consumer) by displayName",
      actionButtonCodeLens.displayName === "ActionButton" &&
        actionButtonCodeLens.ids.length === 1 &&
        !!actionButtonCodeLens.settledState &&
        actionButtonCodeLens.settledState.elementId === actionButtonCodeLens.ids[0] &&
        !actionButtonCodeLens.settledState.error,
    ],
  ];

  console.log("\n=== PHASE 5F HARNESS RESULT ===");
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase5f-kitchen-sink] uncaught error:", err);
  process.exit(1);
});
