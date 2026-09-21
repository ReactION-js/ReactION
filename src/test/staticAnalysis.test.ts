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
import { computeDependencyMetrics, type DependencyMetricsEntry } from "../dependencyMetrics";

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
      "DualImporter",
      "ExternalTypedComponent",
      "HubConsumerA",
      "HubConsumerB",
      "HubConsumerC",
      "HubWidget",
      "LabelLeaf",
      "LabelParent",
      "LazyLoaded",
      "LibGrandparent",
      "LibParent",
      "ModestHelper",
      "ModestPage",
      "NeverImported",
      "Orchestrator",
      "PropsAccessed",
      "RestSpreadForwarder",
      "RestSpreadLeaf",
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
      // A membership check, not an exact-match on the whole unused set:
      // pinning the full list here (as an earlier version of this test did)
      // forced every later fixture addition (see PropDrilling.tsx) to also
      // be wired into App.tsx purely to avoid spuriously tripping it, which
      // would only get worse through the rest of Phase 5's own fixture
      // growth. "does NOT flag ..." below covers the components that
      // should stay off this list.
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

    it("does NOT flag a prop whose only path to being used is a whole-`props` spread (`{...props}`)", () => {
      // SpreadForwarder (PropDrilling.tsx) never names `theme` anywhere in
      // its own body -- it only spreads its whole `props` identifier onto
      // SpreadLeaf, which genuinely reads `theme`. computePropDrilling
      // already treats this pattern as "indeterminate" rather than a dead
      // end (see its own SPREAD-PROPS DECISION test); computeDeadProps must
      // agree and not report `theme` as dead just because there's no direct
      // `props.theme` access.
      assert.strictEqual(deadPropsByName.has("SpreadForwarder"), false);
    });

    it("does NOT flag a prop whose only path to being used is a destructured `...rest` spread (`{...rest}`)", () => {
      // RestSpreadForwarder individually destructures `label` (genuinely
      // used) but never names `theme` -- `theme` only reaches RestSpreadLeaf
      // (which genuinely reads it) via the `...rest` element being spread
      // onward. Exercises the OTHER branch of findDeadProps (object binding
      // pattern), independent of the whole-`props` case above.
      assert.strictEqual(deadPropsByName.has("RestSpreadForwarder"), false);
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

  describe("computeDependencyMetrics", () => {
    let entries: DependencyMetricsEntry[];

    before(() => {
      entries = computeDependencyMetrics(result);
    });

    function findEntry(displayName: string): DependencyMetricsEntry {
      const entry = entries.find((e) => e.component.displayName === displayName);
      assert.ok(entry, `expected a computeDependencyMetrics entry for "${displayName}"`);
      return entry!;
    }

    it("computes exactly one entry per component, sharing the file's counts", () => {
      assert.strictEqual(entries.length, result.components.length);
    });

    it("gives the hub file a high fan-in: 4 distinct importer files", () => {
      // Importers: HubConsumerA, HubConsumerB, HubConsumerC (one static edge
      // each), plus DualImporter (one static edge AND one dynamic edge, from
      // the same file -- see the dedup test below for why that's still only
      // one of the four).
      assert.strictEqual(findEntry("HubWidget").fanIn, 4);
    });

    it("gives the orchestrator file a high fan-out and zero fan-in", () => {
      // Orchestrator imports 4 distinct files (HubConsumerA/B/C,
      // DualImporter) but nothing in the fixture imports Orchestrator.
      const orchestrator = findEntry("Orchestrator");
      assert.strictEqual(orchestrator.fanOut, 4);
      assert.strictEqual(orchestrator.fanIn, 0);
    });

    it("gives the unremarkable base case low fan-in and fan-out", () => {
      const modestPage = findEntry("ModestPage");
      assert.strictEqual(modestPage.fanIn, 1);
      assert.strictEqual(modestPage.fanOut, 1);
    });

    it("SAME-FILE DEDUP: a static AND a dynamic edge from the same file count as ONE fan-in, not two", () => {
      const dualImporter = findComponent(result, "DualImporter");
      const hub = findComponent(result, "HubWidget");

      // Prove the raw edges really are duplicated at the (from, to) level --
      // otherwise this test would pass vacuously even if dedup were broken.
      const hasStaticEdge = result.fileImportEdges.some(
        (e) => e.from === dualImporter.filePath && e.to === hub.filePath,
      );
      const hasDynamicEdge = result.dynamicImportEdges.some(
        (e) => e.from === dualImporter.filePath && e.to === hub.filePath,
      );
      assert.ok(hasStaticEdge, "expected a static fileImportEdges entry DualImporter -> Hub");
      assert.ok(hasDynamicEdge, "expected a dynamicImportEdges entry DualImporter -> Hub");

      // If computeFileFanCounts counted raw edges instead of distinct (from,
      // to) pairs, Hub's fan-in would be 5 (3 single-edge consumers + 2 from
      // DualImporter) instead of 4.
      assert.strictEqual(findEntry("HubWidget").fanIn, 4);
    });

    it("flags the hub's fan-in as a statistical outlier relative to the rest of the workspace", () => {
      assert.strictEqual(findEntry("HubWidget").fanInOutlier, true);
    });

    it("does not flag the base case's low fan-in/out as an outlier", () => {
      const modestPage = findEntry("ModestPage");
      assert.strictEqual(modestPage.fanInOutlier, false);
      assert.strictEqual(modestPage.fanOutOutlier, false);
    });

    it("sorts entries by combined fan-in + fan-out, descending", () => {
      for (let i = 1; i < entries.length; i++) {
        const prevScore = entries[i - 1].fanIn + entries[i - 1].fanOut;
        const score = entries[i].fanIn + entries[i].fanOut;
        assert.ok(prevScore >= score, `entries out of order at index ${i}`);
      }
    });
  });

  describe("computePropDrilling", () => {
    let chains: PropDrillingChain[];

    before(() => {
      chains = computePropDrilling(result);
    });

    function findChainRootedAt(rootDisplayName: string): PropDrillingChain | undefined {
      return chains.find((chain) => chain.components[0]?.displayName === rootDisplayName);
    }

    // `components` is always just the confirmed pure-forwarding layers now
    // (never the terminal -- see PropDrillingChain's own doc comment), so a
    // helper folding the terminal back in keeps these assertions readable.
    function namesIncludingTerminal(chain: PropDrillingChain | undefined): (string | undefined)[] {
      if (!chain) return [];
      const layers = chain.components.map((c) => c.displayName);
      if (chain.terminal.kind === "consumed" || chain.terminal.kind === "unknown") {
        return [...layers, chain.terminal.component.displayName];
      }
      return [...layers, undefined]; // "unresolved-target" has no ComponentInfo at all
    }

    it("finds a genuine 2+ layer chain: theme drilled through Grandparent -> Parent, consumed in Leaf", () => {
      const chain = findChainRootedAt("ThemeGrandparent");
      assert.ok(chain, "expected a chain rooted at ThemeGrandparent");
      assert.strictEqual(chain?.propName, "theme");
      assert.deepStrictEqual(
        chain?.components.map((c) => c.displayName),
        ["ThemeGrandparent", "ThemeParent"],
      );
      assert.deepStrictEqual(chain?.terminal, { kind: "consumed", component: findComponent(result, "ThemeLeaf") });
    });

    it("does NOT flag a single forwarding hop (below the 2-layer threshold) as drilling", () => {
      assert.strictEqual(findChainRootedAt("LabelParent"), undefined);
      assert.ok(
        !chains.some((chain) => namesIncludingTerminal(chain).includes("LabelLeaf")),
        "LabelLeaf should not appear in any reported chain",
      );
    });

    it("does NOT treat a component that also genuinely uses the prop as a pure forwarder", () => {
      // CountMixed both renders `count` itself AND forwards it to CountLeaf --
      // a real consumer, so the chain must stop AT CountMixed rather than
      // continuing through it to CountLeaf.
      const chain = findChainRootedAt("CountGrandparent");
      assert.ok(chain, "expected a chain rooted at CountGrandparent");
      assert.deepStrictEqual(
        chain?.components.map((c) => c.displayName),
        ["CountGrandparent", "CountParent"],
      );
      assert.strictEqual(chain?.terminal.kind, "consumed");
      assert.strictEqual(
        chain?.terminal.kind === "consumed" ? chain.terminal.component.displayName : undefined,
        "CountMixed",
      );
      assert.ok(
        !namesIncludingTerminal(chain).includes("CountLeaf"),
        "CountLeaf must not be pulled into the chain past its real consumer, CountMixed",
      );
    });

    it("finds no chain at all for a component that genuinely uses its own prop (base case)", () => {
      assert.ok(!chains.some((chain) => namesIncludingTerminal(chain).includes("DirectConsumer")));
    });

    it("SPREAD-PROPS DECISION: `{...props}` stops the chain as an 'unknown' dead-end, not a guessed consumer", () => {
      const chain = findChainRootedAt("SpreadGreatGrandparent");
      assert.ok(chain, "expected a chain rooted at SpreadGreatGrandparent");
      assert.deepStrictEqual(
        chain?.components.map((c) => c.displayName),
        ["SpreadGreatGrandparent", "SpreadGrandparent"],
      );
      assert.deepStrictEqual(chain?.terminal, {
        kind: "unknown",
        component: findComponent(result, "SpreadForwarder"),
      });
      assert.ok(
        !namesIncludingTerminal(chain).includes("SpreadLeaf"),
        "must not guess that the spread carries `theme` through to SpreadLeaf",
      );
    });

    it("UNRESOLVED-TARGET FIX: forwarding into a target this analysis can't resolve (a class component standing in for a third-party/library component) is reported distinctly from 'never consumed'", () => {
      // LibGrandparent -> LibParent both purely forward `theme`; LibParent's
      // own forward target is ExternalWidget, a CLASS component --
      // buildComponentHandle never produces a handle for classes, so it's
      // invisible to componentHandles even though it's a real, exported,
      // JSX-taggable component (see PropDrilling.tsx's own comment). The
      // prop demonstrably keeps flowing into something real; this must NOT
      // read the same as the genuine dead-end above.
      const chain = findChainRootedAt("LibGrandparent");
      assert.ok(chain, "expected a chain rooted at LibGrandparent");
      assert.deepStrictEqual(
        chain?.components.map((c) => c.displayName),
        ["LibGrandparent", "LibParent"],
      );
      assert.deepStrictEqual(chain?.terminal, { kind: "unresolved-target", tagName: "ExternalWidget" });
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

// Regression guard for a real bug this exact branch had: without allowJs/jsx
// set, a plain .jsx file's exports never bind to a checker Symbol (found via
// Phase 5d's spike/fixtures/coverage-app fixture -- a create-react-app/
// Vite-JS-template shape with no tsconfig.json at all), so analyzeWorkspace
// silently reported zero components for an entire plain-JS/JSX workspace.
// The describe block above never caught this because its own glob-fallback
// fixture uses a .tsx file, which doesn't need allowJs.
describe("analyzeWorkspace without a tsconfig.json, over plain .jsx (no TypeScript at all)", () => {
  let workspaceRoot: string;
  let result: StaticAnalysisResult;

  before(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-static-analysis-jsx-fallback-"));
    fs.writeFileSync(
      path.join(workspaceRoot, "Widget.jsx"),
      [
        "export function Widget({ label, ghost }) {",
        "  return <div>{label}</div>;",
        "}",
        "",
      ].join("\n"),
    );
    result = analyzeWorkspace(workspaceRoot);
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("discovers the component from a plain .jsx file with no tsconfig.json", () => {
    findComponent(result, "Widget");
  });
});
