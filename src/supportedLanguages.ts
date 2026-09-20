// Single source of truth for which languages Task 5e's "Select in ReactION"
// CodeLens covers. Deliberately free of any `vscode` import (mirrors
// src/openSource.ts's own convention) so BOTH
// src/selectInstanceCodeLens.ts's vscode.DocumentSelector AND
// src/test/activationEvents.test.ts's plain-mocha consistency check against
// package.json's activationEvents can import the exact same list -- the
// latter needs no vscode dependency at all for a pure data comparison, and
// keeping this list here (not just copy-pasted into two places) is what
// makes a future typo in either the selector or the activation events show
// up as a test failure instead of a silent gap.
export const SUPPORTED_LANGUAGE_IDS = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
] as const;
