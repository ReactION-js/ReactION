/*
 * Regression test (permanent, checked-in, zero Chrome/network -- same
 * promotion pattern as storeGraphTransform.test.js/coverage.test.js/
 * selectByComponent.test.js/kitchenSink.test.js/contextMap.test.js):
 * esbuild-compiles the REAL client/elementInspection.ts and drives its
 * ElementInspector class directly against a fake bridge/store -- no React,
 * DOM, or real backend needed, per that module's own "protocol-only" doc
 * comment.
 *
 * Targets a specific code-review finding: handleResponse (the shared
 * response handler for the select/poll/expand path, as opposed to
 * inspectOnce's already-correct pendingOnce-map correlation in the same
 * file) used to correlate an incoming inspectedElement response ONLY by
 * response.id (the element id), never by response.responseID against a
 * specific outstanding requestID. Concrete trigger: the "Select in
 * ReactION" CodeLens handler (App.tsx) calls inspector.select(id)
 * unconditionally with no dedup against the element already being
 * selected, so firing it twice in quick succession for the SAME component
 * sends two full (forceFullData: true) requests with nothing cancelling
 * the first. If the first, slower request's response arrives AFTER the
 * second's, its stale data would silently overwrite the fresher data,
 * since both responses have the same `id`.
 *
 * A real backend, over a single relay connection, may in practice always
 * respond in the same order requests were sent -- which would make true
 * out-of-order arrival hard to trigger live. This test sidesteps that
 * entirely by talking to a fake bridge whose "network" is just a plain
 * function call: it can deliver responses in ANY order, including the
 * exact adversarial one (the newer request's response arriving first, the
 * stale one arriving after) that a live backend might never produce on its
 * own but which the fix must still handle correctly.
 *
 * Also covers the fix's second half: requestExpand's hydrated-path
 * responses and the top-level (select/poll) full-data/no-change/not-found/
 * error responses are tracked as SEPARATE "latest" slots (a single pointer
 * for top-level, one map entry per expanded path) specifically so that
 * polling and expanding -- legitimately concurrent, independent operations
 * -- can never invalidate each other's response, while same-path
 * re-expansion and same-selection re-fetching still get the staleness
 * guard.
 *
 * Run `npm run compile` first (not required for THIS file -- it esbuild-
 * compiles client/elementInspection.ts itself -- but kept for parity with
 * the other spike/*.test.js files' header comments).
 */
"use strict";

const path = require("path");
const assert = require("node:assert");
const { requireCompiled } = require("./testHarness");

const REPO_ROOT = path.join(__dirname, "..");

function makeElement(id, overrides = {}) {
  return {
    id,
    key: null,
    props: { data: {}, cleaned: [], unserializable: [] },
    state: null,
    context: null,
    hooks: null,
    owners: null,
    source: null,
    ...overrides,
  };
}

describe("ElementInspector request/response correlation (select/poll/expand path)", () => {
  let ElementInspector;
  let inspectorsToDispose;

  before(async () => {
    ({ ElementInspector } = await requireCompiled(
      path.join(REPO_ROOT, "client", "elementInspection.ts"),
    ));
  });

  beforeEach(() => {
    inspectorsToDispose = [];
  });

  // dispose() clears the polling setInterval -- without this, a leaked
  // 1s-cadence timer per test would keep firing (and keep the process
  // alive) long after mocha moves on, since this suite runs under a plain
  // `mocha` invocation with no --exit flag.
  afterEach(() => {
    for (const inspector of inspectorsToDispose) {
      inspector.dispose();
    }
  });

  // Fake bridge: `send` just records the payload (so tests can read the
  // requestID the real ElementInspector assigned), and `deliver` invokes
  // every registered listener synchronously -- i.e. a "wire" that the test
  // fully controls, so responses can be delivered in any order, including
  // orders a real backend would never actually produce. Mirrors the
  // listener-fan-out shape of run-phase3-inspect.js's simulateWebview.
  function setup(rendererIDsById) {
    const listeners = [];
    const sent = [];
    const bridge = {
      addListener(event, fn) {
        if (event === "inspectedElement") listeners.push(fn);
      },
      removeListener(event, fn) {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      },
      send(event, payload) {
        if (event === "inspectElement") sent.push(payload);
      },
    };
    const store = {
      getRendererIDForElement(id) {
        return Object.prototype.hasOwnProperty.call(rendererIDsById, id)
          ? rendererIDsById[id]
          : null;
      },
    };
    const states = [];
    const inspector = new ElementInspector(bridge, store, (state) => states.push(state));
    inspectorsToDispose.push(inspector);
    const deliver = (response) => listeners.slice().forEach((fn) => fn(response));
    return { inspector, sent, deliver, states };
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  it("applies a full-data response for the outstanding top-level request (baseline)", () => {
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    assert.strictEqual(sent.length, 1);
    const elementA = makeElement(1, { props: { data: { count: 1 }, cleaned: [], unserializable: [] } });
    deliver({ id: 1, responseID: sent[0].requestID, type: "full-data", value: elementA });

    const last = states[states.length - 1];
    assert.strictEqual(last.element, elementA);
    assert.strictEqual(last.loading, false);
  });

  it("discards a stale full-data response that arrives AFTER a newer request's response, even though both share the same element id", () => {
    // Simulates the exact CodeLens double-fire: select() called twice in a
    // row for the same still-selected id before either response lands.
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    inspector.select(1);
    assert.strictEqual(sent.length, 2, "each select() call sends its own full-data request");
    const [firstRequest, secondRequest] = sent;
    assert.notStrictEqual(firstRequest.requestID, secondRequest.requestID);

    const freshElement = makeElement(1, { props: { data: { count: 99 }, cleaned: [], unserializable: [] } });
    const staleElement = makeElement(1, { props: { data: { count: 1 }, cleaned: [], unserializable: [] } });

    // Adversarial order: the LATER request's response arrives FIRST (as if
    // the first request's dehydration was slower), then the stale first
    // request's response arrives SECOND.
    deliver({ id: 1, responseID: secondRequest.requestID, type: "full-data", value: freshElement });
    assert.strictEqual(states[states.length - 1].element, freshElement);

    deliver({ id: 1, responseID: firstRequest.requestID, type: "full-data", value: staleElement });
    assert.strictEqual(
      states[states.length - 1].element,
      freshElement,
      "the stale first request's late-arriving response must not clobber the fresher data",
    );
  });

  it("discards a stale not-found response from a superseded top-level request instead of wrongly deselecting", () => {
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    inspector.select(1);
    const [firstRequest, secondRequest] = sent;

    // The stale first request reports not-found (e.g. the element briefly
    // looked unmounted to it) -- must not deselect, since a newer request
    // for the same id is already in flight/answered.
    deliver({ id: 1, responseID: firstRequest.requestID, type: "not-found" });
    assert.strictEqual(
      states[states.length - 1].elementId,
      1,
      "a stale not-found must not deselect while a newer request is current",
    );

    const freshElement = makeElement(1, { props: { data: {}, cleaned: [], unserializable: [] } });
    deliver({ id: 1, responseID: secondRequest.requestID, type: "full-data", value: freshElement });
    assert.strictEqual(states[states.length - 1].element, freshElement);
  });

  it("a poll response still applies even though a LATER expand request now exists (poll is not invalidated by a concurrent expand)", async function () {
    this.timeout(5000);
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    const initialElement = makeElement(1, {
      props: { data: { user: { name: "a" } }, cleaned: [], unserializable: [] },
    });
    deliver({ id: 1, responseID: sent[0].requestID, type: "full-data", value: initialElement });

    // Let the real ~1s poll tick fire so a second top-level request exists.
    await delay(1100);
    assert.strictEqual(sent.length, 2, "the poll tick should have sent its own request by now");
    const pollRequest = sent[1];

    // Now an expand is requested AFTER the poll's request was sent, but
    // BEFORE the poll's response has arrived.
    inspector.requestExpand("props", ["user"]);
    assert.strictEqual(sent.length, 3);
    const expandRequest = sent[2];
    assert.notStrictEqual(expandRequest.requestID, pollRequest.requestID);

    // Deliver the POLL's response now. A naive implementation using a
    // single shared "latest requestID" across both top-level and expand
    // requests would wrongly discard this (expandRequest.requestID is
    // numerically newer) -- it must still apply, since nothing has
    // superseded the poll itself.
    const polledElement = makeElement(1, {
      props: { data: { user: { name: "b" } }, cleaned: [], unserializable: [] },
    });
    deliver({ id: 1, responseID: pollRequest.requestID, type: "full-data", value: polledElement });
    assert.strictEqual(
      states[states.length - 1].element,
      polledElement,
      "the poll's own response must be applied even though a newer (expand) requestID now exists",
    );

    // And the expand's own response, delivered after, must also still
    // apply on top of it.
    deliver({
      id: 1,
      responseID: expandRequest.requestID,
      type: "hydrated-path",
      path: ["props", "user"],
      value: { data: { name: "hydrated" }, cleaned: [], unserializable: [] },
    });
    const finalElement = states[states.length - 1].element;
    assert.deepStrictEqual(finalElement.props.data.user, { name: "hydrated" });
  });

  it("an expand response still applies even though a LATER poll request now exists (expand is not invalidated by a concurrent poll)", async function () {
    this.timeout(5000);
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    const initialElement = makeElement(1, {
      props: { data: { user: { name: "a" } }, cleaned: [], unserializable: [] },
    });
    deliver({ id: 1, responseID: sent[0].requestID, type: "full-data", value: initialElement });

    // Expand BEFORE the poll tick fires this time.
    inspector.requestExpand("props", ["user"]);
    assert.strictEqual(sent.length, 2);
    const expandRequest = sent[1];

    await delay(1100);
    assert.strictEqual(sent.length, 3, "the poll tick should have fired by now, after the expand request");
    const pollRequest = sent[2];
    assert.notStrictEqual(pollRequest.requestID, expandRequest.requestID);

    // Deliver the EXPAND's response now that a numerically-newer poll
    // request exists. A naive single shared "latest requestID" would
    // wrongly discard this, since pollRequest.requestID > expandRequest.requestID.
    deliver({
      id: 1,
      responseID: expandRequest.requestID,
      type: "hydrated-path",
      path: ["props", "user"],
      value: { data: { name: "hydrated" }, cleaned: [], unserializable: [] },
    });
    assert.deepStrictEqual(
      states[states.length - 1].element.props.data.user,
      { name: "hydrated" },
      "the expand's own response must be applied even though a newer (poll) requestID now exists",
    );

    const polledElement = makeElement(1, {
      props: { data: { user: { name: "b" } }, cleaned: [], unserializable: [] },
    });
    deliver({ id: 1, responseID: pollRequest.requestID, type: "full-data", value: polledElement });
    assert.strictEqual(states[states.length - 1].element, polledElement);
  });

  it("discards a stale hydrated-path response when the SAME path is re-expanded before the first reply lands", () => {
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    const initialElement = makeElement(1, {
      props: { data: { items: [1, 2, 3] }, cleaned: [], unserializable: [] },
    });
    deliver({ id: 1, responseID: sent[0].requestID, type: "full-data", value: initialElement });

    inspector.requestExpand("props", ["items"]);
    inspector.requestExpand("props", ["items"]); // e.g. a rapid double-toggle of the same row
    assert.strictEqual(sent.length, 3);
    const [staleExpand, freshExpand] = [sent[1], sent[2]];

    // Fresh (second) request's response arrives first...
    deliver({
      id: 1,
      responseID: freshExpand.requestID,
      type: "hydrated-path",
      path: ["props", "items"],
      value: { data: ["fresh"], cleaned: [], unserializable: [] },
    });
    assert.deepStrictEqual(states[states.length - 1].element.props.data.items, ["fresh"]);

    // ...then the stale (first) request's response arrives late, with
    // different data. It must be discarded.
    deliver({
      id: 1,
      responseID: staleExpand.requestID,
      type: "hydrated-path",
      path: ["props", "items"],
      value: { data: ["stale"], cleaned: [], unserializable: [] },
    });
    assert.deepStrictEqual(
      states[states.length - 1].element.props.data.items,
      ["fresh"],
      "the stale re-expansion of the same path must not overwrite the fresher one",
    );
  });

  it("still applies both responses when two DIFFERENT paths are expanded concurrently (no cross-path invalidation)", () => {
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    const initialElement = makeElement(1, {
      props: {
        data: { user: { name: "a" }, items: [1, 2, 3] },
        cleaned: [],
        unserializable: [],
      },
    });
    deliver({ id: 1, responseID: sent[0].requestID, type: "full-data", value: initialElement });

    inspector.requestExpand("props", ["user"]);
    inspector.requestExpand("props", ["items"]);
    assert.strictEqual(sent.length, 3);
    const [userRequest, itemsRequest] = [sent[1], sent[2]];

    // Deliver out of send-order too, for good measure -- order must not matter.
    deliver({
      id: 1,
      responseID: itemsRequest.requestID,
      type: "hydrated-path",
      path: ["props", "items"],
      value: { data: ["x", "y"], cleaned: [], unserializable: [] },
    });
    deliver({
      id: 1,
      responseID: userRequest.requestID,
      type: "hydrated-path",
      path: ["props", "user"],
      value: { data: { name: "hydrated" }, cleaned: [], unserializable: [] },
    });

    const finalData = states[states.length - 1].element.props.data;
    assert.deepStrictEqual(finalData.user, { name: "hydrated" });
    assert.deepStrictEqual(finalData.items, ["x", "y"]);
  });

  it("a response for a since-deselected element is still ignored (pre-existing id guard, unaffected by requestID tracking)", () => {
    const { inspector, sent, deliver, states } = setup({ 1: 100 });
    inspector.select(1);
    const requestID = sent[0].requestID;
    inspector.deselect();
    const stateBeforeStaleResponse = states[states.length - 1];

    deliver({ id: 1, responseID: requestID, type: "full-data", value: makeElement(1) });
    assert.strictEqual(
      states[states.length - 1],
      stateBeforeStaleResponse,
      "a response for a no-longer-selected element must not produce a new state",
    );
  });
});
