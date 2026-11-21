import { exampleBarbershops } from "./demo-catalog";
import { saveDemoProfessional } from "../admin/profissionais/_lib/professional";
import { emptyWeek, saveDemoWeek } from "../admin/horarios/_lib/schedule";

// Public fictional fixture only: never included in the owner's shop collection.
export function createExampleBookingShops() {
  const example = exampleBarbershops.find(
    (shop) => shop.name === "Aparência Impecável",
  );
  if (!example) throw new Error("EXAMPLE_BOOKING_FIXTURE_MISSING");
  const professionalId = `${example.id}:professional-demo`;
  let shops = saveDemoProfessional(
    [example],
    example.id,
    professionalId,
    {
      name: "Profissional Exemplo",
      phone: "",
      description: "Profissional fictício para simulação de agendamentos.",
      photoUrl: "",
      active: true,
      serviceIds: example.services.map((service) => service.id),
    },
    false,
  );
  const week = emptyWeek().map((day) => ({
    ...day,
    windows: [{ start: "09:00", end: "18:00" }],
    breaks: [{ start: "12:00", end: "13:00" }],
  }));
  shops = saveDemoWeek(shops, example.id, null, week);
  return saveDemoWeek(shops, example.id, professionalId, week);
}
