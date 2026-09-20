import * as assert from "node:assert";
import type * as vscode from "vscode";
import { wireEmptyStateDiagnostics } from "../diagnosticsWiring";

suite("wireEmptyStateDiagnostics", () => {
  test("logs the noReactDetected message with elapsed time and url", () => {
    let handler: ((message: unknown) => void) | undefined;
    const fakeWebview = {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        handler = listener;
        return { dispose() {} };
      },
    } as unknown as vscode.Webview;

    const lines: string[] = [];
    const disposable = wireEmptyStateDiagnostics(
      fakeWebview,
      (line) => lines.push(line),
      "http://localhost:3000",
    );
    try {
      assert.ok(handler, "wireEmptyStateDiagnostics should register a message handler");

      handler?.({ type: "noReactDetected", elapsedMs: 7000 });
      assert.strictEqual(lines.length, 1);
      assert.match(lines[0], /No React detected after 7000ms/);
      assert.match(lines[0], /http:\/\/localhost:3000/);

      handler?.({ type: "wall", message: { event: "x" } });
      assert.strictEqual(
        lines.length,
        1,
        "non-matching message types must be ignored",
      );
    } finally {
      disposable.dispose();
    }
  });
});
