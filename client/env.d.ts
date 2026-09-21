// Injected into the webview HTML by the extension host.
interface Window {
  __REACTION_THEME__?: string;
  // Test-only override for App.tsx's empty-state timeout; unset in the real
  // extension host, so production always uses the shipped default.
  __REACTION_EMPTY_STATE_TIMEOUT_MS__?: number;
}

// Side-effect stylesheet imports (React Flow's CSS, our own component CSS).
declare module "*.css";

// Provided by VS Code inside the webview.
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
