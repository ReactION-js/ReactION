import * as vscode from 'vscode';
import * as path from 'path';

const puppeteer = require('puppeteer-core');

// this method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('projectX.openTree', () => {
		TreeViewPanel.createOrShow(context.extensionPath);
	}));

	// context.subscriptions.push(vscode.commands.registerCommand('projectX.openWeb', () => {
	// 	TreeViewPanel.createOrShow(context.extensionPath);
	// }));

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(TreeViewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				TreeViewPanel.revive(webviewPanel, context.extensionPath);
			}
		});
	}
}

class TreeViewPanel {

	public static currentPanel: TreeViewPanel | undefined;

	public static readonly viewType = 'projectX';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionPath: string) {
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
			// And restrict the webview to only loading content from our extension's `media` directory.
			// localResourceRoots: [
			//     // vscode.Uri.file(path.join(extensionPath, 'media')),
			//     vscode.Uri.file(path.join(vscode.workspace.rootPath, 'public', 'build'))
			// ]
		});

		TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
		TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionPath: string
	) {
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

	public dispose() {
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

	private _update() {
		this._panel.webview.html = this._getHtmlForWebview();
	}

	private _getHtmlForWebview() {

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
        </html>`
	}

	private _runPuppeteer() {

		// puppeteer.launch().then(async (browser: any) => {
		// 	const page = await browser.newPage();
		// 	await page.goto('https://www.google.com');
		// });

		async function createBrowser() {
			const browser = await puppeteer.launch({ headless: false });

			const page = await browser.newPage();
			await page.goto('https://google.com');

		}

		createBrowser();

		console.log('running puppet')
	}

}

function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// this method is called when your extension is deactivated
export function deactivate() {}
