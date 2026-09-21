import * as vscode from "vscode";

// The Launch view is intentionally empty: its step-by-step onboarding (start
// your app -> configure the URL -> launch the graph) is contributed as
// `viewsWelcome` in package.json, which VS Code renders whenever the view has
// no items. Registering this provider (returning no children) keeps the view
// backed by a data provider so it shows that welcome content instead of the
// "no data provider registered" placeholder before the extension activates.
export default class StartExtensionProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    return [];
  }
}
