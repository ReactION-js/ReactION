import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: ["out/test/extension.test.js", "out/test/sourceOpeningWiring.test.js"],
  workspaceFolder: ".",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
