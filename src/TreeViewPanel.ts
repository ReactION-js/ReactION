export default {
	generateD3:
		function (flatData: string) {
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

				.tooltip {
					position: absolute;
					text-align: center;
					width: 100px;
					height: 50x;
					padding: 2px;
					font: 15px sans-serif;
					color: black;
					background: pink;
					border: 0px;
					border-radius: 8px;
					pointer-events: none;
				}

				.tooltip.props {
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
					let svg = d3.select("body").append("svg")
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
						nodes.forEach(function (d) {
							d.y = (d.depth * 180) + 30
						});

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
							.text(d => d.data.data.name)

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
								.text(d => d.data.data.props)
								// .attr('class', 'tooltip');
						}

						// Remove props on mouseout
						function mouseout() {
							d3.select(this).select('text.info').remove()
						}
					}
				</script>
			</body>
		</html>
		`
		}
}
