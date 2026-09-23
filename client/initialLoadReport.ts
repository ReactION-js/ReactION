import type { CommitDataFrontend, DevtoolsStore } from "react-devtools-inline/frontend";
import { computeRenderStats } from "./renderStats";

export interface RerenderedGroup {
  displayName: string;
  // Number of distinct component instances (fibers) sharing this
  // displayName that rendered more than once -- e.g. a route/list that
  // mounts many instances of the same component would otherwise show one
  // near-identical row per instance.
  instanceCount: number;
  // Sum of renderCount across those instances (includes their first mount).
  totalRenders: number;
  // Sum of wasted renders (isWastedRender -- ran again but nothing that
  // would justify it actually changed) across those instances. The
  // actionable number: a component that always re-renders for a real reason
  // (props/state/context genuinely changing, e.g. a library computing a
  // transition on mount) shows 0 here even if totalRenders is high.
  wastedRenders: number;
}

export interface InitialLoadReport {
  totalRendered: number;
  // Only displayNames with at least one instance that rendered more than
  // once, sorted by wastedRenders descending (ties broken by totalRenders)
  // so genuinely wasteful re-rendering surfaces above benign repeated
  // rendering.
  rerendered: RerenderedGroup[];
}

// Pure reshape of a completed profiling run's commit data into the initial-
// load status report: how many distinct fibers rendered at all (mount or
// re-render) during the capture window, and -- grouped by displayName, with
// a wasted-render count -- which of those re-rendered more than once for no
// real reason. Mirrors renderStats.ts/contextMap.ts's "pure function over
// already-hydrated data" split -- testable without React or a live bridge.
// See useInitialLoadReport.ts for the hook that owns the capture itself
// (starting/stopping the recording, deciding when it's "settled").
export function buildInitialLoadReport(
  commitData: CommitDataFrontend[],
  store: DevtoolsStore,
): InitialLoadReport {
  const stats = computeRenderStats(commitData);
  const groups = new Map<string, RerenderedGroup>();

  stats.forEach(({ renderCount, wastedCount }, fiberId) => {
    if (renderCount <= 1) {
      return;
    }
    const element = store.getElementByID(fiberId);
    if (!element?.displayName) {
      return;
    }
    const existing = groups.get(element.displayName);
    if (existing) {
      existing.instanceCount += 1;
      existing.totalRenders += renderCount;
      existing.wastedRenders += wastedCount;
    } else {
      groups.set(element.displayName, {
        displayName: element.displayName,
        instanceCount: 1,
        totalRenders: renderCount,
        wastedRenders: wastedCount,
      });
    }
  });

  const rerendered = Array.from(groups.values()).sort(
    (a, b) => b.wastedRenders - a.wastedRenders || b.totalRenders - a.totalRenders,
  );
  return { totalRendered: stats.size, rerendered };
}
