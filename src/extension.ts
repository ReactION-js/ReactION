import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import ViewPanel from './ViewPanel';
import TreeNode from './TreeNode';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	let parseInfo: any;

	console.log('workspaceFolders:', vscode.workspace.rootPath);
	const rootPath = vscode.workspace.rootPath;
	const configPath = path.join(rootPath, "reactION-config.js");
	const setup = `
	
	const data = {

		// Determines the OS of your machine //
		system: "${os.platform()}",

		// Path of user's chrome install //
		executablePath: "${''}", 

		// Default port where server listens //
		localhost: "${"localhost:3000"}", 

		// Headless mode for external browser //
		headless_browser: "${false}", 

		// Headless mode for embedded webview //
		headless_embedded: "${true}", 

		// Default theme in embedded webview //
		reactTheme: "${'dark'}",
	
	}

	module.exports = data;

	`;

	if (!fs.existsSync(path)) {
		console.log('configPath to be created!')
		fs.writeFileSync(configPath, setup);
		parseInfo = require(configPath);
		console.log(parseInfo)
		vscode.window.showInformationMessage('config file created!')
	}
	else {
		parseInfo = require(configPath);
		vscode.window.showInformationMessage('parseInfo: ', parseInfo);
	}

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath, parseInfo);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
		EmbeddedViewPanel.createOrShow();
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());
}

// This method is called when your extension is deactivated
export function deactivate() { }
