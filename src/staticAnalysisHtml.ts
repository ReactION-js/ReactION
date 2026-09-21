import * as path from "path";
import type { ComponentInfo, DeadPropsEntry } from "./staticAnalysis";
import type { PropDrillingChain } from "./propDrilling";
import type { DependencyMetricsEntry } from "./dependencyMetrics";

export type StaticAnalysisViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      unusedComponents: ComponentInfo[];
      deadProps: DeadPropsEntry[];
      propDrilling: PropDrillingChain[];
      dependencyMetrics: DependencyMetricsEntry[];
    };

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
  .note { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 6px; }
  .metric-outlier { color: var(--vscode-errorForeground, #f14c4c); font-weight: 600; }
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

// See PropDrillingTerminal's doc comment in propDrilling.ts for why these
// three read differently: "unresolved-target" (the prop demonstrably keeps
// flowing into something real -- a third-party/library component this
// analysis can't see into) must not read the same as "never consumed" (a
// known component where the trail genuinely goes cold), even though both
// lack a resolved consumer.
function describeTerminal(terminal: PropDrillingChain["terminal"]): string {
  switch (terminal.kind) {
    case "consumed":
      return `consumed in <code>${escapeHtml(terminal.component.displayName)}</code>`;
    case "unresolved-target":
      return `forwarded to <code>&lt;${escapeHtml(terminal.tagName)}&gt;</code> (outside this analysis)`;
    case "unknown":
      return `never consumed (trail ends at <code>${escapeHtml(terminal.component.displayName)}</code>)`;
  }
}

function renderPropDrilling(chains: PropDrillingChain[]): string {
  if (chains.length === 0) {
    return `<h2>Prop Drilling</h2><p class="empty-state">No prop drilling detected.</p>`;
  }
  const items = chains
    .map((chain) => {
      const layers = chain.components.map((c) => escapeHtml(c.displayName)).join(" &rarr; ");
      return `<li><code>${escapeHtml(chain.propName)}</code> drilled through ${layers}, ${describeTerminal(
        chain.terminal,
      )}</li>`;
    })
    .join("\n");
  return `<h2>Prop Drilling</h2>
  <ul>${items}</ul>`;
}

// Unlike the other sections, an empty dependency-metrics table isn't a
// meaningful "nothing interesting found" result -- every file with at least
// one component has SOME fan-in/out (even if it's 0/0), so this list is only
// ever empty when there are no components in the workspace at all. That case
// gets its own short message instead of an empty table.
function renderDependencyMetrics(workspaceRoot: string, entries: DependencyMetricsEntry[]): string {
  if (entries.length === 0) {
    return `<h2>Dependency Metrics</h2><p class="empty-state">No components found.</p>`;
  }
  const rows = entries
    .map((entry) => {
      const fanInCell = entry.fanInOutlier
        ? `<span class="metric-outlier">${entry.fanIn}</span>`
        : `${entry.fanIn}`;
      const fanOutCell = entry.fanOutOutlier
        ? `<span class="metric-outlier">${entry.fanOut}</span>`
        : `${entry.fanOut}`;
      return `<tr><td>${escapeHtml(entry.component.displayName)}</td><td>${fanInCell}</td><td>${fanOutCell}</td><td><code>${escapeHtml(
        formatLocation(workspaceRoot, entry.component),
      )}</code></td></tr>`;
    })
    .join("\n");
  // Ranked, not filtered by a hard cutoff -- "god component" is a judgment
  // call for the developer reading this list relative to their own
  // codebase, not something a fixed number can decide. Highlighted cells are
  // a principled statistical flag (see computeHighOutlierFlags' own comment
  // in dependencyMetrics.ts for why a median-based method was chosen over a
  // fixed threshold or a plain mean/stddev one), not an authoritative
  // verdict -- they're a starting point for the developer's own judgment.
  return `<h2>Dependency Metrics</h2>
  <p class="note">Fan-in/out is counted per FILE and shared by every component declared in that file. Ranked by fan-in + fan-out, highest first. Highlighted values are statistical outliers within this workspace (not a fixed cutoff) -- worth a look, not necessarily a problem.</p>
  <table>
    <thead><tr><th>Component</th><th>Fan-in</th><th>Fan-out</th><th>Location</th></tr></thead>
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
    )}\n${renderPropDrilling(state.propDrilling)}\n${renderDependencyMetrics(
      workspaceRoot,
      state.dependencyMetrics,
    )}`,
  );
}
