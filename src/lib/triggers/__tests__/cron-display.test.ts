import { describe, expect, it } from "vitest";

import { cronToHuman, formatCountdown } from "../cron-display";

describe("cronToHuman", () => {
  it("converts weekday 8am cron to readable text", () => {
    expect(cronToHuman("0 8 * * 1-5")).toBe("At 08:00 AM, Monday through Friday");
  });

  it("returns raw cron on parse failure", () => {
    expect(cronToHuman("invalid")).toBe("invalid");
  });

  it("handles null/undefined gracefully", () => {
    expect(cronToHuman(null)).toBe("\u2014");
    expect(cronToHuman(undefined)).toBe("\u2014");
  });
});

describe("formatCountdown", () => {
  it("returns 'in Xhr' for hours away", () => {
    const inFiveHours = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    expect(formatCountdown(inFiveHours)).toMatch(/in \d+hr/);
  });

  it("returns 'in Xd' for days away", () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatCountdown(inThreeDays)).toMatch(/in \d+d/);
  });

  it("returns '\u2014' for null", () => {
    expect(formatCountdown(null)).toBe("\u2014");
  });
});
