/*
 * Phase 5e regression test (real, checked-in, CI-runnable -- mirrors
 * spike/coverage.test.js's own precedent for testing a pure Store-walking
 * function against a fake store with zero Puppeteer/JSDOM/react-devtools-
 * inline involvement).
 *
 * Exercises the REAL, esbuild-compiled client/selectByComponent.ts's
 * findMountedElementIdsByDisplayName() against constructed fixtures.
 * findMountedElementIdsByDisplayName only ever calls store.roots/
 * store.getElementByID(id)/element.displayName/element.children, so a plain
 * fake object satisfies it, same as coverage.test.js's makeFakeStore. The
 * live-Puppeteer version of this same correlation (against a REAL Store and
 * real ElementInspector) lives in spike/run-phase5e-select-instance.js.
 */
"use strict";

const path = require("path");
const assert = require("node:assert");
const { requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");

// Same shape as coverage.test.js's own makeFakeStore: `elementsById` maps
// id -> { displayName, children }; an id in `roots` (or in some element's
// `children`) that's absent from `elementsById` resolves to null, exactly
// like a real Store's getElementByID for an id it doesn't recognize.
function makeFakeStore(elementsById, roots) {
  return {
    roots,
    getElementByID: (id) => elementsById[id] ?? null,
  };
}

describe("findMountedElementIdsByDisplayName (live, currently-mounted correlation)", () => {
  let findMountedElementIdsByDisplayName;

  before(async () => {
    ({ findMountedElementIdsByDisplayName } = await requireCompiled(
      path.join(REPO_ROOT, "client", "selectByComponent.ts"),
    ));
  });

  it("returns an empty array when nothing in the tree matches", () => {
    const store = makeFakeStore(
      { 1: { displayName: "Header", children: [] } },
      [1],
    );
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "NotThere"), []);
  });

  it("returns an empty array when store.roots is empty (no tree at all)", () => {
    const store = makeFakeStore({}, []);
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Anything"), []);
  });

  it("returns the single matching id when exactly one element matches", () => {
    const store = makeFakeStore(
      {
        1: { displayName: "App", children: [2] },
        2: { displayName: "Header", children: [] },
      },
      [1],
    );
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Header"), [2]);
  });

  it("returns every matching id, in depth-first pre-order, across different depths", () => {
    // 1 (Item, root)
    // +-- 2 (Other)
    // |    +-- 4 (Item, nested two levels down)
    // +-- 3 (Item, root's second child)
    const store = makeFakeStore(
      {
        1: { displayName: "Item", children: [2, 3] },
        2: { displayName: "Other", children: [4] },
        3: { displayName: "Item", children: [] },
        4: { displayName: "Item", children: [] },
      },
      [1],
    );
    // Pre-order DFS visits 1 before descending into its children (2, then
    // 2's own child 4, THEN back up to 1's second child 3) -- proves this
    // isn't accidentally breadth-first or sorted by id/depth.
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Item"), [1, 4, 3]);
  });

  it("finds matches across multiple root trees (multi-root app), not just the first root", () => {
    const store = makeFakeStore(
      {
        1: { displayName: "Item", children: [] },
        2: { displayName: "Item", children: [] },
      },
      [1, 2],
    );
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Item"), [1, 2]);
  });

  it("matches the displayName exactly, not as a prefix or substring", () => {
    const store = makeFakeStore(
      {
        1: { displayName: "Counter2", children: [] }, // e.g. an esbuild-renamed collision
        2: { displayName: "Count", children: [] },
      },
      [1, 2],
    );
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Counter"), []);
  });

  it("skips elements with a null displayName (host/root nodes) without matching them", () => {
    const store = makeFakeStore(
      {
        1: { displayName: null, children: [2] },
        2: { displayName: "Real", children: [] },
      },
      [1],
    );
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "Real"), [2]);
  });

  it("tolerates a child id the store no longer recognizes (getElementByID returns null)", () => {
    const store = makeFakeStore({ 1: { displayName: "App", children: [999] } }, [1]);
    assert.doesNotThrow(() => findMountedElementIdsByDisplayName(store, "App"));
    assert.deepStrictEqual(findMountedElementIdsByDisplayName(store, "App"), [1]);
  });

  it("is deterministic across repeated calls against the same store", () => {
    const store = makeFakeStore(
      {
        1: { displayName: "Item", children: [2, 3] },
        2: { displayName: "Item", children: [] },
        3: { displayName: "Item", children: [] },
      },
      [1],
    );
    const first = findMountedElementIdsByDisplayName(store, "Item");
    const second = findMountedElementIdsByDisplayName(store, "Item");
    assert.deepStrictEqual(first, second);
  });
});
