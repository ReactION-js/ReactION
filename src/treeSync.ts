import * as vscode from "vscode";
import Puppeteer from "./puppeteer";
import TreeNode from "./TreeNode";

// Polls the page for its React tree and pushes each snapshot to the webview.
// Returns a disposable that stops the polling loop.
export function startTreeSync(
  page: Puppeteer,
  webview: vscode.Webview,
  intervalMs: number,
): vscode.Disposable {
  let stopped = false;

  const tick = async (): Promise<void> => {
    try {
      const rawData = await page.scrape();
      const tree = TreeNode.buildTree(rawData);
      if (tree && !stopped) {
        void webview.postMessage({ type: "treeData", data: tree });
      }
    } catch (error) {
      // A transient failure (e.g. the page navigating) must not kill the loop.
      console.error("ReactION: scrape failed", error);
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);

  return {
    dispose: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
