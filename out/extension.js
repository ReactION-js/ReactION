"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const startExtensionProvider_1 = require("./startExtensionProvider");
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');
// this method is called when your extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('projectX.openTree', () => {
        TreeViewPanel.createOrShow(context.extensionPath);
    }));
    // context.subscriptions.push(vscode.commands.registerCommand('projectX.openWeb', () => {
    // 	TreeViewPanel.createOrShow(context.extensionPath);
    // }));
    vscode.window.registerTreeDataProvider('startExtension', new startExtensionProvider_1.default());
    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(TreeViewPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel, state) {
                console.log(`Got state: ${state}`);
                TreeViewPanel.revive(webviewPanel, context.extensionPath);
            }
        });
    }
    // chromeLauncher.launch();
    // chromeLauncher.launch({
    // 	startingUrl: 'http://localhost:3000/',
    // 	userDataDir: false,
    // 	enableExtensions: true,
    // 	port: 9222,
    // }).then(chrome => {
    // 	console.log('here is the port', chrome.process)
    // }).catch(err => {
    // 	console.log('error: ', err);
    // })
}
exports.activate = activate;
class TreeViewPanel {
    constructor(panel, extensionPath) {
        this._disposables = [];
        this._panel = panel;
        this._extensionPath = extensionPath;
        this._html = '';
        this.reactData = '';
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(e => {
            if (this._panel.visible) {
                // this._update();
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
    static createOrShow(extensionPath) {
        const column = vscode.ViewColumn.Two;
        if (TreeViewPanel.currentPanel) {
            TreeViewPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(TreeViewPanel.viewType, "Virtual DOM Tree", column, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true,
        });
        TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
    }
    static revive(panel, extensionPath) {
        TreeViewPanel.currentPanel = new TreeViewPanel(panel, extensionPath);
    }
    dispose() {
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
    async _update() {
        const rawReact = await this._runPuppeteer();
        this._panel.webview.html = this._getHtmlForWebview(rawReact);
    }
    _runPuppeteer() {
        // console.log(__dirname, '=====')
        // const extPath = path.join(__dirname, '../', 'node_modules/react-devtools')
        return (async () => {
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
                pipe: true,
            }).catch((err) => console.log(err));
            const page = await browser.pages().then((pageArr) => { return pageArr[0]; });
            await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
            // await page.addScriptTag({ url: 'http://localhost:8097' });
            // page.on('console', (msg: any) => {
            // 	console.log(msg);
            // })
            const reactData = await page.evaluate(async () => {
                const _handler = Object.values(window.__REACT_DEVTOOLS_GLOBAL_HOOK__._fiberRoots)[0].entries().next().value[0].current;
                function fiberWalk(entry) {
                    let output = [];
                    function recurse(root, level) {
                        console.log(root, 'root');
                        if (root.sibling !== null) {
                            output.push({ "name": root.sibling, "level": level });
                            recurse(root.sibling, level);
                        }
                        if (root.child !== null) {
                            output.push({ "name": root.child, "level": level + 1 });
                            recurse(root.child, level + 1);
                        }
                        else {
                            return;
                        }
                    }
                    recurse(entry, 0);
                    console.log(output, 'output');
                    output.sort((a, b) => a[1] - b[1]);
                    output.forEach((el, idx) => {
                        // console.log(el);
                        if (typeof el.name.type === null) {
                            el.name = '';
                        }
                        if (typeof el.name.type === 'function' && el.name.type.name)
                            el.name = el.name.type.name;
                        if (typeof el.name.type === 'function')
                            el.name = 'function';
                        if (typeof el.name.type === 'object')
                            el.name = 'function';
                        if (typeof el.name.type === 'string')
                            el.name = el.name.type;
                        el['id'] = idx;
                        el['parent'] = idx === 0 ? null : el.level - 1;
                    });
                    return output;
                }
                ;
                return fiberWalk(_handler);
            }).catch((err) => { console.log(err); });
            const formattedReactData = [];
            const d3Schema = {
                name: '',
                children: [],
            };
            d3Schema.name = reactData[0][0];
            formattedReactData.push(d3Schema);
            return reactData;
            return reactJSON;
        })().catch((err) => console.log(err));
        return result;
    }
    _getHtmlForWebview(rawData) {
    }
    _getHtmlForWebview(rawTreeData) {
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        console.log(rawTreeData, '====pup result=====');
        // treeData[0].parent = null;
        const reactData = [
            {
                name: "App Component",
                parent: null,
                props: "this.props: 1 \nparent: null",
                children: [
                    {
                        name: "Navbar",
                        parent: "App Component",
                        props: "this.props: 2\nparent: app",
                        children: [
                            {
                                name: "Home",
                                parent: "Navbar",
                                props: "this.props: 3",
                                children: [
                                    {
                                        name: "About Us",
                                        parent: "Home",
                                        props: "this.props: 4",
                                    },
                                    {
                                        name: "Contact",
                                        parent: "Home",
                                        props: "this.props: 5",
                                    }
                                ]
                            },
                            {
                                name: "Logo",
                                parent: "Navbar",
                                props: "this.props: 6",
                            }
                        ]
                    },
                    {
                        name: "Login",
                        parent: "App Component",
                        props: "this.props: 7\nparent: app",
                        children: [
                            {
                                name: "Button",
                                parent: "Login",
                                props: "this.props: 8",
                            }
                        ]
                    },
                    {
                        name: "Footer",
                        parent: "App Component",
                        props: "this.props: 9\nparent: app",
                    }
                ]
            }
        ];
        const reactJSON = JSON.stringify(reactData);
        return `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="utf-8">
					<title>Tree Example</title>

					<style>
						body {
							background-color: white;
						}

						.node {
							cursor: pointer;
						}

						.node circle {
							fill: #fff;
							stroke: steelblue;
							stroke-width: 3px;
						}

						.node text {
							font: 12px sans-serif;
						}

						div.tooltip {
							position: absolute;
							text-align: center;
							width: 100px;
							height: 50x;
							padding: 2px;
							font: 15px sans-serif;
							color: black;
							background: lightsteelblue;
							border: 0px;
							border-radius: 8px;
							pointer-events: none;
					}

						.link {
							fill: none;
							stroke: #ccc;
							stroke-width: 2px;
						}
					</style>
				</head>

				<body>
				<div>

				</div>
			<!-- load the d3.js library -->
			<script src="http://d3js.org/d3.v3.min.js"></script>

			<script>

			// var treeData = d3.stratify().id(function(d) { return d.id }).parentId(function(d) { return d.level })(${rawTreeData});

			var treeData = ${reactJSON}

			// ************** Generate the tree diagram	 *****************
			var margin = {top: 20, right: 120, bottom: 20, left: 120},
				width = 960 - margin.right - margin.left,
				height = 500 - margin.top - margin.bottom;

			var i = 0,
				duration = 750,
				root;

			var tree = d3.layout.tree()
				.size([height, width]);

			var diagonal = d3.svg.diagonal()
				.projection(function(d) { return [d.y, d.x]; });

			var svg = d3.select("body")
			.append("svg")
			.attr("width", width + margin.right + margin.left)
			.attr("height", height + margin.top + margin.bottom)
			.call(d3.behavior.zoom().on("zoom", function () {
				svg.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")")
			}))
			.append("g")

			root = treeData[0];
			root.x0 = height / 2;
			root.y0 = 0;

			update(root);

			d3.select(self.frameElement).style("height", "500px");

			function update(source) {

				// Compute the new tree layout.
				var nodes = tree.nodes(root).reverse(),
					links = tree.links(nodes);

				// Normalize for fixed-depth.
				nodes.forEach(function(d) { d.y = d.depth * 180; });

				// Update the nodes…
				var node = svg.selectAll("g.node")
					.data(nodes, function(d) { return d.id || (d.id = ++i); });

				// Enter any new nodes at the parent's previous position.
				var nodeEnter = node.enter().append("g")
					.attr("class", "node")
					.attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
					.on("click", click)
					.on("mouseover", function(d) {
            div.transition()
                .duration(200)
                .style("opacity", .99);
            div.html(d.props + "<br/>")
                .style("left", (d3.event.pageX) + "px")
                .style("top", (d3.event.pageY - 28) + "px");
            })
        .on("mouseout", function(d) {
            div.transition()
                .duration(500)
                .style("opacity", 0);
        })
;

				nodeEnter.append("circle")
					.attr("r", 1e-6)
					.style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

				nodeEnter.append("text")
					.attr("x", function(d) { return d.children || d._children ? -13 : 13; })
					.attr("dy", ".35em")
					.attr("text-anchor", function(d) { return d.children || d._children ? "end" : "start"; })
					.text(function(d) { return d.name; })
					.style("fill-opacity", 1e-6);

				// Transition nodes to their new position.
				var nodeUpdate = node.transition()
					.duration(duration)
					.attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

				nodeUpdate.select("circle")
					.attr("r", 10)
					.style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });

				nodeUpdate.select("text")
					.style("fill-opacity", 1);

				// Transition exiting nodes to the parent's new position.
				var nodeExit = node.exit().transition()
					.duration(duration)
					.attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
					.remove();

				nodeExit.select("circle")
					.attr("r", 1e-6);

				nodeExit.select("text")
					.style("fill-opacity", 1e-6);

				// Update the links…
				var link = svg.selectAll("path.link")
					.data(links, function(d) { return d.target.id; });

				// Enter any new links at the parent's previous position.
				link.enter().insert("path", "g")
					.attr("class", "link")
					.attr("d", function(d) {
					var o = {x: source.x0, y: source.y0};
					return diagonal({source: o, target: o});
					});

				// Transition links to their new position.
				link.transition()
					.duration(duration)
					.attr("d", diagonal);

				// Transition exiting nodes to the parent's new position.
				link.exit().transition()
					.duration(duration)
					.attr("d", function(d) {
					var o = {x: source.x, y: source.y};
					return diagonal({source: o, target: o});
					})
					.remove();

				// Stash the old positions for transition.
				nodes.forEach(function(d) {
				d.x0 = d.x;
				d.y0 = d.y;
				});
			}

			var div = d3.select("body").append("div")
				.attr("class", "tooltip")
				.style("opacity", 0);


			// Toggle children on click.
			function click(d) {
				if (d.children) {
				d._children = d.children;
				d.children = null;
				} else {
				d.children = d._children;
				d._children = null;
				}
				update(d);
			}

			</script>
	
				</body>
			</html>`;
    }
}
TreeViewPanel.viewType = 'projectX';
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map