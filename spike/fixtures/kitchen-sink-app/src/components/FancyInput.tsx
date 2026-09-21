import React from "react";

export interface FancyInputProps {
  placeholder: string;
}

// forwardRef-wrapped; see MemoBadge.tsx's comment for why the exported
// wrapper's `.displayName` is set explicitly rather than relying on the
// inner function expression's own (same-named, but esbuild-bundler-mangled
// to "FancyInput2" in practice) name.
export const FancyInput = React.forwardRef<HTMLInputElement, FancyInputProps>(
  function FancyInput({ placeholder }, ref) {
    return <input ref={ref} className="fancy-input" placeholder={placeholder} />;
  },
);
FancyInput.displayName = "FancyInput";
