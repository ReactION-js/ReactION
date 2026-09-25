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
  // Live fiber ids of every instance folded into this group, so the panel
  // can select/highlight one of them (see useInitialLoadReport.ts) without
  // a second pass over the Store. Order matches discovery order, not
  // anything meaningful beyond that.
  instanceIds: number[];
  // A "file:line" fallback label for displayName, filled in asynchronously
  // (see useInitialLoadReport.ts's enrichMinifiedNames) only when
  // displayName looks minified/mangled and a source location for one of
  // this group's instances could be found. undefined until then, and stays
  // undefined when no source location is available at all (e.g. a fully
  // minified production build with no source map).
  sourceLabel?: string;
}

// React requires a component's displayName to start with an uppercase
// letter -- a lowercase-initial JSX tag is parsed as an HTML element, not a
// component -- so a displayName that doesn't follow that convention (e.g.
// "wm", "yw") is almost certainly a bundler-mangled identifier that survived
// into production, not the component's real name. "Anonymous" (DevTools'
// own placeholder for a nameless function component) already starts
// uppercase and is deliberately left alone here.
export function looksMinifiedName(name: string): boolean {
  return !/^[A-Z]/.test(name);
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
      existing.instanceIds.push(fiberId);
    } else {
      groups.set(element.displayName, {
        displayName: element.displayName,
        instanceCount: 1,
        totalRenders: renderCount,
        wastedRenders: wastedCount,
        instanceIds: [fiberId],
      });
    }
  });

  const rerendered = Array.from(groups.values()).sort(
    (a, b) => b.wastedRenders - a.wastedRenders || b.totalRenders - a.totalRenders,
  );
  return { totalRendered: stats.size, rerendered };
}
