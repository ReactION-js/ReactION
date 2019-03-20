export default class TreeNode {
	public name: string;
	public id: string;
	public attributes: any;
	public parentId: any;
	public children: any[];

	public constructor(node: any) {
		// console.log(node)
		this.name = node.name;
		this.id = node.id;
		this.attributes = node.props;
		this.parentId = node.parentId;
		this.children = [];
	}

	// Add new node to the tree
	public _add(node: any) {
		const newNode = new TreeNode(node);
		this.children.push(newNode);
	}

	// Search if there is a node with matching id.
	public _find(root:any, parentId:any) {
		let curNode = root;
		if (curNode.id === parentId) {
			return curNode;
		}
		if (curNode.children.length !== 0) {
			for (let el of curNode.children) {
				const findParent: any = this._find(el, parentId);
				if (findParent) {
					return findParent;
				}
			}
		}
		return false;
	}
}
