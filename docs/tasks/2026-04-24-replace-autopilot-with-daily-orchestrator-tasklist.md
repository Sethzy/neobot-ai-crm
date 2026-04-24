# Replace Autopilot with Daily Orchestrator Implementation Plan

**Goal:** Replace the hidden Autopilot/pulse system with one normal seeded automation, `Daily Orchestrator`, that is visible in Automations, runs every day at `8:00 AM` local time, and uses the existing per-run thread model.

**Architecture:** Split the current bootstrap into two concerns: database bootstrap only guarantees the primary `Main` chat thread, while an authenticated app bootstrap seeds `Daily Orchestrator` exactly once with a storage-backed prompt and the browser timezone. Remove all `pulse`, quiet-hours, and Autopilot-specific runtime/UI branches so the default automation executes through the normal `schedule` path and is managed like any other automation.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Vitest, React Testing Library, Supabase Postgres migrations, Supabase Storage, Anthropic Managed Agents

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Design Input

- Origin design: `docs/plans/2026-04-24-daily-orchestrator-design.md`
- Technical plan: `docs/product/plans/2026-04-24-001-feat-replace-autopilot-with-daily-orchestrator-plan.md`

## Rules For This Execution

- Use `@test-driven-development` for every production change.
- Use `@nextjs-best-practices` for the App Router route/layout work.
- Use `@requesting-code-review` before merge.
- Use Supabase MCP for the migration when executing for real. The migration contract tests still read the SQL from disk.
- Keep the current thread model: one automation row, one new thread per run.
- Do not add a template gallery, child automations, same-day one-off automations, quiet hours, or a persistent automation thread.
- Keep the primary `Main` thread bootstrap intact. Do not break `/agent`, Telegram pairing, or default messaging fallbacks.
- Any managed-agent smoke test must use `claude-haiku-4-5`, never Sonnet or Opus.
- Commit after every parent task. Replace `prXX` in the sample commit messages with the real PR number.

## Relevant Files

**Create:**
- `supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql`
- `supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts`
- `app/api/automations/bootstrap-default/route.ts`
- `app/api/automations/bootstrap-default/route.test.ts`
- `src/lib/automations/default-daily-orchestrator.ts`
- `src/lib/automations/__tests__/default-daily-orchestrator.test.ts`
- `src/components/layout/default-automation-bootstrap.tsx`
- `src/components/layout/default-automation-bootstrap.test.tsx`
- `app/settings/agent/general/page.test.tsx`

**Modify:**
- `src/types/database.ts`
- `src/types/__tests__/database.test.ts`
- `app/(dashboard)/layout.tsx`
- `app/(dashboard)/layout.test.tsx`
- `src/lib/triggers/schemas.ts`
- `src/lib/triggers/__tests__/schemas.test.ts`
- `src/lib/triggers/executor.ts`
- `src/lib/triggers/__tests__/executor.test.ts`
- `src/lib/triggers/scanner.ts`
- `src/lib/triggers/__tests__/scanner.test.ts`
- `src/lib/runner/run-types.ts`
- `src/lib/managed-agents/spawn-trigger-run.ts`
- `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
- `src/lib/managed-agents/tools/triggers/setup-trigger.ts`
- `src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts`
- `src/lib/managed-agents/tools/triggers/manage-active-triggers.ts`
- `src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts`
- `src/lib/triggers/automation-trigger-query.ts`
- `src/hooks/use-triggers.ts`
- `app/(dashboard)/automations/automations-page-client.tsx`
- `src/components/automations/automations-list.tsx`
- `src/components/automations/__tests__/automations-list.test.tsx`
- `src/components/automations/automation-header.tsx`
- `src/components/automations/__tests__/automation-header.test.tsx`
- `src/components/automations/automation-detail.tsx`
- `src/components/automations/__tests__/automation-detail.test.tsx`
- `app/settings/agent/general/page.tsx`
- `app/(dashboard)/agent/page.test.tsx`
- `src/lib/settings/profile/messaging-preferences.test.ts`
- `app/api/webhook/telegram/__tests__/route.test.ts`
- `docs/qa/08-triggers-and-automations.md`
- `AGENTS.md`

**Delete:**
- `supabase/migrations/__tests__/autopilot-pulse.test.ts`
- `supabase/verification/pr19_autopilot_bootstrap_check.sql`
- `app/api/settings/autopilot/route.ts`
- `src/components/settings/autopilot-card.tsx`
- `src/lib/autopilot/constants.ts`
- `src/lib/autopilot/quiet-hours.ts`
- `src/lib/autopilot/__tests__/constants.test.ts`
- `src/lib/autopilot/__tests__/quiet-hours.test.ts`

**Read For Context Only:**
- `supabase/migrations/20260306030000_create_autopilot_config.sql`
- `supabase/migrations/20260306030001_add_pulse_trigger_type.sql`
- `supabase/migrations/20260306030002_bootstrap_autopilot_on_signup.sql`
- `supabase/migrations/20260422110000_rename_primary_thread_agent_to_main.sql`
- `src/lib/chat/threads.ts`
- `app/(dashboard)/agent/page.tsx`
- `src/lib/settings/profile/messaging-preferences.ts`
- `app/api/webhook/telegram/route.ts`
- `src/lib/storage/agent-files.ts`
- `src/lib/automations/instruction-paths.ts`

## Non-Goals For This Pass

- Do not redesign the automations UI.
- Do not change webhook or RSS product behavior beyond removing dead `pulse` branches.
- Do not change the approval model.
- Do not add queueing, retries, or meta-scheduling to `Daily Orchestrator`.
- Do not expand this into a marketing-site rewrite.

### Task 1: Replace Pulse Schema With Main-Thread-Only Bootstrap

**Files:**
- Create: `supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql`
- Create: `supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts`
- Modify: `src/types/database.ts`
- Modify: `src/types/__tests__/database.test.ts`
- Delete: `supabase/migrations/__tests__/autopilot-pulse.test.ts`
- Delete: `supabase/verification/pr19_autopilot_bootstrap_check.sql`

**Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("daily orchestrator bootstrap migration", () => {
  it("drops autopilot-only objects and adds the new seed marker", () => {
    expect(migrationSql).toContain("DROP TABLE IF EXISTS public.autopilot_config CASCADE");
    expect(migrationSql).toContain("DROP FUNCTION IF EXISTS public.ensure_autopilot_for_client(UUID) CASCADE");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS daily_orchestrator_seeded_at TIMESTAMPTZ");
  });

  it("keeps only schedule, webhook, and rss trigger types", () => {
    expect(migrationSql).toContain("CHECK (trigger_type IN ('schedule', 'webhook', 'rss'))");
    expect(migrationSql).toContain("DELETE FROM public.agent_triggers WHERE trigger_type = 'pulse'");
  });

  it("replaces the old bootstrap with a main-thread-only helper", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.ensure_main_thread_for_client");
    expect(migrationSql).toContain("title = 'Main'");
    expect(migrationSql).toContain("is_primary = true");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts --reporter=verbose
```

Expected: FAIL because the migration file does not exist yet.

**Step 3: Write the minimal migration**

```sql
BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS daily_orchestrator_seeded_at TIMESTAMPTZ;

DELETE FROM public.agent_triggers
WHERE trigger_type = 'pulse';

ALTER TABLE public.agent_triggers
  DROP CONSTRAINT IF EXISTS agent_triggers_trigger_type_check;

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_trigger_type_check
  CHECK (trigger_type IN ('schedule', 'webhook', 'rss'));

ALTER TABLE public.runs
  DROP CONSTRAINT IF EXISTS runs_run_type_check;

ALTER TABLE public.runs
  ADD CONSTRAINT runs_run_type_check
  CHECK (run_type IN ('chat', 'webhook', 'cron'));

DROP TRIGGER IF EXISTS on_client_created_bootstrap_autopilot ON public.clients;
DROP TABLE IF EXISTS public.autopilot_config CASCADE;
DROP FUNCTION IF EXISTS public.autopilot_interval_to_cron(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.autopilot_next_fire_at(TEXT, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS public.sync_autopilot_trigger_from_config() CASCADE;
DROP FUNCTION IF EXISTS public.bootstrap_autopilot() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_autopilot_for_client(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_main_thread_for_client(p_client_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  INSERT INTO public.conversation_threads (
    client_id,
    title,
    is_pinned,
    is_primary
  )
  VALUES (p_client_id, 'Main', true, true)
  ON CONFLICT (client_id, is_primary)
  WHERE is_primary = true
  DO UPDATE SET
    title = 'Main',
    is_pinned = true
  RETURNING thread_id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

COMMIT;
```

**Step 4: Run the focused migration contract test**

Run:

```bash
pnpm vitest run supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Apply the migration and regenerate database types**

Use Supabase MCP `apply_migration` with:

- `name`: `replace_autopilot_with_daily_orchestrator`
- `query`: contents of `supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql`

Then run:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Expected: `src/types/database.ts` removes `autopilot_config`, removes `pulse`/`autopilot`, and adds `clients.daily_orchestrator_seeded_at`.

**Step 6: Add the type-level regression test**

```ts
import { describe, expectTypeOf, it } from "vitest";
import type { Database } from "../database";

describe("database types", () => {
  it("tracks the daily orchestrator seed marker and trimmed trigger unions", () => {
    expectTypeOf<
      Database["public"]["Tables"]["clients"]["Row"]["daily_orchestrator_seeded_at"]
    >().toEqualTypeOf<string | null>();

    expectTypeOf<
      Database["public"]["Tables"]["agent_triggers"]["Row"]["trigger_type"]
    >().toEqualTypeOf<"schedule" | "webhook" | "rss">();

    expectTypeOf<
      Database["public"]["Tables"]["runs"]["Row"]["run_type"]
    >().toEqualTypeOf<"chat" | "webhook" | "cron">();
  });
});
```

**Step 7: Run the type regression test**

Run:

```bash
pnpm vitest run src/types/__tests__/database.test.ts --reporter=verbose
```

Expected: PASS.

**Step 8: Commit**

```bash
git add \
  supabase/migrations/20260424180000_replace_autopilot_with_daily_orchestrator.sql \
  supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts \
  src/types/database.ts \
  src/types/__tests__/database.test.ts
git rm supabase/migrations/__tests__/autopilot-pulse.test.ts supabase/verification/pr19_autopilot_bootstrap_check.sql
git commit -m "feat(prXX): replace autopilot schema with daily orchestrator bootstrap"
```

### Task 2: Add The Code-Owned Daily Orchestrator Definition And Seeder

**Files:**
- Create: `src/lib/automations/default-daily-orchestrator.ts`
- Create: `src/lib/automations/__tests__/default-daily-orchestrator.test.ts`

**Step 1: Write the failing unit test for the seeded automation helper**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bootstrapDefaultDailyOrchestrator,
  DEFAULT_DAILY_ORCHESTRATOR_CRON,
  DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
  DEFAULT_DAILY_ORCHESTRATOR_NAME,
} from "../default-daily-orchestrator";

describe("bootstrapDefaultDailyOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the storage file, schedule row, and seed marker once", async () => {
    const result = await bootstrapDefaultDailyOrchestrator({
      supabase: createMockSupabase(),
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });

    expect(result).toEqual({ seeded: true, triggerId: "trigger-1" });
    expect(createMockFileClient().writeFile).toHaveBeenCalledWith(
      DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
      expect.stringContaining("Daily Orchestrator"),
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: DEFAULT_DAILY_ORCHESTRATOR_NAME,
        trigger_type: "schedule",
        cron_expression: DEFAULT_DAILY_ORCHESTRATOR_CRON,
        payload: expect.objectContaining({
          cron: DEFAULT_DAILY_ORCHESTRATOR_CRON,
          timezone: "Asia/Singapore",
        }),
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/automations/__tests__/default-daily-orchestrator.test.ts --reporter=verbose
```

Expected: FAIL because the helper file does not exist yet.

**Step 3: Write the minimal helper**

```ts
export const DEFAULT_DAILY_ORCHESTRATOR_NAME = "Daily Orchestrator";
export const DEFAULT_DAILY_ORCHESTRATOR_CRON = "0 8 * * *";
export const DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH =
  "state/triggers/daily-orchestrator.md";

export async function bootstrapDefaultDailyOrchestrator(input: {
  supabase: SupabaseClient<Database>;
  clientId: string;
  threadId: string;
  timezone: string;
}): Promise<{ seeded: boolean; triggerId: string | null }> {
  const { data: client } = await input.supabase
    .from("clients")
    .select("daily_orchestrator_seeded_at")
    .eq("client_id", input.clientId)
    .single();

  if (client?.daily_orchestrator_seeded_at) {
    return { seeded: false, triggerId: null };
  }

  const fileClient = createAgentFileClient(input.supabase, input.clientId);
  await fileClient.writeFile(
    DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
    buildDefaultDailyOrchestratorPrompt(),
  );

  const nextFireAt = computeNextFireAt(
    DEFAULT_DAILY_ORCHESTRATOR_CRON,
    new Date(),
    normalizeTriggerTimezone(input.timezone),
  );

  const { data: trigger } = await input.supabase
    .from("agent_triggers")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      trigger_type: "schedule",
      name: DEFAULT_DAILY_ORCHESTRATOR_NAME,
      instruction_path: DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
      cron_expression: DEFAULT_DAILY_ORCHESTRATOR_CRON,
      next_fire_at: nextFireAt.toISOString(),
      enabled: true,
      payload: {
        cron: DEFAULT_DAILY_ORCHESTRATOR_CRON,
        timezone: normalizeTriggerTimezone(input.timezone),
      },
      retry_count: 0,
    })
    .select("id")
    .single();

  await input.supabase
    .from("clients")
    .update({ daily_orchestrator_seeded_at: new Date().toISOString() })
    .eq("client_id", input.clientId);

  return { seeded: true, triggerId: trigger?.id ?? null };
}
```

**Step 4: Run the focused helper test**

Run:

```bash
pnpm vitest run src/lib/automations/__tests__/default-daily-orchestrator.test.ts --reporter=verbose
```

Expected: PASS.

**Step 5: Commit**

```bash
git add \
  src/lib/automations/default-daily-orchestrator.ts \
  src/lib/automations/__tests__/default-daily-orchestrator.test.ts
git commit -m "feat(prXX): add daily orchestrator seeding helper"
```

### Task 3: Seed Daily Orchestrator From An Authenticated Bootstrap Route

**Files:**
- Create: `app/api/automations/bootstrap-default/route.ts`
- Create: `app/api/automations/bootstrap-default/route.test.ts`
- Create: `src/components/layout/default-automation-bootstrap.tsx`
- Create: `src/components/layout/default-automation-bootstrap.test.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/layout.test.tsx`

**Step 1: Write the failing route test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthenticateRequest, mockBootstrapDefaultDailyOrchestrator } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockBootstrapDefaultDailyOrchestrator: vi.fn(),
}));

it("seeds the default automation for the authenticated client", async () => {
  mockAuthenticateRequest.mockResolvedValue({
    kind: "success",
    supabase: createMockSupabase(),
    userId: "user-1",
  });
  mockBootstrapDefaultDailyOrchestrator.mockResolvedValue({
    seeded: true,
    triggerId: "trigger-1",
  });

  const { POST } = await import("./route");
  const response = await POST(
    new Request("http://localhost/api/automations/bootstrap-default", {
      method: "POST",
      body: JSON.stringify({ timezone: "Asia/Singapore" }),
      headers: { "content-type": "application/json" },
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    seeded: true,
    triggerId: "trigger-1",
  });
});
```

**Step 2: Write the failing client bootstrap component test**

```tsx
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { DefaultAutomationBootstrap } from "../default-automation-bootstrap";

it("posts the browser timezone exactly once on mount", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ seeded: true }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Intl", {
    DateTimeFormat: () => ({
      resolvedOptions: () => ({ timeZone: "Asia/Singapore" }),
    }),
  } as unknown as typeof Intl);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <DefaultAutomationBootstrap />
    </QueryClientProvider>,
  );

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

**Step 3: Run both tests to verify they fail**

Run:

```bash
pnpm vitest run 'app/api/automations/bootstrap-default/route.test.ts' 'src/components/layout/default-automation-bootstrap.test.tsx' --reporter=verbose
```

Expected: FAIL because the route and component do not exist yet.

**Step 4: Write the minimal route**

```ts
import { z } from "zod";

import { authenticateAndParseBody } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getPrimaryThread } from "@/lib/chat/threads";
import { bootstrapDefaultDailyOrchestrator } from "@/lib/automations/default-daily-orchestrator";

const bodySchema = z.object({
  timezone: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const requestResult = await authenticateAndParseBody(request, bodySchema);
  if (requestResult.kind === "error") return requestResult.response;

  const { supabase, userId, body } = requestResult;
  const clientId = await resolveClientId(supabase, userId);
  const primaryThread = await getPrimaryThread(supabase, clientId);

  if (!primaryThread) {
    return Response.json({ error: "Primary thread not found." }, { status: 409 });
  }

  const result = await bootstrapDefaultDailyOrchestrator({
    supabase,
    clientId,
    threadId: primaryThread.thread_id,
    timezone: body.timezone,
  });

  return Response.json(result);
}
```

**Step 5: Write the minimal client bootstrap component and wire it into the dashboard layout**

```tsx
"use client";

export function DefaultAutomationBootstrap() {
  const queryClient = useQueryClient();
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    if (hasBootstrappedRef.current) return;
    hasBootstrappedRef.current = true;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    void fetch("/api/automations/bootstrap-default", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone }),
    }).then(async (response) => {
      if (!response.ok) return;
      await queryClient.invalidateQueries({ queryKey: ["triggers"] });
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
    });
  }, [queryClient]);

  return null;
}
```

Then add it to `app/(dashboard)/layout.tsx` inside the authenticated shell:

```tsx
<ThreadProvider>
  <DataStreamProvider>
    <DefaultAutomationBootstrap />
    <AppLayout>{children}</AppLayout>
  </DataStreamProvider>
</ThreadProvider>
```

**Step 6: Run the focused bootstrap tests**

Run:

```bash
pnpm vitest run 'app/api/automations/bootstrap-default/route.test.ts' 'src/components/layout/default-automation-bootstrap.test.tsx' 'app/(dashboard)/layout.test.tsx' --reporter=verbose
```

Expected: PASS.

**Step 7: Commit**

```bash
git add \
  app/api/automations/bootstrap-default/route.ts \
  app/api/automations/bootstrap-default/route.test.ts \
  src/components/layout/default-automation-bootstrap.tsx \
  src/components/layout/default-automation-bootstrap.test.tsx \
  'app/(dashboard)/layout.tsx' \
  'app/(dashboard)/layout.test.tsx'
git commit -m "feat(prXX): seed daily orchestrator from authenticated bootstrap"
```

### Task 4: Remove Pulse From Trigger Runtime And Managed-Agent Execution

**Files:**
- Modify: `src/lib/triggers/schemas.ts`
- Modify: `src/lib/triggers/__tests__/schemas.test.ts`
- Modify: `src/lib/triggers/executor.ts`
- Modify: `src/lib/triggers/__tests__/executor.test.ts`
- Modify: `src/lib/triggers/scanner.ts`
- Modify: `src/lib/triggers/__tests__/scanner.test.ts`
- Modify: `src/lib/runner/run-types.ts`
- Modify: `src/lib/managed-agents/spawn-trigger-run.ts`
- Modify: `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
- Modify: `src/lib/managed-agents/tools/triggers/setup-trigger.ts`
- Modify: `src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts`
- Modify: `src/lib/managed-agents/tools/triggers/manage-active-triggers.ts`
- Modify: `src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts`
- Delete: `src/lib/autopilot/constants.ts`
- Delete: `src/lib/autopilot/quiet-hours.ts`
- Delete: `src/lib/autopilot/__tests__/constants.test.ts`
- Delete: `src/lib/autopilot/__tests__/quiet-hours.test.ts`

**Step 1: Write the failing schema/runtime union tests**

```ts
import { describe, expect, it } from "vitest";

import { triggerTypeValues } from "../schemas";
import { runTypeValues } from "@/lib/runner/run-types";

describe("trigger unions", () => {
  it("supports only schedule, webhook, and rss triggers", () => {
    expect(triggerTypeValues).toEqual(["schedule", "webhook", "rss"]);
  });

  it("supports only chat, webhook, and cron run types", () => {
    expect(runTypeValues).toEqual(["chat", "webhook", "cron"]);
  });
});
```

**Step 2: Write the failing executor/scanner regression tests**

```ts
it("queues a schedule trigger through the normal cron path", async () => {
  await executeTrigger({
    supabase: mockSupabase,
    payload: {
      ...BASE_PAYLOAD,
      triggerType: "schedule",
      instructionPath: "state/triggers/daily-orchestrator.md",
    },
  });

  expect(mockSpawnTriggerRun).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      triggerType: "cron",
      invocationMessage: expect.stringContaining("/agent/state/triggers/daily-orchestrator.md"),
    }),
  );
});

it("never loads autopilot_config while scanning schedule triggers", async () => {
  await scanTriggers({
    supabase: mockSupabase,
    dispatch: mockDispatch,
    now: new Date("2026-04-24T00:00:00.000Z"),
  });

  expect(mockSupabase.from).not.toHaveBeenCalledWith("autopilot_config");
});
```

**Step 3: Run the runtime-focused tests to verify they fail**

Run:

```bash
pnpm vitest run \
  src/lib/triggers/__tests__/schemas.test.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  src/lib/triggers/__tests__/scanner.test.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts \
  --reporter=verbose
```

Expected: FAIL because `pulse`, `autopilot`, and quiet-hours branches still exist.

**Step 4: Write the minimal runtime simplification**

```ts
// src/lib/triggers/schemas.ts
export const triggerTypeValues = ["schedule", "webhook", "rss"] as const;

// src/lib/runner/run-types.ts
export const runTypeValues = ["chat", "webhook", "cron"] as const;

// src/lib/managed-agents/spawn-trigger-run.ts
triggerType: "cron" | "webhook";

// src/lib/triggers/executor.ts
const hasExhaustedRetries = trigger.retry_count >= MAX_USER_CREATED_RETRIES;

await spawnTriggerRun(supabase, {
  runId: payload.currentRunId,
  clientId: payload.clientId,
  threadId: payload.threadId,
  triggerType: payload.triggerType === "webhook" ? "webhook" : "cron",
  invocationMessage: `${triggerEventMessage}\n\n${CRON_RUN_NUDGE}`,
  triggerId: payload.triggerId,
  triggerName: payload.triggerName,
});

// src/lib/triggers/scanner.ts
if (trigger.trigger_type === "schedule" || trigger.trigger_type === "rss") {
  // normal cron scheduling only
}
```

Also remove:

- `AUTOPILOT_INSTRUCTION_PROMPT` import and pulse branch from `src/lib/triggers/executor.ts`
- `isInQuietHours` import and `fetchAutopilotConfig()` from `src/lib/triggers/scanner.ts`
- `"pulse"` analytics mapping from `src/lib/managed-agents/tools/triggers/setup-trigger.ts`

**Step 5: Run the focused runtime tests again**

Run:

```bash
pnpm vitest run \
  src/lib/triggers/__tests__/schemas.test.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  src/lib/triggers/__tests__/scanner.test.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts \
  --reporter=verbose
```

Expected: PASS.

**Step 6: Commit**

```bash
git add \
  src/lib/triggers/schemas.ts \
  src/lib/triggers/__tests__/schemas.test.ts \
  src/lib/triggers/executor.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  src/lib/triggers/scanner.ts \
  src/lib/triggers/__tests__/scanner.test.ts \
  src/lib/runner/run-types.ts \
  src/lib/managed-agents/spawn-trigger-run.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/managed-agents/tools/triggers/setup-trigger.ts \
  src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts \
  src/lib/managed-agents/tools/triggers/manage-active-triggers.ts \
  src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts
git rm \
  src/lib/autopilot/constants.ts \
  src/lib/autopilot/quiet-hours.ts \
  src/lib/autopilot/__tests__/constants.test.ts \
  src/lib/autopilot/__tests__/quiet-hours.test.ts
git commit -m "refactor(prXX): remove pulse and autopilot runtime branches"
```

### Task 5: Surface Daily Orchestrator In Automations And Remove The Autopilot Settings Surface

**Files:**
- Modify: `src/lib/triggers/automation-trigger-query.ts`
- Modify: `src/hooks/use-triggers.ts`
- Modify: `app/(dashboard)/automations/automations-page-client.tsx`
- Modify: `src/components/automations/automations-list.tsx`
- Modify: `src/components/automations/__tests__/automations-list.test.tsx`
- Modify: `src/components/automations/automation-header.tsx`
- Modify: `src/components/automations/__tests__/automation-header.test.tsx`
- Modify: `src/components/automations/automation-detail.tsx`
- Modify: `src/components/automations/__tests__/automation-detail.test.tsx`
- Modify: `app/settings/agent/general/page.tsx`
- Create: `app/settings/agent/general/page.test.tsx`
- Delete: `app/api/settings/autopilot/route.ts`
- Delete: `src/components/settings/autopilot-card.tsx`

**Step 1: Write the failing automations-list and settings-page tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

it("shows Daily Orchestrator in the automations list like any other row", () => {
  render(
    <AutomationsList
      triggers={[
        {
          id: "trigger-1",
          thread_id: "thread-1",
          name: "Daily Orchestrator",
          trigger_type: "schedule",
          cron_expression: "0 8 * * *",
          payload: { cron: "0 8 * * *", timezone: "Asia/Singapore" },
          enabled: true,
          next_fire_at: "2026-04-25T00:00:00.000Z",
          last_fired_at: null,
          last_status: null,
          invocation_message: null,
          instruction_path: "state/triggers/daily-orchestrator.md",
          isRunning: false,
        },
      ]}
      onToggleEnabled={() => {}}
    />,
  );

  expect(screen.getByText("Daily Orchestrator")).toBeInTheDocument();
});
```

```tsx
it("removes the autopilot card from Settings → Agent → General", async () => {
  const page = await AgentGeneralPage();
  render(page);

  expect(screen.queryByText(/Autopilot/i)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Manage proactive work from Automations/i),
  ).toBeInTheDocument();
});
```

**Step 2: Run the UI tests to verify they fail**

Run:

```bash
pnpm vitest run \
  src/components/automations/__tests__/automations-list.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  src/components/automations/__tests__/automation-detail.test.tsx \
  app/settings/agent/general/page.test.tsx \
  --reporter=verbose
```

Expected: FAIL because the old filters and Autopilot surface still exist.

**Step 3: Remove the `pulse` filters and update the settings page copy**

```ts
// src/lib/triggers/automation-trigger-query.ts
const { data, error } = await supabaseClient
  .from("agent_triggers")
  .select(TRIGGER_LIST_SELECT)
  .order("created_at", { ascending: false });

// src/hooks/use-triggers.ts
// remove .neq("trigger_type", "pulse") in useTriggerByThreadId()
```

```tsx
// app/settings/agent/general/page.tsx
export default function AgentGeneralPage() {
  return (
    <PageCanvas variant="form">
      <PageHeader
        title="General"
        description="Agent-wide behavior."
      />
      <p className="type-control-muted text-muted-foreground">
        Manage proactive work from Automations. Daily Orchestrator is just a normal automation now.
      </p>
    </PageCanvas>
  );
}
```

Delete the dead API route and card:

- `app/api/settings/autopilot/route.ts`
- `src/components/settings/autopilot-card.tsx`

**Step 4: Run the UI tests again**

Run:

```bash
pnpm vitest run \
  src/components/automations/__tests__/automations-list.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  src/components/automations/__tests__/automation-detail.test.tsx \
  app/settings/agent/general/page.test.tsx \
  'app/(dashboard)/automations/page.test.tsx' \
  'app/(dashboard)/automations/page-server.test.tsx' \
  --reporter=verbose
```

Expected: PASS.

**Step 5: Commit**

```bash
git add \
  src/lib/triggers/automation-trigger-query.ts \
  src/hooks/use-triggers.ts \
  'app/(dashboard)/automations/automations-page-client.tsx' \
  src/components/automations/automations-list.tsx \
  src/components/automations/__tests__/automations-list.test.tsx \
  src/components/automations/automation-header.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  src/components/automations/automation-detail.tsx \
  src/components/automations/__tests__/automation-detail.test.tsx \
  app/settings/agent/general/page.tsx \
  app/settings/agent/general/page.test.tsx
git rm app/api/settings/autopilot/route.ts src/components/settings/autopilot-card.tsx
git commit -m "feat(prXX): surface daily orchestrator and remove autopilot settings"
```

### Task 6: Lock In Primary-Thread Regressions And Update Docs

**Files:**
- Modify: `app/(dashboard)/agent/page.test.tsx`
- Modify: `src/lib/settings/profile/messaging-preferences.test.ts`
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`
- Modify: `docs/qa/08-triggers-and-automations.md`
- Modify: `AGENTS.md`

**Step 1: Write the failing regression tests**

```ts
it("still redirects /agent to the primary Main thread", async () => {
  mockGetPrimaryThread.mockResolvedValue({
    thread_id: "main-thread",
    is_primary: true,
  });

  await AgentPage();

  expect(mockRedirect).toHaveBeenCalledWith("/chat/main-thread");
});
```

```ts
it("still falls back to the primary thread for default messaging", async () => {
  const threadId = await getDefaultMessagingThreadForUser(mockSupabase, {
    clientId: "client-1",
    userId: "user-1",
  });

  expect(threadId).toBe("main-thread");
});
```

```ts
it("pairs Telegram to the primary Main thread even without autopilot config", async () => {
  // keep the existing pairing flow, but remove any autopilot-specific fixture setup
  expect(upsertTelegramConnection).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      targetThreadId: "main-thread",
    }),
  );
});
```

**Step 2: Run the regression tests to verify they fail**

Run:

```bash
pnpm vitest run \
  'app/(dashboard)/agent/page.test.tsx' \
  src/lib/settings/profile/messaging-preferences.test.ts \
  'app/api/webhook/telegram/__tests__/route.test.ts' \
  --reporter=verbose
```

Expected: FAIL until fixtures and assertions stop depending on Autopilot.

**Step 3: Update the tests and docs**

Update `docs/qa/08-triggers-and-automations.md` to cover:

- new-client bootstrap creates `Daily Orchestrator`
- it is enabled by default
- it uses a normal schedule row and a storage-backed instruction file
- deleting it does not recreate it
- automation runs still create a fresh run thread

Update `AGENTS.md`:

```md
- **Automations:** Scheduled automations claim due trigger rows, start a fresh Anthropic Managed Agent run, and skip if that automation is already running.
- **Daily Orchestrator:** Seed one normal daily automation at `8:00 AM` local time for new clients. It is visible, editable, and deletable like any other automation.
```

Remove or rewrite the old Autopilot architecture bullet.

**Step 4: Run the regression tests and docs-adjacent checks**

Run:

```bash
pnpm vitest run \
  'app/(dashboard)/agent/page.test.tsx' \
  src/lib/settings/profile/messaging-preferences.test.ts \
  'app/api/webhook/telegram/__tests__/route.test.ts' \
  --reporter=verbose
pnpm lint
```

Expected: PASS. Lint passes with no new errors.

**Step 5: Commit**

```bash
git add \
  'app/(dashboard)/agent/page.test.tsx' \
  src/lib/settings/profile/messaging-preferences.test.ts \
  'app/api/webhook/telegram/__tests__/route.test.ts' \
  docs/qa/08-triggers-and-automations.md \
  AGENTS.md
git commit -m "test(prXX): lock primary thread regressions after daily orchestrator cutover"
```

## Final Verification Checklist

- [ ] New authenticated client loads the dashboard and gets exactly one seeded automation named `Daily Orchestrator`.
- [ ] The seeded automation is enabled by default and scheduled for `0 8 * * *` in the browser timezone captured at bootstrap.
- [ ] Its instruction file exists at `state/triggers/daily-orchestrator.md`.
- [ ] Editing, renaming, disabling, and deleting it work through the normal automations UI.
- [ ] Deleting it and refreshing the app does not recreate it.
- [ ] `agent_triggers.trigger_type` no longer allows `pulse`.
- [ ] `runs.run_type` no longer allows `autopilot`.
- [ ] No app runtime file imports `@/lib/autopilot/*`.
- [ ] `/agent` still redirects to the primary `Main` thread.
- [ ] Telegram pairing still binds to the primary `Main` thread.
- [ ] A fired `Daily Orchestrator` run creates a new run thread, not a persistent automation thread.

## Final Targeted Test Command

Run:

```bash
pnpm vitest run \
  supabase/migrations/__tests__/daily-orchestrator-bootstrap.test.ts \
  src/types/__tests__/database.test.ts \
  src/lib/automations/__tests__/default-daily-orchestrator.test.ts \
  'app/api/automations/bootstrap-default/route.test.ts' \
  src/components/layout/default-automation-bootstrap.test.tsx \
  'app/(dashboard)/layout.test.tsx' \
  src/lib/triggers/__tests__/schemas.test.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  src/lib/triggers/__tests__/scanner.test.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/setup-trigger.test.ts \
  src/lib/managed-agents/tools/triggers/__tests__/manage-active-triggers.test.ts \
  src/components/automations/__tests__/automations-list.test.tsx \
  src/components/automations/__tests__/automation-header.test.tsx \
  src/components/automations/__tests__/automation-detail.test.tsx \
  app/settings/agent/general/page.test.tsx \
  'app/(dashboard)/automations/page.test.tsx' \
  'app/(dashboard)/automations/page-server.test.tsx' \
  'app/(dashboard)/agent/page.test.tsx' \
  src/lib/settings/profile/messaging-preferences.test.ts \
  'app/api/webhook/telegram/__tests__/route.test.ts' \
  --reporter=verbose
pnpm lint
```

Expected: All targeted Daily Orchestrator, automations, primary-thread, and Telegram regression tests pass. Lint passes.
