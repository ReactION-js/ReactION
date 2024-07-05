"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const startExtensionProvider_1 = __importDefault(require("./startExtensionProvider"));
const EmbeddedViewPanel_1 = __importDefault(require("./EmbeddedViewPanel"));
const ViewPanel_1 = __importDefault(require("./ViewPanel"));
const fs = require('fs');
const path = require('path');
let parseInfo;
let subscriptions = [];
// Method called when extension is activated
function activate(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace is opened. Please open a workspace and try again.");
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
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
            fs.writeFileSync(configPath, JSON.stringify(setup, null, '\t'));
        }
        else {
            // else read off and apply config to the running instance
            parseInfo = JSON.parse(fs.readFileSync(configPath));
        }
    });
    subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        ViewPanel_1.default.createOrShow(context.extensionPath, parseInfo);
    }));
    subscriptions.push(vscode.commands.registerCommand('ReactION.openWeb', () => {
        EmbeddedViewPanel_1.default.createOrShow(context.extensionPath, parseInfo);
    }));
    vscode.window.registerTreeDataProvider('startExtension', new startExtensionProvider_1.default());
    context.subscriptions.push(...subscriptions);
}
// This method is called when your extension is deactivated
function deactivate() {
    // Dispose of subscriptions
    subscriptions.forEach(subscription => subscription.dispose());
    subscriptions = [];
    console.log("Extension has been deactivated");
}
//# sourceMappingURL=extension.js.map