"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = __importStar(require("vscode"));
const TreeViewPanel_1 = __importDefault(require("./TreeViewPanel"));
const puppeteer_1 = __importDefault(require("./puppeteer"));
const TreeNode_1 = __importDefault(require("./TreeNode"));
class ViewPanel {
    // Constructor for tree view and html panel
    constructor(treePanel, parseInfo) {
        this._disposables = [];
        this._treePanel = treePanel;
        this._parseInfo = parseInfo;
        // Running Puppeteer to access React page context
        this._page = new puppeteer_1.default(parseInfo);
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
        return TreeViewPanel_1.default.generateD3(stringifiedFlatData, this._parseInfo);
    }
}
ViewPanel.viewType = 'ReactION';
exports.default = ViewPanel;
//# sourceMappingURL=ViewPanel.js.map