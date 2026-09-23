import type { StaticAnalysisResult } from "./staticAnalysis";
// Shares staticComponentDetail.ts's per-`result` cache of render edges/
// unused-component set rather than recomputing them here too -- both this
// tree build and the first node click would otherwise each pay the full
// six-analysis pass once (see that cache's own comment on why it exists at
// all: 3.2s per call on a real project, wasted if paid twice).
import { getDerivedAnalysis } from "./staticComponentDetail";

// Wire shape matches client/types.ts's ComponentNode field-for-field --
// src/ and client/ independently shape the same wire message across the
// tsconfig boundary (no compiler link between them), same established
// convention as client/coverage.ts's StaticComponentSummary/staticAnalysis.ts's
// ComponentSummary. Kept structurally identical (not imported, since client/
// can't import from src/) so the client's EXISTING FlowGraph/layoutTree/
// grouping pipeline can render this tree completely unchanged, with no
// separate rendering path for a "static" tree.
export interface StaticTreeNode {
  name: string;
  id: string;
  attributes: string[];
  children: StaticTreeNode[];
  // Lets the client open this component's real source directly on click --
  // there's no live element to select/inspect in a purely static tree, so
  // "click a node" means "open its file" here rather than what it means for
  // the live tree. Matches SourceLocation's 1-based line/column convention
  // (see staticAnalysis.ts) -- the same numbering openSource.ts/
  // sourceOpeningWiring.ts already expect off the live protocol's own
  // `source` tuple.
  filePath: string;
  line: number;
  column: number;
}

// Safety valve against combinatorial blowup: unlike the live tree (bounded
// by however many real fiber instances actually mounted), a component
// reachable from many different static parents (e.g. a generic Button used
// all over the app) gets duplicated once per place it's rendered -- a
// handful of widely-shared components could otherwise multiply out to an
// unusably huge forest. Stops adding new nodes once hit; already-started
// subtrees are simply not descended into further.
const MAX_NODES = 500;

// Builds a static composition forest from `result`'s already-discovered
// components: an edge from A to B means "A's JSX body directly renders B"
// (see findRenderedChildIds), and a root is any component never rendered by
// another known component -- the closest static analog to a live tree's
// actually-mounted roots (an app's pages/layouts, typically). Falls back to
// treating every component as its own root if that rule finds none at all
// (a fully-cyclic reference graph, or one this analysis just couldn't
// resolve any edges for) rather than returning nothing.
//
// Roughly mirrors storeBridge.ts's buildTree wrapping convention (a single
// reachable root returns unwrapped, more than one wrapped under a synthetic
// "Roots" node), except the result is a forest, not one tree: a root-level
// component nothing ever imports (see computeUnusedComponents) is excluded
// from "Roots" and returned as its own separate, edge-less top-level entry
// instead -- being nested under "Roots" would visually claim it's reachable
// from a real entry point, which is exactly what "Unused" means it isn't.
// No components at all returns undefined; the client normalizes a single
// live tree the same way (see TreeView.tsx), so it needs no special casing
// to tell a static forest apart from a live tree.
// Picks the single most useful thing to flag about a component, in priority
// order -- client/components/FlowNode.tsx colors a node by its FIRST
// attribute only, so a component matching more than one category (e.g. a
// heavily-depended-on Context provider) needs one deliberate winner rather
// than an arbitrary one. Ordered by how actionable/alarming each signal is:
// dead code first, then a structural risk concentration, then two milder,
// more "good to know" signals.
function classifyNode(
  id: string,
  derived: ReturnType<typeof getDerivedAnalysis>,
): string[] {
  if (derived.unusedIds.has(id)) {
    return ["Unused"];
  }
  const metrics = derived.dependencyMetricsById.get(id);
  if (metrics?.fanInOutlier || metrics?.fanOutOutlier) {
    return ["Hub"];
  }
  if ((derived.contextUsageById.get(id)?.provides.length ?? 0) > 0) {
    return ["Context"];
  }
  if ((derived.deadPropsById.get(id)?.length ?? 0) > 0) {
    return ["Dead Props"];
  }
  return [];
}

// A forest, not a single tree: every entry is its own disconnected graph
// component with no edge into any other entry. Ordinarily this is a single-
// element array (the "Roots" wrapper, or a lone root unwrapped). An unused
// root-level component (nothing anywhere imports it -- see classifyNode's
// "Unused" case) gets its own separate entry instead of being folded into
// that wrapper: nesting it under "Roots" alongside real entry points would
// visually claim the app can actually reach it, which is precisely what
// "Unused" means it can't. It may still have its OWN children below it
// (whatever it itself renders), just nothing rendering it from above.
export function buildStaticComponentTree(result: StaticAnalysisResult): StaticTreeNode[] | undefined {
  const derived = getDerivedAnalysis(result);
  const {
    edges: { childIdsById: renderedChildIdsById, parentIdsById },
    unusedIds,
  } = derived;
  const infoById = new Map(result.components.map((component) => [component.id, component]));
  let nodeCount = 0;

  function buildNode(id: string, ancestorIds: ReadonlySet<string>): StaticTreeNode | undefined {
    if (nodeCount >= MAX_NODES) {
      return undefined;
    }
    const info = infoById.get(id);
    if (!info) {
      return undefined;
    }
    nodeCount += 1;
    const node: StaticTreeNode = {
      id,
      name: info.displayName,
      // client/components/FlowNode.tsx colors a node by this field -- see
      // classifyNode's own comment for the priority order when more than
      // one category applies.
      attributes: classifyNode(id, derived),
      children: [],
      filePath: info.location.filePath,
      line: info.location.line,
      column: info.location.column,
    };
    if (ancestorIds.has(id)) {
      // Cyclical static composition (A renders B renders A) -- stop here
      // rather than recursing forever. The live tree can't have this
      // problem (it reflects one concrete, finite instance tree), but a
      // purely static reference graph genuinely can.
      return node;
    }
    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(id);
    for (const childId of renderedChildIdsById.get(id) ?? []) {
      const childNode = buildNode(childId, nextAncestors);
      if (childNode) {
        node.children.push(childNode);
      }
    }
    return node;
  }

  let rootIds = result.components.map((component) => component.id).filter((id) => !parentIdsById.has(id));
  if (rootIds.length === 0) {
    rootIds = result.components.map((component) => component.id);
  }

  const reachableRootIds = rootIds.filter((id) => !unusedIds.has(id));
  const unusedRootIds = rootIds.filter((id) => unusedIds.has(id));

  // Unused roots are spent against the shared MAX_NODES budget FIRST, ahead
  // of the reachable tree -- deliberately, not just build order. A root-
  // level component can only ever appear once regardless (it has no parent
  // to be duplicated under, unlike a widely-shared reachable component,
  // which is what MAX_NODES actually guards against -- see its own
  // comment), so islanding it costs at most its own small subtree. Since
  // surfacing exactly these dead-code islands is this forest's whole reason
  // to exist, a large tree that must sacrifice something to the budget
  // should sacrifice reachable-subtree depth (still explorable live, or by
  // drilling into a node) rather than silently dropping an "Unused" island
  // -- and its own top-level node -- with nothing telling the user it was
  // ever there.
  const unusedRoots = unusedRootIds
    .map((id) => buildNode(id, new Set()))
    .filter((node): node is StaticTreeNode => node !== undefined);
  const reachableRoots = reachableRootIds
    .map((id) => buildNode(id, new Set()))
    .filter((node): node is StaticTreeNode => node !== undefined);

  const forest: StaticTreeNode[] = [...unusedRoots];
  if (reachableRoots.length === 1) {
    forest.unshift(reachableRoots[0]);
  } else if (reachableRoots.length > 1) {
    // No real file backs this synthetic wrapper -- an empty filePath is the
    // client's signal (see TreeView.tsx's handleNodeClick) that there's
    // nothing to open here, same as it treats the live tree's own synthetic
    // "Roots" node as not inspectable.
    forest.unshift({
      name: "Roots",
      id: "static-roots",
      attributes: [],
      children: reachableRoots,
      filePath: "",
      line: 0,
      column: 0,
    });
  }

  return forest.length > 0 ? forest : undefined;
}
