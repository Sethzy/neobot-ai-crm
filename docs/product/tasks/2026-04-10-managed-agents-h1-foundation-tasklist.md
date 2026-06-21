# Managed Agents Migration — H1 Foundation (TDD Tasklist)

**PR:** H1 of 5 in the Managed Agents migration (see `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md`)
**Decisions in scope:** D1 (drop CRM setup mode), D2 (drop cross-session memory in v1), D6 (extend `approval_events` for session routing)

**Goal:** Land the purely-additive foundation — new DB columns, a data migration, agent/environment bootstrap scripts, CRM setup-mode deletion, and memory system deletion — without touching any production code path. The legacy runner still handles 100% of chat and trigger traffic after this PR lands.

**Architecture:** Three deletions (CRM setup mode, memory system) + three additions (schema columns, data migration script, Anthropic agent/environment bootstrap scripts). No adapter code, no custom tool factories, no dispatcher — those are H2/H3. Storage primitives currently living under `src/lib/memory/` are re-homed under `src/lib/storage/` before the directory is deleted so non-memory callers (skills bootstrap, sandbox preload, storage tool) keep working.

**Tech Stack:** Supabase SQL, Zod v4, `@anthropic-ai/sdk` beta managed-agents methods, Vitest, `tsx` for scripts.

**Design / review inputs:**
- `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — Phase 1 + Decision Log (D1, D2, D6, §Tactical additions)
- `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md` — origin requirements (superseded in parts by the decision log)
- `claude-api` skill — `shared/managed-agents-core.md` §Versioning (pin `agent.version`), `shared/managed-agents-client-patterns.md` §1/§5/§6/§7/§9

**Review fixes baked in (override stale handover notes where they disagree):**
1. The Supabase Storage bucket is `agent-files`, NOT `memory`. Paths are `{clientId}/SOUL.md` and `{clientId}/USER.md` inside that bucket. The handover prose says "bucket: memory" — that is wrong; use `agent-files`.
2. Storage primitives in `src/lib/memory/constants.ts` and `src/lib/memory/storage.ts` (`MEMORY_BUCKET_ID`, `MEMORY_TEXT_CONTENT_TYPE`, `isMissingStorageObjectError`, `isStorageConflictError`, `getStorageErrorMessage`, `getStoragePath`, `decodeStorageTextPayload`) are imported by **non-memory** callers (skill-bootstrap, sandbox preload, runner storage tool, discover-skills). Re-home them to `src/lib/storage/` **before** deleting `src/lib/memory/`, otherwise typecheck breaks.
3. `ensureClientBootstrap()` in `src/lib/memory/bootstrap.ts` currently calls `bootstrapMemoryFiles()` then `bootstrapSkills()`. We must keep skill bootstrap (legacy runner still needs it) but drop memory file bootstrap. Move `ensureClientBootstrap` into `src/lib/runner/skills/` (or rename in place) so deleting `src/lib/memory/` doesn't break the chat route import.
4. The memory dashboard UI (`app/(dashboard)/memory/`, `app/api/memory/*`, `src/components/memory/*`) imports from `src/lib/memory/queries` and `src/lib/memory/schemas`. These routes must also be deleted in the same PR or typecheck fails. This is within scope per D2 ("Ship without cross-session memory in v1").
5. `@anthropic-ai/sdk` is **not currently a dependency**. Task 1 installs it so the bootstrap scripts can import `Anthropic` from `@anthropic-ai/sdk`.

**Out of scope (do NOT touch — H2/H3/H4/H5):**
- Custom tool factories (`src/lib/managed-agents/tools/*`)
- Chat adapter (`src/lib/managed-agents/adapter.ts`)
- Dispatcher
- Legacy runner deletion (`src/lib/runner/run-agent.ts`, compaction, drain-and-continue, thread queue)
- Langfuse removal
- Polling cron
- Telegram approval callback rewrite

**Commit prefix:** Use `feat(h1):` for additions, `refactor(h1):` for re-homing, `chore(h1):` for deletions, `test(h1):` for test-only commits.

---

## Relevant Files

### Create
- `supabase/migrations/20260410100000_managed_agents_foundation.sql`
- `supabase/migrations/__tests__/managed-agents-foundation.test.ts`
- `scripts/managed-agents/migrate-soul-to-clients.ts`
- `scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts`
- `scripts/managed-agents/create-agent.ts`
- `scripts/managed-agents/create-environment.ts`
- `src/lib/storage/storage-errors.ts` — re-homed from `src/lib/memory/storage.ts`
- `src/lib/storage/__tests__/storage-errors.test.ts`
- `src/lib/runner/skills/ensure-client-bootstrap.ts` — re-homed from `src/lib/memory/bootstrap.ts` (skills-only)
- `src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts`

### Modify
- `package.json` (add `@anthropic-ai/sdk`)
- `src/lib/env.ts` (add 3 optional env vars)
- `src/lib/__tests__/env.test.ts`
- `src/lib/storage/agent-files.ts` (add `AGENT_FILES_TEXT_CONTENT_TYPE`)
- `src/lib/ai/system-prompt.ts` (delete `CRM_SETUP_SYSTEM_PROMPT` + `SETUP_SYSTEM_PROMPT` exports)
- `src/lib/runner/schemas.ts` (remove `crmMode` field)
- `app/api/chat/schema.ts` (remove `crmMode` field)
- `src/lib/runner/context.ts` (drop `loadMemoryContext`, `MemoryContext`, `formatMemoryMessage`, `crmMode` branch, memory injection)
- `src/lib/runner/context-types.ts` — if present (none — all types in `context.ts`)
- `src/lib/runner/tools/crm/index.ts` (delete `mode === "setup"` branch)
- `src/lib/runner/tool-registry.ts` (delete `crmMode` option)
- `src/lib/runner/run-agent.ts` (delete `crmMode` propagation)
- `src/lib/runner/tools/subagents/run-subagent.ts` (delete `crmMode` propagation)
- `app/api/chat/route.ts` (import `ensureClientBootstrap` from the new skills location; delete `body.crmMode`)
- `src/lib/runner/skills/skill-bootstrap.ts` (switch imports to `src/lib/storage/*`)
- `src/lib/runner/skills/discover-skills.ts` (switch imports to `src/lib/storage/*`)
- `src/lib/runner/tools/sandbox/build-preload-files.ts` (switch imports to `src/lib/storage/*`)
- `src/lib/runner/tools/storage/index.ts` (switch imports to `src/lib/storage/*`)
- `src/lib/runner/__tests__/context.test.ts` (drop memory mock, drop `crmMode`)
- `src/lib/runner/__tests__/context-crm-config.test.ts` (drop `crmMode: "setup"` assertions) — OR delete entirely if only setup mode is tested
- `src/lib/runner/__tests__/run-agent.test.ts` (drop memory mock, drop `crmMode` assertions)
- `src/lib/runner/__tests__/run-agent-crm-config.test.ts` (drop `crmMode: "setup"` assertions)
- `src/lib/runner/__tests__/schemas.test.ts` (drop `crmMode` assertions)
- `src/lib/runner/__tests__/serialization.test.ts` (drop `memoryContext: undefined`)
- `src/lib/ai/__tests__/chat-route.test.ts` (drop `crmMode` lines; keep `ensureClientBootstrap` mock — points at new path)
- `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` (drop `crmMode` fields)

### Delete
- `src/lib/memory/` entire directory (after Task 11 re-homes primitives)
  - `bootstrap.ts`, `loader.ts`, `constants.ts`, `storage.ts`, `queries.ts`, `schemas.ts`, `templates.ts`
  - `__tests__/` subfolder
- `src/lib/ai/__tests__/chat-route-crm-mode.test.ts`
- `src/lib/ai/__tests__/system-prompt-setup.test.ts`
- `src/lib/runner/__tests__/context-crm-config.test.ts` (if every test targets `crmMode: "setup"` — confirm during Task 6)
- `app/api/memory/file/route.ts`
- `app/api/memory/files/route.ts`
- `app/(dashboard)/memory/page.tsx`
- `src/components/memory/memory-file-list.tsx`
- `src/components/memory/memory-file-viewer.test.tsx`
- `src/components/memory/` directory if empty after the two files above are removed

---

## Task 1: Add `@anthropic-ai/sdk` dependency and three optional env vars

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/__tests__/env.test.ts`

### Step 1: Write the failing env tests

Append to `src/lib/__tests__/env.test.ts` inside the existing `describe("getServerEnv")` block:

```typescript
  describe("managed agents env vars", () => {
    it("exposes optional ANTHROPIC_AGENT_ID", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_ID", "agent_abc123");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBe("agent_abc123");
    });

    it("ANTHROPIC_AGENT_ID defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBeUndefined();
    });

    it("exposes optional ANTHROPIC_AGENT_VERSION", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_VERSION", "3");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_VERSION).toBe("3");
    });

    it("ANTHROPIC_AGENT_VERSION defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_VERSION).toBeUndefined();
    });

    it("exposes optional ANTHROPIC_ENVIRONMENT_ID", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_ENVIRONMENT_ID", "env_xyz");
      const env = getServerEnv();
      expect(env.ANTHROPIC_ENVIRONMENT_ID).toBe("env_xyz");
    });

    it("ANTHROPIC_ENVIRONMENT_ID defaults to undefined", () => {
      stubAllRequired();
      const env = getServerEnv();
      expect(env.ANTHROPIC_ENVIRONMENT_ID).toBeUndefined();
    });

    it("trims whitespace from managed agents env vars", () => {
      stubAllRequired();
      vi.stubEnv("ANTHROPIC_AGENT_ID", "  agent_abc123  ");
      const env = getServerEnv();
      expect(env.ANTHROPIC_AGENT_ID).toBe("agent_abc123");
    });
  });
```

### Step 2: Run tests to verify they fail

```bash
pnpm vitest run src/lib/__tests__/env.test.ts -t "managed agents env vars"
```

Expected: FAIL — `ANTHROPIC_AGENT_ID` missing from schema.

### Step 3: Add env vars to `src/lib/env.ts`

Inside `serverEnvSchema`, after the Vercel Sandbox block:

```typescript
  // Anthropic Managed Agents (H1 bootstrap — legacy runner does not read these)
  ANTHROPIC_AGENT_ID: z.string().trim().optional(),
  ANTHROPIC_AGENT_VERSION: z.string().trim().optional(),
  ANTHROPIC_ENVIRONMENT_ID: z.string().trim().optional(),
```

Inside the `raw` object in `getServerEnv()`:

```typescript
    ANTHROPIC_AGENT_ID: process.env.ANTHROPIC_AGENT_ID?.trim() || undefined,
    ANTHROPIC_AGENT_VERSION:
      process.env.ANTHROPIC_AGENT_VERSION?.trim() || undefined,
    ANTHROPIC_ENVIRONMENT_ID:
      process.env.ANTHROPIC_ENVIRONMENT_ID?.trim() || undefined,
```

### Step 4: Run tests to verify they pass

```bash
pnpm vitest run src/lib/__tests__/env.test.ts -t "managed agents env vars"
```

Expected: ALL PASS.

### Step 5: Install the Anthropic SDK

```bash
pnpm add @anthropic-ai/sdk
```

Then verify no existing code imports `@anthropic-ai/sdk` that could break (should be zero hits):

```bash
pnpm grep -l "@anthropic-ai/sdk" src/ app/ 2>/dev/null || true
```

### Step 6: Commit

```bash
git add package.json pnpm-lock.yaml src/lib/env.ts src/lib/__tests__/env.test.ts
git commit -m "$(cat <<'EOF'
feat(h1): add anthropic SDK and three optional managed agents env vars

ANTHROPIC_AGENT_ID, ANTHROPIC_AGENT_VERSION, and ANTHROPIC_ENVIRONMENT_ID
are all optional so the legacy runner keeps booting without them. They
are populated after running create-agent.ts and create-environment.ts in
Task 13 and 14.
EOF
)"
```

---

## Task 2: Schema migration SQL — all 6 additive changes in one file

**Files:**
- Create: `supabase/migrations/20260410100000_managed_agents_foundation.sql`
- Create: `supabase/migrations/__tests__/managed-agents-foundation.test.ts`

### Step 1: Write the failing migration test

Create `supabase/migrations/__tests__/managed-agents-foundation.test.ts`:

```typescript
/**
 * Contract tests for the H1 managed agents foundation migration.
 *
 * Verifies the additive-only schema changes land verbatim:
 * - runs.session_id + runs.events_cursor
 * - clients.client_profile + clients.user_preferences
 * - conversation_threads.session_id
 * - conversation_messages.source_event_id + unique index
 * - approval_events.session_id + approval_events.tool_use_id
 * - run_scores table + RLS + run_id index
 *
 * @module supabase/migrations/__tests__/managed-agents-foundation
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260410100000_managed_agents_foundation.sql",
);

function readMigrationSql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("H1 managed agents foundation migration", () => {
  it("is additive only — no DROP, no ALTER ... NOT NULL on existing columns", () => {
    const sql = readMigrationSql();
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ALTER COLUMN\s+\w+\s+SET NOT NULL/i);
  });

  it("adds session_id and events_cursor to runs", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.runs\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.runs\s+ADD COLUMN IF NOT EXISTS events_cursor text/i,
    );
  });

  it("adds client_profile and user_preferences to clients", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.clients\s+ADD COLUMN IF NOT EXISTS client_profile text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.clients\s+ADD COLUMN IF NOT EXISTS user_preferences text/i,
    );
  });

  it("adds session_id to conversation_threads", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_threads\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
  });

  it("adds source_event_id + partial unique index to conversation_messages", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.conversation_messages\s+ADD COLUMN IF NOT EXISTS source_event_id text/i,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event\s+ON public\.conversation_messages\s*\(thread_id, source_event_id\)\s+WHERE source_event_id IS NOT NULL/i,
    );
  });

  it("adds session_id and tool_use_id to approval_events", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(
      /ALTER TABLE public\.approval_events\s+ADD COLUMN IF NOT EXISTS session_id text/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.approval_events\s+ADD COLUMN IF NOT EXISTS tool_use_id text/i,
    );
  });

  it("creates run_scores table with the expected columns and run_id index", () => {
    const sql = readMigrationSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.run_scores");
    expect(sql).toMatch(/run_id\s+uuid\s+NOT NULL\s+REFERENCES public\.runs\(run_id\)/i);
    expect(sql).toMatch(/evaluator_name\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/score_type\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/score_value\s+numeric/i);
    expect(sql).toMatch(/comment\s+text/i);
    expect(sql).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/i);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_run_scores_run_id\s+ON public\.run_scores\s*\(run_id\)/i,
    );
  });

  it("enables RLS on run_scores and grants SELECT to the owning client", () => {
    const sql = readMigrationSql();
    expect(sql).toContain(
      "ALTER TABLE public.run_scores ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain('CREATE POLICY "run_scores_select"');
    // Scores inherit their tenant via the runs row they point at.
    expect(sql).toMatch(
      /USING\s*\(\s*EXISTS\s*\(\s*SELECT 1\s+FROM public\.runs\s+WHERE runs\.run_id\s*=\s*run_scores\.run_id\s+AND runs\.client_id\s*=\s*public\.get_my_client_id\(\)\s*\)\s*\)/i,
    );
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run supabase/migrations/__tests__/managed-agents-foundation.test.ts
```

Expected: FAIL — `existsSync(migrationPath)` returns false.

### Step 3: Write the migration SQL

Create `supabase/migrations/20260410100000_managed_agents_foundation.sql`:

```sql
-- H1: Managed Agents migration foundation.
-- Additive only. No destructive changes. The legacy runner does not read or
-- write any of these columns until H2/H3 wires in the chat adapter.
--
-- Changes:
--   1. runs                 — session_id, events_cursor (Anthropic session pointer + cursor for trigger polling)
--   2. clients              — client_profile, user_preferences (SOUL.md/USER.md replacement for agent kickoff content)
--   3. conversation_threads — session_id (thread ↔ Anthropic session binding for chat)
--   4. conversation_messages — source_event_id (idempotent upsert key for polling-cron persistence)
--   5. approval_events      — session_id, tool_use_id (Telegram approval routing back to Anthropic)
--   6. run_scores           — new table for in-process evaluator output (replaces Langfuse scores)

-- 1. runs ---------------------------------------------------------------
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS events_cursor text;

COMMENT ON COLUMN public.runs.session_id IS
  'Anthropic Managed Agents session id. Null for legacy runner rows.';
COMMENT ON COLUMN public.runs.events_cursor IS
  'Cursor passed to sessions.events.list({after}) by the polling cron.';

-- 2. clients ------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_profile text,
  ADD COLUMN IF NOT EXISTS user_preferences text;

COMMENT ON COLUMN public.clients.client_profile IS
  'Per-client system prompt injection (replaces SOUL.md). Migrated from Storage in H1.';
COMMENT ON COLUMN public.clients.user_preferences IS
  'Per-client user profile injection (replaces USER.md). Migrated from Storage in H1.';

-- 3. conversation_threads ----------------------------------------------
ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS session_id text;

COMMENT ON COLUMN public.conversation_threads.session_id IS
  'Anthropic Managed Agents session id for this chat thread. Overwritten when the session is recreated after termination.';

-- 4. conversation_messages ---------------------------------------------
ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS source_event_id text;

COMMENT ON COLUMN public.conversation_messages.source_event_id IS
  'Anthropic event id this message was derived from. Used for idempotent upserts from the trigger polling cron.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_messages_thread_source_event
  ON public.conversation_messages (thread_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

-- 5. approval_events ---------------------------------------------------
ALTER TABLE public.approval_events
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS tool_use_id text;

COMMENT ON COLUMN public.approval_events.session_id IS
  'Anthropic session id the approval is scoped to. Used by Telegram callback handler (H4) to route user.tool_confirmation back.';
COMMENT ON COLUMN public.approval_events.tool_use_id IS
  'Anthropic custom_tool_use event id. Required when sending user.tool_confirmation.';

-- 6. run_scores --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.run_scores (
  score_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL REFERENCES public.runs(run_id) ON DELETE CASCADE,
  evaluator_name text NOT NULL,
  score_type     text NOT NULL,
  score_value    numeric,
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_scores_run_id
  ON public.run_scores (run_id);

ALTER TABLE public.run_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_scores_select"
  ON public.run_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.runs
      WHERE runs.run_id = run_scores.run_id
        AND runs.client_id = public.get_my_client_id()
    )
  );

CREATE POLICY "run_scores_insert"
  ON public.run_scores FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.runs
      WHERE runs.run_id = run_scores.run_id
        AND runs.client_id = public.get_my_client_id()
    )
  );

COMMENT ON TABLE public.run_scores IS
  'In-process evaluator output per run. Replaces Langfuse scores (D4).';
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run supabase/migrations/__tests__/managed-agents-foundation.test.ts
```

Expected: ALL PASS.

### Step 5: Apply the migration locally against the dev Supabase project

> **Operator action required** — run the migration against the project's dev branch. This cannot be automated from the tasklist. From the repo root:
>
> ```bash
> pnpm supabase db push
> ```
>
> OR, if the project uses `mcp__supabase__apply_migration`, apply the file contents via the Supabase MCP tool. Verify with:
>
> ```bash
> pnpm supabase db diff
> ```
>
> Expected: no drift. Do NOT proceed past this step until the migration applies cleanly against dev.

### Step 6: Regenerate the database types

```bash
pnpm supabase gen types typescript --local > src/types/database.ts
```

(If the project uses `mcp__supabase__generate_typescript_types`, invoke it and overwrite `src/types/database.ts`.)

Then run typecheck to confirm no code regressed:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

### Step 7: Commit

```bash
git add supabase/migrations/20260410100000_managed_agents_foundation.sql \
        supabase/migrations/__tests__/managed-agents-foundation.test.ts \
        src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(h1): additive schema for managed agents foundation

Adds session_id/events_cursor to runs, client_profile/user_preferences
to clients, session_id to conversation_threads, source_event_id (+ unique
partial index) to conversation_messages, session_id/tool_use_id to
approval_events, and a new run_scores table with RLS. All columns are
nullable so the legacy runner keeps functioning unchanged.
EOF
)"
```

---

## Task 3: Delete CRM setup mode — exports from `system-prompt.ts`

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Delete: `src/lib/ai/__tests__/system-prompt-setup.test.ts`

### Step 1: Delete the setup-mode test file first (so the next step's run is a pure green-to-green)

```bash
rm src/lib/ai/__tests__/system-prompt-setup.test.ts
```

### Step 2: Delete the setup-mode exports from `src/lib/ai/system-prompt.ts`

Delete lines 473-487 verbatim:

```typescript
export const CRM_SETUP_SYSTEM_PROMPT = `You are NeoBot in CRM setup mode.

Your job in this mode is to configure the CRM or reconfigure the user's existing CRM vocabulary and custom fields.

<setup-mode>
- Focus only on CRM configuration work.
- Ask concise follow-up questions about the user's business when the vocabulary is still unclear.
- Use configure_crm to apply approved changes.
- Show the user the before/after changes before writing anything.
- If a removal is blocked because records still use that value, explain the impact and ask whether to proceed.
- Tell the user that configuration changes take effect on the next message after saving.
- Do not create or update CRM records in setup mode.
</setup-mode>`;

export const SETUP_SYSTEM_PROMPT = CRM_SETUP_SYSTEM_PROMPT;
```

Use `Edit` with `old_string` containing both exports (everything after line 472's backtick). The file should end with `</memory-system>\`;` after this edit.

### Step 3: Verify both exports are gone

```bash
pnpm grep "CRM_SETUP_SYSTEM_PROMPT\|SETUP_SYSTEM_PROMPT" src/ app/ 2>/dev/null
```

Expected: this tasklist is the only hit (inside `docs/product/tasks/` is fine).

### Step 4: Commit

```bash
git add src/lib/ai/system-prompt.ts
git rm src/lib/ai/__tests__/system-prompt-setup.test.ts
git commit -m "chore(h1): drop CRM_SETUP_SYSTEM_PROMPT exports (D1)"
```

---

## Task 4: Delete `crmMode` from schemas and chat payload

**Files:**
- Modify: `src/lib/runner/schemas.ts`
- Modify: `app/api/chat/schema.ts`
- Modify: `src/lib/runner/__tests__/schemas.test.ts`

### Step 1: Remove the failing-test assertion first

In `src/lib/runner/__tests__/schemas.test.ts`, delete the lines that assert `crmMode: "setup"` parses and `crmMode: "reconfigure"` rejects. Search for `crmMode` in that file and delete the two related blocks identified at `schemas.test.ts:27` and `schemas.test.ts:62`.

### Step 2: Remove `crmMode` from `src/lib/runner/schemas.ts`

Delete line 29:

```typescript
  crmMode: z.enum(["normal", "setup"]).optional(),
```

### Step 3: Remove `crmMode` from `app/api/chat/schema.ts`

Delete line 37:

```typescript
  crmMode: z.enum(["normal", "setup"]).optional(),
```

### Step 4: Run schema tests

```bash
pnpm vitest run src/lib/runner/__tests__/schemas.test.ts
```

Expected: PASS (the two `crmMode` assertions are gone).

### Step 5: Commit

```bash
git add src/lib/runner/schemas.ts app/api/chat/schema.ts src/lib/runner/__tests__/schemas.test.ts
git commit -m "chore(h1): drop crmMode field from runner and chat schemas (D1)"
```

---

## Task 5: Delete `mode === "setup"` branch from CRM tool factory and `crmMode` from tool registry

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tool-registry.ts`

### Step 1: Remove the setup branch from `src/lib/runner/tools/crm/index.ts`

Replace the factory (lines 37-88) by removing the `mode` parameter and the `setup` branch. The new body:

```typescript
export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  options?: CreateCrmToolsOptions,
) {
  const {
    allowWriteTools = true,
    allowDeleteTools = true,
    config = CRM_DEFAULTS,
  } = options ?? {};

  const searchTools = createSearchCrmTool(supabase, clientId);

  const readTools = {
    search_crm: searchTools.search_crm,
  };

  if (!allowWriteTools) {
    return readTools;
  }

  const createRecordTools = createCreateRecordTool(supabase, clientId, config);
  const updateRecordTools = createUpdateRecordTool(supabase, clientId, config);
  const linkRecordTools = createLinkRecordsTool(supabase, clientId, config);
  const interactionTools = createInteractionTools(supabase, clientId, config);
  const taskTools = createTaskTools(supabase, clientId, config);
  const attachmentTools = createAttachmentTools(supabase, clientId);
  const viewTools = createViewTools(supabase, clientId);

  return {
    ...readTools,
    create_record: createRecordTools.create_record,
    update_record: updateRecordTools.update_record,
    link_records: linkRecordTools.link_records,
    create_interaction: interactionTools.create_interaction,
    create_task: taskTools.create_task,
    update_task: taskTools.update_task,
    attach_file_to_record: attachmentTools.attach_file_to_record,
    list_record_attachments: attachmentTools.list_record_attachments,
    manage_views: viewTools.manage_views,
    ...(allowDeleteTools ? {
      delete_record_attachment: attachmentTools.delete_record_attachment,
      delete_records: createDeleteRecordsTool(supabase, clientId).delete_records,
      ...createConfigureCrmTool(supabase, clientId),
    } : {}),
  };
}
```

Also delete the `mode?: "normal" | "setup";` line from the `CreateCrmToolsOptions` interface at the top of the file.

### Step 2: Remove `crmMode` from `src/lib/runner/tool-registry.ts`

Delete `crmMode?: "normal" | "setup";` from `CreateRunnerToolsOptions` (line 29) and the `mode: options?.crmMode ?? "normal",` line inside the `createCrmTools` call (line 48).

The new `createCrmTools` call becomes:

```typescript
  const crmTools = createCrmTools(supabase, clientId, {
    allowWriteTools: true,
    allowDeleteTools: !isSubagent,
    config: options?.crmConfig,
  });
```

### Step 3: Typecheck

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. Callers of `createRunnerTools` may still pass `crmMode` — Task 6 removes those.

### Step 4: Commit

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tool-registry.ts
git commit -m "chore(h1): drop setup-mode branch from CRM tool factory and registry (D1)"
```

---

## Task 6: Delete `crmMode` callers in runner and subagents + remaining CRM-mode tests

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/tools/subagents/run-subagent.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent-crm-config.test.ts`
- Modify: `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`
- Delete: `src/lib/ai/__tests__/chat-route-crm-mode.test.ts`
- Delete: `src/lib/runner/__tests__/context-crm-config.test.ts`

### Step 1: Delete the two setup-mode test files

```bash
rm src/lib/ai/__tests__/chat-route-crm-mode.test.ts
rm src/lib/runner/__tests__/context-crm-config.test.ts
```

> Context: `context-crm-config.test.ts` only asserts setup-mode behavior — verified by reading lines 69 and 115 which both carry `crmMode: "setup"`. The file is wholly dedicated to the setup-mode swap, so delete it entirely.

### Step 2: Remove `crmMode` from `src/lib/runner/context.ts`

Three edit sites:

- Line 53 (`AssembleContextParams.crmMode`) — delete the line.
- Line 74 (`AssembleSystemOnlyParams.crmMode`) — delete the line.
- `resolvePromptOverrides`: simplify to always use `SYSTEM_PROMPT`. Replace the function body (currently at lines 184-199) with:

```typescript
function resolvePromptOverrides(params: {
  crmConfig?: CrmVocabConfig;
  platformInstructions?: string;
  systemPrompt?: string;
}): Pick<BuildSystemPromptOptions, "platformInstructions" | "systemPrompt"> {
  return {
    platformInstructions: params.platformInstructions ?? (params.crmConfig
      ? buildPlatformInstructions(params.crmConfig)
      : PLATFORM_INSTRUCTIONS),
    systemPrompt: params.systemPrompt ?? SYSTEM_PROMPT,
  };
}
```

- Remove the `CRM_SETUP_SYSTEM_PROMPT` import at the top of the file (it is already gone from `system-prompt.ts` after Task 3 — this just cleans up the stale reference).
- In `assembleSystemOnly` (line ~335) and `assembleContext` (line ~382), delete the `crmMode = "normal"` default and drop `crmMode` from the `resolvePromptOverrides({ ... })` argument — three call sites total.

### Step 3: Remove `crmMode` from `src/lib/runner/run-agent.ts`

Search for `crmMode` in that file (hits at lines 149, 306, 333, 339) and delete every reference. The payload no longer carries the field — propagate `undefined` behavior by simply not passing it.

### Step 4: Remove `crmMode` from `src/lib/runner/tools/subagents/run-subagent.ts`

Delete line 35 (`crmMode?: "normal" | "setup";` in `RunSubagentOptions`) and lines 72, 87 where `crmMode: options.crmMode ?? "normal"` is passed into sub-factories.

### Step 5: Remove `crmMode` from `app/api/chat/route.ts`

Delete line 340:

```typescript
        crmMode: body.crmMode,
```

### Step 6: Scrub remaining test files

In each of the following, remove every line that mentions `crmMode` (including object-literal entries, assertions, and comments):

- `src/lib/runner/__tests__/run-agent.test.ts` — lines 580, 595, 609, 1066, 1181
- `src/lib/runner/__tests__/run-agent-crm-config.test.ts` — lines 195, 232, 238 (the `"setup"` test block can be deleted entirely if it is the only content of its `it(...)`)
- `src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts` — lines 146, 160
- `src/lib/ai/__tests__/chat-route.test.ts` — lines 231, 302, 324, 342, 353, 359, 377, 388, 518, 732 (delete whole `it("passes the explicit crmMode flag…")` + `it("passes crmMode through to runAgent when explicitly requested")` blocks)

### Step 7: Verify zero `crmMode` references remain

```bash
pnpm grep -rn "crmMode" src/ app/ 2>/dev/null
```

Expected: zero hits. If this command prints anything other than the tasklist itself, fix the remaining spots before committing.

### Step 8: Run the affected test suites

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts \
               src/lib/runner/__tests__/run-agent-crm-config.test.ts \
               src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts \
               src/lib/ai/__tests__/chat-route.test.ts \
               src/lib/runner/__tests__/context.test.ts
```

Expected: ALL PASS.

### Step 9: Commit

```bash
git add src/lib/runner/context.ts src/lib/runner/run-agent.ts \
        src/lib/runner/tools/subagents/run-subagent.ts \
        app/api/chat/route.ts \
        src/lib/runner/__tests__/run-agent.test.ts \
        src/lib/runner/__tests__/run-agent-crm-config.test.ts \
        src/lib/runner/tools/subagents/__tests__/run-subagent.test.ts \
        src/lib/ai/__tests__/chat-route.test.ts
git rm src/lib/ai/__tests__/chat-route-crm-mode.test.ts \
       src/lib/runner/__tests__/context-crm-config.test.ts
git commit -m "chore(h1): remove crmMode from runner, chat route, subagents, and tests (D1)"
```

---

## Task 7: Re-home storage primitives — `src/lib/storage/storage-errors.ts`

> **Context (read before starting):** `src/lib/memory/storage.ts` exports storage-error helpers (`isMissingStorageObjectError`, `isStorageConflictError`, `getStorageErrorMessage`, `decodeStorageTextPayload`, `getStoragePath`, `downloadMemoryFile`, `readMemoryRootFile`) and `src/lib/memory/constants.ts` exports `MEMORY_BUCKET_ID` + `MEMORY_TEXT_CONTENT_TYPE`. None of the non-memory callers need the `downloadMemoryFile`/`readMemoryRootFile` helpers — they only pull in the error parsers and the bucket constants. Move exactly those primitives into `src/lib/storage/` so Task 11 can delete `src/lib/memory/` without breaking sandbox, skills, or runner storage tool imports.

**Files:**
- Modify: `src/lib/storage/agent-files.ts` (add `AGENT_FILES_TEXT_CONTENT_TYPE` export)
- Create: `src/lib/storage/storage-errors.ts`
- Create: `src/lib/storage/__tests__/storage-errors.test.ts`

### Step 1: Write the failing storage-errors tests

Create `src/lib/storage/__tests__/storage-errors.test.ts`:

```typescript
/**
 * Tests for Supabase Storage error helpers.
 * @module lib/storage/__tests__/storage-errors
 */
import { describe, expect, it } from "vitest";

import {
  getStorageErrorMessage,
  isMissingStorageObjectError,
  isStorageConflictError,
} from "../storage-errors";

describe("isMissingStorageObjectError", () => {
  it("matches 404 status", () => {
    expect(isMissingStorageObjectError({ status: 404 })).toBe(true);
  });

  it("matches NoSuchKey status codes case-insensitively", () => {
    expect(isMissingStorageObjectError({ statusCode: "NoSuchKey" })).toBe(true);
    expect(isMissingStorageObjectError({ statusCode: "NOTFOUND" })).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isMissingStorageObjectError({ status: 500 })).toBe(false);
    expect(isMissingStorageObjectError(null)).toBe(false);
  });
});

describe("isStorageConflictError", () => {
  it("matches 409 status", () => {
    expect(isStorageConflictError({ status: 409 })).toBe(true);
  });

  it("matches 'already exists' message", () => {
    expect(isStorageConflictError({ message: "Object already exists" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isStorageConflictError({ status: 500, message: "boom" })).toBe(false);
  });
});

describe("getStorageErrorMessage", () => {
  it("unwraps Error instances", () => {
    expect(getStorageErrorMessage(new Error("kaboom"))).toBe("kaboom");
  });

  it("extracts .message from plain objects", () => {
    expect(getStorageErrorMessage({ message: "nope" })).toBe("nope");
  });

  it("falls back to String() for unknown shapes", () => {
    expect(getStorageErrorMessage(123)).toBe("123");
  });
});
```

### Step 2: Run tests to verify they fail

```bash
pnpm vitest run src/lib/storage/__tests__/storage-errors.test.ts
```

Expected: FAIL — module does not exist.

### Step 3: Create `src/lib/storage/storage-errors.ts`

Create the file with the content below. It is a verbatim copy of the non-memory-specific helpers from `src/lib/memory/storage.ts`:

```typescript
/**
 * Supabase Storage error helpers shared across agent-file callers.
 *
 * These are deliberately framework-agnostic — no dependency on any specific
 * bucket or entity. The `src/lib/memory` module previously owned them; they
 * were re-homed here in H1 so that deleting the memory system (D2) does not
 * break sandbox, skill, or runner storage callers.
 *
 * @module lib/storage/storage-errors
 */

/** Supabase storage error status codes that indicate a missing object. */
const MISSING_STATUS_CODES = new Set(["nosuchkey", "objectnotfound", "notfound"]);

/** Supabase storage error status codes that indicate a conflict (already exists). */
const CONFLICT_STATUS_CODES = new Set(["resourcealreadyexists", "alreadyexists"]);

interface ParsedStorageError {
  status: number | undefined;
  statusCode: string | undefined;
  message: string | undefined;
}

/** Extracts numeric status, lowercase statusCode, and message from an unknown storage error. */
function parseStorageError(error: unknown): ParsedStorageError {
  if (typeof error !== "object" || error === null) {
    return { status: undefined, statusCode: undefined, message: undefined };
  }

  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };

  let status: number | undefined;
  if (typeof e.status === "number") {
    status = e.status;
  } else if (typeof e.statusCode === "string") {
    const parsed = Number.parseInt(e.statusCode, 10);
    if (!Number.isNaN(parsed)) status = parsed;
  }

  const statusCode = typeof e.statusCode === "string" ? e.statusCode.toLowerCase() : undefined;
  const message = typeof e.message === "string" ? e.message : undefined;

  return { status, statusCode, message };
}

export function isMissingStorageObjectError(error: unknown): boolean {
  const { status, statusCode } = parseStorageError(error);
  return status === 404 || MISSING_STATUS_CODES.has(statusCode ?? "");
}

export function isStorageConflictError(error: unknown): boolean {
  const { status, statusCode, message } = parseStorageError(error);
  if (status === 409 || CONFLICT_STATUS_CODES.has(statusCode ?? "")) return true;
  return message?.toLowerCase().includes("already exists") ?? false;
}

export function getStorageErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const { message } = parseStorageError(error);
  return message ?? String(error);
}
```

### Step 4: Add the text content type constant to `src/lib/storage/agent-files.ts`

Append (near the existing `AGENT_FILES_BUCKET` constant):

```typescript
/** Plain-text content type used for markdown agent files. */
export const AGENT_FILES_TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
```

### Step 5: Run tests to verify they pass

```bash
pnpm vitest run src/lib/storage/__tests__/storage-errors.test.ts
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/storage/storage-errors.ts \
        src/lib/storage/__tests__/storage-errors.test.ts \
        src/lib/storage/agent-files.ts
git commit -m "refactor(h1): re-home Supabase Storage error helpers to src/lib/storage"
```

---

## Task 8: Switch non-memory callers to the new storage primitives

**Files:**
- Modify: `src/lib/runner/skills/skill-bootstrap.ts`
- Modify: `src/lib/runner/skills/discover-skills.ts`
- Modify: `src/lib/runner/tools/sandbox/build-preload-files.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

### Step 1: Update `src/lib/runner/skills/skill-bootstrap.ts`

Replace the imports at the top:

```typescript
import {
  AGENT_FILES_BUCKET,
  AGENT_FILES_TEXT_CONTENT_TYPE,
} from "@/lib/storage/agent-files";
import {
  getStorageErrorMessage,
  isStorageConflictError,
} from "@/lib/storage/storage-errors";
```

Then replace `MEMORY_BUCKET_ID` → `AGENT_FILES_BUCKET` and `MEMORY_TEXT_CONTENT_TYPE` → `AGENT_FILES_TEXT_CONTENT_TYPE` across the rest of the file (use Edit with `replace_all: true`).

### Step 2: Update `src/lib/runner/skills/discover-skills.ts`

Replace:

```typescript
import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
```

with:

```typescript
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
```

Then replace `MEMORY_BUCKET_ID` → `AGENT_FILES_BUCKET` across the file (`replace_all: true`).

### Step 3: Update `src/lib/runner/tools/sandbox/build-preload-files.ts`

Replace:

```typescript
import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
```

with:

```typescript
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
```

Then replace `MEMORY_BUCKET_ID` → `AGENT_FILES_BUCKET` across the file.

### Step 4: Update `src/lib/runner/tools/storage/index.ts`

Open the file, find the `from "@/lib/memory/constants"` import block (around line 15), and replace it with the equivalent imports from `@/lib/storage/agent-files`. If the file imports any of `ROOT_MEMORY_FILE_PATHS`, `MEMORY_TOPIC_DIRECTORY`, `MEMORY_TOPIC_PREFIX`, leave a note below and stop — those constants are storage-tool-specific and must be re-homed too (inline them at the top of `src/lib/runner/tools/storage/index.ts`, they are small). For just `MEMORY_BUCKET_ID` / `MEMORY_TEXT_CONTENT_TYPE`, swap to `AGENT_FILES_BUCKET` / `AGENT_FILES_TEXT_CONTENT_TYPE` like the other files.

> **If `ROOT_MEMORY_FILE_PATHS` etc. are imported here:** inline them at the top of the file as module constants (they are short arrays — see `src/lib/memory/constants.ts`), then delete the memory imports. Do NOT re-home them to `src/lib/storage/` — they are runner-tool-specific.

### Step 5: Typecheck + test

```bash
pnpm exec tsc --noEmit
pnpm vitest run src/lib/runner/skills/ src/lib/runner/tools/sandbox/ src/lib/runner/tools/storage/
```

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/lib/runner/skills/skill-bootstrap.ts \
        src/lib/runner/skills/discover-skills.ts \
        src/lib/runner/tools/sandbox/build-preload-files.ts \
        src/lib/runner/tools/storage/index.ts
git commit -m "refactor(h1): switch non-memory callers to src/lib/storage primitives"
```

---

## Task 9: Move `ensureClientBootstrap` into `src/lib/runner/skills/` (skill-only)

> **Context:** `ensureClientBootstrap` in `src/lib/memory/bootstrap.ts` currently calls `bootstrapMemoryFiles()` and then `bootstrapSkills()`. Per D2, we drop memory seeding entirely. The chat route still needs something that runs skill bootstrap once per client. Move the durable `is_bootstrapped` check into a new file under `src/lib/runner/skills/` that wraps `bootstrapSkills()` only.

**Files:**
- Create: `src/lib/runner/skills/ensure-client-bootstrap.ts`
- Create: `src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

### Step 1: Write the failing test

Create `src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts`:

```typescript
/**
 * Tests for ensureClientBootstrap (skills-only, post-D2).
 * @module lib/runner/skills/__tests__/ensure-client-bootstrap
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBootstrapSkills = vi.fn();

vi.mock("../skill-bootstrap", () => ({
  bootstrapSkills: mockBootstrapSkills,
}));

import { ensureClientBootstrap } from "../ensure-client-bootstrap";

function createMockSupabase(
  initialFlag: boolean,
  opts?: { selectError?: { message: string }; updateError?: { message: string } },
) {
  const eqUpdate = vi.fn().mockResolvedValue({ error: opts?.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });
  const single = vi.fn().mockResolvedValue({
    data: opts?.selectError ? null : { is_bootstrapped: initialFlag },
    error: opts?.selectError ?? null,
  });
  const eqSelect = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });
  const from = vi.fn().mockReturnValue({ select, update });

  return {
    client: { from } as unknown as Parameters<typeof ensureClientBootstrap>[0],
    from,
    select,
    update,
    eqUpdate,
  };
}

beforeEach(() => {
  mockBootstrapSkills.mockReset();
  mockBootstrapSkills.mockResolvedValue(undefined);
});

describe("ensureClientBootstrap", () => {
  it("skips skill bootstrap when is_bootstrapped is true", async () => {
    const mock = createMockSupabase(true);
    await ensureClientBootstrap(mock.client, "client-1");
    expect(mockBootstrapSkills).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("runs skill bootstrap and flips the flag when is_bootstrapped is false", async () => {
    const mock = createMockSupabase(false);
    await ensureClientBootstrap(mock.client, "client-1");
    expect(mockBootstrapSkills).toHaveBeenCalledWith(mock.client, "client-1");
    expect(mock.update).toHaveBeenCalledWith({ is_bootstrapped: true });
  });

  it("throws on a select error", async () => {
    const mock = createMockSupabase(false, { selectError: { message: "db down" } });
    await expect(ensureClientBootstrap(mock.client, "client-1")).rejects.toThrow(/db down/);
  });

  it("throws on an update error after a successful skill bootstrap", async () => {
    const mock = createMockSupabase(false, { updateError: { message: "write failed" } });
    await expect(ensureClientBootstrap(mock.client, "client-1")).rejects.toThrow(/write failed/);
    expect(mockBootstrapSkills).toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts
```

Expected: FAIL — `ensure-client-bootstrap.ts` does not exist.

### Step 3: Create the implementation

Create `src/lib/runner/skills/ensure-client-bootstrap.ts`:

```typescript
/**
 * Durable one-time client bootstrap — seeds bundled instruction skills.
 *
 * Pre-D2 this also seeded memory files (SOUL.md / USER.md / MEMORY.md);
 * after D2 only skill seeding remains. The `is_bootstrapped` flag on
 * `clients` guards against re-running on every chat turn.
 *
 * @module lib/runner/skills/ensure-client-bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapSkills } from "./skill-bootstrap";

/**
 * Ensures bundled skills are seeded for a client exactly once.
 *
 * Safe to call on every chat turn. Reads `clients.is_bootstrapped`; if
 * already set, returns immediately without touching Storage. Otherwise
 * seeds default skills and flips the flag.
 */
export async function ensureClientBootstrap(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  let { data: client, error: selectError } = await supabase
    .from("clients")
    .select("is_bootstrapped")
    .eq("client_id", clientId)
    .single();

  // Retry once on transient network failures (e.g. Turbopack HMR aborting in-flight fetches).
  if (selectError?.message?.includes("fetch failed")) {
    ({ data: client, error: selectError } = await supabase
      .from("clients")
      .select("is_bootstrapped")
      .eq("client_id", clientId)
      .single());
  }

  if (selectError) {
    throw new Error(`Failed to check bootstrap status: ${selectError.message}`);
  }

  if (client?.is_bootstrapped) {
    return;
  }

  await bootstrapSkills(supabase, clientId);

  const { error: updateError } = await supabase
    .from("clients")
    .update({ is_bootstrapped: true })
    .eq("client_id", clientId);

  if (updateError) {
    throw new Error(`Failed to mark client as bootstrapped: ${updateError.message}`);
  }
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts
```

Expected: ALL PASS.

### Step 5: Update the chat route import

In `app/api/chat/route.ts`, replace:

```typescript
import { ensureClientBootstrap } from "@/lib/memory/bootstrap";
```

with:

```typescript
import { ensureClientBootstrap } from "@/lib/runner/skills/ensure-client-bootstrap";
```

### Step 6: Update the chat-route test mock

In `src/lib/ai/__tests__/chat-route.test.ts`, find the mock for `@/lib/memory/bootstrap` (around line 86-90) and change the mocked path to `@/lib/runner/skills/ensure-client-bootstrap`. The mock factory keeps `ensureClientBootstrap: mockEnsureClientBootstrap`.

### Step 7: Run the chat route tests

```bash
pnpm vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: ALL PASS (all `ensureClientBootstrap` assertions from Task 6 still work against the new module path).

### Step 8: Commit

```bash
git add src/lib/runner/skills/ensure-client-bootstrap.ts \
        src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts \
        app/api/chat/route.ts \
        src/lib/ai/__tests__/chat-route.test.ts
git commit -m "refactor(h1): move ensureClientBootstrap into runner/skills (skills-only)"
```

---

## Task 10: Strip memory injection from context assembly

**Files:**
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/runner/__tests__/context.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts`
- Modify: `src/lib/runner/__tests__/serialization.test.ts`

### Step 1: Update `src/lib/runner/__tests__/context.test.ts`

- Delete the `mockLoadMemoryContext` declaration and its `vi.mock("@/lib/memory/loader", …)` block.
- Delete any assertions referencing `mockLoadMemoryContext` (e.g. `expect(mockLoadMemoryContext).toHaveBeenCalledWith(...)` and `expect(mockLoadMemoryContext).not.toHaveBeenCalled()`).
- Add one replacement test to lock in the new behavior:

```typescript
  it("does not inject any memory content into assembled messages", async () => {
    // Memory injection was removed in H1 (D2). The system prompt + user
    // messages are the only context the runner sees.
    const result = await assembleContext({
      supabase: createMockSupabase(),
      threadId: "thread-1",
      currentMessage: "hi",
      clientId: "client-123",
    });
    const hasMemoryBlock = result.messages.some((m) => {
      if (m.role !== "user") return false;
      const content = Array.isArray(m.content) ? m.content : [];
      return content.some(
        (part) =>
          typeof part === "object"
          && part !== null
          && "text" in part
          && typeof part.text === "string"
          && (part.text.includes("<soul>")
            || part.text.includes("<user-profile>")
            || part.text.includes("<working-memory>")),
      );
    });
    expect(hasMemoryBlock).toBe(false);
  });
```

> If `createMockSupabase` doesn't exist in that file, reuse whatever mock factory the file already employs — the test's goal is "run assembleContext and assert no `<soul>`/`<user-profile>`/`<working-memory>` blocks appear in any user message."

### Step 2: Run test to verify it fails (memory blocks still injected)

```bash
pnpm vitest run src/lib/runner/__tests__/context.test.ts -t "does not inject any memory content"
```

Expected: FAIL — the current implementation still injects memory.

### Step 3: Delete memory injection from `src/lib/runner/context.ts`

Apply these edits, in order:

1. Delete the two imports at the top:
   ```typescript
   import { loadMemoryContext } from "@/lib/memory/loader";
   import type { MemoryContext } from "@/lib/memory/loader";
   ```
2. Delete the `formatMemoryMessage` helper (lines ~202-222).
3. In `loadSystemPromptState`:
   - Remove `memoryContext?: MemoryContext;` from the return type.
   - Remove `memoryContext: undefined,` from the no-`clientId` early return.
   - Remove `loadMemoryContext(supabase, clientId),` from the `Promise.all` call.
   - Remove `memoryContext` from the returned object.
4. In `assembleSystemOnly`:
   - Remove `memoryContext` from the `loadSystemPromptState` destructure.
   - Delete the `if (memoryContext) { … }` block that appends memory to the system string.
5. In `assembleContext`:
   - Remove `memoryContext` from the `preloadedState` destructure.
   - Delete the `if (memoryContext) { … }` block that pushes memory into `injectedMessages` (lines ~477-485).

### Step 4: Update the other runner tests that mock memory

- `src/lib/runner/__tests__/run-agent.test.ts` — find lines 294 and 452 (the `memoryContext: undefined` entries inside mock return values for `loadSystemPromptState`) and delete them.
- `src/lib/runner/__tests__/serialization.test.ts` — find line 163 (`memoryContext: undefined`) and delete it.
- Any other hit from `grep -rn "memoryContext" src/lib/runner/__tests__/` — delete.

### Step 5: Run the full runner test suite

```bash
pnpm vitest run src/lib/runner/
```

Expected: ALL PASS (including the new "does not inject any memory content" test).

### Step 6: Smoke-verify `runAgent` does not crash without memory

Add one targeted assertion to `src/lib/runner/__tests__/run-agent.test.ts` inside the existing happy-path describe block (pick the first existing test that asserts `runAgent` completes successfully and insert this alongside the existing expectations):

```typescript
    // D2: memory injection is gone — assembled context must contain no <soul>/<user-profile>/<working-memory> blocks.
    const assembledSystemOrMessages = /* whatever the existing assertion uses */;
    expect(JSON.stringify(assembledSystemOrMessages)).not.toContain("<soul>");
    expect(JSON.stringify(assembledSystemOrMessages)).not.toContain("<user-profile>");
    expect(JSON.stringify(assembledSystemOrMessages)).not.toContain("<working-memory>");
```

Adapt the `/* whatever */` placeholder to whatever the existing assertion variable is — if the test uses `expect(mockStreamText).toHaveBeenCalledWith(...)`, pull the call args:

```typescript
    const lastCallArgs = mockStreamText.mock.calls[0]?.[0];
    const serialized = JSON.stringify(lastCallArgs);
    expect(serialized).not.toContain("<soul>");
```

Run:

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: ALL PASS.

### Step 7: Commit

```bash
git add src/lib/runner/context.ts \
        src/lib/runner/__tests__/context.test.ts \
        src/lib/runner/__tests__/run-agent.test.ts \
        src/lib/runner/__tests__/serialization.test.ts
git commit -m "chore(h1): strip memory injection from runner context assembly (D2)"
```

---

## Task 11: Delete `src/lib/memory/` and the memory dashboard UI

**Files:**
- Delete: `src/lib/memory/` (whole directory)
- Delete: `app/api/memory/file/route.ts`
- Delete: `app/api/memory/files/route.ts`
- Delete: `app/(dashboard)/memory/page.tsx`
- Delete: `src/components/memory/memory-file-list.tsx`
- Delete: `src/components/memory/memory-file-viewer.test.tsx`

### Step 1: Sanity-grep that nothing else still imports from `@/lib/memory/*`

```bash
pnpm grep -rn "from \"@/lib/memory" src/ app/
```

Expected: only the files scheduled for deletion below should appear (`src/lib/memory/*`, `app/api/memory/*`, `app/(dashboard)/memory/*`, `src/components/memory/*`). If anything else appears (e.g. a stray import in `src/lib/runner/context.ts`), fix it before deleting.

### Step 2: Delete the memory UI routes and components

```bash
git rm app/api/memory/file/route.ts
git rm app/api/memory/files/route.ts
git rm app/(dashboard)/memory/page.tsx
git rm src/components/memory/memory-file-list.tsx
git rm src/components/memory/memory-file-viewer.test.tsx
```

If `app/api/memory/` is now empty, remove the empty directory:

```bash
rmdir app/api/memory 2>/dev/null || true
rmdir "app/(dashboard)/memory" 2>/dev/null || true
rmdir src/components/memory 2>/dev/null || true
```

### Step 3: Delete the `src/lib/memory/` directory

```bash
git rm -r src/lib/memory/
```

### Step 4: Typecheck + full test run

```bash
pnpm exec tsc --noEmit
pnpm test:run
```

Expected: typecheck PASS, all tests PASS. If any import error surfaces, fix it (either re-home the missing primitive per Task 7/8 or remove the dead reference) and re-run before committing.

### Step 5: Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(h1): delete src/lib/memory and memory dashboard UI (D2)

Drops the entire in-tree memory system — bootstrap, templates, loader,
queries, schemas, UI routes, components. The Supabase Storage files in
the agent-files bucket (SOUL.md, USER.md, MEMORY.md, memory/*.md) stay
in place; SOUL.md and USER.md are migrated to clients.client_profile /
clients.user_preferences by the script in Task 12. MEMORY.md and
memory/*.md files are intentionally orphaned per D2 clean-slate.
EOF
)"
```

---

## Task 12: Data migration script — `migrate-soul-to-clients.ts`

**Files:**
- Create: `scripts/managed-agents/migrate-soul-to-clients.ts`
- Create: `scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts`

### Step 1: Write the failing test

Create `scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts`:

```typescript
/**
 * Tests for the one-time SOUL.md/USER.md → clients columns data migration.
 * @module scripts/managed-agents/__tests__/migrate-soul-to-clients
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { migrateSoulToClients } from "../migrate-soul-to-clients";

type ClientRow = {
  client_id: string;
  client_profile: string | null;
  user_preferences: string | null;
};

interface StorageFixture {
  files: Record<string, string>; // full path "clientId/SOUL.md" -> content
}

function createMockSupabase(
  clients: ClientRow[],
  storage: StorageFixture,
) {
  const updated: Array<{ client_id: string; patch: Partial<ClientRow> }> = [];

  const download = vi.fn(async (path: string) => {
    const content = storage.files[path];
    if (content === undefined) {
      return { data: null, error: { message: "Object not found", status: 404 } };
    }
    return {
      data: { text: async () => content },
      error: null,
    };
  });

  const from = vi.fn((table: string) => {
    if (table !== "clients") throw new Error(`unexpected table ${table}`);

    return {
      select: () => ({
        // select("client_id, client_profile, user_preferences")
        then: (resolve: (r: { data: ClientRow[]; error: null }) => void) =>
          resolve({ data: clients, error: null }),
      }),
      update: (patch: Partial<ClientRow>) => ({
        eq: (_col: string, id: string) => {
          updated.push({ client_id: id, patch });
          // Simulate the DB updating the row in-memory so re-runs see the new state.
          const row = clients.find((c) => c.client_id === id);
          if (row) Object.assign(row, patch);
          return Promise.resolve({ error: null });
        },
      }),
    };
  });

  const storageFrom = vi.fn(() => ({ download }));

  const client = {
    from,
    storage: { from: storageFrom },
  } as unknown as Parameters<typeof migrateSoulToClients>[0];

  return { client, updated, download };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("migrateSoulToClients", () => {
  it("copies SOUL.md → client_profile and USER.md → user_preferences", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-a", client_profile: null, user_preferences: null }],
      {
        files: {
          "client-a/SOUL.md": "I am Sunder.",
          "client-a/USER.md": "I am Alice.",
        },
      },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([
      { client_id: "client-a", patch: { client_profile: "I am Sunder." } },
      { client_id: "client-a", patch: { user_preferences: "I am Alice." } },
    ]);
  });

  it("skips clients whose files are missing (no error, no write)", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-b", client_profile: null, user_preferences: null }],
      { files: {} },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([]);
  });

  it("only reads SOUL.md but not USER.md when only one file is present", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-c", client_profile: null, user_preferences: null }],
      { files: { "client-c/SOUL.md": "Soul only." } },
    );

    await migrateSoulToClients(mock.client);

    expect(mock.updated).toEqual([
      { client_id: "client-c", patch: { client_profile: "Soul only." } },
    ]);
  });

  it("is idempotent: running twice writes only once when the column is already populated", async () => {
    const mock = createMockSupabase(
      [{ client_id: "client-d", client_profile: null, user_preferences: null }],
      {
        files: {
          "client-d/SOUL.md": "I am Sunder.",
          "client-d/USER.md": "I am Alice.",
        },
      },
    );

    await migrateSoulToClients(mock.client);
    const firstPassWrites = mock.updated.length;
    await migrateSoulToClients(mock.client);

    expect(firstPassWrites).toBe(2);
    expect(mock.updated.length).toBe(firstPassWrites); // no new writes on second pass
  });
});
```

### Step 2: Run test to verify it fails

```bash
pnpm vitest run scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts
```

Expected: FAIL — `migrate-soul-to-clients.ts` does not exist.

### Step 3: Write the script

Create `scripts/managed-agents/migrate-soul-to-clients.ts`:

```typescript
/**
 * One-time data migration: copy SOUL.md / USER.md from Supabase Storage
 * (`agent-files` bucket, path `{clientId}/SOUL.md|USER.md`) into the new
 * `clients.client_profile` / `clients.user_preferences` columns.
 *
 * Idempotent. Safe to run multiple times — rows whose column is already
 * populated are skipped. Missing files are treated as no-ops.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/migrate-soul-to-clients.ts
 *
 * @module scripts/managed-agents/migrate-soul-to-clients
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "agent-files";

type ClientRow = {
  client_id: string;
  client_profile: string | null;
  user_preferences: string | null;
};

async function downloadStorageText(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) {
    const status = (error as { status?: number }).status;
    const statusCode = (error as { statusCode?: string }).statusCode;
    if (status === 404 || statusCode === "404" || /not\s*found/i.test(error.message ?? "")) {
      return null;
    }
    throw new Error(`Failed to read ${path}: ${error.message}`);
  }
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof (data as { text?: unknown }).text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }
  throw new Error(`Unsupported download payload for ${path}`);
}

/**
 * Migrates SOUL.md/USER.md storage content into the new `clients` columns.
 *
 * Exported for testing. CLI entrypoint below calls it with an admin client.
 */
export async function migrateSoulToClients(
  supabase: SupabaseClient,
): Promise<{ processed: number; wrote: number; skipped: number }> {
  const { data: clients, error } = await supabase
    .from("clients")
    .select("client_id, client_profile, user_preferences") as unknown as {
      data: ClientRow[] | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to list clients: ${error.message}`);
  }

  const rows = clients ?? [];
  let wrote = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.client_profile == null) {
      const soul = await downloadStorageText(supabase, `${row.client_id}/SOUL.md`);
      if (soul !== null) {
        const { error: updateError } = await supabase
          .from("clients")
          .update({ client_profile: soul })
          .eq("client_id", row.client_id);
        if (updateError) {
          throw new Error(
            `Failed to update client_profile for ${row.client_id}: ${updateError.message}`,
          );
        }
        row.client_profile = soul;
        wrote += 1;
      } else {
        skipped += 1;
      }
    }

    if (row.user_preferences == null) {
      const user = await downloadStorageText(supabase, `${row.client_id}/USER.md`);
      if (user !== null) {
        const { error: updateError } = await supabase
          .from("clients")
          .update({ user_preferences: user })
          .eq("client_id", row.client_id);
        if (updateError) {
          throw new Error(
            `Failed to update user_preferences for ${row.client_id}: ${updateError.message}`,
          );
        }
        row.user_preferences = user;
        wrote += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { processed: rows.length, wrote, skipped };
}

// ---- CLI entrypoint ----
async function main() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Source .env.local first.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await migrateSoulToClients(admin);
  console.log(
    `[migrate-soul-to-clients] processed=${result.processed} wrote=${result.wrote} skipped=${result.skipped}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

### Step 4: Run test to verify it passes

```bash
pnpm vitest run scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts
```

Expected: ALL PASS including the idempotency case.

### Step 5: Document the one-time operator run

> **Operator action required (do not automate):** after the schema migration from Task 2 has been applied against the dev database, run the migration locally:
>
> ```bash
> pnpm tsx scripts/managed-agents/migrate-soul-to-clients.ts
> ```
>
> Expected stdout: `[migrate-soul-to-clients] processed=<N> wrote=<M> skipped=<K>` with no thrown errors. Re-running immediately should report `wrote=0`. If any client throws, inspect the error message; do NOT commit a "wrote=0" re-run — the tasklist does not include a production run.

### Step 6: Commit

```bash
git add scripts/managed-agents/migrate-soul-to-clients.ts \
        scripts/managed-agents/__tests__/migrate-soul-to-clients.test.ts
git commit -m "$(cat <<'EOF'
feat(h1): one-time script to migrate SOUL.md/USER.md to clients columns

Idempotent. Only writes a column when its current value is null.
MEMORY.md and memory/*.md are intentionally NOT migrated (D2 —
clean slate for Anthropic memory stores).
EOF
)"
```

---

## Task 13: Anthropic agent creation script — `create-agent.ts`

> **Context (read before starting):** The full migrated system prompt is NOT inlined in this tasklist — it would be 500+ lines. Instead, the script imports `SYSTEM_PROMPT` + the feature-flag prompt constants directly from `src/lib/ai/system-prompt.ts` and concatenates them. The `<memory-system>` and `<subagents>` blocks have already been covered by Task 10's memory deletion (well, `<memory-system>` prose is still in the string — see step 1 below). The `<filesystem>`, `<sandbox>`, `<triggers>`, `<custom-skills>` rewrite is **out of scope for H1** per the plan doc (it happens in H3 when the adapter actually lands) — for now we ship the CURRENT SYSTEM_PROMPT verbatim so the agent object exists. H3 will replace it via `client.beta.agents.update({ system: "..." })` with version bump.

**Files:**
- Create: `scripts/managed-agents/create-agent.ts`

### Step 1: (Optional, can defer to H3) Leave `src/lib/ai/system-prompt.ts` alone

The handover lists "rewrite `<filesystem>`, `<sandbox>`, `<triggers>`, `<custom-skills>`; delete `<memory-system>` and `<subagents>`" — but rewriting `SYSTEM_PROMPT` will break the legacy runner (it uses the same string). Per the tasklist's non-negotiable "legacy runner still handles production traffic after H1", **we do not modify `SYSTEM_PROMPT` in H1**. H3 will rewrite it alongside deleting the legacy runner.

The agent is created with the current system prompt. H3 will update the agent (creating a new version) with the rewritten prompt when it actually cuts over. Note this explicitly in the script's JSDoc and add a `// TODO(h3):` comment pointing at the rewrite.

### Step 2: Write the script

Create `scripts/managed-agents/create-agent.ts`:

```typescript
/**
 * One-time bootstrap: creates the NeoBot Managed Agent in Anthropic's API.
 *
 * Run once per environment (dev / staging / prod). Prints the returned
 * `agent.id` and `agent.version` — operator stores them as
 * `ANTHROPIC_AGENT_ID` and `ANTHROPIC_AGENT_VERSION` environment variables.
 *
 * IMPORTANT (per claude-api skill shared/managed-agents-core.md §Versioning):
 * Store BOTH the id and the version. Sessions must pin to a specific
 * version via `{ type: "agent", id, version: Number(ANTHROPIC_AGENT_VERSION) }`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-agent.ts
 *
 * @module scripts/managed-agents/create-agent
 */
import Anthropic from "@anthropic-ai/sdk";

import {
  BROWSER_AUTOMATION_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  SYSTEM_PROMPT,
} from "../../src/lib/ai/system-prompt";

// TODO(h3): rewrite <filesystem>, <sandbox>, <triggers>, <custom-skills>
// and delete <memory-system> + <subagents> from SYSTEM_PROMPT, then bump
// the agent version with client.beta.agents.update(). H1 ships with the
// legacy prompt verbatim so the legacy runner keeps working.
const MIGRATED_SYSTEM = [
  SYSTEM_PROMPT,
  BROWSER_AUTOMATION_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  // Trigger-run guidance (flagged in plan Phase 1 bullet):
  `<trigger-mode-guidance>
Do not use run_sql, get_agent_db_schema, ask_user_question, create_connection,
or reauthorize_connection in trigger runs. They return errors in that context.
Use search_crm for data lookups in trigger runs.
</trigger-mode-guidance>`,
].join("\n\n");

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source .env.local or export it before running.",
    );
  }

  const client = new Anthropic({ apiKey });

  // `agents.create` is a beta API. The SDK exposes it under `client.beta.agents`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (client as any).beta?.agents;
  if (!agents || typeof agents.create !== "function") {
    throw new Error(
      "Anthropic SDK does not expose client.beta.agents.create — upgrade @anthropic-ai/sdk to a version with managed agents beta support.",
    );
  }

  const agent = await agents.create({
    name: "sunder-chat-agent",
    model: "claude-sonnet-4-6",
    system: MIGRATED_SYSTEM,
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: {
          permission_policy: { type: "always_allow" },
        },
        configs: [
          { name: "bash", permission_policy: { type: "always_ask" } },
          // web_fetch and web_search are disabled per plan R9 — Sunder owns
          // its own web_search / web_scrape custom tools.
          { name: "web_fetch", enabled: false },
          { name: "web_search", enabled: false },
        ],
      },
    ],
    skills: [
      { type: "anthropic", skill_id: "xlsx" },
      { type: "anthropic", skill_id: "docx" },
      { type: "anthropic", skill_id: "pptx" },
      { type: "anthropic", skill_id: "pdf" },
    ],
    // No custom tools in H1 — they land in H2 and get wired in H3/H4.
  });

  console.log("=".repeat(60));
  console.log("NeoBot Managed Agent created.");
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_AGENT_ID=${agent.id}`);
  console.log(`ANTHROPIC_AGENT_VERSION=${agent.version}`);
  console.log("");
  console.log(
    "Add BOTH to .env.local (and Vercel project env for staging/prod).",
  );
  console.log(
    "Sessions must pin to this exact version — do not use 'latest' shorthand in production.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Step 3: Verify the script typechecks

```bash
pnpm exec tsc --noEmit scripts/managed-agents/create-agent.ts || pnpm exec tsc --noEmit
```

Expected: PASS. If the SDK does not yet ship `.beta.agents.create` types, the `as any` cast silences the static check — the runtime error message handles the shape mismatch.

### Step 4: Document the one-time operator run

> **Operator action required (do not automate):**
>
> ```bash
> ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/managed-agents/create-agent.ts
> ```
>
> Expected stdout ends with two `KEY=value` lines. Copy both into `.env.local` verbatim:
>
> ```bash
> ANTHROPIC_AGENT_ID=agent_...
> ANTHROPIC_AGENT_VERSION=1
> ```
>
> Do this in every environment (dev, staging, prod) — each gets its own agent id. If the call fails with a beta-access error, confirm the Anthropic org has Managed Agents beta access enabled.

### Step 5: Commit

```bash
git add scripts/managed-agents/create-agent.ts
git commit -m "$(cat <<'EOF'
feat(h1): one-time script to create the Sunder managed agent

Creates the agent object in Anthropic with agent_toolset_20260401
(bash = always_ask, web_fetch/web_search disabled), Anthropic skills
(xlsx/docx/pptx/pdf), and the current legacy SYSTEM_PROMPT. Prints
both agent.id and agent.version to stdout — operator stores both as
env vars (sessions must pin to a specific version per shared/
managed-agents-core.md §Versioning). H3 will rewrite the system
prompt via client.beta.agents.update() during cutover.
EOF
)"
```

---

## Task 14: Anthropic environment creation script — `create-environment.ts`

**Files:**
- Create: `scripts/managed-agents/create-environment.ts`

### Step 1: Write the script

Create `scripts/managed-agents/create-environment.ts`:

```typescript
/**
 * One-time bootstrap: creates the NeoBot Managed Agents execution environment.
 *
 * Run once per deployment environment. Prints the returned `environment.id` —
 * operator stores it as `ANTHROPIC_ENVIRONMENT_ID`.
 *
 * Usage:
 *   pnpm tsx scripts/managed-agents/create-environment.ts
 *
 * @module scripts/managed-agents/create-environment
 */
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Source .env.local or export it before running.",
    );
  }

  const client = new Anthropic({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const environments = (client as any).beta?.environments;
  if (!environments || typeof environments.create !== "function") {
    throw new Error(
      "Anthropic SDK does not expose client.beta.environments.create — upgrade @anthropic-ai/sdk to a version with managed agents beta support.",
    );
  }

  const environment = await environments.create({
    name: "sunder-production",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  });

  console.log("=".repeat(60));
  console.log("NeoBot Managed Agents environment created.");
  console.log("=".repeat(60));
  console.log(`ANTHROPIC_ENVIRONMENT_ID=${environment.id}`);
  console.log("");
  console.log("Add to .env.local (and Vercel project env for staging/prod).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Step 2: Typecheck

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

### Step 3: Document the one-time operator run

> **Operator action required:**
>
> ```bash
> ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/managed-agents/create-environment.ts
> ```
>
> Expected stdout ends with `ANTHROPIC_ENVIRONMENT_ID=env_...`. Copy into `.env.local`. Repeat per environment.

### Step 4: Commit

```bash
git add scripts/managed-agents/create-environment.ts
git commit -m "feat(h1): one-time script to create the Sunder managed agents environment"
```

---

## Task 15: Exit-criteria verification

**Files:** none (verification only)

### Step 1: Run the exit-criteria grep assertions

```bash
pnpm grep -rn "crmMode" src/ app/ 2>/dev/null
```

Expected: zero hits.

```bash
pnpm grep -rn "CRM_SETUP_SYSTEM_PROMPT\|SETUP_SYSTEM_PROMPT" src/ app/ 2>/dev/null
```

Expected: zero hits.

```bash
pnpm grep -rn "from \"@/lib/memory" src/ app/ 2>/dev/null
```

Expected: zero hits.

```bash
pnpm grep -rn "loadMemoryContext\|bootstrapMemoryFiles\|MemoryContext" src/ app/ 2>/dev/null
```

Expected: zero hits.

### Step 2: Run the full test suite + typecheck + lint

```bash
pnpm test:run && pnpm exec tsc --noEmit && pnpm lint
```

Expected: ALL PASS. If anything fails, fix and re-run — **do not commit a broken state**.

### Step 3: Confirm the schema migration file exists with the expected name

```bash
ls supabase/migrations/20260410100000_managed_agents_foundation.sql
```

Expected: file exists.

### Step 4: Confirm the bootstrap scripts exist

```bash
ls scripts/managed-agents/
```

Expected output (order may vary):

```
__tests__
create-agent.ts
create-environment.ts
migrate-soul-to-clients.ts
```

### Step 5: Confirm the legacy runner still runs against a happy-path scenario

```bash
pnpm vitest run src/lib/runner/__tests__/run-agent.test.ts
```

Expected: ALL PASS. This is the load-bearing assertion that H1's deletions did not break the runner that's still handling production traffic.

### Step 6: Commit the verification notes (if any) — otherwise skip

If the verification turned up any stray code that needed a fix-up, those changes were committed under their relevant task. This task has no commit of its own.

---

## H1 exit checklist (from handover — re-verified here)

1. [ ] All `crmMode` references deleted (Task 3-6).
2. [ ] Schema migration applied cleanly; `uq_conversation_messages_thread_source_event` present (Task 2).
3. [ ] Data migration script runs idempotently against fixture clients; unit tests pass (Task 12).
4. [ ] Agent creation script runs against Anthropic API; both `agent.id` and `agent.version` printed (Task 13).
5. [ ] Environment creation script runs; `environment.id` printed (Task 14).
6. [ ] `ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`, `ANTHROPIC_ENVIRONMENT_ID` are optional env vars (Task 1).
7. [ ] `src/lib/memory/` directory deleted; `loadMemoryContext` gone from `context.ts` (Task 10-11).
8. [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass (Task 15).
9. [ ] Legacy runner still handles production traffic — zero code paths reference the new env vars or the unset `ANTHROPIC_AGENT_ID` (Task 15 Step 5).
