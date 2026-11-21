import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type * as Authorization from "@/lib/authorization";
import type {
  AvailabilityRequest,
  AvailabilitySnapshot,
  BookingReader,
  BookingRequest,
  PrivateBooking,
  ScheduleScope,
} from "./types";
import { validateBookingRequest } from "./availability";
import {
  BookingRuleError,
  occupiesSchedule,
  overlaps,
  requireInterval,
} from "./rules";
import { parseLocalDate } from "./timezone";

export type BookingSql = Pick<Prisma.TransactionClient, "$queryRaw">;
export interface BookingDatabase extends BookingSql {
  $transaction<T>(
    work: (tx: BookingSql) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; timeout: number },
  ): Promise<T>;
}
type Authority = Pick<
  typeof Authorization,
  "requireAuthenticatedUser" | "requireBarbershopPermissionInTransaction"
>;
type Stored = PrivateBooking & {
  priceInCentsSnapshot: number;
  durationMinutesSnapshot: number;
  timeZoneSnapshot: string;
};

function ids(...values: string[]) {
  if (values.some((id) => !z.uuid().safeParse(id).success))
    throw new BookingRuleError("INVALID_IDENTIFIER");
}

export function postgresBookingReader(sql: BookingSql): BookingReader {
  async function find(scope: {
    barbershopId: string;
    bookingId: string;
    userId?: string;
  }) {
    ids(scope.barbershopId, scope.bookingId);
    const rows = await sql.$queryRaw<PrivateBooking[]>`
      SELECT "id", "userId", "barbershopId", "serviceId", "professionalId", "date", "endsAt", "status", "cancelled"
      FROM "Booking" WHERE "id" = ${scope.bookingId} AND "barbershopId" = ${scope.barbershopId}
        AND (${scope.userId ?? null}::text IS NULL OR "userId" = ${scope.userId ?? null})`;
    return rows[0] ?? null;
  }
  return {
    findCustomerBooking: (scope) => {
      if (!scope.userId) throw new BookingRuleError("UNAUTHENTICATED");
      return find(scope);
    },
    findStaffBooking: find,
    async loadAvailability(
      request: AvailabilityRequest,
    ): Promise<AvailabilitySnapshot> {
      ids(request.barbershopId, request.professionalId, request.serviceId);
      parseLocalDate(request.localDate);
      const shops = await sql.$queryRaw<
        { barbershopId: string; timeZone: string | null }[]
      >`SELECT "id" AS "barbershopId", "timeZone" FROM "Barbershop" WHERE "id" = ${request.barbershopId}`;
      const services = await sql.$queryRaw<
        AvailabilitySnapshot["service"][]
      >`SELECT "id", "barbershopId", "durationMinutes", "priceInCents" FROM "BarbershopService" WHERE "id" = ${request.serviceId} AND "barbershopId" = ${request.barbershopId} AND "active" = true`;
      const professionals = await sql.$queryRaw<
        AvailabilitySnapshot["professional"][]
      >`SELECT "id", "barbershopId", "active" FROM "Professional" WHERE "id" = ${request.professionalId} AND "barbershopId" = ${request.barbershopId}`;
      const assignments = await sql.$queryRaw<
        AvailabilitySnapshot["assignment"][]
      >`SELECT "barbershopId", "professionalId", "serviceId" FROM "ProfessionalService" WHERE "barbershopId" = ${request.barbershopId} AND "professionalId" = ${request.professionalId} AND "serviceId" = ${request.serviceId}`;
      if (!shops[0] || !services[0] || !professionals[0] || !assignments[0])
        throw new BookingRuleError("ENTITY_NOT_FOUND");
      // Broad UTC bounds contain the local day without normalizing a DST midnight.
      // Unknown ends are never dropped by a same-day-only query.
      const day = Date.parse(`${request.localDate}T00:00:00Z`);
      const lower = new Date(day - 48 * 3_600_000),
        upper = new Date(day + 72 * 3_600_000);
      const workingHours = await sql.$queryRaw<
        AvailabilitySnapshot["workingHours"]
      >`SELECT "barbershopId", "professionalId", "weekday", "startMinute", "endMinute" FROM "WorkingHours" WHERE "barbershopId" = ${request.barbershopId} AND ("professionalId" IS NULL OR "professionalId" = ${request.professionalId})`;
      const blocks = await sql.$queryRaw<
        AvailabilitySnapshot["blocks"]
      >`SELECT "barbershopId", "professionalId", "startsAt", "endsAt" FROM "ScheduleBlock" WHERE "barbershopId" = ${request.barbershopId} AND ("professionalId" IS NULL OR "professionalId" = ${request.professionalId}) AND "startsAt" < ${upper} AND "endsAt" > ${lower}`;
      const bookings = await sql.$queryRaw<
        AvailabilitySnapshot["bookings"]
      >`SELECT "barbershopId", "professionalId", "date", "endsAt", "status", "cancelled" FROM "Booking" WHERE "barbershopId" = ${request.barbershopId} AND ("professionalId" IS NULL OR "professionalId" = ${request.professionalId}) AND "date" < ${upper} AND ("endsAt" IS NULL OR "endsAt" > ${lower})`;
      return {
        ...shops[0],
        service: services[0],
        professional: professionals[0],
        assignment: assignments[0],
        workingHours,
        blocks,
        bookings,
      };
    },
  };
}

export function createPostgresBookingAdapter(
  database: BookingDatabase,
  authority: Authority,
  clock: () => Date = () => new Date(),
) {
  async function lock(
    sql: BookingSql,
    scope: ScheduleScope | { barbershopId: string },
  ) {
    ids(scope.barbershopId);
    // ponytail: whole-shop lock serializes this small prepared adapter, including
    // global blocks; per-professional protocol only after measured demand.
    const rows = await sql.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Barbershop" WHERE "id" = ${scope.barbershopId} FOR UPDATE`;
    if (!rows[0]) throw new BookingRuleError("ENTITY_NOT_FOUND");
  }
  async function create(
    request: BookingRequest,
    requestKey: string,
    kind: "customer" | "staff",
    customerUserId?: string,
  ) {
    ids(
      request.barbershopId,
      request.professionalId,
      request.serviceId,
      requestKey,
    );
    const identity = await authority.requireAuthenticatedUser();
    const userId = kind === "customer" ? identity.userId : customerUserId;
    if (!userId || typeof userId !== "string")
      throw new BookingRuleError("INVALID_CUSTOMER");
    const fingerprint = JSON.stringify([
      kind,
      userId,
      request.serviceId,
      request.professionalId,
      request.localDate,
      request.localTime,
    ]);
    return database.$transaction(
      async (sql) => {
        await lock(sql, request);
        if (kind === "staff") {
          const context =
            await authority.requireBarbershopPermissionInTransaction(
              sql,
              request.barbershopId,
              "bookings:manage",
            );
          if (context.userId !== identity.userId)
            throw new BookingRuleError("IDENTITY_CHANGED");
          const clients = await sql.$queryRaw<
            { userId: string }[]
          >`SELECT "userId" FROM "Booking" WHERE "barbershopId" = ${request.barbershopId} AND "userId" = ${userId} LIMIT 1`;
          if (!clients[0]) throw new BookingRuleError("CUSTOMER_NOT_FOUND");
        }
        const commands = await sql.$queryRaw<
          { bookingId: string; fingerprint: string }[]
        >`SELECT "bookingId", "fingerprint" FROM "BookingCommand" WHERE "barbershopId" = ${request.barbershopId} AND "userId" = ${identity.userId} AND "requestKey" = ${requestKey}`;
        if (commands[0]) {
          if (commands[0].fingerprint !== fingerprint)
            throw new BookingRuleError("IDEMPOTENCY_KEY_REUSED");
          const saved = await sql.$queryRaw<
            Stored[]
          >`SELECT * FROM "Booking" WHERE "id" = ${commands[0].bookingId} AND "barbershopId" = ${request.barbershopId} AND "userId" = ${userId}`;
          if (!saved[0])
            throw new BookingRuleError("IDEMPOTENCY_RECORD_INVALID");
          return saved[0];
        }
        const snapshot =
          await postgresBookingReader(sql).loadAvailability(request);
        const candidate = validateBookingRequest(request, snapshot, clock());
        const bookingId = randomUUID();
        const rows = await sql.$queryRaw<Stored[]>`
        INSERT INTO "Booking" ("id", "userId", "barbershopId", "serviceId", "professionalId", "date", "endsAt", "status", "cancelled", "priceInCentsSnapshot", "durationMinutesSnapshot", "timeZoneSnapshot", "managedByCore")
        VALUES (${bookingId}, ${userId}, ${request.barbershopId}, ${request.serviceId}, ${request.professionalId}, ${candidate.startsAt}, ${candidate.endsAt}, 'CONFIRMED', false, ${candidate.priceInCentsSnapshot}, ${candidate.durationMinutesSnapshot}, ${candidate.timeZoneSnapshot}, true)
        RETURNING *`;
        await sql.$queryRaw`INSERT INTO "BookingCommand" ("id", "barbershopId", "userId", "requestKey", "fingerprint", "bookingId") VALUES (${randomUUID()}, ${request.barbershopId}, ${identity.userId}, ${requestKey}, ${fingerprint}, ${bookingId}) RETURNING "id"`;
        return rows[0];
      },
      { isolationLevel: "ReadCommitted", timeout: 10_000 },
    );
  }
  return {
    reader: postgresBookingReader(database),
    // Called only by the server HTTP boundary. Actor hashes and staff identity
    // must be derived there, never accepted as browser authorization claims.
    async createGuestBooking(
      request: BookingRequest,
      requestKey: string,
      actorHash: string,
      customer: { name: string; phone: string; customerId?: string },
      staff = false,
    ) {
      ids(
        request.barbershopId,
        request.professionalId,
        request.serviceId,
        requestKey,
      );
      if (
        !/^[a-f0-9]{64}$/.test(actorHash) ||
        customer.name.length < 2 ||
        customer.name.length > 80 ||
        (customer.phone && !/^55\d{10,11}$/.test(customer.phone))
      )
        throw new BookingRuleError("INVALID_CUSTOMER");
      const identity = staff
        ? await authority.requireAuthenticatedUser()
        : null;
      const fingerprint = JSON.stringify([request, customer]);
      return database.$transaction(
        async (sql) => {
          await lock(sql, request);
          if (staff) {
            const access =
              await authority.requireBarbershopPermissionInTransaction(
                sql,
                request.barbershopId,
                "bookings:manage",
              );
            if (access.userId !== identity!.userId)
              throw new BookingRuleError("IDENTITY_CHANGED");
          } else {
            const shops = await sql.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "Barbershop" WHERE "id"=${request.barbershopId} AND "published"=true AND EXISTS (SELECT 1 FROM "BarbershopMembership" owner WHERE owner."barbershopId"="Barbershop"."id" AND owner."role"='OWNER' AND owner."active"=true)`;
            if (!shops[0]) throw new BookingRuleError("ENTITY_NOT_FOUND");
          }
          const commands = await sql.$queryRaw<
            { bookingId: string; fingerprint: string }[]
          >`SELECT "bookingId","fingerprint" FROM "BookingCommand" WHERE "barbershopId"=${request.barbershopId} AND "guestActorHash"=${actorHash} AND "requestKey"=${requestKey}`;
          if (commands[0]) {
            if (commands[0].fingerprint !== fingerprint)
              throw new BookingRuleError("IDEMPOTENCY_KEY_REUSED");
            return { id: commands[0].bookingId };
          }
          if (!staff) {
            const counts = await sql.$queryRaw<
              { count: number }[]
            >`SELECT count(*)::int AS count FROM "BookingCommand" WHERE "barbershopId"=${request.barbershopId} AND "guestActorHash"=${actorHash} AND "createdAt">now()-interval '15 minutes'`;
            if (counts[0].count >= 6)
              throw new BookingRuleError("RATE_LIMITED");
          }
          const snapshot =
            await postgresBookingReader(sql).loadAvailability(request);
          const candidate = validateBookingRequest(request, snapshot, clock());
          let customerId: string;
          if (staff && customer.customerId) {
            ids(customer.customerId);
            const customers = await sql.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "Customer" WHERE "id"=${customer.customerId} AND "barbershopId"=${request.barbershopId}`;
            if (!customers[0]) throw new BookingRuleError("CUSTOMER_NOT_FOUND");
            customerId = customers[0].id;
          } else {
            // A phone match never updates an existing person's name or notes.
            const customers = customer.phone
              ? await sql.$queryRaw<
                  { id: string }[]
                >`SELECT "id" FROM "Customer" WHERE "phoneNormalized"=${customer.phone} AND "barbershopId"=${request.barbershopId}`
              : [];
            customerId = customers[0]?.id ?? randomUUID();
            if (!customers[0])
              await sql.$queryRaw`INSERT INTO "Customer" ("id","barbershopId","name","phoneNormalized","updatedAt") VALUES (${customerId},${request.barbershopId},${customer.name},${customer.phone || null},now()) RETURNING "id"`;
          }
          const names = await sql.$queryRaw<
            { serviceName: string; professionalName: string }[]
          >`SELECT s."name" AS "serviceName",p."name" AS "professionalName" FROM "BarbershopService" s JOIN "Professional" p ON p."barbershopId"=s."barbershopId" WHERE s."id"=${request.serviceId} AND p."id"=${request.professionalId} AND s."barbershopId"=${request.barbershopId}`;
          const bookingId = randomUUID();
          await sql.$queryRaw`INSERT INTO "Booking" ("id","barbershopId","serviceId","professionalId","customerId","customerNameSnapshot","serviceNameSnapshot","professionalNameSnapshot","createdAt","date","endsAt","status","cancelled","priceInCentsSnapshot","durationMinutesSnapshot","timeZoneSnapshot","managedByCore") VALUES (${bookingId},${request.barbershopId},${request.serviceId},${request.professionalId},${customerId},${customer.name},${names[0].serviceName},${names[0].professionalName},now(),${candidate.startsAt},${candidate.endsAt},'CONFIRMED',false,${candidate.priceInCentsSnapshot},${candidate.durationMinutesSnapshot},${candidate.timeZoneSnapshot},true) RETURNING "id"`;
          await sql.$queryRaw`INSERT INTO "BookingCommand" ("id","barbershopId","guestActorHash","requestKey","fingerprint","bookingId") VALUES (${randomUUID()},${request.barbershopId},${actorHash},${requestKey},${fingerprint},${bookingId}) RETURNING "id"`;
          return { id: bookingId };
        },
        { isolationLevel: "ReadCommitted", timeout: 15000 },
      );
    },
    createCustomerBooking: (request: BookingRequest, requestKey: string) =>
      create(request, requestKey, "customer"),
    createStaffBooking: (
      request: BookingRequest,
      requestKey: string,
      customerUserId: string,
    ) => create(request, requestKey, "staff", customerUserId),
    async createScheduleBlock(input: {
      barbershopId: string;
      professionalId: string | null;
      startsAt: Date;
      endsAt: Date;
      kind: "BREAK" | "ABSENCE" | "EXTRAORDINARY";
      reason?: string;
    }) {
      ids(
        input.barbershopId,
        ...(input.professionalId ? [input.professionalId] : []),
      );
      requireInterval(input);
      if (!["BREAK", "ABSENCE", "EXTRAORDINARY"].includes(input.kind))
        throw new BookingRuleError("INVALID_BLOCK_KIND");
      const identity = await authority.requireAuthenticatedUser();
      return database.$transaction(
        async (sql) => {
          await lock(sql, input);
          const context =
            await authority.requireBarbershopPermissionInTransaction(
              sql,
              input.barbershopId,
              "schedule:write",
            );
          if (context.userId !== identity.userId)
            throw new BookingRuleError("IDENTITY_CHANGED");
          if (input.professionalId) {
            const professionals = await sql.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "Professional" WHERE "id" = ${input.professionalId} AND "barbershopId" = ${input.barbershopId}`;
            if (!professionals[0])
              throw new BookingRuleError("ENTITY_NOT_FOUND");
          }
          const bookings = await sql.$queryRaw<
            AvailabilitySnapshot["bookings"]
          >`SELECT "barbershopId", "professionalId", "date", "endsAt", "status", "cancelled" FROM "Booking" WHERE "barbershopId" = ${input.barbershopId} AND (${input.professionalId}::text IS NULL OR "professionalId" IS NULL OR "professionalId" = ${input.professionalId}) AND "date" < ${input.endsAt} AND ("endsAt" IS NULL OR "endsAt" > ${input.startsAt})`;
          for (const booking of bookings) {
            if (!occupiesSchedule(booking)) continue;
            if (!booking.endsAt)
              throw new BookingRuleError("LEGACY_DATA_REQUIRES_REVIEW");
            if (
              overlaps(input, {
                startsAt: booking.date,
                endsAt: booking.endsAt,
              })
            )
              throw new BookingRuleError("BLOCK_CONFLICT");
          }
          const id = randomUUID();
          await sql.$queryRaw`INSERT INTO "ScheduleBlock" ("id", "barbershopId", "professionalId", "startsAt", "endsAt", "kind", "reason") VALUES (${id}, ${input.barbershopId}, ${input.professionalId}, ${input.startsAt}, ${input.endsAt}, ${input.kind}::"ScheduleBlockKind", ${input.reason ?? null}) RETURNING "id"`;
          return { id };
        },
        { isolationLevel: "ReadCommitted", timeout: 10_000 },
      );
    },
  };
}
