import "server-only";
import { prisma } from "./prisma";
import { requireGlobalPermission } from "./authorization";

export async function executiveReport() {
  await requireGlobalPermission("subscription-metrics:read");
  const [totals, months] = await Promise.all([
    prisma.$queryRaw<
      {
        totalReceived: string;
        monthReceived: string;
        payments: string;
        shops: string;
        active: string;
        suspended: string;
        published: string;
        owners: string;
        accounts: string;
        pending: string;
      }[]
    >`
      SELECT
      (SELECT COALESCE(sum("amountInCents"),0)::text FROM "ManualPixPayment") AS "totalReceived",
      (SELECT COALESCE(sum("amountInCents"),0)::text FROM "ManualPixPayment" WHERE date_trunc('month',"confirmedAt" AT TIME ZONE 'America/Sao_Paulo')=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')) AS "monthReceived",
      (SELECT count(*)::text FROM "ManualPixPayment") AS "payments",
      count(*) FILTER(WHERE "approvalStatus"='PENDING')::text AS "pending",
      count(*)::text AS "shops",count(*) FILTER(WHERE NOT "suspended")::text AS "active",
      count(*) FILTER(WHERE "suspended")::text AS "suspended",count(*) FILTER(WHERE "published")::text AS "published",
      (SELECT count(DISTINCT "userId")::text FROM "BarbershopMembership" WHERE "role"='OWNER') AS "owners",
      (SELECT count(*)::text FROM "user" u WHERE NOT EXISTS(SELECT 1 FROM "GlobalAdmin" g WHERE g."userId"=u."id")) AS "accounts"
      FROM "Barbershop"`,
    prisma.$queryRaw<{ month: string; received: string }[]>`
      WITH months AS (SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')-interval '5 months',date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo'),interval '1 month') AS month),
      receipts AS (SELECT date_trunc('month',"confirmedAt" AT TIME ZONE 'America/Sao_Paulo') AS month,sum("amountInCents") AS amount FROM "ManualPixPayment"
        WHERE "confirmedAt">=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')-interval '5 months') AT TIME ZONE 'America/Sao_Paulo'
        GROUP BY 1)
      SELECT to_char(m.month,'YYYY-MM') AS month,COALESCE(r.amount,0)::text AS received FROM months m LEFT JOIN receipts r ON r.month=m.month ORDER BY m.month`,
  ]);
  return { totals: totals[0], months };
}

export async function subscriptionCoverage() {
  await requireGlobalPermission("subscriptions:read");
  return prisma.$queryRaw<
    {
      id: string;
      name: string;
      lastCompetence: string | null;
      covered: boolean;
      competence: string;
    }[]
  >`
    SELECT b."id",b."name",to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS competence,
      (SELECT max(p."competence") FROM "ManualPixPayment" p WHERE p."barbershopId"=b."id") AS "lastCompetence",
      EXISTS(SELECT 1 FROM "ManualPixPayment" p WHERE p."barbershopId"=b."id" AND p."competence"=to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')) AS covered
    FROM "Barbershop" b ORDER BY b."name",b."id"`;
}

export async function paymentHistory() {
  await requireGlobalPermission("subscriptions:read");
  const rows = await prisma.$queryRaw<
    {
      id: string;
      shopName: string;
      competence: string;
      amountInCents: number;
      confirmedAt: Date;
      adminName: string;
    }[]
  >`
    SELECT p."id",b."name" AS "shopName",p."competence",p."amountInCents",p."confirmedAt",u."name" AS "adminName"
    FROM "ManualPixPayment" p JOIN "Barbershop" b ON b."id"=p."barbershopId"
    JOIN "GlobalAdmin" g ON g."id"=p."confirmedById" JOIN "user" u ON u."id"=g."userId"
    ORDER BY p."confirmedAt" DESC,p."id"`;
  return rows.map((row) => ({
    ...row,
    confirmedAt: row.confirmedAt.toISOString(),
  }));
}
