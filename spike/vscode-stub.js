// Minimal `vscode` stand-in so compiled host modules (which import vscode for
// user-facing messages) can be required inside the Node Phase 1 harness.
module.exports = {
  window: {
    showInformationMessage() {},
    showErrorMessage() {},
  },
};
