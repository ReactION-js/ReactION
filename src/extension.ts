import * as vscode from "vscode";
import StartExtensionProvider from "./startExtensionProvider";
import ViewPanel from "./ViewPanel";
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
// Onboarding progress, persisted in globalState AND mirrored to context keys
// of the same name so the Launch view's `viewsWelcome` reveals one step at a
// time (see the `when` clauses in package.json). They cascade:
// appStarted <= configured <= launched, so each transition also sets the ones
// before it and the `when` clauses stay mutually exclusive.
const APP_STARTED_KEY = "reaction.appStarted";
const CONFIGURED_KEY = "reaction.configured";
const LAUNCHED_KEY = "reaction.launched";

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

  // Persist a progress flag and push it to the matching context key so the
  // welcome view advances immediately, without waiting for a reload.
  const markProgress = (key: string): void => {
    void context.globalState.update(key, true);
    void vscode.commands.executeCommand("setContext", key, true);
  };

  // Clears saved onboarding progress so the Launch view returns to step 1 and
  // the first-run walkthrough replays on the next activation.
  const resetOnboarding = async (): Promise<void> => {
    for (const key of [ONBOARDED_KEY, APP_STARTED_KEY, CONFIGURED_KEY, LAUNCHED_KEY]) {
      await context.globalState.update(key, undefined);
    }
    for (const key of [APP_STARTED_KEY, CONFIGURED_KEY, LAUNCHED_KEY]) {
      await vscode.commands.executeCommand("setContext", key, false);
    }
  };

  // Seed the context keys for this session from persisted progress. globalState
  // is the single source of truth, so ReactION.resetOnboarding can fully undo it.
  for (const key of [APP_STARTED_KEY, CONFIGURED_KEY, LAUNCHED_KEY]) {
    void vscode.commands.executeCommand(
      "setContext",
      key,
      context.globalState.get<boolean>(key, false),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("ReactION.openTree", () => {
      // Re-read config on every launch so a change made in the setup wizard
      // (or a hand-edit of reactION-config.json) takes effect immediately,
      // without needing to reload the window.
      ViewPanel.createOrShow(
        context.extensionUri,
        loadConfig(workspaceRoot),
        workspaceRoot,
        outputChannel,
      );
      markProgress(APP_STARTED_KEY);
      markProgress(CONFIGURED_KEY);
      markProgress(LAUNCHED_KEY);
    }),
    vscode.commands.registerCommand("ReactION.analyzeSource", () => {
      StaticAnalysisPanel.createOrShow(workspaceRoot);
    }),
    vscode.commands.registerCommand("ReactION.confirmDevServerRunning", () => {
      markProgress(APP_STARTED_KEY);
    }),
    vscode.commands.registerCommand("ReactION.setup", async () => {
      const saved = await runSetupWizard(workspaceRoot, outputChannel);
      if (saved) {
        markProgress(APP_STARTED_KEY);
        markProgress(CONFIGURED_KEY);
      }
    }),
    vscode.commands.registerCommand("ReactION.showWalkthrough", () => {
      void vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
    }),
    vscode.commands.registerCommand("ReactION.showLog", () => {
      outputChannel.show();
    }),
    vscode.commands.registerCommand("ReactION.resetOnboarding", async () => {
      await resetOnboarding();
      const choice = await vscode.window.showInformationMessage(
        "ReactION onboarding has been reset — the Launch view is back to step 1.",
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
  // instance -> source jump. Passed as a list so the fan-out stays generic
  // even though ViewPanel is currently the only live panel.
  registerSelectInstanceCommand(context, () => [ViewPanel.currentPanel]);
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
  ViewPanel.currentPanel?.dispose();
  StaticAnalysisPanel.currentPanel?.dispose();
}
