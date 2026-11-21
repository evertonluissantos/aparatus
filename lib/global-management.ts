import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { requireGlobalPermission } from "./authorization";

export async function listOwners() {
  await requireGlobalPermission("barbershops:manage");
  // Accounts without a shop remain visible; credentials and sessions never leave the server.
  return prisma.$queryRaw<
    {
      id: string;
      name: string;
      email: string;
      shopName: string | null;
      membershipActive: boolean | null;
    }[]
  >`SELECT u."id",u."name",u."email",b."name" AS "shopName",m."active" AS "membershipActive"
    FROM "user" u LEFT JOIN "BarbershopMembership" m ON m."userId"=u."id" AND m."role"='OWNER'
    LEFT JOIN "Barbershop" b ON b."id"=m."barbershopId"
    WHERE m."id" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "GlobalAdmin" g WHERE g."userId"=u."id")
    ORDER BY u."name",u."id"`;
}

export async function listManagedShops() {
  await requireGlobalPermission("barbershops:manage");
  return prisma.$queryRaw<
    {
      id: string;
      name: string;
      published: boolean;
      suspended: boolean;
      ownerName: string | null;
      ownerEmail: string | null;
      lastCompetence: string | null;
    }[]
  >`SELECT b."id",b."name",b."published",b."suspended",u."name" AS "ownerName",u."email" AS "ownerEmail",
    (SELECT max(p."competence") FROM "ManualPixPayment" p WHERE p."barbershopId"=b."id") AS "lastCompetence"
    FROM "Barbershop" b LEFT JOIN "BarbershopMembership" m ON m."barbershopId"=b."id" AND m."role"='OWNER'
    LEFT JOIN "user" u ON u."id"=m."userId" ORDER BY b."name",b."id"`;
}

export const suspensionSchema = z.object({
  barbershopId: z.uuid(),
  suspended: z.boolean(),
});
export async function changeSuspension(input: unknown) {
  const data = suspensionSchema.parse(input);
  const admin = await requireGlobalPermission("barbershops:manage");
  return prisma.$transaction(async (tx) => {
    const authority = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GlobalAdmin" WHERE "id"=${admin.globalAdminId} AND "userId"=${admin.userId} AND "active"=true FOR SHARE`;
    if (!authority[0]) throw new Error("FORBIDDEN");
    const shops = await tx.$queryRaw<{ suspended: boolean }[]>`
      SELECT "suspended" FROM "Barbershop" WHERE "id"=${data.barbershopId} FOR UPDATE`;
    if (!shops[0]) throw new Error("NOT_FOUND");
    if (shops[0].suspended === data.suspended) return data;
    await tx.$queryRaw`UPDATE "Barbershop" SET "suspended"=${data.suspended} WHERE "id"=${data.barbershopId} RETURNING "id"`;
    await tx.$queryRaw`INSERT INTO "BarbershopAdministrationChange" ("id","barbershopId","globalAdminId","previousSuspended","suspended")
      VALUES (${randomUUID()},${data.barbershopId},${admin.globalAdminId},${shops[0].suspended},${data.suspended}) RETURNING "id"`;
    return data;
  });
}
