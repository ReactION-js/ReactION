import * as vscode from "vscode";
import type DevtoolsBridge from "./devtoolsBridge";
import type { WallMessage } from "./devtoolsBridge";

// Message envelope sent from the webview back to the host.
interface WebviewMessage {
  type?: string;
  message?: WallMessage;
}

// Connects a DevtoolsBridge to a webview: page -> webview wall messages plus
// connect/disconnect notifications go out via postMessage, and webview -> page
// wall messages come back via onDidReceiveMessage. Returns a disposable for the
// inbound subscription.
export function wireBridgeToWebview(
  bridge: DevtoolsBridge,
  webview: vscode.Webview,
): vscode.Disposable {
  bridge.onBackendConnected(() => {
    void webview.postMessage({ type: "backend-connected" });
  });
  bridge.onBackendDisconnected(() => {
    void webview.postMessage({ type: "backend-disconnected" });
  });
  bridge.onPageMessage((message) => {
    void webview.postMessage({ type: "wall", message });
  });

  return webview.onDidReceiveMessage((msg: WebviewMessage) => {
    if (msg?.type === "wall" && msg.message) {
      bridge.sendToPage(msg.message);
    }
  });
}
