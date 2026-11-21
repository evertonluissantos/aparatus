-- Prepared only. See docs/persistencia-etapa-06a.md before any authorized rollout.
-- No historical backfill. The partial exclusion does NOT protect legacy writers.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD COLUMN "managedByCore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_core_complete_check" CHECK (
  NOT "managedByCore" OR (
    "professionalId" IS NOT NULL AND "endsAt" IS NOT NULL AND "status" IS NOT NULL
    AND "cancelled" IS NOT NULL
    AND (("status" = 'CANCELLED') = ("cancelled" IS TRUE))
    AND "priceInCentsSnapshot" IS NOT NULL AND "durationMinutesSnapshot" IS NOT NULL
    AND "timeZoneSnapshot" IS NOT NULL
    AND "endsAt" = "date" + "durationMinutesSnapshot" * INTERVAL '1 minute'
  )
);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_core_no_overlap" EXCLUDE USING gist (
  "barbershopId" WITH =,
  "professionalId" WITH =,
  tstzrange("date", "endsAt", '[)') WITH &&
) WHERE ("managedByCore" AND "cancelled" IS DISTINCT FROM true AND "status" IS DISTINCT FROM 'CANCELLED');

CREATE UNIQUE INDEX "Booking_id_barbershopId_key" ON "Booking"("id", "barbershopId");
CREATE TABLE "BookingCommand" (
  "id" TEXT PRIMARY KEY,
  "barbershopId" TEXT NOT NULL REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingCommand_bookingId_barbershopId_fkey" FOREIGN KEY ("bookingId", "barbershopId") REFERENCES "Booking"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookingCommand_bookingId_key" ON "BookingCommand"("bookingId");
CREATE UNIQUE INDEX "BookingCommand_bookingId_barbershopId_key" ON "BookingCommand"("bookingId", "barbershopId");
CREATE UNIQUE INDEX "BookingCommand_barbershopId_userId_requestKey_key" ON "BookingCommand"("barbershopId", "userId", "requestKey");
