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
      "DeadProp",
      "ExternalTypedComponent",
      "LazyLoaded",
      "NeverImported",
      "PropsAccessed",
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
      for (const name of ["App", "AllPropsUsed", "DeadProp", "ExternalTypedComponent", "PropsAccessed"]) {
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
      // own body -- a regression check for the shorthand-destructuring
      // reference-search trap: a naive findReferencesAsNodes() on `theme`
      // here also returns ThemedButton's own use of `theme` and every
      // `theme=` JSX attribute at every call site, so without the two-filter
      // approach (body-range containment + excluding JsxAttribute name
      // nodes) this would be incorrectly reported as "used".
      assert.deepStrictEqual(deadPropsByName.get("ThemedCard"), ["theme"]);
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
