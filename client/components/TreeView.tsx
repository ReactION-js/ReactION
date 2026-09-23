import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import styled from "styled-components";
import type { DevtoolsStore, InspectedElementResponse } from "react-devtools-inline/frontend";
import type { ComponentNode } from "../types";
import { layoutTree, NODE_HEIGHT, NODE_WIDTH, type FlowNode as FlowNodeType } from "../flowLayout";
import {
  computeInitialCollapsedIds,
  findNodeByIdInForest,
  groupSiblingsByName,
} from "../treeGrouping";
import { useProfiler } from "../useProfiler";
import { useContextMap } from "../useContextMap";
import { useEverRendered } from "../useEverRendered";
import { useCoverage } from "../useCoverage";
import { useInitialLoadReport } from "../useInitialLoadReport";
import { useStaticComponentDetail } from "../useStaticComponentDetail";
import FlowNode from "./FlowNode";
import InspectorPanel from "./InspectorPanel";
import StaticInspectorPanel from "./StaticInspectorPanel";
import ContextMapPanel from "./ContextMapPanel";
import CoveragePanel from "./CoveragePanel";
import InitialLoadReportPanel from "./InitialLoadReportPanel";
import Tooltip from "./Tooltip";
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
  // A forest, not always a single tree: the live tree is always exactly one
  // root, but the static composition tree can be more than one disconnected
  // root (an unused root-level component gets its own separate entry rather
  // than being nested under "Roots" -- see staticComponentTree.ts). Accepting
  // both shapes here, rather than forcing App.tsx to always wrap a single
  // live tree in a one-element array, keeps the live path's existing typing
  // unchanged.
  data: ComponentNode | ComponentNode[];
  theme: "light" | "dark";
  // "static" and "live" are separate tabs/panels now (see App.tsx/
  // src/ViewPanel.ts), not a runtime toggle -- fixed for this component's
  // whole lifetime. Gates which toolbar buttons render at all: anything
  // that needs a live connection (Start Profiling, Check Coverage, Build
  // Context Map, the Initial Load Report) has no meaning in "static" mode
  // and isn't shown there, rather than shown-but-inert.
  mode: "static" | "live";
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

// How many nodes the graph starts with visible, before the user expands
// anything -- a real component tree can easily run into the thousands, which
// renders as an unusably huge graph on first paint. See treeGrouping.ts's
// computeInitialCollapsedIds for how this is turned into an initial
// collapsedIds set.
const INITIAL_VISIBLE_NODES = 10;

// How long `data` must go without changing before the initial collapse
// budget is computed and applied. The live app keeps mounting components for
// a while after the panel first connects (the same reason
// useInitialLoadReport.ts needs a settle window) -- computing the budget
// against whatever tiny slice of the tree happens to exist at the very first
// render badly undercounts, then never gets revisited, leaving most of the
// eventual tree uncollapsed with nothing to expand.
const INITIAL_COLLAPSE_SETTLE_MS = 500;

// Renders the live component tree as a React Flow graph, laid out with dagre.
// Nodes can be collapsed to hide a subtree, and the search box dims non-matches.
function FlowGraph({ data, theme, mode, inspector, store, vscodeApi }: TreeChartProps) {
  // Normalizes `data` to a forest -- always an array from here on, whether it
  // came in as the live tree's single ComponentNode or the static tree's
  // already-array forest (see TreeChartProps.data's own comment).
  const roots = useMemo(() => (Array.isArray(data) ? data : [data]), [data]);

  // Grouping only affects how the graph itself is drawn/collapsed, so it's
  // computed here rather than down by useEverRendered/useCoverage/
  // useInitialLoadReport below, which keep reading the real, ungrouped `data`
  // since they correlate by the actual displayNames/fiber ids storeBridge.ts
  // built, not the synthetic group labels.
  const groupedRoots = useMemo(() => roots.map((root) => groupSiblingsByName(root)), [roots]);

  // Bounds the very FIRST paint too, not just the one 500ms later (see the
  // settle effect below): a live tree can already have plenty mounted by the
  // time this component's first render happens (storeBridge.ts's tree only
  // reaches here once React itself has committed something), so starting
  // from an empty Set and waiting out the settle window would flash the
  // exact "hundreds of nodes at once" view this budget exists to prevent,
  // for however long that first burst of mounts takes. Static mode still
  // starts fully expanded (see the settle effect's own comment on why).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() =>
    mode === "live" ? computeInitialCollapsedIds(groupedRoots, INITIAL_VISIBLE_NODES) : new Set(),
  );
  // Set the instant the user manually expands/collapses anything, so the
  // deferred initial-budget effect below never clobbers a choice they've
  // already made while still waiting for the tree to settle.
  const hasUserToggledRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [direction, setDirection] = useState<"TB" | "LR">("TB");
  // Derived, not its own state: inspector.state.elementId is already updated
  // synchronously by ElementInspector.select()/.deselect() (see
  // elementInspection.ts), no matter what triggers it -- a node click, the
  // Task 5e CodeLens flow, or the inspector clearing itself on
  // disconnect/not-found. Deriving means the ring/panel below are always
  // correct in the SAME commit as inspector.state changes, instead of
  // lagging a commit behind a separate sync effect.
  const selectedId =
    inspector.state.elementId !== null ? String(inspector.state.elementId) : undefined;

  const toggleCollapse = useCallback(
    (id: string) => {
      hasUserToggledRef.current = true;
      setCollapsedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          // Expanding: reveal this node's direct children, but only one
          // level at a time -- any child that itself has children starts
          // collapsed too, rather than the entire subtree beneath it
          // cascading into view in a single click (nothing below the
          // toggled node was ever added to collapsedIds, so without this it
          // would all render at once, however deep and wide it goes).
          next.delete(id);
          const node = findNodeByIdInForest(groupedRoots, id);
          for (const child of node?.children ?? []) {
            if ((child.children?.length ?? 0) > 0) {
              next.add(child.id ?? child.name);
            }
          }
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [groupedRoots],
  );

  // Forces a re-fit whenever it changes (see the effect below) -- bumped by
  // expandAll/collapseAll and by the live-only initial-budget effect further
  // down, i.e. exactly the actions that change how much of the graph is
  // visible in one shot. Deliberately NOT bumped by a single node's own
  // toggleCollapse (constantly re-framing the whole graph while someone is
  // incrementally exploring it would be more disorienting than helpful) or
  // by the live tree's own organic growth (nodes changes on every mutation;
  // re-fitting on every one of those would make an actively-updating live
  // graph impossible to look at).
  const [refitToken, setRefitToken] = useState(0);
  const { fitView, setCenter } = useReactFlow();

  const expandAll = useCallback(() => {
    hasUserToggledRef.current = true;
    setCollapsedIds(new Set());
    setRefitToken((token) => token + 1);
  }, []);

  const collapseAll = useCallback(() => {
    hasUserToggledRef.current = true;
    setCollapsedIds(computeInitialCollapsedIds(groupedRoots, INITIAL_VISIBLE_NODES));
    setRefitToken((token) => token + 1);
  }, [groupedRoots]);

  // Applies the initial "~10 visible" default once `data` has gone quiet for
  // INITIAL_COLLAPSE_SETTLE_MS -- see that constant's comment. Live mode
  // only: a live tree can genuinely explode to thousands of framework-
  // wrapped instances (see treeGrouping.ts's own history), so it needs a
  // budget; the static composition tree doesn't have that failure mode
  // (grouping already collapses repeated siblings, and it's capped at a
  // sane total by staticComponentTree.ts's own MAX_NODES) and showing the
  // whole thing by default is the more useful "overview" behavior for it.
  // Resets the timer on every `data` change (a mutation while still
  // settling pushes the deadline back out, exactly like
  // useInitialLoadReport.ts's own settle timer), and is a no-op from the
  // moment the user manually toggles anything, whether that's before or
  // after this ever fires.
  useEffect(() => {
    if (mode !== "live" || hasUserToggledRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (!hasUserToggledRef.current) {
        setCollapsedIds(computeInitialCollapsedIds(groupedRoots, INITIAL_VISIBLE_NODES));
        setRefitToken((token) => token + 1);
      }
    }, INITIAL_COLLAPSE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mode, groupedRoots]);

  // The live tree is always exactly one root (unlike the static forest,
  // which can be several) -- these two hooks only ever do anything in live
  // mode (both gate on `store`, which is always undefined in static mode),
  // and only ever need this one root as a re-run signal, not the whole
  // forest.
  const liveRoot = mode === "live" ? roots[0] : undefined;
  const profiler = useProfiler(store, inspector.state.elementId);
  const contextMap = useContextMap(store, inspector.inspectOnce);
  const everRendered = useEverRendered(store, liveRoot);
  const coverage = useCoverage(store, vscodeApi, everRendered.getEverRenderedNames);
  const initialLoadReport = useInitialLoadReport(store, liveRoot);
  const staticDetail = useStaticComponentDetail(vscodeApi);
  // The ring/panel logic below needs one combined "what's selected right
  // now" id regardless of which kind of selection it is -- a live element
  // (inspector.state) or a static-tree node (staticDetail) -- since only one
  // of the two is ever meaningful at a time (a static tree has no live
  // elementId, a live tree never populates staticDetail).
  const effectiveSelectedId = selectedId ?? staticDetail.selectedId;

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () =>
      layoutTree(groupedRoots, {
        collapsedIds,
        searchTerm,
        direction,
        selectedId: effectiveSelectedId,
        onToggleCollapse: toggleCollapse,
        renderCounts: profiler.renderCounts,
      }),
    [
      groupedRoots,
      collapsedIds,
      searchTerm,
      direction,
      effectiveSelectedId,
      toggleCollapse,
      profiler.renderCounts,
    ],
  );

  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowNodeType>(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // The Store can mutate at any time; re-sync whenever a fresh layout is computed.
  useEffect(() => setNodes(layoutNodes), [layoutNodes, setNodes]);
  useEffect(() => setEdges(layoutEdges), [layoutEdges, setEdges]);

  // One-time center-on-root once real nodes actually exist, at a fixed,
  // comfortable zoom -- NOT a fit-everything view. A zoomed-out view of the
  // whole tree crams potentially hundreds of nodes into one screen, which
  // reads as a wall of tiny illegible boxes rather than anything useful;
  // starting at the root, readably zoomed, mirrors how you'd actually start
  // reading a tree (from the top, one screenful at a time, expanding as you
  // go) -- especially since the static tree now starts fully expanded (see
  // this component's own history), so it needs a sane starting viewport
  // more than ever. `nodes[0]` is reliably the first (and, for the live tree,
  // only) root: layoutTree's own visit() pushes a node before recursing into
  // its children, and walks `roots` in order, so the very first element is
  // always where the first root's walk started. A multi-root static forest
  // still centers on that one root -- any unused-component islands sit
  // elsewhere in the layout, reachable by panning/searching rather than the
  // initial viewport. requestAnimationFrame
  // defers one paint so the just-mounted node's DOM dimensions are
  // measured first (a known React Flow gotcha otherwise). Runs only once
  // per mount (hasCenteredOnceRef), not on every subsequent `nodes` change
  // -- a live tree's `nodes` changes on every mutation, and re-centering on
  // each of those would make an actively-updating graph impossible to look
  // at.
  const hasCenteredOnceRef = useRef(false);
  useEffect(() => {
    if (hasCenteredOnceRef.current || nodes.length === 0) {
      return;
    }
    hasCenteredOnceRef.current = true;
    const root = nodes[0];
    const frame = requestAnimationFrame(() => {
      setCenter(root.position.x + NODE_WIDTH / 2, root.position.y + NODE_HEIGHT / 2, {
        zoom: 1,
        duration: 0,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, setCenter]);

  // Re-fits whenever refitToken is bumped (expandAll/collapseAll, or the
  // live tree's own initial-budget collapse) -- the exact actions that
  // change how much of the graph is visible in one shot, so the viewport
  // should track them rather than staying at whatever zoom level fit a
  // now-stale node count (see this bug's original report: the graph fit
  // itself to a much larger node set than what ended up visible, leaving a
  // handful of real nodes as a tiny speck in a mostly-empty canvas).
  useEffect(() => {
    if (refitToken === 0) {
      return; // Initial value; the mount-time effect above already handles the first fit.
    }
    const frame = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [refitToken, fitView]);

  const toggleOrientation = useCallback(() => {
    setDirection((current) => (current === "TB" ? "LR" : "TB"));
  }, []);

  const { deselectElement, selectElement } = inspector;
  const handleDeselect = useCallback(() => {
    deselectElement();
  }, [deselectElement]);

  const handleNodeClick = useCallback<NodeMouseHandler<FlowNodeType>>(
    (_event, node) => {
      const numericId = Number(node.id);
      if (Number.isNaN(numericId)) {
        // Not a live element id -- either the synthetic "Roots" wrapper (no
        // real component behind it, nothing to select) or a static
        // composition tree node, which has no live element but does have a
        // real component worth showing in the sidebar.
        const staticNode = findNodeByIdInForest(groupedRoots, node.id);
        if (!staticNode?.filePath) {
          return;
        }
        if (staticDetail.selectedId === node.id) {
          staticDetail.deselect();
        } else {
          staticDetail.select(node.id);
        }
        return;
      }
      if (selectedId === node.id) {
        handleDeselect();
      } else {
        selectElement(numericId);
      }
    },
    [selectedId, selectElement, handleDeselect, groupedRoots, staticDetail],
  );

  const handlePaneClick = useCallback(() => {
    if (selectedId !== undefined) {
      handleDeselect();
    } else if (staticDetail.selectedId !== undefined) {
      staticDetail.deselect();
    }
  }, [selectedId, handleDeselect, staticDetail]);

  const selectedNode = selectedId
    ? layoutNodes.find((node) => node.id === selectedId)
    : undefined;

  return (
    <Container $theme={theme} className={`treeChart reaction-theme-${theme}`}>
      <Toolbar>
        {mode === "live" && (
          <>
            <Tooltip
              theme={theme}
              label={
                profiler.isProfiling
                  ? "Stop recording and show how many times — and why — each component re-rendered."
                  : "Record component re-renders while you use your app: click to start, interact with the app, then Stop to see per-component render counts (highlighted on the graph) and why each one re-rendered."
              }
            >
              <button onClick={profiler.toggleProfiling} disabled={profiler.toggleDisabled}>
                {profiler.isProfiling ? "Stop Profiling" : "Start Profiling"}
              </button>
            </Tooltip>
            <ContextMapPanel theme={theme} controller={contextMap} />
            <CoveragePanel theme={theme} controller={coverage} onOpenSource={inspector.openSource} />
            <InitialLoadReportPanel theme={theme} controller={initialLoadReport} />
          </>
        )}
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
          >
            <Background />
            <Controls>
              <ControlButton
                onClick={toggleOrientation}
                title="Switch the graph between top-to-bottom and left-to-right layouts."
                aria-label="Switch the graph between top-to-bottom and left-to-right layouts."
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>⇄</span>
              </ControlButton>
              <ControlButton
                onClick={expandAll}
                title="Expand every node in the graph, all at once."
                aria-label="Expand every node in the graph, all at once."
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>⊞</span>
              </ControlButton>
              <ControlButton
                onClick={collapseAll}
                title="Collapse the graph back down to its initial ~10-node view."
                aria-label="Collapse the graph back down to its initial ~10-node view."
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>⊟</span>
              </ControlButton>
            </Controls>
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
        {staticDetail.selectedId !== undefined && (
          <StaticInspectorPanel
            theme={theme}
            controller={staticDetail}
            onOpenSource={inspector.openSource}
            onSelectComponent={staticDetail.select}
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
