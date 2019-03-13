import * as vscode from 'vscode';
import StartExtensionProvider from './startExtensionProvider';
import Puppeteer from './puppeteer';
import htmlView from './htmlViewPanel';
import treeView from './TreeViewPanel';

const chromeLauncher = require('chrome-launcher');

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath);
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());

	if (vscode.window.registerWebviewPanelSerializer) {

		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(ViewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				ViewPanel.revive(webviewPanel, webviewPanel, context.extensionPath);
			},
		});
	}
}

// Running Puppeteer to access React page context
let page: any = new Puppeteer();

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
export function deactivate() { }
