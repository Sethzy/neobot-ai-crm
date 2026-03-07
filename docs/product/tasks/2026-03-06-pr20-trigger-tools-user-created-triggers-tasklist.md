# Trigger Tools + User-Created Triggers Implementation Plan

**PR:** PR 20: Trigger tools + user-created triggers
**Decisions:** TRIG-03, TRIG-12
**Goal:** Give the agent tools to create, search, and manage triggers at runtime so users can say "check PropertyGuru every morning" and the agent just sets it up — no deploy, no code change.

**Architecture:** The agent creates triggers by INSERTing into the existing `agent_triggers` table (TRIG-03). The cron scanner (PR 18) automatically picks up new rows on its next 1-min tick — no registration step needed. Three trigger types for v1: `schedule` (cron + timezone), `webhook` (inbound POST to a unique URL with optional HMAC), and `rss` (feed monitoring with GUID dedup). **Tools are thin pass-throughs (Tasklet-aligned)** — `setup_trigger` does INSERT only, `manage_active_triggers` edit does UPDATE only. The scanner validates trigger well-formedness on first pick-up. Retry policy (TRIG-12): autopilot pulse = 0 retries, user-created triggers = max 2 retries. Retryable failures do NOT advance `next_fire_at` — the scanner re-picks on the next tick. The `release_trigger_claim` RPC is the single source of truth for retry state. Trigger mutation tools (create/delete/edit) are chat-only; autopilot gets read-only access. The system-reminder surfaces `Active triggers: N` per Tasklet convention.

**Tech Stack:** Vercel AI SDK `tool()`, Zod 4, Supabase (Postgres + RLS), `cron-parser`, `fast-xml-parser` (RSS), TanStack Query, ShadCN UI, Tailwind 4

---

## Tasklet Reference Files

These are the canonical reference docs for trigger patterns. Read them before implementing.

| File | What it tells you |
|------|-------------------|
| `roadmap docs/.../references/tasklet/tasklet tools/built-in/v2/15-search_triggers.md` | Tool schema — input/output contract |
| `roadmap docs/.../references/tasklet/tasklet tools/built-in/v2/16-setup_trigger.md` | Tool schema — trigger_id, params, invocation_message |
| `roadmap docs/.../references/tasklet/tasklet tools/built-in/v2/17-manage_active_triggers.md` | Tool schema — 5 actions, edit_params, invocation_message |
| `roadmap docs/.../references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` | `<triggers>`, `<filesystem>`, `<subagents>` sections |
| `roadmap docs/.../references/tasklet/persistence-and-cron/` | All 7 files — execution semantics, persistence model, subagent anatomy |
| `roadmap docs/.../references/tasklet/first-run-lifecycle/00-source-first-run-lifecycle-verbatim.md` | Full trace: setup → trigger fire → rediscovery |
| `roadmap docs/.../references/tasklet/simple-price-monitor-workflow/00-source-simple-workflow-verbatim.md` | Full trace: schedule trigger, scraper subagent, DB state |
| `roadmap docs/.../references/tasklet/official-guide-features.md` | Section 2 (triggers) + Section 10 (webhooks) |

---

## Relevant Files

### Create
- `src/lib/runner/tools/triggers/index.ts` — trigger tool factory barrel
- `src/lib/runner/tools/triggers/search-triggers.ts` — static catalog lookup tool
- `src/lib/runner/tools/triggers/setup-trigger.ts` — trigger creation tool
- `src/lib/runner/tools/triggers/manage-triggers.ts` — list/view/delete/simulate/edit tool
- `src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts`
- `src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts`
- `src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts`
- `src/lib/triggers/rss.ts` — RSS feed fetcher + GUID dedup
- `src/lib/triggers/__tests__/rss.test.ts`
- `src/lib/triggers/webhook-auth.ts` — HMAC-SHA256 validation
- `src/lib/triggers/__tests__/webhook-inbound.test.ts`
- `src/lib/triggers/webhook-claim.ts` — shared on-demand claim helper
- `src/lib/triggers/__tests__/webhook-claim.test.ts`
- `src/lib/triggers/__tests__/webhook-route.test.ts` — route handler tests
- `app/api/trigger/webhook/[triggerId]/route.ts` — inbound webhook endpoint
- `src/hooks/use-triggers.ts` — TanStack Query hook for automations page
- `supabase/migrations/20260306040000_add_trigger_retry_and_webhook_columns.sql`
- `supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql`
- `supabase/migrations/20260306040002_update_release_trigger_claim_for_retry.sql`
- `supabase/migrations/__tests__/trigger-tools.test.ts` — migration contract tests

### Modify
- `src/lib/runner/tools/index.ts` — add `createTriggerTools` export
- `src/lib/runner/run-agent.ts` — wire trigger tools with `allowMutations: true`
- `src/lib/runner/run-autopilot.ts` — wire trigger tools with `allowMutations: false`
- `src/lib/runner/system-reminder.ts` — add `active_trigger_count` line
- `src/lib/runner/__tests__/system-reminder.test.ts` — update for new field
- `src/lib/ai/system-prompt.ts` — add `<triggers>` safety block
- `src/lib/triggers/scanner.ts` — add retry policy check
- `src/lib/triggers/__tests__/scanner.test.ts` — retry tests
- `src/lib/triggers/executor.ts` — add RSS execution path, pass advance flag
- `src/lib/triggers/__tests__/executor.test.ts` — RSS path + retry release tests
- `app/(dashboard)/automations/page.tsx` — replace placeholder with real page
- `src/types/database.ts` — regenerate after migrations

---

## Task 1: Migration — retry_count, webhook_secret, and invocation_message columns

**Files:**
- Create: `supabase/migrations/20260306040000_add_trigger_retry_and_webhook_columns.sql`

### Step 1: Write the migration SQL

```sql
-- PR20: add retry_count, webhook_secret, invocation_message to agent_triggers
-- Supports TRIG-12 (retry policies), PR20-5 (webhook HMAC), Tasklet invocation_message

ALTER TABLE public.agent_triggers
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS invocation_message TEXT;

-- Constraint: invocation_message max 200 chars (Tasklet spec)
ALTER TABLE public.agent_triggers
  ADD CONSTRAINT agent_triggers_invocation_message_length
  CHECK (invocation_message IS NULL OR length(invocation_message) <= 200);

COMMENT ON COLUMN public.agent_triggers.retry_count IS
  'Consecutive failed attempts. Reset to 0 on success. Max 2 for non-pulse (TRIG-12).';
COMMENT ON COLUMN public.agent_triggers.webhook_secret IS
  'Optional HMAC-SHA256 secret for webhook trigger verification.';
COMMENT ON COLUMN public.agent_triggers.invocation_message IS
  'Short message included each time trigger fires. Max 200 chars (Tasklet v2 spec).';
```

### Step 2: Apply migration locally

```bash
npx supabase db reset
```

Expected: Migration applies without error.

### Step 3: Regenerate database types

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Expected: `database.ts` now includes `retry_count`, `webhook_secret`, `invocation_message` on `agent_triggers`.

### Step 4: Commit

```bash
git add supabase/migrations/20260306040000_add_trigger_retry_and_webhook_columns.sql src/types/database.ts
git commit -m "feat(pr20): add retry_count, webhook_secret, invocation_message columns"
```

---

## Task 2: Migration — add active_trigger_count to system-reminder RPC (surgical patch)

**Files:**
- Create: `supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql`
- Modify: `src/lib/runner/system-reminder.ts`
- Modify: `src/lib/runner/__tests__/system-reminder.test.ts`

**Important:** Do NOT rewrite the entire `get_system_reminder_context` function. Apply a surgical patch that preserves the existing function shape and auth guard. Read the current function at `supabase/migrations/20260305030001_create_sql_helper_functions.sql:100-137` first.

### Step 1: Write the migration SQL

The existing function returns a `jsonb_build_object(...)`. We add one subquery to it.

```sql
-- PR20: add active_trigger_count to system reminder (surgical patch)
-- Preserves existing function shape and auth guard exactly.
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
    )
  )
  FROM public.clients AS c
  JOIN auth.users AS u ON u.id = c.user_id
  WHERE c.id = p_client_id;
$$;
```

**Verify:** The only diff from the existing function is the `active_trigger_count` subquery. The `FROM/JOIN/WHERE` clause is identical to the existing function.

### Step 2: Apply migration

```bash
npx supabase db reset
```

### Step 3: Write the failing test for system-reminder

In `src/lib/runner/__tests__/system-reminder.test.ts`, add:

```typescript
test("includes active trigger count in reminder", async () => {
  mockRpc.mockResolvedValueOnce({
    data: {
      display_name: "Test User",
      user_email: "test@example.com",
      days_since_signup: 5,
      open_todo_count: 2,
      memory_file_count: 3,
      active_trigger_count: 4,
    },
    error: null,
  });

  const result = await buildSystemReminder(mockSupabase, CLIENT_ID, THREAD_ID);
  expect(result).toContain("Active triggers: 4");
});
```

### Step 4: Run test to verify it fails

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: FAIL — output does not contain "Active triggers: 4".

### Step 5: Update system-reminder.ts (4 surgical changes)

In `src/lib/runner/system-reminder.ts`:

1. Add `active_trigger_count: z.number().int().nonnegative()` to `systemReminderContextSchema`
2. Add `active_trigger_count: 0` to `FALLBACK_CONTEXT`
3. Add `active_trigger_count: parsedResult.data.active_trigger_count ?? 0` to the return in `fetchReminderContext`
4. Add `reminderLines.push(\`Active triggers: \${context.active_trigger_count}\`)` after the `Memory files` line

### Step 6: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/__tests__/system-reminder.test.ts
```

Expected: ALL PASS. Update existing test mocks to include `active_trigger_count` if they break.

### Step 7: Commit

```bash
git add supabase/migrations/20260306040001_add_active_trigger_count_to_system_reminder.sql \
  src/lib/runner/system-reminder.ts \
  src/lib/runner/__tests__/system-reminder.test.ts
git commit -m "feat(pr20): add active_trigger_count to system-reminder"
```

---

## Task 3: search_triggers tool — static trigger catalog

**Files:**
- Create: `src/lib/runner/tools/triggers/search-triggers.ts`
- Create: `src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts`

Pure function, no DB access. Returns catalog entries with `trigger_id`, `setupSchema`, and `editSchema` per Tasklet v2 spec. **Read `roadmap docs/.../v2/15-search_triggers.md` first** — the description says "The setupSchema field describes the schema of the params object that should be passed into setup_trigger. Triggers that support editing will include an editSchema field."

### Step 1: Write the failing test

Create `src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts`:

```typescript
import { describe, expect, test } from "vitest";

import { createSearchTriggersTool } from "../search-triggers";

const EXECUTION_OPTIONS = {
  toolCallId: "test-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("search_triggers", () => {
  const { search_triggers } = createSearchTriggersTool();

  test("returns all trigger types when keyword matches broadly", async () => {
    const result = await search_triggers.execute(
      { keywords: ["trigger"] },
      EXECUTION_OPTIONS,
    );
    expect(result.success).toBe(true);
    expect(result.triggers.length).toBeGreaterThanOrEqual(3);
  });

  test("returns schedule trigger for 'cron' keyword", async () => {
    const result = await search_triggers.execute(
      { keywords: ["cron"] },
      EXECUTION_OPTIONS,
    );
    expect(result.success).toBe(true);
    const schedule = result.triggers.find(
      (t: { trigger_id: string }) => t.trigger_id === "schedule",
    );
    expect(schedule).toBeDefined();
  });

  test("returns webhook trigger for 'webhook' keyword", async () => {
    const result = await search_triggers.execute(
      { keywords: ["webhook"] },
      EXECUTION_OPTIONS,
    );
    expect(result.success).toBe(true);
    const webhook = result.triggers.find(
      (t: { trigger_id: string }) => t.trigger_id === "webhook",
    );
    expect(webhook).toBeDefined();
  });

  test("returns rss trigger for 'feed' keyword", async () => {
    const result = await search_triggers.execute(
      { keywords: ["feed"] },
      EXECUTION_OPTIONS,
    );
    expect(result.success).toBe(true);
    const rss = result.triggers.find(
      (t: { trigger_id: string }) => t.trigger_id === "rss",
    );
    expect(rss).toBeDefined();
  });

  test("each trigger includes setupSchema and trigger_id", async () => {
    const result = await search_triggers.execute(
      { keywords: ["trigger"] },
      EXECUTION_OPTIONS,
    );
    for (const trigger of result.triggers) {
      expect(trigger).toHaveProperty("trigger_id");
      expect(trigger).toHaveProperty("setupSchema");
      expect(typeof trigger.setupSchema).toBe("object");
    }
  });

  test("schedule trigger setupSchema includes cron and timezone", async () => {
    const result = await search_triggers.execute(
      { keywords: ["schedule"] },
      EXECUTION_OPTIONS,
    );
    const schedule = result.triggers.find(
      (t: { trigger_id: string }) => t.trigger_id === "schedule",
    );
    expect(schedule?.setupSchema).toHaveProperty("cron");
    expect(schedule?.setupSchema).toHaveProperty("timezone");
  });

  test("triggers that support editing include editSchema", async () => {
    const result = await search_triggers.execute(
      { keywords: ["trigger"] },
      EXECUTION_OPTIONS,
    );
    const schedule = result.triggers.find(
      (t: { trigger_id: string }) => t.trigger_id === "schedule",
    );
    expect(schedule).toHaveProperty("editSchema");
  });

  test("returns empty array for unmatched keyword", async () => {
    const result = await search_triggers.execute(
      { keywords: ["nonexistent_xyz_abc"] },
      EXECUTION_OPTIONS,
    );
    expect(result.success).toBe(true);
    expect(result.triggers).toHaveLength(0);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts
```

Expected: FAIL — module not found.

### Step 3: Implement search-triggers.ts

Create `src/lib/runner/tools/triggers/search-triggers.ts`.

**Key design decisions (Tasklet-aligned):**
- Catalog entries use `trigger_id` (not `id`) — matches `setup_trigger.trigger_id`
- `setupSchema` describes only the trigger-specific `params` object — NOT name/instruction_path (those are Sunder top-level fields on `setup_trigger`)
- Schedule `setupSchema`: `{ cron, timezone }` — matches Tasklet traces (`cron: "0 6 * * *", timezone: "Asia/Singapore"`)
- All three types include `editSchema` since all support editing

```typescript
/**
 * search_triggers tool — static catalog lookup for available trigger types.
 * @module lib/runner/tools/triggers/search-triggers
 */
import { tool } from "ai";
import { z } from "zod";

/**
 * Static catalog of trigger types the agent can create.
 * setupSchema describes the `params` object for `setup_trigger`.
 * editSchema describes `edit_params` for `manage_active_triggers` edit action.
 * Per Tasklet v2: "Triggers that support editing will include an editSchema field."
 */
const TRIGGER_CATALOG = [
  {
    trigger_id: "schedule",
    name: "Schedule",
    description:
      "Runs at times you choose — daily, weekly, or any custom cron schedule. " +
      "Use for recurring tasks like daily briefings, weekly reports, or periodic checks.",
    keywords: [
      "schedule", "cron", "daily", "weekly", "monthly", "recurring", "timer",
      "interval", "morning", "evening", "every", "periodic", "trigger",
    ],
    setupSchema: {
      cron: {
        type: "string",
        required: true,
        description:
          "5-field cron expression (minute hour day-of-month month day-of-week). " +
          "Examples: '0 9 * * *' (daily 9am), '0 9 * * 1' (every Monday 9am), " +
          "'*/30 * * * *' (every 30 minutes). Interpreted in the timezone specified.",
      },
      timezone: {
        type: "string",
        required: false,
        description:
          "IANA timezone (e.g., 'Asia/Singapore', 'UTC'). Defaults to 'Asia/Singapore'. " +
          "The cron expression is evaluated in this timezone.",
      },
    },
    editSchema: {
      cron: { type: "string", description: "Updated 5-field cron expression." },
      timezone: { type: "string", description: "Updated IANA timezone." },
    },
  },
  {
    trigger_id: "webhook",
    name: "Webhook",
    description:
      "Runs when another app or service sends a POST request to a unique URL. " +
      "Use for app events, custom integrations, Apple Shortcuts, or agent-to-agent communication.",
    keywords: [
      "webhook", "http", "post", "api", "callback", "url", "integration",
      "external", "event", "push", "notification", "trigger",
    ],
    setupSchema: {
      webhook_secret: {
        type: "string",
        required: false,
        description:
          "Optional HMAC-SHA256 secret for verifying webhook signatures. " +
          "If set, inbound POSTs must include an X-Webhook-Signature header.",
      },
    },
    editSchema: {
      webhook_secret: { type: "string", description: "Updated or new webhook secret." },
    },
  },
  {
    trigger_id: "rss",
    name: "RSS Feed",
    description:
      "Runs when new content appears in any RSS or Atom feed. " +
      "Use for monitoring blogs, news sites, Substacks, YouTube channels, Reddit, or podcasts.",
    keywords: [
      "rss", "feed", "atom", "blog", "news", "monitor", "subscribe",
      "content", "podcast", "youtube", "substack", "reddit", "trigger",
    ],
    setupSchema: {
      feed_url: {
        type: "string",
        required: true,
        description: "Full URL of the RSS or Atom feed to monitor.",
      },
      polling_interval_minutes: {
        type: "number",
        required: false,
        description:
          "How often to check the feed. Allowed values: 15, 30, 60, 360, 1440. Default: 60.",
      },
    },
    editSchema: {
      feed_url: { type: "string", description: "Updated feed URL." },
      polling_interval_minutes: { type: "number", description: "Updated polling interval." },
    },
  },
] as const;

type TriggerCatalogEntry = (typeof TRIGGER_CATALOG)[number];

function matchesCatalogEntry(entry: TriggerCatalogEntry, keywords: string[]): boolean {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  return lowerKeywords.some(
    (kw) =>
      entry.keywords.some((ek) => ek.includes(kw)) ||
      entry.name.toLowerCase().includes(kw) ||
      entry.description.toLowerCase().includes(kw),
  );
}

export function createSearchTriggersTool() {
  const search_triggers = tool({
    description:
      "Search for available trigger types by keywords. Returns matching trigger types " +
      "with their setup schemas and edit schemas. Call this before setup_trigger to discover " +
      "what's available and what parameters are required.",
    inputSchema: z.object({
      keywords: z
        .array(z.string())
        .min(1)
        .describe('One or more keywords to search (e.g., ["schedule", "daily"], ["webhook"], ["rss", "feed"]).'),
    }),
    execute: async ({ keywords }) => {
      const matches = TRIGGER_CATALOG.filter((entry) => matchesCatalogEntry(entry, keywords));
      return {
        success: true as const,
        triggers: matches.map((entry) => ({
          trigger_id: entry.trigger_id,
          name: entry.name,
          description: entry.description,
          setupSchema: entry.setupSchema,
          editSchema: entry.editSchema,
        })),
      };
    },
  });

  return { search_triggers };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts
```

Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/triggers/search-triggers.ts \
  src/lib/runner/tools/triggers/__tests__/search-triggers.test.ts
git commit -m "feat(pr20): add search_triggers tool with Tasklet-aligned catalog"
```

---

## Task 4: setup_trigger tool — create triggers at runtime

**Files:**
- Create: `src/lib/runner/tools/triggers/setup-trigger.ts`
- Create: `src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts`

**Tasklet alignment (read `roadmap docs/.../v2/16-setup_trigger.md`):**
- `trigger_id` (required) — e.g. "schedule", "webhook", "rss"
- `params` (required) — trigger-specific config matching `setupSchema` (e.g. `{ cron, timezone }`)
- `invocation_message` (optional, top-level) — 200-char label included on each fire

**Sunder additions (not in Tasklet):**
- `name` (required, top-level) — human-readable trigger name, stored as column
- `instruction_path` (required, top-level) — compaction insurance (TRIG-04)

### Step 1: Write the failing tests

Create `src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from "vitest";

import { createSetupTriggerTool } from "../setup-trigger";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const THREAD_ID = "00000000-0000-0000-0000-000000000002";

const EXECUTION_OPTIONS = {
  toolCallId: "test-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function createMockSupabase() {
  const insertChain = {
    insert: vi.fn(() => insertChain),
    select: vi.fn(() => insertChain),
    single: vi.fn(),
  };
  return {
    from: vi.fn(() => insertChain),
    insertChain,
  };
}

describe("setup_trigger", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  test("creates a schedule trigger with cron + timezone", async () => {
    const triggerRow = {
      id: "trigger-uuid",
      name: "Daily check",
      trigger_type: "schedule",
      cron_expression: "0 9 * * *",
      enabled: true,
    };
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: triggerRow,
      error: null,
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Daily check",
        instruction_path: "subagents/triggers/daily.md",
        params: { cron: "0 9 * * *", timezone: "Asia/Singapore" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("agent_triggers");
    expect(mockSupabase.insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        thread_id: THREAD_ID,
        trigger_type: "schedule",
        cron_expression: "0 9 * * *",
        name: "Daily check",
        instruction_path: "subagents/triggers/daily.md",
      }),
    );
  });

  test("defaults timezone to Asia/Singapore when omitted", async () => {
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: { id: "t1", name: "Test", trigger_type: "schedule", enabled: true },
      error: null,
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Test",
        instruction_path: "subagents/triggers/test.md",
        params: { cron: "0 9 * * *" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ timezone: "Asia/Singapore" }),
      }),
    );
  });

  // NOTE: No cron validation test here — tool is a thin INSERT wrapper (Tasklet-aligned).
  // If cron is unparseable, cron-parser throws when computing next_fire_at — the tool
  // catches this naturally and returns an error. Explicit cron validation is not the tool's job.
  // Scanner validates trigger well-formedness on first pick-up (see Task 8).

  test("creates a webhook trigger and returns the webhook URL", async () => {
    const triggerRow = {
      id: "webhook-trigger-uuid",
      name: "Stripe webhook",
      trigger_type: "webhook",
      enabled: true,
    };
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: triggerRow,
      error: null,
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "webhook",
        name: "Stripe webhook",
        instruction_path: "subagents/triggers/stripe.md",
        params: {},
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.trigger.webhook_url).toContain("/api/trigger/webhook/");
    expect(result.trigger.webhook_url).toContain("webhook-trigger-uuid");
  });

  test("creates an rss trigger with feed_url in payload", async () => {
    const triggerRow = {
      id: "rss-trigger-uuid",
      name: "Blog monitor",
      trigger_type: "rss",
      enabled: true,
    };
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: triggerRow,
      error: null,
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "rss",
        name: "Blog monitor",
        instruction_path: "subagents/triggers/blog.md",
        params: { feed_url: "https://example.com/feed.xml" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: "rss",
        payload: expect.objectContaining({ feed_url: "https://example.com/feed.xml" }),
      }),
    );
  });

  // NOTE: No RSS interval validation test here — tool is a thin INSERT wrapper (Tasklet-aligned).
  // Tool accepts any polling_interval_minutes and stores it in payload. Scanner validates
  // and derives cron expression from interval on first pick-up (see Task 8).

  test("stores invocation_message when provided", async () => {
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: { id: "t1", name: "Test", trigger_type: "schedule", enabled: true },
      error: null,
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Test",
        instruction_path: "subagents/triggers/test.md",
        params: { cron: "0 9 * * *" },
        invocation_message: "Check PropertyGuru for new listings",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockSupabase.insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        invocation_message: "Check PropertyGuru for new listings",
      }),
    );
  });

  test("rejects unknown trigger_id", async () => {
    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "unknown_type",
        name: "Bad",
        instruction_path: "subagents/triggers/bad.md",
        params: {},
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown trigger type");
  });

  test("returns DB error on insert failure", async () => {
    mockSupabase.insertChain.single.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS violation" },
    });

    const { setup_trigger } = createSetupTriggerTool(
      mockSupabase as any,
      CLIENT_ID,
      THREAD_ID,
    );

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Test",
        instruction_path: "subagents/triggers/test.md",
        params: { cron: "0 9 * * *" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("RLS violation");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts
```

Expected: FAIL — module not found.

### Step 3: Implement setup-trigger.ts

Key implementation details (**thin tool — Tasklet-aligned**):
- **Tool is a thin INSERT wrapper.** Params pass through to `payload` JSONB with minimal field mapping. No type-specific validation — that's the scanner's job (Task 8).
- `name` and `instruction_path` are **top-level** tool params (Sunder additions), mapped to columns
- `invocation_message` is **top-level** (Tasklet v2 spec), mapped to column
- `params` contains **only** trigger-specific config matching `setupSchema` — stored as-is in `payload` JSONB
- Schedule: `params.cron` → `cron_expression` column. `params.timezone` defaults to `"Asia/Singapore"`. `next_fire_at` computed via `cron-parser` — if cron is unparseable, cron-parser throws and tool returns error naturally (no explicit validation needed).
- Webhook: `params.webhook_secret` → `webhook_secret` column. No `next_fire_at` (on-demand only). Response includes `webhook_url` built from `NEXT_PUBLIC_APP_URL` + row ID.
- RSS: `params.feed_url` + `params.polling_interval_minutes` stored in `payload`. Tool does NOT validate interval values — scanner derives cron expression from interval on first pick-up (Task 8).

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts
```

Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/triggers/setup-trigger.ts \
  src/lib/runner/tools/triggers/__tests__/setup-trigger.test.ts
git commit -m "feat(pr20): add setup_trigger tool with Tasklet-aligned params"
```

---

## Task 5: manage_active_triggers tool — list/view/delete/simulate/edit

**Files:**
- Create: `src/lib/runner/tools/triggers/manage-triggers.ts`
- Create: `src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts`

**Tasklet alignment (read `roadmap docs/.../v2/17-manage_active_triggers.md`):**
- 5 actions: `list`, `view`, `delete`, `simulate`, `edit`
- `list` returns: IDs, names, titles, `invocationMessage`, and arguments
- `edit` takes `edit_params` (matching `editSchema`) and/or `invocation_message` (nullable)
- `simulate` takes `trigger_instance_id` + `payload`
- `invocation_message` can be set to `null` to clear it

### Step 1: Write the failing tests

Create `src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts`:

```typescript
import { describe, expect, test, vi, beforeEach } from "vitest";

import { createManageTriggersTool } from "../manage-triggers";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";

const EXECUTION_OPTIONS = {
  toolCallId: "test-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function createMockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(),
    chain,
  };
}

describe("manage_active_triggers", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  test("list action returns all non-pulse triggers for client", async () => {
    const triggers = [
      {
        id: "t1", name: "Daily check", trigger_type: "schedule",
        enabled: true, invocation_message: "Check listings",
        cron_expression: "0 9 * * *", payload: { timezone: "Asia/Singapore" },
      },
      {
        id: "t2", name: "Stripe hook", trigger_type: "webhook",
        enabled: true, invocation_message: null,
        cron_expression: null, payload: {},
      },
    ];
    mockSupabase.chain.order.mockResolvedValueOnce({ data: triggers, error: null });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      { action: "list" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers).toHaveLength(2);
    expect(result.triggers[0]).toHaveProperty("invocationMessage");
    expect(mockSupabase.chain.neq).toHaveBeenCalledWith("trigger_type", "pulse");
  });

  test("view action returns single trigger details", async () => {
    const trigger = {
      id: "t1", name: "Daily check", trigger_type: "schedule",
      cron_expression: "0 9 * * *", enabled: true,
      next_fire_at: "2026-03-07T01:00:00Z",
      last_fired_at: "2026-03-06T01:00:00Z",
      last_status: "completed", retry_count: 0,
      invocation_message: "Check listings",
      instruction_path: "subagents/triggers/daily.md",
      payload: { timezone: "Asia/Singapore" },
    };
    mockSupabase.chain.single.mockResolvedValueOnce({ data: trigger, error: null });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      { action: "view", trigger_instance_id: "t1" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.trigger.name).toBe("Daily check");
    expect(result.trigger.invocationMessage).toBe("Check listings");
  });

  test("delete action removes trigger", async () => {
    mockSupabase.chain.eq.mockResolvedValueOnce({ error: null });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      { action: "delete", trigger_instance_id: "t1" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.chain.delete).toHaveBeenCalled();
  });

  test("edit action updates cron expression and recalculates next_fire_at", async () => {
    // First call: fetch current trigger (for view before edit)
    mockSupabase.chain.single
      .mockResolvedValueOnce({
        data: {
          id: "t1", trigger_type: "schedule", cron_expression: "0 9 * * *",
          payload: { timezone: "Asia/Singapore" },
        },
        error: null,
      })
      // Second call: update result
      .mockResolvedValueOnce({
        data: { id: "t1", cron_expression: "0 8 * * *", enabled: true },
        error: null,
      });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      {
        action: "edit",
        trigger_instance_id: "t1",
        edit_params: { cron: "0 8 * * *" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ cron_expression: "0 8 * * *" }),
    );
  });

  test("edit action clears invocation_message when null", async () => {
    mockSupabase.chain.single
      .mockResolvedValueOnce({
        data: { id: "t1", trigger_type: "schedule", invocation_message: "Old msg" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "t1", invocation_message: null },
        error: null,
      });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      {
        action: "edit",
        trigger_instance_id: "t1",
        invocation_message: null,
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ invocation_message: null }),
    );
  });

  test("edit requires at least one of edit_params or invocation_message", async () => {
    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      { action: "edit", trigger_instance_id: "t1" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("edit_params or invocation_message");
  });

  test("view/delete/edit/simulate require trigger_instance_id", async () => {
    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    for (const action of ["view", "delete", "edit", "simulate"] as const) {
      const result = await manage_active_triggers.execute(
        { action },
        EXECUTION_OPTIONS,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("trigger_instance_id");
    }
  });

  test("simulate requires payload", async () => {
    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      { action: "simulate", trigger_instance_id: "t1" },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("payload");
  });

  test("simulate fires synthetic trigger event in thread", async () => {
    const trigger = {
      id: "t1", name: "Daily check", trigger_type: "schedule",
      thread_id: "00000000-0000-0000-0000-000000000002",
      instruction_path: "subagents/triggers/daily.md",
      invocation_message: "Check listings",
    };
    mockSupabase.chain.single.mockResolvedValueOnce({ data: trigger, error: null });
    // Mock message creation
    mockSupabase.chain.single.mockResolvedValueOnce({ data: { id: "msg-1" }, error: null });

    const { manage_active_triggers } = createManageTriggersTool(
      mockSupabase as any,
      CLIENT_ID,
    );

    const result = await manage_active_triggers.execute(
      {
        action: "simulate",
        trigger_instance_id: "t1",
        payload: { test: true },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("simulated");
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts
```

Expected: FAIL — module not found.

### Step 3: Implement manage-triggers.ts

Key implementation details:
- Takes `(supabase, clientId, options?)` — no threadId (triggers are cross-thread). Options: `{ readOnly?: boolean }`. When `readOnly: true`, tool description and action enum restrict to `list` and `view` only (used by autopilot barrel in Task 6).
- `list`: SELECT all non-pulse triggers for client, response includes `invocationMessage` per Tasklet spec
- `view`: SELECT single by id + client_id, full details
- `delete`: DELETE by id + client_id
- `simulate`: Fetches trigger by id, creates a synthetic `<trigger-event>` message in the trigger's thread (same format as executor) using the provided `payload`. Requires both `trigger_instance_id` and `payload`. Returns acknowledgement.
- `edit`: **Thin UPDATE (Tasklet-aligned).** Merges `edit_params` into existing `payload` JSONB. Updates `invocation_message` if provided. Does NOT validate edit_params against trigger type — scanner re-validates on next pick-up. If `cron` changes on schedule triggers, recomputes `next_fire_at` (cron-parser throws naturally if invalid) and resets `retry_count` to 0.

### Step 4: Run tests

```bash
npx vitest run src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts
```

Expected: ALL PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/triggers/manage-triggers.ts \
  src/lib/runner/tools/triggers/__tests__/manage-triggers.test.ts
git commit -m "feat(pr20): add manage_active_triggers tool with edit + invocation_message"
```

---

## Task 6: Trigger tool barrel + runner wiring (with allowMutations gate)

**Files:**
- Create: `src/lib/runner/tools/triggers/index.ts`
- Modify: `src/lib/runner/tools/index.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/run-autopilot.ts`

**Safety decision:** Trigger mutation (create/delete/edit) is chat-only. Autopilot gets read-only (search + list/view). This prevents a background process from creating persistent automations without a user present.

Per Tasklet: "Triggers cannot be used by subagents" — our autopilot is analogous.

### Step 1: Create barrel with allowMutations option

```typescript
/**
 * Trigger tool factory barrel for runner registration.
 * @module lib/runner/tools/triggers
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { createManageTriggersTool } from "./manage-triggers";
import { createSearchTriggersTool } from "./search-triggers";
import { createSetupTriggerTool } from "./setup-trigger";

interface TriggerToolOptions {
  /** When false, only search + list/view are available. Default: true. */
  allowMutations?: boolean;
}

export function createTriggerTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  threadId: string,
  options?: TriggerToolOptions,
) {
  const { allowMutations = true } = options ?? {};

  const searchTools = createSearchTriggersTool();

  if (!allowMutations) {
    // Read-only: search catalog + list/view only
    const readOnlyManageTools = createManageTriggersTool(supabase, clientId, {
      readOnly: true,
    });
    return { ...searchTools, ...readOnlyManageTools };
  }

  const setupTools = createSetupTriggerTool(supabase, clientId, threadId);
  const manageTools = createManageTriggersTool(supabase, clientId);

  return { ...searchTools, ...setupTools, ...manageTools };
}
```

**Note:** `createManageTriggersTool` needs a `readOnly` option that restricts actions to `list` and `view` only. When readOnly, the tool description and action enum should reflect this.

### Step 2: Add export to tools barrel

In `src/lib/runner/tools/index.ts`, add:
```typescript
export { createTriggerTools } from "./triggers";
```

### Step 3: Wire into run-agent.ts (chat — full CRUD)

In `createRunnerTools`:
```typescript
const triggerTools = createTriggerTools(supabase, clientId, threadId, {
  allowMutations: true,
});
```

Add to return spread and update `RunnerTools` type.

### Step 4: Wire into run-autopilot.ts (background — read-only)

```typescript
const triggerTools = createTriggerTools(supabase, clientId, threadId, {
  allowMutations: false,
});
```

### Step 5: Verify existing tests

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/runner/tools/triggers/index.ts \
  src/lib/runner/tools/index.ts \
  src/lib/runner/run-agent.ts \
  src/lib/runner/run-autopilot.ts
git commit -m "feat(pr20): wire trigger tools into runner with allowMutations gate"
```

---

## Task 7: System prompt — add `<triggers>` safety block

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`

Per Tasklet v2 system prompt, add a `<triggers>` block. Adapted for Sunder (no app-specific triggers, no connections yet).

### Step 1: Add the block to the system prompt

Read `src/lib/ai/system-prompt.ts` first. Add after the existing tool sections:

```typescript
const TRIGGERS_BLOCK = `
<triggers>
You can create and manage triggers — automations that run on a schedule, on webhook, or on new RSS items.

Rules:
- Only create, delete, or modify triggers when the user explicitly requests it.
- Never create triggers proactively or as a side effect of other work.
- Before setting up triggers, understand completely what the user wants and gather all necessary information.
- Make sure all prerequisite work is completed (instruction files written, configs prepared) before creating triggers.
- Use search_triggers to discover available trigger types and their setup schemas before setup_trigger.
- Once a trigger is created, offer to run a test using manage_active_triggers with the simulate action.
- Do not test the trigger unless the user asks you to.

When handling trigger events autonomously:
- If you encounter persistent errors (missing files, config issues), notify the user via send_message.
- Do not delete or modify triggers on error — they should continue running and will work once the issue is fixed.
- Do not send duplicate notifications about the same issue.
</triggers>`;
```

### Step 2: Verify prompt builds

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: ALL PASS.

### Step 3: Commit

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr20): add <triggers> safety block to system prompt"
```

---

## Task 8: Retry policy — update scanner and release_trigger_claim RPC (TRIG-12)

**Files:**
- Create: `supabase/migrations/20260306040002_update_release_trigger_claim_for_retry.sql`
- Modify: `src/lib/triggers/scanner.ts`
- Modify: `src/lib/triggers/__tests__/scanner.test.ts`
- Modify: `src/lib/triggers/executor.ts`
- Modify: `src/lib/triggers/__tests__/executor.test.ts`

**Core change:** `release_trigger_claim` RPC gains a `p_advance_next_fire_at BOOLEAN` parameter. On success: advance `next_fire_at`, reset `retry_count` to 0. On retryable failure: increment `retry_count`, do NOT advance `next_fire_at` (leave it in the past so scanner re-picks on next tick). On `retry_count >= max`: set `failed_permanent`, disable trigger.

**Validation responsibility (Tasklet-aligned thin tools):** Since setup_trigger and manage_active_triggers are thin pass-throughs, the scanner is responsible for validating trigger well-formedness on pick-up. For schedule triggers: verify `cron_expression` is parseable. For RSS triggers: verify `payload.feed_url` is present, derive cron from `polling_interval_minutes` if `cron_expression` is NULL. Invalid triggers are released with `"config_error"` status and NOT dispatched.

### Step 1: Write the migration

```sql
-- PR20: update release_trigger_claim for retry policy (TRIG-12)
-- Adds p_advance_next_fire_at boolean to control whether next_fire_at moves forward.
-- On success: advance + reset retry_count. On failure: increment retry_count, don't advance.
CREATE OR REPLACE FUNCTION public.release_trigger_claim(
  p_trigger_id UUID,
  p_run_id UUID,
  p_status TEXT,
  p_next_fire_at TIMESTAMPTZ DEFAULT NULL,
  p_advance_next_fire_at BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.agent_triggers
  SET
    current_run_id = NULL,
    last_status = p_status,
    next_fire_at = CASE
      WHEN p_advance_next_fire_at AND p_next_fire_at IS NOT NULL THEN p_next_fire_at
      WHEN p_advance_next_fire_at THEN next_fire_at
      ELSE next_fire_at  -- don't advance on retryable failure
    END,
    retry_count = CASE
      WHEN p_status = 'completed' THEN 0
      WHEN p_status IN ('failed', 'dispatch_failed') THEN retry_count + 1
      ELSE retry_count
    END,
    updated_at = now()
  WHERE id = p_trigger_id
    AND current_run_id = p_run_id
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;
```

### Step 2: Write failing scanner tests for validation + retry policy

Add to `src/lib/triggers/__tests__/scanner.test.ts`:

```typescript
describe("trigger validation on pick-up (thin tools)", () => {
  test("marks schedule trigger with unparseable cron as config_error", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "schedule",
      cron_expression: "not-a-cron",
      retry_count: 0,
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [trigger], error: null })
      .mockResolvedValueOnce({ data: true, error: null }); // release claim

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "release_trigger_claim",
      expect.objectContaining({ p_status: "config_error" }),
    );
  });

  test("marks RSS trigger missing feed_url as config_error", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "rss",
      payload: {}, // no feed_url
      retry_count: 0,
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [trigger], error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "release_trigger_claim",
      expect.objectContaining({ p_status: "config_error" }),
    );
  });

  test("derives cron_expression for RSS trigger from polling_interval_minutes", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "rss",
      cron_expression: null,
      payload: { feed_url: "https://example.com/feed.xml", polling_interval_minutes: 60 },
      retry_count: 0,
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [trigger], error: null });
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-08T09:00:00Z"));
    dispatch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(result.dispatched).toBe(1);
  });
});
```

Add to `src/lib/triggers/__tests__/scanner.test.ts`:

```typescript
describe("retry policy (TRIG-12)", () => {
  test("dispatches failed schedule trigger with retry_count < 2", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "schedule",
      last_status: "failed",
      retry_count: 1,
      cron_expression: "0 9 * * *",
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })  // reap stale
      .mockResolvedValueOnce({ data: [trigger], error: null });  // claim
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-08T09:00:00Z"));
    dispatch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(result.dispatched).toBe(1);
    expect(dispatch).toHaveBeenCalled();
  });

  test("marks failed_permanent and disables when retry_count >= 2", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "schedule",
      last_status: "failed",
      retry_count: 2,
      cron_expression: "0 9 * * *",
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [trigger], error: null })
      .mockResolvedValueOnce({ data: true, error: null });  // release claim
    mockSupabase.mockUpdateEq.mockResolvedValueOnce({ error: null });  // disable

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
    expect(mockSupabase.mockUpdateEq).toHaveBeenCalled();
    // Verify trigger disabled
    expect(mockSupabase.from).toHaveBeenCalledWith("agent_triggers");
  });

  test("never retries failed pulse triggers (0 retries)", async () => {
    const trigger = makeTriggerRow({
      trigger_type: "pulse",
      last_status: "failed",
      retry_count: 0,
      cron_expression: "0 */6 * * *",
    });
    mockSupabase.rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [trigger], error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    const result = await runScan({ supabase: mockSupabase as any, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

### Step 3: Run tests to verify they fail

```bash
npx vitest run src/lib/triggers/__tests__/scanner.test.ts
```

Expected: FAIL — retry logic not implemented.

### Step 4: Implement validation + retry logic in scanner.ts

In `runScan`, add validation and retry checks before dispatching each claimed trigger:

```typescript
const MAX_RETRIES_PULSE = 0;
const MAX_RETRIES_USER = 2;

// For each claimed trigger:

// 1. Validate trigger well-formedness (thin tools delegate validation here)
const validationError = validateTriggerConfig(trigger);
if (validationError) {
  await releaseClaim(supabase, trigger, "config_error", { advance: false });
  continue;
}

// 2. For RSS triggers without cron_expression, derive from polling_interval_minutes
if (trigger.trigger_type === "rss" && !trigger.cron_expression) {
  const interval = trigger.payload?.polling_interval_minutes ?? 60;
  trigger.cron_expression = deriveCronFromInterval(interval);
}

// 3. Retry policy check
const maxRetries = trigger.trigger_type === "pulse" ? MAX_RETRIES_PULSE : MAX_RETRIES_USER;
if (trigger.last_status === "failed" && trigger.retry_count >= maxRetries) {
  await updateTrigger(supabase, trigger.id, { enabled: false });
  await releaseClaim(supabase, trigger, "failed_permanent");
  continue;
}
```

```typescript
/** Validates trigger config is well-formed. Returns error string or null. */
function validateTriggerConfig(trigger: TriggerRow): string | null {
  if (trigger.trigger_type === "schedule") {
    try { parseExpression(trigger.cron_expression!); } catch { return "Invalid cron expression"; }
  }
  if (trigger.trigger_type === "rss" && !trigger.payload?.feed_url) {
    return "RSS trigger missing feed_url";
  }
  return null;
}
```

Also update all `releaseClaim` calls to pass the `p_advance_next_fire_at` parameter:
- On successful dispatch: `p_advance_next_fire_at = true` (advance to next scheduled time)
- On retryable failure from executor: `p_advance_next_fire_at = false` (leave in past for re-pick)

### Step 5: Update executor to pass advance flag

In `src/lib/triggers/executor.ts`, update `release_trigger_claim` RPC calls:
- On `"completed"`: pass `p_advance_next_fire_at = true`
- On `"failed"`: pass `p_advance_next_fire_at = false`
- On `"queued"` / `"skipped_*"`: pass `p_advance_next_fire_at = true`

### Step 6: Run all trigger tests

```bash
npx vitest run src/lib/triggers/__tests__/
```

Expected: ALL PASS.

### Step 7: Commit

```bash
git add supabase/migrations/20260306040002_update_release_trigger_claim_for_retry.sql \
  src/lib/triggers/scanner.ts src/lib/triggers/__tests__/scanner.test.ts \
  src/lib/triggers/executor.ts src/lib/triggers/__tests__/executor.test.ts
git commit -m "feat(pr20): add retry policy — retryable failures don't advance next_fire_at (TRIG-12)"
```

---

## Task 9: Webhook inbound endpoint

**Files:**
- Create: `src/lib/triggers/webhook-auth.ts` — HMAC validation (pure function)
- Create: `src/lib/triggers/__tests__/webhook-inbound.test.ts` — HMAC tests
- Create: `src/lib/triggers/webhook-claim.ts` — shared on-demand claim helper
- Create: `src/lib/triggers/__tests__/webhook-claim.test.ts`
- Create: `app/api/trigger/webhook/[triggerId]/route.ts`
- Create: `src/lib/triggers/__tests__/webhook-route.test.ts` — route handler tests

### Step 1: Write failing HMAC validation tests

```typescript
import { describe, expect, test } from "vitest";
import { createHmac } from "crypto";

import { validateWebhookRequest } from "../webhook-auth";

describe("webhook HMAC validation", () => {
  test("passes when no webhook_secret configured", () => {
    const result = validateWebhookRequest({
      webhookSecret: null,
      signature: null,
      rawBody: "{}",
    });
    expect(result.valid).toBe(true);
  });

  test("fails when webhook_secret set but no signature header", () => {
    const result = validateWebhookRequest({
      webhookSecret: "my-secret",
      signature: null,
      rawBody: "{}",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("signature");
  });

  test("fails when HMAC doesn't match", () => {
    const result = validateWebhookRequest({
      webhookSecret: "my-secret",
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      rawBody: "{}",
    });
    expect(result.valid).toBe(false);
  });

  test("passes when HMAC matches", () => {
    const rawBody = '{"event":"test"}';
    const hmac = createHmac("sha256", "my-secret").update(rawBody).digest("hex");
    const result = validateWebhookRequest({
      webhookSecret: "my-secret",
      signature: `sha256=${hmac}`,
      rawBody,
    });
    expect(result.valid).toBe(true);
  });
});
```

### Step 2: Run, verify fail, implement webhook-auth.ts

Uses `crypto.createHmac` + `timingSafeEqual`. See original tasklist Task 8 Step 3 for implementation.

### Step 3: Write failing webhook claim tests

```typescript
import { describe, expect, test, vi } from "vitest";

import { claimTriggerOnDemand } from "../webhook-claim";

describe("claimTriggerOnDemand", () => {
  test("returns run_id on successful claim", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "t1", current_run_id: "new-run-id" },
          error: null,
        }),
      })),
    };

    const result = await claimTriggerOnDemand(mockSupabase as any, "t1");
    expect(result.claimed).toBe(true);
    expect(result.runId).toBeDefined();
  });

  test("returns claimed=false when trigger already running", async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows" },
        }),
      })),
    };

    const result = await claimTriggerOnDemand(mockSupabase as any, "t1");
    expect(result.claimed).toBe(false);
  });
});
```

### Step 4: Implement webhook-claim.ts

```typescript
/**
 * On-demand trigger claim for webhooks (not scanner-based).
 * @module lib/triggers/webhook-claim
 */
import type { TriggerSupabaseClient } from "./schemas";

interface ClaimResult {
  claimed: boolean;
  runId?: string;
  trigger?: Record<string, unknown>;
}

export async function claimTriggerOnDemand(
  supabase: TriggerSupabaseClient,
  triggerId: string,
): Promise<ClaimResult> {
  const runId = crypto.randomUUID();

  const { data, error } = await supabase
    .from("agent_triggers")
    .update({
      current_run_id: runId,
      last_fired_at: new Date().toISOString(),
    })
    .eq("id", triggerId)
    .is("current_run_id", null)
    .select()
    .single();

  if (error || !data) {
    return { claimed: false };
  }

  return { claimed: true, runId, trigger: data };
}
```

### Step 5: Write route handler tests

Create `src/lib/triggers/__tests__/webhook-route.test.ts`:

```typescript
import { createHmac } from "crypto";
import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock dependencies before importing route
vi.mock("@/lib/triggers/webhook-claim", () => ({
  claimTriggerOnDemand: vi.fn(),
}));
vi.mock("@/lib/triggers/executor", () => ({
  executeTrigger: vi.fn(),
}));

const TRIGGER_ID = "00000000-0000-0000-0000-000000000099";

function makeWebhookTrigger(overrides = {}) {
  return {
    id: TRIGGER_ID,
    client_id: "c1",
    thread_id: "t1",
    trigger_type: "webhook",
    enabled: true,
    webhook_secret: null,
    instruction_path: "subagents/triggers/stripe.md",
    invocation_message: null,
    ...overrides,
  };
}

function createMockSupabase(triggerData: unknown = null, triggerError: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: triggerData, error: triggerError }),
    })),
  };
}

describe("POST /api/trigger/webhook/[triggerId]", () => {
  test("returns 404 for non-existent trigger", async () => {
    const mockSupabase = createMockSupabase(null, { code: "PGRST116" });
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, { method: "POST", body: "{}" }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(404);
  });

  test("returns 404 for non-webhook trigger type", async () => {
    const mockSupabase = createMockSupabase(
      makeWebhookTrigger({ trigger_type: "schedule" }),
    );
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, { method: "POST", body: "{}" }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(404);
  });

  test("returns 404 for disabled trigger", async () => {
    const mockSupabase = createMockSupabase(
      makeWebhookTrigger({ enabled: false }),
    );
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, { method: "POST", body: "{}" }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(404);
  });

  test("returns 401 for bad HMAC signature", async () => {
    const mockSupabase = createMockSupabase(
      makeWebhookTrigger({ webhook_secret: "my-secret" }),
    );
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, {
        method: "POST",
        body: "{}",
        headers: { "X-Webhook-Signature": "sha256=badbadbad" },
      }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(401);
  });

  test("returns 409 when trigger already running", async () => {
    const { claimTriggerOnDemand } = await import("@/lib/triggers/webhook-claim");
    (claimTriggerOnDemand as any).mockResolvedValueOnce({ claimed: false });

    const mockSupabase = createMockSupabase(makeWebhookTrigger());
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, { method: "POST", body: "{}" }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(409);
  });

  test("returns 200 with valid POST and no secret", async () => {
    const { claimTriggerOnDemand } = await import("@/lib/triggers/webhook-claim");
    const { executeTrigger } = await import("@/lib/triggers/executor");
    (claimTriggerOnDemand as any).mockResolvedValueOnce({ claimed: true, runId: "run-1", trigger: makeWebhookTrigger() });
    (executeTrigger as any).mockResolvedValueOnce({ status: "completed" });

    const mockSupabase = createMockSupabase(makeWebhookTrigger());
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, { method: "POST", body: "{}" }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("completed");
  });

  test("returns 200 with valid HMAC and fires executor", async () => {
    const { claimTriggerOnDemand } = await import("@/lib/triggers/webhook-claim");
    const { executeTrigger } = await import("@/lib/triggers/executor");
    const rawBody = '{"event":"test"}';
    const hmac = createHmac("sha256", "my-secret").update(rawBody).digest("hex");

    (claimTriggerOnDemand as any).mockResolvedValueOnce({ claimed: true, runId: "run-1", trigger: makeWebhookTrigger({ webhook_secret: "my-secret" }) });
    (executeTrigger as any).mockResolvedValueOnce({ status: "completed" });

    const mockSupabase = createMockSupabase(makeWebhookTrigger({ webhook_secret: "my-secret" }));
    const { POST } = await setupRoute(mockSupabase);

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, {
        method: "POST",
        body: rawBody,
        headers: { "X-Webhook-Signature": `sha256=${hmac}` },
      }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(response.status).toBe(200);
  });

  test("passes POST body as triggerPayload to executor", async () => {
    const { claimTriggerOnDemand } = await import("@/lib/triggers/webhook-claim");
    const { executeTrigger } = await import("@/lib/triggers/executor");
    const rawBody = '{"event":"payment.succeeded","amount":100}';

    (claimTriggerOnDemand as any).mockResolvedValueOnce({ claimed: true, runId: "run-1", trigger: makeWebhookTrigger() });
    (executeTrigger as any).mockResolvedValueOnce({ status: "completed" });

    const mockSupabase = createMockSupabase(makeWebhookTrigger());
    const { POST } = await setupRoute(mockSupabase);

    await POST(
      new Request("http://localhost/api/trigger/webhook/" + TRIGGER_ID, {
        method: "POST",
        body: rawBody,
        headers: { "Content-Type": "application/json" },
      }),
      { params: { triggerId: TRIGGER_ID } },
    );

    expect(executeTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerPayload: expect.objectContaining({
          event: "payment.succeeded",
          amount: 100,
        }),
      }),
    );
  });
});
```

**Note:** The `setupRoute` helper should create a Supabase client mock and import the route handler. The exact helper depends on your Next.js route testing pattern — adapt to match existing patterns in the codebase (check `app/api/chat/route.test.ts` if it exists).

### Step 6: Implement the route handler

Create `app/api/trigger/webhook/[triggerId]/route.ts`:
1. Fetch trigger by id + `trigger_type = 'webhook'` + `enabled = true`
2. Read raw body, validate HMAC via `validateWebhookRequest`
3. Claim via `claimTriggerOnDemand` (not raw UPDATE, not scanner RPC)
4. Call `executeTrigger` inline with the claim's runId
5. Return appropriate status codes (404/401/409/200)

### Step 7: Run all tests

```bash
npx vitest run src/lib/triggers/__tests__/webhook-inbound.test.ts \
  src/lib/triggers/__tests__/webhook-claim.test.ts \
  src/lib/triggers/__tests__/webhook-route.test.ts
```

Expected: ALL PASS.

### Step 8: Commit

```bash
git add src/lib/triggers/webhook-auth.ts src/lib/triggers/webhook-claim.ts \
  src/lib/triggers/__tests__/webhook-inbound.test.ts \
  src/lib/triggers/__tests__/webhook-claim.test.ts \
  src/lib/triggers/__tests__/webhook-route.test.ts \
  app/api/trigger/webhook/\[triggerId\]/route.ts
git commit -m "feat(pr20): add webhook endpoint with HMAC + shared claim helper"
```

---

## Task 10: RSS feed fetcher + GUID dedup

**Files:**
- Create: `src/lib/triggers/rss.ts`
- Create: `src/lib/triggers/__tests__/rss.test.ts`
- Modify: `src/lib/triggers/executor.ts`
- Modify: `src/lib/triggers/__tests__/executor.test.ts`

**Install dependency:** `npm install fast-xml-parser`

### Step 1: Write failing RSS parsing tests

```typescript
import { describe, expect, test } from "vitest";

import { parseRssFeed, filterNewItems } from "../rss";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <item>
      <title>Post One</title>
      <link>https://example.com/post-1</link>
      <guid>guid-1</guid>
      <pubDate>Mon, 06 Mar 2026 09:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Post Two</title>
      <link>https://example.com/post-2</link>
      <guid>guid-2</guid>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-1"/>
    <id>atom-guid-1</id>
    <updated>2026-03-06T09:00:00Z</updated>
  </entry>
</feed>`;

describe("parseRssFeed", () => {
  test("parses RSS 2.0 feed items", () => {
    const items = parseRssFeed(SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      guid: "guid-1",
      title: "Post One",
      link: "https://example.com/post-1",
      pubDate: "Mon, 06 Mar 2026 09:00:00 GMT",
    });
  });

  test("parses Atom feed entries", () => {
    const items = parseRssFeed(SAMPLE_ATOM);
    expect(items).toHaveLength(1);
    expect(items[0].guid).toBe("atom-guid-1");
    expect(items[0].title).toBe("Atom Post");
  });

  test("returns empty array for invalid XML", () => {
    expect(parseRssFeed("not xml")).toEqual([]);
  });

  test("returns empty array for XML with no items", () => {
    expect(parseRssFeed("<rss><channel></channel></rss>")).toEqual([]);
  });
});

describe("filterNewItems", () => {
  const items = [
    { guid: "g1", title: "One", link: "https://example.com/1" },
    { guid: "g2", title: "Two", link: "https://example.com/2" },
    { guid: "g3", title: "Three", link: "https://example.com/3" },
  ];

  test("returns only unseen items", () => {
    const result = filterNewItems(items, new Set(["g1", "g2"]));
    expect(result).toHaveLength(1);
    expect(result[0].guid).toBe("g3");
  });

  test("returns all when seen set is empty", () => {
    expect(filterNewItems(items, new Set())).toHaveLength(3);
  });

  test("returns empty when all seen", () => {
    expect(filterNewItems(items, new Set(["g1", "g2", "g3"]))).toHaveLength(0);
  });
});
```

### Step 2: Run, verify fail, implement rss.ts

Uses `fast-xml-parser` XMLParser. See original tasklist Task 9 Step 3 for implementation.

### Step 3: Write failing executor tests for RSS path

Add to `src/lib/triggers/__tests__/executor.test.ts`:

```typescript
describe("RSS trigger execution", () => {
  test("fetches feed, filters new items, fires with new items as payload", async () => {
    // Setup: trigger with trigger_type='rss', payload={ feed_url: '...' }
    // Mock: storage read_file for seen.json returns { guids: ["guid-1"] }
    // Mock: global fetch returns RSS XML with guid-1 and guid-2
    // Mock: runAgent resolves completed
    // Assert: runAgent called
    // Assert: trigger event message contains guid-2 item
    // Assert: storage write_file called with ["guid-1", "guid-2"]
    const trigger = {
      id: "rss-t1", client_id: CLIENT_ID, thread_id: THREAD_ID,
      trigger_type: "rss", current_run_id: "run-1",
      payload: { feed_url: "https://example.com/feed.xml" },
      instruction_path: "subagents/triggers/blog.md",
      name: "Blog monitor",
    };

    mockSupabase.selectChain.single.mockResolvedValueOnce({
      data: trigger,
      error: null,
    });

    // Mock fetch for RSS feed
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(SAMPLE_RSS_WITH_TWO_ITEMS),
    }));

    // Mock storage for seen.json
    // ... (read returns { guids: ["guid-1"] }, write succeeds)

    mockRunAgent.mockResolvedValueOnce({ status: "streaming" });
    mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null }); // release claim

    const result = await executeTrigger({
      supabase: mockSupabase as any,
      payload: validRssPayload,
    });

    expect(result.status).toBe("completed");
    expect(mockRunAgent).toHaveBeenCalled();
    // Verify the trigger event message contains only new items
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("guid-2"),
        }),
      ]),
    );
  });

  test("skips run when no new RSS items", async () => {
    // Setup: all GUIDs already in seen.json
    // Assert: runAgent NOT called
    // Assert: claim released with "no_new_items"
    const trigger = {
      id: "rss-t1", client_id: CLIENT_ID, thread_id: THREAD_ID,
      trigger_type: "rss", current_run_id: "run-1",
      payload: { feed_url: "https://example.com/feed.xml" },
    };

    mockSupabase.selectChain.single.mockResolvedValueOnce({
      data: trigger,
      error: null,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(SAMPLE_RSS_ALL_SEEN),
    }));

    // seen.json contains all GUIDs
    // ...

    mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await executeTrigger({
      supabase: mockSupabase as any,
      payload: validRssPayload,
    });

    expect(result.status).toBe("completed");
    expect(mockRunAgent).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "release_trigger_claim",
      expect.objectContaining({ p_status: "no_new_items" }),
    );
  });

  test("handles RSS fetch failure gracefully", async () => {
    const trigger = {
      id: "rss-t1", trigger_type: "rss", current_run_id: "run-1",
      payload: { feed_url: "https://example.com/feed.xml" },
    };

    mockSupabase.selectChain.single.mockResolvedValueOnce({
      data: trigger,
      error: null,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network error")));
    mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await executeTrigger({
      supabase: mockSupabase as any,
      payload: validRssPayload,
    });

    expect(result.status).toBe("failed");
  });
});
```

### Step 4: Integrate RSS into executor

In `executeTrigger`, add an RSS branch before the generic trigger path:

1. Read `feed_url` from `trigger.payload`
2. `fetch(feedUrl)` → `parseRssFeed(text)`
3. Read seen GUIDs from Supabase Storage: `{clientId}/state/{triggerId}/seen.json`
4. `filterNewItems(items, seenGuids)`
5. If no new items → release claim with `"no_new_items"`, return `{ status: "completed" }`
6. Write updated seen GUIDs to storage
7. Include new items in trigger payload, proceed with normal execution path

**Note:** RSS seen-state goes in `state/{triggerId}/seen.json` (ephemeral — OK here because it's cache data, not workflow instructions. If lost, the worst case is re-processing some feed items once.)

### Step 5: Run all tests

```bash
npx vitest run src/lib/triggers/__tests__/
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/triggers/rss.ts src/lib/triggers/__tests__/rss.test.ts \
  src/lib/triggers/executor.ts src/lib/triggers/__tests__/executor.test.ts \
  package.json package-lock.json
git commit -m "feat(pr20): add RSS feed parsing, GUID dedup, and executor integration"
```

---

## Task 11: Automations page UI with realtime

**Files:**
- Create: `src/hooks/use-triggers.ts`
- Modify: `app/(dashboard)/automations/page.tsx`

### Step 1: Create TanStack Query hook with Supabase Realtime

Follow the pattern in `src/hooks/use-contacts.ts` for realtime invalidation.

```typescript
/**
 * TanStack Query hook for fetching active triggers with realtime updates.
 * @module hooks/use-triggers
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

export interface TriggerListItem {
  id: string;
  name: string;
  trigger_type: string;
  cron_expression: string | null;
  instruction_path: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  next_fire_at: string | null;
  last_fired_at: string | null;
  last_status: string | null;
  retry_count: number;
  invocation_message: string | null;
  thread_id: string;
  created_at: string;
}

const QUERY_KEY = ["triggers"];

export function useTriggers() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Realtime subscription — invalidate on any trigger change
  useEffect(() => {
    const channel = supabase
      .channel("triggers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_triggers" },
        () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, queryClient]);

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_triggers")
        .select("*")
        .neq("trigger_type", "pulse")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as TriggerListItem[];
    },
  });
}
```

### Step 2: Replace automations page

Replace `app/(dashboard)/automations/page.tsx`:

- Header: "Automations" + "Triggers and scheduled tasks created by your AI agent."
- Table columns: Name, Type (badge), Schedule/Config, Last Run, Next Run, Status (badge), Enabled (Switch toggle)
- Type badges: schedule=blue, webhook=purple, rss=orange
- Status badges: completed=green, failed/failed_permanent=red
- Enable/disable toggle: calls `supabase.from("agent_triggers").update({ enabled }).eq("id", id)`
- Empty state: "No automations yet. Ask your agent to set one up in chat."
- Each row's name links to the trigger's thread (`/chat?thread=${trigger.thread_id}`)

### Step 3: Verify locally

```bash
npm run dev
```

Navigate to `http://localhost:3000/automations`. Expected: page renders with empty state or table.

### Step 4: Commit

```bash
git add src/hooks/use-triggers.ts app/\(dashboard\)/automations/page.tsx
git commit -m "feat(pr20): add automations page with realtime trigger list"
```

---

## Task 12: Migration contract tests

**Files:**
- Create: `supabase/migrations/__tests__/trigger-tools.test.ts`

Follow the pattern in `supabase/migrations/__tests__/autopilot-pulse.test.ts`.

### Step 1: Write migration contract tests

```typescript
import { describe, expect, test } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";

describe("PR20 trigger migrations", () => {
  test("agent_triggers has retry_count column with default 0", async () => {
    const supabase = createAdminClient();
    // Insert a trigger and verify retry_count defaults to 0
  });

  test("agent_triggers has webhook_secret column (nullable)", async () => {
    const supabase = createAdminClient();
    // Insert a webhook trigger with secret, verify it persists
  });

  test("agent_triggers has invocation_message column with 200-char constraint", async () => {
    const supabase = createAdminClient();
    // Insert with 200-char message: succeeds
    // Insert with 201-char message: fails constraint
  });

  test("release_trigger_claim with p_advance_next_fire_at=false preserves next_fire_at", async () => {
    const supabase = createAdminClient();
    // Insert trigger with next_fire_at = T1
    // Claim it (set current_run_id)
    // Release with p_advance_next_fire_at = false, p_next_fire_at = T2
    // Verify next_fire_at is still T1 (not T2)
  });

  test("release_trigger_claim increments retry_count on failure", async () => {
    const supabase = createAdminClient();
    // Insert trigger with retry_count = 0
    // Claim, release with status='failed'
    // Verify retry_count = 1
  });

  test("release_trigger_claim resets retry_count on success", async () => {
    const supabase = createAdminClient();
    // Insert trigger with retry_count = 2
    // Claim, release with status='completed'
    // Verify retry_count = 0
  });

  test("get_system_reminder_context includes active_trigger_count", async () => {
    const supabase = createAdminClient();
    // Insert 2 enabled non-pulse triggers + 1 pulse trigger
    // Call RPC, verify active_trigger_count = 2
  });
});
```

### Step 2: Run tests

```bash
npx vitest run supabase/migrations/__tests__/trigger-tools.test.ts
```

Expected: ALL PASS.

### Step 3: Commit

```bash
git add supabase/migrations/__tests__/trigger-tools.test.ts
git commit -m "test(pr20): add migration contract tests for trigger columns and RPCs"
```

---

## Task 13: End-to-end verification

### Step 1: Run all tests

```bash
npx vitest run
```

Expected: ALL PASS.

### Step 2: Type check

```bash
npx tsc --noEmit
```

### Step 3: Lint

```bash
npm run lint
```

### Step 4: Manual E2E verification (PR testCriteria)

1. Ask agent "check PropertyGuru every morning" → agent calls search_triggers → setup_trigger → trigger visible in /automations
2. Ask agent "list my triggers" → manage_active_triggers(list). "Delete the PropertyGuru trigger" → manage_active_triggers(delete)
3. Create webhook trigger via chat. POST to returned URL → fires a run
4. Create RSS trigger with real feed. Wait for poll → fires only for new items
5. /automations page: shows triggers, status, next run. Toggle works with realtime.

### Step 5: Final commit if fixes needed

```bash
git add -A
git commit -m "fix(pr20): address e2e verification findings"
```

---

## Notes

- **Package dependency:** RSS parsing requires `fast-xml-parser`. Install with `npm install fast-xml-parser`.
- **Timezone:** Schedule triggers support IANA timezones via `cron-parser`'s `tz` option. Default: `Asia/Singapore` (our users are Singapore real estate agents).
- **RSS presets:** Polling intervals constrained to `[15, 30, 60, 360, 1440]` minutes to ensure clean cron expressions.
- **RSS seen-state** goes in `state/{triggerId}/seen.json` — this is cache/ephemeral data, not workflow instructions. Loss = one-time reprocessing.
- **Trigger instruction files** go in `subagents/triggers/<name>.md` — durable storage, aligns with Tasklet's `/agent/subagents/` convention.
- **Webhook auth:** Per-trigger `webhook_secret` for HMAC. This is a Sunder addition — Tasklet manages webhook auth at the platform level.

---

## Appendix: Tasklet Drift Analysis

### Patterns from Tasklet Reference

| Pattern | Tasklet approach | Reference file |
|---------|-----------------|----------------|
| Trigger tool contract | 3 tools: search_triggers, setup_trigger, manage_active_triggers | `v2/15,16,17-*.md` |
| Trigger instruction storage | `/agent/subagents/<name>.md` — agent discovers by browsing | `persistence-and-cron/00-source-*` |
| Trigger creation flow | Write subagent file → setup prerequisites → setup_trigger | `first-run-lifecycle/01-*` |
| Execution model | Fresh LLM invocation, no conversation history, rediscovers from artifacts | `persistence-and-cron/03-*` |
| System reminder | `Active triggers: N` count, lazy-load details via tools | `first-run-lifecycle/00-source-*` |
| Trigger safety | Cannot be used by subagents, require prerequisites before setup | System prompt `<triggers>` + `<tools-that-cannot-be-used-by-subagents>` |
| Schedule params | `{ cron, timezone }` in params | `first-run-lifecycle/00-*`, `simple-price-monitor/00-*` |
| Webhook auth | Platform-managed (Tasklet owns the URL) | `official-guide-features.md` §10 |
| invocation_message | Top-level on setup_trigger, in list response, editable/clearable | `v2/16-setup_trigger.md`, `v2/17-manage_active_triggers.md` |
| Retry policy | Not specified in Tasklet reference (platform-managed) | N/A |

### Where We Drift and Why

| # | Sunder behavior | Tasklet behavior | Reason for drift | Can we close the gap? |
|---|----------------|-----------------|-------------------|----------------------|
| 1 | **`instruction_path` column on `agent_triggers` (NOT NULL)** — explicit path injected into trigger event XML | No `instruction_path`. Agent infers which subagent to read by browsing `/agent/subagents/`. | **TRIG-04 — compaction insurance.** Sunder's thread compaction can lose the original setup conversation. Without an explicit path, the agent has to guess which file to read. Tasklet doesn't compact conversations — each trigger fire is a fresh context anyway. With instruction_path, the agent always knows exactly where its SOP lives. | **Intentional, keep.** The LLM seeing `instruction_path: subagents/triggers/propertyguru.md` in the trigger event is strictly more reliable than browsing + inferring. |
| 2 | **`name` as required top-level param on `setup_trigger`** | No `name` param. Triggers have platform-generated names/titles. | Sunder stores `name` as a DB column for the automations page UI and trigger event XML. Tasklet's trigger management is platform-side with its own naming. | **Intentional, keep.** We need user-visible names in our UI and in trigger events. Small addition. |
| 3 | **`webhook_secret` for HMAC validation** | Platform manages webhook authentication — the unique URL itself is the auth (no signature validation). | Sunder's webhook URLs are publicly routable Vercel endpoints. Without HMAC, anyone who discovers the URL can fire triggers. Tasklet's platform proxies webhook traffic and handles auth internally. | **Intentional, keep.** We don't have Tasklet's platform proxy. HMAC is the minimum viable auth for public webhook URLs. |
| 4 | **`retry_count` on `agent_triggers` + scanner re-pick** | Not specified. Tasklet manages retries at the platform level (opaque to agents). | TRIG-12 requires observable retry state. We build our own scheduler (Vercel cron), so we need our own retry logic. | **Intentional, keep.** Tasklet's retry is platform-internal. We need explicit retry because we ARE the platform. |
| 5 | **Only 3 trigger types: schedule, webhook, rss** | 7+ types: schedule, webhook, rss, gmail, calendly, text message, email replies. App-specific triggers via connections. | V1 scope cut. App-specific triggers require Composio connections (PR 25-26, Phase 3). Gmail/Calendly are connection-backed triggers that don't exist until connections exist. | **Close in Phase 3.** After PR 25-26 land connections, add app-specific trigger types to the catalog. The tool schema is already extensible (catalog is an array). |
| 6 | **Trigger tools gated by `allowMutations` (chat-only for mutations)** | "Triggers cannot be used by subagents" — only parent agent manages triggers. | Same spirit, different mechanism. Tasklet's subagents can't call trigger tools. Sunder's autopilot (analogous to subagent) gets read-only access. | **Aligned.** Both prevent background/subagent processes from mutating triggers. |
| 7 | **Trigger event format: XML `<trigger-event>` block as system message** | JSON trigger event payload as system message. Format: `{ type: "trigger_event", trigger_id, trigger_instance_id, fired_at, payload }`. | Sunder's executor already uses XML format (PR 18). Changing to JSON would require rewriting the executor and all tests. XML vs JSON is a transport detail — the LLM processes both equally well. | **Intentional, keep XML.** Already shipped in PR 18. Not worth the churn. |
| 8 | **`cron` param name in setupSchema (not `cron_expression`)** | `cron` in params, `cron_expression` is never used in Tasklet. | **Aligned in this PR.** The catalog's `setupSchema` uses `cron` (Tasklet convention). The DB column is still `cron_expression` (Sunder internal). The tool maps `params.cron` → `cron_expression` column. | **Aligned.** |
| 9 | **`timezone` param with default `Asia/Singapore`** | `timezone` in params, example: `"Asia/Singapore"`. No default mentioned. | Tasklet shows timezone as explicit. Sunder defaults to Singapore because our users are Singapore real estate agents. Stored in `payload` JSONB, used by `cron-parser` for schedule computation. | **Aligned.** Tasklet uses timezone too. Our default is a product decision. |
| 10 | **`invocation_message` on column + setup + edit** | Same — top-level on `setup_trigger`, in `list` response, editable/clearable on `manage_active_triggers(edit)`. | **Aligned in this PR.** Was previously dropped; restored after checking Tasklet v2 spec. | **Aligned.** |
| 11 | **RSS polling constrained to preset intervals (15/30/60/360/1440 min)** | RSS trigger exists but setupSchema not specified in reference. | Presets ensure clean cron expressions and prevent weird polling intervals. No Tasklet spec to deviate from. | **N/A — no spec to compare.** |
| 12 | **RSS seen-state in `state/{triggerId}/seen.json`** | No RSS dedup mechanism documented in Tasklet. | Cache data, not workflow instructions. `state/` is ephemeral — appropriate for cache. Worst case if lost: one-time reprocessing of feed items. | **N/A — no spec to compare.** |
| 13 | **`<triggers>` system prompt block — safety-focused** | Tasklet's `<triggers>` block is guidance-focused (discovery flow, prerequisites, testing). Safety is implicit in the "gather all info" instruction. | Sunder adds explicit "only create when user asks" rule. Appropriate for a product where the agent runs autonomously in the background — persistent automations should require explicit user intent. | **Intentional enhancement.** Tasklet's block is less restrictive because Tasklet agents are more supervised. Our addition is stricter because our autopilot runs unsupervised. |

### `list` response field naming (Tasklet says "names, titles, invocationMessage, and arguments")

Tasklet's `list` response description mentions "IDs, names, titles, invocationMessage, and arguments". Our response includes:
- `id` → matches "IDs"
- `name` → matches "names" (instance name from DB)
- `trigger_type` → serves same purpose as "titles" (the trigger type display name). We don't add a separate `title` field — the LLM can derive display names from `trigger_type`.
- `invocationMessage` → matches (camelCase, aligned)
- `payload` + `cron_expression` → serves same purpose as "arguments" (the trigger config). We don't rename to `arguments` — `payload` is more descriptive for our data model.

**Decision: Accept as-is.** The semantic content matches; field naming differences are cosmetic and the LLM processes either name equally well.

### Tool thickness: Aligned with Tasklet

**Decision (2026-03-07):** Tools are thin pass-throughs matching Tasklet exactly. `setup_trigger` params is `additionalProperties: {}` — tool does INSERT only, no type-specific validation. `manage_active_triggers` edit does UPDATE only. Scanner validates trigger well-formedness on first pick-up (cron parseable, feed_url present, etc.) and marks invalid triggers as `config_error`. This matches Tasklet's model where tools are dumb and the platform handles validation.

Per agent harness engineering principles: "Primitives over integrations", "fewer tools, more powerful LLMs", "if a human engineer cannot say which tool to use, neither can the model." Keeping tools thin reduces context tokens and keeps the tool interface simple for the LLM.

### Summary: 10 intentional drifts, 0 accidental drifts

| Drift | Type | Status |
|-------|------|--------|
| `instruction_path` required on `setup_trigger` | Intentional (TRIG-04 compaction insurance) | Keep |
| `name` required on `setup_trigger` | Intentional (UI + trigger events) | Keep |
| `webhook_secret` in webhook params | Intentional (no platform proxy, public Vercel URLs) | Keep |
| `retry_count` + `release_trigger_claim` retry logic | Intentional (we are the platform) | Keep |
| `success` wrapper in all tool responses | Intentional (Sunder tool response convention) | Keep |
| `name` + `description` in search_triggers catalog entries | Intentional (no platform UI, LLM needs these) | Keep |
| `list` filters out `pulse` triggers | Intentional (pulse is internal autopilot) | Keep |
| `edit` recalculates `next_fire_at` + resets `retry_count` | Intentional (we are the platform, must handle side effects) | Keep |
| `readOnly` mode on manage_active_triggers for autopilot | Intentional (same safety, more utility than removing tools entirely) | Keep |
| XML `<trigger-event>` format (vs JSON) | Already shipped in PR 18 | Keep |
| Trigger types (3 vs 7+) | Scope cut | Close in Phase 3 (connections) |
| RSS setupSchema (no Tasklet spec) | N/A — no spec to compare | Accept as-is |
| `list` response field names vs Tasklet's "titles"/"arguments" | Cosmetic | Accept as-is (see above) |
| Everything else | Aligned | — |
