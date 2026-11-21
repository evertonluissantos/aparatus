import test from "node:test";
import assert from "node:assert/strict";
import { createExampleBookingShops } from "../app/_lib/example-booking";
import {
  exampleBarbershops,
  nextPublicDemoAppointment,
} from "../app/_lib/demo-catalog";
import {
  publicDemoAvailability,
  createPublicDemoAppointment,
} from "../app/_lib/public-demo-booking";
import { changeDemoAppointmentStatus } from "../app/admin/agenda/_lib/appointment";
import { createDemoBarbershop } from "../app/admin/_lib/demo-barbershop";

const now = new Date("2030-01-01T12:00:00Z");
const date = "2030-01-07";

test("Aparência Impecável: only this fictional example gets hours; original service data is preserved", () => {
  const fixtures = createExampleBookingShops();
  assert.equal(fixtures.length, 1);
  const shop = fixtures[0];
  assert.equal(shop.name, "Aparência Impecável");
  assert.deepEqual(
    shop.services,
    exampleBarbershops.find((item) => item.id === shop.id)!.services,
  );
  assert.equal(shop.professionals.length, 1);
  assert.equal(shop.professionals[0].active, true);
  assert.equal(
    exampleBarbershops.every((item) => item.professionals.length === 0),
    true,
  );
  const owner = createDemoBarbershop(
    {
      name: "Exemplo do proprietário",
      phone: "11900000000",
      address: "Rua Exemplo, 100",
      description: "Cadastro independente fictício.",
    },
    "demo-owner",
  );
  assert.equal(owner.professionals.length, 0);
  assert.equal(
    owner.schedule.shopWeek.every((day) => day.windows.length === 0),
    true,
  );
  assert.deepEqual(createExampleBookingShops(), fixtures);
});

test("Aparência Impecável: future selection confirms, occupies slot, updates next receipt and stays isolated", () => {
  const shops = createExampleBookingShops();
  const shop = shops[0],
    professionalId = shop.professionals[0].id,
    serviceId = shop.services[0].id;
  const slots = publicDemoAvailability(
    shops,
    shop.id,
    professionalId,
    serviceId,
    date,
    now,
  );
  assert.ok(slots.length > 0);
  assert.equal(
    slots.some(
      (slot) => slot.startsAt.toISOString() === "2030-01-07T15:00:00.000Z",
    ),
    false,
  ); // lunch in Sao Paulo
  const input = {
    clientName: "Cliente Fictício",
    professionalId,
    serviceId,
    localDate: date,
    localTime: "10:00",
  };
  const created = createPublicDemoAppointment(
    shops,
    shop.id,
    "example-receipt",
    input,
    now,
  );
  const appointment = created[0].appointments[0];
  assert.equal(appointment.status, "CONFIRMED");
  assert.equal(
    appointment.durationMinutesSnapshot,
    shop.services[0].durationMinutes,
  );
  assert.equal(appointment.priceInCentsSnapshot, shop.services[0].priceInCents);
  assert.equal(
    publicDemoAvailability(
      created,
      shop.id,
      professionalId,
      serviceId,
      date,
      now,
    ).some((slot) => slot.startsAt.toISOString() === appointment.startsAt),
    false,
  );
  assert.throws(
    () =>
      createPublicDemoAppointment(created, shop.id, "duplicate", input, now),
    /indisponível/,
  );
  assert.equal(
    nextPublicDemoAppointment(created, [appointment.id], now)?.shop.id,
    shop.id,
  );
  assert.equal(
    nextPublicDemoAppointment(shops, [appointment.id], now),
    undefined,
  );
  assert.equal(createExampleBookingShops()[0].appointments.length, 0); // fresh session
  assert.throws(
    () =>
      createPublicDemoAppointment(
        shops,
        shop.id,
        "past",
        input,
        new Date("2030-01-08T12:00:00Z"),
      ),
    /futuro/,
  );
});

test("Aparência Impecável: cancellation keeps history, frees the slot and removes upcoming receipt", () => {
  const shops = createExampleBookingShops(),
    shop = shops[0];
  const input = {
    clientName: "Cliente Exemplo",
    serviceId: shop.services[0].id,
    professionalId: shop.professionals[0].id,
    localDate: date,
    localTime: "10:00",
  };
  const created = createPublicDemoAppointment(
    shops,
    shop.id,
    "example-receipt",
    input,
    now,
  );
  const cancelled = changeDemoAppointmentStatus(
    created,
    shop.id,
    "example-receipt",
    "CANCELLED",
    now,
  );
  assert.equal(cancelled[0].appointments[0].status, "CANCELLED");
  assert.equal(
    nextPublicDemoAppointment(cancelled, ["example-receipt"], now),
    undefined,
  );
  const again = createPublicDemoAppointment(
    cancelled,
    shop.id,
    "second",
    input,
    now,
  );
  assert.equal(again[0].appointments.length, 2);
  assert.equal(again[0].appointments[1].status, "CONFIRMED");
});
