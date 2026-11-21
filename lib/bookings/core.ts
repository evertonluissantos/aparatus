import "server-only";
import {
  requireAuthenticatedUser,
  requireBarbershopPermission,
} from "@/lib/authorization";
import { calculateAvailability, validateBookingRequest } from "./availability";
import { BookingRuleError } from "./rules";
import type {
  AvailabilityRequest,
  BookingReader,
  BookingRequest,
  PrivateBooking,
} from "./types";

// Reader and clock are trusted server dependencies, NEVER request payload fields.
// No database adapter, write, lock or legacy route is activated here.
export function createBookingCore(
  reader: BookingReader,
  clock: () => Date = () => new Date(),
) {
  function scopeOf(request: AvailabilityRequest): AvailabilityRequest {
    return {
      barbershopId: request.barbershopId,
      professionalId: request.professionalId,
      serviceId: request.serviceId,
      localDate: request.localDate,
    };
  }
  function bookingView(
    booking: PrivateBooking | null,
    barbershopId: string,
    bookingId: string,
    userId?: string,
  ) {
    if (
      !booking ||
      booking.id !== bookingId ||
      booking.barbershopId !== barbershopId ||
      (userId !== undefined && booking.userId !== userId)
    )
      throw new BookingRuleError("BOOKING_NOT_FOUND");
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      professionalId: booking.professionalId,
      startsAt: booking.date.toISOString(),
      endsAt: booking.endsAt?.toISOString() ?? null,
      status: booking.status,
      cancelled: booking.cancelled,
    };
  }
  return {
    async getPublicAvailability(request: AvailabilityRequest) {
      const scope = scopeOf(request);
      const snapshot = await reader.loadAvailability(scope);
      // Public output contains only candidate instants, not occupancy/private rows.
      return calculateAvailability(scope, snapshot, clock()).map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      }));
    },
    async validateCustomerRequest(request: BookingRequest) {
      const { userId } = await requireAuthenticatedUser();
      const scope = scopeOf(request);
      const snapshot = await reader.loadAvailability(scope);
      return {
        actor: { kind: "customer" as const, userId },
        candidate: validateBookingRequest(
          { ...scope, localTime: request.localTime },
          snapshot,
          clock(),
        ),
      };
    },
    async validateStaffRequest(request: BookingRequest) {
      const { userId } = await requireBarbershopPermission(
        request.barbershopId,
        "bookings:manage",
      );
      const scope = scopeOf(request);
      const snapshot = await reader.loadAvailability(scope);
      return {
        actor: { kind: "staff" as const, userId },
        candidate: validateBookingRequest(
          { ...scope, localTime: request.localTime },
          snapshot,
          clock(),
        ),
      };
    },
    async getCustomerBooking(barbershopId: string, bookingId: string) {
      const { userId } = await requireAuthenticatedUser();
      return bookingView(
        await reader.findCustomerBooking({ barbershopId, bookingId, userId }),
        barbershopId,
        bookingId,
        userId,
      );
    },
    async getStaffBooking(barbershopId: string, bookingId: string) {
      await requireBarbershopPermission(barbershopId, "bookings:read");
      return bookingView(
        await reader.findStaffBooking({ barbershopId, bookingId }),
        barbershopId,
        bookingId,
      );
    },
  };
}
