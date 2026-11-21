import { z } from "zod";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { matchesServiceName } from "../../servicos/_lib/service";

export const clientPhoneSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^[+\d\s().-]+$/.test(value) &&
        /^(?:55)?\d{10,11}$/.test(value.replace(/\D/g, ""))),
    "Informe DDD e telefone brasileiro válido ou deixe em branco.",
  )
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    return !digits ? "" : digits.length <= 11 ? `55${digits}` : digits;
  });
export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe pelo menos 2 caracteres.")
    .max(80, "Use até 80 caracteres."),
  phone: clientPhoneSchema,
  notes: z.string().trim().max(500, "Use até 500 caracteres nas observações."),
});
export type ClientInput = z.input<typeof clientSchema>;
export type DemoClient = z.output<typeof clientSchema> & {
  id: string;
  barbershopId: string;
  createdAt: string;
  updatedAt: string;
};
export class ClientError extends Error {}

export function saveDemoClient(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  input: ClientInput,
  editing: boolean,
  now: Date,
) {
  const shop = shops.find((item) => item.id === shopId);
  if (!shop) throw new ClientError("Barbearia demonstrativa não encontrada.");
  const result = clientSchema.safeParse(input);
  if (!result.success)
    throw new ClientError("Confira nome, telefone e observações.");
  const previous = shop.clients.find(
    (item) => item.id === id && item.barbershopId === shopId,
  );
  if (
    (editing && !previous) ||
    (!editing &&
      shops.some((item) => item.clients.some((client) => client.id === id)))
  )
    throw new ClientError(
      "Cliente não encontrado neste contexto ou identificador já utilizado.",
    );
  if (
    result.data.phone &&
    shop.clients.some(
      (client) => client.id !== id && client.phone === result.data.phone,
    )
  )
    throw new ClientError(
      "Este telefone já pertence a outro cliente desta barbearia. Edite o cadastro existente.",
    );
  const timestamp = now.toISOString();
  const client: DemoClient = {
    ...result.data,
    id,
    barbershopId: shopId,
    createdAt: previous?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          clients: editing
            ? item.clients.map((current) =>
                current.id === id ? client : current,
              )
            : [...item.clients, client],
        },
  );
}

// Used only after booking validation. Never merge names or overwrite client data
// from public input; phone matching here is organization, not proof of identity.
export function appointmentClient(
  shop: DemoBarbershop,
  id: string,
  name: string,
  phone: string,
  selectedId: string | undefined,
  now: Date,
) {
  if (selectedId) {
    const selected = shop.clients.find(
      (client) => client.id === selectedId && client.barbershopId === shop.id,
    );
    if (!selected)
      throw new ClientError("Selecione um cliente desta barbearia.");
    return selected;
  }
  const normalized = clientPhoneSchema.parse(phone);
  const existing = normalized
    ? shop.clients.find(
        (client) =>
          client.barbershopId === shop.id && client.phone === normalized,
      )
    : undefined;
  if (existing) return existing;
  if (shop.clients.some((client) => client.id === id))
    throw new ClientError("Identificador de cliente já utilizado.");
  const values = clientSchema.parse({ name, phone: normalized, notes: "" });
  return {
    ...values,
    id,
    barbershopId: shop.id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  } satisfies DemoClient;
}
export function clientHistory(shop: DemoBarbershop, clientId: string) {
  if (
    !shop.clients.some(
      (client) => client.id === clientId && client.barbershopId === shop.id,
    )
  )
    throw new ClientError("Cliente não encontrado nesta barbearia.");
  return shop.appointments
    .filter(
      (appointment) =>
        appointment.barbershopId === shop.id &&
        appointment.clientId === clientId,
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
export function clientMetrics(
  shop: DemoBarbershop,
  clientId: string,
  now: Date,
) {
  const history = clientHistory(shop, clientId);
  const completed = history
    .filter(
      (appointment) =>
        appointment.status === "COMPLETED" &&
        appointment.completedAt !== null &&
        new Date(appointment.completedAt).getTime() <= now.getTime() &&
        new Date(appointment.endsAt).getTime() <= now.getTime(),
    )
    .sort((a, b) => b.endsAt.localeCompare(a.endsAt));
  return {
    reservations: history.length,
    confirmed: history.filter(
      (appointment) => appointment.status === "CONFIRMED",
    ).length,
    cancelled: history.filter(
      (appointment) => appointment.status === "CANCELLED",
    ).length,
    completed: completed.length,
    lastCompletedAt: completed[0]?.endsAt ?? null,
  };
}
export function matchesDemoClient(client: DemoClient, query: string) {
  const digits = query.replace(/\D/g, "");
  return (
    matchesServiceName(client.name, query) ||
    Boolean(digits && client.phone.includes(digits))
  );
}
