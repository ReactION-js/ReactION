"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'assert' provides assertion methods from node
const vscode = require("vscode");
const assert = require("assert");
const extension_1 = require("../extension");
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
const treeColumn = vscode.ViewColumn.Two;
// Show Virtual DOM Tree in VS Code
const treePanel = vscode.window.createWebviewPanel(extension_1.ViewPanel.viewType, "Virtual DOM Tree", treeColumn, {
    // Enable javascript in the webview
    enableScripts: true,
    retainContextWhenHidden: true,
    enableCommandUris: true
});
extension_1.ViewPanel.createOrShow(treePanel);
// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {
    // Defines a Mocha unit test
    test("Extension Running", function () {
        assert.equal(2, 1 + 1);
    });
});
//# sourceMappingURL=extension.test.js.map