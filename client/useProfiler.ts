import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommitDataFrontend, DevtoolsStore } from "react-devtools-inline/frontend";
import { computeRenderCounts, describeChange, isWastedRender } from "./renderStats";
import type { RenderReason } from "./components/InspectorPanel";

// A completed profiling run's commit data, reshaped for this hook's own use:
// per-root (so "the most recent commit" for whichever root the selected
// element belongs to can be found) and merged into a single render-count map
// (fiber ids are globally unique, so merging across roots is safe).
interface ProfilingSnapshot {
  commitsByRoot: Map<number, CommitDataFrontend[]>;
  renderCounts: Map<number, number>;
}

export interface ProfilerController {
  isProfiling: boolean;
  isProcessingData: boolean;
  // True whenever clicking the toolbar toggle right now would either do
  // nothing useful or -- in the stopConfirmationPending window -- actively
  // race the backend. Callers should wire this straight into the button's
  // `disabled` prop rather than re-deriving it.
  toggleDisabled: boolean;
  toggleProfiling: () => void;
  renderCounts: Map<number, number> | undefined;
  renderReason: RenderReason | undefined;
}

// Owns the live profiler session for the current Store: starting/stopping a
// recording, pulling fresh commit data once it's ready, and deriving both
// the render-count heatmap and the selected element's "why did this render"
// reason. Deliberately isolated from TreeView/FlowGraph's own selection/
// collapse/search/orientation state -- this depends on nothing but `store`
// and the id of whichever element is currently selected.
export function useProfiler(
  store: DevtoolsStore | undefined,
  selectedElementId: number | null,
): ProfilerController {
  const [isProfiling, setIsProfiling] = useState(false);
  const [isProcessingData, setIsProcessingData] = useState(false);
  // Closes a gap `isProcessingData` alone leaves open. stopProfiling()
  // flips ProfilerStore's `isProfilingBasedOnUserInput` (and so our
  // `isProfiling` state, via the 'isProfiling' event below) to false
  // SYNCHRONOUSLY, purely as an optimistic local update -- well before the
  // backend's async 'profilingStatus: false' confirmation exists, and
  // `isProcessingData` only becomes true once THAT confirmation lands. So
  // for a brief window right after clicking Stop, the button already reads
  // "Start Profiling" and isn't disabled by isProcessingData either. An
  // impatient double-click meaning to hit Stop twice instead lands its
  // second click on "Start Profiling" and re-enters the start branch,
  // which silently destroys the just-stopped session's data: the backend
  // wipes its buffered commit metadata immediately on the new
  // startProfiling, and the stale getProfilingData response for the
  // aborted session that arrives afterward is dropped by ProfilerStore's
  // own renderer-queue guard once `_isBackendProfiling` has flipped true
  // again for the new run (confirmed by reading
  // node_modules/react-devtools-inline/dist/frontend.js's ProfilerStore and
  // node_modules/react-devtools-core/dist/backend.js). This flag stays true
  // from the moment Stop is clicked until the backend's stop confirmation
  // actually arrives (the next 'isProcessingData' event), keeping the
  // toggle disabled through that entire window instead of flickering back
  // to a clickable "Start Profiling".
  const [stopConfirmationPending, setStopConfirmationPending] = useState(false);
  const [profilingSnapshot, setProfilingSnapshot] = useState<ProfilingSnapshot | undefined>(
    undefined,
  );

  // A reconnect swaps `store` for a brand-new instance with all-new fiber
  // ids (see App.tsx / storeBridge.ts). Reset explicitly here instead of
  // relying on the caller (FlowGraph) happening to unmount entirely across
  // every disconnect/reconnect -- true today via App.tsx's `!tree` gate, but
  // not a guarantee this hook should depend on. Mirrors useContextMap.ts/
  // useCoverage.ts's own `[store]`-keyed reset effect.
  useEffect(() => {
    setIsProfiling(false);
    setIsProcessingData(false);
    setStopConfirmationPending(false);
    setProfilingSnapshot(undefined);
  }, [store]);

  // Bind to the live profiler session for the current Store. A reconnect
  // swaps `store` for a brand-new instance (see App.tsx / storeBridge.ts),
  // so this re-binds (and the cleanup below unbinds the old listeners)
  // whenever that happens; the reset effect above already clears
  // profilingSnapshot and the rest of this hook's state on that same
  // transition, so stale data referencing the old Store's fiber ids never
  // lingers here even if a future FlowGraph stays mounted across reconnects.
  // There's no explicit stopProfiling() on unmount if a session is still
  // active when the panel closes -- a conscious choice, not an oversight:
  // the stock DevTools Profiler UI has the same behavior (a recording left
  // running just keeps running in the backend), and adding an
  // unmount-triggered stop was out of scope for this task.
  useEffect(() => {
    if (!store) {
      return;
    }
    const profilerStore = store.profilerStore;

    const syncIsProfiling = () => {
      setIsProfiling(profilerStore.isProfilingBasedOnUserInput);
    };

    // 'isProcessingData' fires twice per stop: once when the frontend starts
    // re-requesting data from each renderer (isProcessingData still true --
    // ignore, other than tracking it below), and again once every renderer
    // has reported back and the frontend-shaped data has been rebuilt
    // (isProcessingData now false -- that's the one that means fresh commit
    // data is actually readable). Either firing means the backend's stop
    // confirmation has landed, so both clear stopConfirmationPending.
    const handleProfilingDataChange = () => {
      setIsProcessingData(profilerStore.isProcessingData);
      setStopConfirmationPending(false);
      if (profilerStore.isProcessingData) {
        return;
      }
      const commitsByRoot = new Map<number, CommitDataFrontend[]>();
      const allCommits: CommitDataFrontend[] = [];
      for (const rootID of store.roots) {
        try {
          const dataForRoot = profilerStore.getDataForRoot(rootID);
          commitsByRoot.set(rootID, dataForRoot.commitData);
          allCommits.push(...dataForRoot.commitData);
        } catch {
          // No commits were recorded for this root during the run.
        }
      }
      setProfilingSnapshot({ commitsByRoot, renderCounts: computeRenderCounts(allCommits) });
    };

    profilerStore.addListener("isProfiling", syncIsProfiling);
    profilerStore.addListener("isProcessingData", handleProfilingDataChange);
    syncIsProfiling();
    setIsProcessingData(profilerStore.isProcessingData);

    return () => {
      profilerStore.removeListener("isProfiling", syncIsProfiling);
      profilerStore.removeListener("isProcessingData", handleProfilingDataChange);
    };
  }, [store]);

  const toggleProfiling = useCallback(() => {
    if (!store) {
      return;
    }
    if (isProfiling) {
      setStopConfirmationPending(true);
      store.profilerStore.stopProfiling();
    } else if (!isProcessingData && !stopConfirmationPending) {
      // Starting a new session while the previous stop's commit data is
      // still being fetched from the backend races ProfilerStore's own
      // internals: startProfiling() clears its `_rendererQueue` (via
      // clear()), so a still-in-flight 'profilingData' response for the OLD
      // session can find its renderer id no longer in that queue and throw
      // ("Unexpected profiling data update...") inside the library itself.
      // toggleDisabled below covers this same window for the UI, so this
      // check is a belt-and-suspenders guard, not the only protection.
      //
      // A new session replaces, rather than accumulates onto, the previous
      // run's heatmap -- clear our derived snapshot immediately so a stale
      // heatmap doesn't linger on screen while the new recording is live
      // (ProfilerStore.startProfiling() itself also clears its own
      // `_dataFrontend`, so the next getDataForRoot() call after this run's
      // stop only ever reflects this run, never the previous one).
      setProfilingSnapshot(undefined);
      store.recordChangeDescriptions = true;
      store.profilerStore.startProfiling();
    }
  }, [store, isProfiling, isProcessingData, stopConfirmationPending]);

  // The most recent commit's changeDescription for the selected element, if
  // profiling data exists AND that element actually appeared in that
  // commit. Undefined in every other case (never profiled, profiled but
  // this element bailed out of every commit, or nothing selected) --
  // callers must not read "no reason" as "this never re-renders".
  const renderReason: RenderReason | undefined = useMemo(() => {
    if (!store || !profilingSnapshot || selectedElementId === null) {
      return undefined;
    }
    const rootID = store.getRootIDForElement(selectedElementId);
    if (rootID === null) {
      return undefined;
    }
    const commits = profilingSnapshot.commitsByRoot.get(rootID);
    if (!commits || commits.length === 0) {
      return undefined;
    }
    const change = commits[commits.length - 1].changeDescriptions?.get(selectedElementId);
    if (!change) {
      return undefined;
    }
    return { description: describeChange(change), wasted: isWastedRender(change) };
  }, [store, profilingSnapshot, selectedElementId]);

  return {
    isProfiling,
    isProcessingData,
    toggleDisabled: !store || (!isProfiling && (isProcessingData || stopConfirmationPending)),
    toggleProfiling,
    renderCounts: profilingSnapshot?.renderCounts,
    renderReason,
  };
}
