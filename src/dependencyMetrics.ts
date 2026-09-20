import type { ComponentInfo, FileImportEdge, StaticAnalysisResult } from "./staticAnalysis";

export interface DependencyMetricsEntry {
  component: ComponentInfo;
  fanIn: number;
  fanOut: number;
  fanInOutlier: boolean;
  fanOutOutlier: boolean;
}

// SAME-FILE DEDUP RULE: a file reached from the SAME other file by both a
// static `import` and a dynamic `import()` is still just one dependency
// relationship between those two files, not two -- the other file is one
// importer either way. Deduping (from, to) pairs via a Map<from, Set<to>>
// (rather than flattening each pair into a single delimited string key)
// gets this right for free without needing any delimiter character at all --
// no separator could be assumed safe against every legal filesystem path
// otherwise -- the static edge and the dynamic edge between the same two
// files land in the same inner Set, while a static edge from file A and a
// dynamic edge from a DIFFERENT file B targeting the same file go into two
// different outer entries, genuinely two different importers. See Hub.tsx /
// DualImporter.tsx in spike/fixtures/static-analysis-app/src/components/
// depgraph and the matching regression test in staticAnalysis.test.ts.
function dedupedFileEdges(result: StaticAnalysisResult): FileImportEdge[] {
  const toFilesByFrom = new Map<string, Set<string>>();
  for (const edge of [...result.fileImportEdges, ...result.dynamicImportEdges]) {
    // A file importing itself would otherwise inflate both its own fan-in
    // and fan-out by one; not something buildReferenceGraph is expected to
    // produce, but cheap to guard against here regardless.
    if (edge.from === edge.to) continue;
    let toFiles = toFilesByFrom.get(edge.from);
    if (!toFiles) {
      toFiles = new Set<string>();
      toFilesByFrom.set(edge.from, toFiles);
    }
    toFiles.add(edge.to);
  }

  const deduped: FileImportEdge[] = [];
  for (const [from, toFiles] of toFilesByFrom) {
    for (const to of toFiles) deduped.push({ from, to });
  }
  return deduped;
}

interface FileFanCounts {
  fanIn: number;
  fanOut: number;
}

// Fan-in/out is inherently a FILE-level measurement -- that's what the
// import edges connect -- computed once here over the deduped edge set
// (O(edges)), not by re-walking the AST. Every component declared in the
// same file shares that file's numbers (see computeDependencyMetrics below);
// a per-symbol variant would need the same kind of expensive per-symbol
// reference search 5a's own research found to be ~29x slower at scale for a
// much narrower question (is this one symbol referenced at all), so this
// intentionally stays at the file level.
function computeFileFanCounts(result: StaticAnalysisResult): Map<string, FileFanCounts> {
  const fanInByFile = new Map<string, number>();
  const fanOutByFile = new Map<string, number>();
  for (const edge of dedupedFileEdges(result)) {
    fanOutByFile.set(edge.from, (fanOutByFile.get(edge.from) ?? 0) + 1);
    fanInByFile.set(edge.to, (fanInByFile.get(edge.to) ?? 0) + 1);
  }

  const filesWithComponents = new Set(result.components.map((component) => component.filePath));
  const counts = new Map<string, FileFanCounts>();
  for (const filePath of filesWithComponents) {
    counts.set(filePath, {
      fanIn: fanInByFile.get(filePath) ?? 0,
      fanOut: fanOutByFile.get(filePath) ?? 0,
    });
  }
  return counts;
}

// OUTLIER HIGHLIGHTING METHOD: a modified z-score off the MEDIAN (Iglewicz &
// Hoaglin's median-absolute-deviation method), not a fixed "fan-in > N"
// cutoff and not a plain mean/standard-deviation z-score. Fan-in/out across a
// real codebase is heavily right-skewed -- most files depend on almost
// nothing and are depended on by almost nothing, while a handful of hub
// files dominate -- and mean/stddev are themselves dragged upward by exactly
// the hub values they're supposed to catch, which can hide a dominant hub
// behind its own inflated threshold. (Confirmed while choosing this: a plain
// "mean + 2*stddev" threshold against this task's own Hub fixture case
// failed to flag Hub as an outlier at all, because Hub's own value pulled
// the mean/stddev up enough to clear itself.) The median and MAD barely move
// when one value is huge, so this stays sensitive to exactly that case.
const MODIFIED_Z_SCORE_THRESHOLD = 3.5; // Iglewicz & Hoaglin's own suggested cutoff
// Consistency constants that make each spread measure comparable to a
// standard deviation under an assumed-normal distribution -- MAD ≈ sigma *
// 0.6745, and the mean absolute deviation ≈ sigma * 0.7979 (i.e. sigma ≈
// MAD / 0.6745 ≈ meanAD / 0.7979) -- so the SAME 3.5 threshold above means
// the same thing regardless of which spread measure ends up being usable.
const MAD_TO_SIGMA = 1 / 0.6745;
const MEAN_AD_TO_SIGMA = 1 / 0.7979;

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid];
}

// Only flags values ABOVE the typical range: an unusually LOW fan-in/out
// isn't what "god component" means, and the one-sided "> threshold" check
// here already excludes values at or below the median (a negative or zero
// z-score can never exceed a positive threshold).
function computeHighOutlierFlags(values: number[]): boolean[] {
  if (values.length === 0) return [];
  const med = median([...values].sort((a, b) => a - b));
  const deviations = values.map((value) => Math.abs(value - med));
  const mad = median([...deviations].sort((a, b) => a - b));

  if (mad > 0) {
    return values.map((value) => (value - med) / (MAD_TO_SIGMA * mad) > MODIFIED_Z_SCORE_THRESHOLD);
  }

  // MAD is zero whenever more than half the files share the median value --
  // routine for fan-in/out, where "imports/is imported by nothing" (or
  // "exactly one file") is often the single most common value, even though
  // the REST of the distribution still spreads out a lot. A first version of
  // this function fell back to flagging anything "> median" here, which this
  // task's own ModestPage fixture case (fan-out 1, deliberately unremarkable)
  // caught as a false positive: with a median of 0, EVERY file that imports
  // even a single thing got flagged identically to a real hub -- no better
  // than a fixed "fan-out > 0" cutoff, and not what "outlier" should mean.
  // Falling back to the MEAN absolute deviation instead still anchors on the
  // median (so one huge value can't single-handedly move the anchor the way
  // it would for a plain mean-based z-score) while actually responding to
  // the spread among the non-median values, correctly telling "1, same as
  // most other files that import anything at all" apart from "11".
  const meanAbsoluteDeviation = deviations.reduce((sum, deviation) => sum + deviation, 0) / deviations.length;
  if (meanAbsoluteDeviation === 0) return values.map(() => false); // every value is identical -- nothing is unusual
  return values.map(
    (value) => (value - med) / (MEAN_AD_TO_SIGMA * meanAbsoluteDeviation) > MODIFIED_Z_SCORE_THRESHOLD,
  );
}

export function computeDependencyMetrics(result: StaticAnalysisResult): DependencyMetricsEntry[] {
  const fileCounts = computeFileFanCounts(result);
  const filePaths = [...fileCounts.keys()];

  const fanInValues = filePaths.map((filePath) => fileCounts.get(filePath)!.fanIn);
  const fanOutValues = filePaths.map((filePath) => fileCounts.get(filePath)!.fanOut);
  const fanInOutlierFlags = computeHighOutlierFlags(fanInValues);
  const fanOutOutlierFlags = computeHighOutlierFlags(fanOutValues);
  const fanInOutlierByFile = new Map(filePaths.map((filePath, i) => [filePath, fanInOutlierFlags[i]]));
  const fanOutOutlierByFile = new Map(filePaths.map((filePath, i) => [filePath, fanOutOutlierFlags[i]]));

  const entries: DependencyMetricsEntry[] = result.components.map((component) => {
    const counts = fileCounts.get(component.filePath)!;
    return {
      component,
      fanIn: counts.fanIn,
      fanOut: counts.fanOut,
      fanInOutlier: fanInOutlierByFile.get(component.filePath) ?? false,
      fanOutOutlier: fanOutOutlierByFile.get(component.filePath) ?? false,
    };
  });

  // Ranked by combined fan-in + fan-out, descending -- a "god component" can
  // be unusual on either axis -- with displayName as a stable tiebreaker so
  // equal-scoring entries don't reorder between runs.
  return entries.sort(
    (a, b) =>
      b.fanIn + b.fanOut - (a.fanIn + a.fanOut) || a.component.displayName.localeCompare(b.component.displayName),
  );
}
