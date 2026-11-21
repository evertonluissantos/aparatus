import { z } from "zod";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";

export const professionalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe pelo menos 2 caracteres.")
    .max(80, "Use até 80 caracteres."),
  phone: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^[+\d\s().-]+$/.test(value) &&
          /^(?:55)?\d{10,11}$/.test(value.replace(/\D/g, ""))),
      "Informe um telefone com DDD ou deixe em branco.",
    )
    .transform((value) => value.replace(/\D/g, "")),
  description: z
    .string()
    .trim()
    .min(1, "Descreva a atuação do profissional.")
    .max(300, "Use até 300 caracteres."),
  photoUrl: z
    .string()
    .refine(
      (value) =>
        value === "" ||
        (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          value,
        ) &&
          value.length <= 2_800_000),
      "Selecione uma foto JPG, PNG ou WebP de até 2 MB.",
    ),
  active: z.boolean(),
  serviceIds: z
    .array(z.string())
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Não repita associações de serviços.",
    ),
});
export type ProfessionalInput = z.input<typeof professionalSchema>;
export type DemoProfessional = z.output<typeof professionalSchema> & {
  id: string;
  barbershopId: string;
};

export function parseProfessional(
  input: ProfessionalInput,
  shop: DemoBarbershop,
  previous?: DemoProfessional,
) {
  const result = professionalSchema.safeParse(input);
  if (!result.success)
    return {
      success: false as const,
      errors: result.error.flatten().fieldErrors,
    };
  const valid = result.data.serviceIds.every((id) =>
    shop.services.some(
      (service) =>
        service.id === id &&
        service.barbershopId === shop.id &&
        (service.active ||
          (previous?.barbershopId === shop.id &&
            previous.serviceIds.includes(id))),
    ),
  );
  if (!valid)
    return {
      success: false as const,
      errors: {
        serviceIds: [
          "Selecione apenas serviços ativos desta barbearia. Vínculos anteriores inativos podem ser mantidos ou removidos.",
        ],
      },
    };
  return { success: true as const, values: result.data };
}

// Only local state organization; real tenant authorization belongs on the server.
export function saveDemoProfessional(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  input: ProfessionalInput,
  editing: boolean,
) {
  const shop = shops.find((item) => item.id === shopId);
  if (!shop) throw new Error("DEMO_SHOP_NOT_FOUND");
  const previous = shop.professionals.find(
    (item) => item.id === id && item.barbershopId === shopId,
  );
  if (
    (editing && !previous) ||
    (!editing &&
      shops.some((item) =>
        item.professionals.some((professional) => professional.id === id),
      ))
  )
    throw new Error("DEMO_PROFESSIONAL_CONTEXT_MISMATCH");
  const result = parseProfessional(input, shop, previous);
  if (!result.success) throw new Error("DEMO_PROFESSIONAL_INVALID");
  const professional: DemoProfessional = {
    ...result.values,
    id,
    barbershopId: shopId,
  };
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          professionals: editing
            ? item.professionals.map((current) =>
                current.id === id ? professional : current,
              )
            : [...item.professionals, professional],
        },
  );
}

export function setDemoProfessionalActive(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  active: boolean,
) {
  const shop = shops.find((item) => item.id === shopId);
  if (
    !shop?.professionals.some(
      (item) => item.id === id && item.barbershopId === shopId,
    )
  )
    throw new Error("DEMO_PROFESSIONAL_CONTEXT_MISMATCH");
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          professionals: item.professionals.map((professional) =>
            professional.id === id ? { ...professional, active } : professional,
          ),
        },
  );
}

// Eligibility only, not availability: no working hours or bookings are evaluated.
export function eligibleDemoProfessionals(
  shop: DemoBarbershop,
  serviceId: string,
) {
  if (
    !shop.services.some(
      (service) =>
        service.id === serviceId &&
        service.barbershopId === shop.id &&
        service.active,
    )
  )
    return [];
  return shop.professionals.filter(
    (professional) =>
      professional.barbershopId === shop.id &&
      professional.active &&
      professional.serviceIds.includes(serviceId),
  );
}
