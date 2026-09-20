// A props type declared in a different file than the component that uses
// it -- exercises the checker-based property extraction path with no local
// interface declaration to fall back on syntactically.
export interface ExternalProps {
  known: string;
  ghost: string;
}
