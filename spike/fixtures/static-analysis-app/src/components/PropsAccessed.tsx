import React from "react";

export interface PropsAccessedProps {
  visible: string;
  ghost: string;
}

// Props read via `props.x`, not destructured -- exercises the
// non-destructured identifier-parameter path of dead-prop detection.
export function PropsAccessed(props: PropsAccessedProps) {
  return <div>{props.visible}</div>;
}
