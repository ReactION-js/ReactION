import type { ComponentNode } from "./types";

// How many identical-displayName siblings under the same parent get
// collapsed into a single "Name ×N" placeholder node. Below this, showing
// each instance individually is more useful than a group; the case this
// actually triggers on in practice is a repeated library-internal wrapper
// (e.g. react-transition-group's TransitionGroup) or a rendered list, both
// of which commonly produce dozens of near-identical siblings that would
// otherwise each need their own row in the graph.
const GROUP_THRESHOLD = 4;

const GROUP_ID_PREFIX = "group:";

export function isGroupNodeId(id: string): boolean {
  return id.startsWith(GROUP_ID_PREFIX);
}

// Finds the node with the given id within an already-grouped tree. Used by
// TreeView.tsx's toggleCollapse to look up which direct children are about
// to be revealed when a node is expanded, so it can seed the "one level at a
// time" default described there.
export function findNodeById(node: ComponentNode, id: string): ComponentNode | undefined {
  if ((node.id ?? node.name) === id) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

// Same lookup, across a forest of independent, already-grouped trees --
// the static composition tree can be more than one disconnected root (see
// staticComponentTree.ts's own comment on why an unused root-level
// component gets its own top-level entry instead of being nested under
// "Roots"), unlike the live tree, which is always exactly one root.
export function findNodeByIdInForest(
  roots: readonly ComponentNode[],
  id: string,
): ComponentNode | undefined {
  for (const root of roots) {
    const found = findNodeById(root, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

// Recursively replaces any run of >= threshold direct siblings sharing the
// same displayName with a single synthetic node standing in for the whole
// group (id `group:<parentId>:<name>`, label `<name> ×<count>`). Real
// ComponentNodes are never mutated, only nested one level deeper under the
// synthetic wrapper -- every id a grouped instance carries (so fiber-id
// lookups like renderCounts/element inspection keep working once the group
// is expanded) stays exactly as storeBridge.ts built it. Pure and total, so
// it's safe to re-run on every live tree update rather than only once per
// session -- see computeInitialCollapsedIds below for the one-shot part.
export function groupSiblingsByName(
  node: ComponentNode,
  threshold: number = GROUP_THRESHOLD,
): ComponentNode {
  const children = node.children;
  if (!children || children.length === 0) {
    return node;
  }

  const byName = new Map<string, ComponentNode[]>();
  for (const child of children) {
    const bucket = byName.get(child.name);
    if (bucket) {
      bucket.push(child);
    } else {
      byName.set(child.name, [child]);
    }
  }

  const nodeId = node.id ?? node.name;
  const regrouped: ComponentNode[] = [];
  for (const [name, siblings] of byName) {
    if (siblings.length >= threshold) {
      regrouped.push({
        id: `${GROUP_ID_PREFIX}${nodeId}:${name}`,
        name: `${name} ×${siblings.length}`,
        attributes: ["Group"],
        children: siblings.map((sibling) => groupSiblingsByName(sibling, threshold)),
      });
    } else {
      for (const sibling of siblings) {
        regrouped.push(groupSiblingsByName(sibling, threshold));
      }
    }
  }

  return { ...node, children: regrouped };
}

// Picks a default collapsedIds set so the FIRST render of a (possibly huge)
// tree shows only around `maxVisible` nodes instead of the whole thing:
// walks the (already-grouped) tree breadth-first, and the moment revealing a
// node's children would cross the budget, collapses that node instead of
// descending into it. Synthetic group nodes always collapse regardless of
// budget -- showing every instance of a group by default would defeat the
// point of grouping them in the first place.
//
// Meant to be called ONCE, to seed collapsedIds' initial state (see
// TreeView.tsx's lazy useState initializer) -- re-running it on every live
// tree update would silently discard whatever the user has since expanded
// by hand.
//
// Takes a forest (see findNodeByIdInForest) rather than a single root: the
// live tree is always a one-element array, so this is unconditionally the
// call shape now, not a special case for the static tree's multiple roots.
export function computeInitialCollapsedIds(
  roots: readonly ComponentNode[],
  maxVisible: number,
): Set<string> {
  const collapsed = new Set<string>();
  const queue: ComponentNode[] = [...roots];
  // Total nodes already promised to be visible -- both already dequeued AND
  // still waiting in `queue` -- not just how many have been dequeued so far.
  // A check against dequeued-count alone under-counts what earlier siblings
  // already committed to (their own children, still sitting in the queue),
  // letting later siblings each individually "look" like they still fit and
  // collectively blow well past maxVisible.
  let committed = roots.length; // every root is always visible.

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) {
      continue;
    }
    const id = node.id ?? node.name;
    const children = node.children ?? [];
    if (children.length === 0) {
      continue;
    }
    if (isGroupNodeId(id) || committed + children.length > maxVisible) {
      collapsed.add(id);
      continue;
    }
    committed += children.length;
    queue.push(...children);
  }

  return collapsed;
}
