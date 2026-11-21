-- READ-ONLY statements for a FUTURE specifically authorized connection.
-- Requires tenant_authorization already present. Contains identifiers, not secrets.
-- Results may contain administrative identifiers: keep them out of public logs.
BEGIN TRANSACTION READ ONLY;

-- Includes inactive memberships: all conflicts must be explicitly reviewed.
SELECT "userId", count(*) AS "ownerLinks",
       array_agg("id" ORDER BY "id") AS "membershipIds",
       array_agg("barbershopId" ORDER BY "id") AS "barbershopIds"
FROM "BarbershopMembership" WHERE "role" = 'OWNER'
GROUP BY "userId" HAVING count(*) > 1;

-- Detail only conflicting users, without exposing account emails or passwords.
SELECT m."id", m."userId", m."barbershopId", m."active", m."createdAt"
FROM "BarbershopMembership" m
WHERE m."role" = 'OWNER' AND m."userId" IN (
  SELECT "userId" FROM "BarbershopMembership" WHERE "role" = 'OWNER'
  GROUP BY "userId" HAVING count(*) > 1
)
ORDER BY m."userId", m."createdAt", m."id";

-- Inverse multiplicity is informational: one owner per SHOP is not imposed.
SELECT "barbershopId", count(*) AS "ownerLinks"
FROM "BarbershopMembership" WHERE "role" = 'OWNER'
GROUP BY "barbershopId" HAVING count(*) > 1;

-- Unknown historical data must not be guessed to enable public availability.
SELECT "id", "timeZone" FROM "Barbershop" WHERE "timeZone" IS NULL;
SELECT "id", "barbershopId", "durationMinutes"
FROM "BarbershopService" WHERE "durationMinutes" IS NULL;
SELECT "id", "barbershopId", "professionalId", "date", "endsAt", "status"
FROM "Booking"
WHERE "professionalId" IS NULL OR "endsAt" IS NULL OR "status" IS NULL;
COMMIT;
