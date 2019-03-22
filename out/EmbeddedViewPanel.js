"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const Puppeteer_1 = require("./Puppeteer");
const treeViewPanel_1 = require("./treeViewPanel");
const htmlViewPanel_1 = require("./htmlViewPanel");
const TreeNode_1 = require("./TreeNode");
class EmbeddedViewPanel {
    // Constructor for tree view and html panel
    constructor(htmlPanel, treePanel, parseInfo) {
        this._disposables = [];
        this._htmlPanel = htmlPanel;
        this._treePanel = treePanel;
        this._parseInfo = parseInfo;
        // Starts the instance of the embedded webview
        this._htmlPanel.webview.html = this._getPreviewHtmlForWebview();
        // Running Puppeteer to access React page context
        this._page = new Puppeteer_1.default(parseInfo);
        this._page.start();
        setInterval(() => {
            this._update();
        }, 1000);
        this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    static createOrShow(extensionPath, parseInfo) {
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
    dispose() {
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
    async _update() {
        let rawReactData = await this._page.scrape();
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
            return tree;
        }
        const treeData = await buildTree(rawReactData);
        this._treePanel.webview.html = this._getHtmlForWebview(treeData);
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(treeData) {
        const stringifiedFlatData = JSON.stringify(treeData);
        return treeViewPanel_1.default.generateD3(stringifiedFlatData, this._parseInfo);
    }
    _getPreviewHtmlForWebview() {
        return htmlViewPanel_1.default.html;
    }
}
EmbeddedViewPanel.viewType = 'ReactION';
exports.default = EmbeddedViewPanel;
//# sourceMappingURL=EmbeddedViewPanel.js.map