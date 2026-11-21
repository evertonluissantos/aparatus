import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBarbershop,
  setDemoPublication,
  updateDemoServices,
  barbershopSchema,
} from "../app/admin/_lib/demo-barbershop";
import {
  publicDemoCatalog,
  exampleBarbershops,
} from "../app/_lib/demo-catalog";

const input = {
  name: "Barbearia Fictícia",
  phone: "11900000000",
  address: "Rua Exemplo, 100",
  description: "Dados fictícios para testes locais.",
};
test("public demo: existing ten fictional examples remain without database access", () => {
  assert.equal(exampleBarbershops.length, 10);
  assert.equal(exampleBarbershops[0].name, "Barbearia Vintage");
  assert.equal(new Set(exampleBarbershops.map((shop) => shop.id)).size, 10);
  assert.ok(
    exampleBarbershops.every(
      (shop) =>
        shop.published &&
        shop.services.every((service) => service.barbershopId === shop.id),
    ),
  );
  assert.equal(publicDemoCatalog([]).length, 10);
});
test("public demo: draft -> explicit publication -> public detail -> withdrawal", () => {
  const draft = createDemoBarbershop(input, "demo-fictional");
  assert.equal(draft.published, false);
  assert.equal(
    publicDemoCatalog([draft]).some((shop) => shop.id === draft.id),
    false,
  );
  const published = setDemoPublication([draft], draft.id, true);
  const detail = publicDemoCatalog(published).find(
    (shop) => shop.id === draft.id,
  );
  assert.equal(detail?.name, input.name);
  assert.equal(detail?.imageUrl, "/banner.png");
  assert.ok(
    detail?.services.every((service) => service.barbershopId === draft.id),
  );
  assert.equal(draft.published, false);
  const withdrawn = setDemoPublication(published, draft.id, false);
  assert.equal(
    publicDemoCatalog(withdrawn).some((shop) => shop.id === draft.id),
    false,
  );
  assert.equal(
    publicDemoCatalog(published).some((shop) => shop.id === "missing"),
    false,
  );
});
test("public demo: editing one catalog does not change other shops or fixed examples", () => {
  const a = createDemoBarbershop(input, "demo-a");
  const b = createDemoBarbershop(input, "demo-b");
  const shops = setDemoPublication(
    setDemoPublication([a, b], a.id, true),
    b.id,
    true,
  );
  const updated = updateDemoServices(shops, a.id, (services) =>
    services.map((service) => ({ ...service, active: false })),
  );
  const catalog = publicDemoCatalog(updated);
  assert.equal(
    catalog
      .find((shop) => shop.id === a.id)
      ?.services.filter((service) => service.active).length,
    0,
  );
  assert.ok(
    catalog
      .find((shop) => shop.id === b.id)
      ?.services.some((service) => service.active),
  );
  assert.ok(exampleBarbershops[0].services.every((service) => service.active));
});
test("public demo: covers accept local supported images only; publication validates the data", () => {
  for (const imageUrl of [
    "/banner.png",
    "data:image/png;base64,aGVsbG8=",
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/webp;base64,aGVsbG8=",
  ])
    assert.equal(
      barbershopSchema.safeParse({ ...input, imageUrl }).success,
      true,
    );
  for (const imageUrl of [
    "https://example.invalid/cover.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,aGVsbG8=",
    "data:image/png;base64," + "A".repeat(2_800_001),
  ])
    assert.equal(
      barbershopSchema.safeParse({ ...input, imageUrl }).success,
      false,
    );
  const invalid = {
    ...createDemoBarbershop(input, "demo-invalid"),
    imageUrl: "unsafe",
  };
  assert.throws(() => setDemoPublication([invalid], invalid.id, true));
});
