import type { ChangeDescription, CommitDataFrontend } from "react-devtools-inline/frontend";

// Pure functions over the profiler's already-hydrated CommitDataFrontend/
// ChangeDescription shapes (see react-devtools-inline.d.ts). No React, DOM,
// or bridge dependency -- everything here is plain data in, plain data out.

// Matches the stock DevTools UI's own "why did this render?" logic
// (react-devtools-shared/src/devtools/views/Profiler/WhatChanged.js): a
// fiber only appears in `changeDescriptions` at all when it actually ran, so
// "wasted" means it ran but nothing that would justify the work changed.
// Note this is NOT simply `!change.context` -- an empty changed-key array is
// truthy in JS, so a real "did anything change" check for `context` has to
// mirror WhatChanged's own two-part test (a boolean context flag, or a
// non-empty changed-key array) rather than a single falsy check.
export function isWastedRender(change: ChangeDescription): boolean {
  if (change.isFirstMount) {
    return false;
  }
  const contextChanged =
    change.context === true ||
    (Array.isArray(change.context) && change.context.length !== 0);
  const propsChanged = change.props !== null && change.props.length !== 0;
  const stateChanged = change.state !== null && change.state.length !== 0;
  return !contextChanged && !change.didHooksChange && !propsChanged && !stateChanged;
}

// Fiber id -> number of commits in which it appeared as a changeDescriptions
// key, i.e. the number of commits it actually ran in. A fiber that bails out
// of every commit (referentially-equal props/context, no state change) is
// never a key in any commit's map, so it's simply absent here -- callers
// must not treat a missing entry as "rendered 0 times", only as "not
// observed running in this profiling session".
export function computeRenderCounts(commitData: CommitDataFrontend[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const commit of commitData) {
    if (commit.changeDescriptions === null) {
      continue;
    }
    for (const fiberId of commit.changeDescriptions.keys()) {
      counts.set(fiberId, (counts.get(fiberId) ?? 0) + 1);
    }
  }
  return counts;
}

// Short, human-readable summary of why a fiber re-rendered, mirroring the
// stock UI's plain-language style without needing to match its exact copy.
export function describeChange(change: ChangeDescription): string {
  if (change.isFirstMount) {
    return "First render";
  }

  const parts: string[] = [];

  if (change.context === true) {
    parts.push("Context changed");
  } else if (Array.isArray(change.context) && change.context.length > 0) {
    parts.push(`Context changed: ${change.context.join(", ")}`);
  }

  if (change.didHooksChange) {
    parts.push("Hooks changed");
  }

  if (change.props !== null && change.props.length > 0) {
    parts.push(`Props changed: ${change.props.join(", ")}`);
  }

  if (change.state !== null && change.state.length > 0) {
    parts.push(`State changed: ${change.state.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "Parent re-rendered";
}
