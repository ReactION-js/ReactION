import type { DevtoolsStore } from "react-devtools-inline/frontend";

// Companion to everRendered.ts's collectDisplayNames, but returns actual
// element ids of CURRENTLY MOUNTED elements matching a displayName, not just
// the name set -- Task 5e's source -> instance jump needs a real id to feed
// into ElementInspector.select, which "was this name ever rendered this
// session" (everRendered.ts, Task 5d's coverage feature) can't provide: that
// accumulator deliberately outlives unmount, so it has no live id to select
// once the element it recorded is gone.
//
// Order matches everRendered.ts's own traversal (store.roots, then each
// element's children, depth-first) so "the first match" is a stable, well-
// defined choice rather than whatever order Object.keys/a Map iteration
// happens to produce.
//
// LIMITATION (same class as coverage.ts's / contextMap.ts's own documented
// gap, restated here since this is a new, separate correlation): this
// matches purely by displayName. Two statically-distinct components that
// happen to share a displayName are indistinguishable from here -- selecting
// "Item" can land on a structurally different "Item" defined in a completely
// different file, if both happen to be mounted and both happen to share the
// name.
export function findMountedElementIdsByDisplayName(
  store: DevtoolsStore,
  displayName: string,
): number[] {
  const ids: number[] = [];
  const visit = (id: number): void => {
    const element = store.getElementByID(id);
    if (!element) {
      return;
    }
    if (element.displayName === displayName) {
      ids.push(id);
    }
    for (const childId of element.children) {
      visit(childId);
    }
  };
  for (const rootId of store.roots) {
    visit(rootId);
  }
  return ids;
}
