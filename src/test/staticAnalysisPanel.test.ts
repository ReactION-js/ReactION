import * as assert from "node:assert";
import * as vscode from "vscode";

// vscode-test (TDD interface), matching src/test/extension.test.ts's style.
// Runs against the real ReactION-repo workspace the test harness opens (see
// .vscode-test.mjs's workspaceFolder), so this exercises
// ReactION.analyzeSource end-to-end (command registration -> workspaceRoot
// resolution -> StaticAnalysisPanel.createOrShow -> analyzeWorkspace over
// this repo's own src/**/*) rather than a hand-built fake.
suite("ReactION.analyzeSource", () => {
  test("is registered", async () => {
    const extension = vscode.extensions.getExtension("ReactION-JS.ReactION");
    assert.ok(extension, "ReactION extension should be present");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("ReactION.analyzeSource"),
      "ReactION.analyzeSource should be registered",
    );
  });

  test("opens a panel without throwing", async () => {
    await assert.doesNotReject(async () => vscode.commands.executeCommand("ReactION.analyzeSource"));

    // Give the panel's deferred (setImmediate-gated) analysis pass a beat to
    // run and settle before the suite tears the extension host down.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
});
