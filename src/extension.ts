import * as vscode from 'vscode';
import StartExtensionProvider from './StartExtensionProvider';
import EmbeddedViewPanel from './EmbeddedViewPanel';
import ViewPanel from './ViewPanel';

// Method called when extension is activated
export function activate(context: vscode.ExtensionContext) {

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
