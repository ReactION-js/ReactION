"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const puppeteer = require('puppeteer-core');
// this method is called when your extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('projectX.openTree', () => {
        TreeViewPanel.createOrShow(context.extensionPath);
    }));
    // context.subscriptions.push(vscode.commands.registerCommand('projectX.openWeb', () => {
    // 	TreeViewPanel.createOrShow(context.extensionPath);
    // }));
    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(TreeViewPanel.viewType, {
            deserializeWebviewPanel(webviewPanel, state) {
                return __awaiter(this, void 0, void 0, function* () {
                    console.log(`Got state: ${state}`);
                    TreeViewPanel.revive(webviewPanel, context.extensionPath);
                });
            }
        });
    }
}
exports.activate = activate;
class TreeViewPanel {
    constructor(panel, extensionPath) {
        this._disposables = [];
        this._panel = panel;
        this._extensionPath = extensionPath;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(e => {
            if (this._panel.visible) {
                this._update();
            }
        }, null, this._disposables);
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'notice':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionPath) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (TreeViewPanel.currentPanel) {
            TreeViewPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(TreeViewPanel.viewType, "Virtual DOM Tree", column || vscode.ViewColumn.One, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true,
        });
        TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
    }
    static revive(panel, extensionPath) {
        TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
    }
    dispose() {
        TreeViewPanel.currentPanel = undefined;
        // Clean up our resources
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }
    _getHtmlForWebview() {
        // const reactPathOnDisk = vscode.Uri.file(path.join(vscode.workspace.rootPath, 'public', 'build', 'bundle.js'));
        // const reactUri = reactPathOnDisk.with({ scheme: 'vscode-resource' });
        // console.log("react: ", reactUri)
        // const cssPathOnDisk = vscode.Uri.file(path.join(vscode.workspace.rootPath, 'style.css'));
        // const cssUri = cssPathOnDisk.with({ scheme: 'vscode-resource' });
        // console.log("css: ", cssUri)
        // const testPathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'dist', 'test.js'));
        // const testUri = testPathOnDisk.with({ scheme: 'vscode-resource' });
        this._runPuppeteer();
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        return `
        <html>
            <head>
                <meta charset="UTF-8">
                <title>Job Hunter</title>
            </head>
            <body>
                <div id="root">testestestestetestestestest</div>
            </body>
        </html>`;
    }
    _runPuppeteer() {
        // puppeteer.launch().then(async (browser: any) => {
        // 	const page = await browser.newPage();
        // 	await page.goto('https://www.google.com');
        // });
        function createBrowser() {
            return __awaiter(this, void 0, void 0, function* () {
                const browser = yield puppeteer.launch({ headless: false });
                const page = yield browser.newPage();
                yield page.goto('https://google.com');
            });
        }
        createBrowser();
        console.log('running puppet');
    }
}
TreeViewPanel.viewType = 'projectX';
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map