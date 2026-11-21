export type BookingState = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
export type Interval = { startsAt: Date; endsAt: Date };
export type ScheduleScope = { barbershopId: string; professionalId: string };
export type AvailabilityRequest = ScheduleScope & {
  serviceId: string;
  localDate: string;
};
export type WorkingWindow = {
  barbershopId: string;
  professionalId: string | null;
  weekday: number;
  startMinute: number;
  endMinute: number;
};
export type BusyBooking = {
  barbershopId: string;
  professionalId: string | null;
  date: Date;
  endsAt: Date | null;
  status: BookingState | null;
  cancelled: boolean | null;
};
export type AvailabilitySnapshot = {
  barbershopId: string;
  timeZone: string | null;
  service: {
    id: string;
    barbershopId: string;
    durationMinutes: number | null;
    priceInCents: number;
  };
  professional: { id: string; barbershopId: string; active: boolean };
  assignment: ScheduleScope & { serviceId: string };
  workingHours: WorkingWindow[];
  blocks: (Interval & {
    barbershopId: string;
    professionalId: string | null;
  })[];
  bookings: BusyBooking[];
};
export type BookingRequest = AvailabilityRequest & { localTime: string };
export type BookingCandidate = ScheduleScope &
  Interval & {
    serviceId: string;
    priceInCentsSnapshot: number;
    durationMinutesSnapshot: number;
    timeZoneSnapshot: string;
  };
export type PrivateBooking = BusyBooking & {
  id: string;
  userId: string;
  serviceId: string;
};

// Trusted server adapter only. No implementation/database queries in this stage.
export interface BookingReader {
  loadAvailability(request: AvailabilityRequest): Promise<AvailabilitySnapshot>;
  findCustomerBooking(scope: {
    barbershopId: string;
    bookingId: string;
    userId: string;
  }): Promise<PrivateBooking | null>;
  findStaffBooking(scope: {
    barbershopId: string;
    bookingId: string;
  }): Promise<PrivateBooking | null>;
}
// Future mutations must lock, reload and revalidate inside the SAME transaction.
// Availability results/candidates are not reservations or concurrency guarantees.
export interface TransactionalBookingReader extends BookingReader {
  lockSchedule(scope: ScheduleScope): Promise<void>;
}
