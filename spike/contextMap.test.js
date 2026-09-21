/*
 * Regression test (permanent, checked-in, zero Chrome/network -- same
 * promotion pattern as storeGraphTransform.test.js/coverage.test.js/
 * selectByComponent.test.js/kitchenSink.test.js): esbuild-compiles the REAL
 * client/contextMap.ts (exactly like the throwaway
 * spike/run-phase3-contextmap.js harness does) and exercises buildContextMap()
 * against constructed element/hooks fixtures -- no React, DOM, or bridge
 * needed, per that module's own doc comment.
 *
 * Targets one specific code-review finding: collectHookNames used to push
 * EVERY hook's `.name` (State/Effect/Reducer/Memo/Callback/Ref/a custom
 * hook's own synthesized wrapper name -- not just Context) as a
 * context-consumption candidate. A custom hook like useTheme() gets its own
 * HooksNode (name "Theme", parsed from the function name) wrapping whatever
 * it actually calls internally, and that wrapper node is indistinguishable
 * from a real useContext() call by name alone -- so an UNRELATED component
 * calling useTheme() (for something that has nothing to do with any
 * Context) sitting under a "Theme.Provider" ancestor was incorrectly
 * reported as a ThemeContext consumer. See contextMap.ts's
 * isContextHookCandidate for the fix and the real-backend verification it's
 * based on. The pre-existing, separate "two Contexts sharing a displayName"
 * limitation is already covered by run-phase3-contextmap.js and is not
 * re-tested here.
 */
"use strict";

const path = require("path");
const assert = require("node:assert");
const { requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");

// react-devtools-shared ElementType values used by contextMap.ts itself.
const FUNCTION_TYPE = 5;
const CONTEXT_TYPE = 2;

function el(id, parentID, displayName, type) {
  return { id, parentID, displayName, type };
}

// A genuine primitive-hook leaf, shaped exactly as the real installed
// react-devtools-inline's buildTree constructs one (node_modules/
// react-devtools-inline/dist/backend.js): subHooks is always an empty array
// literal for a leaf, and id is null only for the primitives buildTree
// special-cases (Context chief among them) -- a plain State/Effect/etc.
// leaf gets a real, non-null nativeHookID, so tests that need one pass it
// explicitly rather than defaulting to null.
function leafHook(name, { id = null, value } = {}) {
  return { id, isStateEditable: false, name, value, subHooks: [], hookSource: null };
}

// A custom hook's own synthesized wrapper node: name parsed from the
// wrapping function (e.g. "Theme" from useTheme()), id always null, and
// subHooks holding whatever it actually called. This exact shape -- id
// null, just like a real useContext() leaf -- is what caused the false
// positive: only subHooks.length lets the two be told apart.
function wrapperHook(name, subHooks) {
  return { id: null, isStateEditable: false, name, value: undefined, subHooks, hookSource: null };
}

describe("buildContextMap / collectHookNames (pure context-consumer correlation)", () => {
  let buildContextMap;

  before(async () => {
    ({ buildContextMap } = await requireCompiled(
      path.join(REPO_ROOT, "client", "contextMap.ts"),
    ));
  });

  it("does not report an unrelated component as a consumer merely because its own custom hook shares the context's displayName", () => {
    // ThemeContext.displayName = "Theme" (provider renders as
    // "Theme.Provider"). UnrelatedComponent calls a custom useTheme() that
    // never touches ThemeContext -- internally it's just an unrelated
    // useState() -- so its own synthesized hook-tree node is named "Theme"
    // purely because of the wrapping function's name.
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Theme.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "UnrelatedComponent", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([
      [3, [wrapperHook("Theme", [leafHook("State", { id: 0, value: "unrelated" })])]],
    ]);

    const result = buildContextMap(elements, hooksByElementId);

    assert.deepStrictEqual(
      result,
      [],
      "an unrelated custom hook's own name must never be treated as a useContext() call",
    );
  });

  it("still reports a genuine useContext() consumer of a context with the very same displayName", () => {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Theme.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "RealConsumer", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([
      [3, [leafHook("Theme", { value: { theme: "dark" } })]],
    ]);

    const result = buildContextMap(elements, hooksByElementId);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].providerId, 2);
    assert.strictEqual(result[0].providerName, "Theme");
    assert.deepStrictEqual(result[0].consumers, [{ id: 3, name: "RealConsumer" }]);
  });

  it("distinguishes the two cases in the SAME tree: real consumer reported, colliding custom hook wrapper excluded", () => {
    // The sharpest version of the regression: both components sit under the
    // SAME Theme.Provider, so a heuristic that only checked hook names would
    // either report both (the bug) or neither -- only checking each hook's
    // own shape gets both right at once.
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Theme.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "RealConsumer", FUNCTION_TYPE)],
      [4, el(4, 2, "UnrelatedComponent", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([
      [3, [leafHook("Theme", { value: { theme: "dark" } })]],
      [4, [wrapperHook("Theme", [leafHook("State", { id: 0, value: "unrelated" })])]],
    ]);

    const result = buildContextMap(elements, hooksByElementId);

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].consumers, [{ id: 3, name: "RealConsumer" }]);
  });

  it("still finds a genuine useContext() nested two custom-hook levels deep", () => {
    // Guards against over-correcting: collectHookNames must keep recursing
    // into subHooks even though a wrapper's OWN name is never itself a
    // candidate.
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Theme.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "DeepConsumer", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([
      [
        3,
        [
          wrapperHook("useThemeConsumer", [
            wrapperHook("useTheme", [leafHook("Theme", { value: { theme: "dark" } })]),
          ]),
        ],
      ],
    ]);

    const result = buildContextMap(elements, hooksByElementId);

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].consumers, [{ id: 3, name: "DeepConsumer" }]);
  });

  it("excludes a bare leaf hook with a non-null id even if its literal name coincidentally matches a provider", () => {
    // Defense-in-depth on the id === null half of the guard: a plain
    // (non-wrapped) State/Effect/etc. leaf always carries a real
    // nativeHookID, never null, per buildTree -- so even in the deliberately
    // exotic case of a Context displayName that collides with a hardcoded
    // primitive name, a non-null id keeps it out.
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "State.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "Leaf", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([[3, [leafHook("State", { id: 0 })]]]);

    const result = buildContextMap(elements, hooksByElementId);

    assert.deepStrictEqual(result, []);
  });
});
