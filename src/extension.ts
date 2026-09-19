import * as vscode from "vscode";
import StartExtensionProvider from "./startExtensionProvider";
import EmbeddedViewPanel from "./EmbeddedViewPanel";
import ViewPanel from "./ViewPanel";
import { loadConfig } from "./config";

export function activate(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showErrorMessage(
      "ReactION: no workspace is open. Please open a folder and try again.",
    );
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const config = loadConfig(workspaceRoot);

  context.subscriptions.push(
    vscode.commands.registerCommand("ReactION.openTree", () => {
      ViewPanel.createOrShow(context.extensionUri, config, workspaceRoot);
    }),
    vscode.commands.registerCommand("ReactION.openWeb", () => {
      EmbeddedViewPanel.createOrShow(context.extensionUri, config, workspaceRoot);
    }),
    vscode.window.registerTreeDataProvider(
      "startExtension",
      new StartExtensionProvider(),
    ),
  );
}

export function deactivate(): void {
  ViewPanel.currentPanel?.dispose();
  EmbeddedViewPanel.currentPanel?.dispose();
}
