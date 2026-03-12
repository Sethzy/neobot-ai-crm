# Math.js Calculate Tool Implementation Plan

**PR:** PR 8c: Math.js calculate tool
**Decisions:** TOOL-03
**Goal:** Give the agent a general-purpose, safe math expression evaluator so it can compute commission, amortization, unit conversions, and arbitrary arithmetic accurately.

**Architecture:** Small built-in tool (sibling to PR 8a drive-time, PR 8b Excalidraw). Uses `math.js` library's `evaluate()` with a hardened instance that disables dangerous functions (import, createUnit, evaluate, parse, simplify, derivative, resolve, reviver). Registered as a utility tool alongside SQL and todo tools. No sandbox, no DB migration, no external API.

**Tech Stack:** mathjs, Vercel AI SDK `tool()`, Zod, Vitest

---

## Relevant Files

- **Create:** `src/lib/runner/tools/utility/calculate.ts` — tool factory
- **Create:** `src/lib/runner/tools/utility/__tests__/calculate.test.ts` — tests
- **Modify:** `src/lib/runner/tools/utility/index.ts` — barrel export
- **Modify:** `src/lib/runner/tool-registry.ts` — no changes needed (utility tools auto-included)
- **Modify:** `src/lib/ai/system-prompt.ts` — add Calculations guidance to `<tool-usage>`
- **Reference:** `src/lib/runner/tools/web/drive-time.ts` — sibling tool pattern
- **Reference:** `src/lib/runner/tools/web/__tests__/drive-time.test.ts` — sibling test pattern

---

### Task 1: Install mathjs and set up test file

**Files:**
- Modify: `package.json`
- Create: `src/lib/runner/tools/utility/__tests__/calculate.test.ts`

**Step 1: Install mathjs**

```bash
pnpm add mathjs
```

**Step 2: Create empty test file with imports**

```typescript
// src/lib/runner/tools/utility/__tests__/calculate.test.ts
/**
 * Tests for the math.js calculate tool.
 * @module lib/runner/tools/utility/__tests__/calculate
 */
import { describe, expect, it } from "vitest";

import { createCalculateTool } from "../calculate";

const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createCalculateTool", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
```

**Step 3: Verify test file runs**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: FAIL — `createCalculateTool` does not exist yet.

**Step 4: Create minimal stub to unblock imports**

```typescript
// src/lib/runner/tools/utility/calculate.ts
/**
 * General-purpose math expression evaluator tool using math.js.
 * @module lib/runner/tools/utility/calculate
 */

/** Creates the calculate tool for runner registration. */
export function createCalculateTool() {
  return {};
}
```

**Step 5: Verify test file runs with stub**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: PASS (placeholder test)

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/runner/tools/utility/calculate.ts src/lib/runner/tools/utility/__tests__/calculate.test.ts
git commit -m "chore(pr8c): install mathjs and scaffold calculate tool"
```

---

### Task 2: Basic expression evaluation (TDD)

**Files:**
- Modify: `src/lib/runner/tools/utility/__tests__/calculate.test.ts`
- Modify: `src/lib/runner/tools/utility/calculate.ts`

**Step 1: Write the failing test — basic arithmetic**

```typescript
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
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: FAIL — `calculate` is undefined (stub returns empty object).

**Step 3: Implement the calculate tool with hardened math.js**

```typescript
// src/lib/runner/tools/utility/calculate.ts
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
        .record(z.number())
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
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/runner/tools/utility/calculate.ts src/lib/runner/tools/utility/__tests__/calculate.test.ts
git commit -m "feat(pr8c): basic expression evaluation with hardened mathjs"
```

---

### Task 3: Variables support (TDD)

**Files:**
- Modify: `src/lib/runner/tools/utility/__tests__/calculate.test.ts`

**Step 1: Write the failing test — named variables**

```typescript
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
```

**Step 2: Run test to verify it passes (variables already implemented)**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: PASS — variables support was built into the initial implementation. If it fails, debug and fix.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/utility/__tests__/calculate.test.ts
git commit -m "test(pr8c): add variables support test"
```

---

### Task 4: Security hardening tests (TDD)

**Files:**
- Modify: `src/lib/runner/tools/utility/__tests__/calculate.test.ts`

**Step 1: Write the failing tests — dangerous functions blocked**

```typescript
it("blocks the import function", async () => {
  const { calculate } = createCalculateTool();
  const result = await calculate.execute(
    { expression: 'import({x: 1})' },
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
```

**Step 2: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: PASS — hardening was built into the initial implementation.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/utility/__tests__/calculate.test.ts
git commit -m "test(pr8c): add security hardening tests for blocked functions"
```

---

### Task 5: Error handling and edge cases (TDD)

**Files:**
- Modify: `src/lib/runner/tools/utility/__tests__/calculate.test.ts`

**Step 1: Write the failing tests — error cases**

```typescript
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
```

**Step 2: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/runner/tools/utility/__tests__/calculate.test.ts
```

Expected: PASS for all. If division by zero doesn't return Infinity in math.js (it may return Infinity which we guard), check behavior and adjust.

**Step 3: Commit**

```bash
git add src/lib/runner/tools/utility/__tests__/calculate.test.ts
git commit -m "test(pr8c): add error handling and edge case tests"
```

---

### Task 6: Register in utility barrel and add system prompt guidance

**Files:**
- Modify: `src/lib/runner/tools/utility/index.ts`
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add calculate to utility barrel**

In `src/lib/runner/tools/utility/index.ts`, add the import and spread into the return:

```typescript
import { createCalculateTool } from "./calculate";
```

Add `...createCalculateTool(),` to the return object (before the conditional tools).

**Step 2: Add Calculations section to system prompt**

In `src/lib/ai/system-prompt.ts`, add after the `Web:` section inside `<tool-usage>`:

```
Calculations:
- Use the calculate tool for any arithmetic, commission calculations, amortization, unit conversions, or financial math.
- Write expressions as math.js syntax: standard operators (+, -, *, /, ^), functions (sqrt, log, sin, cos, round, ceil, floor), and constants (pi, e).
- Use named variables for clarity when working with multiple values from CRM data.
- Chain multiple calculate calls for multi-step calculations rather than writing one complex expression.
```

**Step 3: Run full test suite to verify nothing broke**

```bash
pnpm vitest run
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/lib/runner/tools/utility/index.ts src/lib/ai/system-prompt.ts
git commit -m "feat(pr8c): register calculate tool and add system prompt guidance"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

```bash
pnpm vitest run
```

Expected: All tests pass.

**Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 3: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "feat(pr8c): math.js calculate tool complete"
```
