import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { requireGlobalPermission } from "./authorization";

export const pixConfirmationSchema = z.object({
  barbershopId: z.uuid(),
  competence: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  amountInCents: z.number().int().positive().max(99_999_999),
});
export function pixCoverage(competence: string) {
  const value = z
    .string()
    .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
    .parse(competence);
  const [year, month] = value.split("-").map(Number);
  return {
    startsAt: new Date(Date.UTC(year, month - 1, 1)),
    endsAt: new Date(Date.UTC(year, month, 1)),
  };
}
export async function listSubscriptions() {
  await requireGlobalPermission("subscriptions:read");
  return prisma.$queryRaw<
    { id: string; name: string; paidUntil: Date | null }[]
  >`SELECT b."id",b."name",max(p."coverageEndsAt") FILTER (WHERE p."coverageStartsAt"<=now()) AS "paidUntil" FROM "Barbershop" b LEFT JOIN "ManualPixPayment" p ON p."barbershopId"=b."id" GROUP BY b."id",b."name" ORDER BY b."name"`;
}
export async function confirmPix(input: unknown) {
  const data = pixConfirmationSchema.parse(input);
  const admin = await requireGlobalPermission("subscription-payments:confirm");
  const coverage = pixCoverage(data.competence);
  return prisma.$transaction(async (tx) => {
    // Recheck active global authority inside the write transaction.
    const authority = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "GlobalAdmin" WHERE "id"=${admin.globalAdminId} AND "userId"=${admin.userId} AND "active"=true FOR SHARE`;
    if (!authority[0]) throw new Error("FORBIDDEN");
    await tx.$queryRaw`SELECT "id" FROM "Barbershop" WHERE "id"=${data.barbershopId} FOR UPDATE`;
    const existing = await tx.$queryRaw<
      { id: string; amountInCents: number }[]
    >`SELECT "id","amountInCents" FROM "ManualPixPayment" WHERE "barbershopId"=${data.barbershopId} AND "competence"=${data.competence}`;
    if (existing[0]) {
      if (existing[0].amountInCents !== data.amountInCents)
        throw new Error("PAYMENT_ALREADY_CONFIRMED");
      return { id: existing[0].id };
    }
    const id = randomUUID();
    await tx.$queryRaw`INSERT INTO "ManualPixPayment" ("id","barbershopId","competence","amountInCents","confirmedById","coverageStartsAt","coverageEndsAt") VALUES (${id},${data.barbershopId},${data.competence},${data.amountInCents},${admin.globalAdminId},${coverage.startsAt},${coverage.endsAt}) RETURNING "id"`;
    return { id };
  });
}
