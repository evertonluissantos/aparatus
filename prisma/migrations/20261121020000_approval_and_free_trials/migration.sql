BEGIN;
CREATE TYPE "BarbershopApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
-- Preserve the operating state of all existing establishments, without inferred ownership.
ALTER TABLE "Barbershop" ADD COLUMN "approvalStatus" "BarbershopApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Barbershop" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';
CREATE TABLE "BarbershopFreeTrial" (
  "id" TEXT PRIMARY KEY,
  "barbershopId" TEXT NOT NULL REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "grantedById" TEXT NOT NULL REFERENCES "GlobalAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "updatedById" TEXT NOT NULL REFERENCES "GlobalAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BarbershopFreeTrial_interval_check" CHECK ("endsAt">"startsAt")
);
CREATE INDEX "BarbershopFreeTrial_barbershopId_createdAt_idx" ON "BarbershopFreeTrial"("barbershopId","createdAt");
CREATE TABLE "BarbershopCommercialEvent" (
  "id" TEXT PRIMARY KEY,
  "barbershopId" TEXT NOT NULL REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "globalAdminId" TEXT NOT NULL REFERENCES "GlobalAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "action" TEXT NOT NULL CHECK ("action" IN ('APPROVE','REJECT','GRANT_TRIAL','UPDATE_TRIAL')),
  "details" JSONB NOT NULL CHECK (jsonb_typeof("details")='object'),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BarbershopCommercialEvent_barbershopId_createdAt_idx" ON "BarbershopCommercialEvent"("barbershopId","createdAt");
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cortz_app') THEN
    GRANT SELECT,INSERT,UPDATE ON "BarbershopFreeTrial" TO cortz_app;
    GRANT SELECT,INSERT ON "BarbershopCommercialEvent" TO cortz_app;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cortz_test_app') THEN
    GRANT SELECT,INSERT,UPDATE ON "BarbershopFreeTrial" TO cortz_test_app;
    GRANT SELECT,INSERT ON "BarbershopCommercialEvent" TO cortz_test_app;
  END IF;
END $$;
COMMIT;
