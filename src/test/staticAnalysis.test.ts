import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  analyzeWorkspace,
  computeDeadProps,
  computeUnusedComponents,
  type ComponentInfo,
  type StaticAnalysisResult,
} from "../staticAnalysis";
import { computePropDrilling, type PropDrillingChain } from "../propDrilling";

// Plain mocha (describe/it), run via `npm run test:e2e` against compiled
// output -- NOT vscode-test, since analyzeWorkspace/computeUnusedComponents/
// computeDeadProps have no vscode import (mirrors src/test/openSource.test.ts).
// Exercises the fixture project at spike/fixtures/static-analysis-app, which
// has a tsconfig.json of its own, so analyzeWorkspace takes the
// tsConfigFilePath branch of buildProject here.
const FIXTURE_ROOT = path.join(__dirname, "..", "..", "spike", "fixtures", "static-analysis-app");

function findComponent(result: StaticAnalysisResult, displayName: string): ComponentInfo {
  const matches = result.components.filter((c) => c.displayName === displayName);
  assert.strictEqual(
    matches.length,
    1,
    `expected exactly one component named "${displayName}", found ${matches.length}`,
  );
  return matches[0];
}

describe("analyzeWorkspace / computeUnusedComponents / computeDeadProps", () => {
  let result: StaticAnalysisResult;

  before(() => {
    result = analyzeWorkspace(FIXTURE_ROOT);
  });

  it("discovers every component in the fixture, and nothing else", () => {
    const names = result.components.map((c) => c.displayName).sort();
    assert.deepStrictEqual(names, [
      "AllPropsUsed",
      "App",
      "BarrelOnly",
      "BlockArrow",
      "ChipGroup",
      "ConciseArrow",
      "CountGrandparent",
      "CountLeaf",
      "CountMixed",
      "CountParent",
      "DeadProp",
      "DirectConsumer",
      "ExternalTypedComponent",
      "LabelLeaf",
      "LabelParent",
      "LazyLoaded",
      "NeverImported",
      "PropsAccessed",
      "SpreadForwarder",
      "SpreadGrandparent",
      "SpreadGreatGrandparent",
      "SpreadLeaf",
      "ThemeGrandparent",
      "ThemeLeaf",
      "ThemeParent",
      "ThemedButton",
      "ThemedCard",
    ]);
  });

  it("records a 1-based source location for the component's own declaration", () => {
    const allPropsUsed = findComponent(result, "AllPropsUsed");
    assert.strictEqual(allPropsUsed.location.line, 8);
    assert.strictEqual(allPropsUsed.location.column, 1);
    assert.ok(allPropsUsed.location.filePath.endsWith(path.join("components", "AllPropsUsed.tsx")));
  });

  describe("computeUnusedComponents", () => {
    let unusedNames: string[];

    before(() => {
      unusedNames = computeUnusedComponents(result)
        .map((c) => c.displayName)
        .sort();
    });

    it("flags a component that is genuinely never imported anywhere", () => {
      assert.ok(unusedNames.includes("NeverImported"));
    });

    it("does NOT flag a component only reached via React.lazy(() => import(...))", () => {
      assert.ok(!unusedNames.includes("LazyLoaded"));
    });

    it("does NOT flag a component only reachable via a barrel `export * from`", () => {
      assert.ok(!unusedNames.includes("BarrelOnly"));
    });

    it("does NOT flag components that are directly imported and rendered", () => {
      for (const name of [
        "App",
        "AllPropsUsed",
        "DeadProp",
        "ExternalTypedComponent",
        "PropsAccessed",
        "ChipGroup",
        "ConciseArrow",
        "BlockArrow",
      ]) {
        assert.ok(!unusedNames.includes(name), `${name} should not be flagged unused`);
      }
    });

    it("does NOT flag the memo-wrapped or forwardRef-wrapped components", () => {
      assert.ok(!unusedNames.includes("ThemedButton"));
      assert.ok(!unusedNames.includes("ThemedCard"));
    });

    it("flags exactly the one genuinely-unused component", () => {
      assert.deepStrictEqual(unusedNames, ["NeverImported"]);
    });
  });

  describe("computeDeadProps", () => {
    let deadPropsByName: Map<string, string[]>;

    before(() => {
      deadPropsByName = new Map(
        computeDeadProps(result).map((entry) => [entry.component.displayName, entry.deadProps]),
      );
    });

    it("finds a prop that's never even destructured", () => {
      assert.deepStrictEqual(deadPropsByName.get("DeadProp"), ["unused"]);
    });

    it("reports no dead props for a component that uses every declared prop", () => {
      assert.strictEqual(deadPropsByName.has("AllPropsUsed"), false);
    });

    it("finds a dead prop whose type is imported from another file (not a local interface)", () => {
      assert.deepStrictEqual(deadPropsByName.get("ExternalTypedComponent"), ["ghost"]);
    });

    it("finds a dead prop accessed via a non-destructured `props.x` parameter", () => {
      assert.deepStrictEqual(deadPropsByName.get("PropsAccessed"), ["ghost"]);
    });

    it("correctly unwraps a memo-wrapped component and reports no dead props for it", () => {
      // ThemedButton uses `theme` (className={theme}) and `label` in its own
      // body -- proves the memo(Identifier -> separately-declared function)
      // unwrap path resolves to the real function, not the outer memo(...)
      // call, which itself contains no JSX at all.
      assert.strictEqual(deadPropsByName.has("ThemedButton"), false);
    });

    it("correctly unwraps a forwardRef-wrapped component and finds its own dead prop", () => {
      // ThemedCard shares the exact same ThemedProps interface (and the same
      // `theme` prop name) as ThemedButton, but never reads `theme` in its
      // own body. Note: this specific pair does NOT regression-guard the
      // JsxAttribute-name filter ("filter #2") below -- every `theme=` JSX
      // usage of these two components lives in a DIFFERENT file (App.tsx),
      // so the plain same-file check alone already excludes it here. This
      // test only proves the forwardRef-unwrap path resolves to the real
      // function and finds its own dead prop; see "the JsxAttribute-name
      // exclusion filter" below for the actual filter #2 regression guard.
      assert.deepStrictEqual(deadPropsByName.get("ThemedCard"), ["theme"]);
    });

    it("the JsxAttribute-name exclusion filter (regression guard)", () => {
      // ChipGroup destructures `theme` from the SAME ChipProps interface
      // Chip does, and its own body renders `<Chip theme="fixed" .../>` --
      // a literal value, never reading ChipGroup's own `theme` variable.
      // Because Chip and ChipGroup share ChipProps, the shorthand-
      // destructured `theme` binding's reference search also returns that
      // JsxAttribute's NAME node, and -- unlike the ThemedButton/ThemedCard
      // pair above -- it lives in THIS SAME FILE and THIS SAME component's
      // own body range, so the same-file/body-range check alone can't
      // exclude it. Only excluding the JsxAttribute name node itself
      // ("filter #2") gets this right; deleting that filter makes this
      // assertion fail (verified manually -- see the commit message).
      assert.deepStrictEqual(deadPropsByName.get("ChipGroup"), ["theme"]);
    });

    it("finds no dead props in a concise-body arrow component (`() => <jsx/>`)", () => {
      // The function's body IS the JsxElement itself here, not a descendant
      // of one -- regression coverage for containsJsx's no-parens case.
      assert.strictEqual(deadPropsByName.has("ConciseArrow"), false);
    });

    it("finds a dead prop in a block-body arrow component, and reports the optional prop as not required", () => {
      assert.deepStrictEqual(deadPropsByName.get("BlockArrow"), ["ghost"]);

      const blockArrow = findComponent(result, "BlockArrow");
      const hint = blockArrow.props.find((p) => p.name === "hint");
      assert.ok(hint, "BlockArrowProps.hint should be extracted");
      assert.strictEqual(hint?.required, false);

      const value = blockArrow.props.find((p) => p.name === "value");
      assert.strictEqual(value?.required, true);
    });
  });

  describe("dynamicImportEdges", () => {
    it("keeps the 'from' side of a dynamic import() resolution, not just the flat target set", () => {
      const lazyLoaded = findComponent(result, "LazyLoaded");
      const edge = result.dynamicImportEdges.find((e) => e.to === lazyLoaded.filePath);
      assert.ok(edge, "expected a dynamicImportEdges entry targeting LazyLoaded.tsx");
      assert.ok(edge?.from.endsWith(path.join("src", "App.tsx")));
      // The flat lookup computeUnusedComponents actually reads is still there.
      assert.ok(result.dynamicImportTargetFiles.has(lazyLoaded.filePath));
    });
  });

  describe("computePropDrilling", () => {
    let chains: PropDrillingChain[];

    before(() => {
      chains = computePropDrilling(result);
    });

    function findChainRootedAt(rootDisplayName: string): PropDrillingChain | undefined {
      return chains.find((chain) => chain.components[0].displayName === rootDisplayName);
    }

    function names(chain: PropDrillingChain | undefined): string[] {
      return chain?.components.map((c) => c.displayName) ?? [];
    }

    it("finds a genuine 2+ layer chain: theme drilled through Grandparent -> Parent, consumed in Leaf", () => {
      const chain = findChainRootedAt("ThemeGrandparent");
      assert.ok(chain, "expected a chain rooted at ThemeGrandparent");
      assert.strictEqual(chain?.propName, "theme");
      assert.deepStrictEqual(names(chain), ["ThemeGrandparent", "ThemeParent", "ThemeLeaf"]);
      assert.strictEqual(chain?.consumedBy?.displayName, "ThemeLeaf");
    });

    it("does NOT flag a single forwarding hop (below the 2-layer threshold) as drilling", () => {
      assert.strictEqual(findChainRootedAt("LabelParent"), undefined);
      assert.ok(
        !chains.some((chain) => chain.components.some((c) => c.displayName === "LabelLeaf")),
        "LabelLeaf should not appear in any reported chain",
      );
    });

    it("does NOT treat a component that also genuinely uses the prop as a pure forwarder", () => {
      // CountMixed both renders `count` itself AND forwards it to CountLeaf --
      // a real consumer, so the chain must stop AT CountMixed rather than
      // continuing through it to CountLeaf.
      const chain = findChainRootedAt("CountGrandparent");
      assert.ok(chain, "expected a chain rooted at CountGrandparent");
      assert.deepStrictEqual(names(chain), ["CountGrandparent", "CountParent", "CountMixed"]);
      assert.strictEqual(chain?.consumedBy?.displayName, "CountMixed");
      assert.ok(
        !names(chain).includes("CountLeaf"),
        "CountLeaf must not be pulled into the chain past its real consumer, CountMixed",
      );
    });

    it("finds no chain at all for a component that genuinely uses its own prop (base case)", () => {
      assert.ok(!chains.some((chain) => chain.components.some((c) => c.displayName === "DirectConsumer")));
    });

    it("SPREAD-PROPS DECISION: `{...props}` stops the chain unresolved rather than guessing it reaches the real consumer", () => {
      const chain = findChainRootedAt("SpreadGreatGrandparent");
      assert.ok(chain, "expected a chain rooted at SpreadGreatGrandparent");
      assert.deepStrictEqual(names(chain), [
        "SpreadGreatGrandparent",
        "SpreadGrandparent",
        "SpreadForwarder",
      ]);
      assert.strictEqual(chain?.consumedBy, undefined);
      assert.ok(
        !names(chain).includes("SpreadLeaf"),
        "must not guess that the spread carries `theme` through to SpreadLeaf",
      );
    });
  });
});

// analyzeWorkspace's other Project-construction branch: no tsconfig.json in
// the workspace at all, so buildProject falls back to a glob over
// **/*.{ts,tsx,js,jsx} instead of tsConfigFilePath. Uses a real temp
// directory (mirroring src/test/openSource.test.ts) rather than the
// tsconfig-having fixture above, since that's the only way to exercise this
// branch at all.
describe("analyzeWorkspace without a tsconfig.json (glob fallback)", () => {
  let workspaceRoot: string;
  let result: StaticAnalysisResult;

  before(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-static-analysis-fallback-"));
    fs.writeFileSync(
      path.join(workspaceRoot, "Widget.tsx"),
      [
        "export interface WidgetProps {",
        "  label: string;",
        "  ghost: string;",
        "}",
        "",
        "export function Widget({ label }: WidgetProps) {",
        "  return <div>{label}</div>;",
        "}",
        "",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(workspaceRoot, "node_modules", "some-lib"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "node_modules", "some-lib", "Ignored.tsx"),
      "export function Ignored() { return <div />; }\n",
    );
    result = analyzeWorkspace(workspaceRoot);
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("discovers the component via the glob fallback and finds its dead prop", () => {
    const widget = findComponent(result, "Widget");
    assert.deepStrictEqual(
      computeDeadProps(result).find((entry) => entry.component.id === widget.id)?.deadProps,
      ["ghost"],
    );
  });

  it("excludes node_modules even without a tsconfig-driven exclude list", () => {
    assert.strictEqual(result.components.some((c) => c.displayName === "Ignored"), false);
  });
});
