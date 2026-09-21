import React from "react";

// Deliberately shared by two components below so a naive reference search on
// the shorthand-destructured `theme` binding (see staticAnalysis.ts's
// deadProps two-filter comment) has a real chance to leak across components
// and across the JSX attribute usages that pass `theme=` to each of them.
export interface ThemedProps {
  theme: string;
  label: string;
}

function ThemedButtonInner({ theme, label }: ThemedProps) {
  return <button className={theme}>{label}</button>;
}

// memo-wrapped via a reference to a separately-declared function, the common
// `export default memo(RealComponent)` shape.
export const ThemedButton = React.memo(ThemedButtonInner);

const ThemedCard = React.forwardRef<HTMLDivElement, ThemedProps>(
  function ThemedCardInner({ theme, label }: ThemedProps, ref) {
    // `theme` is destructured but never read in this body -- genuinely dead,
    // even though the identically-named prop is used one function up.
    return (
      <div ref={ref}>
        <span>{label}</span>
      </div>
    );
  },
);

export { ThemedCard };
