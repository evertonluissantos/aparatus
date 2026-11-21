import test from "node:test";
import assert from "node:assert/strict";
import {
  parseService,
  matchesServiceName,
  type ServiceFormValues,
} from "../app/admin/servicos/_lib/service";
import { demoServices } from "../app/admin/servicos/_lib/demo-data";

const valid: ServiceFormValues = {
  name: " Corte clássico ",
  description: " Corte e acabamento. ",
  price: "45,90",
  duration: "30",
  active: true,
};

test("demo services: Brazilian decimal prices produce exact cents and trimmed values", () => {
  const result = parseService(valid);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.service, {
    name: "Corte clássico",
    description: "Corte e acabamento.",
    priceInCents: 4590,
    durationMinutes: 30,
    active: true,
  });
  const cent = parseService({ ...valid, price: "0.01", active: false });
  assert.equal(cent.success && cent.service.priceInCents, 1);
  assert.equal(cent.success && cent.service.active, false);
});
test("demo services: required fields, nonpositive prices, ambiguous amounts and invalid durations are rejected", () => {
  for (const changes of [
    { name: " " },
    { description: " " },
    { price: "" },
    { price: "0" },
    { price: "-1" },
    { price: "1.234,56" },
    { price: "1e3" },
    { price: "1,001" },
    { duration: "" },
    { duration: "0" },
    { duration: "-10" },
    { duration: "30.5" },
    { duration: "1e2" },
    { duration: "1441" },
  ])
    assert.equal(
      parseService({ ...valid, ...changes }).success,
      false,
      JSON.stringify(changes),
    );
});
test("demo services: search ignores case, spaces and accents without matching descriptions", () => {
  assert.equal(matchesServiceName("Hidratação capilar", " HIDRATACAO "), true);
  assert.equal(matchesServiceName("Barba completa", "corte"), false);
  assert.equal(matchesServiceName("Corte clássico", ""), true);
});
test("demo fixtures pass the form contract and include both service statuses", () => {
  assert.equal(
    new Set(demoServices.map((service) => service.id)).size,
    demoServices.length,
  );
  assert.ok(demoServices.some((service) => service.active));
  assert.ok(demoServices.some((service) => !service.active));
  for (const service of demoServices)
    assert.equal(
      parseService({
        name: service.name,
        description: service.description,
        price: (service.priceInCents / 100).toFixed(2),
        duration: String(service.durationMinutes),
        active: service.active,
      }).success,
      true,
    );
});
