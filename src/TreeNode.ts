export default class TreeNode {
	public name: string;
	public id: string;
	public attributes: any;
	public children: any[];

	public constructor(node:any) {
		// console.log(node)
		this.name = node.name;
		this.id = node.id;
		this.attributes = node.props;
		this.children = [];
	}

	// Add new node to the tree
	public _add(node:any) {
		const newNode = new TreeNode(node);
		this.children.push(newNode);
	}

	// Search if there is a node with matching id.
	public _find(root:any, id:any) {
		let curNode = root;
		if (curNode.id === id) {
			return curNode;
		}
		if (curNode.children.length !== 0) {
			for (let el of curNode.children) {
				if (this._find(el, id)) {
					return el;
				}
			}
		}
	}
}
