import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import {
  requireOwnerPanelAccess,
  requireBarbershopPermissionInTransaction,
} from "./authorization";
import type { BookingSql } from "./bookings/postgres";
import type { DemoBarbershop } from "@/app/admin/_lib/demo-barbershop";
import { barbershopSchema } from "@/app/admin/_lib/demo-barbershop";
import {
  emptySchedule,
  emptyWeek,
  minuteLabel,
  effectiveWindows,
  saveDemoWeek,
  addDemoBlock,
  removeDemoBlock,
  type DaySchedule,
  type BlockInput,
} from "@/app/admin/horarios/_lib/schedule";
import {
  professionalSchema,
  parseProfessional,
} from "@/app/admin/profissionais/_lib/professional";
import { clientSchema } from "@/app/admin/clientes/_lib/client";
import { postgresBookingReader } from "./bookings/postgres";
import { validateBookingRequest } from "./bookings/availability";
import { localDateAt } from "./bookings/timezone";

type Row = Record<string, unknown>;
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);
const nullableIso = (value: unknown) => (value == null ? null : iso(value));
export function shopRevision(shop: DemoBarbershop) {
  return createHash("sha256").update(JSON.stringify(shop)).digest("hex");
}
async function preserveFutureBookings(sql: BookingSql, id: string) {
  const future = await sql.$queryRaw<
    {
      id: string;
      serviceId: string;
      professionalId: string | null;
      date: Date;
      endsAt: Date | null;
      durationMinutesSnapshot: number | null;
    }[]
  >`SELECT "id","serviceId","professionalId","date","endsAt","durationMinutesSnapshot" FROM "Booking" WHERE "barbershopId"=${id} AND "cancelled" IS NOT TRUE AND ("status" IS NULL OR "status"='CONFIRMED') AND ("endsAt">now() OR ("endsAt" IS NULL AND "date">now()))`;
  for (const b of future) {
    if (!b.professionalId || !b.endsAt || !b.durationMinutesSnapshot)
      throw new Error("LEGACY_DATA_REQUIRES_REVIEW");
    const reader = postgresBookingReader(sql);
    const initial = {
      barbershopId: id,
      professionalId: b.professionalId,
      serviceId: b.serviceId,
      localDate: localDateAt(b.date, "America/Sao_Paulo"),
    };
    const snapshot = await reader.loadAvailability(initial);
    snapshot.bookings = snapshot.bookings.filter(
      (other) =>
        !(
          other.professionalId === b.professionalId &&
          other.date.getTime() === b.date.getTime() &&
          other.endsAt?.getTime() === b.endsAt!.getTime()
        ),
    );
    snapshot.service.durationMinutes = b.durationMinutesSnapshot;
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: snapshot.timeZone!,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(b.date);
    validateBookingRequest(
      { ...initial, localTime },
      snapshot,
      new Date(b.date.getTime() - 1),
    );
  }
}
export async function loadShop(
  sql: BookingSql,
  id: string,
  publicOnly = false,
): Promise<DemoBarbershop | null> {
  const rows = await sql.$queryRaw<
    Row[]
  >`SELECT * FROM "Barbershop" WHERE "id" = ${id} AND (${!publicOnly} OR "published" = true)`;
  if (!rows[0]) return null;
  const row = rows[0];
  const services = await sql.$queryRaw<
    DemoBarbershop["services"]
  >`SELECT "id", "barbershopId", "name", "description", "priceInCents", "durationMinutes", "active" FROM "BarbershopService" WHERE "barbershopId" = ${id} AND (${!publicOnly} OR "active" = true) ORDER BY "name", "id"`;
  const professionals = await sql.$queryRaw<
    (Row & { id: string })[]
  >`SELECT "id", "name", "phone", "description", "imageUrl", "active" FROM "Professional" WHERE "barbershopId" = ${id} AND (${!publicOnly} OR "active" = true) ORDER BY "name", "id"`;
  const assignments = await sql.$queryRaw<
    { professionalId: string; serviceId: string }[]
  >`SELECT "professionalId", "serviceId" FROM "ProfessionalService" WHERE "barbershopId" = ${id} ORDER BY "professionalId", "serviceId"`;
  const hours = await sql.$queryRaw<
    {
      professionalId: string | null;
      weekday: number;
      startMinute: number;
      endMinute: number;
    }[]
  >`SELECT "professionalId", "weekday", "startMinute", "endMinute" FROM "WorkingHours" WHERE "barbershopId" = ${id} ORDER BY "professionalId", "weekday", "startMinute", "endMinute"`;
  const schedule = emptySchedule();
  for (const hour of hours) {
    const week =
      hour.professionalId === null
        ? schedule.shopWeek
        : (schedule.professionalWeeks[hour.professionalId] ??= emptyWeek());
    week[hour.weekday].windows.push({
      start: minuteLabel(hour.startMinute),
      end: minuteLabel(hour.endMinute),
    });
  }
  if (!publicOnly) {
    const blocks = await sql.$queryRaw<
      (Row & {
        id: string;
        professionalId: string | null;
        kind: "BREAK" | "ABSENCE" | "EXTRAORDINARY";
      })[]
    >`SELECT * FROM "ScheduleBlock" WHERE "barbershopId" = ${id} ORDER BY "id"`;
    schedule.blocks = blocks.map((b) => ({
      id: b.id,
      barbershopId: id,
      professionalId: b.professionalId,
      kind: b.kind,
      reason: String(b.reason ?? ""),
      startsAt: iso(b.startsAt),
      endsAt: iso(b.endsAt),
    }));
  }
  const clients = publicOnly
    ? []
    : await sql.$queryRaw<
        Row[]
      >`SELECT "id", "name", "phoneNormalized", "notes", "createdAt", "updatedAt" FROM "Customer" WHERE "barbershopId" = ${id} ORDER BY "name", "id"`;
  const bookings = publicOnly
    ? []
    : await sql.$queryRaw<
        Row[]
      >`SELECT b.*, s."name" AS "currentServiceName", p."name" AS "currentProfessionalName", c."name" AS "currentCustomerName" FROM "Booking" b JOIN "BarbershopService" s ON s."id"=b."serviceId" AND s."barbershopId"=b."barbershopId" LEFT JOIN "Professional" p ON p."id"=b."professionalId" AND p."barbershopId"=b."barbershopId" LEFT JOIN "Customer" c ON c."id"=b."customerId" AND c."barbershopId"=b."barbershopId" WHERE b."barbershopId"=${id} AND b."managedByCore"=true ORDER BY b."date", b."id"`;
  return {
    id,
    name: String(row.name),
    phone: (row.phones as string[])[0] ?? "",
    address: String(row.address),
    description: String(row.description),
    imageUrl: String(row.imageUrl),
    published: row.published === true,
    publicSlug: row.slug ? String(row.slug) : undefined,
    services,
    professionals: professionals.map((p) => ({
      id: p.id,
      barbershopId: id,
      name: String(p.name),
      phone: publicOnly ? "" : String(p.phone ?? ""),
      description: String(p.description ?? ""),
      photoUrl: String(p.imageUrl ?? ""),
      active: p.active === true,
      serviceIds: assignments
        .filter((a) => a.professionalId === p.id)
        .map((a) => a.serviceId),
    })),
    schedule,
    clients: clients.map((c) => ({
      id: String(c.id),
      barbershopId: id,
      name: String(c.name),
      phone: String(c.phoneNormalized ?? ""),
      notes: String(c.notes ?? ""),
      createdAt: iso(c.createdAt),
      updatedAt: iso(c.updatedAt),
    })),
    appointments: bookings.map((b) => ({
      id: String(b.id),
      barbershopId: id,
      professionalId: String(b.professionalId),
      serviceId: String(b.serviceId),
      clientId: String(b.customerId ?? ""),
      clientName: String(
        b.customerNameSnapshot ?? b.currentCustomerName ?? "Cliente",
      ),
      serviceName: String(b.serviceNameSnapshot ?? b.currentServiceName),
      professionalName: String(
        b.professionalNameSnapshot ?? b.currentProfessionalName,
      ),
      startsAt: iso(b.date),
      endsAt: iso(b.endsAt),
      createdAt: iso(b.createdAt ?? b.date),
      cancelledAt: nullableIso(b.cancelledAt),
      completedAt: nullableIso(b.completedAt),
      durationMinutesSnapshot: Number(b.durationMinutesSnapshot),
      priceInCentsSnapshot: Number(b.priceInCentsSnapshot),
      timeZoneSnapshot: String(b.timeZoneSnapshot),
      status: b.status as "CONFIRMED" | "CANCELLED" | "COMPLETED",
    })),
  };
}

export async function ownerShop() {
  const owner = await requireOwnerPanelAccess();
  return owner.barbershopId ? loadShop(prisma, owner.barbershopId) : null;
}
const serviceList = z
  .array(
    z.object({
      id: z.uuid(),
      barbershopId: z.uuid(),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().min(1).max(300),
      priceInCents: z.number().int().positive().max(99_999_999),
      durationMinutes: z.number().int().min(1).max(1440),
      active: z.boolean(),
    }),
  )
  .max(200);
const weekSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      windows: z
        .array(z.object({ start: z.string(), end: z.string() }))
        .max(12),
      breaks: z.array(z.object({ start: z.string(), end: z.string() })).max(12),
    }),
  )
  .length(7);
const envelope = z.object({
  op: z.enum([
    "create",
    "settings",
    "publication",
    "services",
    "professional",
    "professionalStatus",
    "week",
    "block",
    "removeBlock",
    "client",
  ]),
  data: z.unknown(),
  id: z.uuid().optional(),
  revision: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export async function ownerCommand(input: unknown) {
  const command = envelope.parse(input);
  const owner = await requireOwnerPanelAccess();
  return prisma.$transaction(
    async (tx) => {
      // Serialize onboarding for a user, and all schedule writers for a shop.
      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id"=${owner.userId} FOR UPDATE`;
      const links = await tx.$queryRaw<
        { barbershopId: string; active: boolean }[]
      >`SELECT "barbershopId", "active" FROM "BarbershopMembership" WHERE "userId"=${owner.userId} AND "role"='OWNER'`;
      if (command.op === "create") {
        if (links.length) throw new Error("OWNER_LIMIT");
        const data = barbershopSchema.parse(command.data);
        const id = randomUUID();
        const slug = `${
          data.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 50)
            .replace(/-+$/, "") || "barbearia"
        }-${id.slice(0, 8)}`;
        await tx.$queryRaw`INSERT INTO "Barbershop" ("id","name","address","description","imageUrl","phones","slug","published","timeZone") VALUES (${id},${data.name},${data.address},${data.description},${data.imageUrl},ARRAY[${data.phone}],${slug},false,'America/Sao_Paulo') RETURNING "id"`;
        await tx.$queryRaw`INSERT INTO "BarbershopMembership" ("id","userId","barbershopId","role","active","updatedAt") VALUES (${randomUUID()},${owner.userId},${id},'OWNER',true,now()) RETURNING "id"`;
        return loadShop(tx, id);
      }
      if (links.length !== 1 || !links[0].active) throw new Error("FORBIDDEN");
      const id = links[0].barbershopId;
      await tx.$queryRaw`SELECT "id" FROM "Barbershop" WHERE "id"=${id} FOR UPDATE`;
      await requireBarbershopPermissionInTransaction(tx, id, "settings:write");
      const shop = await loadShop(tx, id);
      if (!shop) throw new Error("NOT_FOUND");
      if (command.revision !== shopRevision(shop))
        throw new Error("STALE_SHOP_RELOAD_REQUIRED");
      if (command.op === "settings") {
        const data = barbershopSchema.parse(command.data);
        await tx.$queryRaw`UPDATE "Barbershop" SET "name"=${data.name},"address"=${data.address},"description"=${data.description},"imageUrl"=${data.imageUrl},"phones"=ARRAY[${data.phone}] || COALESCE("phones"[2:array_length("phones",1)],'{}'::text[]) WHERE "id"=${id} RETURNING "id"`;
      } else if (command.op === "publication") {
        const published = z.boolean().parse(command.data);
        if (
          published &&
          (!shop.services.some((s) => s.active) ||
            !shop.professionals.some((p) => p.active && p.serviceIds.length))
        )
          throw new Error("CONFIGURE_SERVICES_FIRST");
        await tx.$queryRaw`UPDATE "Barbershop" SET "published"=${published} WHERE "id"=${id} RETURNING "id"`;
      } else if (command.op === "services") {
        const services = serviceList.parse(command.data);
        if (
          new Set(services.map((s) => s.id)).size !== services.length ||
          services.some((s) => s.barbershopId !== id) ||
          shop.services.some((s) => !services.some((n) => n.id === s.id))
        )
          throw new Error("INVALID_SERVICES");
        for (const s of services) {
          if (shop.services.some((old) => old.id === s.id))
            await tx.$queryRaw`UPDATE "BarbershopService" SET "name"=${s.name},"description"=${s.description},"priceInCents"=${s.priceInCents},"durationMinutes"=${s.durationMinutes},"active"=${s.active} WHERE "id"=${s.id} AND "barbershopId"=${id} RETURNING "id"`;
          else
            await tx.$queryRaw`INSERT INTO "BarbershopService" ("id","barbershopId","name","description","priceInCents","durationMinutes","active","imageUrl") VALUES (${s.id},${id},${s.name},${s.description},${s.priceInCents},${s.durationMinutes},${s.active},'/banner.png') RETURNING "id"`;
        }
      } else if (
        command.op === "professional" ||
        command.op === "professionalStatus"
      ) {
        const previous = shop.professionals.find((p) => p.id === command.id);
        if (command.id && !previous) throw new Error("NOT_FOUND");
        const data =
          command.op === "professionalStatus"
            ? { ...previous!, active: z.boolean().parse(command.data) }
            : professionalSchema.parse(command.data);
        const parsed = parseProfessional(data, shop, previous);
        if (!parsed.success) throw new Error("INVALID_ASSIGNMENT");
        const p = parsed.values,
          pid = command.id ?? randomUUID();
        if (previous)
          await tx.$queryRaw`UPDATE "Professional" SET "name"=${p.name},"phone"=${p.phone || null},"description"=${p.description},"imageUrl"=${p.photoUrl || null},"active"=${p.active} WHERE "id"=${pid} AND "barbershopId"=${id} RETURNING "id"`;
        else
          await tx.$queryRaw`INSERT INTO "Professional" ("id","barbershopId","name","phone","description","imageUrl","active") VALUES (${pid},${id},${p.name},${p.phone || null},${p.description},${p.photoUrl || null},${p.active}) RETURNING "id"`;
        await tx.$queryRaw`DELETE FROM "ProfessionalService" WHERE "professionalId"=${pid} AND "barbershopId"=${id} RETURNING "serviceId"`;
        for (const sid of p.serviceIds)
          await tx.$queryRaw`INSERT INTO "ProfessionalService" ("barbershopId","professionalId","serviceId") VALUES (${id},${pid},${sid}) RETURNING "serviceId"`;
      } else if (command.op === "week") {
        const data = z
          .object({ professionalId: z.uuid().nullable(), week: weekSchema })
          .parse(command.data);
        saveDemoWeek(
          [shop],
          id,
          data.professionalId,
          data.week as DaySchedule[],
        );
        // Store effective open windows: recurring pauses remain excluded after reload.
        await tx.$queryRaw`DELETE FROM "WorkingHours" WHERE "barbershopId"=${id} AND "professionalId" IS NOT DISTINCT FROM ${data.professionalId}::text RETURNING "id"`;
        for (const day of data.week)
          for (const w of effectiveWindows(day))
            await tx.$queryRaw`INSERT INTO "WorkingHours" ("id","barbershopId","professionalId","weekday","startMinute","endMinute") VALUES (${randomUUID()},${id},${data.professionalId},${day.weekday},${w.start},${w.end}) RETURNING "id"`;
        await preserveFutureBookings(tx, id);
      } else if (command.op === "block") {
        const data = z
          .object({
            professionalId: z.uuid().nullable(),
            start: z.string().max(30),
            end: z.string().max(30),
            allDay: z.boolean(),
            kind: z.enum(["BREAK", "ABSENCE", "EXTRAORDINARY"]),
            reason: z.string().max(300),
          })
          .parse(command.data);
        const bid = randomUUID();
        const updated = addDemoBlock([shop], id, bid, data as BlockInput);
        const b = updated[0].schedule.blocks.find((b) => b.id === bid)!;
        await tx.$queryRaw`INSERT INTO "ScheduleBlock" ("id","barbershopId","professionalId","startsAt","endsAt","kind","reason") VALUES (${bid},${id},${b.professionalId},${new Date(b.startsAt)},${new Date(b.endsAt)},${b.kind}::"ScheduleBlockKind",${b.reason}) RETURNING "id"`;
        await preserveFutureBookings(tx, id);
      } else if (command.op === "removeBlock") {
        if (
          !command.id ||
          !shop.schedule.blocks.some((b) => b.id === command.id)
        )
          throw new Error("NOT_FOUND");
        removeDemoBlock([shop], id, command.id);
        await tx.$queryRaw`DELETE FROM "ScheduleBlock" WHERE "id"=${command.id} AND "barbershopId"=${id} RETURNING "id"`;
      } else if (command.op === "client") {
        const c = clientSchema.parse(command.data);
        if (command.id && !shop.clients.some((c) => c.id === command.id))
          throw new Error("NOT_FOUND");
        if (command.id)
          await tx.$queryRaw`UPDATE "Customer" SET "name"=${c.name},"phoneNormalized"=${c.phone || null},"notes"=${c.notes},"updatedAt"=now() WHERE "id"=${command.id} AND "barbershopId"=${id} RETURNING "id"`;
        else
          await tx.$queryRaw`INSERT INTO "Customer" ("id","barbershopId","name","phoneNormalized","notes","updatedAt") VALUES (${randomUUID()},${id},${c.name},${c.phone || null},${c.notes},now()) RETURNING "id"`;
      }
      return loadShop(tx, id);
    },
    { isolationLevel: "ReadCommitted", timeout: 15000 },
  );
}
