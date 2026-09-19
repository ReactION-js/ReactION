import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/extension.test.js",
  workspaceFolder: ".",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
