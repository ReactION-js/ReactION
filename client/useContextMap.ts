import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DevtoolsStore,
  HooksNode,
  InspectedElementResponse,
} from "react-devtools-inline/frontend";
import {
  buildContextMap,
  CANDIDATE_CONSUMER_TYPES,
  type ContextMapElement,
  type ContextMapEntry,
} from "./contextMap";

export interface ContextMapController {
  entries: ContextMapEntry[] | undefined;
  isBuilding: boolean;
  build: () => void;
}

// Owns the "Build context map" toolbar action: an explicit, user-triggered
// scan (never automatic -- see contextMap.ts's doc comment and the Phase 3d
// task brief) that walks the current Store's element tree, calls
// inspector.inspectOnce() on every function/memo/forwardRef candidate to
// read its hooks, and hands the result to the pure buildContextMap(). Mirrors
// useProfiler.ts's shape: a focused hook owning one feature's state/effects.
export function useContextMap(
  store: DevtoolsStore | undefined,
  inspectOnce: (id: number) => Promise<InspectedElementResponse>,
): ContextMapController {
  const [entries, setEntries] = useState<ContextMapEntry[] | undefined>(undefined);
  const [isBuilding, setIsBuilding] = useState(false);
  const isBuildingRef = useRef(false);
  // Bumped whenever `store` changes (a reconnect swaps in a brand-new Store
  // per storeBridge.ts, with all-new fiber ids) so a build already in flight
  // against the OLD store discards its result instead of calling setState
  // with ids that no longer mean anything -- or, worse, racing a build the
  // user has since started against the NEW store.
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    isBuildingRef.current = false;
    setIsBuilding(false);
    setEntries(undefined);
  }, [store]);

  const build = useCallback(() => {
    if (!store || isBuildingRef.current) {
      return; // No store to scan, or a build for the current store is already running.
    }
    const generation = generationRef.current;
    isBuildingRef.current = true;
    setIsBuilding(true);
    setEntries(undefined);

    void (async () => {
      const elements = new Map<number, ContextMapElement>();
      const consumerIds: number[] = [];

      const visit = (id: number) => {
        const element = store.getElementByID(id);
        if (!element) {
          return;
        }
        elements.set(id, {
          id: element.id,
          parentID: element.parentID,
          displayName: element.displayName,
          type: element.type,
        });
        if (CANDIDATE_CONSUMER_TYPES.has(element.type)) {
          consumerIds.push(id);
        }
        for (const childId of element.children) {
          visit(childId);
        }
      };
      for (const rootId of store.roots) {
        visit(rootId);
      }

      // Fire every candidate's inspectOnce() concurrently -- these are
      // independent, requestID-matched requests over the same bridge (see
      // elementInspection.ts), so there's no ordering dependency and no
      // benefit to awaiting them one at a time. A candidate whose probe
      // fails or times out (element unmounted mid-scan, backend disconnected)
      // is simply skipped rather than aborting the whole build.
      const responses = await Promise.all(
        consumerIds.map((id) => inspectOnce(id).catch(() => undefined)),
      );
      if (generationRef.current !== generation) {
        return; // Store changed/disconnected while probes were in flight.
      }

      const hooksByElementId = new Map<number, HooksNode[]>();
      consumerIds.forEach((id, index) => {
        const response = responses[index];
        if (!response || response.type !== "full-data" || !response.value.hooks) {
          return;
        }
        const hooksData = response.value.hooks.data;
        if (Array.isArray(hooksData)) {
          hooksByElementId.set(id, hooksData as HooksNode[]);
        }
      });

      const result = buildContextMap(elements, hooksByElementId);
      if (generationRef.current !== generation) {
        return;
      }
      setEntries(result);
      isBuildingRef.current = false;
      setIsBuilding(false);
    })();
  }, [store, inspectOnce]);

  return { entries, isBuilding, build };
}
