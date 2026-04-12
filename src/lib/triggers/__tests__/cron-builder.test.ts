import { describe, expect, it } from "vitest";

import { buildCronExpression } from "../cron-builder";

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
