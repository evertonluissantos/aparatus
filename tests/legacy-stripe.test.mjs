import test from "node:test";
import assert from "node:assert/strict";
import { dependencies, loadProduction } from "./load-production.mjs";

const processor = "lib/legacy-stripe/process-event.ts";
const route = "app/api/stripe/webhook/route.ts";
const metadata = { serviceId: "service-a", barbershopId: "shop-a", userId: "customer-a", date: "2099-11-07T10:00:00Z" };
const booking = { id: "booking-a", ...metadata, date: new Date(metadata.date), stripeChargeId: "ch_mock" };
const session = () => ({ id: "cs_mock", mode: "payment", payment_status: "paid", livemode: false, amount_total: 6000, currency: "brl", metadata: { ...metadata }, payment_intent: { id: "pi_mock", latest_charge: { id: "ch_mock" } } });
const event = (id = "evt_mock", type = "checkout.session.completed") => ({ id, type, livemode: false, data: { object: session() } });

// This mock models transaction rollback/serialization, NOT PostgreSQL guarantees.
function fixture({ bookings = [booking] } = {}) {
  let state = { events: new Map(), attempts: new Map(), operations: new Map() };
  let queue = Promise.resolve();
  let attemptNumber = 0;
  const failures = { receive: false, lookup: false, transaction: false, finish: false, afterCommit: false };
  let currentSession = session();
  let lookupError;
  let lookups = 0;
  const store = {
    async receive(input) {
      if (failures.receive) throw new Error("mock receipt failure");
      const previous = state.events.get(input.id);
      if (previous) previous.deliveries++;
      else state.events.set(input.id, { id: input.id, status: "RECEIVED", payload: structuredClone(input), deliveries: 1 });
    },
    async read(id) { return state.events.get(id); },
    async startAttempt(eventId) {
      const id = `attempt-${++attemptNumber}`;
      state.attempts.set(id, { eventId, outcome: "STARTED" });
      return id;
    },
    async fail(id, attemptId) {
      const row = state.events.get(id);
      if (!["PROCESSED", "REVIEW", "IGNORED"].includes(row.status)) row.status = "FAILED";
      state.attempts.set(attemptId, { eventId: id, outcome: "FAILED", errorCode: "PROCESSING_FAILED" });
    },
    transaction(callback) {
      const result = queue.then(async () => {
        if (failures.transaction) throw new Error("mock transaction failure");
        const draft = structuredClone(state);
        const value = await callback({
          lockEvent: async (id) => draft.events.get(id),
          lockOperations: async () => {},
          getOperation: async (id) => draft.operations.get(id),
          findFinancialOperation: async (intent, charge) => [...draft.operations.values()].find((op) => (intent && op.paymentIntentId === intent) || (charge && op.chargeId === charge)),
          findBookings: async (charge) => bookings.filter((row) => row.stripeChargeId === charge).slice(0, 2),
          saveOperation: async (op) => { draft.operations.set(op.sessionId, structuredClone(op)); },
          finish: async (id, attemptId, status, outcome = status, errorCode = null) => {
            if (failures.finish) throw new Error("mock failure after operation write");
            draft.events.get(id).status = status;
            draft.attempts.set(attemptId, { eventId: id, outcome, errorCode });
          },
        });
        state = draft;
        if (failures.afterCommit) { failures.afterCommit = false; throw new Error("mock response lost after commit"); }
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const stripe = { checkout: { sessions: { retrieve: async () => {
    lookups++;
    if (failures.lookup) throw new Error("mock provider unavailable");
    if (lookupError) throw lookupError;
    return structuredClone(currentSession);
  } } } };
  const api = loadProduction(processor, { "./store": { legacyStripeStore: store } });
  return {
    ...api, store, stripe, failures,
    get state() { return state; },
    get lookups() { return lookups; },
    setSession(value) { currentSession = value; },
    setLookupError(value) { lookupError = value; },
    receive: (input = event()) => api.receiveLegacyStripeEvent(input, stripe),
    replay: (id = "evt_mock", options) => api.processPersistedLegacyStripeEvent(id, stripe, options),
  };
}

test("legacy: one event links an existing booking without modifying it", async () => {
  const f = fixture();
  assert.equal(await f.receive(), "PROCESSED");
  assert.equal(f.state.operations.get("cs_mock").bookingId, booking.id);
  assert.equal(f.state.operations.get("cs_mock").amountTotal, 6000);
  assert.equal(f.state.events.get("evt_mock").status, "PROCESSED");
});

test("legacy regression: duplicate event has one operation and two recorded attempts", async () => {
  const f = fixture();
  await f.receive(); await f.receive();
  assert.equal(f.state.operations.size, 1);
  assert.equal(f.state.events.get("evt_mock").deliveries, 2);
  assert.deepEqual([...f.state.attempts.values()].map((row) => row.outcome), ["PROCESSED", "DUPLICATE"]);
  assert.equal(f.lookups, 1);
});

test("legacy: different events for one session share one operation", async () => {
  const f = fixture();
  await f.receive(); await f.receive(event("evt_other"));
  assert.equal(f.state.operations.size, 1);
  assert.equal(f.state.events.size, 2);
});

test("legacy: failure before receipt persistence does not contact provider", async () => {
  const f = fixture(); f.failures.receive = true;
  await assert.rejects(f.receive(), /receipt failure/);
  assert.equal(f.state.events.size, 0);
  assert.equal(f.lookups, 0);
});

test("legacy: provider failure preserves event and retry processes persisted payload", async () => {
  const f = fixture(); f.failures.lookup = true;
  await assert.rejects(f.receive(), /provider unavailable/);
  assert.equal(f.state.events.get("evt_mock").status, "FAILED");
  f.failures.lookup = false;
  assert.equal(await f.replay(), "PROCESSED");
  assert.equal(f.state.operations.size, 1);
  assert.equal(f.state.attempts.size, 2);
});

test("legacy: failure after operation write rolls back and remains recoverable", async () => {
  const f = fixture(); f.failures.finish = true;
  await assert.rejects(f.receive(), /after operation write/);
  assert.equal(f.state.operations.size, 0);
  assert.equal(f.state.events.get("evt_mock").status, "FAILED");
  f.failures.finish = false;
  await f.replay();
  assert.equal(f.state.operations.size, 1);
});

test("legacy: lost response after commit does not downgrade success or repeat effects", async () => {
  const f = fixture(); f.failures.afterCommit = true;
  await assert.rejects(f.receive(), /response lost/);
  assert.equal(f.state.events.get("evt_mock").status, "PROCESSED");
  await f.receive();
  assert.equal(f.state.operations.size, 1);
});

test("legacy: out-of-order expired event uses current paid session; cannot downgrade linked payment", async () => {
  const f = fixture();
  await f.receive(event("evt_expired", "checkout.session.expired"));
  f.setSession({ ...session(), payment_status: "unpaid" });
  await f.receive(event("evt_completed"));
  assert.equal(f.state.operations.get("cs_mock").paymentStatus, "paid");
  assert.equal(f.state.operations.get("cs_mock").status, "LINKED");
});

test("legacy: unpaid session can advance on a later paid event", async () => {
  const f = fixture(); f.setSession({ ...session(), payment_status: "unpaid", payment_intent: null });
  await f.receive(event("evt_waiting"));
  assert.equal(f.state.operations.get("cs_mock").status, "WAITING");
  f.setSession(session()); await f.receive(event("evt_paid", "checkout.session.async_payment_succeeded"));
  assert.equal(f.state.operations.get("cs_mock").status, "LINKED");
});

test("legacy: unknown session is durable REVIEW with a reason, not a lost event", async () => {
  const f = fixture(); f.setLookupError({ code: "resource_missing" });
  assert.equal(await f.receive(), "REVIEW");
  assert.equal([...f.state.attempts.values()][0].errorCode, "UNKNOWN_SESSION");
  assert.equal(f.state.events.get("evt_mock").payload.data.object.amount_total, 6000);
});

test("legacy: malformed session identity is recorded without provider lookup", async () => {
  const f = fixture(); const input = event(); delete input.data.object.id;
  assert.equal(await f.receive(input), "REVIEW");
  assert.equal(f.lookups, 0);
  assert.equal([...f.state.attempts.values()][0].errorCode, "INVALID_SESSION_ID");
});

test("legacy: REVIEW is not retried automatically; explicit internal replay keeps history", async () => {
  const f = fixture(); f.setLookupError({ code: "resource_missing" });
  await f.receive();
  f.setLookupError(undefined);
  assert.equal(await f.replay(), "REVIEW");
  assert.equal(f.lookups, 1);
  assert.equal(await f.replay("evt_mock", { retryReview: true }), "PROCESSED");
  assert.equal(f.state.attempts.size, 3);
  assert.equal([...f.state.attempts.values()][0].errorCode, "UNKNOWN_SESSION");
  assert.equal(f.state.operations.size, 1);
});

test("legacy: session mode mismatch is retryable and cannot persist financial association", async () => {
  const f = fixture(); f.setSession({ ...session(), livemode: true });
  await assert.rejects(f.receive(), /identity mismatch/);
  assert.equal(f.state.operations.size, 0);
  assert.equal(f.state.events.get("evt_mock").status, "FAILED");
});

test("legacy: incomplete metadata must not associate another booking", async () => {
  const f = fixture(); f.setSession({ ...session(), metadata: {} });
  assert.equal(await f.receive(), "REVIEW");
  assert.equal(f.state.operations.get("cs_mock").reviewReason, "LEGACY_BOOKING_MISMATCH");
  assert.equal(f.state.operations.get("cs_mock").bookingId, null);
});

test("legacy: payment without booking preserves money facts and blocks unsafe auto-creation", async () => {
  const f = fixture({ bookings: [] });
  assert.equal(await f.receive(), "REVIEW");
  const op = f.state.operations.get("cs_mock");
  assert.equal(op.reviewReason, "BOOKING_CORE_UNAVAILABLE");
  assert.equal(op.paymentStatus, "paid"); assert.equal(op.amountTotal, 6000);
  assert.equal(op.bookingId, null);
});

test("legacy: multiple preexisting bookings with one charge require review, not deletion", async () => {
  const f = fixture({ bookings: [booking, { ...booking, id: "old-duplicate" }] });
  await f.receive();
  assert.equal(f.state.operations.get("cs_mock").reviewReason, "MULTIPLE_LEGACY_BOOKINGS");
});

test("legacy: simulated concurrent deliveries have one operation", async () => {
  const f = fixture();
  await Promise.all([f.receive(), f.receive(), f.receive(event("evt_other"))]);
  assert.equal(f.state.operations.size, 1);
  assert.equal(f.state.attempts.size, 3);
});

test("legacy: different sessions cannot reuse one financial reference", async () => {
  const f = fixture(); await f.receive();
  const second = { ...session(), id: "cs_other" };
  f.setSession(second); const input = event("evt_other"); input.data.object = second;
  assert.equal(await f.receive(input), "REVIEW");
  assert.equal(f.state.operations.size, 1);
  assert.equal([...f.state.attempts.values()].at(-1).errorCode, "FINANCIAL_REFERENCE_ALREADY_LINKED");
});

test("legacy: unsupported event is persisted and ignored without provider access", async () => {
  const f = fixture();
  assert.equal(await f.receive(event("evt_other", "customer.subscription.created")), "IGNORED");
  assert.equal(f.lookups, 0); assert.equal(f.state.operations.size, 0);
});

test("legacy: subscription checkout never creates or links service booking", async () => {
  const f = fixture(); f.setSession({ ...session(), mode: "subscription" });
  assert.equal(await f.receive(), "REVIEW");
  assert.equal(f.state.operations.get("cs_mock").reviewReason, "NOT_LEGACY_SERVICE_PAYMENT");
});

test("webhook: invalid signature does not persist or process", async () => {
  class Stripe { webhooks = { constructEvent: () => { throw new Error("mock signature failure"); } }; }
  const { POST } = loadProduction(route, dependencies({}, "customer-a", Stripe));
  assert.equal((await POST({ headers: { get: () => "bad" }, text: async () => "body" })).status, 400);
});

test("webhook: persistence failure returns retryable 503 without error details", async () => {
  class Stripe { webhooks = { constructEvent: () => event() }; }
  const mocks = dependencies({}, "customer-a", Stripe);
  const { POST } = loadProduction(route, mocks);
  const response = await POST({ headers: { get: () => "mock" }, text: async () => "body" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "Processing pending");
});

test("store: receipt is parameterized, retains first payload, and has durable conflict handling", async () => {
  const calls = [];
  const prisma = { $executeRaw: async (parts, ...values) => { calls.push({ sql: parts.join("?"), values }); } };
  const { legacyStripeStore } = loadProduction("lib/legacy-stripe/store.ts", {
    "@/lib/prisma": { prisma }, "node:crypto": { randomUUID: () => "mock-attempt" },
  });
  await legacyStripeStore.receive(event());
  assert.match(calls[0].sql, /ON CONFLICT \("id"\) DO UPDATE SET "deliveries"/);
  assert.equal(calls[0].values[0], "evt_mock");
  assert.equal(calls[0].sql.includes("evt_mock"), false);
  assert.equal(calls[0].sql.split("DO UPDATE")[1].includes('"payload" ='), false);
});
