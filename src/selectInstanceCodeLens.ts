import * as path from "path";
import * as vscode from "vscode";
import { findComponentsInFileText } from "./singleFileComponents";
import type { SelectInstanceArgs } from "./selectInstance";
import { SUPPORTED_LANGUAGE_IDS } from "./supportedLanguages";

const SELECTOR: vscode.DocumentSelector = SUPPORTED_LANGUAGE_IDS.map((language) => ({ language }));

const RECOGNIZED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function extensionForLanguage(languageId: string): string {
  switch (languageId) {
    case "typescriptreact":
      return ".tsx";
    case "javascript":
      return ".js";
    case "javascriptreact":
      return ".jsx";
    default:
      return ".ts";
  }
}

// ts-morph picks its parser/ScriptKind off the file extension. A real,
// saved file's own fsPath already has a recognized one; an unsaved
// "Untitled-1" buffer doesn't, so fall back to a synthetic name built from
// the document's own languageId. Either way this path never touches the real
// filesystem: findComponentsInFileText's Project uses an in-memory file
// system keyed only by the text VS Code hands us here.
function analysisPathFor(document: vscode.TextDocument): string {
  const ext = path.extname(document.fileName);
  if (RECOGNIZED_EXTENSIONS.has(ext)) {
    return document.fileName;
  }
  return `${document.fileName || "untitled"}${extensionForLanguage(document.languageId)}`;
}

// Task 5e's source -> instance half of "bidirectional source <-> live
// instance" (the instance -> source half is openSource.ts/
// sourceOpeningWiring.ts, from Phase 3b). Surfaces a "Select in ReactION"
// lens above every component definition findComponentsInFileText discovers
// in the CURRENT document text -- findComponentsInFileText already never
// throws (see its own doc comment), so this provider can't either.
export class SelectInstanceCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token?: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const components = findComponentsInFileText(analysisPathFor(document), document.getText());

    return components.map((component) => {
      const position = new vscode.Position(
        Math.max(0, component.location.line - 1),
        Math.max(0, component.location.column - 1),
      );
      const args: SelectInstanceArgs = { displayName: component.displayName };
      return new vscode.CodeLens(new vscode.Range(position, position), {
        title: "▶ Select in ReactION",
        command: "ReactION.selectInstance",
        arguments: [args],
      });
    });
  }
}

export function registerSelectInstanceCodeLensProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(SELECTOR, new SelectInstanceCodeLensProvider()),
  );
}
