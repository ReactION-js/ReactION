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
import type { CommitDataFrontend, DevtoolsStore } from "react-devtools-inline/frontend";
import type { ComponentNode } from "../types";
import { layoutTree, type FlowNode as FlowNodeType } from "../flowLayout";
import { computeRenderCounts, describeChange, isWastedRender } from "../renderStats";
import FlowNode from "./FlowNode";
import InspectorPanel, { type RenderReason } from "./InspectorPanel";
import type { InspectableCategory, InspectorState } from "../elementInspection";
import "./flow.css";

export interface InspectorController {
  state: InspectorState;
  selectElement: (id: number) => void;
  deselectElement: () => void;
  requestExpand: (category: InspectableCategory, path: Array<string | number>) => void;
  openSource: (fileName: string, lineNumber: number, columnNumber: number) => void;
}

// A completed profiling run's commit data, reshaped for this view: per-root
// (so InspectorPanel can find "the most recent commit" for whichever root
// the selected element belongs to) and merged into a single render-count map
// (fiber ids are globally unique, so merging across roots is safe).
interface ProfilingSnapshot {
  commitsByRoot: Map<number, CommitDataFrontend[]>;
  renderCounts: Map<number, number>;
}

interface TreeChartProps {
  data: ComponentNode;
  theme: "light" | "dark";
  inspector: InspectorController;
  store: DevtoolsStore | undefined;
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
function FlowGraph({ data, theme, inspector, store }: TreeChartProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [direction, setDirection] = useState<"TB" | "LR">("TB");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isProfiling, setIsProfiling] = useState(false);
  const [isProcessingData, setIsProcessingData] = useState(false);
  const [profilingSnapshot, setProfilingSnapshot] = useState<ProfilingSnapshot | undefined>(
    undefined,
  );

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

  // Bind to the live profiler session for the current Store. A reconnect
  // swaps `store` for a brand-new instance (see App.tsx), so this re-binds
  // (and the cleanup below unbinds the old listeners) whenever that happens;
  // profilingSnapshot itself is reset by TreeChart/FlowGraph unmounting
  // entirely while disconnected (App.tsx only renders this component once a
  // tree exists again), so stale data referencing the old Store's fiber ids
  // never lingers.
  useEffect(() => {
    if (!store) {
      return;
    }
    const profilerStore = store.profilerStore;

    const syncIsProfiling = () => {
      setIsProfiling(profilerStore.isProfilingBasedOnUserInput);
    };

    // 'isProcessingData' fires twice per stop: once when the frontend starts
    // re-requesting data from each renderer (isProcessingData still true --
    // ignore, other than tracking it below), and again once every renderer
    // has reported back and the frontend-shaped data has been rebuilt
    // (isProcessingData now false -- that's the one that means fresh commit
    // data is actually readable).
    const handleProfilingDataChange = () => {
      setIsProcessingData(profilerStore.isProcessingData);
      if (profilerStore.isProcessingData) {
        return;
      }
      const commitsByRoot = new Map<number, CommitDataFrontend[]>();
      const allCommits: CommitDataFrontend[] = [];
      for (const rootID of store.roots) {
        try {
          const dataForRoot = profilerStore.getDataForRoot(rootID);
          commitsByRoot.set(rootID, dataForRoot.commitData);
          allCommits.push(...dataForRoot.commitData);
        } catch {
          // No commits were recorded for this root during the run.
        }
      }
      setProfilingSnapshot({ commitsByRoot, renderCounts: computeRenderCounts(allCommits) });
    };

    profilerStore.addListener("isProfiling", syncIsProfiling);
    profilerStore.addListener("isProcessingData", handleProfilingDataChange);
    syncIsProfiling();
    setIsProcessingData(profilerStore.isProcessingData);

    return () => {
      profilerStore.removeListener("isProfiling", syncIsProfiling);
      profilerStore.removeListener("isProcessingData", handleProfilingDataChange);
    };
  }, [store]);

  const toggleProfiling = useCallback(() => {
    if (!store) {
      return;
    }
    if (isProfiling) {
      store.profilerStore.stopProfiling();
    } else if (!isProcessingData) {
      // Starting a new session while the previous stop's commit data is
      // still being fetched from the backend races ProfilerStore's own
      // internals: startProfiling() clears its `_rendererQueue` (via
      // clear()), so a still-in-flight 'profilingData' response for the OLD
      // session can find its renderer id no longer in that queue and throw
      // ("Unexpected profiling data update...") inside the library itself.
      // The button below stays disabled for this same window so this branch
      // is a belt-and-suspenders guard, not the only protection.
      // A new session replaces, rather than accumulates onto, the previous
      // run's heatmap -- clear our derived snapshot immediately so a stale
      // heatmap doesn't linger on screen while the new recording is live
      // (ProfilerStore.startProfiling() itself also clears its own
      // `_dataFrontend`, so the next getDataForRoot() call after this run's
      // stop only ever reflects this run, never the previous one).
      setProfilingSnapshot(undefined);
      store.recordChangeDescriptions = true;
      store.profilerStore.startProfiling();
    }
  }, [store, isProfiling, isProcessingData]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () =>
      layoutTree(data, {
        collapsedIds,
        searchTerm,
        direction,
        selectedId,
        onToggleCollapse: toggleCollapse,
        renderCounts: profilingSnapshot?.renderCounts,
      }),
    [data, collapsedIds, searchTerm, direction, selectedId, toggleCollapse, profilingSnapshot],
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

  // The most recent commit's changeDescription for the selected element, if
  // profiling data exists AND that element actually appeared in that
  // commit. Absent in every other case (never profiled, profiled but this
  // element bailed out of every commit, or nothing selected) -- callers must
  // not read "no reason" as "this never re-renders".
  const renderReason: RenderReason | undefined = useMemo(() => {
    const elementId = inspector.state.elementId;
    if (!store || !profilingSnapshot || elementId === null) {
      return undefined;
    }
    const rootID = store.getRootIDForElement(elementId);
    if (rootID === null) {
      return undefined;
    }
    const commits = profilingSnapshot.commitsByRoot.get(rootID);
    if (!commits || commits.length === 0) {
      return undefined;
    }
    const change = commits[commits.length - 1].changeDescriptions?.get(elementId);
    if (!change) {
      return undefined;
    }
    return { description: describeChange(change), wasted: isWastedRender(change) };
  }, [store, profilingSnapshot, inspector.state.elementId]);

  return (
    <Container $theme={theme} className={`treeChart reaction-theme-${theme}`}>
      <Toolbar>
        <button onClick={toggleOrientation}>Change orientation</button>
        <button
          onClick={toggleProfiling}
          disabled={!store || (!isProfiling && isProcessingData)}
        >
          {isProfiling ? "Stop Profiling" : "Start Profiling"}
        </button>
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
            renderReason={renderReason}
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
