import test from "node:test";
import assert from "node:assert/strict";
import { loadProduction } from "./load-production.mjs";

const shopA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const shopB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const resourceA = "11111111-1111-4111-8111-111111111111";
const resourceB = "22222222-2222-4222-8222-222222222222";
const professionalId = "33333333-3333-4333-8333-333333333333";
const serviceId = "44444444-4444-4444-8444-444444444444";
const membership = (barbershopId = shopA, role = "OWNER", active = true) => ({
  id: "membership-a",
  userId: "user-a",
  barbershopId,
  role,
  active,
});

function fixture({
  userId = "user-a",
  memberships = [membership()],
  admins = [],
  entities = {},
  assignments = [],
  suspendedShops = [],
  unapprovedShops = [],
} = {}) {
  const queries = [];
  let unavailable = false;
  const api = loadProduction("lib/authorization.ts", {
    "server-only": {},
    "next/headers": { headers: async () => ({}) },
    "@/lib/auth": {
      auth: {
        api: {
          getSession: async () =>
            userId
              ? {
                  user: { id: userId, role: "OWNER", globalAdmin: true },
                }
              : null,
        },
      },
    },
    "@/lib/prisma": {
      prisma: {
        $queryRaw: async (parts, ...values) => {
          const sql = parts.join("?");
          queries.push({ sql, values });
          if (unavailable) throw new Error("mock missing membership table");
          if (
            sql.includes('FROM "Barbershop"') &&
            !sql.includes('FROM "BarbershopMembership"')
          )
            return suspendedShops.includes(values[0]) ||
              unapprovedShops.includes(values[0])
              ? []
              : [{ id: values[0] }];
          if (sql.includes('FROM "BarbershopMembership"'))
            return memberships.filter(
              (row) =>
                row.userId === values[0] &&
                row.barbershopId === values[1] &&
                row.active,
            );
          if (sql.includes('FROM "GlobalAdmin"'))
            return admins.filter(
              (row) => row.userId === values[0] && row.active,
            );
          if (sql.includes('FROM "ProfessionalService"'))
            return assignments.filter(
              (row) =>
                row.barbershopId === values[0] &&
                row.serviceId === values[1] &&
                row.professionalId === values[2] &&
                row.active,
            );
          if (sql.includes('SELECT "userId" FROM "Booking"'))
            return (entities.Booking ?? []).filter(
              (row) =>
                row.barbershopId === values[0] && row.userId === values[1],
            );
          const table = sql.match(
            /FROM "(BarbershopService|Professional|Booking|WorkingHours|ScheduleBlock)"/,
          )?.[1];
          if (!table) throw new Error("Unexpected authorization query");
          return (entities[table] ?? []).filter(
            (row) => row.id === values[0] && row.barbershopId === values[1],
          );
        },
        $executeRaw: () => {
          throw new Error("Authorization must not grant or mutate");
        },
      },
    },
  });
  return {
    ...api,
    queries,
    unavailable: () => {
      unavailable = true;
    },
  };
}

const denied = (promise, code = "FORBIDDEN") =>
  assert.rejects(
    promise,
    (error) => error.name === "AuthorizationError" && error.code === code,
  );

test("authorization: unauthenticated request never queries membership", async () => {
  const f = fixture({ userId: null });
  await denied(
    f.requireBarbershopPermission(shopA, "bookings:read"),
    "UNAUTHENTICATED",
  );
  assert.equal(f.queries.length, 0);
});

test("authorization: no membership, including forged session role/global flag, is denied", async () => {
  const f = fixture({ memberships: [] });
  await denied(
    f.requireBarbershopPermission(shopA, "settings:write", {
      userId: "owner",
      role: "OWNER",
    }),
  );
});

test("authorization: inactive membership is denied", async () => {
  const f = fixture({ memberships: [membership(shopA, "OWNER", false)] });
  await denied(f.requireBarbershopPermission(shopA, "settings:write"));
});

test("authorization: owner receives only server-derived tenant identity", async () => {
  const f = fixture();
  const context = await f.requireBarbershopPermission(shopA, "settings:write");
  assert.equal(context.userId, "user-a");
  assert.equal(context.role, "OWNER");
  assert.equal(context.barbershopId, shopA);
  assert.deepEqual(
    f.queries.find((q) => q.sql.includes('FROM "BarbershopMembership"')).values,
    ["user-a", shopA],
  );
});

test("authorization: manager can manage bookings but not finances or settings", async () => {
  const f = fixture({ memberships: [membership(shopA, "MANAGER")] });
  await f.requireBarbershopPermission(shopA, "bookings:manage");
  await denied(f.requireBarbershopPermission(shopA, "finance:write"));
  await denied(f.requireBarbershopPermission(shopA, "settings:write"));
});

test("authorization: barber can read schedule configuration, never private clients/bookings", async () => {
  const f = fixture({ memberships: [membership(shopA, "BARBER")] });
  await f.requireBarbershopPermission(shopA, "schedule:read");
  for (const permission of [
    "schedule:write",
    "bookings:read",
    "clients:read",
    "finance:read",
  ]) {
    await denied(f.requireBarbershopPermission(shopA, permission));
  }
});

test("authorization: tenant ID knowledge does not authorize another shop", async () => {
  const f = fixture();
  await denied(f.requireBarbershopPermission(shopB, "services:read"));
});

test("authorization: multiple memberships keep roles specific to the selected shop", async () => {
  const f = fixture({
    memberships: [membership(shopA), membership(shopB, "BARBER")],
  });
  await f.requireBarbershopPermission(shopA, "finance:read");
  await f.requireBarbershopPermission(shopB, "services:read");
  await denied(f.requireBarbershopPermission(shopB, "finance:read"));
});

test("authorization: malformed ID cannot reach SQL, unknown permission is denied", async () => {
  const f = fixture();
  await denied(
    f.requireBarbershopPermission("' OR true --", "services:read"),
    "INVALID_INPUT",
  );
  assert.equal(f.queries.length, 0);
  await denied(f.requireBarbershopPermission(shopA, "memberships:grant"));
  await denied(f.requireBarbershopPermission(shopA, "__proto__"));
});

test("authorization: unknown stored role does not default to owner", async () => {
  const f = fixture({ memberships: [membership(shopA, "__proto__")] });
  await denied(f.requireBarbershopPermission(shopA, "settings:read"));
});

test("authorization: database/schema failure propagates with no permissive fallback", async () => {
  const f = fixture();
  f.unavailable();
  await assert.rejects(
    f.requireBarbershopPermission(shopA, "services:read"),
    /missing membership table/,
  );
});

test("authorization: owner cannot assign global privileges or confirm SaaS Pix", async () => {
  const f = fixture();
  await denied(
    f.requireGlobalPermission("subscription-payments:confirm", {
      active: true,
    }),
  );
  assert.equal(Object.hasOwn(f, "grantGlobalAdmin"), false);
  assert.equal(Object.hasOwn(f, "grantMembership"), false);
});

test("authorization: active global admin can use explicit global contracts", async () => {
  const f = fixture({
    memberships: [],
    admins: [{ id: "global-a", userId: "user-a", active: true }],
  });
  const context = await f.requireGlobalPermission(
    "subscription-payments:confirm",
  );
  assert.equal(context.globalAdminId, "global-a");
  await denied(f.requireGlobalPermission("clients:read"));
  await denied(f.requireBarbershopPermission(shopA, "clients:read"));
});

test("authorization: inactive global admin has no administrative access", async () => {
  const f = fixture({
    admins: [{ id: "global-a", userId: "user-a", active: false }],
  });
  await denied(f.requireGlobalPermission("subscriptions:manage"));
});

for (const [kind, table] of [
  ["service", "BarbershopService"],
  ["professional", "Professional"],
  ["workingHours", "WorkingHours"],
  ["block", "ScheduleBlock"],
]) {
  test(`authorization: ${kind} ID is scoped to the authorized shop`, async () => {
    const f = fixture({
      entities: {
        [table]: [
          { id: resourceA, barbershopId: shopA },
          { id: resourceB, barbershopId: shopB },
        ],
      },
    });
    assert.equal(
      (await f.requireBarbershopEntity(shopA, kind, resourceA)).entity.id,
      resourceA,
    );
    await denied(
      f.requireBarbershopEntity(shopA, kind, resourceB),
      "NOT_FOUND",
    );
    const query = f.queries.at(-1);
    assert.match(query.sql, /"barbershopId" = \?/);
    assert.equal(query.sql.includes(resourceB), false);
    assert.deepEqual(query.values, [resourceB, shopA]);
  });
}

test("authorization: booking and its related service cannot cross tenant boundaries", async () => {
  const f = fixture({
    entities: {
      Booking: [
        { id: resourceA, barbershopId: shopA, serviceId, professionalId: null },
      ],
      BarbershopService: [{ id: serviceId, barbershopId: shopB }],
    },
  });
  await denied(
    f.requireBarbershopEntity(shopA, "booking", resourceA),
    "NOT_FOUND",
  );
});

test("authorization: legacy booking without professional can be scoped without inventing one", async () => {
  const f = fixture({
    entities: {
      Booking: [
        { id: resourceA, barbershopId: shopA, serviceId, professionalId: null },
      ],
      BarbershopService: [{ id: serviceId, barbershopId: shopA }],
    },
  });
  assert.equal(
    (await f.requireBarbershopEntity(shopA, "booking", resourceA)).entity
      .professionalId,
    null,
  );
});

test("authorization: new booking relations need same-shop active professional assignment", async () => {
  const entities = {
    BarbershopService: [{ id: serviceId, barbershopId: shopA }],
    Professional: [{ id: professionalId, barbershopId: shopA }],
  };
  const f = fixture({
    entities,
    assignments: [
      { barbershopId: shopA, serviceId, professionalId, active: true },
    ],
  });
  await f.requireBookingRelations(shopA, serviceId, professionalId);
  const missing = fixture({ entities });
  await denied(
    missing.requireBookingRelations(shopA, serviceId, professionalId),
    "NOT_FOUND",
  );
  const inactive = fixture({
    entities,
    assignments: [
      { barbershopId: shopA, serviceId, professionalId, active: false },
    ],
  });
  await denied(
    inactive.requireBookingRelations(shopA, serviceId, professionalId),
    "NOT_FOUND",
  );
  const foreign = fixture({
    entities: {
      ...entities,
      Professional: [{ id: professionalId, barbershopId: shopB }],
    },
  });
  await denied(
    foreign.requireBookingRelations(shopA, serviceId, professionalId),
    "NOT_FOUND",
  );
});

test("authorization: customer relationship is limited to own-shop bookings", async () => {
  const f = fixture({
    entities: {
      Booking: [
        { id: resourceA, barbershopId: shopA, userId: "customer-a" },
        { id: resourceB, barbershopId: shopB, userId: "customer-b" },
      ],
    },
  });
  const result = await f.requireBarbershopCustomer(shopA, "customer-a");
  assert.equal(result.customerUserId, "customer-a");
  assert.equal(Object.hasOwn(result, "email"), false);
  await denied(f.requireBarbershopCustomer(shopA, "customer-b"), "NOT_FOUND");
});

test("authorization: invalid resource kind/access cannot choose arbitrary tables", async () => {
  const f = fixture();
  await denied(f.requireBarbershopEntity(shopA, "GlobalAdmin", resourceA));
  await denied(f.requireBarbershopEntity(shopA, "service", resourceA, "grant"));
  assert.equal(f.queries.length, 0);
});

test("suspended shops refuse direct operational permissions without affecting another shop", async () => {
  const f = fixture({
    memberships: [membership(shopA), membership(shopB)],
    suspendedShops: [shopA],
  });
  await denied(f.requireBarbershopPermission(shopA, "services:write"));
  const allowed = await f.requireBarbershopPermission(shopB, "services:write");
  assert.equal(allowed.barbershopId, shopB);
});

test("pending or rejected shop cannot bypass approval through direct operational permission checks", async () => {
  const f = fixture({
    memberships: [membership(shopA), membership(shopB)],
    unapprovedShops: [shopA],
  });
  await denied(f.requireBarbershopPermission(shopA, "settings:write"));
  assert.equal(
    (await f.requireBarbershopPermission(shopB, "settings:write")).barbershopId,
    shopB,
  );
  assert.ok(
    f.queries.some((q) => q.sql.includes("\"approvalStatus\"='APPROVED'")),
  );
});
