import * as vscode from 'vscode';

export default class StartExtensionProvider implements vscode.TreeDataProvider<object> {
  private _onDidChangeTreeData: vscode.EventEmitter<object | undefined> = new vscode.EventEmitter<object | undefined>();
  readonly onDidChangeTreeData: vscode.Event<object | undefined> = this._onDidChangeTreeData.event;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire()
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: object): vscode.TreeItem {
    return element;
  }

  getChildren(element?: object): Thenable<object[]> {
    vscode.commands.executeCommand('ReactION.openTree');
    vscode.commands.executeCommand('workbench.view.explorer');

    this._onDidChangeTreeData.fire(); // Make sure collection is not cached.
    this._onDidChangeTreeData.dispose();
    return Promise.reject([]);
  }
}
