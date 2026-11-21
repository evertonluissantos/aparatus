-- PREPARED OFFLINE ONLY. Additive fields; relax user nullability for guests.
-- No historical UPDATE, DELETE, inferred customers, publication or timestamps.
BEGIN;
ALTER TABLE "Barbershop"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "Barbershop_slug_check" CHECK (
    "slug" IS NULL OR (length("slug") BETWEEN 1 AND 80 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  ),
  ADD CONSTRAINT "Barbershop_publication_check" CHECK (NOT "published" OR "slug" IS NOT NULL);
CREATE UNIQUE INDEX "Barbershop_slug_key" ON "Barbershop" ("slug");

-- Previously services had no deactivation flag; true preserves that behaviour.
ALTER TABLE "BarbershopService" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Professional"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl" TEXT;

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phoneNormalized" TEXT,
  "notes" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Customer_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Customer_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 80),
  CONSTRAINT "Customer_phoneNormalized_check" CHECK ("phoneNormalized" IS NULL OR "phoneNormalized" ~ '^55[0-9]{10,11}$'),
  CONSTRAINT "Customer_notes_check" CHECK ("notes" IS NULL OR length("notes") <= 500)
);
CREATE UNIQUE INDEX "Customer_id_barbershopId_key" ON "Customer" ("id", "barbershopId");
-- NULL permits multiple customers without a phone/account; names never merge.
CREATE UNIQUE INDEX "Customer_barbershopId_phoneNormalized_key" ON "Customer" ("barbershopId", "phoneNormalized");
CREATE UNIQUE INDEX "Customer_barbershopId_userId_key" ON "Customer" ("barbershopId", "userId");

ALTER TABLE "Booking"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "customerNameSnapshot" TEXT,
  ADD COLUMN "serviceNameSnapshot" TEXT,
  ADD COLUMN "professionalNameSnapshot" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ,
  ADD COLUMN "completedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "Booking_customerId_barbershopId_fkey" FOREIGN KEY ("customerId", "barbershopId") REFERENCES "Customer" ("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Booking_customer_identity_check" CHECK ("userId" IS NOT NULL OR "customerId" IS NOT NULL),
  ADD CONSTRAINT "Booking_completedAt_check" CHECK ("completedAt" IS NULL OR ("status" IS NOT NULL AND "status" = 'COMPLETED' AND "endsAt" IS NOT NULL AND "completedAt" >= "endsAt"));
CREATE INDEX "Booking_barbershopId_customerId_date_idx" ON "Booking" ("barbershopId", "customerId", "date");

-- Keep existing user-bound commands unchanged. Guest support is schema-only:
-- a future server writer must bind the hash to a verified opaque guest context.
ALTER TABLE "BookingCommand"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "guestActorHash" TEXT,
  ADD CONSTRAINT "BookingCommand_actor_check" CHECK (
    ("userId" IS NOT NULL AND "guestActorHash" IS NULL)
    OR ("userId" IS NULL AND "guestActorHash" IS NOT NULL AND "guestActorHash" ~ '^[a-f0-9]{64}$')
  );
CREATE UNIQUE INDEX "BookingCommand_barbershopId_guestActorHash_requestKey_key"
  ON "BookingCommand" ("barbershopId", "guestActorHash", "requestKey");
-- Existing authenticated idempotency, FKs, core CHECK and GiST exclusion remain.
COMMIT;
