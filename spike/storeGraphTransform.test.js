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
 * Puppeteer, no network, no live backend. Uses spike/testHarness.js for the
 * esbuild-compile-and-require and JSDOM-globals boilerplate shared with the
 * other Phase 4c spike scripts.
 *
 * This file lives beside the run-phase*.js harnesses (not under
 * spike/fixtures/, which stays pure data) and is listed in package.json's
 * test:e2e. It sets/restores its own JSDOM globals in before()/after() (via
 * testHarness's teardown function) rather than at module-load time, so it
 * can safely share a mocha process with the Chrome-driven puppeteer.test.js/
 * TreeView.test.js specs regardless of list order: this suite's globals never
 * leak into another suite's run.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const { setupJsdomGlobals, requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");
const FIXTURE_PATH = path.join(__dirname, "fixtures", "sample-app-operations.json");
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
  let teardownJsdomGlobals;

  before(async () => {
    teardownJsdomGlobals = setupJsdomGlobals();
    ({ StoreConnection } = await requireCompiled(path.join(REPO_ROOT, "client", "storeBridge.ts")));
    ({ layoutTree } = await requireCompiled(path.join(REPO_ROOT, "client", "flowLayout.ts")));
    fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  });

  after(() => {
    teardownJsdomGlobals?.();
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
    // layoutTree now takes a forest (see client/flowLayout.ts's own comment on
    // why -- the static composition tree can have more than one disconnected
    // root); the live tree replayed here is always exactly one.
    const { nodes, edges } = layoutTree([tree], {
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
    const rootId = tree.id;
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
