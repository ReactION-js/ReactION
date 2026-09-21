import * as assert from "node:assert";
import { WebSocket } from "ws";
import DevtoolsBridge from "../devtoolsBridge";

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

suite("DevtoolsBridge logging", () => {
  test("constructed and used without a logger does not throw", async () => {
    const bridge = new DevtoolsBridge();
    const port = await bridge.start();
    assert.ok(port > 0);

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    bridge.dispose();
  });

  test("invokes the provided logger on backend connect and disconnect", async () => {
    const lines: string[] = [];
    const bridge = new DevtoolsBridge((message) => lines.push(message));
    const port = await bridge.start();
    assert.ok(
      lines.some((line) => line.includes("Relay listening")),
      "start() should log that the relay is listening",
    );

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    await waitUntil(() => lines.some((line) => line.includes("Backend connected")));

    client.close();
    await waitUntil(() => lines.some((line) => line.includes("Backend disconnected")));

    bridge.dispose();
  });
});

suite("DevtoolsBridge relay-server error handling", () => {
  test("a bind/startup error on the relay rejects start() instead of hanging or crashing", async () => {
    // `ws`'s WebSocketServer creates a plain http.Server and calls
    // http.Server.prototype.listen(port, host, backlog, callback) internally --
    // patch that one call to simulate a real bind failure (e.g. EADDRINUSE)
    // asynchronously (matching real listen()'s async nature: ws only wires its
    // own "listening"/"error" relay onto the http.Server AFTER calling listen(),
    // so a synchronous emit here would fire before anything is listening).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require("node:http") as typeof import("node:http");
    const originalListen = http.Server.prototype.listen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (http.Server.prototype as any).listen = function patchedListen(
      this: import("node:http").Server,
    ) {
      setImmediate(() => this.emit("error", new Error("EADDRINUSE (simulated for this test)")));
      return this;
    };

    const lines: string[] = [];
    const bridge = new DevtoolsBridge((message) => lines.push(message));
    try {
      await assert.rejects(() => bridge.start(), /EADDRINUSE \(simulated for this test\)/);
    } finally {
      http.Server.prototype.listen = originalListen;
      bridge.dispose();
    }
  });

  test("a relay-server error after startup is logged, not thrown", async () => {
    const lines: string[] = [];
    const bridge = new DevtoolsBridge((message) => lines.push(message));
    await bridge.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = (bridge as any).server as import("ws").WebSocketServer;
    server.emit("error", new Error("simulated post-startup relay error"));

    await waitUntil(() =>
      lines.some(
        (line) => line.includes("Relay server error") && line.includes("simulated post-startup"),
      ),
    );

    bridge.dispose();
  });
});
