import React from "react";

export interface HubWidgetProps {
  label: string;
}

// Task 5c's "hub" fixture: imported by four separate files -- HubConsumerA,
// HubConsumerB, and HubConsumerC each via a plain static import, plus
// DualImporter, which imports this file BOTH statically and dynamically
// (see DualImporter.tsx for why that still only counts as one importer, not
// two). None of this depgraph/ subtree is wired into App.tsx's render tree
// -- it exists purely to exercise computeDependencyMetrics' fan-in/out
// counting (Orchestrator.tsx is deliberately the only thing that imports the
// consumer files below, and nothing imports Orchestrator itself).
export function HubWidget({ label }: HubWidgetProps) {
  return <div>{label}</div>;
}
