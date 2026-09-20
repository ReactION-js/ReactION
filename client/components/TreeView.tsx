import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import styled from "styled-components";
import type { DevtoolsStore, InspectedElementResponse } from "react-devtools-inline/frontend";
import type { ComponentNode } from "../types";
import { layoutTree, type FlowNode as FlowNodeType } from "../flowLayout";
import { useProfiler } from "../useProfiler";
import { useContextMap } from "../useContextMap";
import { useEverRendered } from "../useEverRendered";
import { useCoverage } from "../useCoverage";
import FlowNode from "./FlowNode";
import InspectorPanel from "./InspectorPanel";
import ContextMapPanel from "./ContextMapPanel";
import CoveragePanel from "./CoveragePanel";
import type { InspectableCategory, InspectorState } from "../elementInspection";
import "./flow.css";

export interface InspectorController {
  state: InspectorState;
  selectElement: (id: number) => void;
  deselectElement: () => void;
  requestExpand: (category: InspectableCategory, path: Array<string | number>) => void;
  openSource: (fileName: string, lineNumber: number, columnNumber: number) => void;
  inspectOnce: (id: number) => Promise<InspectedElementResponse>;
}

interface TreeChartProps {
  data: ComponentNode;
  theme: "light" | "dark";
  inspector: InspectorController;
  store: DevtoolsStore | undefined;
  vscodeApi: VsCodeApi;
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
function FlowGraph({ data, theme, inspector, store, vscodeApi }: TreeChartProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [direction, setDirection] = useState<"TB" | "LR">("TB");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

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

  const profiler = useProfiler(store, inspector.state.elementId);
  const contextMap = useContextMap(store, inspector.inspectOnce);
  const everRendered = useEverRendered(store);
  const coverage = useCoverage(store, vscodeApi, everRendered.getEverRenderedNames);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () =>
      layoutTree(data, {
        collapsedIds,
        searchTerm,
        direction,
        selectedId,
        onToggleCollapse: toggleCollapse,
        renderCounts: profiler.renderCounts,
      }),
    [data, collapsedIds, searchTerm, direction, selectedId, toggleCollapse, profiler.renderCounts],
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

  const { deselectElement, selectElement } = inspector;
  const handleDeselect = useCallback(() => {
    setSelectedId(undefined);
    deselectElement();
  }, [deselectElement]);

  const handleNodeClick = useCallback<NodeMouseHandler<FlowNodeType>>(
    (_event, node) => {
      const numericId = Number(node.id);
      if (Number.isNaN(numericId)) {
        return; // The synthetic multi-root "Roots" node isn't inspectable.
      }
      if (selectedId === node.id) {
        handleDeselect();
      } else {
        setSelectedId(node.id);
        selectElement(numericId);
      }
    },
    [selectedId, selectElement, handleDeselect],
  );

  const handlePaneClick = useCallback(() => {
    if (selectedId !== undefined) {
      handleDeselect();
    }
  }, [selectedId, handleDeselect]);

  // The inspector can clear itself independently of a click (e.g. the element
  // unmounted -> "not-found", or the backend disconnected); keep the graph's
  // own selection in sync so a stale highlight/panel doesn't linger.
  useEffect(() => {
    if (inspector.state.elementId === null && selectedId !== undefined) {
      setSelectedId(undefined);
    }
  }, [inspector.state.elementId, selectedId]);

  const selectedNode = selectedId
    ? layoutNodes.find((node) => node.id === selectedId)
    : undefined;

  return (
    <Container $theme={theme} className={`treeChart reaction-theme-${theme}`}>
      <Toolbar>
        <button onClick={toggleOrientation}>Change orientation</button>
        <button onClick={profiler.toggleProfiling} disabled={profiler.toggleDisabled}>
          {profiler.isProfiling ? "Stop Profiling" : "Start Profiling"}
        </button>
        <ContextMapPanel theme={theme} controller={contextMap} />
        <CoveragePanel theme={theme} controller={coverage} onOpenSource={inspector.openSource} />
        <SearchInput
          type="search"
          placeholder="Search components…"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </Toolbar>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
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
        {selectedNode && (
          <InspectorPanel
            theme={theme}
            label={selectedNode.data.label}
            typeLabel={selectedNode.data.typeLabel}
            state={inspector.state}
            onExpand={inspector.requestExpand}
            onClose={handleDeselect}
            onOpenSource={inspector.openSource}
            renderReason={profiler.renderReason}
          />
        )}
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
