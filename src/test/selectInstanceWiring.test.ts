import * as assert from "node:assert";
import * as vscode from "vscode";
import ViewPanel from "../ViewPanel";

// vscode-test (tdd suite/test): exercises the REAL "ReactION.selectInstance"
// command extension.ts registers on activation, rather than re-registering a
// second copy here (vscode.commands.registerCommand throws if a command id
// is already registered, and the real extension has already claimed this
// one by the time any test file in this run activates it).
// ViewPanel.currentLivePanel is a plain public static, so a fake panel
// object is stubbed directly onto it -- mirrors how
// src/test/sourceOpeningWiring.test.ts fakes a webview object rather than
// standing up a real WebviewPanel. Only the live panel is relevant here:
// selectInstance jumps source -> a LIVE element, which only the live tab
// (Chrome/DevTools connected) can ever have.
suite("ReactION.selectInstance command", () => {
  test("shows an informational message when no panel is open", async () => {
    const extension = vscode.extensions.getExtension("ReactION-JS.ReactION");
    assert.ok(extension, "ReactION extension should be present");
    await extension.activate();

    assert.strictEqual(
      ViewPanel.currentLivePanel,
      undefined,
      "no live ViewPanel should be open in a fresh test session",
    );

    const originalShowInformationMessage = vscode.window.showInformationMessage;
    let shownMessage: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.window as any).showInformationMessage = (message: string, ...args: unknown[]) => {
      shownMessage = message;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalShowInformationMessage as any).apply(vscode.window, [message, ...args]);
    };

    try {
      await vscode.commands.executeCommand("ReactION.selectInstance", { displayName: "Widget" });
      assert.ok(
        shownMessage?.includes("Widget"),
        `expected the info message to mention the component name, got: ${shownMessage}`,
      );
    } finally {
      vscode.window.showInformationMessage = originalShowInformationMessage;
    }
  });

  test("posts a selectByComponent message to a single stubbed open panel", async () => {
    const posted: unknown[] = [];
    const fakePanel = {
      webview: {
        postMessage: (message: unknown) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
    } as unknown as ViewPanel;

    const originalCurrentPanel = ViewPanel.currentLivePanel;
    ViewPanel.currentLivePanel = fakePanel;
    try {
      await vscode.commands.executeCommand("ReactION.selectInstance", { displayName: "Widget" });
      assert.deepStrictEqual(posted, [{ type: "selectByComponent", displayName: "Widget" }]);
    } finally {
      ViewPanel.currentLivePanel = originalCurrentPanel;
    }
  });
});
