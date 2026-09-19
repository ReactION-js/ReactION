// Injected into the webview HTML by the extension host.
interface Window {
  __REACTION_THEME__?: string;
}

// Provided by VS Code inside the webview.
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
