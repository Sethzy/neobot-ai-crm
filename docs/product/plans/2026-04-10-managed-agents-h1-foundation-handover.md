# Handover H1: Managed Agents Migration — Foundation

## Your job

Generate **one TDD tasklist** that covers the "foundation" slice of the Managed Agents migration. Follow the tasklist generation rule already in your memory (`feedback_tasklist_generation_rule.md`). Save the output to:

```
docs/product/tasks/2026-04-10-managed-agents-h1-foundation-tasklist.md
```

Do NOT implement the code yourself. Your output is the tasklist. Someone else executes it.

## Big picture (30 seconds)

Sunder is migrating its custom AI agent runner (`streamText()` + tool dispatch + compaction + context assembly, ~2,500 LOC) to Anthropic Managed Agents. Anthropic runs the agent loop; Sunder provides all tools as **custom tools** executed directly by a chat adapter. The migration is 5 handovers; you are **H1**, the foundation work that must land before any managed-agents code path is wired up. Everything H1 ships is purely additive — the legacy runner keeps handling all production traffic after H1 ships.

## Files to read first (in order)

1. **Plan doc:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — the full migration plan. Read top to bottom. Pay special attention to:
   - The "Architecture Decisions (2026-04-10)" section near the top
   - Phase 1 (your scope)
   - The "Decision Log" at the bottom (D1, D2, D6 are directly in scope)
2. **Origin requirements doc:** `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md` — historical context. Superseded in parts by the decision log.
3. **claude-api skill — managed agents onboarding:** run `/claude-api managed-agents-onboard` in your session to load Anthropic's official guidance. You'll need this for agent creation semantics (especially `shared/managed-agents-core.md` §Versioning).
4. **Existing tasklist example (format reference):** `docs/product/tasks/2026-03-28-vercel-sandbox-bash-tool-migration-tdd-tasklist.md` — study the header, Relevant Files section, and per-task Step 1-5 structure.
5. **Codebase files you'll need to reason about:**
   - `src/lib/ai/system-prompt.ts` — the ~470-line `SYSTEM_PROMPT` that gets migrated to the Anthropic agent's `system` field, plus the dead `CRM_SETUP_SYSTEM_PROMPT` / `SETUP_SYSTEM_PROMPT` exports you'll delete
   - `src/lib/runner/context.ts` — the `loadMemoryContext` call site you'll remove
   - `src/lib/memory/` — the entire directory you'll delete
   - `src/lib/runner/tools/crm/index.ts:49` — the `mode === "setup"` branch
   - `src/lib/runner/schemas.ts` — `crmMode` field to remove
   - `app/api/chat/schema.ts` — `crmMode` field to remove
   - `src/lib/env.ts` — where you'll add new env vars
   - `supabase/migrations/20260310000000_create_approval_events.sql` — existing approval_events table you'll extend

## Your scope

Three bundled parts. All are purely additive OR pure deletion — no behavior changes in the production chat path.

### Part A — Delete CRM setup mode (D1)

Zero production callers for `crmMode: "setup"`. All references are in test files. Delete:
- Exports `CRM_SETUP_SYSTEM_PROMPT`, `SETUP_SYSTEM_PROMPT` from `src/lib/ai/system-prompt.ts`
- The `crmMode === "setup"` branch in `src/lib/runner/context.ts:195`
- The `mode === "setup"` branch in `src/lib/runner/tools/crm/index.ts:49`
- `crmMode` field from `src/lib/runner/schemas.ts` and `app/api/chat/schema.ts`
- `crmMode` option from `src/lib/runner/tool-registry.ts:29`
- Test files: `src/lib/ai/__tests__/chat-route-crm-mode.test.ts`, `src/lib/ai/__tests__/system-prompt-setup.test.ts`, `src/lib/runner/__tests__/context-crm-config.test.ts`
- `crmMode: "setup"` references from other test files

Run `pnpm test` at the end to confirm nothing references the deleted exports. Grep for `crmMode` and `SETUP_SYSTEM_PROMPT` — should return zero hits after deletion.

### Part B — Schema migration (additive only, no destructive changes)

Create ONE new Supabase migration under `supabase/migrations/` with a filename like `2026041010000_managed_agents_foundation.sql`. Required changes:

- `runs` → add `session_id text`, `events_cursor text` (both nullable)
- `clients` → add `client_profile text`, `user_preferences text` (both nullable)
- `conversation_threads` → add `session_id text` (nullable)
- `conversation_messages` → add `source_event_id text` (nullable) + **unique index** `CREATE UNIQUE INDEX ... ON conversation_messages (thread_id, source_event_id) WHERE source_event_id IS NOT NULL` — critical for idempotent polling-cron upserts later
- `approval_events` → add `session_id text`, `tool_use_id text` (both nullable) — for Telegram approval routing in H4
- `run_scores` → NEW TABLE: `(run_id uuid NOT NULL REFERENCES runs(run_id), evaluator_name text NOT NULL, score_type text NOT NULL, score_value numeric, comment text, created_at timestamptz NOT NULL DEFAULT now())`. RLS: clients can read their own scores. Include an index on `(run_id)`.

Write a migration test under `supabase/migrations/__tests__/` that parses the SQL and verifies all the expected columns/indexes/tables are present. Follow the pattern in `supabase/migrations/__tests__/approval-events-migration.test.ts`.

### Part C — Data migration script (one-time, idempotent)

Create `scripts/managed-agents/migrate-soul-to-clients.ts`. For each existing client:
- Read `SOUL.md` from Supabase Storage (bucket: `memory`, path: `{clientId}/SOUL.md`) → write to `clients.client_profile`
- Read `USER.md` from Supabase Storage → write to `clients.user_preferences`
- If file is missing, skip (no-op, not error)
- Idempotent: safe to re-run. Only writes if the DB column is currently null.

**MEMORY.md and memory/*.md files are NOT migrated** (D2 — clean slate for when Anthropic memory stores become available).

Write unit tests with a mock Supabase client and fixture files (1 client with both files, 1 client with only SOUL.md, 1 client with neither).

### Part D — Agent and environment bootstrap scripts (one-time)

Create two scripts:

**`scripts/managed-agents/create-agent.ts`**
- Uses `@anthropic-ai/sdk`: `client.beta.agents.create(...)`
- `model: "claude-sonnet-4-6"`
- `system`: the migrated system prompt per plan Phase 1 "System prompt migration" — keep most sections, rewrite `<filesystem>`, `<sandbox>`, `<triggers>`, `<custom-skills>`, delete `<memory-system>` and `<subagents>`. Include the trigger-mode guidance: "Do not use `run_sql`, `get_agent_db_schema`, `ask_user_question`, `create_connection`, or `reauthorize_connection` in trigger runs."
- `tools`: `[{ type: "agent_toolset_20260401", default_config: { permission_policy: { type: "always_allow" } }, configs: [{ name: "bash", permission_policy: { type: "always_ask" } }] }]` — disable `web_fetch` and `web_search` per plan R9. **Do not add custom tools yet** — they come in H2/H3.
- `skills`: `[{ type: "anthropic", skill_id: "xlsx" }, { type: "anthropic", skill_id: "docx" }, { type: "anthropic", skill_id: "pptx" }, { type: "anthropic", skill_id: "pdf" }]`
- **Critical:** on success, `console.log` BOTH `agent.id` AND `agent.version` so the operator stores them as env vars. Per skill `shared/managed-agents-core.md` §Versioning: sessions must pin to a specific version.

**`scripts/managed-agents/create-environment.ts`**
- `client.beta.environments.create({ name: "sunder-production", config: { type: "cloud", networking: { type: "unrestricted" } } })`
- Logs the `environment.id` so the operator stores it as env var.

Both scripts should be runnable via `pnpm tsx scripts/managed-agents/create-agent.ts` (or equivalent). They're one-time setup, not production code — no complex error handling needed beyond surfacing API errors.

Update `src/lib/env.ts` to declare the three new env vars as **optional** (the legacy runner doesn't need them):
- `ANTHROPIC_AGENT_ID`
- `ANTHROPIC_AGENT_VERSION`
- `ANTHROPIC_ENVIRONMENT_ID`

Add tests to `src/lib/__tests__/env.test.ts` verifying they can be set and default to undefined.

### Part E — Delete memory system (D2)

Per decision log D2: Sunder ships without cross-session memory in v1. Clean slate for Anthropic memory stores when access is granted.

- Remove the `loadMemoryContext` import and call from `src/lib/runner/context.ts`. The legacy runner will still run; it will just no longer inject memory content into context. This is an intentional behavior change.
- Delete the entire `src/lib/memory/` directory
- Remove any memory-seeding logic from client onboarding (search for `DEFAULT_SOUL_MD`, `DEFAULT_USER_MD`, etc.)
- The `memory` Supabase Storage bucket and existing files stay in place (the data migration in Part C copies SOUL.md and USER.md out of it; MEMORY.md and memory/*.md files are left orphaned but harmless)
- Update any tests that import from `src/lib/memory/` — delete or rewrite

**Be careful:** the legacy runner is still handling production traffic after H1 ships. Make sure removing `loadMemoryContext` doesn't crash the runner — it should gracefully continue without memory injection. Verify by running `pnpm test` and `pnpm typecheck`.

## Key decisions that apply to your scope

- **D1** — Drop CRM setup mode entirely. Dead code.
- **D2** — Ship without cross-session memory in v1. MEMORY.md and memory/*.md are NOT migrated.
- **D6** — `approval_events` table extended with `session_id` + `tool_use_id` nullable columns. You're only adding the columns; the Telegram callback handling is H4's job.

Read the full Decision Log in the plan doc for context on the others (D3, D4, D5, D7, D8, D9) — they don't directly affect your scope but will help you understand why the migration is shaped this way.

## Exit criteria

Your tasklist should deliver the following when executed:

1. ✅ All `crmMode` references deleted. `grep -r "crmMode" src/` returns zero results.
2. ✅ Schema migration applied cleanly. New columns exist. Unique index on `conversation_messages` works.
3. ✅ Data migration script runs idempotently against a fixture client set. Unit tests pass.
4. ✅ Agent creation script runs successfully against Anthropic API (manual run — document this as a "run this once" step in the tasklist). Agent ID and Version printed to stdout.
5. ✅ Environment creation script runs successfully. Environment ID printed.
6. ✅ `ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`, `ANTHROPIC_ENVIRONMENT_ID` added to `src/lib/env.ts` as optional env vars.
7. ✅ `src/lib/memory/` directory deleted. `loadMemoryContext` call removed from `context.ts`.
8. ✅ `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass.
9. ✅ Legacy runner still handles production traffic (no code path uses the new env vars or agent ID yet).

## Gotchas / non-negotiables

- **Store BOTH `agent.id` AND `agent.version`.** Not just the ID. Per skill `shared/managed-agents-core.md` §Versioning, sessions pin to a specific version, and "latest shorthand" is a footgun for production rollouts.
- **Schema is additive only.** No `DROP COLUMN`, no `ALTER ... NOT NULL`, no data mutations in the SQL file itself. The data migration is a separate TypeScript script.
- **Do NOT add custom tools to the agent in this handover.** The agent creation script in Part D only enables `agent_toolset_20260401` with approval policies. Custom tools (all 38 Sunder tools) are ported in H2 and wired into the agent in H3/H4.
- **Do NOT write adapter code or dispatcher code.** That's H3's job. Your scope ends at scripts that print IDs.
- **Do NOT touch `src/lib/runner/run-agent.ts` beyond removing the memory import.** The legacy runner is still alive.
- **Memory deletion cannot crash the legacy runner.** Test that `runAgent()` still works after `loadMemoryContext` is gone — it should just skip the memory injection step and continue.
- **The data migration must be idempotent.** Safe to run twice in a row with no duplicate writes. Test this explicitly.
- **Filename timestamps:** use `2026-04-10` prefix on files you create.

## Output format reminder

Follow the tasklist generation rule in memory. Structure:

```markdown
# Managed Agents Migration — H1 Foundation

**Goal:** [one sentence]

**Architecture:** [2-3 sentences]

**Tech Stack:** [key libraries]

## Relevant Files

### Create
- ...

### Modify
- ...

### Delete
- ...

---

## Task 1: [Name]

**Files:**
- Create: `exact/path`
- Modify: `exact/path:line_range`
- Test: `exact/test/path`

**Step 1: Write the failing test**
[exact test code]

**Step 2: Run test to verify it fails**
Run: `pnpm vitest run path/to/test.ts`
Expected: FAIL with "[specific error]"

**Step 3: Write minimal implementation**
[exact code]

**Step 4: Run test to verify it passes**
Run: [exact command]
Expected: PASS

**Step 5: Commit**
```bash
git add ...
git commit -m "feat(h1): ..."
```
```

Each step must be 2-5 minutes of actual work. Write the full test and implementation code inline — don't leave placeholders.

Commit messages should use the prefix `feat(h1):`, `chore(h1):`, or `refactor(h1):` to make H1's commit history easy to find.

## One last thing

When you've generated the tasklist, end your response with:

> "Tasklist complete and saved to `docs/product/tasks/2026-04-10-managed-agents-h1-foundation-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint."

Then stop. Do not start implementing.
