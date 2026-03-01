import { describe, expect, it } from "vitest";
import { formatActiveRange } from "@/lib/property/utils";

describe("Agent compact header", () => {
  it("formats active date range correctly", () => {
    expect(formatActiveRange("2021-05-01", "2026-12-31")).toBe(
      "May 2021 – Dec 2026"
    );
  });

  it("handles null first date", () => {
    expect(formatActiveRange(null, null)).toBe("No transaction history");
  });

  it("handles missing latest date", () => {
    expect(formatActiveRange("2021-05-01", null)).toContain("May 2021 – Present");
  });
});
