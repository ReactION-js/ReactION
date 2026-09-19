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
export class ElementInspector {
  private state: InspectorState = INITIAL_INSPECTOR_STATE;
  private rendererID: number | null = null;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private nextRequestID = 0;
  private readonly onInspectedElement = (payload: unknown): void => {
    this.handleResponse(payload as InspectedElementResponse);
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
    this.sendInspect(id, rendererID, null, true);
    this.pollHandle = setInterval(() => {
      this.sendInspect(id, rendererID, null, false);
    }, POLL_INTERVAL_MS);
  }

  public deselect(): void {
    this.stopPolling();
    this.rendererID = null;
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
    this.sendInspect(
      this.state.elementId,
      this.rendererID,
      [category, ...path],
      false,
    );
  }

  public dispose(): void {
    this.stopPolling();
    this.bridge.removeListener("inspectedElement", this.onInspectedElement);
  }

  private sendInspect(
    id: number,
    rendererID: number,
    path: Array<string | number> | null,
    forceFullData: boolean,
  ): void {
    const payload: InspectElementRequest = {
      id,
      rendererID,
      path,
      forceFullData,
      requestID: this.nextRequestID++,
    };
    this.bridge.send("inspectElement", payload);
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

  private handleResponse(response: InspectedElementResponse): void {
    if (response.id !== this.state.elementId) {
      return; // Stale response for a since-changed selection.
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
