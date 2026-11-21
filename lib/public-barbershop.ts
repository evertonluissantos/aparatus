import type { Prisma } from "@/generated/prisma/client";

// Shared by public Prisma readers; legacy mode retains its existing behavior.
export function publicBarbershopWhere(enabled: boolean) {
  return enabled
    ? {
        published: true,
        memberships: {
          some: { role: "OWNER" as const, active: true },
        },
      } satisfies Prisma.BarbershopWhereInput
    : {};
}
