/*
 * Phase 3d pure-function verification harness (throwaway).
 *
 * client/contextMap.ts has zero React/DOM/bridge dependencies, so there's no
 * need for Puppeteer or a Store here: esbuild-compile the REAL shipped module
 * to a requirable CJS file (same technique as run-phase3-renderstats.js) and
 * exercise buildContextMap() against constructed element/hooks fixtures.
 */
"use strict";

const path = require("path");
const esbuild = require("esbuild");

const log = (...a) => console.log("[phase3-contextmap]", ...a);

let passCount = 0;
let failCount = 0;

function check(label, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passCount++;
    log(`PASS: ${label}`);
  } else {
    failCount++;
    log(`FAIL: ${label} -- expected ${expectedStr}, got ${actualStr}`);
  }
}

function checkTrue(label, condition) {
  if (condition) {
    passCount++;
    log(`PASS: ${label}`);
  } else {
    failCount++;
    log(`FAIL: ${label}`);
  }
}

// react-devtools-shared ElementType values used by contextMap.ts itself.
const FUNCTION_TYPE = 5;
const CONTEXT_TYPE = 2;

function el(id, parentID, displayName, type) {
  return { id, parentID, displayName, type };
}

function hook(name, subHooks) {
  return {
    id: null,
    isStateEditable: false,
    name,
    value: undefined,
    subHooks: subHooks || [],
    hookSource: null,
  };
}

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "..", "client", "contextMap.ts")],
    bundle: false,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node18",
  });
  const code = built.outputFiles[0].text;

  const Module = require("module");
  const mod = new Module(path.join(__dirname, "contextMap.compiled.js"), null);
  mod.filename = path.join(__dirname, "contextMap.compiled.js");
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(code, mod.filename);
  const { buildContextMap } = mod.exports;

  checkTrue("module exports the real function", typeof buildContextMap === "function");

  // --- Fixture 1: basic single-provider/single-consumer -------------------
  // Mirrors the real sample app's shape: App -> Context.Provider -> Header,
  // where Header's only hook is a useContext() entry named "Context" (its
  // real, empirically-confirmed displayName -- see the Phase 3d report).
  {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Context.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "Header", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([[3, [hook("Context")]]]);
    const result = buildContextMap(elements, hooksByElementId);
    check("basic case: one entry", result.length, 1);
    check("basic case: provider id", result[0] && result[0].providerId, 2);
    check("basic case: provider base name", result[0] && result[0].providerName, "Context");
    check(
      "basic case: consumer list",
      result[0] && result[0].consumers,
      [{ id: 3, name: "Header" }],
    );
  }

  // --- Fixture 2: shadowing -- nested same-base-name provider, nearest wins
  {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Context.Provider", CONTEXT_TYPE)], // outer
      [3, el(3, 2, "Section", FUNCTION_TYPE)],
      [4, el(4, 3, "Context.Provider", CONTEXT_TYPE)], // inner, shadows outer
      [5, el(5, 4, "Leaf", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([[5, [hook("Context")]]]);
    const result = buildContextMap(elements, hooksByElementId);
    check("shadowing case: one entry", result.length, 1);
    checkTrue(
      "shadowing case: nearest (inner) provider wins, not the outer one",
      result[0] && result[0].providerId === 4,
    );
    check("shadowing case: consumer list", result[0] && result[0].consumers, [
      { id: 5, name: "Leaf" },
    ]);
  }

  // --- Fixture 3: no match -- consumer hook name doesn't match any ancestor
  {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Other.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "Leaf", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([[3, [hook("Context")]]]); // wrong name
    const result = buildContextMap(elements, hooksByElementId);
    check("no-match case: no entries produced", result.length, 0);
  }

  // --- Fixture 4: provider with no consumers is excluded -------------------
  {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Context.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "Leaf", FUNCTION_TYPE)], // doesn't consume it
    ]);
    const hooksByElementId = new Map([[3, [hook("State")]]]);
    const result = buildContextMap(elements, hooksByElementId);
    check("unconsumed-provider case: excluded from output", result.length, 0);
  }

  // --- Fixture 5: useContext nested inside a custom hook (subHooks) --------
  {
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Context.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "Leaf", FUNCTION_TYPE)],
    ]);
    const hooksByElementId = new Map([
      [3, [hook("useTheme", [hook("Context")])]],
    ]);
    const result = buildContextMap(elements, hooksByElementId);
    checkTrue(
      "custom-hook-wrapped useContext case: still matched via subHooks",
      result.length === 1 && result[0].consumers.length === 1 && result[0].consumers[0].id === 3,
    );
  }

  // --- Fixture 6: non-function-like candidate types are ignored ------------
  {
    const CLASS_TYPE = 1;
    const elements = new Map([
      [1, el(1, 0, "App", FUNCTION_TYPE)],
      [2, el(2, 1, "Context.Provider", CONTEXT_TYPE)],
      [3, el(3, 2, "ClassLeaf", CLASS_TYPE)],
    ]);
    // A class component would never actually produce a hooks entry in the
    // real protocol (this is a synthetic fixture asserting the defensive
    // type-check), but assert it's ignored even if one were present.
    const hooksByElementId = new Map([[3, [hook("Context")]]]);
    const result = buildContextMap(elements, hooksByElementId);
    check("class-type candidate is ignored (out of scope)", result.length, 0);
  }

  console.log("\n=== PHASE 3d CONTEXTMAP HARNESS RESULT ===");
  console.log(`pass: ${passCount}, fail: ${failCount}`);
  console.log(failCount === 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3-contextmap] uncaught error:", err);
  process.exit(1);
});
