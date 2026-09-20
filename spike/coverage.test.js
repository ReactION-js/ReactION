/*
 * Phase 5d regression test (real, checked-in, CI-runnable, promoted out of
 * the spike/ throwaway-script pattern -- mirrors storeGraphTransform.test.js's
 * precedent for a committed test over an esbuild-compiled client/*.ts module).
 *
 * Exercises the REAL, esbuild-compiled client/coverage.ts's correlateCoverage()
 * and client/everRendered.ts's collectDisplayNames()/mergeDisplayNames()
 * against constructed fixtures -- no live Chrome, no real Store, no bridge.
 * mergeDisplayNames only ever calls store.roots/store.getElementByID(id), so
 * a plain fake object satisfies it -- no react-devtools-inline/JSDOM needed
 * for this file. The live-Puppeteer version of this same correlation
 * (against a REAL Store and a real analyzeWorkspace() run) lives in
 * spike/run-phase5d-coverage.js.
 */
"use strict";

const path = require("path");
const assert = require("node:assert");
const { requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");

// A fake DevtoolsStore exposing only what collectDisplayNames/mergeDisplayNames
// actually read: `roots` and `getElementByID(id)`. `elementsById` maps id ->
// { displayName, children }; an id in `roots` (or in some element's
// `children`) that's absent from `elementsById` resolves to null, exactly
// like a real Store's getElementByID for an id it doesn't recognize.
function makeFakeStore(elementsById, roots) {
  return {
    roots,
    getElementByID: (id) => elementsById[id] ?? null,
  };
}

describe("correlateCoverage (pure static-vs-ever-rendered correlation)", () => {
  let correlateCoverage;

  before(async () => {
    ({ correlateCoverage } = await requireCompiled(
      path.join(REPO_ROOT, "client", "coverage.ts"),
    ));
  });

  function component(displayName, overrides = {}) {
    return {
      displayName,
      filePath: overrides.filePath ?? `/fake/${displayName}.tsx`,
      line: overrides.line ?? 1,
      column: overrides.column ?? 1,
    };
  }

  it("flags a statically-known component whose displayName was never seen live", () => {
    const result = correlateCoverage(
      [component("Header"), component("NeverRenderedPanel")],
      new Set(["Header"]),
    );
    assert.strictEqual(result.totalComponents, 2);
    assert.deepStrictEqual(
      result.notRendered.map((c) => c.displayName),
      ["NeverRenderedPanel"],
    );
    assert.strictEqual(result.coverageFraction, 0.5);
  });

  it("flags nothing when every statically-known component was seen live", () => {
    const result = correlateCoverage(
      [component("Header"), component("Footer")],
      // A live-only name (e.g. a DOM host node or something else the static
      // analysis never discovered) present in the ever-rendered set must not
      // affect the result -- correlation only ever looks up FROM the static
      // list, never enumerates the ever-rendered set itself.
      new Set(["Header", "Footer", "SomeLiveOnlyThing"]),
    );
    assert.deepStrictEqual(result.notRendered, []);
    assert.strictEqual(result.coverageFraction, 1);
  });

  it("flags everything when nothing was ever rendered live this session", () => {
    const result = correlateCoverage([component("A"), component("B")], new Set());
    assert.strictEqual(result.notRendered.length, 2);
    assert.strictEqual(result.coverageFraction, 0);
  });

  it("reports full coverage (not NaN / divide-by-zero) for an empty static component list", () => {
    const result = correlateCoverage([], new Set(["Anything"]));
    assert.strictEqual(result.totalComponents, 0);
    assert.deepStrictEqual(result.notRendered, []);
    assert.strictEqual(result.coverageFraction, 1);
  });

  it("preserves each not-rendered component's own source location for jump-to-source", () => {
    const target = component("NeverRenderedPanel", {
      filePath: "/fixture/coverage-app/app.jsx",
      line: 17,
      column: 3,
    });
    const result = correlateCoverage([target], new Set());
    assert.deepStrictEqual(result.notRendered[0], target);
  });

  it("is deterministic and preserves the input's order in notRendered", () => {
    const components = [component("A"), component("B"), component("C")];
    const everRendered = new Set(["B"]);
    const first = correlateCoverage(components, everRendered);
    const second = correlateCoverage(components, everRendered);
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(
      first.notRendered.map((c) => c.displayName),
      ["A", "C"],
    );
  });
});

// The whole reason useEverRendered.ts exists (per its own doc comment): the
// live Store's CURRENT tree loses a component the instant it unmounts, so
// "not rendered this session" needs a record that survives that shrinkage.
// correlateCoverage's own tests above only ever exercise a pre-built Set --
// they can't prove accumulation over time at all. These tests call the real
// mergeDisplayNames/collectDisplayNames directly against fake stores to
// prove the accumulator itself behaves correctly across a shrinking tree,
// independent of React, a real Store, or Chrome.
describe("mergeDisplayNames / collectDisplayNames (cumulative ever-rendered tracking)", () => {
  let mergeDisplayNames;
  let collectDisplayNames;

  before(async () => {
    ({ mergeDisplayNames, collectDisplayNames } = await requireCompiled(
      path.join(REPO_ROOT, "client", "everRendered.ts"),
    ));
  });

  it("keeps an earlier snapshot's displayName after a later store no longer contains it (simulated unmount)", () => {
    const accumulator = new Set();

    const storeWithHeader = makeFakeStore(
      {
        1: { displayName: "Header", children: [] },
        2: { displayName: "Counter", children: [] },
      },
      [1, 2],
    );
    mergeDisplayNames(accumulator, storeWithHeader);
    assert.deepStrictEqual([...accumulator].sort(), ["Counter", "Header"]);

    // Header has since unmounted: the SAME accumulator is merged against a
    // SECOND store whose current tree no longer has it at all -- id 1 is
    // gone entirely, not just re-parented. This is exactly the scenario
    // useEverRendered.ts relies on to survive a component unmounting mid-
    // session (a closed modal, a dismissed error boundary, a route the user
    // navigated away from).
    const storeWithoutHeader = makeFakeStore(
      { 2: { displayName: "Counter", children: [] } },
      [2],
    );
    mergeDisplayNames(accumulator, storeWithoutHeader);

    assert.ok(
      accumulator.has("Header"),
      "Header must survive in the accumulator even though the current store no longer contains it",
    );
    assert.ok(accumulator.has("Counter"));
    assert.strictEqual(accumulator.size, 2, "the shrinking merge must not drop or duplicate entries");
  });

  it("contrast: collectDisplayNames alone (no accumulation) reflects only the CURRENT snapshot", () => {
    // Proves the accumulation in the test above is actually doing something
    // -- without mergeDisplayNames folding results together, a bare
    // collectDisplayNames() call on the post-unmount store has no memory of
    // Header at all.
    const storeWithoutHeader = makeFakeStore(
      { 2: { displayName: "Counter", children: [] } },
      [2],
    );
    const names = collectDisplayNames(storeWithoutHeader);
    assert.deepStrictEqual([...names], ["Counter"]);
    assert.strictEqual(names.has("Header"), false);
  });

  it("walks nested children, not just root-level elements", () => {
    const store = makeFakeStore(
      {
        1: { displayName: "App", children: [2] },
        2: { displayName: "Panel", children: [3] },
        3: { displayName: "Leaf", children: [] },
      },
      [1],
    );
    const names = collectDisplayNames(store);
    assert.deepStrictEqual([...names].sort(), ["App", "Leaf", "Panel"]);
  });

  it("skips elements with a null displayName (host/root nodes) without throwing", () => {
    const store = makeFakeStore(
      {
        1: { displayName: null, children: [2] },
        2: { displayName: "Real", children: [] },
      },
      [1],
    );
    const names = collectDisplayNames(store);
    assert.deepStrictEqual([...names], ["Real"]);
  });

  it("tolerates a child id the store no longer recognizes (getElementByID returns null)", () => {
    const store = makeFakeStore({ 1: { displayName: "App", children: [999] } }, [1]);
    assert.doesNotThrow(() => collectDisplayNames(store));
    assert.deepStrictEqual([...collectDisplayNames(store)], ["App"]);
  });

  it("accumulates across three sessions' worth of merges without ever shrinking", () => {
    const accumulator = new Set();
    mergeDisplayNames(accumulator, makeFakeStore({ 1: { displayName: "A", children: [] } }, [1]));
    mergeDisplayNames(accumulator, makeFakeStore({ 2: { displayName: "B", children: [] } }, [2]));
    mergeDisplayNames(accumulator, makeFakeStore({ 3: { displayName: "C", children: [] } }, [3]));
    assert.deepStrictEqual([...accumulator].sort(), ["A", "B", "C"]);
  });
});
