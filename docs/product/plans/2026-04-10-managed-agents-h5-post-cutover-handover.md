# Handover H5: Managed Agents Migration — Post-Cutover (Triggers + Polish)

## Your job

Generate **one TDD tasklist** that covers the post-cutover work: per-trigger listener task + debug-trace skill port + settings UI + scores dashboard. Follow the tasklist generation rule already in your memory (`feedback_tasklist_generation_rule.md`). Save the output to:

```
docs/product/tasks/2026-04-10-managed-agents-h5-post-cutover-tasklist.md
```

Do NOT implement the code yourself. Your output is the tasklist. Someone else executes it.

## Big picture (60 seconds)

By the time you run, Sunder's production chat traffic has already migrated to Anthropic Managed Agents (H4 shipped). Your job is the remaining post-cutover work:

1. **Per-trigger listener task (Trigger.dev)** — the background worker that runs when a trigger fires, consumes the Anthropic session's SSE stream in real-time, dispatches custom tools, and persists results
2. **Debug tooling** — port the `/debug-trace` skill from Langfuse to Anthropic `events.list()`
3. **Settings UI** — let users edit `client_profile` and `user_preferences`
4. **Scores dashboard** — admin view of safety-gate and crm-hallucination trends
5. *(Optional)* Custom Skills API migration if user-authored workflow skills are actually used
6. Connection tool naming alignment

**Critical architecture note:** Sunder already uses Trigger.dev for background work (see `src/trigger/scan-triggers.ts` and `trigger.config.ts`). The trigger listener pattern is NOT a polling cron. It is a **long-running per-trigger-run Trigger.dev task** that wraps the H3 session runner core and consumes Anthropic events in real-time. This matches chat-run behavior: tools dispatch immediately, messages persist as they arrive, no polling lag.

## Files to read first (in order)

1. **Plan doc:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — focus on:
   - Phase 3 entirety (triggers — note the plan describes polling, but H5 uses a listener instead; the underlying requirements are the same)
   - Phase 4 entirety (polish)
   - Decision Log D4 (scores dashboard, debug-trace rationale), D6 (approvals background)
2. **Existing Trigger.dev pattern (your reference):**
   - `trigger.config.ts` — `maxDuration: 3600` (1 hour) as the default for tasks
   - `src/trigger/scan-triggers.ts` — existing scheduled task. **Note: your listener task uses `task()` not `schedules.task()`** — it's programmatically triggered, not cron-scheduled. Reference the Trigger.dev v3 docs at https://trigger.dev/docs/tasks for the `task()` API.
   - `src/lib/env.ts` — `TRIGGER_SECRET_KEY` is already set up
3. **claude-api skill:** run `/claude-api` in your session and load:
   - `shared/managed-agents-events.md` — event types reference
   - `shared/managed-agents-client-patterns.md` §1 (reconnect), §5 (terminal gate)
   - `shared/managed-agents-api-reference.md` — for `events.list()` and `events.stream()` signatures
4. **H3 deliverables (already merged by the time you run) — these are your primary dependencies:**
   - `src/lib/managed-agents/session-runner.ts` — **core event consumption logic with callback interface.** This is what your listener task imports and wraps in Trigger.dev plumbing. H3 built this as a reusable module precisely so chat (via the adapter) and triggers (via your listener) share the same core.
   - `src/lib/managed-agents/dispatcher.ts` — custom tool dispatcher
   - `src/lib/managed-agents/adapter.ts` — the chat wrapper around session-runner. Read this for reference — your listener is the trigger wrapper around the same session-runner.
   - `src/lib/eval/extract-tool-sequence.ts` — has both Langfuse and Event[] overloads; you use the Event[] path
   - `src/lib/eval/run-scores-writer.ts`
5. **Current trigger code (to update):**
   - `app/api/cron/scan/route.ts` — cron scanner that fires triggers. H4 likely ported the fire path to spawn your listener task; double-check and complete if not.
   - `app/api/trigger/webhook/[triggerId]/route.ts` — webhook trigger fire endpoint
   - `src/lib/triggers/*` — trigger persistence helpers
6. **Current debug-trace skill (to port):**
   - `.claude/skills/debug-trace/SKILL.md` — the current Langfuse-based skill
7. **For settings UI:**
   - `src/app/settings/` or wherever settings pages live — convention reference
   - `clients` table schema (H1 added `client_profile` and `user_preferences` columns)
8. **For scores dashboard:**
   - `run_scores` table (H1 created it, H3 wired evaluators to write to it)
   - Admin UI reference: grep for an existing admin/dashboard page in `src/app/admin/*`

## Your scope

Five parts. Structure as distinct tasks that can ship independently if needed.

### Part A — Per-trigger listener task (the big one)

**`src/trigger/run-trigger-agent.ts`** — Trigger.dev task that runs when a trigger fires and consumes its Anthropic session in real-time.

```typescript
// Pseudocode
import { logger, task } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/server";
import { consumeAnthropicSession } from "@/lib/managed-agents/session-runner";

export const runTriggerAgent = task({
  id: "run-trigger-agent",
  maxDuration: 3600,  // 1 hour, matches trigger.config.ts default
  run: async (payload: {
    runId: string;
    sessionId: string;
    clientId: string;
    threadId: string;
  }) => {
    const supabase = await createAdminClient();  // service-role, no user auth in background tasks
    
    // Reuse H3's session runner — same event loop, dispatch, persistence, terminal gate
    const result = await consumeAnthropicSession({
      sessionId: payload.sessionId,
      context: {
        supabase,
        clientId: payload.clientId,
        threadId: payload.threadId,
        isChatContext: false,  // triggers reject chatOnly tools (run_sql, get_agent_db_schema, ask_user_question, create_connection, reauthorize_connection)
      },
      // Trigger-specific overrides
      autoDenyApprovals: true,  // triggers can't show approval UI
      autoDenyMessage: "Approval-gated tools are not available in trigger runs.",
      persistIncrementally: true,  // stream persistence so user sees progress if they open the run page mid-execution
      onTerminal: async (events, cost) => {
        // Finalize run: persist final state, run evaluators, write scores, mark complete
        await finalizeTriggerRun(supabase, payload.runId, events, cost);
      },
    });
    
    logger.info("Trigger run completed", { runId: payload.runId, status: result.status });
    return result;
  },
});
```

**How it gets triggered:** From the trigger fire path (in `app/api/cron/scan/route.ts` or `app/api/trigger/webhook/[triggerId]/route.ts`, depending on where H4 left it):

```typescript
import { runTriggerAgent } from "@/trigger/run-trigger-agent";

// After creating the Anthropic session and sending the user.message:
await runTriggerAgent.trigger({
  runId: run.run_id,
  sessionId: session.id,
  clientId: run.client_id,
  threadId: run.thread_id,
});

return Response.json({ status: "queued" }, { status: 200 });
```

**If H4 stubbed the fire path**, your tasklist should include completing it:
- Create disposable Anthropic session pinned to `ANTHROPIC_AGENT_VERSION`
- Send `user.message` event with the trigger instruction (existing logic reads `agent_triggers.instruction_path` from Supabase Storage)
- Store `session_id` on the `runs` row
- Spawn `runTriggerAgent.trigger(...)` task
- Return 200 immediately

**Critical behaviors** (enforced by the session-runner core, but verify in your tasklist):
- **Service-role Supabase** for tool dispatch (no user auth in background tasks). The H2 CI lint ensures every `.from()` has an explicit `.eq("client_id", clientId)` filter, which is the primary defense.
- **Auto-deny chat-only tools** (`run_sql`, `get_agent_db_schema`, `ask_user_question`, `create_connection`, `reauthorize_connection`) with `{success: false, error: "Tool not available in trigger runs. Use search_crm instead."}`. The session-runner from H3 already does this via `context.isChatContext: false`.
- **Auto-deny approval-gated tools** (bash, etc.) with `user.tool_confirmation` `{result: "deny", deny_message: "Approval-gated tools are not available in trigger runs."}`. Pass `autoDenyApprovals: true` to the session runner.
- **Incremental persistence** — messages persist as they arrive, not only on terminal state. If a user opens the run detail page while the trigger is running, they see updates in real-time just like chat.
- **Idempotent upserts** via `source_event_id` (from H1's unique index on `conversation_messages`). Safe to retry on crash.
- **Terminal states** per skill §5:
  - `session.status_idle` with `stop_reason.type === "end_turn"` → **finalize**: persist final state via `completeRun()`, run evaluators via `runEvaluatorsForEvents()` (from H3), write to `run_scores`, mark run complete
  - `session.status_idle` with `stop_reason.type === "retries_exhausted"` → mark run failed with error "Managed agent exhausted retries"
  - `session.status_idle` with `stop_reason.type === "requires_action"` → handle via `autoDenyApprovals: true` (auto-respond, keep consuming the stream)
  - `session.status_terminated` → mark run failed
- **Reconnect on Trigger.dev retry** — if the task crashes and retries, the session-runner's reconnect pattern (from H3, per skill §1) re-opens the stream, fetches history via `events.list()`, dedupes by `event.id` with terminal gate checks running even for seen events. The retry is transparent.
- **No session deletion after finalization.** Idle sessions are free per Anthropic pricing. Let them accumulate. (The skill §6 race condition doesn't apply here because the listener finalizes inline — no separate cleanup step that races with the idle transition. But you ALSO don't need to delete; it's just wasted effort.)

**`finalizeTriggerRun` helper** (`src/lib/managed-agents/finalize-trigger-run.ts` or inline in the task):

```typescript
export async function finalizeTriggerRun(
  supabase: SupabaseClient<Database>,
  runId: string,
  events: AgentEvent[],
  cost: { inputTokens: number; outputTokens: number; runtimeSeconds: number },
) {
  // Persist any remaining messages (session-runner's incremental persistence handles most of this)
  // Update runs row with final status, tokens, cost
  await supabase.from("runs").update({
    status: "complete",
    tokens_in: cost.inputTokens,
    tokens_out: cost.outputTokens,
    cost_usd: (cost.inputTokens * 3 + cost.outputTokens * 15) / 1_000_000 + (cost.runtimeSeconds / 3600) * 0.08,
  }).eq("run_id", runId);
  
  // Run evaluators in-process
  const toolSequence = extractToolSequenceFromEvents(events);
  const safetyResult = evaluateSafetyGate(toolSequence);
  const crmResult = evaluateCrmHallucination(toolSequence);
  
  // Write scores to run_scores table
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

**Unit tests for the listener task:**
- Mock `consumeAnthropicSession` from session-runner. The task itself is thin — most logic lives in the H3 core. Unit test focus: correct context passing (`isChatContext: false`, `autoDenyApprovals: true`), correct finalization call, correct error handling (if core throws, task should re-throw so Trigger.dev retries).
- Integration test with a real mocked session-runner behavior: fire a task payload, verify run row transitions to complete, verify scores written, verify messages persisted with `source_event_id`.
- Idempotency test: run the task twice with the same payload (simulating Trigger.dev retry on crash) → verify no duplicate messages (unique index works).
- `retries_exhausted` test: session-runner terminal with `retries_exhausted` → run marked failed, not complete.
- `run_sql` in trigger test: mock events with `agent.custom_tool_use` for `run_sql` → verify the dispatcher rejects with chat-only error → agent sees the error result → continues. (This is "Integration Test Scenario 12" from the plan, which was deferred from H4.)

### Part B — Trigger instruction path rename

Per plan R13a: rename `/agent/subagents/{name}.md` → `/agent/triggers/{name}.md` in Supabase Storage.

Write a one-off migration script `scripts/managed-agents/rename-trigger-instruction-paths.ts`:
- Lists all files in Supabase Storage under `/agent/subagents/`
- Copies each to `/agent/triggers/` with the same filename
- Updates `agent_triggers.instruction_path` references in the DB
- Deletes the old files
- Idempotent (safe to re-run)

Unit tests with mocked Supabase Storage.

### Part C — Port `/debug-trace` skill

Current skill at `.claude/skills/debug-trace/SKILL.md` uses Langfuse CLI to pull traces. Port to use Anthropic `events.list()`.

**New flow:**
1. Extract thread ID from screenshot URL (unchanged)
2. Look up `session_id` from `conversation_threads` via Supabase: `SELECT session_id FROM conversation_threads WHERE thread_id = ?`
3. Call `client.beta.sessions.events.list(sessionId)` — returns the canonical event history
4. Parse events:
   - `user.message` → "User: <first 100 chars>"
   - `agent.message` → "Agent: <first 100 chars>"
   - `agent.custom_tool_use` / `user.custom_tool_result` pairs (match by `custom_tool_use_id`) → "Tool: <name>(<input>) → <output summary>"
   - `agent.tool_use` / `agent.tool_result` pairs (bash etc.) → same
   - `span.model_request_start` / `span.model_request_end` pairs → "LLM call: <duration>ms, <tokens> tokens"
   - `session.error` → flag as error
5. Compute cost: sum `span.model_request_end.model_usage` tokens × Sonnet 4.6 pricing + `session.stats.active_seconds × $0.08/3600`
6. Same 6-step analysis workflow as current skill: extract → pull events → parse timeline → analyze vs bug → trace to source → propose fix
7. **Bonus:** surface an "open in Anthropic Console" link (format: check actual URL structure from Anthropic Console when you run it once)

Update the SKILL.md file. The skill invokes the Anthropic SDK via a tsx helper script:

```bash
# In the skill instructions:
source .env.local && pnpm tsx scripts/debug-trace/fetch-events.ts <SESSION_ID>
```

Create the helper script `scripts/debug-trace/fetch-events.ts` that:
- Takes session ID as arg
- Calls `client.beta.sessions.events.list(sessionId)` + `client.beta.sessions.retrieve(sessionId)` for stats
- Pretty-prints the timeline with cost breakdown

Unit tests for the helper script: mock `events.list` response, verify parsed output format.

### Part D — Settings UI for `client_profile` / `user_preferences`

New settings page at `src/app/settings/agent-context/page.tsx` (or wherever matches existing settings layout):
- Two editable textareas: "Agent Personality" (`client_profile`) and "User Profile" (`user_preferences`)
- Markdown-friendly (monospace font or hint), character counter
- Save button → PUTs to a new API route
- Loads current values on mount

API route at `src/app/api/settings/agent-context/route.ts`:
- `GET` returns `{ client_profile, user_preferences }` for the current user
- `PUT` accepts `{ client_profile?, user_preferences? }`, updates the `clients` row, returns success
- Auth via existing Supabase session middleware (RLS handles tenant scoping)
- Cap input length at 100k chars to avoid Anthropic request size issues

Unit tests:
- `GET` returns correct shape
- `PUT` updates the row
- `PUT` with unauthorized user → 401
- `PUT` with too-long content → 400
- Component: renders existing values, save button disabled when no changes, save triggers API call

### Part E — Scores dashboard

Simple admin dashboard page at `src/app/admin/scores/page.tsx` (gated to admin role or your test account).

Queries:
```sql
SELECT 
  evaluator_name,
  score_type,
  AVG(score_value) as avg_score,
  COUNT(*) as run_count,
  date_trunc('day', created_at) as day
FROM run_scores
WHERE created_at > now() - interval '30 days'
GROUP BY evaluator_name, score_type, day
ORDER BY day DESC;
```

Display:
- Shadcn table with columns: day, evaluator, score_type, avg_score, run_count
- Simple trend chart
- Per-client breakdown via `JOIN runs ON run_scores.run_id = runs.run_id` then `GROUP BY clients`

Replaces Langfuse's evaluator dashboard. Read-only, good enough for internal use.

Unit tests for the query helper (mocked Supabase client → verify SQL shape).

### Part F — Optional: Custom Skills API migration

**Gate this on actual usage first.** Check if any clients currently have files under `/agent/skills/{slug}/SKILL.md` in Supabase Storage. If none, skip this task entirely (YAGNI).

If custom skills are actively used:
1. Create `scripts/managed-agents/migrate-custom-skills.ts`
2. For each client's SKILL.md files, upload via `POST /v1/skills` with beta header `skills-2025-10-02`
3. Update `scripts/managed-agents/create-agent.ts` to include custom skills: `skills: [...prebuilt, ...custom.map(s => ({type: "custom", skill_id: s.id, version: "latest"}))]`
4. Bump the agent version (run `agents.update()` with the new skills list)
5. Store the new version number as `ANTHROPIC_AGENT_VERSION` env var
6. Delete `src/lib/runner/skills/discover-skills.ts` (already deleted by H4? double-check)

Document that running this script creates a new agent version — coordinate with whoever operates the deployment.

### Part G — Connection tool naming alignment

Per plan Phase 4: align `list_users_connections` → `list_connections` and `create_new_connections` → `create_connection` in:
- System prompt (migrated into the agent — this requires a new agent version + env var bump)
- `src/components/chat/tool-call-inline.tsx` or wherever tool-call UI rendering is

If you update the agent's system prompt, bump `ANTHROPIC_AGENT_VERSION` via `agents.update()`.

Small cosmetic cleanup. Group with Part F or make it its own task.

## Entry state (assume after H1, H2, H3, H4)

- Managed Agents runs production chat traffic
- Legacy runner deleted
- Langfuse deleted
- All tool factories in `src/lib/managed-agents/tools/*`
- **Session runner core** at `src/lib/managed-agents/session-runner.ts` exists, built by H3 as a reusable module with callback interface
- **Chat adapter** at `src/lib/managed-agents/adapter.ts` wraps session-runner for chat
- `dispatcher.ts` live
- Evaluators refactored to read `Event[]` and write to `run_scores`
- `approval_events` has `session_id` + `tool_use_id` columns
- Trigger.dev already integrated (see `trigger.config.ts`, `src/trigger/scan-triggers.ts`, `TRIGGER_SECRET_KEY` env)
- H4 has ported (or stubbed) the trigger fire path to spawn a Trigger.dev task — you complete this if stubbed

## Exit state

- `src/trigger/run-trigger-agent.ts` live: triggers fire, background Trigger.dev task consumes Anthropic session in real-time, tools dispatch immediately, messages persist incrementally, runs finalize on terminal state — **wall-clock behavior is comparable to chat runs** (no polling lag)
- `/debug-trace` skill works against Managed Agents `events.list()`
- Settings UI shipped
- Scores dashboard shows safety-gate and crm-hallucination trends
- Trigger instruction paths renamed from `/agent/subagents/` to `/agent/triggers/`
- Custom Skills API migrated if applicable (or documented as skipped)
- Connection tool names aligned
- All 12 integration scenarios from the plan pass (scenario 12: trigger `run_sql` rejection is verified here)
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass

## Key decisions that apply to your scope

- **D4** — Langfuse replaced with `events.list()` + in-process evaluators + `run_scores` Supabase table. Powers the scores dashboard and debug-trace skill.
- **D9** — All tools custom, tool dispatcher shared between chat (user-auth) and trigger (service-role). Your listener uses the same dispatcher from H3 with `isChatContext: false`.
- **Skill §1** — Reconnect pattern handles Trigger.dev retry transparently via events.list + dedup + terminal gate. No custom resume logic needed.
- **Skill §5** — `retries_exhausted` is a terminal state. Listener finalizes as failed, not complete.

## Why not a polling cron?

Earlier iterations of this plan used a Vercel Cron polling pattern. That was wrong because:

- **Each custom tool call in a trigger adds up to 60s of polling lag.** For a trigger with 10 sequential tool calls, that's 10 minutes of wall-clock latency on top of Anthropic's actual compute time. Bulk processing triggers (e.g., "process 50 inbound leads") become unusable.
- **Messages only persist on terminal state** in a polling model, so users who open the run detail page mid-execution see an empty screen for 5+ minutes.
- **The listener reuses 100% of the H3 chat adapter's core logic** (event consumption, dispatch, persistence, evaluators). Polling would have required a separate persistence code path with its own idempotency dance.
- **Trigger.dev is purpose-built for long-running background tasks.** Using it as a 60-second ticker underutilizes the tool and inherits Vercel Cron's constraints for no reason. `trigger.config.ts` sets `maxDuration: 3600` — plenty for any realistic trigger run.
- **User experience is dramatically better.** A morning briefing trigger that should complete in 15 seconds takes 5+ minutes in polling. The difference is visceral.

**The listener is architecturally identical to a chat run with a no-op output sink.** Same session creation → stream consumption → tool dispatch → persistence → terminal gate → finalization. The only difference is what happens to agent text: chat streams to browser via UIMessageStream, trigger persists to `conversation_messages` and Telegram-delivers via `send_message` tool.

## Gotchas / non-negotiables

- **Listener wraps H3's `session-runner` core — do NOT reimplement event translation, tool dispatch, or terminal gate logic.** Those live in H3. If you find yourself rewriting the event loop, stop — import from `@/lib/managed-agents/session-runner` instead.
- **`isChatContext: false`** on the dispatcher context. This is how chat-only tools get rejected in trigger runs. The dispatcher from H3 already enforces it.
- **`autoDenyApprovals: true`** on the session-runner options. This tells the core to auto-respond to `session.status_idle` with `requires_action` by sending `user.tool_confirmation` with `deny`. Alternatively, the session-runner accepts an `onApprovalRequired` callback — your listener provides one that auto-denies.
- **Incremental persistence** so the run detail page shows live progress if the user watches. The session-runner supports this via `persistIncrementally: true` (or equivalent option H3 defines).
- **Trigger.dev retries are automatic.** If the task crashes, Trigger.dev retries based on `trigger.config.ts` retry settings (default: 3 attempts). The session-runner's reconnect pattern (skill §1) handles re-entering a session transparently — open stream, fetch history, dedupe by `event.id`, terminal gate checks run even for seen events. **Do NOT add custom retry logic on top.** Let Trigger.dev + the reconnect pattern handle it.
- **`source_event_id` idempotency is the safety net.** The unique index from H1 (`conversation_messages (thread_id, source_event_id)`) ensures retries don't duplicate messages. Use `upsert({...}, { onConflict: "thread_id,source_event_id", ignoreDuplicates: true })`.
- **Service-role Supabase in listener context** (no user cookies in background tasks). Tools rely on explicit `.eq("client_id", clientId)` filters — enforced by H2's CI lint.
- **Do NOT delete sessions after finalization.** Idle sessions are free per Anthropic pricing. Future cleanup cron is out of scope for H5.
- **Scenario 12 is a go/no-go gate for H5:** fire a trigger whose instruction asks the agent to use `run_sql`. Verify the dispatcher auto-rejects with the chat-only error, agent routes around via `search_crm`, and the trigger completes successfully.
- **Settings UI should validate input length** — cap at 100k chars to avoid Anthropic request size issues.
- **Scores dashboard is for internal use only.** Don't over-engineer.
- **Don't include scope beyond this handover.** If you find follow-up work during investigation, document it as a follow-up ticket at the end of your tasklist, not as a new task.

## Output format reminder

Follow the tasklist generation rule in memory. Structure:

```markdown
# Managed Agents Migration — H5 Post-Cutover

**Goal:** [one sentence — complete the migration with real-time trigger execution + polish]

**Architecture:** [2-3 sentences — Trigger.dev per-trigger listener task wraps H3 session-runner, no polling, real-time dispatch]

**Tech Stack:** [Trigger.dev v3, Anthropic SDK, Supabase, Shadcn, Next.js App Router]

## Relevant Files

### Create
- `src/trigger/run-trigger-agent.ts` — Trigger.dev task
- `src/lib/managed-agents/finalize-trigger-run.ts` — helper for terminal-state finalization (if not inlined in the task)
- `scripts/managed-agents/rename-trigger-instruction-paths.ts`
- `scripts/debug-trace/fetch-events.ts`
- `src/app/settings/agent-context/page.tsx`
- `src/app/api/settings/agent-context/route.ts`
- `src/app/admin/scores/page.tsx`
- Unit test files for each

### Modify
- `.claude/skills/debug-trace/SKILL.md` — port from Langfuse to events.list
- `app/api/cron/scan/route.ts` (if trigger fire path needs completion — H4 may have stubbed)
- `app/api/trigger/webhook/[triggerId]/route.ts` (if needed)
- `src/components/chat/tool-call-inline.tsx` (connection tool naming)
- `scripts/managed-agents/create-agent.ts` (if Part F custom skills migration runs — bumps agent version)

### Delete
- (if applicable) `src/lib/runner/skills/discover-skills.ts` — if H4 didn't already

---

## Task 1: Per-trigger listener task (run-trigger-agent)
...

## Task 2: Complete trigger fire path (if stubbed by H4)
...

## Task 3: Finalize trigger run helper
...

## Task 4: Trigger instruction path rename script
...

## Task 5: Port /debug-trace skill
...

## Task 6: Settings UI — backend API route
...

## Task 7: Settings UI — frontend page
...

## Task 8: Scores dashboard
...

## Task 9: [Conditional] Custom Skills API migration
...

## Task 10: Connection tool naming alignment
...

## Task 11: Integration Scenario 12 verification (go/no-go gate)
...
```

Each bite-sized step must be 2-5 minutes of actual work.

Commit messages use `feat(h5):`, `chore(h5):`, `refactor(h5):`.

## Scale estimate

- Trigger listener task: ~200 LOC (thin wrapper around H3 core)
- Finalize helper: ~100 LOC
- Trigger path rename: ~100 LOC
- Debug-trace port: ~200 LOC
- Settings UI: ~300 LOC
- Scores dashboard: ~300 LOC
- Custom Skills migration: ~150 LOC (optional)
- Connection naming: ~20 LOC
- Total: ~15-20 files, ~1200-1400 LOC

## One last thing

When you've generated the tasklist, end your response with:

> "Tasklist complete and saved to `docs/product/tasks/2026-04-10-managed-agents-h5-post-cutover-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint."

Then stop. Do not start implementing.
