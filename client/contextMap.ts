import type { HooksNode } from "react-devtools-inline/frontend";

// Pure functions correlating useContext() consumers to the provider element
// they read from. No React, DOM, or bridge dependency -- everything here is
// plain data in, plain data out (see useContextMap.ts for the orchestration
// that gathers this data from the live Store/bridge).

// react-devtools-shared ElementType values for the fiber kinds that can have
// a useContext() entry in their `hooks` array. Mirrors storeBridge.ts's
// TYPE_LABEL. Class components use legacy this.context/contextType instead,
// which surfaces as InspectedElement.context, not a hooks entry -- out of
// scope for this task (see REARCHITECTURE-PLAN.md Phase 3d notes).
const FUNCTION_TYPE = 5;
const FORWARD_REF_TYPE = 6;
const MEMO_TYPE = 8;
export const CANDIDATE_CONSUMER_TYPES: ReadonlySet<number> = new Set([
  FUNCTION_TYPE,
  FORWARD_REF_TYPE,
  MEMO_TYPE,
]);

// A <Context.Provider> (or, in React 19, a bare <Context value={...}>) and a
// legacy <Context.Consumer> render-prop element both report ElementType
// Context (2) -- there's no separate enum value for the two -- and are
// distinguished only by this displayName suffix convention. Confirmed
// against the real installed react-devtools-inline@8.0.0 backend
// (getDisplayNameForFiber in node_modules/react-devtools-inline/dist/backend.js)
// and empirically against the sample app: `createContext("dark")` sets no
// .displayName, so ThemeContext's provider element reports displayName
// "Context.Provider", not "ThemeContext.Provider" -- see spike/run-phase3-
// contextmap.js and the Phase 3d report for the raw dump.
const CONTEXT_ELEMENT_TYPE = 2;
const PROVIDER_SUFFIX = ".Provider";

export interface ContextMapElement {
  id: number;
  parentID: number;
  displayName: string | null;
  type: number;
}

export interface ContextMapConsumer {
  id: number;
  name: string;
}

export interface ContextMapEntry {
  providerId: number;
  providerName: string; // base name, ".Provider" suffix stripped
  consumers: ContextMapConsumer[];
}

// Known, documented limitation (not solved here): two distinct Context
// objects that share the same displayName -- or both leave it unset, so both
// fall back to the generic "Context" -- are indistinguishable from Store
// data alone. The nearest-ancestor walk below will happily match a consumer
// to whichever same-named provider is closest, even if it isn't the same
// Context object the component actually imported.
export function buildContextMap(
  elements: ReadonlyMap<number, ContextMapElement>,
  hooksByElementId: ReadonlyMap<number, HooksNode[]>,
): ContextMapEntry[] {
  const entriesByProviderId = new Map<number, ContextMapEntry>();

  for (const [consumerId, hooks] of hooksByElementId) {
    const consumerElement = elements.get(consumerId);
    if (!consumerElement || !CANDIDATE_CONSUMER_TYPES.has(consumerElement.type)) {
      continue;
    }

    const hookNames = new Set(collectHookNames(hooks));
    for (const hookName of hookNames) {
      const providerId = findNearestProviderAncestor(
        elements,
        consumerElement.parentID,
        hookName,
      );
      if (providerId === null) {
        continue;
      }
      const provider = elements.get(providerId);
      if (!provider) {
        continue;
      }

      let entry = entriesByProviderId.get(providerId);
      if (!entry) {
        entry = {
          providerId,
          providerName: providerBaseName(provider.displayName) ?? hookName,
          consumers: [],
        };
        entriesByProviderId.set(providerId, entry);
      }
      if (!entry.consumers.some((c) => c.id === consumerId)) {
        entry.consumers.push({
          id: consumerId,
          name: consumerElement.displayName ?? `#${consumerId}`,
        });
      }
    }
  }

  const entries = Array.from(entriesByProviderId.values());
  for (const entry of entries) {
    entry.consumers.sort((a, b) => a.id - b.id);
  }
  entries.sort((a, b) => a.providerId - b.providerId);
  return entries;
}

// Walks up from a consumer's parent (not the consumer itself -- a component
// doesn't provide context to its own useContext call) looking for the
// nearest ancestor whose base name matches `hookName`. Nearest match wins,
// mirroring real React scoping: an inner provider of the same context shadows
// an outer one. A Consumer-suffixed ancestor is skipped over (it renders
// children via a render prop, it doesn't provide anything).
function findNearestProviderAncestor(
  elements: ReadonlyMap<number, ContextMapElement>,
  startParentId: number,
  hookName: string,
): number | null {
  let currentId = startParentId;
  // parentID === 0 marks a root element (nothing above it), per the Store's
  // own convention (see getRootIDForElement's doc comment in
  // react-devtools-inline.d.ts) -- 0 is never itself a real element id.
  while (currentId !== 0) {
    const ancestor = elements.get(currentId);
    if (!ancestor) {
      return null;
    }
    if (ancestor.type === CONTEXT_ELEMENT_TYPE) {
      const baseName = providerBaseName(ancestor.displayName);
      if (baseName !== null && baseName === hookName) {
        return ancestor.id;
      }
    }
    currentId = ancestor.parentID;
  }
  return null;
}

function providerBaseName(displayName: string | null): string | null {
  if (!displayName || !displayName.endsWith(PROVIDER_SUFFIX)) {
    return null;
  }
  return displayName.slice(0, -PROVIDER_SUFFIX.length);
}

// Only a genuine primitive-hook leaf is trusted as a context-consumption
// candidate. A custom hook wrapper node (e.g. useTheme()) gets its own
// synthesized name -- parsed from the function name -- and must not be
// mistaken for an actual useContext() call just because that name happens to
// match a provider's displayName (the false positive this guards against: an
// unrelated component calling useTheme() internally, elsewhere under the
// same ThemeContext provider as a real consumer). Confirmed against the real
// installed react-devtools-inline@8.0.0 backend's buildTree (node_modules/
// react-devtools-inline/dist/backend.js): every primitive hook (State,
// Effect, Context, ...) is built with a literal `subHooks: []`, and nothing
// ever pushes into a leaf's own subHooks array -- while a custom-hook
// wrapper frame is built with `subHooks: children`, the very array its
// wrapped hook(s) get pushed into, so a wrapper always ends up with
// subHooks.length >= 1. Layering on id === null additionally rules out every
// *stateful* primitive (State/Reducer/Ref/Effect/LayoutEffect/
// InsertionEffect/Memo/Callback/CacheRefresh/ImperativeHandle/
// SyncExternalStore/Transition/DeferredValue/Id/Optimistic/FormState/
// ActionState/EffectEvent all get a non-null nativeHookID++ in buildTree).
//
// Residual ambiguity: buildTree's returned hook object has no field naming
// which primitive produced it, so id === null plus no subHooks cannot
// distinguish a genuine useContext()/use(someContext) call from the only
// other id-null leaves buildTree can produce: Promise and Unresolved (from
// use(aPromise)) and HostTransitionStatus. All three hardcode
// `displayName: null` in their own dispatcher, so their `name` is always
// that literal primitive string, never developer-chosen -- a false match
// would need a Context whose OWN displayName is literally "Promise",
// "Unresolved", or "HostTransitionStatus", accepted here as a narrower,
// separate gap from the two-Contexts-sharing-a-displayName limitation
// documented on buildContextMap above. (DebugValue is also id-null but never
// reaches here: the backend's own processDebugValues() splices every
// DebugValue leaf out of the tree before it's sent.)
function isContextHookCandidate(hook: HooksNode): boolean {
  return hook.id === null && hook.subHooks.length === 0;
}

// A useContext() call nested inside a custom hook surfaces as a subHooks
// entry on the custom hook's own HooksNode rather than a top-level one, so
// this recurses into every hook's subHooks regardless of whether the hook
// itself qualifies as a candidate -- a wrapper's own name is never a
// candidate (see isContextHookCandidate), but a genuine useContext() nested
// inside it still must be found.
function collectHookNames(hooks: HooksNode[]): string[] {
  const names: string[] = [];
  for (const hook of hooks) {
    if (isContextHookCandidate(hook)) {
      names.push(hook.name);
    }
    if (hook.subHooks.length > 0) {
      names.push(...collectHookNames(hook.subHooks));
    }
  }
  return names;
}
