import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = (name) => read(`prisma/migrations/${name}/migration.sql`);
const owner = migration("20261107160000_single_owner");
const expansion = migration("20261107170000_saas_persistence");
const schema = read("prisma/schema.prisma");

test("SaaS SQL: all earlier migrations retain their exact pre-stage contents", () => {
  const hashes = {
    "20260531182517_init":
      "28eaaff459727c4a10719289f9e1d6b88babcb77d6d4fd46ccd63878d43d32eb",
    "20261107120000_legacy_stripe_inbox":
      "4ea79ae986590391ec7e9f960f147f8fa0be5cd01991b80bdee5f05575f2a2bf",
    "20261107130000_booking_model_expansion":
      "1d7923275eb14d7190087df66988f5c53ebd0a87838598962e9ddf51bf1dd5a2",
    "20261107140000_tenant_authorization":
      "7ae839c5eef23e7037b2f6962c101abf4baf30e1d995e69b5338f1126d5253c5",
    "20261107150000_booking_transaction_guards":
      "2426524815063c26fb3da288901febed47ad9638eb599a3f46369dc7d891f739",
  };
  for (const [name, hash] of Object.entries(hashes)) {
    const bytes = readFileSync(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, name);
  }
});

test("SaaS SQL: ownership uniqueness includes inactive links and conflicts abort without remediation", () => {
  assert.match(
    owner,
    /ON "BarbershopMembership" \("userId"\) WHERE "role" = 'OWNER';/,
  );
  assert.match(owner, /GROUP BY "userId" HAVING count\(\*\) > 1/);
  assert.ok(
    owner.indexOf("RAISE EXCEPTION") < owner.indexOf("CREATE UNIQUE INDEX"),
  );
  assert.match(
    owner,
    /LOCK TABLE "BarbershopMembership" IN SHARE ROW EXCLUSIVE MODE/,
  );
  assert.equal(owner.includes('"active"'), false);
});

test("SaaS SQL: legacy identity, timestamps and core exclusion remain intact", () => {
  for (const sql of [owner, expansion]) {
    const statements = sql.replace(/--[^\n]*/g, "");
    assert.equal(
      /\b(?:UPDATE|DELETE|TRUNCATE)\s+"|\bDROP\s+(?:TABLE|CONSTRAINT|INDEX|COLUMN)\b|\bINSERT\s+INTO\b/i.test(
        statements,
      ),
      false,
    );
    assert.match(statements.trim(), /^BEGIN;[\s\S]*COMMIT;$/);
  }
  assert.match(expansion, /ALTER COLUMN "userId" DROP NOT NULL/);
  assert.equal(
    expansion.includes('DROP CONSTRAINT "Booking_userId_fkey"'),
    false,
  );
  assert.equal(
    expansion.includes('DROP CONSTRAINT "Booking_core_no_overlap"'),
    false,
  );
  assert.match(expansion, /ADD COLUMN "createdAt" TIMESTAMPTZ,/);
  assert.match(expansion, /ADD COLUMN "completedAt" TIMESTAMPTZ,/);
  assert.match(
    expansion,
    /CHECK \("userId" IS NOT NULL OR "customerId" IS NOT NULL\)/,
  );
  assert.match(
    schema,
    /user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Restrict\)/,
  );
});

test("SaaS SQL: customers are tenant-scoped with nullable unique phones and no fake accounts", () => {
  assert.match(
    expansion,
    /FOREIGN KEY \("customerId", "barbershopId"\) REFERENCES "Customer" \("id", "barbershopId"\)/,
  );
  assert.match(
    expansion,
    /ON "Customer" \("barbershopId", "phoneNormalized"\)/,
  );
  assert.match(
    expansion,
    /"phoneNormalized" IS NULL OR "phoneNormalized" ~ '\^55\[0-9\]\{10,11\}\$'/,
  );
  assert.match(schema, /model Customer \{[\s\S]*?userId\s+String\?/);
  assert.match(expansion, /"userId" IS NULL AND "guestActorHash" IS NOT NULL/);
  assert.match(
    expansion,
    /ON "BookingCommand" \("barbershopId", "guestActorHash", "requestKey"\)/,
  );
});

test("SaaS SQL: publication is opt-in and diagnostics contain only read operations", () => {
  assert.match(
    expansion,
    /ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false/,
  );
  assert.match(expansion, /CHECK \(NOT "published" OR "slug" IS NOT NULL\)/);
  assert.match(expansion, /CREATE UNIQUE INDEX "Barbershop_slug_key"/);
  const diagnostics = read("docs/sql/etapa-18-diagnostics.sql").replace(
    /--[^\n]*/g,
    "",
  );
  assert.match(diagnostics, /BEGIN TRANSACTION READ ONLY;/);
  assert.equal(
    /\b(?:UPDATE|DELETE|INSERT|CREATE|ALTER|DROP|TRUNCATE)\b/.test(diagnostics),
    false,
  );
});
