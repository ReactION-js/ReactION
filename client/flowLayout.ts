import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { ComponentNode } from "./types";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 56;

// Data carried by each React Flow node for the "component" custom node type.
export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  typeLabel: string;
  hasChildren: boolean;
  collapsed: boolean;
  matchesSearch: boolean;
  onToggleCollapse: (id: string) => void;
}

export type FlowNode = Node<FlowNodeData, "component">;

interface LayoutOptions {
  collapsedIds: ReadonlySet<string>;
  searchTerm: string;
  direction: "TB" | "LR";
  onToggleCollapse: (id: string) => void;
}

// Flattens the ComponentNode tree into React Flow nodes/edges and lays them out
// with dagre. Descendants of a collapsed node are omitted so a large subtree can
// be shrunk without losing the rest of the graph.
export function layoutTree(
  root: ComponentNode,
  options: LayoutOptions,
): { nodes: FlowNode[]; edges: Edge[] } {
  const { collapsedIds, searchTerm, direction, onToggleCollapse } = options;
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 24, ranksep: 64 });

  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];
  const query = searchTerm.trim().toLowerCase();

  const visit = (node: ComponentNode, parentId: string | undefined): void => {
    const id = node.id ?? node.name;
    const hasChildren = (node.children?.length ?? 0) > 0;
    const collapsed = collapsedIds.has(id);

    graph.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id,
      type: "component",
      position: { x: 0, y: 0 },
      data: {
        label: node.name,
        typeLabel: node.attributes?.[0] ?? "",
        hasChildren,
        collapsed,
        matchesSearch:
          query.length === 0 || node.name.toLowerCase().includes(query),
        onToggleCollapse,
      },
    });

    if (parentId) {
      graph.setEdge(parentId, id);
      edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
    }

    if (!collapsed) {
      node.children?.forEach((child) => visit(child, id));
    }
  };

  visit(root, undefined);
  dagre.layout(graph);

  for (const node of nodes) {
    const laidOut = graph.node(node.id) as { x: number; y: number };
    node.position = {
      x: laidOut.x - NODE_WIDTH / 2,
      y: laidOut.y - NODE_HEIGHT / 2,
    };
  }

  return { nodes, edges };
}
