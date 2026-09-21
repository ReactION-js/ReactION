import * as assert from "node:assert";
import * as path from "node:path";
import { analyzeWorkspaceCached, STATIC_ANALYSIS_CACHE_TTL_MS } from "../staticAnalysis";

// Fixture roots reused from existing suites -- static-analysis-app is
// staticAnalysis.test.ts's/coverageAnalysisWiring.test.ts's own fixture,
// coverage-app is a second, unrelated, already-existing fixture (a single
// tsconfig-less .jsx file). Picked purely so ROOT_A !== ROOT_B and both are
// real, valid, small (fast-to-parse) workspace roots -- these tests don't
// care about any particular analysis result, only object identity and
// per-root isolation.
const ROOT_A = path.join(__dirname, "..", "..", "spike", "fixtures", "static-analysis-app");
const ROOT_B = path.join(__dirname, "..", "..", "spike", "fixtures", "coverage-app");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Every test below primes its own root with { forceFresh: true } before
// asserting anything, rather than assuming the root starts out uncached.
// analyzeWorkspaceCached's cache is a module-level singleton shared with
// whatever other suites run in this same test process -- coverageAnalysisWiring.test.ts
// calls it against this exact ROOT_A fixture too -- so a bare first call here
// can't assume it's actually a cache miss. Priming first guarantees a known,
// freshly-computed baseline object to compare the next call against,
// regardless of test execution order.
//
// Object identity (===) is the proof of "no fresh parse happened", not a
// timing measurement or a call counter: analyzeWorkspace builds a brand-new
// StaticAnalysisResult (new Project, new arrays/maps) on every real call, so
// two references being identical is only possible if the second call
// short-circuited to the cached entry instead of calling it again.
suite("analyzeWorkspaceCached", () => {
  test("a second call for the same root within the TTL returns the SAME result object, without re-running analyzeWorkspace", () => {
    const primed = analyzeWorkspaceCached(ROOT_A, { forceFresh: true });
    const again = analyzeWorkspaceCached(ROOT_A);
    assert.strictEqual(again, primed, "expected the cached call to return the identical result object");
  });

  test("forceFresh always re-runs analyzeWorkspace, even for a call moments after a cached one", () => {
    const primed = analyzeWorkspaceCached(ROOT_A, { forceFresh: true });
    const forced = analyzeWorkspaceCached(ROOT_A, { forceFresh: true });
    assert.notStrictEqual(
      forced,
      primed,
      "forceFresh must produce a brand-new result object, not the cached one",
    );
  });

  test("a call after the TTL expires re-runs analyzeWorkspace instead of returning the stale cached object", async () => {
    // Genuinely waits out STATIC_ANALYSIS_CACHE_TTL_MS rather than mocking
    // the clock, so this needs real wall-clock time (bounded by
    // .vscode-test.mjs's 20s global mocha timeout, comfortably above the
    // ~5.25s this waits).
    const primed = analyzeWorkspaceCached(ROOT_A, { forceFresh: true });
    await sleep(STATIC_ANALYSIS_CACHE_TTL_MS + 250);
    const afterExpiry = analyzeWorkspaceCached(ROOT_A);
    assert.notStrictEqual(
      afterExpiry,
      primed,
      "expected a fresh result once the cached entry's TTL has passed",
    );
  });

  test("two different workspace roots are cached independently, without sharing or colliding", () => {
    const resultA = analyzeWorkspaceCached(ROOT_A, { forceFresh: true });
    const resultB = analyzeWorkspaceCached(ROOT_B, { forceFresh: true });

    // Interleaved on purpose: B's call sits between A's priming call and this
    // re-check, so this also proves that analyzing B did not evict or
    // overwrite A's own cache entry (or vice versa).
    const resultAAgain = analyzeWorkspaceCached(ROOT_A);
    const resultBAgain = analyzeWorkspaceCached(ROOT_B);

    assert.strictEqual(resultAAgain, resultA, "root A's own cache entry should still be served");
    assert.strictEqual(resultBAgain, resultB, "root B's own cache entry should still be served");
    assert.notStrictEqual(resultA, resultB, "two different roots must not share one cache entry");
    assert.strictEqual(resultA.workspaceRoot, ROOT_A);
    assert.strictEqual(resultB.workspaceRoot, ROOT_B);
  });
});
