import test from "node:test";
import assert from "node:assert/strict";
import { loadProduction } from "./load-production.mjs";
import { requireDisposableOptIn } from "./postgres/safety.mjs";

const shop = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pro = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  service = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  key = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const request = {
  barbershopId: shop,
  professionalId: pro,
  serviceId: service,
  localDate: "2030-01-07",
  localTime: "10:00",
};
function fixture({
  command = null,
  failCommand = false,
  denyStaff = false,
  inactiveService = false,
  guestCommand = null,
  published = true,
  suspended = false,
  approvalStatus = "APPROVED",
  guestCount = 0,
} = {}) {
  const calls = [];
  let outcome;
  let capturedTx;
  const sql = {
    $queryRaw: async (parts, ...values) => {
      const text = parts.join("?");
      calls.push({ text, values });
      if (text.includes('FROM "BookingCommand"'))
        return text.includes("count(*)")
          ? [{ count: guestCount }]
          : guestCommand
            ? [guestCommand]
            : command
              ? [command]
              : [];
      if (text.includes('INSERT INTO "BookingCommand"')) {
        if (failCommand) throw new Error("synthetic ledger failure");
        return [{ id: "command" }];
      }
      if (text.includes('INSERT INTO "Booking"'))
        return [{ id: "synthetic-booking", ...request, userId: "customer" }];
      if (text.includes('FROM "Booking"') && text.includes("SELECT *"))
        return [{ id: "persisted", userId: "customer", barbershopId: shop }];
      if (text.includes('FROM "Booking"')) return [];
      if (text.includes('FROM "Customer"')) return [];
      if (text.includes('INSERT INTO "Customer"'))
        return [{ id: "synthetic-customer" }];
      if (text.includes('AS "serviceName"'))
        return [
          {
            serviceName: "Corte fictício",
            professionalName: "Profissional fictício",
          },
        ];
      if (text.includes('FROM "BarbershopService"'))
        return inactiveService && text.includes('"active" = true')
          ? []
          : [
              {
                id: service,
                barbershopId: shop,
                durationMinutes: 30,
                priceInCents: 6550,
              },
            ];
      if (text.includes('FROM "ProfessionalService"'))
        return [
          { barbershopId: shop, professionalId: pro, serviceId: service },
        ];
      if (text.includes('FROM "Professional"'))
        return [{ id: pro, barbershopId: shop, active: true }];
      if (text.includes('FROM "WorkingHours"'))
        return [null, pro].map((professionalId) => ({
          barbershopId: shop,
          professionalId,
          weekday: 1,
          startMinute: 540,
          endMinute: 1080,
        }));
      if (text.includes('FROM "ScheduleBlock"')) return [];
      if (text.includes("FOR UPDATE")) return [{ id: shop }];
      if (text.includes('"suspended"=false') && suspended) return [];
      if (text.includes('"approvalStatus"=') && approvalStatus !== "APPROVED")
        return [];
      if (text.includes('"published"=true'))
        return published ? [{ id: shop }] : [];
      if (text.includes('FROM "Barbershop"'))
        return [{ barbershopId: shop, timeZone: "UTC" }];
      throw new Error("Unexpected SQL");
    },
  };
  const database = {
    ...sql,
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, "ReadCommitted");
      capturedTx = sql;
      try {
        const result = await work(sql);
        outcome = "commit";
        return result;
      } catch (error) {
        outcome = "rollback";
        throw error;
      }
    },
  };
  const authority = {
    requireAuthenticatedUser: async () => ({ userId: "customer" }),
    requireBarbershopPermissionInTransaction: async (
      tx,
      tenant,
      permission,
    ) => {
      assert.equal(tx, capturedTx);
      assert.equal(tenant, shop);
      assert.ok(["bookings:manage", "schedule:write"].includes(permission));
      if (denyStaff) throw new Error("FORBIDDEN");
      return { userId: "customer" };
    },
  };
  const { createPostgresBookingAdapter } = loadProduction(
    "lib/bookings/postgres.ts",
    { "server-only": {}, "node:crypto": { randomUUID: () => "synthetic-id" } },
  );
  return {
    adapter: createPostgresBookingAdapter(
      database,
      authority,
      () => new Date("2030-01-01T00:00:00Z"),
    ),
    calls,
    get outcome() {
      return outcome;
    },
  };
}

test("prepared adapter: inactive services cannot create bookings or idempotency records", async () => {
  const f = fixture({ inactiveService: true });
  await assert.rejects(
    f.adapter.createCustomerBooking(request, key),
    /ENTITY_NOT_FOUND/,
  );
  assert.equal(f.outcome, "rollback");
  assert.equal(
    f.calls.some(({ text }) => text.includes('INSERT INTO "Booking"')),
    false,
  );
  assert.equal(
    f.calls.some(({ text }) => text.includes('INSERT INTO "BookingCommand"')),
    false,
  );
});

test("guest persistence with mocks: validates publication, locks before availability and stores a scoped customer without a fictitious User", async () => {
  const f = fixture();
  await f.adapter.createGuestBooking(request, key, "a".repeat(64), {
    name: "Pessoa fictícia",
    phone: "5511999999999",
  });
  assert.equal(f.outcome, "commit");
  const insert = f.calls.find((c) => c.text.includes('INSERT INTO "Booking"'));
  assert.ok(insert.text.includes('"customerId"'));
  assert.equal(insert.text.includes('"userId"'), false);
  const ledger = f.calls.find((c) =>
    c.text.includes('INSERT INTO "BookingCommand"'),
  );
  assert.ok(ledger.text.includes('"guestActorHash"'));
  assert.ok(ledger.values.includes("a".repeat(64)));
  assert.ok(
    f.calls.findIndex((c) => c.text.includes("FOR UPDATE")) <
      f.calls.findIndex((c) => c.text.includes('"published"=true')),
  );
});
test("guest persistence with mocks: unpublished, inactive and cross-tenant selections never write", async () => {
  for (const options of [{ published: false }, { inactiveService: true }]) {
    const f = fixture(options);
    await assert.rejects(
      f.adapter.createGuestBooking(request, key, "a".repeat(64), {
        name: "Pessoa fictícia",
        phone: "",
      }),
    );
    assert.equal(f.outcome, "rollback");
    assert.equal(
      f.calls.some((c) => c.text.includes("INSERT INTO")),
      false,
    );
  }
  const f = fixture();
  await assert.rejects(
    f.adapter.createGuestBooking(
      { ...request, barbershopId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
      key,
      "a".repeat(64),
      { name: "Pessoa fictícia", phone: "" },
    ),
    /TENANT_MISMATCH/,
  );
  assert.equal(
    f.calls.some((c) => c.text.includes("INSERT INTO")),
    false,
  );
});
test("guest persistence with mocks: replay is idempotent and reused key with different input is refused", async () => {
  const customer = { name: "Pessoa fictícia", phone: "" };
  const f = fixture({
    guestCommand: {
      bookingId: "saved",
      fingerprint: JSON.stringify([request, customer]),
    },
  });
  const result = await f.adapter.createGuestBooking(
    request,
    key,
    "a".repeat(64),
    customer,
  );
  assert.equal(result.id, "saved");
  assert.equal(
    f.calls.some((c) => c.text.includes("INSERT INTO")),
    false,
  );
  await assert.rejects(
    f.adapter.createGuestBooking(
      { ...request, localTime: "11:00" },
      key,
      "a".repeat(64),
      customer,
    ),
    /IDEMPOTENCY_KEY_REUSED/,
  );
});
test("guest persistence with mocks: failed ledger rolls back customer and booking; abuse limit refuses before inserts", async () => {
  const f = fixture({ failCommand: true });
  await assert.rejects(
    f.adapter.createGuestBooking(request, key, "a".repeat(64), {
      name: "Pessoa fictícia",
      phone: "",
    }),
  );
  assert.equal(f.outcome, "rollback");
  const limited = fixture({ guestCount: 6 });
  await assert.rejects(
    limited.adapter.createGuestBooking(request, key, "a".repeat(64), {
      name: "Pessoa fictícia",
      phone: "",
    }),
    /RATE_LIMITED/,
  );
  assert.equal(
    limited.calls.some((c) => c.text.includes("INSERT INTO")),
    false,
  );
});

test("prepared adapter: locks before snapshot, uses core rules and persists snapshots plus ledger", async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0);
  await f.adapter.createCustomerBooking(
    { ...request, userId: "victim", priceInCentsSnapshot: 1 },
    key,
  );
  assert.match(f.calls[0].text, /FOR UPDATE/);
  const insert = f.calls.find((call) =>
    call.text.includes('INSERT INTO "Booking"'),
  );
  assert.equal(insert.values[1], "customer");
  assert.ok(insert.values.includes(6550));
  assert.ok(insert.values.includes(30));
  assert.ok(insert.values.includes("UTC"));
  assert.ok(
    f.calls.some((call) => call.text.includes('INSERT INTO "BookingCommand"')),
  );
  assert.equal(f.outcome, "commit");
});
test("prepared adapter: same idempotency key replays without INSERT or revalidating old date", async () => {
  const fingerprint = JSON.stringify([
    "customer",
    "customer",
    service,
    pro,
    request.localDate,
    request.localTime,
  ]);
  const f = fixture({ command: { bookingId: "persisted", fingerprint } });
  assert.equal(
    (await f.adapter.createCustomerBooking(request, key)).id,
    "persisted",
  );
  assert.equal(
    f.calls.some((call) => call.text.includes("INSERT")),
    false,
  );
});
test("prepared adapter: idempotency key with different content is rejected", async () => {
  const f = fixture({
    command: { bookingId: "persisted", fingerprint: "different" },
  });
  await assert.rejects(
    f.adapter.createCustomerBooking(request, key),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(f.outcome, "rollback");
});
test("prepared adapter: ledger failure propagates to transaction rollback (mock protocol only)", async () => {
  const f = fixture({ failCommand: true });
  await assert.rejects(
    f.adapter.createCustomerBooking(request, key),
    /ledger failure/,
  );
  assert.equal(f.outcome, "rollback");
});
test("prepared adapter: staff authorization failure cannot insert", async () => {
  const f = fixture({ denyStaff: true });
  await assert.rejects(
    f.adapter.createStaffBooking(request, key, "another-customer"),
    /FORBIDDEN/,
  );
  assert.equal(
    f.calls.some((call) => call.text.includes("INSERT")),
    false,
  );
});
test("prepared adapter: read query includes unknown legacy ends and tenant", async () => {
  const f = fixture();
  await f.adapter.reader.loadAvailability(request);
  const query = f.calls.find((call) =>
    call.text.includes('SELECT "barbershopId", "professionalId", "date"'),
  );
  assert.match(query.text, /"endsAt" IS NULL/);
  assert.match(query.text, /"professionalId" IS NULL/);
  assert.equal(query.values[0], shop);
});
test("prepared PostgreSQL launcher: only explicit local opt-in with no URL/preload is accepted", () => {
  const safe = {
    CORTZ_RUN_POSTGRES: "disposable-local",
    CORTZ_POSTGRES_BIN: "C:\\PostgreSQL\\bin",
  };
  assert.equal(requireDisposableOptIn(safe), safe.CORTZ_POSTGRES_BIN);
  for (const name of [
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "PGHOST",
    "PGSERVICE",
    "NODE_OPTIONS",
    "DOTENV_CONFIG_PATH",
  ])
    assert.throws(
      () => requireDisposableOptIn({ ...safe, [name]: "unsafe" }),
      /not accepted/,
    );
  for (const bin of ["relative/bin", "\\\\remote\\share", "//remote/share"])
    assert.throws(
      () => requireDisposableOptIn({ ...safe, CORTZ_POSTGRES_BIN: bin }),
      /opt-in/,
    );
  assert.throws(() => requireDisposableOptIn({}), /opt-in/);
});

test("suspended shop refuses public bookings under the shop lock, before any writes", async () => {
  const f = fixture({ suspended: true });
  await assert.rejects(
    f.adapter.createGuestBooking(request, key, "a".repeat(64), {
      name: "Ficticio",
      phone: "",
    }),
  );
  assert.equal(
    f.calls.some((c) => /INSERT|UPDATE \"Booking\"/.test(c.text)),
    false,
  );
});

test("pending and rejected shops cannot receive new bookings, regardless of suspension", async () => {
  for (const approvalStatus of ["PENDING", "REJECTED"]) {
    const f = fixture({ approvalStatus, suspended: false });
    await assert.rejects(
      f.adapter.createGuestBooking(request, key, "a".repeat(64), {
        name: "Ficticio",
        phone: "",
      }),
    );
    assert.equal(
      f.calls.some((c) => c.text.includes("INSERT INTO")),
      false,
    );
  }
});
