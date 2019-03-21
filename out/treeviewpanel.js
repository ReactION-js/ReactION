"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
exports.default = {
    generateD3: function (stringifiedTreeData, parseInfo) {
        const bundle = vscode.Uri.file(path.join(__dirname, 'build', 'bundle.js'));
        const bundleUri = bundle.with({
            scheme: 'vscode-resource'
        });
        return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="utf-8">
			<link href="https://fonts.googleapis.com/css?family=Slabo+27px" rel="stylesheet">
			<title>Tree Example</title>
			<script>
				window._TREE_DATA = [${stringifiedTreeData}];
				// window._CONFIG = ${parseInfo};
			</script>
		</head>
			<body>
				<div id="root"></div>
				<script src="${bundleUri}"></script>
			</body>
		</html>
		`;
    }
};
//# sourceMappingURL=treeViewPanel.js.map