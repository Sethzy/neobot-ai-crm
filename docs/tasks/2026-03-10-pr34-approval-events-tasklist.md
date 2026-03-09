# Approval Events + Trigger Thread Integration

**PR:** PR 34: Approval system — events + UI
**Decisions:** SAFETY-02, SAFETY-04
**Goal:** Persist approval events to a new `approval_events` table so the system can track pending/resolved approvals, show pending count in system-reminder, and support trigger-thread approval resolution.

**Architecture:** Approval gate (PR 33) uses AI SDK `needsApproval: true` which emits `tool-approval-request` content parts. PR 34 adds persistence — on run finalization, scan steps for approval requests and write rows to `approval_events`. On user approve/deny in the chat route, update the row. System-reminder shows pending count. No separate approval queue UI — approvals are resolved in-thread (SAFETY-02). No per-action granularity or configurable matrix in v1 (SAFETY-04).

**Tech Stack:** Supabase (migration + RLS + RPC), Next.js API route, Zod, Vitest

**Design doc:** `docs/designs/approval-system-pr33-34-35.md` — section 4

## Relevant Files

| File | Action |
|---|---|
| `supabase/migrations/20260310000000_create_approval_events.sql` | Create: table + RLS + indexes |
| `src/types/database.ts` | Modify: regenerate with new table |
| `src/lib/approvals/queries.ts` | Create: insert/update/query functions |
| `src/lib/approvals/__tests__/queries.test.ts` | Create: unit tests for query helpers |
| `src/lib/runner/run-persistence.ts` | Modify: write approval events in `finalizeRun` |
| `src/lib/runner/__tests__/run-persistence.test.ts` | Create or modify: test approval event extraction |
| `app/api/chat/route.ts` | Modify: update approval event on approve/deny |
| `supabase/migrations/20260310000001_add_pending_approvals_to_system_reminder.sql` | Create: extend RPC |
| `src/lib/runner/system-reminder.ts` | Modify: add pending approval count |
| `src/lib/runner/__tests__/system-reminder.test.ts` | Create or modify: test pending approval line |

## Implementation Rules

1. Use `pnpm`, not `npm`.
2. Follow strict TDD:
   - Write a failing test
   - Run it and confirm the expected failure
   - Implement the minimum code to pass
   - Re-run the focused tests
3. Stage only touched files if committing. Never use `git add -A` in this repo.
4. PR 33 must be merged first — this PR depends on `needsApproval` tools being live.
5. Supabase conventions:
   - FKs reference `clients(client_id)`, NOT `clients(id)`
   - RLS uses `public.get_my_client_id()`, NOT `auth.uid()`
   - Service-role access: `auth.role() = 'service_role' OR client_id = public.get_my_client_id()`

---

## Task 1: Create `approval_events` migration

**Files:**
- Create: `supabase/migrations/20260310000000_create_approval_events.sql`

### Step 1 — Write the migration SQL

Create the migration file with this content:

```sql
-- PR34: approval_events table for tracking tool approval lifecycle.

CREATE TABLE public.approval_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(client_id),
  thread_id     uuid NOT NULL REFERENCES public.conversation_threads(thread_id),
  run_id        uuid REFERENCES public.runs(run_id),
  tool_name     text NOT NULL,
  tool_input    jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  approval_id   text NOT NULL,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_approval_events_approval_id UNIQUE (client_id, approval_id)
);

ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;

-- RLS: clients can only see their own approval events.
CREATE POLICY "approval_events_select"
  ON public.approval_events FOR SELECT
  USING (client_id = public.get_my_client_id());

-- RLS: service-role inserts (from runner finalization).
CREATE POLICY "approval_events_insert"
  ON public.approval_events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR client_id = public.get_my_client_id()
  );

-- RLS: updates for approval resolution.
CREATE POLICY "approval_events_update"
  ON public.approval_events FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

-- Partial index for fast pending-approval lookups.
CREATE INDEX idx_approval_events_pending
  ON public.approval_events (client_id, status)
  WHERE status = 'pending';

-- Index for lookups by approval_id (used when resolving approvals).
CREATE INDEX idx_approval_events_approval_id
  ON public.approval_events (approval_id);

COMMENT ON TABLE public.approval_events IS
  'Tracks tool approval lifecycle: pending → approved/denied/expired.';
```

### Step 2 — Apply migration locally

```bash
pnpm supabase db push
```

Or if using local Supabase:

```bash
pnpm supabase migration up --local
```

### Step 3 — Regenerate database types

```bash
pnpm supabase gen types typescript --local > src/types/database.ts
```

Verify `approval_events` appears in the generated types.

### Step 4 — Commit

```bash
git add supabase/migrations/20260310000000_create_approval_events.sql src/types/database.ts
git commit -m "feat(pr34): add approval_events table migration"
```

---

## Task 2: Approval event query helpers

**Files:**
- Create: `src/lib/approvals/queries.ts`
- Create: `src/lib/approvals/__tests__/queries.test.ts`

These are pure data-access functions that the runner and chat route will call.

### Step 1 — RED: Write test for `createApprovalEvent`

Create `src/lib/approvals/__tests__/queries.test.ts`:

```typescript
/**
 * Tests for approval event query helpers.
 * @module lib/approvals/__tests__/queries.test
 */
import { describe, expect, it, vi } from "vitest";

import { createApprovalEvent } from "../queries";

function createMockSupabase(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["insert", "select", "single", "eq", "update"] as const;
  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = ((resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve)) as never;

  const from = vi.fn().mockReturnValue(builder);
  return { client: { from } as never, from, builder };
}

describe("createApprovalEvent", () => {
  it("inserts a pending approval event and returns the row", async () => {
    const row = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      client_id: "client-1",
      thread_id: "thread-1",
      run_id: "run-1",
      tool_name: "delete_contact",
      tool_input: { contact_id: "c1" },
      status: "pending",
      approval_id: "approval-1",
      resolved_at: null,
      created_at: "2026-03-10T00:00:00Z",
    };
    const { client, from, builder } = createMockSupabase({ data: row, error: null });

    const result = await createApprovalEvent(client, {
      clientId: "client-1",
      threadId: "thread-1",
      runId: "run-1",
      toolName: "delete_contact",
      toolInput: { contact_id: "c1" },
      approvalId: "approval-1",
    });

    expect(result).toEqual({ success: true, event: row });
    expect(from).toHaveBeenCalledWith("approval_events");
    expect(builder.insert).toHaveBeenCalledWith({
      client_id: "client-1",
      thread_id: "thread-1",
      run_id: "run-1",
      tool_name: "delete_contact",
      tool_input: { contact_id: "c1" },
      approval_id: "approval-1",
    });
  });

  it("returns error on insert failure", async () => {
    const { client } = createMockSupabase({
      data: null,
      error: { message: "duplicate key" },
    });

    const result = await createApprovalEvent(client, {
      clientId: "client-1",
      threadId: "thread-1",
      runId: "run-1",
      toolName: "delete_contact",
      toolInput: {},
      approvalId: "approval-1",
    });

    expect(result).toEqual({ success: false, error: "duplicate key" });
  });
});
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: FAIL — module `../queries` does not exist.

### Step 2 — GREEN: Implement `createApprovalEvent`

Create `src/lib/approvals/queries.ts`:

```typescript
/**
 * Approval event data-access functions.
 * @module lib/approvals/queries
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type ApprovalSupabaseClient = SupabaseClient<Database>;

interface CreateApprovalEventInput {
  clientId: string;
  threadId: string;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  approvalId: string;
}

/**
 * Inserts a new pending approval event.
 * Uses the unique constraint on `(client_id, approval_id)` to prevent duplicates on retries.
 */
export async function createApprovalEvent(
  supabase: ApprovalSupabaseClient,
  input: CreateApprovalEventInput,
) {
  const { data, error } = await supabase
    .from("approval_events")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      run_id: input.runId,
      tool_name: input.toolName,
      tool_input: input.toolInput as Json,
      approval_id: input.approvalId,
    })
    .select()
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, event: data };
}
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: PASS.

### Step 3 — RED: Write test for `resolveApprovalEvent`

Add to the same test file:

```typescript
import { createApprovalEvent, resolveApprovalEvent } from "../queries";

describe("resolveApprovalEvent", () => {
  it("updates status to approved and sets resolved_at", async () => {
    const row = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      status: "approved",
      resolved_at: "2026-03-10T00:01:00Z",
    };
    const { client, builder } = createMockSupabase({ data: row, error: null });

    const result = await resolveApprovalEvent(client, {
      clientId: "client-1",
      approvalId: "approval-1",
      approved: true,
    });

    expect(result).toEqual({ success: true, event: row });
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
      }),
    );
    expect(builder.eq).toHaveBeenCalledWith("approval_id", "approval-1");
    expect(builder.eq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("updates status to denied", async () => {
    const row = { id: "a1", status: "denied", resolved_at: "2026-03-10T00:01:00Z" };
    const { client } = createMockSupabase({ data: row, error: null });

    const result = await resolveApprovalEvent(client, {
      clientId: "client-1",
      approvalId: "approval-1",
      approved: false,
    });

    expect(result).toEqual({ success: true, event: row });
  });

  it("returns error on update failure", async () => {
    const { client } = createMockSupabase({
      data: null,
      error: { message: "not found" },
    });

    const result = await resolveApprovalEvent(client, {
      clientId: "client-1",
      approvalId: "approval-1",
      approved: true,
    });

    expect(result).toEqual({ success: false, error: "not found" });
  });
});
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: FAIL — `resolveApprovalEvent` not exported.

### Step 4 — GREEN: Implement `resolveApprovalEvent`

Add to `src/lib/approvals/queries.ts`:

```typescript
interface ResolveApprovalEventInput {
  clientId: string;
  approvalId: string;
  approved: boolean;
}

/**
 * Resolves a pending approval event to approved or denied.
 */
export async function resolveApprovalEvent(
  supabase: ApprovalSupabaseClient,
  input: ResolveApprovalEventInput,
) {
  const { data, error } = await supabase
    .from("approval_events")
    .update({
      status: input.approved ? "approved" : "denied",
      resolved_at: new Date().toISOString(),
    })
    .eq("client_id", input.clientId)
    .eq("approval_id", input.approvalId)
    .select()
    .single();

  if (error) {
    return { success: false as const, error: error.message };
  }

  return { success: true as const, event: data };
}
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: PASS.

### Step 5 — RED: Write test for `getPendingApprovalCount`

Add to the same test file:

```typescript
import {
  createApprovalEvent,
  getPendingApprovalCount,
  resolveApprovalEvent,
} from "../queries";

describe("getPendingApprovalCount", () => {
  it("returns the pending count for a client", async () => {
    const { client, builder } = createMockSupabase({ data: null, error: null });
    // Override the count behavior — Supabase count queries return { count, error }
    builder.then = ((resolve: (v: unknown) => void) =>
      Promise.resolve({ count: 3, error: null }).then(resolve)) as never;

    const result = await getPendingApprovalCount(client, "client-1");

    expect(result).toBe(3);
    expect(builder.eq).toHaveBeenCalledWith("client_id", "client-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "pending");
  });
});
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: FAIL — `getPendingApprovalCount` not exported.

### Step 6 — GREEN: Implement `getPendingApprovalCount`

Add to `src/lib/approvals/queries.ts`:

```typescript
/**
 * Returns the count of pending approval events for a client.
 * Used by system-reminder to show "Pending approvals: N".
 */
export async function getPendingApprovalCount(
  supabase: ApprovalSupabaseClient,
  clientId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("approval_events")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "pending");

  if (error) {
    return 0;
  }

  return count ?? 0;
}
```

Run: `pnpm vitest run src/lib/approvals/__tests__/queries.test.ts`
Expected: PASS.

### Checkpoint

Run: `pnpm vitest run src/lib/approvals/__tests__/`
Expected: All 5 tests pass.

### Step 7 — Commit

```bash
git add src/lib/approvals/queries.ts src/lib/approvals/__tests__/queries.test.ts
git commit -m "feat(pr34): approval event query helpers (create, resolve, count)"
```

---

## Task 3: Write approval events on run finalization

**Files:**
- Modify: `src/lib/runner/run-persistence.ts`

When the runner finishes, scan the persisted parts for `approval-requested` state and write `approval_events` rows for each.

### Step 1 — RED: Write test for approval event extraction

Create or modify the run-persistence test. If `src/lib/runner/__tests__/run-persistence.test.ts` doesn't exist, create it. The test verifies that `extractApprovalRequests` pulls the right data from parts:

```typescript
/**
 * Tests for approval request extraction from persisted parts.
 * @module lib/runner/__tests__/approval-extraction.test
 */
import { describe, expect, it } from "vitest";

import { extractApprovalRequests } from "../run-persistence";

describe("extractApprovalRequests", () => {
  it("extracts approval-requested parts with approval id and tool info", () => {
    const parts = [
      { type: "step-start" },
      { type: "text", text: "I'll delete that contact." },
      {
        type: "tool-delete_contact",
        toolCallId: "tc-1",
        state: "approval-requested",
        input: { contact_id: "c1" },
        approval: { id: "apr-1" },
      },
      {
        type: "tool-search_contacts",
        toolCallId: "tc-2",
        state: "output-available",
        input: { query: "John" },
        output: { contacts: [] },
      },
    ];

    const requests = extractApprovalRequests(parts);

    expect(requests).toEqual([
      {
        approvalId: "apr-1",
        toolName: "delete_contact",
        toolInput: { contact_id: "c1" },
      },
    ]);
  });

  it("returns empty array when no approval requests exist", () => {
    const parts = [
      { type: "step-start" },
      { type: "text", text: "Done." },
    ];

    expect(extractApprovalRequests(parts)).toEqual([]);
  });

  it("extracts multiple approval requests from one run", () => {
    const parts = [
      {
        type: "tool-delete_contact",
        toolCallId: "tc-1",
        state: "approval-requested",
        input: { contact_id: "c1" },
        approval: { id: "apr-1" },
      },
      {
        type: "tool-delete_deal",
        toolCallId: "tc-2",
        state: "approval-requested",
        input: { deal_id: "d1" },
        approval: { id: "apr-2" },
      },
    ];

    const requests = extractApprovalRequests(parts);

    expect(requests).toHaveLength(2);
    expect(requests[0].toolName).toBe("delete_contact");
    expect(requests[1].toolName).toBe("delete_deal");
  });
});
```

Run: `pnpm vitest run src/lib/runner/__tests__/approval-extraction.test.ts`
Expected: FAIL — `extractApprovalRequests` not exported from `../run-persistence`.

### Step 2 — GREEN: Implement `extractApprovalRequests`

Add to `src/lib/runner/run-persistence.ts`:

```typescript
export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * Scans persisted parts for tool parts in `approval-requested` state.
 * Returns the approval ID, tool name, and tool input for each.
 */
export function extractApprovalRequests(
  parts: ReadonlyArray<PersistedPart>,
): ApprovalRequest[] {
  return parts
    .filter((part) => {
      return (
        part.state === "approval-requested" &&
        typeof part.approval === "object" &&
        part.approval !== null &&
        typeof (part.approval as Record<string, unknown>).id === "string"
      );
    })
    .map((part) => {
      const approval = part.approval as { id: string };
      const toolType = typeof part.type === "string" ? part.type : "";
      const toolName = toolType.startsWith("tool-")
        ? toolType.slice(5)
        : toolType;

      return {
        approvalId: approval.id,
        toolName,
        toolInput: (typeof part.input === "object" && part.input !== null
          ? part.input
          : {}) as Record<string, unknown>,
      };
    });
}
```

Run: `pnpm vitest run src/lib/runner/__tests__/approval-extraction.test.ts`
Expected: PASS.

### Step 3 — Wire `extractApprovalRequests` into `finalizeRun`

In `src/lib/runner/run-persistence.ts`, update the `finalizeRun` function to call `createApprovalEvent` for each extracted approval request. Add this **after** the assistant message is persisted but **before** `completeRun`:

```typescript
import { createApprovalEvent } from "@/lib/approvals/queries";

// Inside finalizeRun, after the createMessages block (around line 119) and before completeRun:
const approvalRequests = extractApprovalRequests(parts);
if (approvalRequests.length > 0) {
  await Promise.all(
    approvalRequests.map((request) =>
      createApprovalEvent(supabase, {
        clientId,
        threadId,
        runId,
        toolName: request.toolName,
        toolInput: request.toolInput,
        approvalId: request.approvalId,
      }),
    ),
  );
}
```

This is fire-and-forget safe — if the insert fails due to a duplicate `approval_id` (retry scenario), the unique constraint prevents double-writes.

### Checkpoint

Run: `pnpm vitest run src/lib/runner/__tests__/`
Expected: All pass.

### Step 4 — Commit

```bash
git add src/lib/runner/run-persistence.ts src/lib/runner/__tests__/approval-extraction.test.ts
git commit -m "feat(pr34): extract approval requests from parts and write to approval_events"
```

---

## Task 4: Resolve approval events on user approve/deny

**Files:**
- Modify: `app/api/chat/route.ts`

When the user clicks Approve or Deny, the chat route already receives the approval response via `addToolApprovalResponse`. We need to detect this and update the `approval_events` row.

### Step 1 — Understand the existing flow

The chat route receives the full message history including the approval response. The AI SDK handles the tool continuation. We need to intercept the approval metadata and update `approval_events`.

Check the `PostRequestBody` — it includes `messages` which may contain parts with `approval` objects and `state: "approval-responded"`.

### Step 2 — Add approval resolution to the chat route

In `app/api/chat/route.ts`, after `runAgent` is called, scan the incoming messages for approval responses and update the `approval_events` table. Add this logic **before** the `runAgent` call:

```typescript
import { resolveApprovalEvent } from "@/lib/approvals/queries";

// After clientId is resolved, before runAgent:
// Resolve any approval responses in the incoming messages
if (Array.isArray(body.messages)) {
  const approvalResponses = body.messages.flatMap((message) => {
    if (!Array.isArray(message.parts)) return [];
    return message.parts
      .filter(
        (part): part is { type: string; state: string; approval: { id: string; approved?: boolean } } =>
          typeof part === "object" &&
          part !== null &&
          "approval" in part &&
          typeof (part as Record<string, unknown>).approval === "object" &&
          (part as Record<string, unknown>).state === "approval-responded",
      )
      .map((part) => ({
        approvalId: part.approval.id,
        approved: part.approval.approved === true,
      }));
  });

  for (const response of approvalResponses) {
    await resolveApprovalEvent(supabase, {
      clientId,
      approvalId: response.approvalId,
      approved: response.approved,
    });
  }
}
```

### Step 3 — Verify manually

1. In chat, ask the agent to delete a contact
2. Agent pauses with approval card
3. Click Approve → check `approval_events` table: status should be `approved`, `resolved_at` set
4. Repeat with Deny → status should be `denied`

### Step 4 — Commit

```bash
git add app/api/chat/route.ts
git commit -m "feat(pr34): resolve approval_events on user approve/deny in chat route"
```

---

## Task 5: Add pending approval count to system-reminder

**Files:**
- Create: `supabase/migrations/20260310000001_add_pending_approvals_to_system_reminder.sql`
- Modify: `src/lib/runner/system-reminder.ts`

### Step 1 — Write migration to extend RPC

Create the migration that adds `pending_approval_count` to the `get_system_reminder_context` RPC:

```sql
-- PR34: add pending_approval_count to system reminder context.

CREATE OR REPLACE FUNCTION public.get_system_reminder_context(
  p_client_id UUID,
  p_thread_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'display_name', c.display_name,
    'user_email', u.email,
    'days_since_signup', EXTRACT(DAY FROM now() - c.created_at)::int,
    'open_todo_count', (
      SELECT count(*)::int
      FROM public.agent_todo AS t
      WHERE t.client_id = p_client_id
        AND t.thread_id = p_thread_id
    ),
    'memory_file_count', (
      SELECT count(*)::int
      FROM storage.objects AS o
      WHERE o.bucket_id = 'agent-files'
        AND (
          o.name = p_client_id::text || '/SOUL.md'
          OR o.name = p_client_id::text || '/USER.md'
          OR o.name = p_client_id::text || '/MEMORY.md'
          OR o.name LIKE p_client_id::text || '/memory/%.md'
        )
    ),
    'active_trigger_count', (
      SELECT count(*)::int
      FROM public.agent_triggers AS tr
      WHERE tr.client_id = p_client_id
        AND tr.enabled = true
        AND tr.trigger_type != 'pulse'
    ),
    'pending_approval_count', (
      SELECT count(*)::int
      FROM public.approval_events AS ae
      WHERE ae.client_id = p_client_id
        AND ae.status = 'pending'
    )
  )
  FROM public.clients AS c
  JOIN auth.users AS u ON u.id = c.user_id
  WHERE c.client_id = p_client_id
    AND (
      auth.role() = 'service_role'
      OR p_client_id = public.get_my_client_id()
    );
$$;

COMMENT ON FUNCTION public.get_system_reminder_context(UUID, UUID) IS
  'Builds per-turn system reminder context including pending approval count.';
```

### Step 2 — Apply migration

```bash
pnpm supabase migration up --local
```

### Step 3 — Update the system-reminder TypeScript

In `src/lib/runner/system-reminder.ts`:

1. Add `pending_approval_count` to the Zod schema (line 18):

```typescript
pending_approval_count: z.number().int().nonnegative(),
```

2. Add to `FALLBACK_CONTEXT` (line 31):

```typescript
pending_approval_count: 0,
```

3. Add to `fetchReminderContext` return (line 70):

```typescript
pending_approval_count: parsedResult.data.pending_approval_count ?? 0,
```

4. Add the reminder line in `buildSystemReminder` (after the `active_trigger_count` line, around line 102):

```typescript
if (context.pending_approval_count > 0) {
  reminderLines.push(`Pending approvals: ${context.pending_approval_count}`);
}
```

Only show the line when count > 0 — no noise when there are no pending approvals.

### Checkpoint

Run: `pnpm vitest run src/lib/runner/`
Expected: All pass. Existing system-reminder tests still pass (pending count defaults to 0, which means the line won't appear unless there are pending approvals).

### Step 4 — Commit

```bash
git add supabase/migrations/20260310000001_add_pending_approvals_to_system_reminder.sql src/lib/runner/system-reminder.ts
git commit -m "feat(pr34): show pending approval count in system-reminder"
```

---

## Task 6: Regenerate types and final verification

**Files:**
- Modify: `src/types/database.ts`

### Step 1 — Regenerate database types

```bash
pnpm supabase gen types typescript --local > src/types/database.ts
```

### Step 2 — Run full test suite

```bash
pnpm vitest run
```

Expected: All tests pass.

### Step 3 — Type check

```bash
pnpm tsc --noEmit
```

Expected: No type errors.

### Step 4 — Manual verification checklist

| Scenario | Expected |
|----------|----------|
| Agent calls `delete_contact` → approval card shows | Row in `approval_events` with `status: 'pending'` |
| User clicks Approve | Row updated to `status: 'approved'`, `resolved_at` set |
| User clicks Deny | Row updated to `status: 'denied'`, `resolved_at` set |
| System-reminder with pending approvals | Shows `Pending approvals: N` |
| System-reminder with no pending approvals | Line omitted (no noise) |
| Retry/duplicate approval ID | Unique constraint prevents double-write, no error surfaced |

### Step 5 — Final commit

```bash
git add src/types/database.ts
git commit -m "feat(pr34): regenerate types with approval_events table"
```

---

## What We DON'T Build

- No separate "Approvals Queue" page — approvals are resolved in-thread (SAFETY-02)
- No push notifications for pending approvals (deferred)
- No expiry/timeout automation — column exists, logic deferred
- No trigger-thread server-side resume path — deferred until external sends (PR 32a) ship
- No Supabase Realtime subscription for approval events (can add later if needed)
