import * as assert from "node:assert";
import * as vscode from "vscode";
import { SelectInstanceCodeLensProvider } from "../selectInstanceCodeLens";

// vscode-test (tdd suite/test, matching extension.test.ts/
// sourceOpeningWiring.test.ts): needs a real vscode.TextDocument, which
// requires the extension host, unlike singleFileComponents.test.ts's plain-
// mocha coverage of the underlying finder.
suite("SelectInstanceCodeLensProvider", () => {
  test("registers a CodeLens provider that VS Code actually invokes", async () => {
    const extension = vscode.extensions.getExtension("ReactION-JS.ReactION");
    assert.ok(extension, "ReactION extension should be present");
    await extension.activate();

    const document = await vscode.workspace.openTextDocument({
      language: "typescriptreact",
      content: ["export function Greeting() {", "  return <div>hi</div>;", "}", ""].join("\n"),
    });

    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      document.uri,
      100,
    );

    assert.ok(lenses, "expected the built-in executeCodeLensProvider command to return lenses");
    const greetingLens = lenses.find(
      (lens) =>
        Array.isArray(lens.command?.arguments) &&
        (lens.command?.arguments[0] as { displayName?: string } | undefined)?.displayName === "Greeting",
    );
    assert.ok(greetingLens, `expected a CodeLens for Greeting among ${JSON.stringify(lenses)}`);
    assert.strictEqual(greetingLens?.command?.command, "ReactION.selectInstance");
  });

  test("provideCodeLenses returns a lens at roughly the right position with the right command", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescriptreact",
      content: [
        "import React from 'react';",
        "",
        "export function Greeting() {",
        "  return <div>hi</div>;",
        "}",
        "",
      ].join("\n"),
    });

    const provider = new SelectInstanceCodeLensProvider();
    const tokenSource = new vscode.CancellationTokenSource();
    try {
      const lenses = provider.provideCodeLenses(document, tokenSource.token);
      assert.strictEqual(lenses.length, 1);
      const [lens] = lenses;
      assert.strictEqual(lens.command?.command, "ReactION.selectInstance");
      assert.deepStrictEqual(lens.command?.arguments?.[0], { displayName: "Greeting" });
      // "export function Greeting() {" is 0-based line 2.
      assert.strictEqual(lens.range.start.line, 2);
    } finally {
      tokenSource.dispose();
    }
  });

  test("returns no lenses, and does not throw, for a file with no components", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content: "export const ANSWER = 42;\n",
    });
    const provider = new SelectInstanceCodeLensProvider();
    assert.deepStrictEqual(provider.provideCodeLenses(document), []);
  });

  test("returns no lenses, and does not throw, for a completely empty document", async () => {
    const document = await vscode.workspace.openTextDocument({ language: "typescriptreact", content: "" });
    const provider = new SelectInstanceCodeLensProvider();
    assert.doesNotThrow(() => provider.provideCodeLenses(document));
  });

  test("does not throw for a document with a syntax error", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescriptreact",
      content: "export function Broken( {{{ return <div unterminated",
    });
    const provider = new SelectInstanceCodeLensProvider();
    assert.doesNotThrow(() => provider.provideCodeLenses(document));
  });
});
