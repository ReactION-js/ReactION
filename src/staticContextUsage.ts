import { Node, SyntaxKind } from "ts-morph";
import type { StaticAnalysisResult } from "./staticAnalysis";

export interface ComponentContextUsage {
  // Context expressions this component renders `<X.Provider>` for, e.g.
  // "ThemeContext" -- it's establishing a value other components below it
  // in the live tree can consume.
  provides: string[];
  // Context expressions this component reads via `useContext(X)`.
  consumes: string[];
}

// Purely syntactic detection over each component's own JSX/hook calls --
// same caveat class as this file's neighbors (staticComponentGraph.ts's
// "renders" edges): a context object passed through several layers of
// indirection before reaching `.Provider`/`useContext`, or one aliased
// under a different local name, won't be recognized. `.getText()` on the
// context expression is used as-is (not resolved to a declaration) since a
// Context object isn't itself one of the components this analysis tracks --
// there's nothing to resolve it TO, just a name worth showing.
export function computeContextUsageById(
  result: StaticAnalysisResult,
): Map<string, ComponentContextUsage> {
  const usageById = new Map<string, ComponentContextUsage>();

  for (const handle of result.componentHandles.values()) {
    const provides = new Set<string>();
    const consumes = new Set<string>();

    const tags = [
      ...handle.fn.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...handle.fn.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const tag of tags) {
      const tagNameNode = tag.getTagNameNode();
      if (Node.isPropertyAccessExpression(tagNameNode) && tagNameNode.getName() === "Provider") {
        provides.add(tagNameNode.getExpression().getText());
      }
    }

    for (const call of handle.fn.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (Node.isIdentifier(expression) && expression.getText() === "useContext") {
        const [contextArg] = call.getArguments();
        if (contextArg) {
          consumes.add(contextArg.getText());
        }
      }
    }

    if (provides.size > 0 || consumes.size > 0) {
      usageById.set(handle.info.id, { provides: [...provides], consumes: [...consumes] });
    }
  }

  return usageById;
}
