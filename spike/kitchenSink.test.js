/*
 * Phase 5f regression test (permanent, checked-in, zero Chrome/network --
 * same promotion pattern as storeGraphTransform.test.js/coverage.test.js/
 * selectByComponent.test.js): runs the REAL, already-compiled
 * out/staticAnalysis.js + out/propDrilling.js + out/dependencyMetrics.js
 * (src/staticAnalysis.ts/propDrilling.ts/dependencyMetrics.ts have no vscode
 * dependency, so no stub/JSDOM setup is needed here) against the real,
 * committed spike/fixtures/kitchen-sink-app/ fixture and asserts the static
 * half of Task 5f's holistic verification: unused-component detection, the
 * dynamic-import "no false delete" exemption, dead-prop detection (none
 * expected -- see each component file's own comment), the drilled-prop
 * chain's exact shape, and dependency-metrics sanity.
 *
 * The runtime half (live Store population, lazy/Suspense resolution, portal
 * parenting, coverage correlation, CodeLens-driven instance selection) needs
 * a real browser and lives in the throwaway
 * spike/run-phase5f-kitchen-sink.js harness instead, mirroring how
 * run-phase5d-coverage.js/run-phase5e-select-instance.js split the same way
 * from coverage.test.js/selectByComponent.test.js.
 *
 * Run `npm run compile` first.
 */
"use strict";

const path = require("path");
const assert = require("node:assert");

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "kitchen-sink-app");

describe("Phase 5f kitchen-sink fixture: static analysis pipeline", () => {
  let result;
  let analyzeWorkspace;
  let computeUnusedComponents;
  let computeDeadProps;
  let computePropDrilling;
  let computeDependencyMetrics;

  before(() => {
    ({ analyzeWorkspace, computeUnusedComponents, computeDeadProps } = require("../out/staticAnalysis.js"));
    ({ computePropDrilling } = require("../out/propDrilling.js"));
    ({ computeDependencyMetrics } = require("../out/dependencyMetrics.js"));
    result = analyzeWorkspace(FIXTURE_ROOT);
  });

  it("discovers exactly the 17 components this fixture defines", () => {
    const names = result.components.map((c) => c.displayName).sort();
    assert.deepStrictEqual(names, [
      "ActionButton",
      "App",
      "DormantFeaturePanel",
      "FancyInput",
      "Footer",
      "Header",
      "IconButton",
      "LazyChart",
      "MemoBadge",
      "PortalBadge",
      "PortalOverlay",
      "Sidebar",
      "ThemeProvider",
      "ThemedPanel",
      "Toolbar",
      "ToolbarSection",
      "UnusedGizmo",
    ]);
  });

  it("flags only UnusedGizmo as unused -- not LazyChart (dynamic-import target) or DormantFeaturePanel (statically imported, just never mounted)", () => {
    const unused = computeUnusedComponents(result).map((c) => c.displayName);
    assert.deepStrictEqual(unused, ["UnusedGizmo"]);
  });

  it("finds no dead props anywhere in the fixture", () => {
    assert.deepStrictEqual(computeDeadProps(result), []);
  });

  it("reports exactly one drilling chain: Toolbar -> ToolbarSection, consumed by ActionButton", () => {
    const chains = computePropDrilling(result);
    assert.strictEqual(chains.length, 1);
    const [chain] = chains;
    assert.strictEqual(chain.propName, "labelText");
    assert.deepStrictEqual(
      chain.components.map((c) => c.displayName),
      ["Toolbar", "ToolbarSection"],
    );
    assert.strictEqual(chain.terminal.kind, "consumed");
    assert.strictEqual(chain.terminal.component.displayName, "ActionButton");
  });

  it("computes plausible, non-crashing dependency metrics for every component, with IconButton's shared-leaf fan-in standing out", () => {
    const metrics = computeDependencyMetrics(result);
    assert.strictEqual(metrics.length, result.components.length);

    for (const entry of metrics) {
      assert.ok(Number.isInteger(entry.fanIn) && entry.fanIn >= 0, `${entry.component.displayName} fanIn`);
      assert.ok(Number.isInteger(entry.fanOut) && entry.fanOut >= 0, `${entry.component.displayName} fanOut`);
    }

    const byName = new Map(metrics.map((entry) => [entry.component.displayName, entry]));
    // IconButton is imported by Toolbar, Sidebar, and ActionButton -- higher
    // fan-in than the rest of this fixture's mostly-fan-in-1 files.
    assert.strictEqual(byName.get("IconButton").fanIn, 3);
    assert.ok(byName.get("IconButton").fanInOutlier);
    // UnusedGizmo is imported by nothing, including no dynamic import.
    assert.strictEqual(byName.get("UnusedGizmo").fanIn, 0);
  });
});
