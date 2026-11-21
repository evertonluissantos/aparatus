import type { PrismaClient } from "../../generated/prisma/client";
import type { BookingDatabase } from "../../lib/bookings/postgres";

// Compile-only structural check, no client construction, import side effects or DB.
export function prismaBookingDatabase(client: PrismaClient): BookingDatabase {
  return client;
}
