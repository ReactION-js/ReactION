import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import Puppeteer from './Puppeteer';
import treeView from './treeViewPanel';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import TreeNode from './TreeNode';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	console.log('workspaceFolders:', vscode.workspace.rootPath);
	const rootPath = vscode.workspace.rootPath;
	const configPath = path.join(rootPath, "reactION-config.json");
	const setup: any = {};

	setup.system = os.platform();
	setup.executablePath = '';
	setup.localhost = 'localhost:3000';
	setup.headless_browser = false;
	setup.headless_embedded = true;
	setup.reactTheme = 'dark';

	fs.stat(configPath, (err: any, stats: any)=> {
		if (err) {
			console.log(err);
		}
		if (!stats) {
			console.log(stats);
			fs.writeFile(configPath, JSON.stringify(setup), (err: any) => {
				if (err) {
					console.log(err);
				}
				else {
					console.log('The file has been saved!');
				}
			});
		}
		else {
			console.log(stats);
			// else read off and apply config to the running instance

	}});
	

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
		EmbeddedViewPanel.createOrShow();
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());
}

// Putting Tree Diagram in the Webview
export class ViewPanel {

	public static currentPanel: ViewPanel | undefined;
	public static readonly viewType = 'ReactION';
	private readonly _treePanel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	public readonly _page: Puppeteer;

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

		ViewPanel.currentPanel = new ViewPanel(treePanel);
	}

	// Reload previous webview panel state
	public static revive(treePanel: vscode.WebviewPanel): void {
		ViewPanel.currentPanel = new ViewPanel(treePanel);
	}

	// Constructor for tree view and html panel
	private constructor (
		treePanel: vscode.WebviewPanel,
	) {
		this._treePanel = treePanel;

	   // Running Puppeteer to access React page context
		this._page = new Puppeteer();
		this._page.start();
		setInterval(() => {
			this._update();
		}, 1000);
		this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
		// this._treePanel.onDidChangeViewState(() => {
		// 	if (this._treePanel.visible) {
		// 		/************************************
		// 			***Are we using this if statement?***
		// 			*************************************/
		// 	}
		// }, null, this._disposables);
	}

	public dispose(): void {
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

	private async _update(): Promise<void> {
		let rawReactData: Array<object> = await this._page.scrape();

		// console.log(rawReactData);

		// Build out TreeNode class for React D3 Tree.
		function buildTree(rawReactData: Array<object>) {
			let tree: TreeNode = new TreeNode(rawReactData[0]);
			const freeNodes: any = [];

			rawReactData.forEach((el: any) => {
				const parentNode: TreeNode = tree._find(tree, el.parentId);
				if (parentNode) {
					parentNode._add(el);
				} else {
					freeNodes.push(el);
				}
			});

			while (freeNodes.length > 0) {
				const curEl = freeNodes[0];
				const parentNode: TreeNode = tree._find(tree, curEl.parentId);
				if (parentNode) {
					parentNode._add(curEl);
				}
				freeNodes.shift();
			}

			// console.log('tree ', tree)

			return tree;
		}
		const treeData: TreeNode = await buildTree(rawReactData);

		// console.log('tree data ', treeData);

		this._treePanel.webview.html = this._getHtmlForWebview(treeData);
	}

	// Putting scraped meta-data to D3 tree diagram
	private _getHtmlForWebview(treeData: TreeNode): string {

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();
		const stringifiedFlatData: string = JSON.stringify(treeData);
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
