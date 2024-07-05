import * as vscode from 'vscode';
import Puppeteer from './puppeteer';
import treeView from './TreeViewPanel';
import htmlView from './htmlViewPanel';
import TreeNode from './TreeNode';

interface ParseInfo {
	[key: string]: any;
}

interface RawReactData {
	parentId: string;
	[key: string]: any;
}

export default class EmbeddedViewPanel {

	public static currentPanel: EmbeddedViewPanel | undefined;
	public static readonly viewType = 'ReactION';
	private readonly _htmlPanel: vscode.WebviewPanel;
	private readonly _treePanel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	public readonly _page: Puppeteer;
	public readonly _parseInfo: ParseInfo;

	// Constructor for tree view and html panel
	public constructor(
		htmlPanel: vscode.WebviewPanel,
		treePanel: vscode.WebviewPanel,
		parseInfo: ParseInfo
	) {
		this._htmlPanel = htmlPanel;
		this._treePanel = treePanel;
		this._parseInfo = parseInfo;

		// Starts the instance of the embedded webview
		this._htmlPanel.webview.html = this._getPreviewHtmlForWebview();

		// Running Puppeteer to access React page context
		this._page = new Puppeteer(parseInfo);
		this._page.start();

		setInterval(() => {
			this._update();
		}, 1000);

		this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public static createOrShow(extensionPath: string, parseInfo: any) {
		const treeColumn = vscode.ViewColumn.Three;
		const htmlColumn = vscode.ViewColumn.Two;

		if (EmbeddedViewPanel.currentPanel) {
			EmbeddedViewPanel.currentPanel._htmlPanel.reveal(htmlColumn);
			EmbeddedViewPanel.currentPanel._treePanel.reveal(treeColumn);
			return;
		}

		// Show HTML Preview in VS Code
		const htmlPanel = vscode.window.createWebviewPanel(EmbeddedViewPanel.viewType, "HTML Preview", htmlColumn, {
			// Enable javascript in the webview
			enableScripts: true,
			retainContextWhenHidden: true,
			enableCommandUris: true
		});

		// Show Virtual DOM Tree in VS Code
		const treePanel = vscode.window.createWebviewPanel(EmbeddedViewPanel.viewType, "Virtual DOM Tree", treeColumn, {
			// Enable javascript in the webview
			enableScripts: true,
			retainContextWhenHidden: true,
			enableCommandUris: true
		});

		EmbeddedViewPanel.currentPanel = new EmbeddedViewPanel(htmlPanel, treePanel, parseInfo);
	}

	public dispose(): void {
		EmbeddedViewPanel.currentPanel = undefined;

		// Clean up our resources
		this._htmlPanel.dispose();
		this._treePanel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private async _update(): Promise<void> {
		let rawReactData: RawReactData[] = await this._page.scrape();

		// Build out TreeNode class for React D3 Tree.
		function buildTree(rawReactData: RawReactData[]): TreeNode {
			let tree: TreeNode = new TreeNode(rawReactData[0]);
			const freeNodes: RawReactData[] = [];

			rawReactData.forEach((el) => {
				const parentNode: TreeNode = tree._find(tree, el.parentId);
				if (parentNode) {
					parentNode._add(el);
				} else {
					freeNodes.push(el);
				}
			});

			while (freeNodes.length > 0) {
				const curEl = freeNodes.shift();
				if (curEl) {
					const parentNode = tree._find(tree, curEl.parentId);
					if (parentNode) {
					parentNode._add(curEl);
					}
				}
			}
			return tree;
		}
		const treeData: TreeNode = await buildTree(rawReactData);
		this._treePanel.webview.html = this._getHtmlForWebview(treeData);
	}

	// Putting scraped meta-data to D3 tree diagram
	private _getHtmlForWebview(treeData: TreeNode): string {
		const stringifiedFlatData = JSON.stringify(treeData);
		return treeView.generateD3(stringifiedFlatData, this._parseInfo);
	}

	private _getPreviewHtmlForWebview(): string {
		return htmlView.html;
	}
}
