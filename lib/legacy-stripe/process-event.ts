import type Stripe from "stripe";
import { legacyStripeStore, type Operation } from "./store";

const supported = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const terminal = new Set(["PROCESSED", "REVIEW", "IGNORED"]);
type StripeReader = Pick<Stripe, "checkout">;

export async function receiveLegacyStripeEvent(event: Stripe.Event, stripe: StripeReader) {
  await legacyStripeStore.receive(event);
  return processPersistedLegacyStripeEvent(event.id, stripe);
}

// Internal only: no public replay endpoint. For a crash/FAILED, retry this using
// the persisted ID. retryReview must only be used after an authorized operational
// decision; this module is not a Server Action and has no public replay endpoint.
export async function processPersistedLegacyStripeEvent(
  eventId: string,
  stripe: StripeReader,
  options: { retryReview?: boolean } = {},
) {
  const store = legacyStripeStore;
  const isTerminal = (status: string) => terminal.has(status) && !(status === "REVIEW" && options.retryReview);
  const attemptId = await store.startAttempt(eventId);
  try {
    const persisted = await store.read(eventId);
    const event = persisted.payload;
    let session: Stripe.Checkout.Session | undefined;
    let lookupReason: string | null = null;
    if (!isTerminal(persisted.status) && supported.has(event.type) && !event.account) {
      const snapshot = event.data.object as Stripe.Checkout.Session;
      if (typeof snapshot.id !== "string" || !snapshot.id.startsWith("cs_")) {
        lookupReason = "INVALID_SESSION_ID";
      } else {
        try {
          // Current provider state, not delivery order, determines payment state.
          session = await stripe.checkout.sessions.retrieve(snapshot.id, { expand: ["payment_intent.latest_charge"] });
          if (session.id !== snapshot.id || session.livemode !== event.livemode) {
            throw new Error("Session identity mismatch");
          }
        } catch (error) {
          if ((error as { code?: string }).code === "resource_missing") {
            lookupReason = "UNKNOWN_SESSION";
          } else throw error;
        }
      }
    }

    return await store.transaction(async (tx) => {
      const current = await tx.lockEvent(eventId);
      if (isTerminal(current.status)) {
        await tx.finish(eventId, attemptId, current.status, "DUPLICATE");
        return current.status;
      }
      if (!supported.has(event.type)) {
        await tx.finish(eventId, attemptId, "IGNORED");
        return "IGNORED";
      }
      if (event.account || lookupReason || !session) {
        // The original signed financial snapshot is already durable in payload.
        await tx.finish(eventId, attemptId, "REVIEW", "REVIEW", event.account ? "UNSUPPORTED_ACCOUNT" : lookupReason ?? "MISSING_SESSION");
        return "REVIEW";
      }
      await tx.lockOperations();
      const previous = await tx.getOperation(session.id);
      if (previous?.status === "LINKED" || (previous?.status === "REVIEW" && !options.retryReview)) {
        await tx.finish(eventId, attemptId, previous.status === "LINKED" ? "PROCESSED" : "REVIEW");
        return previous.status === "LINKED" ? "PROCESSED" : "REVIEW";
      }
      const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
      const charge = intent?.latest_charge;
      const op: Operation = {
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : intent?.id ?? null,
        chargeId: typeof charge === "string" ? charge : charge?.id ?? null,
        bookingId: null,
        status: "WAITING",
        reviewReason: null,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        livemode: session.livemode,
      };
      const financialOperation = await tx.findFinancialOperation(op.paymentIntentId, op.chargeId);
      if (financialOperation && financialOperation.sessionId !== op.sessionId) {
        await tx.finish(eventId, attemptId, "REVIEW", "REVIEW", "FINANCIAL_REFERENCE_ALREADY_LINKED");
        return "REVIEW";
      }
      if (session.mode !== "payment") {
        op.status = "REVIEW";
        op.reviewReason = "NOT_LEGACY_SERVICE_PAYMENT";
      } else if (session.payment_status === "paid") {
        op.status = "REVIEW";
        op.reviewReason = "MISSING_PAYMENT_REFERENCE";
        if (op.chargeId && op.paymentIntentId) {
          const matches = await tx.findBookings(op.chargeId);
          if (matches.length === 1) {
            const booking = matches[0];
            const metadata = session.metadata;
            if (metadata?.serviceId === booking.serviceId && metadata?.barbershopId === booking.barbershopId && metadata?.userId === booking.userId && new Date(metadata?.date ?? "").getTime() === booking.date.getTime()) {
              op.bookingId = booking.id;
              op.status = "LINKED";
              op.reviewReason = null;
            } else op.reviewReason = "LEGACY_BOOKING_MISMATCH";
          } else if (matches.length > 1) {
            op.reviewReason = "MULTIPLE_LEGACY_BOOKINGS";
          } else {
            // Public writers have no interval constraint/professional/duration.
            // Do not improvise a second booking engine or force a paid slot.
            op.reviewReason = "BOOKING_CORE_UNAVAILABLE";
          }
        }
      }
      await tx.saveOperation(op);
      const status = op.status === "REVIEW" ? "REVIEW" : "PROCESSED";
      await tx.finish(eventId, attemptId, status, status, op.reviewReason);
      return status;
    });
  } catch (error) {
    await store.fail(eventId, attemptId);
    throw error;
  }
}
