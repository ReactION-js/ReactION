import * as vscode from "vscode";
import StartExtensionProvider from "./startExtensionProvider";
import ViewPanel, { type ViewPanelMode } from "./ViewPanel";
import StaticAnalysisPanel from "./StaticAnalysisPanel";
import { loadConfig } from "./config";
import { runSetupWizard } from "./setupWizard";
import { registerSelectInstanceCommand } from "./selectInstanceWiring";
import { registerSelectInstanceCodeLensProvider } from "./selectInstanceCodeLens";

// Fully-qualified id of the getting-started walkthrough contributed in
// package.json (`${publisher}.${name}#${walkthrough-id}`), used to open it
// programmatically on first run and from the ReactION.showWalkthrough command.
const WALKTHROUGH_ID = "ReactION-JS.ReactION#reactionWalkthrough";
const ONBOARDED_KEY = "reaction.onboarded";

function openTreePanel(
  mode: ViewPanelMode,
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel,
): ViewPanel {
  // Re-read config on every launch so a change made in the setup wizard (or
  // a hand-edit of reactION-config.json) takes effect immediately, without
  // needing to reload the window.
  return ViewPanel.createOrShow(
    mode,
    context.extensionUri,
    loadConfig(workspaceRoot),
    workspaceRoot,
    outputChannel,
  );
}

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

  context.subscriptions.push(
    // Static tab: opens immediately, no dev server/Chrome/setup needed at
    // all -- see ViewPanel.ts's own doc comment on the static-vs-live tab
    // split. This is the recommended, low-barrier default (package.json's
    // Launch view and walkthrough both lead with it).
    vscode.commands.registerCommand("ReactION.openTree", () => {
      openTreePanel("static", context, workspaceRoot, outputChannel);
    }),
    // Live tab: opens (or reveals) the separate live panel, then immediately
    // drives its opt-in "connect to live app" flow -- the setup wizard,
    // then Chrome -- exactly as if the user had clicked "Connect to live
    // app" inside that webview themselves. The one entry point the Getting
    // Started walkthrough's "Launch ReactION Live Rendering" step and the
    // Launch view's equivalent button both use.
    vscode.commands.registerCommand("ReactION.openTreeLive", () => {
      const panel = openTreePanel("live", context, workspaceRoot, outputChannel);
      void panel.connectToLiveApp(workspaceRoot);
    }),
    vscode.commands.registerCommand("ReactION.analyzeSource", () => {
      StaticAnalysisPanel.createOrShow(workspaceRoot);
    }),
    vscode.commands.registerCommand("ReactION.setup", async () => {
      const launchNow = await runSetupWizard(workspaceRoot, outputChannel);
      if (launchNow) {
        // Open (or reveal) the live tab and connect straight away using the
        // config just gathered above, WITHOUT going through
        // connectToLiveApp's own wizard step -- that would ask the same
        // dev-server/Chrome questions a second time immediately after the
        // user just answered them here.
        const panel = openTreePanel("live", context, workspaceRoot, outputChannel);
        void panel.connectWithFreshConfig(workspaceRoot);
      }
    }),
    vscode.commands.registerCommand("ReactION.showWalkthrough", () => {
      void vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
    }),
    vscode.commands.registerCommand("ReactION.showLog", () => {
      outputChannel.show();
    }),
    vscode.commands.registerCommand("ReactION.resetOnboarding", async () => {
      await context.globalState.update(ONBOARDED_KEY, undefined);
      const choice = await vscode.window.showInformationMessage(
        "ReactION onboarding has been reset.",
        "Getting Started",
      );
      if (choice === "Getting Started") {
        void vscode.commands.executeCommand(
          "workbench.action.openWalkthrough",
          WALKTHROUGH_ID,
          false,
        );
      }
    }),
    vscode.window.registerTreeDataProvider(
      "startExtension",
      new StartExtensionProvider(),
    ),
  );

  // Task 5e: source -> live instance, the other half of Phase 3b's
  // instance -> source jump. Only the live panel has a live element to
  // select at all -- the static panel is passed a list so the fan-out stays
  // generic even though it's currently the only live panel.
  registerSelectInstanceCommand(context, () => [ViewPanel.currentLivePanel]);
  registerSelectInstanceCodeLensProvider(context);

  // First-run onboarding: open the guided walkthrough once, so a brand-new
  // user lands on step-by-step setup instead of an empty panel. Gated on
  // globalState so it never reopens on later sessions (the Launch view's
  // "Getting started" button reopens it on demand afterwards).
  if (!context.globalState.get(ONBOARDED_KEY)) {
    void context.globalState.update(ONBOARDED_KEY, true);
    void vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
  }
}


export function deactivate(): void {
  ViewPanel.currentStaticPanel?.dispose();
  ViewPanel.currentLivePanel?.dispose();
  StaticAnalysisPanel.currentPanel?.dispose();
}
