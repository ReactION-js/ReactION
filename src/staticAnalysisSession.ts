import { analyzeWorkspaceCached, type StaticAnalysisResult } from "./staticAnalysis";

// Computes the static analysis exactly once for the lifetime of the
// returned accessor, with no TTL to expire -- unlike analyzeWorkspaceCached's
// own 5s TTL (STATIC_ANALYSIS_CACHE_TTL_MS, tuned for "moments apart"
// callers like coverageAnalysisWiring.ts/StaticAnalysisPanel bouncing
// between two explicit UI actions), the static tab's tree
// (staticComponentTreeWiring.ts) and its per-node detail sidebar
// (staticComponentDetailWiring.ts) need to stay perfectly consistent with
// EACH OTHER for as long as that tab stays open, however long a real user
// actually takes to look at the tree before clicking something -- often
// well past 5 seconds. Reusing analyzeWorkspaceCached directly in both
// places would silently re-parse (and hand back a DIFFERENT result object)
// the moment that TTL lapses, which also defeats
// staticComponentDetail.ts's own per-object derived-analysis cache: a new
// object has never been seen before, so that cache starts from zero again
// too. One ViewPanel instance = one static analysis snapshot, computed
// once, shared by both wirings, for its whole lifetime -- there's no
// refresh path for the static tab today regardless (closing and reopening
// it is what re-analyzes), so this doesn't change when a re-parse
// happens, only removes a spurious extra one 5 seconds in.
export function createStaticAnalysisSession(
  workspaceRoot: string,
): () => Promise<StaticAnalysisResult> {
  let pending: Promise<StaticAnalysisResult> | undefined;
  return () => {
    if (!pending) {
      // Yields once so kicking this off doesn't itself delay the
      // synchronous setup right after it (mirrors the setImmediate gate
      // the wiring functions used to apply individually). The explicit
      // try/catch matters here: a throw inside a setImmediate callback is
      // NOT caught by the Promise constructor's own implicit try/catch
      // (that only wraps the executor's synchronous body) -- without this,
      // a parse failure would surface as an unhandled exception instead of
      // a rejection either wiring function could actually handle.
      pending = new Promise<StaticAnalysisResult>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(analyzeWorkspaceCached(workspaceRoot));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
      // A failed parse shouldn't be cached forever -- clear it so the NEXT
      // call (a later click, or the tree wiring retrying) gets a fresh
      // attempt instead of permanently replaying the same rejection for
      // this panel's whole lifetime.
      pending.catch(() => {
        pending = undefined;
      });
    }
    return pending;
  };
}
