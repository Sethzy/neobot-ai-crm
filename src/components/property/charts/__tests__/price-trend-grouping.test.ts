import { describe, expect, it } from "vitest";

function groupByQuarterMinMax(
  points: Array<{ date: string | null; value: number | null }>
): Array<{ period: string; min: number; median: number; max: number }> {
  const buckets = new Map<string, number[]>();
  for (const point of points) {
    if (!point.date || point.value === null) continue;
    const date = new Date(`${point.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;

    const year = date.getUTCFullYear();
    const quarter = Math.ceil((date.getUTCMonth() + 1) / 3);
    const key = `${year} Q${quarter}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point.value);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      return {
        period,
        min: Math.round(Math.min(...sorted)),
        median: Math.round(median),
        max: Math.round(Math.max(...sorted)),
      };
    });
}

describe("groupByQuarterMinMax", () => {
  it("computes min, median, max per quarter", () => {
    const result = groupByQuarterMinMax([
      { date: "2025-01-15", value: 1000 },
      { date: "2025-02-10", value: 1200 },
      { date: "2025-03-05", value: 800 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe("2025 Q1");
    expect(result[0].min).toBe(800);
    expect(result[0].median).toBe(1000);
    expect(result[0].max).toBe(1200);
  });

  it("handles single data point per quarter", () => {
    const result = groupByQuarterMinMax([{ date: "2025-04-01", value: 500 }]);
    expect(result[0].min).toBe(500);
    expect(result[0].median).toBe(500);
    expect(result[0].max).toBe(500);
  });

  it("skips null dates and values", () => {
    const result = groupByQuarterMinMax([
      { date: null, value: 1000 },
      { date: "2025-01-01", value: null },
      { date: "2025-01-15", value: 900 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].min).toBe(900);
  });
});
