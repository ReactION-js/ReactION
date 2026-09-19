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
    // Walks up to the nearest ancestor with parentID===0 and returns its id
    // (the root's own element id, i.e. a key into `roots` / profiler
    // per-root commit data). Confirmed in the real Store class
    // (react-devtools-inline/dist/frontend.js) alongside the structurally
    // identical getRendererIDForElement above; not in the original 3a/3b
    // ambient surface because nothing needed it before the profiler.
    getRootIDForElement(id: number): number | null;
    addListener(event: string, handler: () => void): void;
    removeListener(event: string, handler: () => void): void;
    // --- profiler surface (Task 3c) -----------------------------------------
    //
    // Real getter/setter and a real property on the Store object createStore()
    // returns (react-devtools-inline/dist/frontend.js) -- NOT part of the
    // react-devtools-inline/frontend module's own exports (createBridge/
    // createStore/initialize are all it exports), which is why the earlier
    // 3a/3b ambient surface above didn't need to declare them.
    //
    // ProfilerStore.startProfiling() reads this at call time to build the
    // 'startProfiling' bridge payload it sends -- it is not a parameter you
    // pass to startProfiling() itself, so this MUST be set first.
    recordChangeDescriptions: boolean;
    readonly profilerStore: ProfilerStore;
  }

  // One commit's change-tracking for a single fiber/element. Confirmed
  // against react-devtools-inline/dist/backend.js's getChangeDescription/
  // getContextChanged/getChangedKeys/getChangedHooksIndices.
  export interface ChangeDescription {
    isFirstMount: boolean;
    // The installed backend's getContextChanged() only ever returns a plain
    // boolean (true = a legacy class-component context value changed), but
    // the frontend's own "why did this render" UI (WhatChanged.js) also
    // handles a `string[]` shape (a changed-key list, evidently produced by
    // some other renderer/protocol version), so both are typed here
    // defensively -- render logic should handle both.
    context: boolean | string[] | null;
    didHooksChange: boolean;
    props: string[] | null;
    // Class components only; always null for function/ForwardRef/Memo fibers
    // (their per-hook changes are reported via `hooks` instead).
    state: string[] | null;
    // Indices (in hook-call order, flattened through custom hooks) of
    // stateful hooks whose value changed. Absent entirely (not just null) on
    // a ChangeDescription for a class component -- only function-like fibers
    // (Function/ForwardRef/Memo/SimpleMemo) produce this field at all.
    hooks?: number[] | null;
  }

  // One commit's profiling data for a single root, already hydrated by
  // ProfilerStore into Maps (the wire format is [id, value][] pairs -- see
  // ProfilerStore's own prepareProfilingDataFrontendFromBackendAndStore).
  // Only the fields Task 3c reads are typed; effectDuration/
  // passiveEffectDuration/priorityLevel/updaters also exist on the real
  // object.
  export interface CommitDataFrontend {
    duration: number;
    timestamp: number;
    changeDescriptions: Map<number, ChangeDescription> | null;
    fiberActualDurations: Map<number, number>;
    fiberSelfDurations: Map<number, number>;
  }

  export interface ProfilingDataForRootFrontend {
    rootID: number;
    commitData: CommitDataFrontend[];
  }

  // The live pub/sub surface over a profiling session (store.profilerStore).
  // Confirmed against the real `class ProfilerStore extends EventEmitter` in
  // react-devtools-inline/dist/frontend.js. Two corrections to this task's
  // own protocol notes, found only by reading that real source:
  //
  //   - There is no readable `isProfiling` boolean on ProfilerStore. The
  //     closest equivalent is `isProfilingBasedOnUserInput`, which the store
  //     updates OPTIMISTICALLY the instant startProfiling()/stopProfiling()
  //     is called (before the backend confirms anything), and which the
  //     'isProfiling' event corresponds to -- good for driving a toggle
  //     button's label immediately.
  //   - Commit data does NOT become available via a 'profilingData' event
  //     for a normal start/stop capture. That event is only emitted by the
  //     `profilingData` setter and by `clear()` (the profile import/export
  //     path this task doesn't use). The real signal for "the backend has
  //     finished sending this run's commits" is 'isProcessingData': it fires
  //     once when stopProfiling() causes the frontend to start
  //     re-requesting data from each renderer (isProcessingData true), and
  //     again once every renderer has reported back and the frontend-shaped
  //     data has been rebuilt (isProcessingData false) -- that SECOND firing
  //     is the one to act on, by checking the getter's value in the handler
  //     rather than trusting the event name alone.
  export interface ProfilerStore {
    readonly isProfilingBasedOnUserInput: boolean;
    readonly isProcessingData: boolean;
    readonly didRecordCommits: boolean;
    startProfiling(): void;
    stopProfiling(): void;
    getCommitData(rootID: number, commitIndex: number): CommitDataFrontend;
    // Throws (does not return null/undefined) if no commit data was ever
    // recorded for this root -- e.g. a root that produced zero commits
    // during the profiling session. Callers must try/catch per root.
    getDataForRoot(rootID: number): ProfilingDataForRootFrontend;
    addListener(
      event: "isProfiling" | "isProcessingData" | "profilingData",
      handler: () => void,
    ): void;
    removeListener(
      event: "isProfiling" | "isProcessingData" | "profilingData",
      handler: () => void,
    ): void;
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

  // [functionName, fileName, lineNumber, columnNumber] -- NOT an object (the
  // plan's `_debugSource` doesn't exist in this protocol version). Confirmed
  // against react-devtools-core/dist/backend.js's extractLocationFromComponentStack
  // / extractLocationFromOwnerStack, which build this exact tuple from a
  // parsed V8 stack trace. lineNumber/columnNumber are 1-based (V8's
  // CallSite.getLineNumber()/getColumnNumber() convention; confirmed
  // empirically in spike/run-phase3b-source.js by cross-checking against the
  // real sample-app.jsx source via its esbuild sourcemap).
  export type InspectedElementSource =
    | [functionName: string, fileName: string, lineNumber: number, columnNumber: number]
    | null;

  // Only the fields Task 3a/3b render or expect to hand to a later phase;
  // renderer metadata is intentionally left out.
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
    source: InspectedElementSource;
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
