/*
 * Verification harness for a code-review fix to client/useProfiler.ts:
 * useProfiler now has its OWN explicit `[store]`-keyed reset effect
 * (isProfiling/isProcessingData/stopConfirmationPending/profilingSnapshot),
 * instead of relying only on App.tsx's `!tree` gate fully unmounting
 * <TreeChart> across every disconnect/reconnect to discard stale state for
 * free.
 *
 * Drives the REAL pipeline end-to-end: real DevtoolsBridge + real
 * out/puppeteer.js Puppeteer wrapper injecting into a real Chrome tab
 * running spike/sample-app.jsx (same technique as
 * spike/run-phase4b-resilience.js's kill/revive-the-dev-server-on-the-same-
 * port disconnect/reconnect), PLUS the REAL webview bundle.js (built by
 * `npm run build:webview`, same technique as spike/run-phase2-visual.js) --
 * so the ACTUAL client/App.tsx + client/useProfiler.ts run inside a real
 * second Chrome tab that this script drives directly with puppeteer-core,
 * rather than a human opening a printed URL.
 *
 * Two scenarios, selected by --isolation:
 *
 *   AS-SHIPPED (default): the real, unmodified client/App.tsx, which always
 *     unmounts <TreeChart> across a disconnect (tree becomes undefined).
 *     Proves the shipped app resets profiler state after a real reconnect.
 *
 *   --isolation: temporarily patches client/App.tsx IN PLACE (via git
 *     checkout-able edits, always reverted in a `finally` before this
 *     process exits, success or failure) so <TreeChart> stays MOUNTED
 *     across the same disconnect/reconnect cycle -- using the last known
 *     tree as a placeholder instead of unmounting -- then rebuilds the
 *     webview bundle from that patched source and re-runs the identical
 *     scenario. `store` itself still swaps to a new instance on reconnect
 *     either way (App.tsx's `store` state is independent of this patch), so
 *     this isolates whether useProfiler's OWN new `[store]` effect (not
 *     App.tsx unmounting) is what resets profiler state.
 *
 *     This is a rigorous discriminator for `profilingSnapshot`/heat-badge
 *     state specifically ("NO heat badges remain" below): a fresh page load
 *     restarts react-devtools-core's fiber-id counter from 0, so a STALE,
 *     unreset snapshot from the old store would plausibly still numerically
 *     match the deterministic sample app's post-reconnect node ids and show
 *     non-zero badges if the new effect weren't resetting it -- confirmed by
 *     reading node_modules/react-devtools-core/dist/backend.js's uidCounter.
 *     It is NOT a rigorous discriminator for `isProfiling`/
 *     `isProcessingData`/`stopConfirmationPending`: a freshly-constructed
 *     ProfilerStore already defaults isProfilingBasedOnUserInput/
 *     isProcessingData to false regardless of the new effect (confirmed
 *     against node_modules/react-devtools-inline/dist/frontend.js), and
 *     stopConfirmationPending is already false by the time this harness's
 *     disconnect fires (it waits for processedAfterStop first) -- so the
 *     "isProfiling reset"/"not disabled" checks below would read the same
 *     PASS/FAIL either way and are kept for completeness/regression
 *     coverage, not as proof the new effect specifically caused them.
 *
 * Run `npm run compile && npm run build:webview` first. Chrome required
 * (CHROME_PATH env var, defaults to the same path every other
 * spike/run-phase*.js harness uses).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const { stubVscodeModule } = require("./testHarness");

stubVscodeModule();

const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const RealPuppeteer = require("../out/puppeteer.js").default;

const REPO_ROOT = path.join(__dirname, "..");
const APP_TSX_PATH = path.join(REPO_ROOT, "client", "App.tsx");
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ISOLATION = process.argv.includes("--isolation");
const log = (...a) => console.log(`[verify-profiler-reset${ISOLATION ? ":isolation" : ""}]`, ...a);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(predicate, timeoutMs, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await delay(intervalMs);
  }
  return await predicate();
}

// --- sample app (the "backend" page Chrome instance A inspects) -----------

function buildSampleAppJs() {
  const built = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "sample-app.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  return built.outputFiles[0].text;
}

// Killable/revivable on a FIXED port, mirroring run-phase4b-resilience.js's
// serveSampleAppOn/killServer exactly -- the port must survive a kill+revive
// cycle so the extension's reconnect targets the SAME url.
function serveSampleAppOn(port, appJs) {
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>verify-profiler-reset</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

// --- webview simulator (serves the REAL out/build/bundle.js) --------------

// Mirrors run-phase2-visual.js's serveWebviewSimulator: relays DevtoolsBridge
// callbacks into window.postMessage via SSE, and relays the webview's own
// postMessage("wall", ...) traffic back into bridge.sendToPage -- WITHOUT
// opening a second WebSocket to the relay (the relay only expects the page
// backend). Keeps run-phase2-visual.js's /start-app ready-signal: bridge's
// onBackendConnected/onBackendDisconnected/onPageMessage callbacks only fire
// for events that happen AFTER they're registered (there's no replay for a
// late subscriber), so the real sample-app Puppeteer must not be started
// until the viewer page's EventSource is confirmed open server-side --
// otherwise the very first "backend-connected" is silently missed.
function serveWebviewSimulator(bridge, onReady) {
  const bundlePath = path.join(REPO_ROOT, "out", "build", "bundle.js");
  const bundleJs = fs.readFileSync(bundlePath, "utf8");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>verify-profiler-reset webview</title></head>
<body>
  <div id="root"></div>
  <script>
    window.__REACTION_THEME__ = "dark";
    window.acquireVsCodeApi = function () {
      return {
        postMessage: function (message) {
          fetch("/webview-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
          });
        },
        getState: function () { return undefined; },
        setState: function () {},
      };
    };
  </script>
  <script src="/bundle.js"></script>
  <script>
    var es = new EventSource("/events");
    es.onmessage = function (event) {
      window.postMessage(JSON.parse(event.data), "*");
    };
    es.onopen = function () {
      fetch("/start-app");
    };
  </script>
</body>
</html>`;

  const sseClients = new Set();
  const broadcast = (obj) => {
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    for (const res of sseClients) {
      res.write(line);
    }
  };
  bridge.onBackendConnected(() => broadcast({ type: "backend-connected" }));
  bridge.onBackendDisconnected(() => broadcast({ type: "backend-disconnected" }));
  bridge.onPageMessage((message) => broadcast({ type: "wall", message }));

  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(bundleJs);
    } else if (req.url === "/webview-message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        try {
          const message = JSON.parse(body);
          if (message && message.type === "wall" && message.message) {
            bridge.sendToPage(message.message);
          }
        } catch {
          /* ignore malformed messages */
        }
      });
    } else if (req.url === "/start-app") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      onReady();
    } else if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

// --- webview page helpers (puppeteer-core driving the REAL React app) -----

async function hasTreeChart(page) {
  return page.evaluate(() => !!document.querySelector(".treeChart"));
}

async function nodeCount(page) {
  return page.evaluate(() => document.querySelectorAll(".reaction-flow-node").length);
}

async function heatBadgeCount(page) {
  return page.evaluate(() => document.querySelectorAll(".reaction-flow-node__heat-badge").length);
}

async function profilerButtonState(page) {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Start Profiling" || b.textContent.trim() === "Stop Profiling",
    );
    return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
  });
}

async function clickButtonByText(page, text) {
  return page.evaluate((text) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === text,
    );
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, text);
}

async function connectingMessageVisible(page) {
  return page.evaluate(() => (document.body.textContent || "").includes("Connecting to the React app"));
}

// --- App.tsx isolation patch (--isolation only; always reverted) ----------

// Keeps <TreeChart> mounted across a disconnect/reconnect (using the last
// known tree as a placeholder while `tree` is momentarily undefined) instead
// of App.tsx's real `!tree` unmount gate, and adds a hidden, always-rendered
// marker div reporting the live `connected` boolean -- needed because the
// natural "Connecting to the React app…" signal this script otherwise polls
// for is itself part of the unmount branch this patch deliberately bypasses.
function patchAppTsxForIsolation() {
  const original = fs.readFileSync(APP_TSX_PATH, "utf8");
  let patched = original;

  const treeStateDecl = "const [tree, setTree] = useState<ComponentNode | undefined>(undefined);";
  if (!patched.includes(treeStateDecl)) {
    throw new Error("isolation patch anchor not found: tree useState declaration");
  }
  patched = patched.replace(
    treeStateDecl,
    `${treeStateDecl}\n` +
      `  // TEMPORARY test-only patch (verify-profiler-reset-on-reconnect.js --isolation) --\n` +
      `  // never committed. Keeps TreeChart mounted across a disconnect instead of\n` +
      `  // unmounting it, to prove useProfiler's reset doesn't depend on that unmount.\n` +
      `  const lastTreeRef = useRef<ComponentNode | undefined>(undefined);\n` +
      `  useEffect(() => {\n` +
      `    if (tree) {\n` +
      `      lastTreeRef.current = tree;\n` +
      `    }\n` +
      `  }, [tree]);\n` +
      `  const displayTree = tree ?? lastTreeRef.current;`,
  );

  const ifNoTree = "if (!tree) {";
  if (!patched.includes(ifNoTree)) {
    throw new Error("isolation patch anchor not found: !tree gate");
  }
  patched = patched.replace(ifNoTree, "if (!displayTree) {");

  const treeChartDataProp = "<TreeChart\n        data={tree}";
  if (!patched.includes(treeChartDataProp)) {
    throw new Error("isolation patch anchor not found: TreeChart data prop");
  }
  patched = patched.replace(treeChartDataProp, "<TreeChart\n        data={displayTree}");

  const noticeConst = "const notice = selectionNotice ? <div style={NOTICE_STYLE}>{selectionNotice}</div> : null;";
  if (!patched.includes(noticeConst)) {
    throw new Error("isolation patch anchor not found: notice const");
  }
  patched = patched.replace(
    noticeConst,
    `${noticeConst}\n` +
      `  const testConnectedMarker = (\n` +
      `    <div data-reaction-test-connected={String(connected)} style={{ display: "none" }} />\n` +
      `  );`,
  );
  // Both JSX branches below start with `{notice}` -- inject the marker right
  // after each so it's always in the DOM regardless of which branch renders.
  patched = patched.split("{notice}").join("{notice}\n        {testConnectedMarker}");

  if (patched === original) {
    throw new Error("isolation patch made no changes -- anchors are stale, refusing to proceed");
  }
  fs.writeFileSync(APP_TSX_PATH, patched);
}

function revertAppTsx() {
  execFileSync("git", ["checkout", "--", "client/App.tsx"], { cwd: REPO_ROOT, stdio: "inherit" });
}

function buildWebview() {
  execFileSync("npx", ["webpack", "--mode", "production"], { cwd: REPO_ROOT, stdio: "inherit" });
}

async function connectedMarkerValue(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-reaction-test-connected]");
    return el ? el.getAttribute("data-reaction-test-connected") : null;
  });
}

// --- main scenario ----------------------------------------------------------

async function runScenario() {
  const appJs = buildSampleAppJs();
  let { server, sockets } = await serveSampleAppOn(0, appJs);
  const port = server.address().port;
  const sampleAppUrl = `http://127.0.0.1:${port}/`;
  log(`sample app served at ${sampleAppUrl}`);

  const bridge = new DevtoolsBridge((m) => log(`[bridge] ${m}`));
  const relayPort = await bridge.start();

  // The webview viewer must be up and its EventSource confirmed OPEN before
  // the real sample-app Puppeteer starts (see serveWebviewSimulator's doc
  // comment) -- otherwise the first "backend-connected" fires before
  // anything is listening for it and is silently lost.
  let signalReady;
  const viewerReady = new Promise((resolve) => {
    signalReady = resolve;
  });
  let readyFired = false;
  const { server: webviewServer, url: webviewUrl } = await serveWebviewSimulator(bridge, () => {
    if (!readyFired) {
      readyFired = true;
      signalReady();
    }
  });
  log(`webview simulator served at ${webviewUrl}`);

  const viewerBrowser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const viewerPage = await viewerBrowser.newPage();
  const pageErrors = [];
  viewerPage.on("pageerror", (err) => pageErrors.push(String(err)));
  await viewerPage.goto(webviewUrl, { waitUntil: "domcontentloaded" });

  const viewerBecameReady = await Promise.race([
    viewerReady.then(() => true),
    delay(10_000).then(() => false),
  ]);
  log(`webview viewer EventSource confirmed open: ${viewerBecameReady}`);
  if (!viewerBecameReady) {
    throw new Error("webview viewer never signaled /start-app -- EventSource never opened");
  }

  const realPuppeteer = new RealPuppeteer(
    {
      system: process.platform,
      executablePath: CHROME_PATH,
      localhost: sampleAppUrl,
      headless_browser: true,
      headless_embedded: true,
      reactTheme: "dark",
    },
    (m) => log(`[real-puppeteer] ${m}`),
  );
  await realPuppeteer.start(relayPort);
  log("sample app Chrome launched and backend injected");

  const results = {};

  try {
    results.treeAppeared = await waitUntil(() => hasTreeChart(viewerPage), 20_000);
    results.nodesPopulated = await waitUntil(async () => (await nodeCount(viewerPage)) > 0, 10_000);
    log(`initial tree: treeChart=${results.treeAppeared} nodes=${await nodeCount(viewerPage)}`);

    const startClicked = await clickButtonByText(viewerPage, "Start Profiling");
    results.startClicked = startClicked;
    log(`clicked Start Profiling: ${startClicked}`);

    // Sample app's Counter-driving interval fires every 800ms (see
    // sample-app.jsx) -- long enough for several commits, matching
    // run-phase3-profiler.js's own 2600ms wait.
    await delay(2800);

    const stopClicked = await clickButtonByText(viewerPage, "Stop Profiling");
    results.stopClicked = stopClicked;
    log(`clicked Stop Profiling: ${stopClicked}`);

    results.processedAfterStop = await waitUntil(async () => {
      const state = await profilerButtonState(viewerPage);
      return !!state && state.text === "Start Profiling" && !state.disabled;
    }, 15_000);

    const preReconnectHeatBadges = await heatBadgeCount(viewerPage);
    results.preReconnectHeatBadges = preReconnectHeatBadges;
    log(`heat badges after a real profiling run (pre-reconnect): ${preReconnectHeatBadges}`);

    // --- force a real disconnect -----------------------------------------
    log("killing the sample app's dev server");
    await killServer({ server, sockets });

    // Killing the HTTP server does NOT by itself close the backend's
    // already-established WebSocket to the relay (the loaded Chrome page
    // keeps running independently of its origin server), so nothing detects
    // the outage yet. Mirrors run-phase4b-resilience.js's Part A: one manual
    // reconnect() attempt while still down (this is expected to fail/return
    // false) stands in for whatever externally triggers a reload against a
    // dead dev server (a real HMR client noticing ITS socket drop) -- it's
    // this navigation attempt tearing down the old page context that
    // actually causes the backend-disconnected event to fire promptly.
    const reconnectDuringOutage = await realPuppeteer.reconnect(sampleAppUrl);
    log(`reconnect-while-down attempt returned ${reconnectDuringOutage} (expected false)`);

    if (ISOLATION) {
      results.disconnectObserved = await waitUntil(async () => (await connectedMarkerValue(viewerPage)) === "false", 10_000);
    } else {
      results.disconnectObserved = await waitUntil(() => connectingMessageVisible(viewerPage), 10_000);
    }
    log(`disconnect observed by the webview: ${results.disconnectObserved}`);

    if (ISOLATION) {
      // The whole point of this run: TreeChart must NOT have unmounted.
      results.treeChartStayedMounted = await hasTreeChart(viewerPage);
      log(`TreeChart still mounted immediately after disconnect (isolation run): ${results.treeChartStayedMounted}`);
    }

    // --- revive on the SAME port and force a real reconnect ---------------
    log("reviving the sample app's dev server on the same port");
    const revived = await serveSampleAppOn(port, appJs);
    server = revived.server;
    sockets = revived.sockets;

    const reconnected = await realPuppeteer.reconnect(sampleAppUrl);
    log(`real Puppeteer reconnect() to ${sampleAppUrl} returned ${reconnected}`);

    if (ISOLATION) {
      results.reconnectObserved = await waitUntil(async () => (await connectedMarkerValue(viewerPage)) === "true", 20_000);
    } else {
      results.reconnectObserved = await waitUntil(() => hasTreeChart(viewerPage), 20_000);
    }
    results.nodesRepopulated = await waitUntil(async () => (await nodeCount(viewerPage)) > 0, 15_000);
    log(`reconnect observed: ${results.reconnectObserved}; nodes repopulated: ${results.nodesRepopulated}`);

    // Give the fresh profiling-run's absence of data a moment to settle
    // (mirrors the 500ms settle beat run-phase5d-coverage.js uses).
    await delay(500);

    const postButtonState = await profilerButtonState(viewerPage);
    results.postButtonState = postButtonState;
    results.postHeatBadges = await heatBadgeCount(viewerPage);
    log(`post-reconnect profiler button state: ${JSON.stringify(postButtonState)}`);
    log(`post-reconnect heat badges: ${results.postHeatBadges}`);

    results.pageErrors = pageErrors;
  } finally {
    await viewerBrowser.close();
    await realPuppeteer.close();
    bridge.dispose();
    webviewServer.close();
    await killServer({ server, sockets });
  }

  return results;
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error("[verify-profiler-reset] FAIL: overall timeout");
    process.exit(1);
  }, 120_000);

  let isolationPatchApplied = false;
  try {
    if (ISOLATION) {
      log("applying TEMPORARY isolation patch to client/App.tsx (will be reverted before exit)");
      patchAppTsxForIsolation();
      isolationPatchApplied = true;
      log("rebuilding webview bundle from the patched source");
      buildWebview();
    }

    const r = await runScenario();

    const checks = [
      ["tree appeared initially", r.treeAppeared],
      ["nodes populated initially", r.nodesPopulated],
      ["Start Profiling button was clicked", r.startClicked],
      ["Stop Profiling button was clicked", r.stopClicked],
      ["profiling data finished processing", r.processedAfterStop],
      ["a real profiling run produced at least one heat badge", r.preReconnectHeatBadges > 0],
      ["the webview observed the disconnect", r.disconnectObserved],
      ...(ISOLATION ? [["TreeChart stayed mounted across the disconnect (isolation)", r.treeChartStayedMounted]] : []),
      ["the webview observed the reconnect", r.reconnectObserved],
      ["the tree repopulated after reconnect", r.nodesRepopulated],
      [
        'profiler button reads "Start Profiling" (isProfiling reset) after reconnect',
        !!r.postButtonState && r.postButtonState.text === "Start Profiling",
      ],
      [
        "profiler button is not disabled after reconnect",
        !!r.postButtonState && r.postButtonState.disabled === false,
      ],
      [
        "NO heat badges remain after reconnect (profilingSnapshot/renderCounts reset)",
        r.postHeatBadges === 0,
      ],
      ["no uncaught page errors in the webview", Array.isArray(r.pageErrors) && r.pageErrors.length === 0],
    ];

    clearTimeout(watchdog);

    console.log(`\n=== PROFILER RESET-ON-RECONNECT HARNESS RESULT (${ISOLATION ? "isolation" : "as-shipped"}) ===`);
    let pass = true;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
      if (!ok) pass = false;
    }
    if (r.pageErrors && r.pageErrors.length > 0) {
      console.log("page errors:", r.pageErrors);
    }
    console.log(pass ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
    process.exitCode = pass ? 0 : 1;
  } catch (err) {
    clearTimeout(watchdog);
    console.error("[verify-profiler-reset] uncaught error:", err);
    process.exitCode = 1;
  } finally {
    if (isolationPatchApplied) {
      log("reverting the TEMPORARY isolation patch to client/App.tsx");
      revertAppTsx();
      log("rebuilding webview bundle from the reverted (real) source");
      try {
        buildWebview();
      } catch (err) {
        console.error("[verify-profiler-reset] FAILED to rebuild webview after reverting App.tsx:", err);
        process.exitCode = 1;
      }
    }
  }
}

main();
