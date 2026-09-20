import { useCallback, useEffect, useRef, useState } from "react";
import TreeChart from "./components/TreeView";
import { StoreConnection } from "./storeBridge";
import {
  ElementInspector,
  INITIAL_INSPECTOR_STATE,
  type InspectableCategory,
  type InspectorState,
} from "./elementInspection";
import type { ComponentNode } from "./types";
import type { DevtoolsStore, InspectedElementResponse } from "react-devtools-inline/frontend";

const theme: "light" | "dark" =
  window.__REACTION_THEME__ === "light" ? "light" : "dark";

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

const vscodeApi = acquireVsCodeApi();

export default function App() {
  const [tree, setTree] = useState<ComponentNode | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [inspectorState, setInspectorState] = useState<InspectorState>(
    INITIAL_INSPECTOR_STATE,
  );
  const [store, setStore] = useState<DevtoolsStore | undefined>(undefined);
  const [noReactDetected, setNoReactDetected] = useState(false);
  const inspectorRef = useRef<ElementInspector | undefined>(undefined);

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

  if (!tree) {
    return (
      <p style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
        {connected
          ? noReactDetected
            ? NO_REACT_DETECTED_MESSAGE
            : "Connected. Waiting for React components…"
          : "Connecting to the React app…"}
      </p>
    );
  }

  return (
    <TreeChart
      data={tree}
      theme={theme}
      store={store}
      inspector={{
        state: inspectorState,
        selectElement,
        deselectElement,
        requestExpand,
        openSource,
        inspectOnce,
      }}
    />
  );
}
