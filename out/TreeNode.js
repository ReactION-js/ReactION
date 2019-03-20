"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TreeNode {
    constructor(node) {
        // console.log(node)
        this.name = node.name;
        this.id = node.id;
        this.props = node.props;
        this.children = [];
    }
    // Add new node to the tree
    _add(node) {
        const newNode = new TreeNode(node);
        this.children.push(newNode);
    }
    // Search if there is a node with matching id.
    _find(root, id) {
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
exports.default = TreeNode;
//# sourceMappingURL=TreeNode.js.map