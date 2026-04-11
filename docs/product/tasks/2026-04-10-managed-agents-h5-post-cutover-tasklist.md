# Managed Agents Migration — H5 Post-Cutover (TDD Tasklist)

> ## Status update 2026-04-11 — READ BEFORE EXECUTING
>
> **This tasklist was written assuming H5 starts from H4's exit state and builds the trigger listener from scratch. That is no longer true.** Tasks 1–8 already shipped as part of H4 + a follow-up fix commit today. Before you execute anything, read this section end-to-end so you don't rebuild what already exists.
>
> ### Current validation state (commit `4b1f3c5e` on `main`)
>
> ```
> pnpm exec tsc --noEmit  →  exit 0
> pnpm test               →  2426 passed / 38 skipped / 378 test files
> pnpm lint               →  exit 0
> ```
>
> `main` is 136 commits ahead of `origin/main` (unpushed) as of this writing. Do not rebase or force-push.
>
> Commit stack (most recent first):
>
> ```
> 4b1f3c5e fix(h4): wire approval resume + trigger persistence + 409 contract
> a9783c89 chore(h4): fix residual test failures after cutover
> 66feb3ad chore(h4): delete legacy runner, Langfuse, and stream infra
> 1959ddbe refactor(h4): trigger fire path spawns Trigger.dev listener
> 76142338 feat(h4): wire managed agents into chat and telegram
> c85acbea feat(h4): add managed-agent cutover support primitives
> ```
>
> The `fix(h4)` commit at the top is what closes the code review findings on H4. It is the reason `finalizeTriggerRun` actually persists output now (see the "What's already done" block below).
>
> Uncommitted work in the tree that is **NOT yours** and should be left alone:
> - `src/components/chat/tool-call-inline.tsx` (pre-existing local edit — note that Task 22 touches this same file, coordinate with the owner before you commit a rewrite on top)
> - `docs/product/tasks/2026-04-10-crm-guardrails-phase-1-tasklist.md`
> - `docs/tasks/2026-04-11-billing-page-tasklist.md`
> - `scripts/spike/managed-agents-custom-tool-spike.ts`
>
> ### What's already done (skip these tasks)
>
> | Tasklist tasks | What shipped | Where |
> |---|---|---|
> | **Tasks 1–3** — Per-trigger listener `runTriggerAgent` | `src/trigger/run-trigger-agent.ts` live, tests at `src/trigger/__tests__/run-trigger-agent.test.ts` pass. Uses `task()` (not `schedules.task()`), wraps `consumeAnthropicSession` with `isChatContext: false`, `autoDenyApprovals: true`, `persistIncrementally: true`. | Commit `76142338` / `1959ddbe` |
> | **Tasks 4–5** — `finalizeTriggerRun` helper | `src/lib/managed-agents/finalize-trigger-run.ts` live. **Its signature changed today** from `(supabase, runId, events, cost)` → `(supabase, { runId, threadId, clientId, events, cost })`. It now does the full persistence sequence: `buildAssistantPartsFromEvents` → `upsertMessage` (keyed on terminal event id) → `deliverToExternalChannels` → `completeRun` → `runEvaluatorsForEvents`. Tests at `src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts` pass. | Commit `4b1f3c5e` (today's fix) |
> | **Tasks 6–8** — Trigger fire path wiring | `src/lib/triggers/executor.ts` calls `spawnTriggerRun` (from `src/lib/managed-agents/spawn-trigger-run.ts`) which creates the Anthropic session, inserts the `runs` row, sends kickoff, and spawns `runTriggerAgent.trigger(...)`. `app/api/meetings/[id]/send-to-agent/route.ts` uses the same spawn path. Fire path is NOT stubbed — it works end-to-end. | Commit `1959ddbe` / `76142338` |
>
> **Related H4 review findings closed in commit `4b1f3c5e` that you should understand before touching adjacent code:**
> 1. `/api/tool-confirm` no longer requires UUID-shaped `approvalId` — accepts Anthropic `tu_*` / `toolu_*` ids directly.
> 2. Approval resume now runs through `resumeManagedAgentFromApproval` in `src/lib/managed-agents/adapter.ts`. It looks up `approval_events`, reuses the existing `run_id`, sends `user.tool_confirmation` via a new `kickoffApproval` option on `consumeAnthropicSession`, consumes the post-approval events, persists + delivers + completes the run. Shared with `runManagedAgent` via an internal `finalizeRun()` helper so the two paths can't drift.
> 3. Browser approval continuation (`/api/chat` with `approval-responded` parts), Telegram approval callbacks, and direct `/api/tool-confirm` callers all route through `resumeManagedAgentFromApproval`. The dead `patchApprovalPartState` wiring and the `resolve-approval` module were deleted.
> 4. `runManagedAgent` returns `{ status: "queued" }` on lock contention instead of throwing. `/api/chat` surfaces this as 409; the Telegram webhook drops the inbound message and logs a warning.
> 5. `finalizeTriggerRun` persistence — see above. This was the gap that would have made Task 9's integration tests fail even though the listener was wired.
>
> **Known "Important but not Critical" items from the review that are NOT fixed yet** (file separately if they bite you):
> - `resumeManagedAgentFromApproval` is not fully idempotent under concurrent resolves. The DB `UPDATE` is conditional on `status='pending'`, but two concurrent calls can both pass the initial lookup and both send `user.tool_confirmation` before either update lands. The Anthropic side's behavior on duplicate confirmation is unspecified — file a follow-up if you observe any anomaly in live use.
> - `spawnTriggerRun` inserts the `runs` row before the Trigger.dev task is enqueued. If the enqueue fails after insert, the row is stranded in `running` until `markStaleRunsFailed` sweeps it (15 min). Low-risk; recoverable.
> - Handover doc (`docs/product/plans/2026-04-10-managed-agents-h4-cutover-handover.md:23`) still says "rollback = git revert". That claim is now wrong because H4 shipped a destructive `20260410120000_drop_thread_queue_records.sql` migration. Revert would require re-applying the drop in reverse. Doc fix only.
>
> ### What's actually outstanding (execute these)
>
> Everything in the "Not done" column below is independent of everything else — nothing in this list blocks anything else in this list. **Ship each one as its own PR.** Do NOT bundle them into a single H5 megaPR. See the "Recommended PR decomposition" section below for the order I'd ship in.
>
> | Tasklist tasks | Status | Notes |
> |---|---|---|
> | **Task 9** — Listener integration test (idempotency, `retries_exhausted`, trigger `run_sql` auto-deny) | **Not done** | Listener code is live, but the integration test in this task is not. `finalizeTriggerRun` now persists output, so tests that assert "message row exists" will actually pass. |
> | **Tasks 10–11** — `scripts/managed-agents/rename-trigger-instruction-paths.ts` | **Not done** | Script doesn't exist. Code ships; operator runs it separately against prod. |
> | **Tasks 12–14** — `/debug-trace` skill port to `events.list()` | **Not done** — **currently broken** | `.claude/skills/debug-trace/SKILL.md` still invokes `npx langfuse-cli`. H4 ripped Langfuse out of the repo, so the skill silently no-ops or errors. **Highest priority** — fixing this unblocks any future debug session. |
> | **Tasks 15–18** — Settings UI for `client_profile` / `user_preferences` | **Not done** | Neither `app/(dashboard)/settings/agent-context/page.tsx` nor `app/api/settings/agent-context/route.ts` exists. Follow the existing settings-page pattern at `app/(dashboard)/settings/billing/page.tsx` and `app/(dashboard)/settings/page.tsx`. Plumbing is already wired: `app/api/chat/route.ts:242` pulls `client_profile` + `user_preferences` from the `clients` table and passes them into `runManagedAgent` as `clientProfile` / `userPreferences`. So your Settings UI just needs to read and write those two columns — no downstream changes required. |
> | **Tasks 19–20** — Admin scores dashboard | **Not done** | `app/(dashboard)/admin/scores/page.tsx` doesn't exist. The `app/(dashboard)/admin/` directory doesn't exist at all — you are creating the admin route group. `run_scores` table already has rows flowing in: evaluators run via `runEvaluatorsForEvents` (called by both `runManagedAgent` and `finalizeTriggerRun`) and write via `writeRunScore` at `src/lib/eval/run-scores-writer.ts`. Schema: `run_id`, `evaluator_name`, `score_type`, `score_value`, `comment`, `created_at`. |
> | **Task 21** — Custom Skills API migration | **SKIP unless you see clients with `/agent/skills/*/SKILL.md` files in Supabase Storage.** YAGNI otherwise. | — |
> | **Task 22** — Connection tool naming alignment | **Smaller than the tasklist says.** Only two concrete edits. | The managed-agents tools are **already named correctly**: `src/lib/managed-agents/tools/connections/list-connections.ts:11` and `src/lib/managed-agents/tools/browser-side/create-connection.ts:25`. The stale names live in exactly two places: (1) `src/lib/ai/system-prompt.ts` (a legacy file that is only imported by its own test file — nothing at runtime uses it; safe to delete the whole file + its test), and (2) `src/components/chat/tool-call-inline.tsx:110` (UI rendering map — one-line rename from `create_new_connections` to `create_connection`). **NO agent version bump is needed.** The runtime "system prompt" is assembled in `src/lib/managed-agents/session-kickoff.ts::buildKickoffText` and `src/lib/runner/system-reminder.ts`, neither of which contains the stale names. The Anthropic agent's own system prompt is a placeholder from `scripts/managed-agents/create-agent.ts` and does not need to change. The tasklist text at Task 22 that says "bump `ANTHROPIC_AGENT_VERSION`" is obsolete — ignore it. **Caveat:** `src/components/chat/tool-call-inline.tsx` has an uncommitted edit in the working tree — check with whoever owns that before committing your rename on top. |
> | **Task 23** — Integration Scenario 12 manual verification | **Not done; operator task.** Needs a running dev env, a temporarily-inserted `agent_triggers` row, and live trigger fire. Gate this on the Task 9 integration tests passing first — those should catch the logic errors without needing a live session. | — |
> | **Task 24** — Final typecheck/lint/test | **Not done; runs at the end of whichever PR ships.** Not a single-PR thing. | — |
>
> ### Recommended PR decomposition (one PR per row)
>
> | # | Scope | Why ship in this order |
> |---|---|---|
> | **1** | `/debug-trace` skill port — Tasks 12, 13, 14 | Unblocks future debug sessions. The current skill is broken. Small (~200 LOC script + SKILL.md rewrite + tests). No operational coordination needed. |
> | **2** | Connection tool naming alignment — Task 22 | Mechanical. Deletes the stale `src/lib/ai/system-prompt.ts` + test, fixes one line in `tool-call-inline.tsx`. ~20 LOC. Coordinate with the owner of the uncommitted `tool-call-inline.tsx` edit first. |
> | **3** | Settings UI for `client_profile` / `user_preferences` — Tasks 15, 16, 17, 18 | Self-contained. API route + page + tests. Plumbing already wired through the chat route — this is a pure CRUD surface over two DB columns. ~300 LOC. |
> | **4** | Admin scores dashboard — Tasks 19, 20 | Self-contained. Creates new admin route group, query helper, page. ~300 LOC. Read-only; no schema changes. |
> | **5** | Listener integration test + rename script — Tasks 9, 10, 11 | Test-heavy. Integration test uses mocked `consumeAnthropicSession` per Task 9's structure. Rename script is small. |
> | **6** | Scenario 12 verification + final checks — Tasks 23, 24 | Manual operator gate + repo hygiene. Not a code PR — it's a verification + sign-off pass. Do this AFTER PR 5 merges so the integration test has already exercised the auto-deny path in isolation. |
>
> Each PR is independent. You can ship them in any order if priorities change, but the order above minimizes risk (broken tool first, mechanical cleanup next, then larger feature work, then tests, then manual verification).
>
> ### Key codebase surfaces the dev should know about
>
> - **`src/lib/managed-agents/adapter.ts`** — `runManagedAgent` (fresh turn) and `resumeManagedAgentFromApproval` (post-approval re-entry). Shared `finalizeRun()` helper is private to this file. Do not duplicate this helper elsewhere; if you need to finalize from a new entry point, import `consumeAnthropicSession` and call into the adapter.
> - **`src/lib/managed-agents/session-runner.ts`** — `consumeAnthropicSession()`. Accepts `kickoffMessage` (fresh turn), `kickoffApproval` (approval resume, added by commit `4b1f3c5e`), `autoDenyApprovals` (trigger mode), `persistIncrementally` (no-op today — the persistence callbacks aren't wired yet; documented as a future hook in `types.ts`). Do not add custom retry logic — let Trigger.dev + the reconnect pattern handle it.
> - **`src/lib/managed-agents/finalize-trigger-run.ts`** — trigger-run terminal finalization. Takes `{ runId, threadId, clientId, events, cost }` (note: this signature changed today — older references to the `(supabase, runId, events, cost)` shape are stale).
> - **`src/trigger/run-trigger-agent.ts`** — Trigger.dev task. Uses `createAdminClient()` for service-role Supabase.
> - **`src/lib/triggers/executor.ts`** — trigger fire path dispatcher. Returns `ExecuteTriggerResult.status: "completed" | "failed" | "claim_mismatch" | "queued" | "skipped_busy"`.
> - **`src/lib/managed-agents/spawn-trigger-run.ts`** — creates the Anthropic session, inserts the `runs` row, sends kickoff, enqueues `runTriggerAgent.trigger(...)`. This is where the "Important" stranded-row failure mode lives if the enqueue fails.
> - **`src/lib/eval/run-scores-writer.ts`** — `writeRunScore(supabase, runId, { evaluator_name, score_type, score_value, comment? })`. Powers the scores dashboard.
> - **`src/lib/eval/run-evaluators.ts`** — `runEvaluatorsForEvents(events, runId, supabase, { conversationInput })`. Called from both `runManagedAgent`'s `finalizeRun` and `finalizeTriggerRun`.
> - **`src/lib/chat/messages.ts::upsertMessage`** — keyed on `source_event_id`. Idempotency safety net for retries.
> - **`src/lib/channels/deliver.ts::deliverToExternalChannels`** — pushes finalized assistant parts to Telegram (and eventually WhatsApp). Called from `finalizeRun` + `finalizeTriggerRun`. Failure is logged but non-fatal.
> - **`app/api/chat/route.ts`** — approval continuation branch at around L270 routes through `resumeManagedAgentFromApproval`. Fresh turn branch at around L320 handles the `{ status: "queued" }` return shape. Do not re-introduce `patchApprovalPartState`.
> - **`app/api/tool-confirm/route.ts`** — direct API entry point for approvals. Drains the resume stream in `next/server` `after()` so direct API callers still get the run finalized. `approvalId` is any non-empty string, not a UUID.
> - **`app/api/webhook/telegram/route.ts`** — Telegram callback approval flow calls `resumeManagedAgentFromApproval` inline and drains the stream. Inline drain (not `after()`) is intentional so external-channel delivery happens before the webhook responds.
>
> ### Gotchas the dev must understand
>
> 1. **The `selectedChatModel` request body field is a relic.** `app/api/chat/route.ts` still accepts and validates it against `allowedModelIds`, but the model is now pinned by `ANTHROPIC_AGENT_VERSION`. Do not remove the field in this PR set — it's a documented follow-up cleanup, out of scope for H5.
> 2. **`src/lib/ai/system-prompt.ts` is stale** — the live "system prompt" is assembled at runtime by `session-kickoff.ts::buildKickoffText` (profile + preferences + system reminder + user message), and the Anthropic agent has a placeholder system prompt from H1. Deleting `system-prompt.ts` is part of Task 22, not scope creep.
> 3. **Trigger runs now persist via `deliverToExternalChannels`**, which means Telegram will receive the final assistant message of an autopilot run the same way chat does. If you're manually testing and see duplicate Telegram messages, that is why.
> 4. **`source_event_id`-keyed upserts are the ONLY idempotency mechanism on `conversation_messages`.** Do not add a second one. Do not remove the unique index.
> 5. **Service-role Supabase in the trigger listener means tools MUST include an explicit `.eq("client_id", clientId)` filter** — the H2 CI lint at `scripts/lint-tool-tenant-filter.ts` enforces this. If you add a new tool that touches a CRM table without that filter, CI will fail.
> 6. **The managed-agents tool registry in `src/lib/managed-agents/tools/index.ts` is the source of truth for tool names.** If you see a stale tool name anywhere (docs, tests, UI rendering), cross-check against `src/lib/managed-agents/tools/*` before assuming it's wrong — the registry is authoritative.
> 7. **Trigger instruction paths** — current code reads from Supabase Storage at a path derived from `agent_triggers.instruction_path`. The rename script in Tasks 10–11 is a one-off data migration; it does NOT require any code changes to support the new prefix because `instruction_path` is stored verbatim per-row. The script updates the column value as part of its work.
> 8. **Do NOT delete idle Anthropic sessions after a run.** They are free per pricing. Every H5 task tempts you to add a cleanup cron — don't. Documented follow-up.
> 9. **Settings UI input length cap is 100k chars per field**, not per request. The cap exists because the profile/preferences text is embedded in every kickoff message to the agent.
> 10. **Scores dashboard is internal-only.** Gate with a quick check against the user's email or a hard-coded admin allowlist — don't over-engineer an RBAC system. Admin gating abstraction is a documented follow-up.
>
> ### What "done" looks like per PR
>
> Every PR in the decomposition above must:
>
> - Add/update Vitest tests for the code it touches.
> - Pass `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm lint` cleanly.
> - Use the commit prefixes `feat(h5):` / `refactor(h5):` / `chore(h5):` / `test(h5):` as the tasklist specifies.
> - NOT touch `src/lib/managed-agents/adapter.ts` unless you're fixing a bug you observed there. The adapter just landed a major refactor in `4b1f3c5e`; leave it alone.
> - NOT reintroduce Langfuse references. The search string `langfuse` should return zero hits in `src/` after your PR merges (already the case as of `66feb3ad`).
>
> ---
>
> **Everything below this line is the original H5 tasklist as written on 2026-04-10. Read it for the TDD task structure on the remaining items, but use the status table above as the authoritative "is this done" signal.**
>
> ---

**Handover:** (H5 handover prompt, 2026-04-10)
**Plan:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md`
**Decisions in scope:** D4 (Langfuse replaced by `events.list()` + `run_scores`), D6 (approvals background — auto-deny in trigger context), D9 (all tools custom, shared dispatcher chat + trigger)

**Goal:** Complete the Managed Agents migration with a real-time per-trigger Trigger.dev listener task (no polling), port the `/debug-trace` skill to `events.list()`, ship the settings UI for `client_profile` / `user_preferences`, ship an admin scores dashboard, rename trigger instruction paths, optionally migrate custom skills, and align connection tool naming.

**Architecture:** The listener is a Trigger.dev `task()` (not a `schedules.task()`) spawned from the trigger fire path. It wraps the H3 session-runner core (`src/lib/managed-agents/session-runner.ts`) with trigger-specific context: service-role Supabase, `isChatContext: false`, `autoDenyApprovals: true`, `persistIncrementally: true`. Event loop, dispatch, terminal gate, and reconnect on retry all live in H3. The listener is a thin wrapper + finalization hook. Wall-clock behavior mirrors chat runs — tools dispatch immediately, messages persist as they arrive.

**Tech Stack:** `@trigger.dev/sdk/v3`, `@anthropic-ai/sdk` (beta managed agents), Supabase (service role for background tasks), ShadCN (settings UI + admin dashboard), Next.js App Router, Vitest.

**Design / review inputs:**
- H5 handover prompt (architecture section — "Why not a polling cron")
- `claude-api` skill — `shared/managed-agents-events.md`, `shared/managed-agents-client-patterns.md` §1 (reconnect), §5 (terminal gate), `shared/managed-agents-api-reference.md` (`events.list`, `sessions.events.stream`, `sessions.events.send`)
- H3 deliverables: `src/lib/managed-agents/session-runner.ts`, `dispatcher.ts`, `adapter.ts`, `src/lib/eval/extract-tool-sequence.ts` (Event[] overload), `src/lib/eval/run-scores-writer.ts`
- Existing Trigger.dev pattern: `trigger.config.ts`, `src/trigger/scan-triggers.ts`
- Plan Phase 3 (triggers — but H5 replaces polling cron with listener; underlying requirements are the same) and Phase 4 (polish)

**⚠️ CRITICAL REMINDERS:**
- **Do NOT reimplement event translation, tool dispatch, or terminal-gate logic.** Import from `@/lib/managed-agents/session-runner` — that core was built by H3 specifically so chat and triggers share it.
- **Listener uses `task()` not `schedules.task()`** — it is programmatically triggered from the fire path, not cron-scheduled.
- **Service-role Supabase** in listener context. No user cookies. H2's CI lint (`.eq("client_id", clientId)`) is the tenant-isolation primary defense.
- **Trigger.dev retries are automatic.** Let the session-runner's reconnect pattern (skill §1) handle re-entering a session transparently. Do NOT add custom retry logic.
- **`source_event_id` unique index** is the idempotency safety net. Use `upsert({...}, { onConflict: "thread_id,source_event_id", ignoreDuplicates: true })`.
- **Do NOT delete idle sessions** after finalization. They are free per pricing. Cleanup cron is out of scope for H5.
- **Scenario 12 (trigger `run_sql` rejection) is the go/no-go gate.** H5 does not ship without it passing.
- **Settings input length capped at 100k chars** to avoid Anthropic request-size issues.
- **No scope creep.** If you notice follow-up work, document it at the end of this file, not as a new task.

**Commit prefix:** `feat(h5):` for new files, `refactor(h5):` for modifications, `chore(h5):` for deletions/migrations, `test(h5):` for test-only commits.

**Entry state (assume after H1 + H2 + H3 + H4):**
- Managed Agents runs production chat traffic (H4 shipped)
- Legacy runner deleted
- Langfuse deleted
- `src/lib/managed-agents/session-runner.ts` exists as a reusable core with callback interface (H3)
- `src/lib/managed-agents/adapter.ts` wraps the core for chat (H3)
- `src/lib/managed-agents/dispatcher.ts` live with `isChatContext` flag (H3)
- `src/lib/managed-agents/tools/*` — all 38 custom tool factories + CI lint (H2)
- Evaluators refactored to read `Event[]` and write to `run_scores` (H3)
- `approval_events` has `session_id` + `tool_use_id` columns (H1)
- Trigger.dev already integrated: `trigger.config.ts` with `maxDuration: 3600`, `src/trigger/scan-triggers.ts`, `TRIGGER_SECRET_KEY` env var
- H4 has ported (or stubbed) the trigger fire path to spawn a Trigger.dev task (Task 2 confirms which)

**Exit state:**
- `src/trigger/run-trigger-agent.ts` live: triggers fire, Trigger.dev task consumes Anthropic session in real-time, tools dispatch immediately, messages persist incrementally, runs finalize on terminal state — **wall-clock behavior is comparable to chat runs (no polling lag)**
- Trigger instruction paths renamed from `/agent/subagents/` to `/agent/triggers/`
- `/debug-trace` skill works against Managed Agents `events.list()` (no Langfuse)
- Settings UI shipped at `app/(dashboard)/settings/agent-context/page.tsx` + API route
- Scores dashboard shows safety-gate and crm-hallucination trends at `app/(dashboard)/admin/scores/page.tsx`
- Custom Skills API migrated (conditional — only if existing clients have `/agent/skills/*/SKILL.md` files) or documented as skipped
- Connection tool names aligned (`list_connections`, `create_connection`)
- Integration Scenario 12 verified end-to-end
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass

---

## Relevant Files

### Create
- `src/trigger/run-trigger-agent.ts` — Trigger.dev `task()` (the listener)
- `src/trigger/__tests__/run-trigger-agent.test.ts`
- `src/lib/managed-agents/finalize-trigger-run.ts` — terminal-state finalization helper
- `src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts`
- `scripts/managed-agents/rename-trigger-instruction-paths.ts`
- `scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test.ts`
- `scripts/debug-trace/fetch-events.ts`
- `scripts/debug-trace/__tests__/fetch-events.test.ts`
- `app/api/settings/agent-context/route.ts`
- `app/api/settings/agent-context/__tests__/route.test.ts`
- `app/(dashboard)/settings/agent-context/page.tsx`
- `app/(dashboard)/settings/agent-context/page.test.tsx`
- `app/(dashboard)/admin/scores/page.tsx`
- `app/(dashboard)/admin/scores/page.test.tsx`
- `src/lib/admin/scores-query.ts` — query helper for the dashboard
- `src/lib/admin/__tests__/scores-query.test.ts`

### Modify
- `.claude/skills/debug-trace/SKILL.md` — port from Langfuse to events.list
- `app/api/cron/scan/route.ts` — complete trigger fire path if H4 stubbed
- `app/api/cron/scan/__tests__/route.test.ts`
- `app/api/trigger/webhook/[triggerId]/route.ts` — complete trigger fire path if H4 stubbed
- `app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts`
- `src/lib/triggers/executor.ts` (or wherever H4 left the fire helper)
- `src/components/chat/tool-call-inline.tsx` — connection tool naming
- `scripts/managed-agents/create-agent.ts` — include custom skills in agent config (Task 9, conditional)
- `.env.local.example` / `src/lib/env.ts` — bump `ANTHROPIC_AGENT_VERSION` after Task 9/10 agent updates

### Delete (conditional)
- `src/lib/runner/skills/discover-skills.ts` — only if H4 did not already delete it (verify in Task 9)
- `.claude/skills/debug-trace/fetch-trace.sh` or similar legacy helper (if it exists alongside SKILL.md)

---

## Task 1: Per-trigger listener task — failing test first

**Files:**
- Create: `src/trigger/__tests__/run-trigger-agent.test.ts`

### Step 1: Draft the listener test

Write a test that imports the not-yet-existing `runTriggerAgent` task and asserts it calls `consumeAnthropicSession` with `isChatContext: false`, `autoDenyApprovals: true`, `persistIncrementally: true`, and invokes `finalizeTriggerRun` on terminal state.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeAnthropicSession = vi.fn();
const finalizeTriggerRun = vi.fn();
const createAdminClient = vi.fn().mockResolvedValue({ __role: "service" });

vi.mock("@/lib/managed-agents/session-runner", () => ({
  consumeAnthropicSession,
}));
vi.mock("@/lib/managed-agents/finalize-trigger-run", () => ({
  finalizeTriggerRun,
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient,
}));

// Re-import after mocks
import { runTriggerAgent } from "../run-trigger-agent";

describe("runTriggerAgent (Trigger.dev task)", () => {
  beforeEach(() => {
    consumeAnthropicSession.mockReset();
    finalizeTriggerRun.mockReset();
  });

  it("invokes the session runner with trigger-context flags", async () => {
    consumeAnthropicSession.mockResolvedValue({
      status: "complete",
      events: [{ id: "evt_1", type: "agent.message" }],
      cost: { inputTokens: 100, outputTokens: 50, runtimeSeconds: 12 },
    });

    await runTriggerAgent.run(
      {
        runId: "run_1",
        sessionId: "session_1",
        clientId: "client_1",
        threadId: "thread_1",
      },
      { ctx: {} as never },
    );

    expect(consumeAnthropicSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session_1",
        context: expect.objectContaining({
          supabase: { __role: "service" },
          clientId: "client_1",
          threadId: "thread_1",
          isChatContext: false,
        }),
        autoDenyApprovals: true,
        persistIncrementally: true,
      }),
    );
  });

  it("calls finalizeTriggerRun via the onTerminal callback", async () => {
    let capturedOnTerminal: ((events: unknown[], cost: unknown) => Promise<void>) | null = null;
    consumeAnthropicSession.mockImplementation(async (opts: { onTerminal?: (events: unknown[], cost: unknown) => Promise<void> }) => {
      capturedOnTerminal = opts.onTerminal ?? null;
      await capturedOnTerminal?.(
        [{ id: "evt_1" }],
        { inputTokens: 100, outputTokens: 50, runtimeSeconds: 12 },
      );
      return { status: "complete" };
    });

    await runTriggerAgent.run(
      { runId: "run_1", sessionId: "session_1", clientId: "client_1", threadId: "thread_1" },
      { ctx: {} as never },
    );

    expect(finalizeTriggerRun).toHaveBeenCalledWith(
      { __role: "service" },
      "run_1",
      [{ id: "evt_1" }],
      { inputTokens: 100, outputTokens: 50, runtimeSeconds: 12 },
    );
  });

  it("re-throws so Trigger.dev retries when the core errors", async () => {
    consumeAnthropicSession.mockRejectedValue(new Error("stream failed"));
    await expect(
      runTriggerAgent.run(
        { runId: "run_1", sessionId: "session_1", clientId: "client_1", threadId: "thread_1" },
        { ctx: {} as never },
      ),
    ).rejects.toThrow("stream failed");
    expect(finalizeTriggerRun).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run the test

```bash
pnpm vitest run src/trigger/__tests__/run-trigger-agent.test.ts
```

Expected: **FAIL** — `run-trigger-agent.ts` does not exist yet.

---

## Task 2: Implement `runTriggerAgent`

**Files:**
- Create: `src/trigger/run-trigger-agent.ts`

### Step 1: Write the listener task

```typescript
/**
 * Per-trigger listener task. Runs when a trigger fires, consumes the
 * Anthropic session event stream in real-time via the H3 session runner,
 * dispatches custom tools immediately, persists messages incrementally,
 * and finalizes the run on terminal state.
 *
 * Architecturally identical to a chat run with a no-op output sink.
 * Same session-runner core as the chat adapter; only the context flags differ.
 *
 * @module src/trigger/run-trigger-agent
 */
import { logger, task } from "@trigger.dev/sdk/v3";

import { consumeAnthropicSession } from "@/lib/managed-agents/session-runner";
import { finalizeTriggerRun } from "@/lib/managed-agents/finalize-trigger-run";
import { createAdminClient } from "@/lib/supabase/server";

type RunTriggerAgentPayload = {
  runId: string;
  sessionId: string;
  clientId: string;
  threadId: string;
};

export const runTriggerAgent = task({
  id: "run-trigger-agent",
  // Matches trigger.config.ts default. Longer than any realistic trigger run.
  maxDuration: 3600,
  run: async (payload: RunTriggerAgentPayload) => {
    const supabase = await createAdminClient();

    logger.info("Trigger run starting", {
      runId: payload.runId,
      sessionId: payload.sessionId,
    });

    const result = await consumeAnthropicSession({
      sessionId: payload.sessionId,
      context: {
        supabase,
        clientId: payload.clientId,
        threadId: payload.threadId,
        // Rejects chat-only tools (run_sql, get_agent_db_schema,
        // ask_user_question, create_connection, reauthorize_connection).
        isChatContext: false,
      },
      // Trigger-specific overrides — enforced by the session-runner core.
      autoDenyApprovals: true,
      // Stream persistence so users watching the run detail page see live updates.
      persistIncrementally: true,
      onTerminal: async (events, cost) => {
        await finalizeTriggerRun(supabase, payload.runId, events, cost);
      },
    });

    logger.info("Trigger run completed", {
      runId: payload.runId,
      status: result.status,
    });

    return result;
  },
});
```

### Step 2: Rerun the Task 1 test

```bash
pnpm vitest run src/trigger/__tests__/run-trigger-agent.test.ts
```

Expected: **PASS**.

### Step 3: Commit

```bash
git add src/trigger/run-trigger-agent.ts src/trigger/__tests__/run-trigger-agent.test.ts
git commit -m "feat(h5): per-trigger listener task wrapping session runner"
```

---

## Task 3: Verify `consumeAnthropicSession` signature and trigger-context flags

**Files:** read-only grep

### Step 1: Confirm the H3 core exposes the options used above

```bash
rg -n "consumeAnthropicSession|autoDenyApprovals|persistIncrementally|isChatContext|onTerminal" src/lib/managed-agents/session-runner.ts
```

Expected:
- The function accepts `{ sessionId, context: { supabase, clientId, threadId, isChatContext }, autoDenyApprovals, persistIncrementally, onTerminal }`.
- The dispatcher reads `context.isChatContext` and rejects chat-only tools when `false`.
- The `onTerminal` callback fires on `session.status_idle` with `end_turn` OR `retries_exhausted` (so the finalize helper sees both states) OR `session.status_terminated`.

### Step 2: If the core is missing any of these, open a follow-up ticket

Do NOT modify `session-runner.ts` in H5 unless it blocks the listener. Note the gap in the follow-up section at the bottom of this tasklist and coordinate with whoever owns H3.

### Step 3: Confirm the dispatcher enforces `isChatContext: false`

```bash
rg -n "isChatContext|chatOnly" src/lib/managed-agents/dispatcher.ts
```

Expected: the dispatcher rejects tools flagged `chatOnly: true` when `context.isChatContext === false` with the error `"Tool not available in trigger runs. Use search_crm instead."`. If the error copy differs, use whatever H3/H2 shipped.

---

## Task 4: `finalizeTriggerRun` helper — failing test

**Files:**
- Create: `src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const extractToolSequenceFromEvents = vi.fn();
const evaluateSafetyGate = vi.fn();
const evaluateCrmHallucination = vi.fn();
const writeRunScore = vi.fn();

vi.mock("@/lib/eval/extract-tool-sequence", () => ({ extractToolSequenceFromEvents }));
vi.mock("@/lib/eval/safety-gate-eval", () => ({ evaluateSafetyGate }));
vi.mock("@/lib/eval/crm-hallucination-eval", () => ({ evaluateCrmHallucination }));
vi.mock("@/lib/eval/run-scores-writer", () => ({ writeRunScore }));

import { finalizeTriggerRun } from "../finalize-trigger-run";

function mockSupabase() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return {
    from: vi.fn().mockReturnValue({ update }),
    __update: update,
  } as never;
}

describe("finalizeTriggerRun", () => {
  beforeEach(() => {
    extractToolSequenceFromEvents.mockReset().mockReturnValue([{ tool: "search_crm" }]);
    evaluateSafetyGate.mockReset().mockReturnValue({ pass: true, comment: "clean" });
    evaluateCrmHallucination.mockReset().mockReturnValue({ pass: false, comment: "hallucinated" });
    writeRunScore.mockReset().mockResolvedValue(undefined);
  });

  it("updates the runs row with cost breakdown + marks complete", async () => {
    const supabase = mockSupabase();
    await finalizeTriggerRun(
      supabase,
      "run_1",
      [{ id: "evt_1" }],
      { inputTokens: 100_000, outputTokens: 10_000, runtimeSeconds: 60 },
    );

    // cost_usd = (100_000 × 3 + 10_000 × 15) / 1_000_000 + (60 / 3600) × 0.08
    const expectedCost =
      (100_000 * 3 + 10_000 * 15) / 1_000_000 + (60 / 3600) * 0.08;

    expect((supabase as unknown as { __update: ReturnType<typeof vi.fn> }).__update).toHaveBeenCalledWith({
      status: "complete",
      tokens_in: 100_000,
      tokens_out: 10_000,
      cost_usd: expectedCost,
    });
  });

  it("writes both safety-gate and crm-hallucination scores", async () => {
    const supabase = mockSupabase();
    await finalizeTriggerRun(
      supabase,
      "run_1",
      [{ id: "evt_1" }],
      { inputTokens: 0, outputTokens: 0, runtimeSeconds: 0 },
    );

    expect(writeRunScore).toHaveBeenCalledWith(
      supabase,
      "run_1",
      expect.objectContaining({ evaluator_name: "safety-gate", score_value: 1, comment: "clean" }),
    );
    expect(writeRunScore).toHaveBeenCalledWith(
      supabase,
      "run_1",
      expect.objectContaining({ evaluator_name: "crm-hallucination", score_value: 0, comment: "hallucinated" }),
    );
  });
});
```

### Step 2: Run the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts
```

Expected: **FAIL** — module not found.

---

## Task 5: Implement `finalizeTriggerRun`

**Files:**
- Create: `src/lib/managed-agents/finalize-trigger-run.ts`

### Step 1: Write the helper

```typescript
/**
 * Terminal-state finalization for trigger runs. Called by `runTriggerAgent`
 * when the session-runner reports a terminal state (end_turn / retries_exhausted
 * / session.terminated). Updates the runs row, runs evaluators in-process,
 * and persists scores to `run_scores`.
 *
 * Incremental message persistence is handled by the session-runner during
 * event consumption — this helper only persists the final run-level state.
 *
 * @module src/lib/managed-agents/finalize-trigger-run
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { extractToolSequenceFromEvents } from "@/lib/eval/extract-tool-sequence";
import { evaluateSafetyGate } from "@/lib/eval/safety-gate-eval";
import { evaluateCrmHallucination } from "@/lib/eval/crm-hallucination-eval";
import { writeRunScore } from "@/lib/eval/run-scores-writer";

// Pricing constants per plan/D4: Sonnet 4.6 input/output + active-seconds compute.
const INPUT_TOKEN_PRICE = 3 / 1_000_000; // $3 per MTok
const OUTPUT_TOKEN_PRICE = 15 / 1_000_000; // $15 per MTok
const ACTIVE_SECONDS_PRICE = 0.08 / 3600; // $0.08 per compute-hour

type TerminalCost = {
  inputTokens: number;
  outputTokens: number;
  runtimeSeconds: number;
};

export async function finalizeTriggerRun(
  supabase: SupabaseClient<Database>,
  runId: string,
  events: unknown[],
  cost: TerminalCost,
): Promise<void> {
  const costUsd =
    cost.inputTokens * INPUT_TOKEN_PRICE +
    cost.outputTokens * OUTPUT_TOKEN_PRICE +
    cost.runtimeSeconds * ACTIVE_SECONDS_PRICE;

  await supabase
    .from("runs")
    .update({
      status: "complete",
      tokens_in: cost.inputTokens,
      tokens_out: cost.outputTokens,
      cost_usd: costUsd,
    })
    .eq("run_id", runId);

  const toolSequence = extractToolSequenceFromEvents(events as never);
  const safetyResult = evaluateSafetyGate(toolSequence);
  const crmResult = evaluateCrmHallucination(toolSequence);

  await writeRunScore(supabase, runId, {
    evaluator_name: "safety-gate",
    score_type: "boolean",
    score_value: safetyResult.pass ? 1 : 0,
    comment: safetyResult.comment,
  });
  await writeRunScore(supabase, runId, {
    evaluator_name: "crm-hallucination",
    score_type: "boolean",
    score_value: crmResult.pass ? 1 : 0,
    comment: crmResult.comment,
  });
}
```

### Step 2: Rerun the Task 4 test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts
```

Expected: **PASS**.

### Step 3: Commit

```bash
git add src/lib/managed-agents/finalize-trigger-run.ts src/lib/managed-agents/__tests__/finalize-trigger-run.test.ts
git commit -m "feat(h5): finalize-trigger-run helper persists cost + scores"
```

---

## Task 6: Audit the trigger fire path (what H4 left behind)

**Files:** read-only grep

### Step 1: Find the current fire helper

```bash
rg -n "sessions\.create|events\.send.*user\.message|runs.*insert" app/api/cron/scan app/api/trigger/webhook src/lib/triggers
```

### Step 2: Classify the state

Record in your working notes which of these is true (pick one):

1. **H4 complete:** Fire path creates the Anthropic session, sends `user.message`, stores `session_id` on `runs`, and spawns a Trigger.dev task (possibly a stub). Verify whether it spawns `runTriggerAgent` or a polling cron placeholder.
2. **H4 stubbed:** Fire path creates the session but does NOT spawn any background task (dry merge that assumed H5 would finish wiring).
3. **H4 legacy:** Fire path still uses the legacy runner (should NOT be possible after H4 — flag as a regression).

### Step 3: If (1) but the spawn points at the wrong task, go to Task 7

### Step 4: If (2), go to Task 7

### Step 5: If (3), stop and escalate — this is an H4 merge problem, not an H5 task

---

## Task 7: Wire the fire path to spawn `runTriggerAgent` — failing test

**Files:**
- Modify: `app/api/cron/scan/__tests__/route.test.ts` (or wherever the fire-path test lives)
- Modify: `app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts`

### Step 1: Add an assertion that the fire path spawns the task

In the existing cron-scan / webhook test, add:

```typescript
const triggerSpawn = vi.fn().mockResolvedValue({ id: "trig_run_1" });
vi.mock("@/trigger/run-trigger-agent", () => ({
  runTriggerAgent: { trigger: triggerSpawn },
}));

// ... inside an existing test or a new one:
it("spawns runTriggerAgent after creating the Anthropic session", async () => {
  // ... existing setup that fires a due trigger ...

  expect(triggerSpawn).toHaveBeenCalledWith({
    runId: expect.any(String),
    sessionId: expect.any(String),
    clientId: expect.any(String),
    threadId: expect.any(String),
  });
});
```

### Step 2: Run the test

```bash
pnpm vitest run app/api/cron/scan/__tests__/route.test.ts app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts
```

Expected: **FAIL** — fire path does not spawn the task (if H4 stubbed) or spawns the wrong task (if H4 pointed at a placeholder).

---

## Task 8: Complete the fire path

**Files:**
- Modify: `src/lib/triggers/executor.ts` (or the H4 fire helper)
- Modify: `app/api/cron/scan/route.ts` (only if it imports the fire helper directly)
- Modify: `app/api/trigger/webhook/[triggerId]/route.ts`

### Step 1: Import `runTriggerAgent`

```typescript
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
```

### Step 2: After session creation + `user.message` send + `runs` row insert, spawn the task

```typescript
// Existing H4 code:
const session = await anthropic.beta.sessions.create({
  agent: { type: "agent", id: process.env.ANTHROPIC_AGENT_ID!, version: Number(process.env.ANTHROPIC_AGENT_VERSION!) },
  environment_id: process.env.ANTHROPIC_ENVIRONMENT_ID!,
});
await anthropic.beta.sessions.events.send(session.id, {
  events: [{ type: "user.message", content: [{ type: "text", text: instruction }] }],
});
const { data: run } = await supabase
  .from("runs")
  .insert({ client_id: clientId, thread_id: threadId, session_id: session.id, status: "running", trigger_type: "cron" })
  .select()
  .single();

// NEW in H5:
await runTriggerAgent.trigger({
  runId: run.run_id,
  sessionId: session.id,
  clientId: run.client_id,
  threadId: run.thread_id,
});

return Response.json({ status: "queued" }, { status: 200 });
```

### Step 3: Delete any H4 polling-cron stub left behind

If H4 created `app/api/cron/poll-trigger-runs/route.ts` as a placeholder, delete it now — the listener replaces it.

```bash
rg -l "poll-trigger-runs" app/api src/lib
```

For each match: delete the route file and remove the `vercel.json` cron entry. Add the deletions to the same commit as the fire-path wiring so rollback is atomic.

### Step 4: Rerun the Task 7 tests

```bash
pnpm vitest run app/api/cron/scan/__tests__/route.test.ts app/api/trigger/webhook/[triggerId]/__tests__/route.test.ts
```

Expected: **PASS**.

### Step 5: Commit

```bash
git add app/api/cron/scan src/lib/triggers app/api/trigger/webhook
# plus any deletion of app/api/cron/poll-trigger-runs
git commit -m "feat(h5): fire path spawns runTriggerAgent; drop polling stub"
```

---

## Task 9: Listener integration test — idempotency + `retries_exhausted` + `run_sql` auto-deny

**Files:**
- Modify: `src/trigger/__tests__/run-trigger-agent.test.ts`

### Step 1: Add the idempotency test

Simulates Trigger.dev retry: run the task twice with the same payload, verify `consumeAnthropicSession` is called twice (the core handles dedup via reconnect), and verify no test-level assertion fails.

```typescript
it("is safe to re-run for Trigger.dev retries (core handles dedup)", async () => {
  consumeAnthropicSession.mockResolvedValue({
    status: "complete",
    events: [],
    cost: { inputTokens: 0, outputTokens: 0, runtimeSeconds: 0 },
  });

  const payload = { runId: "run_1", sessionId: "session_1", clientId: "client_1", threadId: "thread_1" };
  await runTriggerAgent.run(payload, { ctx: {} as never });
  await runTriggerAgent.run(payload, { ctx: {} as never });

  expect(consumeAnthropicSession).toHaveBeenCalledTimes(2);
});
```

### Step 2: Add the `retries_exhausted` test

```typescript
it("passes retries_exhausted terminal state through to finalizeTriggerRun", async () => {
  consumeAnthropicSession.mockImplementation(async (opts: { onTerminal?: (events: unknown[], cost: unknown) => Promise<void> }) => {
    // Simulate H3 core firing onTerminal with retries_exhausted events
    await opts.onTerminal?.(
      [{ id: "evt_1", type: "session.status_idle", stop_reason: { type: "retries_exhausted" } }],
      { inputTokens: 50, outputTokens: 5, runtimeSeconds: 3 },
    );
    return { status: "failed", reason: "retries_exhausted" };
  });

  await runTriggerAgent.run(
    { runId: "run_1", sessionId: "session_1", clientId: "client_1", threadId: "thread_1" },
    { ctx: {} as never },
  );

  expect(finalizeTriggerRun).toHaveBeenCalled();
});
```

Note: marking the run as `failed` vs `complete` is the session-runner core's responsibility via `onTerminal` events. `finalizeTriggerRun` itself only knows how to mark `complete` — if the session-runner passes a different status through, extend `finalizeTriggerRun` in a follow-up. For H5, confirm with grep that the core distinguishes failed vs complete in the events array passed to `onTerminal`.

### Step 3: Add the `run_sql`-in-trigger dispatcher test

This is the unit-level precursor to Integration Scenario 12 (verified end-to-end in Task 22). Here we verify the dispatcher rejection path.

```typescript
it("core rejects chat-only tools in trigger context", async () => {
  // Exercised through the dispatcher — this test just verifies the flag is passed.
  consumeAnthropicSession.mockResolvedValue({
    status: "complete",
    events: [],
    cost: { inputTokens: 0, outputTokens: 0, runtimeSeconds: 0 },
  });

  await runTriggerAgent.run(
    { runId: "run_1", sessionId: "session_1", clientId: "client_1", threadId: "thread_1" },
    { ctx: {} as never },
  );

  expect(consumeAnthropicSession).toHaveBeenCalledWith(
    expect.objectContaining({
      context: expect.objectContaining({ isChatContext: false }),
    }),
  );
});
```

### Step 4: Run

```bash
pnpm vitest run src/trigger/__tests__/run-trigger-agent.test.ts
```

Expected: **PASS**.

### Step 5: Commit

```bash
git add src/trigger/__tests__/run-trigger-agent.test.ts
git commit -m "test(h5): listener idempotency + retries_exhausted + chat-only flag"
```

---

## Task 10: Trigger instruction path rename — failing test

**Files:**
- Create: `scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test.ts`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const listFiles = vi.fn();
const copyFile = vi.fn();
const removeFiles = vi.fn();
const updateTriggersRow = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    storage: { from: () => ({ list: listFiles, copy: copyFile, remove: removeFiles }) },
    from: () => ({ update: () => ({ eq: updateTriggersRow }) }),
  }),
}));

import { renameTriggerInstructionPaths } from "../rename-trigger-instruction-paths";

describe("renameTriggerInstructionPaths", () => {
  beforeEach(() => {
    listFiles.mockReset();
    copyFile.mockReset().mockResolvedValue({ error: null });
    removeFiles.mockReset().mockResolvedValue({ error: null });
    updateTriggersRow.mockReset().mockResolvedValue({ error: null });
  });

  it("copies each subagents/*.md to triggers/*.md and deletes the old file", async () => {
    listFiles.mockResolvedValue({
      data: [
        { name: "morning-briefing.md" },
        { name: "lead-digest.md" },
      ],
      error: null,
    });

    await renameTriggerInstructionPaths({ clientId: "client_1" });

    expect(copyFile).toHaveBeenCalledWith(
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/agent/triggers/morning-briefing.md",
    );
    expect(copyFile).toHaveBeenCalledWith(
      "client_1/agent/subagents/lead-digest.md",
      "client_1/agent/triggers/lead-digest.md",
    );
    expect(removeFiles).toHaveBeenCalledWith([
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/agent/subagents/lead-digest.md",
    ]);
  });

  it("updates agent_triggers.instruction_path references", async () => {
    listFiles.mockResolvedValue({
      data: [{ name: "morning-briefing.md" }],
      error: null,
    });

    await renameTriggerInstructionPaths({ clientId: "client_1" });

    // The helper should have called `from("agent_triggers").update(...).eq("instruction_path", "...")`
    // with the new `/agent/triggers/` prefix.
    expect(updateTriggersRow).toHaveBeenCalled();
  });

  it("is idempotent — if the new path already exists and old is gone, does nothing", async () => {
    listFiles.mockResolvedValue({ data: [], error: null });
    await renameTriggerInstructionPaths({ clientId: "client_1" });
    expect(copyFile).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run the test

```bash
pnpm vitest run scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test.ts
```

Expected: **FAIL** — module not found.

---

## Task 11: Implement the path-rename script

**Files:**
- Create: `scripts/managed-agents/rename-trigger-instruction-paths.ts`

### Step 1: Write the script

```typescript
/**
 * One-off Supabase Storage rename: /agent/subagents/*.md → /agent/triggers/*.md
 * Also rewrites `agent_triggers.instruction_path` references.
 * Idempotent — safe to re-run (empty list is a no-op).
 *
 * Run: `pnpm tsx scripts/managed-agents/rename-trigger-instruction-paths.ts [--client-id=<uuid>]`
 *      (no `--client-id` processes all clients)
 *
 * @module scripts/managed-agents/rename-trigger-instruction-paths
 */
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "agent-files";
const OLD_PREFIX = "agent/subagents";
const NEW_PREFIX = "agent/triggers";

export async function renameTriggerInstructionPaths(opts: { clientId: string }): Promise<void> {
  const supabase = await createAdminClient();
  const storage = supabase.storage.from(BUCKET);

  const { data: files, error } = await storage.list(`${opts.clientId}/${OLD_PREFIX}`);
  if (error) throw error;
  if (!files || files.length === 0) return;

  for (const file of files) {
    const oldPath = `${opts.clientId}/${OLD_PREFIX}/${file.name}`;
    const newPath = `${opts.clientId}/${NEW_PREFIX}/${file.name}`;
    const { error: copyErr } = await storage.copy(oldPath, newPath);
    if (copyErr) throw copyErr;

    // Rewrite any agent_triggers rows pointing at the old path.
    const { error: updateErr } = await supabase
      .from("agent_triggers")
      .update({ instruction_path: `/${NEW_PREFIX}/${file.name}` })
      .eq("instruction_path", `/${OLD_PREFIX}/${file.name}`);
    if (updateErr) throw updateErr;
  }

  const removePaths = files.map((f) => `${opts.clientId}/${OLD_PREFIX}/${f.name}`);
  const { error: removeErr } = await storage.remove(removePaths);
  if (removeErr) throw removeErr;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--client-id="));
  if (arg) {
    await renameTriggerInstructionPaths({ clientId: arg.slice("--client-id=".length) });
    return;
  }

  const supabase = await createAdminClient();
  const { data: clients, error } = await supabase.from("clients").select("client_id");
  if (error) throw error;
  for (const client of clients ?? []) {
    await renameTriggerInstructionPaths({ clientId: client.client_id });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

### Step 2: Rerun the test

```bash
pnpm vitest run scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test.ts
```

Expected: **PASS**.

### Step 3: Commit

```bash
git add scripts/managed-agents/rename-trigger-instruction-paths.ts scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test.ts
git commit -m "feat(h5): script to rename trigger instruction paths"
```

**Note:** Do NOT run this script against production Supabase as part of H5 merge. Ship the code, coordinate the rename with whoever operates the deployment, and document the run in the PR description.

---

## Task 12: `/debug-trace` helper script — failing test

**Files:**
- Create: `scripts/debug-trace/__tests__/fetch-events.test.ts`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const listEvents = vi.fn();
const retrieveSession = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    beta = {
      sessions: {
        events: { list: listEvents },
        retrieve: retrieveSession,
      },
    };
  },
}));

import { parseEventsToTimeline, computeSessionCost } from "../fetch-events";

describe("parseEventsToTimeline", () => {
  it("pairs custom_tool_use with custom_tool_result by custom_tool_use_id", () => {
    const events = [
      { id: "e1", type: "user.message", content: [{ type: "text", text: "hi" }] },
      { id: "e2", type: "agent.custom_tool_use", custom_tool_use_id: "t1", name: "search_crm", input: { query: "acme" } },
      { id: "e3", type: "user.custom_tool_result", custom_tool_use_id: "t1", content: [{ type: "text", text: '{"success":true}' }] },
      { id: "e4", type: "agent.message", content: [{ type: "text", text: "Found 3 records." }] },
    ];

    const timeline = parseEventsToTimeline(events);

    expect(timeline).toEqual([
      expect.objectContaining({ kind: "user_message", text: "hi" }),
      expect.objectContaining({ kind: "tool_call", name: "search_crm", success: true }),
      expect.objectContaining({ kind: "agent_message", text: "Found 3 records." }),
    ]);
  });

  it("flags session.error events", () => {
    const events = [
      { id: "e1", type: "session.error", error: { message: "upstream failed" } },
    ];
    const timeline = parseEventsToTimeline(events);
    expect(timeline[0]).toMatchObject({ kind: "error", message: "upstream failed" });
  });
});

describe("computeSessionCost", () => {
  it("sums model_usage across span.model_request_end + compute seconds", () => {
    const events = [
      {
        id: "e1",
        type: "span.model_request_end",
        model_usage: { input_tokens: 100_000, output_tokens: 10_000 },
      },
      {
        id: "e2",
        type: "span.model_request_end",
        model_usage: { input_tokens: 50_000, output_tokens: 5_000 },
      },
    ];
    const stats = { active_seconds: 60 };

    const cost = computeSessionCost(events, stats);

    // (150k × 3 + 15k × 15) / 1M + (60 / 3600) × 0.08
    const expected = (150_000 * 3 + 15_000 * 15) / 1_000_000 + (60 / 3600) * 0.08;
    expect(cost.totalUsd).toBeCloseTo(expected, 6);
    expect(cost.inputTokens).toBe(150_000);
    expect(cost.outputTokens).toBe(15_000);
  });
});
```

### Step 2: Run

```bash
pnpm vitest run scripts/debug-trace/__tests__/fetch-events.test.ts
```

Expected: **FAIL**.

---

## Task 13: Implement `scripts/debug-trace/fetch-events.ts`

**Files:**
- Create: `scripts/debug-trace/fetch-events.ts`

### Step 1: Write the helper

```typescript
/**
 * CLI helper for the /debug-trace skill. Fetches Anthropic session events,
 * parses them into a chronological timeline, and prints cost breakdown.
 *
 * Usage: `source .env.local && pnpm tsx scripts/debug-trace/fetch-events.ts <SESSION_ID>`
 *
 * @module scripts/debug-trace/fetch-events
 */
import Anthropic from "@anthropic-ai/sdk";

type TimelineEntry =
  | { kind: "user_message"; text: string }
  | { kind: "agent_message"; text: string }
  | { kind: "tool_call"; name: string; input: unknown; output: unknown; success: boolean }
  | { kind: "llm_call"; durationMs: number; inputTokens: number; outputTokens: number }
  | { kind: "error"; message: string };

const INPUT_TOKEN_PRICE = 3 / 1_000_000;
const OUTPUT_TOKEN_PRICE = 15 / 1_000_000;
const ACTIVE_SECONDS_PRICE = 0.08 / 3600;

export function parseEventsToTimeline(events: Array<Record<string, unknown>>): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  const pendingTools = new Map<string, { name: string; input: unknown }>();
  const pendingSpans = new Map<string, number>();

  for (const event of events) {
    const type = event.type as string;
    switch (type) {
      case "user.message": {
        const content = event.content as Array<{ type: string; text?: string }> | undefined;
        const text = content?.find((c) => c.type === "text")?.text ?? "";
        timeline.push({ kind: "user_message", text });
        break;
      }
      case "agent.message": {
        const content = event.content as Array<{ type: string; text?: string }> | undefined;
        const text = content?.find((c) => c.type === "text")?.text ?? "";
        timeline.push({ kind: "agent_message", text });
        break;
      }
      case "agent.custom_tool_use": {
        const id = event.custom_tool_use_id as string;
        pendingTools.set(id, { name: event.name as string, input: event.input });
        break;
      }
      case "user.custom_tool_result": {
        const id = event.custom_tool_use_id as string;
        const pending = pendingTools.get(id);
        pendingTools.delete(id);
        if (!pending) break;
        const content = event.content as Array<{ type: string; text?: string }> | undefined;
        const raw = content?.find((c) => c.type === "text")?.text ?? "{}";
        let parsed: { success?: boolean } = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          // non-JSON tool output — treat as success
          parsed = { success: true };
        }
        timeline.push({
          kind: "tool_call",
          name: pending.name,
          input: pending.input,
          output: parsed,
          success: parsed.success !== false,
        });
        break;
      }
      case "span.model_request_start": {
        pendingSpans.set(event.id as string, Date.parse(event.timestamp as string));
        break;
      }
      case "span.model_request_end": {
        const startId = event.start_event_id as string;
        const start = pendingSpans.get(startId);
        pendingSpans.delete(startId);
        const durationMs = start ? Date.parse(event.timestamp as string) - start : 0;
        const usage = event.model_usage as { input_tokens: number; output_tokens: number };
        timeline.push({
          kind: "llm_call",
          durationMs,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        });
        break;
      }
      case "session.error": {
        const error = event.error as { message?: string } | undefined;
        timeline.push({ kind: "error", message: error?.message ?? "unknown error" });
        break;
      }
    }
  }

  return timeline;
}

export function computeSessionCost(
  events: Array<Record<string, unknown>>,
  stats: { active_seconds: number },
): { inputTokens: number; outputTokens: number; activeSeconds: number; totalUsd: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const event of events) {
    if (event.type === "span.model_request_end") {
      const usage = event.model_usage as { input_tokens: number; output_tokens: number };
      inputTokens += usage.input_tokens;
      outputTokens += usage.output_tokens;
    }
  }
  const totalUsd =
    inputTokens * INPUT_TOKEN_PRICE +
    outputTokens * OUTPUT_TOKEN_PRICE +
    stats.active_seconds * ACTIVE_SECONDS_PRICE;
  return { inputTokens, outputTokens, activeSeconds: stats.active_seconds, totalUsd };
}

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: pnpm tsx scripts/debug-trace/fetch-events.ts <SESSION_ID>");
    process.exit(1);
  }

  const client = new Anthropic();
  const { events } = (await client.beta.sessions.events.list(sessionId)) as {
    events: Array<Record<string, unknown>>;
  };
  const session = (await client.beta.sessions.retrieve(sessionId)) as {
    stats?: { active_seconds?: number };
  };
  const activeSeconds = session.stats?.active_seconds ?? 0;

  const timeline = parseEventsToTimeline(events);
  const cost = computeSessionCost(events, { active_seconds: activeSeconds });

  console.log("=== TIMELINE ===");
  for (const entry of timeline) {
    console.log(JSON.stringify(entry));
  }
  console.log("\n=== COST ===");
  console.log(JSON.stringify(cost, null, 2));
  console.log(`\nOpen in Anthropic Console: https://console.anthropic.com/workbench/sessions/${sessionId}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

**Note:** Verify the Anthropic Console URL format by manually opening one session in the browser. If the URL path differs, fix the log line — this is a one-line change.

### Step 2: Rerun the Task 12 test

```bash
pnpm vitest run scripts/debug-trace/__tests__/fetch-events.test.ts
```

Expected: **PASS**.

### Step 3: Commit

```bash
git add scripts/debug-trace/fetch-events.ts scripts/debug-trace/__tests__/fetch-events.test.ts
git commit -m "feat(h5): debug-trace fetch-events helper for Managed Agents"
```

---

## Task 14: Port `.claude/skills/debug-trace/SKILL.md`

**Files:**
- Modify: `.claude/skills/debug-trace/SKILL.md`

### Step 1: Update the frontmatter

Change the description so it no longer mentions Langfuse:

```yaml
---
name: debug-trace
description: Debug a Sunder agent bug by pulling the Anthropic Managed Agents session trace for a thread visible in a screenshot. Paste a screenshot + describe what's wrong, and this skill pulls session events, shows tool calls/errors, and helps troubleshoot.
user_invocable: true
---
```

### Step 2: Rewrite Step 2 and Step 3

Replace Langfuse CLI instructions with:

```markdown
## Step 2: Look up the session ID for the thread

Run this to get the Anthropic session ID for the thread:

```bash
source .env.local && pnpm tsx -e '
import { createAdminClient } from "@/lib/supabase/server";
const supabase = await createAdminClient();
const { data } = await supabase
  .from("conversation_threads")
  .select("session_id")
  .eq("thread_id", "<THREAD_ID>")
  .single();
console.log(data?.session_id);
'
```

If the session_id is null, the thread predates the Managed Agents migration and no trace is available.

## Step 3: Pull the session events

```bash
source .env.local && pnpm tsx scripts/debug-trace/fetch-events.ts <SESSION_ID>
```

The helper prints a JSONL timeline of every meaningful event:
- `user_message` / `agent_message` — conversation content
- `tool_call` — tool name, input, output, success flag
- `llm_call` — duration and token usage per model request
- `error` — session errors

After the timeline, a cost breakdown shows input/output tokens, active compute seconds, and total USD.

The helper also prints an "Open in Anthropic Console" link for visual debugging.
```

### Step 3: Update Step 5 source-code map

Replace the entries that point at the deleted legacy runner:

```markdown
| Bug type | Files to check |
|----------|---------------|
| Tool logic | `src/lib/managed-agents/tools/` — find the tool factory |
| System prompt | Baked into the Anthropic agent object. Use `scripts/managed-agents/create-agent.ts` to view/update. |
| Chat route / streaming | `app/api/chat/route.ts` |
| Adapter / session loop | `src/lib/managed-agents/adapter.ts` + `src/lib/managed-agents/session-runner.ts` |
| Custom tool dispatch | `src/lib/managed-agents/dispatcher.ts` |
| Trigger runs | `src/trigger/run-trigger-agent.ts` + `src/lib/managed-agents/finalize-trigger-run.ts` |
| Frontend rendering | `src/components/chat/` — message rendering, markdown, mermaid |
```

### Step 4: Delete any leftover Langfuse helpers in the skill directory

```bash
ls .claude/skills/debug-trace/
```

If there are shell scripts that wrap `langfuse-cli`, delete them in the same commit.

### Step 5: Commit

```bash
git add .claude/skills/debug-trace/SKILL.md
git commit -m "refactor(h5): port debug-trace skill to Anthropic events.list"
```

---

## Task 15: Settings API route — failing test

**Files:**
- Create: `app/api/settings/agent-context/__tests__/route.test.ts`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const updateClient = vi.fn();
const selectClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser },
    from: vi.fn((table: string) => {
      if (table === "clients") {
        return {
          select: () => ({ eq: () => ({ single: selectClient }) }),
          update: (values: Record<string, unknown>) => ({
            eq: () => updateClient(values),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  }),
}));

import { GET, PUT } from "../route";

describe("GET /api/settings/agent-context", () => {
  beforeEach(() => {
    getUser.mockReset();
    selectClient.mockReset();
  });

  it("returns the client_profile and user_preferences for the current user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
    selectClient.mockResolvedValue({
      data: { client_profile: "I am a real estate agent.", user_preferences: "Prefer concise replies." },
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/settings/agent-context"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      client_profile: "I am a real estate agent.",
      user_preferences: "Prefer concise replies.",
    });
  });

  it("returns 401 when not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET(new Request("http://localhost/api/settings/agent-context"));
    expect(response.status).toBe(401);
  });
});

describe("PUT /api/settings/agent-context", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateClient.mockReset().mockResolvedValue({ error: null });
  });

  it("updates both fields and returns 200", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });

    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        body: JSON.stringify({ client_profile: "Updated.", user_preferences: "Updated prefs." }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateClient).toHaveBeenCalledWith({
      client_profile: "Updated.",
      user_preferences: "Updated prefs.",
    });
  });

  it("rejects inputs over 100k chars with 400", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
    const huge = "x".repeat(100_001);
    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        body: JSON.stringify({ client_profile: huge }),
      }),
    );
    expect(response.status).toBe(400);
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        body: JSON.stringify({ client_profile: "" }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
```

### Step 2: Run

```bash
pnpm vitest run app/api/settings/agent-context/__tests__/route.test.ts
```

Expected: **FAIL** — route not found.

---

## Task 16: Implement the settings API route

**Files:**
- Create: `app/api/settings/agent-context/route.ts`

### Step 1: Write the route

```typescript
/**
 * CRUD for clients.client_profile and clients.user_preferences.
 * These text blobs are injected into the Anthropic session kickoff on every
 * run, so edits take effect on the next message. Capped at 100k chars each
 * to stay under Anthropic request-size limits.
 *
 * @module app/api/settings/agent-context/route
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const MAX_LENGTH = 100_000;

const bodySchema = z.object({
  client_profile: z.string().max(MAX_LENGTH).optional(),
  user_preferences: z.string().max(MAX_LENGTH).optional(),
});

export async function GET(_request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("clients")
    .select("client_profile, user_preferences")
    .eq("owner_user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    client_profile: data?.client_profile ?? "",
    user_preferences: data?.user_preferences ?? "",
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("owner_user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

### Step 2: Verify the `clients` table has an `owner_user_id` column

```bash
rg -n "owner_user_id" supabase/migrations src/lib/supabase/types.ts
```

If the FK column is named differently (e.g. `user_id`), adapt the `.eq()` calls above. Do NOT change the schema.

### Step 3: Rerun the Task 15 test

```bash
pnpm vitest run app/api/settings/agent-context/__tests__/route.test.ts
```

Expected: **PASS**.

### Step 4: Commit

```bash
git add app/api/settings/agent-context
git commit -m "feat(h5): agent-context settings API (GET + PUT)"
```

---

## Task 17: Settings UI page — failing test

**Files:**
- Create: `app/(dashboard)/settings/agent-context/page.test.tsx`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentContextPage from "./page";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as never;
});

describe("AgentContextPage", () => {
  it("loads existing values on mount", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ client_profile: "Existing profile.", user_preferences: "Existing prefs." }),
    });

    render(<AgentContextPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Existing profile.")).toBeTruthy();
      expect(screen.getByDisplayValue("Existing prefs.")).toBeTruthy();
    });
  });

  it("PUTs changes on save", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ client_profile: "Old.", user_preferences: "" }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<AgentContextPage />);
    await screen.findByDisplayValue("Old.");

    const profileField = screen.getByLabelText(/agent personality/i);
    await userEvent.clear(profileField);
    await userEvent.type(profileField, "New.");

    const saveButton = screen.getByRole("button", { name: /save/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/agent-context",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining("New."),
        }),
      );
    });
  });
});
```

### Step 2: Run

```bash
pnpm vitest run "app/(dashboard)/settings/agent-context/page.test.tsx"
```

Expected: **FAIL**.

---

## Task 18: Implement the settings page

**Files:**
- Create: `app/(dashboard)/settings/agent-context/page.tsx`

### Step 1: Write the page (client component)

```typescript
"use client";

/**
 * Settings → Agent Context
 *
 * Lets users edit clients.client_profile ("Agent Personality") and
 * clients.user_preferences ("User Profile"). These blobs are injected into
 * every Anthropic session kickoff, so edits take effect on the next message.
 *
 * @module app/(dashboard)/settings/agent-context/page
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_LENGTH = 100_000;

export default function AgentContextPage() {
  const [profile, setProfile] = useState("");
  const [preferences, setPreferences] = useState("");
  const [originalProfile, setOriginalProfile] = useState("");
  const [originalPreferences, setOriginalPreferences] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/agent-context")
      .then((r) => r.json())
      .then((data: { client_profile: string; user_preferences: string }) => {
        setProfile(data.client_profile);
        setPreferences(data.user_preferences);
        setOriginalProfile(data.client_profile);
        setOriginalPreferences(data.user_preferences);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const hasChanges = profile !== originalProfile || preferences !== originalPreferences;

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/agent-context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_profile: profile, user_preferences: preferences }),
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);
      setOriginalProfile(profile);
      setOriginalPreferences(preferences);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Agent Context</h1>
        <p className="text-sm text-muted-foreground">
          Two text blobs injected into every Sunder run. Edits take effect on the next message.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="client_profile">Agent Personality</Label>
        <Textarea
          id="client_profile"
          value={profile}
          maxLength={MAX_LENGTH}
          rows={10}
          className="font-mono text-sm"
          onChange={(e) => setProfile(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {profile.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="user_preferences">User Profile</Label>
        <Textarea
          id="user_preferences"
          value={preferences}
          maxLength={MAX_LENGTH}
          rows={10}
          className="font-mono text-sm"
          onChange={(e) => setPreferences(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {preferences.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

### Step 2: Rerun the Task 17 test

```bash
pnpm vitest run "app/(dashboard)/settings/agent-context/page.test.tsx"
```

Expected: **PASS**.

### Step 3: Link to the page from the existing settings landing page

Open `app/(dashboard)/settings/page.tsx` and add a link card pointing at `/settings/agent-context`. Match the existing card style (`autopilot-card.tsx` is the closest reference).

### Step 4: Commit

```bash
git add "app/(dashboard)/settings/agent-context" "app/(dashboard)/settings/page.tsx"
git commit -m "feat(h5): settings page for agent context (profile + prefs)"
```

---

## Task 19: Scores query helper — failing test

**Files:**
- Create: `src/lib/admin/__tests__/scores-query.test.ts`

### Step 1: Draft the test

```typescript
import { describe, it, expect, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({ rpc, from }),
}));

import { fetchRecentScores } from "../scores-query";

describe("fetchRecentScores", () => {
  it("queries run_scores for the last 30 days grouped by day + evaluator", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [
        { day: "2026-04-09", evaluator_name: "safety-gate", avg_score: 0.95, run_count: 20 },
        { day: "2026-04-09", evaluator_name: "crm-hallucination", avg_score: 0.87, run_count: 20 },
      ],
      error: null,
    });
    from.mockReturnValue({ select });

    const rows = await fetchRecentScores({ days: 30 });

    expect(from).toHaveBeenCalledWith("run_scores_daily"); // or whichever view/RPC the helper uses
    expect(rows).toHaveLength(2);
    expect(rows[0].evaluator_name).toBe("safety-gate");
  });
});
```

### Step 2: Run

```bash
pnpm vitest run src/lib/admin/__tests__/scores-query.test.ts
```

Expected: **FAIL**.

---

## Task 20: Implement the scores query helper + dashboard page

**Files:**
- Create: `src/lib/admin/scores-query.ts`
- Create: `app/(dashboard)/admin/scores/page.tsx`
- Create: `app/(dashboard)/admin/scores/page.test.tsx` (smoke test only — 1 assertion)

### Step 1: Write the query helper

```typescript
/**
 * Aggregates run_scores over the last N days for the admin dashboard.
 * Uses a raw SQL `from(...).select(...)` with a view/RPC — the simplest
 * approach is to define a SQL view `run_scores_daily` in a follow-up
 * migration and query it here. For H5 we inline the aggregation.
 *
 * @module src/lib/admin/scores-query
 */
import { createAdminClient } from "@/lib/supabase/server";

export type ScoreRow = {
  day: string;
  evaluator_name: string;
  avg_score: number;
  run_count: number;
};

export async function fetchRecentScores(opts: { days: number }): Promise<ScoreRow[]> {
  const supabase = await createAdminClient();
  const since = new Date(Date.now() - opts.days * 24 * 3600 * 1000).toISOString();

  // Inline aggregation via a Supabase RPC or a raw SQL view.
  // If an RPC isn't available, fall back to reading all rows and grouping in JS.
  const { data, error } = await supabase
    .from("run_scores")
    .select("evaluator_name, score_type, score_value, created_at")
    .gte("created_at", since);

  if (error) throw error;
  if (!data) return [];

  const buckets = new Map<string, { sum: number; count: number; evaluator: string; day: string }>();
  for (const row of data) {
    const day = row.created_at.slice(0, 10); // YYYY-MM-DD
    const key = `${day}__${row.evaluator_name}`;
    const entry = buckets.get(key) ?? { sum: 0, count: 0, evaluator: row.evaluator_name, day };
    entry.sum += row.score_value;
    entry.count += 1;
    buckets.set(key, entry);
  }

  return Array.from(buckets.values())
    .map((e) => ({
      day: e.day,
      evaluator_name: e.evaluator,
      avg_score: e.count ? e.sum / e.count : 0,
      run_count: e.count,
    }))
    .sort((a, b) => (a.day > b.day ? -1 : 1));
}
```

### Step 2: Update the Task 19 test

The inline-aggregation approach doesn't call a view; rewrite the test to mock `.from("run_scores").select(...).gte(...)` and assert the aggregation output.

```typescript
import { describe, it, expect, vi } from "vitest";

const gte = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockResolvedValue({
    from: () => ({ select: () => ({ gte }) }),
  }),
}));

import { fetchRecentScores } from "../scores-query";

describe("fetchRecentScores", () => {
  it("groups rows by day + evaluator and computes avg + count", async () => {
    gte.mockResolvedValue({
      data: [
        { evaluator_name: "safety-gate", score_type: "boolean", score_value: 1, created_at: "2026-04-09T10:00:00Z" },
        { evaluator_name: "safety-gate", score_type: "boolean", score_value: 0, created_at: "2026-04-09T11:00:00Z" },
        { evaluator_name: "crm-hallucination", score_type: "boolean", score_value: 1, created_at: "2026-04-09T12:00:00Z" },
      ],
      error: null,
    });

    const rows = await fetchRecentScores({ days: 30 });
    const safety = rows.find((r) => r.evaluator_name === "safety-gate");
    expect(safety?.avg_score).toBe(0.5);
    expect(safety?.run_count).toBe(2);
  });
});
```

Rerun:

```bash
pnpm vitest run src/lib/admin/__tests__/scores-query.test.ts
```

Expected: **PASS**.

### Step 3: Write the dashboard page (server component)

```typescript
/**
 * Admin → Scores dashboard.
 * Read-only view of run_scores trends for the last 30 days. Replaces the
 * Langfuse evaluator dashboard. Gate behind admin role (see existing admin
 * layout if one exists).
 *
 * @module app/(dashboard)/admin/scores/page
 */
import { fetchRecentScores } from "@/lib/admin/scores-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ScoresPage() {
  const rows = await fetchRecentScores({ days: 30 });

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Evaluator Scores (last 30 days)</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Evaluator</TableHead>
            <TableHead className="text-right">Avg Score</TableHead>
            <TableHead className="text-right">Run Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.day}-${row.evaluator_name}`}>
              <TableCell>{row.day}</TableCell>
              <TableCell>{row.evaluator_name}</TableCell>
              <TableCell className="text-right">{(row.avg_score * 100).toFixed(1)}%</TableCell>
              <TableCell className="text-right">{row.run_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### Step 4: Admin-gate the route

Grep for how the existing admin UI gates routes:

```bash
rg -n "is_admin|role.*admin" app src/lib/supabase
```

Apply the same gate. If no existing admin gate exists, wrap the page server-side: fetch the user, fail fast with `notFound()` if not the test account (`limzheyi1996@gmail.com` per the debug-trace skill). Do NOT over-engineer.

### Step 5: Smoke-test the page

`app/(dashboard)/admin/scores/page.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/scores-query", () => ({
  fetchRecentScores: vi.fn().mockResolvedValue([
    { day: "2026-04-09", evaluator_name: "safety-gate", avg_score: 0.95, run_count: 20 },
  ]),
}));

import ScoresPage from "./page";

describe("ScoresPage", () => {
  it("renders the rows", async () => {
    const Element = await ScoresPage();
    render(Element);
    expect(screen.getByText("safety-gate")).toBeTruthy();
    expect(screen.getByText("95.0%")).toBeTruthy();
  });
});
```

Run:

```bash
pnpm vitest run "app/(dashboard)/admin/scores/page.test.tsx" src/lib/admin/__tests__/scores-query.test.ts
```

Expected: **PASS**.

### Step 6: Commit

```bash
git add src/lib/admin "app/(dashboard)/admin/scores"
git commit -m "feat(h5): admin scores dashboard replacing Langfuse"
```

---

## Task 21: Conditional — Custom Skills API migration

**Gate first.** Run:

```bash
rg -n "agent/skills/.*SKILL\.md" src scripts
# Also check Supabase Storage via CLI:
source .env.local && pnpm tsx -e '
import { createAdminClient } from "@/lib/supabase/server";
const supabase = await createAdminClient();
const { data: clients } = await supabase.from("clients").select("client_id");
for (const c of clients ?? []) {
  const { data } = await supabase.storage.from("agent-files").list(`${c.client_id}/agent/skills`);
  if (data && data.length > 0) console.log(c.client_id, data.map((f) => f.name));
}
'
```

**If no skills files exist for any client → SKIP this task entirely.** Document the skip in the PR description: "No custom skill files in Supabase Storage as of H5. Custom Skills API migration deferred until actually needed (YAGNI)."

**If skills exist for any client → continue.**

### Step 1: Write the migration script

**Files:**
- Create: `scripts/managed-agents/migrate-custom-skills.ts`

```typescript
/**
 * One-off: upload existing clients' /agent/skills/*/SKILL.md files to the
 * Anthropic Custom Skills API and bump the agent version to include them.
 *
 * Run: `pnpm tsx scripts/managed-agents/migrate-custom-skills.ts`
 *
 * After running, update ANTHROPIC_AGENT_VERSION in the environment to the
 * new version number printed at the end.
 *
 * @module scripts/managed-agents/migrate-custom-skills
 */
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/server";

async function main() {
  const anthropic = new Anthropic();
  const supabase = await createAdminClient();

  const { data: clients, error } = await supabase.from("clients").select("client_id");
  if (error) throw error;

  const uploadedSkillIds: string[] = [];

  for (const client of clients ?? []) {
    const { data: files } = await supabase.storage
      .from("agent-files")
      .list(`${client.client_id}/agent/skills`);
    if (!files) continue;

    for (const file of files) {
      const path = `${client.client_id}/agent/skills/${file.name}/SKILL.md`;
      const { data: blob } = await supabase.storage.from("agent-files").download(path);
      if (!blob) continue;

      const content = await blob.text();
      // Anthropic Custom Skills API — beta header required per plan Phase 4.
      const skill = (await (anthropic as unknown as {
        beta: { skills: { create: (params: unknown) => Promise<{ id: string }> } };
      }).beta.skills.create({
        name: file.name,
        content,
      })) as { id: string };
      uploadedSkillIds.push(skill.id);
      console.log(`Uploaded ${path} → ${skill.id}`);
    }
  }

  console.log(`\nAll uploaded skill IDs:`, uploadedSkillIds);
  console.log(
    `\nNext step: update scripts/managed-agents/create-agent.ts to include these skills in the agent config, then run it to bump ANTHROPIC_AGENT_VERSION.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

### Step 2: Update `scripts/managed-agents/create-agent.ts` to attach custom skills

Grep for the existing skills block:

```bash
rg -n "skills:" scripts/managed-agents/create-agent.ts
```

Extend it:

```typescript
skills: [
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "pptx" },
  { type: "anthropic", skill_id: "pdf" },
  ...customSkillIds.map((id) => ({ type: "custom" as const, skill_id: id, version: "latest" as const })),
],
```

### Step 3: Delete `src/lib/runner/skills/discover-skills.ts`

```bash
test -f src/lib/runner/skills/discover-skills.ts && git rm src/lib/runner/skills/discover-skills.ts
```

If H4 already deleted it, this is a no-op.

### Step 4: Commit

```bash
git add scripts/managed-agents
git commit -m "feat(h5): migrate custom skills to Anthropic Skills API"
```

**Operational note:** After merging, run the script against production, capture the new agent version, and update `ANTHROPIC_AGENT_VERSION` in the production environment. Coordinate this with whoever operates the deployment — do NOT do it as part of the PR merge.

---

## Task 22: Connection tool naming alignment

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `scripts/managed-agents/create-agent.ts` (agent system prompt)

### Step 1: Grep for the old names

```bash
rg -n "list_users_connections|create_new_connections" src app scripts
```

### Step 2: Rename in the system prompt

The system prompt is baked into the Anthropic agent object. Open `scripts/managed-agents/create-agent.ts`, find the `<external-connections>` section, rename:
- `list_users_connections` → `list_connections`
- `create_new_connections` → `create_connection`

### Step 3: Rename in the chat tool-call renderer

In `src/components/chat/tool-call-inline.tsx`, update the tool-name → display-name map to use `list_connections` / `create_connection`.

### Step 4: Bump the agent version

Run `scripts/managed-agents/create-agent.ts` (or its update variant) once locally against the dev Anthropic environment, capture the new version, and update `.env.local.example` / your dev `.env.local` `ANTHROPIC_AGENT_VERSION`. Document the change in the PR description.

If Task 21 (custom skills) ran, combine this version bump with Task 21 into a single agent update — one version bump, not two.

### Step 5: Typecheck + unit test

```bash
pnpm typecheck
pnpm vitest run src/components/chat
```

Expected: **PASS**.

### Step 6: Commit

```bash
git add src/components/chat/tool-call-inline.tsx scripts/managed-agents/create-agent.ts .env.local.example
git commit -m "refactor(h5): align connection tool names in UI and agent prompt"
```

---

## Task 23: Integration Scenario 12 verification — go/no-go gate

**This is the H5 merge gate.** Do NOT merge H5 if any step fails.

### Step 1: Create a temporary trigger that calls `run_sql`

Via the dev UI or direct DB insert, create an `agent_triggers` row with:
- `trigger_type: "cron"` with `cron: "* * * * *"` (fire every minute)
- `instruction_path: "/agent/triggers/test-run-sql-rejection.md"`
- An instruction file in Supabase Storage at that path containing:
  ```
  Query the crm_deals table using run_sql and summarize how many deals exist.
  If run_sql is unavailable, use search_crm as a fallback.
  ```

### Step 2: Wait for the scanner to fire

Watch the Trigger.dev dashboard for `run-trigger-agent` executions. Also tail Next.js logs.

### Step 3: Verify the trace

Open the Anthropic Console session or run:

```bash
source .env.local && pnpm tsx scripts/debug-trace/fetch-events.ts <SESSION_ID>
```

Expected in the timeline:
1. `user_message` — the instruction
2. `tool_call` — `run_sql` with `success: false` and error text `"Tool not available in trigger runs. Use search_crm instead."` (or equivalent H3 copy)
3. `tool_call` — `search_crm` with `success: true`
4. `agent_message` — summary of deal count
5. Terminal: `session.status_idle` with `end_turn`

### Step 4: Verify persistence

```sql
SELECT status, tokens_in, tokens_out, cost_usd FROM runs WHERE run_id = '<RUN_ID>';
SELECT evaluator_name, score_value FROM run_scores WHERE run_id = '<RUN_ID>';
SELECT role, content FROM conversation_messages WHERE thread_id = '<THREAD_ID>' ORDER BY created_at;
```

Expected:
- `runs.status = 'complete'`
- `tokens_in`, `tokens_out`, `cost_usd` populated
- Two `run_scores` rows (safety-gate + crm-hallucination)
- `conversation_messages` has every `agent.message` event, idempotently upserted

### Step 5: Clean up the test trigger

Delete the test `agent_triggers` row and storage file.

### Step 6: Record the result in the PR description

Paste the timeline output and the three SQL results into the PR description as the Scenario 12 verification evidence.

---

## Task 24: Final checks

### Step 1: Typecheck + lint + test

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All must pass. Fix anything that's broken — no `// @ts-expect-error`, no disabled eslint rules.

### Step 2: Smoke-test chat one more time

A normal chat message (not a trigger) should still work. H5 does not touch the chat adapter, but confirm nothing regressed.

### Step 3: Verify Trigger.dev task registration

```bash
pnpm tsx -e '
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
console.log(runTriggerAgent.id);
'
```

Expected: prints `run-trigger-agent`.

### Step 4: Open the PR

Use the commit prefixes as the PR title elements. Paste the Scenario 12 evidence into the description. Call out the deferred operational steps (rename script run, Anthropic agent version bump) that require coordination outside the PR.

---

## Follow-up tickets (out of scope for H5)

Add any of these that come up during implementation:

- **Nightly Anthropic session cleanup cron** — per skill §6, idle sessions are free but they accumulate in the Anthropic Console. If clutter becomes a problem, add a nightly cron that deletes sessions older than 30 days.
- **Drop `selectedChatModel` from `app/api/chat/schema.ts`** — H4 left a TODO; mechanical cleanup.
- **Admin gating abstraction** — if the admin scores dashboard is the first admin page, the gate is ad-hoc. Formalize when adding the second admin page.
- **Supabase view `run_scores_daily`** — migrate `fetchRecentScores` from JS-side aggregation to a SQL view if the dashboard ever gets slow.
- **Session-runner terminal-state distinguishing `failed` vs `complete`** — if Task 9's `retries_exhausted` test reveals the core doesn't pass this through cleanly, extend `finalizeTriggerRun` to mark runs as `failed` when appropriate.
- **Operationally run `rename-trigger-instruction-paths.ts` against production** — code is shipped in H5, but the actual rename is an operator task.
- **Run the Custom Skills migration + bump `ANTHROPIC_AGENT_VERSION` in production** — only if Task 21 shipped. Operator task.
