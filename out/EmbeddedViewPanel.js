"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const Puppeteer_1 = require("./Puppeteer");
const treeViewPanel_1 = require("./treeViewPanel");
const htmlViewPanel_1 = require("./htmlViewPanel");
class EmbeddedViewPanel {
    // Constructor for tree view and html panel
    constructor(htmlPanel, treePanel, extensionPath) {
        this._disposables = [];
        this._htmlPanel = htmlPanel;
        this._treePanel = treePanel;
        // Running Puppeteer to access React page context
        this._page = new Puppeteer_1.default();
        this._page._headless = true;
        this._page.start();
        // ******* fix this set interval... doesn't need it ******
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
    static createOrShow(extensionPath) {
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
        EmbeddedViewPanel.currentPanel = new EmbeddedViewPanel(htmlPanel, treePanel, extensionPath);
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
        this._htmlPanel.webview.html = this._getPreviewHtmlForWebview();
        let rawReactData = await this._page.scrape();
        this._treePanel.webview.html = this._getHtmlForWebview(rawReactData);
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(rawReactData) {
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        const stringifiedFlatData = JSON.stringify(rawReactData);
        return treeViewPanel_1.default.generateD3(stringifiedFlatData);
    }
    _getPreviewHtmlForWebview() {
        return htmlViewPanel_1.default.html;
    }
}
EmbeddedViewPanel.viewType = 'ReactION';
exports.default = EmbeddedViewPanel;
// For security purposes, we added getNonce function
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=EmbeddedViewPanel.js.map