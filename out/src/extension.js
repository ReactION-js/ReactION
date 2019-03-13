"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const startExtensionProvider_1 = require("./startExtensionProvider");
const puppeteer_1 = require("./puppeteer");
const chromeLauncher = require('chrome-launcher');
// Method called when extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        ViewPanel.createOrShow(context.extensionPath);
    }));
    vscode.window.registerTreeDataProvider('startExtension', new startExtensionProvider_1.default());
    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(ViewPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel, state) {
                console.log(`Got state: ${state}`);
                ViewPanel.revive(webviewPanel, webviewPanel, context.extensionPath);
            },
        });
    }
}
exports.activate = activate;
// Running Puppeteer to access React page context
let page = new puppeteer_1.default();
// Putting Tree Diagram in the Webview
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