import * as vscode from "vscode";
import StartExtensionProvider from "./startExtensionProvider";
import EmbeddedViewPanel from "./EmbeddedViewPanel";
import ViewPanel from "./ViewPanel";
import StaticAnalysisPanel from "./StaticAnalysisPanel";
import { loadConfig } from "./config";

export function activate(context: vscode.ExtensionContext): void {
  // One shared channel for every module (puppeteer, devtools-bridge, webview
  // diagnostics) so a user following issue #73's ask for verbose logs has a
  // single place to look.
  const outputChannel = vscode.window.createOutputChannel("ReactION");
  context.subscriptions.push(outputChannel);

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
      ViewPanel.createOrShow(context.extensionUri, config, workspaceRoot, outputChannel);
    }),
    vscode.commands.registerCommand("ReactION.openWeb", () => {
      EmbeddedViewPanel.createOrShow(
        context.extensionUri,
        config,
        workspaceRoot,
        outputChannel,
      );
    }),
    vscode.commands.registerCommand("ReactION.analyzeSource", () => {
      StaticAnalysisPanel.createOrShow(workspaceRoot);
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
  StaticAnalysisPanel.currentPanel?.dispose();
}
