import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoBarbershop,
  updateDemoServices,
} from "../app/admin/_lib/demo-barbershop";
import {
  professionalSchema,
  saveDemoProfessional,
  setDemoProfessionalActive,
  eligibleDemoProfessionals,
  parseProfessional,
  type ProfessionalInput,
} from "../app/admin/profissionais/_lib/professional";

const shopInput = {
  name: "Barbearia Exemplo",
  phone: "11900000000",
  address: "Rua Fictícia, 100",
  description: "Dados fictícios para testes de profissionais.",
};
const a = createDemoBarbershop(shopInput, "demo-a");
const b = createDemoBarbershop(shopInput, "demo-b");
const values: ProfessionalInput = {
  name: " Alex Exemplo ",
  phone: "",
  description: " Especialista em cortes clássicos. ",
  photoUrl: "",
  active: true,
  serviceIds: [a.services[0].id, a.services[1].id],
};

test("professionals: validates required fields, optional phone/photo and normalizes data", () => {
  const parsed = professionalSchema.parse(values);
  assert.equal(parsed.name, "Alex Exemplo");
  assert.equal(parsed.phone, "");
  assert.equal(parsed.photoUrl, "");
  assert.equal(
    professionalSchema.parse({ ...values, phone: "+55 (11) 90000-0000" }).phone,
    "5511900000000",
  );
  for (const changes of [
    { name: " " },
    { description: " " },
    { phone: "123" },
    { phone: "letters11900000000" },
    { photoUrl: "https://example.invalid/photo.jpg" },
    { photoUrl: "data:image/svg+xml;base64,aGVsbG8=" },
    { photoUrl: "data:image/png;base64," + "A".repeat(2_800_001) },
    { serviceIds: [a.services[0].id, a.services[0].id] },
  ])
    assert.equal(
      professionalSchema.safeParse({ ...values, ...changes }).success,
      false,
    );
  assert.equal(
    professionalSchema.safeParse({
      ...values,
      photoUrl: "data:image/png;base64,aGVsbG8=",
    }).success,
    true,
  );
});
test("professionals: many-to-many services stay within one shop and editing preserves others", () => {
  const first = saveDemoProfessional([a, b], a.id, "demo-p1", values, false);
  const second = saveDemoProfessional(
    first,
    a.id,
    "demo-p2",
    { ...values, name: "Outro Profissional" },
    false,
  );
  assert.equal(second[0].professionals.length, 2);
  assert.equal(second[1].professionals.length, 0);
  assert.equal(
    eligibleDemoProfessionals(second[0], a.services[0].id).length,
    2,
  );
  assert.equal(
    eligibleDemoProfessionals(second[0], a.services[1].id).length,
    2,
  );
  const edited = saveDemoProfessional(
    second,
    a.id,
    "demo-p1",
    { ...values, name: "Nome Editado", serviceIds: [a.services[0].id] },
    true,
  );
  assert.equal(edited[0].professionals[0].name, "Nome Editado");
  assert.equal(edited[0].professionals[0].barbershopId, a.id);
  assert.equal(edited[0].professionals[1], second[0].professionals[1]);
  assert.equal(edited[1], b);
  assert.equal(second[0].professionals[0].name, "Alex Exemplo");
});
test("professionals: rejects foreign/inactive services, cross-shop edits and duplicate IDs", () => {
  assert.equal(
    parseProfessional({ ...values, serviceIds: [b.services[0].id] }, a).success,
    false,
  );
  assert.equal(
    parseProfessional(
      {
        ...values,
        serviceIds: [a.services.find((service) => !service.active)!.id],
      },
      a,
    ).success,
    false,
  );
  const shops = saveDemoProfessional([a, b], a.id, "demo-p1", values, false);
  assert.throws(
    () =>
      saveDemoProfessional(
        shops,
        b.id,
        "demo-p1",
        { ...values, serviceIds: [] },
        true,
      ),
    /CONTEXT_MISMATCH/,
  );
  assert.throws(
    () =>
      saveDemoProfessional(
        shops,
        b.id,
        "demo-p1",
        { ...values, serviceIds: [] },
        false,
      ),
    /CONTEXT_MISMATCH/,
  );
  assert.throws(
    () =>
      saveDemoProfessional(
        shops,
        a.id,
        "demo-p2",
        { ...values, serviceIds: [b.services[0].id] },
        false,
      ),
    /INVALID/,
  );
  assert.throws(
    () => setDemoProfessionalActive(shops, b.id, "demo-p1", false),
    /CONTEXT_MISMATCH/,
  );
});
test("professionals: inactive professionals/services cannot be eligible, prior links can be kept or removed", () => {
  const shops = saveDemoProfessional([a, b], a.id, "demo-p1", values, false);
  const inactive = setDemoProfessionalActive(shops, a.id, "demo-p1", false);
  assert.equal(
    eligibleDemoProfessionals(inactive[0], a.services[0].id).length,
    0,
  );
  assert.deepEqual(inactive[0].professionals[0].serviceIds, values.serviceIds);
  const reactivated = setDemoProfessionalActive(
    inactive,
    a.id,
    "demo-p1",
    true,
  );
  assert.equal(
    eligibleDemoProfessionals(reactivated[0], a.services[0].id).length,
    1,
  );
  const serviceOff = updateDemoServices(reactivated, a.id, (services) =>
    services.map((service) => ({ ...service, active: false })),
  );
  assert.equal(
    eligibleDemoProfessionals(serviceOff[0], a.services[0].id).length,
    0,
  );
  const previous = serviceOff[0].professionals[0];
  assert.equal(
    parseProfessional(values, serviceOff[0], previous).success,
    true,
  );
  const removed = saveDemoProfessional(
    serviceOff,
    a.id,
    previous.id,
    { ...values, serviceIds: [] },
    true,
  );
  assert.equal(
    parseProfessional(values, removed[0], removed[0].professionals[0]).success,
    false,
  );
  assert.equal(eligibleDemoProfessionals(removed[0], "unknown").length, 0);
  assert.equal(shops[1], b);
});
