import * as vscode from "vscode";
import { analyzeWorkspaceCached, computeDeadProps, computeUnusedComponents } from "./staticAnalysis";
import { computePropDrilling } from "./propDrilling";
import { computeDependencyMetrics } from "./dependencyMetrics";
import { generateStaticAnalysisHtml } from "./staticAnalysisHtml";

// Shows unused-component / dead-prop findings from a pure, on-disk source
// analysis (ts-morph over the workspace's own .ts/.tsx files) -- completely
// independent of the live Chrome/DevTools-protocol pipeline the other panels
// drive, so this gets its own small panel rather than reusing ViewPanel's.
export default class StaticAnalysisPanel {
  public static currentPanel: StaticAnalysisPanel | undefined;
  public static readonly viewType = "ReactION.staticAnalysis";

  private readonly panel: vscode.WebviewPanel;
  private readonly workspaceRoot: string;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel, workspaceRoot: string) {
    this.panel = panel;
    this.workspaceRoot = workspaceRoot;
    this.panel.onDidDispose(() => this.dispose());
    void this.runAnalysis();
  }

  public static createOrShow(workspaceRoot: string): void {
    if (StaticAnalysisPanel.currentPanel) {
      StaticAnalysisPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      void StaticAnalysisPanel.currentPanel.runAnalysis();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      StaticAnalysisPanel.viewType,
      "ReactION: Source Analysis",
      vscode.ViewColumn.Active,
      { enableScripts: false },
    );

    StaticAnalysisPanel.currentPanel = new StaticAnalysisPanel(panel, workspaceRoot);
  }

  private async runAnalysis(): Promise<void> {
    this.panel.webview.html = generateStaticAnalysisHtml(this.workspaceRoot, { status: "loading" });
    // Yield once so VS Code actually flushes the "loading" HTML to the
    // webview before the synchronous, potentially-slow ts-morph parse below
    // blocks this same event loop -- without this, a large workspace would
    // never visibly show the loading state at all.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (this.disposed) return;

    try {
      // forceFresh: true -- this command IS the user's explicit "give me a
      // current result" request (see analyzeWorkspaceCached's own doc
      // comment), and it already used to re-run unconditionally on every
      // invocation even while its own panel was still open. Still populates
      // the shared cache below, so a "Check Coverage" click moments later
      // (coverageAnalysisWiring.ts) can reuse this exact result instead of
      // paying its own full parse.
      const result = analyzeWorkspaceCached(this.workspaceRoot, { forceFresh: true });
      const unusedComponents = computeUnusedComponents(result);
      const deadProps = computeDeadProps(result);
      const propDrilling = computePropDrilling(result);
      const dependencyMetrics = computeDependencyMetrics(result);
      if (this.disposed) return;
      this.panel.webview.html = generateStaticAnalysisHtml(this.workspaceRoot, {
        status: "done",
        unusedComponents,
        deadProps,
        propDrilling,
        dependencyMetrics,
      });
    } catch (error) {
      if (this.disposed) return;
      this.panel.webview.html = generateStaticAnalysisHtml(this.workspaceRoot, {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    StaticAnalysisPanel.currentPanel = undefined;
    this.panel.dispose();
  }
}
