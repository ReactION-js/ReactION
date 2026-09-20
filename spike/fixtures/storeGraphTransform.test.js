/*
 * Phase 4c regression test (real, checked-in, CI-runnable -- promoted out of
 * the spike/ throwaway-script pattern per the Phase 3 review's "worth
 * promoting the strongest fixture harnesses into a real test suite" note).
 *
 * Replays the recorded wall-message fixture (spike/fixtures/
 * sample-app-operations.json, produced by spike/capture-operations-fixture.js
 * against the unmodified spike/sample-app.jsx) through the REAL, esbuild-
 * compiled client/storeBridge.ts (Store -> ComponentNode) and
 * client/flowLayout.ts (ComponentNode -> React Flow nodes/edges) -- no
 * Puppeteer, no network, no live backend. Uses the same esbuild-compile-and-
 * require technique as spike/run-phase3-renderstats.js and
 * run-phase3-contextmap.js, and the same JSDOM-globals technique as
 * spike/run-phase1.js.
 *
 * Environment setup (JSDOM globals + compiling+requiring the client modules,
 * which transitively requires react-devtools-inline/frontend) is deferred
 * into `before()` rather than run at module-load time, and this file is
 * listed LAST in package.json's test:e2e mocha invocation: mocha requires
 * every listed file up front before running any test, but only *runs* each
 * file's suite in list order, so puppeteer.test.js/TreeView.test.js's real
 * Chrome sessions fully complete before this file ever touches global.window/
 * navigator/document -- avoiding any chance of puppeteer-core's own
 * WebSocket/CDP transport picking up a JSDOM global mid-flight.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const Module = require("node:module");

const REPO_ROOT = path.join(__dirname, "..", "..");
const FIXTURE_PATH = path.join(__dirname, "sample-app-operations.json");
const noop = () => {};

function countNodes(node) {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0);
}

function collectByType(node, out) {
  const type = node.attributes?.[0];
  if (type) {
    (out[type] ??= []).push(node.name);
  }
  (node.children ?? []).forEach((child) => collectByType(child, out));
  return out;
}

describe("Store -> graph transform (recorded-operations fixture replay)", () => {
  let fixture;
  let StoreConnection;
  let layoutTree;

  before(async () => {
    const { JSDOM } = require("jsdom");
    const esbuild = require("esbuild");

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

    const requireCompiled = async (tsRelativePath) => {
      const absPath = path.join(REPO_ROOT, tsRelativePath);
      const built = await esbuild.build({
        entryPoints: [absPath],
        bundle: false,
        write: false,
        format: "cjs",
        platform: "node",
        target: "node18",
      });
      const code = built.outputFiles[0].text;
      const compiledPath = absPath.replace(/\.ts$/, ".compiled.js");
      const mod = new Module(compiledPath, null);
      mod.filename = compiledPath;
      mod.paths = Module._nodeModulePaths(path.dirname(absPath));
      mod._compile(code, compiledPath);
      return mod.exports;
    };

    ({ StoreConnection } = await requireCompiled("client/storeBridge.ts"));
    ({ layoutTree } = await requireCompiled("client/flowLayout.ts"));
    fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  });

  // Replays a captured wall-message sequence through the REAL StoreConnection
  // exactly as the extension host delivers them -- {type: "backend-connected"}
  // then one {type: "wall", message} per captured message, matching
  // client/storeBridge.ts's handleHostMessage switch -- then runs the
  // resulting ComponentNode tree through the REAL layoutTree.
  function runFullPipeline() {
    let tree;
    const conn = new StoreConnection({ postMessage: noop }, (t) => {
      tree = t;
    });
    conn.handleHostMessage({ type: "backend-connected" });
    for (const message of fixture.messages) {
      conn.handleHostMessage({ type: "wall", message });
    }
    const numElements = conn.getStore().numElements;
    conn.dispose();

    assert.ok(tree, "replay produced no ComponentNode tree at all");
    const { nodes, edges } = layoutTree(tree, {
      collapsedIds: new Set(),
      searchTerm: "",
      direction: "TB",
      selectedId: undefined,
      onToggleCollapse: noop,
    });
    return { tree, numElements, nodes, edges };
  }

  it("the fixture recorded real backend traffic, not a trivially-empty capture", () => {
    assert.ok(fixture.messages.length > 0, "fixture has no recorded messages");
    assert.ok(
      fixture.messages.some((m) => m.event === "operations"),
      'fixture has no "operations" message -- capture is not exercising a real tree mutation',
    );
    assert.strictEqual(fixture.capturedFrom, "spike/sample-app.jsx");
  });

  it("replays into a Store whose numElements matches what was captured", () => {
    const { numElements } = runFullPipeline();
    assert.strictEqual(numElements, fixture.expectedNumElements);
    assert.strictEqual(numElements, 9);
  });

  it("produces a ComponentNode tree with the expected node count", () => {
    const { tree } = runFullPipeline();
    // +1 for the synthetic root wrapper buildTree/buildNode always emit for
    // the store's own root element (store.numElements does not count it --
    // confirmed by comparing this count against the assertion above).
    assert.strictEqual(countNodes(tree), fixture.expectedNumElements + 1);
  });

  it("every expected component type appears with the correct type label", () => {
    const { tree } = runFullPipeline();
    const byType = collectByType(tree, {});
    assert.ok(byType.Function?.includes("App"), "no Function-typed App");
    assert.ok(byType.Function?.includes("Header"), "no Function-typed Header");
    assert.ok(byType.Class?.includes("Panel"), "no Class-typed Panel");
    assert.ok(byType.Memo?.some((name) => name.startsWith("Counter")), "no Memo-typed Counter");
    assert.ok(
      byType.ForwardRef?.some((name) => name.startsWith("FancyButton")),
      "no ForwardRef-typed FancyButton",
    );
    assert.ok(
      byType.Context?.some((name) => name.includes("Provider")),
      "no Context-typed provider",
    );
    // Three <Item> list children (map over ["alpha", "beta", "gamma"]).
    assert.strictEqual(byType.Function?.filter((name) => name === "Item").length, 3);
  });

  it("has no orphan edges: every non-root graph node has exactly one incoming edge", () => {
    const { tree, nodes, edges } = runFullPipeline();
    const rootId = tree.id ?? tree.name;
    const incoming = new Map();
    for (const edge of edges) {
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    }
    for (const node of nodes) {
      const expected = node.id === rootId ? 0 : 1;
      assert.strictEqual(
        incoming.get(node.id) ?? 0,
        expected,
        `node ${node.id} (${node.data.label}) has ${incoming.get(node.id) ?? 0} incoming edges, expected ${expected}`,
      );
    }
    assert.strictEqual(edges.length, nodes.length - 1, "a tree of N nodes must have N-1 edges");
  });

  it("is deterministic: replaying the same fixture twice yields identical graphs", () => {
    const first = runFullPipeline();
    const second = runFullPipeline();
    assert.deepStrictEqual(first.tree, second.tree);
    assert.deepStrictEqual(first.nodes, second.nodes);
    assert.deepStrictEqual(first.edges, second.edges);
    assert.strictEqual(first.numElements, second.numElements);
  });
});
