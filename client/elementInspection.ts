import type {
  DehydratedData,
  DevtoolsStore,
  FrontendBridge,
  InspectedElement,
  InspectedElementResponse,
  InspectElementRequest,
} from "react-devtools-inline/frontend";

export type InspectableCategory = "props" | "state" | "context" | "hooks";

export interface InspectorState {
  elementId: number | null;
  element: InspectedElement | null;
  loading: boolean;
  error: string | null;
}

export const INITIAL_INSPECTOR_STATE: InspectorState = {
  elementId: null,
  element: null,
  loading: false,
  error: null,
};

const POLL_INTERVAL_MS = 1000;

// Drives the real inspectElement/inspectedElement protocol for a single
// selected element: sends the initial full inspect, polls at ~1s while
// selected (forceFullData: false, so an unchanged element gets the cheap
// "no-change" response), and supports expanding one dehydrated path on
// demand. Deliberately protocol-only -- rendering lives in InspectorPanel.
//
// Every response is matched against the requestID of the specific request
// it answers (latestTopLevelRequestID/latestExpandRequestIDs below), not
// just the element id. This matters because select()/requestExpand() have
// no dedup against re-issuing a request for what's already selected/
// expanded -- both App.tsx's node-click and "Select in ReactION" CodeLens
// handlers call select(id) unconditionally -- so a superseded request's
// response can still arrive after a newer request has been sent for the
// same element/path. On this codebase's real transport (one ordered relay
// connection, synchronous backend dispatch) that superseded response
// always arrives BEFORE the newer request's own response, never after, so
// it can't clobber fresher full-data via last-write-wins either way -- but
// a superseded "not-found" is NOT harmless even in that order: applying it
// wrongly deselects an element the user already re-selected, and the
// genuinely-current response then gets discarded too (its `id` no longer
// matches the now-null selection). Matching by requestID is what catches
// that concrete case; it also happens to make the correlation correct
// under a hypothetical future transport that could reorder responses,
// which is why spike/elementInspection.test.js exercises that more
// general case directly.
export class ElementInspector {
  private state: InspectorState = INITIAL_INSPECTOR_STATE;
  private rendererID: number | null = null;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private nextRequestID = 0;
  // requestID of the most recently sent "top-level" (path: null) request for
  // the CURRENTLY selected element -- the initial select() full-data fetch,
  // or a poll tick's lightweight refresh. handleResponse only applies a
  // full-data/no-change/not-found/error response whose responseID matches
  // this, discarding one that doesn't even though its `id` still matches.
  //
  // Concrete, currently-live bug this closes: select() has no dedup against
  // reselecting the same id (neither the "Select in ReactION" CodeLens nor
  // a plain node click in App.tsx check for it), so firing it twice in
  // quick succession for the same element sends two full requests -- and
  // the first (now superseded) one's response still arrives; under this
  // codebase's real transport (one ordered relay connection, synchronous
  // backend dispatch) it arrives BEFORE the second request's response,
  // never after. A superseded full-data response is harmless in that
  // order (the second request's full-data lands right after and overwrites
  // it via plain last-write-wins, fix or no fix) -- but a superseded
  // "not-found" is not: applying it calls deselect() and wipes the
  // selection back to null even though the user already re-selected the
  // same element, after which the genuinely-current second response also
  // gets discarded (its `id` no longer matches the now-null selection).
  // That wrongful-deselect-on-an-ordinary-double-click is what this guards
  // against; the general "any arrival order" case is defense-in-depth for
  // a transport this codebase doesn't have today (see
  // spike/elementInspection.test.js). Reset to null on every
  // select()/deselect(), since a new selection starts with no "latest"
  // request yet.
  private latestTopLevelRequestID: number | null = null;
  // Same idea as latestTopLevelRequestID, but per expanded path (keyed by
  // encodePath() on the same [category, ...path] array sendInspect is given)
  // instead of one shared pointer. Expanding two different paths, or a poll
  // refreshing top-level data while a path is mid-expand, are independent,
  // legitimately concurrent operations that must NOT invalidate each other:
  // mergeHydratedPath only ever touches the path it was given, so a poll and
  // an expand (or two different expands) can never step on each other's
  // data. A single shared "latest expand" pointer would break that -- it
  // would discard a still-outstanding, still-wanted expand of path A the
  // moment path B was also expanded. Only re-expanding the SAME path before
  // its previous response lands needs a staleness guard, which is what the
  // per-path keying gives us. Cleared wholesale on select()/deselect() (a
  // new selection has no history worth keeping); an individual path's entry
  // is simply overwritten, never removed, on re-expansion, which is fine
  // since only the current value per key is ever consulted.
  private readonly latestExpandRequestIDs = new Map<string, number>();
  // One-shot inspectOnce() requests in flight, keyed by their own requestID
  // (shared counter with the select/poll flow below, so ids never collide).
  // Checked first in onInspectedElement so a background probe never leaks
  // into -- or gets confused with -- the single-selection state machine.
  private readonly pendingOnce = new Map<
    number,
    { resolve: (response: InspectedElementResponse) => void; reject: (reason: Error) => void }
  >();
  private readonly onInspectedElement = (payload: unknown): void => {
    const response = payload as InspectedElementResponse;
    const pending = this.pendingOnce.get(response.responseID);
    if (pending) {
      this.pendingOnce.delete(response.responseID);
      pending.resolve(response);
      return;
    }
    this.handleResponse(response);
  };

  public constructor(
    private readonly bridge: FrontendBridge,
    private readonly store: DevtoolsStore,
    private readonly onChange: (state: InspectorState) => void,
  ) {
    this.bridge.addListener("inspectedElement", this.onInspectedElement);
  }

  public select(id: number): void {
    this.stopPolling();
    this.rendererID = this.store.getRendererIDForElement(id);
    this.latestTopLevelRequestID = null;
    this.latestExpandRequestIDs.clear();
    if (this.rendererID === null) {
      this.setState({
        elementId: id,
        element: null,
        loading: false,
        error: "Element not found.",
      });
      return;
    }

    const rendererID = this.rendererID;
    this.setState({ elementId: id, element: null, loading: true, error: null });
    this.latestTopLevelRequestID = this.sendInspect(id, rendererID, null, true);
    this.pollHandle = setInterval(() => {
      this.latestTopLevelRequestID = this.sendInspect(id, rendererID, null, false);
    }, POLL_INTERVAL_MS);
  }

  public deselect(): void {
    this.stopPolling();
    this.rendererID = null;
    this.latestTopLevelRequestID = null;
    this.latestExpandRequestIDs.clear();
    this.setState(INITIAL_INSPECTOR_STATE);
  }

  // path is relative to the category root, e.g. ['user', 'address'] to expand
  // props.user.address.
  public requestExpand(
    category: InspectableCategory,
    path: Array<string | number>,
  ): void {
    if (this.state.elementId === null || this.rendererID === null) {
      return;
    }
    const fullPath = [category, ...path];
    const requestID = this.sendInspect(this.state.elementId, this.rendererID, fullPath, false);
    this.latestExpandRequestIDs.set(encodePath(fullPath), requestID);
  }

  // Fire-and-await inspectElement request that bypasses the select/poll
  // state machine entirely: it doesn't touch `state`/`rendererID`/the poll
  // timer, so it can run concurrently with (and without disturbing) whatever
  // the user has selected in the panel -- or nothing at all. Intended for
  // callers (useContextMap.ts) that need to probe many candidate elements'
  // hooks in the background. Always uses forceFullData: true since there's
  // no prior cached value to diff against for a one-shot probe.
  public inspectOnce(id: number): Promise<InspectedElementResponse> {
    const rendererID = this.store.getRendererIDForElement(id);
    if (rendererID === null) {
      return Promise.resolve({ id, responseID: -1, type: "not-found" });
    }
    return new Promise((resolve, reject) => {
      const requestID = this.sendInspect(id, rendererID, null, true);
      this.pendingOnce.set(requestID, { resolve, reject });
    });
  }

  public dispose(): void {
    this.stopPolling();
    this.bridge.removeListener("inspectedElement", this.onInspectedElement);
    // Unblock any inspectOnce() callers still awaiting a response (e.g. a
    // useContextMap build in flight when the backend disconnects) instead of
    // leaving their promises pending forever.
    for (const { reject } of this.pendingOnce.values()) {
      reject(new Error("ElementInspector disposed before inspectOnce resolved."));
    }
    this.pendingOnce.clear();
  }

  // Every select()/requestExpand() caller assigns this return value into
  // latestTopLevelRequestID/latestExpandRequestIDs AFTER this call returns,
  // which assumes bridge.send() below never synchronously re-enters
  // handleResponse (via onInspectedElement) before that assignment runs --
  // true of every bridge this codebase constructs today, but worth noting
  // since a synchronously-delivering bridge would see the assignment happen
  // too late and wrongly discard the very response it was meant to accept.
  private sendInspect(
    id: number,
    rendererID: number,
    path: Array<string | number> | null,
    forceFullData: boolean,
  ): number {
    const requestID = this.nextRequestID++;
    const payload: InspectElementRequest = {
      id,
      rendererID,
      path,
      forceFullData,
      requestID,
    };
    this.bridge.send("inspectElement", payload);
    return requestID;
  }

  private stopPolling(): void {
    if (this.pollHandle !== undefined) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }

  private setState(next: InspectorState): void {
    this.state = next;
    this.onChange(next);
  }

  // True if `responseID` is still the newest outstanding request for
  // whichever slot it belongs to -- the single top-level slot, or its own
  // path's entry in latestExpandRequestIDs. requestIDs are never reused or
  // shared across calls (nextRequestID is one counter for every sendInspect
  // call this class makes, select/poll/expand/inspectOnce alike), and a
  // response's `type` is entirely determined by what its own request asked
  // for (a path: null request can only ever come back full-data/no-change/
  // not-found/error; a pathed one only hydrated-path/not-found/error), so a
  // plain membership check across both slots -- without first classifying
  // the response by type -- can't accidentally match the wrong slot.
  private isLatestRequest(responseID: number): boolean {
    if (responseID === this.latestTopLevelRequestID) {
      return true;
    }
    for (const latest of this.latestExpandRequestIDs.values()) {
      if (responseID === latest) {
        return true;
      }
    }
    return false;
  }

  private handleResponse(response: InspectedElementResponse): void {
    if (response.id !== this.state.elementId) {
      return; // Stale response for a since-changed selection.
    }
    if (!this.isLatestRequest(response.responseID)) {
      return; // Superseded by a newer request for the same element/path.
    }
    switch (response.type) {
      case "full-data":
        this.setState({
          elementId: response.id,
          element: response.value,
          loading: false,
          error: null,
        });
        break;
      case "no-change":
        break;
      case "hydrated-path": {
        if (!this.state.element) {
          break;
        }
        this.setState({
          ...this.state,
          element: mergeHydratedPath(this.state.element, response.path, response.value),
        });
        break;
      }
      case "not-found":
        this.deselect();
        break;
      case "error":
        this.setState({ ...this.state, loading: false, error: response.message });
        break;
      default:
        break;
    }
  }
}

// Splices a hydrated-path response into the cached element. `fullPath` is the
// same [category, ...relativePath] array that was sent in the request; the
// fetched cleaned/unserializable paths come back relative to `fullPath` (per
// the backend's own dehydrate() call for this request), so they're re-based
// onto the category root the same way react-devtools-inline's own (internal,
// unexported) hydrateHelper does.
function mergeHydratedPath(
  element: InspectedElement,
  fullPath: Array<string | number>,
  fetched: DehydratedData,
): InspectedElement {
  const category = fullPath[0] as InspectableCategory;
  const relativePath = fullPath.slice(1);
  const current = element[category];
  if (!current) {
    return element;
  }

  const carryOver = (paths: Array<Array<string | number>>) =>
    paths.filter((path) => !pathsEqual(path, relativePath));
  const adopted = (paths: Array<Array<string | number>>) =>
    paths.map((path) => relativePath.concat(path.slice(fullPath.length)));

  return {
    ...element,
    [category]: {
      data: setAtPath(current.data, relativePath, fetched.data),
      cleaned: [...carryOver(current.cleaned), ...adopted(fetched.cleaned)],
      unserializable: [
        ...carryOver(current.unserializable),
        ...adopted(fetched.unserializable),
      ],
    },
  };
}

function pathsEqual(a: Array<string | number>, b: Array<string | number>): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function setAtPath(
  root: unknown,
  path: Array<string | number>,
  value: unknown,
): unknown {
  if (path.length === 0) {
    return value;
  }
  const [key, ...rest] = path;
  if (Array.isArray(root)) {
    const clone = root.slice();
    clone[key as number] = setAtPath(clone[key as number], rest, value);
    return clone;
  }
  const base = root && typeof root === "object" ? (root as Record<string | number, unknown>) : {};
  const clone: Record<string | number, unknown> = { ...base };
  clone[key] = setAtPath(clone[key], rest, value);
  return clone;
}

// --- Dehydration-awareness helpers for rendering ----------------------------
//
// These interpret the DehydratedData envelope's cleaned/unserializable path
// lists so a renderer can tell, at a given path, whether it's looking at a
// Dehydrated placeholder, an "unserializable" wrapper (its real nested
// entries are extra own keys alongside the preview fields below), or a plain
// value to recurse into normally.

export interface DehydrationIndex {
  cleaned: Set<string>;
  unserializable: Set<string>;
}

export type PathKind = "placeholder" | "unserializable" | "plain";

// Keys on an unserializable wrapper object that are metadata, not real
// nested data, so a renderer knows which own-keys to recurse into.
export const DEHYDRATED_META_KEYS: ReadonlySet<string> = new Set([
  "inspectable",
  "name",
  "preview_short",
  "preview_long",
  "type",
  "size",
  "readonly",
  "unserializable",
]);

export function buildDehydrationIndex(data: DehydratedData): DehydrationIndex {
  return {
    cleaned: new Set(data.cleaned.map(encodePath)),
    unserializable: new Set(data.unserializable.map(encodePath)),
  };
}

export function classifyPath(
  index: DehydrationIndex,
  path: Array<string | number>,
): PathKind {
  const key = encodePath(path);
  if (index.cleaned.has(key)) {
    return "placeholder";
  }
  if (index.unserializable.has(key)) {
    return "unserializable";
  }
  return "plain";
}

function encodePath(path: Array<string | number>): string {
  return JSON.stringify(path);
}

// Some values are dehydrated purely to survive the wire (a WebSocket/
// postMessage JSON hop can't carry Infinity/NaN/undefined), not because
// they're complex. Render these as their real value, not placeholder chrome.
export function formatSentinel(type: string): string | undefined {
  switch (type) {
    case "infinity":
      return "Infinity";
    case "-infinity":
      return "-Infinity";
    case "nan":
      return "NaN";
    case "undefined":
      return "undefined";
    default:
      return undefined;
  }
}
