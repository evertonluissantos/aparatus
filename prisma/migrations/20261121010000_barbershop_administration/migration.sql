BEGIN;
ALTER TABLE "Barbershop" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "BarbershopAdministrationChange" (
  "id" TEXT PRIMARY KEY,
  "barbershopId" TEXT NOT NULL REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "globalAdminId" TEXT NOT NULL REFERENCES "GlobalAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "previousSuspended" BOOLEAN NOT NULL,
  "suspended" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BarbershopAdministrationChange_transition_check" CHECK ("previousSuspended" <> "suspended")
);
CREATE INDEX "BarbershopAdministrationChange_barbershopId_createdAt_idx"
  ON "BarbershopAdministrationChange"("barbershopId", "createdAt");
-- No role creation or administrative grants. Audit records are append-only for the app.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cortz_app') THEN
    GRANT SELECT, INSERT ON "BarbershopAdministrationChange" TO cortz_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cortz_test_app') THEN
    GRANT SELECT, INSERT ON "BarbershopAdministrationChange" TO cortz_test_app;
  END IF;
END $$;
COMMIT;
