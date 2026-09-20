import * as vscode from "vscode";
import { analyzeWorkspace } from "./staticAnalysis";

interface RunCoverageAnalysisMessage {
  type?: string;
}

// Deliberately just the fields client/coverage.ts's correlateCoverage needs
// (displayName to correlate on, the rest to jump to source) -- NOT the full
// ComponentInfo (props, id, AST handles) analyzeWorkspace produces, which
// has no business leaving the host.
export interface StaticComponentSummary {
  displayName: string;
  filePath: string;
  line: number;
  column: number;
}

// Listens for the LIVE tree webview's host-only "runCoverageAnalysis"
// message (see client/useCoverage.ts -- posted directly via
// vscodeApi.postMessage, NOT through the wall/bridge to the page, the same
// pattern Task 3b's "openSource" established) and answers with 5a's
// analyzeWorkspace results, reshaped down to StaticComponentSummary and
// posted back to the SAME webview as "staticComponents"/
// "staticComponentsError". Deliberately reuses analyzeWorkspace directly
// rather than StaticAnalysisPanel: that panel owns a completely separate
// webview/HTML for unused-component/dead-prop/prop-drilling/dependency
// findings and is untouched by this task -- this is a different feature
// living in the live tree webview.
export function wireCoverageAnalysis(
  webview: vscode.Webview,
  workspaceRoot: string,
): vscode.Disposable {
  let disposed = false;
  // A second "runCoverageAnalysis" message while one is already running is
  // simply ignored: analyzeWorkspace has no cancellation, and the webview
  // side (useCoverage.ts) already disables the button while a request is in
  // flight, so this is a belt-and-suspenders guard against re-entrancy
  // slipping through some other path -- mirrors useProfiler/useContextMap's
  // own re-entrancy discipline on the client.
  let inFlight = false;

  const subscription = webview.onDidReceiveMessage((msg: RunCoverageAnalysisMessage) => {
    if (msg?.type !== "runCoverageAnalysis" || inFlight) {
      return;
    }
    inFlight = true;

    // Yield once so the click that triggered this doesn't block behind the
    // (potentially slow, synchronous) ts-morph parse below with no chance
    // for anything else queued on this same event loop tick to run first --
    // same reasoning as StaticAnalysisPanel.runAnalysis's setImmediate gate.
    void new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      if (disposed) {
        return;
      }
      try {
        const result = analyzeWorkspace(workspaceRoot);
        const components: StaticComponentSummary[] = result.components.map((component) => ({
          displayName: component.displayName,
          filePath: component.location.filePath,
          line: component.location.line,
          column: component.location.column,
        }));
        if (!disposed) {
          void webview.postMessage({ type: "staticComponents", components });
        }
      } catch (error) {
        if (!disposed) {
          void webview.postMessage({
            type: "staticComponentsError",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        inFlight = false;
      }
    });
  });

  return new vscode.Disposable(() => {
    disposed = true;
    subscription.dispose();
  });
}
