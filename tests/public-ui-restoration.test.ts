import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  homeDemoSections,
  searchDemoCatalog,
  nextPublicDemoAppointment,
} from "../app/_lib/demo-catalog";
import {
  createDemoBarbershop,
  setDemoPublication,
} from "../app/admin/_lib/demo-barbershop";
import type { DemoAppointment } from "../app/admin/agenda/_lib/appointment";

const input = {
  name: "Barbearia Nova Fictícia",
  phone: "11900000000",
  address: "Rua Exemplo, 100",
  description: "Barbearia fictícia de teste visual.",
};
test("public home: new publications never become recommended/popular and search stays local", () => {
  const shop = createDemoBarbershop(input, "demo-new");
  const shops = setDemoPublication([shop], shop.id, true);
  const sections = homeDemoSections(shops);
  assert.equal(sections.published[0].id, shop.id);
  assert.equal(
    sections.recommended.some((item) => item.id === shop.id),
    false,
  );
  assert.equal(
    sections.popular.some((item) => item.id === shop.id),
    false,
  );
  assert.ok(
    searchDemoCatalog(shops, "nova ficticia").some(
      (item) => item.id === shop.id,
    ),
  );
  assert.ok(searchDemoCatalog(shops, "barba").length);
  assert.equal(searchDemoCatalog([shop], "nova ficticia").length, 0);
});
test("compact home receipt: only future confirmed public simulations from this tab are shown", () => {
  const shop = createDemoBarbershop(input, "demo-a");
  const appointment: DemoAppointment = {
    id: "public-1",
    barbershopId: shop.id,
    clientId: "client-1",
    clientName: "Cliente Exemplo",
    serviceId: shop.services[0].id,
    serviceName: "Corte",
    professionalId: "demo-p",
    professionalName: "Profissional Exemplo",
    startsAt: "2030-01-07T13:00:00Z",
    endsAt: "2030-01-07T13:30:00Z",
    durationMinutesSnapshot: 30,
    priceInCentsSnapshot: 4500,
    timeZoneSnapshot: "America/Sao_Paulo",
    status: "CONFIRMED",
    createdAt: "2030-01-01T12:00:00Z",
    cancelledAt: null,
    completedAt: null,
  };
  const shops = [{ ...shop, appointments: [appointment] }];
  const now = new Date("2030-01-01T12:00:00Z");
  assert.equal(nextPublicDemoAppointment(shops, [], now), undefined);
  assert.equal(
    nextPublicDemoAppointment(shops, [appointment.id], now)?.appointment.id,
    appointment.id,
  );
  assert.equal(
    nextPublicDemoAppointment(
      [
        {
          ...shops[0],
          appointments: [{ ...appointment, status: "CANCELLED" }],
        },
      ],
      [appointment.id],
      now,
    ),
    undefined,
  );
  assert.equal(
    nextPublicDemoAppointment(
      shops,
      [appointment.id],
      new Date("2030-01-08T00:00:00Z"),
    ),
    undefined,
  );
});
test("public design contract: original home composition/carousels survive without admin shortcuts", () => {
  const home = readFileSync(
    new URL("../app/_components/demo-catalog.tsx", import.meta.url),
    "utf8",
  );
  const card = readFileSync(
    new URL("../app/_components/barbershop-item.tsx", import.meta.url),
    "utf8",
  );
  const scroller = readFileSync(
    new URL("../app/_components/ui/page-layout.tsx", import.meta.url),
    "utf8",
  );
  for (const component of [
    "Header",
    "SearchInput",
    "QuickSearchButtons",
    "PageContainer",
    "PageSectionScroller",
    "Footer",
    "DemoConfirmedBooking",
  ])
    assert.ok(home.includes(`<${component}`));
  assert.ok(home.includes('className="h-auto w-full"'));
  assert.ok(home.includes(">Recomendados</PageSectionTitle>"));
  assert.ok(home.includes(">Populares</PageSectionTitle>"));
  assert.ok(scroller.includes("flex gap-4 overflow-x-auto"));
  assert.ok(
    card.includes(
      'className="relative min-h-[200px] min-w-[290px] rounded-xl"',
    ),
  );
  assert.ok(card.includes('className="text-background text-lg font-bold"'));
  assert.equal(home.includes('href="/admin'), false);
  assert.equal(home.includes('className="grid'), false);
  const receipt = readFileSync(
    new URL("../app/_components/public-demo-booking.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(/href\s*=\s*(?:["']|\{`)[^\n]*\/admin\//.test(receipt), false);
});
