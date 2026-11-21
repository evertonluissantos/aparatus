import { z } from "zod";
import { demoServices } from "../servicos/_lib/demo-data";
import type { DemoService } from "../servicos/_lib/service";
import type { DemoProfessional } from "../profissionais/_lib/professional";
import { emptySchedule, type DemoSchedule } from "../horarios/_lib/schedule";
import type { DemoAppointment } from "../agenda/_lib/appointment";
import type { DemoClient } from "../clientes/_lib/client";

export const barbershopSchema = z.object({
  imageUrl: z
    .string()
    .refine(
      (value) =>
        value === "/banner.png" ||
        (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          value,
        ) &&
          value.length <= 2_800_000),
      "Selecione uma imagem JPG, PNG ou WebP de até 2 MB.",
    )
    .default("/banner.png"),
  name: z
    .string()
    .trim()
    .min(2, "Informe pelo menos 2 caracteres.")
    .max(80, "Use até 80 caracteres."),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d\s().-]+$/, "Use somente números e símbolos de telefone.")
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => /^(?:55)?\d{10,11}$/.test(value),
      "Informe DDD e telefone com 10 ou 11 dígitos; +55 é opcional.",
    ),
  address: z
    .string()
    .trim()
    .min(8, "Informe um endereço com pelo menos 8 caracteres.")
    .max(200, "Use até 200 caracteres."),
  description: z
    .string()
    .trim()
    .min(10, "Descreva a barbearia com pelo menos 10 caracteres.")
    .max(500, "Use até 500 caracteres."),
});
export type BarbershopInput = z.input<typeof barbershopSchema>;
export type BarbershopValues = z.output<typeof barbershopSchema>;
export type ScopedDemoService = DemoService & { barbershopId: string };
export type DemoBarbershop = BarbershopValues & {
  id: string;
  publicSlug?: string;
  published: boolean;
  services: ScopedDemoService[];
  professionals: DemoProfessional[];
  schedule: DemoSchedule;
  appointments: DemoAppointment[];
  clients: DemoClient[];
};

export function createDemoBarbershop(
  input: BarbershopInput,
  id: string,
): DemoBarbershop {
  const values = barbershopSchema.parse(input);
  return {
    ...values,
    id,
    published: false,
    professionals: [],
    schedule: emptySchedule(),
    appointments: [],
    clients: [],
    services: demoServices.map((service) => ({
      ...service,
      id: `${id}:${service.id}`,
      barbershopId: id,
    })),
  };
}

export function setDemoPublication(
  shops: DemoBarbershop[],
  id: string,
  published: boolean,
) {
  return shops.map((shop) => {
    if (shop.id !== id) return shop;
    if (published) barbershopSchema.parse(shop);
    return { ...shop, published };
  });
}

export function publishedDemoShops(shops: DemoBarbershop[]) {
  return shops.filter((shop) => shop.published);
}

// Local organization only, NOT an authorization boundary.
export function updateDemoServices(
  shops: DemoBarbershop[],
  shopId: string,
  update: (services: ScopedDemoService[]) => ScopedDemoService[],
) {
  return shops.map((shop) => {
    if (shop.id !== shopId) return shop;
    const services = update(shop.services.map((service) => ({ ...service })));
    if (services.some((service) => service.barbershopId !== shopId))
      throw new Error("DEMO_SERVICE_CONTEXT_MISMATCH");
    return { ...shop, services };
  });
}
