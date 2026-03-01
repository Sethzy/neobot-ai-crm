import { describe, expect, it } from "vitest";
import { formatAreaSqft } from "../utils";

describe("formatAreaSqft", () => {
  it("converts sqm to sqft and formats with commas", () => {
    expect(formatAreaSqft(100)).toBe("1,076");
  });

  it("returns N/A for null", () => {
    expect(formatAreaSqft(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatAreaSqft(undefined)).toBe("N/A");
  });
});
