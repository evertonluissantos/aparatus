import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { requireGlobalPermission } from "./authorization";
import {
  commercialCommandSchema,
  trialWindow,
  trialState,
} from "./commercial-rules";

export async function commercialCommand(input: unknown) {
  const data = commercialCommandSchema.parse(input);
  const admin = await requireGlobalPermission("barbershops:manage");
  return prisma.$transaction(async (tx) => {
    const authority = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "GlobalAdmin" WHERE "id"=${admin.globalAdminId} AND "userId"=${admin.userId} AND "active"=true FOR SHARE`;
    if (!authority[0]) throw new Error("FORBIDDEN");
    const shops = await tx.$queryRaw<
      { approvalStatus: string }[]
    >`SELECT "approvalStatus" FROM "Barbershop" WHERE "id"=${data.barbershopId} FOR UPDATE`;
    if (!shops[0]) throw new Error("NOT_FOUND");
    const owns = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "BarbershopMembership" WHERE "barbershopId"=${data.barbershopId} AND "userId"=${admin.userId} AND "role"='OWNER' FOR SHARE`;
    if (owns[0]) throw new Error("SELF_ADMINISTRATION_REJECTED");
    const audit = async (action: string, details: object) => {
      await tx.$queryRaw`INSERT INTO "BarbershopCommercialEvent" ("id","barbershopId","globalAdminId","action","details") VALUES (${randomUUID()},${data.barbershopId},${admin.globalAdminId},${action},${JSON.stringify(details)}::jsonb) RETURNING "id"`;
    };
    if (data.action !== "TRIAL") {
      const status = data.action === "APPROVE" ? "APPROVED" : "REJECTED";
      if (shops[0].approvalStatus !== status) {
        await tx.$queryRaw`UPDATE "Barbershop" SET "approvalStatus"=${status}::"BarbershopApprovalStatus" WHERE "id"=${data.barbershopId} RETURNING "id"`;
        await audit(data.action, {
          previous: shops[0].approvalStatus,
          next: status,
        });
      }
    }
    if (data.trial) {
      let range: ReturnType<typeof trialWindow>;
      const id = data.trial.id ?? randomUUID();
      let before: { startsAt: Date; endsAt: Date } | null = null;
      if (data.trial.id) {
        const rows = await tx.$queryRaw<
          { startsAt: Date; endsAt: Date }[]
        >`SELECT "startsAt","endsAt" FROM "BarbershopFreeTrial" WHERE "id"=${id} AND "barbershopId"=${data.barbershopId} FOR UPDATE`;
        if (!rows[0]) throw new Error("TRIAL_NOT_FOUND");
        before = rows[0];
        range = trialWindow({
          ...data.trial,
          startsAt: data.trial.startsAt ?? before.startsAt.toISOString(),
        });
        await tx.$queryRaw`UPDATE "BarbershopFreeTrial" SET "startsAt"=${range.startsAt},"endsAt"=${range.endsAt},"updatedById"=${admin.globalAdminId},"updatedAt"=now() WHERE "id"=${id} AND "barbershopId"=${data.barbershopId} RETURNING "id"`;
      } else {
        range = trialWindow(data.trial);
        await tx.$queryRaw`INSERT INTO "BarbershopFreeTrial" ("id","barbershopId","startsAt","endsAt","grantedById","updatedById") VALUES (${id},${data.barbershopId},${range.startsAt},${range.endsAt},${admin.globalAdminId},${admin.globalAdminId}) RETURNING "id"`;
      }
      await audit(data.trial.id ? "UPDATE_TRIAL" : "GRANT_TRIAL", {
        trialId: id,
        previous: before,
        next: range,
      });
    }
    return { barbershopId: data.barbershopId };
  });
}

export async function listFreeTrials() {
  await requireGlobalPermission("barbershops:manage");
  const rows = await prisma.$queryRaw<
    {
      id: string;
      barbershopId: string;
      shopName: string;
      startsAt: Date;
      endsAt: Date;
      adminName: string;
      updatedByName: string;
    }[]
  >`
    SELECT t."id",t."barbershopId",b."name" AS "shopName",t."startsAt",t."endsAt",u."name" AS "adminName",up."name" AS "updatedByName"
    FROM "BarbershopFreeTrial" t JOIN "Barbershop" b ON b."id"=t."barbershopId"
    JOIN "GlobalAdmin" g ON g."id"=t."grantedById" JOIN "user" u ON u."id"=g."userId"
    JOIN "GlobalAdmin" gu ON gu."id"=t."updatedById" JOIN "user" up ON up."id"=gu."userId"
    ORDER BY t."createdAt" DESC,t."id"`;
  return rows.map((t) => ({
    ...t,
    startsAt: t.startsAt.toISOString(),
    endsAt: t.endsAt.toISOString(),
    state: trialState(t.startsAt.toISOString(), t.endsAt.toISOString()),
  }));
}
