// Deliberately free of any `vscode` import (matching src/openSource.ts's own
// convention) so the panel-selection logic stays plain-mocha-testable under
// Node -- see src/test/selectInstance.test.ts and src/selectInstanceWiring.ts,
// which wraps this for the extension host's real ViewPanel.

export interface SelectInstanceArgs {
  displayName: string;
}

export interface PostableWebview {
  postMessage(message: unknown): unknown;
}

export interface OpenPanel {
  webview: PostableWebview;
}

// ReactION.openTree drives ViewPanel; this posts to EVERY currently-open
// panel in the list it is given (a single ViewPanel today) rather than
// assuming a specific one, so it stays correct if more panels are added.
// Showing an informational message is left to the caller (showNoPanelMessage)
// since building that message (with its "Open ReactION" action button) needs
// `vscode.window`, which this module deliberately stays free of.
export function selectInstanceInPanels(
  panels: ReadonlyArray<OpenPanel | undefined>,
  args: SelectInstanceArgs,
  showNoPanelMessage: () => void,
): void {
  const openPanels = panels.filter((panel): panel is OpenPanel => panel !== undefined);
  if (openPanels.length === 0) {
    showNoPanelMessage();
    return;
  }
  for (const panel of openPanels) {
    panel.webview.postMessage({ type: "selectByComponent", displayName: args.displayName });
  }
}
