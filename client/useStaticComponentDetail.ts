import { useCallback, useEffect, useRef, useState } from "react";
import type { StaticComponentDetail } from "./staticComponentDetail";

export interface StaticComponentDetailController {
  selectedId: string | undefined;
  detail: StaticComponentDetail | undefined;
  loading: boolean;
  select: (id: string) => void;
  deselect: () => void;
}

interface StaticComponentDetailMessage {
  type?: string;
  id?: string;
  detail?: StaticComponentDetail;
}

// Drives the static tree's per-node sidebar (StaticInspectorPanel.tsx):
// requests src/staticComponentDetailWiring.ts's enriched payload for a
// clicked static-tree node id and holds whichever response is CURRENT -- a
// response for an id that's since been superseded by a newer selection (or
// a deselect) is dropped via selectedIdRef, the same staleness discipline
// elementInspection.ts uses for the live tree's own selection.
export function useStaticComponentDetail(vscodeApi: VsCodeApi): StaticComponentDetailController {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<StaticComponentDetail | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const selectedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as StaticComponentDetailMessage;
      if (data?.type !== "staticComponentDetail") {
        return;
      }
      if (data.id !== selectedIdRef.current) {
        return; // Stale response for a since-changed/cleared selection.
      }
      setDetail(data.detail);
      setLoading(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const select = useCallback(
    (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      setDetail(undefined);
      setLoading(true);
      vscodeApi.postMessage({ type: "inspectStaticComponent", id });
    },
    [vscodeApi],
  );

  const deselect = useCallback(() => {
    selectedIdRef.current = undefined;
    setSelectedId(undefined);
    setDetail(undefined);
    setLoading(false);
  }, []);

  return { selectedId, detail, loading, select, deselect };
}
