import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { analyzeWorkspace, type StaticAnalysisResult } from "../staticAnalysis";
import { buildStaticComponentTree, type StaticTreeNode } from "../staticComponentTree";

// Plain mocha (describe/it), run via `npm run test:e2e` against compiled
// output -- same convention as staticAnalysis.test.ts's own glob-fallback
// describe blocks (a real temp directory, no tsconfig.json needed).
//
// Exercises buildStaticComponentTree's root split: a root-level component
// (nothing renders it via JSX) that's also genuinely unused (nothing
// imports it either) becomes its own separate, disconnected top-level forest
// entry instead of being nested under the synthetic "Roots" wrapper
// alongside the components real entry points actually reach -- see
// staticComponentTree.ts's own comment for why (nesting it under "Roots"
// would visually claim it's reachable, which "Unused" means it isn't).
describe("buildStaticComponentTree's root split (reachable Roots vs. unused islands)", () => {
  let workspaceRoot: string;
  let forest: StaticTreeNode[] | undefined;

  function findRoot(name: string): StaticTreeNode {
    const match = forest?.find((node) => node.name === name);
    assert.ok(match, `expected a top-level forest entry named "${name}"`);
    return match as StaticTreeNode;
  }

  before(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-static-component-tree-"));
    const write = (fileName: string, contents: string) => {
      fs.writeFileSync(path.join(workspaceRoot, fileName), contents);
    };

    // Two components genuinely reachable (imported by entry.tsx below) but
    // never rendered by anything -- real roots, should land under "Roots".
    write("AppA.tsx", "export default function AppA() { return <div />; }\n");
    write("AppB.tsx", "export default function AppB() { return <div />; }\n");
    write(
      "entry.tsx",
      [
        'import AppA from "./AppA";',
        'import AppB from "./AppB";',
        "export const registry = [AppA, AppB];",
        "",
      ].join("\n"),
    );

    // A root-level component nothing imports (genuinely unused) that still
    // renders a child of its own -- mirrors the real ToolsTemplates/LinkCard
    // case this whole feature was built around.
    write(
      "DeadOne.tsx",
      [
        'import { DeadChild } from "./DeadChild";',
        "export default function DeadOne() { return <DeadChild />; }",
        "",
      ].join("\n"),
    );
    write("DeadChild.tsx", "export function DeadChild() { return <div />; }\n");

    // A second, childless unused root -- confirms more than one island can
    // coexist alongside the reachable "Roots" cluster.
    write("DeadTwo.tsx", "export default function DeadTwo() { return <div />; }\n");

    const result: StaticAnalysisResult = analyzeWorkspace(workspaceRoot);
    forest = buildStaticComponentTree(result);
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('wraps the reachable roots under a single synthetic "Roots" node', () => {
    const roots = findRoot("Roots");
    assert.strictEqual(roots.filePath, "", "the synthetic wrapper has no real file behind it");
    assert.deepStrictEqual(roots.children.map((c) => c.name).sort(), ["AppA", "AppB"]);
  });

  it("gives an unused root-level component its own separate top-level entry, not nested under Roots", () => {
    const deadOne = findRoot("DeadOne");
    assert.ok(deadOne.attributes.includes("Unused"));
    assert.ok(deadOne.filePath.length > 0, "a real component still has a real file to open");
  });

  it("still shows what an unused root itself renders, underneath its own island", () => {
    const deadOne = findRoot("DeadOne");
    assert.deepStrictEqual(
      deadOne.children.map((c) => c.name),
      ["DeadChild"],
    );
  });

  it("supports more than one unused island alongside the reachable Roots cluster", () => {
    const deadTwo = findRoot("DeadTwo");
    assert.ok(deadTwo.attributes.includes("Unused"));
    assert.deepStrictEqual(deadTwo.children, []);
  });

  it("puts the reachable Roots wrapper first in the forest, for TreeView.tsx's center-on-root", () => {
    assert.strictEqual(forest?.[0]?.name, "Roots");
  });
});

// A workspace with exactly one reachable root (no "Roots" wrapper needed --
// mirrors storeBridge.ts's own "single root returns unwrapped" convention)
// and no unused components at all.
describe("buildStaticComponentTree with a single reachable root and nothing unused", () => {
  let workspaceRoot: string;
  let forest: StaticTreeNode[] | undefined;

  before(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-static-component-tree-single-"));
    fs.writeFileSync(
      path.join(workspaceRoot, "Solo.tsx"),
      "export default function Solo() { return <div />; }\n",
    );
    fs.writeFileSync(
      path.join(workspaceRoot, "entry.tsx"),
      ['import Solo from "./Solo";', "export const registry = [Solo];", ""].join("\n"),
    );
    const result = analyzeWorkspace(workspaceRoot);
    forest = buildStaticComponentTree(result);
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("returns the single reachable root unwrapped, with no synthetic Roots node", () => {
    assert.strictEqual(forest?.length, 1);
    assert.strictEqual(forest?.[0]?.name, "Solo");
  });
});
