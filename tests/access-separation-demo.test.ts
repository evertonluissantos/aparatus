import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  registerOwnerDemoShop,
  barbershopPublicSlug,
  findPublishedShopBySlug,
} from "../app/admin/_lib/owner-demo";
import {
  createDemoBarbershop,
  setDemoPublication,
} from "../app/admin/_lib/demo-barbershop";
import {
  exampleBarbershops,
  publicDemoCatalog,
} from "../app/_lib/demo-catalog";
import { saveDemoProfessional } from "../app/admin/profissionais/_lib/professional";
import { emptyWeek, saveDemoWeek } from "../app/admin/horarios/_lib/schedule";
import { createPublicDemoAppointment } from "../app/_lib/public-demo-booking";
import { dailyDemoAppointments } from "../app/admin/agenda/_lib/appointment";

const input = {
  name: "Délarts",
  phone: "11900000000",
  address: "Rua Exemplo, 100",
  description: "Barbearia fictícia para testes locais.",
};

test("owner: second registration is refused without modifying any existing shop or history", () => {
  const shop = registerOwnerDemoShop(
    [],
    input,
    "demo-owner",
    exampleBarbershops,
  );
  const shops = [shop];
  const snapshot = structuredClone(shops);
  assert.throws(
    () => registerOwnerDemoShop(shops, input, "demo-other", exampleBarbershops),
    /já possui/,
  );
  assert.deepEqual(shops, snapshot);
  const legacy = [...shops, createDemoBarbershop(input, "demo-legacy")];
  const previous = structuredClone(legacy);
  assert.throws(
    () =>
      registerOwnerDemoShop(legacy, input, "demo-third", exampleBarbershops),
    /já possui/,
  );
  assert.deepEqual(legacy, previous);
});

test("public slug: normalized, collision-safe, stable after rename and unavailable for drafts/ambiguity", () => {
  const shop = registerOwnerDemoShop(
    [],
    input,
    "demo-owner",
    exampleBarbershops,
  );
  assert.equal(barbershopPublicSlug(shop), "delarts");
  assert.equal(
    barbershopPublicSlug({ ...shop, name: "Nome alterado" }),
    "delarts",
  );
  const collision = registerOwnerDemoShop([], input, "demo-2", [shop]);
  assert.equal(barbershopPublicSlug(collision), "delarts-2");
  const exampleName = registerOwnerDemoShop(
    [],
    { ...input, name: exampleBarbershops[0].name },
    "demo-3",
    exampleBarbershops,
  );
  assert.notEqual(
    barbershopPublicSlug(exampleName),
    barbershopPublicSlug(exampleBarbershops[0]),
  );
  assert.equal(
    findPublishedShopBySlug(publicDemoCatalog([shop]), "delarts"),
    undefined,
  );
  const published = setDemoPublication([shop], shop.id, true);
  assert.equal(
    findPublishedShopBySlug(publicDemoCatalog(published), "delarts")?.id,
    shop.id,
  );
  assert.equal(
    findPublishedShopBySlug(
      [
        { ...shop, published: true },
        { ...shop, id: "ambiguous", published: true },
      ],
      "delarts",
    ),
    undefined,
  );
  assert.equal(findPublishedShopBySlug(published, "unknown"), undefined);
});

test("public link: resolves same owner shop and booking appears only in its administrative agenda", () => {
  const shop = registerOwnerDemoShop(
    [],
    input,
    "demo-owner",
    exampleBarbershops,
  );
  const week = emptyWeek().map((day) => ({
    ...day,
    windows: [{ start: "09:00", end: "18:00" }],
  }));
  let shops = saveDemoProfessional(
    [shop],
    shop.id,
    "demo-professional",
    {
      name: "Profissional Exemplo",
      phone: "",
      description: "Fictício",
      photoUrl: "",
      active: true,
      serviceIds: [shop.services[0].id],
    },
    false,
  );
  shops = saveDemoWeek(shops, shop.id, null, week);
  shops = saveDemoWeek(shops, shop.id, "demo-professional", week);
  shops = setDemoPublication(shops, shop.id, true);
  const linked = findPublishedShopBySlug(publicDemoCatalog(shops), "delarts")!;
  const date = "2030-01-07";
  const created = createPublicDemoAppointment(
    shops,
    linked.id,
    "from-link",
    {
      clientName: "Cliente Fictício",
      serviceId: linked.services[0].id,
      professionalId: "demo-professional",
      localDate: date,
      localTime: "10:00",
    },
    new Date("2030-01-01T12:00:00Z"),
  );
  assert.equal(dailyDemoAppointments(created[0], date)[0].id, "from-link");
  assert.equal(created[0].appointments[0].barbershopId, shop.id);
  assert.equal(
    exampleBarbershops.every((example) => example.appointments.length === 0),
    true,
  );
  assert.equal(shops[0].appointments.length, 0);
});

test("access routes reuse owner pages, separate global preview, and expose no fake login", () => {
  const source = (path: string) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const page of [
    "onboarding",
    "servicos",
    "profissionais",
    "horarios",
    "agenda",
    "clientes",
  ])
    assert.ok(
      source(`app/painel/${page}/page.tsx`).includes(
        `../../admin/${page}/page`,
      ),
    );
  const shell = source("app/admin/_components/admin-shell.tsx");
  assert.equal(shell.includes("<select"), false);
  assert.equal(shell.includes("Adicionar barbearia"), false);
  assert.match(shell, /não possuem controle de\s+acesso/);
  assert.ok(shell.includes("!persistent"));
  assert.ok(
    source("app/b/[slug]/shop-link.tsx").includes("<DemoBarbershopPage"),
  );
  assert.ok(
    source("app/gestao/layout.tsx")
      .replace(/\s+/g, " ")
      .includes("sem autenticação ou autorização global"),
  );
  assert.equal(source("app/gestao/layout.tsx").includes("AdminShell"), false);
  assert.ok(
    source("app/admin/_components/publication-controls.tsx").includes(
      "navigator.clipboard.writeText",
    ),
  );
});
