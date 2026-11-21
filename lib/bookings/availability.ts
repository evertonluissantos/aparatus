import type {
  AvailabilityRequest,
  AvailabilitySnapshot,
  BookingCandidate,
  BookingRequest,
  Interval,
  WorkingWindow,
} from "./types";
import {
  BookingRuleError,
  contains,
  instant,
  intervalFor,
  occupiesSchedule,
  overlaps,
  requireDuration,
  requireFuture,
  requireInterval,
} from "./rules";
import {
  localDayResolver,
  localTimeToInstant,
  requireTimeZone,
} from "./timezone";

type MinuteWindow = { start: number; end: number };
function merge(windows: MinuteWindow[]): MinuteWindow[] {
  const result: MinuteWindow[] = [];
  for (const window of windows.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && window.start <= last.end)
      last.end = Math.max(last.end, window.end);
    else result.push({ ...window });
  }
  return result;
}
function localWindows(
  rows: WorkingWindow[],
  weekday: number,
  professionalId: string | null,
) {
  return merge(
    rows
      .filter(
        (row) =>
          row.weekday === weekday && row.professionalId === professionalId,
      )
      .map((row) => ({ start: row.startMinute, end: row.endMinute })),
  );
}
function prepare(request: AvailabilityRequest, snapshot: AvailabilitySnapshot) {
  const shop = request.barbershopId;
  if (
    !shop ||
    !request.serviceId ||
    !request.professionalId ||
    snapshot.barbershopId !== shop ||
    snapshot.service.barbershopId !== shop ||
    snapshot.professional.barbershopId !== shop ||
    snapshot.service.id !== request.serviceId ||
    snapshot.professional.id !== request.professionalId ||
    snapshot.assignment.barbershopId !== shop ||
    snapshot.assignment.serviceId !== request.serviceId ||
    snapshot.assignment.professionalId !== request.professionalId ||
    snapshot.workingHours.some((row) => row.barbershopId !== shop) ||
    snapshot.blocks.some((row) => row.barbershopId !== shop) ||
    snapshot.bookings.some((row) => row.barbershopId !== shop)
  ) {
    throw new BookingRuleError("TENANT_MISMATCH");
  }
  if (snapshot.professional.active !== true)
    throw new BookingRuleError("INACTIVE_PROFESSIONAL");
  requireDuration(snapshot.service.durationMinutes);
  if (
    !Number.isSafeInteger(snapshot.service.priceInCents) ||
    snapshot.service.priceInCents < 0
  )
    throw new BookingRuleError("INVALID_PRICE");
  requireTimeZone(snapshot.timeZone);
  for (const row of [
    ...snapshot.workingHours,
    ...snapshot.blocks,
    ...snapshot.bookings,
  ]) {
    if (
      row.professionalId !== null &&
      (typeof row.professionalId !== "string" || !row.professionalId)
    )
      throw new BookingRuleError("INVALID_SCHEDULE_SCOPE");
  }
  for (const row of snapshot.workingHours) {
    if (
      !Number.isInteger(row.weekday) ||
      row.weekday < 0 ||
      row.weekday > 6 ||
      !Number.isInteger(row.startMinute) ||
      !Number.isInteger(row.endMinute) ||
      row.startMinute < 0 ||
      row.startMinute >= row.endMinute ||
      row.endMinute > 1440
    )
      throw new BookingRuleError("INVALID_WORKING_HOURS");
  }
  const day = localDayResolver(request.localDate, snapshot.timeZone);
  const shopWindows = localWindows(snapshot.workingHours, day.weekday, null);
  const professionalWindows = localWindows(
    snapshot.workingHours,
    day.weekday,
    request.professionalId,
  );
  const windows = merge(
    shopWindows.flatMap((a) =>
      professionalWindows
        .map((b) => ({
          start: Math.max(a.start, b.start),
          end: Math.min(a.end, b.end),
        }))
        .filter((window) => window.start < window.end),
    ),
  );
  const open: Interval[] = windows.map((window) => ({
    startsAt: day.atMinute(window.start),
    endsAt: day.atMinute(window.end),
  }));
  open.forEach(requireInterval);
  const dayEnd = instant(day.atMinute(1440));
  const occupied: Interval[] = snapshot.blocks
    .filter(
      (block) =>
        block.professionalId === null ||
        block.professionalId === request.professionalId,
    )
    .map((block) => {
      requireInterval(block);
      return block;
    });
  for (const booking of snapshot.bookings) {
    if (
      booking.professionalId !== null &&
      booking.professionalId !== request.professionalId
    )
      continue;
    if (!occupiesSchedule(booking)) continue;
    const start = instant(booking.date);
    if (!booking.endsAt) {
      if (start < dayEnd)
        throw new BookingRuleError("LEGACY_DATA_REQUIRES_REVIEW");
      continue;
    }
    const interval = { startsAt: booking.date, endsAt: booking.endsAt };
    requireInterval(interval);
    occupied.push(interval);
  }
  return {
    day,
    windows: open,
    occupied,
    timeZone: snapshot.timeZone,
    duration: snapshot.service.durationMinutes,
  };
}
function allowed(interval: Interval, prepared: ReturnType<typeof prepare>) {
  return (
    prepared.windows.some((window) => contains(window, interval)) &&
    !prepared.occupied.some((busy) => overlaps(busy, interval))
  );
}

export function validateBookingRequest(
  request: BookingRequest,
  snapshot: AvailabilitySnapshot,
  now: Date,
): BookingCandidate {
  const prepared = prepare(request, snapshot);
  const startsAt = localTimeToInstant(
    request.localDate,
    request.localTime,
    prepared.timeZone,
  );
  requireFuture(startsAt, now);
  const interval = intervalFor(startsAt, prepared.duration);
  if (!allowed(interval, prepared))
    throw new BookingRuleError("UNAVAILABLE_SLOT");
  return {
    barbershopId: request.barbershopId,
    professionalId: request.professionalId,
    serviceId: request.serviceId,
    ...interval,
    priceInCentsSnapshot: snapshot.service.priceInCents,
    durationMinutesSnapshot: prepared.duration,
    timeZoneSnapshot: prepared.timeZone,
  };
}

export function calculateAvailability(
  request: AvailabilityRequest,
  snapshot: AvailabilitySnapshot,
  now: Date,
  stepMinutes = 30,
): Interval[] {
  instant(now);
  if (
    !Number.isSafeInteger(stepMinutes) ||
    stepMinutes <= 0 ||
    stepMinutes > 1440
  )
    throw new BookingRuleError("INVALID_SLOT_STEP");
  const prepared = prepare(request, snapshot);
  const slots: Interval[] = [];
  for (let minute = 0; minute < 1440; minute += stepMinutes) {
    let startsAt: Date;
    try {
      startsAt = prepared.day.atMinute(minute);
    } catch (error) {
      if (
        error instanceof BookingRuleError &&
        ["AMBIGUOUS_LOCAL_TIME", "NONEXISTENT_LOCAL_TIME"].includes(error.code)
      )
        continue;
      throw error;
    }
    if (instant(startsAt) <= instant(now)) continue;
    const interval = intervalFor(startsAt, prepared.duration);
    if (allowed(interval, prepared)) slots.push(interval);
  }
  return slots;
}
