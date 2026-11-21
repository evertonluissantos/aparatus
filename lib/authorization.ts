import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type MembershipRole = "OWNER" | "MANAGER" | "BARBER";
const tenantPermissions = [
  "services:read",
  "services:write",
  "professionals:read",
  "professionals:write",
  "schedule:read",
  "schedule:write",
  "bookings:read",
  "bookings:manage",
  "clients:read",
  "settings:read",
  "settings:write",
  "finance:read",
  "finance:write",
] as const;
export type TenantPermission = (typeof tenantPermissions)[number];
const rolePermissions: Record<MembershipRole, readonly TenantPermission[]> = {
  OWNER: tenantPermissions,
  MANAGER: [
    "services:read",
    "services:write",
    "professionals:read",
    "professionals:write",
    "schedule:read",
    "schedule:write",
    "bookings:read",
    "bookings:manage",
    "clients:read",
    "settings:read",
  ],
  // No membership-to-professional identity yet: do not grant private client data.
  BARBER: ["services:read", "professionals:read", "schedule:read"],
};
const globalPermissions = [
  "subscriptions:read",
  "subscriptions:manage",
  "subscription-payments:confirm",
  "subscription-metrics:read",
] as const;
export type GlobalPermission = (typeof globalPermissions)[number];

export class AuthorizationError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "NOT_FOUND",
  ) {
    super(code);
    this.name = "AuthorizationError";
  }
}

function requireId(value: unknown) {
  if (!z.uuid().safeParse(value).success)
    throw new AuthorizationError("INVALID_INPUT");
}

export async function requireAuthenticatedUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new AuthorizationError("UNAUTHENTICATED");
  return { userId: session.user.id };
}

type Membership = {
  id: string;
  userId: string;
  barbershopId: string;
  role: MembershipRole;
  active: boolean;
};

// Read all owner links, including inactive ones: suspension must not allow a
// second establishment. This is an access check, not a creation constraint.
export async function requireOwnerPanelAccess() {
  const { userId } = await requireAuthenticatedUser();
  const rows = await prisma.$queryRaw<Membership[]>`
    SELECT "id", "userId", "barbershopId", "role", "active"
    FROM "BarbershopMembership" WHERE "userId" = ${userId} AND "role" = 'OWNER' LIMIT 2`;
  if (
    rows.length > 1 ||
    rows.some(
      (row) =>
        row.userId !== userId || row.role !== "OWNER" || row.active !== true,
    )
  )
    throw new AuthorizationError("FORBIDDEN");
  return { userId, barbershopId: rows[0]?.barbershopId ?? null };
}

async function requirePermissionWithDatabase(
  barbershopId: string,
  permission: TenantPermission,
  database: Pick<typeof prisma, "$queryRaw">,
) {
  const { userId } = await requireAuthenticatedUser();
  requireId(barbershopId);
  // Parameterized SQL avoids delegates unavailable in the pre-migration client.
  // Missing tables/DB failures propagate: there is deliberately no legacy fallback.
  const rows = await database.$queryRaw<Membership[]>`
    SELECT "id", "userId", "barbershopId", "role", "active"
    FROM "BarbershopMembership"
    WHERE "userId" = ${userId} AND "barbershopId" = ${barbershopId} AND "active" = true FOR SHARE`;
  const membership = rows[0];
  if (
    !membership ||
    membership.active !== true ||
    membership.userId !== userId ||
    membership.barbershopId !== barbershopId ||
    !Object.hasOwn(rolePermissions, membership.role) ||
    !rolePermissions[membership.role].includes(permission)
  ) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return {
    userId,
    barbershopId,
    membershipId: membership.id,
    role: membership.role,
  };
}

export async function requireBarbershopPermission(
  barbershopId: string,
  permission: TenantPermission,
) {
  return requirePermissionWithDatabase(barbershopId, permission, prisma);
}

// Explicit server-only transaction entry point. Never pass browser-provided DB/context.
export async function requireBarbershopPermissionInTransaction(
  database: Pick<typeof prisma, "$queryRaw">,
  barbershopId: string,
  permission: TenantPermission,
) {
  return requirePermissionWithDatabase(barbershopId, permission, database);
}

export async function requireGlobalPermission(permission: GlobalPermission) {
  const { userId } = await requireAuthenticatedUser();
  if (!(globalPermissions as readonly string[]).includes(permission))
    throw new AuthorizationError("FORBIDDEN");
  const rows = await prisma.$queryRaw<
    { id: string; userId: string; active: boolean }[]
  >`
    SELECT "id", "userId", "active" FROM "GlobalAdmin" WHERE "userId" = ${userId} AND "active" = true`;
  if (!rows[0] || rows[0].userId !== userId || rows[0].active !== true)
    throw new AuthorizationError("FORBIDDEN");
  // Never supplies a tenant context or implicit access to customer data.
  return { userId, globalAdminId: rows[0].id };
}

type EntityKind =
  | "service"
  | "professional"
  | "booking"
  | "workingHours"
  | "block";
type Access = "read" | "write";
type ScopedEntity = {
  id: string;
  barbershopId: string;
  serviceId?: string;
  professionalId?: string | null;
};
const entityPermissions: Record<
  EntityKind,
  Record<Access, TenantPermission>
> = {
  service: { read: "services:read", write: "services:write" },
  professional: { read: "professionals:read", write: "professionals:write" },
  booking: { read: "bookings:read", write: "bookings:manage" },
  workingHours: { read: "schedule:read", write: "schedule:write" },
  block: { read: "schedule:read", write: "schedule:write" },
};

// Every lookup includes the authorized tenant, never just a global entity ID.
async function scopedEntity(
  barbershopId: string,
  kind: EntityKind,
  id: string,
) {
  let rows: ScopedEntity[];
  switch (kind) {
    case "service":
      rows = await prisma.$queryRaw<
        ScopedEntity[]
      >`SELECT "id", "barbershopId" FROM "BarbershopService" WHERE "id" = ${id} AND "barbershopId" = ${barbershopId}`;
      break;
    case "professional":
      rows = await prisma.$queryRaw<
        ScopedEntity[]
      >`SELECT "id", "barbershopId" FROM "Professional" WHERE "id" = ${id} AND "barbershopId" = ${barbershopId}`;
      break;
    case "booking":
      rows = await prisma.$queryRaw<
        ScopedEntity[]
      >`SELECT "id", "barbershopId", "serviceId", "professionalId" FROM "Booking" WHERE "id" = ${id} AND "barbershopId" = ${barbershopId}`;
      break;
    case "workingHours":
      rows = await prisma.$queryRaw<
        ScopedEntity[]
      >`SELECT "id", "barbershopId" FROM "WorkingHours" WHERE "id" = ${id} AND "barbershopId" = ${barbershopId}`;
      break;
    case "block":
      rows = await prisma.$queryRaw<
        ScopedEntity[]
      >`SELECT "id", "barbershopId" FROM "ScheduleBlock" WHERE "id" = ${id} AND "barbershopId" = ${barbershopId}`;
      break;
  }
  const entity = rows[0];
  if (!entity || entity.id !== id || entity.barbershopId !== barbershopId)
    throw new AuthorizationError("NOT_FOUND");
  return entity;
}

export async function requireBarbershopEntity(
  barbershopId: string,
  kind: EntityKind,
  id: string,
  access: Access = "read",
) {
  if (
    !Object.hasOwn(entityPermissions, kind) ||
    (access !== "read" && access !== "write")
  )
    throw new AuthorizationError("FORBIDDEN");
  const context = await requireBarbershopPermission(
    barbershopId,
    entityPermissions[kind][access],
  );
  requireId(id);
  const entity = await scopedEntity(context.barbershopId, kind, id);
  if (kind === "booking") {
    if (!entity.serviceId) throw new AuthorizationError("NOT_FOUND");
    await scopedEntity(context.barbershopId, "service", entity.serviceId);
    if (entity.professionalId)
      await scopedEntity(
        context.barbershopId,
        "professional",
        entity.professionalId,
      );
  }
  return { context, entity };
}

export async function requireBookingRelations(
  barbershopId: string,
  serviceId: string,
  professionalId: string,
) {
  const context = await requireBarbershopPermission(
    barbershopId,
    "bookings:manage",
  );
  requireId(serviceId);
  requireId(professionalId);
  await scopedEntity(context.barbershopId, "service", serviceId);
  await scopedEntity(context.barbershopId, "professional", professionalId);
  const rows = await prisma.$queryRaw<
    { serviceId: string; professionalId: string; barbershopId: string }[]
  >`
    SELECT ps."serviceId", ps."professionalId", ps."barbershopId" FROM "ProfessionalService" ps
    JOIN "Professional" p ON p."id" = ps."professionalId" AND p."barbershopId" = ps."barbershopId"
    WHERE ps."barbershopId" = ${context.barbershopId} AND ps."serviceId" = ${serviceId}
      AND ps."professionalId" = ${professionalId} AND p."active" = true`;
  if (
    !rows[0] ||
    rows[0].barbershopId !== context.barbershopId ||
    rows[0].serviceId !== serviceId ||
    rows[0].professionalId !== professionalId
  )
    throw new AuthorizationError("NOT_FOUND");
  return context;
}

export async function requireBarbershopCustomer(
  barbershopId: string,
  customerUserId: string,
) {
  const context = await requireBarbershopPermission(
    barbershopId,
    "clients:read",
  );
  if (
    typeof customerUserId !== "string" ||
    !customerUserId ||
    customerUserId.length > 256
  )
    throw new AuthorizationError("INVALID_INPUT");
  // User identity is global; current customer relationship is only an own-shop
  // booking. Do not return the user's history or profile from other tenants.
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "Booking" WHERE "barbershopId" = ${context.barbershopId} AND "userId" = ${customerUserId} LIMIT 1`;
  if (rows[0]?.userId !== customerUserId)
    throw new AuthorizationError("NOT_FOUND");
  return { context, customerUserId };
}
