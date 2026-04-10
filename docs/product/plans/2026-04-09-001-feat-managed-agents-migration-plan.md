---
title: "feat: Migrate Agent Runner to Anthropic Managed Agents"
type: feat
status: active
date: 2026-04-09
updated: 2026-04-10
origin: docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md
---

# Migrate Agent Runner to Anthropic Managed Agents

## Overview

Replace Sunder's custom orchestration loop (`streamText()` + tool dispatch + compaction + context assembly) with Anthropic Managed Agents. Anthropic runs the agent loop; Sunder provides all tools as **custom tools** executed directly by the chat adapter (chat) or polling cron (triggers). UX unchanged — same chat interface, same approval prompts, same Telegram bot. New capabilities: document generation (xlsx/docx/pptx/pdf), crash-resilient execution, unlimited-duration trigger runs.

## Problem Statement

We maintain ~2,500 lines of runner infrastructure (orchestration loop, compaction, context assembly, tool dispatch, drain-and-continue, resumable streams) that Anthropic now offers as a managed service. Every improvement we make to this infrastructure is engineering time not spent on product. The migration eliminates maintenance burden while gaining autonomous execution, document generation, and prompt caching — all built into the managed service.

## Architecture Decisions (2026-04-10)

Nine decisions made during design review supersede parts of the original requirements doc. Full rationale in the **Decision Log** at the end of this document.

- **D1:** Drop CRM setup mode entirely. Dead plumbing (test-only references).
- **D2:** Ship without cross-session memory in v1. Clean slate for Anthropic memory stores.
- **D3:** Keep JIT UI via `pipeJsonRender` wrapper. Cut if empirically janky in Phase 2 testing.
- **D4:** Drop Langfuse. Use Anthropic Console + `events.list()` + in-process evaluators + Supabase-stored scores.
- **D5:** Drop the feature flag. Clean cutover via a single PR. Rollback via `git revert`.
- **D6:** Telegram approvals via existing `approval_events` indirection + new `session_id` + `tool_use_id` nullable columns.
- **D7:** Drop Railway MCP server. Superseded by D9.
- **D8:** `run_sql` and `get_agent_db_schema` are custom tools, chat-only.
- **D9:** **Drop the MCP server entirely. All tools are custom tools.** Chat path gets RLS via user-auth Supabase + explicit filters (double layer). Trigger path uses service role + explicit filters + CI lint (single layer). Endorsed by Anthropic's `shared/managed-agents-client-patterns.md` §9.

## Proposed Solution

Four-phase implementation with no parallel-runner period. Phase 2 swaps the adapter AND deletes the legacy runner in a single PR. Rollback via `git revert`.

(see origin: `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md`)

## Technical Approach

### Architecture

```
Browser → useChat (unchanged)
  ↓ POST /api/chat
Vercel Function → Chat Adapter (new)
  ↓ Anthropic SSE → UIMessageStream translation
  ↓ Custom tool dispatcher (user-auth Supabase, RLS enforced)
  ↓ pipeJsonRender wrapper (spec fences)
  ↓ Persistence (messages, approvals, scores)
  ↓ Streams to browser
Anthropic Managed Agents → Agent loop (replaces streamText)
  ↓ agent.custom_tool_use event → session pauses
  ↓ adapter executes tool, sends user.custom_tool_result
  ↓ session resumes
Supabase (unchanged, RLS enforced on chat path)
```

### Implementation Phases

#### Phase 1: Foundation

**Goal:** Schema migration + agent + environment created, tool factories ready to dispatch, no production code path uses them yet.

**Schema migration (one migration, additive only):**
- `runs` — add `session_id` (text, nullable), `events_cursor` (text, nullable)
- `clients` — add `client_profile` (text, nullable), `user_preferences` (text, nullable)
- `conversation_threads` — add `session_id` (text, nullable)
- `conversation_messages` — add `source_event_id` (text, nullable) + unique index `(thread_id, source_event_id) WHERE source_event_id IS NOT NULL` for idempotent polling-cron upserts
- `approval_events` — add `session_id` (text, nullable), `tool_use_id` (text, nullable) for Telegram approval routing
- `run_scores` — new table `(run_id, evaluator_name, score_type, score_value, comment, created_at)` for in-process evaluator output (replaces Langfuse scores)

**Data migration (one-time script):**
- For each existing client: copy `SOUL.md` → `clients.client_profile`
- For each existing client: copy `USER.md` → `clients.user_preferences`
- `MEMORY.md` and `memory/*.md` are NOT migrated (D2 — clean slate)

**Tasks:**
- [ ] Schema migration SQL + test
- [ ] Data migration script: `scripts/managed-agents/migrate-soul-to-clients.ts`
- [ ] `scripts/managed-agents/create-agent.ts` — **one-time setup**, run once per environment
  - [ ] System prompt migration from `src/lib/ai/system-prompt.ts` (~470 lines):
    - **Keep as-is:** `<your-personality>`, `<crm>` (all subsections), `<file-storage>`, `<web>`, `<external-connections>`, `<safety>`, `<asking-the-user>`, `<view-guidance>`, `<output-guidance>`, `BROWSER_AUTOMATION_PROMPT`, `MARKET_DATA_PROMPT`, `PROPERTY_LISTING_PROMPT`
    - **Rewrite:** `<filesystem>`, `<sandbox>`, `<triggers>`, `<custom-skills>`
    - **Delete:** `<memory-system>` (D2), `<subagents>` (cut from v1)
    - **Add explicit guidance:** "Do not use `run_sql`, `get_agent_db_schema`, `ask_user_question`, `create_connection`, or `reauthorize_connection` in trigger runs — they return errors in that context. Use `search_crm` for data lookups in triggers."
  - [ ] Model: `claude-sonnet-4-6`
  - [ ] Tools: `agent_toolset_20260401` with `bash` = `always_ask`, `web_fetch` and `web_search` disabled
  - [ ] **Custom tools (all Sunder tools — ~38 total):**
    - CRM: `search_crm`, `create_record`, `update_record`, `delete_records`, `link_records`, `create_interaction`, `create_task`, `update_task`, `configure_crm`, `attach_file_to_record`, `list_record_attachments`, `delete_record_attachment`, `manage_views`
    - Search: `web_search`, `web_scrape`, `calculate_drive_time`
    - Storage: `storage_read`, `storage_write`
    - Messaging: `send_message`
    - Triggers: `setup_trigger`, `manage_active_triggers`, `search_triggers`
    - Browser: `browse_website`, `search_99co`, `search_propertyguru`
    - Meetings: `search_meetings`
    - Market: `search_market_data` (conditional on env)
    - Utility: `rename_chat`, `manage_todo`, `list_todo`, `run_sql`, `get_agent_db_schema`
    - Composio: `list_composio_tools` (dispatch discovery), `execute_composio_tool` (dispatch execution), plus management tools (`list_connections`, `get_details_for_connections`, `search_integrations`, `get_integration_capabilities`, `manage_activated_tools_for_connections`, `delete_connection`)
    - Browser-side: `ask_user_question`, `create_connection`, `reauthorize_connection`
  - [ ] Skills: prebuilt `xlsx`, `docx`, `pptx`, `pdf` attached as `{type: "anthropic", skill_id: "xlsx"}` etc.
  - [ ] On creation, **store both `agent.id` and `agent.version`** in env vars (`ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`). Sessions pin to the stored version per `shared/managed-agents-core.md` §Versioning.
- [ ] `scripts/managed-agents/create-environment.ts` — one-time setup
  - [ ] `{type: "cloud", networking: {type: "unrestricted"}}`
  - [ ] Store `environment.id` in env var `ANTHROPIC_ENVIRONMENT_ID`
- [ ] Tool factories ported to `src/lib/managed-agents/tools/*`:
  - [ ] Each tool exports `(supabase, clientId, threadId?) => ToolImpl` — compatible with both chat (user-auth client) and cron (service-role client) contexts
  - [ ] CRM tool factories reuse existing logic from `src/lib/runner/tools/crm/*` — same Supabase queries, same explicit `.eq("client_id", clientId)` filters (the 38 occurrences across 13 files already enforce tenant isolation in tool code)
  - [ ] `run_sql` and `get_agent_db_schema` factories expose a `chatOnly: true` flag — cron dispatcher rejects with `{success: false, error: "Tool not available in trigger runs."}` if invoked in trigger context
- [ ] **CI lint** (AST check via ts-morph): every `supabase.from(...)` call in `src/lib/managed-agents/tools/*` must be followed by `.eq("client_id", clientId)` or have an explicit allowlist annotation. Prevents new tools from silently leaking tenants under the trigger path (service role bypasses RLS; explicit filter is the primary defense).
- [ ] **Delete CRM setup mode plumbing (D1):**
  - Remove `CRM_SETUP_SYSTEM_PROMPT`, `SETUP_SYSTEM_PROMPT` exports from `src/lib/ai/system-prompt.ts`
  - Remove `crmMode` branch in `src/lib/runner/context.ts:195`
  - Remove `mode === "setup"` branch in `src/lib/runner/tools/crm/index.ts:49`
  - Remove `crmMode` field from `src/lib/runner/schemas.ts` and `app/api/chat/schema.ts`
  - Delete `src/lib/ai/__tests__/chat-route-crm-mode.test.ts`, `src/lib/ai/__tests__/system-prompt-setup.test.ts`, `src/lib/runner/__tests__/context-crm-config.test.ts`
  - Remove `crmMode: "setup"` references from other test files
- [ ] **Delete memory system (D2):**
  - Remove `src/lib/memory/` directory
  - Remove `loadMemoryContext` call sites from `src/lib/runner/context.ts`
  - Remove memory file bootstrap from client onboarding
  - (Existing MEMORY.md / memory/*.md files in Supabase Storage are left in place — no agent code will read them after Phase 2)

**Success criteria:**
- Schema migration applied, all new columns additive, no existing code breaks
- SOUL.md / USER.md data copied to new columns for all existing clients
- Agent object created, `ANTHROPIC_AGENT_ID` and `ANTHROPIC_AGENT_VERSION` stored in env
- Environment created, `ANTHROPIC_ENVIRONMENT_ID` stored in env
- Tool factories compile and pass existing unit tests
- CI lint enforces explicit client_id filters
- CRM setup mode dead code removed, memory system deleted
- Legacy runner still handles all production traffic unchanged

#### Phase 2: Cutover

**Goal:** Chat works end-to-end through Managed Agents. Legacy runner deleted in the same PR. No feature flag, no parallel running.

**Tasks:**
- [ ] `src/lib/managed-agents/adapter.ts` — chat adapter
  - [ ] `runManagedAgent(payload, supabase)` — replaces `runAgent()`, returns `ReadableStream<UIMessageStreamPart>`
  - [ ] Session management: get or create session for thread, store `session_id` on `conversation_threads`. **Pin to `ANTHROPIC_AGENT_VERSION`** via `{type: "agent", id: ANTHROPIC_AGENT_ID, version: Number(ANTHROPIC_AGENT_VERSION)}`
  - [ ] Build kickoff content: `[client_profile] + [user_preferences] + [system_reminders] + [user's actual message]`
  - [ ] **Stream-first, then send:** open SSE stream via `client.beta.sessions.events.stream(sessionId)` BEFORE calling `events.send()` with the kickoff message. Use `Promise.all([openStream, sendKickoff])` or stream-first-then-send. Per `shared/managed-agents-client-patterns.md` §7.
  - [ ] **Event translation loop** — wraps `createUIMessageStream` output in `pipeJsonRender()` (same pattern as `app/api/chat/route.ts:374` today):
    - `agent.message` → `writer.write({type: "text-delta", ...})` per text content block
    - `agent.custom_tool_use` → dispatch to custom tool registry, emit `tool-call` UI part
    - On tool success: `writer.write({type: "tool-result", ...})` and send `events.send({type: "user.custom_tool_result", custom_tool_use_id: event.id, content: [...]})`
    - On gated tool (always_ask fired): create `approval_events` row with `session_id` + `tool_use_id = event.id`, emit approval UI part (R20 flow)
    - `span.model_request_start` → `writer.write({type: "step-start"})`
    - `span.model_request_end` → accumulate `model_usage.input_tokens` + `output_tokens` for cost tracking
    - **Terminal gate** (per skill §5 — do NOT break on bare `session.status_idle`):
      - `session.status_idle` with `stop_reason.type === "end_turn"` → finalize run, close stream
      - `session.status_idle` with `stop_reason.type === "requires_action"` → emit approval UI parts, **continue** (waiting on user, not terminal)
      - `session.status_idle` with `stop_reason.type === "retries_exhausted"` → mark run failed, close stream (terminal failure)
      - `session.status_terminated` → mark run failed, close stream (terminal)
    - `session.error` → surface error to user, log, do not automatically close (may be recoverable)
  - [ ] **Custom tool dispatcher** (`src/lib/managed-agents/dispatcher.ts`):
    - Registry: `Record<toolName, (supabase, clientId, threadId) => ToolImpl>`
    - Chat context: `dispatchTool(event, {supabase: userAuthClient, clientId, threadId})` — user auth via cookies → RLS enforced by Postgres
    - Error shape: `{success: false, error: "..."}` returned as `user.custom_tool_result` content
    - Executes in parallel when multiple `agent.custom_tool_use` events share a `requires_action.event_ids` array
  - [ ] **Stream reconnect with exact dedup pattern** (per skill §1):
    - On reconnect, open SSE stream first (buffers server-side)
    - Then fetch history via `client.beta.sessions.events.list(sessionId)` to seed `seenEventIds` set
    - Iterate live stream: dedupe handler by `event.id`, but **terminal gate checks run even for already-seen events** (critical — otherwise a terminal event in the history response deadlocks the loop via `continue`)
  - [ ] Persistence on `session.status_idle` with terminal reason (not `requires_action`):
    - `createMessages()` into `conversation_messages` using `source_event_id` from Anthropic event IDs (idempotent upsert via unique index)
    - `createApprovalEvent()` rows already created during session (not just at terminal)
    - `completeRun()` with token usage accumulated from `span.model_request_end` events
    - **Run evaluators in-process:** `safety-gate-eval` + `crm-hallucination-eval` against the event array
    - Store evaluator outputs in `run_scores` table
    - `deliverToExternalChannels()` if applicable
  - [ ] **Cost tracking:** `total_cost = (input_tokens × $3 + output_tokens × $15) / 1_000_000 + session.stats.active_seconds / 3600 × $0.08`
- [ ] Replace the `runAgent()` call in `app/api/chat/route.ts:331` with `runManagedAgent()`. Single swap, no conditional, no env var.
- [ ] **Approval handling updates:**
  - [ ] `/api/tool-confirm` route — looks up `approval_events` by `approval_id`, sends `user.tool_confirmation` event to session with stored `session_id` + `tool_use_id`
  - [ ] Telegram callback handler — same lookup pattern. Callback_data stays `approve:<approvalId>` / `deny:<approvalId>` (45 bytes, under 64-byte Telegram limit). Indirection table routes to Anthropic.
- [ ] File operations:
  - [ ] Mount uploaded files at session creation via `resources: [{type: "file", file_id, mount_path}]`
  - [ ] Mid-session uploads via `client.beta.sessions.resources.add(session_id, {type: "file", file_id})`
  - [ ] Artifact download API route (`GET /api/sessions/[sessionId]/files`): calls `files.list({scope: session_id})`, downloads each via `files.download`, uploads to Supabase Storage. Retry with exponential backoff (1s, 2s, 4s) for 1-3s indexing lag.
- [ ] Quota + rate limiting checks before `events.send()` (unchanged from current chat route; R48, R49)
- [ ] **JIT UI smoke test (D3):** send a chat message that triggers a spec-fence response, verify `pipeJsonRender` correctly splits `text-delta` + `data-spec` parts from burst-sized `agent.message` deltas. If janky: fall back to pre-splitter via `splitTextAndSpecParts()`. Last resort: cut JIT UI (R42).
- [ ] **Delete legacy runner code in the SAME PR:**
  - `src/lib/runner/run-agent.ts`
  - `src/lib/runner/compaction.ts`
  - `src/lib/runner/safety-gates.ts`
  - `src/lib/runner/drain-and-continue.ts`
  - `src/lib/runner/thread-queue.ts`
  - `src/lib/approvals/continue-after-approval.ts`
  - `src/lib/ai/gateway.ts`
  - Drop `thread_queue_records` table
  - Remove Redis resumable stream infrastructure
- [ ] **Delete Langfuse infrastructure (D4):**
  - Remove `@langfuse/otel`, `@langfuse/tracing` from `package.json`
  - Delete `src/lib/eval/langfuse-api.ts`
  - Remove `LangfuseSpanProcessor`, `registerLangfuseTracing` from `src/instrumentation.ts`
  - Remove `propagateAttributes` wrapper from adapter path
  - Remove `fetchTraceWithRetry` from `src/lib/eval/run-evaluators.ts`
  - Remove `after(() => runEvaluatorsForTrace(traceId))` hook
- [ ] **Refactor evaluators to read from event arrays instead of Langfuse observations:**
  - `src/lib/eval/extract-tool-sequence.ts` — input becomes `Event[]` from `events.list()` instead of Langfuse observations
  - `src/lib/eval/safety-gate-eval.ts` — unchanged logic, new input type
  - `src/lib/eval/crm-hallucination-eval.ts` — unchanged logic, new input type
  - Evaluator output persisted to `run_scores` table (`createScore()` → `supabase.from("run_scores").insert(...)`)

**Success criteria:**
- Full chat conversation works (send message, get response, tool calls visible, approval flow works)
- `run_sql` and `get_agent_db_schema` work in chat with RLS enforced via user-authenticated Supabase client
- Telegram approval callbacks route through `approval_events` indirection correctly
- File upload mid-conversation works
- Generated artifacts downloadable after session idle (with retry for indexing lag)
- **Stream reconnect** test verified: disconnect mid-turn, reconnect, backfill via events.list + dedup, no duplicated UI parts, terminal gate still fires
- **`retries_exhausted`** terminal state marks run as failed (not silently stalling)
- Evaluators run on session.status_idle and scores land in `run_scores` table
- `safety-gate-eval` correctly flags a known-bad test case (manual QA scenario)
- Legacy runner is deleted and `pnpm test` still passes
- Cost per turn measurable via `span.model_request_end` events + `session.stats.active_seconds`
- Rollback via `git revert` works cleanly (schema columns are additive, no data loss)

#### Phase 3: Trigger Migration

**Goal:** All triggers (cron, webhook, one-off) work through Managed Agents with async persistence via Vercel Cron.

**Tasks:**
- [ ] Trigger fire path — update `app/api/cron/scan/route.ts` and `app/api/trigger/webhook/[triggerId]/route.ts`
  - [ ] Create disposable session pinned to `ANTHROPIC_AGENT_VERSION`
  - [ ] Send `user.message` with trigger instruction
  - [ ] Store `session_id` on the `runs` row
  - [ ] Return 200 immediately (fire-and-forget)
- [ ] Polling cron at `app/api/cron/poll-trigger-runs/route.ts`
  - [ ] Configured in `vercel.json` at **1-minute interval** (Vercel Cron Pro minimum; 60s lag acceptable for fire-and-forget triggers)
  - [ ] Query `runs WHERE status = 'running' AND session_id IS NOT NULL`
  - [ ] For each: `client.beta.sessions.events.list(sessionId, {after: events_cursor})` → process new events
  - [ ] Update `events_cursor` on each poll
  - [ ] **Custom tool dispatch in cron context uses service-role Supabase client** — RLS bypassed, explicit `.eq("client_id", clientId)` filters enforce isolation (CI lint from Phase 1 catches regressions)
  - [ ] **Auto-deny chat-only custom tools:** if `agent.custom_tool_use` is for `run_sql`, `get_agent_db_schema`, `ask_user_question`, `create_connection`, or `reauthorize_connection` → send `user.custom_tool_result` with `{success: false, error: "Tool not available in trigger runs."}`
  - [ ] **Auto-deny approval-gated actions:** if `session.status_idle` with `requires_action` for a bash or other gated tool → send `user.tool_confirmation` with `result: "deny"` and `deny_message: "Approval-gated tools are not available in trigger runs."`
  - [ ] Terminal states (per skill §5):
    - `session.status_idle` with `end_turn` → finalize run, run evaluators, persist messages + scores, mark complete
    - `session.status_idle` with `retries_exhausted` → mark run failed
    - `session.status_terminated` → mark run failed
  - [ ] **Do NOT delete sessions after finalization** (per skill §6 post-idle race). Idle sessions are free per pricing; let them accumulate. Add nightly cleanup cron as follow-up if Anthropic Console becomes cluttered.
  - [ ] Idempotent message upserts via `source_event_id` unique index (handles cron crash + reprocess)
- [ ] Autopilot/pulse triggers — same disposable session pattern
- [ ] **Trigger instruction path rename (R13a):** `/agent/subagents/{name}.md` → `/agent/triggers/{name}.md` in Supabase Storage. Update `agent_triggers.instruction_path` references.

**Success criteria:**
- Cron trigger fires, agent runs autonomously, results persist via polling cron within 60s of session going idle
- Webhook trigger fires, same pattern
- Approval-gated tool during trigger run → auto-denied, agent continues with error message
- `run_sql` called in trigger run → auto-denied with "not available in trigger runs" error
- Trigger runs lasting >5 minutes complete successfully (no Vercel function timeout affects them)
- Run analytics (tokens, cost, duration) recorded correctly for trigger runs
- Polling cron crash mid-run → reprocess is idempotent (no duplicate messages, verified via unique index)

#### Phase 4: Polish

**Goal:** Debug tooling, settings UI, scores dashboard, custom skills migration.

**Tasks:**
- [ ] **Port `/debug-trace` skill to Managed Agents events API:**
  - Look up `session_id` from `conversation_threads` by thread_id (one SQL query, no Langfuse)
  - Call `client.beta.sessions.events.list(sessionId)` instead of Langfuse traces API
  - Parse events: `user.message`, `agent.message`, `agent.custom_tool_use` / `user.custom_tool_result` pairs (match by `custom_tool_use_id`), `span.model_request_start` / `span.model_request_end` pairs (for LLM call timing + token usage), `session.error`
  - Compute cost: sum `model_usage` tokens × pricing + session runtime from `session.stats.active_seconds`
  - Same 6-step workflow: extract thread id → pull events → parse timeline → analyze vs bug → trace to source → propose fix
  - Also surface: "open in Anthropic Console" link for visual debugging
- [ ] **Settings UI for `client_profile` / `user_preferences`:**
  - New settings page with two editable text fields
  - API route for CRUD on `clients.client_profile` and `clients.user_preferences`
- [ ] **Lightweight scores dashboard in admin UI:**
  - Supabase query: `SELECT score_type, AVG(score_value), COUNT(*) FROM run_scores WHERE created_at > now() - interval '30 days' GROUP BY score_type`
  - Shadcn table + simple trend chart
  - Per-client breakdown available via `run_scores → runs → clients` join
  - Replaces Langfuse's evaluator dashboard
- [ ] **Custom Skills API migration** (if actively used — user-authored workflow skills):
  - Script to upload existing `/agent/skills/{slug}/SKILL.md` files to Skills API (`POST /v1/skills`, beta header `skills-2025-10-02`)
  - Update agent creation to attach custom skills as `{type: "custom", skill_id, version}`
  - Remove `src/lib/runner/skills/discover-skills.ts`
- [ ] Connection tool naming: align `list_users_connections` → `list_connections`, `create_new_connections` → `create_connection` in system prompt and chat UI tool-call renderers

**Success criteria:**
- `/debug-trace` skill works on Managed Agents runs
- Settings UI updates client_profile / user_preferences, takes effect on next session kickoff
- Scores dashboard shows safety-gate and CRM-hallucination trends over time
- Custom skills (if migrated) load correctly in agent sessions

## Alternative Approaches Considered

| Approach | Why Rejected |
|---|---|
| MCP server on Railway | Adds deployment pipeline, JWT sharing across services, vault management, separate codebase that drifts — for ~500ms/turn performance gain. The chat adapter has user auth context that MCP doesn't, so all tools being custom preserves RLS for chat. Anthropic's own `shared/managed-agents-client-patterns.md` §9 endorses custom tools for exactly this security reason. |
| MCP server on Vercel Functions | Eliminates Railway but keeps two tool registration paths, JWT middleware, and the "lost RLS for CRM tools under MCP service role" problem. Same answer: go all-custom, single execution path. |
| Hybrid (MCP for Composio, custom for rest) | Preserves Composio's dynamic tool registration but keeps two dispatch paths + MCP SDK dependency. Option 1 dispatch tools (`list_composio_tools` + `execute_composio_tool`) handles dynamic Composio without MCP at all. |
| Two agents (chat + trigger) | Adds versioning surface area. Single agent with system prompt guidance + runtime dispatch enforcement is simpler. |
| Feature flag with 3-month parallel runners | CLAUDE.md says "YAGNI ruthlessly." For a solo-practitioner product with <100 active users, `git revert` is sufficient rollback. Saves 3 months of dual-maintenance burden and eliminates schema drift risk. |
| Cross-session memory via agent-driven storage reads | D2 prefers clean slate for Anthropic memory stores. Less transitional code to tear down when memory stores become available. |
| Thin proxy (browser-direct SSE) | `useChat` requires UIMessageStream from POST response; browser can't set API key headers; no server-side persistence |
| Session-per-message for chat | Anthropic's docs explicitly recommend long-lived sessions — the SDK + billing model are designed for session reuse across multiple interactions. Idle time is free. |
| Keep subagents in v1 | Solo practitioner CRM tasks don't need parallel workers; adds complexity |
| Keep Langfuse via OpenInference auto-instrumentation | Keeps Langfuse dependency + schema migration for evaluators. `events.list()` gives us source-of-truth data directly; in-process evaluators read events and write scores to Supabase. Simpler and tenant-native. |

## System-Wide Impact

### Interaction Graph

Chat message → Vercel Function → Chat adapter → Anthropic session event → Anthropic agent loop → `agent.custom_tool_use` event → chat adapter dispatcher (user-auth supabase) → Supabase. Approval gate: agent loop → `session.status_idle` with `requires_action` → adapter → `approval_events` row → approval card → `user.tool_confirmation` → agent resumes → tool executes or is denied. Trigger: cron scanner → Vercel Function → Anthropic session (disposable) → polling cron (every 1min) → `events.list()` → dispatcher (service-role supabase) → Supabase.

### Error & Failure Propagation

- Tool execution error → adapter sends `{success: false, error: "..."}` as `user.custom_tool_result` → agent sees error → reports to user or retries
- Anthropic session terminated → adapter/cron detects on next poll → creates new session for next message, marks failed run as failed
- Vercel Function timeout (>300s) on chat → adapter dies but agent keeps running on Anthropic → next browser load triggers reconnect with backfill → nothing lost
- Polling cron failure → trigger run persists on next poll cycle (60s delay) → idempotent via `source_event_id` unique constraint
- `session.status_idle` with `retries_exhausted` → explicit terminal state → mark run failed (not silently stalled)

### State Lifecycle Risks

- **Session/thread mapping:** `session_id` stored on `conversation_threads`. If session terminates and new one is created, old session_id is overwritten. Events from old session accessible via `events.list()` but not linked.
- **Trigger run cursor:** `events_cursor` on `runs` table. Idempotent via `source_event_id` unique constraint — reprocessing the same events is a no-op.
- **Agent version drift:** pinning sessions to `ANTHROPIC_AGENT_VERSION` means updating the agent requires bumping the env var. In-flight sessions keep their pinned version; new sessions use the new one. Rollback = bump env var back to previous version, no code deploy needed.
- **Post-idle status race** (skill §6): the SSE stream emits `session.status_idle` slightly before the session's queryable status reflects it. Do not delete/archive sessions immediately on idle — Phase 3 polling cron does NOT delete trigger sessions for this reason.

### API Surface Parity
- Chat API (`POST /api/chat`) — same request/response shape
- Telegram webhook — same inbound shape, approval callback_data format unchanged
- Trigger fire endpoints — same inbound shape
- No new public API surfaces for users

### Integration Test Scenarios
1. Full chat round-trip: send message → see tool calls → see response → send follow-up → verify context preserved
2. `run_sql` with RLS enforced: send a message asking "how many contacts do I have" → verify only this user's contacts counted
3. Approval flow: send message that triggers `delete_records` → see approval card → approve → verify record deleted
4. Trigger fire + persistence: fire cron trigger → wait 90s → verify `conversation_messages` populated and `run_scores` has evaluator output
5. Disconnect recovery: send message → close browser mid-response → reopen → verify backfill shows complete response, no duplicated messages, terminal gate fires correctly
6. File upload mid-chat: send message → upload PDF → send "summarize the PDF" → verify agent reads it
7. `retries_exhausted` handling: construct an unreachable tool target → verify run marked failed (not silently stalled)
8. Safety-gate evaluator: construct a turn that calls `delete_records` without prior `ask_user_question` → verify `run_scores` contains a safety violation entry
9. Agent version pinning: create session with pinned version, bump agent version, verify in-flight session still runs on old version
10. Cost tracking: run a turn, verify total cost calculation matches `model_usage` + `session.stats.active_seconds` math
11. Cross-tenant leak: verify that `run_sql` (via custom tool dispatcher with user auth) cannot see another tenant's contacts even if the agent tries `SELECT * FROM contacts`
12. Trigger `run_sql` rejection: fire a trigger whose instruction asks the agent to use `run_sql` → verify dispatcher returns error, agent routes around via `search_crm`

## Acceptance Criteria

### Functional Requirements
- [ ] All ~38 custom tools callable from chat path with RLS enforced via user auth
- [ ] All ~36 non-chat-gated custom tools callable from trigger path with explicit client_id filters
- [ ] Chat conversation works end-to-end (multi-turn, tool calls, text responses, spec fences render inline)
- [ ] Approval flow works for all gated tools (delete_records, configure_crm, bash, etc.)
- [ ] Telegram approval callbacks work via approval_events indirection
- [ ] Cron and webhook triggers fire-and-forget successfully
- [ ] Document generation (xlsx, docx, pptx, pdf) works via Anthropic skills
- [ ] File upload and mid-session resource addition work
- [ ] Artifact download after session idle works with retry for indexing lag
- [ ] Settings UI for client_profile and user_preferences
- [ ] Evaluators run in-process and write scores to Supabase
- [ ] `/debug-trace` skill works against Managed Agents events API
- [ ] `retries_exhausted` terminal state handled explicitly

### Non-Functional Requirements
- [ ] Chat latency within 2x of current (~500ms extra per 10-tool turn acceptable for custom tool round-trips)
- [ ] Cost per chat turn within 8x of current (~6x token cost + session runtime)
- [ ] Trigger runs complete without timeout regardless of duration
- [ ] Zero data loss on Vercel Function timeout (backfill recovery via events.list)
- [ ] Zero cross-tenant data leak (explicit client_id filters + CI lint, plus RLS on chat path)

### Quality Gates
- [ ] Custom tool dispatcher: unit tests for each tool in both chat and trigger contexts (including trigger-only rejection of chat-only tools)
- [ ] Adapter: unit tests for event translation (each event type → correct UIMessageStream part)
- [ ] Adapter: reconnect test verifying stream + events.list dedup with terminal gate correctness (terminal events in history must still fire the break)
- [ ] Polling cron: integration test with mock events.list() responses for each terminal state (`end_turn`, `retries_exhausted`, `terminated`, `requires_action` auto-deny)
- [ ] End-to-end: manual test of all 12 integration scenarios above
- [ ] CI lint: AST check for explicit client_id filter on every `supabase.from()` call in tool factories

## Success Metrics

- **P0:** All existing chat and trigger functionality works with no regression
- **P0:** No cross-tenant data leak (verified by RLS tests + CI lint + manual QA)
- **P1:** Document generation (xlsx/docx/pptx/pdf) works end-to-end
- **P1:** Trigger runs can execute for >5 minutes without timeout
- **P2:** Cost per run within 8x of current (measured over first week)
- **P2:** Evaluators (`safety-gate-eval`, `crm-hallucination-eval`) score 100% of runs (chat + trigger)

## Dependencies & Prerequisites

- Anthropic API key with Managed Agents beta access (confirmed available)
- `@anthropic-ai/sdk` TypeScript SDK (beta managed-agents methods)
- Existing `getRedisClient()` in `src/lib/redis.ts` (available for future Composio session caching if needed — not required for v1)
- Memory stores access request submitted (non-blocking — D2 ships without cross-session memory)

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ~500ms added per 10-tool chat turn vs MCP | High | Low | <10% of total turn latency; within 2x NFR budget. Acceptable tradeoff for security + simplicity. |
| Session idle auto-termination | Medium | Medium | Recovery flow handles it. Monitor in first week. Pinning agent version ensures new sessions use the same config. |
| Cost exceeds 8x target | Medium | Medium | Prompt caching reduces steady-state cost. Route simple triggers to Haiku 4.5 as follow-up if needed. |
| CI lint misses a new custom tool without explicit filter | Low | High | AST check is deterministic. Code review catches it as a second layer. Chat path has RLS as a safety net regardless. |
| `pipeJsonRender` misbehaves on burst-sized deltas from `agent.message` events | Low | Low | Phase 2 smoke test detects this. Fallback: pre-splitter via `splitTextAndSpecParts`. Last resort: cut JIT UI (R42). |
| Stream reconnect dedup loop deadlock | Low | High | Follow skill §1 exactly: terminal gate checks run even for already-seen events. Unit test verifies this. |
| Custom tool round-trip adds to trigger run wall-clock | Medium | Low | Trigger runs are fire-and-forget; latency is not user-visible. 60s polling cron lag per trigger run is acceptable. |

## Future Considerations

- **Memory stores:** When access granted, create one per client, attach as `read_write` resource on every session. Replaces need for `client_profile`/`user_preferences` injection long-term.
- **Callable agents:** When GA, replace in-agent sequential work with native delegation. Currently cut from v1.
- **Model routing:** Haiku 4.5 for simple trigger runs, Sonnet for chat. Different agent objects per tier.
- **Step limits:** Client-side step counting in adapter + `user.interrupt` if needed. Monitor first.
- **Nightly trigger session cleanup:** If Anthropic Console becomes cluttered with disposable trigger sessions, add a cleanup cron that deletes terminated sessions older than 30 days.
- **Sub-60s trigger persistence lag:** If 60s polling lag ever becomes user-visible, evaluate push-based persistence patterns.

## Decision Log

Decisions made during design review on 2026-04-10. Each supersedes the corresponding part of the original requirements doc.

**D1 — Drop CRM setup mode entirely.** The `crmMode: "setup"` feature is wired end-to-end (chat schema, runner, context, tool registry) but **zero production callers exist** — all references are in test files. The safety guarantee it would provide is already covered by `configure_crm` being `always_ask` per R19. YAGNI.

**D2 — No cross-session memory in v1.** R22/R24 ship without cross-session memory. Clean slate for Anthropic memory stores when access is granted. Drop `src/lib/memory/` entirely including bootstrap file seeding. SOUL.md → `client_profile` and USER.md → `user_preferences` data migration for existing clients. MEMORY.md and memory/*.md files are NOT migrated.

**D3 — JIT UI via `pipeJsonRender`.** The existing `pipeJsonRender` from `@json-render/core` handles spec fence detection incrementally. The adapter wraps its UIMessageStream output in `pipeJsonRender` exactly like `app/api/chat/route.ts:374` does today. Phase 2 smoke test verifies it works with burst-sized `agent.message` deltas. If janky, pre-splitter fallback via `splitTextAndSpecParts`; last resort cut JIT UI.

**D4 — Drop Langfuse.** Anthropic provides session observability via Console + `events.list()` + `span.model_request_end.model_usage`. Evaluators refactored to read event arrays directly. Scores stored in new `run_scores` table. Delete `@langfuse/otel`, `@langfuse/tracing`, `langfuse-api.ts`, `propagateAttributes`, `fetchTraceWithRetry`, `after(runEvaluatorsForTrace)` hook. Replaces R51. `/debug-trace` skill ports to use `events.list()` + Supabase session_id lookup.

**D5 — Drop feature flag.** No `RUNNER_ENGINE=managed|legacy` env var. Single cutover PR that swaps the adapter AND deletes the legacy runner. Rollback via `git revert`. CLAUDE.md says YAGNI.

**D6 — Telegram via `approval_events` indirection.** Existing `approval_events` table has `approval_id` as the opaque indirection ID that fits in Telegram's 64-byte `callback_data` limit (current format: `approve:<uuid>` = 45 bytes). Add nullable `session_id` and `tool_use_id` columns. Telegram callback handler looks up Anthropic routing info from the DB before sending `user.tool_confirmation`. Same indirection pattern as today. Option A: one approval card per gated tool call when Managed Agents batches them into a single `requires_action` event list.

**D7 — Drop Railway.** Superseded by D9. Original rationale: Vercel Functions can serve MCP Streamable HTTP, existing `getRedisClient()` covers Composio cache, Vercel Cron covers the 1-min polling interval. D9 made this moot by dropping MCP entirely.

**D8 — `run_sql` and `get_agent_db_schema` as custom tools.** MCP server has no user auth context → RLS bypassed → `run_readonly_sql` (which is SECURITY INVOKER) leaks cross-tenant data because the underlying `row_count` queries in `get_client_accessible_schema` also run under service role and return totals across all tenants. Custom tools run in the chat adapter context which HAS user auth → RLS enforced unchanged. Trigger runs reject `run_sql` and `get_agent_db_schema` via polling cron with "not available in trigger runs" error. System prompt guides trigger runs away from them.

**D9 — Drop MCP entirely, all tools as custom.** Extending D8's logic to all tools. The chat adapter has user-authenticated Supabase via `await createClient()` (cookies); the MCP server path would only have a JWT Sunder made up and service role. Custom tools in the adapter give chat-path RLS enforcement for all 38 tools (explicit filters + RLS = double layer). Trigger path still uses service-role + explicit filters (single layer) + CI lint. **Endorsed by Anthropic's `shared/managed-agents-client-patterns.md` §9 "Keep credentials host-side via custom tools"** — our exact use case: user's Supabase auth token is a "key tied to a human session" that shouldn't live in a server-to-server call. ~500ms/turn latency cost vs MCP is <10% of turn latency and within 2x NFR. Eliminates: MCP SDK dependency, Phase 1 spike risk, JWT middleware, vault management, cross-service secret sharing, dual tool registration paths, and the Railway question entirely. Composio uses two dispatch tools (`list_composio_tools`, `execute_composio_tool`) that call Composio SDK directly from the adapter instead of MCP server dynamic registration.

### Tactical additions from claude-api skill verification

Five operational gotchas flagged by `shared/managed-agents-client-patterns.md` during 2026-04-10 design review:

- **Pin agent versions** — Phase 1 stores `ANTHROPIC_AGENT_VERSION` alongside `ANTHROPIC_AGENT_ID`. Sessions pin via `{type: "agent", id, version}`. Rolling out an agent update = bump env var. Rollback = bump back. (Pattern: `managed-agents-core.md` §Versioning)
- **Stream reconnect with correct terminal gate** — on reconnect, open stream first (buffers server-side), then fetch history via `events.list()`, dedupe by event.id, BUT terminal gate checks (`status_terminated`, `status_idle` with non-`requires_action` stop_reason) run even for already-seen events. Otherwise a terminal event in the history response causes a silent deadlock. (Pattern §1)
- **Handle `retries_exhausted` terminal state** — not just `end_turn` and `session.status_terminated`. `stop_reason.type === "retries_exhausted"` is a terminal failure. Both adapter and polling cron handle it. (Pattern §5)
- **Don't delete trigger sessions after finalization** — post-idle status-write race → 400 on immediate delete. Idle sessions are free per pricing; let them accumulate. Nightly cleanup cron if needed as follow-up. (Pattern §6)
- **Stream-first, then send** — open SSE stream before calling `events.send()` for the kickoff event. Otherwise early events may be missed. (Pattern §7)

## Sources & References

### Origin
- **Origin document:** [docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md](docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md) — Key decisions from the original ideation pass. Superseded in parts by D1–D9 above.
- **Spike results:** [docs/product/ideations/2026-04-09-managed-agents-spike-results.md](docs/product/ideations/2026-04-09-managed-agents-spike-results.md) — Session creation ~550ms, per-tool MCP configs validated (now moot with D9).
- **claude-api skill verification:** 2026-04-10 design review verified all decisions against Anthropic's official `shared/managed-agents-*.md` docs from the `claude-api` skill. Five tactical additions above came from this pass.

### Internal References (pre-cutover)
- Current runner: `src/lib/runner/run-agent.ts:138` — `runAgent()` entry point (deleted in Phase 2)
- Chat route swap point: `app/api/chat/route.ts:331` — where `runAgent()` becomes `runManagedAgent()`
- Tool registry: `src/lib/runner/tool-registry.ts:38` — `createRunnerTools()` (migrates to `src/lib/managed-agents/tools/*`)
- System prompt: `src/lib/ai/system-prompt.ts:149` — `SYSTEM_PROMPT` (migrated to agent `system` field)
- Safety gates: `src/lib/runner/safety-gates.ts:8` — `GATED_TOOLS` (deleted, replaced by in-adapter approval flow via `approval_events`)
- Model pricing: `src/lib/ai/models.ts:50` — Gemini 3 Flash at $0.50/$3.00 (current baseline)
- Approval events: `supabase/migrations/20260310000000_create_approval_events.sql` — existing table, extended with `session_id` + `tool_use_id`
- SQL helpers: `supabase/migrations/20260305030001_create_sql_helper_functions.sql` — `run_readonly_sql` + `get_client_accessible_schema` (SECURITY INVOKER, unchanged — invoked from chat adapter with user-auth supabase)

### External References
- Anthropic Managed Agents: https://platform.claude.com/docs/en/managed-agents/overview
- Permission policies: https://platform.claude.com/docs/en/managed-agents/permission-policies
- Events and streaming: https://platform.claude.com/docs/en/managed-agents/events-and-streaming
- Session tracing (observability): https://platform.claude.com/docs/en/managed-agents/observability
- Custom tool client patterns: `claude-api` skill `shared/managed-agents-client-patterns.md` (§1, §5, §6, §7, §9)
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
