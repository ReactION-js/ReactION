import * as vscode from 'vscode';
import treeView from './treeViewPanel';
import Puppeteer from './Puppeteer';
import TreeNode from './TreeNode';

export default class ViewPanel {

	public static currentPanel: ViewPanel | undefined;
	public static readonly viewType = 'ReactION';
	private readonly _treePanel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	public readonly _page: Puppeteer;
	public readonly _parseInfo: any;

	// Constructor for tree view and html panel
	public constructor(
		treePanel: vscode.WebviewPanel,
		parseInfo: any
	) {
		this._treePanel = treePanel;
		this._parseInfo = parseInfo;

		// Running Puppeteer to access React page context
		this._page = new Puppeteer(parseInfo);
		this._page.start();
		setInterval(() => {
			this._update();
		}, 1000);
		this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
	}


	public static createOrShow(extensionPath: string, parseInfo: any) {
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

		ViewPanel.currentPanel = new ViewPanel(treePanel, parseInfo);
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
			return tree;
		}
		const treeData: TreeNode = await buildTree(rawReactData);
		this._treePanel.webview.html = this._getHtmlForWebview(treeData);
	}

	// Putting scraped meta-data to D3 tree diagram
	private _getHtmlForWebview(treeData: TreeNode): string {
		const stringifiedFlatData: string = JSON.stringify(treeData)
		return treeView.generateD3(stringifiedFlatData, this._parseInfo);
	}
}
