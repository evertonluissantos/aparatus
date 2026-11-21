-- PREPARED OFFLINE ONLY. Run docs/sql/etapa-18-diagnostics.sql first.
-- No inferred ownership, deletions, role changes or automatic conflict resolution.
BEGIN;
-- Prevent a concurrent membership write between diagnosis and index creation.
LOCK TABLE "BarbershopMembership" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "BarbershopMembership" WHERE "role" = 'OWNER'
    GROUP BY "userId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'OWNER conflicts exist; stop and review the diagnostic report. No membership was changed.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;
-- Deliberately includes inactive links: suspension does not free ownership.
CREATE UNIQUE INDEX "BarbershopMembership_one_owner_per_user_key"
  ON "BarbershopMembership" ("userId") WHERE "role" = 'OWNER';
COMMIT;
