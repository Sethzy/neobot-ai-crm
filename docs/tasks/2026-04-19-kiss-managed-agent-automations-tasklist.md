# KISS Managed-Agent Automations Revamp Implementation Plan

**Goal:** Make scheduled automations feel like one simple product feature: one schedule starts one fresh Anthropic Managed Agent run, never overlaps with itself, and always leaves a clear run history for the user.

**Architecture:** Keep the existing Anthropic Managed Agents runtime, Trigger.dev listener, and automations pages. Add one database-backed rule that blocks two live runs for the same automation, teach the trigger fire path to treat that case as a normal `busy` outcome instead of a failure, and tighten copy/status language so user automations read as recurring scheduled work while Autopilot stays separate.

**Tech Stack:** Next.js App Router, React 19, TanStack Query, Vitest, React Testing Library, Supabase Postgres migrations, Trigger.dev, Anthropic Managed Agents

**Design Input:** This tasklist is based on the 2026-04-19 product revamp decisions from chat. There is no separate standalone design doc file yet. Treat this file as the execution handoff for the agreed `keep / cut / defer` scope.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Rules For This Execution

- Use `@test-driven-development` for every production change.
- No production code before a failing test.
- Use Supabase MCP for the migration when executing for real. The contract test still reads the SQL file from disk.
- Keep scope to scheduled automations calling Anthropic Managed Agents.
- Do not redesign the automations UI.
- Do not expand RSS, webhook, or Autopilot scope in this pass.
- Do not add new abstractions unless two or more call sites clearly need them.

## Anthropic Managed Agents Compliance

Use Anthropic's official Managed Agents model as the boundary for this work:

- Keep Anthropic as the owner of the agent loop. Do not build a new local loop for planning, tool orchestration, or runtime control.
- Keep the documented primitives intact: `agent`, `environment`, `session`, and `events`.
- Keep execution event-based. Custom tools still resolve by sending `user.custom_tool_result` back into the session.
- Keep using the SDK for Managed Agents requests so the required beta header is set automatically.
- A fresh session per automation fire is allowed. Anthropic defines a session as a running agent instance for a specific task.
- If you touch startup ordering around kickoff, prefer Anthropic's documented pattern: open the session event stream first, then send the kickoff `user.message`.
- If you do not touch startup ordering in this pass, document that decision in the PR notes and keep the current persisted-event behavior intact.

## Relevant Files

**Create:**
- `supabase/migrations/20260419110000_enforce_single_running_automation_per_trigger.sql`
- `supabase/migrations/__tests__/single-running-automation-run.test.ts`
- `app/api/automations/[triggerId]/run/route.test.ts`
- `src/components/automations/__tests__/automations-table.test.tsx`
- `src/components/automations/__tests__/automation-header.test.tsx`

**Modify:**
- `src/lib/managed-agents/spawn-trigger-run.ts`
- `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
- `src/lib/triggers/executor.ts`
- `src/lib/triggers/__tests__/executor.test.ts`
- `app/api/automations/[triggerId]/run/route.ts`
- `app/(dashboard)/automations/page.tsx`
- `app/(dashboard)/automations/page.test.tsx`
- `src/components/automations/automations-table.tsx`
- `src/components/automations/automation-header.tsx`
- `AGENTS.md`

**Read For Context Only:**
- `supabase/migrations/20260301000004_create_runs_table.sql`
- `supabase/migrations/20260412130100_runs_trigger_linkage.sql`
- `src/trigger/run-trigger-agent.ts`
- `app/api/trigger/webhook/[triggerId]/route.ts`
- `app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts`

**Do Not Touch In This Pass:**
- `src/lib/triggers/rss.ts`
- `app/api/trigger/webhook/[triggerId]/route.ts`
- `app/api/settings/autopilot/route.ts`
- `src/hooks/use-trigger-runs.ts` type cleanup beyond what is required for the new behavior

## Non-Goals For This Pass

- Do not remove webhook or RSS support from the codebase.
- Do not merge Autopilot into the user automations UI.
- Do not redesign run threads vs source threads.
- Do not add retry policy changes.
- Do not add queueing, buffering, or fallback systems.
- Do not refactor unrelated managed-agent runtime code.

### Task 1: Add The Single-Flight Database Rule

**Files:**
- Create: `supabase/migrations/20260419110000_enforce_single_running_automation_per_trigger.sql`
- Create: `supabase/migrations/__tests__/single-running-automation-run.test.ts`
- Read: `supabase/migrations/20260301000004_create_runs_table.sql`
- Read: `supabase/migrations/20260412130100_runs_trigger_linkage.sql`

**Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260419110000_enforce_single_running_automation_per_trigger.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("single-running automation run migration", () => {
  it("adds a partial unique index for running rows with a trigger_id", () => {
    expect(migrationSql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_automation_per_trigger",
    );
    expect(migrationSql).toContain("ON public.runs(trigger_id)");
    expect(migrationSql).toContain(
      "WHERE trigger_id IS NOT NULL AND status = 'running'",
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run supabase/migrations/__tests__/single-running-automation-run.test.ts --reporter=verbose
```

Expected: FAIL because the new migration file does not exist yet.

**Step 3: Write the minimal migration**

```sql
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_running_automation_per_trigger
  ON public.runs(trigger_id)
  WHERE trigger_id IS NOT NULL AND status = 'running';

COMMIT;
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run supabase/migrations/__tests__/single-running-automation-run.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Commit**

```bash
git add \
  supabase/migrations/20260419110000_enforce_single_running_automation_per_trigger.sql \
  supabase/migrations/__tests__/single-running-automation-run.test.ts
git commit -m "test(automations): lock single running run per trigger"
```

### Task 2: Normalize "Already Running" At The Spawn Boundary

**Files:**
- Modify: `src/lib/managed-agents/spawn-trigger-run.ts:20-205`
- Modify: `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts:1-242`

**Step 1: Write the failing test for the duplicate-running-run constraint**

```ts
import {
  AutomationAlreadyRunningError,
  spawnTriggerRun,
} from "../spawn-trigger-run";

it("throws AutomationAlreadyRunningError when the running-run index rejects a second run", async () => {
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
  const duplicateInsertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "idx_runs_one_running_automation_per_trigger"',
        },
      }),
    }),
  };

  const brokenSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversation_threads") {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: deleteFn,
        };
      }

      if (table === "runs") {
        return { insert: vi.fn().mockReturnValue(duplicateInsertChain), delete: deleteFn };
      }

      throw new Error(`Unexpected table access: ${table}`);
    }),
  } as never;

  await expect(
    spawnTriggerRun(brokenSupabase, BASE_INPUT),
  ).rejects.toBeInstanceOf(AutomationAlreadyRunningError);

  expect(sessionsArchive).toHaveBeenCalledWith("session_abc");
  expect(deleteFn).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts -t "throws AutomationAlreadyRunningError when the running-run index rejects a second run" --reporter=verbose
```

Expected: FAIL because `spawnTriggerRun()` still throws a generic `Error`.

**Step 3: Write the minimal implementation**

```ts
export class AutomationAlreadyRunningError extends Error {
  constructor(triggerId: string) {
    super(`Automation ${triggerId} already has a running run.`);
    this.name = "AutomationAlreadyRunningError";
  }
}

if (
  error?.code === "23505"
  && error.message.includes("idx_runs_one_running_automation_per_trigger")
) {
  throw new AutomationAlreadyRunningError(input.triggerId);
}

if (error || !run) {
  throw new Error(`Failed to insert runs row: ${error?.message ?? "unknown"}`);
}
```

**Step 4: Run the focused test and the whole spawn suite**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Commit**

```bash
git add \
  src/lib/managed-agents/spawn-trigger-run.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts
git commit -m "feat(automations): classify already-running automation spawns"
```

### Task 3: Make Scheduled Fires And Manual "Run Now" Share The Same Busy Rule

**Files:**
- Modify: `src/lib/triggers/executor.ts:15-216`
- Modify: `src/lib/triggers/__tests__/executor.test.ts:1-520`
- Modify: `app/api/automations/[triggerId]/run/route.ts:1-81`
- Create: `app/api/automations/[triggerId]/run/route.test.ts`

**Step 1: Write the failing executor test for the busy case**

```ts
import { AutomationAlreadyRunningError } from "@/lib/managed-agents/spawn-trigger-run";

it("releases the claim as skipped_thread_busy when the automation is already running", async () => {
  const supabase = createMockSupabase();
  supabase.selectChain.single.mockResolvedValue({
    data: {
      id: validPayload.triggerId,
      current_run_id: validPayload.currentRunId,
      retry_count: 0,
    },
    error: null,
  });
  supabase.rpc.mockResolvedValue({ data: true, error: null });
  mockSpawnTriggerRun.mockRejectedValueOnce(
    new AutomationAlreadyRunningError(validPayload.triggerId),
  );

  const result = await executeTrigger({
    supabase: supabase as never,
    payload: validPayload,
  });

  expect(supabase.rpc).toHaveBeenCalledWith("release_trigger_claim", {
    p_next_fire_at: validPayload.nextFireAt,
    p_advance_next_fire_at: true,
    p_trigger_id: validPayload.triggerId,
    p_run_id: validPayload.currentRunId,
    p_status: "skipped_thread_busy",
  });
  expect(result).toEqual({ status: "skipped_busy" });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/triggers/__tests__/executor.test.ts -t "releases the claim as skipped_thread_busy when the automation is already running" --reporter=verbose
```

Expected: FAIL because `executeTrigger()` currently treats every spawn error as a failure.

**Step 3: Write the minimal executor change**

```ts
import {
  AutomationAlreadyRunningError,
  spawnTriggerRun,
} from "@/lib/managed-agents/spawn-trigger-run";

if (error instanceof AutomationAlreadyRunningError) {
  return finish("skipped_thread_busy", { advanceNextFireAt: true });
}
```

Apply the same branch in both the pulse path and the normal schedule/webhook path. Do not change retry behavior for real failures.

**Step 4: Run executor tests**

Run:

```bash
pnpm vitest run src/lib/triggers/__tests__/executor.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Create the failing manual route test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthenticateRequest = vi.fn();
const mockSpawnTriggerRun = vi.fn();

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: () => mockAuthenticateRequest(),
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/managed-agents/spawn-trigger-run", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/managed-agents/spawn-trigger-run")
  >("@/lib/managed-agents/spawn-trigger-run");

  return {
    ...actual,
    spawnTriggerRun: (...args: unknown[]) => mockSpawnTriggerRun(...args),
  };
});

it("returns 409 when spawnTriggerRun says the automation is already running", async () => {
  mockAuthenticateRequest.mockResolvedValue({
    kind: "success",
    supabase: mockSupabaseWithTrigger(),
  });
  mockSpawnTriggerRun.mockRejectedValueOnce(
    new AutomationAlreadyRunningError("trigger-1"),
  );

  const { POST } = await import("../route");
  const response = await POST(new Request("http://localhost"), {
    params: Promise.resolve({ triggerId: "trigger-1" }),
  });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    error: "A run is already in progress for this automation",
  });
});
```

**Step 6: Run route test to verify it fails**

Run:

```bash
pnpm vitest run "app/api/automations/[triggerId]/run/route.test.ts" --reporter=verbose
```

Expected: FAIL because the route test file is new and the route still uses a separate `runs` query.

**Step 7: Simplify the route to use the same busy rule as scheduled runs**

```ts
try {
  const result = await spawnTriggerRun(supabase, {
    clientId: trigger.client_id,
    threadId: trigger.thread_id,
    triggerType: "cron",
    invocationMessage: `${triggerEventMessage}\n\n${CRON_RUN_NUDGE}`,
    triggerId: trigger.id,
    triggerName: trigger.name ?? "Automation",
  });

  return NextResponse.json({
    runId: result.runId,
    sessionId: result.sessionId,
  });
} catch (error) {
  if (error instanceof AutomationAlreadyRunningError) {
    return jsonError("A run is already in progress for this automation", 409);
  }

  console.error("[manual-run] Failed to spawn run:", error);
  return jsonError("Failed to start run", 500);
}
```

Delete the separate `runs` pre-check from the route. The database rule and `spawnTriggerRun()` now own this behavior.

**Step 8: Run the full route + executor suite**

Run:

```bash
pnpm vitest run \
  src/lib/triggers/__tests__/executor.test.ts \
  "app/api/automations/[triggerId]/run/route.test.ts" \
  --reporter=verbose
```

Expected: PASS.

**Step 9: Commit**

```bash
git add \
  src/lib/triggers/executor.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  app/api/automations/[triggerId]/run/route.ts \
  app/api/automations/[triggerId]/run/route.test.ts
git commit -m "feat(automations): unify busy handling across trigger entry points"
```

### Task 4: Tighten The User-Facing Copy And Status Language

**Files:**
- Modify: `app/(dashboard)/automations/page.tsx:20-70`
- Modify: `app/(dashboard)/automations/page.test.tsx:1-95`
- Modify: `src/components/automations/automations-table.tsx:14-72`
- Modify: `src/components/automations/automation-header.tsx:26-84`
- Create: `src/components/automations/__tests__/automations-table.test.tsx`
- Create: `src/components/automations/__tests__/automation-header.test.tsx`

**Step 1: Update the existing page test with the new schedule-first copy**

```tsx
it("describes automations as recurring work created from chat", () => {
  render(<AutomationsPage />);

  expect(
    screen.getByText("Review recurring automations created from chat."),
  ).toBeInTheDocument();
});
```

**Step 2: Run the page test to verify it fails**

Run:

```bash
pnpm vitest run "app/(dashboard)/automations/page.test.tsx" --reporter=verbose
```

Expected: FAIL because the page still says `scheduled jobs, inbound webhooks, and RSS monitors`.

**Step 3: Write the failing table test for the new busy label**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutomationsTable } from "../automations-table";

const trigger = {
  id: "trigger-1",
  thread_id: "thread-1",
  name: "Daily briefing",
  trigger_type: "schedule",
  cron_expression: "0 9 * * *",
  payload: {},
  enabled: true,
  next_fire_at: null,
  last_fired_at: null,
  last_status: "skipped_thread_busy",
  invocation_message: null,
};

it("renders skipped_thread_busy as Busy", () => {
  render(
    <AutomationsTable
      triggers={[trigger]}
      onToggleEnabled={vi.fn()}
    />,
  );

  expect(screen.getByText("Busy")).toBeInTheDocument();
  expect(screen.queryByText("skipped thread busy")).not.toBeInTheDocument();
});
```

**Step 4: Run the table test to verify it fails**

Run:

```bash
pnpm vitest run src/components/automations/__tests__/automations-table.test.tsx --reporter=verbose
```

Expected: FAIL because `formatStatus()` still returns the raw underscored string.

**Step 5: Write the failing header test for the action label**

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationHeader } from "../automation-header";

const mockManualRun = vi.fn();
const mockSetTriggerEnabled = vi.fn();

vi.mock("@/hooks/use-trigger-runs", () => ({
  useManualRun: () => mockManualRun(),
}));

vi.mock("@/hooks/use-triggers", () => ({
  useSetTriggerEnabled: () => mockSetTriggerEnabled(),
}));

it('renders a "Run now" button', () => {
  mockManualRun.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
  mockSetTriggerEnabled.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });

  render(<AutomationHeader trigger={baseTrigger} />);

  expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument();
});
```

**Step 6: Run the header test to verify it fails**

Run:

```bash
pnpm vitest run src/components/automations/__tests__/automation-header.test.tsx --reporter=verbose
```

Expected: FAIL because the button still says `Run`.

**Step 7: Write the minimal UI changes**

```tsx
// app/(dashboard)/automations/page.tsx
<p className="mt-2 text-sm text-muted-foreground/80">
  Review recurring automations created from chat.
</p>
```

```ts
// src/components/automations/automations-table.tsx
const statusLabelMap: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  failed_permanent: "Failed",
  dispatch_failed: "Failed to start",
  invalid_cron: "Needs attention",
  invalid_rss_config: "Needs attention",
  queued: "Starting",
  skipped_thread_busy: "Busy",
  skipped_quiet_hours: "Waiting",
};

function formatStatus(trigger: Pick<AutomationTrigger, "enabled" | "last_status">): string {
  if (!trigger.enabled) return "Disabled";
  if (!trigger.last_status) return "Ready";
  return statusLabelMap[trigger.last_status] ?? "Ready";
}
```

```tsx
// src/components/automations/automation-header.tsx
{manualRun.isPending ? "Starting..." : "Run now"}
```

**Step 8: Run the UI tests**

Run:

```bash
pnpm vitest run \
  "app/(dashboard)/automations/page.test.tsx" \
  src/components/automations/__tests__/automations-table.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  --reporter=verbose
```

Expected: PASS.

**Step 9: Commit**

```bash
git add \
  app/\(dashboard\)/automations/page.tsx \
  app/\(dashboard\)/automations/page.test.tsx \
  src/components/automations/automations-table.tsx \
  src/components/automations/automation-header.tsx \
  src/components/automations/__tests__/automations-table.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx
git commit -m "feat(automations): simplify automation copy and busy status wording"
```

### Task 5: Update The Written Architecture To Match The Shipped System

**Files:**
- Modify: `AGENTS.md:21-32`

**Step 1: Write the docs change**

Replace the stale automation bullets with plain, current behavior:

```md
- **Thread serialization:** Chat still runs one active run per thread. Automation executions run in dedicated run threads linked back to the parent automation.
- **Automations:** Scheduled automations claim due trigger rows, start a fresh Anthropic Managed Agent run, and skip if that automation is already running.
- **Autopilot:** Built-in pulse scheduling remains a separate background setting from the user-visible automations list.
```

Delete the old `thread_queue_records` / `drain_thread_queue` text.

**Step 2: Verify the stale queue language is gone**

Run:

```bash
rg -n "thread_queue_records|drain_thread_queue" AGENTS.md
```

Expected: no output.

**Step 3: Run the final automation regression suite**

Run:

```bash
pnpm vitest run \
  supabase/migrations/__tests__/single-running-automation-run.test.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  "app/api/automations/[triggerId]/run/route.test.ts" \
  "app/(dashboard)/automations/page.test.tsx" \
  src/components/automations/__tests__/automations-table.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  "app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts" \
  --reporter=verbose
```

Expected: PASS.

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(automations): align architecture notes with simple managed-agent cron flow"
```

## Final Verification Checklist

- One automation cannot have two simultaneous `running` rows in `runs`.
- `spawnTriggerRun()` throws a typed busy error for that case.
- Scheduled fires mark the trigger as `skipped_thread_busy` instead of failing.
- Manual `Run now` returns `409` with the same busy message as scheduled behavior.
- The automations page reads as recurring scheduled work, not a bag of internal trigger types.
- The user sees `Busy` instead of `skipped thread busy`.
- The header action says `Run now`.
- `AGENTS.md` no longer mentions deleted queue infrastructure.
- No change in this pass reintroduces a local agent loop or bypasses the Anthropic session/event model.
- If startup ordering was touched, the implementation follows Anthropic's documented `stream -> send user.message -> process events` flow.

## Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5

Do not reorder. Each later task depends on the invariant from the earlier one.

## Skills / Tools To Use During Execution

- `@test-driven-development`
- Supabase MCP for the migration application step
- Existing Vitest + RTL test patterns already in the repo

## Handoff Notes

- Keep commits small and in order.
- Stop after any unexpected red test and fix the test setup before writing production code.
- If a test passes before the code change, the test is wrong. Rewrite it until it fails for the right reason.
- Do not clean up unrelated automation code during this pass.
- Do not touch webhook or RSS behavior except through the shared `executeTrigger()` busy path.
