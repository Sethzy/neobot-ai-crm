/**
 * Tests for autopilot quiet-hours evaluation.
 * @module lib/autopilot/__tests__/quiet-hours
 */
import { describe, expect, test } from "vitest";

import { isInQuietHours } from "../quiet-hours";

describe("isInQuietHours", () => {
  test("returns false when quiet hours are disabled", () => {
    expect(
      isInQuietHours({
        quietHoursStart: null,
        quietHoursEnd: null,
        now: new Date("2026-03-06T23:30:00+08:00"),
      }),
    ).toBe(false);
  });

  test("treats the start boundary as inclusive for overnight windows", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: new Date("2026-03-06T22:00:00+08:00"),
      }),
    ).toBe(true);
  });

  test("treats the end boundary as exclusive for overnight windows", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: new Date("2026-03-06T07:00:00+08:00"),
      }),
    ).toBe(false);
  });

  test("supports overnight windows with second-precision SQL TIME values", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "22:00:00",
        quietHoursEnd: "07:00:00",
        now: new Date("2026-03-06T23:30:00+08:00"),
      }),
    ).toBe(true);
  });

  test("supports same-day quiet hours windows", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "09:00",
        quietHoursEnd: "17:00",
        now: new Date("2026-03-06T12:00:00+08:00"),
      }),
    ).toBe(true);
  });

  test("defaults to Asia/Singapore when no timezone is provided", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: new Date("2026-03-06T23:30:00Z"),
      }),
    ).toBe(false);
  });

  test("accepts a custom timezone", () => {
    expect(
      isInQuietHours({
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        now: new Date("2026-03-07T04:30:00Z"),
        timezone: "America/New_York",
      }),
    ).toBe(true);
  });
});
