import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { assertSafeEnvironment } from "./guard.mjs";
import { dependencies, loadProduction } from "./load-production.mjs";
import "./legacy-stripe.test.mjs";
import "./authorization.test.mjs";
import "./owner-auth.test.mjs";
import "./saas-migrations.test.mjs";
import "./bookings.test.mjs";
import "./booking-persistence.test.mjs";
import "./mvp.test.mjs";
import "./global-management.test.mjs";
import "./neon-safety.test.mjs";
import "./neon-connection.test.mjs";
import "./neon-migration-inspection.test.mjs";
import "./neon-migrate-deploy.test.mjs";

const serviceId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const barbershopId = "shop-a";
const date = () => new Date(2099, 10, 7, 10, 0);
const createFile = "app/_actions/create-booking.ts";
const slotsFile = "app/_actions/get-date-available-time-slots.ts";
const cancelFile = "app/_actions/cancel-booking.ts";
const webhookFile = "app/api/stripe/webhook/route.ts";

test("safety: unsafe environment is rejected without exposing values", () => {
  const safe = { NODE_ENV: "test", CORTZ_TEST_MODE: "mock-only" };
  assert.doesNotThrow(() => assertSafeEnvironment(safe));
  for (const key of [
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "NODE_OPTIONS",
    "DOTENV_CONFIG_PATH",
  ]) {
    assert.throws(
      () => assertSafeEnvironment({ ...safe, [key]: "unsafe" }),
      /Unexpected environment/,
    );
  }
  assert.throws(
    () => assertSafeEnvironment({ ...safe, NODE_ENV: "production" }),
    /isolated/,
  );
});

test("safety: fetch, HTTP, sockets and child processes are blocked", () => {
  for (const operation of [
    () => fetch("https://example.invalid"),
    () => http.request("http://example.invalid"),
    () => new net.Socket().connect(5432, "127.0.0.1"),
    () => spawn(process.execPath, ["--version"]),
  ])
    assert.throws(operation, /External I\/O blocked/);
});

test("safety: omitted production dependency fails closed", () => {
  assert.throws(
    () => loadProduction(createFile, {}),
    /Unmocked import blocked/,
  );
});

test("create: schema rejects malformed ID before touching dependencies", async () => {
  const { createBooking } = loadProduction(createFile, dependencies({}));
  assert.throws(
    () => createBooking({ serviceId: "invalid", date: date() }),
    /UUID/,
  );
});

test("create: unauthenticated user is rejected before database access", async () => {
  const { createBooking } = loadProduction(createFile, dependencies({}, null));
  await assert.rejects(
    createBooking({ serviceId, date: date() }),
    /Unauthorized/,
  );
});

function creation(existing = null) {
  const writes = [];
  const queries = [];
  const prisma = {
    barbershopService: {
      findUnique: async () => ({ id: serviceId, barbershopId }),
    },
    booking: {
      findFirst: async (query) => {
        queries.push(query);
        return existing;
      },
      create: async ({ data }) => {
        writes.push(data);
        return { id: bookingId, ...data };
      },
    },
  };
  return {
    ...loadProduction(createFile, dependencies(prisma)),
    writes,
    queries,
  };
}

test("characterization: direct creation uses session and service, without Stripe", async () => {
  const fixture = creation();
  const result = await fixture.createBooking({ serviceId, date: date() });
  assert.equal(result.userId, "customer-a");
  assert.equal(result.barbershopId, barbershopId);
  assert.equal(fixture.writes.length, 1);
});

test("characterization / known defect: even a cancelled exact-time conflict blocks creation", async () => {
  const fixture = creation({ id: bookingId, cancelled: true });
  await assert.rejects(
    fixture.createBooking({ serviceId, date: date() }),
    /Já existe/,
  );
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.queries[0].where.cancelled, undefined);
});

test("characterization / known defect: past date is accepted by direct creation", async () => {
  const fixture = creation();
  await fixture.createBooking({
    serviceId,
    date: new Date("2000-01-01T10:00:00Z"),
  });
  assert.equal(fixture.writes.length, 1);
});

test("characterization / known defect: simultaneous empty reads allow two inserts (mocked interleaving)", async () => {
  const fixture = creation();
  await Promise.all([
    fixture.createBooking({ serviceId, date: date() }),
    fixture.createBooking({ serviceId, date: date() }),
  ]);
  assert.equal(fixture.queries.length, 2);
  assert.equal(fixture.writes.length, 2);
});

test("characterization / known defect: cancelled bookings remove slots from availability", async () => {
  let query;
  const prisma = {
    booking: {
      findMany: async (input) => {
        query = input;
        return [{ date: date(), cancelled: true }];
      },
    },
  };
  const { getDateAvailableTimeSlots } = loadProduction(
    slotsFile,
    dependencies(prisma),
  );
  const slots = await getDateAvailableTimeSlots({ barbershopId, date: date() });
  assert.equal(slots.includes("10:00"), false);
  assert.equal(slots.includes("10:30"), true);
  assert.equal(query.where.cancelled, undefined);
});

test("characterization: date-only parsing can query the previous civil day in Sao Paulo", async () => {
  let query;
  const prisma = {
    booking: {
      findMany: async (input) => {
        query = input;
        return [];
      },
    },
  };
  const { getDateAvailableTimeSlots } = loadProduction(
    slotsFile,
    dependencies(prisma),
  );
  await getDateAvailableTimeSlots({
    barbershopId,
    date: new Date("2099-11-07"),
  });
  assert.equal(
    query.where.date.gte.getDate(),
    process.env.TZ === "UTC" ? 7 : 6,
  );
  assert.equal(query.where.date.gte.getHours(), 0);
});

function cancellation({
  owner = "customer-a",
  charge = null,
  failUpdate = false,
} = {}) {
  const effects = [];
  const prisma = {
    booking: {
      findUnique: async () => ({
        id: bookingId,
        userId: owner,
        date: date(),
        cancelled: false,
        stripeChargeId: charge,
      }),
      update: async ({ data }) => {
        effects.push("update");
        if (failUpdate) throw new Error("mock database failure");
        return { id: bookingId, ...data };
      },
    },
  };
  class Stripe {
    refunds = {
      create: async () => {
        effects.push("refund");
        return { id: "mock-refund" };
      },
    };
    static errors = { StripeError: class extends Error {} };
  }
  return {
    ...loadProduction(cancelFile, dependencies(prisma, "customer-a", Stripe)),
    effects,
  };
}

test("cancel: another user's booking is rejected without financial or update effects", async () => {
  const fixture = cancellation({ owner: "customer-b", charge: "mock-charge" });
  await assert.rejects(fixture.cancelBooking({ bookingId }), /permissão/);
  assert.equal(fixture.effects.length, 0);
});

test("cancel: uncharged booking is marked cancelled without refund", async () => {
  const fixture = cancellation();
  const result = await fixture.cancelBooking({ bookingId });
  assert.equal(result.cancelled, true);
  assert.ok(result.cancelledAt instanceof Date);
  assert.deepEqual(fixture.effects, ["update"]);
});

test("characterization / known defect: refund can succeed before database update fails", async () => {
  const fixture = cancellation({ charge: "mock-charge", failUpdate: true });
  await assert.rejects(
    fixture.cancelBooking({ bookingId }),
    /mock database failure/,
  );
  assert.deepEqual(fixture.effects, ["refund", "update"]);
});

test("webhook: missing signature returns error without Stripe or database access", async () => {
  const { POST } = loadProduction(webhookFile, dependencies({}));
  const response = await POST({ headers: { get: () => null } });
  assert.equal(response.status, 400);
});
