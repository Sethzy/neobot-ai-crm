# PR 18: Cron Scanner + agent_triggers Table

**PR:** PR 18: Cron scanner + agent_triggers table
**Decisions:** TRIG-01, TRIG-02, TRIG-04, TRIG-05, TRIG-06
**Goal:** Create the `agent_triggers` table, a Vercel cron scanner at `/api/cron/scan` (1-min interval), and a trigger execution endpoint at `/api/trigger/run`. Triggers claimed atomically via `UPDATE...RETURNING` to prevent double-dispatch. Trigger runs reuse the existing runner engine with per-thread serialization.

**Architecture:** Vercel cron hits `/api/cron/scan` every 1 minute. The scanner queries `agent_triggers` for rows where `next_fire_at <= NOW()` and `current_run_id IS NULL` and `enabled = true`. It atomically claims each row by setting `current_run_id` via an RPC (`claim_due_triggers`), then dispatches each claimed trigger to `/api/trigger/run`. The execution route validates the claim, inserts a trigger-event system message into the thread, and calls `runAgent()` with `triggerType: "cron"`. On completion, the claim is released (`current_run_id = NULL`). A stale-claim reaper (15-min threshold) runs inside the same scanner tick. Per-thread serialization is enforced by the existing `create_run_if_idle` mechanism — if a thread is busy, the trigger event is enqueued via `thread_queue_records` (TRIG-06).

**Tech Stack:** Supabase (Postgres + RLS), Vercel AI SDK v6, Vercel Cron, Vitest, Zod 4

**Prerequisite:** PR 15 (utility tools + context assembly) should be merged or close to merge. The runner engine, thread queue, and run lifecycle from earlier PRs are required.

---

## Relevant Files

### Create
- `supabase/migrations/20260306010000_create_agent_triggers.sql`
- `supabase/migrations/20260306010001_create_trigger_rpc_functions.sql`
- `src/lib/triggers/schemas.ts`
- `src/lib/triggers/__tests__/schemas.test.ts`
- `src/lib/triggers/scanner.ts`
- `src/lib/triggers/__tests__/scanner.test.ts`
- `src/lib/triggers/executor.ts`
- `src/lib/triggers/__tests__/executor.test.ts`
- `src/lib/triggers/cron-utils.ts`
- `src/lib/triggers/__tests__/cron-utils.test.ts`
- `app/api/cron/scan/route.ts`
- `app/api/cron/scan/__tests__/route.test.ts`
- `app/api/trigger/run/route.ts`
- `app/api/trigger/run/__tests__/route.test.ts`

### Modify
- `vercel.json` — add `crons` array
- `src/types/database.ts` — targeted manual patch for `agent_triggers` table + new RPC types
- `src/lib/runner/schemas.ts` — (if needed) verify `triggerType` enum includes `"cron"`

### Reference (do not modify)
- `src/lib/runner/run-agent.ts` — runner engine entry point
- `src/lib/runner/run-lifecycle.ts` — `createRun`, `completeRun`, `markStaleRunsFailed`
- `src/lib/runner/thread-queue.ts` — `enqueueMessage`, `drainQueue`
- `src/lib/runner/schemas.ts` — `RunnerPayload`, `triggerTypeValues`
- `supabase/migrations/20260301000004_create_runs_table.sql` — runs table schema
- `supabase/migrations/20260301100000_create_thread_queue_records.sql` — queue schema
- `supabase/migrations/20260301100001_create_run_lifecycle_functions.sql` — `create_run_if_idle` RPC
- `app/api/chat/route.ts` — API route pattern reference
- `roadmap docs/Sunder - Source of Truth/references/tasklet/persistence-and-cron/00-source-persistence-and-cron-verbatim.md` — Tasklet cron architecture
- `roadmap docs/Sunder - Source of Truth/references/tasklet/persistence-and-cron/03-cron-trigger-execution-semantics.md` — Execution model

---

## Task 1: Database Migration — `agent_triggers` Table

**Files:**
- Create: `supabase/migrations/20260306010000_create_agent_triggers.sql`

This migration creates the `agent_triggers` table per TRIG-04. The table stores trigger definitions (schedule-based for now). Key columns: `current_run_id` for atomic claim (TRIG-02), `thread_id` NOT NULL (triggers fire into their creation thread), `instruction_path` NOT NULL (reference doc for the agent to read on each fire), `next_fire_at` for scanner queries.

**Step 1: Write the migration SQL**

```sql
-- PR 18: agent_triggers table for scheduled trigger definitions.
-- Decision refs: TRIG-01, TRIG-02, TRIG-04.
--
-- Triggers fire INTO the thread where they were created (TRIG-04).
-- Atomic claim via current_run_id prevents double-dispatch (TRIG-02).
-- Scanner queries next_fire_at to find due triggers (TRIG-01).

CREATE TABLE public.agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.conversation_threads(thread_id) ON DELETE CASCADE,

  -- Trigger definition
  trigger_type TEXT NOT NULL DEFAULT 'schedule' CHECK (trigger_type IN ('schedule', 'webhook', 'rss')),
  name TEXT NOT NULL,
  cron_expression TEXT,          -- required for schedule type, nullable for others
  instruction_path TEXT NOT NULL, -- storage path to .md instruction file
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Atomic claim mechanism (TRIG-02)
  current_run_id UUID,           -- set during execution, NULL when idle

  -- Scheduling state
  next_fire_at TIMESTAMPTZ,      -- nullable: webhook/rss don't use cron scheduling
  last_fired_at TIMESTAMPTZ,
  last_status TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scanner index: find due, enabled, unclaimed triggers efficiently
CREATE INDEX idx_agent_triggers_scanner
  ON public.agent_triggers (next_fire_at)
  WHERE enabled = true AND current_run_id IS NULL AND next_fire_at IS NOT NULL;

-- Tenant isolation indexes
CREATE INDEX idx_agent_triggers_client_id ON public.agent_triggers(client_id);
CREATE INDEX idx_agent_triggers_thread_id ON public.agent_triggers(thread_id);

-- RLS
ALTER TABLE public.agent_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_triggers_select_own ON public.agent_triggers
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_insert_own ON public.agent_triggers
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_update_own ON public.agent_triggers
  FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY agent_triggers_delete_own ON public.agent_triggers
  FOR DELETE USING (client_id = public.get_my_client_id());

-- updated_at auto-refresh
CREATE OR REPLACE FUNCTION public.update_agent_triggers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_triggers_updated_at
  BEFORE UPDATE ON public.agent_triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agent_triggers_updated_at();
```

**Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: Migration applies cleanly. Table `agent_triggers` exists with all columns, indexes, RLS policies, and trigger.

**Step 3: Verify via psql**

```bash
npx supabase db lint
```

Expected: No lint errors for the new migration.

**Step 4: Commit**

```bash
git add supabase/migrations/20260306010000_create_agent_triggers.sql
git commit -m "feat(pr18): add agent_triggers table migration"
```

---

## Task 2: Database Migration — Trigger RPC Functions

**Files:**
- Create: `supabase/migrations/20260306010001_create_trigger_rpc_functions.sql`

Two RPCs: `claim_due_triggers` (atomic claim for scanner) and `release_stale_trigger_claims` (15-min reaper). Both use `SECURITY DEFINER` with explicit client ownership checks.

**Step 1: Write the RPC migration**

```sql
-- PR 18: Trigger scanner RPC functions.
-- Decision refs: TRIG-02 (atomic claim), TRIG-01 (stale reaper).
--
-- claim_due_triggers: Atomically claim all due triggers for a scanner tick.
-- Uses UPDATE...RETURNING to prevent double-dispatch.
--
-- release_stale_trigger_claims: Reaper for claims older than 15 min.
-- Handles crashed/timed-out Vercel functions that never released their claim.

-- Claim due triggers: returns rows that were successfully claimed.
-- Only claims triggers where next_fire_at <= NOW(), enabled, and unclaimed.
-- Sets current_run_id = gen_random_uuid() and updates last_fired_at.
-- Does NOT compute next_fire_at — the application layer computes this
-- from the cron_expression and updates after successful dispatch.
CREATE OR REPLACE FUNCTION public.claim_due_triggers()
RETURNS SETOF public.agent_triggers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.agent_triggers
  SET
    current_run_id = gen_random_uuid(),
    last_fired_at = now()
  WHERE
    enabled = true
    AND current_run_id IS NULL
    AND next_fire_at IS NOT NULL
    AND next_fire_at <= now()
  RETURNING *;
END;
$$;

-- Release stale claims: frees triggers claimed more than p_stale_minutes ago.
-- Called by the scanner on every tick as a self-healing mechanism.
CREATE OR REPLACE FUNCTION public.release_stale_trigger_claims(
  p_stale_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = 'stale_released'
  WHERE
    current_run_id IS NOT NULL
    AND last_fired_at < now() - (p_stale_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

-- Release a specific trigger's claim after execution completes.
-- Validates that the caller's run_id matches the current claim.
-- Returns true if released, false if claim didn't match (stale/already released).
CREATE OR REPLACE FUNCTION public.release_trigger_claim(
  p_trigger_id UUID,
  p_run_id UUID,
  p_status TEXT DEFAULT 'completed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = p_status
  WHERE
    id = p_trigger_id
    AND current_run_id = p_run_id;

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released > 0;
END;
$$;
```

**Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: Both functions created. `claim_due_triggers` returns `SETOF agent_triggers`. `release_stale_trigger_claims` returns `INTEGER`. `release_trigger_claim` returns `BOOLEAN`.

**Step 3: Commit**

```bash
git add supabase/migrations/20260306010001_create_trigger_rpc_functions.sql
git commit -m "feat(pr18): add trigger scanner RPC functions"
```

---

## Task 3: Cron Expression Utilities

**Files:**
- Create: `src/lib/triggers/cron-utils.ts`
- Test: `src/lib/triggers/__tests__/cron-utils.test.ts`

A utility to compute the next fire time from a cron expression. We'll use a small library (`cron-parser`) to parse standard 5-field cron expressions.

**Step 1: Install cron-parser**

```bash
npm install cron-parser
```

**Step 2: Write the failing tests**

```typescript
/**
 * Tests for cron expression utilities.
 * @module lib/triggers/__tests__/cron-utils.test
 */
import { describe, expect, it } from "vitest";

import { computeNextFireAt, isValidCronExpression } from "../cron-utils";

describe("isValidCronExpression", () => {
  it("returns true for a valid every-minute expression", () => {
    expect(isValidCronExpression("* * * * *")).toBe(true);
  });

  it("returns true for a standard daily-at-9am expression", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isValidCronExpression("")).toBe(false);
  });

  it("returns false for gibberish", () => {
    expect(isValidCronExpression("not a cron")).toBe(false);
  });

  it("returns false for a 6-field expression (seconds not supported)", () => {
    expect(isValidCronExpression("0 0 9 * * *")).toBe(false);
  });
});

describe("computeNextFireAt", () => {
  it("returns a Date after the given reference time", () => {
    const ref = new Date("2026-03-06T08:59:00Z");
    const next = computeNextFireAt("0 9 * * *", ref);
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(ref.getTime());
  });

  it("computes correct next minute for every-minute cron", () => {
    const ref = new Date("2026-03-06T10:30:00Z");
    const next = computeNextFireAt("* * * * *", ref);
    // Next minute after 10:30:00 is 10:31:00
    expect(next.toISOString()).toBe("2026-03-06T10:31:00.000Z");
  });

  it("computes next day if today's window has passed", () => {
    const ref = new Date("2026-03-06T10:00:00Z");
    const next = computeNextFireAt("0 9 * * *", ref);
    // 9am already passed, next is tomorrow 9am
    expect(next.toISOString()).toBe("2026-03-07T09:00:00.000Z");
  });

  it("throws for an invalid cron expression", () => {
    expect(() => computeNextFireAt("bad", new Date())).toThrow();
  });
});
```

**Step 3: Run tests to verify RED**

```bash
npx vitest run src/lib/triggers/__tests__/cron-utils.test.ts
```

Expected: FAIL — modules not found.

**Step 4: Write minimal implementation**

```typescript
/**
 * Cron expression parsing and next-fire-at computation.
 * @module lib/triggers/cron-utils
 */
import { parseExpression } from "cron-parser";

/**
 * Validates whether a string is a valid 5-field cron expression.
 * We reject 6-field (with seconds) to match standard cron format.
 */
export function isValidCronExpression(expression: string): boolean {
  if (!expression.trim()) return false;

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  try {
    parseExpression(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the next fire time after `referenceTime` for a cron expression.
 * @throws If the cron expression is invalid.
 */
export function computeNextFireAt(
  cronExpression: string,
  referenceTime: Date,
): Date {
  const interval = parseExpression(cronExpression, {
    currentDate: referenceTime,
  });
  return interval.next().toDate();
}
```

**Step 5: Run tests to verify GREEN**

```bash
npx vitest run src/lib/triggers/__tests__/cron-utils.test.ts
```

Expected: All 7 tests PASS.

**Step 6: Commit**

```bash
git add src/lib/triggers/cron-utils.ts src/lib/triggers/__tests__/cron-utils.test.ts package.json package-lock.json
git commit -m "feat(pr18): add cron expression utilities with tests"
```

---

## Task 4: Trigger Schemas (Zod Validation)

**Files:**
- Create: `src/lib/triggers/schemas.ts`
- Test: `src/lib/triggers/__tests__/schemas.test.ts`

Zod schemas for: the trigger row shape (from DB), the scanner dispatch payload (scanner → execution route), and the cron scan response.

**Step 1: Write the failing tests**

```typescript
/**
 * Tests for trigger Zod schemas.
 * @module lib/triggers/__tests__/schemas.test
 */
import { describe, expect, it } from "vitest";

import {
  triggerDispatchPayloadSchema,
  triggerRowSchema,
  triggerTypeValues,
} from "../schemas";

describe("triggerTypeValues", () => {
  it("includes schedule, webhook, and rss", () => {
    expect(triggerTypeValues).toEqual(["schedule", "webhook", "rss"]);
  });
});

describe("triggerRowSchema", () => {
  const validRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    thread_id: "770e8400-e29b-41d4-a716-446655440000",
    trigger_type: "schedule",
    name: "Daily briefing",
    cron_expression: "0 9 * * *",
    instruction_path: "state/triggers/daily-briefing.md",
    payload: {},
    enabled: true,
    current_run_id: null,
    next_fire_at: "2026-03-07T09:00:00.000Z",
    last_fired_at: null,
    last_status: null,
    created_at: "2026-03-06T00:00:00.000Z",
    updated_at: "2026-03-06T00:00:00.000Z",
  };

  it("parses a valid schedule trigger row", () => {
    const result = triggerRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it("rejects a row missing required name", () => {
    const { name: _, ...missing } = validRow;
    const result = triggerRowSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects invalid trigger_type", () => {
    const result = triggerRowSchema.safeParse({
      ...validRow,
      trigger_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("allows null current_run_id (idle trigger)", () => {
    const result = triggerRowSchema.safeParse({
      ...validRow,
      current_run_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("allows a UUID current_run_id (claimed trigger)", () => {
    const result = triggerRowSchema.safeParse({
      ...validRow,
      current_run_id: "880e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("triggerDispatchPayloadSchema", () => {
  it("parses a valid dispatch payload", () => {
    const result = triggerDispatchPayloadSchema.safeParse({
      triggerId: "550e8400-e29b-41d4-a716-446655440000",
      clientId: "660e8400-e29b-41d4-a716-446655440000",
      threadId: "770e8400-e29b-41d4-a716-446655440000",
      currentRunId: "880e8400-e29b-41d4-a716-446655440000",
      triggerName: "Daily briefing",
      instructionPath: "state/triggers/daily-briefing.md",
      triggerPayload: { source: "cron" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload missing triggerId", () => {
    const result = triggerDispatchPayloadSchema.safeParse({
      clientId: "660e8400-e29b-41d4-a716-446655440000",
      threadId: "770e8400-e29b-41d4-a716-446655440000",
      currentRunId: "880e8400-e29b-41d4-a716-446655440000",
      triggerName: "Daily briefing",
      instructionPath: "state/triggers/daily-briefing.md",
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify RED**

```bash
npx vitest run src/lib/triggers/__tests__/schemas.test.ts
```

Expected: FAIL — modules not found.

**Step 3: Write minimal implementation**

```typescript
/**
 * Zod schemas for trigger system data shapes.
 * @module lib/triggers/schemas
 */
import { z } from "zod/v4";

/** Supported trigger types. Schedule = cron-based, webhook/rss added in PR 20. */
export const triggerTypeValues = ["schedule", "webhook", "rss"] as const;

/**
 * Schema for a single `agent_triggers` row as returned from Supabase.
 * Used to validate RPC results and direct table queries.
 */
export const triggerRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  trigger_type: z.enum(triggerTypeValues),
  name: z.string(),
  cron_expression: z.string().nullable(),
  instruction_path: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean(),
  current_run_id: z.string().uuid().nullable(),
  next_fire_at: z.string().nullable(),
  last_fired_at: z.string().nullable(),
  last_status: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TriggerRow = z.infer<typeof triggerRowSchema>;

/**
 * Payload sent from the cron scanner to `/api/trigger/run`.
 * Contains everything the execution route needs to fire the trigger.
 */
export const triggerDispatchPayloadSchema = z.object({
  triggerId: z.string().uuid(),
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  currentRunId: z.string().uuid(),
  triggerName: z.string(),
  instructionPath: z.string(),
  triggerPayload: z.record(z.string(), z.unknown()).default({}),
});

export type TriggerDispatchPayload = z.infer<
  typeof triggerDispatchPayloadSchema
>;
```

**Step 4: Run tests to verify GREEN**

```bash
npx vitest run src/lib/triggers/__tests__/schemas.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/triggers/schemas.ts src/lib/triggers/__tests__/schemas.test.ts
git commit -m "feat(pr18): add trigger Zod schemas with tests"
```

---

## Task 5: Scanner Logic

**Files:**
- Create: `src/lib/triggers/scanner.ts`
- Test: `src/lib/triggers/__tests__/scanner.test.ts`

The scanner module: (1) claims due triggers via RPC, (2) computes + updates `next_fire_at` for each claimed trigger, (3) dispatches each to the execution endpoint, (4) reaps stale claims. This is pure business logic — the API route (Task 7) is a thin wrapper.

**Step 1: Write the failing tests**

```typescript
/**
 * Tests for the cron scanner business logic.
 * @module lib/triggers/__tests__/scanner.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { TriggerRow } from "../schemas";
import { runScan } from "../scanner";

// --- Mocks ---

vi.mock("../cron-utils", () => ({
  computeNextFireAt: vi.fn(() => new Date("2026-03-07T09:00:00.000Z")),
}));

/** Minimal trigger row factory for tests. */
function makeTriggerRow(overrides: Partial<TriggerRow> = {}): TriggerRow {
  return {
    id: "trig-001",
    client_id: "client-001",
    thread_id: "thread-001",
    trigger_type: "schedule",
    name: "Daily briefing",
    cron_expression: "0 9 * * *",
    instruction_path: "state/triggers/daily-briefing.md",
    payload: {},
    enabled: true,
    current_run_id: "run-001",
    next_fire_at: "2026-03-06T09:00:00.000Z",
    last_fired_at: "2026-03-06T09:00:00.000Z",
    last_status: null,
    created_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

function createMockSupabase() {
  return {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ data: null, error: null })),
      })),
    })),
  };
}

describe("runScan", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockDispatch: Mock;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    mockDispatch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zero claimed when no triggers are due", async () => {
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: [], error: null };
      }
      if (name === "release_stale_trigger_claims") {
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(result.claimed).toBe(0);
    expect(result.dispatched).toBe(0);
    expect(result.staleReleased).toBe(0);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("claims and dispatches a single due trigger", async () => {
    const trigger = makeTriggerRow();

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: [trigger], error: null };
      }
      if (name === "release_stale_trigger_claims") {
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(result.claimed).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerId: "trig-001",
        clientId: "client-001",
        threadId: "thread-001",
        currentRunId: "run-001",
      }),
    );
  });

  it("updates next_fire_at after claiming a schedule trigger", async () => {
    const trigger = makeTriggerRow();

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: [trigger], error: null };
      }
      if (name === "release_stale_trigger_claims") {
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    });

    const mockUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({ data: null, error: null })),
    }));
    mockSupabase.from.mockReturnValue({ update: mockUpdate });

    await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("agent_triggers");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        next_fire_at: expect.any(String),
      }),
    );
  });

  it("reports stale claims released by the reaper", async () => {
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: [], error: null };
      }
      if (name === "release_stale_trigger_claims") {
        return { data: 3, error: null };
      }
      return { data: null, error: null };
    });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(result.staleReleased).toBe(3);
  });

  it("throws when claim RPC fails", async () => {
    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(
      runScan({ supabase: mockSupabase as never, dispatch: mockDispatch }),
    ).rejects.toThrow("Failed to claim due triggers: DB error");
  });

  it("continues dispatching remaining triggers when one dispatch fails", async () => {
    const t1 = makeTriggerRow({ id: "trig-001", current_run_id: "run-001" });
    const t2 = makeTriggerRow({ id: "trig-002", current_run_id: "run-002" });

    mockSupabase.rpc.mockImplementation((name: string) => {
      if (name === "claim_due_triggers") {
        return { data: [t1, t2], error: null };
      }
      if (name === "release_stale_trigger_claims") {
        return { data: 0, error: null };
      }
      return { data: null, error: null };
    });

    mockDispatch
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true });

    const result = await runScan({
      supabase: mockSupabase as never,
      dispatch: mockDispatch,
    });

    expect(result.claimed).toBe(2);
    expect(result.dispatched).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("trig-001");
  });
});
```

**Step 2: Run tests to verify RED**

```bash
npx vitest run src/lib/triggers/__tests__/scanner.test.ts
```

Expected: FAIL — module `../scanner` not found.

**Step 3: Write minimal implementation**

```typescript
/**
 * Cron scanner business logic.
 *
 * Claims due triggers atomically, updates next_fire_at, dispatches to
 * the execution endpoint, and reaps stale claims.
 *
 * @module lib/triggers/scanner
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeNextFireAt } from "./cron-utils";
import type { TriggerDispatchPayload, TriggerRow } from "./schemas";

const STALE_CLAIM_MINUTES = 15;

export interface ScanResult {
  /** Number of triggers successfully claimed. */
  claimed: number;
  /** Number of triggers dispatched to execution route. */
  dispatched: number;
  /** Number of stale claims released by the reaper. */
  staleReleased: number;
  /** Error messages for failed dispatches. */
  errors: string[];
}

export interface ScanDependencies {
  supabase: SupabaseClient;
  /** Dispatch function — sends a payload to the execution endpoint. */
  dispatch: (payload: TriggerDispatchPayload) => Promise<{ ok: boolean }>;
}

/**
 * Runs one scanner tick: claim → update next_fire_at → dispatch → reap stale.
 */
export async function runScan({
  supabase,
  dispatch,
}: ScanDependencies): Promise<ScanResult> {
  // 1. Atomically claim due triggers
  const { data: claimed, error: claimError } =
    await supabase.rpc("claim_due_triggers");

  if (claimError) {
    throw new Error(`Failed to claim due triggers: ${claimError.message}`);
  }

  const claimedTriggers: TriggerRow[] = claimed ?? [];

  // 2. Update next_fire_at for schedule triggers
  for (const trigger of claimedTriggers) {
    if (trigger.trigger_type === "schedule" && trigger.cron_expression) {
      const nextFireAt = computeNextFireAt(
        trigger.cron_expression,
        new Date(),
      );
      await supabase
        .from("agent_triggers")
        .update({ next_fire_at: nextFireAt.toISOString() })
        .eq("id", trigger.id);
    }
  }

  // 3. Dispatch each claimed trigger to the execution route
  const errors: string[] = [];
  let dispatched = 0;

  for (const trigger of claimedTriggers) {
    const payload: TriggerDispatchPayload = {
      triggerId: trigger.id,
      clientId: trigger.client_id,
      threadId: trigger.thread_id,
      currentRunId: trigger.current_run_id!,
      triggerName: trigger.name,
      instructionPath: trigger.instruction_path,
      triggerPayload: (trigger.payload as Record<string, unknown>) ?? {},
    };

    try {
      await dispatch(payload);
      dispatched++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dispatch error";
      errors.push(`${trigger.id}: ${message}`);
    }
  }

  // 4. Reap stale claims
  const { data: staleReleased } = await supabase.rpc(
    "release_stale_trigger_claims",
    { p_stale_minutes: STALE_CLAIM_MINUTES },
  );

  return {
    claimed: claimedTriggers.length,
    dispatched,
    staleReleased: (staleReleased as number) ?? 0,
    errors,
  };
}
```

**Step 4: Run tests to verify GREEN**

```bash
npx vitest run src/lib/triggers/__tests__/scanner.test.ts
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/triggers/scanner.ts src/lib/triggers/__tests__/scanner.test.ts
git commit -m "feat(pr18): add scanner business logic with tests"
```

---

## Task 6: Trigger Executor Logic

**Files:**
- Create: `src/lib/triggers/executor.ts`
- Test: `src/lib/triggers/__tests__/executor.test.ts`

The executor: (1) validates the dispatch payload claim still matches, (2) inserts a trigger-event system message into the thread (Tasklet XML format per TRIG-04), (3) calls `runAgent()` with `triggerType: "cron"`, (4) releases the claim on completion.

**Step 1: Write the failing tests**

```typescript
/**
 * Tests for trigger execution logic.
 * @module lib/triggers/__tests__/executor.test
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { executeTrigger } from "../executor";
import type { TriggerDispatchPayload } from "../schemas";

// Mock the runner — we don't invoke the real LLM
vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ status: "streaming" }),
}));

function createMockSupabase() {
  const insertChain = {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => insertChain),
    single: vi.fn(() => ({ data: { message_id: "msg-001" }, error: null })),
  };

  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    single: vi.fn(() => ({
      data: { id: "trig-001", current_run_id: "run-001" },
      error: null,
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "conversation_messages") return insertChain;
      if (table === "agent_triggers") return selectChain;
      return selectChain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
}

const validPayload: TriggerDispatchPayload = {
  triggerId: "trig-001",
  clientId: "client-001",
  threadId: "thread-001",
  currentRunId: "run-001",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: { source: "cron" },
};

describe("executeTrigger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates the claim matches before executing", async () => {
    const supabase = createMockSupabase();

    await executeTrigger({ supabase: supabase as never, payload: validPayload });

    // Should query agent_triggers to validate claim
    expect(supabase.from).toHaveBeenCalledWith("agent_triggers");
  });

  it("inserts a trigger-event system message into the thread", async () => {
    const supabase = createMockSupabase();

    await executeTrigger({ supabase: supabase as never, payload: validPayload });

    // Should insert into conversation_messages
    const messagesFrom = supabase.from.mock.calls.find(
      ([table]: [string]) => table === "conversation_messages",
    );
    expect(messagesFrom).toBeDefined();
  });

  it("calls runAgent with triggerType 'cron'", async () => {
    const supabase = createMockSupabase();
    const { runAgent } = await import("@/lib/runner/run-agent");

    await executeTrigger({ supabase: supabase as never, payload: validPayload });

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-001",
        threadId: "thread-001",
        triggerType: "cron",
      }),
      expect.anything(),
    );
  });

  it("releases the trigger claim on success", async () => {
    const supabase = createMockSupabase();

    await executeTrigger({ supabase: supabase as never, payload: validPayload });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_trigger_id: "trig-001",
      p_run_id: "run-001",
      p_status: "completed",
    });
  });

  it("releases the trigger claim with 'failed' status on runner error", async () => {
    const supabase = createMockSupabase();
    const { runAgent } = await import("@/lib/runner/run-agent");
    vi.mocked(runAgent).mockRejectedValueOnce(new Error("LLM timeout"));

    await executeTrigger({ supabase: supabase as never, payload: validPayload });

    expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
      p_trigger_id: "trig-001",
      p_run_id: "run-001",
      p_status: "failed",
    });
  });

  it("aborts without executing if claim does not match", async () => {
    const supabase = createMockSupabase();
    // Simulate claim mismatch: current_run_id differs
    supabase.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: "trig-001", current_run_id: "different-run" },
            error: null,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { message_id: "msg-001" },
            error: null,
          })),
        })),
      })),
    }));

    const { runAgent } = await import("@/lib/runner/run-agent");

    const result = await executeTrigger({
      supabase: supabase as never,
      payload: validPayload,
    });

    expect(result.status).toBe("claim_mismatch");
    expect(runAgent).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify RED**

```bash
npx vitest run src/lib/triggers/__tests__/executor.test.ts
```

Expected: FAIL — module `../executor` not found.

**Step 3: Write minimal implementation**

```typescript
/**
 * Trigger execution logic.
 *
 * Validates the claim, inserts a trigger-event system message (Tasklet XML
 * format per TRIG-04), calls the runner, and releases the claim.
 *
 * @module lib/triggers/executor
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { runAgent } from "@/lib/runner/run-agent";

import type { TriggerDispatchPayload } from "./schemas";

export interface ExecuteTriggerInput {
  supabase: SupabaseClient;
  payload: TriggerDispatchPayload;
}

export interface ExecuteTriggerResult {
  status: "completed" | "failed" | "claim_mismatch" | "queued";
}

/**
 * Builds the Tasklet-format trigger event XML (TRIG-04).
 * Inserted as a system message into the thread so the LLM sees the trigger context.
 */
function buildTriggerEventMessage(payload: TriggerDispatchPayload): string {
  const payloadXml =
    Object.keys(payload.triggerPayload).length > 0
      ? `\n<payload>${JSON.stringify(payload.triggerPayload)}</payload>`
      : "";

  return [
    "<system-message>",
    "<trigger-event>",
    `<trigger-name>schedule</trigger-name>`,
    `<trigger-title>${escapeXml(payload.triggerName)}</trigger-title>`,
    `<event-title>Scheduled trigger fired</event-title>`,
    `<trigger-instance-id>${payload.triggerId}</trigger-instance-id>`,
    `<integration-id>system</integration-id>`,
    `<instruction-path>${escapeXml(payload.instructionPath)}</instruction-path>`,
    payloadXml,
    "</trigger-event>",
    "</system-message>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Escapes XML special characters in user-controlled strings. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Executes a single trigger run.
 *
 * 1. Validate the claim (current_run_id matches).
 * 2. Insert a trigger-event system message into the thread.
 * 3. Call runAgent with triggerType "cron".
 * 4. Release the claim (success or failure).
 */
export async function executeTrigger({
  supabase,
  payload,
}: ExecuteTriggerInput): Promise<ExecuteTriggerResult> {
  // 1. Validate claim
  const { data: trigger } = await supabase
    .from("agent_triggers")
    .select("id, current_run_id")
    .eq("id", payload.triggerId)
    .single();

  if (!trigger || trigger.current_run_id !== payload.currentRunId) {
    return { status: "claim_mismatch" };
  }

  // 2. Insert trigger-event system message
  const triggerMessage = buildTriggerEventMessage(payload);

  await supabase.from("conversation_messages").insert({
    thread_id: payload.threadId,
    client_id: payload.clientId,
    role: "system",
    content: triggerMessage,
  });

  // 3. Call runner
  let runStatus: "completed" | "failed" | "queued" = "completed";
  try {
    const result = await runAgent(
      {
        clientId: payload.clientId,
        threadId: payload.threadId,
        triggerType: "cron",
        input: triggerMessage,
      },
      supabase,
    );

    if (result.status === "queued") {
      runStatus = "queued";
    }
  } catch {
    runStatus = "failed";
  }

  // 4. Release claim
  const releaseStatus = runStatus === "failed" ? "failed" : "completed";
  await supabase.rpc("release_trigger_claim", {
    p_trigger_id: payload.triggerId,
    p_run_id: payload.currentRunId,
    p_status: releaseStatus,
  });

  return { status: runStatus };
}
```

**Step 4: Run tests to verify GREEN**

```bash
npx vitest run src/lib/triggers/__tests__/executor.test.ts
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/triggers/executor.ts src/lib/triggers/__tests__/executor.test.ts
git commit -m "feat(pr18): add trigger executor with claim validation and tests"
```

---

## Task 7: Cron Scanner API Route — `/api/cron/scan`

**Files:**
- Create: `app/api/cron/scan/route.ts`
- Test: `app/api/cron/scan/__tests__/route.test.ts`

Thin HTTP wrapper around `runScan()`. Vercel cron hits this GET endpoint every 1 minute. Auth via `CRON_SECRET` environment variable (Vercel sets `Authorization: Bearer <secret>`).

**Step 1: Write the failing tests**

```typescript
/**
 * Tests for the /api/cron/scan route.
 * @module app/api/cron/scan/__tests__/route.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing route
vi.mock("@/lib/triggers/scanner", () => ({
  runScan: vi.fn().mockResolvedValue({
    claimed: 0,
    dispatched: 0,
    staleReleased: 0,
    errors: [],
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    rpc: vi.fn(),
    from: vi.fn(),
  }),
}));

describe("GET /api/cron/scan", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CRON_SECRET: "test-secret" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns 401 when authorization header is missing", async () => {
    const { GET } = await import("../route");
    const request = new Request("http://localhost/api/cron/scan");

    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const { GET } = await import("../route");
    const request = new Request("http://localhost/api/cron/scan", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 with scan results on valid auth", async () => {
    const { GET } = await import("../route");
    const request = new Request("http://localhost/api/cron/scan", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        claimed: 0,
        dispatched: 0,
        staleReleased: 0,
      }),
    );
  });

  it("returns 500 when scanner throws", async () => {
    const { runScan } = await import("@/lib/triggers/scanner");
    vi.mocked(runScan).mockRejectedValueOnce(new Error("DB down"));

    const { GET } = await import("../route");
    const request = new Request("http://localhost/api/cron/scan", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Scan failed");
  });
});
```

**Step 2: Run tests to verify RED**

```bash
npx vitest run app/api/cron/scan/__tests__/route.test.ts
```

Expected: FAIL — module `../route` not found.

**Step 3: Write minimal implementation**

Note: The scanner route uses a **service-role admin client** (not a user-session client) because Vercel cron has no user context. The admin client bypasses RLS — the RPC functions themselves are `SECURITY DEFINER` and operate on all clients' triggers.

```typescript
/**
 * Vercel cron scanner route — fires every 1 minute.
 *
 * Claims due triggers, dispatches to /api/trigger/run, and reaps stale claims.
 * Auth: CRON_SECRET env var validated via Authorization header.
 *
 * @module app/api/cron/scan/route
 */
import { createAdminClient } from "@/lib/supabase/server";
import { runScan } from "@/lib/triggers/scanner";
import type { TriggerDispatchPayload } from "@/lib/triggers/schemas";

export const maxDuration = 45;

/**
 * Dispatches a claimed trigger to the execution endpoint.
 * Uses internal fetch — the execution route runs in a separate Vercel function.
 */
async function dispatchTrigger(
  payload: TriggerDispatchPayload,
): Promise<{ ok: boolean }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL not configured");
  }

  const url = baseUrl.startsWith("http")
    ? `${baseUrl}/api/trigger/run`
    : `https://${baseUrl}/api/trigger/run`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  return { ok: response.ok };
}

export async function GET(request: Request): Promise<Response> {
  // 1. Auth: verify cron secret
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Run scanner with admin client (no user session in cron context)
    const supabase = await createAdminClient();

    const result = await runScan({
      supabase,
      dispatch: dispatchTrigger,
    });

    return Response.json({
      success: true,
      claimed: result.claimed,
      dispatched: result.dispatched,
      staleReleased: result.staleReleased,
      errors: result.errors,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scanner error";
    return Response.json({ error: `Scan failed: ${message}` }, { status: 500 });
  }
}
```

**Step 4: Run tests to verify GREEN**

```bash
npx vitest run app/api/cron/scan/__tests__/route.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add app/api/cron/scan/route.ts app/api/cron/scan/__tests__/route.test.ts
git commit -m "feat(pr18): add /api/cron/scan route with tests"
```

---

## Task 8: Trigger Execution API Route — `/api/trigger/run`

**Files:**
- Create: `app/api/trigger/run/route.ts`
- Test: `app/api/trigger/run/__tests__/route.test.ts`

POST endpoint called by the scanner. Validates the dispatch payload, delegates to `executeTrigger()`. Auth via same `CRON_SECRET` (internal-only route).

**Step 1: Write the failing tests**

```typescript
/**
 * Tests for the /api/trigger/run route.
 * @module app/api/trigger/run/__tests__/route.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/triggers/executor", () => ({
  executeTrigger: vi.fn().mockResolvedValue({ status: "completed" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    rpc: vi.fn(),
    from: vi.fn(),
  }),
}));

const validBody = {
  triggerId: "550e8400-e29b-41d4-a716-446655440000",
  clientId: "660e8400-e29b-41d4-a716-446655440000",
  threadId: "770e8400-e29b-41d4-a716-446655440000",
  currentRunId: "880e8400-e29b-41d4-a716-446655440000",
  triggerName: "Daily briefing",
  instructionPath: "state/triggers/daily-briefing.md",
  triggerPayload: {},
};

describe("POST /api/trigger/run", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CRON_SECRET: "test-secret" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns 401 without valid auth", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/trigger/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/trigger/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify({ bad: "payload" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 200 with execution result on success", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/trigger/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("completed");
  });

  it("returns 409 when claim does not match", async () => {
    const { executeTrigger } = await import("@/lib/triggers/executor");
    vi.mocked(executeTrigger).mockResolvedValueOnce({
      status: "claim_mismatch",
    });

    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/trigger/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns 500 when executor throws", async () => {
    const { executeTrigger } = await import("@/lib/triggers/executor");
    vi.mocked(executeTrigger).mockRejectedValueOnce(new Error("crash"));

    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/trigger/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify(validBody),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});
```

**Step 2: Run tests to verify RED**

```bash
npx vitest run app/api/trigger/run/__tests__/route.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```typescript
/**
 * Trigger execution route — called by the cron scanner.
 *
 * Validates the dispatch payload, executes the trigger via the runner engine,
 * and returns the execution result.
 *
 * @module app/api/trigger/run/route
 */
import { createAdminClient } from "@/lib/supabase/server";
import { executeTrigger } from "@/lib/triggers/executor";
import { triggerDispatchPayloadSchema } from "@/lib/triggers/schemas";

export const maxDuration = 900; // 15 min — Vercel Fluid Compute ceiling (GAP-17)

export async function POST(request: Request): Promise<Response> {
  // 1. Auth: verify cron secret (internal-only route)
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = triggerDispatchPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // 3. Execute trigger
    const supabase = await createAdminClient();
    const result = await executeTrigger({
      supabase,
      payload: parsed.data,
    });

    // 4. Map result to HTTP status
    if (result.status === "claim_mismatch") {
      return Response.json(
        { status: "claim_mismatch", error: "Trigger claim no longer valid" },
        { status: 409 },
      );
    }

    return Response.json({ status: result.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown execution error";
    return Response.json(
      { error: `Execution failed: ${message}` },
      { status: 500 },
    );
  }
}
```

**Step 4: Run tests to verify GREEN**

```bash
npx vitest run app/api/trigger/run/__tests__/route.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add app/api/trigger/run/route.ts app/api/trigger/run/__tests__/route.test.ts
git commit -m "feat(pr18): add /api/trigger/run execution route with tests"
```

---

## Task 9: Vercel Cron Configuration + Type Patch

**Files:**
- Modify: `vercel.json` — add `crons` array
- Modify: `src/types/database.ts` — targeted manual patch for `agent_triggers` + RPC types

**Step 1: Add cron schedule to vercel.json**

Add the `crons` array to the existing config:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "outputDirectory": ".next",
  "crons": [
    {
      "path": "/api/cron/scan",
      "schedule": "* * * * *"
    }
  ]
}
```

**Step 2: Patch `src/types/database.ts` with `agent_triggers` table types**

Add the `agent_triggers` table definition to the `Tables` section. Follow the same pattern as other tables in the file (e.g., `agent_todo`, `crm_tasks`). Also add the three new RPC function signatures to the `Functions` section.

The exact patch depends on the current file structure, but the additions are:

For the `Tables` section:
```typescript
agent_triggers: {
  Row: {
    id: string
    client_id: string
    thread_id: string
    trigger_type: string
    name: string
    cron_expression: string | null
    instruction_path: string
    payload: Json
    enabled: boolean
    current_run_id: string | null
    next_fire_at: string | null
    last_fired_at: string | null
    last_status: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    client_id: string
    thread_id: string
    trigger_type?: string
    name: string
    cron_expression?: string | null
    instruction_path: string
    payload?: Json
    enabled?: boolean
    current_run_id?: string | null
    next_fire_at?: string | null
    last_fired_at?: string | null
    last_status?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    client_id?: string
    thread_id?: string
    trigger_type?: string
    name?: string
    cron_expression?: string | null
    instruction_path?: string
    payload?: Json
    enabled?: boolean
    current_run_id?: string | null
    next_fire_at?: string | null
    last_fired_at?: string | null
    last_status?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: [
    { foreignKeyName: "agent_triggers_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["client_id"] },
    { foreignKeyName: "agent_triggers_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "conversation_threads"; referencedColumns: ["thread_id"] },
  ]
}
```

For the `Functions` section:
```typescript
claim_due_triggers: {
  Args: Record<string, never>
  Returns: {
    id: string
    client_id: string
    thread_id: string
    trigger_type: string
    name: string
    cron_expression: string | null
    instruction_path: string
    payload: Json
    enabled: boolean
    current_run_id: string | null
    next_fire_at: string | null
    last_fired_at: string | null
    last_status: string | null
    created_at: string
    updated_at: string
  }[]
}
release_stale_trigger_claims: {
  Args: { p_stale_minutes?: number }
  Returns: number
}
release_trigger_claim: {
  Args: { p_trigger_id: string; p_run_id: string; p_status?: string }
  Returns: boolean
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors in trigger files.

**Step 4: Commit**

```bash
git add vercel.json src/types/database.ts
git commit -m "feat(pr18): add Vercel cron config and database type patch"
```

---

## Task 10: Admin Supabase Client (if not already present)

**Files:**
- Create or Modify: `src/lib/supabase/server.ts`

The scanner and execution routes need a **service-role Supabase client** (admin client) because Vercel cron has no user session. Check if `createAdminClient()` already exists — if so, skip this task. If not, add it alongside the existing `createClient()`.

**Step 1: Check if `createAdminClient` exists**

Read `src/lib/supabase/server.ts` and check for an admin client factory.

**Step 2: If missing, write the failing test**

```typescript
// In the appropriate test file for supabase/server
it("createAdminClient returns a client using service role key", async () => {
  const client = await createAdminClient();
  expect(client).toBeDefined();
});
```

**Step 3: If missing, add the implementation**

```typescript
/**
 * Creates a Supabase admin client using the service role key.
 * Bypasses RLS — use only in trusted server-side contexts (cron, webhooks).
 */
export async function createAdminClient(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin credentials");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
```

**Step 4: Verify tests pass, commit if changes were made**

```bash
npx vitest run src/lib/supabase/__tests__/server.test.ts
git add src/lib/supabase/server.ts
git commit -m "feat(pr18): add admin Supabase client for cron/trigger routes"
```

---

## Task 11: Verify triggerType Enum Includes "cron"

**Files:**
- Possibly Modify: `src/lib/runner/schemas.ts`

The runner's `triggerTypeValues` should already include `"cron"` based on prior PRs. Verify and add if missing.

**Step 1: Read `src/lib/runner/schemas.ts` and check**

```typescript
export const triggerTypeValues = ["chat", "webhook", "cron", "pulse"] as const;
```

If `"cron"` is already present → skip this task. If missing → add it and run existing runner tests to confirm no breakage.

**Step 2: Run runner tests**

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: All existing runner tests PASS.

**Step 3: Commit if changed**

```bash
git add src/lib/runner/schemas.ts
git commit -m "feat(pr18): ensure triggerType enum includes 'cron'"
```

---

## Task 12: Full Test Suite + Lint Verification

**Files:** None (verification only)

Run the complete test suite and linter to confirm nothing is broken.

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass, including new trigger tests and existing runner/CRM/memory tests.

**Step 2: Run linter**

```bash
npm run lint
```

Expected: No lint errors.

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore(pr18): fix lint and type issues"
```

---

## Verification Checklist

Before marking PR 18 complete:

- [ ] `agent_triggers` table exists with all columns per TRIG-04
- [ ] Scanner RPC (`claim_due_triggers`) atomically claims due triggers (TRIG-02)
- [ ] Stale claim reaper releases claims older than 15 min (TRIG-02)
- [ ] `release_trigger_claim` validates run_id before releasing (TRIG-02)
- [ ] `/api/cron/scan` fires every 1 min via Vercel cron (TRIG-01)
- [ ] Scanner dispatches to `/api/trigger/run` with correct payload (TRIG-05)
- [ ] Execution route validates claim before calling runner
- [ ] Trigger event inserted as system message in Tasklet XML format (TRIG-04)
- [ ] Runner called with `triggerType: "cron"` — reuses existing engine
- [ ] Per-thread serialization respected — busy thread queues trigger (TRIG-06)
- [ ] No double-execution: two scanner ticks cannot claim the same trigger
- [ ] All tests pass (`npx vitest run`)
- [ ] Lint clean (`npm run lint`)
- [ ] Types clean (`npx tsc --noEmit`)
