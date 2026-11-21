import test from "node:test";
import assert from "node:assert/strict";
import { loadProduction } from "./load-production.mjs";

const rules = loadProduction("lib/bookings/rules.ts", {});
const timezone = loadProduction("lib/bookings/timezone.ts", {});
const availability = loadProduction("lib/bookings/availability.ts", {});
const shop = "shop-a";
const pro = "pro-a";
const request = {
  barbershopId: shop,
  professionalId: pro,
  serviceId: "service-a",
  localDate: "2030-01-07",
};
const now = () => new Date("2030-01-01T00:00:00Z");
const at = (time) => new Date(`2030-01-07T${time}:00Z`);
const interval = (start, end) => ({ startsAt: at(start), endsAt: at(end) });
const busy = (start = "10:00", end = "10:30", status = "CONFIRMED") => ({
  barbershopId: shop,
  professionalId: pro,
  date: at(start),
  endsAt: end ? at(end) : null,
  status,
  cancelled: false,
});
function snapshot() {
  return {
    barbershopId: shop,
    timeZone: "UTC",
    service: {
      id: "service-a",
      barbershopId: shop,
      durationMinutes: 30,
      priceInCents: 6550,
    },
    professional: { id: pro, barbershopId: shop, active: true },
    assignment: {
      barbershopId: shop,
      professionalId: pro,
      serviceId: "service-a",
    },
    workingHours: [
      {
        barbershopId: shop,
        professionalId: null,
        weekday: 1,
        startMinute: 540,
        endMinute: 720,
      },
      {
        barbershopId: shop,
        professionalId: null,
        weekday: 1,
        startMinute: 780,
        endMinute: 1080,
      },
      {
        barbershopId: shop,
        professionalId: pro,
        weekday: 1,
        startMinute: 600,
        endMinute: 1020,
      },
    ],
    blocks: [],
    bookings: [],
  };
}
const throwsCode = (callback, code) =>
  assert.throws(callback, (error) => error.code === code);
const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);
const validate = (localTime, data = snapshot(), clock = now()) =>
  availability.validateBookingRequest({ ...request, localTime }, data, clock);
const times = (data = snapshot(), clock = now()) =>
  availability
    .calculateAvailability(request, data, clock)
    .map((slot) => slot.startsAt.toISOString().slice(11, 16));

test("booking rules: adjacent half-open intervals do not conflict", () => {
  assert.equal(
    rules.overlaps(interval("10:00", "10:30"), interval("10:30", "11:00")),
    false,
  );
});

test("booking rules: partial, enclosing and same-start intervals conflict symmetrically", () => {
  for (const other of [
    interval("10:15", "10:45"),
    interval("09:00", "12:00"),
    interval("10:00", "11:00"),
  ]) {
    assert.equal(rules.overlaps(interval("10:00", "10:30"), other), true);
    assert.equal(rules.overlaps(other, interval("10:00", "10:30")), true);
  }
});

test("booking rules: invalid, zero, fractional or unknown duration is rejected", () => {
  for (const minutes of [null, 0, -1, 1.5, NaN, Infinity])
    throwsCode(
      () => rules.intervalFor(at("10:00"), minutes),
      "INVALID_DURATION",
    );
  assert.equal(
    rules.intervalFor(at("10:00"), 45).endsAt.toISOString(),
    at("10:45").toISOString(),
  );
  throwsCode(
    () => rules.intervalFor(new Date("invalid"), 30),
    "INVALID_INSTANT",
  );
  throwsCode(
    () =>
      rules.overlaps(interval("10:00", "10:00"), interval("11:00", "12:00")),
    "INVALID_INTERVAL",
  );
});

test("availability: shop/professional intersection and recurring lunch pause", () => {
  const slots = times();
  assert.equal(slots.includes("09:00"), false);
  assert.equal(slots.includes("10:00"), true);
  assert.equal(slots.includes("12:00"), false);
  assert.equal(slots.includes("12:30"), false);
  assert.equal(slots.includes("16:30"), true);
  assert.equal(slots.includes("17:00"), false);
  throwsCode(() => validate("11:45"), "UNAVAILABLE_SLOT");
});

test("availability: different service durations cannot overrun a window", () => {
  validate("11:30");
  const data = snapshot();
  data.service.durationMinutes = 45;
  throwsCode(() => validate("11:30", data), "UNAVAILABLE_SLOT");
  assert.equal(
    validate("11:15", data).endsAt.toISOString(),
    at("12:00").toISOString(),
  );
});

test("availability: absent professional/shop hours or closed weekday offers no slots", () => {
  for (const professionalId of [null, pro]) {
    const data = snapshot();
    data.workingHours = data.workingHours.filter(
      (row) => row.professionalId !== professionalId,
    );
    assert.equal(times(data).length, 0);
  }
  assert.equal(
    availability.calculateAvailability(
      { ...request, localDate: "2030-01-06" },
      snapshot(),
      now(),
    ).length,
    0,
  );
});

test("availability: invalid schedule, inactive professional and missing duration fail closed", () => {
  const data = snapshot();
  data.professional.active = false;
  throwsCode(() => times(data), "INACTIVE_PROFESSIONAL");
  data.professional.active = true;
  data.service.durationMinutes = null;
  throwsCode(() => times(data), "INVALID_DURATION");
  data.service.durationMinutes = 30;
  data.workingHours[0].endMinute = 1441;
  throwsCode(() => times(data), "INVALID_WORKING_HOURS");
});

test("availability: adjoining/overlapping opening windows are normalized without false pauses", () => {
  const data = snapshot();
  data.workingHours.push({
    ...data.workingHours[0],
    startMinute: 720,
    endMinute: 780,
  });
  validate("11:45", data);
});

test("availability: breaks, absences and extraordinary shop blocks occupy full intervals", () => {
  for (const professionalId of [pro, null]) {
    const data = snapshot();
    data.blocks = [
      { barbershopId: shop, professionalId, ...interval("10:15", "11:00") },
    ];
    throwsCode(() => validate("10:00", data), "UNAVAILABLE_SLOT");
    validate("11:00", data);
  }
  const data = snapshot();
  data.blocks = [
    {
      barbershopId: shop,
      professionalId: "pro-b",
      ...interval("10:00", "11:00"),
    },
  ];
  validate("10:00", data);
});

test("availability: cancelled bookings do not occupy, including legacy cancellation", () => {
  for (const booking of [
    busy("10:00", "10:30", "CANCELLED"),
    { ...busy("10:00", null, null), cancelled: true },
  ]) {
    const data = snapshot();
    data.bookings = [booking];
    validate("10:00", data);
  }
});

test("availability: completed/no-show bookings preserve occupancy; dates do not infer completion", () => {
  for (const status of ["COMPLETED", "NO_SHOW", "CONFIRMED", null]) {
    const data = snapshot();
    data.bookings = [busy("10:00", "10:30", status)];
    throwsCode(() => validate("10:00", data), "UNAVAILABLE_SLOT");
    validate("10:30", data);
    assert.equal(data.bookings[0].status, status);
  }
});

test("availability: unknown legacy end requires review without invented duration", () => {
  const data = snapshot();
  data.bookings = [busy("10:00", null, null)];
  throwsCode(() => times(data), "LEGACY_DATA_REQUIRES_REVIEW");
  data.bookings[0].date = new Date("2020-01-01T00:00:00Z");
  throwsCode(() => times(data), "LEGACY_DATA_REQUIRES_REVIEW");
  assert.equal(data.bookings[0].endsAt, null);
});

test("availability: unknown legacy professional blocks all professionals conservatively", () => {
  const data = snapshot();
  data.bookings = [{ ...busy(), professionalId: null }];
  throwsCode(() => validate("10:00", data), "UNAVAILABLE_SLOT");
});

test("availability: starts in the past or exactly now are rejected", () => {
  for (const clock of [at("10:00"), at("10:01")])
    throwsCode(() => validate("10:00", snapshot(), clock), "PAST_START");
  assert.equal(times(snapshot(), at("10:00")).includes("10:00"), false);
});

test("availability: ambiguous legacy flags and absent schedule scope cannot silently free time", () => {
  const data = snapshot();
  data.bookings = [{ ...busy(), cancelled: true }];
  throwsCode(() => times(data), "INCONSISTENT_BOOKING_STATUS");
  data.bookings = [];
  data.blocks = [{ ...interval("10:00", "11:00"), barbershopId: shop }];
  throwsCode(() => times(data), "INVALID_SCHEDULE_SCOPE");
});

test("availability: service, professional, assignment and supplied records must belong to requested tenant", () => {
  for (const alter of [
    (data) => {
      data.service.barbershopId = "shop-b";
    },
    (data) => {
      data.professional.barbershopId = "shop-b";
    },
    (data) => {
      data.assignment.serviceId = "service-b";
    },
    (data) => {
      data.bookings = [{ ...busy(), barbershopId: "shop-b" }];
    },
    (data) => {
      data.workingHours[0].barbershopId = "shop-b";
    },
    (data) => {
      data.blocks = [
        {
          ...interval("10:00", "11:00"),
          professionalId: pro,
          barbershopId: "shop-b",
        },
      ];
    },
  ]) {
    const data = snapshot();
    alter(data);
    throwsCode(() => times(data), "TENANT_MISMATCH");
  }
});

test("timezone: local Sao Paulo time maps to an instant independent of server TZ", () => {
  assert.equal(
    timezone
      .localTimeToInstant("2030-01-07", "10:00", "America/Sao_Paulo")
      .toISOString(),
    "2030-01-07T13:00:00.000Z",
  );
  assert.equal(
    timezone.localDateAt(new Date("2030-01-07T01:00:00Z"), "America/Sao_Paulo"),
    "2030-01-06",
  );
  const data = snapshot();
  data.timeZone = "America/Sao_Paulo";
  assert.equal(
    validate("10:00", data).startsAt.toISOString(),
    "2030-01-07T13:00:00.000Z",
  );
});

test("timezone: invalid civil dates, times, missing/invalid zones are rejected", () => {
  for (const value of ["2030-02-30", "2030-13-01", "2030-1-01"])
    throwsCode(
      () => timezone.localTimeToInstant(value, "10:00", "UTC"),
      "INVALID_LOCAL_DATE",
    );
  for (const value of ["24:00", "10:60", "10:00:00"])
    throwsCode(
      () => timezone.localTimeToInstant("2030-01-07", value, "UTC"),
      "INVALID_LOCAL_TIME",
    );
  for (const zone of [null, "", "Invalid/Zone", "+03:00"])
    throwsCode(
      () => timezone.localTimeToInstant("2030-01-07", "10:00", zone),
      "INVALID_TIME_ZONE",
    );
});

test("timezone: DST gaps and folds are rejected explicitly, including historical Sao Paulo", () => {
  throwsCode(
    () =>
      timezone.localTimeToInstant("2026-03-08", "02:30", "America/New_York"),
    "NONEXISTENT_LOCAL_TIME",
  );
  throwsCode(
    () =>
      timezone.localTimeToInstant("2026-11-01", "01:30", "America/New_York"),
    "AMBIGUOUS_LOCAL_TIME",
  );
  throwsCode(
    () =>
      timezone.localTimeToInstant("2018-11-04", "00:30", "America/Sao_Paulo"),
    "NONEXISTENT_LOCAL_TIME",
  );
});

test("timezone: fractional offsets, half-hour DST and skipped civil day are handled", () => {
  assert.equal(
    timezone
      .localTimeToInstant("2030-01-07", "10:00", "Asia/Kathmandu")
      .toISOString(),
    "2030-01-07T04:15:00.000Z",
  );
  throwsCode(
    () =>
      timezone.localTimeToInstant("2026-04-05", "01:45", "Australia/Lord_Howe"),
    "AMBIGUOUS_LOCAL_TIME",
  );
  throwsCode(
    () =>
      timezone.localTimeToInstant("2026-10-04", "02:15", "Australia/Lord_Howe"),
    "NONEXISTENT_LOCAL_TIME",
  );
  throwsCode(
    () => timezone.localTimeToInstant("2011-12-30", "10:00", "Pacific/Apia"),
    "NONEXISTENT_LOCAL_TIME",
  );
});

test("availability: DST day skips ambiguous/nonexistent starts without normalization", () => {
  for (const localDate of ["2026-03-08", "2026-11-01"]) {
    const data = snapshot();
    data.timeZone = "America/New_York";
    data.workingHours = [null, pro].map((professionalId) => ({
      barbershopId: shop,
      professionalId,
      weekday: 0,
      startMinute: 0,
      endMinute: 240,
    }));
    const slots = availability.calculateAvailability(
      { ...request, localDate },
      data,
      new Date("2026-01-01T00:00:00Z"),
    );
    assert.ok(slots.length > 0);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: data.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const excludedHour = localDate.includes("03-08") ? "02:" : "01:";
    assert.equal(
      slots.some((slot) => fmt.format(slot.startsAt).startsWith(excludedHour)),
      false,
    );
  }
});

function coreFixture({
  authenticated = true,
  staffAllowed = false,
  privateBooking = null,
  data = snapshot(),
} = {}) {
  const calls = [];
  const auth = {
    requireAuthenticatedUser: async () => {
      calls.push("authenticate");
      if (!authenticated) throw new Error("UNAUTHENTICATED");
      return { userId: "customer-a" };
    },
    requireBarbershopPermission: async (barbershopId, permission) => {
      calls.push([barbershopId, permission]);
      if (!staffAllowed) throw new Error("FORBIDDEN");
      return { userId: "staff-a" };
    },
  };
  const { createBookingCore } = loadProduction("lib/bookings/core.ts", {
    "server-only": {},
    "@/lib/authorization": auth,
  });
  const reader = {
    loadAvailability: async () => {
      calls.push("load");
      return data;
    },
    findCustomerBooking: async (scope) => {
      calls.push(scope);
      return privateBooking;
    },
    findStaffBooking: async (scope) => {
      calls.push(scope);
      return privateBooking;
    },
  };
  return { core: createBookingCore(reader, now), calls };
}

test("booking core: public availability requires no authentication/membership and exposes only slots", async () => {
  const { core, calls } = coreFixture({ authenticated: false });
  const slots = await core.getPublicAvailability(request);
  assert.ok(slots.length > 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "load");
  assert.deepEqual(Object.keys(slots[0]).sort(), ["endsAt", "startsAt"]);
});

test("booking core: customer reservation validation needs authentication but no membership/checkout", async () => {
  const { core, calls } = coreFixture();
  const result = await core.validateCustomerRequest({
    ...request,
    localTime: "10:00",
    userId: "victim",
    role: "OWNER",
  });
  assert.equal(result.actor.userId, "customer-a");
  assert.equal(result.candidate.priceInCentsSnapshot, 6550);
  assert.equal(result.candidate.durationMinutesSnapshot, 30);
  assert.deepEqual(calls, ["authenticate", "load"]);
  await assert.rejects(
    coreFixture({ authenticated: false }).core.validateCustomerRequest({
      ...request,
      localTime: "10:00",
    }),
    /UNAUTHENTICATED/,
  );
});

test("booking core: staff needs permission before reading the snapshot", async () => {
  const f = coreFixture();
  await assert.rejects(
    f.core.validateStaffRequest({ ...request, localTime: "10:00" }),
    /FORBIDDEN/,
  );
  assert.equal(f.calls.includes("load"), false);
  const result = await coreFixture({
    staffAllowed: true,
  }).core.validateStaffRequest({ ...request, localTime: "10:00" });
  assert.equal(result.actor.kind, "staff");
});

test("booking core: customer/global administrator has no bypass to another customer's booking", async () => {
  const privateBooking = {
    ...busy(),
    id: "booking-a",
    userId: "customer-b",
    serviceId: "service-a",
    stripeChargeId: "private-charge",
  };
  const f = coreFixture({ privateBooking });
  await rejectsCode(
    f.core.getCustomerBooking(shop, "booking-a"),
    "BOOKING_NOT_FOUND",
  );
  assert.equal(f.calls.at(-1).userId, "customer-a");
  await assert.rejects(f.core.getStaffBooking(shop, "booking-a"), /FORBIDDEN/);
});

test("booking core: own booking projection omits financial references and does not infer completion", async () => {
  const f = coreFixture({
    privateBooking: {
      ...busy(),
      id: "booking-a",
      userId: "customer-a",
      serviceId: "service-a",
      stripeChargeId: "private-charge",
    },
  });
  const result = await f.core.getCustomerBooking(shop, "booking-a");
  assert.equal(Object.hasOwn(result, "stripeChargeId"), false);
  assert.equal(result.status, "CONFIRMED");
});

test("booking core: even a faulty reader cannot return a private booking from another tenant", async () => {
  const f = coreFixture({
    staffAllowed: true,
    privateBooking: {
      ...busy(),
      barbershopId: "shop-b",
      id: "booking-a",
      userId: "customer-a",
      serviceId: "service-a",
    },
  });
  await rejectsCode(
    f.core.getStaffBooking(shop, "booking-a"),
    "BOOKING_NOT_FOUND",
  );
});
