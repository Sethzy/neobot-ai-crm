---
date: 2026-04-09
topic: managed-agents-migration
---

# Migrate Agent Runner to Anthropic Managed Agents

## Problem Frame

Sunder's agent runner is a custom orchestration loop built on Vercel AI SDK (`streamText()` + tool dispatch + compaction + context assembly). It works, but we're maintaining infrastructure that Anthropic now offers as a managed service: agent loop, tool execution sandbox, prompt caching, context compaction, and memory persistence.

Migrating to Managed Agents eliminates custom infrastructure while gaining: document generation (Excel, PowerPoint, Word, PDF) via the sandbox, autonomous long-running sessions (Notion-style "fire and forget"), and CRM tools via MCP (no custom tool round-trips). UX stays identical — this is an infra swap, not a product change.

## Architecture Overview

```
┌─ BROWSER ────────────────────────────────────────────────────┐
│  Chat UI renders events from Anthropic SSE stream.            │
│  Sends messages via short Vercel API calls.                   │
│  Shows approval cards for always_ask tools.                   │
│  Can disconnect — agent keeps working.                        │
│  Reconnect → backfill from events.list().                     │
└──────┬───────────────────────────────┬───────────────────────┘
       │ POST /api/chat/send (50ms)    │ EventSource (SSE)
       ▼                               ▼
┌─ VERCEL (Next.js + thin API) ────────────────────────────────┐
│  /api/chat         → adapter: send event, consume SSE,        │
│                       translate to UIMessageStream, persist    │
│  /api/tool-confirm → sessions.events.send(confirmation)       │
│  /api/trigger/fire → create session, send event, return 200   │
│  Chat: function alive during turn (same as today's streamText)│
│  Triggers: function returns immediately, cron persists async  │
└──────┬────────────────────────────────────────────────────────┘
       │
       ▼
┌─ ANTHROPIC (Managed Agents) ─────────────────────────────────┐
│  Agent loop runs autonomously for minutes/hours.              │
│  Prebuilt tools (bash, read, write, edit, glob, grep)         │
│    → execute in sandbox, no callback needed.                  │
│  MCP tools (CRM, search, browser, messaging)                  │
│    → Anthropic calls Sunder MCP server as needed.             │
│  Built-in: compaction, prompt caching, memory stores.         │
└──────┬────────────────────────────────────────────────────────┘
       │ Anthropic calls MCP server (HTTP, per tool call)
       ▼
┌─ SUNDER MCP SERVER (Railway / Fly.io) ───────────────────────┐
│  CRM ops, Brave search, Exa scrape, Browser-Use, Composio,   │
│  send_message (Telegram), trigger management                  │
│  Multi-tenant routing via vault credentials.                  │
│  Stateless — each call is a single HTTP request.              │
│  Just an API that Anthropic calls when the agent needs a tool.│
└──────┬────────────────────────────────────────────────────────┘
       │
       ▼
┌─ SUPABASE (unchanged) ───────────────────────────────────────┐
│  Database, Auth, Storage, Realtime                            │
└───────────────────────────────────────────────────────────────┘
```

### How it flows

**User watching (browser open):** Browser uses `useChat` as today. The chat API route contains a **server-side event adapter** that translates Anthropic SSE events into AI SDK `UIMessageStream` format. Frontend components (`ChatPanel`, `ToolCallInline`, `ViewRenderer`) are unchanged — they consume the same `UIMessage` parts as before. The adapter also handles server-side persistence (messages, approvals, run analytics).

**User leaves (browser closed):** Agent keeps working. Anthropic calls MCP server for tools as needed. When user returns, browser calls `events.list()` to backfill missed events via the adapter.

**Trigger (no user):** Vercel Function sends event. A server-side event processor polls `events.list()`, persists messages and run analytics, and returns. No function stays alive during agent execution — polling is short-lived.

## Requirements

### Architecture

- R1. Replace the Vercel AI SDK runner loop (`run-agent.ts` → `streamText()`) with Anthropic Managed Agents sessions. Anthropic runs the agent loop; CRM and external tools are exposed via MCP.
- R2. Model: Claude Sonnet 4.6 (`claude-sonnet-4-6`).
- R3. UX is unchanged for chat, approvals, threads, and Telegram. Same web chat UI, same thread rail, same approval cards, same Telegram bot. **Frontend preservation strategy:** a server-side event adapter in the chat API route translates Anthropic SSE events into AI SDK `UIMessageStream` parts, so `useChat` and all frontend components remain unchanged. **Exceptions:** (a) R8 introduces user-editable SOUL/USER fields — new settings UI + one-time data migration. (b) Streaming granularity changes from token-level deltas to content-block chunks — text appears in bursts rather than typing, but final output is identical. (c) `manage_active_triggers` is now gated on all actions (not just delete) due to MCP `always_ask` being per-tool, not per-action.
- R4. **Long-running autonomous sessions.** Sessions run on Anthropic for minutes to hours. Vercel Functions only send events and poll/stream results. No function timeout constraints on agent execution.

### Agent Configuration

- R5. Single reusable agent object, created once and versioned. One agent serves all clients.
- R6. Agent system prompt contains only stable content: persona, tool usage guidelines, approval rules, output format instructions. No per-client or per-session content. **System prompt migration from current `SYSTEM_PROMPT` (~470 lines):**
  - **Keep as-is:** `<your-personality>`, `<crm>` (all subsections), `<file-storage>`, `<web>`, `<external-connections>`, `<safety>`, `<asking-the-user>`, `<view-guidance>`, `<output-guidance>`
  - **Keep as-is (vertical-specific):** `BROWSER_AUTOMATION_PROMPT`, `MARKET_DATA_PROMPT`, `PROPERTY_LISTING_PROMPT` — fold into agent instructions as stable content. One agent serves all clients; these cost nothing when tools aren't available.
  - **Rewrite:** `<filesystem>` — two filesystems: (1) sandbox workspace (ephemeral, prebuilt tools) for analysis and artifact generation, (2) Supabase Storage via `storage_read`/`storage_write` MCP tools (persistent) for uploads, trigger instructions, home directory, CRM attachments, connection skills. No more `/agent/SOUL.md`, `/agent/USER.md`, `/agent/MEMORY.md`. See R13 for full use case mapping.
  - **Rewrite:** `<sandbox>` — update for Managed Agents sandbox (different paths, no 5-min limit, prebuilt bash/read/write/edit tools, skills for xlsx/docx/pptx/pdf).
  - **Rewrite:** `<triggers>` — remove subagent references, add: "In trigger runs, do not use tools that require approval (delete_records, configure_crm, etc). You will not receive a response."
  - **Rewrite:** `<custom-skills>` — update to reference Anthropic's Custom Skills API instead of Supabase Storage discovery. Same user-facing concept (agent discovers and follows workflow instructions), different backend.
  - **Delete:** `<memory-system>` (dropped per R22), `<subagents>` (cut from v1).
- R7. Per-client dynamic context (client profile, user preferences) injected in the kickoff `user.message` at session start, not in the agent system prompt. No CRM state snapshot — agent uses CRM tools for live data.
- R8. **Renamed: SOUL → `client_profile`, USER → `user_preferences`.** These become user-editable fields in the database (not agent-written files). The file metaphor (`SOUL.md`, `USER.md`) doesn't apply to DB fields. Users edit them via a settings UI; backend injects them at runtime in the kickoff message.

### Tools — MCP-First

- R9. **Prebuilt Agent Toolset** (`agent_toolset_20260401`): enable bash, read, write, edit, glob, grep. **Disable** web_fetch and web_search.
- R10. **Sunder MCP server** — a new service exposing all Sunder-specific tools via MCP protocol. Anthropic calls it directly; no custom tool round-trips. Tools exposed:
  - CRM: search_crm, create_record, update_record, delete_records, link_records, create_interaction, create_task, update_task, configure_crm, attach_file_to_record, list_record_attachments, delete_record_attachment, manage_views
  - Search: web_search (Brave API), web_scrape (Exa API), calculate_drive_time (Google Maps)
  - Storage: storage_read, storage_write (Supabase Storage — persistent client files, renamed from read_file/write_file to avoid collision with prebuilt sandbox tools; see R13)
  - Messaging: send_message (Telegram delivery)
  - Triggers: setup_trigger, manage_active_triggers, search_triggers
  - Browser: browse_website (Browser-Use Cloud proxy), search_99co, search_propertyguru (Browser-Use-backed property search)
  - Meetings: search_meetings (meeting recording search)
  - Market: search_market_data (Singapore property market data — conditional on property DB config)
  - Utility: rename_chat, manage_todo, list_todo, run_sql, get_agent_db_schema
  - Composio: connection tools for Gmail, Google Drive, Google Calendar, etc. (MCP server calls Composio SDK internally, handles per-user routing)
  - Composio management: list_connections, get_details_for_connections, search_integrations, get_integration_capabilities, manage_activated_tools_for_connections, delete_connection. **Note:** current codebase uses `list_users_connections` and `create_new_connections` — the system prompt (`system-prompt.ts:251,255`) and chat UI (`tool-call-inline.tsx:111`) hardcode these names. MCP tool names must match, or update prompt + UI during migration.
  - ~~Subagent: run_subagent~~ — **cut from v1.** Agent handles all work sequentially in one session. Multi-agent orchestration is a future addition if users hit a real wall.
- R11. **Skills:**
  - **Prebuilt (Anthropic):** xlsx, docx, pptx, pdf — document generation in the sandbox. Attached as `{ type: "anthropic", skill_id: "xlsx" }`.
  - **Custom (user-authored workflow skills):** Migrate from current Supabase Storage-based discovery (`discover-skills.ts` + `/agent/skills/{slug}/SKILL.md`) to Anthropic's Custom Skills API (`POST /v1/skills`, beta header `skills-2025-10-02`). Same concept — `SKILL.md` with instructions, progressive disclosure (metadata only at startup, full body on demand). Attached as `{ type: "custom", skill_id: "skill_abc123" }`. Versioned, workspace-scoped. Max 20 skills per session. This is NOT a regression — it's a migration to a first-party equivalent.
- R12. **Custom tools (minimal)** — only for operations that require UI interaction:
  - `ask_user_question` — pauses session, waits for user input via chat UI
  - `create_connection` — initiates OAuth flow requiring browser-side redirect; agent emits connection request, browser handles OAuth callback
  - `reauthorize_connection` — same pattern as create_connection; re-initiates OAuth for expired credentials
  - Any future tools that need browser-side interaction
- R13. Drop the memory-specific usage of storage tools (MEMORY.md, memory/*.md, SOUL.md, USER.md are no longer agent-written). **Keep Supabase Storage access as MCP tools, renamed to avoid collision with prebuilt sandbox tools:** `storage_read` and `storage_write` (MCP) for persistent Supabase Storage files, vs prebuilt `read`/`write` for ephemeral sandbox files. This is Anthropic's recommended pattern for external storage (sandbox is ephemeral per-session, memory stores are text-only). Use case mapping:

  **Prebuilt `read`/`write` (sandbox — ephemeral, within-session):**
  - Analyze uploaded files mounted at session start (R31)
  - Generate documents via skills (xlsx, docx, pptx, pdf)
  - Bash/Python data processing scratch files
  - Any throwaway intermediate work

  **MCP `storage_read`/`storage_write` (Supabase Storage — persistent, cross-session):**
  - Browse user uploads directory (`/agent/uploads/`)
  - Read trigger instruction files (`/agent/triggers/{name}.md` — see R13a)
  - Save persistent reports/files for user download (`/agent/home/*` → `sunder:///` links)
  - Write file → `attach_file_to_record` CRM attachment workflow
  - Mid-session file uploads (R32 workaround — user uploads go to Supabase Storage, agent fetches on demand)
  - Read connection skill files (`/agent/skills/connections/{id}/SKILL.md`)

- R13a. **Trigger instruction files.** Currently stored at `/agent/subagents/{trigger-name}.md` (Supabase Storage) and referenced by `agent_triggers.instruction_path`. With subagents cut, rename the path convention to `/agent/triggers/{trigger-name}.md`. The trigger event message includes the path; the agent reads it via `storage_read` at the start of each trigger run. **Alternative (deferred):** inline instructions in the `agent_triggers` table as a text column, eliminating the file read. Cleaner but requires a schema migration and changes to the trigger setup UX. Keep file-based for v1, evaluate inlining later.

### MCP Server

- R14. **New service:** Sunder MCP server, hosted on a long-running platform (Railway, Fly.io, or similar). Exposes CRM and external tools via MCP protocol (Streamable HTTP transport).
- R15. **Multi-tenant routing via vaults (confirmed).** One vault per client with a `static_bearer` credential. Token encodes the `client_id` (JWT or opaque token with DB lookup). Anthropic forwards the token as `Authorization: Bearer <token>` to the MCP server on every tool call. MCP server extracts `client_id`, scopes all Supabase queries. Credential shape:
  ```json
  { "type": "static_bearer", "mcp_server_url": "https://sunder-mcp.railway.app", "token": "<jwt-encoding-client_id>" }
  ```
- R16. **Stateless request handling.** Each MCP tool call is a single HTTP request. The server connects to Supabase, executes the operation, returns the result. No session state held in the MCP server.
- R17. **Composio routing.** MCP server calls Composio SDK internally for connection tools. Per-user Composio sessions are managed by the MCP server based on the `client_id` from the vault credential.
- R18. **Tool gating for Composio.** When agent calls a Composio tool, MCP server checks activation state in DB before executing. Returns error if the tool/connection is not activated for this client.

### Approval Gates

- R19. **MCP permission policies for dangerous operations.** MCP toolset defaults to `always_ask` per Anthropic docs. Override to `always_allow` for safe tools via per-tool `configs` on `mcp_toolset` **(validated — spike confirmed the API accepts per-tool configs on mcp_toolset, see spike results)**:
  - `delete_records`, `configure_crm`, `delete_connection`, `manage_activated_tools_for_connections`, `delete_record_attachment` → `always_ask` (keep default)
  - `manage_active_triggers` → `always_ask` for the whole tool. **Note: this is a behavior change from the current system**, which only gates `action: "delete"`. MCP `always_ask` is per-tool, not per-action. Accept this as a deliberate safety tightening.
  - `search_crm`, `create_record`, `update_record`, `send_message`, all read tools → override to `always_allow`
  - Agent's prebuilt `bash` → `always_ask`
- R20. When `always_ask` fires: agent emits a tool use event (`agent.mcp_tool_use` for MCP tools, `agent.tool_use` for prebuilt tools like bash), then session transitions to `session.status_idle` with `stop_reason: { type: "requires_action", requires_action: { event_ids: [...] } }`. The `event_ids` reference the tool use events that need approval. **The adapter must handle both event types** — bash is prebuilt (`agent.tool_use`), not MCP. For **chat**: adapter detects `session.status_idle` with `requires_action`, looks up the referenced events (tool name + input), emits approval parts in the `UIMessageStream`. User approves → Vercel Function sends `user.tool_confirmation` with `tool_use_id` + `result: "allow"|"deny"` → session resumes. For **triggers**: polling cron detects `requires_action` on an idle session and auto-denies. **Prevention**: system prompt instructs trigger runs to avoid approval-gated tools. The auto-deny is a safety net.
- R21. Delete `safety-gates.ts`, `extractApprovalRequest()`, and the approval extraction machinery in `run-persistence.ts`. Keep `approval_events` table for audit trail — populate it from `agent.mcp_tool_use` events with `evaluated_permission: "ask"` and their corresponding `user.tool_confirmation` events. Delete `continue-after-approval.ts` (resolveAndContinueApproval). **Telegram approval flow:** Telegram InlineKeyboard callbacks must map to `sessions.events.send({ type: "user.tool_confirmation", ... })` instead of calling resolveAndContinueApproval → runAgent. Approval expiry (expireApprovalEvent) is no longer needed — session state handles stale approvals.

### Memory

- R22. Drop the custom memory system (MEMORY.md, memory/*.md, memory loading in context.ts) entirely.
- R23. When Anthropic memory stores become available (research preview, access required): create one memory store per client, attach as `read_write` resource on every session. Agent accumulates knowledge across sessions automatically.
- R24. Until memory stores are available, ship without cross-session memory. Agent starts fresh each session. Memory store integration is a follow-up.

### Session Lifecycle

- R25. **Chat threads**: long-lived session per conversation thread. Create on first message, reuse across turns. Store `session_id` on `conversation_threads` table. Archive when user archives the thread.
- R26. **All triggers: session-per-fire (disposable).** Every trigger fire creates a fresh session, runs the task, done. No session ID stored on `agent_triggers`. No rotation policy, no recovery logic, no status checking. Session creation is ~550ms (validated by spike) — acceptable for triggers where no user is watching. This eliminates the session lifecycle state machine entirely for triggers.
- R27. ~~**One-off triggers** — merged into R26.~~ All triggers are now session-per-fire regardless of type.
- R28. **Fire-and-forget for triggers.** Vercel Function creates session, sends the event, returns immediately. Session runs autonomously on Anthropic. Results delivered via MCP tools (send_message → Telegram, CRM updates → Supabase). Polling cron on Railway handles persistence (R46).
- R29. **Session recovery (chat only)**: if a chat session terminates unexpectedly, detect via status check on next message and create a new session. Inject client_profile + user_preferences in kickoff. Memory store (when available) provides cross-session continuity. Triggers don't need recovery — they're disposable.

### File Operations

- R30. Two file systems remain: Supabase Storage (persistent, our data) and sandbox container (ephemeral workspace).
- R31. Mount user-uploaded files (PDFs, CSVs, images) READ-ONLY into the sandbox at session creation for analysis.
- R32. **Mid-session file uploads supported via Resources API.** `POST /v1/sessions/{id}/resources` adds files to a running session. User uploads a PDF mid-conversation → upload to Files API → `sessions.resources.add(session_id, { type: "file", file_id })` → agent reads it with prebuilt `read` tool. Also: `GET /v1/sessions/{id}/resources` to list, `DELETE /v1/sessions/{id}/resources/{resource_id}` to remove. **Fallback:** for files already in Supabase Storage, agent uses `storage_read` MCP tool to fetch on demand (no mounting needed).
- R33. Agent uses sandbox prebuilt tools (write, bash) + skills (xlsx, docx, pptx, pdf) for generating artifacts. Output written to `/mnt/session/outputs/`.
- R34. After session idle, download generated artifacts from sandbox via Files API. Use `GET /v1/files?scope_id={session_id}` (beta header `files-api-2025-04-14`) to list all session-scoped files. Download each via `GET /v1/files/{id}/content`. Persist to Supabase Storage. Handle 1-3s indexing lag with retry (1s, 2s, 4s).

### Environment

- R35. Unrestricted networking. Required for MCP server connectivity and package installation.
- R36. Single shared environment across all sessions.

### Context Assembly

- R37. Simplify `context.ts`: drop memory loading, compaction injection, skill loading, CRM snapshot assembly, thread history fetching, staleness detection. What remains in the kickoff message builder: client_profile + user_preferences injection, system reminders (buildSystemReminder — dynamic per-client/thread content like upcoming task reminders), and CRM mode switching (setup vs normal prompt selection moves to agent versioning or kickoff instructions). Conditional tool prompts (BROWSER_AUTOMATION_PROMPT, SANDBOX_PROMPT, etc.) move to the agent system prompt as stable content per R6.
- R38. Drop custom compaction system (`compaction.ts`). Managed Agents handles compaction automatically.
- R39. Kickoff message format: `[client_profile] + [user_preferences] + [system_reminder] + [user's actual message or trigger instruction]`. System reminder is dynamic per-client/thread content from `buildSystemReminder()` (upcoming tasks, scheduled meetings) — see R37. No CRM state snapshot — agent queries CRM via MCP tools for live data.

### JIT UI (JSON Renderer)

- R40. **Spec fence rendering stays server-side via the adapter.** The event adapter accumulates `agent.message` text, runs `splitTextAndSpecParts()`, and emits spec data parts in the `UIMessageStream` — same as `pipeJsonRender()` does today. Frontend `useJsonRenderMessage()` + `<ViewRenderer>` unchanged. Note: `splitTextAndSpecParts()` is a whole-buffer parser (not incremental), so the adapter must reparse accumulated text on each `agent.message` event and emit only new parts.
- R41. **Chat API route is the adapter, not a thin proxy.** The route translates Anthropic SSE events into AI SDK `UIMessageStream` format, handles spec fence parsing, and persists messages server-side. This replaces the previous "thin proxy" design — server-side processing is required for persistence, triggers, and format translation.
- R42. **Fallback: if spec fences break with the new streaming format, cut JIT UI.** The agent's text responses are still useful without rendered components. This is a nice-to-have, not a blocker for the migration.

### Operational Concerns

- R48. **Message quota enforcement.** The thin Vercel API layer (`/api/chat/send`) must consume a message quota unit before sending the user event to the session — same as the current runner's consumeMessageQuota/releaseMessageQuota pattern. On quota exceeded, return 402 without sending to the session.
- R49. **Rate limiting.** The thin API layer must enforce rate limits (currently 30 req/min per user) before sending events. Unchanged from current chat route.
- R50. **Run analytics and cost tracking.** The current runner populates the `runs` table with per-run metrics (tokens_in, tokens_out, duration, tools_called, cost_usd, model). With Managed Agents, two sources available: (a) `span.model_request_end` events in the SSE stream (include `model_usage` with token counts — adapter accumulates across the turn), or (b) session object `stats` field (cumulative `active_seconds`, `duration_seconds`, and usage). Adapter calls `completeRun()` on `session.status_idle`. For triggers, the polling cron uses the same sources.
- R51. **Observability / Langfuse integration.** The current runner instruments every run with Langfuse traces (propagateAttributes + experimental_telemetry). The improvement loop (run → trace → evaluate → improve) is a core architectural principle. Options: (a) build an SSE event processor that creates Langfuse traces from agent events (tool calls, messages, errors), (b) check if Anthropic offers trace/log export, (c) accept temporary observability gap during migration and backfill later. **Non-blocking for v1 but must be addressed before production.**
- R52. **Step limits.** The current runner caps tool steps at 9-16 depending on run type. Managed Agents has no documented step limit config. Accept Anthropic's default behavior. If runs become excessively long, use the agent system prompt to instruct step discipline, or set session-level timeouts.

### Hosting

- R43. **Vercel Functions stay alive during chat turns (streaming adapter).** The chat API route consumes the Anthropic SSE stream, translates events to AI SDK format, persists messages, and streams to the browser. Function lifetime matches the agent turn — same as today's `streamText()` pattern. Still bounded by `maxDuration` (300s). **Graceful timeout degradation:** if a chat turn exceeds 300s, the Vercel Function dies but the agent keeps running on Anthropic (all tools are MCP/prebuilt — no server callback needed). On next browser load, adapter calls `events.list()` to backfill missed events and persist them. This is strictly better than today, where a timeout kills both function and agent.
- R44. **Server-side event adapter as canonical SSE consumer.** The chat API route is the single consumer of Anthropic SSE events for chat. It handles: event translation, message persistence, approval event creation, run analytics, and external channel delivery. Browser receives the translated `UIMessageStream` via `useChat` — same as today.
- R45. **Backfill on reconnect.** When browser reconnects after disconnect, the adapter calls `events.list(session_id)` to backfill missed events. Translates them into `UIMessageStream` parts and persists any that were missed.
- R46. **Trigger persistence via MCP server polling cron.** Trigger runs have no browser. The Vercel Function creates a disposable session, sends the event, stores the `session_id` on the `runs` row, and returns immediately. Persistence is handled by a polling cron on the MCP server (Railway — already long-running): every 30s, query `runs WHERE status = 'running' AND session_id IS NOT NULL`, call `events.list()` with a cursor for each, persist new messages and token usage, finalize on `session.status_idle`. Same `finalizeRun` logic as the chat adapter, just async instead of inline. No Vercel Function timeout constraint — works for runs lasting seconds or hours. **Schema change:** add `session_id` (text, nullable) and `events_cursor` (text, nullable) columns to the `runs` table.
- R47. **New infra: Sunder MCP server** on Railway/Fly.io. Long-running Node.js service. Stateless per-request — just an API that Anthropic calls when the agent needs a CRM/search/messaging tool. Connects to Supabase.

## Success Criteria

- Agent performs all existing CRM operations, search, messaging, and browser tasks with no regression
- Document generation (Excel, PPTX, Word, PDF) works end-to-end via sandbox + skills
- Approval flow works: `always_ask` MCP tools pause, show UI, resume on allow/deny
- Chat conversations maintain continuity within a session (multi-turn)
- Long-running trigger sessions run autonomously for 5+ minutes without timeout
- Cron/webhook triggers fire-and-forget successfully
- No user-visible UX changes (except client profile/preferences settings UI per R8)

## Scope Boundaries

- **Not migrating the CRM database** — Supabase stays
- **No frontend changes** beyond client profile/preferences settings editor (R8). Server-side event adapter translates Anthropic SSE → AI SDK `UIMessageStream`, preserving `useChat` and all existing components
- **Not changing Telegram integration** — send_message exposed via MCP server
- **Not implementing memory stores in v1** — follow-up when access is granted
- **Not migrating to Claude for all LLM calls** — only the agent runner

## Key Decisions

- **MCP-first over custom tools**: CRM tools exposed via MCP server, not custom tools. Sessions run autonomously — no function staying alive for tool round-trips. Fire-and-forget for triggers. Custom tools limited to `ask_user_question`, `create_connection`, and `reauthorize_connection` (all require browser-side interaction).
- **Sonnet 4.6 over Opus 4.6**: cost-conscious choice. Sonnet is ~3x cheaper and sufficient for CRM routing and execution. Can upgrade specific use cases later.
- **Lean agent + minimal kickoff**: one agent serves all clients. client_profile + user_preferences injected in first user.message. No CRM snapshot — agent queries live data via MCP tools.
- **Long-lived sessions for chat only. All triggers use disposable session-per-fire.** Session creation is ~550ms (validated) — acceptable for triggers where no user is watching.
- **Ship without memory**: memory stores are research preview. Don't block the migration.
- **New MCP server on Railway/Fly.io**: stateless HTTP service exposing CRM tools. Multi-tenant routing via vault credentials. Each MCP call is a single request — no long-running connections.
- **Approval via MCP permission policies**: `always_ask` on dangerous MCP tools (delete, configure, bash). Cleaner than custom tool gating — approval happens before execution, not in a separate code path.
- **Composio tools inside the MCP server**: MCP server calls Composio SDK internally. Avoids per-user MCP URL problem. Consistent tool surface.
- **No subagents in v1**: Agent handles all work sequentially in one session. Sunder's use case (solo practitioner CRM tasks) doesn't need parallel workers. Add multi-agent orchestration later only if users hit a real wall.
- **Trigger tool gating via system prompt, not infrastructure**: System prompt instructs trigger runs to avoid approval-gated tools. Polling cron auto-denies any approval requests from trigger sessions as a safety net. No MCP-side filtering, no separate agent definitions.
- **Feature flag for rollback**: `RUNNER_ENGINE=managed|legacy` env var at `app/api/chat/route.ts`. Keep the current runner (`run-agent.ts`) alive behind the flag during migration. The swap point is narrow — one `if` statement at the `runAgent()` call site. Remove after 3 months of stable production.

## Dependencies / Assumptions

- Anthropic Managed Agents beta is accessible (enabled by default for all API accounts per docs)
- `@anthropic-ai/sdk` TypeScript SDK supports all beta managed-agents methods
- MCP protocol (Streamable HTTP transport) is supported for agent → MCP server communication
- Memory stores access will be granted via research preview request (non-blocking — R24 covers the gap)
- Vault `vault_ids` on sessions is supported. `POST /v1/sessions` accepts `vault_ids` as an optional field. The vault-based multi-tenant architecture (R15) proceeds as designed.
- Container spin-up latency is acceptable for chat UX (not documented — needs empirical validation)
- Idle sessions are not automatically terminated by Anthropic (needs empirical validation)
- MCP server can handle per-client CRM config dynamism: CRM tools use client-specific vocabulary, field definitions, and entity schemas (loaded via `loadCrmConfig`). The MCP server must load config from Supabase on each tool call (based on JWT `client_id`) and adapt tool behavior accordingly. Tool descriptions in MCP registration will be generic; config-specific validation happens at execution time.
- Per-tool `configs` on `mcp_toolset` works for permission policy overrides (validated via spike 2026-04-09 — undocumented but functional)
- Anthropic rate limits on Managed Agents: 60 rpm for create operations, 600 rpm for read operations. Sunder's current chat rate limit (30 rpm/user per R49) stays well under the create limit. Polling cron on MCP server must respect the 600 rpm read limit — at 30s intervals with N active trigger sessions, stay under 10 polls/second.

## Resolved Questions

All outstanding questions resolved during ideation. Decisions documented here for planning reference.

**Vault credential format (R15):** Use JWT with `client_id` claim. Self-verifiable (MCP server decodes with shared secret, no DB lookup per request). Tokens are write-only in vaults — that's fine, you generate them at client onboarding and don't need to read them back. Sign with a shared secret stored in MCP server env vars. `vault_ids` on sessions is now supported — no interim workaround needed.

**MCP server framework (R14):** Use the official MCP TypeScript SDK (`@modelcontextprotocol/server` + `@modelcontextprotocol/express` + `@modelcontextprotocol/node`). Express app with `NodeStreamableHTTPServerTransport`. Register tools with Zod schemas via `server.registerTool()`. Battle-tested, matches Anthropic's expected protocol. Deploy on Railway.

**Container idle timeout (R25, R26):** Unknown from docs — not documented. Decision: don't depend on it. Design for session recovery (R29) regardless. If sessions unexpectedly terminate after idle, the recovery flow handles it. Empirical test during implementation to inform trigger rotation policy.

**Trigger session rotation (R26):** ~~Eliminated.~~ All triggers are now session-per-fire (disposable). No rotation, no recovery, no session ID storage. Session creation is 550ms (validated by spike) — acceptable for triggers.

**Thread queue + drain-and-continue (R25):** Managed Agents queues messages server-side — messages sent while the agent is running are processed in order. This replaces our drain-and-continue pattern for chat. For triggers, fire-and-forget means no queuing needed. Decision: remove `drain-and-continue` and `thread_queue_records` table. Rely on Anthropic's server-side message queuing.

**Cost impact (R2):** Accept the cost increase. Current model is Gemini 3 Flash at $0.50/$3.00 per MTok (`src/lib/ai/models.ts:50`). Sonnet 4.6 is $3/$15 per MTok. That's **6x input, 5x output** — not 30x as originally estimated. Plus $0.08/session-hour runtime (only while running). The value proposition changes: autonomous long-running sessions, document generation, sandbox compute. Quantify empirically in the first week of testing. If cost is prohibitive, evaluate Haiku 4.5 for simple trigger runs (briefings, notifications) while keeping Sonnet for chat. Can route via different agent objects.

**Files API indexing lag (R34):** Retry with exponential backoff: 1s, 2s, 4s (3 attempts). If still empty after 3 retries, log warning and skip. The lag is documented as 1-3s — 3 retries with backoff covers this.

**System prompt content (R6):** Fully categorized — see R6 for the section-by-section migration plan. Three sections need rewrites (`<filesystem>`, `<sandbox>`, `<triggers>`), three are deleted (`<memory-system>`, `<custom-skills>`, `<subagents>`), everything else carries over as-is. Vertical-specific prompts (market data, property listings, browser automation) stay in agent instructions — no per-session injection. Tool JSON schemas: declare 1:1 from existing Zod schemas, no consolidation (35 tools, well under 128 limit).

**CRM tool consolidation (R10):** Keep individual tools for now. Anthropic's best practice says "consolidate" but our tools have distinct input schemas and the agent needs clear tool boundaries for approval gating (delete_records = always_ask, create_record = always_allow). Consolidating would lose per-action permission control. Revisit if tool count becomes a problem (max 128 per agent, we're well under).

**Session recreation on termination (R29):** Chat only — start fresh. New session, inject client_profile + user_preferences in kickoff. Memory store (when available) provides cross-session continuity. No replay from conversation_messages. Triggers don't need recovery — they're disposable (session-per-fire).

**Chat API adapter design (R44):** The chat API route (`/api/chat`) is a server-side event adapter. It consumes Anthropic SSE, translates events into AI SDK `UIMessageStream` parts via `createUIMessageStream()` + `writer.write()`, persists messages server-side, and streams to the browser. Frontend `useChat` + `DefaultChatTransport` unchanged. This is the standard pattern — used by Vercel's own `@ai-sdk/langchain` and `@ai-sdk/llamaindex` adapters, Anthropic's own demo apps, and every open-source Managed Agents integration found. Anthropic recommends polling/webhooks for production HITL waits, but our adapter closes cleanly on `session.status_idle` (approval gates) — no long-lived idle connections.

**MCP permission policies (R19):** Static per-agent, not dynamic per-client. All clients share the same agent definition. Permission granularity:
- `always_ask`: delete_records, configure_crm, delete_connection, manage_activated_tools_for_connections, delete_record_attachment, bash, manage_active_triggers (full tool — conditional per-action gating may not be feasible in MCP)
- `always_allow`: everything else (search, create, update, send_message, web_search, etc.)
- If a client needs different permissions, that's a future feature (different agent per client tier).
- **Resolved:** per-tool `configs` on `mcp_toolset` validated empirically via API spike (2026-04-09). Works as expected.

**Trigger thread persistence (R45):** Unified pattern: always load threads by calling `events.list(session_id)` and reconciling with `conversation_messages` table. Works for chat (browser may have persisted some), triggers (browser never open), and reconnect (browser was away). One code path.

**One-off session cleanup (R27):** Don't clean up. Idle sessions use no compute. If Anthropic charges for idle sessions or `sessions.list()` gets unwieldy, add a cleanup cron then. Not a day-one concern.

**Subagent MCP timeout (R13):** ~~Cut from v1.~~ Subagents removed — agent handles all work sequentially. Revisit if `callable_agents` reaches GA and users need parallel execution.

**Composio session lifecycle (R17):** Cache Composio sessions in MCP server memory with TTL. MCP server is long-running (Railway), so in-memory cache works. On first Composio tool call for a client: `composio.create(userId)` → cache session object keyed by client_id with 1-hour TTL. Subsequent calls reuse cached session. On TTL expiry, create fresh session. No DB storage needed.

**Artifact download API (R34):** Vercel API route `GET /api/sessions/[sessionId]/files`. Calls `GET /v1/files?scope_id={session_id}` (beta header `files-api-2025-04-14`) to list session-scoped files. Downloads each via `GET /v1/files/{id}/content` with retry (1s, 2s, 4s), uploads to Supabase Storage under client's directory. Returns Supabase Storage URLs to browser. Called by browser after `session.status_idle` event.

## What Gets Eliminated

| Current code | Status |
|---|---|
| `src/lib/runner/run-agent.ts` (streamText loop) | Replace with session event sending |
| `src/lib/runner/compaction.ts` | Delete — Managed Agents handles it |
| `src/lib/runner/safety-gates.ts` | Delete — MCP permission policies replace it |
| `extractApprovalRequests()` in run-persistence.ts | Delete |
| `resolveAndContinueApproval()` | Replace with `user.tool_confirmation` event |
| Memory file management (read_file/write_file for SOUL/USER/MEMORY) | Delete memory usage — keep read_file/write_file as MCP tools for Supabase Storage |
| Memory loading in context.ts | Delete |
| Compaction injection in context.ts | Delete |
| Skill loading from /agent/skills/ (`discover-skills.ts`) | Replace — migrate to Anthropic Custom Skills API (`/v1/skills`) |
| `src/lib/ai/gateway.ts` (Vercel AI Gateway) | Replace with Anthropic SDK |
| Custom tool dispatch in runner | Replace with MCP server |
| Tool response handling in runner | Replace with MCP server |
| `src/lib/runner/drain-and-continue.ts` | Delete — Anthropic queues messages server-side |
| `src/lib/runner/thread-queue.ts` + `thread_queue_records` table | Delete — replaced by server-side queuing |
| `src/lib/approvals/continue-after-approval.ts` | Delete — Telegram callbacks send `user.tool_confirmation` directly |
| Resumable stream / Redis stream IDs | Delete — replaced by Anthropic SSE + `events.list()` backfill |
| `src/lib/runner/run-persistence.ts` (most of it) | Replace — message persistence moves to SSE event processing |

## What Stays

| Current code | Notes |
|---|---|
| CRM tool logic (search, create, update, delete) | Moves FROM runner tools TO MCP server. Same Supabase queries, different hosting. |
| Trigger scheduling (cron scanner, webhook endpoints) | Still fires triggers; sends events to sessions instead of calling runAgent() |
| Message persistence (conversation_messages) | Still persist messages from event stream for UI |
| Context assembly (simplified) | client_profile + user_preferences injection only |
| Artifact persistence | Download from sandbox → Supabase Storage |
| Telegram bot delivery | Moves to MCP server (send_message tool) |
| Approval UI | Same cards, triggered by MCP permission policies |
| Composio SDK integration | Moves to MCP server. Same SDK, different hosting. |
| Browser-Use integration | Moves to MCP server. Same proxy, different hosting. |

## What's New

| Component | Description |
|---|---|
| Sunder MCP server | New service on Railway/Fly.io. Exposes CRM, search, browser, Composio, messaging tools via MCP protocol. Stateless, multi-tenant via vault credentials. |
| Vault management | One vault per client with encoded `client_id`. Created at client onboarding. Attached to every session via `vault_ids`. |
| Event adapter (`runManagedAgent`) | Server-side function in chat API route. Consumes Anthropic SSE, translates to AI SDK `UIMessageStream`, handles persistence, approvals, run analytics. Replaces `runAgent()` + `finalizeRun()`. |
| Session management layer | Create/reuse/archive/recover sessions for chat (maps to conversation_threads table). Disposable sessions for triggers — no persistent mapping needed. |

## Spike Results (2026-04-09)

Empirical validation before implementation. Full results in `docs/product/ideations/2026-04-09-managed-agents-spike-results.md`.

| Spike | Result | Impact |
|---|---|---|
| Per-tool `configs` on `mcp_toolset` | **Works.** API accepts per-tool `permission_policy` overrides on MCP toolsets. | R19 risk eliminated. No need for two-server workaround. |
| Session creation latency | **~550ms avg** (519-610ms, n=5). Sessions start in `idle` immediately. | Session-per-message is viable. Long-lived sessions save ~400ms/turn but add lifecycle complexity. |
| Message round-trip (existing session) | **~1.3s** user.message → agent.message | Acceptable for chat UX. |
| Cold start round-trip (create + send) | **~1.7s** user.message → agent.message | ~400ms overhead vs reusing session. |
| Session idle timeout | **Not yet tested.** Requires 30-120min observation. |  |
| Memory stores | **Research preview.** Access request pending. | Ship without cross-session memory per R24. |

## Next Steps

→ All blocking questions resolved. `/plan` for structured implementation planning.
