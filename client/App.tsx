import { useCallback, useEffect, useRef, useState } from "react";
import TreeChart from "./components/TreeView";
import Spinner from "./components/Spinner";
import { StoreConnection } from "./storeBridge";
import {
  ElementInspector,
  INITIAL_INSPECTOR_STATE,
  type InspectableCategory,
  type InspectorState,
} from "./elementInspection";
import { findMountedElementIdsByDisplayName } from "./selectByComponent";
import { useStaticComponentTree } from "./useStaticComponentTree";
import type { ComponentNode } from "./types";
import type { DevtoolsStore, InspectedElementResponse } from "react-devtools-inline/frontend";

const theme: "light" | "dark" =
  window.__REACTION_THEME__ === "light" ? "light" : "dark";

// Set once by the host at panel creation (src/TreeViewPanel.ts) and never
// changed for the lifetime of this webview -- "static" and "live" are now
// separate tabs/panels, not a runtime toggle within one panel. Read as a
// plain constant (not state) since there is nothing that ever changes it
// after this module first evaluates.
const mode: "static" | "live" = window.__REACTION_MODE__ === "live" ? "live" : "static";

// 7s: long enough to absorb a slow dev-server compile/HMR cycle right after
// connect, short enough that a genuinely React-less page (closes #73) doesn't
// leave the user staring at "waiting" indefinitely. Overridable only for the
// manual empty-state check in spike/run-phase2-visual.js -- unset in the real
// extension host, so shipped behavior always uses this default.
const EMPTY_STATE_TIMEOUT_MS =
  typeof window.__REACTION_EMPTY_STATE_TIMEOUT_MS__ === "number" &&
  window.__REACTION_EMPTY_STATE_TIMEOUT_MS__ > 0
    ? window.__REACTION_EMPTY_STATE_TIMEOUT_MS__
    : 7000;

const NO_REACT_DETECTED_MESSAGE =
  "No React components detected. This can happen if: the app isn't using a " +
  "development build (production builds strip the hook DevTools relies on), " +
  "no React root has mounted yet at this URL, or the wrong URL/port is configured.";

// How long a "selectByComponent" result notice (zero-match / multi-match,
// see the message handler below) stays visible before clearing itself --
// transient, not something that needs a dismiss button for a one-line status.
const SELECTION_NOTICE_TIMEOUT_MS = 5000;

const NOTICE_STYLE = {
  position: "fixed",
  top: 8,
  right: 8,
  zIndex: 1000,
  maxWidth: 360,
  padding: "8px 12px",
  borderRadius: 4,
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  color: "#fff",
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
} as const;

const vscodeApi = acquireVsCodeApi();

export default function App() {
  const [tree, setTree] = useState<ComponentNode | undefined>(undefined);
  // Only actually populated in "static" mode -- see useStaticComponentTree's
  // own comment. Calling it unconditionally keeps this a plain hook call (no
  // rules-of-hooks issue); in "live" mode the host never wires
  // staticComponentTreeWiring at all, so no "staticComponentTree" message
  // ever arrives and this just stays undefined.
  const staticTree = useStaticComponentTree();
  const displayTree = mode === "static" ? staticTree : tree;
  // Distinguishes "haven't asked to connect yet" from "asked, still
  // connecting" -- both look like `!connected` below, but should render very
  // differently (a "Connect to live app" call to action vs. the existing
  // "Connecting…" status). Only meaningful in "live" mode.
  const [liveConnectionRequested, setLiveConnectionRequested] = useState(false);
  const connectToLiveApp = useCallback(() => {
    setLiveConnectionRequested(true);
    vscodeApi.postMessage({ type: "connectToLiveApp" });
  }, []);
  const [connected, setConnected] = useState(false);
  const [inspectorState, setInspectorState] = useState<InspectorState>(
    INITIAL_INSPECTOR_STATE,
  );
  const [store, setStore] = useState<DevtoolsStore | undefined>(undefined);
  const [noReactDetected, setNoReactDetected] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | undefined>(undefined);
  const [startError, setStartError] = useState<{ title: string; hint: string } | undefined>(
    undefined,
  );
  const inspectorRef = useRef<ElementInspector | undefined>(undefined);

  // Auto-dismiss: a "selectByComponent" result notice is a one-line transient
  // status, not something that should linger until the user notices it and
  // closes it themselves.
  useEffect(() => {
    if (!selectionNotice) {
      return;
    }
    const timer = window.setTimeout(() => setSelectionNotice(undefined), SELECTION_NOTICE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [selectionNotice]);

  // Arms a fresh empty-state timer whenever connected while treeless, and
  // clears it the moment either condition stops holding -- the effect
  // cleanup guarantees at most one pending timer, so a reconnect re-arms
  // exactly one timer instead of leaving a stale one running or stacking
  // duplicates across repeated connect/disconnect cycles.
  const hasTree = tree !== undefined;
  useEffect(() => {
    if (!connected || hasTree) {
      setNoReactDetected(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setNoReactDetected(true);
      vscodeApi.postMessage({ type: "noReactDetected", elapsedMs: EMPTY_STATE_TIMEOUT_MS });
    }, EMPTY_STATE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [connected, hasTree]);

  useEffect(() => {
    const connection = new StoreConnection(vscodeApi, setTree);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string };
      // Let the tree/store react first so a fresh bridge+store exist by the
      // time we (re)bind the inspector below.
      connection.handleHostMessage(event.data);
      if (data?.type === "backend-connected") {
        setConnected(true);
        setStartError(undefined);
        inspectorRef.current?.dispose();
        const bridge = connection.getBridge();
        const newStore = connection.getStore();
        inspectorRef.current =
          bridge && newStore
            ? new ElementInspector(bridge, newStore, setInspectorState)
            : undefined;
        setInspectorState(INITIAL_INSPECTOR_STATE);
        // A reconnect builds an entirely fresh Store (storeBridge.ts), so
        // any profiling/heatmap state TreeView derived from the previous
        // Store's fiber ids must not linger against this one -- swapping the
        // `store` reference unmounts/remounts TreeChart below (it only
        // renders once `tree` is populated again), which discards it.
        setStore(newStore);
      } else if (data?.type === "backend-disconnected") {
        setConnected(false);
        inspectorRef.current?.dispose();
        inspectorRef.current = undefined;
        setInspectorState(INITIAL_INSPECTOR_STATE);
        setStore(undefined);
      } else if (data?.type === "start-failed") {
        // The host (liveTreePipeline.ts) couldn't launch Chrome / reach the
        // dev server; show its actionable title+hint instead of a perpetual
        // "Connecting…".
        const failure = data as { title?: unknown; hint?: unknown };
        setStartError({
          title: typeof failure.title === "string" ? failure.title : "ReactION couldn't start.",
          hint: typeof failure.hint === "string" ? failure.hint : "",
        });
      } else if (data?.type === "selectByComponent") {
        // Task 5e: a CodeLens in the editor ("Select in ReactION") posted
        // this via src/selectInstanceWiring.ts. Reads the store fresh off
        // `connection` rather than the `store` React state above -- this
        // handler is captured once by the effect below and would otherwise
        // see a stale/undefined `store` from this effect's very first render.
        const displayName = (data as { displayName?: unknown }).displayName;
        if (typeof displayName !== "string") {
          return;
        }
        const liveStore = connection.getStore();
        if (!liveStore || !inspectorRef.current) {
          setSelectionNotice(`ReactION isn't connected, so "${displayName}" can't be selected.`);
          return;
        }
        const ids = findMountedElementIdsByDisplayName(liveStore, displayName);
        if (ids.length === 0) {
          setSelectionNotice(`"${displayName}" is not currently rendered.`);
          return;
        }
        // Same selection mechanism a node click uses (see TreeView.tsx's
        // handleNodeClick) -- selecting the first match is a deliberate
        // choice (documented on findMountedElementIdsByDisplayName), not an
        // arbitrary one: it's the same displayName-collision limitation
        // Task 5d's coverage feature and the context map already accept.
        inspectorRef.current.select(ids[0]);
        setSelectionNotice(
          ids.length > 1
            ? `${ids.length} live instances of "${displayName}" found — showing the first; see the graph for the others.`
            : undefined,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      inspectorRef.current?.dispose();
      connection.dispose();
    };
  }, []);

  const selectElement = useCallback((id: number) => {
    inspectorRef.current?.select(id);
  }, []);
  const deselectElement = useCallback(() => {
    inspectorRef.current?.deselect();
  }, []);
  const requestExpand = useCallback(
    (category: InspectableCategory, path: Array<string | number>) => {
      inspectorRef.current?.requestExpand(category, path);
    },
    [],
  );
  // Background, one-shot probe used by useContextMap.ts -- deliberately
  // routed through the same ElementInspector instance as select/requestExpand
  // above (rather than a second bridge listener) so it shares one requestID
  // sequence and is torn down for free on disconnect/reconnect.
  const inspectOnce = useCallback((id: number): Promise<InspectedElementResponse> => {
    if (!inspectorRef.current) {
      return Promise.resolve({ id, responseID: -1, type: "not-found" });
    }
    return inspectorRef.current.inspectOnce(id);
  }, []);
  // Host-only channel (not the wall/bridge to the page): the raw, 1-based
  // fileName/lineNumber/columnNumber straight off the protocol's `source`
  // tuple. The 1-based -> 0-based vscode.Position adjustment happens on the
  // host side (src/openSource.ts), which is where vscode.Position is built.
  const openSource = useCallback(
    (fileName: string, lineNumber: number, columnNumber: number) => {
      vscodeApi.postMessage({ type: "openSource", fileName, lineNumber, columnNumber });
    },
    [],
  );

  const notice = selectionNotice ? <div style={NOTICE_STYLE}>{selectionNotice}</div> : null;

  if (mode === "live" && !tree) {
    return (
      <>
        {notice}
        {!liveConnectionRequested ? (
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              padding: "1rem",
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: "0 0 12px" }}>
              Connect to your running React app to see real render counts, a wasted-render
              heatmap, and click-to-highlight in the browser. This launches a real Chrome window
              pointed at your dev server.
            </p>
            <button onClick={connectToLiveApp}>Connect to live app</button>
          </div>
        ) : startError && !connected ? (
          <div
            style={{
              fontFamily: "system-ui, sans-serif",
              padding: "1rem",
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            <p style={{ fontWeight: 600, margin: "0 0 8px" }}>{startError.title}</p>
            {startError.hint && <p style={{ margin: 0, opacity: 0.85 }}>{startError.hint}</p>}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "system-ui, sans-serif",
              padding: "1rem",
            }}
          >
            {!noReactDetected && <Spinner theme={theme} />}
            <span>
              {connected
                ? noReactDetected
                  ? NO_REACT_DETECTED_MESSAGE
                  : "Connected. Waiting for React components…"
                : "Connecting to the React app…"}
            </span>
          </div>
        )}
      </>
    );
  }

  if (mode === "static" && !staticTree) {
    return (
      <>
        {notice}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "system-ui, sans-serif",
            padding: "1rem",
          }}
        >
          <Spinner theme={theme} />
          <span>Analyzing your project's components…</span>
        </div>
      </>
    );
  }

  if (!displayTree) {
    // Unreachable in practice -- the two branches above already cover "live
    // mode with no live tree yet" and "static mode with no static tree yet",
    // so displayTree is always defined here. Keeps TypeScript's narrowing
    // honest instead of a non-null assertion.
    return null;
  }

  return (
    <>
      {notice}
      <TreeChart
        data={displayTree}
        theme={theme}
        mode={mode}
        store={store}
        vscodeApi={vscodeApi}
        inspector={{
          state: inspectorState,
          selectElement,
          deselectElement,
          requestExpand,
          openSource,
          inspectOnce,
        }}
      />
    </>
  );
}
