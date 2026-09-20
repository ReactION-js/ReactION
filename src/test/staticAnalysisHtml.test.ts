import * as assert from "node:assert";
import { generateStaticAnalysisHtml } from "../staticAnalysisHtml";
import type { ComponentInfo } from "../staticAnalysis";
import type { PropDrillingChain } from "../propDrilling";

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
    });
    assert.ok(html.includes("Prop Drilling"));
    assert.ok(html.includes("No prop drilling detected."));
  });

  it("renders a resolved chain with its intermediate layers and final consumer", () => {
    const chain: PropDrillingChain = {
      propName: "theme",
      components: [makeComponent("Grandparent"), makeComponent("Parent"), makeComponent("Child")],
      consumedBy: makeComponent("Child"),
    };
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [chain],
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

  it("renders an unresolved chain as 'never consumed'", () => {
    const chain: PropDrillingChain = {
      propName: "theme",
      components: [makeComponent("Grandparent"), makeComponent("Parent"), makeComponent("SpreadForwarder")],
      consumedBy: undefined,
    };
    const html = generateStaticAnalysisHtml("/fake", {
      status: "done",
      unusedComponents: [],
      deadProps: [],
      propDrilling: [chain],
    });
    assert.ok(html.includes("never consumed"));
    assert.ok(html.includes("SpreadForwarder"));
  });
});
