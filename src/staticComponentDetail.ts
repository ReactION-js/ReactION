import type { ComponentInfo, StaticAnalysisResult } from "./staticAnalysis";
import { computeDeadProps, computeUnusedComponents } from "./staticAnalysis";
import { computeDependencyMetrics, type DependencyMetricsEntry } from "./dependencyMetrics";
import { computePropDrilling } from "./propDrilling";
import { computeStaticRenderEdges, type StaticRenderEdges } from "./staticComponentGraph";
import { computeContextUsageById, type ComponentContextUsage } from "./staticContextUsage";

export interface StaticComponentRef {
  id: string;
  displayName: string;
}

export interface StaticPropInfo {
  name: string;
  type: string;
  required: boolean;
  description: string | undefined;
}

// Everything this codebase's static analysis already knows (or can newly
// derive, see staticContextUsage.ts) about ONE component, gathered into a
// single payload for the static tree's per-node sidebar
// (client/components/StaticInspectorPanel.tsx) -- the static-tree analog of
// the live tree's InspectedElement, built entirely from already-cached
// analysis rather than a live bridge round trip.
export interface StaticComponentDetail {
  id: string;
  displayName: string;
  filePath: string;
  line: number;
  column: number;
  props: StaticPropInfo[];
  // How central this component is in the file-level import graph (see
  // dependencyMetrics.ts) -- fanIn/fanOut are file-level, so every component
  // co-located in the same file shares its file's numbers.
  fanIn: number;
  fanOut: number;
  fanInOutlier: boolean;
  fanOutOutlier: boolean;
  // True if computeUnusedComponents flags this component as never
  // referenced from anywhere else in the workspace -- a real "is this dead
  // code" signal, not just "never rendered THIS session" (Check Coverage's
  // own, session-scoped signal).
  unused: boolean;
  // Props this component declares but its own body never reads (see
  // staticAnalysis.ts's computeDeadProps).
  deadProps: string[];
  // Props this component receives and ONLY forwards onward, never uses
  // itself (see propDrilling.ts) -- worth knowing when reading its own
  // prop list, since a required prop can be "dead" at this layer while
  // still being real and used further down the chain.
  drilledProps: string[];
  renders: StaticComponentRef[];
  renderedBy: StaticComponentRef[];
  providesContext: string[];
  consumesContext: string[];
}

// The six analyses below (computeStaticRenderEdges/computeDependencyMetrics/
// computeDeadProps/computeUnusedComponents/computePropDrilling/
// computeContextUsageById) each walk EVERY component's AST -- necessary work
// once, but buildStaticComponentDetail only ever needs one component's slice
// of it. Without this cache, every single node click re-ran all six full-
// codebase analyses just to answer for one id: measured at 3.2s per click on
// a real 64-component project, entirely wasted since analyzeWorkspaceCached
// already hands back the SAME `result` object on every click between
// re-parses. Keyed by that object's identity (a WeakMap, not a manual TTL)
// so this invalidates itself for free the moment analyzeWorkspaceCached
// hands back a fresh `result` after a real re-parse -- no separate
// invalidation logic to keep in sync with that cache's own policy.
interface DerivedStaticAnalysis {
  edges: StaticRenderEdges;
  dependencyMetricsById: Map<string, DependencyMetricsEntry>;
  deadPropsById: Map<string, string[]>;
  unusedIds: Set<string>;
  drilledPropsById: Map<string, Set<string>>;
  contextUsageById: Map<string, ComponentContextUsage>;
}

const derivedAnalysisCache = new WeakMap<StaticAnalysisResult, DerivedStaticAnalysis>();

// Exported so staticComponentTree.ts's initial tree build (which also needs
// the render edges and unused-component set) shares this SAME cache entry
// instead of computing its own copy -- one full-codebase pass per `result`,
// not one for the tree and another for the first node clicked.
export function getDerivedAnalysis(result: StaticAnalysisResult): DerivedStaticAnalysis {
  const cached = derivedAnalysisCache.get(result);
  if (cached) {
    return cached;
  }

  const drilledPropsById = new Map<string, Set<string>>();
  for (const chain of computePropDrilling(result)) {
    for (const component of chain.components) {
      let props = drilledPropsById.get(component.id);
      if (!props) {
        props = new Set<string>();
        drilledPropsById.set(component.id, props);
      }
      props.add(chain.propName);
    }
  }

  const derived: DerivedStaticAnalysis = {
    edges: computeStaticRenderEdges(result),
    dependencyMetricsById: new Map(
      computeDependencyMetrics(result).map((entry) => [entry.component.id, entry]),
    ),
    deadPropsById: new Map(
      computeDeadProps(result).map((entry) => [entry.component.id, entry.deadProps]),
    ),
    unusedIds: new Set(computeUnusedComponents(result).map((component) => component.id)),
    drilledPropsById,
    contextUsageById: computeContextUsageById(result),
  };
  derivedAnalysisCache.set(result, derived);
  return derived;
}

export function buildStaticComponentDetail(
  result: StaticAnalysisResult,
  id: string,
): StaticComponentDetail | undefined {
  const info = result.components.find((component) => component.id === id);
  if (!info) {
    return undefined;
  }

  const { edges, dependencyMetricsById, deadPropsById, unusedIds, drilledPropsById, contextUsageById } =
    getDerivedAnalysis(result);

  const infoById = new Map<string, ComponentInfo>(
    result.components.map((component) => [component.id, component]),
  );
  const toRefs = (ids: ReadonlySet<string> | undefined): StaticComponentRef[] =>
    [...(ids ?? [])]
      .map((childId) => infoById.get(childId))
      .filter((component): component is ComponentInfo => component !== undefined)
      .map((component) => ({ id: component.id, displayName: component.displayName }));

  const dependencyMetrics = dependencyMetricsById.get(id);
  const contextUsage = contextUsageById.get(id);

  return {
    id,
    displayName: info.displayName,
    filePath: info.location.filePath,
    line: info.location.line,
    column: info.location.column,
    props: info.props.map((prop) => ({
      name: prop.name,
      type: prop.type,
      required: prop.required,
      description: prop.description,
    })),
    fanIn: dependencyMetrics?.fanIn ?? 0,
    fanOut: dependencyMetrics?.fanOut ?? 0,
    fanInOutlier: dependencyMetrics?.fanInOutlier ?? false,
    fanOutOutlier: dependencyMetrics?.fanOutOutlier ?? false,
    unused: unusedIds.has(id),
    deadProps: deadPropsById.get(id) ?? [],
    drilledProps: [...(drilledPropsById.get(id) ?? [])],
    renders: toRefs(edges.childIdsById.get(id)),
    renderedBy: toRefs(edges.parentIdsById.get(id)),
    providesContext: contextUsage?.provides ?? [],
    consumesContext: contextUsage?.consumes ?? [],
  };
}
