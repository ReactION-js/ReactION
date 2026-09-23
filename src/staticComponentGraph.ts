import { Node, SyntaxKind } from "ts-morph";
import type { ComponentAstHandle, StaticAnalysisResult } from "./staticAnalysis";

// Resolves a JSX tag's identifier to whichever known component it refers
// to, following import aliasing through to the real declaration first (an
// import binding's own declaration is the import specifier, not the
// component itself -- `symbol.getAliasedSymbol()` is what actually follows
// through to where `export const Foo = ...` / `export default function
// Foo() {}` lives, including through a re-export barrel file, since
// TypeScript's own alias resolution is already transitive).
function resolveJsxTagComponentId(
  tagNameNode: Node,
  componentIdByDeclarationStart: Map<string, string>,
): string | undefined {
  if (!Node.isIdentifier(tagNameNode)) {
    return undefined; // e.g. `<motion.div>` (PropertyAccessExpression) -- not a plain reference to one of our components
  }
  if (/^[a-z]/.test(tagNameNode.getText())) {
    return undefined; // lowercase JSX tag -> a host element (div, span, ...), never a component
  }
  let symbol = tagNameNode.getSymbol();
  if (!symbol) {
    return undefined;
  }
  if (symbol.isAlias()) {
    symbol = symbol.getAliasedSymbol() ?? symbol;
  }
  for (const decl of symbol.getDeclarations()) {
    const key = `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`;
    const id = componentIdByDeclarationStart.get(key);
    if (id) {
      return id;
    }
  }
  return undefined;
}

// Every OTHER known component a component's JSX body directly renders as a
// child element -- the "renders" edge the static composition tree/detail
// panel are built from. Approximate by nature, same caveat class as this
// file's neighbors (coverage.ts's displayName-collision note,
// dependencyMetrics.ts's file-level granularity): a purely static read of
// the source can't know which branch of a conditional actually renders, how
// many instances a `.map()` produces, or resolve a component chosen
// dynamically at runtime (a registry lookup, a component passed in as a
// prop) -- those edges are invisible here.
function findRenderedChildIds(
  handle: ComponentAstHandle,
  componentIdByDeclarationStart: Map<string, string>,
): Set<string> {
  const rendered = new Set<string>();
  const tags = [
    ...handle.fn.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...handle.fn.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
  for (const tag of tags) {
    const id = resolveJsxTagComponentId(tag.getTagNameNode(), componentIdByDeclarationStart);
    if (id) {
      rendered.add(id);
    }
  }
  return rendered;
}

export interface StaticRenderEdges {
  // component id -> ids of every OTHER known component it directly renders.
  childIdsById: Map<string, Set<string>>;
  // component id -> ids of every OTHER known component that directly
  // renders it -- the reverse of childIdsById, computed alongside it so
  // callers needing "who renders me" (staticComponentDetail.ts) don't each
  // re-walk every component's JSX body themselves.
  parentIdsById: Map<string, Set<string>>;
}

// Computes the full "renders" edge set across every component this analysis
// found, in both directions. Shared by staticComponentTree.ts (which turns
// childIdsById into a tree, rooted at whatever parentIdsById says has no
// parent) and staticComponentDetail.ts (which surfaces both directions
// directly, by name, in the per-component sidebar).
export function computeStaticRenderEdges(result: StaticAnalysisResult): StaticRenderEdges {
  const componentIdByDeclarationStart = new Map<string, string>();
  for (const handle of result.componentHandles.values()) {
    const decl = handle.declarationNode;
    componentIdByDeclarationStart.set(
      `${decl.getSourceFile().getFilePath()}:${decl.getStart()}`,
      handle.info.id,
    );
  }

  const childIdsById = new Map<string, Set<string>>();
  const parentIdsById = new Map<string, Set<string>>();
  for (const handle of result.componentHandles.values()) {
    const childIds = findRenderedChildIds(handle, componentIdByDeclarationStart);
    childIdsById.set(handle.info.id, childIds);
    for (const childId of childIds) {
      let parents = parentIdsById.get(childId);
      if (!parents) {
        parents = new Set<string>();
        parentIdsById.set(childId, parents);
      }
      parents.add(handle.info.id);
    }
  }

  return { childIdsById, parentIdsById };
}
