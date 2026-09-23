import { useEffect, useState } from "react";
import type { ComponentNode } from "./types";

interface StaticComponentTreeMessage {
  type?: string;
  tree?: ComponentNode[];
}

// Receives the host's one-shot, proactively-pushed static composition
// forest (see src/staticComponentTreeWiring.ts) -- a structural preview
// built by parsing the workspace's own source (ts-morph JSX-composition
// analysis, see src/staticComponentTree.ts), available immediately on panel
// open, well before Puppeteer/the live DevTools connection exists. An array
// rather than a single ComponentNode: an unused root-level component (see
// staticComponentTree.ts) arrives as its own separate, disconnected entry
// rather than nested under the "Roots" wrapper alongside real entry points.
// Host-only channel (not the wall/bridge to the page), same pattern as
// useCoverage.ts's "staticComponents" listener. App.tsx holds this
// alongside the live tree and lets the user pick which one to view.
export function useStaticComponentTree(): ComponentNode[] | undefined {
  const [tree, setTree] = useState<ComponentNode[] | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as StaticComponentTreeMessage;
      if (data?.type !== "staticComponentTree") {
        return;
      }
      setTree(data.tree);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return tree;
}
