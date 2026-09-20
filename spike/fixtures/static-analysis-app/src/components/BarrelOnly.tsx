import React from "react";

export interface BarrelOnlyProps {
  text: string;
}

// Only reachable from App.tsx via the "./components" barrel's
// `export * from "./BarrelOnly"` -- never imported by its own file path.
export function BarrelOnly({ text }: BarrelOnlyProps) {
  return <p>{text}</p>;
}
