import * as path from "path";
import type { ComponentInfo, DeadPropsEntry } from "./staticAnalysis";

export type StaticAnalysisViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; unusedComponents: ComponentInfo[]; deadProps: DeadPropsEntry[] };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLocation(workspaceRoot: string, component: ComponentInfo): string {
  const relative = path.relative(workspaceRoot, component.location.filePath);
  return `${relative}:${component.location.line}:${component.location.column}`;
}

const STYLE = `
  body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); padding: 0 20px 20px; }
  h1 { font-size: 1.3em; }
  h2 { font-size: 1.05em; margin-top: 28px; border-bottom: 1px solid var(--vscode-panel-border, #444); padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top; }
  th { color: var(--vscode-descriptionForeground); font-weight: 600; font-size: 0.9em; }
  code { font-family: var(--vscode-editor-font-family, monospace); }
  .empty-state { color: var(--vscode-descriptionForeground); font-style: italic; margin-top: 8px; }
  .error { color: var(--vscode-errorForeground, #f14c4c); white-space: pre-wrap; }
  .loading { color: var(--vscode-descriptionForeground); }
  .dead-prop { color: var(--vscode-errorForeground, #f14c4c); margin-right: 6px; }
`;

function shell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <title>ReactION: Source Analysis</title>
  <style>${STYLE}</style>
</head>
<body>
  <h1>ReactION: Source Analysis</h1>
  ${body}
</body>
</html>`;
}

function renderUnusedComponents(workspaceRoot: string, unusedComponents: ComponentInfo[]): string {
  if (unusedComponents.length === 0) {
    return `<h2>Unused Components</h2><p class="empty-state">No unused components found.</p>`;
  }
  const rows = unusedComponents
    .map(
      (component) => `<tr><td>${escapeHtml(component.displayName)}</td><td><code>${escapeHtml(
        formatLocation(workspaceRoot, component),
      )}</code></td></tr>`,
    )
    .join("\n");
  return `<h2>Unused Components</h2>
  <table>
    <thead><tr><th>Component</th><th>Location</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderDeadProps(workspaceRoot: string, deadProps: DeadPropsEntry[]): string {
  if (deadProps.length === 0) {
    return `<h2>Dead Props</h2><p class="empty-state">No dead props found.</p>`;
  }
  const rows = deadProps
    .map((entry) => {
      const propList = entry.deadProps
        .map((name) => `<span class="dead-prop">${escapeHtml(name)}</span>`)
        .join("");
      return `<tr><td>${escapeHtml(entry.component.displayName)}</td><td>${propList}</td><td><code>${escapeHtml(
        formatLocation(workspaceRoot, entry.component),
      )}</code></td></tr>`;
    })
    .join("\n");
  return `<h2>Dead Props</h2>
  <table>
    <thead><tr><th>Component</th><th>Dead props</th><th>Location</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// Pure function (no vscode.Webview dependency, unlike TreeViewPanel's
// generateTreeViewHtml) since this panel needs no bundle URI, nonce, or
// script at all -- it's a static, host-rendered table, not a React app.
export function generateStaticAnalysisHtml(workspaceRoot: string, state: StaticAnalysisViewState): string {
  if (state.status === "loading") {
    return shell(`<p class="loading">Analyzing source files&hellip;</p>`);
  }
  if (state.status === "error") {
    return shell(`<p class="error">${escapeHtml(state.message)}</p>`);
  }
  return shell(
    `${renderUnusedComponents(workspaceRoot, state.unusedComponents)}\n${renderDeadProps(
      workspaceRoot,
      state.deadProps,
    )}`,
  );
}
