import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import styled from "styled-components";
import type { ComponentNode } from "../types";
import { layoutTree, type FlowNode as FlowNodeType } from "../flowLayout";
import FlowNode from "./FlowNode";
import "./flow.css";

interface TreeChartProps {
  data: ComponentNode;
  theme: "light" | "dark";
}

const Container = styled.div<{ $theme: "light" | "dark" }>`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: ${(props) =>
    props.$theme === "light" ? "#ffffff" : "#1e1e1e"};
  color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  font-family: "Segoe UI", system-ui, sans-serif;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 240px;
  padding: 4px 8px;
  font-size: 12px;
`;

// Stable reference: React Flow warns if nodeTypes is recreated every render.
const nodeTypes = { component: FlowNode };

// Renders the live component tree as a React Flow graph, laid out with dagre.
// Nodes can be collapsed to hide a subtree, and the search box dims non-matches.
function FlowGraph({ data, theme }: TreeChartProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [direction, setDirection] = useState<"TB" | "LR">("TB");

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () =>
      layoutTree(data, {
        collapsedIds,
        searchTerm,
        direction,
        onToggleCollapse: toggleCollapse,
      }),
    [data, collapsedIds, searchTerm, direction, toggleCollapse],
  );

  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowNodeType>(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // The Store can mutate at any time; re-sync whenever a fresh layout is computed.
  useEffect(() => setNodes(layoutNodes), [layoutNodes, setNodes]);
  useEffect(() => setEdges(layoutEdges), [layoutEdges, setEdges]);

  const toggleOrientation = useCallback(() => {
    setDirection((current) => (current === "TB" ? "LR" : "TB"));
  }, []);

  return (
    <Container $theme={theme} className={`treeChart reaction-theme-${theme}`}>
      <Toolbar>
        <button onClick={toggleOrientation}>Change orientation</button>
        <SearchInput
          type="search"
          placeholder="Search components…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </Toolbar>
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          colorMode={theme}
          minZoom={0.05}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </Container>
  );
}

// Renders the scraped component hierarchy as a React Flow graph.
export default function TreeChart(props: TreeChartProps) {
  return (
    <ReactFlowProvider>
      <FlowGraph {...props} />
    </ReactFlowProvider>
  );
}
