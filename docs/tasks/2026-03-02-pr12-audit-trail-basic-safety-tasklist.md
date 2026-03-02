# PR 12: Audit Trail + Basic Safety — Implementation Plan

**PR:** PR 12: Audit trail + basic safety
**Decisions:** SAFETY-03, SCALE-01
**Goal:** Log every tool call to `runs.tool_calls` JSONB, ensure tool errors don't crash runs, verify cost tracking.

**Architecture:** Per SAFETY-03, the implicit audit trail comes free from thread history (`conversation_messages` with `role='tool'`). PR 12 adds an **explicit queryable log**: a `tool_calls` JSONB column on the `runs` table storing structured records extracted from AI SDK v6's `onFinish({ steps })` array. Each record captures `toolCallId`, `toolName`, `args`, `result`, and optional `error`. For error handling, a `withErrorBoundary()` higher-order function wraps tool `execute` callbacks to catch unexpected thrown errors and return structured `{ success: false, error }` responses. This prevents raw stack traces from reaching the model and keeps all tool responses in a consistent format. AI SDK v6 already converts thrown errors to `tool-error` content parts, but the wrapper gives us control over the error shape. Cost tracking (model + tokens) is already implemented in PR 4 — PR 12 adds `step_count` for future routing analytics.

**Tech Stack:** Vercel AI SDK v6 (`ai` ^6.0.39, `@ai-sdk/gateway` ^3.0.22), Supabase, Zod, Vitest

---

## Prerequisites

| PR | What it creates | Why PR 12 needs it |
|----|----------------|-------------------|
| PR 4 | `runs` table, `run-lifecycle.ts`, `run-agent.ts` with `streamText()` | Column target and function modification points |
| PR 6 | CRM tools in `src/lib/runner/tools/crm/` | Tools to wrap with error boundary |
| PR 7 | Storage tools in `src/lib/runner/tools/storage/` | Tools to wrap with error boundary |

**Verify before starting:**
- `src/lib/runner/run-agent.ts` exists with `onFinish: async ({ totalUsage }) => { ... }`
- `src/lib/runner/run-lifecycle.ts` exports `completeRun` with `CompleteRunInput` interface
- `src/lib/runner/tools/crm/index.ts` exports `createCrmTools`
- `src/lib/runner/tools/storage/index.ts` exports `createStorageTools`
- `vitest.config.ts` exists with `@` alias pointing to `./src`

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task Overview

| Task | Component | Files | Tests | Depends On |
|------|-----------|-------|-------|------------|
| 1 | Migration: audit columns on `runs` | 1 SQL create | — | — |
| 2 | `ToolCallRecord` type + `extractToolCalls()` | 1 source create + 1 test create | 5 tests | — |
| 3 | Extend `completeRun` to persist `toolCalls` + `stepCount` | 1 source modify + 1 test modify | 3 tests | Task 1, 2 |
| 4 | Wire extraction into runner `onFinish` | 1 source modify + 1 test modify | 2 tests | Task 2, 3 |
| 5 | `withErrorBoundary()` tool wrapper | 1 source create + 1 test create | 4 tests | — |
| 6 | Apply error boundary to tool factories | 2 source modify | — | Task 5 |
| 7 | Regenerate types + final verification | 1 modify + plan update | — | All |

**Total: ~7 files changed/created, ~14 new tests.**

---

## Relevant Files

**Create:**
- `supabase/migrations/20260302140000_add_audit_columns_to_runs.sql` — Migration
- `src/lib/runner/extract-tool-calls.ts` — Extractor utility
- `src/lib/runner/__tests__/extract-tool-calls.test.ts` — Extractor tests
- `src/lib/runner/tools/with-error-boundary.ts` — Error boundary wrapper
- `src/lib/runner/tools/__tests__/with-error-boundary.test.ts` — Error boundary tests

**Modify:**
- `src/lib/runner/run-lifecycle.ts` — Add `toolCalls` + `stepCount` to `CompleteRunInput`
- `src/lib/runner/__tests__/run-agent.test.ts` — Update `onFinish` test to include `steps`
- `src/lib/runner/run-agent.ts` — Destructure `steps` in `onFinish`, call extractor
- `src/lib/runner/tools/crm/contacts.ts` — Wrap `execute` with error boundary
- `src/lib/runner/tools/crm/deals.ts` — Wrap `execute` with error boundary
- `src/lib/runner/tools/crm/interactions.ts` — Wrap `execute` with error boundary
- `src/lib/runner/tools/crm/tasks.ts` — Wrap `execute` with error boundary
- `src/lib/runner/tools/storage/index.ts` — Wrap `execute` with error boundary
- `src/types/database.ts` — Regenerate after migration
- `docs/product/plans/2026-03-01-implementation-phasing-plan.json` — Mark PR 12 in_progress

**Reference (read-only):**
- `src/lib/runner/schemas.ts` — `RunResult` type, `ToolResultEnvelope` schema
- `src/lib/crm/schemas.ts` — CRM enum values
- `vitest.config.ts` — Test config (alias `@` → `./src`)

---

## AI SDK v6 Key Reference

**`streamText` `onFinish` callback receives:**
```typescript
onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
  // steps: Array of step results, each containing toolCalls and toolResults
  // totalUsage: { inputTokens, outputTokens, totalTokens }
  // response.messages: All generated messages
}
```

**`steps` array structure (per step):**
```typescript
{
  stepType: "initial" | "continue" | "tool-result",
  text: string,
  toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }>,
  toolResults: Array<{ toolCallId: string; toolName: string; result: unknown }>,
  finishReason: "stop" | "length" | "tool-calls" | "error" | "other",
  usage: { inputTokens: number; outputTokens: number },
}
```

**Tool error behavior:** If a tool's `execute` function throws, AI SDK automatically converts the error to a `tool-error` content part. The model sees the error and can retry. PR 12's `withErrorBoundary()` catches errors *before* they reach the SDK, returning `{ success: false, error }` for a consistent response shape.

---

## Task 1: Migration — Add Audit Columns to `runs`

**Files:**
- Create: `supabase/migrations/20260302140000_add_audit_columns_to_runs.sql`

**Step 1: Write the migration**

```sql
-- PR 12: Add tool call logging and step count to runs table (SAFETY-03, SCALE-01).

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS tool_calls JSONB,
  ADD COLUMN IF NOT EXISTS step_count INTEGER CHECK (step_count IS NULL OR step_count >= 0);

COMMENT ON COLUMN public.runs.tool_calls IS 'Structured log of tool calls made during this run.';
COMMENT ON COLUMN public.runs.step_count IS 'Number of LLM steps in this run.';
```

**Step 2: Apply the migration locally**

```bash
Run: npx supabase db push
Expected: Migration applied. Two new columns on runs table.
```

**Step 3: Verify columns exist**

```bash
Run: npx supabase db dump --schema public | grep -A2 'tool_calls\|step_count'
Expected: See both columns in the runs table DDL.
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260302140000_add_audit_columns_to_runs.sql
git commit -m "feat(db): add tool_calls JSONB and step_count to runs table (SAFETY-03)"
```

---

## Task 2: `ToolCallRecord` Type + `extractToolCalls()` Extractor

**Files:**
- Create: `src/lib/runner/extract-tool-calls.ts`
- Test: `src/lib/runner/__tests__/extract-tool-calls.test.ts`

This is a **pure function** with no dependencies — extracts structured records from AI SDK step arrays.

### Step 1: Write the failing tests

Create `src/lib/runner/__tests__/extract-tool-calls.test.ts`:

```typescript
/**
 * Tests for tool call extraction from AI SDK steps.
 * @module lib/runner/__tests__/extract-tool-calls
 */
import { describe, expect, it } from "vitest";

import { extractToolCalls } from "../extract-tool-calls";
import type { StepInput } from "../extract-tool-calls";

describe("extractToolCalls", () => {
  it("returns empty array for empty steps", () => {
    const result = extractToolCalls([]);
    expect(result).toEqual([]);
  });

  it("returns empty array when steps have no tool calls", () => {
    const steps: StepInput[] = [
      { toolCalls: [], toolResults: [] },
      { toolCalls: undefined, toolResults: undefined },
    ];
    const result = extractToolCalls(steps);
    expect(result).toEqual([]);
  });

  it("extracts tool call with matching result", () => {
    const steps: StepInput[] = [
      {
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "search_contacts",
            args: { query: "John" },
          },
        ],
        toolResults: [
          {
            toolCallId: "call-1",
            toolName: "search_contacts",
            result: { success: true, contacts: [{ name: "John Smith" }], count: 1 },
          },
        ],
      },
    ];

    const result = extractToolCalls(steps);

    expect(result).toEqual([
      {
        toolCallId: "call-1",
        toolName: "search_contacts",
        args: { query: "John" },
        result: { success: true, contacts: [{ name: "John Smith" }], count: 1 },
      },
    ]);
  });

  it("flags error when tool result has success: false", () => {
    const steps: StepInput[] = [
      {
        toolCalls: [
          {
            toolCallId: "call-2",
            toolName: "create_contact",
            args: { first_name: "Jane" },
          },
        ],
        toolResults: [
          {
            toolCallId: "call-2",
            toolName: "create_contact",
            result: { success: false, error: "Duplicate contact" },
          },
        ],
      },
    ];

    const result = extractToolCalls(steps);

    expect(result).toHaveLength(1);
    expect(result[0].error).toBe("Duplicate contact");
    expect(result[0].result).toEqual({ success: false, error: "Duplicate contact" });
  });

  it("extracts multiple tool calls across multiple steps", () => {
    const steps: StepInput[] = [
      {
        toolCalls: [
          { toolCallId: "call-1", toolName: "search_contacts", args: { query: "John" } },
        ],
        toolResults: [
          { toolCallId: "call-1", toolName: "search_contacts", result: { success: true, contacts: [], count: 0 } },
        ],
      },
      {
        toolCalls: [
          { toolCallId: "call-2", toolName: "create_contact", args: { first_name: "John", last_name: "Smith" } },
          { toolCallId: "call-3", toolName: "create_deal", args: { address: "123 Oak St" } },
        ],
        toolResults: [
          { toolCallId: "call-2", toolName: "create_contact", result: { success: true, contact: { contact_id: "c1" } } },
          { toolCallId: "call-3", toolName: "create_deal", result: { success: true, deal: { deal_id: "d1" } } },
        ],
      },
    ];

    const result = extractToolCalls(steps);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.toolName)).toEqual([
      "search_contacts",
      "create_contact",
      "create_deal",
    ]);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/__tests__/extract-tool-calls.test.ts
Expected: FAIL — Cannot find module '../extract-tool-calls'
```

### Step 3: Write minimal implementation

Create `src/lib/runner/extract-tool-calls.ts`:

```typescript
/**
 * Extracts structured tool call records from AI SDK v6 step results.
 * @module lib/runner/extract-tool-calls
 */

/** Structured log entry for a single tool invocation. */
export interface ToolCallRecord {
  /** AI SDK tool call identifier. */
  toolCallId: string;
  /** Tool function name (e.g., "search_contacts"). */
  toolName: string;
  /** Arguments passed to the tool. */
  args: Record<string, unknown>;
  /** Tool execution result, if available. */
  result?: unknown;
  /** Error message if the tool returned success: false or was missing a result. */
  error?: string;
}

/** Minimal step shape from AI SDK v6 onFinish.steps — keeps extractor testable without importing AI SDK types. */
export interface StepInput {
  toolCalls?: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    args: unknown;
  }>;
  toolResults?: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    result: unknown;
  }>;
}

/**
 * Extracts structured tool call records from AI SDK step results.
 *
 * Iterates through all steps, matches tool calls to their results by
 * `toolCallId`, and flags errors when the result has `success: false`.
 */
export function extractToolCalls(steps: StepInput[]): ToolCallRecord[] {
  const records: ToolCallRecord[] = [];

  for (const step of steps) {
    if (!step.toolCalls?.length) continue;

    const resultMap = new Map<string, unknown>();
    for (const tr of step.toolResults ?? []) {
      resultMap.set(tr.toolCallId, tr.result);
    }

    for (const tc of step.toolCalls) {
      const result = resultMap.get(tc.toolCallId);
      const record: ToolCallRecord = {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: (tc.args ?? {}) as Record<string, unknown>,
      };

      if (result !== undefined) {
        record.result = result;

        if (
          typeof result === "object" &&
          result !== null &&
          "success" in result &&
          (result as Record<string, unknown>).success === false
        ) {
          record.error =
            String((result as Record<string, unknown>).error ?? "Tool returned failure");
        }
      }

      records.push(record);
    }
  }

  return records;
}
```

### Step 4: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/runner/__tests__/extract-tool-calls.test.ts
Expected: 5 tests PASS
```

### Step 5: Commit

```bash
git add src/lib/runner/extract-tool-calls.ts src/lib/runner/__tests__/extract-tool-calls.test.ts
git commit -m "feat(runner): add extractToolCalls utility for audit trail (SAFETY-03)"
```

---

## Task 3: Extend `completeRun` to Persist `toolCalls` + `stepCount`

**Files:**
- Modify: `src/lib/runner/run-lifecycle.ts`
- Test: `src/lib/runner/__tests__/run-lifecycle.test.ts` (create if not exists, or add to existing runner tests)

### Step 1: Write the failing tests

The existing runner tests mock `completeRun`. For this task, we need **unit tests for `completeRun` itself** that verify Supabase receives the new fields.

Create `src/lib/runner/__tests__/run-lifecycle.test.ts`:

```typescript
/**
 * Tests for run lifecycle data access helpers.
 * @module lib/runner/__tests__/run-lifecycle
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolCallRecord } from "../extract-tool-calls";
import { completeRun } from "../run-lifecycle";

const mockUpdate = vi.fn();
const mockEq = vi.fn();

const mockSupabase = {
  from: vi.fn(() => ({
    update: mockUpdate.mockReturnValue({
      eq: mockEq.mockResolvedValue({ error: null }),
    }),
  })),
} as never;

describe("completeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({
      eq: mockEq.mockResolvedValue({ error: null }),
    });
  });

  it("passes tool_calls JSONB to Supabase update when provided", async () => {
    const toolCalls: ToolCallRecord[] = [
      {
        toolCallId: "call-1",
        toolName: "search_contacts",
        args: { query: "John" },
        result: { success: true, contacts: [], count: 0 },
      },
    ];

    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
      toolCalls,
      stepCount: 2,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.tool_calls).toEqual(toolCalls);
    expect(updateArg.step_count).toBe(2);
  });

  it("omits tool_calls and step_count when not provided", async () => {
    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty("tool_calls");
    expect(updateArg).not.toHaveProperty("step_count");
  });

  it("includes tool_calls as null-safe JSONB (empty array)", async () => {
    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
      toolCalls: [],
      stepCount: 1,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.tool_calls).toEqual([]);
    expect(updateArg.step_count).toBe(1);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
Expected: FAIL — completeRun does not accept toolCalls/stepCount (TypeScript error or missing fields)
```

### Step 3: Write minimal implementation

Modify `src/lib/runner/run-lifecycle.ts`:

1. Add import for `ToolCallRecord`:
```typescript
import type { ToolCallRecord } from "@/lib/runner/extract-tool-calls";
```

2. Extend `CompleteRunInput`:
```typescript
export interface CompleteRunInput {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Structured tool call log from extractToolCalls(). */
  toolCalls?: ToolCallRecord[];
  /** Number of LLM steps in this run. */
  stepCount?: number;
}
```

3. Update `completeRun` function body:
```typescript
export async function completeRun(
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, toolCalls, stepCount }: CompleteRunInput,
): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({
      status,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      completed_at: new Date().toISOString(),
      ...(toolCalls !== undefined && { tool_calls: toolCalls }),
      ...(stepCount !== undefined && { step_count: stepCount }),
    })
    .eq("run_id", runId);

  if (error) {
    throw new Error(`Failed to complete run: ${error.message}`);
  }
}
```

### Step 4: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
Expected: 3 tests PASS
```

### Step 5: Run existing runner tests to check for regressions

```bash
Run: npx vitest run src/lib/runner/__tests__/
Expected: All tests PASS (new fields are optional, existing callers unaffected)
```

### Step 6: Commit

```bash
git add src/lib/runner/run-lifecycle.ts src/lib/runner/__tests__/run-lifecycle.test.ts
git commit -m "feat(runner): extend completeRun with toolCalls and stepCount (SAFETY-03)"
```

---

## Task 4: Wire Tool Call Extraction into Runner `onFinish`

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

### Step 1: Write the failing tests

Add to `src/lib/runner/__tests__/run-agent.test.ts`:

1. Add a new mock for `extractToolCalls` in the `vi.hoisted` block:
```typescript
const {
  // ... existing mocks ...
  mockExtractToolCalls,
} = vi.hoisted(() => ({
  // ... existing mock factories ...
  mockExtractToolCalls: vi.fn(),
}));
```

2. Add the `vi.mock` for the extractor:
```typescript
vi.mock("@/lib/runner/extract-tool-calls", () => ({
  extractToolCalls: mockExtractToolCalls,
}));
```

3. In `beforeEach`, add mock return value:
```typescript
mockExtractToolCalls.mockReturnValue([
  { toolCallId: "call-1", toolName: "search_contacts", args: { query: "John" } },
]);
```

4. Add new test case:
```typescript
it("extracts tool calls from steps and passes to completeRun", async () => {
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
  const mockToolCalls = [
    {
      toolCallId: "call-1",
      toolName: "search_contacts",
      args: { query: "John" },
      result: { success: true, contacts: [], count: 0 },
    },
  ];
  mockExtractToolCalls.mockReturnValue(mockToolCalls);

  await runAgent(validPayload, "mock-supabase-client" as never);

  const streamCall = mockStreamText.mock.calls[0]?.[0];
  const mockSteps = [
    {
      toolCalls: [{ toolCallId: "call-1", toolName: "search_contacts", args: { query: "John" } }],
      toolResults: [{ toolCallId: "call-1", toolName: "search_contacts", result: { success: true, contacts: [], count: 0 } }],
    },
  ];

  await streamCall.onFinish({
    steps: mockSteps,
    totalUsage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    },
  });

  expect(mockExtractToolCalls).toHaveBeenCalledWith(mockSteps);
  expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
    runId: "run-1",
    status: "completed",
    model: "google/gemini-3-flash",
    tokensIn: 100,
    tokensOut: 50,
    toolCalls: mockToolCalls,
    stepCount: 1,
  });
});
```

5. Update the existing `onFinish` test to also pass `steps`:
```typescript
it("completes run and attempts queue drain when onFinish executes", async () => {
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });
  mockExtractToolCalls.mockReturnValue([]);

  await runAgent(validPayload, "mock-supabase-client" as never);

  const streamCall = mockStreamText.mock.calls[0]?.[0];
  expect(typeof streamCall.onFinish).toBe("function");

  await streamCall.onFinish({
    steps: [],
    totalUsage: {
      inputTokens: 100,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokens: 50,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      totalTokens: 150,
    },
  });

  expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
    runId: "run-1",
    status: "completed",
    model: "google/gemini-3-flash",
    tokensIn: 100,
    tokensOut: 50,
    toolCalls: [],
    stepCount: 0,
  });
  expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
    clientId: validPayload.clientId,
    threadId: validPayload.threadId,
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/__tests__/run-agent.test.ts
Expected: FAIL — onFinish does not destructure steps, completeRun not called with toolCalls
```

### Step 3: Write minimal implementation

Modify `src/lib/runner/run-agent.ts`:

1. Add import:
```typescript
import { extractToolCalls } from "@/lib/runner/extract-tool-calls";
```

2. Change `onFinish` to destructure `steps`:
```typescript
onFinish: async ({ steps, totalUsage }) => {
  const toolCalls = extractToolCalls(steps);
  await completeRun(supabase, {
    runId: lockResult.runId,
    status: "completed",
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
    toolCalls,
    stepCount: steps.length,
  });
  await drainAndContinue(supabase, { clientId, threadId });
},
```

### Step 4: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/runner/__tests__/run-agent.test.ts
Expected: All tests PASS
```

### Step 5: Run full runner test suite

```bash
Run: npx vitest run src/lib/runner/__tests__/
Expected: All tests PASS
```

### Step 6: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(runner): extract and persist tool calls in onFinish (SAFETY-03)"
```

---

## Task 5: `withErrorBoundary()` Tool Wrapper

**Files:**
- Create: `src/lib/runner/tools/with-error-boundary.ts`
- Test: `src/lib/runner/tools/__tests__/with-error-boundary.test.ts`

### Step 1: Write the failing tests

Create `src/lib/runner/tools/__tests__/with-error-boundary.test.ts`:

```typescript
/**
 * Tests for the tool error boundary wrapper.
 * @module lib/runner/tools/__tests__/with-error-boundary
 */
import { describe, expect, it } from "vitest";

import { withErrorBoundary } from "../with-error-boundary";

describe("withErrorBoundary", () => {
  it("returns original result when execute succeeds", async () => {
    const execute = async (args: { query: string }) => ({
      success: true as const,
      contacts: [{ name: "John" }],
      count: 1,
    });

    const wrapped = withErrorBoundary(execute);
    const result = await wrapped({ query: "John" });

    expect(result).toEqual({ success: true, contacts: [{ name: "John" }], count: 1 });
  });

  it("catches Error and returns structured failure", async () => {
    const execute = async () => {
      throw new Error("Supabase connection timeout");
    };

    const wrapped = withErrorBoundary(execute);
    const result = await wrapped({});

    expect(result).toEqual({ success: false, error: "Supabase connection timeout" });
  });

  it("catches non-Error thrown values", async () => {
    const execute = async () => {
      throw "unexpected string error";
    };

    const wrapped = withErrorBoundary(execute);
    const result = await wrapped({});

    expect(result).toEqual({ success: false, error: "unexpected string error" });
  });

  it("passes through tool-level failure results unchanged", async () => {
    const execute = async () => ({
      success: false as const,
      error: "Contact not found",
    });

    const wrapped = withErrorBoundary(execute);
    const result = await wrapped({});

    expect(result).toEqual({ success: false, error: "Contact not found" });
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/tools/__tests__/with-error-boundary.test.ts
Expected: FAIL — Cannot find module '../with-error-boundary'
```

### Step 3: Write minimal implementation

Create `src/lib/runner/tools/with-error-boundary.ts`:

```typescript
/**
 * Higher-order error boundary for tool execute functions.
 *
 * Wraps a tool's `execute` callback to catch unexpected thrown errors and return
 * a structured `{ success: false, error }` response. This prevents raw stack traces
 * from reaching the model and keeps all tool responses in a consistent shape.
 *
 * @module lib/runner/tools/with-error-boundary
 */

/**
 * Wraps a tool execute function with try-catch error handling.
 *
 * - On success: returns the original result unchanged.
 * - On thrown error: returns `{ success: false, error: message }`.
 *
 * This does NOT catch errors that tools return as structured responses
 * (e.g., `{ success: false, error: "..." }`). Those pass through unchanged
 * because they are intentional business-logic failures.
 */
export function withErrorBoundary<TArgs, TResult>(
  execute: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult | { success: false; error: string }> {
  return async (args: TArgs) => {
    try {
      return await execute(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false as const, error: message };
    }
  };
}
```

### Step 4: Run tests to verify they pass

```bash
Run: npx vitest run src/lib/runner/tools/__tests__/with-error-boundary.test.ts
Expected: 4 tests PASS
```

### Step 5: Commit

```bash
git add src/lib/runner/tools/with-error-boundary.ts src/lib/runner/tools/__tests__/with-error-boundary.test.ts
git commit -m "feat(tools): add withErrorBoundary wrapper for graceful tool errors (SAFETY-03)"
```

---

## Task 6: Apply Error Boundary to All Tool Factories

**Files:**
- Modify: `src/lib/runner/tools/crm/contacts.ts`
- Modify: `src/lib/runner/tools/crm/deals.ts`
- Modify: `src/lib/runner/tools/crm/interactions.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

The pattern is identical for all files. Each tool's `execute` callback gets wrapped with `withErrorBoundary`.

### Step 1: Add import to each tool file

Add to each of the 5 files listed above:

```typescript
import { withErrorBoundary } from "@/lib/runner/tools/with-error-boundary";
```

### Step 2: Wrap each tool's execute callback

**Pattern — before:**
```typescript
const search_contacts = tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  execute: async ({ query, type, limit }) => {
    // ... tool logic ...
  },
});
```

**Pattern — after:**
```typescript
const search_contacts = tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  execute: withErrorBoundary(async ({ query, type, limit }) => {
    // ... tool logic unchanged ...
  }),
});
```

Apply this transformation to every `tool()` call in:
- `contacts.ts` — 3 tools: `search_contacts`, `create_contact`, `update_contact`
- `deals.ts` — 3 tools: `search_deals`, `create_deal`, `update_deal`
- `interactions.ts` — 1 tool: `create_interaction`
- `tasks.ts` — 3 tools: `search_tasks`, `create_task`, `update_task`
- `storage/index.ts` — 2 tools: `read_file`, `write_file`

**Total: 12 execute callbacks wrapped.**

### Step 3: Run all tool tests to verify no regressions

```bash
Run: npx vitest run src/lib/runner/tools/
Expected: All existing tests PASS (the wrapper is transparent for non-throwing code)
```

### Step 4: Commit

```bash
git add src/lib/runner/tools/crm/contacts.ts src/lib/runner/tools/crm/deals.ts \
  src/lib/runner/tools/crm/interactions.ts src/lib/runner/tools/crm/tasks.ts \
  src/lib/runner/tools/storage/index.ts
git commit -m "feat(tools): wrap all tool execute functions with error boundary (SAFETY-03)"
```

---

## Task 7: Regenerate Types + Final Verification

**Files:**
- Modify: `src/types/database.ts` (regenerated)
- Modify: `docs/product/plans/2026-03-01-implementation-phasing-plan.json`

### Step 1: Regenerate Supabase TypeScript types

```bash
Run: npx supabase gen types typescript --local > src/types/database.ts
Expected: database.ts now includes tool_calls and step_count on the runs type
```

### Step 2: Verify new columns appear in types

Open `src/types/database.ts` and confirm the `runs` table type includes:
```typescript
runs: {
  Row: {
    // ... existing fields ...
    tool_calls: Json | null        // ← new
    step_count: number | null      // ← new
  }
  Insert: {
    // ... existing fields ...
    tool_calls?: Json | null       // ← new
    step_count?: number | null     // ← new
  }
  Update: {
    // ... existing fields ...
    tool_calls?: Json | null       // ← new
    step_count?: number | null     // ← new
  }
}
```

### Step 3: Run the full test suite

```bash
Run: npx vitest run
Expected: ALL tests pass — no regressions anywhere
```

### Step 4: Verify the audit trail works manually (smoke test)

If the dev server is running and connected to a local Supabase:

1. Open the chat UI, send a message that triggers a tool call (e.g., "Search for contacts named John")
2. After the response completes, query the `runs` table:
```sql
SELECT run_id, status, model, tokens_in, tokens_out, step_count, tool_calls
FROM runs
ORDER BY created_at DESC
LIMIT 1;
```
3. Confirm `tool_calls` contains a JSONB array with the tool call record(s)
4. Confirm `step_count` is a positive integer

### Step 5: Update implementation plan JSON

In `docs/product/plans/2026-03-01-implementation-phasing-plan.json`, set PR 12 status to `"in_progress"`:

```json
{
  "pr": 12,
  "title": "Audit trail + basic safety",
  "status": "in_progress",
  ...
}
```

### Step 6: Commit

```bash
git add src/types/database.ts docs/product/plans/2026-03-01-implementation-phasing-plan.json
git commit -m "chore: regenerate types for audit columns, mark PR 12 in_progress"
```

---

## Verification Checklist

Before marking PR 12 complete:

- [ ] Migration applied: `tool_calls JSONB` and `step_count INTEGER` on `runs`
- [ ] `extractToolCalls()` has 5 passing tests covering empty, single, multiple, and error cases
- [ ] `completeRun` accepts optional `toolCalls` and `stepCount` (3 tests)
- [ ] Runner `onFinish` destructures `steps`, calls extractor, passes results to `completeRun` (2 tests)
- [ ] `withErrorBoundary()` has 4 passing tests covering success, Error throw, string throw, passthrough
- [ ] All 12 tool execute functions wrapped with `withErrorBoundary`
- [ ] `database.ts` regenerated with new columns
- [ ] Full test suite passes (`npx vitest run`)
- [ ] Cost tracking verified: `model`, `tokens_in`, `tokens_out` still logged (existing from PR 4)
- [ ] Implementation plan JSON updated: PR 12 → `"in_progress"`

---

## Notes

- **SAFETY-03 implicit audit trail remains untouched:** Thread history (`conversation_messages` with `role='tool'`) still captures every tool call as messages. The `tool_calls` JSONB on `runs` is an *additional* queryable index, not a replacement.
- **AI SDK tool-error handling:** AI SDK v6 already catches thrown errors from tool `execute` and converts them to `tool-error` content parts the model can see. The `withErrorBoundary` wrapper adds a layer *before* the SDK, converting errors to structured `{ success: false, error }` responses for consistency with the CRM tool response format.
- **Cost tracking (PR12-3) is already complete:** `model`, `tokens_in`, and `tokens_out` are persisted in `completeRun` since PR 4. PR 12 adds `step_count` as a bonus metric for future model routing analytics (LLM-10 in Phase 2).
- **No approval enforcement in this PR:** Approval gates (SAFETY-01, SAFETY-02, SAFETY-04) are a separate runner-layer concern, not tool-level. They are Phase 4 work.
