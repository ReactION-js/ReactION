export default class TreeNode {
	public _name: string;
	public _id: string;
	public _props: any;
	public _children: any[];

	public constructor(node:any) {
		this._name = node.name;
		this._id = node.id;
		this._props = node.props;
		this._children = [];
	}

	public add(node:any) {
		const newNode = new TreeNode(node);
		this._children.push(newNode);
	}

	public find(root:any, id:any) {
		if (root.id === id) {
			return root;
		}

	}
}
