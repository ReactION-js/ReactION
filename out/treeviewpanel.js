"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
exports.default = {
    generateD3: function (stringifiedFlatData) {
        const bundle = vscode.Uri.file(path.join(__dirname, 'build', 'bundle.js'));
        const bundleUri = bundle.with({
            scheme: 'vscode-resource'
        });
        return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="utf-8">
			<title>Tree Example</title>
		</head>
			<body>
				<div id="root"></div>
				<script src="${bundleUri}"></script>
			</body>
		</html>
		`;
    }
};
//# sourceMappingURL=TreeViewPanel.js.map