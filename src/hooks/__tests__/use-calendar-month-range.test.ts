/**
 * Tests month-range generation for the CRM tasks calendar.
 * @module hooks/__tests__/use-calendar-month-range
 */
import { describe, expect, it } from "vitest";
import { format } from "date-fns";

import { buildCalendarMonthRange } from "@/hooks/use-calendar-month-range";

describe("buildCalendarMonthRange", () => {
  it("returns the full visible April 2026 month range padded to whole weeks", () => {
    const result = buildCalendarMonthRange(new Date("2026-04-05T12:00:00+08:00"));

    expect(result.weekDayLabels).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    expect(result.weeks).toHaveLength(5);
    expect(format(result.firstDay, "yyyy-MM-dd")).toBe("2026-03-29");
    expect(format(result.lastDay, "yyyy-MM-dd")).toBe("2026-05-02");
  });

  it("does not pad backward when the month starts on Sunday", () => {
    const result = buildCalendarMonthRange(new Date("2026-03-15T12:00:00+08:00"));

    expect(format(result.firstDay, "yyyy-MM-dd")).toBe("2026-03-01");
  });

  it("does not pad forward when the month ends on Saturday", () => {
    const result = buildCalendarMonthRange(new Date("2026-10-15T12:00:00+08:00"));

    expect(format(result.lastDay, "yyyy-MM-dd")).toBe("2026-10-31");
  });
});
