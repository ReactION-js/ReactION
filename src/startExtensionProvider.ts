import * as vscode from "vscode";

// Provides the single actionable item shown in the activity-bar view.
// Selecting it runs the ReactION.openTree command.
export default class StartExtensionProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const launch = new vscode.TreeItem(
      "Launch ReactION",
      vscode.TreeItemCollapsibleState.None,
    );
    launch.command = {
      command: "ReactION.openTree",
      title: "ReactION: Launch",
    };
    launch.iconPath = new vscode.ThemeIcon("play");
    launch.tooltip = "Open the React component tree";
    return [launch];
  }
}
