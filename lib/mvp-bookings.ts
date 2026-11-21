import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import * as authorization from "./authorization";
import { createPostgresBookingAdapter } from "./bookings/postgres";
import { calculateAvailability } from "./bookings/availability";
import { appointmentSchema } from "@/app/admin/agenda/_lib/appointment";
import { loadShop } from "./owner-store";
import type { DemoAppointment } from "@/app/admin/agenda/_lib/appointment";

const adapter = createPostgresBookingAdapter(prisma, authorization);
const selection = z.object({
  barbershopId: z.uuid(),
  serviceId: z.uuid(),
  professionalId: z.uuid(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("SECRET_REQUIRED");
  return value;
}
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function guestActor(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("cortz_guest="))
    ?.slice("cortz_guest=".length);
  if (!cookie || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(cookie))
    throw new Error("GUEST_COOKIE_REQUIRED");
  const [token, signature] = cookie.split(".");
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(sign(token), "hex"),
    )
  )
    throw new Error("GUEST_COOKIE_REJECTED");
  return sign(`booking:${token}`);
}
export function ensureGuestCookie(request: Request, response: Response) {
  try {
    guestActor(request);
  } catch {
    const token = randomBytes(32).toString("hex");
    response.headers.append(
      "Set-Cookie",
      `cortz_guest=${token}.${sign(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
  }
  return response;
}
export async function publicCatalog(slug?: string) {
  if (slug && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
    throw new Error("INVALID_SLUG");
  const shops = await prisma.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Barbershop" WHERE "published"=true AND EXISTS (SELECT 1 FROM "BarbershopMembership" owner WHERE owner."barbershopId"="Barbershop"."id" AND owner."role"='OWNER' AND owner."active"=true) AND (${slug ?? null}::text IS NULL OR "slug"=${slug ?? null}) ORDER BY "name" LIMIT 100`;
  return (
    await Promise.all(shops.map((s) => loadShop(prisma, s.id, true)))
  ).filter((s) => s !== null);
}
export async function available(input: unknown, staff = false) {
  const data = selection.parse(input);
  if (staff)
    await authorization.requireBarbershopPermission(
      data.barbershopId,
      "bookings:read",
    );
  else {
    const shops = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Barbershop" WHERE "id"=${data.barbershopId} AND "published"=true AND EXISTS (SELECT 1 FROM "BarbershopMembership" owner WHERE owner."barbershopId"="Barbershop"."id" AND owner."role"='OWNER' AND owner."active"=true)`;
    if (!shops[0]) throw new Error("NOT_FOUND");
  }
  return calculateAvailability(
    data,
    await adapter.reader.loadAvailability(data),
    new Date(),
  );
}
export async function book(request: Request, input: unknown, staff = false) {
  const data = z
    .object({
      barbershopId: z.uuid(),
      requestKey: z.uuid(),
      appointment: appointmentSchema,
    })
    .parse(input);
  const actor = staff
    ? sign(`owner:${(await authorization.requireAuthenticatedUser()).userId}`)
    : guestActor(request);
  const result = await adapter.createGuestBooking(
    { ...data.appointment, barbershopId: data.barbershopId },
    data.requestKey,
    actor,
    {
      name: data.appointment.clientName,
      phone: data.appointment.clientPhone ?? "",
      ...(staff ? { customerId: data.appointment.clientId } : {}),
    },
    staff,
  );
  if (!staff) {
    // Return only this actor's own confirmation, using the committed snapshots.
    const rows = await prisma.$queryRaw<
      Record<string, unknown>[]
    >`SELECT b."id",b."barbershopId",b."professionalId",b."serviceId",b."customerNameSnapshot",b."serviceNameSnapshot",b."professionalNameSnapshot",b."date",b."endsAt",b."createdAt",b."status",b."durationMinutesSnapshot",b."priceInCentsSnapshot",b."timeZoneSnapshot",b."cancelledAt",b."completedAt" FROM "Booking" b JOIN "BookingCommand" c ON c."bookingId"=b."id" AND c."barbershopId"=b."barbershopId" WHERE b."id"=${result.id} AND b."barbershopId"=${data.barbershopId} AND c."guestActorHash"=${actor} AND c."requestKey"=${data.requestKey}`;
    if (!rows[0]) throw new Error("CONFIRMATION_UNAVAILABLE");
    const b = rows[0],
      iso = (value: unknown) =>
        value instanceof Date ? value.toISOString() : String(value);
    const appointment: DemoAppointment = {
      id: String(b.id),
      barbershopId: String(b.barbershopId),
      professionalId: String(b.professionalId),
      serviceId: String(b.serviceId),
      clientId: "",
      clientName: String(b.customerNameSnapshot),
      serviceName: String(b.serviceNameSnapshot),
      professionalName: String(b.professionalNameSnapshot),
      startsAt: iso(b.date),
      endsAt: iso(b.endsAt),
      createdAt: iso(b.createdAt),
      status: b.status as DemoAppointment["status"],
      durationMinutesSnapshot: Number(b.durationMinutesSnapshot),
      priceInCentsSnapshot: Number(b.priceInCentsSnapshot),
      timeZoneSnapshot: String(b.timeZoneSnapshot),
      cancelledAt: b.cancelledAt ? iso(b.cancelledAt) : null,
      completedAt: b.completedAt ? iso(b.completedAt) : null,
    };
    return { id: result.id, appointment };
  }
  return loadShop(prisma, data.barbershopId);
}
export async function changeStatus(input: unknown) {
  const data = z
    .object({
      barbershopId: z.uuid(),
      id: z.uuid(),
      status: z.enum(["CANCELLED", "COMPLETED"]),
    })
    .parse(input);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Barbershop" WHERE "id"=${data.barbershopId} FOR UPDATE`;
    await authorization.requireBarbershopPermissionInTransaction(
      tx,
      data.barbershopId,
      "bookings:manage",
    );
    const changed = await tx.$queryRaw<
      { id: string }[]
    >`UPDATE "Booking" SET "status"=${data.status}::"BookingStatus","cancelled"=${data.status === "CANCELLED"},"cancelledAt"=CASE WHEN ${data.status}='CANCELLED' THEN now() ELSE NULL END,"completedAt"=CASE WHEN ${data.status}='COMPLETED' THEN now() ELSE NULL END WHERE "id"=${data.id} AND "barbershopId"=${data.barbershopId} AND "managedByCore"=true AND "status"='CONFIRMED' AND (${data.status}='CANCELLED' OR "endsAt"<=now()) RETURNING "id"`;
    if (!changed[0]) throw new Error("INVALID_TRANSITION");
    return loadShop(tx, data.barbershopId);
  });
}
