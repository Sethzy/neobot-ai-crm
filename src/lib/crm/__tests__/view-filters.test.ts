import { describe, expect, it, vi } from "vitest";

import { applyViewFilters, resolveSymbolicDates } from "../view-filters";

describe("resolveSymbolicDates", () => {
  it("resolves $today to current date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    const result = resolveSymbolicDates({ due_date_before: "$today" });
    expect(result.due_date_before).toBe("2026-04-05");
    vi.useRealTimers();
  });

  it("resolves $week_start and $week_end", () => {
    vi.useFakeTimers();
    // 2026-04-05 is a Sunday
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    const result = resolveSymbolicDates({
      due_date_after: "$week_start",
      due_date_before: "$week_end",
    });
    // Week starts Monday
    expect(result.due_date_after).toBe("2026-04-06");
    expect(result.due_date_before).toBe("2026-04-12");
    vi.useRealTimers();
  });

  it("resolves $month_start and $month_end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
    const result = resolveSymbolicDates({
      close_date_after: "$month_start",
      close_date_before: "$month_end",
    });
    expect(result.close_date_after).toBe("2026-04-01");
    expect(result.close_date_before).toBe("2026-04-30");
    vi.useRealTimers();
  });

  it("passes through non-symbolic values unchanged", () => {
    const result = resolveSymbolicDates({ status: "todo", stage: "leads" });
    expect(result).toEqual({ status: "todo", stage: "leads" });
  });
});

describe("applyViewFilters", () => {
  /** Spy query builder that records chained method calls. */
  function createMockQuery() {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy: Record<string, (...args: unknown[]) => typeof proxy> = {};

    for (const method of ["eq", "in", "gte", "lte", "neq"]) {
      proxy[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return proxy;
      };
    }

    return { proxy, calls };
  }

  it("applies equality filters", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { status: "todo", type: "buyer" });
    expect(calls).toEqual([
      { method: "eq", args: ["status", "todo"] },
      { method: "eq", args: ["type", "buyer"] },
    ]);
  });

  it("applies array inclusion via .in()", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { stage: ["leads", "offer"] });
    expect(calls).toEqual([
      { method: "in", args: ["stage", ["leads", "offer"]] },
    ]);
  });

  it("applies date range _after → .gte() and _before → .lte()", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, {
      due_date_after: "2026-04-01",
      due_date_before: "2026-04-30",
    });
    expect(calls).toEqual([
      { method: "gte", args: ["due_date", "2026-04-01"] },
      { method: "lte", args: ["due_date", "2026-04-30"] },
    ]);
  });

  it("skips null values", () => {
    const { proxy, calls } = createMockQuery();
    applyViewFilters(proxy as never, { status: null, type: "buyer" });
    expect(calls).toEqual([
      { method: "eq", args: ["type", "buyer"] },
    ]);
  });
});
