"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TreeNode {
    constructor(node) {
        // console.log(node)
        this._name = node.name;
        this._id = node.id;
        this._props = node.props;
        this._children = [];
    }
    // Add new node to the tree
    _add(node) {
        const newNode = new TreeNode(node);
        this._children.push(newNode);
    }
    // Search if there is a node with matching id.
    _find(root, id) {
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
exports.default = TreeNode;
//# sourceMappingURL=TreeNode.js.map