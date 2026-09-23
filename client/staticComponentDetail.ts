// Wire shape matches src/staticComponentDetail.ts's StaticComponentDetail
// field-for-field -- src/ and client/ independently shape the same wire
// message across the tsconfig boundary (no compiler link between them),
// same established convention as client/coverage.ts's
// StaticComponentSummary/staticAnalysis.ts's ComponentSummary.
export interface StaticComponentRef {
  id: string;
  displayName: string;
}

export interface StaticPropInfo {
  name: string;
  type: string;
  required: boolean;
  description: string | undefined;
}

export interface StaticComponentDetail {
  id: string;
  displayName: string;
  filePath: string;
  line: number;
  column: number;
  props: StaticPropInfo[];
  fanIn: number;
  fanOut: number;
  fanInOutlier: boolean;
  fanOutOutlier: boolean;
  unused: boolean;
  deadProps: string[];
  drilledProps: string[];
  renders: StaticComponentRef[];
  renderedBy: StaticComponentRef[];
  providesContext: string[];
  consumesContext: string[];
}
