import React from "react";

export interface UnusedGizmoProps {
  label: string;
}

// Genuinely unused: exported, valid, PascalCase, JSX-taggable -- but never
// imported anywhere in this fixture, and this file is never a dynamic
// import() target either. Mirrors static-analysis-app's NeverImported.tsx.
// Being unreferenced, it also never mounts -- so it doubles as the
// "statically unused AND not rendered" case, contrasted with
// DormantFeaturePanel.tsx's "referenced but still not rendered" case above.
export function UnusedGizmo({ label }: UnusedGizmoProps) {
  return <div className="unused-gizmo">{label}</div>;
}
