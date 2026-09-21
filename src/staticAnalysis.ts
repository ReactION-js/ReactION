import * as fs from "fs";
import * as path from "path";
import {
  Project,
  Node,
  SyntaxKind,
  ts,
  type SourceFile,
  type FunctionDeclaration,
  type FunctionExpression,
  type ArrowFunction,
  type ParameterDeclaration,
  type ExportedDeclarations,
  type Identifier,
} from "ts-morph";

export interface PropInfo {
  name: string;
  required: boolean;
  type: string;
  description: string | undefined;
}

// Matches openSource.ts / sourceOpeningWiring.ts's convention: 1-based
// line/column (V8 CallSite style), the same numbering the runtime Store's
// `source` tuple uses. A future CodeLens/jump-to-source task can feed these
// straight into `new vscode.Position(line - 1, column - 1)` exactly like
// wireSourceOpening does for the live-pipeline's source locations.
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface ComponentInfo {
  id: string;
  displayName: string;
  filePath: string;
  location: SourceLocation;
  props: PropInfo[];
}

// Canonical "just displayName + location" projection of ComponentInfo, for
// every caller that only ever correlates on a component's name and jumps to
// its source (never touches props, id, or an AST handle). Before this
// existed, src/coverageAnalysisWiring.ts, src/singleFileComponents.ts, and
// client/coverage.ts's webview-side copy had each independently hand-rolled
// their own trimmed-down shape -- two of them flattened, one kept a nested
// `location` plus an unused id/filePath -- with no compiler link between any
// of them, so a change to SourceLocation's own shape would have needed
// reconciling by hand in three places instead of one. `filePath` here
// deliberately duplicates `location.filePath`: this flattened shape is built
// specifically for callers (coverageAnalysisWiring.ts, and client/coverage.ts
// across the src/client compilation boundary) that want plain top-level
// fields for a postMessage payload, not the nested SourceLocation itself --
// see singleFileComponents.ts's own SingleFileComponentInfo for the one real
// consumer that legitimately needs the nested shape instead.
export interface ComponentSummary {
  displayName: string;
  filePath: string;
  line: number;
  column: number;
}

export function toComponentSummary(info: ComponentInfo): ComponentSummary {
  return {
    displayName: info.displayName,
    filePath: info.location.filePath,
    line: info.location.line,
    column: info.location.column,
  };
}

// AST handles kept alongside the plain-data ComponentInfo so a later task
// (prop-drilling, fan-in/out) can walk the body/type-check the props
// parameter again without re-running analyzeWorkspace's discovery pass.
export interface ComponentAstHandle {
  info: ComponentInfo;
  declarationNode: ExportedDeclarations;
  fn: FunctionDeclaration | FunctionExpression | ArrowFunction;
  propsParam: ParameterDeclaration | undefined;
}

export interface FileImportEdge {
  from: string;
  to: string;
}

export interface StaticAnalysisResult {
  workspaceRoot: string;
  components: ComponentInfo[];
  // Live ts-morph handles for 5b/5c to build on directly -- see
  // ComponentAstHandle's comment. Keeping the Project alive here (rather than
  // disposing it once `components` is computed) is what avoids forcing a
  // future task to re-parse the whole workspace for AST access this
  // summary alone doesn't carry.
  project: Project;
  componentHandles: Map<string, ComponentAstHandle>;
  externallyReferencedComponentIds: Set<string>;
  dynamicImportTargetFiles: Set<string>;
  fileImportEdges: FileImportEdge[];
  // The "from" side of a dynamic import() resolution, computed once
  // alongside dynamicImportTargetFiles and kept here rather than discarded --
  // a future fan-in/out task needs both directions of the edge, not just the
  // flat target-file set computeUnusedComponents reads.
  dynamicImportEdges: FileImportEdge[];
}

export interface DeadPropsEntry {
  component: ComponentInfo;
  deadProps: string[];
}

const EXCLUDED_DIR_SEGMENTS = new Set(["node_modules", "dist", "build", "out"]);

function isExcludedPath(filePath: string): boolean {
  return filePath.split(path.sep).some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment));
}

function buildProject(workspaceRoot: string): Project {
  const tsConfigFilePath = path.join(workspaceRoot, "tsconfig.json");
  if (fs.existsSync(tsConfigFilePath)) {
    return new Project({ tsConfigFilePath });
  }

  // Found by this task's own coverage-app fixture (a plain .jsx project with
  // no tsconfig.json -- a real create-react-app/Vite-JS-template shape):
  // without allowJs/jsx set, ts-morph's default compiler options leave a
  // .js/.jsx file's SourceFile.getSymbol() undefined (no checker binding),
  // so getExportedDeclarations() silently returns nothing and
  // analyzeWorkspace reports zero components for the entire workspace --
  // confirmed empirically, and not caught by the existing glob-fallback
  // regression test in staticAnalysis.test.ts, which only ever used a .tsx
  // file (natively supported without allowJs). A .ts/.tsx-only project is
  // unaffected by turning allowJs on here.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.ReactJSX },
  });
  project.addSourceFilesAtPaths([
    path.join(workspaceRoot, "**/*.{ts,tsx,js,jsx}"),
    `!${path.join(workspaceRoot, "**/node_modules/**")}`,
    `!${path.join(workspaceRoot, "**/dist/**")}`,
    `!${path.join(workspaceRoot, "**/build/**")}`,
    `!${path.join(workspaceRoot, "**/out/**")}`,
  ]);
  return project;
}

const WRAPPER_CALLEE = /^(React\.)?(memo|forwardRef)$/;
const MAX_UNWRAP_DEPTH = 5;

// Unwraps `memo(Inner)` / `forwardRef((props, ref) => ...)` (and combinations
// of the two) down to the real function that renders JSX, following an
// Identifier argument back to its own declaration (the common
// `const Foo = memo(FooInner)` shape where FooInner is declared separately).
function resolveComponentFunction(
  node: Node,
  depth = 0,
): FunctionDeclaration | FunctionExpression | ArrowFunction | undefined {
  if (depth > MAX_UNWRAP_DEPTH) return undefined;

  if (Node.isFunctionDeclaration(node) || Node.isFunctionExpression(node) || Node.isArrowFunction(node)) {
    return node;
  }
  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    return initializer ? resolveComponentFunction(initializer, depth + 1) : undefined;
  }
  if (Node.isIdentifier(node)) {
    const valueDeclaration = node.getSymbol()?.getValueDeclaration();
    return valueDeclaration ? resolveComponentFunction(valueDeclaration, depth + 1) : undefined;
  }
  if (Node.isCallExpression(node) && WRAPPER_CALLEE.test(node.getExpression().getText())) {
    const [firstArg] = node.getArguments();
    return firstArg ? resolveComponentFunction(firstArg, depth + 1) : undefined;
  }
  return undefined;
}

// A concise arrow body (`() => <div/>`) IS the JsxElement itself, not a
// descendant of one -- getDescendantsOfKind alone misses it (confirmed
// empirically; `() => (<div/>)` parses to a ParenthesizedExpression body
// instead, where the descendant check does find it). Check the node itself
// first, since this is the common no-parens component-as-expression shape.
function containsJsx(node: Node): boolean {
  if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node) || Node.isJsxFragment(node)) {
    return true;
  }
  return (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

// Exported for src/propDrilling.ts, which needs the exact same "is this JSX
// tag a component, not a DOM element" test when deciding whether a JSX
// attribute value is being forwarded to a child component.
export function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

// resolveComponentFunction only ever succeeds for a FunctionDeclaration or a
// VariableDeclaration (directly, or unwrapped through memo/forwardRef) --
// buildComponentHandle already returns early on anything else (a
// ClassDeclaration included), so decl can never be a class by the time this
// runs. No isClassDeclaration branch needed here.
function getDeclaredName(decl: Node): string | undefined {
  if (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
    return decl.getName();
  }
  return undefined;
}

// Declared props come from the checker's resolved member list on the props
// parameter's type, not the syntax tree of a locally-declared interface --
// this one path uniformly covers a local interface, an interface with
// `extends`, an inline object type literal, a type imported from another
// file or package, and even a fully untyped destructured parameter (widened
// to an implicit `{ x: any }`-shaped type, verified empirically), without
// needing separate branches for "local" vs "imported" props types.
function extractProps(param: ParameterDeclaration | undefined): PropInfo[] {
  if (!param) return [];
  return param.getType().getProperties().map((sym) => {
    const declaration = sym.getValueDeclaration();
    const description =
      declaration && Node.isPropertySignature(declaration)
        ? declaration
            .getJsDocs()
            .map((doc) => doc.getDescription().trim())
            .filter((text) => text.length > 0)
            .join(" ") || undefined
        : undefined;
    return {
      name: sym.getName(),
      required: !sym.isOptional(),
      type: sym.getTypeAtLocation(param).getText(),
      description,
    };
  });
}

function buildComponentHandle(
  file: SourceFile,
  exportedName: string,
  decl: ExportedDeclarations,
): ComponentAstHandle | undefined {
  const fn = resolveComponentFunction(decl);
  if (!fn) return undefined;

  const body = fn.getBody();
  if (!body || !containsJsx(body)) return undefined;

  const displayName =
    exportedName === "default"
      ? (getDeclaredName(decl) ?? path.parse(file.getFilePath()).name)
      : exportedName;
  if (!isPascalCase(displayName)) return undefined;

  const propsParam = fn.getParameters()[0];
  const { line, column } = file.getLineAndColumnAtPos(decl.getStart());

  const info: ComponentInfo = {
    id: `${file.getFilePath()}::${exportedName}`,
    displayName,
    filePath: file.getFilePath(),
    location: { filePath: file.getFilePath(), line, column },
    props: extractProps(propsParam),
  };

  return { info, declarationNode: decl, fn, propsParam };
}

// Exported for src/singleFileComponents.ts's CodeLens-scoped single-file
// finder (Task 5e) -- the exact same JSX-in-body + PascalCase + exported +
// memo/forwardRef-unwrap detection analyzeWorkspace uses per-file below,
// just run directly against a SourceFile that lives in a lightweight,
// single-file ts-morph Project instead of the whole-workspace one
// buildProject constructs.
export function discoverComponentsInFile(file: SourceFile): ComponentAstHandle[] {
  const handles: ComponentAstHandle[] = [];
  for (const [exportedName, decls] of file.getExportedDeclarations()) {
    for (const decl of decls) {
      // getExportedDeclarations() already follows re-export chains (barrels
      // included -- verified against `export * from` empirically), so a
      // barrel file's own map entries point at the ORIGINATING file's node.
      // Only build a candidate when this file actually owns the
      // declaration, or the same component gets discovered twice: once here
      // via the barrel, once when its real file is processed in this same
      // loop.
      if (decl.getSourceFile() !== file) continue;
      const handle = buildComponentHandle(file, exportedName, decl);
      if (handle) handles.push(handle);
    }
  }
  return handles;
}

const DYNAMIC_IMPORT_RESOLUTION_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

function resolveRelativeModuleToFile(
  fileByPath: Map<string, SourceFile>,
  fromFile: SourceFile,
  specifier: string,
): SourceFile | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(fromFile.getFilePath()), specifier);
  for (const suffix of DYNAMIC_IMPORT_RESOLUTION_SUFFIXES) {
    const candidate = fileByPath.get(base + suffix);
    if (candidate) return candidate;
  }
  return undefined;
}

interface ReferenceGraph {
  referencedDeclarations: Set<ExportedDeclarations>;
  dynamicImportTargetFiles: Set<string>;
  fileImportEdges: FileImportEdge[];
  dynamicImportEdges: FileImportEdge[];
}

// Single pass over every file's imports and dynamic import() calls, building
// one map of "who references what" -- NOT a findReferencesAsNodes() call per
// candidate component. Benchmarked empirically at 1000 files: a per-component
// reference-search loop takes ~4.3s (super-linear -- each call re-searches
// the whole program), this single pass takes ~149ms for the same result.
function buildReferenceGraph(files: SourceFile[]): ReferenceGraph {
  const fileSet = new Set(files);
  const fileByPath = new Map(files.map((file) => [file.getFilePath(), file]));
  const exportsCache = new Map<SourceFile, ReadonlyMap<string, ExportedDeclarations[]>>();
  const getExportsOf = (file: SourceFile): ReadonlyMap<string, ExportedDeclarations[]> => {
    let cached = exportsCache.get(file);
    if (!cached) {
      cached = file.getExportedDeclarations();
      exportsCache.set(file, cached);
    }
    return cached;
  };

  const referencedDeclarations = new Set<ExportedDeclarations>();
  const dynamicImportTargetFiles = new Set<string>();
  const fileImportEdges: FileImportEdge[] = [];
  const dynamicImportEdges: FileImportEdge[] = [];

  for (const file of files) {
    for (const importDecl of file.getImportDeclarations()) {
      const target = importDecl.getModuleSpecifierSourceFile();
      if (!target || !fileSet.has(target)) continue;
      fileImportEdges.push({ from: file.getFilePath(), to: target.getFilePath() });

      const exportsOfTarget = getExportsOf(target);
      if (importDecl.getDefaultImport()) {
        for (const decl of exportsOfTarget.get("default") ?? []) referencedDeclarations.add(decl);
      }
      if (importDecl.getNamespaceImport()) {
        // `import * as X` -- any exported member could be reached as `X.foo`,
        // so conservatively count every export of the target as referenced.
        for (const decls of exportsOfTarget.values()) {
          for (const decl of decls) referencedDeclarations.add(decl);
        }
      }
      for (const named of importDecl.getNamedImports()) {
        for (const decl of exportsOfTarget.get(named.getName()) ?? []) referencedDeclarations.add(decl);
      }
    }

    // A component only ever reached via
    // `React.lazy(() => import("./LazyLoaded"))` has ZERO references to its
    // named/default export findable by any per-symbol search -- the
    // reference goes through the dynamic import() call's module target, not
    // a named binding (confirmed empirically: findReferencesAsNodes() on the
    // default-exported function's own name returns []). Track this per
    // FILE, separately from the declaration-reference map above, and exempt
    // that file's exports from being flagged unused.
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
      const [specifierArg] = call.getArguments();
      if (!specifierArg || !Node.isStringLiteral(specifierArg)) continue;
      const target = resolveRelativeModuleToFile(fileByPath, file, specifierArg.getLiteralText());
      if (target) {
        dynamicImportTargetFiles.add(target.getFilePath());
        dynamicImportEdges.push({ from: file.getFilePath(), to: target.getFilePath() });
      }
    }
  }

  return { referencedDeclarations, dynamicImportTargetFiles, fileImportEdges, dynamicImportEdges };
}

export function analyzeWorkspace(workspaceRoot: string): StaticAnalysisResult {
  const project = buildProject(workspaceRoot);
  const files = project.getSourceFiles().filter((file) => !isExcludedPath(file.getFilePath()));

  const components: ComponentInfo[] = [];
  const componentHandles = new Map<string, ComponentAstHandle>();
  for (const file of files) {
    for (const handle of discoverComponentsInFile(file)) {
      components.push(handle.info);
      componentHandles.set(handle.info.id, handle);
    }
  }

  const { referencedDeclarations, dynamicImportTargetFiles, fileImportEdges, dynamicImportEdges } =
    buildReferenceGraph(files);

  const externallyReferencedComponentIds = new Set<string>();
  for (const handle of componentHandles.values()) {
    if (referencedDeclarations.has(handle.declarationNode)) {
      externallyReferencedComponentIds.add(handle.info.id);
    }
  }

  return {
    workspaceRoot,
    components,
    project,
    componentHandles,
    externallyReferencedComponentIds,
    dynamicImportTargetFiles,
    fileImportEdges,
    dynamicImportEdges,
  };
}

// unused = no external reference to the component's own exported symbol AND
// its containing file is never a dynamic import() target -- both parts are
// required, see buildReferenceGraph's dynamic-import comment for why a
// lazy-loaded component would otherwise be a false positive here.
export function computeUnusedComponents(result: StaticAnalysisResult): ComponentInfo[] {
  return result.components.filter((component) => {
    const externallyReferenced = result.externallyReferencedComponentIds.has(component.id);
    const fileIsDynamicImportTarget = result.dynamicImportTargetFiles.has(component.filePath);
    return !externallyReferenced && !fileIsDynamicImportTarget;
  });
}

// Exported alongside isPascalCase for src/propDrilling.ts -- it needs the
// exact same "which references actually count" filtering computeDeadProps
// already worked out (same-file, within-body, minus the JsxAttribute-NAME
// collision), just returning the nodes themselves instead of a yes/no, so it
// can go on to classify what EACH reference actually does with the value
// (forwards it vs. genuinely consumes it) rather than just detecting
// presence.
export function collectGenuineDestructuredReferenceNodes(nameNode: Identifier, body: Node): Node[] {
  const bodyStart = body.getPos();
  const bodyEnd = body.getEnd();
  const sourceFile = nameNode.getSourceFile();

  return nameNode.findReferencesAsNodes().filter((ref) => {
    if (ref.getSourceFile() !== sourceFile) return false;
    const pos = ref.getStart();
    if (pos < bodyStart || pos > bodyEnd) return false;

    // For a SHORTHAND-destructured prop, the binding's symbol is merged
    // with the interface property's symbol (confirmed empirically), so this
    // search also returns the JSX ATTRIBUTE NAME half of `prop={prop}` (or
    // even a differently-valued `prop="literal"`) wherever any component
    // sharing the same props type is rendered -- that's a use of the prop's
    // NAME at a call site, not a use of THIS component's own local
    // variable, and it can fall inside this body's own position range (see
    // ChipGroup in spike/fixtures/static-analysis-app/src/components/
    // SelfReferencing.tsx and its regression test in staticAnalysis.test.ts
    // -- confirmed by temporarily deleting this exact filter and rerunning
    // the suite, per this task's review). Must be excluded explicitly; the
    // body-range check alone isn't enough.
    const parent = ref.getParent();
    if (parent && Node.isJsxAttribute(parent) && parent.getNameNode() === ref) return false;
    return true;
  });
}

function hasGenuineDestructuredReference(nameNode: Node, body: Node): boolean {
  // A nested destructuring pattern (`{ theme: { shade } }`) has no single
  // identifier to search on; treat it as used rather than risk a false dead
  // report from a check that can't actually inspect it.
  if (!Node.isIdentifier(nameNode)) return true;
  return collectGenuineDestructuredReferenceNodes(nameNode, body).length > 0;
}

export function collectGenuinePropertyAccessNodes(
  paramIdentifier: Identifier,
  body: Node,
  propName: string,
): Node[] {
  const paramSymbol = paramIdentifier.getSymbol();
  return body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).filter((access) => {
    if (access.getName() !== propName) return false;
    const target = access.getExpression();
    return Node.isIdentifier(target) && target.getSymbol() === paramSymbol;
  });
}

function hasGenuinePropertyAccess(paramIdentifier: Node, body: Node, propName: string): boolean {
  if (!Node.isIdentifier(paramIdentifier)) return true;
  return collectGenuinePropertyAccessNodes(paramIdentifier, body, propName).length > 0;
}

// Exported for src/propDrilling.ts (computePropDrilling's classifyPropUsage),
// which needs the exact same "is this identifier being spread onto a JSX
// element" test, and used below by findDeadProps for the identical reason.
// A prop reachable only through `{...props}` (or a destructured `...rest`)
// leaves no name-level trace of where it goes from here: neither caller can
// tell whether it reaches a child at all, let alone whether that child
// genuinely consumes it, forwards it again, or drops it -- see each caller
// for how it handles that uncertainty.
export function bodyHasSpreadOf(body: Node, identifier: Node): boolean {
  if (!Node.isIdentifier(identifier)) return false;
  const symbol = identifier.getSymbol();
  if (!symbol) return false;
  return body.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute).some((spread) => {
    const expr = spread.getExpression();
    return Node.isIdentifier(expr) && expr.getSymbol() === symbol;
  });
}

function findDeadProps(handle: ComponentAstHandle): string[] {
  const { fn, propsParam, info } = handle;
  const body = fn.getBody();
  if (!propsParam || !body) return info.props.map((prop) => prop.name);

  const nameNode = propsParam.getNameNode();
  const dead: string[] = [];

  if (Node.isObjectBindingPattern(nameNode)) {
    const elements = nameNode.getElements();
    for (const prop of info.props) {
      // Even simpler dead case: the prop isn't destructured at all.
      const element = elements.find(
        (el) => (el.getPropertyNameNode()?.getText() ?? el.getName()) === prop.name,
      );
      if (!element) {
        // Not individually destructured, but a `...rest` element spread
        // onward (`{...rest}`) can still forward it to a child that
        // genuinely consumes it -- bodyHasSpreadOf can't confirm that
        // actually happens, so don't guess "dead" (matches
        // computePropDrilling's "indeterminate" treatment of this same
        // pattern, via the same shared helper).
        const restNameNode = elements.find((el) => el.getDotDotDotToken() !== undefined)?.getNameNode();
        if (!restNameNode || !bodyHasSpreadOf(body, restNameNode)) {
          dead.push(prop.name);
        }
      } else if (!hasGenuineDestructuredReference(element.getNameNode(), body)) {
        dead.push(prop.name);
      }
    }
    return dead;
  }

  if (Node.isIdentifier(nameNode)) {
    for (const prop of info.props) {
      // No direct `props.x` access found, but a whole-`props` spread
      // (`{...props}`) can still forward it to a child that genuinely
      // consumes it -- same "can't confirm, so don't guess dead" reasoning
      // as the destructured-`...rest` case above.
      if (!hasGenuinePropertyAccess(nameNode, body, prop.name) && !bodyHasSpreadOf(body, nameNode)) {
        dead.push(prop.name);
      }
    }
    return dead;
  }

  return dead;
}

export function computeDeadProps(result: StaticAnalysisResult): DeadPropsEntry[] {
  const entries: DeadPropsEntry[] = [];
  for (const component of result.components) {
    if (component.props.length === 0) continue;
    const handle = result.componentHandles.get(component.id);
    if (!handle) continue;
    const deadProps = findDeadProps(handle);
    if (deadProps.length > 0) entries.push({ component, deadProps });
  }
  return entries;
}
