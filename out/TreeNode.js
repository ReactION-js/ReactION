"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class TreeNode {
    constructor(node) {
        this._name = node.name;
        this._id = node.id;
        this._props = node.props;
        this._children = [];
    }
    add(node) {
        const newNode = new TreeNode(node);
        this._children.push(newNode);
    }
    find(root, id) {
        if (root.id === id) {
            return root;
        }
    }
}
exports.default = TreeNode;
//# sourceMappingURL=TreeNode.js.map