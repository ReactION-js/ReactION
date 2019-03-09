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

const reactJSON = reactData
var treeData = reactJSON

// ************** Generate the tree diagram	 *****************
var margin = { top: 20, right: 120, bottom: 20, left: 120 },
	width = 960 - margin.right - margin.left,
	height = 500 - margin.top - margin.bottom;

var i = 0,
	duration = 750,
	root;

var tree = d3.layout.tree()
	.size([height, width]);

var diagonal = d3.svg.diagonal()
	.projection(function (d) { return [d.y, d.x]; });

var svg = d3.select("body")
	.append("svg")
	.attr("width", width + margin.right + margin.left)
	.attr("height", height + margin.top + margin.bottom)
	.call(d3.behavior.zoom().on("zoom", function () {
		svg.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")")
	}))
	.append("g")

// var svg = d3.select("body").append("svg")
// 	.attr("width", width + margin.right + margin.left)
// 	.attr("height", height + margin.top + margin.bottom)
// 	.append("g")
// 	.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

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
	nodes.forEach(function (d) { d.y = d.depth * 180; });

	// Update the nodes…
	var node = svg.selectAll("g.node")
		.data(nodes, function (d) { return d.id || (d.id = ++i); });

	// Enter any new nodes at the parent's previous position.
	var nodeEnter = node.enter().append("g")
		.attr("class", "node")
		.attr("transform", function (d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
		.on("click", click)
		.on("mouseover", function (d) {
			div.transition()
				.duration(200)
				.style("opacity", .99);
			div.html(d.props + "<br/>")
				.style("left", (d3.event.pageX) + "px")
				.style("top", (d3.event.pageY - 28) + "px");
		})
		.on("mouseout", function (d) {
			div.transition()
				.duration(500)
				.style("opacity", 0);
		})
		;

	nodeEnter.append("circle")
		.attr("r", 1e-6)
		.style("fill", function (d) { return d._children ? "lightsteelblue" : "#fff"; });

	nodeEnter.append("text")
		.attr("x", function (d) { return d.children || d._children ? -13 : 13; })
		.attr("dy", ".35em")
		.attr("text-anchor", function (d) { return d.children || d._children ? "end" : "start"; })
		.text(function (d) { return d.name; })
		.style("fill-opacity", 1e-6);

	// Transition nodes to their new position.
	var nodeUpdate = node.transition()
		.duration(duration)
		.attr("transform", function (d) { return "translate(" + d.y + "," + d.x + ")"; });

	nodeUpdate.select("circle")
		.attr("r", 10)
		.style("fill", function (d) { return d._children ? "lightsteelblue" : "#fff"; });

	nodeUpdate.select("text")
		.style("fill-opacity", 1);

	// Transition exiting nodes to the parent's new position.
	var nodeExit = node.exit().transition()
		.duration(duration)
		.attr("transform", function (d) { return "translate(" + source.y + "," + source.x + ")"; })
		.remove();

	nodeExit.select("circle")
		.attr("r", 1e-6);

	nodeExit.select("text")
		.style("fill-opacity", 1e-6);

	// Update the links…
	var link = svg.selectAll("path.link")
		.data(links, function (d) { return d.target.id; });

	// Enter any new links at the parent's previous position.
	link.enter().insert("path", "g")
		.attr("class", "link")
		.attr("d", function (d) {
			var o = { x: source.x0, y: source.y0 };
			return diagonal({ source: o, target: o });
		});

	// Transition links to their new position.
	link.transition()
		.duration(duration)
		.attr("d", diagonal);

	// Transition exiting nodes to the parent's new position.
	link.exit().transition()
		.duration(duration)
		.attr("d", function (d) {
			var o = { x: source.x, y: source.y };
			return diagonal({ source: o, target: o });
		})
		.remove();

	// Stash the old positions for transition.
	nodes.forEach(function (d) {
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