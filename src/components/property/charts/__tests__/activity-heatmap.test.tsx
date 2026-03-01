import { describe, expect, it } from "vitest";
import { groupByMonthYear } from "../activity-heatmap";

describe("ActivityHeatmap groupByMonthYear", () => {
  it("groups dates into year-month buckets with counts", () => {
    const dates = ["2024-01-15", "2024-01-20", "2024-03-10", "2025-01-05"];
    const result = groupByMonthYear(dates);

    expect(result.get("2024-01")).toBe(2);
    expect(result.get("2024-03")).toBe(1);
    expect(result.get("2025-01")).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(groupByMonthYear([])).toEqual(new Map());
  });

  it("skips null dates", () => {
    const result = groupByMonthYear([null, "2024-06-01", null]);
    expect(result.size).toBe(1);
    expect(result.get("2024-06")).toBe(1);
  });

  it("returns correct year range keys", () => {
    const dates = ["2020-01-01", "2025-12-01"];
    const result = groupByMonthYear(dates);
    expect(result.has("2020-01")).toBe(true);
    expect(result.has("2025-12")).toBe(true);
    expect(result.has("2022-06")).toBe(false);
  });
});
