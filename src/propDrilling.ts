import { Node } from "ts-morph";
import {
  isPascalCase,
  bodyHasSpreadOf,
  collectGenuineDestructuredReferenceNodes,
  collectGenuinePropertyAccessNodes,
  type ComponentAstHandle,
  type ComponentInfo,
  type StaticAnalysisResult,
} from "./staticAnalysis";

// How a chain's last confirmed-forwarding layer actually resolves. Three
// genuinely different situations, kept distinct rather than folded into a
// single "consumedBy: ComponentInfo | undefined" -- a future task (fan-in/
// out metrics, runtime fusion, bidirectional source<->instance) needs to
// tell "we know it dead-ends here" apart from "it keeps going, we just can't
// see into it":
//   - "consumed": a known component genuinely uses the prop for something
//     other than forwarding it. `component` is that consumer.
//   - "unresolved-target": the last forwarding layer passes the prop to a
//     JSX tag ts-morph can't resolve to any component this analysis
//     discovered -- most commonly a third-party/library component (a class
//     component is the other common case; buildComponentHandle only
//     understands function/arrow components). The prop demonstrably keeps
//     flowing onward into something real; we just can't verify what it does
//     there. `tagName` is the JSX tag's own text (e.g. "Button").
//   - "unknown": the last forwarding layer forwards into a KNOWN component
//     whose own use of the prop we can't pin down (the spread-props case --
//     see computePropDrilling's "SPREAD-PROPS DECISION" comment) or that
//     doesn't pick the prop up under this name at all. Genuinely "never
//     consumed, and we know exactly where the trail goes cold." `component`
//     is that known dead-end.
export type PropDrillingTerminal =
  | { kind: "consumed"; component: ComponentInfo }
  | { kind: "unresolved-target"; tagName: string }
  | { kind: "unknown"; component: ComponentInfo };

export interface PropDrillingChain {
  propName: string;
  // Every component confirmed to ONLY forward the prop, in order from where
  // it's first received. Never includes the terminal's own component (or
  // tag) -- that always lives in `terminal` instead, uniformly across all
  // three kinds.
  components: ComponentInfo[];
  terminal: PropDrillingTerminal;
}

type Classification =
  | { kind: "dead" }
  | { kind: "consumes" }
  | { kind: "indeterminate" }
  | { kind: "forwards"; attributeName: string; targetTagName: string; targetHandle: ComponentAstHandle | undefined };

interface ForwardTarget {
  attributeName: string;
  targetTagName: string;
  targetHandle: ComponentAstHandle | undefined;
  dedupeKey: string;
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
  const targetTagName = tagNameNode.getText();
  // getDefinitionNodes() is ts-morph's "go to definition" -- it follows an
  // imported identifier all the way back to the originating declaration
  // (confirmed empirically: for `<ChipGroup/>` imported from another file it
  // returns the same FunctionDeclaration node discoverComponentsInFile
  // already keyed componentHandles by; for a `memo`/`forwardRef` export it
  // returns the same VariableDeclaration node), so a direct Map lookup by
  // node identity against componentHandles' own declarationNode works
  // without any bespoke alias-resolution here. It resolves just as well for
  // a class component or a third-party import -- those just aren't in
  // handleByDeclarationNode (buildComponentHandle only ever produces a
  // handle for a function/arrow component), so targetHandle comes back
  // undefined and the caller reports "unresolved-target" using
  // targetTagName instead of silently losing the distinction.
  const targetHandle = tagNameNode
    .getDefinitionNodes()
    .map((def) => handleByDeclarationNode.get(def))
    .find((handle): handle is ComponentAstHandle => handle !== undefined);

  return {
    attributeName,
    targetTagName,
    targetHandle,
    dedupeKey: `${attributeName}::${targetHandle?.info.id ?? `<unresolved:${targetTagName}>`}`,
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
  return {
    kind: "forwards",
    attributeName: forward.attributeName,
    targetTagName: forward.targetTagName,
    targetHandle: forward.targetHandle,
  };
}

// SPREAD-PROPS DECISION: when a prop has no other trace (no destructured
// element with a genuine reference, no direct property access below),
// bodyHasSpreadOf (staticAnalysis.ts, shared with computeDeadProps) checks
// whether it's still reachable via a `{...props}`/`{...rest}` spread. Treat
// that as "indeterminate" rather than guessing either "dead" (would
// under-report real drilling) or "forwards" (would risk inventing a chain to
// a target we can't actually verify). An indeterminate result can never be a
// chain root and immediately terminates a chain that forwards into it -- see
// the fixture's SpreadForwarder.
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
    let terminal: PropDrillingTerminal | undefined;
    let current = rootClassification;
    const visited = new Set<string>([handle.info.id]);

    for (;;) {
      if (!current.targetHandle) {
        // The last confirmed forwarder passes the prop to a JSX tag that
        // doesn't resolve to any component this analysis discovered -- see
        // PropDrillingTerminal's "unresolved-target" doc comment for why
        // this must NOT be folded into "unknown"/never-consumed.
        terminal = { kind: "unresolved-target", tagName: current.targetTagName };
        break;
      }
      const targetHandle = current.targetHandle;
      if (visited.has(targetHandle.info.id)) {
        // Cycle guard; not expected for a real component tree. Report it as
        // "unknown" rather than silently dropping the chain -- we DO know a
        // real, known component is where the walk had to stop.
        terminal = { kind: "unknown", component: targetHandle.info };
        break;
      }
      visited.add(targetHandle.info.id);

      const next = classify(targetHandle, current.attributeName);
      if (next.kind === "forwards") {
        forwardingLayers.push(targetHandle.info);
        current = next;
        continue;
      }

      terminal =
        next.kind === "consumes"
          ? { kind: "consumed", component: targetHandle.info }
          : { kind: "unknown", component: targetHandle.info };
      break;
    }

    if (forwardingLayers.length >= MIN_FORWARDING_LAYERS && terminal) {
      chains.push({ propName, components: forwardingLayers, terminal });
    }
  }

  return chains;
}
