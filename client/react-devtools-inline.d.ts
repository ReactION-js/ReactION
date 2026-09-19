// Minimal ambient types for the subset of the react-devtools-inline frontend API
// we use in the webview. The package ships no type declarations.
declare module "react-devtools-inline/frontend" {
  export interface DevtoolsElement {
    id: number;
    parentID: number;
    displayName: string | null;
    type: number;
    depth: number;
    weight: number;
    children: number[];
    key: number | string | null;
  }

  export interface DevtoolsStore {
    numElements: number;
    roots: number[];
    getElementByID(id: number): DevtoolsElement | null;
    getElementIDAtIndex(index: number): number | null;
    addListener(event: string, handler: () => void): void;
    removeListener(event: string, handler: () => void): void;
  }

  export interface FrontendBridge {
    shutdown(): void;
  }

  export interface Wall {
    listen(handler: (message: unknown) => void): () => void;
    send(event: string, payload?: unknown): void;
  }

  export function createBridge(window: unknown, wall: Wall): FrontendBridge;
  export function createStore(
    bridge: FrontendBridge,
    config?: unknown,
  ): DevtoolsStore;
  export function initialize(window: unknown, options?: unknown): unknown;
}
