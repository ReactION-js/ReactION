import * as vscode from 'vscode';
import StartExtensionProvider from './startExtensionProvider';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import ViewPanel from './ViewPanel';
const fs = require('fs');
const path = require('path');

let parseInfo: {};
let subscriptions: { dispose: () => void }[] = [];

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage("No workspace is opened. Please open a workspace and try again.");
		return;
	}

	const rootPath = workspaceFolders[0].uri.fsPath;
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
			fs.writeFileSync(configPath, JSON.stringify(setup, null, '\t'));
		}
		else {
			// else read off and apply config to the running instance
			parseInfo = JSON.parse(fs.readFileSync(configPath));

		}
	});


	subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
		ViewPanel.createOrShow(context.extensionPath, parseInfo);
	}));

	subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
		EmbeddedViewPanel.createOrShow(context.extensionPath, parseInfo);
	}));

	vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider());

	context.subscriptions.push(...subscriptions);
}

// This method is called when your extension is deactivated
export function deactivate() {
    // Dispose of subscriptions
    subscriptions.forEach(subscription => subscription.dispose());
    subscriptions = [];
    console.log("Extension has been deactivated");
}
