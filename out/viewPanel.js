"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const treeViewPanel_1 = require("./treeViewPanel");
const Puppeteer_1 = require("./Puppeteer");
const TreeNode_1 = require("./TreeNode");
class ViewPanel {
    // Constructor for tree view and html panel
    constructor(treePanel, parseInfo) {
        this._disposables = [];
        this._treePanel = treePanel;
        this._parseInfo = parseInfo;
        // Running Puppeteer to access React page context
        this._page = new Puppeteer_1.default(parseInfo);
        this._page.start();
        setInterval(() => {
            this._update();
        }, 1000);
        this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    static createOrShow(extensionPath, parseInfo) {
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
}
ViewPanel.viewType = 'ReactION';
exports.default = ViewPanel;
//# sourceMappingURL=ViewPanel.js.map