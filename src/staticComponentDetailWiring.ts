import * as vscode from "vscode";
import type { StaticAnalysisResult } from "./staticAnalysis";
import { buildStaticComponentDetail } from "./staticComponentDetail";

interface InspectStaticComponentMessage {
  type?: string;
  id?: string;
}

// Answers the static tree's per-node sidebar (client/useStaticComponentDetail.ts
// / client/components/StaticInspectorPanel.tsx): given a component id from a
// clicked static-tree node, gathers everything this codebase's static
// analysis already knows about it (props, fan-in/out, dead props, prop-
// drilling involvement, context provide/consume, static renders/rendered-by)
// into one payload.
//
// `getAnalysis` is the SAME shared, TTL-less accessor
// staticComponentTreeWiring.ts is given (see staticAnalysisSession.ts) --
// deliberately not a direct analyzeWorkspaceCached call, whose own 5s TTL
// would otherwise force a fresh, ~3s six-analysis re-run (see
// staticComponentDetail.ts's derived-analysis cache) the moment that long
// passes between the tab opening and a node actually getting clicked, which
// is well within normal browsing pace, not just at cache-miss startup.
export function wireStaticComponentDetail(
  webview: vscode.Webview,
  getAnalysis: () => Promise<StaticAnalysisResult>,
): vscode.Disposable {
  let disposed = false;

  const subscription = webview.onDidReceiveMessage((msg: InspectStaticComponentMessage) => {
    if (msg?.type !== "inspectStaticComponent" || typeof msg.id !== "string") {
      return;
    }
    const id = msg.id;

    void getAnalysis().then(
      (result) => {
        if (disposed) {
          return;
        }
        try {
          const detail = buildStaticComponentDetail(result, id);
          void webview.postMessage({ type: "staticComponentDetail", id, detail });
        } catch (error) {
          void webview.postMessage({
            type: "staticComponentDetail",
            id,
            detail: undefined,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      (error) => {
        if (!disposed) {
          void webview.postMessage({
            type: "staticComponentDetail",
            id,
            detail: undefined,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  });

  return new vscode.Disposable(() => {
    disposed = true;
    subscription.dispose();
  });
}
