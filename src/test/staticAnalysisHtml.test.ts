import * as assert from "node:assert";
import { generateStaticAnalysisHtml } from "../staticAnalysisHtml";
import type { ComponentInfo } from "../staticAnalysis";
import type { PropDrillingChain } from "../propDrilling";
import type { DependencyMetricsEntry } from "../dependencyMetrics";

// Plain mocha (describe/it), matching staticAnalysis.test.ts's style --
// generateStaticAnalysisHtml has no vscode import (it's a pure string
// generator; see its own file comment), so this doesn't need vscode-test.
// Covers Phase 5b's "Prop Drilling" section the same way Phase 5a itself
// never directly content-tested its own Unused Components / Dead Props
// sections (only StaticAnalysisPanel.test.ts's "opens without throwing"
// vscode-test) -- a real string-contains check here is strictly more rigor
// than that baseline, per this task's own instructions.
function makeComponent(displayName: string): ComponentInfo {
  return {
    id: `/fake/${displayName}.tsx::${displayName}`,
    displayName,
    filePath: `/fake/${displayName}.tsx`,
    location: { filePath: `/fake/${displayName}.tsx`, line: 1, column: 1 },
    props: [],
  };
}

describe("generateStaticAnalysisHtml -- Prop Drilling section", () => {
  it("shows the empty state when no chains were found", () => {
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [],
      dependencyMetrics: [],
    });
    assert.ok(html.includes("Prop Drilling"));
    assert.ok(html.includes("No prop drilling detected."));
  });

  it("renders a resolved chain with its intermediate layers and final consumer", () => {
    const chain: PropDrillingChain = {
      propName: "theme",
      components: [makeComponent("Grandparent"), makeComponent("Parent")],
      terminal: { kind: "consumed", component: makeComponent("Child") },
    };
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [chain],
      dependencyMetrics: [],
    });
    assert.ok(html.includes("theme"));
    assert.ok(html.includes("Grandparent"));
    assert.ok(html.includes("Parent"));
    assert.ok(html.includes("consumed in"));
    assert.ok(html.includes("Child"));
    // The consumer itself must not be listed as one of the "drilled through"
    // layers on top of also being named as the consumer.
    assert.strictEqual(html.match(/Child/g)?.length, 1);
  });

  it("renders an 'unknown' terminal (e.g. spread props) as 'never consumed', naming where the trail goes cold", () => {
    const chain: PropDrillingChain = {
      propName: "theme",
      components: [makeComponent("Grandparent"), makeComponent("Parent")],
      terminal: { kind: "unknown", component: makeComponent("SpreadForwarder") },
    };
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [chain],
      dependencyMetrics: [],
    });
    assert.ok(html.includes("never consumed"));
    assert.ok(html.includes("SpreadForwarder"));
  });

  // Fix for the coordinator's code-review finding on commit 9a85803:
  // forwarding into a target this analysis can't resolve to a known
  // component (a third-party/library component being the common real case)
  // must render distinctly from "never consumed" -- the prop demonstrably
  // keeps flowing into something real, it's just outside this analysis'
  // visibility, which is a materially different situation for a reader to
  // act on than a genuine dead end.
  it("renders an 'unresolved-target' terminal distinctly from 'never consumed'", () => {
    const chain: PropDrillingChain = {
      propName: "theme",
      components: [makeComponent("Grandparent"), makeComponent("Parent")],
      terminal: { kind: "unresolved-target", tagName: "ExternalButton" },
    };
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [chain],
      dependencyMetrics: [],
    });
    assert.ok(html.includes("ExternalButton"));
    assert.ok(html.includes("outside this analysis"));
    assert.ok(!html.includes("never consumed"));
  });
});

// Task 5c: a direct content assertion on the generated HTML, matching this
// file's own rigor for the Prop Drilling section above -- 5a's own
// vscode-test panel test only checks "opens without throwing", which would
// pass just as well against a placeholder string, so this proves the real
// fan-in/out numbers actually reach the rendered markup.
describe("generateStaticAnalysisHtml -- Dependency Metrics section", () => {
  it("shows a 'no components' message when the workspace has no components at all", () => {
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [],
      dependencyMetrics: [],
    });
    assert.ok(html.includes("Dependency Metrics"));
    assert.ok(html.includes("No components found."));
  });

  it("renders real fan-in/out numbers for each component, not a placeholder", () => {
    const entries: DependencyMetricsEntry[] = [
      {
        component: makeComponent("HubWidget"),
        fanIn: 4,
        fanOut: 0,
        fanInOutlier: true,
        fanOutOutlier: false,
      },
      {
        component: makeComponent("ModestPage"),
        fanIn: 1,
        fanOut: 1,
        fanInOutlier: false,
        fanOutOutlier: false,
      },
    ];
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [],
      dependencyMetrics: entries,
    });

    assert.ok(html.includes("HubWidget"));
    assert.ok(html.includes("ModestPage"));

    // The numbers themselves, not just the component names, must reach the
    // markup -- and HubWidget's outlier fan-in (4) must render distinctly
    // (highlighted) from ModestPage's ordinary fan-in/out (1).
    const hubRow = html.split("\n").find((line) => line.includes("HubWidget"));
    assert.ok(hubRow, "expected a table row for HubWidget");
    assert.ok(hubRow?.includes('class="metric-outlier">4<'), "HubWidget's fan-in should render as a highlighted outlier");

    const modestRow = html.split("\n").find((line) => line.includes("ModestPage"));
    assert.ok(modestRow, "expected a table row for ModestPage");
    assert.ok(!modestRow?.includes("metric-outlier"), "ModestPage's ordinary counts should not be highlighted");
    assert.ok(modestRow?.includes(">1<"), "expected ModestPage's fan-in/out of 1 to render literally");
  });
});
