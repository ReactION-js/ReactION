// Shape of a React component node as rendered by the webview tree view.
export interface ComponentNode {
  name: string;
  id?: string;
  attributes?: string[];
  parentId?: string;
  display?: string;
  children?: ComponentNode[];
  // Only ever meaningfully set by the static composition tree
  // (src/staticComponentTree.ts) -- there's no live element to select/
  // inspect there, so a click opens this file directly instead (see
  // TreeView.tsx's handleNodeClick, which treats an empty/absent filePath as
  // "nothing to open here"). Absent for the live tree; empty for a static
  // tree's own synthetic "Roots" wrapper, which has no single file either.
  filePath?: string;
  line?: number;
  column?: number;
}
