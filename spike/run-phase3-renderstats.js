/*
 * Phase 3c pure-function verification harness (throwaway).
 *
 * client/renderStats.ts has zero React/DOM/bridge dependencies, so there's no
 * need for Puppeteer or a Store here: esbuild-compile the REAL shipped module
 * to a requirable CJS file (same technique serveSampleApp() in
 * run-phase1.js/run-phase2-visual.js already uses for the sample app) and
 * exercise its real exports against constructed ChangeDescription/
 * CommitDataFrontend fixtures.
 */
"use strict";

const path = require("path");
const esbuild = require("esbuild");

const log = (...a) => console.log("[phase3-renderstats]", ...a);

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

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "..", "client", "renderStats.ts")],
    bundle: false,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node18",
  });
  const code = built.outputFiles[0].text;

  const Module = require("module");
  const mod = new Module(path.join(__dirname, "renderStats.compiled.js"), null);
  mod.filename = path.join(__dirname, "renderStats.compiled.js");
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(code, mod.filename);
  const { isWastedRender, computeRenderCounts, describeChange } = mod.exports;

  checkTrue(
    "module exports the real functions",
    typeof isWastedRender === "function" &&
      typeof computeRenderCounts === "function" &&
      typeof describeChange === "function",
  );

  // --- isWastedRender ---------------------------------------------------

  const firstMount = {
    isFirstMount: true,
    context: null,
    didHooksChange: false,
    props: null,
    state: null,
  };
  checkTrue("first mount is never a wasted render", isWastedRender(firstMount) === false);

  const propsChanged = {
    isFirstMount: false,
    context: null,
    didHooksChange: false,
    props: ["count"],
    state: null,
  };
  checkTrue("props-changed render is not wasted", isWastedRender(propsChanged) === false);

  const genuinelyWasted = {
    isFirstMount: false,
    context: null,
    didHooksChange: false,
    props: null,
    state: null,
  };
  checkTrue(
    "no props/state/context/hooks change is a wasted render",
    isWastedRender(genuinelyWasted) === true,
  );

  const emptyArraysWasted = {
    isFirstMount: false,
    context: [],
    didHooksChange: false,
    props: [],
    state: [],
  };
  checkTrue(
    "empty changed-key arrays (not just null) still count as wasted",
    isWastedRender(emptyArraysWasted) === true,
  );

  const hooksChanged = {
    isFirstMount: false,
    context: null,
    didHooksChange: true,
    props: null,
    state: null,
    hooks: [0],
  };
  checkTrue("hooks-changed render is not wasted", isWastedRender(hooksChanged) === false);

  const contextChangedBoolean = {
    isFirstMount: false,
    context: true,
    didHooksChange: false,
    props: null,
    state: null,
  };
  checkTrue(
    "context===true render is not wasted",
    isWastedRender(contextChangedBoolean) === false,
  );

  const contextChangedArray = {
    isFirstMount: false,
    context: ["theme"],
    didHooksChange: false,
    props: null,
    state: null,
  };
  checkTrue(
    "non-empty context changed-key array render is not wasted",
    isWastedRender(contextChangedArray) === false,
  );

  const stateChanged = {
    isFirstMount: false,
    context: null,
    didHooksChange: false,
    props: null,
    state: ["value"],
  };
  checkTrue("state-changed render is not wasted", isWastedRender(stateChanged) === false);

  // --- computeRenderCounts ------------------------------------------------

  const multiCommitData = [
    {
      duration: 1,
      timestamp: 0,
      changeDescriptions: new Map([
        [1, propsChanged],
        [2, genuinelyWasted],
      ]),
      fiberActualDurations: new Map([
        [1, 1],
        [2, 1],
      ]),
      fiberSelfDurations: new Map([
        [1, 1],
        [2, 1],
      ]),
    },
    {
      duration: 1,
      timestamp: 800,
      changeDescriptions: new Map([[1, propsChanged]]),
      fiberActualDurations: new Map([[1, 1]]),
      fiberSelfDurations: new Map([[1, 1]]),
    },
    {
      duration: 1,
      timestamp: 1600,
      changeDescriptions: new Map([[1, propsChanged]]),
      fiberActualDurations: new Map([[1, 1]]),
      fiberSelfDurations: new Map([[1, 1]]),
    },
  ];
  const counts = computeRenderCounts(multiCommitData);
  check("multi-commit render count for id=1", counts.get(1), 3);
  check("multi-commit render count for id=2 (only appeared once)", counts.get(2), 1);
  checkTrue("a fiber id never present in any commit is absent, not zero", !counts.has(999));

  const noChangeDescriptionsCommit = [
    {
      duration: 1,
      timestamp: 0,
      changeDescriptions: null,
      fiberActualDurations: new Map(),
      fiberSelfDurations: new Map(),
    },
  ];
  check(
    "a commit with null changeDescriptions contributes nothing",
    computeRenderCounts(noChangeDescriptionsCommit).size,
    0,
  );

  // --- describeChange ------------------------------------------------------

  checkTrue(
    "describeChange(first mount) mentions the first render",
    /first render/i.test(describeChange(firstMount)),
  );
  checkTrue(
    "describeChange(props changed) names the prop",
    describeChange(propsChanged).includes("count"),
  );
  checkTrue(
    "describeChange(genuinely wasted) does not claim a prop/state/context/hooks changed",
    !/prop|state|context|hook/i.test(describeChange(genuinelyWasted)),
  );
  checkTrue(
    "describeChange(state changed) names the state key",
    describeChange(stateChanged).includes("value"),
  );
  checkTrue(
    "describeChange(hooks changed) mentions hooks",
    /hook/i.test(describeChange(hooksChanged)),
  );

  console.log("\n=== PHASE 3c RENDERSTATS HARNESS RESULT ===");
  console.log(`pass: ${passCount}, fail: ${failCount}`);
  console.log(failCount === 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[phase3-renderstats] uncaught error:", err);
  process.exit(1);
});
