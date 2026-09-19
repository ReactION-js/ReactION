import { useEffect, useState } from "react";
import TreeChart from "./components/TreeView";
import type { ComponentNode, ReactionMessage } from "./types";

const theme: "light" | "dark" =
  window.__REACTION_THEME__ === "light" ? "light" : "dark";

export default function App() {
  const [tree, setTree] = useState<ComponentNode | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ReactionMessage>) => {
      if (event.data?.type === "treeData") {
        setTree(event.data.data);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!tree) {
    return (
      <p style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
        Waiting for a React app…
      </p>
    );
  }

  return <TreeChart data={tree} theme={theme} />;
}
