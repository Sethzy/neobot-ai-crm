import { describe, expect, it } from "vitest";
import { aggregateNeighbourhoods } from "../top-neighbourhoods";

describe("aggregateNeighbourhoods", () => {
  it("groups by town and sorts by count descending", () => {
    const transactions = [
      { town: "YISHUN", district: null },
      { town: "YISHUN", district: null },
      { town: "HOUGANG", district: null },
      { town: "BEDOK", district: null },
      { town: "YISHUN", district: null },
    ];
    const result = aggregateNeighbourhoods(transactions);
    expect(result[0]).toEqual({ name: "YISHUN", count: 3, percentage: 60 });
    expect(result[1]).toEqual({ name: "HOUGANG", count: 1, percentage: 20 });
  });

  it("falls back to district when town is null", () => {
    const transactions = [
      { town: null, district: "D09" },
      { town: null, district: "D09" },
    ];
    const result = aggregateNeighbourhoods(transactions);
    expect(result[0].name).toBe("D09");
  });

  it("returns top 10 only", () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      town: `TOWN_${i}`,
      district: null,
    }));
    const result = aggregateNeighbourhoods(transactions);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
