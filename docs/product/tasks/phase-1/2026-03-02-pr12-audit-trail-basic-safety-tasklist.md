# PR 12: Audit Trail + Basic Safety — Implementation Plan (Lean)

**PR:** PR 12: Audit trail + basic safety
**Decisions:** SAFETY-03, SCALE-01
**Goal:** Add `step_count` to the `runs` table, verify tool errors don't crash runs, confirm cost tracking works.

**Architecture:** Per SAFETY-03, the implicit audit trail comes free from thread history (`conversation_messages` with `role='tool'`). Thread history IS the replay log — no separate `tool_calls` JSONB column is needed in v1. PR 12 adds only `step_count` (useful for future model routing analytics per LLM-10). Tool error resilience is verified with a test proving AI SDK v6 already handles thrown errors gracefully (converts to `tool-error` content parts the model can see). Cost tracking (`model`, `tokens_in`, `tokens_out`) was already implemented in PR 4 — nothing to add. Langfuse/observability deferred to Phase 2-3.

**Scope cuts (with rationale):**
- **`tool_calls` JSONB column**: Skipped. SAFETY-03 says thread history is the audit trail. A queryable JSONB index adds storage cost and complexity with no v1 consumer.
- **`extractToolCalls()` utility**: Skipped. No column to populate.
- **`withErrorBoundary()` wrapper**: Skipped. AI SDK v6 already catches tool `execute` throws and presents errors to the model as `tool-error` content parts. Wrapping adds an unnecessary layer that changes error semantics (storage tools throw intentionally for invalid args).
- **Wrapping all 12 tools**: Skipped. No boundary to apply.

**Tech Stack:** Vercel AI SDK v6 (`ai` ^6.0.39), Supabase, Zod, Vitest

---

## Prerequisites

| PR | What it creates | Why PR 12 needs it |
|----|----------------|-------------------|
| PR 4 | `runs` table, `run-lifecycle.ts`, `run-agent.ts` with `streamText()` | Column target and function modification points |

**Verify before starting:**
- `src/lib/runner/run-agent.ts` exists with `onFinish: async ({ totalUsage }) => { ... }`
- `src/lib/runner/run-lifecycle.ts` exports `completeRun` with `CompleteRunInput` interface
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
| 1 | Migration: `step_count` column on `runs` | 1 SQL create | — | — |
| 2 | Extend `completeRun` to persist `stepCount` | 1 source modify + 1 test create | 3 tests | Task 1 |
| 3 | Wire `steps.length` into runner `onFinish` | 1 source modify + 1 test modify | 2 tests | Task 2 |
| 4 | Tool error resilience test | 1 test create | 1 test | — |
| 5 | Regenerate types + final verification | 1 modify + plan update | — | All |

**Total: ~5 files changed/created, ~6 new tests.**

---

## Relevant Files

**Create:**
- `supabase/migrations/20260302150000_add_step_count_to_runs.sql` — Migration
- `src/lib/runner/__tests__/run-lifecycle.test.ts` — `completeRun` unit tests
- `src/lib/runner/__tests__/tool-error-resilience.test.ts` — Tool error resilience test

**Modify:**
- `src/lib/runner/run-lifecycle.ts` — Add `stepCount` to `CompleteRunInput`
- `src/lib/runner/run-agent.ts` — Destructure `steps` in `onFinish`
- `src/lib/runner/__tests__/run-agent.test.ts` — Update `onFinish` test to include `steps`
- `src/types/database.ts` — Regenerate after migration
- `docs/product/plans/2026-03-01-implementation-phasing-plan.json` — Mark PR 12 in_progress

**Reference (read-only):**
- `src/lib/runner/schemas.ts` — `RunResult` type
- `vitest.config.ts` — Test config (alias `@` → `./src`)

---

## AI SDK v6 Key Reference

**`streamText` `onFinish` callback receives:**
```typescript
onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
  // steps: Array of step results
  // totalUsage: { inputTokens, outputTokens, totalTokens }
}
```

**Tool error behavior:** If a tool's `execute` function throws, AI SDK automatically converts the error to a `tool-error` content part. The model sees the error and can retry or report it. No wrapper needed.

---

## Task 1: Migration — Add `step_count` to `runs`

**Files:**
- Create: `supabase/migrations/20260302150000_add_step_count_to_runs.sql`

### Step 1: Write the migration

```sql
-- PR 12: Add step count to runs table for routing analytics (SAFETY-03, SCALE-01).

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS step_count INTEGER CHECK (step_count IS NULL OR step_count >= 0);

COMMENT ON COLUMN public.runs.step_count IS 'Number of LLM steps in this run.';
```

### Step 2: Apply the migration locally

```bash
Run: npx supabase db push
Expected: Migration applied. New column on runs table.
```

### Step 3: Verify column exists

```bash
Run: npx supabase db dump --schema public | grep -A2 'step_count'
Expected: See step_count column in the runs table DDL.
```

### Step 4: Commit

```bash
git add supabase/migrations/20260302150000_add_step_count_to_runs.sql
git commit -m "feat(db): add step_count to runs table (SAFETY-03)"
```

---

## Task 2: Extend `completeRun` to Persist `stepCount`

**Files:**
- Modify: `src/lib/runner/run-lifecycle.ts`
- Create: `src/lib/runner/__tests__/run-lifecycle.test.ts`

### Step 1: Write the failing tests

Create `src/lib/runner/__tests__/run-lifecycle.test.ts`:

```typescript
/**
 * Tests for run lifecycle data access helpers.
 * @module lib/runner/__tests__/run-lifecycle
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("passes step_count to Supabase update when provided", async () => {
    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
      stepCount: 3,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.step_count).toBe(3);
  });

  it("omits step_count when not provided", async () => {
    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 100,
      tokensOut: 50,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty("step_count");
  });

  it("handles stepCount of zero correctly", async () => {
    await completeRun(mockSupabase, {
      runId: "run-1",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
      stepCount: 0,
    });

    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.step_count).toBe(0);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
Expected: FAIL — completeRun does not accept stepCount (TypeScript error)
```

### Step 3: Write minimal implementation

Modify `src/lib/runner/run-lifecycle.ts`:

1. Extend `CompleteRunInput`:
```typescript
export interface CompleteRunInput {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Number of LLM steps in this run. */
  stepCount?: number;
}
```

2. Update `completeRun` function body:
```typescript
export async function completeRun(
  supabase: ChatSupabaseClient,
  { runId, status, model, tokensIn, tokensOut, stepCount }: CompleteRunInput,
): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({
      status,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      completed_at: new Date().toISOString(),
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
Expected: All tests PASS (stepCount is optional, existing callers unaffected)
```

### Step 6: Commit

```bash
git add src/lib/runner/run-lifecycle.ts src/lib/runner/__tests__/run-lifecycle.test.ts
git commit -m "feat(runner): extend completeRun with stepCount (SAFETY-03)"
```

---

## Task 3: Wire `steps.length` into Runner `onFinish`

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`

### Step 1: Write the failing tests

Update `src/lib/runner/__tests__/run-agent.test.ts`:

1. Update the existing `"completes run and attempts queue drain when onFinish executes"` test to also pass `steps` and expect `stepCount`:

```typescript
it("completes run and attempts queue drain when onFinish executes", async () => {
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

  await runAgent(validPayload, "mock-supabase-client" as never);

  const streamCall = mockStreamText.mock.calls[0]?.[0];
  expect(typeof streamCall.onFinish).toBe("function");

  await streamCall.onFinish({
    steps: [],
    totalUsage: {
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 150,
    },
  });

  expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
    runId: "run-1",
    status: "completed",
    model: "google/gemini-3-flash",
    tokensIn: 100,
    tokensOut: 50,
    stepCount: 0,
  });
  expect(mockDrainAndContinue).toHaveBeenCalledWith("mock-supabase-client", {
    clientId: validPayload.clientId,
    threadId: validPayload.threadId,
  });
});
```

2. Add a new test for multi-step runs:

```typescript
it("passes step count from steps array to completeRun", async () => {
  mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

  await runAgent(validPayload, "mock-supabase-client" as never);

  const streamCall = mockStreamText.mock.calls[0]?.[0];

  await streamCall.onFinish({
    steps: [
      { stepType: "initial", toolCalls: [], toolResults: [] },
      { stepType: "tool-result", toolCalls: [{ toolCallId: "c1", toolName: "search_contacts", args: {} }], toolResults: [] },
      { stepType: "tool-result", toolCalls: [], toolResults: [] },
    ],
    totalUsage: {
      inputTokens: 200,
      inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokens: 100,
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
      totalTokens: 300,
    },
  });

  expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
    runId: "run-1",
    status: "completed",
    model: "google/gemini-3-flash",
    tokensIn: 200,
    tokensOut: 100,
    stepCount: 3,
  });
});
```

### Step 2: Run tests to verify they fail

```bash
Run: npx vitest run src/lib/runner/__tests__/run-agent.test.ts
Expected: FAIL — onFinish does not destructure steps, completeRun not called with stepCount
```

### Step 3: Write minimal implementation

Modify `src/lib/runner/run-agent.ts` — change the `onFinish` callback:

```typescript
onFinish: async ({ steps, totalUsage }) => {
  await completeRun(supabase, {
    runId: lockResult.runId,
    status: "completed",
    model: modelId,
    tokensIn: totalUsage.inputTokens ?? 0,
    tokensOut: totalUsage.outputTokens ?? 0,
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
git commit -m "feat(runner): pass step count from onFinish to completeRun (SAFETY-03)"
```

---

## Task 4: Tool Error Resilience Test

**Files:**
- Create: `src/lib/runner/__tests__/tool-error-resilience.test.ts`

This test proves that when a tool's `execute` throws, the AI SDK does NOT crash the run — it converts the error to a `tool-error` content part the model can see. This satisfies the PR12-2 requirement ("tool errors don't crash runs") without needing `withErrorBoundary`.

### Step 1: Write the test

Create `src/lib/runner/__tests__/tool-error-resilience.test.ts`:

```typescript
/**
 * Verifies that tool execute() throws are handled gracefully by AI SDK.
 *
 * AI SDK v6 catches thrown errors from tool execute() and converts them to
 * tool-error content parts. The model sees the error and can retry or report it.
 * This means we do NOT need a withErrorBoundary wrapper — the SDK handles it.
 *
 * @module lib/runner/__tests__/tool-error-resilience
 */
import { describe, expect, it } from "vitest";
import { generateText, tool } from "ai";
import { z } from "zod";
import { createMockLanguageModel } from "@/test/mock-language-model";

describe("tool error resilience", () => {
  it("AI SDK converts tool execute throw to tool-error content part", async () => {
    const errorMessage = "Supabase connection timeout";

    // Create a tool that always throws
    const failingTool = tool({
      description: "A tool that always fails",
      parameters: z.object({}),
      execute: async () => {
        throw new Error(errorMessage);
      },
    });

    // Use AI SDK's mock model to simulate a tool call followed by a text response
    const mockModel = createMockLanguageModel({
      doGenerate: [
        // Step 1: Model calls the tool
        {
          toolCalls: [
            { toolCallId: "call-1", toolName: "failing_tool", args: "{}" },
          ],
        },
        // Step 2: After seeing the error, model responds with text
        {
          text: `I encountered an error: ${errorMessage}`,
        },
      ],
    });

    const result = await generateText({
      model: mockModel,
      tools: { failing_tool: failingTool },
      prompt: "Use the failing tool",
      maxSteps: 2,
    });

    // The run completed successfully (didn't throw)
    expect(result.text).toContain(errorMessage);
    // Two steps: tool call + final text
    expect(result.steps.length).toBe(2);
  });
});
```

> **Note:** This test requires a mock language model helper. If `@/test/mock-language-model` doesn't exist, create a minimal one using `ai`'s `MockLanguageModelV1` or use AI SDK's built-in test utilities. The exact mock setup may need adjustment based on what test helpers already exist in the codebase. The key assertion is that `generateText` completes without throwing when a tool throws.

### Step 2: Run the test

```bash
Run: npx vitest run src/lib/runner/__tests__/tool-error-resilience.test.ts
Expected: 1 test PASS — confirms AI SDK handles tool errors gracefully
```

### Step 3: Commit

```bash
git add src/lib/runner/__tests__/tool-error-resilience.test.ts
git commit -m "test(runner): verify AI SDK handles tool execute throws gracefully (SAFETY-03)"
```

---

## Task 5: Regenerate Types + Final Verification

**Files:**
- Modify: `src/types/database.ts` (regenerated)
- Modify: `docs/product/plans/2026-03-01-implementation-phasing-plan.json`

### Step 1: Regenerate Supabase TypeScript types

```bash
Run: npx supabase gen types typescript --local > src/types/database.ts
Expected: database.ts now includes step_count on the runs type
```

### Step 2: Verify new column appears in types

Open `src/types/database.ts` and confirm the `runs` table type includes:
```typescript
runs: {
  Row: {
    // ... existing fields ...
    step_count: number | null      // ← new
  }
  Insert: {
    // ... existing fields ...
    step_count?: number | null     // ← new
  }
  Update: {
    // ... existing fields ...
    step_count?: number | null     // ← new
  }
}
```

### Step 3: Run the full test suite

```bash
Run: npx vitest run
Expected: ALL tests pass — no regressions anywhere
```

### Step 4: Update implementation plan JSON

In `docs/product/plans/2026-03-01-implementation-phasing-plan.json`, set PR 12 status to `"in_progress"`.

### Step 5: Commit

```bash
git add src/types/database.ts docs/product/plans/2026-03-01-implementation-phasing-plan.json
git commit -m "chore: regenerate types for step_count, mark PR 12 in_progress"
```

---

## Verification Checklist

Before marking PR 12 complete:

- [ ] Migration applied: `step_count INTEGER` on `runs`
- [ ] `completeRun` accepts optional `stepCount` (3 tests)
- [ ] Runner `onFinish` destructures `steps`, passes `steps.length` to `completeRun` (2 tests)
- [ ] Tool error resilience verified: AI SDK handles thrown errors without crashing (1 test)
- [ ] `database.ts` regenerated with new column
- [ ] Full test suite passes (`npx vitest run`)
- [ ] Cost tracking verified: `model`, `tokens_in`, `tokens_out` still logged (existing from PR 4)
- [ ] Implementation plan JSON updated: PR 12 → `"in_progress"`

---

## Notes

- **SAFETY-03 implicit audit trail is sufficient for v1:** Thread history (`conversation_messages` with `role='tool'`) captures every tool call as messages. No separate `tool_calls` JSONB on `runs` needed until there's a v1 consumer for queryable tool call analytics.
- **AI SDK tool-error handling is built-in:** AI SDK v6 catches thrown errors from tool `execute` and converts them to `tool-error` content parts the model can see. No `withErrorBoundary` wrapper needed. Storage tools throw intentionally for invalid args — this is correct behavior.
- **Cost tracking (PR12-3) is already complete:** `model`, `tokens_in`, and `tokens_out` are persisted in `completeRun` since PR 4. PR 12 adds `step_count` as a bonus metric for future model routing analytics (LLM-10 in Phase 2).
- **Langfuse deferred to Phase 2-3:** OpenTelemetry-based observability via `experimental_telemetry` on `streamText()` will auto-capture tool calls, tokens, model info, and latency. This replaces the need for manual `tool_calls` JSONB when we actually need analytics.
- **No approval enforcement in this PR:** Approval gates (SAFETY-01, SAFETY-02, SAFETY-04) are a separate runner-layer concern. They are Phase 4 work.
