import * as assert from "node:assert";
import type * as vscode from "vscode";
import { createModuleLogger } from "../outputChannelLogger";

suite("createModuleLogger", () => {
  test("prefixes each line with a timestamp and the module name", () => {
    const lines: string[] = [];
    const fakeChannel = {
      appendLine: (line: string) => lines.push(line),
    } as unknown as vscode.OutputChannel;

    const log = createModuleLogger(fakeChannel, "puppeteer");
    log("Chrome launched successfully");

    assert.strictEqual(lines.length, 1);
    assert.match(
      lines[0],
      /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[puppeteer\] Chrome launched successfully$/,
    );
  });

  test("uses the given module name for a different module", () => {
    const lines: string[] = [];
    const fakeChannel = {
      appendLine: (line: string) => lines.push(line),
    } as unknown as vscode.OutputChannel;

    createModuleLogger(fakeChannel, "devtools-bridge")("Backend connected");

    assert.ok(lines[0].includes("[devtools-bridge] Backend connected"));
  });
});
