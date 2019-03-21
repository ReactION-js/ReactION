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

	console.log('workspaceFolders:', vscode.workspace.rootPath);
	const rootPath = vscode.workspace.rootPath;
	const configPath = path.join(rootPath, "reactION-config.json");
	const setup: any = {};

	setup.system = os.platform();
	setup.executablePath = '';
	setup.localhost = 'localhost:3000';
	setup.headless_browser = false;
	setup.headless_embedded = true;
	setup.reactTheme = 'dark';

	fs.stat(configPath, (err: any, stats: any) => {
		if (err) {
			console.log(err);
		}
		if (!stats) {
			console.log(stats);
			fs.writeFile(configPath, JSON.stringify(setup), (err: any) => {
				if (err) {
					console.log(err);
				}
				else {
					console.log('The file has been saved!');
				}
			});
		}
		else {
			console.log(stats);
			// else read off and apply config to the running instance

		}
	});


	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
		EmbeddedViewPanel.createOrShow();
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());
}

// This method is called when your extension is deactivated
export function deactivate() { }
