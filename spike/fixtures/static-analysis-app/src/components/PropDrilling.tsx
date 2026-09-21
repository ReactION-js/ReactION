import React from "react";

// ---- Genuine 2+ layer drilling chain: ThemeGrandparent -> ThemeParent ->
// ThemeLeaf, where only ThemeLeaf actually reads `theme` for anything other
// than forwarding it. ----
export interface ThemeProps {
  theme: string;
}

export function ThemeLeaf({ theme }: ThemeProps) {
  return <div className={theme}>leaf</div>;
}

export function ThemeParent({ theme }: ThemeProps) {
  return <ThemeLeaf theme={theme} />;
}

export function ThemeGrandparent({ theme }: ThemeProps) {
  return <ThemeParent theme={theme} />;
}

// ---- A single forwarding hop -- ordinary prop-passing, NOT drilling.
// LabelParent's only use of `label` is forwarding it to LabelLeaf, but
// that's just one layer, below computePropDrilling's 2-layer threshold. ----
export interface LabelProps {
  label: string;
}

export function LabelLeaf({ label }: LabelProps) {
  return <span>{label}</span>;
}

export function LabelParent({ label }: LabelProps) {
  return <LabelLeaf label={label} />;
}

// ---- Base case: a component that genuinely uses its own prop (not a
// forwarder at all, so it can never be part of a chain). ----
export interface ValueProps {
  value: string;
}

export function DirectConsumer({ value }: ValueProps) {
  return <p>{value.toUpperCase()}</p>;
}

// ---- A component that both forwards AND consumes the same prop -- a real
// consumer, not a pure forwarder, so it must break/terminate a chain rather
// than extend it. ----
export interface CountProps {
  count: number;
}

export function CountLeaf({ count }: CountProps) {
  return <span>{count}</span>;
}

// Renders `count` itself as JSX text AND forwards it to CountLeaf. Because
// one of its two references to `count` is a genuine (non-forwarding) use,
// the WHOLE component must classify as "consumes" -- not "forwards" -- even
// though a forwarding reference is also present. See this fixture's
// regression guard in staticAnalysis.test.ts: classifying on "at least one
// forwarding reference" instead of "every reference forwards" would
// incorrectly let the chain continue past CountMixed to CountLeaf.
export function CountMixed({ count }: CountProps) {
  return (
    <div>
      <span>{count}</span>
      <CountLeaf count={count} />
    </div>
  );
}

export function CountParent({ count }: CountProps) {
  return <CountMixed count={count} />;
}

export function CountGrandparent({ count }: CountProps) {
  return <CountParent count={count} />;
}

// ---- `{...props}` spread: SpreadForwarder never names `theme` anywhere in
// its own body, so there's no name-level evidence of where (or whether) it
// goes. computePropDrilling treats this as "indeterminate" -- the chain
// leading INTO SpreadForwarder is still reported (it has 2 confirmed
// forwarding layers ahead of it), but it must stop AT SpreadForwarder with
// no consumer identified, rather than guessing that it keeps flowing to
// SpreadLeaf (which does genuinely use `theme`). ----
export interface SpreadProps {
  theme: string;
}

export function SpreadLeaf({ theme }: SpreadProps) {
  return <div className={theme}>spread leaf</div>;
}

export function SpreadForwarder(props: SpreadProps) {
  return <SpreadLeaf {...props} />;
}

export function SpreadGrandparent({ theme }: SpreadProps) {
  return <SpreadForwarder theme={theme} />;
}

export function SpreadGreatGrandparent({ theme }: SpreadProps) {
  return <SpreadGrandparent theme={theme} />;
}

// ---- Forwarding into a target ts-morph can't resolve to any component this
// analysis discovered. ExternalWidget is a CLASS component -- a real,
// exported, PascalCase, JSX-taggable component, but buildComponentHandle
// only ever produces a handle for a function/arrow component
// (resolveComponentFunction returns undefined for a ClassDeclaration), so
// it's invisible to componentHandles. This stands in for the most common
// real-world case of the same gap: a third-party/library component (a UI
// kit's <Button>, say) that this source-only analysis has no way to see
// into. The prop demonstrably keeps flowing into something real here --
// LibParent's only use of `theme` IS forwarding it onward -- so the chain
// must be reported as "forwarded to <ExternalWidget> (outside this
// analysis)", not misreported as a dead-end "never consumed" (which would
// wrongly suggest the prop's thread just stops, rather than continuing on
// into code this analysis can't follow). ----
export class ExternalWidget extends React.Component<ThemeProps> {
  render() {
    return <div className={this.props.theme}>external</div>;
  }
}

export function LibParent({ theme }: ThemeProps) {
  return <ExternalWidget theme={theme} />;
}

export function LibGrandparent({ theme }: ThemeProps) {
  return <LibParent theme={theme} />;
}
