import * as vscode from "vscode";

// Random nonce so the webview CSP can allow exactly our own scripts.
function makeNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// Builds the static HTML shell for the tree webview. The bundle renders a React
// app that listens for `treeData` messages posted by the extension host, so the
// panel is created once and updated without reloading.
export function generateTreeViewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  theme: string,
  mode: "static" | "live",
): string {
  const bundleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "out", "build", "bundle.js"),
  );
  const nonce = makeNonce();
  const title = mode === "static" ? "ReactION Static" : "ReactION Live";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};" />
  <title>${title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__REACTION_THEME__ = ${JSON.stringify(theme)};
    window.__REACTION_MODE__ = ${JSON.stringify(mode)};
  </script>
  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
}
