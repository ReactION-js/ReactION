import * as vscode from 'vscode';
import * as path from 'path';

export default {
	generateD3:
		function (stringifiedFlatData: string) {
			const bundle = vscode.Uri.file(path.join(__dirname, 'build', 'bundle.js'));
			const bundleUri = bundle.with({
				scheme: 'vscode-resource'
			});
			console.log(stringifiedFlatData);
			return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="utf-8">
			<title>Tree Example</title>
			<script>
				window._TREE_DATA = [
					{
						name: 'App',
						props: {
							keyA: 'val A',
							keyB: 'val B',
							keyC: 'val C',
						},
						children: [
							{
								name: 'Event',
								props: {
									keyA: 'val A',
									keyB: 'val B',
									keyC: 'val C',
								},
							},
							{
								name: 'Time',
							},
						],
					},
				];
			</script>
		</head>
			<body>
				<div id="root"></div>
				<script src="${bundleUri}"></script>
			</body>
		</html>
		`;
		}
}
