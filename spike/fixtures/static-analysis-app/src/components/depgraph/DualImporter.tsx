import React from "react";
import { HubWidget } from "./Hub";

export interface DualImporterProps {
  showDynamic: boolean;
}

// Regression fixture for the same-file static+dynamic-import dedup rule in
// computeFileFanCounts (src/dependencyMetrics.ts): this file has TWO edges
// into Hub.tsx -- the static import above, and the dynamic import() below --
// but both come from this same file, so Hub's fan-in must count this file
// once, not twice.
export async function loadHubDynamically() {
  return import("./Hub");
}

export function DualImporter({ showDynamic }: DualImporterProps) {
  return showDynamic ? <HubWidget label="dynamic" /> : null;
}
