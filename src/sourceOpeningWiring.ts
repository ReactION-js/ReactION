import * as vscode from "vscode";
import { resolveSourceFileName } from "./openSource";

interface OpenSourceMessage {
  type?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

// Listens for the webview's host-only "openSource" message (see
// client/App.tsx -- posted directly via vscodeApi.postMessage, NOT through
// the wall/bridge to the page) and opens the resolved file at the
// click-to-inspect location. The message carries the protocol's raw 1-based
// lineNumber/columnNumber (V8's CallSite convention, confirmed in
// spike/run-phase3b-source.js); the -1 to vscode.Position's 0-based scheme
// happens here, on the host, since this is where vscode.Position is built.
export function wireSourceOpening(
  webview: vscode.Webview,
  workspaceRoot: string,
): vscode.Disposable {
  return webview.onDidReceiveMessage((msg: OpenSourceMessage) => {
    if (
      msg?.type !== "openSource" ||
      typeof msg.fileName !== "string" ||
      typeof msg.lineNumber !== "number" ||
      typeof msg.columnNumber !== "number"
    ) {
      return;
    }

    const resolved = resolveSourceFileName(msg.fileName, workspaceRoot);
    if (!resolved) {
      void vscode.window.showInformationMessage(
        `ReactION: could not locate "${msg.fileName}" on disk to jump to its source. ` +
          "This can happen for a production build or an unrecognized bundler path format.",
      );
      return;
    }

    const position = new vscode.Position(
      Math.max(0, msg.lineNumber - 1),
      Math.max(0, msg.columnNumber - 1),
    );
    void vscode.window.showTextDocument(vscode.Uri.file(resolved), {
      selection: new vscode.Range(position, position),
    });
  });
}
