import * as vscode from "vscode";
import type { LogFn } from "./logging";

interface NoReactDetectedMessage {
  type?: string;
  elapsedMs?: number;
}

// Listens for the webview's host-only "noReactDetected" message (see
// client/App.tsx's empty-state timeout -- posted directly via
// vscodeApi.postMessage, NOT through the wall/bridge to the page, following
// the same pattern Task 3b's "openSource" message established) and logs it.
// Issue #73's reporter explicitly wanted a diagnosable log trail rather than
// just a webview message they might not think to screenshot, so this gives
// the empty state a durable record in the Output channel too.
export function wireEmptyStateDiagnostics(
  webview: vscode.Webview,
  log: LogFn,
  url: string,
): vscode.Disposable {
  return webview.onDidReceiveMessage((msg: NoReactDetectedMessage) => {
    if (msg?.type !== "noReactDetected") {
      return;
    }
    const elapsed = typeof msg.elapsedMs === "number" ? msg.elapsedMs : "?";
    log(`No React detected after ${elapsed}ms (backend connected, 0 elements) at ${url}`);
  });
}
