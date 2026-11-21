import { z } from "zod";
import { validateBookingRequest } from "../../../../lib/bookings/availability";
import { BookingRuleError, instant } from "../../../../lib/bookings/rules";
import { localDateAt, parseLocalDate } from "../../../../lib/bookings/timezone";
import {
  DEMO_TIME_ZONE,
  demoAvailabilitySnapshot,
} from "../../horarios/_lib/schedule";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import {
  appointmentClient,
  clientPhoneSchema,
} from "../../clientes/_lib/client";

export const appointmentSchema = z.object({
  clientId: z.string().optional(),
  clientPhone: clientPhoneSchema.optional(),
  clientName: z
    .string()
    .trim()
    .min(2, "Informe pelo menos 2 caracteres.")
    .max(80, "Use até 80 caracteres."),
  serviceId: z.string().min(1, "Selecione um serviço."),
  professionalId: z.string().min(1, "Selecione um profissional."),
  localDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
});
export type AppointmentInput = z.input<typeof appointmentSchema>;
export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type DemoAppointment = {
  id: string;
  barbershopId: string;
  professionalId: string;
  serviceId: string;
  clientName: string;
  clientId: string;
  serviceName: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  durationMinutesSnapshot: number;
  priceInCentsSnapshot: number;
  timeZoneSnapshot: string;
  status: AppointmentStatus;
  createdAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
};
export const appointmentLabels: Record<AppointmentStatus, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
};
export class AgendaError extends Error {}

export function createDemoAppointment(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  input: AppointmentInput,
  now: Date,
) {
  const data = appointmentSchema.safeParse(input);
  if (!data.success)
    throw new AgendaError("Confira os campos obrigatórios do atendimento.");
  const shop = shops.find((item) => item.id === shopId);
  if (!shop) throw new AgendaError("Barbearia demonstrativa não encontrada.");
  if (
    shops.some((item) =>
      item.appointments.some((appointment) => appointment.id === id),
    )
  )
    throw new AgendaError(
      "Este identificador de atendimento já foi utilizado.",
    );
  const snapshot = demoAvailabilitySnapshot(
    shop,
    data.data.professionalId,
    data.data.serviceId,
  );
  if (!snapshot)
    throw new AgendaError(
      "Selecione serviço ativo e profissional ativo habilitado nesta barbearia.",
    );
  let candidate;
  try {
    candidate = validateBookingRequest(
      { ...data.data, barbershopId: shopId },
      snapshot,
      now,
    );
  } catch (error) {
    if (error instanceof BookingRuleError) {
      if (error.code === "PAST_START")
        throw new AgendaError(
          "O atendimento deve começar em um horário futuro.",
        );
      if (error.code === "UNAVAILABLE_SLOT")
        throw new AgendaError(
          "Horário indisponível: há conflito ou o atendimento atravessa expediente, pausa ou bloqueio.",
        );
      if (
        [
          "INVALID_LOCAL_DATE",
          "INVALID_LOCAL_TIME",
          "AMBIGUOUS_LOCAL_TIME",
          "NONEXISTENT_LOCAL_TIME",
        ].includes(error.code)
      )
        throw new AgendaError("Data ou horário inválido no fuso de São Paulo.");
    }
    throw new AgendaError(
      "Não foi possível validar o atendimento com a configuração atual.",
    );
  }
  const client = appointmentClient(
    shop,
    `${id}:client`,
    data.data.clientName,
    data.data.clientPhone ?? "",
    data.data.clientId,
    now,
  );
  const appointment: DemoAppointment = {
    id,
    barbershopId: shopId,
    professionalId: candidate.professionalId,
    serviceId: candidate.serviceId,
    clientName: data.data.clientId ? client.name : data.data.clientName,
    clientId: client.id,
    serviceName: shop.services.find(
      (service) => service.id === candidate.serviceId,
    )!.name,
    professionalName: shop.professionals.find(
      (professional) => professional.id === candidate.professionalId,
    )!.name,
    startsAt: candidate.startsAt.toISOString(),
    endsAt: candidate.endsAt.toISOString(),
    durationMinutesSnapshot: candidate.durationMinutesSnapshot,
    priceInCentsSnapshot: candidate.priceInCentsSnapshot,
    timeZoneSnapshot: candidate.timeZoneSnapshot,
    status: "CONFIRMED",
    createdAt: new Date(instant(now)).toISOString(),
    cancelledAt: null,
    completedAt: null,
  };
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          clients: item.clients.some((current) => current.id === client.id)
            ? item.clients
            : [...item.clients, client],
          appointments: [...item.appointments, appointment],
        },
  );
}

export function changeDemoAppointmentStatus(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  status: "CANCELLED" | "COMPLETED",
  now: Date,
) {
  const shop = shops.find((item) => item.id === shopId);
  const appointment = shop?.appointments.find(
    (item) => item.id === id && item.barbershopId === shopId,
  );
  if (!shop || !appointment)
    throw new AgendaError("Atendimento não encontrado nesta barbearia.");
  if (status !== "CANCELLED" && status !== "COMPLETED")
    throw new AgendaError("Alteração de status inválida.");
  if (appointment.status === status) return shops;
  if (appointment.status !== "CONFIRMED")
    throw new AgendaError(
      "Atendimentos cancelados ou concluídos não podem mudar de status.",
    );
  const timestamp = new Date(instant(now)).toISOString();
  if (
    status === "COMPLETED" &&
    instant(new Date(appointment.endsAt)) > instant(now)
  )
    throw new AgendaError(
      "Só é possível concluir após o término previsto do atendimento.",
    );
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          appointments: item.appointments.map((current) =>
            current.id !== id
              ? current
              : {
                  ...current,
                  status,
                  cancelledAt: status === "CANCELLED" ? timestamp : null,
                  completedAt: status === "COMPLETED" ? timestamp : null,
                },
          ),
        },
  );
}

export function dailyDemoAppointments(
  shop: DemoBarbershop,
  localDate: string,
  professionalId = "",
) {
  parseLocalDate(localDate);
  return shop.appointments
    .filter(
      (appointment) =>
        appointment.barbershopId === shop.id &&
        (!professionalId || appointment.professionalId === professionalId) &&
        localDateAt(
          new Date(appointment.startsAt),
          appointment.timeZoneSnapshot,
        ) === localDate,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function shiftAgendaDate(value: string, offset: number) {
  const civil = parseLocalDate(value);
  const date = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day + offset),
  )
    .toISOString()
    .slice(0, 10);
  parseLocalDate(date);
  return date;
}
export const agendaTime = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: DEMO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value instanceof Date ? value : new Date(value));
