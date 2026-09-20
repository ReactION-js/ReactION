/*
 * Phase 5d regression test (real, checked-in, CI-runnable, promoted out of
 * the spike/ throwaway-script pattern -- mirrors storeGraphTransform.test.js's
 * precedent for a committed test over an esbuild-compiled client/*.ts module).
 *
 * Exercises the REAL, esbuild-compiled client/coverage.ts's correlateCoverage()
 * against constructed fixtures -- no live Chrome, no Store, no bridge. The
 * live-Puppeteer version of this same correlation (against a real Store and a
 * real analyzeWorkspace() run) lives in spike/run-phase5d-coverage.js.
 */
"use strict";

const path = require("path");
const assert = require("node:assert");
const { requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");

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
