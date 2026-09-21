import * as vscode from "vscode";
import type { LogFn } from "./logging";

// Wraps a vscode.OutputChannel into the plain LogFn shape that vscode-free
// modules (DevtoolsBridge, Puppeteer) accept, prefixing each line with a
// timestamp and the emitting module's name (e.g. "[puppeteer] ...") so a
// single shared "ReactION" channel stays readable once multiple modules log
// to it.
export function createModuleLogger(
  channel: vscode.OutputChannel,
  moduleName: string,
): LogFn {
  return (message: string) => {
    channel.appendLine(`[${new Date().toISOString()}] [${moduleName}] ${message}`);
  };
}
