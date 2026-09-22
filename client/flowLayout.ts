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
  selected: boolean;
  onToggleCollapse: (id: string) => void;
  // Number of commits (in the most recent profiling run) this element's
  // fiber actually ran in. Undefined when there's no profiling data at all,
  // OR when profiling data exists but this fiber never appeared in any
  // commit (a fully-bailed-out fiber) -- FlowNode must not conflate the two.
  renderCount?: number;
  // Shared across every node in the current layout, so FlowNode can scale a
  // single node's intensity relative to the whole graph. Both 0 when there's
  // no profiling data yet.
  minRenderCount: number;
  maxRenderCount: number;
}

export type FlowNode = Node<FlowNodeData, "component">;

interface LayoutOptions {
  collapsedIds: ReadonlySet<string>;
  searchTerm: string;
  direction: "TB" | "LR";
  selectedId?: string;
  onToggleCollapse: (id: string) => void;
  // Fiber/element id -> render count for the current profiling run, from
  // renderStats.computeRenderCounts. Omitted (never profiled) or empty
  // (profiled, but zero commits recorded) both mean "no heatmap to show".
  renderCounts?: ReadonlyMap<number, number>;
}

// Flattens a forest of ComponentNode trees into React Flow nodes/edges and lays
// them out with dagre. Descendants of a collapsed node are omitted so a large
// subtree can be shrunk without losing the rest of the graph. `roots` is a
// plain array rather than one wrapping node: each entry starts its own walk
// with no parentId, so dagre lays out multiple roots as genuinely disconnected
// graph components -- no edge implies a connection between them that isn't
// there (the live tree is always a one-element array; the static composition
// tree can have more than one, see staticComponentTree.ts).
export function layoutTree(
  roots: readonly ComponentNode[],
  options: LayoutOptions,
): { nodes: FlowNode[]; edges: Edge[] } {
  const { collapsedIds, searchTerm, direction, selectedId, onToggleCollapse, renderCounts } =
    options;
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 24, ranksep: 64 });

  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];
  const query = searchTerm.trim().toLowerCase();

  // A manual loop rather than Math.min(...counts)/Math.max(...counts):
  // spreading into a function call is limited by the JS engine's max
  // argument count, which a large enough component tree could theoretically
  // exceed.
  let minRenderCount = 0;
  let maxRenderCount = 0;
  if (renderCounts && renderCounts.size > 0) {
    let first = true;
    for (const count of renderCounts.values()) {
      if (first) {
        minRenderCount = count;
        maxRenderCount = count;
        first = false;
      } else {
        if (count < minRenderCount) {
          minRenderCount = count;
        }
        if (count > maxRenderCount) {
          maxRenderCount = count;
        }
      }
    }
  }

  const visit = (node: ComponentNode, parentId: string | undefined): void => {
    const id = node.id ?? node.name;
    const hasChildren = (node.children?.length ?? 0) > 0;
    const collapsed = collapsedIds.has(id);
    const numericId = Number(id);
    const renderCount = renderCounts?.get(numericId);

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
        selected: id === selectedId,
        onToggleCollapse,
        renderCount,
        minRenderCount,
        maxRenderCount,
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

  roots.forEach((root) => visit(root, undefined));
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
