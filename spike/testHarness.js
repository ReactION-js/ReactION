/*
 * Shared boilerplate for spike/run-phase*.js-style harnesses and the
 * permanent spike/storeGraphTransform.test.js regression test: the vscode-
 * module stub, JSDOM globals so react-devtools-inline/frontend (and any
 * client/*.ts that imports it) load under plain Node, and an esbuild-
 * compile-and-require helper for exercising a real client/*.ts module
 * without going through webpack/tsc. Extracted after this exact preamble had
 * been copy-pasted across three Phase 4c files; new harnesses should use
 * this instead of re-copying it a fourth time.
 */
"use strict";

const path = require("path");
const Module = require("module");

const VSCODE_STUB_PATH = path.join(__dirname, "vscode-stub.js");
let vscodeStubbed = false;

// Redirects `require("vscode")` to vscode-stub.js so compiled host code
// (out/devtoolsBridge.js, out/puppeteer.js -- config.ts imports vscode for
// user messages) can run outside the extension host. Idempotent: harmless to
// call from multiple entry points in the same process.
function stubVscodeModule() {
  if (vscodeStubbed) {
    return;
  }
  vscodeStubbed = true;
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === "vscode") {
      return VSCODE_STUB_PATH;
    }
    return originalResolveFilename.call(this, request, ...rest);
  };
}

// Installs JSDOM globals (window/document/navigator/etc.) so
// react-devtools-inline/frontend loads under plain Node. Returns a teardown
// function that restores whatever these globals were before the call --
// callers sharing a process with other suites (storeGraphTransform.test.js
// runs alongside Chrome-driven mocha specs in the same test:e2e invocation)
// MUST call it when done, so a stray JSDOM window/navigator can't survive
// into unrelated code that branches on typeof window/navigator (e.g.
// puppeteer-core's own CDP transport).
function setupJsdomGlobals() {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  const keys = [
    "window",
    "self",
    "document",
    "navigator",
    "location",
    "HTMLElement",
    "Element",
    "Node",
    "localStorage",
  ];
  const previous = {};
  for (const key of keys) {
    previous[key] = {
      had: Object.prototype.hasOwnProperty.call(global, key),
      value: global[key],
    };
  }

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

  return function teardownJsdomGlobals() {
    for (const key of keys) {
      const record = previous[key];
      if (!record.had) {
        delete global[key];
        continue;
      }
      if (key === "navigator") {
        try {
          Object.defineProperty(global, "navigator", {
            value: record.value,
            configurable: true,
          });
        } catch {
          /* ignore */
        }
        continue;
      }
      global[key] = record.value;
    }
    dom.window.close();
  };
}

// esbuild-compiles a real .ts module (bundle: false) to requirable CJS and
// requires it, same technique as spike/run-phase3-renderstats.js and
// run-phase3-contextmap.js -- lets a plain-Node harness/test exercise the
// REAL shipped TypeScript module's exports directly, without bundling.
async function requireCompiled(tsAbsPath) {
  const esbuild = require("esbuild");
  const built = await esbuild.build({
    entryPoints: [tsAbsPath],
    bundle: false,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node18",
  });
  const code = built.outputFiles[0].text;
  const compiledPath = tsAbsPath.replace(/\.ts$/, ".compiled.js");
  const mod = new Module(compiledPath, null);
  mod.filename = compiledPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsAbsPath));
  mod._compile(code, compiledPath);
  return mod.exports;
}

module.exports = { stubVscodeModule, setupJsdomGlobals, requireCompiled };
