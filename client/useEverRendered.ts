import { useCallback, useEffect, useRef } from "react";
import type { DevtoolsStore } from "react-devtools-inline/frontend";
import { mergeDisplayNames } from "./everRendered";

export interface EverRenderedController {
  // A snapshot getter rather than React state: the accumulator only needs to
  // be read on demand, when useCoverage.ts's "Check Coverage" action
  // correlates against it -- nothing on screen needs to re-render on every
  // single accumulation, so this deliberately never triggers one.
  getEverRenderedNames: () => ReadonlySet<string>;
}

// Cumulative record of every displayName seen live at ANY point during the
// current DevTools connection -- NOT the live Store's current tree, which
// only reflects currently-mounted elements and loses a component the moment
// it unmounts (a closed modal, a dismissed error boundary, a route the user
// navigated away from). This is what makes "not rendered this session"
// possible at all: `defined (static) − ever-rendered (this)` per the
// REARCHITECTURE-PLAN's Phase 5 fusion note.
//
// Mirrors useProfiler.ts/useContextMap.ts's "re-bind on `store` change"
// shape, but deliberately keeps its accumulator in a ref (not React state
// that gets fully replaced) since it needs to grow monotonically across
// many "mutated" events without paying a re-render for every single one.
export function useEverRendered(store: DevtoolsStore | undefined): EverRenderedController {
  const namesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // A fresh Store means a fresh backend connection (App.tsx only creates a
    // new Store on "backend-connected", see storeBridge.ts) -- reset the
    // cumulative set so a reconnect starts this session's coverage from
    // scratch, matching every other piece of per-session state in this
    // codebase (useProfiler's profilingSnapshot, useContextMap's entries).
    // This branch also covers the plain disconnect case (`store` becomes
    // undefined): the cleanup of the PREVIOUS effect run below already
    // detached the old store's listener, so resetting here and returning is
    // enough -- there's nothing left to listen to until a new store exists.
    namesRef.current = new Set();
    if (!store) {
      return;
    }

    const collect = () => mergeDisplayNames(namesRef.current, store);
    collect();
    store.addListener("mutated", collect);
    return () => store.removeListener("mutated", collect);
  }, [store]);

  const getEverRenderedNames = useCallback((): ReadonlySet<string> => namesRef.current, []);

  return { getEverRenderedNames };
}
