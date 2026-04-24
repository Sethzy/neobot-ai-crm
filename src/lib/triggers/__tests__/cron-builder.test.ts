import { describe, expect, it } from "vitest";

import { buildCronExpression, inferRecurrence } from "../cron-builder";

describe("buildCronExpression", () => {
  it("builds daily cron", () => {
    expect(buildCronExpression("daily", [], "08:00")).toBe("0 8 * * *");
  });

  it("builds weekdays cron", () => {
    expect(buildCronExpression("weekdays", [], "09:30")).toBe("30 9 * * 1-5");
  });

  it("builds weekly with specific days", () => {
    expect(buildCronExpression("weekly", [1, 3, 5], "10:00")).toBe("0 10 * * 1,3,5");
  });

  it("builds monthly cron", () => {
    expect(buildCronExpression("monthly", [], "14:00")).toBe("0 14 1 * *");
  });

  it("passes through custom cron", () => {
    expect(buildCronExpression("custom", [], "08:00", "*/15 * * * *")).toBe("*/15 * * * *");
  });
});

describe("inferRecurrence", () => {
  it("returns daily for null/empty cron", () => {
    expect(inferRecurrence(null)).toBe("daily");
    expect(inferRecurrence("")).toBe("daily");
  });

  it("infers daily presets", () => {
    expect(inferRecurrence("0 8 * * *")).toBe("daily");
    expect(inferRecurrence("30 14 * * *")).toBe("daily");
  });

  it("infers weekdays preset", () => {
    expect(inferRecurrence("0 9 * * 1-5")).toBe("weekdays");
  });

  it("infers monthly preset", () => {
    expect(inferRecurrence("0 8 1 * *")).toBe("monthly");
    expect(inferRecurrence("30 14 1 * *")).toBe("monthly");
  });

  it("infers weekly with specific days", () => {
    expect(inferRecurrence("0 9 * * 1")).toBe("weekly");
    expect(inferRecurrence("0 9 * * 1,3,5")).toBe("weekly");
    expect(inferRecurrence("0 9 * * 0-6")).toBe("weekly");
  });

  // Regression: brittle string-match used to misclassify these as monthly
  // because the rendered cron string contains the substring "1 * *".
  it("does not misclassify weekly as monthly when hour contains '1'", () => {
    expect(inferRecurrence("0 1 * * 0-6")).toBe("weekly");
    expect(inferRecurrence("0 11 * * 0-6")).toBe("weekly");
    expect(inferRecurrence("0 21 * * 0-6")).toBe("weekly");
    expect(inferRecurrence("0 1 * * 1")).toBe("weekly");
    expect(inferRecurrence("0 11 * * 1,3,5")).toBe("weekly");
  });

  it("returns custom for non-preset expressions", () => {
    expect(inferRecurrence("*/15 * * * *")).toBe("custom");
    expect(inferRecurrence("0 8 1,15 * *")).toBe("custom");
    expect(inferRecurrence("0 8 * 1 *")).toBe("custom");
  });

  it("returns custom for malformed expressions", () => {
    expect(inferRecurrence("not a cron")).toBe("custom");
    expect(inferRecurrence("0 8 * *")).toBe("custom");
  });
});
