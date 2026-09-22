import * as vscode from "vscode";
import type { StaticAnalysisResult } from "./staticAnalysis";
import { buildStaticComponentTree } from "./staticComponentTree";

// Proactively computes and pushes a static "composition preview" tree to the
// tree webview the moment the panel opens -- built by parsing the
// workspace's own source (ts-morph JSX-composition analysis, see
// staticComponentTree.ts), available well before Puppeteer/the live
// DevTools connection exists. Unlike coverageAnalysisWiring.ts's
// wireCoverageAnalysis, this doesn't wait for a webview message: it runs
// once, unconditionally, as soon as it's wired. client/App.tsx holds this
// alongside the live tree and lets the user pick which one to view (see
// client/useStaticComponentTree.ts).
//
// `getAnalysis` is a shared, TTL-less accessor (see
// staticAnalysisSession.ts) rather than a direct analyzeWorkspaceCached
// call: ViewPanel.ts hands the SAME accessor to staticComponentDetailWiring.ts
// too, so a node clicked any amount of time after this tree was built
// still resolves against the identical result object -- both for
// consistency (the sidebar's cross-references match what's actually drawn)
// and for staticComponentDetail.ts's own per-object derived-analysis cache,
// which would otherwise start from zero the moment analyzeWorkspaceCached's
// own short TTL lapses (see that session module's comment for the bug this
// closes).
export function wireStaticComponentTree(
  webview: vscode.Webview,
  getAnalysis: () => Promise<StaticAnalysisResult>,
): vscode.Disposable {
  let disposed = false;

  void getAnalysis().then((result) => {
    if (disposed) {
      return;
    }
    try {
      const tree = buildStaticComponentTree(result);
      if (!disposed && tree && tree.length > 0) {
        void webview.postMessage({ type: "staticComponentTree", tree });
      }
    } catch {
      // A static preview is a nice-to-have head start, not load-bearing --
      // the live tree (once Puppeteer connects) is the real source of
      // truth, so a parse failure here just means no early preview rather
      // than an error worth surfacing to the user.
    }
  });

  return new vscode.Disposable(() => {
    disposed = true;
  });
}
