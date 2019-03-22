import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import ViewPanel from './ViewPanel';
const fs = require('fs');
const path = require('path');
// const os = require('os');

let parseInfo: {};

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	const rootPath = vscode.workspace.rootPath;
	const configPath = path.join(rootPath, "reactION-config.json");
	const setup: any = {};

	setup.system = process.platform;

	// Setting the executable path on config file based on user's OS.
	switch(setup.system) {

		// For iOS environment.
		case 'darwin':
			setup.executablePath = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
			break;

		// For Linux environment.
		case 'linux':
			setup.executablePath = '';
			vscode.window.showInformationMessage('Please specify your Chrominum executablePath in reactION.config.json file created in your local directory.');
			break;

		// For Window 10 environment.
		case 'win32':
			setup.executablePath = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe';
			break;
		default:
			vscode.window.showInformationMessage('Current Operating System is not supported.');
	}
	setup.localhost = 'localhost:3000';
	setup.headless_browser = false;
	setup.headless_embedded = true;
	setup.reactTheme = 'dark';

	fs.stat(configPath, (err: any, stats: any) => {
		if (err) {
			console.log(err);
		}
		if (!stats) {
			fs.writeFileSync(configPath, JSON.stringify(setup));
		}
		else {
			// else read off and apply config to the running instance
			parseInfo = JSON.parse(fs.readFileSync(configPath));

		}
	});


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
