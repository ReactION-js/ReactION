import React from "react";

export interface DormantFeaturePanelProps {
  message: string;
}

// Imported by App.tsx and referenced there in real JSX -- so
// computeUnusedComponents must NOT flag this one -- but that JSX sits behind
// a permanently-false feature flag, so it is genuinely never instantiated
// during a normal run of this app. This is the "not rendered this session"
// case kept deliberately DISTINCT from UnusedGizmo.tsx's fully-unreferenced
// case below: one proves the coverage correlation catches something the
// unused-components check cannot (a real, referenced, but dormant feature),
// the other proves the two checks agree when a component really is dead.
export function DormantFeaturePanel({ message }: DormantFeaturePanelProps) {
  return <div className="dormant-feature">{message}</div>;
}
