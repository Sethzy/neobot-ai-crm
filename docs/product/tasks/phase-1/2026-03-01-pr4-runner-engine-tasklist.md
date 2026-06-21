# PR 4: Runner Engine (Core Loop) + Per-Thread Serialization — Implementation Plan

**Goal:** Replace the thin PR1 chat endpoint with a proper runner engine (`runAgent()`) that tracks runs in the DB, enforces one-run-per-thread serialization, queues concurrent messages, and drains the queue on run completion.

**Architecture:** A single `runAgent()` function is the only entry point for all model calls (interactive and trigger). It follows the stateless invocation model: load state from DB → assemble context → call `streamText()` with `maxSteps` → persist run results. Per-thread serialization uses an atomic DB insert with a NOT EXISTS check — if a run is already active on the thread, the inbound message is queued in `thread_queue_records`. On run completion, the runner drains the queue and starts the next run. No pause-and-resume: when the agent asks a question, the run completes; the user's reply starts a fresh run with full thread history.

**Tech Stack:** Vercel AI SDK v6 (`streamText`, `convertToModelMessages`), `@ai-sdk/gateway`, Supabase (Postgres + RLS), Zod 4, Vitest

**Prerequisites:** PRs 1-3 must be completed first. This PR assumes the following exist:
- `app/api/chat/route.ts` — PR1 streaming endpoint (will be refactored)
- `src/lib/ai/gateway.ts` — `gateway()` + `TIER_1_MODEL`
- `src/lib/ai/system-prompt.ts` — `SYSTEM_PROMPT`
- `src/lib/chat/schemas.ts` — Zod schemas for `clients`, `conversation_threads`, `conversation_messages`, `runs`
- `supabase/migrations/` — tables: `clients`, `conversation_threads`, `conversation_messages`, `runs`
- `src/lib/supabase/server.ts` — `createClient()` server-side Supabase client
- PR3 data access layer (thread/message/run queries)

**Architecture Decisions:**
- `RUNNER-01` — Single runner engine. All entry points feed into the same `runAgent()` function.
- `RUNNER-02` — Tool loop via AI SDK `streamText()` with `maxSteps` (Tier 1: 4-8). Entire loop runs inside one Vercel function invocation.
- `RUNNER-03` — Context assembly (skeleton): system prompt + thread message history. Full 7-layer assembly deferred to Phase 2.
- `RUNNER-05` — Stateless invocation. Every call loads fresh from DB.
- `SESSION-04` — No pause-and-resume. Question ends run. Reply starts new run with full history.
- `TOOL-01` — Strict tool contract types with Zod schemas. Empty tools array in this PR.
- `TRIG-06` — Per-thread run serialization. One active run per thread. DB-enforced. Queue for concurrent messages.

**App Spec Sections:** §6.1 (Runner Engine), §11.2 (Per-Thread Run Serialization), §11.3 (No Pause-and-Resume)

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

| Task | Component | TDD? | Depends On |
|------|-----------|------|------------|
| 1 | Runner Zod schemas (tool contract types + run payload) | Yes | — |
| 2 | thread_queue_records migration | Config (exception) | — |
| 3 | Context assembly function | Yes | Task 1 |
| 4 | Run lifecycle data access (create/complete/fail) | Yes | Task 1 |
| 5 | Thread queue data access (enqueue/drain/check) | Yes | Task 1, Task 2 |
| 6 | runAgent() core loop | Yes | Tasks 1, 3, 4 |
| 7 | Per-thread serialization (atomic lock) | Yes | Tasks 4, 5, 6 |
| 8 | Queue draining on run completion | Yes | Tasks 5, 6, 7 |
| 9 | Refactor /api/chat/route.ts to use runner | Yes | Tasks 6, 7, 8 |
| 10 | Stale run cleanup | Yes | Task 4 |

---

### Task 1: Runner Zod Schemas (Tool Contract Types + Run Payload)

**Files:**
- Create: `src/lib/runner/schemas.ts`
- Test: `src/lib/runner/__tests__/schemas.test.ts`
- Reference: `TOOL-01` (strict tool contracts), `RUNNER-01` (standardized payload)

**Context:** These schemas define the `RunnerPayload` (the input to `runAgent()`), the `ToolResultEnvelope` (normalized output for all tools — `{ success, data, error, source }`), and the `RunResult` (what `runAgent()` returns). The payload carries `clientId`, `threadId`, `triggerType`, and `input` — this is the standardized entry point per RUNNER-01. The `ToolResultEnvelope` matches TOOL-01's normalized envelope for external tools. All pure logic, no Supabase dependency.

**Step 1: Write failing tests for runner schemas**

```typescript
// src/lib/runner/__tests__/schemas.test.ts
/**
 * @fileoverview Tests for runner engine Zod schemas.
 */
import { describe, expect, test } from "vitest";
import {
  runnerPayloadSchema,
  toolResultEnvelopeSchema,
  runResultSchema,
  triggerTypeValues,
  type RunnerPayload,
  type ToolResultEnvelope,
  type RunResult,
} from "../schemas";

describe("triggerTypeValues", () => {
  test("contains all 4 trigger types", () => {
    expect(triggerTypeValues).toEqual(["chat", "webhook", "cron", "pulse"]);
  });
});

describe("runnerPayloadSchema", () => {
  test("validates a chat payload", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Hello, Sunder!",
    };
    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("validates a cron trigger payload", () => {
    const valid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "cron" as const,
      input: "Run daily deal review",
    };
    expect(runnerPayloadSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing clientId", () => {
    const invalid = {
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Hello",
    };
    expect(() => runnerPayloadSchema.parse(invalid)).toThrow();
  });

  test("rejects invalid triggerType", () => {
    const invalid = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "email",
      input: "Hello",
    };
    expect(() => runnerPayloadSchema.parse(invalid)).toThrow();
  });

  test("rejects non-UUID clientId", () => {
    const invalid = {
      clientId: "not-a-uuid",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      triggerType: "chat" as const,
      input: "Hello",
    };
    expect(() => runnerPayloadSchema.parse(invalid)).toThrow();
  });
});

describe("toolResultEnvelopeSchema", () => {
  test("validates a successful result", () => {
    const valid = {
      success: true,
      data: { contact_id: "abc123", name: "John" },
      error: null,
      source: "crm",
    };
    expect(toolResultEnvelopeSchema.parse(valid)).toEqual(valid);
  });

  test("validates a failed result", () => {
    const valid = {
      success: false,
      data: null,
      error: "Contact not found",
      source: "crm",
    };
    expect(toolResultEnvelopeSchema.parse(valid)).toEqual(valid);
  });

  test("rejects missing success field", () => {
    const invalid = {
      data: { name: "John" },
      error: null,
      source: "crm",
    };
    expect(() => toolResultEnvelopeSchema.parse(invalid)).toThrow();
  });
});

describe("runResultSchema", () => {
  test("validates a completed run result", () => {
    const valid = {
      runId: "550e8400-e29b-41d4-a716-446655440000",
      status: "completed" as const,
      model: "google/gemini-3-flash",
      tokensIn: 150,
      tokensOut: 200,
    };
    expect(runResultSchema.parse(valid)).toEqual(valid);
  });

  test("validates a failed run result", () => {
    const valid = {
      runId: "550e8400-e29b-41d4-a716-446655440000",
      status: "failed" as const,
      model: "google/gemini-3-flash",
      tokensIn: 50,
      tokensOut: 0,
    };
    expect(runResultSchema.parse(valid)).toEqual(valid);
  });

  test("rejects invalid status", () => {
    const invalid = {
      runId: "550e8400-e29b-41d4-a716-446655440000",
      status: "paused",
      model: "google/gemini-3-flash",
      tokensIn: 50,
      tokensOut: 0,
    };
    expect(() => runResultSchema.parse(invalid)).toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/schemas.test.ts
```

Expected: FAIL — `Cannot find module '../schemas'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/schemas.ts
/**
 * @fileoverview Zod schemas for the runner engine payload, tool contracts, and run results.
 * Covers: RunnerPayload (RUNNER-01), ToolResultEnvelope (TOOL-01), RunResult.
 * @module lib/runner/schemas
 */
import { z } from "zod/v4";

/** Trigger types that can invoke the runner (RUNNER-01) */
export const triggerTypeValues = ["chat", "webhook", "cron", "pulse"] as const;

/**
 * Standardized input to runAgent() — all entry points produce this shape.
 * Per RUNNER-01: single runner, standardized payload.
 */
export const runnerPayloadSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  input: z.string(),
});

export type RunnerPayload = z.infer<typeof runnerPayloadSchema>;

/**
 * Normalized output envelope for tool results (TOOL-01).
 * Internal tools use strict schemas; external tools wrap results in this envelope.
 */
export const toolResultEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.any().nullable(),
  error: z.string().nullable(),
  source: z.string(),
});

export type ToolResultEnvelope = z.infer<typeof toolResultEnvelopeSchema>;

/**
 * What runAgent() returns after a run completes.
 * Used by the API route to finalize the response.
 */
export const runResultSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["completed", "partial", "failed", "cancelled"]),
  model: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
});

export type RunResult = z.infer<typeof runResultSchema>;
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/schemas.test.ts
```

Expected: All 12 tests PASS

**Step 5: Commit**

```bash
git add src/lib/runner/schemas.ts src/lib/runner/__tests__/schemas.test.ts
git commit -m "feat(pr4): add runner Zod schemas for payload, tool envelope, run result"
```

---

### Task 2: thread_queue_records Migration

**Files:**
- Create: `supabase/migrations/20260301100000_create_thread_queue_records.sql`
- Reference: App Spec §11.2 (Per-Thread Run Serialization), `TRIG-06`

**Context:** SQL migration — TDD exception. This table stores messages that arrive while a run is active on the same thread. Each record has a `thread_id`, `client_id`, `content` (the user message text), and `created_at` for ordering during drain. RLS scoped by `client_id` using the same DATA-03 pattern from PR3. The runner drains this table after each run completes.

**Step 1: Create the migration file**

```sql
-- supabase/migrations/20260301100000_create_thread_queue_records.sql
-- PR4: Queue for messages arriving during an active run (TRIG-06).
-- Runner drains this table after each run completes.
-- See App Spec §11.2 for full queue design.

CREATE TABLE public.thread_queue_records (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for queue drain query: SELECT ... WHERE thread_id = $1 ORDER BY created_at
CREATE INDEX idx_thread_queue_records_thread_id ON public.thread_queue_records(thread_id, created_at);

COMMENT ON TABLE public.thread_queue_records IS 'Messages queued when a run is already active on the same thread (TRIG-06).';
COMMENT ON COLUMN public.thread_queue_records.content IS 'Raw user message text, batched into next run context on drain.';
```

**Step 2: Create RLS policy for thread_queue_records**

```sql
-- Append to the same migration file, or create a separate one:

-- RLS: client can only see/insert their own queue records (DATA-03 pattern)
ALTER TABLE public.thread_queue_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own queue records"
  ON public.thread_queue_records
  FOR SELECT
  USING (client_id = (SELECT c.client_id FROM public.clients c WHERE c.user_id = auth.uid()));

CREATE POLICY "Users can insert own queue records"
  ON public.thread_queue_records
  FOR INSERT
  WITH CHECK (client_id = (SELECT c.client_id FROM public.clients c WHERE c.user_id = auth.uid()));

CREATE POLICY "Users can delete own queue records"
  ON public.thread_queue_records
  FOR DELETE
  USING (client_id = (SELECT c.client_id FROM public.clients c WHERE c.user_id = auth.uid()));
```

**Step 3: Apply migration locally**

```bash
npx supabase migration up --local
```

Expected: Migration applied successfully. Table `thread_queue_records` exists.

**Step 4: Commit**

```bash
git add supabase/migrations/20260301100000_create_thread_queue_records.sql
git commit -m "feat(pr4): add thread_queue_records table for per-thread message queuing"
```

---

### Task 3: Context Assembly Function

**Files:**
- Create: `src/lib/runner/context.ts`
- Test: `src/lib/runner/__tests__/context.test.ts`
- Reference: `RUNNER-03` (context load order), `RUNNER-05` (stateless invocation)

**Context:** This is a **skeleton** of the full 7-layer context assembly. For PR4, we only assemble: system prompt (layer 0-1) + thread message history (layer 6) + current message (layer 7). Layers 2-5 (SOUL.md, USER.md, MEMORY.md, compaction) are deferred to Phase 2 PRs 13-15. The function takes a `threadId` and the current user message, queries `conversation_messages` from DB, and returns the assembled messages array in AI SDK `CoreMessage` format. It uses the Supabase client passed as a parameter (dependency injection for testability).

**Step 1: Write failing tests for context assembly**

```typescript
// src/lib/runner/__tests__/context.test.ts
/**
 * @fileoverview Tests for runner context assembly (skeleton — layers 0-1, 6, 7 only).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { assembleContext } from "../context";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

// Mock Supabase client
function createMockSupabase(messages: Array<{ role: string; content: string; parts: unknown }> = []) {
  const mockSelect = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockOrder = vi.fn().mockResolvedValue({ data: messages, error: null });

  return {
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      eq: vi.fn().mockReturnValue({
        order: mockOrder,
      }),
    }),
    _mocks: { mockSelect, mockEq, mockOrder },
  };
}

describe("assembleContext", () => {
  it("returns system prompt as the system field", async () => {
    const supabase = createMockSupabase();
    const result = await assembleContext({
      supabase: supabase as any,
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      currentMessage: "Hello!",
    });

    expect(result.system).toBe(SYSTEM_PROMPT);
  });

  it("returns empty messages array when thread has no history", async () => {
    const supabase = createMockSupabase([]);
    const result = await assembleContext({
      supabase: supabase as any,
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      currentMessage: "Hello!",
    });

    // Only the current user message
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toEqual({
      role: "user",
      content: "Hello!",
    });
  });

  it("includes thread history messages before current message", async () => {
    const history = [
      { role: "user", content: "Hi", parts: null },
      { role: "assistant", content: "Hello! How can I help?", parts: null },
    ];
    const supabase = createMockSupabase(history);

    const result = await assembleContext({
      supabase: supabase as any,
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      currentMessage: "Create a contact for John",
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toEqual({ role: "user", content: "Hi" });
    expect(result.messages[1]).toEqual({ role: "assistant", content: "Hello! How can I help?" });
    expect(result.messages[2]).toEqual({ role: "user", content: "Create a contact for John" });
  });

  it("queries conversation_messages table ordered by created_at asc", async () => {
    const supabase = createMockSupabase();
    await assembleContext({
      supabase: supabase as any,
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      currentMessage: "Hello!",
    });

    expect(supabase.from).toHaveBeenCalledWith("conversation_messages");
  });

  it("throws on Supabase query error", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "connection refused" },
          }),
        }),
      }),
    };

    await expect(
      assembleContext({
        supabase: supabase as any,
        threadId: "550e8400-e29b-41d4-a716-446655440000",
        currentMessage: "Hello!",
      })
    ).rejects.toThrow("Failed to load thread history: connection refused");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: FAIL — `Cannot find module '../context'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/context.ts
/**
 * @fileoverview Context assembly for the runner engine.
 * Skeleton for PR4: system prompt + thread history + current message.
 * Full 7-layer assembly (RUNNER-03) deferred to Phase 2 (PRs 13-15).
 * @module lib/runner/context
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreMessage } from "ai";

import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

interface AssembleContextParams {
  supabase: SupabaseClient;
  threadId: string;
  currentMessage: string;
}

interface AssembledContext {
  system: string;
  messages: CoreMessage[];
}

/**
 * Assembles the model context from DB state (RUNNER-05: stateless invocation).
 * PR4 skeleton layers: system prompt (0-1) + thread history (6) + current message (7).
 */
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
}: AssembleContextParams): Promise<AssembledContext> {
  // Layer 6: Thread message history (ordered oldest-first)
  const { data: history, error } = await supabase
    .from("conversation_messages")
    .select("role, content, parts")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load thread history: ${error.message}`);
  }

  const historyMessages: CoreMessage[] = (history ?? []).map(
    (msg: { role: string; content: string }) => ({
      role: msg.role as CoreMessage["role"],
      content: msg.content,
    })
  );

  // Layer 7: Current user message
  const currentMsg: CoreMessage = { role: "user", content: currentMessage };

  return {
    system: SYSTEM_PROMPT,
    messages: [...historyMessages, currentMsg],
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(pr4): add context assembly skeleton (system prompt + thread history)"
```

---

### Task 4: Run Lifecycle Data Access (Create / Complete / Fail)

**Files:**
- Create: `src/lib/runner/run-lifecycle.ts`
- Test: `src/lib/runner/__tests__/run-lifecycle.test.ts`
- Reference: `RUNNER-08` (run statuses), `TRIG-06` (atomic run insert)

**Context:** Three functions that manage a run's lifecycle in the `runs` table:
1. `createRun()` — Atomically creates a run with `status = 'running'` ONLY if no other run is active on that thread. Returns `{ created: true, runId }` or `{ created: false }`. This is the per-thread lock (TRIG-06).
2. `completeRun()` — Updates a run to a terminal status (`completed`, `partial`, `failed`, `cancelled`) and records `model`, `tokens_in`, `tokens_out`, `completed_at`.
3. `markStaleRunsFailed()` — Marks runs older than 15 minutes still in `running` status as `failed` (stale run cleanup per TRIG-06).

All three take a Supabase client as a parameter for testability.

**Step 1: Write failing tests for run lifecycle**

```typescript
// src/lib/runner/__tests__/run-lifecycle.test.ts
/**
 * @fileoverview Tests for run lifecycle data access (create, complete, mark stale).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRun, completeRun, markStaleRunsFailed } from "../run-lifecycle";

describe("createRun", () => {
  it("creates a run and returns runId when no active run exists", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: "770e8400-e29b-41d4-a716-446655440000",
      error: null,
    });
    const supabase = { rpc: mockRpc } as any;

    const result = await createRun(supabase, {
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      clientId: "660e8400-e29b-41d4-a716-446655440000",
    });

    expect(result).toEqual({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });
    expect(mockRpc).toHaveBeenCalledWith("create_run_if_idle", {
      p_thread_id: "550e8400-e29b-41d4-a716-446655440000",
      p_client_id: "660e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("returns created: false when an active run already exists", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const supabase = { rpc: mockRpc } as any;

    const result = await createRun(supabase, {
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      clientId: "660e8400-e29b-41d4-a716-446655440000",
    });

    expect(result).toEqual({ created: false });
  });

  it("throws on Supabase error", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });
    const supabase = { rpc: mockRpc } as any;

    await expect(
      createRun(supabase, {
        threadId: "550e8400-e29b-41d4-a716-446655440000",
        clientId: "660e8400-e29b-41d4-a716-446655440000",
      })
    ).rejects.toThrow("Failed to create run: connection refused");
  });
});

describe("completeRun", () => {
  it("updates the run to a terminal status with token counts", async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any;

    await completeRun(supabase, {
      runId: "770e8400-e29b-41d4-a716-446655440000",
      status: "completed",
      model: "google/gemini-3-flash",
      tokensIn: 150,
      tokensOut: 200,
    });

    expect(supabase.from).toHaveBeenCalledWith("runs");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        model: "google/gemini-3-flash",
        tokens_in: 150,
        tokens_out: 200,
      })
    );
    // completed_at should be set (any ISO string)
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.completed_at).toBeDefined();
    expect(mockEq).toHaveBeenCalledWith("run_id", "770e8400-e29b-41d4-a716-446655440000");
  });

  it("throws on Supabase error", async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any;

    await expect(
      completeRun(supabase, {
        runId: "770e8400-e29b-41d4-a716-446655440000",
        status: "failed",
        model: "google/gemini-3-flash",
        tokensIn: 50,
        tokensOut: 0,
      })
    ).rejects.toThrow("Failed to complete run: not found");
  });
});

describe("markStaleRunsFailed", () => {
  it("calls the stale run cleanup RPC", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const supabase = { rpc: mockRpc } as any;

    const count = await markStaleRunsFailed(supabase);

    expect(count).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith("mark_stale_runs_failed", {
      p_stale_minutes: 15,
    });
  });

  it("returns 0 when no stale runs exist", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    const supabase = { rpc: mockRpc } as any;

    const count = await markStaleRunsFailed(supabase);
    expect(count).toBe(0);
  });

  it("throws on Supabase error", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });
    const supabase = { rpc: mockRpc } as any;

    await expect(markStaleRunsFailed(supabase)).rejects.toThrow(
      "Failed to mark stale runs: function not found"
    );
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
```

Expected: FAIL — `Cannot find module '../run-lifecycle'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/run-lifecycle.ts
/**
 * @fileoverview Run lifecycle data access for the runner engine.
 * Manages creating, completing, and cleaning up runs in the `runs` table.
 * @module lib/runner/run-lifecycle
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface CreateRunParams {
  threadId: string;
  clientId: string;
}

type CreateRunResult =
  | { created: true; runId: string }
  | { created: false };

/**
 * Atomically creates a run ONLY if no other run is active on the thread (TRIG-06).
 * Uses a Postgres function for atomic check-and-insert.
 * Returns the new run_id if created, or { created: false } if thread is busy.
 */
export async function createRun(
  supabase: SupabaseClient,
  { threadId, clientId }: CreateRunParams
): Promise<CreateRunResult> {
  const { data, error } = await supabase.rpc("create_run_if_idle", {
    p_thread_id: threadId,
    p_client_id: clientId,
  });

  if (error) {
    throw new Error(`Failed to create run: ${error.message}`);
  }

  if (!data) {
    return { created: false };
  }

  return { created: true, runId: data as string };
}

interface CompleteRunParams {
  runId: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  model: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Updates a run to a terminal status with token counts and completion timestamp.
 * Called by the runner after streamText() finishes or on error.
 */
export async function completeRun(
  supabase: SupabaseClient,
  { runId, status, model, tokensIn, tokensOut }: CompleteRunParams
): Promise<void> {
  const { error } = await supabase
    .from("runs")
    .update({
      status,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      completed_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  if (error) {
    throw new Error(`Failed to complete run: ${error.message}`);
  }
}

/**
 * Marks runs older than 15 minutes still in 'running' status as 'failed' (TRIG-06).
 * Called periodically or before processing new messages.
 * Returns the count of cleaned-up runs.
 */
export async function markStaleRunsFailed(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc("mark_stale_runs_failed", {
    p_stale_minutes: 15,
  });

  if (error) {
    throw new Error(`Failed to mark stale runs: ${error.message}`);
  }

  return (data as number) ?? 0;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
```

Expected: All 8 tests PASS

**Step 5: Create the Postgres functions migration**

```sql
-- supabase/migrations/20260301100001_create_run_lifecycle_functions.sql
-- PR4: Postgres functions for atomic run creation and stale run cleanup.

-- Atomically creates a run only if no active run exists on the thread (TRIG-06).
-- Returns the new run_id, or NULL if thread is busy.
CREATE OR REPLACE FUNCTION public.create_run_if_idle(
  p_thread_id UUID,
  p_client_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  -- Check-and-insert in one atomic operation
  INSERT INTO public.runs (run_id, thread_id, client_id, status)
  SELECT gen_random_uuid(), p_thread_id, p_client_id, 'running'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.runs
    WHERE thread_id = p_thread_id AND status = 'running'
  )
  RETURNING run_id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

-- Marks runs stuck in 'running' for > N minutes as 'failed' (TRIG-06 stale cleanup).
-- Returns the count of cleaned-up runs.
CREATE OR REPLACE FUNCTION public.mark_stale_runs_failed(
  p_stale_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.runs
  SET status = 'failed', completed_at = now()
  WHERE status = 'running'
    AND created_at < now() - (p_stale_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
```

**Step 6: Apply migration locally**

```bash
npx supabase migration up --local
```

Expected: Functions created successfully.

**Step 7: Commit**

```bash
git add src/lib/runner/run-lifecycle.ts src/lib/runner/__tests__/run-lifecycle.test.ts supabase/migrations/20260301100001_create_run_lifecycle_functions.sql
git commit -m "feat(pr4): add run lifecycle (atomic create, complete, stale cleanup)"
```

---

### Task 5: Thread Queue Data Access (Enqueue / Drain / Check)

**Files:**
- Create: `src/lib/runner/thread-queue.ts`
- Test: `src/lib/runner/__tests__/thread-queue.test.ts`
- Reference: App Spec §11.2, `TRIG-06`

**Context:** Three functions for the per-thread message queue:
1. `enqueueMessage()` — Inserts a message into `thread_queue_records` when the thread is busy.
2. `drainQueue()` — Fetches all queued messages for a thread (ordered by `created_at`), deletes them, and returns the message contents. Called after run completion.
3. `hasQueuedMessages()` — Quick check if any messages are waiting.

All take a Supabase client as parameter. The drain operation reads-then-deletes in a transaction-safe way.

**Step 1: Write failing tests for thread queue**

```typescript
// src/lib/runner/__tests__/thread-queue.test.ts
/**
 * @fileoverview Tests for thread queue data access (enqueue, drain, check).
 */
import { describe, expect, it, vi } from "vitest";
import { enqueueMessage, drainQueue, hasQueuedMessages } from "../thread-queue";

describe("enqueueMessage", () => {
  it("inserts a record into thread_queue_records", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any;

    await enqueueMessage(supabase, {
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      clientId: "660e8400-e29b-41d4-a716-446655440000",
      content: "Follow up on this",
    });

    expect(supabase.from).toHaveBeenCalledWith("thread_queue_records");
    expect(mockInsert).toHaveBeenCalledWith({
      thread_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "660e8400-e29b-41d4-a716-446655440000",
      content: "Follow up on this",
    });
  });

  it("throws on Supabase error", async () => {
    const mockInsert = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any;

    await expect(
      enqueueMessage(supabase, {
        threadId: "550e8400-e29b-41d4-a716-446655440000",
        clientId: "660e8400-e29b-41d4-a716-446655440000",
        content: "test",
      })
    ).rejects.toThrow("Failed to enqueue message: insert failed");
  });
});

describe("drainQueue", () => {
  it("returns queued messages ordered by created_at and deletes them", async () => {
    const queuedMessages = [
      { queue_id: "q1", content: "First message", created_at: "2026-03-01T00:00:01Z" },
      { queue_id: "q2", content: "Second message", created_at: "2026-03-01T00:00:02Z" },
    ];

    const mockDelete = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockOrder = vi.fn().mockResolvedValue({
      data: queuedMessages,
      error: null,
    });

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "thread_queue_records") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: mockOrder,
              }),
            }),
            delete: mockDelete,
          };
        }
        return {};
      }),
    } as any;

    const result = await drainQueue(supabase, "550e8400-e29b-41d4-a716-446655440000");

    expect(result).toEqual(["First message", "Second message"]);
  });

  it("returns empty array when no messages queued", async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        }),
      }),
    } as any;

    const result = await drainQueue(supabase, "550e8400-e29b-41d4-a716-446655440000");
    expect(result).toEqual([]);
  });
});

describe("hasQueuedMessages", () => {
  it("returns true when queue has records", async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ queue_id: "q1" }],
      error: null,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: mockLimit,
          }),
        }),
      }),
    } as any;

    const result = await hasQueuedMessages(supabase, "550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe(true);
  });

  it("returns false when queue is empty", async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: mockLimit,
          }),
        }),
      }),
    } as any;

    const result = await hasQueuedMessages(supabase, "550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/thread-queue.test.ts
```

Expected: FAIL — `Cannot find module '../thread-queue'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/thread-queue.ts
/**
 * @fileoverview Thread queue data access for per-thread message serialization.
 * Messages are enqueued when a run is active; drained after run completion (TRIG-06).
 * @module lib/runner/thread-queue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface EnqueueParams {
  threadId: string;
  clientId: string;
  content: string;
}

/**
 * Inserts a message into the queue when the thread's run is busy.
 * The runner will drain these after the active run completes.
 */
export async function enqueueMessage(
  supabase: SupabaseClient,
  { threadId, clientId, content }: EnqueueParams
): Promise<void> {
  const { error } = await supabase.from("thread_queue_records").insert({
    thread_id: threadId,
    client_id: clientId,
    content,
  });

  if (error) {
    throw new Error(`Failed to enqueue message: ${error.message}`);
  }
}

/**
 * Fetches all queued messages for a thread, deletes them, and returns the contents.
 * Called after a run completes to check if follow-up messages arrived (TRIG-06 drain).
 * Returns message contents in chronological order.
 */
export async function drainQueue(
  supabase: SupabaseClient,
  threadId: string
): Promise<string[]> {
  // 1. Fetch queued messages ordered by arrival time
  const { data: records, error: selectError } = await supabase
    .from("thread_queue_records")
    .select("queue_id, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (selectError) {
    throw new Error(`Failed to drain queue: ${selectError.message}`);
  }

  if (!records || records.length === 0) {
    return [];
  }

  // 2. Delete the fetched records
  const queueIds = records.map((r: { queue_id: string }) => r.queue_id);
  const { error: deleteError } = await supabase
    .from("thread_queue_records")
    .delete()
    .in("queue_id", queueIds);

  if (deleteError) {
    throw new Error(`Failed to delete drained queue records: ${deleteError.message}`);
  }

  // 3. Return message contents in order
  return records.map((r: { content: string }) => r.content);
}

/**
 * Quick check whether any messages are waiting in the queue for a thread.
 */
export async function hasQueuedMessages(
  supabase: SupabaseClient,
  threadId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("thread_queue_records")
    .select("queue_id")
    .eq("thread_id", threadId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check queue: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/thread-queue.test.ts
```

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/lib/runner/thread-queue.ts src/lib/runner/__tests__/thread-queue.test.ts
git commit -m "feat(pr4): add thread queue data access (enqueue, drain, check)"
```

---

### Task 6: runAgent() Core Loop

**Files:**
- Create: `src/lib/runner/run-agent.ts`
- Test: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/ai/gateway.ts` (no changes needed yet — uses existing `TIER_1_MODEL`)
- Reference: `RUNNER-01` (single entry point), `RUNNER-02` (streamText + maxSteps), `RUNNER-05` (stateless)

**Context:** This is the core of PR4. `runAgent()` is a single function that:
1. Receives a `RunnerPayload` (validated by Zod).
2. Creates a Supabase client for auth-scoped DB access.
3. Calls `createRun()` to atomically claim the thread lock.
4. If lock fails, calls `enqueueMessage()` and returns `{ status: "queued" }`.
5. Calls `assembleContext()` to build the prompt.
6. Calls AI SDK `streamText()` with `maxSteps: 4`, empty tools array, and the assembled context.
7. On completion, calls `completeRun()` with token counts.
8. On failure, calls `completeRun()` with `status: "failed"`.
9. Returns the `streamText` result for the API route to stream to the client.

For PR4, the runner always uses `TIER_1_MODEL` (Gemini Flash). Model routing is deferred to PR16.

**Step 1: Write failing tests for runAgent()**

```typescript
// src/lib/runner/__tests__/run-agent.test.ts
/**
 * @fileoverview Tests for the runAgent() core loop.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockStreamText,
  mockCreateRun,
  mockCompleteRun,
  mockEnqueueMessage,
  mockAssembleContext,
  mockGateway,
  mockCreateClient,
} = vi.hoisted(() => {
  return {
    mockStreamText: vi.fn(),
    mockCreateRun: vi.fn(),
    mockCompleteRun: vi.fn(),
    mockEnqueueMessage: vi.fn(),
    mockAssembleContext: vi.fn(),
    mockGateway: vi.fn(() => "mock-model"),
    mockCreateClient: vi.fn(() => "mock-supabase-client"),
  };
});

vi.mock("ai", () => ({
  streamText: mockStreamText,
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));

vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: mockEnqueueMessage,
}));

vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
}));

import { runAgent } from "../run-agent";
import type { RunnerPayload } from "../schemas";

const validPayload: RunnerPayload = {
  clientId: "550e8400-e29b-41d4-a716-446655440000",
  threadId: "660e8400-e29b-41d4-a716-446655440000",
  triggerType: "chat",
  input: "Hello, Sunder!",
};

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssembleContext.mockResolvedValue({
      system: "You are NeoBot.",
      messages: [{ role: "user", content: "Hello, Sunder!" }],
    });
  });

  it("calls streamText when no active run exists", async () => {
    mockCreateRun.mockResolvedValue({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });

    const mockResult = {
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
    };
    mockStreamText.mockReturnValue(mockResult);

    const result = await runAgent(validPayload, "mock-supabase-client" as any);

    expect(result.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: "You are NeoBot.",
        messages: [{ role: "user", content: "Hello, Sunder!" }],
        maxSteps: 4,
        tools: {},
      })
    );
  });

  it("enqueues message and returns queued status when thread is busy", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(validPayload, "mock-supabase-client" as any);

    expect(result.status).toBe("queued");
    expect(mockEnqueueMessage).toHaveBeenCalledWith("mock-supabase-client", {
      threadId: validPayload.threadId,
      clientId: validPayload.clientId,
      content: validPayload.input,
    });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("passes assembled context to streamText", async () => {
    mockCreateRun.mockResolvedValue({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });
    mockAssembleContext.mockResolvedValue({
      system: "Custom system prompt",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "Hello, Sunder!" },
      ],
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 200, completionTokens: 100 }),
    });

    await runAgent(validPayload, "mock-supabase-client" as any);

    expect(mockAssembleContext).toHaveBeenCalledWith({
      supabase: "mock-supabase-client",
      threadId: validPayload.threadId,
      currentMessage: validPayload.input,
    });
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "Custom system prompt",
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello!" },
          { role: "user", content: "Hello, Sunder!" },
        ],
      })
    );
  });

  it("records run completion via onFinish callback", async () => {
    mockCreateRun.mockResolvedValue({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
    });

    await runAgent(validPayload, "mock-supabase-client" as any);

    // Verify onFinish callback was passed to streamText
    const streamTextCall = mockStreamText.mock.calls[0][0];
    expect(streamTextCall.onFinish).toBeDefined();
    expect(typeof streamTextCall.onFinish).toBe("function");
  });

  it("completes run as failed when streamText throws", async () => {
    mockCreateRun.mockResolvedValue({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });
    mockStreamText.mockImplementation(() => {
      throw new Error("Model API error");
    });

    await expect(runAgent(validPayload, "mock-supabase-client" as any)).rejects.toThrow(
      "Model API error"
    );

    expect(mockCompleteRun).toHaveBeenCalledWith("mock-supabase-client", {
      runId: "770e8400-e29b-41d4-a716-446655440000",
      status: "failed",
      model: "google/gemini-3-flash",
      tokensIn: 0,
      tokensOut: 0,
    });
  });

  it("uses gateway with TIER_1_MODEL", async () => {
    mockCreateRun.mockResolvedValue({
      created: true,
      runId: "770e8400-e29b-41d4-a716-446655440000",
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
    });

    await runAgent(validPayload, "mock-supabase-client" as any);

    expect(mockGateway).toHaveBeenCalledWith("google/gemini-3-flash");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: FAIL — `Cannot find module '../run-agent'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/run-agent.ts
/**
 * @fileoverview Core runner engine — single entry point for all model calls (RUNNER-01).
 * Stateless invocation: load state → build context → call model → persist run (RUNNER-05).
 * @module lib/runner/run-agent
 */
import { streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { gateway, TIER_1_MODEL } from "@/lib/ai/gateway";
import { assembleContext } from "@/lib/runner/context";
import { createRun, completeRun } from "@/lib/runner/run-lifecycle";
import { enqueueMessage } from "@/lib/runner/thread-queue";
import type { RunnerPayload } from "@/lib/runner/schemas";

/** Maximum tool-call loop steps for Tier 1 (RUNNER-02, LLM-05) */
const MAX_STEPS_TIER_1 = 4;

type RunAgentResult =
  | { status: "streaming"; streamResult: ReturnType<typeof streamText> }
  | { status: "queued" };

/**
 * Single orchestration entry point (RUNNER-01).
 * All channels (chat, webhook, cron, pulse) call this function.
 *
 * Flow:
 * 1. Attempt to claim thread lock via atomic run insert (TRIG-06)
 * 2. If busy → enqueue message, return { status: "queued" }
 * 3. If idle → assemble context, call streamText(), return stream
 * 4. On finish → completeRun() with token counts
 * 5. On error → completeRun() with status "failed"
 */
export async function runAgent(
  payload: RunnerPayload,
  supabase: SupabaseClient
): Promise<RunAgentResult> {
  const { clientId, threadId, input } = payload;

  // Step 1: Attempt to claim thread lock (TRIG-06)
  const lockResult = await createRun(supabase, { threadId, clientId });

  if (!lockResult.created) {
    // Thread is busy — queue the message for later
    await enqueueMessage(supabase, { threadId, clientId, content: input });
    return { status: "queued" };
  }

  const { runId } = lockResult;
  const modelId = TIER_1_MODEL;

  try {
    // Step 2: Assemble context from DB (RUNNER-05: stateless)
    const { system, messages } = await assembleContext({
      supabase,
      threadId,
      currentMessage: input,
    });

    // Step 3: Call model via AI SDK (RUNNER-02: streamText + maxSteps)
    const result = streamText({
      model: gateway(modelId),
      system,
      messages,
      maxSteps: MAX_STEPS_TIER_1,
      tools: {},
      onFinish: async ({ usage }) => {
        // Step 4: Record run completion with token counts
        await completeRun(supabase, {
          runId,
          status: "completed",
          model: modelId,
          tokensIn: usage.promptTokens,
          tokensOut: usage.completionTokens,
        });
      },
    });

    return { status: "streaming", streamResult: result };
  } catch (error) {
    // Step 5: Record run failure
    await completeRun(supabase, {
      runId,
      status: "failed",
      model: modelId,
      tokensIn: 0,
      tokensOut: 0,
    });
    throw error;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/run-agent.test.ts
git commit -m "feat(pr4): add runAgent() core loop with streamText and thread lock"
```

---

### Task 7: Per-Thread Serialization (Atomic Lock Integration Test)

**Files:**
- Create: `src/lib/runner/__tests__/serialization.test.ts`
- Reference: `TRIG-06`, App Spec §11.2

**Context:** Integration-style tests (still with mocked Supabase) that verify the full serialization flow: first message claims the lock and streams; second message on the same thread gets queued; different thread can run concurrently. These tests exercise the `runAgent()` function end-to-end with different `createRun` outcomes.

**Step 1: Write failing tests for serialization behavior**

```typescript
// src/lib/runner/__tests__/serialization.test.ts
/**
 * @fileoverview Tests verifying per-thread run serialization (TRIG-06).
 * Ensures: one run per thread, queuing on busy, different threads independent.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockStreamText,
  mockCreateRun,
  mockCompleteRun,
  mockEnqueueMessage,
  mockAssembleContext,
  mockGateway,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockGateway: vi.fn(() => "mock-model"),
}));

vi.mock("ai", () => ({ streamText: mockStreamText }));
vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
}));
vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: mockEnqueueMessage,
}));
vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
}));

import { runAgent } from "../run-agent";

const THREAD_A = "aaa00000-0000-0000-0000-000000000000";
const THREAD_B = "bbb00000-0000-0000-0000-000000000000";
const CLIENT = "ccc00000-0000-0000-0000-000000000000";

describe("per-thread serialization (TRIG-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssembleContext.mockResolvedValue({
      system: "prompt",
      messages: [{ role: "user", content: "test" }],
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
    });
  });

  it("first message on a thread starts a run (streaming)", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Hello" },
      "supabase" as any
    );

    expect(result.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMessage).not.toHaveBeenCalled();
  });

  it("second message on busy thread gets queued", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Follow up" },
      "supabase" as any
    );

    expect(result.status).toBe("queued");
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD_A,
      clientId: CLIENT,
      content: "Follow up",
    });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("different thread can run concurrently", async () => {
    // Both threads are idle
    mockCreateRun
      .mockResolvedValueOnce({ created: true, runId: "run-a" })
      .mockResolvedValueOnce({ created: true, runId: "run-b" });

    const resultA = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Thread A" },
      "supabase" as any
    );
    const resultB = await runAgent(
      { clientId: CLIENT, threadId: THREAD_B, triggerType: "chat", input: "Thread B" },
      "supabase" as any
    );

    expect(resultA.status).toBe("streaming");
    expect(resultB.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run tests to verify they pass**

These tests use the same mocking pattern as Task 6 and exercise already-implemented code. They should pass immediately since the code is already written.

```bash
npx vitest run src/lib/runner/__tests__/serialization.test.ts
```

Expected: All 3 tests PASS (these are behavioral integration tests over already-implemented code)

**Step 3: Commit**

```bash
git add src/lib/runner/__tests__/serialization.test.ts
git commit -m "test(pr4): add per-thread serialization integration tests"
```

---

### Task 8: Queue Draining on Run Completion

**Files:**
- Create: `src/lib/runner/drain-and-continue.ts`
- Test: `src/lib/runner/__tests__/drain-and-continue.test.ts`
- Reference: App Spec §11.2 (queue drain pattern)

**Context:** After a run completes, the runner must check for queued messages and start a new run if any exist. `drainAndContinue()` is called by the `onFinish` callback of `streamText()`. It:
1. Calls `drainQueue()` to fetch and delete queued messages.
2. If messages exist, batches them into a single context block: `"Messages received while processing:\n1. First msg\n2. Second msg"`.
3. Calls `runAgent()` with the batched input to start the next run.
4. If no messages, does nothing (run is complete).

The key design: this function calls `runAgent()` recursively — each new run will itself drain on completion, creating a chain until the queue is empty.

**Step 1: Write failing tests for drain-and-continue**

```typescript
// src/lib/runner/__tests__/drain-and-continue.test.ts
/**
 * @fileoverview Tests for queue drain-and-continue after run completion.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockDrainQueue, mockRunAgent } = vi.hoisted(() => ({
  mockDrainQueue: vi.fn(),
  mockRunAgent: vi.fn(),
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  drainQueue: mockDrainQueue,
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

import { drainAndContinue } from "../drain-and-continue";

const CLIENT = "ccc00000-0000-0000-0000-000000000000";
const THREAD = "ttt00000-0000-0000-0000-000000000000";

describe("drainAndContinue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when queue is empty", async () => {
    mockDrainQueue.mockResolvedValue([]);

    await drainAndContinue("supabase" as any, { clientId: CLIENT, threadId: THREAD });

    expect(mockDrainQueue).toHaveBeenCalledWith("supabase", THREAD);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("starts a new run with batched messages when queue has items", async () => {
    mockDrainQueue.mockResolvedValue(["First question", "Second question"]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as any, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Messages received while processing:\n1. First question\n2. Second question",
      },
      "supabase"
    );
  });

  it("starts a new run with single message (no numbering)", async () => {
    mockDrainQueue.mockResolvedValue(["Only message"]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as any, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Only message",
      },
      "supabase"
    );
  });

  it("does not throw if drain-triggered run gets queued", async () => {
    mockDrainQueue.mockResolvedValue(["Follow up"]);
    mockRunAgent.mockResolvedValue({ status: "queued" });

    // Should not throw — queued status is acceptable (another run beat us)
    await expect(
      drainAndContinue("supabase" as any, { clientId: CLIENT, threadId: THREAD })
    ).resolves.not.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/drain-and-continue.test.ts
```

Expected: FAIL — `Cannot find module '../drain-and-continue'`

**Step 3: Write minimal implementation**

```typescript
// src/lib/runner/drain-and-continue.ts
/**
 * @fileoverview Queue drain logic — checks for queued messages after run completion
 * and starts a follow-up run if any exist (TRIG-06, App Spec §11.2).
 * @module lib/runner/drain-and-continue
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { drainQueue } from "@/lib/runner/thread-queue";
import { runAgent } from "@/lib/runner/run-agent";

interface DrainParams {
  clientId: string;
  threadId: string;
}

/**
 * After a run completes, drains the thread queue and starts a follow-up run if needed.
 * If multiple messages were queued, they are batched into one input block.
 * Uses last message as reply anchor (Dorabot pattern).
 */
export async function drainAndContinue(
  supabase: SupabaseClient,
  { clientId, threadId }: DrainParams
): Promise<void> {
  const messages = await drainQueue(supabase, threadId);

  if (messages.length === 0) {
    return;
  }

  // Batch queued messages into a single input
  const input =
    messages.length === 1
      ? messages[0]
      : `Messages received while processing:\n${messages.map((m, i) => `${i + 1}. ${m}`).join("\n")}`;

  // Start the next run (will itself drain on completion — recursive chain)
  await runAgent(
    { clientId, threadId, triggerType: "chat", input },
    supabase
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/drain-and-continue.test.ts
```

Expected: All 4 tests PASS

**Step 5: Wire drainAndContinue into runAgent's onFinish**

Now update `src/lib/runner/run-agent.ts` to call `drainAndContinue()` after the run completes. This is the integration step.

Update the `onFinish` callback in `run-agent.ts`:

```typescript
// In src/lib/runner/run-agent.ts, add import at top:
import { drainAndContinue } from "@/lib/runner/drain-and-continue";

// Update the onFinish callback inside streamText():
onFinish: async ({ usage }) => {
  await completeRun(supabase, {
    runId,
    status: "completed",
    model: modelId,
    tokensIn: usage.promptTokens,
    tokensOut: usage.completionTokens,
  });
  // Drain queue and start follow-up run if messages arrived during this run
  await drainAndContinue(supabase, { clientId, threadId });
},
```

**Step 6: Run all runner tests to verify nothing broke**

```bash
npx vitest run src/lib/runner/
```

Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/lib/runner/drain-and-continue.ts src/lib/runner/__tests__/drain-and-continue.test.ts src/lib/runner/run-agent.ts
git commit -m "feat(pr4): add queue drain-and-continue with recursive follow-up runs"
```

---

### Task 9: Refactor /api/chat/route.ts to Use Runner

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`
- Reference: `RUNNER-01` (single entry point), PR4-11

**Context:** The PR1 chat endpoint currently calls `streamText()` directly. This task refactors it to:
1. Authenticate the request via Supabase (get the user's `client_id`).
2. Extract `threadId` from the request body.
3. Build a `RunnerPayload` and call `runAgent()`.
4. If `runAgent()` returns `{ status: "streaming" }`, stream the response.
5. If `runAgent()` returns `{ status: "queued" }`, return a 202 JSON response.

The existing tests must be rewritten to test the new flow. The old tests for direct `streamText()` calls become obsolete.

**Step 1: Write failing tests for the refactored route**

```typescript
// src/lib/ai/__tests__/chat-route.test.ts
/**
 * @fileoverview Tests for the refactored /api/chat route (PR4 — uses runner engine).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent, mockCreateClient } = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

import { POST } from "../../../../app/api/chat/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat (runner-backed)", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn(),
        }),
      }),
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-key";
    mockCreateClient.mockResolvedValue(mockSupabase);

    // Default: authenticated user with client_id
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { client_id: "client-456" },
            error: null,
          }),
        }),
      }),
    });
  });

  it("calls runAgent with correct payload and returns stream", async () => {
    const mockStreamResult = {
      toUIMessageStreamResponse: vi.fn(
        () => new Response("streamed", { headers: { "Content-Type": "text/event-stream" } })
      ),
    };
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: mockStreamResult,
    });

    const response = await POST(
      createJsonRequest({
        threadId: "thread-789",
        message: "Hello, Sunder!",
      })
    );

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "client-456",
        threadId: "thread-789",
        triggerType: "chat",
        input: "Hello, Sunder!",
      },
      mockSupabase
    );
    expect(response).toBeInstanceOf(Response);
    expect(mockStreamResult.toUIMessageStreamResponse).toHaveBeenCalled();
  });

  it("returns 202 when message is queued", async () => {
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const response = await POST(
      createJsonRequest({
        threadId: "thread-789",
        message: "Follow up",
      })
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ status: "queued" });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const response = await POST(
      createJsonRequest({
        threadId: "thread-789",
        message: "Hello",
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when threadId is missing", async () => {
    const response = await POST(
      createJsonRequest({ message: "Hello" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("threadId");
  });

  it("returns 400 when message is missing", async () => {
    const response = await POST(
      createJsonRequest({ threadId: "thread-789" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("message");
  });

  it("returns 500 when AI_GATEWAY_API_KEY is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;

    const response = await POST(
      createJsonRequest({
        threadId: "thread-789",
        message: "Hello",
      })
    );

    expect(response.status).toBe(500);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: FAIL — tests expect new behavior but route still has old PR1 code.

**Step 3: Write the refactored route**

```typescript
// app/api/chat/route.ts
/**
 * @fileoverview Chat API endpoint — delegates to the runner engine (RUNNER-01).
 * Authenticates user, resolves client_id, calls runAgent().
 * Returns streaming response or 202 if message was queued (TRIG-06).
 */
import { createClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/runner/run-agent";

/** Allows streaming responses up to 60s on Vercel Fluid Compute. */
export const maxDuration = 60;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return jsonError("Server misconfiguration: AI_GATEWAY_API_KEY is required.", 500);
  }

  // Parse request body
  let body: { threadId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON payload.", 400);
  }

  if (!body.threadId || typeof body.threadId !== "string") {
    return jsonError("Invalid request body: threadId is required.", 400);
  }
  if (!body.message || typeof body.message !== "string") {
    return jsonError("Invalid request body: message is required.", 400);
  }

  // Authenticate and resolve client_id
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Unauthorized.", 401);
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("client_id")
    .eq("user_id", user.id)
    .single();

  if (clientError || !client) {
    return jsonError("Client not found.", 404);
  }

  // Delegate to runner engine
  const result = await runAgent(
    {
      clientId: client.client_id,
      threadId: body.threadId,
      triggerType: "chat",
      input: body.message,
    },
    supabase
  );

  if (result.status === "queued") {
    return Response.json({ status: "queued" }, { status: 202 });
  }

  // Stream the response to the client
  return result.streamResult.toUIMessageStreamResponse();
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: All 6 tests PASS

**Step 5: Run ALL runner tests to verify nothing broke**

```bash
npx vitest run src/lib/runner/ src/lib/ai/__tests__/chat-route.test.ts
```

Expected: All tests PASS across both directories.

**Step 6: Commit**

```bash
git add app/api/chat/route.ts src/lib/ai/__tests__/chat-route.test.ts
git commit -m "feat(pr4): refactor /api/chat to use runner engine with auth and queuing"
```

---

### Task 10: Stale Run Cleanup

**Files:**
- Create: `src/lib/runner/__tests__/stale-cleanup.test.ts`
- Modify: `src/lib/runner/run-agent.ts` (add stale cleanup before run creation)
- Reference: `TRIG-06` (stale run cleanup: >15 min running → mark failed)

**Context:** Before attempting to create a new run, the runner should clean up stale runs that might be holding the thread lock due to a crashed/timed-out Vercel function. This prevents permanent thread deadlocks. `markStaleRunsFailed()` was already implemented in Task 4 — this task wires it into the `runAgent()` flow and adds a targeted test.

**Step 1: Write failing test for stale cleanup integration**

```typescript
// src/lib/runner/__tests__/stale-cleanup.test.ts
/**
 * @fileoverview Tests that stale run cleanup runs before lock acquisition.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockStreamText,
  mockCreateRun,
  mockCompleteRun,
  mockEnqueueMessage,
  mockAssembleContext,
  mockGateway,
  mockMarkStaleRunsFailed,
  mockDrainAndContinue,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockAssembleContext: vi.fn(),
  mockGateway: vi.fn(() => "mock-model"),
  mockMarkStaleRunsFailed: vi.fn(),
  mockDrainAndContinue: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: mockStreamText }));
vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
  markStaleRunsFailed: mockMarkStaleRunsFailed,
}));
vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: mockEnqueueMessage,
}));
vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
}));
vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
}));

import { runAgent } from "../run-agent";

describe("stale run cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssembleContext.mockResolvedValue({
      system: "prompt",
      messages: [{ role: "user", content: "test" }],
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
      usage: Promise.resolve({ promptTokens: 100, completionTokens: 50 }),
    });
  });

  it("calls markStaleRunsFailed before attempting to create a run", async () => {
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const callOrder: string[] = [];
    mockMarkStaleRunsFailed.mockImplementation(async () => {
      callOrder.push("markStale");
      return 0;
    });
    mockCreateRun.mockImplementation(async () => {
      callOrder.push("createRun");
      return { created: true, runId: "run-1" };
    });

    await runAgent(
      {
        clientId: "ccc00000-0000-0000-0000-000000000000",
        threadId: "ttt00000-0000-0000-0000-000000000000",
        triggerType: "chat",
        input: "Hello",
      },
      "supabase" as any
    );

    expect(callOrder).toEqual(["markStale", "createRun"]);
    expect(mockMarkStaleRunsFailed).toHaveBeenCalledWith("supabase");
  });

  it("still creates run even if stale cleanup finds nothing", async () => {
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const result = await runAgent(
      {
        clientId: "ccc00000-0000-0000-0000-000000000000",
        threadId: "ttt00000-0000-0000-0000-000000000000",
        triggerType: "chat",
        input: "Hello",
      },
      "supabase" as any
    );

    expect(result.status).toBe("streaming");
  });

  it("proceeds normally after cleaning up stale runs", async () => {
    mockMarkStaleRunsFailed.mockResolvedValue(2); // 2 stale runs cleaned
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-1" });

    const result = await runAgent(
      {
        clientId: "ccc00000-0000-0000-0000-000000000000",
        threadId: "ttt00000-0000-0000-0000-000000000000",
        triggerType: "chat",
        input: "Hello",
      },
      "supabase" as any
    );

    expect(result.status).toBe("streaming");
    expect(mockMarkStaleRunsFailed).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/__tests__/stale-cleanup.test.ts
```

Expected: FAIL — `markStaleRunsFailed` is not called by `runAgent()` yet.

**Step 3: Update runAgent() to call stale cleanup before lock acquisition**

In `src/lib/runner/run-agent.ts`, add the import and call:

```typescript
// Add to imports:
import { createRun, completeRun, markStaleRunsFailed } from "@/lib/runner/run-lifecycle";

// Add before the createRun() call in runAgent():
export async function runAgent(
  payload: RunnerPayload,
  supabase: SupabaseClient
): Promise<RunAgentResult> {
  const { clientId, threadId, input } = payload;

  // Step 0: Clean up stale runs that might be holding thread locks (TRIG-06)
  await markStaleRunsFailed(supabase);

  // Step 1: Attempt to claim thread lock (TRIG-06)
  const lockResult = await createRun(supabase, { threadId, clientId });
  // ... rest unchanged
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/__tests__/stale-cleanup.test.ts
```

Expected: All 3 tests PASS

**Step 5: Run the full test suite**

```bash
npx vitest run src/lib/runner/ src/lib/ai/__tests__/chat-route.test.ts
```

Expected: All tests PASS across both directories.

**Step 6: Commit**

```bash
git add src/lib/runner/run-agent.ts src/lib/runner/__tests__/stale-cleanup.test.ts
git commit -m "feat(pr4): wire stale run cleanup into runner before lock acquisition"
```

---

## Barrel Export (Housekeeping)

After all tasks are complete, create a barrel export for the runner module:

**File:** `src/lib/runner/index.ts`

```typescript
// src/lib/runner/index.ts
/**
 * @fileoverview Public API for the runner engine module.
 * @module lib/runner
 */
export { runAgent } from "./run-agent";
export { drainAndContinue } from "./drain-and-continue";
export type { RunnerPayload, ToolResultEnvelope, RunResult } from "./schemas";
```

```bash
git add src/lib/runner/index.ts
git commit -m "chore(pr4): add runner module barrel export"
```

---

## Final Verification

Run the complete test suite to confirm nothing is broken:

```bash
npx vitest run
```

Expected: All tests PASS.

---

## Files Summary

| Action | File |
|--------|------|
| Create | `src/lib/runner/schemas.ts` |
| Create | `src/lib/runner/__tests__/schemas.test.ts` |
| Create | `supabase/migrations/20260301100000_create_thread_queue_records.sql` |
| Create | `supabase/migrations/20260301100001_create_run_lifecycle_functions.sql` |
| Create | `src/lib/runner/context.ts` |
| Create | `src/lib/runner/__tests__/context.test.ts` |
| Create | `src/lib/runner/run-lifecycle.ts` |
| Create | `src/lib/runner/__tests__/run-lifecycle.test.ts` |
| Create | `src/lib/runner/thread-queue.ts` |
| Create | `src/lib/runner/__tests__/thread-queue.test.ts` |
| Create | `src/lib/runner/run-agent.ts` |
| Create | `src/lib/runner/__tests__/run-agent.test.ts` |
| Create | `src/lib/runner/__tests__/serialization.test.ts` |
| Create | `src/lib/runner/drain-and-continue.ts` |
| Create | `src/lib/runner/__tests__/drain-and-continue.test.ts` |
| Create | `src/lib/runner/__tests__/stale-cleanup.test.ts` |
| Create | `src/lib/runner/index.ts` |
| Modify | `app/api/chat/route.ts` |
| Modify | `src/lib/ai/__tests__/chat-route.test.ts` |

---

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-03-01-pr4-runner-engine-tasklist.md`. Open a new session and use `/1-executing-plans` to do batch execution with checkpoints.
