import React from "react";

export interface DeadPropProps {
  used: string;
  // Never destructured at all -- the simple case of a dead prop.
  unused: string;
}

export function DeadProp({ used }: DeadPropProps) {
  return <div>{used}</div>;
}
