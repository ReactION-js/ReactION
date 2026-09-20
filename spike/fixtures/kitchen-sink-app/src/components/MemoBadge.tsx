import React from "react";

export interface MemoBadgeProps {
  count: number;
}

// memo-wrapped via an inline named function expression whose OWN name
// matches the exported binding ("MemoBadge") -- mirroring
// spike/sample-app.jsx's Counter pattern was NOT enough on its own: this
// task's own live harness (spike/run-phase5f-kitchen-sink.js) empirically
// caught esbuild's bundler renaming this inner function expression to
// "MemoBadge2" in the bundled output (the same "Counter -> Counter2"
// phenomenon client/coverage.ts's own doc comment already documents), which
// changes the function's runtime `.name` and would otherwise make the live
// Store report "MemoBadge2" -- a false "not rendered" against
// analyzeWorkspace's static "MemoBadge". Setting `.displayName` explicitly on
// the exported memo() wrapper sidesteps that: react-devtools-core's
// getWrappedDisplayName reads `elementType.displayName` FIRST, before ever
// falling back to the inner function's own (possibly bundler-mangled) name.
export const MemoBadge = React.memo(function MemoBadge({ count }: MemoBadgeProps) {
  return <div className="memo-badge">badge: {count}</div>;
});
MemoBadge.displayName = "MemoBadge";
