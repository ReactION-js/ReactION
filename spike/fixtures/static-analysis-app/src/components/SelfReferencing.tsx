import React from "react";

// Chip and ChipGroup deliberately share ChipProps (not two separately-shaped
// interfaces) -- the shorthand-destructuring symbol-merge trap this file
// regression-guards against needs the SAME interface on both sides (verified
// empirically; see ChipGroup's own comment below).
export interface ChipProps {
  theme: string;
  label: string;
}

function Chip({ theme, label }: ChipProps) {
  return <span className={theme}>{label}</span>;
}

// `theme` is destructured but its VALUE is never read anywhere in this body
// -- genuinely dead. The JSX below passes a LITERAL "fixed" to Chip's own
// `theme` prop, never referencing ChipGroup's `theme` variable at all.
//
// This is the case Themed.tsx's ThemedButton/ThemedCard pair does NOT
// actually cover (that pair's only same-named `theme` JSX usage lives in a
// DIFFERENT file, App.tsx, so the plain same-file check alone already
// excludes it -- confirmed by review, filter #2 was never exercised there).
// Here, because ChipProps is shared structurally by both Chip and
// ChipGroup, the shorthand-destructured `theme` binding's reference search
// also returns the `theme="fixed"` JsxAttribute's NAME node below --
// verified empirically to live in THIS component's own file AND own body
// range, so the plain same-file/body-range check can't exclude it. Only
// excluding the JsxAttribute name node itself (dead-prop detection's
// "filter #2") correctly leaves `theme` with zero genuine references.
export function ChipGroup({ theme, label }: ChipProps) {
  return <Chip theme="fixed" label={label} />;
}
