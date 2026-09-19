// A single scraped React component in the flat form produced by the page scrape.
export interface RawReactNode {
  id: string;
  parentId: string;
  name: string;
  props: string[];
  display?: string;
}

// A node in the hierarchical tree consumed by react-d3-tree in the webview.
export default class TreeNode {
  public readonly name: string;
  public readonly id: string;
  public readonly attributes: string[];
  public readonly parentId: string;
  public readonly display?: string;
  public readonly children: TreeNode[] = [];

  public constructor(node: RawReactNode) {
    this.name = node.name;
    this.id = node.id;
    this.attributes = node.props ?? [];
    this.parentId = node.parentId;
    this.display = node.display;
  }

  public add(node: RawReactNode): TreeNode {
    const child = new TreeNode(node);
    this.children.push(child);
    return child;
  }

  // Builds a hierarchical tree from a flat, pre-ordered list of scraped nodes in
  // O(n) using an id -> node index. Nodes whose parent is missing attach to the
  // root so nothing is silently dropped.
  public static buildTree(nodes: RawReactNode[]): TreeNode | undefined {
    if (nodes.length === 0) {
      return undefined;
    }

    const [rootData, ...rest] = nodes;
    const root = new TreeNode(rootData);
    const byId = new Map<string, TreeNode>([[root.id, root]]);

    for (const data of rest) {
      const parent = byId.get(data.parentId) ?? root;
      byId.set(data.id, parent.add(data));
    }

    return root;
  }
}
