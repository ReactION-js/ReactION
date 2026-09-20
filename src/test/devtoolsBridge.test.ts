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
