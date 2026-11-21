import test from "node:test";
import assert from "node:assert/strict";
import { loadProduction } from "./load-production.mjs";

function fixture(allowed = true) {
  const queries = [];
  const api = loadProduction("lib/global-reports.ts", {
    "server-only": {},
    "./authorization": {
      requireGlobalPermission: async (permission) => {
        assert.ok(
          ["subscriptions:read", "subscription-metrics:read"].includes(
            permission,
          ),
        );
        if (!allowed) throw new Error("FORBIDDEN");
      },
    },
    "./prisma": {
      prisma: {
        $queryRaw: async (parts) => {
          const sql = parts.join("?");
          queries.push(sql);
          if (sql.includes('AS "totalReceived"'))
            return [
              {
                totalReceived: "0",
                monthReceived: "0",
                payments: "0",
                shops: "0",
                active: "0",
                suspended: "0",
                published: "0",
                owners: "0",
                accounts: "0",
              },
            ];
          if (sql.includes("generate_series"))
            return [{ month: "2026-11", received: "0" }];
          if (sql.includes('p."confirmedAt" DESC'))
            return [
              {
                id: "receipt",
                shopName: "Synthetic",
                competence: "2026-10",
                amountInCents: 10000,
                confirmedAt: new Date("2026-11-01T02:00:00Z"),
                adminName: "Synthetic admin",
              },
            ];
          return [];
        },
      },
    },
  });
  return { ...api, queries };
}
test("global reports refuse every read before SQL for unauthorized users", async () => {
  const f = fixture(false);
  for (const action of [
    f.executiveReport,
    f.subscriptionCoverage,
    f.paymentHistory,
  ])
    await assert.rejects(action(), /FORBIDDEN/);
  assert.equal(f.queries.length, 0);
});
test("executive totals retain zero and use receipts by confirmation date, without booking revenue or multiplying joins", async () => {
  const f = fixture();
  const report = await f.executiveReport();
  assert.equal(report.totals.totalReceived, "0");
  assert.equal(report.totals.monthReceived, "0");
  assert.equal(report.months[0].received, "0");
  assert.match(f.queries[0], /sum\("amountInCents"\)/);
  assert.match(f.queries[0], /"confirmedAt" AT TIME ZONE 'America\/Sao_Paulo'/);
  assert.doesNotMatch(f.queries[0], /JOIN|Booking|priceInCents/);
  assert.match(f.queries[1], /interval '5 months'/);
  assert.match(f.queries[1], /LEFT JOIN receipts/);
  assert.doesNotMatch(f.queries[1], /"competence"/);
});
test("coverage is checked for the exact current competence, not inferred from the latest receipt", async () => {
  const f = fixture();
  await f.subscriptionCoverage();
  assert.match(f.queries[0], /EXISTS\(SELECT 1 FROM "ManualPixPayment"/);
  assert.match(
    f.queries[0],
    /p\."competence"=to_char\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'/,
  );
  assert.doesNotMatch(f.queries[0], /UPDATE|INSERT|DELETE/);
});
test("payment history returns receipt identity and administrator, without sensitive account fields", async () => {
  const f = fixture();
  const rows = await f.paymentHistory();
  assert.equal(rows[0].confirmedAt, "2026-11-01T02:00:00.000Z");
  assert.match(f.queries[0], /g\."id"=p\."confirmedById"/);
  assert.doesNotMatch(f.queries[0], /password|token|SELECT \*/i);
});
