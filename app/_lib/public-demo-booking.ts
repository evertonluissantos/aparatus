import type { DemoBarbershop } from "../admin/_lib/demo-barbershop";
import {
  AgendaError,
  createDemoAppointment,
  type AppointmentInput,
} from "../admin/agenda/_lib/appointment";
import { previewDemoAvailability } from "../admin/horarios/_lib/schedule";

// Local publication gate, NOT authentication or tenant authorization.
export function publishedBookingShop(shops: DemoBarbershop[], id: string) {
  const shop = shops.find((item) => item.id === id && item.published);
  if (!shop)
    throw new AgendaError(
      "Barbearia indisponível para agendamento nesta demonstração.",
    );
  return shop;
}
export function publicDemoAvailability(
  shops: DemoBarbershop[],
  shopId: string,
  professionalId: string,
  serviceId: string,
  localDate: string,
  now: Date,
) {
  return previewDemoAvailability(
    publishedBookingShop(shops, shopId),
    professionalId,
    serviceId,
    localDate,
    now,
  );
}
export function createPublicDemoAppointment(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  input: AppointmentInput,
  now: Date,
) {
  publishedBookingShop(shops, shopId);
  if (input.clientId)
    throw new AgendaError(
      "O agendamento público não permite selecionar cadastros privados de clientes.",
    );
  // Final validation against the latest local agenda; do not trust rendered slots.
  return createDemoAppointment(shops, shopId, id, input, now);
}
