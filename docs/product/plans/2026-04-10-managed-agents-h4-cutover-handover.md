# Handover H4: Managed Agents Migration — THE CUTOVER ⚠️

## Your job

Generate **one TDD tasklist** that covers the atomic cutover from the legacy runner to Managed Agents. Follow the tasklist generation rule already in your memory (`feedback_tasklist_generation_rule.md`). Save the output to:

```
docs/product/tasks/2026-04-10-managed-agents-h4-cutover-tasklist.md
```

Do NOT implement the code yourself. Your output is the tasklist. Someone else executes it.

## ⚠️ This is the riskiest PR in the migration

You are writing the tasklist for the **atomic cutover**. In a single PR:
1. Wire the new adapter into `app/api/chat/route.ts`
2. Delete the entire legacy runner (`run-agent.ts`, `compaction.ts`, `safety-gates.ts`, `drain-and-continue.ts`, `thread-queue.ts`, `continue-after-approval.ts`, `gateway.ts`)
3. Delete all Langfuse infrastructure
4. Update Telegram and `/api/tool-confirm` approval flows
5. Ship file upload/download API routes
6. Run all 12 integration test scenarios before merging

Rollback strategy: `git revert`. There is NO feature flag (per D5). The schema changes from H1 are additive so rollback doesn't touch data.

**Your tasklist must emphasize**: no scope creep, no "improvements" beyond what's listed, all 12 integration scenarios verified, delete commits separate from wiring commits for reviewability.

## Big picture (60 seconds)

Sunder is migrating its custom AI agent runner to Anthropic Managed Agents. Per D9, all tools run as custom tools in a chat adapter that preserves user-auth Supabase (RLS). Per D5, there's no feature flag — single cutover PR with `git revert` as rollback.

You are **H4**. By the time this ships:
- H1 delivered the schema + agent + env vars + dropped CRM setup mode + deleted `src/lib/memory/`
- H2 delivered 38 custom tool factories in `src/lib/managed-agents/tools/*`
- H3 delivered the adapter + dispatcher + refactored evaluators

Your job is the wiring + deletion. The new code is live the moment this merges. The legacy code is gone in the same PR. This is the single biggest, riskiest change in the migration.

## Files to read first (in order)

1. **Plan doc:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — focus on:
   - Phase 2 entirety (your primary reference)
   - Decision Log D3, D4, D5, D6, D9 (all directly in scope)
   - Integration Test Scenarios 1-12 (all 12 must pass before merge)
   - Risk Analysis & Mitigation
2. **claude-api skill:** run `/claude-api` and load:
   - `shared/managed-agents-client-patterns.md` — especially §4 tool_confirmation round-trip, §7 stream-first
   - `shared/managed-agents-tools.md` §Permission Policies — the confirmation flow
3. **Current chat route (to update, not rewrite):**
   - `app/api/chat/route.ts` — full file. Pay attention to line 331 (`runAgent()` call site), line 374 (`pipeJsonRender` pattern you'll replicate), the `createUIMessageStream` wrapping, `after()` callback for evaluator hooks
4. **Files to delete (legacy runner):**
   - `src/lib/runner/run-agent.ts`
   - `src/lib/runner/compaction.ts`
   - `src/lib/runner/safety-gates.ts`
   - `src/lib/runner/drain-and-continue.ts`
   - `src/lib/runner/thread-queue.ts`
   - `src/lib/approvals/continue-after-approval.ts`
   - `src/lib/ai/gateway.ts`
   - Plus all their test files
5. **Files to delete (Langfuse):**
   - `src/lib/eval/langfuse-api.ts`
   - `@langfuse/otel` and `@langfuse/tracing` from `package.json`
   - `LangfuseSpanProcessor` + `registerLangfuseTracing` from `src/instrumentation.ts`
   - `propagateAttributes` wrapper sites
   - `fetchTraceWithRetry` from `src/lib/eval/run-evaluators.ts`
   - `after(() => runEvaluatorsForTrace(traceId))` hook in `app/api/chat/route.ts`
   - The old Langfuse-observation overload of `extractToolSequence` (H3 kept it alive for back-compat)
6. **Telegram approval files (to update):**
   - `src/lib/channels/telegram/approvals.ts` — callback shape unchanged (`approve:<uuid>` / `deny:<uuid>`), but the backend routing changes
   - The Telegram webhook handler that parses callbacks (grep for `parseApprovalCallback` or `buildApprovalCallbackData`)
7. **`/api/tool-confirm` route** (to update):
   - Find it via grep or glob: `app/api/tool-confirm/route.ts` or similar
8. **Approval events table:**
   - `supabase/migrations/20260310000000_create_approval_events.sql` — reference for the existing shape
9. **H3 deliverables (already merged by the time you run):**
   - `src/lib/managed-agents/adapter.ts` — `runManagedAgent()` — the replacement
   - `src/lib/managed-agents/dispatcher.ts`
   - `src/lib/eval/extract-tool-sequence.ts` — has both the old and new overload
   - `src/lib/eval/run-scores-writer.ts` — new evaluator output path

## Your scope

Five parts. Structure your tasklist so each part is a distinct commit for reviewability, but ship them all in the same PR.

### Part A — Wire adapter into chat route

Update `app/api/chat/route.ts`:
- Replace the `runAgent(payload, supabase)` call at line 331 with `runManagedAgent(payload, supabase)`
- Wire the returned stream through `pipeJsonRender()` + `createUIMessageStream()` — same pattern as the current line 374, but the input is `runManagedAgent()` output instead of `streamText().toUIMessageStream()`
- Remove the `after(() => runEvaluatorsForTrace(traceId))` hook — the adapter now runs evaluators inline on completion
- Keep all the quota + rate-limiting checks before the runAgent call unchanged
- Keep the `crmMode` removal from H1 (already deleted, verify nothing reintroduced it)

Update any adapter wiring, imports, or type changes needed. The chat route continues to call `createUIMessageStream` + `createUIMessageStreamResponse` exactly as before.

### Part B — Update approval flows

**`/api/tool-confirm` route:**
When the browser confirms or denies a tool call, it POSTs to this route with the `approval_id`. The old flow called `resolveAndContinueApproval()` (which you're deleting). The new flow:

1. Look up `approval_events` by `approval_id` → get `session_id` and `tool_use_id`
2. Call `client.beta.sessions.events.send(session_id, { events: [{ type: "user.tool_confirmation", tool_use_id, result: "allow" | "deny", deny_message?: string }] })`
3. Mark the `approval_events` row as resolved (existing audit trail pattern)
4. Return success to the browser

**Telegram callback handler:**
The Telegram webhook receives a callback with `callback_data` like `approve:<uuid>` or `deny:<uuid>`. The uuid is the `approval_id`.

1. Parse the callback (`parseApprovalCallback()` stays as-is)
2. Look up `approval_events` by `approval_id` → get `session_id` and `tool_use_id`
3. Send `user.tool_confirmation` via `client.beta.sessions.events.send()` with the retrieved IDs
4. Delete the old `resolveAndContinueApproval()` → `runAgent()` chain
5. Update the Telegram reply message to reflect the confirmation

**IMPORTANT:** The Telegram `callback_data` format is unchanged (`approve:<uuid>`, 45 bytes, under 64-byte limit). Don't touch `buildApprovalCallbackData()`. The indirection (uuid → DB lookup → Anthropic routing) is entirely server-side.

Unit tests:
- `/api/tool-confirm` with a valid approval_id → `sessions.events.send` called with correct tool_use_id and result
- `/api/tool-confirm` with a nonexistent approval_id → 404
- Telegram callback "approve" → Anthropic session resumed with `result: "allow"`
- Telegram callback "deny" → Anthropic session resumed with `result: "deny"` and a default `deny_message`

### Part C — File upload and artifact download API routes

**File upload mid-session:**
Update the existing file-upload handling so that mid-conversation uploads call:
```typescript
await client.beta.sessions.resources.add(sessionId, {
  type: "file",
  file_id: anthropicFileId,
});
```
First upload the file to Anthropic via `client.beta.files.upload()`, then attach as a session resource. The agent's `read` tool can then read it.

**Artifact download after session idle:**
Create `app/api/sessions/[sessionId]/files/route.ts`:
- `GET` handler
- Calls `client.beta.files.list({ scope: sessionId })`
- Downloads each via `client.beta.files.download(fileId)`
- Uploads to Supabase Storage under the client's directory
- Returns Supabase Storage URLs to the browser
- **Retry with exponential backoff** (1s, 2s, 4s) for 1-3s indexing lag — Anthropic's docs warn about this

Unit tests:
- Mock `client.beta.files.list` returning fixture files → verify all are downloaded and uploaded to Supabase Storage
- Indexing lag simulation: first call returns empty → retry → second call returns files → verify retry worked
- Empty result after all retries → log warning, return empty array, don't crash

### Part D — Delete legacy runner (SEPARATE COMMIT)

Delete all of the following in one commit:
- `src/lib/runner/run-agent.ts` + its test file
- `src/lib/runner/compaction.ts` + tests
- `src/lib/runner/safety-gates.ts` + tests
- `src/lib/runner/drain-and-continue.ts` + tests
- `src/lib/runner/thread-queue.ts` + tests
- `src/lib/approvals/continue-after-approval.ts` + tests
- `src/lib/ai/gateway.ts` + tests
- Any `src/lib/runner/tools/*` files that were kept as reference by H2 (the new tools live in `src/lib/managed-agents/tools/*`)
- Remove `src/lib/runner/tool-registry.ts` (the new registry lives in `src/lib/managed-agents/tools/index.ts`)

Schema migration for dropping `thread_queue_records` table: add a new migration under `supabase/migrations/` that does `DROP TABLE IF EXISTS thread_queue_records CASCADE;`. Write a migration test verifying the drop.

Remove Redis resumable stream infrastructure:
- Find sites that use `createResumableStreamContext` from `resumable-stream` package
- Remove `consumeSseStream` logic from the chat route
- Remove `REDIS_URL` only if nothing else uses it (rate limiting likely still uses it — CHECK with grep first)
- Remove `resumable-stream` from `package.json` if nothing else uses it

Run `pnpm test` after deletion. Any test that imports from deleted files will fail — update or delete those tests in this same commit.

### Part E — Delete Langfuse infrastructure (SEPARATE COMMIT)

Delete:
- `@langfuse/otel` and `@langfuse/tracing` from `package.json`
- `src/lib/eval/langfuse-api.ts`
- `langfuseSpanProcessor` and `registerLangfuseTracing` from `src/instrumentation.ts`
- `propagateAttributes` wrapper wherever it's called in the codebase (was primarily `src/lib/runner/run-agent.ts:396`, which is already deleted by Part D)
- `fetchTraceWithRetry` function from `src/lib/eval/run-evaluators.ts`
- The old Langfuse-observation overload of `extractToolSequence` (`extractToolSequenceFromObservations`) in `src/lib/eval/extract-tool-sequence.ts` — H3 kept it for back-compat, now delete it
- Any remaining `import ... from "@langfuse/..."` in the codebase

`src/instrumentation.ts` should still have Sentry but no more Langfuse — verify Sentry still initializes.

Remove Langfuse environment variables from `src/lib/env.ts` (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` if they exist).

Run `pnpm test` and `pnpm typecheck` after deletion. Any residual Langfuse imports will fail type checking.

### Part F — JIT UI smoke test

Per D3, the adapter's spec-fence rendering via `pipeJsonRender` is empirically unverified for burst-sized `agent.message` deltas. Include a task in the tasklist that:
1. Starts a local dev server with the new adapter wired in (no longer legacy runner)
2. Sends a prompt that is known to produce a spec fence response (e.g., "show me a bar chart of my deals by stage")
3. Verifies the browser renders the chart inline without flicker, partial renders, or parse errors
4. If broken: fall back to the pre-splitter path (use `splitTextAndSpecParts` from `src/lib/runner/message-utils.ts` before wrapping in `pipeJsonRender`). Document this in the tasklist as a conditional fallback step.
5. Last resort: cut JIT UI entirely (the agent's text output is still useful without rendered components)

This is a manual QA step, but the tasklist should document it as a mandatory gate before merging.

### Part G — Full integration test run

All 12 scenarios in the plan's "Integration Test Scenarios" section must pass manually before merging. Include them as an explicit checklist at the end of the tasklist:

1. Full chat round-trip
2. `run_sql` with RLS enforced (critical — this proves the custom tool pattern works for tenant isolation)
3. Approval flow (delete_records → approval card → approve → delete)
4. Trigger fire + persistence (H5 ships full trigger support, but you can smoke test with a manual trigger fire)
5. Disconnect recovery (reconnect backfill without dupes)
6. File upload mid-chat
7. `retries_exhausted` handling
8. Safety-gate evaluator fires correctly
9. Agent version pinning (bump version, verify in-flight session still uses old)
10. Cost tracking matches expected formula
11. Cross-tenant leak prevention (try to access another tenant's data via the agent)
12. Trigger `run_sql` rejection (N/A — triggers come in H5, you can skip this one)

Scenario 11 is the **most critical**: construct a scenario where the agent is prompted to "show me all contacts in the system" and verify that only the current user's contacts are returned. This validates the entire D9 architecture.

## Entry state (assume after H1, H2, H3)

- All schema in place
- Agent + environment live, env vars set
- All 38 custom tools ported + tested + CI lint passing
- Adapter + dispatcher + refactored evaluators exist in `src/lib/managed-agents/*`
- Old Langfuse-observation evaluator path still works (kept for back-compat)
- Legacy runner still handles production chat traffic
- Legacy runner test suite still passes

## Exit state

- `app/api/chat/route.ts` calls `runManagedAgent()` instead of `runAgent()`
- Legacy runner files all deleted
- `thread_queue_records` table dropped
- `@langfuse/*` packages removed from `package.json`
- `src/lib/eval/langfuse-api.ts` deleted
- `src/instrumentation.ts` still has Sentry but no Langfuse
- `/api/tool-confirm` and Telegram callback handlers route through `approval_events` → `user.tool_confirmation`
- File upload/download routes work via Anthropic Files API
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass
- All 12 integration scenarios manually verified (11 for this phase, scenario 12 deferred to H5)
- **Production chat traffic now flows through Managed Agents** — this is the go-live moment

## Key decisions that apply to your scope

- **D3** — JIT UI via `pipeJsonRender`. The smoke test (Part F) verifies this works with the new adapter output.
- **D4** — Drop Langfuse. Part E does the actual deletion.
- **D5** — Drop feature flag. No `RUNNER_ENGINE` env var. Single atomic PR. Rollback = `git revert`.
- **D6** — Telegram approvals via `approval_events` indirection. Part B wires this up.
- **D9** — All tools as custom tools. This is why the adapter (not an MCP client) is what gets wired in.

## Gotchas / non-negotiables

- **NO SCOPE CREEP.** This PR is already the largest in the migration (~50 files touched, ~2500 LOC deleted). Do not add "improvements" that weren't in the plan. If you notice something that could be better, write a follow-up ticket, don't bundle it.
- **Separate commits for wiring and deletion.** The PR is one logical unit but the commits should be reviewable individually:
  - Commit 1: Wire adapter into chat route
  - Commit 2: Update `/api/tool-confirm` route
  - Commit 3: Update Telegram callback handler
  - Commit 4: File upload/download API routes
  - Commit 5: JIT UI smoke test (manual step + any fallback code)
  - Commit 6: Delete legacy runner (one big delete commit)
  - Commit 7: Drop `thread_queue_records` table + remove resumable stream infra
  - Commit 8: Delete Langfuse infrastructure
  - Commit 9: Cleanup test failures after deletions
- **Run all 12 integration scenarios BEFORE opening the PR for review.** Document the results in the PR description.
- **The schema changes from H1 are already live.** Don't touch them. The only schema change in H4 is `DROP TABLE thread_queue_records`.
- **Rollback strategy:** `git revert <merge-commit>`. The schema columns added by H1 are additive and harmless if the legacy runner returns. The only destructive schema change in H4 is `DROP TABLE thread_queue_records` — have a backup or ensure it's truly unused before dropping.
- **Verify Sentry still works after deleting Langfuse.** Both share `src/instrumentation.ts`. Delete carefully.
- **Callback_data format is unchanged.** Don't touch `buildApprovalCallbackData` or `parseApprovalCallback` in `src/lib/channels/telegram/approvals.ts`. Only the backend handler changes.
- **Cross-tenant leak test (scenario 11) is the go/no-go gate.** If this test fails, the PR does not merge. This is the single most important verification because D9's entire security model depends on it.
- **Trigger fire path must be ported in this handover.** The cron scanner and trigger webhook endpoints currently call `runAgent()`. After H4 deletes `runAgent()`, they won't compile. You port the fire path here:
  1. Create disposable Anthropic session (pinned to `ANTHROPIC_AGENT_VERSION`)
  2. Send `user.message` event with the trigger instruction (existing logic reads `agent_triggers.instruction_path` from Supabase Storage)
  3. Store `session_id` on the `runs` row
  4. **Spawn the H5 `runTriggerAgent` Trigger.dev task:** `await runTriggerAgent.trigger({ runId, sessionId, clientId, threadId })`. This file is built in H5, so if H5 hasn't merged yet, import from a stub or coordinate the merge order (H4 + H5 can ship close together since H5 is a separate PR).
  5. Return 200 immediately (fire-and-forget)

**Critical coordination note:** The trigger listener task (`src/trigger/run-trigger-agent.ts`) is built in **H5**, not H4. H4's trigger fire path imports it. You have two options:
- **Option A (recommended):** Merge H5 first as a "Trigger.dev listener task only" PR (no fire-path wiring), then merge H4 which wires the fire path to spawn the H5 task. This means H5 ships in two smaller PRs — "listener infrastructure" first, then "polish" later.
- **Option B:** Stub the fire path in H4 with an inline TODO that throws "migrated in H5" — cron/webhook endpoints compile but trigger fires fail until H5 lands. Acceptable if H5 ships within hours of H4.

**Recommend Option A** — H5's listener task is small and self-contained; it can land before H4's atomic cutover. The sequencing is H1 → H2 → H3 → **H5 listener task only** → H4 (atomic cutover, imports H5's listener for fire path) → **H5 remainder** (debug-trace, settings UI, scores dashboard).

Include this in your tasklist as an explicit task: "Port trigger fire path to spawn Trigger.dev listener (imports `runTriggerAgent` from H5)."

## Output format reminder

Follow the tasklist generation rule in memory. Structure:

```markdown
# Managed Agents Migration — H4 Cutover ⚠️

**Goal:** [one sentence emphasizing atomic cutover]

**Architecture:** [2-3 sentences referencing D5 no-flag, D9 all-custom, rollback via git revert]

**Tech Stack:** [Anthropic SDK, Supabase, Telegram grammy]

**⚠️ RISK:** This is the atomic cutover PR. No feature flag. All 12 integration scenarios must pass before merge. Rollback via `git revert`.

## Relevant Files

### Modify
- `app/api/chat/route.ts`
- `app/api/tool-confirm/route.ts`
- [Telegram webhook handler path]
- `src/lib/channels/telegram/approvals.ts` (backend only — callback_data format unchanged)
- `src/instrumentation.ts`
- `package.json`
- `src/lib/env.ts`

### Delete
- `src/lib/runner/run-agent.ts`
- [full list of deletions]

### Create
- `app/api/sessions/[sessionId]/files/route.ts`
- New migration: `supabase/migrations/<timestamp>_drop_thread_queue_records.sql`

---

## Task 1: Wire adapter into chat route
...

## Task 2: Update /api/tool-confirm route
...

## Task N (final): Full integration scenario run — MANUAL GATE
...
```

Each bite-sized step must be 2-5 minutes of actual work. Write test code inline. For the deletion tasks, you don't need per-test steps — the tests are "run `pnpm test` and fix any import errors from deletions."

Commit messages use `feat(h4):`, `refactor(h4):`, `chore(h4):`.

## Scale estimate

- ~15 files modified
- ~25 files deleted (legacy runner + tests)
- ~5 files created (new API routes, migration)
- ~50 files touched total
- ~2500 LOC deleted, ~500 LOC changed

## One last thing

When you've generated the tasklist, end your response with:

> "Tasklist complete and saved to `docs/product/tasks/2026-04-10-managed-agents-h4-cutover-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint."

**Add an explicit warning in your response: "⚠️ This is the atomic cutover PR. Review the 12 integration scenarios before executing. Rollback is `git revert`."**

Then stop. Do not start implementing.
