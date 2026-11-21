import {
  contains,
  overlaps,
  requireInterval,
} from "../../../../lib/bookings/rules";
import { calculateAvailability } from "../../../../lib/bookings/availability";
import {
  localTimeToInstant,
  parseLocalDate,
} from "../../../../lib/bookings/timezone";
import type {
  Interval,
  WorkingWindow,
  AvailabilitySnapshot,
} from "../../../../lib/bookings/types";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { eligibleDemoProfessionals } from "../../profissionais/_lib/professional";

export const DEMO_TIME_ZONE = "America/Sao_Paulo";
export const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export type TimeRange = { start: string; end: string };
export type DaySchedule = {
  weekday: number;
  windows: TimeRange[];
  breaks: TimeRange[];
};
export type DemoBlock = {
  id: string;
  barbershopId: string;
  professionalId: string | null;
  startsAt: string;
  endsAt: string;
  kind: "BREAK" | "ABSENCE" | "EXTRAORDINARY";
  reason: string;
};
export type DemoSchedule = {
  shopWeek: DaySchedule[];
  professionalWeeks: Record<string, DaySchedule[]>;
  blocks: DemoBlock[];
};
export type BlockInput = {
  professionalId: string | null;
  start: string;
  end: string;
  allDay: boolean;
  kind: DemoBlock["kind"];
  reason: string;
};

export class ScheduleError extends Error {}
const reject = (message: string): never => {
  throw new ScheduleError(message);
};
export const emptyWeek = (): DaySchedule[] =>
  weekdays.map((_, weekday) => ({ weekday, windows: [], breaks: [] }));
export const emptySchedule = (): DemoSchedule => ({
  shopWeek: emptyWeek(),
  professionalWeeks: {},
  blocks: [],
});
export const cloneWeek = (week: DaySchedule[]) =>
  week.map((day) => ({
    ...day,
    windows: day.windows.map((range) => ({ ...range })),
    breaks: day.breaks.map((range) => ({ ...range })),
  }));
export function timeMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return reject("Informe horários válidos entre 00:00 e 23:59.");
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export const minuteLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
function civilRange(range: TimeRange): Interval {
  const start = timeMinutes(range.start),
    end = timeMinutes(range.end);
  if (start >= end)
    return reject(
      "O início deve ser anterior ao fim; divida turnos que atravessam a meia-noite em dias distintos.",
    );
  return {
    startsAt: new Date(Date.UTC(2026, 0, 4) + start * 60_000),
    endsAt: new Date(Date.UTC(2026, 0, 4) + end * 60_000),
  };
}
function disjoint(ranges: TimeRange[], label: string) {
  const intervals = ranges.map(civilRange);
  if (
    intervals.some((range, i) =>
      intervals.slice(i + 1).some((other) => overlaps(range, other)),
    )
  )
    reject(`${label}: existem intervalos sobrepostos.`);
}

export function validateWeek(
  week: DaySchedule[],
  establishment?: DaySchedule[],
) {
  if (
    week.length !== 7 ||
    new Set(week.map((day) => day.weekday)).size !== 7 ||
    week.some(
      (day) =>
        !Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6,
    )
  )
    reject("Configure os sete dias da semana, sem repetições.");
  for (const day of week) {
    const label = weekdays[day.weekday];
    try {
      disjoint(day.windows, "Expediente");
      disjoint(day.breaks, "Pausas");
      for (const pause of day.breaks)
        if (
          !day.windows.some((window) =>
            contains(civilRange(window), civilRange(pause)),
          )
        )
          reject("Cada pausa deve estar dentro de um período aberto.");
      if (establishment)
        for (const window of day.windows)
          if (
            !establishment
              .find((item) => item.weekday === day.weekday)
              ?.windows.some((open) =>
                contains(civilRange(open), civilRange(window)),
              )
          )
            reject(
              "O expediente deve estar dentro do funcionamento da barbearia.",
            );
    } catch (error) {
      reject(
        `${label}: ${error instanceof ScheduleError ? error.message : "configuração de intervalo inválida."}`,
      );
    }
  }
}

export function effectiveWindows(day: DaySchedule) {
  let windows = day.windows.map((range) => ({
    start: timeMinutes(range.start),
    end: timeMinutes(range.end),
  }));
  for (const pause of day.breaks) {
    const start = timeMinutes(pause.start),
      end = timeMinutes(pause.end);
    windows = windows.flatMap((window) =>
      end <= window.start || start >= window.end
        ? [window]
        : [
            ...(start > window.start
              ? [{ start: window.start, end: start }]
              : []),
            ...(end < window.end ? [{ start: end, end: window.end }] : []),
          ],
    );
  }
  return windows.sort((a, b) => a.start - b.start);
}

function targetShop(shops: DemoBarbershop[], id: string) {
  return (
    shops.find((shop) => shop.id === id) ??
    reject("Barbearia demonstrativa não encontrada.")
  );
}
function requireScope(shop: DemoBarbershop, id: string | null) {
  if (
    id !== null &&
    !shop.professionals.some(
      (professional) =>
        professional.id === id && professional.barbershopId === shop.id,
    )
  )
    reject("O profissional não pertence à barbearia selecionada.");
}
export function saveDemoWeek(
  shops: DemoBarbershop[],
  shopId: string,
  professionalId: string | null,
  week: DaySchedule[],
) {
  const shop = targetShop(shops, shopId);
  requireScope(shop, professionalId);
  validateWeek(
    week,
    professionalId === null ? undefined : shop.schedule.shopWeek,
  );
  if (professionalId === null)
    for (const [id, professionalWeek] of Object.entries(
      shop.schedule.professionalWeeks,
    )) {
      try {
        validateWeek(professionalWeek, week);
      } catch (error) {
        reject(
          `Ajuste primeiro o expediente de ${shop.professionals.find((professional) => professional.id === id)?.name ?? "um profissional"}. ${error instanceof ScheduleError ? error.message : "Expediente incompatível."}`,
        );
      }
    }
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          schedule:
            professionalId === null
              ? { ...item.schedule, shopWeek: cloneWeek(week) }
              : {
                  ...item.schedule,
                  professionalWeeks: {
                    ...item.schedule.professionalWeeks,
                    [professionalId]: cloneWeek(week),
                  },
                },
        },
  );
}

function nextDate(value: string) {
  const civil = parseLocalDate(value);
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day + 1))
    .toISOString()
    .slice(0, 10);
}
function localDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    reject("Informe datas e horários completos.");
  return localTimeToInstant(
    value.slice(0, 10),
    value.slice(11),
    DEMO_TIME_ZONE,
  );
}
export function createDemoBlock(
  shop: DemoBarbershop,
  id: string,
  input: BlockInput,
): DemoBlock {
  requireScope(shop, input.professionalId);
  if (
    !["BREAK", "ABSENCE", "EXTRAORDINARY"].includes(input.kind) ||
    input.reason.trim().length < 3 ||
    input.reason.trim().length > 160
  )
    reject("Informe o tipo e um motivo entre 3 e 160 caracteres.");
  let startsAt: Date, endsAt: Date;
  try {
    startsAt = input.allDay
      ? localTimeToInstant(input.start, "00:00", DEMO_TIME_ZONE)
      : localDateTime(input.start);
    endsAt = input.allDay
      ? localTimeToInstant(nextDate(input.end), "00:00", DEMO_TIME_ZONE)
      : localDateTime(input.end);
    if (input.allDay && input.end < input.start)
      reject("A data final deve ser igual ou posterior à inicial.");
    requireInterval({ startsAt, endsAt });
  } catch {
    return reject(
      "Período inválido. Confira as datas e informe um início anterior ao fim no fuso de São Paulo.",
    );
  }
  const interval = { startsAt, endsAt };
  if (
    shop.schedule.blocks.some(
      (block) =>
        block.professionalId === input.professionalId &&
        overlaps(interval, {
          startsAt: new Date(block.startsAt),
          endsAt: new Date(block.endsAt),
        }),
    )
  )
    reject("Já existe um bloqueio sobreposto para este mesmo escopo.");
  return {
    id,
    barbershopId: shop.id,
    professionalId: input.professionalId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    kind: input.kind,
    reason: input.reason.trim(),
  };
}
export function addDemoBlock(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
  input: BlockInput,
) {
  const shop = targetShop(shops, shopId);
  if (
    shops.some((item) => item.schedule.blocks.some((block) => block.id === id))
  )
    reject("Identificador de bloqueio já utilizado.");
  const block = createDemoBlock(shop, id, input);
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          schedule: {
            ...item.schedule,
            blocks: [...item.schedule.blocks, block],
          },
        },
  );
}
export function removeDemoBlock(
  shops: DemoBarbershop[],
  shopId: string,
  id: string,
) {
  const shop = targetShop(shops, shopId);
  if (
    !shop.schedule.blocks.some(
      (block) => block.id === id && block.barbershopId === shopId,
    )
  )
    reject("Bloqueio não encontrado nesta barbearia.");
  return shops.map((item) =>
    item.id !== shopId
      ? item
      : {
          ...item,
          schedule: {
            ...item.schedule,
            blocks: item.schedule.blocks.filter((block) => block.id !== id),
          },
        },
  );
}

export function demoWorkingHours(shop: DemoBarbershop): WorkingWindow[] {
  const rows = (week: DaySchedule[], professionalId: string | null) =>
    week.flatMap((day) =>
      effectiveWindows(day).map((range) => ({
        barbershopId: shop.id,
        professionalId,
        weekday: day.weekday,
        startMinute: range.start,
        endMinute: range.end,
      })),
    );
  return [
    ...rows(shop.schedule.shopWeek, null),
    ...Object.entries(shop.schedule.professionalWeeks).flatMap(([id, week]) =>
      rows(week, id),
    ),
  ];
}
export function demoAvailabilitySnapshot(
  shop: DemoBarbershop,
  professionalId: string,
  serviceId: string,
): AvailabilitySnapshot | null {
  const professional = eligibleDemoProfessionals(shop, serviceId).find(
    (item) => item.id === professionalId,
  );
  const service = shop.services.find(
    (item) =>
      item.id === serviceId && item.barbershopId === shop.id && item.active,
  );
  if (!professional || !service) return null;
  return {
    barbershopId: shop.id,
    timeZone: DEMO_TIME_ZONE,
    service,
    professional,
    assignment: { barbershopId: shop.id, professionalId, serviceId },
    workingHours: demoWorkingHours(shop),
    bookings: shop.appointments.map((appointment) => ({
      barbershopId: appointment.barbershopId,
      professionalId: appointment.professionalId,
      date: new Date(appointment.startsAt),
      endsAt: new Date(appointment.endsAt),
      status: appointment.status,
      cancelled: appointment.status === "CANCELLED",
    })),
    blocks: shop.schedule.blocks.map((block) => ({
      ...block,
      startsAt: new Date(block.startsAt),
      endsAt: new Date(block.endsAt),
    })),
  };
}
export function previewDemoAvailability(
  shop: DemoBarbershop,
  professionalId: string,
  serviceId: string,
  localDate: string,
  now: Date,
) {
  const snapshot = demoAvailabilitySnapshot(shop, professionalId, serviceId);
  return snapshot
    ? calculateAvailability(
        { barbershopId: shop.id, professionalId, serviceId, localDate },
        snapshot,
        now,
      )
    : [];
}
