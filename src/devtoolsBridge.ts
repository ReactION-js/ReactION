import { WebSocketServer, WebSocket, type RawData } from "ws";

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
export default class DevtoolsBridge {
  private server: WebSocketServer | undefined;
  private socket: WebSocket | undefined;
  private port = 0;

  private pageMessageHandler: ((message: WallMessage) => void) | undefined;
  private connectHandler: (() => void) | undefined;
  private disconnectHandler: (() => void) | undefined;

  // Starts the relay on an ephemeral loopback port and returns it. The port is
  // handed to the injected backend so it knows where to connect.
  public async start(): Promise<number> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    this.server = server;
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address();
    this.port = typeof address === "object" && address ? address.port : 0;

    server.on("connection", (socket) => {
      // Each page load (initial or after a reload) yields a fresh backend that
      // supersedes any previous one.
      this.socket = socket;
      this.connectHandler?.();

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
          this.disconnectHandler?.();
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
    this.connectHandler = handler;
  }

  public onBackendDisconnected(handler: () => void): void {
    this.disconnectHandler = handler;
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
