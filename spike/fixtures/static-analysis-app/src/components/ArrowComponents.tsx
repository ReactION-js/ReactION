import React from "react";

export interface ConciseArrowProps {
  value: string;
}

// Concise (no-brace) arrow body -- the function's body IS the JsxElement
// node itself, not a descendant of one (see containsJsx's comment in
// staticAnalysis.ts). This is the single most common React authoring
// pattern and was previously unexercised by any fixture component.
export const ConciseArrow = ({ value }: ConciseArrowProps) => <span>{value}</span>;

export interface BlockArrowProps {
  value: string;
  ghost: string;
  // Optional prop -- previously no fixture component had one, so
  // `required: false` / the checker's `sym.isOptional()` handling had zero
  // in-repo coverage.
  hint?: string;
}

// Block-body arrow with an explicit `return` -- the other common arrow
// shape, and its own dead-prop path (`ghost` is destructured but never
// read).
export const BlockArrow = ({ value, ghost, hint }: BlockArrowProps) => {
  return (
    <div title={hint}>
      {value}
    </div>
  );
};
