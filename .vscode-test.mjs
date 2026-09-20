import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: [
    "out/test/extension.test.js",
    "out/test/staticAnalysisPanel.test.js",
    "out/test/sourceOpeningWiring.test.js",
    "out/test/coverageAnalysisWiring.test.js",
    "out/test/devtoolsBridge.test.js",
    "out/test/puppeteerErrors.test.js",
    "out/test/outputChannelLogger.test.js",
    "out/test/diagnosticsWiring.test.js",
    "out/test/devServerProbe.test.js",
    "out/test/connectionResilience.test.js",
  ],
  workspaceFolder: ".",
  mocha: {
    ui: "tdd",
    timeout: 20000,
  },
});
