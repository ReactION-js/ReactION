import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import ViewPanel from './ViewPanel';
import TreeNode from './TreeNode';
const fs = require('fs');
const path = require('path');
const os = require('os');

let parseInfo: any;

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

	console.log('workspaceFolders:', vscode.workspace.rootPath);
	const rootPath = vscode.workspace.rootPath;
	const configPath = path.join(rootPath, "reactION-config.json");
	const setup = `

	setup.system = os.platform(); ${  /* Determines the OS of your machine */'' }

	setup.executablePath = ''; ${  /* Path of user's chrome install */'' }

	setup.localhost = "localhost:3000'; ${  /* Default port where server listens */'' }

	setup.headless_browser = false; ${  /* Headless mode for external browser */'' }

	setup.headless_embedded = true; ${  /* Headless mode for embedded webview */'' }

	setup.reactTheme = 'dark'; ${  /* Default theme in embedded webview */'' }
	
	`;

	fs.stat(configPath, (err: any, stats: any)=> {
		if (err) {
			console.log(err);
		}
		if (!stats) {
			fs.writeFileSync(configPath, JSON.stringify(setup));
		}
		else {
			// else read off and apply config to the running instance
			parseInfo = JSON.parse(fs.readFileSync(configPath));
			console.log('parseInfo: ', parseInfo);

	}});


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
