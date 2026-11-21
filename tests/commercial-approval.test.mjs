import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadProduction } from "./load-production.mjs";
const rules = loadProduction("lib/commercial-rules.ts", {});
const shop = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  trialId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function fixture({
  authorized = true,
  active = true,
  self = false,
  failAudit = false,
} = {}) {
  const states = new Map([
      [shop, "PENDING"],
      [other, "APPROVED"],
    ]),
    trials = new Map(),
    events = [],
    calls = [];
  const sql = {
    $queryRaw: async (parts, ...values) => {
      const text = parts.join("?");
      calls.push({ text, values });
      if (text.includes('FROM "GlobalAdmin"'))
        return active ? [{ id: "admin" }] : [];
      if (text.includes('SELECT "approvalStatus"'))
        return states.has(values[0])
          ? [{ approvalStatus: states.get(values[0]) }]
          : [];
      if (text.includes('FROM "BarbershopMembership"'))
        return self ? [{ id: "owns" }] : [];
      if (text.includes('UPDATE "Barbershop"')) {
        states.set(values[1], values[0]);
        return [{ id: values[1] }];
      }
      if (text.includes('INSERT INTO "BarbershopCommercialEvent"')) {
        if (failAudit) throw Error("AUDIT_FAILED");
        events.push({
          shop: values[1],
          action: values[3],
          details: JSON.parse(values[4]),
        });
        return [];
      }
      if (text.includes('SELECT "startsAt"')) {
        const t = trials.get(values[0]);
        return t && t.shop === values[1] ? [t] : [];
      }
      if (text.includes('INSERT INTO "BarbershopFreeTrial"')) {
        trials.set(values[0], {
          shop: values[1],
          startsAt: values[2],
          endsAt: values[3],
        });
        return [];
      }
      if (text.includes('UPDATE "BarbershopFreeTrial"')) {
        trials.set(values[4], {
          shop: values[5],
          startsAt: values[0],
          endsAt: values[1],
        });
        return [];
      }
      return [];
    },
  };
  const db = {
    ...sql,
    $transaction: async (work) => {
      const before = new Map(states),
        ts = new Map(trials),
        len = events.length;
      try {
        return await work(sql);
      } catch (e) {
        states.clear();
        for (const [k, v] of before) states.set(k, v);
        trials.clear();
        for (const [k, v] of ts) trials.set(k, v);
        events.length = len;
        throw e;
      }
    },
  };
  const api = loadProduction("lib/global-commercial.ts", {
    "server-only": {},
    "node:crypto": { randomUUID },
    "./prisma": { prisma: db },
    "./commercial-rules": rules,
    "./authorization": {
      requireGlobalPermission: async (p) => {
        assert.equal(p, "barbershops:manage");
        if (!authorized) throw Error("FORBIDDEN");
        return { userId: "admin-user", globalAdminId: "admin" };
      },
    },
  });
  return { ...api, states, trials, events, calls };
}
test("new registrations are explicitly pending; legacy rows keep approved state in additive migration", () => {
  const source = readFileSync("lib/owner-store.ts", "utf8");
  assert.match(source, /"approvalStatus"\) VALUES[\s\S]*?'PENDING'/);
  const sql = readFileSync(
    "prisma/migrations/20261121020000_approval_and_free_trials/migration.sql",
    "utf8",
  );
  assert.ok(
    sql.indexOf("DEFAULT 'APPROVED'") < sql.indexOf("SET DEFAULT 'PENDING'"),
  );
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\b/);
});
test("approval without Pix succeeds, rejection preserves records, and audit is scoped", async () => {
  const f = fixture();
  await f.commercialCommand({ barbershopId: shop, action: "APPROVE" });
  assert.equal(f.states.get(shop), "APPROVED");
  assert.equal(f.states.get(other), "APPROVED");
  await f.commercialCommand({ barbershopId: shop, action: "REJECT" });
  assert.equal(f.states.get(shop), "REJECTED");
  assert.equal(f.events.length, 2);
  assert.ok(f.events.every((e) => e.shop === shop));
  assert.equal(
    f.calls.some((c) =>
      /ManualPixPayment|"suspended"|"published"/.test(c.text),
    ),
    false,
  );
});
test("non-admin, revoked admin and owning admin cannot approve or grant trials", async () => {
  for (const options of [
    { authorized: false },
    { active: false },
    { self: true },
  ])
    for (const action of ["APPROVE", "TRIAL"]) {
      const f = fixture(options);
      await assert.rejects(
        f.commercialCommand({
          barbershopId: shop,
          action,
          ...(action === "TRIAL" ? { trial: { days: 7 } } : {}),
        }),
      );
      assert.equal(f.states.get(shop), "PENDING");
      assert.equal(f.events.length, 0);
    }
});
test("approve with trial is atomic; trial never writes suspension or Pix", async () => {
  const f = fixture();
  await f.commercialCommand({
    barbershopId: shop,
    action: "APPROVE",
    trial: { days: 3 },
  });
  assert.equal(f.states.get(shop), "APPROVED");
  assert.equal(f.trials.size, 1);
  assert.deepEqual(
    f.events.map((e) => e.action),
    ["APPROVE", "GRANT_TRIAL"],
  );
  const failing = fixture({ failAudit: true });
  await assert.rejects(
    failing.commercialCommand({
      barbershopId: shop,
      action: "APPROVE",
      trial: { days: 7 },
    }),
  );
  assert.equal(failing.states.get(shop), "PENDING");
  assert.equal(failing.trials.size, 0);
  assert.equal(
    f.calls.some((c) => /ManualPixPayment|"suspended"/.test(c.text)),
    false,
  );
});
test("custom periods, expiration boundaries and allowed presets do not imply suspension", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  for (const days of [3, 7, 15]) {
    const r = rules.trialWindow({ days }, now);
    assert.equal(r.endsAt - now, days * 86400000);
  }
  assert.equal(
    rules.trialState("2026-11-20T12:00:00Z", now.toISOString(), now),
    "EXPIRED",
  );
  assert.equal(
    rules.trialState("2026-11-22T12:00:00Z", "2026-11-23T12:00:00Z", now),
    "SCHEDULED",
  );
  assert.equal(
    rules.trialState("2026-11-20T12:00:00Z", "2026-11-23T12:00:00Z", now),
    "ACTIVE",
  );
  assert.throws(() => rules.trialWindow({ endsAt: now.toISOString() }, now));
  assert.equal(rules.trialInputSchema.safeParse({ days: 4 }).success, false);
});
test("trial edits respect shop scope, preserve initial grant, and audit old and new period", async () => {
  const f = fixture();
  f.trials.set(trialId, {
    shop: other,
    startsAt: new Date("2026-01-01Z"),
    endsAt: new Date("2026-01-05Z"),
  });
  await assert.rejects(
    f.commercialCommand({
      barbershopId: shop,
      action: "TRIAL",
      trial: { id: trialId, endsAt: "2027-01-10T00:00:00Z" },
    }),
  );
  f.trials.set(trialId, {
    shop,
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2026-01-05T00:00:00Z"),
  });
  await f.commercialCommand({
    barbershopId: shop,
    action: "TRIAL",
    trial: { id: trialId, endsAt: "2027-01-10T00:00:00Z" },
  });
  assert.equal(
    f.trials.get(trialId).startsAt.toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(f.events[0].action, "UPDATE_TRIAL");
  assert.equal(f.states.get(shop), "PENDING");
});
test("owner panel rejects pending and rejected accounts without deleting their membership", async () => {
  for (const status of ["PENDING", "REJECTED"]) {
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
              id: "link",
              userId: "owner",
              barbershopId: shop,
              role: "OWNER",
              active: true,
              suspended: false,
              approvalStatus: status,
            },
          ],
        },
      },
    });
    await assert.rejects(
      api.requireOwnerPanelAccess(),
      (e) => e.code === status + "_APPROVAL",
    );
    const access = loadProduction("lib/management-access.ts", {
      "server-only": {},
      "./owner-auth-policy": { OWNER_AUTH_ENABLED: true },
      "./authorization": api,
    });
    assert.equal(
      await access.managementAccess("owner"),
      status === "PENDING" ? "pending" : "rejected",
    );
  }
});
