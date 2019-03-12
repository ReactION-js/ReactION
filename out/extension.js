"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const startExtensionProvider_1 = require("./startExtensionProvider");
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');
// This method is called when your extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('ReactION.openTree', () => {
        TreeViewPanel.createOrShow(context.extensionPath);
    }));
    vscode.window.registerTreeDataProvider('startExtension', new startExtensionProvider_1.default());
    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(TreeViewPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel, state) {
                console.log(`Got state: ${state}`);
                TreeViewPanel.revive(webviewPanel, webviewPanel, context.extensionPath);
            },
        });
    }
}
exports.activate = activate;
// Putting Tree Diagram in the Webview
class TreeViewPanel {
    /*****************************
     **********COMMENT************
     *****************************/
    constructor(htmlPanel, panel, extensionPath) {
        this._disposables = [];
        this._htmlPanel = htmlPanel;
        this._panel = panel;
        this._extensionPath = extensionPath;
        this._html = '';
        this.reactData = '';
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(e => {
            if (this._panel.visible) {
                /************************************
                    ***Are we using this if statement?***
                    *************************************/
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
        /*****************************
         **********COMMENT************
         *****************************/
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'notice':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionPath) {
        const treeColumn = vscode.ViewColumn.Three;
        const htmlColumn = vscode.ViewColumn.Two;
        if (TreeViewPanel.currentPanel) {
            TreeViewPanel.currentPanel._htmlPanel.reveal(htmlColumn);
            TreeViewPanel.currentPanel._panel.reveal(treeColumn);
            return;
        }
        // Show HTML Preview in VS Code
        const htmlPanel = vscode.window.createWebviewPanel(TreeViewPanel.viewType, "HTML Preview", htmlColumn, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true
        });
        // Show Virtual DOM Tree in VS Code
        const panel = vscode.window.createWebviewPanel(TreeViewPanel.viewType, "Virtual DOM Tree", treeColumn, {
            // Enable javascript in the webview
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true
        });
        TreeViewPanel.currentPanel = new TreeViewPanel(htmlPanel, panel, extensionPath);
    }
    /*****************************
     **********COMMENT************
     *****************************/
    static revive(htmlPanel, panel, extensionPath) {
        TreeViewPanel.currentPanel = new TreeViewPanel(htmlPanel, panel, extensionPath);
    }
    dispose() {
        TreeViewPanel.currentPanel = undefined;
        // Clean up our resources
        this._htmlPanel.dispose();
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    async _update() {
        this._htmlPanel.webview.html = this._getPreviewHtmlForWebview();
        const rawReact = await this._runPuppeteer();
        this._panel.webview.html = this._getHtmlForWebview(rawReact);
    }
    // Running Puppeteer to access React page context
    _runPuppeteer() {
        return (async () => {
            const browser = await puppeteer.launch({
                headless: true,
                executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
                pipe: true
            }).catch((err) => console.log(err));
            const page = await browser.pages().then((pageArr) => { return pageArr[0]; });
            await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
            // Recursive React component scraping algorithm
            const reactData = await page.evaluate(async () => {
                const _handler = (() => {
                    // @ts-ignore 
                    const domElements = document.querySelector('body').children;
                    // @ts-ignore 
                    for (let ele of domElements) {
                        if (ele._reactRootContainer) {
                            return ele._reactRootContainer._internalRoot.current;
                        }
                    }
                })();
                function fiberWalk(entry) {
                    let output = [], globalID = 0;
                    function recurse(root, level, id) {
                        if (root.sibling !== null && root.child !== null) {
                            // console.log('both');
                            output.push({ "name": root.sibling, "level": `${level}`, "id": `${globalID += 1}`, "parentId": `${id}` }, { "name": root.child, "level": `${level}`, "id": `${globalID += 1}`, "parentId": `${id}` });
                            recurse(root.sibling, level, id);
                            recurse(root.child, level + 1, id + 1);
                        }
                        else if (root.sibling !== null && root.child === null) {
                            output.push({ "name": root.sibling, "level": `${level}`, "id": `${globalID += 1}`, "parentId": `${id}` });
                            recurse(root.sibling, level, id);
                        }
                        else if (root.child !== null && root.sibling === null) {
                            output.push({ "name": root.child, "level": `${level}`, "id": `${globalID += 1}`, "parentId": `${id}` });
                            recurse(root.child, level + 1, id + 1);
                        }
                        else if (root.child === null && root.sibling === null) {
                            return;
                        }
                    }
                    recurse(entry, 0, 0);
                    // output.sort((a, b) => a[1] - b[1]);
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
                        // increment index by 1 since forEach is zero-indexed
                        // el['id'] = idx+1;
                        // el['parent'] = idx === 0 ? null : el.level-1;
                    });
                    output[0].parentId = '';
                    return output.slice(0, 25);
                }
                ;
                console.log(fiberWalk(_handler));
                return fiberWalk(_handler);
            }).catch((err) => { console.log(err); });
            return reactData;
        })().catch((err) => console.log(err));
    }
    // Putting scraped meta-data to D3 tree diagram
    _getHtmlForWebview(rawTreeData) {
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        const flatData = JSON.stringify(rawTreeData);
        return `<!DOCTYPE html>
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

        const flatData = JSON.stringify(rawTreeData.slice(0, 5));
        /*
         **********************************************************
         ***Currently not using since modularizing does not work***
         **********************************************************
        // Importing D3 Logic file
        const d3Logic = vscode.Uri.file(
            path.join(context.extensionPath, 'D3', 'd3Logic.js')
        );
        const logicSrc = d3Logic.with({ scheme: 'vscode-resource' });

        // Importing D3 Style file
        const d3Style = vscode.Uri.file(
            path.join(context.extensionPath, 'D3', 'd3Style.css')
        );
        const styleSrc = d3Style.with({ scheme: 'vscode-resource' });
        */
        return `
		<!DOCTYPE html>
		<html lang="en">

		<head>
			<meta charset="utf-8">
			<title>Tree Example</title>

			<style>
				body {
					background-color: #1d1d1d;
				}

				.axis path {
					display: none;
				}

				.axis line {
					stroke-opacity: 0.3;
					shape-rendering: crispEdges;
				}

				.view {
					fill: white;
					stroke: #000;
				}

				button {
					position: fixed;
					z-index: 1;
					top: 20px;
					left: 20px;
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

				div.tooltip.props {
					visibility: hidden;
					width: 120px;
					background-color: black;
					color: white;
					text-align: center;
					padding: 5px 0;
					border-radius: 6px;

					/* Position the tooltip text - see examples below! */
					position: absolute;
					z-index: 1;
				}

				.tooltip:hover .props {
					visibility: visible;
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
			<script src="https://d3js.org/d3.v5.min.js"></script>
			<button>Reset</button>
			<svg width="960" height="500">
				<script>

					var treeData = d3.stratify().id(function (d) { return d.id }).parentId(function (d) { return d.parentId; })(${flatData});

					// Append the svg object to the body of the page
					// Appends a 'group' element to 'svg'
					// Moves the 'group' element to the top left margin
					var svg = d3.select("svg"),
						width = +svg.attr("width"),
						height = +svg.attr("height");

					// Logic for zoom functionality
					var zoom = d3.zoom()
						.scaleExtent([0.90, 40])
						.translateExtent([[-100, -100], [width + 90, height + 100]])
						.on("zoom", zoomed);

					var x = d3.scaleLinear()
						.domain([-1, width + 1])
						.range([-1, width + 1]);

					var y = d3.scaleLinear()
						.domain([-1, height + 1])
						.range([-1, height + 1]);

					var xAxis = d3.axisBottom(x)
						.ticks((width + 2) / (height + 2) * 10)
						.tickSize(height)
						.tickPadding(8 - height);

					var yAxis = d3.axisRight(y)
						.ticks(10)
						.tickSize(width)
						.tickPadding(8 - width);

					var gX = svg.append("g")
						.attr("class", "axis axis--x")
						.call(xAxis);

					var gY = svg.append("g")
						.attr("class", "axis axis--y")
						.call(yAxis);

					d3.select("button")
						.on("click", resetted);

					svg.call(zoom);

					function zoomed() {
						svg.attr("transform", d3.event.transform);
					}

					function resetted() {
						svg.transition()
							.duration(750)
							.call(zoom.transform, d3.zoomIdentity);
					}

					// Tree logic starts here
					var i = 0,
						duration = 750,
						root;

					// Declares a tree layout and assigns the size
					var treemap = d3.tree().size([height, width]);

					// Assigns parent, children, height, depth
					root = d3.hierarchy(treeData, function (d) { return d.children; });
					root.x0 = height / 2;
					root.y0 = 0;

					update(root);

					function update(source) {

						// Assigns the x and y position for the nodes
						var treeData = treemap(root);

						// Compute the new tree layout.
						var nodes = treeData.descendants(),
							links = treeData.descendants().slice(1);

						// Normalize for fixed-depth.
						nodes.forEach(function (d) { d.y = (d.depth * 180) + 30 });

						// ****************** Nodes section ***************************

						// Update the nodes...
						var node = svg.selectAll('g.node')
							.data(nodes, function (d) { return d.id || (d.id = ++i); });

						// Enter any new modes at the parent's previous position.
						var nodeEnter = node.enter().append('g')
							.attr('class', 'node')
							.attr("transform", function (d) {
								return "translate(" + source.y0 + "," + source.x0 + ")";
							})
							.on('click', click)
							.on("mouseover", mouseover)
							.on("mouseout", mouseout)

						// Add Circle for the nodes
						nodeEnter.append('circle')
							.attr('class', 'node')
							.attr('r', 1e-6)
							.style("fill", function (d) {
								return d._children ? "lightsteelblue" : "#fff";
							});

						// Add labels for the nodes
						nodeEnter.append('text')
							.attr("dy", ".35em")
							.attr("x", function (d) {
								return d.children || d._children ? -13 : 13;
							})
							.attr("text-anchor", function (d) {
								return d.children || d._children ? "end" : "start";
							})
							.text(function (d) { return d.data.name; });

						// UPDATE
						var nodeUpdate = nodeEnter.merge(node);

						// Transition to the proper position for the node
						nodeUpdate.transition()
							.duration(duration)
							.attr("transform", function (d) {
								return "translate(" + d.y + "," + d.x + ")";
							});

						// Update the node attributes and style
						nodeUpdate.select('circle.node')
							.attr('r', 10)
							.style("fill", function (d) {
								return d._children ? "lightsteelblue" : "#fff";
							})
							.attr('cursor', 'pointer');


						// Remove any exiting nodes
						var nodeExit = node.exit().transition()
							.duration(duration)
							.attr("transform", function (d) {
								return "translate(" + source.y + "," + source.x + ")";
							})
							.remove();

						// On exit reduce the node circles size to 0
						nodeExit.select('circle')
							.attr('r', 1e-6);

						// On exit reduce the opacity of text labels
						nodeExit.select('text')
							.style('fill-opacity', 1e-6);

						// ****************** links section ***************************

						// Update the links...
						var link = svg.selectAll('path.link')
							.data(links, function (d) { return d.id; });

						// Enter any new links at the parent's previous position.
						var linkEnter = link.enter().insert('path', "g")
							.attr("class", "link")
							.attr('d', function (d) {
								var o = { x: source.x0, y: source.y0 }
								return diagonal(o, o)
							});

						// Update
						var linkUpdate = linkEnter.merge(link);

						// Transition back to the parent element position
						linkUpdate.transition()
							.duration(duration)
							.attr('d', function (d) { return diagonal(d, d.parent) });

						// Remove any exiting links
						var linkExit = link.exit().transition()
							.duration(duration)
							.attr('d', function (d) {
								var o = { x: source.x, y: source.y }
								return diagonal(o, o)
							})
							.remove();

						// Store the old positions for transition.
						nodes.forEach(function (d) {
							d.x0 = d.x;
							d.y0 = d.y;
						});

						// Creates a curved (diagonal) path from parent to the child nodes
						function diagonal(s, d) {

							path = 'M ' + s.y + ' ' + s.x +
								'C ' + (s.y + d.y) / 2 + ' ' + s.x + ', '
								+ (s.y + d.y) / 2 + ' ' + d.x + ', '
								+ d.y + ' ' + d.x

							return path.toString();
						}

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

						// Show props on mouseover
						function mouseover(d) {
							var g = d3.select(this); // The node
							var info = g.append('text')
								.classed('info', true)
								.text('props!');
						}

						// Remove props on mouseout
						function mouseout() {
							d3.select(this).select('text.info').remove()
						}
					}
				</script>
			</body>
		</html>
		`;
    }

    _getPreviewHtmlForWebview() {
        return `
					<style>
				body {
						margin: 0;
						background-color: white;
				}
				iframe{
						position: fixed;
						top: 0;
						left: 0;
				}
				</style>
				<iframe width="100%"" height="100%" src="http://localhost:3000" frameborder="0" scrolling="yes"></iframe>
				`;
    }
}
TreeViewPanel.viewType = 'ReactION';
// For security purposes, we added getNonce function
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// This method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map