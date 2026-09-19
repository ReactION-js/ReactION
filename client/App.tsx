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
import type { DevtoolsStore } from "react-devtools-inline/frontend";

const theme: "light" | "dark" =
  window.__REACTION_THEME__ === "light" ? "light" : "dark";

const vscodeApi = acquireVsCodeApi();

export default function App() {
  const [tree, setTree] = useState<ComponentNode | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const [inspectorState, setInspectorState] = useState<InspectorState>(
    INITIAL_INSPECTOR_STATE,
  );
  const [store, setStore] = useState<DevtoolsStore | undefined>(undefined);
  const inspectorRef = useRef<ElementInspector | undefined>(undefined);

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
          ? "Connected. Waiting for React components…"
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
      }}
    />
  );
}
