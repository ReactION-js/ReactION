"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const StartExtensionProvider_1 = require("./StartExtensionProvider");
const EmbeddedViewPanel_1 = require("./EmbeddedViewPanel");
const ViewPanel_1 = require("./ViewPanel");
const fs = require('fs');
const path = require('path');
const os = require('os');
// Method called when extension is activated
function activate(context) {
    let parseInfo;
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
        console.log('configPath to be created!');
        fs.writeFileSync(configPath, setup);
        parseInfo = require(configPath);
        console.log(parseInfo);
        vscode.window.showInformationMessage('config file created!');
    }
    else {
        parseInfo = require(configPath);
        vscode.window.showInformationMessage('parseInfo: ', parseInfo);
    }
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        ViewPanel_1.default.createOrShow(context.extensionPath, parseInfo);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
        EmbeddedViewPanel_1.default.createOrShow();
    }));
    vscode.window.registerTreeDataProvider('startExtension', new StartExtensionProvider_1.default());
}
exports.activate = activate;
// This method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map