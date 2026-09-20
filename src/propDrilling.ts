import { Node, SyntaxKind } from "ts-morph";
import {
  isPascalCase,
  collectGenuineDestructuredReferenceNodes,
  collectGenuinePropertyAccessNodes,
  type ComponentAstHandle,
  type ComponentInfo,
  type StaticAnalysisResult,
} from "./staticAnalysis";

export interface PropDrillingChain {
  propName: string;
  // Ordered from where the prop is first received through every component
  // that merely forwards it, ending at whichever component the chain
  // resolved to -- the real consumer (see consumedBy) if one was found, or
  // the last component we could still trace to if it wasn't (see
  // computePropDrilling's "SPREAD-PROPS DECISION" comment for why a chain
  // can end unresolved).
  components: ComponentInfo[];
  consumedBy: ComponentInfo | undefined;
}

type Classification =
  | { kind: "dead" }
  | { kind: "consumes" }
  | { kind: "indeterminate" }
  | { kind: "forwards"; attributeName: string; targetHandle: ComponentAstHandle | undefined };

interface ForwardTarget {
  attributeName: string;
  targetHandle: ComponentAstHandle | undefined;
  dedupeKey: string;
}

// A prop drilled via `{...props}` (or a destructured `...rest`) leaves no
// name-level trace of where it goes -- we can't tell whether it reaches a
// child at all, let alone whether that child merely forwards it further.
// SPREAD-PROPS DECISION: treat this as "indeterminate" rather than guessing
// either "dead" (would under-report real drilling) or "forwards" (would
// risk inventing a chain to a target we can't actually verify). An
// indeterminate result can never be a chain root and immediately terminates
// a chain that forwards into it -- see the fixture's SpreadForwarder.
function bodyHasSpreadOf(body: Node, identifier: Node): boolean {
  if (!Node.isIdentifier(identifier)) return false;
  const symbol = identifier.getSymbol();
  if (!symbol) return false;
  return body.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute).some((spread) => {
    const expr = spread.getExpression();
    return Node.isIdentifier(expr) && expr.getSymbol() === symbol;
  });
}

// A reference "forwards" the prop only when it IS (not merely contains) the
// value of a JSX attribute on a PascalCase-tag element -- `{theme}` used as
// `<Child theme={theme}/>` forwards; `{theme}` used as `<div title={theme}/>`
// (a DOM element) or `` `${theme}-suffix` `` (transformed) both count as
// genuine consumption instead.
function tryClassifyAsForward(
  ref: Node,
  handleByDeclarationNode: Map<Node, ComponentAstHandle>,
): ForwardTarget | undefined {
  const jsxExpr = ref.getParent();
  if (!jsxExpr || !Node.isJsxExpression(jsxExpr) || jsxExpr.getExpression() !== ref) return undefined;

  const attribute = jsxExpr.getParent();
  if (!attribute || !Node.isJsxAttribute(attribute) || attribute.getInitializer() !== jsxExpr) return undefined;

  const element = attribute.getParent()?.getParent();
  if (!element || !(Node.isJsxOpeningElement(element) || Node.isJsxSelfClosingElement(element))) {
    return undefined;
  }

  const tagNameNode = element.getTagNameNode();
  if (!Node.isIdentifier(tagNameNode) || !isPascalCase(tagNameNode.getText())) return undefined;

  const attributeName = attribute.getNameNode().getText();
  // getDefinitionNodes() is ts-morph's "go to definition" -- it follows an
  // imported identifier all the way back to the originating declaration
  // (confirmed empirically: for `<ChipGroup/>` imported from another file it
  // returns the same FunctionDeclaration node discoverComponentsInFile
  // already keyed componentHandles by; for a `memo`/`forwardRef` export it
  // returns the same VariableDeclaration node), so a direct Map lookup by
  // node identity against componentHandles' own declarationNode works
  // without any bespoke alias-resolution here.
  const targetHandle = tagNameNode
    .getDefinitionNodes()
    .map((def) => handleByDeclarationNode.get(def))
    .find((handle): handle is ComponentAstHandle => handle !== undefined);

  return {
    attributeName,
    targetHandle,
    dedupeKey: `${attributeName}::${targetHandle?.info.id ?? "<unresolved>"}`,
  };
}

function classifyReferences(
  refs: Node[],
  handleByDeclarationNode: Map<Node, ComponentAstHandle>,
): Classification {
  if (refs.length === 0) return { kind: "dead" };

  const forwardTargets = new Map<string, ForwardTarget>();
  for (const ref of refs) {
    const forward = tryClassifyAsForward(ref, handleByDeclarationNode);
    // Even one reference that isn't a clean forward (reads the value,
    // branches on it, transforms it, hands it to a DOM element, ...) means
    // this component genuinely consumes the prop -- not just a conduit.
    if (!forward) return { kind: "consumes" };
    forwardTargets.set(forward.dedupeKey, forward);
  }

  // Every reference forwards, but not all to the same (attribute, target)
  // pair -- e.g. the same prop threaded to two different children under two
  // different names. There's no single next hop to follow, so this can't be
  // continued as one chain; conservative "indeterminate" rather than
  // arbitrarily picking one.
  if (forwardTargets.size !== 1) return { kind: "indeterminate" };

  const [forward] = forwardTargets.values();
  return { kind: "forwards", attributeName: forward.attributeName, targetHandle: forward.targetHandle };
}

function classifyPropUsage(
  handle: ComponentAstHandle,
  propName: string,
  handleByDeclarationNode: Map<Node, ComponentAstHandle>,
): Classification {
  const { fn, propsParam } = handle;
  const body = fn.getBody();
  if (!propsParam || !body) return { kind: "dead" };

  const nameNode = propsParam.getNameNode();

  if (Node.isObjectBindingPattern(nameNode)) {
    const elements = nameNode.getElements();
    const element = elements.find(
      (el) => (el.getPropertyNameNode()?.getText() ?? el.getName()) === propName,
    );
    if (!element) {
      const restNameNode = elements.find((el) => el.getDotDotDotToken() !== undefined)?.getNameNode();
      if (restNameNode && bodyHasSpreadOf(body, restNameNode)) return { kind: "indeterminate" };
      return { kind: "dead" };
    }

    const elementNameNode = element.getNameNode();
    // A nested pattern (`{ theme: { shade } }`) has no single identifier to
    // trace as a forward target; treat as genuine use, matching
    // computeDeadProps' own "can't inspect it, don't guess" choice.
    if (!Node.isIdentifier(elementNameNode)) return { kind: "consumes" };

    return classifyReferences(
      collectGenuineDestructuredReferenceNodes(elementNameNode, body),
      handleByDeclarationNode,
    );
  }

  if (Node.isIdentifier(nameNode)) {
    const accesses = collectGenuinePropertyAccessNodes(nameNode, body, propName);
    if (accesses.length === 0) {
      return bodyHasSpreadOf(body, nameNode) ? { kind: "indeterminate" } : { kind: "dead" };
    }
    return classifyReferences(accesses, handleByDeclarationNode);
  }

  return { kind: "dead" };
}

// THRESHOLD DECISION: one forwarding hop (a component receives a prop and
// passes it straight to a child that consumes it) is ordinary prop-passing,
// not drilling -- nearly every non-trivial component tree does this, and
// flagging it would be noise on every codebase. The plan frames drilling as
// a prop "threaded through N unused layers" (plural), so we require at
// least 2 components in a row whose ONLY use of the prop is forwarding it
// onward before reporting a chain.
const MIN_FORWARDING_LAYERS = 2;

export function computePropDrilling(result: StaticAnalysisResult): PropDrillingChain[] {
  const handleByDeclarationNode = new Map<Node, ComponentAstHandle>();
  for (const handle of result.componentHandles.values()) {
    handleByDeclarationNode.set(handle.declarationNode, handle);
  }

  const classificationCache = new Map<string, Classification>();
  const classify = (handle: ComponentAstHandle, propName: string): Classification => {
    const key = `${handle.info.id}::${propName}`;
    let cached = classificationCache.get(key);
    if (!cached) {
      cached = classifyPropUsage(handle, propName, handleByDeclarationNode);
      classificationCache.set(key, cached);
    }
    return cached;
  };

  const rootCandidates: Array<{ handle: ComponentAstHandle; propName: string }> = [];
  for (const handle of result.componentHandles.values()) {
    for (const prop of handle.info.props) {
      rootCandidates.push({ handle, propName: prop.name });
    }
  }

  // A component reached as the forwarding target of some OTHER component's
  // same-named prop is never itself a chain root -- otherwise every
  // interior link of a long chain would also surface as its own shorter,
  // redundant chain.
  const forwardTargetKeys = new Set<string>();
  for (const { handle, propName } of rootCandidates) {
    const classification = classify(handle, propName);
    if (classification.kind === "forwards" && classification.targetHandle) {
      forwardTargetKeys.add(`${classification.targetHandle.info.id}::${classification.attributeName}`);
    }
  }

  const chains: PropDrillingChain[] = [];
  for (const { handle, propName } of rootCandidates) {
    if (forwardTargetKeys.has(`${handle.info.id}::${propName}`)) continue;

    const rootClassification = classify(handle, propName);
    if (rootClassification.kind !== "forwards") continue;

    const forwardingLayers: ComponentInfo[] = [handle.info];
    let terminal: ComponentInfo | undefined;
    let consumedBy: ComponentInfo | undefined;
    let current = rootClassification;
    const visited = new Set<string>([handle.info.id]);

    for (;;) {
      if (current.kind !== "forwards" || !current.targetHandle) break;
      const targetHandle = current.targetHandle;
      if (visited.has(targetHandle.info.id)) break; // cycle guard; not expected in practice
      visited.add(targetHandle.info.id);

      const next = classify(targetHandle, current.attributeName);
      if (next.kind === "forwards") {
        forwardingLayers.push(targetHandle.info);
        current = next;
        continue;
      }

      terminal = targetHandle.info;
      if (next.kind === "consumes") consumedBy = targetHandle.info;
      break;
    }

    if (forwardingLayers.length >= MIN_FORWARDING_LAYERS) {
      chains.push({
        propName,
        components: terminal ? [...forwardingLayers, terminal] : forwardingLayers,
        consumedBy,
      });
    }
  }

  return chains;
}
