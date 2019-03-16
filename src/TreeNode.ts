import { finished } from "stream";

export default class TreeNode {
	public _name: string;
	public _id: string;
	public _props: any;
	public _children: any[];

	public constructor(node:any) {
		// console.log(node)
		this._name = node.name;
		this._id = node.id;
		this._props = node.props;
		this._children = [];
	}

	// Add new node to the tree
	public _add(node:any) {
		const newNode = new TreeNode(node);
		this._children.push(newNode);
	}

	// Search if there is a node with matching id.
	public _find(root:any, id:any) {
		let curNode = root;
		if (curNode._id === id) {
			return curNode;
		}
		if (curNode._children.length !== 0) {
			for (let el of curNode._children) {
				if (this._find(el, id)) {
					return el;
				}
			}
		}
	}
}
