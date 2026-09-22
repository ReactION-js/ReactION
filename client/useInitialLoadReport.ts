import { useCallback, useEffect, useRef, useState } from "react";
import type { CommitDataFrontend, DevtoolsStore } from "react-devtools-inline/frontend";
import type { ComponentNode } from "./types";
import { buildInitialLoadReport, type InitialLoadReport } from "./initialLoadReport";

export interface InitialLoadReportController {
  report: InitialLoadReport | undefined;
  isCapturing: boolean;
}

// How long the tree must go without a further mutation before the capture is
// considered "settled" and the recording is stopped. Not a precise signal --
// a lazy-loaded route or a deferred fetch can keep mounting things well past
// any fixed window -- just a practical stand-in for "nothing else looks like
// it's still loading".
const SETTLE_MS = 500;

// One-shot alternative to the manual Start/Stop Profiling toggle
// (useProfiler.ts): starts a profiling recording itself the moment a fresh
// Store connects and stops itself once the tree has gone quiet for
// SETTLE_MS, instead of either running a recording for the whole session
// (the cost the user explicitly ruled out -- noticeably slows the live tree
// down) or requiring a manual Start/Stop click. Shares the same underlying
// store.profilerStore as useProfiler.ts; both assume nothing else calls
// startProfiling()/stopProfiling() in the brief window right after connect,
// which holds in practice since this hook always starts first (before the
// user could possibly reach for the toolbar). A manual "Start Profiling"
// click during that same narrow window would end this capture early and
// briefly show "Stop Profiling" on that toggle -- a known, undefended race,
// same class as the ones useProfiler.ts's own comments call out.
export function useInitialLoadReport(
  store: DevtoolsStore | undefined,
  tree: ComponentNode | undefined,
): InitialLoadReportController {
  const [report, setReport] = useState<InitialLoadReport | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const capturingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const storeRef = useRef<DevtoolsStore | undefined>(undefined);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
    }
  }, []);

  const finishCapture = useCallback(() => {
    clearSettleTimer();
    if (!capturingRef.current || !storeRef.current || stopRequestedRef.current) {
      return;
    }
    stopRequestedRef.current = true;
    storeRef.current.profilerStore.stopProfiling();
  }, [clearSettleTimer]);

  const scheduleFinish = useCallback(() => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(finishCapture, SETTLE_MS);
  }, [clearSettleTimer, finishCapture]);

  // (Re)starts the capture whenever a fresh Store connects -- a reconnect
  // means a brand-new session worth capturing its own initial load, mirroring
  // every other per-session hook here (useProfiler.ts/useContextMap.ts/
  // useCoverage.ts's own `[store]`-keyed reset effects).
  useEffect(() => {
    storeRef.current = store;
    setReport(undefined);
    setIsCapturing(false);
    capturingRef.current = false;
    stopRequestedRef.current = false;
    clearSettleTimer();

    if (!store) {
      return;
    }
    const profilerStore = store.profilerStore;

    const onProcessingDataChange = () => {
      if (profilerStore.isProcessingData || !capturingRef.current) {
        return;
      }
      capturingRef.current = false;
      setIsCapturing(false);

      const allCommits: CommitDataFrontend[] = [];
      for (const rootID of store.roots) {
        try {
          allCommits.push(...profilerStore.getDataForRoot(rootID).commitData);
        } catch {
          // No commits were recorded for this root during the capture.
        }
      }
      setReport(buildInitialLoadReport(allCommits, store));
    };

    profilerStore.addListener("isProcessingData", onProcessingDataChange);

    capturingRef.current = true;
    setIsCapturing(true);
    store.recordChangeDescriptions = true;
    profilerStore.startProfiling();
    scheduleFinish();

    return () => {
      profilerStore.removeListener("isProcessingData", onProcessingDataChange);
      clearSettleTimer();
    };
  }, [store, clearSettleTimer, scheduleFinish]);

  // Every fresh `tree` reference (storeBridge.ts rebuilds it on each
  // "mutated" event -- see useEverRendered.ts's identical reliance on this
  // same reference-change signal, which avoids this hook registering its own
  // second raw store.addListener("mutated", ...)) pushes the settle deadline
  // back out while still capturing, so SETTLE_MS means "quiet for this
  // long", not just "this long after connect".
  useEffect(() => {
    if (!capturingRef.current) {
      return;
    }
    scheduleFinish();
  }, [tree, scheduleFinish]);

  return { report, isCapturing };
}
