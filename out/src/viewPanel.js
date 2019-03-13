"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const htmlViewPanel_1 = require("./htmlViewPanel");
const treeViewPanel_1 = require("./treeViewPanel");
class ViewPanel {
    // Constructor for tree view and html panel
    constructor(htmlPanel, treePanel) {
        this._disposables = [];
        this._htmlPanel = htmlPanel;
        this._treePanel = treePanel;
        // Set the webview's initial html content
        this._update();
        this._treePanel.onDidDispose(() => this.dispose(), null, this._disposables);
        // Update the content based on view changes
        this._treePanel.onDidChangeViewState(e => {
            if (this._treePanel.visible) {
                this._update();
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
    static createOrShow() {
        const treeColumn = vscode.ViewColumn.Three;
        const htmlColumn = vscode.ViewColumn.Two;
        if (ViewPanel.currentPanel) {
            ViewPanel.currentPanel._htmlPanel.reveal(htmlColumn);
            ViewPanel.currentPanel._treePanel.reveal(treeColumn);
            return;
        }
        // Show HTML Preview in VS Code
        const htmlPanel = vscode.window.createWebviewPanel(ViewPanel.viewType, "HTML Preview", htmlColumn, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true
        });
        // Show Virtual DOM Tree in VS Code
        const treePanel = vscode.window.createWebviewPanel(ViewPanel.viewType, "Virtual DOM Tree", treeColumn, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true
        });
        ViewPanel.currentPanel = new ViewPanel(htmlPanel, treePanel);
    }
    // Reload previous webview panel state
    static revive(htmlPanel, treePanel) {
        ViewPanel.currentPanel = new ViewPanel(htmlPanel, treePanel);
    }
    dispose() {
        ViewPanel.currentPanel = undefined;
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
    async _update(scrape) {
        this._htmlPanel.webview.html = this._getPreviewHtmlForWebview();
        const rawReact = await scrape();
        this._treePanel.webview.html = this._getHtmlForWebview(rawReact);
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(rawTreeData) {
        // Use a nonce to whitelist which scripts can be run
        // const nonce = getNonce();
        const flatData = JSON.stringify(rawTreeData);
        return treeViewPanel_1.default.generateD3(flatData);
    }
    _getPreviewHtmlForWebview() {
        return htmlViewPanel_1.default.html;
    }
}
ViewPanel.viewType = 'ReactION';
exports.default = ViewPanel;
//# sourceMappingURL=ViewPanel.js.map