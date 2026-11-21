-- Additive expansion only. No grants, backfill or inferred ownership.
CREATE TYPE "BarbershopRole" AS ENUM ('OWNER', 'MANAGER', 'BARBER');

CREATE TABLE "BarbershopMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "role" "BarbershopRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BarbershopMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BarbershopMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BarbershopMembership_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BarbershopMembership_userId_barbershopId_key" ON "BarbershopMembership"("userId", "barbershopId");
CREATE INDEX "BarbershopMembership_barbershopId_active_role_idx" ON "BarbershopMembership"("barbershopId", "active", "role");

CREATE TABLE "GlobalAdmin" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlobalAdmin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GlobalAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GlobalAdmin_userId_key" ON "GlobalAdmin"("userId");
