import test from "node:test";
import assert from "node:assert/strict";
import { createDemoBarbershop } from "../app/admin/_lib/demo-barbershop";
import {
  saveDemoProfessional,
  setDemoProfessionalActive,
} from "../app/admin/profissionais/_lib/professional";
import {
  addDemoBlock,
  removeDemoBlock,
  emptyWeek,
  cloneWeek,
  validateWeek,
  saveDemoWeek,
  effectiveWindows,
  previewDemoAvailability,
  demoWorkingHours,
  type DaySchedule,
  type TimeRange,
} from "../app/admin/horarios/_lib/schedule";

const input = {
  name: "Barbearia Fictícia",
  phone: "11900000000",
  address: "Rua Exemplo, 100",
  description: "Dados fictícios para testes de horários.",
};
const date = "2030-01-07"; // Monday, civil date in America/Sao_Paulo.
const now = new Date("2030-01-01T12:00:00Z");
function week(
  windows: TimeRange[] = [{ start: "09:00", end: "18:00" }],
  breaks: TimeRange[] = [],
): DaySchedule[] {
  return emptyWeek().map((day) =>
    day.weekday === 1 ? { ...day, windows, breaks } : day,
  );
}
function fixture() {
  const a = createDemoBarbershop(input, "demo-a"),
    b = createDemoBarbershop(input, "demo-b");
  let shops = saveDemoProfessional(
    [a, b],
    a.id,
    "demo-p",
    {
      name: "Profissional Exemplo",
      description: "Profissional fictício.",
      phone: "",
      photoUrl: "",
      active: true,
      serviceIds: [a.services[0].id, a.services[2].id],
    },
    false,
  );
  shops = saveDemoWeek(
    shops,
    a.id,
    null,
    week(undefined, [{ start: "12:00", end: "13:00" }]),
  );
  shops = saveDemoWeek(
    shops,
    a.id,
    "demo-p",
    week(
      [{ start: "10:00", end: "17:00" }],
      [{ start: "15:00", end: "15:30" }],
    ),
  );
  return {
    shops,
    shopId: a.id,
    serviceId: a.services[0].id,
    longServiceId: a.services[2].id,
  };
}
const labels = (slots: ReturnType<typeof previewDemoAvailability>) =>
  slots.map((slot) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(slot.startsAt),
  );

test("schedule: rejects inverted, malformed, overlapping periods and pauses outside opening hours", () => {
  for (const invalid of [
    week([{ start: "18:00", end: "09:00" }]),
    week([{ start: "09:00", end: "09:00" }]),
    week([{ start: "24:00", end: "25:00" }]),
    week([
      { start: "09:00", end: "12:00" },
      { start: "11:00", end: "13:00" },
    ]),
    week(undefined, [
      { start: "12:00", end: "13:00" },
      { start: "12:30", end: "13:30" },
    ]),
    week(undefined, [{ start: "17:00", end: "19:00" }]),
    week([], [{ start: "12:00", end: "13:00" }]),
    emptyWeek().slice(1),
    [...emptyWeek().slice(1), emptyWeek()[1]],
  ])
    assert.throws(() => validateWeek(invalid));
  assert.doesNotThrow(() =>
    validateWeek(
      week([
        { start: "09:00", end: "12:00" },
        { start: "12:00", end: "18:00" },
      ]),
    ),
  );
  assert.deepEqual(
    effectiveWindows(week(undefined, [{ start: "12:00", end: "13:00" }])[1]),
    [
      { start: 540, end: 720 },
      { start: 780, end: 1080 },
    ],
  );
});
test("schedule: professional must fit shop; changing opening hours cannot invalidate saved staff", () => {
  const f = fixture();
  const original = cloneWeek(f.shops[0].schedule.shopWeek);
  assert.throws(() =>
    saveDemoWeek(
      f.shops,
      f.shopId,
      "demo-p",
      week([{ start: "08:00", end: "17:00" }]),
    ),
  );
  assert.throws(() =>
    validateWeek(
      week([{ start: "09:00", end: "18:00" }]),
      week([
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "18:00" },
      ]),
    ),
  );
  assert.doesNotThrow(() => saveDemoWeek(f.shops, f.shopId, "demo-p", week()));
  assert.throws(
    () =>
      saveDemoWeek(
        f.shops,
        f.shopId,
        null,
        week([{ start: "09:00", end: "12:00" }]),
      ),
    /Ajuste primeiro/,
  );
  assert.deepEqual(f.shops[0].schedule.shopWeek, original);
  assert.throws(
    () => saveDemoWeek(f.shops, "demo-b", "demo-p", emptyWeek()),
    /não pertence/,
  );
  const changed = saveDemoWeek(f.shops, f.shopId, "demo-p", emptyWeek());
  assert.equal(changed[1], f.shops[1]);
  assert.deepEqual(
    previewDemoAvailability(changed[0], "demo-p", f.serviceId, date, now),
    [],
  );
  assert.ok(
    demoWorkingHours(f.shops[0]).every((row) => row.barbershopId === f.shopId),
  );
});
test("availability demo: reuses core duration, shop pauses and professional pauses with adjacent intervals", () => {
  const f = fixture();
  const short = labels(
    previewDemoAvailability(f.shops[0], "demo-p", f.serviceId, date, now),
  );
  for (const value of ["10:00", "11:30", "13:00", "14:30", "15:30", "16:30"])
    assert.ok(short.includes(value));
  for (const value of ["09:00", "12:00", "12:30", "15:00", "17:00"])
    assert.equal(short.includes(value), false);
  const long = labels(
    previewDemoAvailability(f.shops[0], "demo-p", f.longServiceId, date, now),
  );
  assert.ok(long.includes("11:00"));
  assert.equal(long.includes("11:30"), false);
  assert.equal(long.includes("16:30"), false);
  const inactive = setDemoProfessionalActive(
    f.shops,
    f.shopId,
    "demo-p",
    false,
  );
  assert.deepEqual(
    previewDemoAvailability(inactive[0], "demo-p", f.serviceId, date, now),
    [],
  );
  assert.deepEqual(
    previewDemoAvailability(
      f.shops[0],
      "demo-p",
      f.serviceId,
      date,
      new Date("2030-01-08T12:00:00Z"),
    ),
    [],
  );
});
test("blocks: inclusive all-day dates map to exclusive UTC ends and remove availability", () => {
  const f = fixture();
  const blocked = addDemoBlock(f.shops, f.shopId, "holiday", {
    professionalId: null,
    start: date,
    end: date,
    allDay: true,
    kind: "EXTRAORDINARY",
    reason: "Feriado fictício",
  });
  assert.equal(
    blocked[0].schedule.blocks[0].startsAt,
    "2030-01-07T03:00:00.000Z",
  );
  assert.equal(
    blocked[0].schedule.blocks[0].endsAt,
    "2030-01-08T03:00:00.000Z",
  );
  assert.deepEqual(
    previewDemoAvailability(blocked[0], "demo-p", f.serviceId, date, now),
    [],
  );
  assert.equal(blocked[1], f.shops[1]);
  assert.equal(f.shops[0].schedule.blocks.length, 0);
  assert.throws(() => removeDemoBlock(blocked, "demo-b", "holiday"));
  assert.equal(
    removeDemoBlock(blocked, f.shopId, "holiday")[0].schedule.blocks.length,
    0,
  );
});
test("blocks: validates scope, dates, overlap; allows adjacency and distinct scopes", () => {
  const f = fixture();
  const input = {
    professionalId: "demo-p",
    start: `${date}T10:00`,
    end: `${date}T11:00`,
    allDay: false,
    kind: "ABSENCE" as const,
    reason: "Folga fictícia",
  };
  const blocked = addDemoBlock(f.shops, f.shopId, "block", input);
  const slots = labels(
    previewDemoAvailability(blocked[0], "demo-p", f.serviceId, date, now),
  );
  assert.equal(slots.includes("10:00"), false);
  assert.equal(slots.includes("10:30"), false);
  assert.ok(slots.includes("11:00"));
  assert.throws(
    () => addDemoBlock(blocked, f.shopId, "overlap", input),
    /sobreposto/,
  );
  assert.doesNotThrow(() =>
    addDemoBlock(blocked, f.shopId, "adjacent", {
      ...input,
      start: `${date}T11:00`,
      end: `${date}T12:00`,
    }),
  );
  assert.doesNotThrow(() =>
    addDemoBlock(blocked, f.shopId, "shop-block", {
      ...input,
      professionalId: null,
    }),
  );
  for (const changes of [
    { professionalId: "unknown" },
    { start: `${date}T11:00` },
    { start: "2030-02-30T10:00" },
    { end: "" },
    { reason: "" },
  ])
    assert.throws(() =>
      addDemoBlock(f.shops, f.shopId, "invalid", { ...input, ...changes }),
    );
  assert.throws(() =>
    addDemoBlock(f.shops, f.shopId, "reversed", {
      ...input,
      allDay: true,
      start: "2030-01-09",
      end: "2030-01-07",
    }),
  );
});
