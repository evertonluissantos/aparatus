import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadProduction } from "./load-production.mjs";

const shop = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture({ authorized = true, active = true, failAudit = false } = {}) {
  const states = new Map([
    [shop, false],
    ["other-shop", false],
  ]);
  const audit = [],
    calls = [];
  const sql = {
    $queryRaw: async (parts, ...values) => {
      const text = parts.join("?");
      calls.push({ text, values });
      if (text.includes('FROM "GlobalAdmin"'))
        return active ? [{ id: "admin" }] : [];
      if (text.includes('SELECT "suspended"'))
        return states.has(values[0])
          ? [{ suspended: states.get(values[0]) }]
          : [];
      if (text.includes('UPDATE "Barbershop"')) {
        states.set(values[1], values[0]);
        return [{ id: values[1] }];
      }
      if (text.includes('INSERT INTO "BarbershopAdministrationChange"')) {
        if (failAudit) throw new Error("AUDIT_FAILED");
        audit.push(values);
        return [{ id: values[0] }];
      }
      return [];
    },
  };
  const db = {
    ...sql,
    $transaction: async (work) => {
      const before = new Map(states);
      try {
        return await work(sql);
      } catch (error) {
        states.clear();
        for (const [key, value] of before) states.set(key, value);
        throw error;
      }
    },
  };
  const api = loadProduction("lib/global-management.ts", {
    "server-only": {},
    "node:crypto": { randomUUID },
    "./prisma": { prisma: db },
    "./authorization": {
      requireGlobalPermission: async (permission) => {
        assert.equal(permission, "barbershops:manage");
        if (!authorized) throw new Error("FORBIDDEN");
        return { userId: "admin-user", globalAdminId: "admin" };
      },
    },
  });
  return { ...api, states, audit, calls };
}
test("global administration rejects non-admins before querying or writing", async () => {
  const f = fixture({ authorized: false });
  for (const action of [
    () => f.listOwners(),
    () => f.listManagedShops(),
    () => f.changeSuspension({ barbershopId: shop, suspended: true }),
  ])
    await assert.rejects(action(), /FORBIDDEN/);
  assert.equal(f.calls.length, 0);
});
test("suspension rechecks active admin, isolates shop, audits transition and supports reactivation", async () => {
  const f = fixture();
  await f.changeSuspension({ barbershopId: shop, suspended: true });
  assert.equal(f.states.get(shop), true);
  assert.equal(f.states.get("other-shop"), false);
  assert.equal(f.audit.length, 1);
  assert.deepEqual(f.audit[0].slice(1), [shop, "admin", false, true]);
  await f.changeSuspension({ barbershopId: shop, suspended: true });
  assert.equal(f.audit.length, 1);
  await f.changeSuspension({ barbershopId: shop, suspended: false });
  assert.equal(f.states.get(shop), false);
  assert.equal(f.audit.length, 2);
  assert.ok(f.calls.some((c) => c.text.includes("FOR UPDATE")));
  assert.equal(
    f.calls.some((c) =>
      /UPDATE "(?:ManualPixPayment|BarbershopMembership)"/.test(c.text),
    ),
    false,
  );
});
test("revoked global authority and audit failures prevent a committed suspension", async () => {
  for (const options of [{ active: false }, { failAudit: true }]) {
    const f = fixture(options);
    await assert.rejects(
      f.changeSuspension({ barbershopId: shop, suspended: true }),
    );
    assert.equal(f.states.get(shop), false);
  }
});
test("lists select account identity and owner links, never credentials", async () => {
  const f = fixture();
  await f.listOwners();
  await f.listManagedShops();
  assert.equal(f.calls.length, 2);
  for (const { text } of f.calls)
    assert.doesNotMatch(text, /password|token|SELECT \*/i);
  assert.match(f.calls[0].text, /LEFT JOIN "BarbershopMembership"/);
  assert.match(f.calls[1].text, /max\(p\."competence"\)/);
});

test("suspended OWNER cannot enter the operational panel or bypass it via onboarding", async () => {
  const api = loadProduction("lib/authorization.ts", {
    "server-only": {},
    "next/headers": { headers: async () => ({}) },
    "@/lib/auth": {
      auth: { api: { getSession: async () => ({ user: { id: "owner" } }) } },
    },
    "@/lib/prisma": {
      prisma: {
        $queryRaw: async () => [
          {
            id: "membership",
            userId: "owner",
            barbershopId: shop,
            role: "OWNER",
            active: true,
            suspended: true,
          },
        ],
      },
    },
  });
  await assert.rejects(
    api.requireOwnerPanelAccess(),
    (error) => error.code === "FORBIDDEN",
  );
});
