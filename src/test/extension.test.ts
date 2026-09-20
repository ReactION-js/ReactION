import * as assert from "node:assert";
import * as vscode from "vscode";

suite("ReactION extension", () => {
  test("contributes its commands", async () => {
    const extension = vscode.extensions.getExtension("ReactION-JS.ReactION");
    assert.ok(extension, "ReactION extension should be present");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("ReactION.openTree"),
      "ReactION.openTree should be registered",
    );
    assert.ok(
      commands.includes("ReactION.openWeb"),
      "ReactION.openWeb should be registered",
    );
    assert.ok(
      commands.includes("ReactION.selectInstance"),
      "ReactION.selectInstance should be registered",
    );
  });
});
