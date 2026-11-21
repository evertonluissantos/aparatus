import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { configuration, remoteMode, testSchema, isolatedClientPath } from "./environment.mjs";
import { verifyEmptyRemoteDatabase } from "../neon/identity.mjs";
import { databaseFromPool } from "./database.mjs";
import { loadAdapter, loadLegacy } from "./load.mjs";

const pool = new Pool({ ...configuration, max: 8 });
let releaseRemoteLock = async () => {};
after(async () => {
  try { await releaseRemoteLock(); } finally { await pool.end(); }
});
const database = databaseFromPool(pool);
const id = Object.fromEntries(
  [
    "owner",
    "customer",
    "other",
    "shop",
    "foreignShop",
    "service",
    "foreignService",
    "pro",
    "foreignPro",
    "legacy",
  ].map((key) => [key, randomUUID()]),
);
const customer = loadAdapter(database, id.customer);
const other = loadAdapter(database, id.other);
const owner = loadAdapter(database, id.owner);
let counter = 0;
let legacyBefore;
const migrations = [
  "20260531182517_init",
  "20261107120000_legacy_stripe_inbox",
  "20261107130000_booking_model_expansion",
  "20261107140000_tenant_authorization",
  "20261107150000_booking_transaction_guards",
  "20261107160000_single_owner",
  "20261107170000_saas_persistence",
  "20261120120000_manual_pix_subscription",
];
function request() {
  const date = new Date(Date.UTC(2030, 0, 7 + 7 * counter++));
  return {
    barbershopId: id.shop,
    serviceId: id.service,
    professionalId: id.pro,
    localDate: date.toISOString().slice(0, 10),
    localTime: "10:00",
  };
}
const count = async (table, value) =>
  Number(
    (
      await pool.query(`SELECT count(*) FROM "${table}" WHERE "id" = $1`, [
        value,
      ])
    ).rows[0].count,
  );
const sqlError = (code) => (error) => error.code === code;

before(async () => {
  // No DDL until connection identity and pristine database have been verified.
  const identity = (
    await pool.query(
      "SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS host, inet_server_port() AS port",
    )
  ).rows[0];
  assert.equal(identity.db, configuration.database);
  assert.equal(identity.usr, configuration.user);
  if (remoteMode) releaseRemoteLock = await verifyEmptyRemoteDatabase(pool,configuration,testSchema);
  else {
    assert.equal(identity.host, "127.0.0.1");
    assert.equal(identity.port, configuration.port);
  }
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
        )
      ).rows[0].count,
    ),
    0,
  );
  await pool.query(
    readFileSync(
      new URL(
        `../../prisma/migrations/${migrations[0]}/migration.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const user of [id.owner, id.customer, id.other])
    await pool.query('INSERT INTO "user" (id,name,email) VALUES ($1,$2,$3)', [
      user,
      "Synthetic User",
      `${user}@example.invalid`,
    ]);
  for (const shop of [id.shop, id.foreignShop])
    await pool.query(
      'INSERT INTO "Barbershop" (id,name,address,description,"imageUrl",phones) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        shop,
        "Synthetic shop",
        "Synthetic address",
        "Test only",
        "https://example.invalid/image.png",
        [],
      ],
    );
  for (const [service, shop] of [
    [id.service, id.shop],
    [id.foreignService, id.foreignShop],
  ])
    await pool.query(
      'INSERT INTO "BarbershopService" (id,name,description,"imageUrl","barbershopId","priceInCents") VALUES ($1,$2,$3,$4,$5,6550)',
      [
        service,
        "Synthetic service",
        "Test only",
        "https://example.invalid/image.png",
        shop,
      ],
    );
  await pool.query(
    'INSERT INTO "Booking" (id,"serviceId","barbershopId","userId",date,cancelled,"stripeChargeId") VALUES ($1,$2,$3,$4,$5,true,$6)',
    [
      id.legacy,
      id.service,
      id.shop,
      id.customer,
      new Date("2020-01-01T10:00:00Z"),
      "ch_historical_synthetic",
    ],
  );
  legacyBefore = (
    await pool.query(
      'SELECT id,"serviceId","barbershopId","userId",date,cancelled,"stripeChargeId" FROM "Booking" WHERE id=$1',
      [id.legacy],
    )
  ).rows[0];
  for (const migration of migrations.slice(1))
    await pool.query(
      readFileSync(
        new URL(
          `../../prisma/migrations/${migration}/migration.sql`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
  for (const [shop, service, pro] of [
    [id.shop, id.service, id.pro],
    [id.foreignShop, id.foreignService, id.foreignPro],
  ]) {
    await pool.query('UPDATE "Barbershop" SET "timeZone"=$1 WHERE id=$2', [
      "UTC",
      shop,
    ]);
    await pool.query(
      'UPDATE "BarbershopService" SET "durationMinutes"=30 WHERE id=$1',
      [service],
    );
    await pool.query(
      'INSERT INTO "Professional" (id,"barbershopId",name) VALUES ($1,$2,$3)',
      [pro, shop, "Synthetic professional"],
    );
    await pool.query(
      'INSERT INTO "ProfessionalService" ("barbershopId","professionalId","serviceId") VALUES ($1,$2,$3)',
      [shop, pro, service],
    );
    for (const scope of [null, pro])
      await pool.query(
        'INSERT INTO "WorkingHours" (id,"barbershopId","professionalId",weekday,"startMinute","endMinute") VALUES ($1,$2,$3,1,540,1080)',
        [randomUUID(), shop, scope],
      );
  }
  await pool.query(
    'INSERT INTO "BarbershopMembership" (id,"userId","barbershopId",role,active) VALUES ($1,$2,$3,$4,true)',
    [randomUUID(), id.owner, id.shop, "OWNER"],
  );
});

test("PrismaPg: isolated expanded client supports the migrated schema and transaction adapter", { skip: !remoteMode }, async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import(pathToFileURL(isolatedClientPath).href);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ ...configuration, max: 4 }) });
  try {
    assert.equal((await prisma.$queryRaw`SELECT current_schema() AS name`)[0].name, testSchema);
    assert.equal((await prisma.professional.findUnique({ where: { id: id.pro } })).barbershopId, id.shop);
    assert.equal((await prisma.barbershopMembership.findFirst({ where: { userId: id.owner, barbershopId: id.shop } })).role, "OWNER");
    const saved = await loadAdapter(prisma,id.customer).createCustomerBooking(request(),randomUUID());
    assert.equal((await prisma.booking.findUnique({ where: { id: saved.id } })).managedByCore,true);
    assert.equal((await prisma.bookingCommand.findUnique({ where: { bookingId: saved.id } })).bookingId,saved.id);
  } finally { await prisma.$disconnect(); }
});

test("PostgreSQL: ordered migrations expose the expected constraints", async () => {
  const names = (
    await pool.query(
      "SELECT conname FROM pg_constraint WHERE connamespace = current_schema()::regnamespace",
    )
  ).rows.map((row) => row.conname);
  for (const name of [
    "Booking_core_no_overlap",
    "Booking_core_complete_check",
    "LegacyStripeOperation_link_check",
    "BookingCommand_bookingId_barbershopId_fkey",
  ])
    assert.ok(names.includes(name), name);
});

test("PostgreSQL: Stripe event/session/intent/charge uniqueness is persistent", async () => {
  await pool.query(
    'INSERT INTO "LegacyStripeEvent" (id,type,payload) VALUES ($1,$2,$3)',
    ["evt_synthetic", "checkout.session.completed", {}],
  );
  await assert.rejects(
    pool.query(
      'INSERT INTO "LegacyStripeEvent" (id,type,payload) VALUES ($1,$2,$3)',
      ["evt_synthetic", "checkout.session.completed", {}],
    ),
    sqlError("23505"),
  );
  await pool.query(
    'INSERT INTO "LegacyStripeOperation" ("sessionId","paymentIntentId","chargeId",status,"paymentStatus",livemode) VALUES ($1,$2,$3,$4,$5,false)',
    ["cs_synthetic", "pi_synthetic", "ch_synthetic", "WAITING", "unpaid"],
  );
  for (const values of [
    ["cs_synthetic", null, null],
    ["cs_other", "pi_synthetic", null],
    ["cs_third", null, "ch_synthetic"],
  ]) {
    await assert.rejects(
      pool.query(
        'INSERT INTO "LegacyStripeOperation" ("sessionId","paymentIntentId","chargeId",status,"paymentStatus",livemode) VALUES ($1,$2,$3,$4,$5,false)',
        [...values, "WAITING", "unpaid"],
      ),
      sqlError("23505"),
    );
  }
  const result = await Promise.allSettled(
    [1, 2].map(() =>
      pool.query(
        'INSERT INTO "LegacyStripeOperation" ("sessionId",status,"paymentStatus",livemode) VALUES ($1,$2,$3,false)',
        ["cs_race", "WAITING", "unpaid"],
      ),
    ),
  );
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 1);
});

test("PostgreSQL: transaction failure leaves no inserted event", async () => {
  await assert.rejects(
    database.$transaction(async (tx) => {
      await tx.$queryRaw`INSERT INTO "LegacyStripeEvent" (id,type,payload) VALUES ('evt_rollback','synthetic','{}') RETURNING id`;
      throw new Error("synthetic rollback");
    }),
    /synthetic rollback/,
  );
  assert.equal(await count("LegacyStripeEvent", "evt_rollback"), 0);
});

test("PostgreSQL: two real connections cannot create conflicting appointments", async () => {
  const input = request();
  const result = await Promise.allSettled([
    customer.createCustomerBooking(input, randomUUID()),
    other.createCustomerBooking(input, randomUUID()),
  ]);
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(result.filter((row) => row.status === "rejected").length, 1);
});

test("PostgreSQL: adjacent bookings are accepted", async () => {
  const input = request();
  const result = await Promise.all([
    customer.createCustomerBooking(input, randomUUID()),
    other.createCustomerBooking({ ...input, localTime: "10:30" }, randomUUID()),
  ]);
  assert.notEqual(result[0].id, result[1].id);
});

test("PostgreSQL: direct conflicting protected INSERT is rejected by exclusion", async () => {
  const saved = await customer.createCustomerBooking(request(), randomUUID());
  await assert.rejects(
    pool.query(
      `INSERT INTO "Booking" (id,"userId","barbershopId","serviceId","professionalId",date,"endsAt",status,cancelled,"priceInCentsSnapshot","durationMinutesSnapshot","timeZoneSnapshot","managedByCore")
    SELECT $1,"userId","barbershopId","serviceId","professionalId",date,"endsAt",status,cancelled,"priceInCentsSnapshot","durationMinutesSnapshot","timeZoneSnapshot",true FROM "Booking" WHERE id=$2`,
      [randomUUID(), saved.id],
    ),
    sqlError("23P01"),
  );
});

test("PostgreSQL: cancellation releases protected interval without deleting history", async () => {
  const input = request();
  const old = await customer.createCustomerBooking(input, randomUUID());
  await pool.query(
    'UPDATE "Booking" SET status=$1,cancelled=true,"cancelledAt"=CURRENT_TIMESTAMP WHERE id=$2',
    ["CANCELLED", old.id],
  );
  const fresh = await other.createCustomerBooking(input, randomUUID());
  assert.notEqual(old.id, fresh.id);
  assert.equal(await count("Booking", old.id), 1);
});

test("PostgreSQL: booking and block share a real serialization protocol", async () => {
  const input = request();
  const result = await Promise.allSettled([
    customer.createCustomerBooking(input, randomUUID()),
    owner.createScheduleBlock({
      barbershopId: id.shop,
      professionalId: id.pro,
      startsAt: new Date(`${input.localDate}T10:00:00Z`),
      endsAt: new Date(`${input.localDate}T11:00:00Z`),
      kind: "ABSENCE",
    }),
  ]);
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 1);
});

test("PostgreSQL: membership and related entity IDs cannot cross tenants", async () => {
  const foreign = {
    ...request(),
    barbershopId: id.foreignShop,
    serviceId: id.foreignService,
    professionalId: id.foreignPro,
  };
  await assert.rejects(
    owner.createStaffBooking(foreign, randomUUID(), id.customer),
    (error) => error.code === "FORBIDDEN",
  );
  await assert.rejects(
    customer.createCustomerBooking(
      { ...request(), serviceId: id.foreignService },
      randomUUID(),
    ),
    (error) => error.code === "ENTITY_NOT_FOUND",
  );
  assert.equal(
    await customer.reader.findCustomerBooking({
      barbershopId: id.foreignShop,
      bookingId: id.legacy,
      userId: id.customer,
    }),
    null,
  );
});

test("PostgreSQL: concurrent idempotent creation and replay return one persisted booking", async () => {
  const input = request();
  const key = randomUUID();
  const [a, b] = await Promise.all([
    customer.createCustomerBooking(input, key),
    customer.createCustomerBooking(input, key),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(await count("Booking", a.id), 1);
  assert.equal((await customer.createCustomerBooking(input, key)).id, a.id); // response lost after commit
  await assert.rejects(
    customer.createCustomerBooking({ ...input, localTime: "11:00" }, key),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("PostgreSQL: failure before command commit rolls booking back", async () => {
  const input = request();
  const failing = {
    ...database,
    $transaction: (work, options) =>
      database.$transaction(
        (tx) =>
          work({
            $queryRaw: (parts, ...values) => {
              if (parts.join("").includes('INSERT INTO "BookingCommand"'))
                throw new Error("synthetic command failure");
              return tx.$queryRaw(parts, ...values);
            },
          }),
        options,
      ),
  };
  await assert.rejects(
    loadAdapter(failing, id.customer).createCustomerBooking(
      input,
      randomUUID(),
    ),
    /command failure/,
  );
  assert.equal(
    Number(
      (
        await pool.query('SELECT count(*) FROM "Booking" WHERE date=$1', [
          new Date(`${input.localDate}T10:00:00Z`),
        ])
      ).rows[0].count,
    ),
    0,
  );
  await customer.createCustomerBooking(input, randomUUID());
});

test("PostgreSQL: out-of-order/replayed command cannot undo cancellation", async () => {
  const input = request();
  const key = randomUUID();
  const saved = await customer.createCustomerBooking(input, key);
  await pool.query(
    'UPDATE "Booking" SET status=$1,cancelled=true WHERE id=$2',
    ["CANCELLED", saved.id],
  );
  const replay = await customer.createCustomerBooking(input, key);
  assert.equal(replay.id, saved.id);
  assert.equal(replay.status, "CANCELLED");
});

test("PostgreSQL: baseline legacy fields remain unchanged", async () => {
  const after = (
    await pool.query(
      'SELECT id,"serviceId","barbershopId","userId",date,cancelled,"stripeChargeId" FROM "Booking" WHERE id=$1',
      [id.legacy],
    )
  ).rows[0];
  assert.deepEqual(after, legacyBefore);
  const expanded = (
    await pool.query(
      'SELECT "professionalId","endsAt",status,"priceInCentsSnapshot","durationMinutesSnapshot","managedByCore" FROM "Booking" WHERE id=$1',
      [id.legacy],
    )
  ).rows[0];
  assert.equal(expanded.managedByCore, false);
  for (const key of [
    "professionalId",
    "endsAt",
    "status",
    "priceInCentsSnapshot",
    "durationMinutesSnapshot",
  ])
    assert.equal(expanded[key], null);
});

test("PostgreSQL: real inbox keeps unmatched paid events in REVIEW and replays safely", async () => {
  const legacy = loadLegacy(database);
  const session = {
    id: "cs_unmatched_synthetic",
    livemode: false,
    mode: "payment",
    payment_status: "paid",
    amount_total: 6550,
    currency: "brl",
    metadata: {},
    payment_intent: {
      id: "pi_unmatched_synthetic",
      latest_charge: { id: "ch_unmatched_synthetic" },
    },
  };
  const event = {
    id: "evt_unmatched_synthetic",
    livemode: false,
    type: "checkout.session.completed",
    data: { object: session },
  };
  const stripe = { checkout: { sessions: { retrieve: async () => session } } };
  assert.equal(await legacy.receiveLegacyStripeEvent(event, stripe), "REVIEW");
  assert.equal(await legacy.receiveLegacyStripeEvent(event, stripe), "REVIEW");
  assert.equal(
    await legacy.receiveLegacyStripeEvent(
      { ...event, id: "evt_late_synthetic", type: "checkout.session.expired" },
      stripe,
    ),
    "REVIEW",
  );
  const op = (
    await pool.query(
      'SELECT * FROM "LegacyStripeOperation" WHERE "sessionId"=$1',
      [session.id],
    )
  ).rows[0];
  assert.equal(op.reviewReason, "BOOKING_CORE_UNAVAILABLE");
  assert.equal(op.amountTotal, 6550);
  assert.equal(op.bookingId, null);
  assert.equal(
    Number(
      (
        await pool.query(
          'SELECT count(*) FROM "LegacyStripeAttempt" WHERE "eventId"=$1',
          [event.id],
        )
      ).rows[0].count,
    ),
    2,
  );
});

test("PostgreSQL: incomplete active legacy booking requires review, not a fictional backfill", async () => {
  const input = request();
  const legacyId = randomUUID();
  await pool.query(
    'INSERT INTO "Booking" (id,"serviceId","barbershopId","userId",date) VALUES ($1,$2,$3,$4,$5)',
    [
      legacyId,
      id.service,
      id.shop,
      id.customer,
      new Date(`${input.localDate}T09:00:00Z`),
    ],
  );
  try {
    await assert.rejects(
      customer.createCustomerBooking(input, randomUUID()),
      (error) => error.code === "LEGACY_DATA_REQUIRES_REVIEW",
    );
    assert.equal(
      (
        await pool.query('SELECT "endsAt" FROM "Booking" WHERE id=$1', [
          legacyId,
        ])
      ).rows[0].endsAt,
      null,
    );
  } finally {
    // Synthetic fixture cancellation, not data repair or deletion.
    await pool.query('UPDATE "Booking" SET cancelled=true WHERE id=$1', [
      legacyId,
    ]);
  }
});
