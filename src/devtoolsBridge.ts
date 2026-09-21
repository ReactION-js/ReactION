import { WebSocketServer, WebSocket, type RawData } from "ws";
import { type LogFn, noopLog } from "./logging";

// A single React DevTools "wall" message: the protocol spoken by the injected
// react-devtools-core backend and the react-devtools-inline Store.
export interface WallMessage {
  event: string;
  payload?: unknown;
}

// Host-side relay between the injected react-devtools-core backend (which
// connects over a WebSocket) and the webview (which talks over postMessage).
// Deliberately free of any `vscode` import so it can also run in the Phase 1
// verification harness under plain Node.
//
// Invariant: callers construct exactly one instance and call start() exactly
// once per instance (both ViewPanel/EmbeddedViewPanel and the spike harnesses
// do this: a fresh DevtoolsBridge per panel/run). onBackendConnected/
// onBackendDisconnected have no matching unsubscribe, so a hypothetical
// future "restart this connection without recreating the panel" flow that
// called start() again or re-wired handlers on the same instance would
// silently accumulate duplicate handlers -- construct a new DevtoolsBridge
// instead.
export default class DevtoolsBridge {
  private server: WebSocketServer | undefined;
  private socket: WebSocket | undefined;
  private port = 0;
  private readonly log: LogFn;

  private pageMessageHandler: ((message: WallMessage) => void) | undefined;
  // Arrays, not single slots: both bridgeWiring.ts (forwards to the webview)
  // and connectionResilience.ts (drives reconnect-after-restart) subscribe to
  // the same bridge independently, and one registering must not clobber the
  // other's handler.
  private readonly connectHandlers: Array<() => void> = [];
  private readonly disconnectHandlers: Array<() => void> = [];

  // `log` is optional and defaults to a no-op so every existing call site
  // (spike/*.js, ViewPanel/EmbeddedViewPanel before this change) keeps working
  // unmodified.
  public constructor(log?: LogFn) {
    this.log = log ?? noopLog;
  }

  // Starts the relay on an ephemeral loopback port and returns it. The port is
  // handed to the injected backend so it knows where to connect.
  public async start(): Promise<number> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    this.server = server;

    // A single persistent listener, not `.once("error", reject)` scoped only to
    // startup: `ws` re-emits its underlying http.Server's errors onto this same
    // object for its whole lifetime (bind failures AND later runtime errors,
    // e.g. accept-time EMFILE), and an EventEmitter with zero "error" listeners
    // throws on emit (crashing a plain-Node host, or leaving this promise
    // hanging forever in the VS Code-hosted case, since there'd be no
    // resolve/reject path at all). While startup is in flight, `onStartupError`
    // routes the error to `reject`; afterward it's cleared and errors are logged.
    let onStartupError: ((error: Error) => void) | undefined;
    server.on("error", (error: Error) => {
      if (onStartupError) {
        onStartupError(error);
      } else {
        this.log(`Relay server error: ${error.stack ?? error.message}`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      onStartupError = reject;
      server.once("listening", resolve);
    });
    onStartupError = undefined;

    const address = server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    this.log(`Relay listening on 127.0.0.1:${this.port}`);

    server.on("connection", (socket) => {
      // Each page load (initial or after a reload) yields a fresh backend that
      // supersedes any previous one.
      this.socket = socket;
      this.log("Backend connected");
      this.connectHandlers.forEach((handler) => handler());

      socket.on("message", (data: RawData) => {
        let parsed: WallMessage;
        try {
          parsed = JSON.parse(data.toString()) as WallMessage;
        } catch {
          return;
        }
        this.pageMessageHandler?.(parsed);
      });
      socket.on("close", () => {
        if (this.socket === socket) {
          this.socket = undefined;
          this.log("Backend disconnected");
          this.disconnectHandlers.forEach((handler) => handler());
        }
      });
      // A socket error is always followed by a close; nothing to do here.
      socket.on("error", () => undefined);
    });

    return this.port;
  }

  public get relayPort(): number {
    return this.port;
  }

  public onPageMessage(handler: (message: WallMessage) => void): void {
    this.pageMessageHandler = handler;
  }

  public onBackendConnected(handler: () => void): void {
    this.connectHandlers.push(handler);
  }

  public onBackendDisconnected(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  // Forwards a webview -> page wall message to the backend socket.
  public sendToPage(message: WallMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  public dispose(): void {
    this.socket?.close();
    this.socket = undefined;
    this.server?.close();
    this.server = undefined;
  }
}
