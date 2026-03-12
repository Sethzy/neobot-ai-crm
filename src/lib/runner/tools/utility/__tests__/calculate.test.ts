/**
 * Tests for the math.js calculate tool.
 * @module lib/runner/tools/utility/__tests__/calculate
 */
import { describe, expect, it } from "vitest";

import { createCalculateTool } from "../calculate";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createCalculateTool", () => {
  it("evaluates a basic arithmetic expression", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "1800000 * 0.012 * 0.6" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      expression: "1800000 * 0.012 * 0.6",
      result: 12960,
    });
  });

  it("evaluates an expression with named variables", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      {
        expression: "price * rate * share",
        variables: { price: 1800000, rate: 0.012, share: 0.6 },
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      expression: "price * rate * share",
      result: 12960,
    });
  });

  it("handles advanced math functions", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "sqrt(144) + 3^2" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      expression: "sqrt(144) + 3^2",
      result: 21,
    });
  });

  it("handles percentage-style calculations", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "1800000 * 1 / 100" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      expression: "1800000 * 1 / 100",
      result: 18000,
    });
  });

  it("returns numeric magnitude for unit conversions", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "2 inch to cm" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      expression: "2 inch to cm",
      result: 5.08,
    });
  });

  it("blocks the import function", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "import({x: 1})" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Function import is disabled",
    });
  });

  it("blocks the evaluate function (recursive eval)", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: 'evaluate("2+3")' },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Function evaluate is disabled",
    });
  });

  it("blocks the parse function", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: 'parse("2+3")' },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Function parse is disabled",
    });
  });

  it("blocks matrix-producing helper functions", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "ones(2, 2)" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Function ones is not allowed",
    });
  });

  it("returns an error for non-scalar outputs", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "sqrt(-1)" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      error: "Expression must produce a single numeric value, received Complex",
    });
  });

  it("returns an error for invalid expressions", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "2 + + 3 @@" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("returns an error for division by zero (Infinity)", async () => {
    const { calculate } = createCalculateTool();
    const result = await calculate.execute(
      { expression: "1 / 0" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
  });
});
