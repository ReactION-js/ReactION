import {
  createBridge,
  createStore,
  type DevtoolsStore,
  type FrontendBridge,
  type Wall,
} from "react-devtools-inline/frontend";
import type { ComponentNode } from "./types";

type WallListener = (message: unknown) => void;

// react-devtools-shared ElementType values we surface as readable labels.
const TYPE_LABEL: Record<number, string> = {
  1: "Class",
  2: "Context",
  5: "Function",
  6: "ForwardRef",
  7: "Host",
  8: "Memo",
  9: "Other",
  10: "Profiler",
  11: "Root",
  12: "Suspense",
  13: "SuspenseList",
  14: "TracingMarker",
};

// Builds a react-devtools-inline Store over a postMessage "wall" to the host and
// projects the Store's element tree into the ComponentNode shape the view wants.
// A fresh Store is created on every backend connection so a page reload starts
// clean instead of replaying operations onto a stale tree.
export class StoreConnection {
  private listeners: WallListener[] = [];
  private bridge: FrontendBridge | undefined;
  private store: DevtoolsStore | undefined;
  private readonly onMutated = () => this.emitTree();

  public constructor(
    private readonly vscodeApi: VsCodeApi,
    private readonly onTree: (tree: ComponentNode | undefined) => void,
  ) {}

  // Routes a message posted by the extension host.
  public handleHostMessage(data: unknown): void {
    if (!data || typeof data !== "object") {
      return;
    }
    const message = data as { type?: string; message?: unknown };
    switch (message.type) {
      case "backend-connected":
        this.createStoreForNewBackend();
        break;
      case "backend-disconnected":
        this.teardownStore();
        this.onTree(undefined);
        break;
      case "wall":
        this.listeners.forEach((fn) => fn(message.message));
        break;
      default:
        break;
    }
  }

  public dispose(): void {
    this.teardownStore();
  }

  private createStoreForNewBackend(): void {
    this.teardownStore();

    const wall: Wall = {
      listen: (fn) => {
        this.listeners.push(fn);
        return () => {
          const index = this.listeners.indexOf(fn);
          if (index >= 0) {
            this.listeners.splice(index, 1);
          }
        };
      },
      send: (event, payload) => {
        this.vscodeApi.postMessage({ type: "wall", message: { event, payload } });
      },
    };

    this.bridge = createBridge(window, wall);
    this.store = createStore(this.bridge);
    this.store.addListener("mutated", this.onMutated);
    this.emitTree();
  }

  private teardownStore(): void {
    // Intentionally do NOT call bridge.shutdown() here: on a reconnect the relay
    // socket already points at the NEW backend, and shutdown() posts a 'shutdown'
    // wall message that would kill it. Dropping references is enough — replacing
    // the wall listener list orphans the old bridge so it receives nothing more.
    this.store?.removeListener("mutated", this.onMutated);
    this.listeners = [];
    this.bridge = undefined;
    this.store = undefined;
  }

  private emitTree(): void {
    this.onTree(this.store ? this.buildTree(this.store) : undefined);
  }

  private buildTree(store: DevtoolsStore): ComponentNode | undefined {
    const children = store.roots
      .map((id) => this.buildNode(store, id))
      .filter((node): node is ComponentNode => node != null);

    if (children.length === 0) {
      return undefined;
    }
    if (children.length === 1) {
      return children[0];
    }
    return { name: "Roots", id: "roots", attributes: [], children };
  }

  private buildNode(store: DevtoolsStore, id: number): ComponentNode | undefined {
    const element = store.getElementByID(id);
    if (!element) {
      return undefined;
    }
    const label =
      element.displayName || TYPE_LABEL[element.type] || "Unknown";
    const children = element.children
      .map((childId) => this.buildNode(store, childId))
      .filter((node): node is ComponentNode => node != null);

    return {
      name: label,
      id: String(element.id),
      attributes: [TYPE_LABEL[element.type] ?? `type${element.type}`],
      children,
    };
  }
}
