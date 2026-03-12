/**
 * General-purpose math expression evaluator tool using math.js.
 * @module lib/runner/tools/utility/calculate
 */
import { tool } from "ai";
import { create, all } from "mathjs";
import { z } from "zod";

/**
 * Creates a hardened math.js instance with dangerous functions disabled.
 * Prevents injection attacks when evaluating LLM-generated expressions.
 * See: https://mathjs.org/docs/expressions/security.html
 */
function createHardenedMath() {
  const math = create(all);
  const safeEvaluate = math.evaluate;

  math.import(
    {
      import: function () {
        throw new Error("Function import is disabled");
      },
      createUnit: function () {
        throw new Error("Function createUnit is disabled");
      },
      reviver: function () {
        throw new Error("Function reviver is disabled");
      },
      evaluate: function () {
        throw new Error("Function evaluate is disabled");
      },
      parse: function () {
        throw new Error("Function parse is disabled");
      },
      simplify: function () {
        throw new Error("Function simplify is disabled");
      },
      derivative: function () {
        throw new Error("Function derivative is disabled");
      },
      resolve: function () {
        throw new Error("Function resolve is disabled");
      },
    },
    { override: true },
  );

  return safeEvaluate;
}

const safeEvaluate = createHardenedMath();

/** Creates the calculate tool for runner registration. */
export function createCalculateTool() {
  const calculate = tool({
    description:
      "Evaluate a mathematical expression. Supports arithmetic, percentages, " +
      "trigonometry, powers, roots, logarithms, and named variables. " +
      "Examples: '1200000 * 0.01 * 0.6', 'sqrt(144) + 3^2', 'a * (1 + r)^n'.",
    inputSchema: z.object({
      expression: z
        .string()
        .min(1)
        .describe("The math expression to evaluate."),
      variables: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          "Optional named variables for the expression, e.g. { price: 1200000, rate: 0.01 }",
        ),
    }),
    execute: async ({ expression, variables }) => {
      try {
        const raw = safeEvaluate(expression, variables ?? {});
        const result = typeof raw === "number" ? raw : Number(raw);

        if (!Number.isFinite(result)) {
          return {
            success: false as const,
            error: `Expression produced a non-finite result: ${String(raw)}`,
          };
        }

        return { success: true as const, expression, result };
      } catch (err) {
        return {
          success: false as const,
          error:
            err instanceof Error ? err.message : "Expression evaluation failed",
        };
      }
    },
  });

  return { calculate };
}
