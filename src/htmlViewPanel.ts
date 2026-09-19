// Builds the HTML preview panel that embeds the running app in an iframe.
export function generateHtmlPreview(url: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${url}; style-src 'unsafe-inline';" />
  <title>HTML Preview</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background-color: #fff; }
    iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <iframe src="${url}" title="ReactION preview"></iframe>
</body>
</html>`;
}
