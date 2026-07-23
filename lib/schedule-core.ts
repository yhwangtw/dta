import type { ScheduleTiming } from "./schedule-types";

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface CronField {
  values: number[];
  allowed: Set<number>;
  wildcard: boolean;
}

export interface ParsedCronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

const CRON_ALIASES: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const WEEKDAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 100) return false;
  try {
    formatterFor(timeZone).format(0);
    return true;
  } catch {
    formatterCache.delete(timeZone);
    return false;
  }
}

function partsAt(epochMs: number, timeZone: string): LocalDateTimeParts {
  const values: Partial<LocalDateTimeParts> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(epochMs))) {
    if (part.type === "year" || part.type === "month" || part.type === "day"
      || part.type === "hour" || part.type === "minute") {
      values[part.type] = Number(part.value);
    }
  }
  return values as LocalDateTimeParts;
}

function sameParts(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
    && a.hour === b.hour && a.minute === b.minute;
}

/**
 * Resolve a wall-clock minute in an IANA timezone to every possible UTC
 * instant. Usually there is one; a DST fall-back minute can have two, while a
 * spring-forward gap has none.
 */
export function zonedDateTimeToInstants(
  local: LocalDateTimeParts,
  timeZone: string,
): Date[] {
  const wallClockAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const offsets = new Set<number>();
  for (const probeDelta of [-36, -12, 0, 12, 36]) {
    const probe = wallClockAsUtc + probeDelta * 60 * 60 * 1000;
    const seen = partsAt(probe, timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    offsets.add(seenAsUtc - probe);
  }

  const instants = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallClockAsUtc - offset;
    if (sameParts(partsAt(candidate, timeZone), local)) instants.add(candidate);
  }
  return [...instants].sort((a, b) => a - b).map((value) => new Date(value));
}

function parseValue(raw: string, names: Record<string, number> | undefined): number {
  const upper = raw.toUpperCase();
  if (names && upper in names) return names[upper];
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid cron value: ${raw}`);
  return Number(raw);
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
  names?: Record<string, number>,
  normalize?: (value: number) => number,
): CronField {
  if (!raw || raw.length > 120) throw new Error("Invalid cron field");
  // Cron's DOM/DOW OR rule treats only a literal "*" as unrestricted.
  // Step expressions such as "*/2" still restrict the field and therefore
  // must participate in OR matching when the other day field is restricted.
  const wildcard = raw === "*";
  const values = new Set<number>();

  const add = (value: number) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Cron value ${value} is outside ${min}-${max}`);
    }
    values.add(normalize ? normalize(value) : value);
  };

  for (const segment of raw.split(",")) {
    if (!segment) throw new Error("Invalid empty cron list item");
    const pieces = segment.split("/");
    if (pieces.length > 2) throw new Error(`Invalid cron step: ${segment}`);
    const base = pieces[0];
    const step = pieces[1] === undefined ? 1 : Number(pieces[1]);
    if (!Number.isInteger(step) || step <= 0 || step > max - min + 1) {
      throw new Error(`Invalid cron step: ${segment}`);
    }

    let start: number;
    let end: number;
    if (base === "*") {
      start = min;
      end = max;
    } else if (base.includes("-")) {
      const bounds = base.split("-");
      if (bounds.length !== 2) throw new Error(`Invalid cron range: ${segment}`);
      start = parseValue(bounds[0], names);
      end = parseValue(bounds[1], names);
      if (start > end) throw new Error(`Cron range must be ascending: ${segment}`);
    } else {
      start = parseValue(base, names);
      end = pieces[1] === undefined ? start : max;
    }
    if (start < min || start > max || end < min || end > max) {
      throw new Error(`Cron value is outside ${min}-${max}: ${segment}`);
    }
    for (let value = start; value <= end; value += step) add(value);
  }

  if (values.size === 0) throw new Error("Cron field has no values");
  return { values: [...values].sort((a, b) => a - b), allowed: values, wildcard };
}

export function parseCronExpression(expression: string): ParsedCronExpression {
  const normalized = CRON_ALIASES[expression.trim().toLowerCase()] ?? expression.trim();
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("Cron must contain 5 fields: minute hour day month weekday");
  }
  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dayOfMonth: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12, MONTH_NAMES),
    dayOfWeek: parseCronField(fields[4], 0, 7, WEEKDAY_NAMES, (value) => value === 7 ? 0 : value),
  };
}

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function timeParts(value: string): { hour: number; minute: number } {
  if (!isValidTime(value)) throw new Error("Time must use HH:mm");
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function dayMatches(parsed: ParsedCronExpression, year: number, month: number, day: number): boolean {
  if (!parsed.month.allowed.has(month)) return false;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const domMatches = parsed.dayOfMonth.allowed.has(day);
  const dowMatches = parsed.dayOfWeek.allowed.has(dayOfWeek);
  if (!parsed.dayOfMonth.wildcard && !parsed.dayOfWeek.wildcard) return domMatches || dowMatches;
  return domMatches && dowMatches;
}

function nextCronRun(
  parsed: ParsedCronExpression,
  timeZone: string,
  after: Date,
  allowRepeatedWallTime = true,
): Date | null {
  const localAfter = partsAt(after.getTime(), timeZone);
  const cursor = new Date(Date.UTC(localAfter.year, localAfter.month - 1, localAfter.day));
  // Eight years covers leap-day schedules while bounding malformed or
  // impossible combinations such as February 31.
  const maxDays = 366 * 8;
  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    if (dayMatches(parsed, year, month, day)) {
      for (const hour of parsed.hour.values) {
        for (const minute of parsed.minute.values) {
          const resolved = zonedDateTimeToInstants({ year, month, day, hour, minute }, timeZone);
          // Human-friendly daily and weekly schedules mean once per local
          // calendar occurrence. Five-field cron retains its conventional
          // instant-matching behavior and may run twice during a DST fallback.
          const instants = allowRepeatedWallTime ? resolved : resolved.slice(0, 1);
          const next = instants.find((instant) => instant.getTime() > after.getTime());
          if (next) return next;
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

function onceRun(timing: Extract<ScheduleTiming, { kind: "once" }>, timeZone: string, after: Date): Date | null {
  if (!isValidDate(timing.date)) throw new Error("Date must use YYYY-MM-DD");
  const { hour, minute } = timeParts(timing.time);
  const [year, month, day] = timing.date.split("-").map(Number);
  const instants = zonedDateTimeToInstants({ year, month, day, hour, minute }, timeZone);
  return instants.find((instant) => instant.getTime() > after.getTime()) ?? null;
}

export function validateScheduleTiming(timing: ScheduleTiming, timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid IANA timezone");
  if (timing.kind === "once") {
    if (!isValidDate(timing.date)) throw new Error("Date must use YYYY-MM-DD");
    timeParts(timing.time);
    const [year, month, day] = timing.date.split("-").map(Number);
    const { hour, minute } = timeParts(timing.time);
    if (zonedDateTimeToInstants({ year, month, day, hour, minute }, timeZone).length === 0) {
      throw new Error("That local time does not exist in the selected timezone");
    }
    return;
  }
  if (timing.kind === "daily") {
    timeParts(timing.time);
    return;
  }
  if (timing.kind === "weekly") {
    timeParts(timing.time);
    if (!Array.isArray(timing.weekdays) || timing.weekdays.length === 0
      || timing.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("Select at least one weekday");
    }
    return;
  }
  parseCronExpression(timing.expression);
}

export function nextScheduleRunAt(
  timing: ScheduleTiming,
  timeZone: string,
  after: Date,
): string | null {
  validateScheduleTiming(timing, timeZone);
  let result: Date | null;
  if (timing.kind === "once") {
    result = onceRun(timing, timeZone, after);
  } else if (timing.kind === "daily") {
    const { hour, minute } = timeParts(timing.time);
    result = nextCronRun({
      minute: { values: [minute], allowed: new Set([minute]), wildcard: false },
      hour: { values: [hour], allowed: new Set([hour]), wildcard: false },
      dayOfMonth: parseCronField("*", 1, 31),
      month: parseCronField("*", 1, 12),
      dayOfWeek: parseCronField("*", 0, 7, undefined, (value) => value === 7 ? 0 : value),
    }, timeZone, after, false);
  } else if (timing.kind === "weekly") {
    const { hour, minute } = timeParts(timing.time);
    const weekdays = [...new Set(timing.weekdays)].sort((a, b) => a - b);
    result = nextCronRun({
      minute: { values: [minute], allowed: new Set([minute]), wildcard: false },
      hour: { values: [hour], allowed: new Set([hour]), wildcard: false },
      dayOfMonth: parseCronField("*", 1, 31),
      month: parseCronField("*", 1, 12),
      dayOfWeek: { values: weekdays, allowed: new Set(weekdays), wildcard: false },
    }, timeZone, after, false);
  } else {
    result = nextCronRun(parseCronExpression(timing.expression), timeZone, after);
  }
  return result?.toISOString() ?? null;
}
