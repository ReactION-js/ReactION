// Pure correlation over already-gathered data: the statically-known
// component list from src/staticAnalysis.ts's analyzeWorkspace (delivered by
// src/coverageAnalysisWiring.ts) against the cumulative "ever-rendered"
// displayName set from useEverRendered.ts. No React, DOM, bridge, or
// filesystem dependency -- plain data in, plain data out (see
// useCoverage.ts for the orchestration that gathers both sides and
// client/components/CoveragePanel.tsx for how the result is shown).

// Deliberately just the fields useCoverage.ts / CoveragePanel.tsx need
// (displayName to correlate on, the rest to jump to source) -- NOT the full
// ComponentInfo shape (props, id, etc.) from staticAnalysis.ts, which stays
// host-side. See src/coverageAnalysisWiring.ts for where this gets built
// from a real ComponentInfo's `location`.
export interface StaticComponentSummary {
  displayName: string;
  filePath: string;
  line: number;
  column: number;
}

export interface CoverageResult {
  totalComponents: number;
  notRendered: StaticComponentSummary[];
  // (total - notRendered.length) / total; 1 (100%) for an empty static
  // component list rather than NaN -- "nothing to miss" reads as full
  // coverage, not an error state.
  coverageFraction: number;
}

// FRAMING (see REARCHITECTURE-PLAN.md's Phase 5 risk note: "Frame as
// coverage, not absolute dead code"): a component in `notRendered` was not
// OBSERVED rendering during this particular live session -- it is not
// thereby proven dead. A modal that was never opened, an error boundary
// that never triggered, or a route that was never visited would all
// correctly, and misleadingly-if-misread, show up here despite being real,
// used components. Every caller surfacing this result (CoveragePanel.tsx)
// must keep that framing in its copy.
//
// Two known, deliberately UNSOLVED correlation limitations (matching how
// client/contextMap.ts documents its own analogous displayName-collision
// gap rather than attempting to resolve it):
//
//  1. Two statically-distinct components that happen to share a displayName
//     are indistinguishable from the live Store's perspective -- correlating
//     by name alone means a genuinely-unrendered component can be marked
//     "rendered" because some OTHER, differently-defined component with the
//     same name mounted instead, and vice versa.
//
//  2. A bundler can rename a component during compilation. This project's
//     OWN esbuild-based spike harnesses have repeatedly observed esbuild
//     renaming a component on a name collision (e.g. `Counter` ->
//     `Counter2`) -- see spike/run-phase1.js's sample-app fixture. If the
//     app under inspection is served through a bundler that mangles names
//     this way, a component that WAS genuinely rendered under a mangled
//     runtime displayName no longer matches its statically-declared name,
//     and gets incorrectly reported here as not rendered.
export function correlateCoverage(
  staticComponents: readonly StaticComponentSummary[],
  everRenderedNames: ReadonlySet<string>,
): CoverageResult {
  const notRendered = staticComponents.filter(
    (component) => !everRenderedNames.has(component.displayName),
  );
  const totalComponents = staticComponents.length;
  return {
    totalComponents,
    notRendered,
    coverageFraction: totalComponents === 0 ? 1 : (totalComponents - notRendered.length) / totalComponents,
  };
}
