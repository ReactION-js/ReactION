import { useCallback, useEffect, useRef } from "react";
import type { DevtoolsStore } from "react-devtools-inline/frontend";
import type { ComponentNode } from "./types";
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
//
// `tree` -- FlowGraph's already-built ComponentNode data -- is taken here
// purely as a re-run signal for the merge effect below, NOT walked itself:
// storeBridge.ts's buildTree already reconstructs `tree` on every single
// Store "mutated" event, so its reference changes exactly once per mutation
// too. Keying the merge effect on it instead of registering this hook's own
// SECOND, independent store.addListener("mutated", ...) means there's only
// ever one raw listener on that event (storeBridge.ts's), and this hook
// piggybacks on the render it already causes. The walk itself
// (mergeDisplayNames/collectDisplayNames) still reads the raw Store, not
// `tree` -- deriving displayNames from the ComponentNode tree instead would
// remove that walk entirely, but was judged not worth it here: it would
// need buildTree/buildNode to start distinguishing a real displayName from
// their TYPE_LABEL/"Unknown" fallback and the synthetic "Roots" wrapper, and
// spike/run-phase5d-coverage.js and spike/run-phase5f-kitchen-sink.js both
// call mergeDisplayNames directly against a raw Store of their own -- a
// ComponentNode-shaped input would silently break both.
export function useEverRendered(
  store: DevtoolsStore | undefined,
  tree: ComponentNode | undefined,
): EverRenderedController {
  const namesRef = useRef<Set<string>>(new Set());

  // A fresh Store means a fresh backend connection (App.tsx only creates a
  // new Store on "backend-connected", see storeBridge.ts) -- reset the
  // cumulative set so a reconnect starts this session's coverage from
  // scratch, matching every other piece of per-session state in this
  // codebase (useProfiler's profilingSnapshot, useContextMap's entries).
  // This branch also covers the plain disconnect case (`store` becomes
  // undefined): the merge effect below already has nothing to merge once
  // `tree` goes back to undefined too.
  useEffect(() => {
    namesRef.current = new Set();
  }, [store]);

  useEffect(() => {
    if (!store) {
      return;
    }
    mergeDisplayNames(namesRef.current, store);
  }, [store, tree]);

  const getEverRenderedNames = useCallback((): ReadonlySet<string> => namesRef.current, []);

  return { getEverRenderedNames };
}
