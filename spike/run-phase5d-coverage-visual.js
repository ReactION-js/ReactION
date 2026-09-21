/*
 * Phase 5d visual verification (throwaway). Mirrors run-phase2-visual.js's
 * "real compiled pipeline + real webview bundle.js in an actual browser"
 * technique, but against the NEW spike/fixtures/coverage-app fixture instead
 * of the shared sample-app.jsx, and with real "runCoverageAnalysis" handling
 * added to the webview-message endpoint -- run-phase2-visual.js's own fixture
 * has no genuinely-never-rendered component, so it can't show a real
 * "not rendered this session" row; this one can.
 *
 * Run `npm run compile && npm run build:webview` first. Prints the verify URL
 * and keeps running until killed.
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
const { resolveSourceFileName } = require("../out/openSource.js");
const { analyzeWorkspace } = require("../out/staticAnalysis.js");

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FIXTURE_DIR = path.join(__dirname, "fixtures", "coverage-app");

const log = (...a) => console.log("[phase5d-coverage-visual]", ...a);

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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>coverage fixture</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
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

// Same webview-simulator technique as run-phase2-visual.js (real bundle.js,
// fake vscodeApi posting to /webview-message, backend traffic relayed over
// SSE) -- extended with real "runCoverageAnalysis" handling: calls the REAL
// analyzeWorkspace over the fixture's own directory and broadcasts back
// "staticComponents", exactly mirroring what src/coverageAnalysisWiring.ts
// does inside the real extension host.
function serveWebviewSimulator(bridge, onStartApp) {
  const bundlePath = path.join(__dirname, "..", "out", "build", "bundle.js");
  const bundleJs = fs.readFileSync(bundlePath, "utf8");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ReactION Phase 5d coverage visual check</title>
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
          } else if (message && message.type === "openSource") {
            log(
              `openSource message: fileName=${message.fileName} lineNumber=${message.lineNumber} columnNumber=${message.columnNumber}`,
            );
            const resolved = resolveSourceFileName(message.fileName, FIXTURE_DIR);
            log(
              resolved
                ? `openSource would open: ${resolved}:${message.lineNumber - 1}:${message.columnNumber - 1} (0-based)`
                : `openSource could not resolve "${message.fileName}" against ${FIXTURE_DIR}`,
            );
          } else if (message && message.type === "runCoverageAnalysis") {
            // Mirrors src/coverageAnalysisWiring.ts exactly: reuse 5a's
            // analyzeWorkspace, reshape to StaticComponentSummary, post back
            // "staticComponents" (or "staticComponentsError") to the SAME
            // webview -- not a separate StaticAnalysisPanel.
            log("runCoverageAnalysis message received; running analyzeWorkspace...");
            try {
              const result = analyzeWorkspace(FIXTURE_DIR);
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
  const { url: appUrl } = await serveFixtureApp();
  log(`fixture app served at ${appUrl}`);

  const bridge = new DevtoolsBridge((message) => log(`[devtools-bridge] ${message}`));
  const relayPort = await bridge.start();
  log(`devtools relay on port ${relayPort}`);

  const onStartApp = async () => {
    const page = new Puppeteer(
      {
        system: process.platform,
        executablePath: CHROME_PATH,
        localhost: appUrl,
        headless_browser: true,
        headless_embedded: true,
        reactTheme: "dark",
      },
      (message) => log(`[puppeteer] ${message}`),
    );
    await page.start(relayPort);
    log("fixture app Chrome launched and backend injected");
  };

  const { url: viewerUrl } = await serveWebviewSimulator(bridge, onStartApp);
  log(`OPEN THIS URL IN THE BROWSER TOOL: ${viewerUrl}`);
  log("(server stays up until this process is killed)");
}

main().catch((err) => {
  console.error("[phase5d-coverage-visual] error:", err);
  process.exit(1);
});
