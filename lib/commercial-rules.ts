import { z } from "zod";
export const trialInputSchema = z
  .object({
    id: z.uuid().optional(),
    days: z.union([z.literal(3), z.literal(7), z.literal(15)]).optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (t) => (t.days !== undefined) !== (t.endsAt !== undefined),
    "Escolha uma duração ou um término personalizado.",
  );
export const commercialCommandSchema = z
  .object({
    barbershopId: z.uuid(),
    action: z.enum(["APPROVE", "REJECT", "TRIAL"]),
    trial: trialInputSchema.optional(),
  })
  .refine(
    (c) =>
      c.action === "TRIAL"
        ? !!c.trial
        : c.action === "REJECT"
          ? !c.trial
          : !c.trial?.id,
    "Operação incompatível com o período gratuito.",
  );
export function trialWindow(
  input: z.infer<typeof trialInputSchema>,
  now = new Date(),
) {
  const startsAt = input.startsAt ? new Date(input.startsAt) : now;
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startsAt.getTime() + input.days! * 86400000);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    endsAt <= startsAt
  )
    throw new Error("INVALID_TRIAL_INTERVAL");
  return { startsAt, endsAt };
}
export function trialState(startsAt: string, endsAt: string, now = new Date()) {
  if (new Date(endsAt) <= now) return "EXPIRED";
  return new Date(startsAt) > now ? "SCHEDULED" : "ACTIVE";
}
