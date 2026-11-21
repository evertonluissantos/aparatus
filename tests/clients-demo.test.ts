import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBarbershop,
  setDemoPublication,
} from "../app/admin/_lib/demo-barbershop";
import {
  clientSchema,
  saveDemoClient,
  clientHistory,
  clientMetrics,
  matchesDemoClient,
} from "../app/admin/clientes/_lib/client";
import { saveDemoProfessional } from "../app/admin/profissionais/_lib/professional";
import { saveDemoWeek, emptyWeek } from "../app/admin/horarios/_lib/schedule";
import {
  createDemoAppointment,
  changeDemoAppointmentStatus,
} from "../app/admin/agenda/_lib/appointment";
import { createPublicDemoAppointment } from "../app/_lib/public-demo-booking";

const now = new Date("2030-01-01T12:00:00Z");
const client = {
  name: " Cliente Exemplo ",
  phone: "(11) 90000-0000",
  notes: " Preferência fictícia. ",
};
function fixture() {
  const data = {
    name: "Barbearia Exemplo",
    phone: "11900000000",
    address: "Rua Fictícia, 100",
    description: "Barbearia de testes locais de clientes.",
  };
  let shops = [
    createDemoBarbershop(data, "demo-a"),
    createDemoBarbershop(data, "demo-b"),
  ];
  const week = emptyWeek().map((day) =>
    day.weekday === 1
      ? { ...day, windows: [{ start: "09:00", end: "18:00" }] }
      : day,
  );
  for (const shop of [...shops]) {
    shops = saveDemoProfessional(
      shops,
      shop.id,
      `${shop.id}-p`,
      {
        name: "Profissional Exemplo",
        phone: "",
        description: "Profissional fictício.",
        photoUrl: "",
        active: true,
        serviceIds: [shop.services[0].id],
      },
      false,
    );
    shops = saveDemoWeek(shops, shop.id, null, week);
    shops = saveDemoWeek(shops, shop.id, `${shop.id}-p`, week);
    shops = setDemoPublication(shops, shop.id, true);
  }
  const input = {
    clientName: "Cliente Exemplo",
    clientPhone: "+55 (11) 90000-0000",
    serviceId: shops[0].services[0].id,
    professionalId: "demo-a-p",
    localDate: "2030-01-07",
    localTime: "10:00",
  };
  return { shops, input };
}
test("clients: manual creation, normalized duplicate detection and immutable editing", () => {
  const f = fixture();
  const saved = saveDemoClient(
    f.shops,
    "demo-a",
    "client-a",
    client,
    false,
    now,
  );
  assert.equal(saved[0].clients[0].phone, "5511900000000");
  assert.equal(saved[0].clients[0].name, "Cliente Exemplo");
  assert.throws(
    () =>
      saveDemoClient(
        saved,
        "demo-a",
        "client-duplicate",
        { ...client, phone: "+55 (11) 90000-0000" },
        false,
        now,
      ),
    /telefone/,
  );
  const other = saveDemoClient(
    saved,
    "demo-a",
    "client-other",
    { ...client, phone: "11911111111" },
    false,
    now,
  );
  assert.throws(
    () => saveDemoClient(other, "demo-a", "client-other", client, true, now),
    /telefone/,
  );
  const edited = saveDemoClient(
    saved,
    "demo-a",
    "client-a",
    { ...client, name: "Nome Editado", notes: "Nota editada" },
    true,
    new Date("2030-01-02T12:00:00Z"),
  );
  assert.equal(edited[0].clients[0].name, "Nome Editado");
  assert.equal(edited[0].clients[0].createdAt, now.toISOString());
  assert.equal(saved[0].clients[0].name, "Cliente Exemplo");
  assert.equal(edited[1], f.shops[1]);
});
test("clients: same name never merges; optional phones and search are validated", () => {
  const f = fixture();
  let shops = saveDemoClient(
    f.shops,
    "demo-a",
    "c1",
    { ...client, phone: "" },
    false,
    now,
  );
  shops = saveDemoClient(
    shops,
    "demo-a",
    "c2",
    { ...client, phone: "" },
    false,
    now,
  );
  assert.equal(shops[0].clients.length, 2);
  assert.equal(
    matchesDemoClient(
      { ...shops[0].clients[0], name: "João Exemplo" },
      " JOAO ",
    ),
    true,
  );
  assert.equal(
    matchesDemoClient(
      { ...shops[0].clients[0], phone: "5511900000000" },
      "(11) 90000",
    ),
    true,
  );
  assert.equal(matchesDemoClient(shops[0].clients[0], "missing"), false);
  for (const changes of [
    { name: " " },
    { phone: "123" },
    { phone: "abc11900000000" },
    { notes: "a".repeat(501) },
  ])
    assert.equal(
      clientSchema.safeParse({ ...client, ...changes }).success,
      false,
    );
});
test("clients: history is scoped by ID and counts only actually completed appointments", () => {
  const f = fixture();
  let shops = createDemoAppointment(f.shops, "demo-a", "a1", f.input, now);
  shops = createDemoAppointment(
    shops,
    "demo-a",
    "a2",
    { ...f.input, localTime: "11:00" },
    now,
  );
  shops = createDemoAppointment(
    shops,
    "demo-a",
    "a3",
    { ...f.input, localTime: "14:00" },
    now,
  );
  shops = createDemoAppointment(
    shops,
    "demo-a",
    "a4",
    { ...f.input, localTime: "09:00" },
    now,
  );
  assert.equal(shops[0].clients.length, 1);
  shops = changeDemoAppointmentStatus(
    shops,
    "demo-a",
    "a1",
    "COMPLETED",
    new Date("2030-01-07T13:30:00Z"),
  );
  shops = changeDemoAppointmentStatus(shops, "demo-a", "a2", "CANCELLED", now);
  const id = shops[0].clients[0].id;
  const summary = clientMetrics(shops[0], id, new Date("2030-01-07T15:00:00Z"));
  assert.deepEqual(summary, {
    reservations: 4,
    confirmed: 2,
    cancelled: 1,
    completed: 1,
    lastCompletedAt: "2030-01-07T13:30:00.000Z",
  });
  assert.equal(clientMetrics(shops[0], id, now).completed, 0);
  assert.equal(
    clientHistory(shops[0], id).some(
      (appointment) => appointment.status === "CANCELLED",
    ),
    true,
  );
  const edited = saveDemoClient(
    shops,
    "demo-a",
    id,
    { ...client, name: "Nome Atualizado", phone: "11922222222" },
    true,
    now,
  );
  assert.equal(clientHistory(edited[0], id).length, 4);
  assert.equal(edited[0].appointments[0].clientName, f.input.clientName);
});
test("clients: same phone is allowed across shops without sharing profiles or histories", () => {
  const f = fixture();
  let shops = saveDemoClient(f.shops, "demo-a", "client-a", client, false, now);
  shops = saveDemoClient(shops, "demo-b", "client-b", client, false, now);
  shops = createDemoAppointment(
    shops,
    "demo-a",
    "a1",
    { ...f.input, clientId: "client-a" },
    now,
  );
  assert.equal(clientHistory(shops[0], "client-a").length, 1);
  assert.equal(clientHistory(shops[1], "client-b").length, 0);
  assert.throws(() => clientHistory(shops[1], "client-a"), /não encontrado/);
  assert.throws(() =>
    saveDemoClient(shops, "demo-b", "client-a", client, true, now),
  );
  assert.throws(() =>
    createDemoAppointment(
      shops,
      "demo-a",
      "bad",
      { ...f.input, clientId: "client-b", localTime: "11:00" },
      now,
    ),
  );
});
test("clients: public bookings reuse phone safely, never overwrite profile or expose its name", () => {
  const f = fixture();
  const saved = saveDemoClient(
    f.shops,
    "demo-a",
    "known-client",
    {
      ...client,
      name: "Nome do Cadastro",
      notes: "Observação privada fictícia",
    },
    false,
    now,
  );
  const publicBooking = createPublicDemoAppointment(
    saved,
    "demo-a",
    "public-1",
    { ...f.input, clientName: "Nome Informado Publicamente" },
    now,
  );
  assert.equal(publicBooking[0].clients.length, 1);
  assert.deepEqual(publicBooking[0].clients[0], saved[0].clients[0]);
  assert.equal(publicBooking[0].appointments[0].clientId, "known-client");
  assert.equal(
    publicBooking[0].appointments[0].clientName,
    "Nome Informado Publicamente",
  );
  assert.equal(clientHistory(publicBooking[0], "known-client").length, 1);
  assert.throws(
    () =>
      createPublicDemoAppointment(
        saved,
        "demo-a",
        "bad",
        { ...f.input, clientId: "known-client" },
        now,
      ),
    /privados/,
  );
  assert.throws(() =>
    createPublicDemoAppointment(
      publicBooking,
      "demo-a",
      "conflict",
      { ...f.input, clientPhone: "11933333333" },
      now,
    ),
  );
  assert.equal(publicBooking[0].clients.length, 1);
});
test("clients: public bookings without phone create distinct profiles despite equal names", () => {
  const f = fixture();
  let shops = createPublicDemoAppointment(
    f.shops,
    "demo-a",
    "public-1",
    { ...f.input, clientPhone: "" },
    now,
  );
  shops = createPublicDemoAppointment(
    shops,
    "demo-a",
    "public-2",
    { ...f.input, clientPhone: "", localTime: "11:00" },
    now,
  );
  assert.equal(shops[0].clients.length, 2);
  assert.notEqual(
    shops[0].appointments[0].clientId,
    shops[0].appointments[1].clientId,
  );
  assert.ok(
    shops[0].clients.every(
      (item) => clientHistory(shops[0], item.id).length === 1,
    ),
  );
});
