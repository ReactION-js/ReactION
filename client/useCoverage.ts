import { useCallback, useEffect, useRef, useState } from "react";
import type { DevtoolsStore } from "react-devtools-inline/frontend";
import { correlateCoverage, type CoverageResult, type StaticComponentSummary } from "./coverage";

export interface CoverageController {
  result: CoverageResult | undefined;
  isAnalyzing: boolean;
  error: string | undefined;
  runCoverageAnalysis: () => void;
}

interface StaticComponentsHostMessage {
  type?: string;
  components?: StaticComponentSummary[];
  message?: string;
}

// Owns the "Check Coverage" toolbar action: an explicit, user-triggered
// request that asks the extension host to run 5a's ts-morph analysis (see
// src/coverageAnalysisWiring.ts's "runCoverageAnalysis" / "staticComponents"
// host-only message pair -- NOT the wall/bridge to the page, same pattern as
// client/App.tsx's "openSource") and correlates the resulting statically-
// known component list against useEverRendered.ts's cumulative live-session
// Set, by displayName. Mirrors useProfiler.ts/useContextMap.ts's shape: a
// focused hook owning one feature's state/effects.
//
// See client/coverage.ts's doc comment for the "coverage, not dead code"
// framing this hook's result must be presented under, and the two
// unsolved correlation limitations (displayName collisions, bundler
// renaming) it inherits as-is.
export function useCoverage(
  store: DevtoolsStore | undefined,
  vscodeApi: VsCodeApi,
  getEverRenderedNames: () => ReadonlySet<string>,
): CoverageController {
  const [result, setResult] = useState<CoverageResult | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const isAnalyzingRef = useRef(false);
  // Bumped whenever `store` changes (a reconnect swaps in a brand-new Store,
  // see storeBridge.ts) so a "staticComponents"/"staticComponentsError"
  // response for a request made BEFORE the reconnect can't land afterward
  // and get applied against the just-reset session -- mirrors
  // useContextMap.ts's generationRef guard against exactly the same class of
  // stale-response race.
  const generationRef = useRef(0);
  const requestGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    generationRef.current += 1;
    requestGenerationRef.current = null;
    isAnalyzingRef.current = false;
    setIsAnalyzing(false);
    setResult(undefined);
    setError(undefined);
  }, [store]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as StaticComponentsHostMessage;
      if (data?.type !== "staticComponents" && data?.type !== "staticComponentsError") {
        return;
      }
      if (requestGenerationRef.current !== generationRef.current) {
        return; // Stale response for a request made before a reconnect.
      }
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
      if (data.type === "staticComponents") {
        setResult(correlateCoverage(data.components ?? [], getEverRenderedNames()));
        setError(undefined);
      } else {
        setError(data.message ?? "Static analysis failed.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [getEverRenderedNames]);

  const runCoverageAnalysis = useCallback(() => {
    if (isAnalyzingRef.current) {
      return; // A request for the current session is already in flight.
    }
    isAnalyzingRef.current = true;
    requestGenerationRef.current = generationRef.current;
    setIsAnalyzing(true);
    setError(undefined);
    setResult(undefined);
    vscodeApi.postMessage({ type: "runCoverageAnalysis" });
  }, [vscodeApi]);

  return { result, isAnalyzing, error, runCoverageAnalysis };
}
