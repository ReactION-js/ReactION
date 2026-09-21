/*
 * Phase 3a verification harness (throwaway).
 *
 * Exercises the REAL compiled host modules (out/devtoolsBridge.js and
 * out/puppeteer.js) end-to-end, with a Node/JSDOM stand-in for the webview
 * (react-devtools-inline Store + Bridge), modeled on spike/run-phase1.js.
 *
 * Unlike Phase 1 (which only checks store.numElements), this drives the real
 * inspectElement/inspectedElement protocol: it finds the sample app's Counter
 * element via the Store, sends a real inspectElement request over the real
 * relay, and asserts the shape of the real inspectedElement response.
 *
 * NOTE on the wire shape: props/state/hooks do NOT arrive as a bare tree.
 * Each one is wrapped as { data, cleaned, unserializable } (confirmed against
 * react-devtools-core/dist/backend.js's cleanForBridge()); `data` is the tree
 * with Dehydrated placeholders spliced in. So the Counter's `count` prop is at
 * `value.props.data.count`, not `value.props.count`. See client/elementInspection.ts.
 */
"use strict";

const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");

// Stub the `vscode` module, same as run-phase1.js.
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
const { requireCompiled } = require("./testHarness");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase3-inspect]", ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Node stand-in for the webview: mirrors client/storeBridge.ts's wall wiring.
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

// Matches by prefix, not equality: esbuild's bundler (used to serve
// sample-app.jsx here, same as run-phase1.js/run-phase2-visual.js) renames a
// memo/forwardRef's inner named function expression when it collides with the
// outer `var` binding after bundling -- e.g. `const Counter = memo(function
// Counter(...) {...})` comes out of the bundle as `var Counter = memo(function
// Counter2(...) {...})`. React DevTools reads displayName off that inner
// function's real (renamed) .name, so the Store reports "Counter2", not
// "Counter". Confirmed by inspecting the actual esbuild output; not a
// react-devtools-core/inline protocol quirk.
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

// Sends inspectElement and resolves with the inspectedElement response whose
// responseID matches, mirroring how client/elementInspection.ts correlates
// requests/responses (by the element id the caller already knows to expect).
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

// Bundle + serve the shared sample app (unmodified, per the task brief).
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>phase3</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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
    console.error("[phase3-inspect] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

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

  if (store && process.env.PHASE3_DEBUG_DUMP) {
    for (let i = 0; i < store.numElements; i++) {
      const id = store.getElementIDAtIndex(i);
      const el = id == null ? null : store.getElementByID(id);
      log(
        `element[${i}] id=${id} displayName=${JSON.stringify(el && el.displayName)} type=${el && el.type}`,
      );
    }
  }

  let counterElement = null;
  let appElement = null;
  if (store) {
    // The Counter re-renders every 800ms; give the tree a moment to settle
    // before searching, though displayName is stable across renders anyway.
    counterElement = findElementByDisplayNamePrefix(store, "Counter");
    appElement = findElementByDisplayNamePrefix(store, "App");
  }

  let propsCheck = false;
  let receivedProps = undefined;
  let noChangeOrFullDataOnPoll = false;
  let hooksCheck = false;
  let receivedHooksSummary = undefined;

  if (counterElement && store && frontendBridge) {
    const rendererID = store.getRendererIDForElement(counterElement.id);
    log(`Counter element id=${counterElement.id} rendererID=${rendererID}`);

    if (rendererID != null) {
      const fullResponse = await inspectElement(
        frontendBridge,
        1,
        { id: counterElement.id, rendererID, path: null, forceFullData: true },
        10_000,
      ).catch((err) => ({ type: "harness-error", message: err.message }));

      log(`full inspect response type: ${fullResponse.type}`);
      if (fullResponse.type === "full-data") {
        const props = fullResponse.value.props;
        // props arrives as { data, cleaned, unserializable }, not a bare tree.
        receivedProps = props && props.data;
        propsCheck =
          !!props &&
          Array.isArray(props.cleaned) &&
          Array.isArray(props.unserializable) &&
          props.data &&
          typeof props.data.count === "number";
        log(`value.props.data = ${JSON.stringify(receivedProps)}`);
      }

      // Exercise the poll path: forceFullData:false should yield either a
      // fresh full-data (if the count changed) or the cheap no-change reply.
      await delay(150);
      const pollResponse = await inspectElement(
        frontendBridge,
        2,
        { id: counterElement.id, rendererID, path: null, forceFullData: false },
        10_000,
      ).catch((err) => ({ type: "harness-error", message: err.message }));
      log(`poll response type: ${pollResponse.type}`);
      noChangeOrFullDataOnPoll =
        pollResponse.type === "no-change" || pollResponse.type === "full-data";
    }
  } else {
    log("Counter element not found in Store");
  }

  if (appElement && store && frontendBridge) {
    const rendererID = store.getRendererIDForElement(appElement.id);
    if (rendererID != null) {
      const hooksResponse = await inspectElement(
        frontendBridge,
        3,
        { id: appElement.id, rendererID, path: null, forceFullData: true },
        10_000,
      ).catch((err) => ({ type: "harness-error", message: err.message }));
      log(`App hooks inspect response type: ${hooksResponse.type}`);
      if (hooksResponse.type === "full-data") {
        const hooks = hooksResponse.value.hooks;
        const hooksData = hooks && hooks.data;
        hooksCheck = Array.isArray(hooksData) && hooksData.length > 0 && typeof hooksData[0].name === "string";
        receivedHooksSummary = Array.isArray(hooksData)
          ? hooksData.map((h) => `${h.name}(id=${h.id})`)
          : hooksData;
        log(`App hooks summary = ${JSON.stringify(receivedHooksSummary)}`);
      }
    }
  }

  // Exercise the "expand a dehydrated path" flow end-to-end against the real
  // backend: Panel (a class component) receives 3 JSX children, which
  // dehydrate() collapses into placeholders at props.children[0..2] (a
  // react_element two levels down is past the dehydration threshold). This
  // validates the [category, ...path] request shape and the hydrated-path
  // response's re-basing that client/elementInspection.ts's mergeHydratedPath
  // depends on -- not just the initial full-data shape already checked above.
  let expandCheck = false;
  let expandSummary = undefined;
  const panelElement = store ? findElementByDisplayNamePrefix(store, "Panel") : null;
  if (panelElement && store && frontendBridge) {
    const rendererID = store.getRendererIDForElement(panelElement.id);
    if (rendererID != null) {
      const fullResponse = await inspectElement(
        frontendBridge,
        4,
        { id: panelElement.id, rendererID, path: null, forceFullData: true },
        10_000,
      ).catch((err) => ({ type: "harness-error", message: err.message }));
      const childrenData =
        fullResponse.type === "full-data" &&
        fullResponse.value.props &&
        fullResponse.value.props.data &&
        fullResponse.value.props.data.children;
      log(
        `Panel full inspect type=${fullResponse.type} children=${JSON.stringify(childrenData)}`,
      );

      if (Array.isArray(childrenData) && childrenData.length > 0 && childrenData[0].inspectable) {
        const expandResponse = await inspectElement(
          frontendBridge,
          5,
          { id: panelElement.id, rendererID, path: ["props", "children", 0], forceFullData: false },
          10_000,
        ).catch((err) => ({ type: "harness-error", message: err.message }));
        log(`expand response type: ${expandResponse.type}`);
        if (expandResponse.type === "hydrated-path") {
          const pathMatches =
            Array.isArray(expandResponse.path) &&
            JSON.stringify(expandResponse.path) === JSON.stringify(["props", "children", 0]);
          const value = expandResponse.value;
          expandCheck =
            pathMatches &&
            !!value &&
            Array.isArray(value.cleaned) &&
            Array.isArray(value.unserializable) &&
            value.data != null;
          expandSummary = { path: expandResponse.path, data: value && value.data };
          log(`expand summary = ${JSON.stringify(expandSummary)}`);
        }
      } else {
        log("Panel props.children[0] was not an inspectable placeholder; skipping expand check");
      }
    }
  }

  // Drives the REAL client/elementInspection.ts ElementInspector (via
  // requireCompiled, the same technique run-phase5e-select-instance.js
  // already uses) against this same live backend -- unlike every check
  // above, which talks to the raw inspectElement/inspectedElement protocol
  // directly and never exercises ElementInspector's own request/response
  // correlation at all. Proves the fix for a review finding: select()
  // called twice in a row for the SAME still-selected element (exactly
  // what the "Select in ReactION" CodeLens does -- App.tsx calls
  // inspector.select(id) unconditionally, with no dedup against the
  // element already being selected) must converge on correct data, not
  // whichever of the two responses happened to arrive first.
  //
  // Caveat this harness can't get around: over a single relay connection
  // with synchronous per-request backend processing, and both requests
  // here targeting the IDENTICAL element (so neither is inherently slower
  // to dehydrate than the other), the two responses are, in practice,
  // vanishingly unlikely to arrive out of send order -- there's no size/
  // cost asymmetry to exploit the way the finding's "large slow first
  // request" scenario describes. So this is a real end-to-end convergence/
  // regression proof, not an adversarial proof that out-of-order arrival
  // is handled correctly. That adversarial proof -- the OLDER request's
  // response delivered AFTER the newer one's, in that exact order -- is in
  // the permanent spike/elementInspection.test.js suite instead, which
  // talks to a fake bridge it fully controls and can therefore deliver
  // responses in any order at all, including ones a live backend would
  // never actually produce. (Confirmed discriminating: running that suite
  // against this repo's pre-fix client/elementInspection.ts, via `git show
  // HEAD:client/elementInspection.ts` before this fix landed, fails 3 of
  // its 8 cases with the exact symptom this finding describes -- a stale
  // response overwriting fresher data.)
  let doubleSelectCheck = false;
  let doubleSelectSummary = undefined;
  if (counterElement && store && frontendBridge) {
    const { ElementInspector } = await requireCompiled(
      path.join(__dirname, "..", "client", "elementInspection.ts"),
    );
    const rendererID = store.getRendererIDForElement(counterElement.id);
    if (rendererID != null) {
      let latestState = null;
      let stateTransitions = 0;
      const inspector = new ElementInspector(frontendBridge, store, (state) => {
        latestState = state;
        stateTransitions += 1;
      });
      // Independent observer alongside the inspector's own listener (the
      // real bridge fans a message out to every registered listener, same
      // as simulateWebview here) -- purely so this harness can log what
      // actually came back on the wire for this element, for a human
      // reviewer to cross-check against what the inspector settled on.
      const observedResponses = [];
      const observer = (payload) => {
        if (payload && payload.id === counterElement.id) {
          observedResponses.push(payload);
        }
      };
      frontendBridge.addListener("inspectedElement", observer);
      try {
        // The double-fire itself: synchronous, back-to-back, before either
        // response can possibly have arrived yet.
        inspector.select(counterElement.id);
        inspector.select(counterElement.id);

        const settled = await new Promise((resolve, reject) => {
          const start = Date.now();
          const check = () => {
            if (latestState && latestState.elementId === counterElement.id && !latestState.loading) {
              resolve(latestState);
              return;
            }
            if (Date.now() - start > 10_000) {
              reject(new Error("timed out waiting for double-select to settle"));
              return;
            }
            setTimeout(check, 50);
          };
          check();
        });

        const lastObserved = observedResponses[observedResponses.length - 1];
        const lastObservedCount =
          lastObserved && lastObserved.type === "full-data" ? lastObserved.value.props.data.count : undefined;
        const settledCount =
          settled.element && settled.element.props ? settled.element.props.data.count : undefined;

        doubleSelectSummary = {
          requestsObserved: observedResponses.length,
          responseTypes: observedResponses.map((r) => r.type),
          lastObservedCount,
          settledCount,
          settledError: settled.error,
          stateTransitions,
        };
        log(`double-select summary = ${JSON.stringify(doubleSelectSummary)}`);

        // Both requests must have actually gotten a response (nothing
        // lost), the inspector must settle cleanly (no stuck loading, no
        // error), and -- the crux of the fix -- the data it settles on
        // must be the LAST response that actually arrived on the wire for
        // this element, not an earlier one clobbering it after the fact.
        doubleSelectCheck =
          observedResponses.length === 2 &&
          !settled.error &&
          typeof settledCount === "number" &&
          settledCount === lastObservedCount;
      } finally {
        frontendBridge.removeListener("inspectedElement", observer);
        inspector.dispose();
      }
    }
  }

  await page.close();
  bridge.dispose();
  server.close();
  clearTimeout(watchdog);

  const pass =
    elementCount > 0 &&
    !!counterElement &&
    propsCheck &&
    noChangeOrFullDataOnPoll &&
    hooksCheck &&
    expandCheck &&
    doubleSelectCheck;

  console.log("\n=== PHASE 3a HARNESS RESULT ===");
  console.log(`store.numElements            : ${elementCount}`);
  console.log(`Counter element found        : ${!!counterElement}`);
  console.log(`full-data props.data.count   : ${propsCheck} (${JSON.stringify(receivedProps)})`);
  console.log(`poll -> no-change/full-data  : ${noChangeOrFullDataOnPoll}`);
  console.log(`App hooks well-formed        : ${hooksCheck} (${JSON.stringify(receivedHooksSummary)})`);
  console.log(`expand hydrated-path         : ${expandCheck} (${JSON.stringify(expandSummary)})`);
  console.log(`double-select converges      : ${doubleSelectCheck} (${JSON.stringify(doubleSelectSummary)})`);
  console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3-inspect] uncaught error:", err);
  process.exit(1);
});
