import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoServiceImage } from "../app/_lib/demo-service-images";

const source = (name: string) =>
  readFileSync(
    new URL(`../app/_components/${name}.tsx`, import.meta.url),
    "utf8",
  );

test("restored detail retains original hero, service cards, contact and footer without public admin links", () => {
  const detail = source("demo-barbershop-page");
  for (const fragment of [
    "relative h-[297px] w-full",
    "rounded-tl-3xl rounded-tr-3xl",
    "text-foreground text-xl font-bold",
    "SOBRE NÓS",
    "SERVIÇOS",
    "CONTATO",
    "<PhoneItem",
    "© 2025 Copyright Aparatus",
    "<PublicDemoBooking",
  ])
    assert.ok(detail.includes(fragment), fragment);
  assert.equal(detail.includes("DemoCatalogHeader"), false);
  const service = source("public-demo-booking");
  for (const fragment of [
    "size-[110px]",
    "rounded-2xl border border-solid p-3",
    "Reservar",
    "Fazer Reserva",
    "w-[370px] overflow-y-auto p-0",
    "initialServiceId={service.id}",
  ])
    assert.ok(service.includes(fragment), fragment);
  for (const file of [detail, service, source("public-booking-form")]) {
    assert.equal(
      /_actions\/|loadStripe|redirectToCheckout|href=["']\/admin/.test(file),
      false,
    );
  }
});

test("service reservation reuses existing calendar and availability instead of a separate date picker", () => {
  const form = source("public-booking-form");
  assert.ok(form.includes('import { Calendar } from "./ui/calendar"'));
  assert.ok(form.includes("<Calendar"));
  assert.ok(form.includes('mode="single"'));
  assert.ok(form.includes("locale={ptBR}"));
  assert.equal(form.includes('type="date"'), false);
  assert.ok(form.includes("publicDemoAvailability("));
  assert.ok(form.includes("overflow-x-auto"));
  assert.ok(form.includes("useState(initialServiceId)"));
  assert.ok(
    source("public-demo-booking").includes(
      "createPublicAppointment(shopId, input)",
    ),
  );
});

test("original fictional service photography is reused; custom services use the shop cover", () => {
  assert.equal(
    demoServiceImage("Barba", "/banner.png"),
    "https://utfs.io/f/e6bdffb6-24a9-455b-aba3-903c2c2b5bde-1jo6tu.png",
  );
  assert.equal(
    demoServiceImage("Serviço personalizado", "/banner.png"),
    "/banner.png",
  );
});
