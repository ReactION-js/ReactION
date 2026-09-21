import React from "react";
import { ModestHelper } from "./ModestHelper";

// The unremarkable base case: one file imported (fan-out 1), imported by
// exactly one file -- App.tsx (fan-in 1). Low on both axes, unlike
// Hub.tsx/Orchestrator.tsx above.
export function ModestPage() {
  return <ModestHelper text="modest" />;
}
