import React from "react";

export interface DeadPropProps {
  used: string;
  // Never destructured at all -- the simple case of a dead prop.
  unused: string;
}

export function DeadProp({ used }: DeadPropProps) {
  return <div>{used}</div>;
}

// ---- `{ label, ...rest }`: `theme` is never individually destructured, but
// is still forwarded wholesale via `{...rest}` onto RestSpreadLeaf, which
// genuinely reads it. Regression fixture for findDeadProps' object-binding-
// pattern branch: before it checked for a `...rest` spread, `theme` was
// pushed straight to `dead` the moment no individually-destructured element
// named it. ----
export interface RestSpreadProps {
  label: string;
  theme: string;
}

export function RestSpreadLeaf({ theme }: { theme: string }) {
  return <div className={theme}>rest spread leaf</div>;
}

export function RestSpreadForwarder({ label, ...rest }: RestSpreadProps) {
  return (
    <div>
      {label}
      <RestSpreadLeaf {...rest} />
    </div>
  );
}
