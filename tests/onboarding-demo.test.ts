import test from "node:test";
import assert from "node:assert/strict";
import {
  barbershopSchema,
  createDemoBarbershop,
  updateDemoServices,
} from "../app/admin/_lib/demo-barbershop";

const input = {
  name: " Barbearia Exemplo ",
  phone: "+55 (11) 90000-0000",
  address: " Rua Fictícia, 100 · Cidade Exemplo ",
  description: " Estabelecimento fictício para demonstração. ",
};

test("demo onboarding: validates required data and normalizes phone and whitespace", () => {
  const values = barbershopSchema.parse(input);
  assert.equal(values.name, "Barbearia Exemplo");
  assert.equal(values.phone, "5511900000000");
  assert.equal(values.address.startsWith(" "), false);
  assert.equal(
    barbershopSchema.safeParse({ ...input, phone: "(11) 3000-0000" }).success,
    true,
  );
  for (const change of [
    { name: " " },
    { phone: "123" },
    { phone: "abc11900000000" },
    { address: "Rua" },
    { description: " " },
  ])
    assert.equal(
      barbershopSchema.safeParse({ ...input, ...change }).success,
      false,
    );
});
test("demo contexts: each shop receives independent services with explicit ownership", () => {
  const a = createDemoBarbershop(input, "demo-a");
  const b = createDemoBarbershop(
    { ...input, name: "Outra Barbearia Demo" },
    "demo-b",
  );
  assert.ok(a.services.every((service) => service.barbershopId === a.id));
  assert.ok(b.services.every((service) => service.barbershopId === b.id));
  assert.notEqual(a.services[0].id, b.services[0].id);
  assert.notEqual(a.services[0], b.services[0]);
  const changed = updateDemoServices([a, b], a.id, (services) =>
    services.map((service, i) =>
      i === 0
        ? { ...service, name: "Só na barbearia A", active: false }
        : service,
    ),
  );
  assert.equal(changed[0].services[0].name, "Só na barbearia A");
  assert.equal(changed[0].services[0].active, false);
  assert.equal(changed[1], b);
  assert.equal(a.services[0].name, b.services[0].name);
});
test("demo contexts: local create stays scoped and cross-context items are rejected", () => {
  const a = createDemoBarbershop(input, "demo-a");
  const b = createDemoBarbershop(input, "demo-b");
  const changed = updateDemoServices([a, b], a.id, (services) => [
    { ...services[0], id: "demo-new" },
    ...services,
  ]);
  assert.equal(changed[0].services.length, a.services.length + 1);
  assert.equal(changed[1].services.length, b.services.length);
  assert.throws(
    () => updateDemoServices([a, b], a.id, () => b.services),
    /DEMO_SERVICE_CONTEXT_MISMATCH/,
  );
  assert.deepEqual(
    updateDemoServices([a, b], "unknown", () => []),
    [a, b],
  );
});
