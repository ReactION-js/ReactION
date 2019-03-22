"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const StartExtensionProvider_1 = require("./StartExtensionProvider");
const EmbeddedViewPanel_1 = require("./EmbeddedViewPanel");
const ViewPanel_1 = require("./ViewPanel");
const fs = require('fs');
const path = require('path');
// const os = require('os');
let parseInfo;
// Method called when extension is activated
function activate(context) {
    const rootPath = vscode.workspace.rootPath;
    const configPath = path.join(rootPath, "reactION-config.json");
    const setup = {};
    setup.system = process.platform;
    // Setting the executable path on config file based on user's OS.
    switch (setup.system) {
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
    fs.stat(configPath, (err, stats) => {
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