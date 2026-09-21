import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { wireSourceOpening } from "../sourceOpeningWiring";

async function waitUntil<T>(
  get: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = get();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

suite("wireSourceOpening", () => {
  test("opens the resolved file with a 0-based selection from a 1-based message", async () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "reaction-source-opening-"),
    );
    const filePath = path.join(workspaceRoot, "Target.tsx");
    fs.writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5\n");

    let handler: ((message: unknown) => void) | undefined;
    const fakeWebview = {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        handler = listener;
        return { dispose() {} };
      },
    } as unknown as vscode.Webview;

    const disposable = wireSourceOpening(fakeWebview, workspaceRoot);
    try {
      assert.ok(handler, "wireSourceOpening should register a message handler");
      // Protocol lineNumber/columnNumber are 1-based (see
      // src/sourceOpeningWiring.ts); expect the 0-based vscode.Position(2, 1).
      handler?.({ type: "openSource", fileName: filePath, lineNumber: 3, columnNumber: 2 });

      const editor = await waitUntil(
        () => vscode.window.activeTextEditor,
        (candidate) => candidate?.document.uri.fsPath === filePath,
      );

      assert.ok(editor);
      assert.strictEqual(editor.document.uri.fsPath, filePath);
      assert.strictEqual(editor.selection.active.line, 2);
      assert.strictEqual(editor.selection.active.character, 1);
    } finally {
      disposable.dispose();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("does not open a file for a traversal-crafted openSource message, and falls into the not-found path", async () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "reaction-source-opening-traversal-"),
    );
    const outsideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "reaction-source-opening-outside-"),
    );
    const outsideFile = path.join(outsideDir, "Secret.txt");
    fs.writeFileSync(outsideFile, "secret\n");

    let handler: ((message: unknown) => void) | undefined;
    const fakeWebview = {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        handler = listener;
        return { dispose() {} };
      },
    } as unknown as vscode.Webview;

    const originalShowInformationMessage = vscode.window.showInformationMessage;
    let notFoundMessageShown = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).showInformationMessage = (...args: unknown[]) => {
      notFoundMessageShown = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalShowInformationMessage as any).apply(vscode.window, args);
    };

    const disposable = wireSourceOpening(fakeWebview, workspaceRoot);
    try {
      assert.ok(handler, "wireSourceOpening should register a message handler");
      // A page-controlled fileName that escapes workspaceRoot via "../" and
      // resolves to a REAL file (see the security fix in src/openSource.ts).
      const traversal = path.relative(workspaceRoot, outsideFile);
      handler?.({ type: "openSource", fileName: traversal, lineNumber: 1, columnNumber: 1 });

      await waitUntil(
        () => notFoundMessageShown,
        (shown) => shown,
      );

      assert.notStrictEqual(
        vscode.window.activeTextEditor?.document.uri.fsPath,
        outsideFile,
        "the outside file must never be opened",
      );
    } finally {
      vscode.window.showInformationMessage = originalShowInformationMessage;
      disposable.dispose();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  test("shows an information message instead of throwing when the file can't be resolved", async () => {
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "reaction-source-opening-missing-"),
    );

    let handler: ((message: unknown) => void) | undefined;
    const fakeWebview = {
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        handler = listener;
        return { dispose() {} };
      },
    } as unknown as vscode.Webview;

    const disposable = wireSourceOpening(fakeWebview, workspaceRoot);
    try {
      assert.ok(handler, "wireSourceOpening should register a message handler");
      assert.doesNotThrow(() => {
        handler?.({
          type: "openSource",
          fileName: "webpack://app/./src/DoesNotExist.tsx",
          lineNumber: 1,
          columnNumber: 1,
        });
      });
    } finally {
      disposable.dispose();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
