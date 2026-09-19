// Shape of a React component node as rendered by the webview tree view.
export interface ComponentNode {
  name: string;
  id?: string;
  attributes?: string[];
  parentId?: string;
  display?: string;
  children?: ComponentNode[];
}
