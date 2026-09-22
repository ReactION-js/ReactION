// Injected into the webview HTML by the extension host.
interface Window {
  __REACTION_THEME__?: string;
  // Set once, at panel creation (src/TreeViewPanel.ts) -- "static" and
  // "live" are separate webview panels/tabs now, not a single panel with a
  // runtime toggle, so this never changes for the lifetime of a given
  // webview instance.
  __REACTION_MODE__?: "static" | "live";
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
