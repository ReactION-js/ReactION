import React from "react";

export interface NeverImportedProps {
  label: string;
}

// Genuinely unused: not imported anywhere in the fixture, and this file is
// never the target of a dynamic import either.
export function NeverImported({ label }: NeverImportedProps) {
  return <div>{label}</div>;
}
