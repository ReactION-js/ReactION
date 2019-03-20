"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TreeNode {
    constructor(node) {
        // console.log(node)
        this.name = node.name;
        this.id = node.id;
        this.attributes = node.props;
        this.parentId = node.parentId;
        this.children = [];
    }
    // Add new node to the tree
    _add(node) {
        const newNode = new TreeNode(node);
        // console.log('this', this, 'new node', newNode)
        this.children.push(newNode);
    }
    // Search if there is a node with matching id.
    _find(root, parentId) {
        let curNode = root;
        if (curNode.id === parentId) {
            return curNode;
        }
        if (curNode.children.length !== 0) {
            for (let el of curNode.children) {
                const findParent = this._find(el, parentId);
                if (findParent) {
                    return findParent;
                }
            }
        }
        return false;
    }
}
exports.default = TreeNode;
//# sourceMappingURL=TreeNode.js.map