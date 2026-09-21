import * as vscode from "vscode";
import { selectInstanceInPanels, type OpenPanel, type SelectInstanceArgs } from "./selectInstance";

// Registers "ReactION.selectInstance", the command the Task 5e CodeLens
// invokes. `getOpenPanels` is injected (rather than importing ViewPanel
// directly here) so this stays testable against
// fake panel objects, mirroring how Task 3b/4a's own host-wiring tests fake a
// webview rather than standing up a real WebviewPanel.
export function registerSelectInstanceCommand(
  context: vscode.ExtensionContext,
  getOpenPanels: () => ReadonlyArray<OpenPanel | undefined>,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ReactION.selectInstance", (args: SelectInstanceArgs | undefined) => {
      // Only ever invoked by the CodeLens with a real displayName in
      // practice (this command is deliberately absent from package.json's
      // contributes.commands, so it can't be run bare from the Command
      // Palette) -- guarded anyway since `vscode.commands.executeCommand`
      // gives no compile-time guarantee of what a caller passes.
      if (!args || typeof args.displayName !== "string") {
        return;
      }
      selectInstanceInPanels(getOpenPanels(), args, () => {
        void vscode.window
          .showInformationMessage(
            `ReactION: open the panel first to select a live instance of "${args.displayName}".`,
            "Open ReactION",
          )
          .then((choice) => {
            if (choice === "Open ReactION") {
              void vscode.commands.executeCommand("ReactION.openTree");
            }
          });
      });
    }),
  );
}
