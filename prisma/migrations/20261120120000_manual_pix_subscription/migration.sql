BEGIN;
CREATE TABLE "ManualPixPayment" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "confirmedById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "coverageStartsAt" TIMESTAMPTZ NOT NULL,
  "coverageEndsAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ManualPixPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManualPixPayment_amount_check" CHECK ("amountInCents" > 0),
  CONSTRAINT "ManualPixPayment_competence_check" CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "ManualPixPayment_coverage_check" CHECK ("coverageEndsAt" > "coverageStartsAt"),
  CONSTRAINT "ManualPixPayment_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ManualPixPayment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "GlobalAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManualPixPayment_barbershopId_competence_key" ON "ManualPixPayment"("barbershopId", "competence");
CREATE INDEX "ManualPixPayment_barbershopId_coverageEndsAt_idx" ON "ManualPixPayment"("barbershopId", "coverageEndsAt");
COMMIT;
