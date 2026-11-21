-- Expansion only: prepared offline, NOT applied. No historical backfill.
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "ScheduleBlockKind" AS ENUM ('BREAK', 'ABSENCE', 'EXTRAORDINARY');

ALTER TABLE "Barbershop" ADD COLUMN "timeZone" TEXT;
ALTER TABLE "BarbershopService" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "BarbershopService" ADD CONSTRAINT "BarbershopService_durationMinutes_check"
  CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0);
CREATE UNIQUE INDEX "BarbershopService_id_barbershopId_key" ON "BarbershopService"("id", "barbershopId");

CREATE TABLE "Professional" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Professional_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Professional_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Professional_id_barbershopId_key" ON "Professional"("id", "barbershopId");
CREATE INDEX "Professional_barbershopId_active_idx" ON "Professional"("barbershopId", "active");

CREATE TABLE "ProfessionalService" (
  "barbershopId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("barbershopId", "professionalId", "serviceId"),
  CONSTRAINT "ProfessionalService_professionalId_barbershopId_fkey" FOREIGN KEY ("professionalId", "barbershopId") REFERENCES "Professional"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProfessionalService_serviceId_barbershopId_fkey" FOREIGN KEY ("serviceId", "barbershopId") REFERENCES "BarbershopService"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProfessionalService_serviceId_barbershopId_idx" ON "ProfessionalService"("serviceId", "barbershopId");

CREATE TABLE "WorkingHours" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "professionalId" TEXT,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkingHours_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkingHours_professionalId_barbershopId_fkey" FOREIGN KEY ("professionalId", "barbershopId") REFERENCES "Professional"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkingHours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "WorkingHours_minutes_check" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
);
CREATE INDEX "WorkingHours_barbershopId_professionalId_weekday_idx" ON "WorkingHours"("barbershopId", "professionalId", "weekday");

CREATE TABLE "ScheduleBlock" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "professionalId" TEXT,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "kind" "ScheduleBlockKind" NOT NULL,
  "reason" TEXT,
  CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleBlock_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScheduleBlock_professionalId_barbershopId_fkey" FOREIGN KEY ("professionalId", "barbershopId") REFERENCES "Professional"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScheduleBlock_interval_check" CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "ScheduleBlock_barbershopId_professionalId_startsAt_idx" ON "ScheduleBlock"("barbershopId", "professionalId", "startsAt");

ALTER TABLE "Booking"
  ADD COLUMN "professionalId" TEXT,
  ADD COLUMN "endsAt" TIMESTAMPTZ,
  ADD COLUMN "status" "BookingStatus",
  ADD COLUMN "priceInCentsSnapshot" INTEGER,
  ADD COLUMN "durationMinutesSnapshot" INTEGER,
  ADD COLUMN "timeZoneSnapshot" TEXT,
  ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_professionalId_barbershopId_fkey" FOREIGN KEY ("professionalId", "barbershopId") REFERENCES "Professional"("id", "barbershopId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Booking_endsAt_check" CHECK ("endsAt" IS NULL OR "endsAt" > "date"),
  ADD CONSTRAINT "Booking_priceInCentsSnapshot_check" CHECK ("priceInCentsSnapshot" IS NULL OR "priceInCentsSnapshot" >= 0),
  ADD CONSTRAINT "Booking_durationMinutesSnapshot_check" CHECK ("durationMinutesSnapshot" IS NULL OR "durationMinutesSnapshot" > 0);
CREATE INDEX "Booking_barbershopId_professionalId_date_idx" ON "Booking"("barbershopId", "professionalId", "date");
CREATE INDEX "Booking_barbershopId_date_idx" ON "Booking"("barbershopId", "date");
CREATE INDEX "Booking_userId_date_idx" ON "Booking"("userId", "date");

-- Future, separate stages: verified backfill; writers using explicit statuses,
-- tenant authorization; and only then exclusion constraints for [date, endsAt).
-- No UPDATE, DELETE, fictitious professionals, interval exclusions or defaults
-- for unknown historical facts are part of this expansion.
