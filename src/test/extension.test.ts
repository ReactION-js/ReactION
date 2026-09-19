import * as assert from "node:assert";
import * as vscode from "vscode";

suite("ReactION extension", () => {
  test("contributes its commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("ReactION.openTree"),
      "ReactION.openTree should be registered",
    );
    assert.ok(
      commands.includes("ReactION.openWeb"),
      "ReactION.openWeb should be registered",
    );
  });
});
