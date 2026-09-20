// Minimal `vscode` stand-in so compiled host modules (which import vscode for
// user-facing messages) can be required inside the Node Phase 1 harness.
//
// Position/Range/CodeLens added for Task 5f's kitchen-sink harness, which
// instantiates the REAL SelectInstanceCodeLensProvider (out/selectInstanceCodeLens.js)
// against a plain fake document -- that class constructs these three directly.
// Purely additive (existing `window` shape untouched), so every prior
// harness that stubs vscode this way is unaffected.
class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class CodeLens {
  constructor(range, command) {
    this.range = range;
    this.command = command;
  }
}

module.exports = {
  window: {
    showInformationMessage() {},
    showErrorMessage() {},
  },
  Position,
  Range,
  CodeLens,
};
