/**
 * Tests for cron expression utilities.
 * @module lib/triggers/__tests__/cron-utils
 */
import { describe, expect, it } from "vitest";

import {
  computeNextFireAt,
  InvalidCronExpressionError,
  isValidCronExpression,
} from "../cron-utils";

describe("isValidCronExpression", () => {
  it("returns true for a valid every-minute expression", () => {
    expect(isValidCronExpression("* * * * *")).toBe(true);
  });

  it("returns true for a standard daily-at-9am expression", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidCronExpression("")).toBe(false);
  });

  it("returns false for gibberish", () => {
    expect(isValidCronExpression("not a cron")).toBe(false);
  });

  it("returns false for a 6-field expression", () => {
    expect(isValidCronExpression("0 0 9 * * *")).toBe(false);
  });
});

describe("computeNextFireAt", () => {
  it("returns a date after the given reference time", () => {
    const referenceTime = new Date("2026-03-06T08:59:00.000Z");
    const nextFireAt = computeNextFireAt("0 9 * * *", referenceTime);

    expect(nextFireAt).toBeInstanceOf(Date);
    expect(nextFireAt.getTime()).toBeGreaterThan(referenceTime.getTime());
  });

  it("computes the next minute in UTC", () => {
    const referenceTime = new Date("2026-03-06T10:30:00.000Z");
    const nextFireAt = computeNextFireAt("* * * * *", referenceTime);

    expect(nextFireAt.toISOString()).toBe("2026-03-06T10:31:00.000Z");
  });

  it("computes the next day when the current window has passed", () => {
    const referenceTime = new Date("2026-03-06T10:00:00.000Z");
    const nextFireAt = computeNextFireAt("0 9 * * *", referenceTime);

    expect(nextFireAt.toISOString()).toBe("2026-03-07T09:00:00.000Z");
  });

  it("computes the next schedule in the supplied timezone", () => {
    const referenceTime = new Date("2026-03-06T00:30:00.000Z");
    const nextFireAt = computeNextFireAt(
      "0 9 * * *",
      referenceTime,
      "Asia/Singapore",
    );

    expect(nextFireAt.toISOString()).toBe("2026-03-06T01:00:00.000Z");
  });

  it("throws for an invalid cron expression", () => {
    expect(() => computeNextFireAt("bad", new Date())).toThrow(InvalidCronExpressionError);
  });
});
