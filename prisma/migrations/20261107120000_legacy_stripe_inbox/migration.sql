-- Additive only. Prepared offline; do not apply without an authorized rollout.
CREATE TABLE "LegacyStripeEvent" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "deliveries" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReceivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyStripeEvent_status_check" CHECK ("status" IN ('RECEIVED','PROCESSED','REVIEW','FAILED','IGNORED')),
    CONSTRAINT "LegacyStripeEvent_deliveries_check" CHECK ("deliveries" > 0)
);
CREATE INDEX "LegacyStripeEvent_status_receivedAt_idx" ON "LegacyStripeEvent"("status", "receivedAt");

CREATE TABLE "LegacyStripeAttempt" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL REFERENCES "LegacyStripeEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    "outcome" TEXT NOT NULL DEFAULT 'STARTED',
    "errorCode" TEXT,
    CONSTRAINT "LegacyStripeAttempt_outcome_check" CHECK ("outcome" IN ('STARTED','PROCESSED','REVIEW','FAILED','IGNORED','DUPLICATE'))
);
CREATE INDEX "LegacyStripeAttempt_eventId_startedAt_idx" ON "LegacyStripeAttempt"("eventId", "startedAt");

CREATE TABLE "LegacyStripeOperation" (
    "sessionId" TEXT PRIMARY KEY,
    "paymentIntentId" TEXT,
    "chargeId" TEXT,
    "bookingId" TEXT REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "status" TEXT NOT NULL,
    "reviewReason" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "amountTotal" INTEGER,
    "currency" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegacyStripeOperation_status_check" CHECK ("status" IN ('WAITING','LINKED','REVIEW')),
    CONSTRAINT "LegacyStripeOperation_amount_check" CHECK ("amountTotal" IS NULL OR "amountTotal" >= 0),
    CONSTRAINT "LegacyStripeOperation_link_check" CHECK ("status" <> 'LINKED' OR "bookingId" IS NOT NULL)
);
CREATE UNIQUE INDEX "LegacyStripeOperation_paymentIntentId_key" ON "LegacyStripeOperation"("paymentIntentId");
CREATE UNIQUE INDEX "LegacyStripeOperation_chargeId_key" ON "LegacyStripeOperation"("chargeId");
CREATE INDEX "LegacyStripeOperation_status_updatedAt_idx" ON "LegacyStripeOperation"("status", "updatedAt");
CREATE INDEX "LegacyStripeOperation_bookingId_idx" ON "LegacyStripeOperation"("bookingId");
