import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { publicBarbershopWhere } from "../lib/public-barbershop";

test("MVP public readers require publication and an active owner", () => {
  assert.deepEqual(publicBarbershopWhere(true), {
    published: true,
    suspended: false,
    memberships: { some: { role: "OWNER", active: true } },
  });
  assert.deepEqual(publicBarbershopWhere(false), {});
});

test("legacy public readers apply the shared predicate", () => {
  for (const path of [
    "app/barbershops/[id]/page.tsx",
    "app/barbershops/page.tsx",
    "app/api/chat/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    const reads = source.match(/prisma\.barbershop\.find(?:Unique|Many)\(/g) ?? [];
    assert.equal(
      source.match(/publicBarbershopWhere\(OWNER_AUTH_ENABLED\)/g)?.length,
      reads.length,
      path,
    );
  }
});

test("public catalog, availability and transactional booking require an owner", () => {
  for (const path of ["lib/mvp-bookings.ts", "lib/bookings/postgres.ts"]) {
    const source = readFileSync(path, "utf8");
    for (const line of source.split("\n").filter((s) => s.includes('"published"=true'))) {
      assert.match(line, /EXISTS \(SELECT 1 FROM "BarbershopMembership"/);
      assert.match(line, /owner\."barbershopId"="Barbershop"\."id"/);
      assert.match(line, /owner\."role"='OWNER' AND owner\."active"=true/);
    }
  }
});

test("legacy availability stops before reading sessions or bookings in MVP mode", () => {
  const source = readFileSync("app/_actions/get-date-available-time-slots.ts", "utf8");
  assert.ok(source.indexOf('throw new Error("LEGACY_AVAILABILITY_DISABLED")') < source.indexOf("await auth.api.getSession"));
});
