import { useEffect, useState } from "react";
import TreeChart from "./components/TreeView";
import { StoreConnection } from "./storeBridge";
import type { ComponentNode } from "./types";

const theme: "light" | "dark" =
  window.__REACTION_THEME__ === "light" ? "light" : "dark";

const vscodeApi = acquireVsCodeApi();

export default function App() {
  const [tree, setTree] = useState<ComponentNode | undefined>(undefined);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connection = new StoreConnection(vscodeApi, setTree);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string };
      if (data?.type === "backend-connected") {
        setConnected(true);
      } else if (data?.type === "backend-disconnected") {
        setConnected(false);
      }
      connection.handleHostMessage(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      connection.dispose();
    };
  }, []);

  if (!tree) {
    return (
      <p style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
        {connected
          ? "Connected. Waiting for React components…"
          : "Connecting to the React app…"}
      </p>
    );
  }

  return <TreeChart data={tree} theme={theme} />;
}
