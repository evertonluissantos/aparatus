import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBarbershop,
  updateDemoServices,
} from "../app/admin/_lib/demo-barbershop";
import {
  saveDemoProfessional,
  setDemoProfessionalActive,
} from "../app/admin/profissionais/_lib/professional";
import {
  emptyWeek,
  saveDemoWeek,
  addDemoBlock,
  previewDemoAvailability,
} from "../app/admin/horarios/_lib/schedule";
import {
  createDemoAppointment,
  changeDemoAppointmentStatus,
  dailyDemoAppointments,
  shiftAgendaDate,
  type AppointmentInput,
} from "../app/admin/agenda/_lib/appointment";

const now = new Date("2030-01-01T12:00:00Z"),
  date = "2030-01-07";
const shopInput = {
  name: "Barbearia Fictícia",
  phone: "11900000000",
  address: "Rua Exemplo, 100",
  description: "Dados fictícios para testes da agenda.",
};
const week = () =>
  emptyWeek().map((day) =>
    day.weekday === 1
      ? {
          ...day,
          windows: [{ start: "09:00", end: "18:00" }],
          breaks: [{ start: "12:00", end: "13:00" }],
        }
      : day,
  );
function fixture() {
  const a = createDemoBarbershop(shopInput, "demo-a"),
    b = createDemoBarbershop(shopInput, "demo-b");
  const person = {
    name: "Profissional Fictício",
    description: "Somente dados de exemplo.",
    phone: "",
    photoUrl: "",
    active: true,
    serviceIds: [a.services[0].id, a.services[2].id],
  };
  let shops = saveDemoProfessional([a, b], a.id, "demo-p1", person, false);
  shops = saveDemoProfessional(
    shops,
    a.id,
    "demo-p2",
    { ...person, name: "Outro Exemplo" },
    false,
  );
  shops = saveDemoWeek(shops, a.id, null, week());
  shops = saveDemoWeek(shops, a.id, "demo-p1", week());
  shops = saveDemoWeek(shops, a.id, "demo-p2", week());
  const input: AppointmentInput = {
    clientName: "Cliente Fictício",
    serviceId: a.services[0].id,
    professionalId: "demo-p1",
    localDate: date,
    localTime: "10:00",
  };
  return { shops, a, b, person, input };
}
test("agenda: rejects overlapping intervals, accepts adjacent and independent professionals", () => {
  const f = fixture();
  const first = createDemoAppointment(f.shops, f.a.id, "a1", f.input, now);
  assert.throws(
    () =>
      createDemoAppointment(
        first,
        f.a.id,
        "a2",
        { ...f.input, localTime: "10:15" },
        now,
      ),
    /indisponível/,
  );
  const adjacent = createDemoAppointment(
    first,
    f.a.id,
    "a2",
    { ...f.input, localTime: "10:30" },
    now,
  );
  const other = createDemoAppointment(
    adjacent,
    f.a.id,
    "a3",
    { ...f.input, professionalId: "demo-p2" },
    now,
  );
  assert.equal(other[0].appointments.length, 3);
  assert.equal(other[1], f.shops[1]);
  assert.equal(f.shops[0].appointments.length, 0);
  assert.throws(
    () =>
      createDemoAppointment(
        first,
        f.a.id,
        "a1",
        { ...f.input, localTime: "11:00" },
        now,
      ),
    /identificador/,
  );
});
test("agenda: duration, opening hours, professional pauses and date blocks are enforced", () => {
  const f = fixture();
  const long = { ...f.input, serviceId: f.a.services[2].id };
  const created = createDemoAppointment(
    f.shops,
    f.a.id,
    "long",
    { ...long, localTime: "11:00" },
    now,
  );
  assert.equal(created[0].appointments[0].durationMinutesSnapshot, 60);
  assert.equal(created[0].appointments[0].endsAt, "2030-01-07T15:00:00.000Z");
  for (const localTime of ["11:30", "17:30", "08:30"])
    assert.throws(
      () =>
        createDemoAppointment(
          f.shops,
          f.a.id,
          "bad",
          { ...long, localTime },
          now,
        ),
      /indisponível/,
    );
  const paused = saveDemoWeek(
    f.shops,
    f.a.id,
    "demo-p1",
    week().map((day) =>
      day.weekday === 1
        ? { ...day, breaks: [...day.breaks, { start: "15:00", end: "15:30" }] }
        : day,
    ),
  );
  assert.throws(
    () =>
      createDemoAppointment(
        paused,
        f.a.id,
        "pause",
        { ...long, localTime: "14:30" },
        now,
      ),
    /indisponível/,
  );
  const blocked = addDemoBlock(f.shops, f.a.id, "holiday", {
    professionalId: null,
    start: date,
    end: date,
    allDay: true,
    kind: "EXTRAORDINARY",
    reason: "Feriado fictício",
  });
  assert.throws(
    () =>
      createDemoAppointment(
        blocked,
        f.a.id,
        "holiday-appointment",
        f.input,
        now,
      ),
    /indisponível/,
  );
});
test("agenda: cancellation preserves history and releases both conflict checking and preview", () => {
  const f = fixture();
  const booked = createDemoAppointment(f.shops, f.a.id, "a1", f.input, now);
  const start = booked[0].appointments[0].startsAt;
  assert.equal(
    previewDemoAvailability(
      booked[0],
      "demo-p1",
      f.input.serviceId,
      date,
      now,
    ).some((slot) => slot.startsAt.toISOString() === start),
    false,
  );
  const cancelled = changeDemoAppointmentStatus(
    booked,
    f.a.id,
    "a1",
    "CANCELLED",
    now,
  );
  assert.equal(cancelled[0].appointments[0].cancelledAt, now.toISOString());
  assert.equal(
    previewDemoAvailability(
      cancelled[0],
      "demo-p1",
      f.input.serviceId,
      date,
      now,
    ).some((slot) => slot.startsAt.toISOString() === start),
    true,
  );
  const reused = createDemoAppointment(cancelled, f.a.id, "a2", f.input, now);
  assert.equal(reused[0].appointments.length, 2);
  assert.equal(reused[0].appointments[0].status, "CANCELLED");
  assert.equal(booked[0].appointments[0].status, "CONFIRMED");
});
test("agenda: inactive/unassigned/foreign services or staff and past times are refused", () => {
  const f = fixture();
  const inactive = setDemoProfessionalActive(f.shops, f.a.id, "demo-p1", false);
  assert.throws(
    () => createDemoAppointment(inactive, f.a.id, "bad", f.input, now),
    /ativo/,
  );
  const inactiveService = updateDemoServices(f.shops, f.a.id, (services) =>
    services.map((service) => ({ ...service, active: false })),
  );
  assert.throws(
    () => createDemoAppointment(inactiveService, f.a.id, "bad", f.input, now),
    /ativo/,
  );
  for (const changes of [
    { serviceId: f.a.services[1].id },
    { serviceId: f.b.services[0].id },
    { professionalId: "unknown" },
    { clientName: " " },
    { localDate: "2030-02-30" },
    { localTime: "25:00" },
  ])
    assert.throws(() =>
      createDemoAppointment(
        f.shops,
        f.a.id,
        "bad",
        { ...f.input, ...changes },
        now,
      ),
    );
  assert.throws(
    () =>
      createDemoAppointment(
        f.shops,
        f.a.id,
        "past",
        f.input,
        new Date("2030-01-07T13:00:00Z"),
      ),
    /futuro/,
  );
  assert.throws(
    () =>
      createDemoAppointment(
        f.shops,
        f.a.id,
        "past",
        f.input,
        new Date("2030-01-08T13:00:00Z"),
      ),
    /futuro/,
  );
});
test("agenda: completion requires elapsed end, terminal states are preserved", () => {
  const f = fixture();
  const booked = createDemoAppointment(f.shops, f.a.id, "a1", f.input, now);
  const record = booked[0].appointments[0];
  for (const time of [
    now,
    new Date(record.startsAt),
    new Date(new Date(record.endsAt).getTime() - 1),
  ])
    assert.throws(
      () =>
        changeDemoAppointmentStatus(booked, f.a.id, "a1", "COMPLETED", time),
      /término/,
    );
  const completed = changeDemoAppointmentStatus(
    booked,
    f.a.id,
    "a1",
    "COMPLETED",
    new Date(record.endsAt),
  );
  assert.equal(completed[0].appointments[0].completedAt, record.endsAt);
  assert.equal(
    changeDemoAppointmentStatus(
      completed,
      f.a.id,
      "a1",
      "COMPLETED",
      new Date(record.endsAt),
    ),
    completed,
  );
  assert.throws(
    () =>
      changeDemoAppointmentStatus(completed, f.a.id, "a1", "CANCELLED", now),
    /não podem/,
  );
  const cancelled = changeDemoAppointmentStatus(
    booked,
    f.a.id,
    "a1",
    "CANCELLED",
    now,
  );
  assert.throws(
    () =>
      changeDemoAppointmentStatus(
        cancelled,
        f.a.id,
        "a1",
        "COMPLETED",
        new Date(record.endsAt),
      ),
    /não podem/,
  );
});
test("agenda: shop isolation and historical snapshots survive catalog changes", () => {
  const f = fixture();
  const booked = createDemoAppointment(f.shops, f.a.id, "a1", f.input, now);
  assert.throws(
    () => changeDemoAppointmentStatus(booked, f.b.id, "a1", "CANCELLED", now),
    /não encontrado/,
  );
  assert.throws(
    () => createDemoAppointment(booked, f.b.id, "foreign", f.input, now),
    /barbearia/,
  );
  assert.equal(dailyDemoAppointments(booked[1], date).length, 0);
  const renamed = updateDemoServices(booked, f.a.id, (services) =>
    services.map((service) => ({
      ...service,
      name: "Nome alterado",
      durationMinutes: 90,
      priceInCents: 9999,
    })),
  );
  const changed = saveDemoProfessional(
    renamed,
    f.a.id,
    "demo-p1",
    { ...f.person, name: "Profissional Renomeado" },
    true,
  );
  assert.deepEqual(changed[0].appointments[0], booked[0].appointments[0]);
  assert.equal(changed[0].appointments[0].durationMinutesSnapshot, 30);
  assert.equal(changed[0].appointments[0].professionalName, f.person.name);
});
test("agenda: civil day filtering and navigation are timezone independent", () => {
  const f = fixture();
  let late = saveDemoWeek(f.shops, f.a.id, "demo-p1", emptyWeek());
  late = saveDemoWeek(late, f.a.id, "demo-p2", emptyWeek());
  const night = emptyWeek().map((day) =>
    day.weekday === 1
      ? { ...day, windows: [{ start: "21:00", end: "23:59" }] }
      : day,
  );
  late = saveDemoWeek(late, f.a.id, null, night);
  late = saveDemoWeek(late, f.a.id, "demo-p1", night);
  const booked = createDemoAppointment(
    late,
    f.a.id,
    "night",
    { ...f.input, localTime: "22:00" },
    now,
  );
  assert.equal(booked[0].appointments[0].startsAt, "2030-01-08T01:00:00.000Z");
  assert.equal(dailyDemoAppointments(booked[0], date, "demo-p1").length, 1);
  assert.equal(dailyDemoAppointments(booked[0], "2030-01-08").length, 0);
  assert.equal(dailyDemoAppointments(booked[0], date, "demo-p2").length, 0);
  assert.equal(shiftAgendaDate("2030-12-31", 1), "2031-01-01");
  assert.equal(shiftAgendaDate("2030-01-01", -1), "2029-12-31");
  assert.throws(() => dailyDemoAppointments(booked[0], "2030-02-30"));
});
