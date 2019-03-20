"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const StartExtensionProvider_1 = require("./StartExtensionProvider");
const Puppeteer_1 = require("./Puppeteer");
const treeViewPanel_1 = require("./treeViewPanel");
const EmbeddedViewPanel_1 = require("./EmbeddedViewPanel");
const TreeNode_1 = require("./TreeNode");
// Method called when extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        ViewPanel.createOrShow(context.extensionPath);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
        EmbeddedViewPanel_1.default.createOrShow();
    }));
    vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider_1.default());
}
exports.activate = activate;
// Putting Tree Diagram in the Webview
class ViewPanel {
    // Constructor for tree view and html panel
    constructor(treePanel) {
        this._disposables = [];
        this._treePanel = treePanel;
        // Running Puppeteer to access React page context
        this._page = new Puppeteer_1.default();
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
    static createOrShow(extensionPath) {
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
    static revive(treePanel) {
        ViewPanel.currentPanel = new ViewPanel(treePanel);
    }
    dispose() {
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
    async _update() {
        let rawReactData = await this._page.scrape();
        // console.log(rawReactData);
        // Build out TreeNode class for React D3 Tree.
        function buildTree(rawReactData) {
            let tree = new TreeNode_1.default(rawReactData[0]);
            const freeNodes = [];
            rawReactData.forEach((el) => {
                const parentNode = tree._find(tree, el.parentId);
                if (parentNode) {
                    parentNode._add(el);
                }
                else {
                    freeNodes.push(el);
                }
            });
            while (freeNodes.length > 0) {
                const curEl = freeNodes[0];
                const parentNode = tree._find(tree, curEl.parentId);
                if (parentNode) {
                    parentNode._add(curEl);
                }
                freeNodes.shift();
            }
            // console.log('tree ', tree)
            return tree;
        }
        const treeData = await buildTree(rawReactData);
        // console.log('tree data ', treeData);
        this._treePanel.webview.html = this._getHtmlForWebview(treeData);
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(treeData) {
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        const stringifiedFlatData = JSON.stringify(treeData);
        return treeViewPanel_1.default.generateD3(stringifiedFlatData);
    }
}
ViewPanel.viewType = 'ReactION';
exports.ViewPanel = ViewPanel;
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
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map