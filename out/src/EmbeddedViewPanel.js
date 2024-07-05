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
const puppeteer_1 = __importDefault(require("./puppeteer"));
const TreeViewPanel_1 = __importDefault(require("./TreeViewPanel"));
const htmlViewPanel_1 = __importDefault(require("./htmlViewPanel"));
const TreeNode_1 = __importDefault(require("./TreeNode"));
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
        this._page = new puppeteer_1.default(parseInfo);
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
        const treeData = await buildTree(rawReactData);
        this._treePanel.webview.html = this._getHtmlForWebview(treeData);
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(treeData) {
        const stringifiedFlatData = JSON.stringify(treeData);
        return TreeViewPanel_1.default.generateD3(stringifiedFlatData, this._parseInfo);
    }
    _getPreviewHtmlForWebview() {
        return htmlViewPanel_1.default.html;
    }
}
EmbeddedViewPanel.viewType = 'ReactION';
exports.default = EmbeddedViewPanel;
//# sourceMappingURL=EmbeddedViewPanel.js.map