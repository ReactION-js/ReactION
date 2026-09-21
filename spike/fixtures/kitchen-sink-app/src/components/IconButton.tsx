import React from "react";

export interface IconButtonProps {
  icon: string;
}

// Shared leaf, imported by Toolbar, Sidebar, and ActionButton below --
// exists so computeDependencyMetrics has a file with a plausible, non-trivial
// fan-in (3) alongside the mostly fan-in-0/1 rest of this fixture, without
// needing a dramatic "god component" to still be a sensible number.
export function IconButton({ icon }: IconButtonProps) {
  return <button className={`icon-${icon}`}>{icon}</button>;
}
