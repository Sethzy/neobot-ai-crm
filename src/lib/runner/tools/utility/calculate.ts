/**
 * General-purpose math expression evaluator tool using math.js.
 * @module lib/runner/tools/utility/calculate
 */
import { tool } from "ai";
import { create, all } from "mathjs";
import { z } from "zod";

const MAX_EXPRESSION_LENGTH = 200;
const MAX_NODE_COUNT = 40;

const ALLOWED_FUNCTION_NAMES = new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "exp",
  "floor",
  "log",
  "max",
  "min",
  "number",
  "round",
  "sin",
  "sqrt",
  "tan",
]);

const ALLOWED_OPERATOR_NAMES = new Set(["+", "-", "*", "/", "^", "to"]);
const DISABLED_FUNCTION_NAMES = new Set([
  "createUnit",
  "derivative",
  "evaluate",
  "import",
  "parse",
  "resolve",
  "reviver",
  "simplify",
]);

/**
 * Creates a hardened math.js instance with dangerous functions disabled.
 * Prevents injection attacks when evaluating LLM-generated expressions.
 * See: https://mathjs.org/docs/expressions/security.html
 */
function createHardenedMath() {
  const math = create(all);
  const safeEvaluate = math.evaluate;
  const safeParse = math.parse;

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

  return {
    math,
    safeEvaluate,
    safeParse,
  };
}

const { math: hardenedMath, safeEvaluate, safeParse } = createHardenedMath();

/**
 * Parses the expression before evaluation and rejects node types/functions that
 * can create large structures or symbolic programs. This keeps the tool focused
 * on scalar arithmetic and unit conversions.
 */
function validateExpression(expression: string) {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expression is too long. Limit is ${MAX_EXPRESSION_LENGTH} characters.`);
  }

  const node = safeParse(expression);
  let nodeCount = 0;

  node.traverse((currentNode) => {
    const typedNode = currentNode as {
      type: string;
      op?: string;
      fn?: { type?: string; name?: string };
    };

    nodeCount += 1;

    if (nodeCount > MAX_NODE_COUNT) {
      throw new Error(`Expression is too complex. Limit is ${MAX_NODE_COUNT} syntax nodes.`);
    }

    switch (typedNode.type) {
      case "ConstantNode":
      case "ParenthesisNode":
      case "SymbolNode":
        return;
      case "OperatorNode":
        if (!typedNode.op || !ALLOWED_OPERATOR_NAMES.has(typedNode.op)) {
          throw new Error(`Operator ${typedNode.op ?? "unknown"} is not allowed`);
        }
        return;
      case "FunctionNode":
        if (typedNode.fn?.type !== "SymbolNode" || !typedNode.fn.name) {
          throw new Error("Only named functions are allowed");
        }

        if (DISABLED_FUNCTION_NAMES.has(typedNode.fn.name)) {
          throw new Error(`Function ${typedNode.fn.name} is disabled`);
        }

        if (!ALLOWED_FUNCTION_NAMES.has(typedNode.fn.name)) {
          throw new Error(`Function ${typedNode.fn.name} is not allowed`);
        }
        return;
      default:
        throw new Error(`${typedNode.type} is not allowed in calculate expressions`);
    }
  });
}

/**
 * Normalizes supported math.js scalar outputs into a plain number so the tool
 * keeps the same success payload shape across arithmetic and unit conversions.
 */
function extractNumericResult(raw: unknown) {
  if (typeof raw === "number") {
    return raw;
  }

  const rawType = hardenedMath.typeOf(raw);

  switch (rawType) {
    case "BigNumber":
    case "Fraction":
      return Number(raw);
    case "Unit": {
      const rawValue = (raw as { toJSON?: () => { value?: unknown } }).toJSON?.().value;
      return typeof rawValue === "number" ? rawValue : Number(rawValue);
    }
    default:
      throw new Error(`Expression must produce a single numeric value, received ${rawType}`);
  }
}

/** Creates the calculate tool for runner registration. */
export function createCalculateTool() {
  const calculate = tool({
    description:
      "Evaluate a scalar mathematical expression. Supports arithmetic, percentages, " +
      "trigonometry, powers, roots, logarithms, named variables, and unit conversions. " +
      "Examples: '1200000 * 0.01 * 0.6', 'sqrt(144) + 3^2', '2 inch to cm'.",
    inputSchema: z.object({
      expression: z
        .string()
        .min(1)
        .describe("The scalar math expression to evaluate."),
      variables: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          "Optional named variables for the expression, e.g. { price: 1200000, rate: 0.01 }",
        ),
    }),
    execute: async ({ expression, variables }) => {
      try {
        validateExpression(expression);
        const raw = safeEvaluate(expression, variables ?? {});
        const result = extractNumericResult(raw);

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
