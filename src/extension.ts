import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import Puppeteer from './Puppeteer';
import treeView from './treeViewPanel';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import TreeNode from './TreeNode';

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
		EmbeddedViewPanel.createOrShow(context.extensionPath);
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());
}

// Putting Tree Diagram in the Webview
class ViewPanel {

	public static currentPanel: ViewPanel | undefined;
	public static readonly viewType = 'ReactION';
	private readonly _treePanel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	public readonly _page: any;

	public static createOrShow(extensionPath: string) {
		const treeColumn = vscode.ViewColumn.Two;
		if (ViewPanel.currentPanel) {
			ViewPanel.currentPanel._treePanel.reveal(treeColumn);
			return;
		}

		// Show Virtual DOM Tree in VS Code
		const treePanel = vscode.window.createWebviewPanel(ViewPanel.viewType, "Virtual DOM Tree", treeColumn, {

			// Enable javascript in the webview
			enableScripts: true,
			retainContextWhenHidden: true,
			enableCommandUris: true
		});

		ViewPanel.currentPanel = new ViewPanel(treePanel, extensionPath);
	}

	// Reload previous webview panel state
	public static revive(treePanel: vscode.WebviewPanel, extensionPath: string) {
		ViewPanel.currentPanel = new ViewPanel(treePanel, extensionPath);
	}

	// Constructor for tree view and html panel
	private constructor(
		treePanel: vscode.WebviewPanel,
		extensionPath: string,
	) {
		this._treePanel = treePanel;

	   // Running Puppeteer to access React page context
		 this._page = new Puppeteer();
		this._page.start();
		setInterval(() => {
			this._update();
		}, 1000);
		this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._treePanel.onDidChangeViewState(e => {
			if (this._treePanel.visible) {
				/************************************
					***Are we using this if statement?***
					*************************************/
			}
		}, null, this._disposables);

		// Handle messages from the webview
		this._treePanel.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'alert':
					vscode.window.showErrorMessage(message.text);
					return;
			}
		}, null, this._disposables);

		this._treePanel.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'notice':
					vscode.window.showErrorMessage(message.text);
					return;
			}
		}, null, this._disposables);

	}

	public dispose() {
		ViewPanel.currentPanel = undefined;

		// Clean up our resources
		this._treePanel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private async _update() {
		let rawReactData = await this._page.scrape();

		// Build out TreeNode class for React D3 Tree.
		function buildTree(rawReactData:any) {
			let tree = new TreeNode(rawReactData[0]);

			rawReactData.forEach((el:any) => {
				const parentNode = tree._find(tree, el.parentId);
				// console.log('=============', el.parentId)
				if (parentNode) {
					parentNode._add(el);
				}
			});

			return tree;
		}

		console.log(rawReactData);

		const treeData:any = await buildTree(rawReactData);

		this._treePanel.webview.html = this._getHtmlForWebview(treeData);
	}

	// Putting scraped meta-data to D3 tree diagram
	private _getHtmlForWebview(treeData: Array<object>) {

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();
		const stringifiedFlatData = JSON.stringify(treeData);
		return treeView.generateD3(stringifiedFlatData);
	}
}
// For security purposes, we added getNonce function
function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// This method is called when your extension is deactivated
export function deactivate() { }
