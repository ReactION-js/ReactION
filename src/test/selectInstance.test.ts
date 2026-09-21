import * as assert from "node:assert";
import { selectInstanceInPanels, type OpenPanel } from "../selectInstance";

// Plain mocha (describe/it), run via `npm run test:e2e` -- selectInstance.ts
// has no vscode import (mirrors src/test/openSource.test.ts), so the panel-
// fan-out logic is testable here against fake panel objects without a real
// WebviewPanel. The vscode-dependent registration wrapper
// (src/selectInstanceWiring.ts) and its "shows an information message" path
// are covered separately under vscode-test, in
// src/test/selectInstanceWiring.test.ts.
function fakePanel(): { panel: OpenPanel; posted: unknown[] } {
  const posted: unknown[] = [];
  return {
    panel: { webview: { postMessage: (message: unknown) => posted.push(message) } },
    posted,
  };
}

describe("selectInstanceInPanels", () => {
  it("shows the no-panel message and posts nothing when no panel is open", () => {
    let shown = false;
    selectInstanceInPanels([undefined, undefined], { displayName: "Widget" }, () => {
      shown = true;
    });
    assert.strictEqual(shown, true);
  });

  it("posts a selectByComponent message to the single open panel", () => {
    const { panel, posted } = fakePanel();
    let shown = false;
    selectInstanceInPanels([panel, undefined], { displayName: "Widget" }, () => {
      shown = true;
    });
    assert.strictEqual(shown, false, "should not show the no-panel message when a panel is open");
    assert.deepStrictEqual(posted, [{ type: "selectByComponent", displayName: "Widget" }]);
  });

  it("posts to every open panel when more than one is open", () => {
    const first = fakePanel();
    const second = fakePanel();
    selectInstanceInPanels([first.panel, second.panel], { displayName: "Widget" }, () => {
      assert.fail("should not show the no-panel message when panels are open");
    });
    assert.deepStrictEqual(first.posted, [{ type: "selectByComponent", displayName: "Widget" }]);
    assert.deepStrictEqual(second.posted, [{ type: "selectByComponent", displayName: "Widget" }]);
  });
});
