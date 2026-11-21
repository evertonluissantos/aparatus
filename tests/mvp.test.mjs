import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  randomUUID,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  loadProduction,
  dependencies,
  ValidationError,
} from "./load-production.mjs";

const shop = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("application connection: explicit URL required, known administrative roles refused, remote TLS normalized in memory", () => {
  let options;
  const mocks = {
    "@/generated/prisma/client": {
      PrismaClient: class {
        constructor() {}
      },
    },
    "@prisma/adapter-pg": {
      PrismaPg: class {
        constructor(value) {
          options = value;
        }
      },
    },
    "test:environment": { CORTZ_PERSISTENCE_ENABLED: "true" },
  };
  assert.throws(
    () => loadProduction("lib/prisma.ts", mocks),
    /conexão exclusiva/,
  );
  for (const role of [
    "neondb_owner",
    "cortz_test_runner",
    "cortz_test_migrator",
    "cortz_test_inspector",
  ]) {
    assert.throws(
      () =>
        loadProduction("lib/prisma.ts", {
          ...mocks,
          "test:environment": {
            CORTZ_PERSISTENCE_ENABLED: "true",
            DATABASE_URL: `postgresql://${role}:synthetic@example.invalid/test?sslmode=require`,
          },
        }),
      /role exclusiva/,
    );
  }
  loadProduction("lib/prisma.ts", {
    ...mocks,
    "test:environment": {
      CORTZ_PERSISTENCE_ENABLED: "true",
      DATABASE_URL:
        "postgresql://app:synthetic@example.invalid/test?sslmode=require",
    },
  });
  assert.equal(
    new URL(options.connectionString).searchParams.get("sslmode"),
    "verify-full",
  );
  assert.equal(options.max, 5);
});
test("public actor: signed HttpOnly cookie is required; tampering is rejected without database access", () => {
  const boundary = loadProduction("lib/mvp-bookings.ts", {
    "server-only": {},
    "node:crypto": { createHmac, randomBytes, timingSafeEqual },
    "test:environment": {
      BETTER_AUTH_SECRET: "synthetic-test-secret-with-at-least-32-characters",
    },
    "./prisma": { prisma: {} },
    "./authorization": {},
    "./bookings/postgres": { createPostgresBookingAdapter: () => ({}) },
    "./bookings/availability": {},
    "@/app/admin/agenda/_lib/appointment": { appointmentSchema: z.unknown() },
    "./owner-store": {},
  });
  const request = {
    url: "https://example.invalid/api/public",
    headers: new Headers(),
  };
  assert.throws(() => boundary.guestActor(request), /GUEST_COOKIE_REQUIRED/);
  const response = { headers: new Headers() };
  boundary.ensureGuestCookie(request, response);
  const cookie = response.headers.get("Set-Cookie");
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=Lax"));
  assert.ok(cookie.includes("Secure"));
  const valid = {
    ...request,
    headers: new Headers({ cookie: cookie.split(";")[0] }),
  };
  assert.match(boundary.guestActor(valid), /^[a-f0-9]{64}$/);
  assert.throws(
    () =>
      boundary.guestActor({
        ...request,
        headers: new Headers({
          cookie: `cortz_guest=${"a".repeat(64)}.${"0".repeat(64)}`,
        }),
      }),
    /GUEST_COOKIE_REJECTED/,
  );
});
function ownerStore({ denied = false, linked = true, active = true } = {}) {
  const calls = [];
  const week = () =>
    Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      windows: [],
      breaks: [],
    }));
  const tx = {
    $queryRaw: async (parts, ...values) => {
      const text = parts.join("?");
      calls.push({ text, values });
      if (text.includes('FROM "user"')) return [{ id: "owner-user" }];
      if (text.includes('FROM "BarbershopMembership"'))
        return linked ? [{ barbershopId: shop, active }] : [];
      if (text.includes('FROM "Barbershop"'))
        return [
          {
            id: shop,
            name: "Barbearia fictícia",
            phones: ["11900000000"],
            address: "Endereço fictício",
            description: "Descrição fictícia",
            imageUrl: "/banner.png",
            published: true,
            slug: "ficticia",
          },
        ];
      if (text.includes('FROM "BarbershopService"')) return [];
      if (text.includes('FROM "ProfessionalService"')) return [];
      if (text.includes('FROM "Professional"'))
        return [
          {
            id: "professional-id",
            name: "Pessoa fictícia",
            phone: "PRIVATE_PRO_PHONE",
            description: "Descrição",
            imageUrl: null,
            active: true,
          },
        ];
      if (text.includes('FROM "WorkingHours"')) return [];
      if (text.includes('FROM "ScheduleBlock"')) return [];
      if (text.includes('FROM "Customer"'))
        return [
          {
            id: "customer-id",
            name: "Cliente fictício",
            phoneNormalized: "PRIVATE_CUSTOMER_PHONE",
            notes: "PRIVATE_NOTE",
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
        ];
      if (text.includes('FROM "Booking"')) return [];
      if (/^\s*UPDATE "Barbershop"/.test(text)) return [{ id: shop }];
      if (
        text.includes('INSERT INTO "Barbershop"') ||
        text.includes('INSERT INTO "BarbershopMembership"')
      )
        return [{ id: shop }];
      throw new Error("Unexpected SQL in mock");
    },
  };
  const store = loadProduction("lib/owner-store.ts", {
    "server-only": {},
    "node:crypto": { createHash, randomUUID },
    "./prisma": { prisma: { ...tx, $transaction: (fn) => fn(tx) } },
    "./authorization": {
      requireOwnerPanelAccess: async () => {
        if (denied) throw new Error("UNAUTHENTICATED");
        return { userId: "owner-user", barbershopId: linked ? shop : null };
      },
      requireBarbershopPermissionInTransaction: async (_tx, id) => {
        assert.equal(id, shop);
        return { userId: "owner-user" };
      },
    },
    "@/app/admin/_lib/demo-barbershop": {
      barbershopSchema: z.object({
        name: z.string(),
        phone: z.string(),
        address: z.string(),
        description: z.string(),
        imageUrl: z.string(),
      }),
    },
    "@/app/admin/horarios/_lib/schedule": {
      emptySchedule: () => ({
        shopWeek: week(),
        professionalWeeks: {},
        blocks: [],
      }),
      emptyWeek: week,
    },
    "@/app/admin/profissionais/_lib/professional": {},
    "@/app/admin/clientes/_lib/client": {},
    "./bookings/postgres": {},
    "./bookings/availability": {},
    "./bookings/timezone": {},
  });
  return { store, calls, tx };
}
test("owner store with mocks: public projection omits client history, private professional phones and block reasons", async () => {
  const f = ownerStore();
  const result = await f.store.loadShop(f.tx, shop, true);
  assert.equal(result.professionals[0].phone, "");
  assert.equal(result.clients.length, 0);
  assert.equal(result.appointments.length, 0);
  assert.equal(result.schedule.blocks.length, 0);
  assert.equal(
    f.calls.some(
      (c) =>
        c.text.includes('FROM "Customer"') ||
        c.text.includes('FROM "Booking"') ||
        c.text.includes('FROM "ScheduleBlock"'),
    ),
    false,
  );
  assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
});
test("owner onboarding with mocks: creates only a real shop and its session-derived OWNER link with a valid stable slug", async () => {
  const f = ownerStore({ linked: false });
  await f.store.ownerCommand({
    op: "create",
    data: {
      name: `${"a".repeat(49)} barbearia`,
      phone: "11900000000",
      address: "Endereço fictício",
      description: "Descrição fictícia",
      imageUrl: "/banner.png",
    },
    userId: "forged-user",
  });
  const insert = f.calls.find((c) =>
    c.text.includes('INSERT INTO "Barbershop"'),
  );
  assert.match(insert.values[6], /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const membership = f.calls.find((c) =>
    c.text.includes('INSERT INTO "BarbershopMembership"'),
  );
  assert.ok(membership.values.includes("owner-user"));
  assert.equal(membership.values.includes("forged-user"), false);
  assert.equal(
    f.calls.some(
      (c) =>
        c.text.includes('INSERT INTO "user"') ||
        c.text.includes('INSERT INTO "BarbershopService"'),
    ),
    false,
  );
});
test("owner store with mocks: unauthenticated and second-shop creation are refused before inserts, including inactive links", async () => {
  const unauth = ownerStore({ denied: true });
  await assert.rejects(
    unauth.store.ownerCommand({ op: "create", data: {} }),
    /UNAUTHENTICATED/,
  );
  assert.equal(unauth.calls.length, 0);
  for (const active of [true, false]) {
    const f = ownerStore({ active });
    await assert.rejects(
      f.store.ownerCommand({ op: "create", data: {} }),
      /OWNER_LIMIT/,
    );
    assert.equal(
      f.calls.some((c) => c.text.includes("INSERT")),
      false,
    );
    assert.ok(f.calls[0].text.includes("FOR UPDATE"));
  }
});
test("owner store with mocks: server derives the tenant and refuses stale revisions", async () => {
  const f = ownerStore();
  const current = await f.store.loadShop(f.tx, shop);
  f.calls.length = 0;
  const data = {
    name: "Nome atualizado",
    phone: "11900000000",
    address: "Endereço fictício",
    description: "Descrição fictícia",
    imageUrl: "/banner.png",
  };
  await assert.rejects(
    f.store.ownerCommand({ op: "settings", data, revision: "0".repeat(64) }),
    /STALE_SHOP/,
  );
  assert.equal(
    f.calls.some((c) => /^\s*UPDATE/.test(c.text)),
    false,
  );
  await f.store.ownerCommand({
    op: "settings",
    data,
    revision: f.store.shopRevision(current),
    barbershopId: "foreign-tenant",
    role: "OWNER",
  });
  const update = f.calls.find((c) => /^\s*UPDATE/.test(c.text));
  assert.ok(update.values.includes(shop));
  assert.equal(update.values.includes("foreign-tenant"), false);
});
function pix({ denied = false, revoked = false, existing = null } = {}) {
  const calls = [];
  const sql = {
    $queryRaw: async (parts, ...values) => {
      const text = parts.join("?");
      calls.push({ text, values });
      if (text.includes('FROM "GlobalAdmin"'))
        return revoked ? [] : [{ id: "global-id" }];
      if (text.includes('FROM "ManualPixPayment"'))
        return existing ? [existing] : [];
      return [{ id: shop }];
    },
  };
  const store = loadProduction("lib/manual-pix.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => "payment-id" },
    "./prisma": { prisma: { $transaction: (fn) => fn(sql) } },
    "./authorization": {
      requireGlobalPermission: async (permission) => {
        assert.equal(permission, "subscription-payments:confirm");
        if (denied) throw new Error("FORBIDDEN");
        return { userId: "admin-user", globalAdminId: "global-id" };
      },
    },
  });
  return { store, calls };
}
test("manual Pix: monthly coverage, amount and competence are validated without a gateway", () => {
  const { store } = pix();
  const coverage = store.pixCoverage("2026-12");
  assert.equal(coverage.startsAt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(coverage.endsAt.toISOString(), "2027-01-01T00:00:00.000Z");
  for (const value of ["2026-13", "2026-00", "invalid"])
    assert.throws(() => store.pixCoverage(value));
  assert.equal(
    store.pixConfirmationSchema.safeParse({
      barbershopId: shop,
      competence: "2026-11",
      amountInCents: 0,
    }).success,
    false,
  );
});
test("manual Pix: only active global administrators can confirm, including recheck in transaction", async () => {
  for (const options of [{ denied: true }, { revoked: true }]) {
    const f = pix(options);
    await assert.rejects(
      f.store.confirmPix({
        barbershopId: shop,
        competence: "2026-11",
        amountInCents: 5000,
      }),
      /FORBIDDEN/,
    );
    assert.equal(
      f.calls.some((c) => c.text.includes("INSERT")),
      false,
    );
  }
  const f = pix();
  await f.store.confirmPix({
    barbershopId: shop,
    competence: "2026-11",
    amountInCents: 5000,
  });
  const insert = f.calls.find((c) => c.text.includes("INSERT"));
  assert.ok(insert.values.includes("global-id"));
  assert.ok(insert.values.includes(shop));
  assert.ok(insert.values.includes(5000));
});
test("manual Pix: duplicate confirmation is idempotent; conflicting amount cannot overwrite audit", async () => {
  const f = pix({ existing: { id: "saved", amountInCents: 5000 } });
  assert.equal(
    (
      await f.store.confirmPix({
        barbershopId: shop,
        competence: "2026-11",
        amountInCents: 5000,
      })
    ).id,
    "saved",
  );
  await assert.rejects(
    f.store.confirmPix({
      barbershopId: shop,
      competence: "2026-11",
      amountInCents: 6000,
    }),
    /PAYMENT_ALREADY_CONFIRMED/,
  );
  assert.equal(
    f.calls.some((c) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(c.text)),
    false,
  );
});
test("MVP HTTP: disabled rollout and cross-origin writes fail closed", () => {
  const disabled = loadProduction("lib/mvp-http.ts", {
    "server-only": {},
    "./owner-auth-policy": { OWNER_AUTH_ENABLED: false },
  });
  assert.throws(() => disabled.requireMvp(), /MVP_DISABLED/);
  const enabled = loadProduction("lib/mvp-http.ts", {
    "server-only": {},
    "./owner-auth-policy": { OWNER_AUTH_ENABLED: true },
  });
  assert.throws(() => enabled.requireMvp({}, true), /ORIGIN_REJECTED/);
});
test("MVP: old booking and Stripe checkout writers refuse before touching dependencies", async () => {
  for (const file of [
    "app/_actions/create-booking.ts",
    "app/_actions/create-booking-checkout-session.ts",
  ]) {
    const mocks = {
      ...dependencies({}),
      "test:environment": { CORTZ_PERSISTENCE_ENABLED: "true" },
      stripe: class {},
      "date-fns": { format: () => "" },
    };
    const loaded = loadProduction(file, mocks);
    await assert.rejects(
      (loaded.createBooking ?? loaded.createBookingCheckoutSession)({
        serviceId: shop,
        date: new Date("2030-01-01T10:00:00Z"),
      }),
      ValidationError,
    );
  }
});
