import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type Stripe from "stripe";

export type Operation = {
  sessionId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  bookingId: string | null;
  status: "WAITING" | "LINKED" | "REVIEW";
  reviewReason: string | null;
  paymentStatus: string;
  amountTotal: number | null;
  currency: string | null;
  livemode: boolean;
};
type EventRow = { id: string; status: string; payload: Stripe.Event };

// Parameterized SQL keeps the additive inbox usable without editing generated
// client files. Generate the Prisma client during the eventual authorized rollout.
function transactionStore(tx: Prisma.TransactionClient) {
  return {
    async lockEvent(id: string) {
      const rows = await tx.$queryRaw<EventRow[]>`
        SELECT "id", "status", "payload" FROM "LegacyStripeEvent" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows[0]) throw new Error("Missing persisted event");
      return rows[0];
    },
    async lockOperations() {
      // ponytail: serialize this small legacy inbox only; per-operation locks if
      // volume warrants it. This does not lock public booking writers.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(182734, 1)::text`;
    },
    async getOperation(sessionId: string) {
      const rows = await tx.$queryRaw<Operation[]>`
        SELECT * FROM "LegacyStripeOperation" WHERE "sessionId" = ${sessionId}`;
      return rows[0];
    },
    async findFinancialOperation(paymentIntentId: string | null, chargeId: string | null) {
      const rows = await tx.$queryRaw<Operation[]>`
        SELECT * FROM "LegacyStripeOperation"
        WHERE (${paymentIntentId}::text IS NOT NULL AND "paymentIntentId" = ${paymentIntentId})
           OR (${chargeId}::text IS NOT NULL AND "chargeId" = ${chargeId}) LIMIT 1`;
      return rows[0];
    },
    findBookings(chargeId: string) {
      return tx.booking.findMany({ where: { stripeChargeId: chargeId }, take: 2 });
    },
    async saveOperation(op: Operation) {
      await tx.$executeRaw`
        INSERT INTO "LegacyStripeOperation"
          ("sessionId", "paymentIntentId", "chargeId", "bookingId", "status", "reviewReason", "paymentStatus", "amountTotal", "currency", "livemode")
        VALUES (${op.sessionId}, ${op.paymentIntentId}, ${op.chargeId}, ${op.bookingId}, ${op.status}, ${op.reviewReason}, ${op.paymentStatus}, ${op.amountTotal}, ${op.currency}, ${op.livemode})
        ON CONFLICT ("sessionId") DO UPDATE SET
          "paymentIntentId" = EXCLUDED."paymentIntentId", "chargeId" = EXCLUDED."chargeId",
          "bookingId" = EXCLUDED."bookingId", "status" = EXCLUDED."status",
          "reviewReason" = EXCLUDED."reviewReason", "paymentStatus" = EXCLUDED."paymentStatus",
          "amountTotal" = EXCLUDED."amountTotal", "currency" = EXCLUDED."currency", "updatedAt" = CURRENT_TIMESTAMP`;
    },
    async finish(eventId: string, attemptId: string, status: string, outcome = status, errorCode: string | null = null) {
      await tx.$executeRaw`UPDATE "LegacyStripeEvent" SET "status" = ${status} WHERE "id" = ${eventId}`;
      await tx.$executeRaw`UPDATE "LegacyStripeAttempt" SET "outcome" = ${outcome}, "errorCode" = ${errorCode}, "finishedAt" = CURRENT_TIMESTAMP WHERE "id" = ${attemptId}`;
    },
  };
}

export const legacyStripeStore = {
  async receive(event: Stripe.Event) {
    // Store the signed event before any Stripe lookup. Keep the first payload.
    await prisma.$executeRaw`
      INSERT INTO "LegacyStripeEvent" ("id", "type", "payload")
      VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT ("id") DO UPDATE SET "deliveries" = "LegacyStripeEvent"."deliveries" + 1, "lastReceivedAt" = CURRENT_TIMESTAMP`;
  },
  async read(eventId: string) {
    const rows = await prisma.$queryRaw<EventRow[]>`
      SELECT "id", "status", "payload" FROM "LegacyStripeEvent" WHERE "id" = ${eventId}`;
    if (!rows[0]) throw new Error("Missing persisted event");
    return rows[0];
  },
  async startAttempt(eventId: string) {
    const id = randomUUID();
    await prisma.$executeRaw`INSERT INTO "LegacyStripeAttempt" ("id", "eventId") VALUES (${id}, ${eventId})`;
    return id;
  },
  async fail(eventId: string, attemptId: string) {
    await prisma.$transaction(async (tx) => {
      const store = transactionStore(tx);
      const event = await store.lockEvent(eventId);
      // A slower failing request must not downgrade another request's success.
      const status = ["PROCESSED", "REVIEW", "IGNORED"].includes(event.status) ? event.status : "FAILED";
      await store.finish(eventId, attemptId, status, "FAILED");
      await tx.$executeRaw`UPDATE "LegacyStripeAttempt" SET "errorCode" = 'PROCESSING_FAILED' WHERE "id" = ${attemptId}`;
    });
  },
  transaction<T>(callback: (store: ReturnType<typeof transactionStore>) => Promise<T>) {
    return prisma.$transaction((tx) => callback(transactionStore(tx)), { timeout: 10_000 });
  },
};
