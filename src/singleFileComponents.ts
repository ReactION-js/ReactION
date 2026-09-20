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
// against it. Constructing a throwaway single-file Project like this is cheap
// (low-single-digit milliseconds), unlike globbing and parsing a whole
// workspace, and it reflects UNSAVED editor content too, since the caller
// hands us `document.getText()` rather than a path we'd read off disk.
//
// LIMITATION (accepted, not a bug): resolveComponentFunction's
// Identifier-following branch resolves symbols via THIS file's own binder
// only -- a component wrapped as `memo(SomeImportedComponent)` where
// SomeImportedComponent is declared in another file won't be unwrapped here,
// unlike analyzeWorkspace's whole-workspace Project. Accepted trade-off for
// the single-file performance requirement above: no CodeLens simply means no
// CodeLens for that one shape, not a crash or a wrong one.
export function findComponentsInFileText(filePath: string, fileText: string): ComponentInfo[] {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, jsx: ts.JsxEmit.ReactJSX },
    });
    const sourceFile = project.createSourceFile(filePath, fileText, { overwrite: true });
    return discoverComponentsInFile(sourceFile).map((handle) => handle.info);
  } catch {
    // provideCodeLenses must never throw: a syntax error, a NUL byte, or any
    // other ts-morph parse failure degrades to "no components found in this
    // file" rather than breaking CodeLens for every open tab of this
    // language (see StaticAnalysisPanel's Phase 5c NUL-byte lesson -- this is
    // the same class of "don't let one bad file take down the feature").
    return [];
  }
}
