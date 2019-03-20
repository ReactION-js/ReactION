"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const StartExtensionProvider_1 = require("./StartExtensionProvider");
const EmbeddedViewPanel_1 = require("./EmbeddedViewPanel");
const ViewPanel_1 = require("./ViewPanel");
// Method called when extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        ViewPanel_1.default.createOrShow(context.extensionPath);
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