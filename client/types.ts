// Shape of a scraped React component as delivered to the webview.
export interface ComponentNode {
  name: string;
  id?: string;
  attributes?: string[];
  parentId?: string;
  display?: string;
  children?: ComponentNode[];
}

// Messages posted from the extension host to the webview.
export type ReactionMessage = { type: "treeData"; data: ComponentNode };
