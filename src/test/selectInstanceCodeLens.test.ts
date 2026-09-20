import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

  // Every test above opens an UNTITLED document (openTextDocument({content}))
  // -- document.fileName has no recognized extension there, exercising
  // analysisPathFor's synthetic-path fallback branch. A real, saved file on
  // disk exercises the OTHER branch (document.fileName used as-is, since it
  // already has a recognized .tsx/.ts/.jsx/.js extension) -- the more common
  // real-world case, and worth covering separately since it's a genuinely
  // different code path, not just a different fixture.
  test("provides a lens for a real, saved .tsx file on disk", async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reaction-codelens-"));
    const filePath = path.join(workspaceRoot, "Widget.tsx");
    fs.writeFileSync(
      filePath,
      ["export function Widget() {", "  return <span>widget</span>;", "}", ""].join("\n"),
    );

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      const provider = new SelectInstanceCodeLensProvider();
      const lenses = provider.provideCodeLenses(document);
      assert.strictEqual(lenses.length, 1);
      assert.deepStrictEqual(lenses[0].command?.arguments?.[0], { displayName: "Widget" });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
