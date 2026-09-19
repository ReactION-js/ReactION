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
    // Required before sending `inspectElement`, which needs the element's
    // renderer id alongside its own id.
    getRendererIDForElement(id: number): number | null;
    addListener(event: string, handler: () => void): void;
    removeListener(event: string, handler: () => void): void;
  }

  // The generic pub/sub surface the backend also uses (confirmed in
  // react-devtools-core/dist/backend.js: `bridge.addListener('inspectElement', ...)`,
  // `_bridge.send('inspectedElement', ...)`), not just `shutdown()`.
  export interface FrontendBridge {
    shutdown(): void;
    send(event: string, payload?: unknown): void;
    addListener(event: string, listener: (payload: unknown) => void): void;
    removeListener(event: string, listener: (payload: unknown) => void): void;
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

  // --- inspectElement / inspectedElement protocol ---------------------------
  //
  // Sent by the frontend: bridge.send('inspectElement', payload). `requestID`
  // is a counter the caller owns, echoed back as `responseID` to match
  // requests to responses.
  export interface InspectElementRequest {
    id: number;
    rendererID: number;
    path: Array<string | number> | null;
    forceFullData: boolean;
    requestID: number;
  }

  // A value nested deeper than 2 levels -- or a function/Symbol/BigInt/DOM
  // node/class instance at ANY depth -- is replaced with this placeholder
  // wherever it appears inside a DehydratedData tree.
  export interface Dehydrated {
    inspectable: boolean;
    name: string | null;
    preview_short: string | null;
    preview_long: string | null;
    type: string;
    size?: number;
    readonly?: boolean;
  }

  // props/state/context/hooks each arrive wrapped like this rather than as a
  // bare tree. `data` is the real structure with Dehydrated placeholders (or,
  // for Maps/Sets/class instances/etc., an "unserializable" wrapper object
  // carrying its own nested entries as extra own keys) spliced in at the
  // paths listed in `cleaned` / `unserializable`. Those paths are relative to
  // `data` itself (i.e. NOT prefixed with "props"/"state"/...).
  export interface DehydratedData {
    data: unknown;
    cleaned: Array<Array<string | number>>;
    unserializable: Array<Array<string | number>>;
  }

  export interface HookSourceLocation {
    fileName: string;
    lineNumber: number;
    columnNumber: number;
    functionName: string;
  }

  // `id` is null for a hook that isn't independently stateful (e.g. a bare
  // useContext). A custom hook's own primitive hooks appear in `subHooks`.
  export interface HooksNode {
    id: number | null;
    isStateEditable: boolean;
    name: string;
    value: unknown;
    subHooks: HooksNode[];
    hookSource: HookSourceLocation | null;
  }

  export interface InspectedElementOwner {
    id: number;
    displayName: string | null;
    type: number;
    key: number | string | null;
  }

  // Only the fields Task 3a renders or expects to hand to a later phase;
  // renderer metadata and `source` (Task 3b) are intentionally left out.
  export interface InspectedElement {
    id: number;
    key: number | string | null;
    props: DehydratedData | null;
    state: DehydratedData | null;
    // Legacy class-component context (contextTypes/contextType) -- NOT the
    // same thing as a useContext() hook, which shows up in `hooks` instead.
    context: DehydratedData | null;
    hooks: DehydratedData | null;
    owners: InspectedElementOwner[] | null;
  }

  export type InspectedElementResponse =
    | { id: number; responseID: number; type: "full-data"; value: InspectedElement }
    | { id: number; responseID: number; type: "no-change" }
    | {
        id: number;
        responseID: number;
        type: "hydrated-path";
        path: Array<string | number>;
        value: DehydratedData;
      }
    | { id: number; responseID: number; type: "not-found" }
    | {
        type: "error";
        errorType: "user" | "unknown-hook" | "uncaught";
        id: number;
        responseID: number;
        message: string;
        stack?: string;
      };
}
