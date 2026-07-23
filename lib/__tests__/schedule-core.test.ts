import { describe, expect, it } from "vitest";
import {
  nextScheduleRunAt,
  parseCronExpression,
  validateScheduleTiming,
  zonedDateTimeToInstants,
} from "../schedule-core";

describe("schedule-core", () => {
  it("parses five-field cron expressions with names, ranges, lists, and steps", () => {
    const cron = parseCronExpression("*/15 9-17 * JAN,MAR MON-FRI");
    expect(cron.minute.values).toEqual([0, 15, 30, 45]);
    expect(cron.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(cron.month.values).toEqual([1, 3]);
    expect(cron.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it("calculates daily and weekly runs using the selected timezone", () => {
    expect(nextScheduleRunAt(
      { kind: "daily", time: "09:00" },
      "Asia/Taipei",
      new Date("2026-07-23T00:30:00.000Z"),
    )).toBe("2026-07-23T01:00:00.000Z");

    expect(nextScheduleRunAt(
      { kind: "weekly", time: "09:00", weekdays: [1] },
      "Asia/Taipei",
      new Date("2026-07-23T00:30:00.000Z"),
    )).toBe("2026-07-27T01:00:00.000Z");
  });

  it("finds the next cron minute without depending on the server timezone", () => {
    expect(nextScheduleRunAt(
      { kind: "cron", expression: "*/15 9-10 * * MON-FRI" },
      "Asia/Taipei",
      new Date("2026-07-23T01:07:00.000Z"),
    )).toBe("2026-07-23T01:15:00.000Z");
  });

  it("uses standard cron OR semantics when both day fields are restricted", () => {
    // July 27 is Monday, so it matches even though it is not the 31st.
    expect(nextScheduleRunAt(
      { kind: "cron", expression: "0 9 31 * MON" },
      "UTC",
      new Date("2026-07-26T10:00:00.000Z"),
    )).toBe("2026-07-27T09:00:00.000Z");
  });

  it("treats stepped day fields as restricted for cron DOM/DOW OR semantics", () => {
    // July 20 is Monday but not selected by the 1-based */2 DOM field.
    // A restricted DOM and restricted DOW use OR, so Monday still runs.
    expect(nextScheduleRunAt(
      { kind: "cron", expression: "0 9 */2 * MON" },
      "UTC",
      new Date("2026-07-19T10:00:00.000Z"),
    )).toBe("2026-07-20T09:00:00.000Z");
  });

  it("handles DST gaps and repeated wall-clock minutes", () => {
    const gap = zonedDateTimeToInstants(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      "America/New_York",
    );
    expect(gap).toEqual([]);

    const repeated = zonedDateTimeToInstants(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
      "America/New_York",
    );
    expect(repeated.map((date) => date.toISOString())).toEqual([
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:30:00.000Z",
    ]);
  });

  it("runs a daily schedule only once across a repeated DST wall-clock minute", () => {
    expect(nextScheduleRunAt(
      { kind: "daily", time: "01:30" },
      "America/New_York",
      new Date("2026-11-01T05:30:00.000Z"),
    )).toBe("2026-11-02T06:30:00.000Z");
  });

  it("rejects nonexistent one-time local timestamps", () => {
    expect(() => validateScheduleTiming(
      { kind: "once", date: "2026-03-08", time: "02:30" },
      "America/New_York",
    )).toThrow(/does not exist/);
  });

  it("rejects malformed cron input", () => {
    expect(() => parseCronExpression("0 0 * *")).toThrow(/5 fields/);
    expect(() => parseCronExpression("*/0 * * * *")).toThrow(/step/);
    expect(() => parseCronExpression("0 25 * * *")).toThrow(/outside/);
  });
});
