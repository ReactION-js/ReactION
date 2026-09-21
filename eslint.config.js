"use strict";

const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = tseslint.config(
  {
    ignores: [
      "out/**",
      "node_modules/**",
      "resources/**",
      // spike/storeGraphTransform.test.js, spike/coverage.test.js,
      // spike/selectByComponent.test.js, spike/kitchenSink.test.js,
      // spike/contextMap.test.js, and spike/elementInspection.test.js are
      // permanent, CI-wired regression tests (see package.json's test:e2e),
      // not throwaway harnesses -- unlike the rest of spike/, they should
      // get the same static-analysis coverage src/test/*.ts already gets
      // (this is how a dead import slipped in undetected during Phase 4c
      // review). ESLint's flat-config negation can't re-include a file
      // matched by a "**" glob on the same prefix (confirmed empirically),
      // so this is a single-level "spike/*" plus a separate recursive
      // ignore for the nested fixtures/ data directory, instead of one
      // "spike/**".
      "spike/*",
      "spike/fixtures/**",
      "!spike/storeGraphTransform.test.js",
      "!spike/coverage.test.js",
      "!spike/selectByComponent.test.js",
      "!spike/kitchenSink.test.js",
      "!spike/contextMap.test.js",
      "!spike/elementInspection.test.js",
      "**/*.config.js",
      ".vscode-test/**",
      ".vscode-test.mjs",
      "*.vsix",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Plain CommonJS mocha test, not part of the src/ TS project -- it
    // intentionally uses require() like every spike/ script does (setting
    // languageOptions.sourceType: "commonjs" does not itself suppress
    // no-require-imports, confirmed empirically), so turn that one rule off
    // rather than rewrite this file's module system to satisfy a lint rule
    // meant for the compiled src/ and client/ TypeScript.
    files: [
      "spike/storeGraphTransform.test.js",
      "spike/coverage.test.js",
      "spike/selectByComponent.test.js",
      "spike/kitchenSink.test.js",
      "spike/contextMap.test.js",
      "spike/elementInspection.test.js",
    ],
    languageOptions: {
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
