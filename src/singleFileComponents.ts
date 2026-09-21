import { Project, ts } from "ts-morph";
import { discoverComponentsInFile, type ComponentInfo } from "./staticAnalysis";

// CodeLens-scoped counterpart to staticAnalysis.ts's analyzeWorkspace: that
// function globs and parses the ENTIRE workspace, which 5a's own research
// found fine for an explicit one-shot "Analyze Source" action but far too
// expensive to re-run on every provideCodeLenses call -- VS Code calls that
// on every document open, tab switch, and sometimes on every edit. This
// instead constructs a ts-morph Project scoped to a SINGLE file's text (an
// in-memory file system, nothing added from the real workspace at all) and
// reuses discoverComponentsInFile -- the same JSX-in-body + PascalCase +
// exported + memo/forwardRef-unwrap detection analyzeWorkspace itself uses --
// against it. It reflects UNSAVED editor content too, since the caller hands
// us `document.getText()` rather than a path we'd read off disk.
//
// PERFORMANCE NOTE (measured, not guessed -- see this task's own review
// standard after Phase 5d's under-documented blocking cost): a bare
// `new Project(...)` + `createSourceFile` here is genuinely cheap, under
// 1ms. But discoverComponentsInFile calls `file.getExportedDeclarations()`,
// which forces ts-morph to build its underlying `ts.Program` for the first
// time -- and by default that includes loading and binding TypeScript's own
// lib.d.ts files, measured at ~90ms per call on this machine (every single
// call pays it fresh, since this constructs a brand-new Project every time).
// That is exactly the kind of main-thread block a CodeLens provider VS Code
// calls on every document open/tab switch/edit cannot afford.
// `skipLoadingLibFiles: true` below is what actually makes this fast
// (measured ~1ms/call with it, ~90ms/call without): we don't need
// lib.d.ts's ambient types at all -- containsJsx/isPascalCase are pure
// syntax checks. What we DO give up: any prop type touching an imported
// type (including React's own ambient types) resolves to a degraded/
// incomplete type via the checker on this single-file path, unlike
// analyzeWorkspace's whole-workspace one. Fine today, since a CodeLens only
// ever reads displayName + location -- but ComponentInfo's own `props` field
// would silently carry that degraded data if it leaked out. Excluded from
// SingleFileComponentInfo below for exactly that reason: a future caller
// that tries to read `.props` off THIS function's result gets a compile
// error instead of quietly-wrong data.
//
// Picked (rather than this type's former shape, `Omit<ComponentInfo,
// "props">`) down to exactly the two fields SelectInstanceCodeLensProvider
// actually reads. `id` and the top-level `filePath` (redundant with
// `location.filePath`) rode along unused ever since this type was
// introduced -- Omit excludes only `props`, so both leaked straight through.
// Picking straight from ComponentInfo -- rather than hand-listing
// `{ displayName: string; location: SourceLocation }` again -- keeps this
// tied to ComponentInfo by the compiler, so a future shape change there is
// reflected here automatically instead of silently drifting; see
// staticAnalysis.ts's ComponentSummary for the flattened counterpart used
// wherever a nested `location` isn't what the caller needs instead.
export type SingleFileComponentInfo = Pick<ComponentInfo, "displayName" | "location">;

// LIMITATION (accepted, not a bug): resolveComponentFunction's
// Identifier-following branch resolves symbols via THIS file's own binder
// only -- a component wrapped as `memo(SomeImportedComponent)` where
// SomeImportedComponent is declared in another file won't be unwrapped here,
// unlike analyzeWorkspace's whole-workspace Project. Accepted trade-off for
// the single-file performance requirement above: no CodeLens simply means no
// CodeLens for that one shape, not a crash or a wrong one.
export function findComponentsInFileText(
  filePath: string,
  fileText: string,
): SingleFileComponentInfo[] {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipLoadingLibFiles: true,
      compilerOptions: { allowJs: true, jsx: ts.JsxEmit.ReactJSX },
    });
    const sourceFile = project.createSourceFile(filePath, fileText, { overwrite: true });
    return discoverComponentsInFile(sourceFile).map(({ info }) => ({
      displayName: info.displayName,
      location: info.location,
    }));
  } catch {
    // provideCodeLenses must never throw: a syntax error, a NUL byte, or any
    // other ts-morph parse failure degrades to "no components found in this
    // file" rather than breaking CodeLens for every open tab of this
    // language (see StaticAnalysisPanel's Phase 5c NUL-byte lesson -- this is
    // the same class of "don't let one bad file take down the feature").
    return [];
  }
}
