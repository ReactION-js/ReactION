import React from "react";

export interface LazyChartProps {
  label: string;
}

// Reached ONLY through React.lazy(() => import("./components/LazyChart")) in
// App.tsx, wrapped in a <Suspense> boundary there -- this is simultaneously
// the "lazy + Suspense" fixture AND the "no false delete on a
// dynamically-imported component" fixture Task 5f's spec asks for (see
// App.tsx's own comment on why this is the same component serving both
// roles). Never imported statically anywhere in this fixture.
export default function LazyChart({ label }: LazyChartProps) {
  return <div className="lazy-chart">{label}</div>;
}
