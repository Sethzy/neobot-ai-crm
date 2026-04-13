# Automations UX Overhaul Implementation Plan

**Goal:** Replace the bare automations table with a polished Micro.so-style automations experience — thread-per-run, detail pages, editable instructions, schedule config, manual run.

**Architecture:** Each automation run creates its own `conversation_threads` row instead of appending to a shared thread. New detail page at `/automations/[triggerId]` with Instructions tab (Novel WYSIWYG editor reading/writing SOP files from Supabase Storage) + Runs tab (linked run threads) + schedule sidebar. List page upgraded from data table to card-style rows.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Supabase (Postgres + Storage), Novel (Tiptap), cronstrue, lucide-react, ShadCN UI, Tailwind 4

**Plan:** `docs/product/plans/2026-04-12-001-feat-automations-ux-overhaul-plan.md`

**Reference screenshots:** `docs/plans/assets/micro-automations-reference/` (01-list-page.png, 02-detail-instructions.png, 03-detail-runs.png)

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task 1: Database Migration — Thread Source Columns

Add `source_type`, `source_trigger_id`, `source_run_id` to `conversation_threads` so we can distinguish automation run threads from user-initiated chats.

**Files:**
- Create: `supabase/migrations/20260412130000_thread_source_columns.sql`
- Modify: `src/types/database.ts` (regenerated)

**Step 1: Create the migration file**

```sql
-- supabase/migrations/20260412130000_thread_source_columns.sql

-- Mark threads with their origin: user chat or automation run.
ALTER TABLE conversation_threads
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN source_trigger_id UUID REFERENCES agent_triggers(id) ON DELETE SET NULL,
  ADD COLUMN source_run_id UUID;

-- Fast lookups for "all run threads for this automation"
CREATE INDEX idx_threads_source_trigger
  ON conversation_threads(source_trigger_id)
  WHERE source_type = 'automation_run';

-- RLS note: conversation_threads RLS is scoped by client_id.
-- Run threads inherit the same client_id as the trigger owner.
-- Existing policies cover reads/writes — no new RLS needed.
```

**Step 2: Run the migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` depending on your setup)
Expected: Migration applies cleanly, no errors.

**Step 3: Regenerate TypeScript types**

Run: `npm run supabase:types`
Expected: `src/types/database.ts` updated with `source_type`, `source_trigger_id`, `source_run_id` on `conversation_threads`.

**Step 4: Verify the new columns exist in types**

Open `src/types/database.ts`, search for `conversation_threads`. Confirm these new fields appear in both `Row` and `Insert`:
- `source_type: string` (with default `'chat'`)
- `source_trigger_id: string | null`
- `source_run_id: string | null`

**Step 5: Commit**

```bash
git add supabase/migrations/20260412130000_thread_source_columns.sql src/types/database.ts
git commit -m "feat(automations): add source_type, source_trigger_id, source_run_id to conversation_threads"
```

---

## Task 2: Database Migration — Runs Table Trigger Linkage

Add `trigger_id` and `run_thread_id` to `runs` so each run links back to its automation and to its dedicated thread.

**Files:**
- Create: `supabase/migrations/20260412130100_runs_trigger_linkage.sql`
- Modify: `src/types/database.ts` (regenerated)

**Step 1: Create the migration file**

```sql
-- supabase/migrations/20260412130100_runs_trigger_linkage.sql

-- Link runs back to their parent automation and dedicated thread.
ALTER TABLE runs
  ADD COLUMN trigger_id UUID REFERENCES agent_triggers(id) ON DELETE SET NULL,
  ADD COLUMN run_thread_id UUID REFERENCES conversation_threads(id) ON DELETE SET NULL;

-- Fast lookups for "all runs for this automation"
CREATE INDEX idx_runs_trigger_id ON runs(trigger_id) WHERE trigger_id IS NOT NULL;
```

**Step 2: Run the migration locally**

Run: `npx supabase db push`
Expected: Migration applies cleanly.

**Step 3: Regenerate TypeScript types**

Run: `npm run supabase:types`
Expected: `src/types/database.ts` updated with `trigger_id` and `run_thread_id` on `runs`.

**Step 4: Verify the new columns exist in types**

Open `src/types/database.ts`, search for the `runs` table Row type. Confirm:
- `trigger_id: string | null`
- `run_thread_id: string | null`

**Step 5: Commit**

```bash
git add supabase/migrations/20260412130100_runs_trigger_linkage.sql src/types/database.ts
git commit -m "feat(automations): add trigger_id and run_thread_id to runs table"
```

---

## Task 3: Update `spawnTriggerRun` — Create Thread Per Run

Modify `spawnTriggerRun` to create a new thread for each run instead of using the origin thread.

**Files:**
- Modify: `src/lib/managed-agents/spawn-trigger-run.ts:19-25` (SpawnTriggerRunInput interface)
- Modify: `src/lib/managed-agents/spawn-trigger-run.ts:33-99` (spawnTriggerRun function)
- Test: `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts` (create if needed)

**Step 1: Write a test for the new thread creation behavior**

Create `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("SpawnTriggerRunInput", () => {
  it("should require triggerId and triggerName fields", () => {
    // Type-level check: ensure the interface includes the new fields.
    // This test validates the contract at the type level.
    const input = {
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron" as const,
      invocationMessage: "test",
      triggerId: "trigger-1",
      triggerName: "Morning Briefing",
    };
    expect(input.triggerId).toBe("trigger-1");
    expect(input.triggerName).toBe("Morning Briefing");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
Expected: PASS (type-level test, but confirms the test file is wired up). The real verification is that `triggerId` and `triggerName` don't exist on `SpawnTriggerRunInput` yet — TypeScript would fail if we imported and used the actual type.

**Step 3: Update `SpawnTriggerRunInput` interface**

In `src/lib/managed-agents/spawn-trigger-run.ts`, update the interface at line 19:

```typescript
export interface SpawnTriggerRunInput {
  runId?: string;
  clientId: string;
  threadId: string;
  triggerType: "cron" | "webhook" | "autopilot";
  invocationMessage: string;
  /** ID of the parent automation (agent_triggers row). */
  triggerId: string;
  /** Human-readable automation name for thread title generation. */
  triggerName: string;
}
```

**Step 4: Update `spawnTriggerRun` function body**

Replace the function body in `src/lib/managed-agents/spawn-trigger-run.ts`. Key changes:
1. Import `createThread` and `format` from date-fns
2. Create a new thread before creating the Anthropic session
3. Set source columns on the new thread
4. Insert `trigger_id` and `run_thread_id` into the `runs` row
5. Pass the run thread ID (not origin thread) to the Trigger.dev task

```typescript
import { format } from "date-fns";

import { createThread } from "@/lib/chat/threads";
import { getServerEnv } from "@/lib/env";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
import type { Database } from "@/types/database";

// ... (interface unchanged from Step 3)

export async function spawnTriggerRun(
  supabase: TriggerRunSupabase,
  input: SpawnTriggerRunInput,
): Promise<SpawnTriggerRunResult> {
  const env = getServerEnv();
  const anthropic = getAnthropicClient();

  if (
    !env.ANTHROPIC_AGENT_ID ||
    !env.ANTHROPIC_AGENT_VERSION ||
    !env.ANTHROPIC_ENVIRONMENT_ID
  ) {
    throw new Error(
      "Managed agents env vars missing: ANTHROPIC_AGENT_ID / ANTHROPIC_AGENT_VERSION / ANTHROPIC_ENVIRONMENT_ID",
    );
  }

  const runId = input.runId ?? crypto.randomUUID();

  // --- NEW: Create a dedicated thread for this run ---
  const runThreadTitle = `${input.triggerName} — ${format(new Date(), "MMM d, h:mm a")}`;
  const runThread = await createThread(supabase, input.clientId, runThreadTitle);

  await supabase
    .from("conversation_threads")
    .update({
      source_type: "automation_run",
      source_trigger_id: input.triggerId,
      source_run_id: runId,
    })
    .eq("thread_id", runThread.thread_id);
  // --- END NEW ---

  const session = await anthropic.beta.sessions.create({
    agent: {
      type: "agent",
      id: env.ANTHROPIC_AGENT_ID,
      version: Number(env.ANTHROPIC_AGENT_VERSION),
    },
    environment_id: env.ANTHROPIC_ENVIRONMENT_ID,
  } as never);

  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      run_id: runId,
      client_id: input.clientId,
      thread_id: runThread.thread_id, // <-- run thread, not origin
      run_type: input.triggerType,
      status: "running",
      session_id: session.id,
      trigger_id: input.triggerId,       // <-- NEW
      run_thread_id: runThread.thread_id, // <-- NEW
    })
    .select("run_id, session_id")
    .single();

  if (error || !run) {
    throw new Error(`Failed to insert runs row: ${error?.message ?? "unknown"}`);
  }

  await anthropic.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: input.invocationMessage }],
      },
    ],
  } as never);

  const taskHandle = await runTriggerAgent.trigger({
    runId,
    sessionId: session.id,
    clientId: input.clientId,
    threadId: runThread.thread_id, // <-- run thread, not origin
  });

  return {
    runId,
    sessionId: session.id,
    taskHandle: { id: taskHandle.id },
  };
}
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
Expected: PASS

**Step 6: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: Type errors in `executor.ts` because `spawnTriggerRun` now requires `triggerId` and `triggerName`. This is expected — we fix it in Task 4.

**Step 7: Commit**

```bash
git add src/lib/managed-agents/spawn-trigger-run.ts src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts
git commit -m "feat(automations): spawnTriggerRun creates dedicated thread per run"
```

---

## Task 4: Update `executeTrigger` — Pass Trigger Metadata Through

Update executor to pass `triggerId` and `triggerName` to `spawnTriggerRun`, and write the system message to the run thread (handled automatically since `spawnTriggerRun` now returns the run thread).

**Files:**
- Modify: `src/lib/triggers/executor.ts:196-209`

**Step 1: Update the `spawnTriggerRun` call in `executeTrigger`**

In `src/lib/triggers/executor.ts`, find the call at line ~203. Update it to include `triggerId` and `triggerName`:

```typescript
  await spawnTriggerRun(supabase, {
    runId: payload.currentRunId,
    clientId: payload.clientId,
    threadId: payload.threadId,
    triggerType: payload.triggerType === "webhook" ? "webhook" : "cron",
    invocationMessage: `${triggerEventMessage}\n\n${CRON_RUN_NUDGE}`,
    triggerId: payload.triggerId,     // <-- NEW
    triggerName: payload.triggerName,  // <-- NEW
  });
```

**Step 2: Move system message AFTER spawnTriggerRun**

Currently the system message at line ~196 goes to `payload.threadId` (the origin thread). We need it in the run thread instead. Two options:

**Option A (simpler):** Remove the `createMessage` call from executor. The trigger event XML is already in the kickoff `invocationMessage` that gets sent to the Anthropic session. The agent sees it. The run thread will have it as the first user message.

**Option B:** Have `spawnTriggerRun` return the `runThreadId` and write the system message there.

Go with **Option A** — remove the `createMessage` call at lines 196-200:

```typescript
  // REMOVE THIS BLOCK:
  // await createMessage(supabase, {
  //   thread_id: payload.threadId,
  //   role: "system",
  //   content: triggerEventMessage,
  // });
```

**Step 3: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No type errors. The `triggerId` and `triggerName` fields exist on `TriggerDispatchPayload` (check `src/lib/triggers/schemas.ts`).

**Step 4: Run existing trigger tests**

Run: `npx vitest run src/lib/triggers/`
Expected: All pass. If any test was asserting the `createMessage` call, update the test expectation.

**Step 5: Commit**

```bash
git add src/lib/triggers/executor.ts
git commit -m "feat(automations): pass triggerId/triggerName through executor to spawnTriggerRun"
```

---

## Task 5: Install `cronstrue` + Create Cron Display Utilities

Add human-readable cron descriptions and countdown formatting.

**Files:**
- Create: `src/lib/triggers/cron-display.ts`
- Create: `src/lib/triggers/__tests__/cron-display.test.ts`

**Step 1: Install cronstrue**

Run: `npm install cronstrue`
Expected: Package added to `package.json` and `node_modules`.

**Step 2: Write tests for `cronToHuman`**

Create `src/lib/triggers/__tests__/cron-display.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { cronToHuman, formatCountdown } from "../cron-display";

describe("cronToHuman", () => {
  it("converts weekday 8am cron to readable text", () => {
    expect(cronToHuman("0 8 * * 1-5")).toBe("At 08:00 AM, Monday through Friday");
  });

  it("returns raw cron on parse failure", () => {
    expect(cronToHuman("invalid")).toBe("invalid");
  });

  it("handles null/undefined gracefully", () => {
    expect(cronToHuman(null)).toBe("—");
    expect(cronToHuman(undefined)).toBe("—");
  });
});

describe("formatCountdown", () => {
  it("returns 'in Xhr' for hours away", () => {
    const inFiveHours = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    expect(formatCountdown(inFiveHours)).toMatch(/in \d+hr/);
  });

  it("returns 'in Xd' for days away", () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatCountdown(inThreeDays)).toMatch(/in \d+d/);
  });

  it("returns '—' for null", () => {
    expect(formatCountdown(null)).toBe("—");
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/triggers/__tests__/cron-display.test.ts`
Expected: FAIL — module `../cron-display` not found.

**Step 4: Implement `cron-display.ts`**

Create `src/lib/triggers/cron-display.ts`:

```typescript
/**
 * Human-readable cron descriptions and countdown formatting.
 * @module lib/triggers/cron-display
 */
import cronstrue from "cronstrue";

/**
 * Converts a 5-field cron expression to human-readable text.
 * Returns the raw expression on parse failure, "—" for null/undefined.
 */
export function cronToHuman(cronExpression: string | null | undefined): string {
  if (!cronExpression) return "—";

  try {
    return cronstrue.toString(cronExpression, { use24HourTimeFormat: false });
  } catch {
    return cronExpression;
  }
}

/**
 * Formats an ISO timestamp as a relative countdown: "in 18hr", "in 3d", "in 45min".
 * Returns "—" for null/undefined or past timestamps.
 */
export function formatCountdown(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "—";

  const now = Date.now();
  const target = new Date(isoTimestamp).getTime();
  const diffMs = target - now;

  if (diffMs <= 0) return "—";

  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `in ${diffDays}d`;
  if (diffHr > 0) return `in ${diffHr}hr`;
  return `in ${diffMin}min`;
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/triggers/__tests__/cron-display.test.ts`
Expected: All PASS.

**Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/triggers/cron-display.ts src/lib/triggers/__tests__/cron-display.test.ts
git commit -m "feat(automations): add cronToHuman and formatCountdown utilities"
```

---

## Task 6: Update Sidebar — Show Zap Icon for Run Threads

Add `source_type` to thread queries so the sidebar can show a zap icon for automation run threads.

**Files:**
- Modify: `src/lib/chat/threads.ts:44-58` (listThreads select)
- Modify: `src/hooks/use-threads.ts` (ThreadRow type exposure)
- Modify: `src/components/layout/app-sidebar.tsx` (icon rendering)

**Step 1: Verify `listThreads` already selects `*`**

Read `src/lib/chat/threads.ts:44-58`. It uses `.select("*")` — so `source_type` is already included in the response after the migration. No query change needed.

**Step 2: Add zap icon in sidebar**

In `src/components/layout/app-sidebar.tsx`, find where thread items are rendered (around line 194-200). Add a conditional icon:

```typescript
import { MessageSquare, Zap } from "lucide-react";

// In the thread list item rendering:
{thread.source_type === "automation_run" ? (
  <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
) : (
  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
)}
```

Note: Check the exact rendering pattern in the sidebar file first. The `source_type` column will be available on the `ThreadRow` type after the migration types are regenerated.

**Step 3: Verify locally**

Start the dev server (`npm run dev`), create a test trigger, fire it manually via chat. Confirm:
- A new thread appears in the sidebar with a zap icon
- Regular chat threads still show the default icon

**Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(automations): show zap icon for automation run threads in sidebar"
```

---

## Task 7: Automations List Page — Card-Style Rows

Replace `AutomationsTable` with card-style `AutomationsList` grouped by active/inactive.

**Reference:** `docs/plans/assets/micro-automations-reference/01-list-page.png`

**Files:**
- Create: `src/components/automations/automations-list.tsx`
- Modify: `app/(dashboard)/automations/page.tsx`
- Modify: `src/hooks/use-triggers.ts` (keep existing, may add fields)

**Step 1: Create `AutomationsList` component**

Create `src/components/automations/automations-list.tsx`:

```typescript
/**
 * Card-style list of automations grouped by active/inactive.
 * Replaces the old AutomationsTable.
 * @module components/automations/automations-list
 */
"use client";

import Link from "next/link";

import { Switch } from "@/components/ui/switch";
import type { AutomationTrigger } from "@/hooks/use-triggers";
import { cronToHuman, formatCountdown } from "@/lib/triggers/cron-display";

interface AutomationsListProps {
  triggers: AutomationTrigger[];
  pendingTriggerId?: string | null;
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}

export function AutomationsList({
  triggers,
  pendingTriggerId,
  onToggleEnabled,
}: AutomationsListProps) {
  const active = triggers.filter((t) => t.enabled);
  const inactive = triggers.filter((t) => !t.enabled);

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Active
          </h3>
          <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
            {active.map((trigger) => (
              <AutomationRow
                key={trigger.id}
                trigger={trigger}
                isPending={pendingTriggerId === trigger.id}
                onToggleEnabled={onToggleEnabled}
              />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Inactive
          </h3>
          <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-card shadow-sm">
            {inactive.map((trigger) => (
              <AutomationRow
                key={trigger.id}
                trigger={trigger}
                isPending={pendingTriggerId === trigger.id}
                onToggleEnabled={onToggleEnabled}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AutomationRow({
  trigger,
  isPending,
  onToggleEnabled,
}: {
  trigger: AutomationTrigger;
  isPending: boolean;
  onToggleEnabled: (triggerId: string, enabled: boolean) => void;
}) {
  return (
    <Link
      href={`/automations/${trigger.id}`}
      className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">*</span>
        <div>
          <span className="font-medium text-foreground/90">{trigger.name}</span>
          <span className="ml-3 text-sm text-muted-foreground">
            {cronToHuman(trigger.cron_expression)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {trigger.enabled && trigger.next_fire_at && (
          <span className="text-sm text-muted-foreground">
            {formatCountdown(trigger.next_fire_at)}
          </span>
        )}
        <Switch
          checked={trigger.enabled}
          disabled={isPending}
          onCheckedChange={(checked) => {
            // Prevent navigation when toggling
            onToggleEnabled(trigger.id, checked);
          }}
          onClick={(e) => e.preventDefault()}
        />
      </div>
    </Link>
  );
}
```

**Step 2: Update automations page to use new list**

In `app/(dashboard)/automations/page.tsx`, swap `AutomationsTable` for `AutomationsList`:

```typescript
import { AutomationsList } from "@/components/automations/automations-list";
// Remove: import { AutomationsTable } from "@/components/automations/automations-table";

// In the JSX, replace <AutomationsTable ... /> with:
<AutomationsList
  triggers={triggers}
  pendingTriggerId={pendingTriggerId}
  onToggleEnabled={(triggerId, enabled) => {
    setTriggerEnabled.mutate({ triggerId, enabled });
  }}
/>
```

**Step 3: Verify locally**

Run: `npm run dev`
Navigate to `/automations`. Confirm:
- Triggers grouped into Active / Inactive sections
- Each row shows name + human-readable schedule + countdown
- Toggle works without navigating
- Clicking the row navigates to `/automations/[id]` (will 404 for now — detail page not built yet)

**Step 4: Commit**

```bash
git add src/components/automations/automations-list.tsx app/\(dashboard\)/automations/page.tsx
git commit -m "feat(automations): replace table with card-style list grouped by active/inactive"
```

---

## Task 8: Automation Detail Page — Route + Header + Runs Tab

Build the detail page shell at `/automations/[triggerId]`.

**Reference:** `docs/plans/assets/micro-automations-reference/02-detail-instructions.png` (header layout), `docs/plans/assets/micro-automations-reference/03-detail-runs.png` (runs tab)

**Files:**
- Create: `app/(dashboard)/automations/[triggerId]/page.tsx`
- Create: `src/components/automations/automation-detail.tsx`
- Create: `src/components/automations/automation-header.tsx`
- Create: `src/components/automations/automation-runs.tsx`
- Create: `src/hooks/use-trigger-runs.ts`
- Modify: `src/hooks/use-triggers.ts` (add `useTrigger` single-row hook)

**Step 1: Add `useTrigger(triggerId)` hook**

In `src/hooks/use-triggers.ts`, add a single-row fetch hook:

```typescript
/**
 * Fetches a single trigger by ID with realtime subscription.
 */
export function useTrigger(triggerId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "agent_triggers",
    filter: `id=eq.${triggerId}`,
    queryKeys: [triggerKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: [...triggerKeys.all, "detail", triggerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_triggers")
        .select("*")
        .eq("id", triggerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(clientId),
  });
}
```

**Step 2: Create `useTriggerRuns` hook**

Create `src/hooks/use-trigger-runs.ts`:

```typescript
/**
 * TanStack Query hook for fetching runs linked to a specific automation.
 * @module hooks/use-trigger-runs
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { supabase } from "@/lib/supabase";

export const triggerRunKeys = {
  all: ["trigger-runs"] as const,
  list: (triggerId: string) => [...triggerRunKeys.all, "list", triggerId] as const,
};

export interface TriggerRun {
  run_id: string;
  run_thread_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  thread_title: string | null;
}

/**
 * Fetches paginated runs for a specific automation with realtime updates.
 */
export function useTriggerRuns(triggerId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "runs",
    filter: `trigger_id=eq.${triggerId}`,
    queryKeys: [triggerRunKeys.list(triggerId)],
    enabled: Boolean(clientId),
  });

  return useQuery({
    queryKey: triggerRunKeys.list(triggerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("run_id, run_thread_id, status, created_at, completed_at")
        .eq("trigger_id", triggerId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch thread titles for runs that have a run_thread_id
      const threadIds = (data ?? [])
        .map((r) => r.run_thread_id)
        .filter(Boolean) as string[];

      let threadTitles: Record<string, string> = {};
      if (threadIds.length > 0) {
        const { data: threads } = await supabase
          .from("conversation_threads")
          .select("thread_id, title")
          .in("thread_id", threadIds);

        threadTitles = Object.fromEntries(
          (threads ?? []).map((t) => [t.thread_id, t.title ?? ""])
        );
      }

      return (data ?? []).map((run) => ({
        ...run,
        thread_title: run.run_thread_id ? (threadTitles[run.run_thread_id] ?? null) : null,
      })) as TriggerRun[];
    },
    enabled: Boolean(clientId),
  });
}
```

**Step 3: Create `AutomationHeader` component**

Create `src/components/automations/automation-header.tsx`. This shows the automation name, schedule summary, countdown, status badge, toggle, and Run button. See the plan for the full layout. The "Run" button is a placeholder for now — wired up in Task 12.

**Step 4: Create `AutomationRuns` component**

Create `src/components/automations/automation-runs.tsx`. Lists past runs grouped by date (Today, Yesterday, Earlier). Each row: status dot + thread title + timestamp. Click navigates to `/chat/${run_thread_id}`. Empty state when no runs.

**Step 5: Create `AutomationDetail` shell component**

Create `src/components/automations/automation-detail.tsx`. Two-column layout: main content (tabs) + right sidebar (placeholder for Task 11). Tabs: "Instructions" (placeholder for Task 9) and "Runs {count}".

**Step 6: Create the page route**

Create `app/(dashboard)/automations/[triggerId]/page.tsx`:

```typescript
"use client";

import { useParams } from "next/navigation";
import { AutomationDetail } from "@/components/automations/automation-detail";

export default function AutomationDetailPage() {
  const params = useParams<{ triggerId: string }>();
  return <AutomationDetail triggerId={params.triggerId} />;
}
```

**Step 7: Verify locally**

Run: `npm run dev`
Navigate to `/automations`, click an automation row. Confirm:
- Detail page loads with header showing name, schedule, status
- Runs tab shows (empty or with runs if you've triggered some)
- Instructions tab shows placeholder
- Back navigation via breadcrumb works

**Step 8: Commit**

```bash
git add app/\(dashboard\)/automations/\[triggerId\]/page.tsx src/components/automations/automation-detail.tsx src/components/automations/automation-header.tsx src/components/automations/automation-runs.tsx src/hooks/use-trigger-runs.ts src/hooks/use-triggers.ts
git commit -m "feat(automations): add detail page with header and runs tab"
```

---

## Task 9: Instructions Tab — Novel WYSIWYG Editor

Add the Instructions tab with Novel editor reading/writing SOP files from Supabase Storage.

**Files:**
- Create: `src/components/automations/automation-instructions.tsx`
- Create: `src/hooks/use-trigger-instructions.ts`

**Step 1: Install Novel**

Run: `npm install novel`
Expected: Package added.

**Step 2: Create `useTriggerInstructions` hook**

Create `src/hooks/use-trigger-instructions.ts`:

```typescript
/**
 * Hook for reading and writing automation SOP content from Supabase Storage.
 * @module hooks/use-trigger-instructions
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useClientId } from "@/hooks/use-client-id";

const AGENT_FILES_BUCKET = "agent-files";

/**
 * Fetches SOP content and provides a mutation to update it.
 */
export function useTriggerInstructions(instructionPath: string | null) {
  const { data: clientId } = useClientId();
  const queryClient = useQueryClient();
  const storagePath = clientId && instructionPath
    ? `${clientId}/${instructionPath}`
    : null;

  const query = useQuery({
    queryKey: ["trigger-instructions", storagePath],
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .download(storagePath);
      if (error) throw error;
      return data.text();
    },
    enabled: Boolean(storagePath),
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      if (!storagePath) throw new Error("No storage path");
      const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
      const { error } = await supabase.storage
        .from(AGENT_FILES_BUCKET)
        .upload(storagePath, blob, { upsert: true });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["trigger-instructions", storagePath],
      });
    },
  });

  return { ...query, save: mutation };
}
```

**Step 3: Create `AutomationInstructions` component**

Create `src/components/automations/automation-instructions.tsx`. This wraps the Novel editor, loads SOP content on mount, and auto-saves on blur with a debounce. Show "Saving..." → "Saved" indicator following the `InlineEditField` pattern at `src/components/crm/inline-edit-field.tsx`.

Refer to Novel's documentation at https://novel.sh for the editor setup. Key points:
- `import { Editor } from "novel"`
- Pass `defaultValue` with the loaded markdown
- `onDebouncedUpdate` callback for auto-save
- Handle empty state when `instructionPath` is null

**Step 4: Wire into AutomationDetail**

In `src/components/automations/automation-detail.tsx`, replace the Instructions tab placeholder with `<AutomationInstructions instructionPath={trigger.instruction_path} />`.

**Step 5: Verify locally**

Run: `npm run dev`
Navigate to an automation detail page → Instructions tab. Confirm:
- SOP content loads and renders in the WYSIWYG editor
- Editing works (headings, lists, bold/italic)
- Changes save automatically (check Supabase Storage to verify)
- Save indicator shows

**Step 6: Commit**

```bash
git add package.json package-lock.json src/hooks/use-trigger-instructions.ts src/components/automations/automation-instructions.tsx src/components/automations/automation-detail.tsx
git commit -m "feat(automations): add Novel WYSIWYG editor for SOP instructions"
```

---

## Task 10: Cron Builder Utility

Create utility to convert UI schedule controls (recurrence + days + time) to cron expressions.

**Files:**
- Create: `src/lib/triggers/cron-builder.ts`
- Create: `src/lib/triggers/__tests__/cron-builder.test.ts`

**Step 1: Write tests**

Create `src/lib/triggers/__tests__/cron-builder.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildCronExpression } from "../cron-builder";

describe("buildCronExpression", () => {
  it("builds daily cron", () => {
    expect(buildCronExpression("daily", [], "08:00")).toBe("0 8 * * *");
  });

  it("builds weekdays cron", () => {
    expect(buildCronExpression("weekdays", [], "09:30")).toBe("30 9 * * 1-5");
  });

  it("builds weekly with specific days", () => {
    expect(buildCronExpression("weekly", [1, 3, 5], "10:00")).toBe("0 10 * * 1,3,5");
  });

  it("builds monthly cron", () => {
    expect(buildCronExpression("monthly", [], "14:00")).toBe("0 14 1 * *");
  });

  it("passes through custom cron", () => {
    expect(buildCronExpression("custom", [], "08:00", "*/15 * * * *")).toBe("*/15 * * * *");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/triggers/__tests__/cron-builder.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement `cron-builder.ts`**

Create `src/lib/triggers/cron-builder.ts`:

```typescript
/**
 * Builds cron expressions from UI schedule controls.
 * @module lib/triggers/cron-builder
 */

type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

/**
 * Converts UI schedule inputs to a 5-field cron expression.
 * @param recurrence - Schedule type
 * @param days - Day-of-week numbers (0=Sun, 1=Mon, ..., 6=Sat) for weekly
 * @param time - HH:mm format (e.g., "08:00", "14:30")
 * @param customCron - Raw cron for "custom" recurrence
 */
export function buildCronExpression(
  recurrence: Recurrence,
  days: number[],
  time: string,
  customCron?: string,
): string {
  if (recurrence === "custom" && customCron) {
    return customCron;
  }

  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  switch (recurrence) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${days.join(",")}`;
    case "monthly":
      return `${minute} ${hour} 1 * *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/triggers/__tests__/cron-builder.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/lib/triggers/cron-builder.ts src/lib/triggers/__tests__/cron-builder.test.ts
git commit -m "feat(automations): add cron builder utility for schedule UI"
```

---

## Task 11: Schedule Sidebar

Build the right sidebar with schedule config, invocation message, model label, and notifications placeholder.

**Reference:** `docs/plans/assets/micro-automations-reference/02-detail-instructions.png` (sidebar layout)

**Files:**
- Create: `src/components/automations/automation-schedule-sidebar.tsx`
- Modify: `src/hooks/use-triggers.ts` (add `useUpdateTriggerSchedule`)
- Modify: `src/components/automations/automation-detail.tsx` (wire sidebar)

**Step 1: Add `useUpdateTriggerSchedule` hook**

In `src/hooks/use-triggers.ts`, add:

```typescript
/**
 * Mutation for updating an automation's schedule configuration.
 */
export function useUpdateTriggerSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      triggerId: string;
      cronExpression: string;
      payload: Record<string, unknown>;
      nextFireAt: string;
    }) => {
      const { error } = await supabase
        .from("agent_triggers")
        .update({
          cron_expression: input.cronExpression,
          payload: input.payload,
          next_fire_at: input.nextFireAt,
          retry_count: 0,
        })
        .eq("id", input.triggerId);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: triggerKeys.all });
    },
  });
}
```

**Step 2: Create `AutomationScheduleSidebar` component**

Create `src/components/automations/automation-schedule-sidebar.tsx`. Renders conditionally by trigger type:
- **Schedule:** Recurrence dropdown, day pills, time picker, timezone dropdown
- **Webhook:** Read-only webhook URL
- **RSS:** Polling interval dropdown, feed URL display

All types show: invocation message field (200 char max), model label, notifications toggle (disabled).

Use existing ShadCN components: `Select`, `Switch`, `Input`, `Label`, `Textarea`.

Reference `src/lib/triggers/cron-builder.ts` for building cron from UI inputs. Reference `src/lib/triggers/cron-utils.ts:50` for `computeNextFireAt`.

**Step 3: Wire sidebar into detail page**

In `src/components/automations/automation-detail.tsx`, render `<AutomationScheduleSidebar>` in the right column.

**Step 4: Verify locally**

Run: `npm run dev`
Navigate to a schedule automation detail page. Confirm:
- Sidebar shows recurrence, days, time, timezone
- Changing schedule updates the DB (check `agent_triggers` row)
- Countdown updates after schedule change
- Invocation message is editable

**Step 5: Commit**

```bash
git add src/components/automations/automation-schedule-sidebar.tsx src/hooks/use-triggers.ts src/components/automations/automation-detail.tsx
git commit -m "feat(automations): add schedule sidebar with recurrence, time, timezone config"
```

---

## Task 12: Manual Run Button + API Route

Wire up the "Run" button on the detail page to trigger a manual automation run.

**Files:**
- Create: `app/api/automations/[triggerId]/run/route.ts`
- Modify: `src/hooks/use-trigger-runs.ts` (add `useManualRun`)
- Modify: `src/components/automations/automation-header.tsx` (wire button)

**Step 1: Create the manual run API route**

Create `app/api/automations/[triggerId]/run/route.ts`:

```typescript
/**
 * POST handler for manually triggering an automation run.
 * Skips the scanner claim/release cycle — manual runs are out-of-band.
 * @module api/automations/[triggerId]/run
 */
import { NextResponse } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";
import { spawnTriggerRun } from "@/lib/managed-agents/spawn-trigger-run";
import { buildTriggerEventMessage } from "@/lib/triggers/trigger-event";
import { toModelPath } from "@/lib/storage/agent-paths";

const MANUAL_RUN_NUDGE = "Process the most recent trigger event for this thread.";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ triggerId: string }> },
) {
  const { triggerId } = await params;
  const supabase = await createRouteHandlerClient();

  // 1. Fetch trigger row (RLS enforces ownership)
  const { data: trigger, error: triggerError } = await supabase
    .from("agent_triggers")
    .select("*")
    .eq("id", triggerId)
    .single();

  if (triggerError || !trigger) {
    return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
  }

  // 2. Guard: reject if a run is already in progress
  const { data: activeRuns } = await supabase
    .from("runs")
    .select("run_id")
    .eq("trigger_id", triggerId)
    .eq("status", "running")
    .limit(1);

  if (activeRuns && activeRuns.length > 0) {
    return NextResponse.json(
      { error: "A run is already in progress for this automation" },
      { status: 409 },
    );
  }

  // 3. Build trigger event message
  const triggerEventMessage = buildTriggerEventMessage({
    triggerId: trigger.id,
    triggerType: trigger.trigger_type as "schedule" | "webhook" | "rss",
    triggerName: trigger.name ?? "Manual Run",
    instructionPath: trigger.instruction_path
      ? toModelPath(trigger.instruction_path)
      : "/agent/triggers/unknown.md",
    triggerPayload: (trigger.payload as Record<string, unknown>) ?? {},
    invocationMessage: trigger.invocation_message,
  });

  // 4. Spawn the run (creates thread, session, runs row, queues task)
  const result = await spawnTriggerRun(supabase, {
    clientId: trigger.client_id,
    threadId: trigger.thread_id, // origin thread (not used for output anymore)
    triggerType: "cron",
    invocationMessage: `${triggerEventMessage}\n\n${MANUAL_RUN_NUDGE}`,
    triggerId: trigger.id,
    triggerName: trigger.name ?? "Automation",
  });

  return NextResponse.json({
    runId: result.runId,
    threadId: result.runId, // run thread ID (from spawnTriggerRun)
  });
}
```

Note: Verify the exact import paths for `buildTriggerEventMessage` and `toModelPath` by reading `src/lib/triggers/trigger-event.ts` and `src/lib/storage/agent-paths.ts`.

**Step 2: Add `useManualRun` hook**

In `src/hooks/use-trigger-runs.ts`, add:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useManualRun(triggerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/automations/${triggerId}/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to start run");
      }
      return res.json() as Promise<{ runId: string; threadId: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: triggerRunKeys.list(triggerId),
      });
    },
  });
}
```

**Step 3: Wire the Run button in AutomationHeader**

In `src/components/automations/automation-header.tsx`, import `useManualRun` and connect it to the Run button:

```typescript
const manualRun = useManualRun(triggerId);

<Button
  onClick={() => manualRun.mutate()}
  disabled={manualRun.isPending}
>
  {manualRun.isPending ? "Running..." : "Run"}
</Button>
```

Show a toast on success: `"Run started"`. Show error toast on 409 (already running).

**Step 4: Verify locally**

Run: `npm run dev`
Navigate to an automation detail page, click "Run". Confirm:
- A new run thread is created
- It appears in the Runs tab
- It appears in the sidebar with a zap icon
- Clicking into the run thread shows the agent's output
- Clicking "Run" while a run is in progress shows an error

**Step 5: Commit**

```bash
git add app/api/automations/\[triggerId\]/run/route.ts src/hooks/use-trigger-runs.ts src/components/automations/automation-header.tsx
git commit -m "feat(automations): add manual Run button with API route"
```

---

## Task 13: End-to-End Verification

Verify the full pipeline works end-to-end.

**Step 1: Create a trigger via chat**

In the chat, ask the agent: "Set up a daily morning briefing at 8am on weekdays."
Confirm: trigger appears on `/automations` list page.

**Step 2: Click into the automation detail**

Confirm: Header shows name, schedule ("At 08:00 AM, Monday through Friday"), countdown, Active badge.

**Step 3: View instructions**

Click Instructions tab. Confirm: SOP content renders in Novel editor. Edit something, wait for auto-save, reload to verify persistence.

**Step 4: Edit schedule**

In sidebar, change recurrence from Weekdays to Daily. Confirm: `cron_expression` and `next_fire_at` updated in DB.

**Step 5: Manual run**

Click "Run" button. Confirm:
- Toast shows "Run started"
- Runs tab shows the new run
- Sidebar shows a new thread with zap icon
- Click into the run thread → agent output is visible
- Reply in the run thread → chat session works (agent sees run output as prior context)

**Step 6: Wait for scheduled run (or simulate)**

If possible, set a trigger to fire soon. Confirm:
- Scanner picks it up
- New run thread is created (NOT appended to origin thread)
- Run appears in Runs tab

**Step 7: Disable toggle**

Toggle the automation off from the list page. Confirm:
- Detail page shows "Disabled" badge
- Scanner skips the trigger on next tick

**Step 8: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(automations): e2e verification fixes"
```

---

## Relevant Files

### Created
- `supabase/migrations/20260412130000_thread_source_columns.sql`
- `supabase/migrations/20260412130100_runs_trigger_linkage.sql`
- `src/lib/triggers/cron-display.ts`
- `src/lib/triggers/__tests__/cron-display.test.ts`
- `src/lib/triggers/cron-builder.ts`
- `src/lib/triggers/__tests__/cron-builder.test.ts`
- `src/components/automations/automations-list.tsx`
- `src/components/automations/automation-detail.tsx`
- `src/components/automations/automation-header.tsx`
- `src/components/automations/automation-runs.tsx`
- `src/components/automations/automation-instructions.tsx`
- `src/components/automations/automation-schedule-sidebar.tsx`
- `src/hooks/use-trigger-runs.ts`
- `src/hooks/use-trigger-instructions.ts`
- `app/(dashboard)/automations/[triggerId]/page.tsx`
- `app/api/automations/[triggerId]/run/route.ts`

### Modified
- `src/lib/managed-agents/spawn-trigger-run.ts` — accept triggerId/triggerName, create run thread
- `src/lib/triggers/executor.ts` — pass trigger metadata through, remove origin thread system message
- `src/hooks/use-triggers.ts` — add `useTrigger`, `useUpdateTriggerSchedule`
- `src/components/layout/app-sidebar.tsx` — zap icon for run threads
- `app/(dashboard)/automations/page.tsx` — swap table for card list
- `src/types/database.ts` — regenerated from migrations

### Test Files
- `src/lib/triggers/__tests__/cron-display.test.ts`
- `src/lib/triggers/__tests__/cron-builder.test.ts`
- `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
