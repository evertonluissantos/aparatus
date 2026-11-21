import type { BusyBooking, Interval } from "./types";

export class BookingRuleError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BookingRuleError";
  }
}
export function instant(value: Date): number {
  const result = value instanceof Date ? value.getTime() : NaN;
  if (!Number.isFinite(result)) throw new BookingRuleError("INVALID_INSTANT");
  return result;
}
export function requireDuration(
  minutes: number | null,
): asserts minutes is number {
  if (!Number.isSafeInteger(minutes) || minutes === null || minutes <= 0)
    throw new BookingRuleError("INVALID_DURATION");
}
export function intervalFor(
  startsAt: Date,
  durationMinutes: number | null,
): Interval {
  requireDuration(durationMinutes);
  const endsAt = new Date(instant(startsAt) + durationMinutes * 60_000);
  instant(endsAt);
  return { startsAt: new Date(startsAt), endsAt };
}
export function requireInterval(interval: Interval) {
  if (instant(interval.endsAt) <= instant(interval.startsAt))
    throw new BookingRuleError("INVALID_INTERVAL");
}
export function overlaps(a: Interval, b: Interval): boolean {
  requireInterval(a);
  requireInterval(b);
  return (
    instant(a.startsAt) < instant(b.endsAt) &&
    instant(b.startsAt) < instant(a.endsAt)
  );
}
export function contains(window: Interval, appointment: Interval): boolean {
  requireInterval(window);
  requireInterval(appointment);
  return (
    instant(window.startsAt) <= instant(appointment.startsAt) &&
    instant(appointment.endsAt) <= instant(window.endsAt)
  );
}
export function requireFuture(startsAt: Date, now: Date) {
  if (instant(startsAt) <= instant(now))
    throw new BookingRuleError("PAST_START");
}
export function occupiesSchedule(booking: BusyBooking): boolean {
  if (booking.status === "CANCELLED") return false;
  if (booking.status === null) return booking.cancelled !== true;
  if (
    !["CONFIRMED", "COMPLETED", "NO_SHOW"].includes(booking.status) ||
    booking.cancelled === true
  ) {
    throw new BookingRuleError("INCONSISTENT_BOOKING_STATUS");
  }
  return true;
}
