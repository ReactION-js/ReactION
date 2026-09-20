/*
 * Phase 2 visual verification (throwaway). Drives the REAL compiled pipeline
 * end-to-end and serves a page that loads the REAL webview bundle.js, so the
 * browser tool can screenshot the actual React Flow graph.
 *
 *   sample app (Chrome via puppeteer, real backend injection)
 *     -> real out/devtoolsBridge.js relay
 *     -> "webview simulator" page (served here) running out/build/bundle.js,
 *        which builds the Store and renders the React Flow graph exactly as
 *        it would inside VS Code.
 *
 * Run `npm run compile && npm run build:webview` first. Prints the verify URL
 * and keeps running until killed.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");

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

const CHROME_PATH =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const log = (...a) => console.log("[phase2-visual]", ...a);

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
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>sample</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
  // Task 4a manual check: a page with no React at all, so the backend still
  // connects (the injected hook runs on every navigation regardless of what
  // the page does) but the Store never gets any elements -- exercises the
  // "stays in the empty state" half of the empty-state timeout check.
  const blankHtml =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>no react here</title></head><body><p>plain HTML, no React mounts on this page</p></body></html>';
  const server = http.createServer((req, res) => {
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(appJs);
    } else if (req.url === "/blank.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(blankHtml);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(appHtml);
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: `${origin}/`, blankUrl: `${origin}/blank.html` };
}

// Serves the real webview bundle plus a tiny host stand-in. Mirrors
// bridgeWiring.ts: relays DevtoolsBridge callbacks into window.postMessage via
// Server-Sent Events, WITHOUT opening a second WebSocket to the relay (the
// relay only expects one connection — the page backend — and would otherwise
// treat this "webview" as a second backend and reset the Store).
function serveWebviewSimulator(bridge, onStartApp) {
  const bundlePath = path.join(__dirname, "..", "out", "build", "bundle.js");
  const bundleJs = fs.readFileSync(bundlePath, "utf8");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ReactION Phase 2 visual check</title>
</head>
<body>
  <div id="root"></div>
  <script>
    window.__REACTION_THEME__ = "dark";
    ${
      process.env.REACTION_TEST_EMPTY_TIMEOUT_MS
        ? `window.__REACTION_EMPTY_STATE_TIMEOUT_MS__ = ${JSON.stringify(Number(process.env.REACTION_TEST_EMPTY_TIMEOUT_MS))};`
        : ""
    }
    window.acquireVsCodeApi = function () {
      return {
        // Phase 2 only ever needed the backend -> webview direction (the
        // Store never sends anything to build the tree). Phase 3a's
        // inspectElement/inspectedElement protocol is the first thing that
        // needs webview -> host traffic too, so this now forwards to the
        // /webview-message endpoint below instead of being a no-op, mirroring
        // what src/bridgeWiring.ts's real onDidReceiveMessage handler does
        // (webview message -> bridge.sendToPage).
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
  bridge.onBackendDisconnected(() =>
    broadcast({ type: "backend-disconnected" }),
  );
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
            // Task 3b's "Open in editor" button posts this directly (NOT
            // through the wall/bridge -- it's host-only, see client/App.tsx).
            // There's no real VS Code window here to actually open a file
            // in, so just log what would happen, mirroring what
            // src/sourceOpeningWiring.ts's wireSourceOpening would do.
            log(
              `openSource message: fileName=${message.fileName} lineNumber=${message.lineNumber} columnNumber=${message.columnNumber}`,
            );
            const resolved = resolveSourceFileName(message.fileName, path.join(__dirname));
            log(
              resolved
                ? `openSource would open: ${resolved}:${message.lineNumber - 1}:${message.columnNumber - 1} (0-based)`
                : `openSource could not resolve "${message.fileName}" against ${__dirname} (expected for a bundle URL -- would show an information message instead)`,
            );
          } else if (message && message.type === "noReactDetected") {
            // Task 4a's empty-state timeout, relayed host-only (NOT through
            // the wall/bridge) -- mirrors src/diagnosticsWiring.ts.
            log(`noReactDetected message: elapsedMs=${message.elapsedMs}`);
          }
        } catch {
          /* ignore malformed messages */
        }
      });
    } else if (req.url === "/start-app") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      // Idempotent guard removed intentionally: each page load gets its own
      // fresh Chrome + operations burst, timed to its own EventSource.
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
  const { url: appUrl, blankUrl } = await serveSampleApp();
  // REACTION_TEST_NO_REACT=1: point Puppeteer at a page with no React at all,
  // for the "empty state never clears" half of the Task 4a manual check.
  const targetUrl = process.env.REACTION_TEST_NO_REACT ? blankUrl : appUrl;
  log(`sample app served at ${appUrl} (blank page at ${blankUrl})`);
  log(`Puppeteer will navigate to: ${targetUrl}`);

  const bridge = new DevtoolsBridge((message) => log(`[devtools-bridge] ${message}`));
  const relayPort = await bridge.start();
  log(`devtools relay on port ${relayPort}`);

  const onStartApp = async () => {
    const page = new Puppeteer(
      {
        system: process.platform,
        executablePath: CHROME_PATH,
        localhost: targetUrl,
        headless_browser: true,
        headless_embedded: true,
        reactTheme: "dark",
      },
      (message) => log(`[puppeteer] ${message}`),
    );
    await page.start(relayPort);
    log("sample app Chrome launched and backend injected");
  };

  const { url: viewerUrl } = await serveWebviewSimulator(bridge, onStartApp);
  log(`OPEN THIS URL IN THE BROWSER TOOL: ${viewerUrl}`);
  log("(server stays up until this process is killed)");
}

main().catch((err) => {
  console.error("[phase2-visual] error:", err);
  process.exit(1);
});
