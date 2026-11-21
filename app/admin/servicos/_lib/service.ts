import { z } from "zod";

export interface DemoService {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  durationMinutes: number;
  active: boolean;
}

// Values stay as strings in the form; conversion happens only after validation.
export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(80, "Use até 80 caracteres."),
  description: z
    .string()
    .trim()
    .min(1, "Descreva o serviço.")
    .max(300, "Use até 300 caracteres."),
  price: z
    .string()
    .trim()
    .regex(
      /^\d{1,6}([,.]\d{1,2})?$/,
      "Informe um preço, como 45,00, sem separador de milhar.",
    )
    .transform((value) => Math.round(Number(value.replace(",", ".")) * 100))
    .refine((value) => value > 0, "O preço deve ser maior que zero."),
  duration: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, "Informe a duração em minutos inteiros.")
    .transform(Number)
    .refine(
      (value) => value > 0 && value <= 1440,
      "Informe de 1 a 1.440 minutos.",
    ),
  active: z.boolean(),
});

export type ServiceFormValues = z.input<typeof serviceSchema>;
export type ServiceValues = Omit<DemoService, "id">;

export function parseService(values: ServiceFormValues) {
  const result = serviceSchema.safeParse(values);
  if (!result.success)
    return {
      success: false as const,
      errors: result.error.flatten().fieldErrors,
    };
  const { name, description, price, duration, active } = result.data;
  return {
    success: true as const,
    service: {
      name,
      description,
      priceInCents: price,
      durationMinutes: duration,
      active,
    },
  };
}

export const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function matchesServiceName(name: string, query: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  return normalize(name).includes(normalize(query));
}
