import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBarbershop,
  setDemoPublication,
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
} from "../app/admin/horarios/_lib/schedule";
import {
  createDemoAppointment,
  changeDemoAppointmentStatus,
  dailyDemoAppointments,
  agendaTime,
} from "../app/admin/agenda/_lib/appointment";
import {
  createPublicDemoAppointment,
  publicDemoAvailability,
} from "../app/_lib/public-demo-booking";

const now = new Date("2030-01-01T12:00:00Z"),
  date = "2030-01-07";
function fixture() {
  const data = {
    name: "Barbearia Fictícia",
    phone: "11900000000",
    address: "Rua Exemplo, 100",
    description: "Dados fictícios para testes públicos.",
  };
  const a = createDemoBarbershop(data, "demo-a"),
    b = createDemoBarbershop(data, "demo-b");
  let shops = [a, b];
  const week = emptyWeek().map((day) =>
    day.weekday === 1
      ? {
          ...day,
          windows: [{ start: "09:00", end: "18:00" }],
          breaks: [{ start: "12:00", end: "13:00" }],
        }
      : day,
  );
  for (const shop of [a, b]) {
    shops = saveDemoProfessional(
      shops,
      shop.id,
      `${shop.id}-p`,
      {
        name: "Profissional Exemplo",
        description: "Profissional fictício.",
        phone: "",
        photoUrl: "",
        active: true,
        serviceIds: [shop.services[0].id, shop.services[2].id],
      },
      false,
    );
    shops = saveDemoWeek(shops, shop.id, null, week);
    shops = saveDemoWeek(
      shops,
      shop.id,
      `${shop.id}-p`,
      week.map((day) =>
        day.weekday === 1
          ? {
              ...day,
              breaks: [...day.breaks, { start: "15:00", end: "15:30" }],
            }
          : day,
      ),
    );
    shops = setDemoPublication(shops, shop.id, true);
  }
  const input = {
    clientName: "Cliente Fictício",
    professionalId: "demo-a-p",
    serviceId: a.services[0].id,
    localDate: date,
    localTime: "10:00",
  };
  return { shops, a, b, input };
}
test("public booking: valid published booking updates that shop's administrative agenda", () => {
  const f = fixture();
  const slots = publicDemoAvailability(
    f.shops,
    f.a.id,
    f.input.professionalId,
    f.input.serviceId,
    date,
    now,
  );
  assert.ok(
    slots.some(
      (slot) => slot.startsAt.toISOString() === "2030-01-07T13:00:00.000Z",
    ),
  );
  const created = createPublicDemoAppointment(
    f.shops,
    f.a.id,
    "public-1",
    f.input,
    now,
  );
  const rows = dailyDemoAppointments(created[0], date);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clientName, f.input.clientName);
  assert.equal(rows[0].professionalId, f.input.professionalId);
  assert.equal(rows[0].durationMinutesSnapshot, 30);
  assert.equal(rows[0].status, "CONFIRMED");
  assert.equal(agendaTime(new Date(rows[0].startsAt)), agendaTime(rows[0].startsAt));
  assert.equal(created[1], f.shops[1]);
  assert.equal(f.shops[0].appointments.length, 0);
});
test("public booking: stale selection is revalidated against administrative bookings", () => {
  const f = fixture();
  assert.ok(
    publicDemoAvailability(
      f.shops,
      f.a.id,
      f.input.professionalId,
      f.input.serviceId,
      date,
      now,
    ).length,
  );
  const occupied = createDemoAppointment(
    f.shops,
    f.a.id,
    "admin-1",
    f.input,
    now,
  );
  assert.throws(
    () =>
      createPublicDemoAppointment(occupied, f.a.id, "public-1", f.input, now),
    /indisponível/,
  );
  assert.throws(
    () =>
      createPublicDemoAppointment(
        occupied,
        f.a.id,
        "public-2",
        { ...f.input, localTime: "10:15" },
        now,
      ),
    /indisponível/,
  );
  assert.equal(
    publicDemoAvailability(
      occupied,
      f.a.id,
      f.input.professionalId,
      f.input.serviceId,
      date,
      now,
    ).some(
      (slot) =>
        slot.startsAt.toISOString() === occupied[0].appointments[0].startsAt,
    ),
    false,
  );
});
test("public booking: inactive services and professionals, foreign IDs and drafts are refused", () => {
  const f = fixture();
  const inactive = setDemoProfessionalActive(
    f.shops,
    f.a.id,
    f.input.professionalId,
    false,
  );
  assert.deepEqual(
    publicDemoAvailability(
      inactive,
      f.a.id,
      f.input.professionalId,
      f.input.serviceId,
      date,
      now,
    ),
    [],
  );
  assert.throws(
    () => createPublicDemoAppointment(inactive, f.a.id, "bad", f.input, now),
    /ativo/,
  );
  const serviceOff = updateDemoServices(f.shops, f.a.id, (services) =>
    services.map((service) => ({ ...service, active: false })),
  );
  assert.throws(
    () => createPublicDemoAppointment(serviceOff, f.a.id, "bad", f.input, now),
    /ativo/,
  );
  for (const input of [
    { ...f.input, serviceId: f.b.services[0].id },
    { ...f.input, professionalId: "demo-b-p" },
  ])
    assert.throws(() =>
      createPublicDemoAppointment(f.shops, f.a.id, "bad", input, now),
    );
  const draft = setDemoPublication(f.shops, f.a.id, false);
  assert.throws(
    () =>
      publicDemoAvailability(
        draft,
        f.a.id,
        f.input.professionalId,
        f.input.serviceId,
        date,
        now,
      ),
    /indisponível/,
  );
  assert.throws(
    () => createPublicDemoAppointment(draft, f.a.id, "bad", f.input, now),
    /indisponível/,
  );
});
test("public booking: duration, shop/professional pauses and blocks remove suggestions", () => {
  const f = fixture();
  const long = {
    ...f.input,
    serviceId: f.a.services[2].id,
    localTime: "11:30",
  };
  assert.throws(
    () => createPublicDemoAppointment(f.shops, f.a.id, "bad", long, now),
    /indisponível/,
  );
  assert.throws(
    () =>
      createPublicDemoAppointment(
        f.shops,
        f.a.id,
        "bad",
        { ...f.input, localTime: "15:00" },
        now,
      ),
    /indisponível/,
  );
  const slots = publicDemoAvailability(
    f.shops,
    f.a.id,
    f.input.professionalId,
    long.serviceId,
    date,
    now,
  );
  assert.equal(
    slots.some(
      (slot) => slot.startsAt.toISOString() === "2030-01-07T14:30:00.000Z",
    ),
    false,
  );
  const blocked = addDemoBlock(f.shops, f.a.id, "holiday", {
    professionalId: null,
    start: date,
    end: date,
    allDay: true,
    kind: "EXTRAORDINARY",
    reason: "Feriado fictício",
  });
  assert.deepEqual(
    publicDemoAvailability(
      blocked,
      f.a.id,
      f.input.professionalId,
      f.input.serviceId,
      date,
      now,
    ),
    [],
  );
  assert.throws(
    () => createPublicDemoAppointment(blocked, f.a.id, "bad", f.input, now),
    /indisponível/,
  );
});
test("public booking: cancelled slots reopen; past starts are never accepted", () => {
  const f = fixture();
  const first = createPublicDemoAppointment(
    f.shops,
    f.a.id,
    "first",
    f.input,
    now,
  );
  const cancelled = changeDemoAppointmentStatus(
    first,
    f.a.id,
    "first",
    "CANCELLED",
    now,
  );
  const second = createPublicDemoAppointment(
    cancelled,
    f.a.id,
    "second",
    f.input,
    now,
  );
  assert.equal(dailyDemoAppointments(second[0], date).length, 2);
  assert.equal(second[0].appointments[0].status, "CANCELLED");
  assert.throws(
    () =>
      createPublicDemoAppointment(
        f.shops,
        f.a.id,
        "past",
        f.input,
        new Date("2030-01-07T13:00:00Z"),
      ),
    /futuro/,
  );
  assert.deepEqual(
    publicDemoAvailability(
      f.shops,
      f.a.id,
      f.input.professionalId,
      f.input.serviceId,
      date,
      new Date("2030-01-08T12:00:00Z"),
    ),
    [],
  );
});
