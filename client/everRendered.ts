import type { DevtoolsStore } from "react-devtools-inline/frontend";

// Pure Store-walking helpers for the "ever-rendered" cumulative tracker (see
// useEverRendered.ts for the hook that owns the accumulating Set + the
// mutated-listener lifecycle). Split out, mirroring renderStats.ts/
// contextMap.ts, so the walk itself is testable without React or a live
// bridge -- a plain, already-populated DevtoolsStore is all either function
// needs.

// Every displayName currently visible in the Store's tree, right now -- NOT
// cumulative. useEverRendered.ts calls this once per "mutated" event and
// folds the result into its own persistent accumulator via
// mergeDisplayNames; this alone only ever reflects the CURRENTLY MOUNTED
// tree, same limitation as the live tree view itself.
export function collectDisplayNames(store: DevtoolsStore): Set<string> {
  const names = new Set<string>();
  const visit = (id: number) => {
    const element = store.getElementByID(id);
    if (!element) {
      return;
    }
    if (element.displayName) {
      names.add(element.displayName);
    }
    for (const childId of element.children) {
      visit(childId);
    }
  };
  for (const rootId of store.roots) {
    visit(rootId);
  }
  return names;
}

// Folds the Store's CURRENT displayNames into `accumulator` IN PLACE. The
// accumulator only ever grows across repeated calls -- it must not be
// replaced wholesale (e.g. via a `useState` that swaps in a fresh Set), or a
// component that mounted earlier and has since unmounted would silently drop
// out of the cumulative "seen this session" record the moment the Store's
// current tree stops containing it.
export function mergeDisplayNames(accumulator: Set<string>, store: DevtoolsStore): void {
  for (const name of collectDisplayNames(store)) {
    accumulator.add(name);
  }
}
