/*
 * Phase 5f visual verification (throwaway, long-running -- kept alive for a
 * human/browser-tool to look at, same pattern as
 * run-phase5d-coverage-visual.js / run-phase2-visual.js). Serves THREE things
 * against the real kitchen-sink-app fixture:
 *
 *   /            the real webview bundle.js (live tree + CoveragePanel),
 *                wired to a real Puppeteer + DevtoolsBridge session against
 *                the fixture app, exactly like run-phase5d-coverage-visual.js
 *                but with a portal-root div and pointed at this fixture.
 *   /static      the real generateStaticAnalysisHtml() output (the
 *                unused-components / dead-props / prop-drilling /
 *                dependency-metrics panel from Tasks 5a-5c) computed by a
 *                real analyzeWorkspace() run over the fixture.
 *
 * Run `npm run compile && npm run build:webview` first. Prints both URLs and
 * keeps running until killed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
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

const DevtoolsBridge = require("../out/devtoolsBridge.js").default;
const Puppeteer = require("../out/puppeteer.js").default;
const { analyzeWorkspace, computeUnusedComponents, computeDeadProps } = require("../out/staticAnalysis.js");
const { computePropDrilling } = require("../out/propDrilling.js");
const { computeDependencyMetrics } = require("../out/dependencyMetrics.js");
const { generateStaticAnalysisHtml } = require("../out/staticAnalysisHtml.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE_ROOT = path.join(__dirname, "fixtures", "kitchen-sink-app");
const FIXTURE_SRC = path.join(FIXTURE_ROOT, "src");

const log = (...a) => console.log("[phase5f-kitchen-sink-visual]", ...a);

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
  const appHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>kitchen sink</title></head>' +
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

function serveWebviewSimulator(bridge, onStartApp) {
  const bundlePath = path.join(__dirname, "..", "out", "build", "bundle.js");
  const bundleJs = fs.readFileSync(bundlePath, "utf8");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ReactION Phase 5f kitchen-sink visual check</title>
</head>
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

  const staticHtml = (() => {
    const result = analyzeWorkspace(FIXTURE_ROOT);
    return generateStaticAnalysisHtml(FIXTURE_ROOT, {
      status: "done",
      unusedComponents: computeUnusedComponents(result),
      deadProps: computeDeadProps(result),
      propDrilling: computePropDrilling(result),
      dependencyMetrics: computeDependencyMetrics(result),
    });
  })();

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
    } else if (req.url === "/static") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(staticHtml);
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
          } else if (message && message.type === "runCoverageAnalysis") {
            log("runCoverageAnalysis message received; running analyzeWorkspace...");
            try {
              const result = analyzeWorkspace(FIXTURE_ROOT);
              const components = result.components.map((c) => ({
                displayName: c.displayName,
                filePath: c.location.filePath,
                line: c.location.line,
                column: c.location.column,
              }));
              log(`analyzeWorkspace found ${components.length} components`);
              broadcast({ type: "staticComponents", components });
            } catch (error) {
              log("analyzeWorkspace failed:", error.message);
              broadcast({ type: "staticComponentsError", message: error.message });
            }
          }
        } catch {
          /* ignore malformed messages */
        }
      });
    } else if (req.url === "/start-app") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      onStartApp().catch((err) => log("start-app failed:", err.message));
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
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function main() {
  const { url: fixtureUrl } = await serveFixtureApp();
  log(`fixture app served at ${fixtureUrl}`);

  const bridge = new DevtoolsBridge();
  const relayPort = await bridge.start();

  const page = new Puppeteer({
    system: process.platform,
    executablePath: CHROME_PATH,
    localhost: fixtureUrl,
    headless_browser: true,
    headless_embedded: true,
    reactTheme: "dark",
  });

  const { url: viewerUrl } = await serveWebviewSimulator(bridge, () => page.start(relayPort));

  log(`Open the live tree + coverage panel at: ${viewerUrl}`);
  log(`Open the static-analysis panel at:      ${viewerUrl}static`);
  log("Keeping this process alive -- Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[phase5f-kitchen-sink-visual] uncaught error:", err);
  process.exit(1);
});
