import { BookingRuleError, instant } from "./rules";

type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
function utc(civil: Civil): number {
  const date = new Date(0);
  date.setUTCFullYear(civil.year, civil.month - 1, civil.day);
  date.setUTCHours(civil.hour, civil.minute, civil.second, 0);
  return date.getTime();
}
export function parseLocalDate(value: string): Civil {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BookingRuleError("INVALID_LOCAL_DATE");
  const [year, month, day] = value.split("-").map(Number);
  const civil = { year, month, day, hour: 0, minute: 0, second: 0 };
  const check = new Date(utc(civil));
  if (
    year < 1900 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new BookingRuleError("INVALID_LOCAL_DATE");
  }
  return civil;
}
export function requireTimeZone(
  timeZone: string | null,
): asserts timeZone is string {
  if (
    typeof timeZone !== "string" ||
    !timeZone ||
    timeZone.trim() !== timeZone ||
    /^[+-]/.test(timeZone)
  )
    throw new BookingRuleError("INVALID_TIME_ZONE");
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(0);
  } catch {
    throw new BookingRuleError("INVALID_TIME_ZONE");
  }
}
function formatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function parts(format: Intl.DateTimeFormat, at: number): Civil {
  const values = Object.fromEntries(
    format.formatToParts(at).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}
export function localDateAt(at: Date, timeZone: string): string {
  requireTimeZone(timeZone);
  const civil = parts(formatter(timeZone), instant(at));
  return `${civil.year.toString().padStart(4, "0")}-${civil.month.toString().padStart(2, "0")}-${civil.day.toString().padStart(2, "0")}`;
}

// Intl supplies offsets from the runtime's IANA/ICU database. Enumerate offsets
// around this day and round-trip candidates; never normalize a gap or pick a fold.
export function localDayResolver(localDate: string, timeZone: string) {
  requireTimeZone(timeZone);
  const civil = parseLocalDate(localDate);
  const base = utc(civil);
  const format = formatter(timeZone);
  const utcFormat = formatter("UTC");
  const offsets = new Set<number>();
  for (let hour = -48; hour <= 48; hour++) {
    const sample = base + hour * 3_600_000;
    offsets.add(utc(parts(format, sample)) - sample);
  }
  return {
    weekday: new Date(base).getUTCDay(),
    atMinute(minute: number): Date {
      if (!Number.isInteger(minute) || minute < 0 || minute > 1440)
        throw new BookingRuleError("INVALID_LOCAL_TIME");
      const target = parts(utcFormat, base + minute * 60_000);
      const naive = utc(target);
      const candidates = [...offsets]
        .map((offset) => naive - offset)
        .filter((candidate) => utc(parts(format, candidate)) === naive);
      if (candidates.length === 0)
        throw new BookingRuleError("NONEXISTENT_LOCAL_TIME");
      if (candidates.length !== 1)
        throw new BookingRuleError("AMBIGUOUS_LOCAL_TIME");
      return new Date(candidates[0]);
    },
  };
}
export function localTimeToInstant(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  if (
    typeof localTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)
  )
    throw new BookingRuleError("INVALID_LOCAL_TIME");
  const [hour, minute] = localTime.split(":").map(Number);
  return localDayResolver(localDate, timeZone).atMinute(hour * 60 + minute);
}
