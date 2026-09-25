import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommitDataFrontend,
  DevtoolsStore,
  InspectedElementResponse,
} from "react-devtools-inline/frontend";
import type { ComponentNode } from "./types";
import {
  buildInitialLoadReport,
  looksMinifiedName,
  type InitialLoadReport,
} from "./initialLoadReport";

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
  inspectOnce: (id: number) => Promise<InspectedElementResponse>,
): InitialLoadReportController {
  const [report, setReport] = useState<InitialLoadReport | undefined>(undefined);
  const [isCapturing, setIsCapturing] = useState(false);
  const capturingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const storeRef = useRef<DevtoolsStore | undefined>(undefined);
  // Bumped on every fresh store connect (mirrors useContextMap.ts's own
  // generationRef) so a still-in-flight enrichMinifiedNames probe from a
  // previous session can't call setReport with fiber ids that no longer
  // mean anything against a brand-new Store.
  const generationRef = useRef(0);

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
    generationRef.current += 1;
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
      const built = buildInitialLoadReport(allCommits, store);
      setReport(built);

      // Best-effort, non-blocking: show the report immediately with raw
      // displayNames, then fill in a file:line fallback for any that look
      // minified once their source location comes back (or leave them as
      // -is if no source is available, e.g. a fully minified build with no
      // source map). Captured at the actual async call site (not the top
      // of the effect) to match the generation-guard idiom used by
      // useContextMap.ts/useCoverage.ts.
      const generation = generationRef.current;
      void enrichMinifiedNames(built, inspectOnce).then((enriched) => {
        if (generationRef.current !== generation) {
          return; // Store changed/disconnected while probes were in flight.
        }
        setReport(enriched);
      });
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
  }, [store, inspectOnce, clearSettleTimer, scheduleFinish]);

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

// How many instances of a minified-looking group to probe before trusting
// its sourceLabel. `source` reports the component's DEFINITION site (see
// react-devtools-inline.d.ts's InspectedElementSource comment and
// spike/run-phase3b-source.js's cross-check against a real sourcemap), not
// the JSX call site -- so genuinely-the-same component always reports the
// same file:line no matter how many places render it, and a group whose
// sampled instances DISAGREE is proof of a real bundler name collision
// (two different components mangled down to the same short name), not
// just "the same component used in several places". Capped rather than
// probing every instance since a group can have dozens.
const MINIFIED_NAME_SAMPLE_SIZE = 3;

// Probes a sample of instances from every minified-looking group (see
// looksMinifiedName) for their live source location and, only when the
// sample agrees on one file:line, attaches it as a sourceLabel -- the same
// file:line the "open in editor" action already resolves from, just read
// here for display instead. A group whose sample disagrees (a genuine
// mangled-name collision between two different components, not merely the
// same component rendered from several call sites -- see
// MINIFIED_NAME_SAMPLE_SIZE's comment) is left unlabeled rather than
// showing a confident but potentially wrong location for what is really a
// mix of two components' wasted renders. Groups that don't look minified,
// or whose probes find no source at all (no source map, or every sampled
// instance already unmounted), are also returned unchanged. Mirrors
// useContextMap.ts's own "Promise.all over independent inspectOnce()
// calls, tolerate individual failures" shape.
async function enrichMinifiedNames(
  report: InitialLoadReport,
  inspectOnce: (id: number) => Promise<InspectedElementResponse>,
): Promise<InitialLoadReport> {
  const candidates = report.rerendered.filter((group) => looksMinifiedName(group.displayName));
  if (candidates.length === 0) {
    return report;
  }

  const labelByDisplayName = new Map<string, string>();
  await Promise.all(
    candidates.map(async (group) => {
      const sampleIds = group.instanceIds.slice(0, MINIFIED_NAME_SAMPLE_SIZE);
      const responses = await Promise.all(
        sampleIds.map((id) => inspectOnce(id).catch(() => undefined)),
      );
      const labels = responses.flatMap((response) => {
        if (!response || response.type !== "full-data" || !response.value.source) {
          return [];
        }
        const [, fileName, lineNumber] = response.value.source;
        return [`${basename(fileName)}:${lineNumber}`];
      });
      if (labels.length > 0 && labels.every((label) => label === labels[0])) {
        labelByDisplayName.set(group.displayName, labels[0]);
      }
    }),
  );
  if (labelByDisplayName.size === 0) {
    return report;
  }

  return {
    ...report,
    rerendered: report.rerendered.map((group) => {
      const sourceLabel = labelByDisplayName.get(group.displayName);
      return sourceLabel ? { ...group, sourceLabel } : group;
    }),
  };
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(index + 1);
}
