# Architecture Comparison: Sunder vs Dorabot vs OpenClaw

> **Purpose:** Learning document. Understanding where we differ architecturally — not judging right/wrong. Each project optimizes for different constraints.
>
> **Date:** 2026-03-09

---

## At a Glance

| Dimension | Sunder | Dorabot | OpenClaw |
|-----------|--------|---------|----------|
| **What it is** | SaaS for real estate agents (Singapore) | Personal AI assistant (desktop) | Self-hosted multi-channel AI gateway |
| **Deployment** | Cloud (Vercel + Supabase) | Local (Electron app + CLI) | Local daemon (gateway process) |
| **Multi-tenancy** | Yes — RLS + `client_id` isolation | No — single user, local DB | No — single operator trust model |
| **Primary interface** | Web chat (Next.js) | Desktop app (Electron + React) | Any messaging channel + web UI |
| **Channel count** | 1 (web chat) | 3 (web chat, WhatsApp, Telegram) | 15+ (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Matrix, etc.) |
| **LLM SDK** | Vercel AI SDK v6 | Anthropic Agent SDK | Pi Agent Core (custom runtime) |
| **Database** | Supabase (Postgres) | SQLite (local) | Files (JSON/JSONL/Markdown) + SQLite for search |
| **Tool count** | ~31 CRM + ~12 utility | ~12 custom + MCP | ~25 built-in + plugin-extensible |

---

## 1. Project Structure & Packaging

### Sunder
- **Single Next.js app** — `app/` (routes) + `src/` (libraries, components, hooks)
- Frontend and backend colocated in one deployment unit
- `supabase/migrations/` for DB schema (66 migration files)
- `roadmap docs/` for product specs and architecture decisions

### Dorabot
- **Monorepo with 3 packages:** `src/` (Node.js backend), `desktop/` (Electron app), `site/` (Next.js marketing)
- Backend is a standalone Node.js process (CLI + WebSocket gateway)
- Desktop app connects to backend via Unix socket RPC
- Skills are standalone markdown files in `skills/` directory

### OpenClaw
- **Large monorepo:** `src/` (core ~70+ dirs), `extensions/` (39+ plugins), `skills/` (50+), `ui/` (Lit web UI), `apps/` (iOS/macOS/Android)
- Gateway is the core — everything else is a client or extension
- Native mobile/desktop apps connect as "nodes" to the gateway
- Plugin system with `openclaw.plugin.json` manifests

### What's different
- **Sunder** is a cloud SaaS — single deployable. **Dorabot** and **OpenClaw** are local-first with separate frontend/backend processes.
- **OpenClaw** has the most ambitious multi-platform story (native iOS/Android/macOS apps as first-class clients).
- **Dorabot** keeps it simple: one desktop app, one backend, one marketing site.
- All three keep skills/tools separate from core logic, but **OpenClaw** has the most formal plugin system.

---

## 2. Frontend

### Sunder
- **Next.js 15 App Router** + React 19 + Tailwind 4 + ShadCN UI
- Route groups: `(dashboard)/` for protected routes
- State: TanStack Query v5 (data fetching/cache) + TanStack Table v8 (data grids) + React Hook Form
- Real-time: Supabase Realtime invalidates TanStack Query keys
- Full CRM UI: tables, forms, drawers, filters, bulk actions

### Dorabot
- **Electron 40 + Vite 6 + React 19** + Radix UI + Tailwind 4.1
- 8-tab layout: Chat, Goals, Channels, Skills, Settings, Soul, Status, Tools
- State: WebSocket RPC to gateway (via `useGateway` hook) — no TanStack Query
- Resizable panels (react-resizable-panels), drag-and-drop (dnd-kit)
- Markdown rendering (react-markdown), syntax highlighting (react-shiki)

### OpenClaw
- **Lit 3.3 (Web Components)** + Vite 7 — no React or Vue
- Served directly from the Gateway's HTTP server
- State: WebSocket subscriptions + Lit's reactive model
- Minimal UI — primary interaction is through messaging channels, not the web UI
- DOMPurify for sanitization, Marked for markdown

### What's different
- **Sunder** has the most complex frontend (full CRM with data tables, forms, real-time sync). Frontend *is* the product.
- **Dorabot** uses Electron for a native desktop experience. Richer than a web app for power users.
- **OpenClaw** deliberately minimizes frontend — the web UI is a control panel, not the primary interface. Users interact via WhatsApp/Telegram/Discord/etc.
- State management diverges: Sunder uses TanStack Query (server state cache), Dorabot uses direct WebSocket RPC, OpenClaw uses Lit reactivity.

---

## 3. Backend & API Layer

### Sunder
- **Next.js API routes** (serverless functions on Vercel)
- REST-style: `POST /api/chat`, `GET /api/crm/config`, `POST /api/trigger/run`
- Supabase client handles DB queries (PostgREST)
- 60-second function timeout (Vercel)
- Resumable streams via Redis for timeout recovery

### Dorabot
- **Node.js WebSocket gateway** over Unix socket (~/.dorabot/gateway.sock)
- JSON-RPC 2.0 protocol — 71 RPC methods
- No REST API at all — everything is RPC
- Token-based auth (64-char hex)
- Event streaming via `stream_event` for agent runs

### OpenClaw
- **Single gateway daemon** — WebSocket + HTTP server on port 18789
- Custom binary frame protocol over WebSocket (not JSON-RPC)
- Also no REST API — pure RPC
- Config hot-reload, channel health monitoring built into gateway
- TLS support for remote access (Tailscale Serve/Funnel)

### What's different
- **Sunder** uses standard HTTP/REST (serverless). **Dorabot** and **OpenClaw** use persistent WebSocket daemons — fundamentally different compute models.
- Serverless (Sunder) means cold starts but infinite scale. Daemon (Dorabot/OpenClaw) means always-on but single-machine.
- **Sunder** is the only one with a traditional API layer. The others bypass HTTP entirely for their primary protocol.
- **OpenClaw** goes furthest with a custom binary protocol for performance. **Dorabot** uses standard JSON-RPC.

---

## 4. AI/LLM Integration

### Sunder
- **Vercel AI SDK v6** — all calls go through `@ai-sdk/gateway`
- **Single gateway:** Vercel AI Gateway routes to providers
- **Models:** Gemini Flash 3 (Tier 1 interactive), Gemini 2.5 Flash Lite (compaction only)
- **Pattern:** `streamText()` for chat, `generateText()` for background
- No direct provider SDK imports at runtime

### Dorabot
- **Anthropic Agent SDK** (`@anthropic-ai/claude-agent-sdk`) as primary
- **Optional:** OpenAI Codex SDK (dynamic import)
- **Models:** Claude Sonnet 4.5 (default), configurable Haiku/Opus/Codex
- **Pattern:** `query()` function from Agent SDK with resumable sessions
- Tools registered as MCP server per agent run
- Thinking mode + reasoning effort support

### OpenClaw
- **Pi Agent Core** (`@mariozechner/pi-agent-core`) — embedded runtime
- **Multi-provider:** Anthropic, OpenAI, Google, Amazon Bedrock, NVIDIA, Ollama, LM Studio, vLLM
- **Model failover:** Primary + fallback models, on-demand switching
- **CLI backends:** Falls back to Claude Code CLI or Codex CLI as plain-text fallbacks
- Auth profile rotation (track cooldowns, rotate on failure)

### What's different
- **Sunder** abstracts away the provider entirely (Vercel AI Gateway). Model switching is a config change, no code change.
- **Dorabot** is Claude-first (Agent SDK), with Codex as optional alternative. Tightest integration with one provider.
- **OpenClaw** has the most provider diversity (7+ providers, local models via Ollama/LM Studio, CLI fallbacks). Most resilient to provider outages.
- **Sunder** uses `streamText` (generic). **Dorabot** uses Agent SDK's `query` (Claude-native). **OpenClaw** uses embedded Pi runtime (custom).
- Only **Dorabot** has native resume support (SDK session IDs). **Sunder** rebuilds context from DB on each run.

---

## 5. Agent Orchestration / Runner

### Sunder
```
Load state → Build 7-layer context → streamText(maxSteps=9) → Execute tools → Persist run
```
- **Stateless loop** — context rebuilt from DB every run
- **Thread lock:** One run per thread (DB-backed), queue for concurrent messages
- **Run lifecycle:** `createRun()` → execute → `finalizeRun()` → `drain_thread_queue()`
- **Stale run cleanup:** Marks runs older than 15min as failed
- **Autopilot:** `run-autopilot.ts` uses `generateText()` (non-streaming) for background pulse

### Dorabot
```
Load config/workspace → Match skills → Build prompt → Create MCP server → query() → Stream/persist
```
- **Stateless per-call** but SDK manages resume via session IDs
- **Session queue:** In-gateway, prevents concurrent runs per session
- **Hooks:** Event-driven (`agent.start`, `agent.end`, `tool.use`, `tool.result`)
- **Autonomy pulse:** 15m–2h intervals, priority-ordered work loop
- **Cost tracking:** Per-run token + USD cost calculation

### OpenClaw
```
Message inbound → Gateway session → Pi Agent RPC → Tool streaming → Block streaming → Persist
```
- **Embedded runtime** — Pi SDK runs in-process (not via API)
- **Tool streaming:** Tools execute concurrently; results streamed back in real-time
- **Session isolation:** One agent per workspace, multiple sessions per agent
- **Model failover:** Automatic primary → fallback on provider failure
- **Sub-agents:** Can spawn sub-agent runs from tools

### What's different
- All three use a single orchestration loop, but the loop boundaries differ. **Sunder** starts/ends with the DB. **Dorabot** starts/ends with the SDK session. **OpenClaw** starts/ends with the gateway session.
- **Sunder** is the only one that rebuilds full context from DB each run (truly stateless). The others maintain session state across calls.
- **OpenClaw** streams tool results concurrently. **Sunder** and **Dorabot** execute tools sequentially within each step.
- Concurrency: **Sunder** uses DB locks + queue table. **Dorabot** uses in-memory gateway queue. **OpenClaw** uses session-scoped queue in gateway.
- Only **OpenClaw** has sub-agent spawning. **Sunder** and **Dorabot** run single-agent.

---

## 6. Tool System

### Sunder
- **Factory functions** returning `ToolSet` objects
- Tools created per-run with `clientId` injected via closure
- Response shape: `{ success: true, entity }` | `{ success: false, error }`
- ~31 CRM tools (search, create, update, link, batch) + file tools + web tools + trigger tools + connection tools
- Write tools gated by env var (`RUNNER_ENABLE_CRM_WRITE_TOOLS`)
- Zod v4 for parameter validation

### Dorabot
- **MCP server** created per agent run
- 12 custom tools using Agent SDK's `tool()` function
- Response shape: `{ content: [{type, text}], isError? }`
- **3-tier approval:** auto-allow (reads) → notify (browser) → require (messaging, file writes)
- 5-minute approval timeout with fallback
- Channel handler registry pattern for messaging tool
- Browser tool: 37 sub-actions (open, click, type, navigate, cookies, PDF render)

### OpenClaw
- **Pi Agent Core tools** (`AgentTool` interface)
- ~25 core tools + plugin-extensible
- **5-layer tool provisioning:** base Pi SDK tools → custom replacements → OpenClaw tools → channel tools → plugin tools → policy filtering
- Tool profiles: `minimal`, `coding`, `messaging`, `full`
- Per-provider tool policies + global allow/deny + sandbox policies
- Tool groups: `group:runtime`, `group:fs` for batch policy
- TypeBox for schema definition (not Zod)

### What's different
- **Sunder** has the most domain-specific tools (CRM CRUD, real estate). **Dorabot** and **OpenClaw** have more general-purpose tools (browser, shell, messaging).
- Tool registration: **Sunder** = factory closures. **Dorabot** = MCP server. **OpenClaw** = multi-layer provisioning pipeline.
- Approval model: **Sunder** = binary (system prompt tells agent to ask). **Dorabot** = 3-tier with timeout. **OpenClaw** = policy-driven with sandbox.
- Only **Dorabot** and **OpenClaw** have browser automation tools. **Sunder** uses web scrape (fetch + parse) without browser control.
- **OpenClaw** has the most sophisticated tool policy system (profiles, per-provider, groups, sandbox).

---

## 7. Database & Persistence

### Sunder
- **Supabase (Postgres)** — managed cloud, 66 migrations
- **RLS (Row-Level Security)** — every table scoped by `client_id`
- **PostgREST client** (`@supabase/supabase-js`) for all queries
- **Type generation:** `supabase gen types typescript` → `src/types/database.ts`
- **Tables:** conversation_threads, conversation_messages, companies, contacts, deals, crm_tasks, agent_runs, agent_triggers, agent_todo, connections, vault_files, agent_audit_log
- **Zod validation** at application boundaries

### Dorabot
- **SQLite** (`better-sqlite3`) — local file at `~/.dorabot/dorabot.db`
- **WAL mode** for read concurrency
- **11 tables:** sessions, messages, goals, tasks, tasks_logs, tasks_meta, calendar_items, stream_events, research, goals_meta_v2, cron_jobs
- **FTS5** full-text search on messages (`messages_fts`)
- **Auto-migration:** Schema created on first run, JSONL→SQLite migration for legacy data
- JSON columns for flexible data (`data JSON`, `metadata JSON`)

### OpenClaw
- **No traditional database** — file-based persistence
- **Sessions:** `~/.openclaw/agents/<agentId>/sessions/sessions.json` (metadata) + `<sessionId>.jsonl` (transcript)
- **Memory:** SQLite (`sqlite-vec`) for vector search only
- **Config:** `~/.openclaw/openclaw.json` (JSON5, Zod-validated)
- **Maintenance:** Auto-pruning, entry capping, file rotation, disk budgets

### What's different
- **Sunder** is the only one with a real relational database (Postgres). Enables complex queries, RLS, migrations, multi-tenancy.
- **Dorabot** uses SQLite — simpler than Postgres but still relational with FTS5 search.
- **OpenClaw** avoids databases entirely for core persistence (JSONL files). Only uses SQLite for vector search.
- Multi-tenancy: Only **Sunder** needs it (SaaS). The others are single-user by design.
- Schema migration: **Sunder** has 66 formal migrations. **Dorabot** auto-creates + one-time migrations. **OpenClaw** uses file versioning.

---

## 8. Authentication

### Sunder
- **Supabase Auth** — OAuth + email/password
- HTTP-only cookies for session storage
- Middleware checks auth on every request, redirects to `/login`
- `client_id` resolved from authenticated user → injected everywhere

### Dorabot
- **Multi-layer:** Provider auth (API key / OAuth) + Gateway auth (token file) + Channel auth (per-platform)
- **Keychain integration:** macOS Keychain / Linux secret-tool for secrets
- Claude OAuth: Full 3-legged flow with auto-refresh
- Gateway token: 64-char hex, generated on first run

### OpenClaw
- **Device authentication:** Ed25519 keypair (generated on first run)
- Gateway sends challenge → device signs → gateway verifies
- DM security policies: `pairing` (unknown senders get code), `open` (allowlist-based)
- Model provider auth stored in config file
- `openclaw security audit` CLI for misconfiguration detection

### What's different
- **Sunder** has traditional web auth (cookies, sessions, middleware). The others don't need it (no web app login).
- **Dorabot** has the richest secret storage (OS keychain integration). **Sunder** uses env vars. **OpenClaw** uses config files.
- **OpenClaw** has the most sophisticated inbound message security (DM pairing codes, allowlists) — needed because it exposes the agent to external messaging channels.
- Only **Sunder** has user registration / multi-user support.

---

## 9. Real-Time

### Sunder
- **Supabase Realtime** — Postgres change subscriptions over WebSocket
- Pattern: table change → invalidate TanStack Query → background refetch → UI update
- Filtered by `client_id` for tenant isolation
- Tables subscribed: companies, contacts, deals, tasks, threads, vault_files

### Dorabot
- **WebSocket gateway** — JSON-RPC + `stream_event` for agent runs
- Event log in SQLite `stream_events` table (append-only)
- Reconnect with cursor-based replay (no missed events)
- Stream types: content blocks (start/delta/stop), tool use tracking

### OpenClaw
- **Custom binary WebSocket protocol** — request/response + event streaming
- Presence updates (typing, online/offline)
- Event streaming for tool results, blocks, chat messages
- Protocol versioning negotiated on connect

### What's different
- **Sunder** uses a managed service (Supabase Realtime) — zero infrastructure to maintain, but limited to DB change events.
- **Dorabot** and **OpenClaw** run their own WebSocket servers — more control, more complexity.
- **OpenClaw** uses a custom binary protocol for performance. **Dorabot** uses standard JSON.
- Reconnection: **Dorabot** has cursor-based replay (no missed events). **Sunder** relies on TanStack Query refetch. **OpenClaw** has sequence-based replay.

---

## 10. Memory & Context Management

### Sunder
- **Memory files in Supabase Storage:** SOUL.md (identity), USER.md (profile), MEMORY.md (scratchpad, 200-line cap)
- **7-layer context assembly:** platform → system → custom → soul → user → memory → compaction → system-reminder
- **Thread compaction:** When thread >200 messages, summarize old messages with LLM into 4-section structured format (User Instructions, Workflow, Resources, Current Focus)
- **Block storage:** All tool call args + results saved to Supabase Storage. Block index appended to compaction summary for recovery.
- **Context-removed markers:** Inline outputs ≥5KB replaced with permanent markers pointing to storage paths
- **Trigger pruning:** Trigger events mechanically extracted during compaction (no LLM involvement)

### Dorabot
- **Workspace files:** SOUL.md, USER.md, MEMORY.md (500-line cap) in `~/.dorabot/workspace/`
- **Daily memory:** `~/.dorabot/workspace/memories/YYYY-MM-DD/` — today's work log
- **Research DB:** `~/.dorabot/research/` — curated knowledge base with tagging
- **Memory search:** FTS5 over all past messages (AND/OR/NOT, phrase queries, date/channel filters)
- **No thread compaction** — full-text search replaces summarization
- **Context assembly:** identity → interaction style → autonomy → skills → workspace → calendar

### OpenClaw
- **Session files:** JSON + Markdown per session in `~/.openclaw/sessions/`
- **Vector memory:** LanceDB or sqlite-vec for semantic search
- **Hybrid search:** BM25 (lexical) + semantic (vector) via `hybrid.ts`
- **Batch embeddings:** Provider-specific APIs (OpenAI, Gemini, Voyage, Minimax)
- **Session pruning:** Old messages compacted/archived (similar to Sunder's compaction)
- **No shared memory files** — memory is per-agent, not global SOUL/USER/MEMORY

### What's different
- All three use SOUL/USER/MEMORY-style files, but **OpenClaw** doesn't have them (memory is session-scoped).
- **Sunder** has the most sophisticated compaction: structured summaries + block index + trigger pruning + storage recovery. Optimized for long-lived CRM threads.
- **Dorabot** skips compaction entirely — relies on FTS5 search to find relevant past context on demand. Simpler but potentially less coherent for long conversations.
- **OpenClaw** uses vector embeddings for memory search (semantic). **Dorabot** uses FTS5 (lexical). **Sunder** doesn't search past conversations — it summarizes them.
- **Dorabot's** daily memory pattern (date-partitioned files) is unique — creates a natural work log.
- Only **Sunder** stores tool call data separately (block storage) for recovery after compaction. The others lose tool output details when messages are pruned.

---

## 11. Background Jobs & Automation

### Sunder
- **Cron scanning:** `/api/cron/scan` runs periodically, claims due triggers atomically
- **Trigger types:** cron (scheduled), webhook (HTTP POST), RSS (feed monitoring), pulse (autopilot)
- **DB-backed triggers:** `agent_triggers` table with JSONB config, `next_fire_at`, `current_run_id`
- **Retry:** Up to 3 retries for user-created triggers
- **Autopilot pulse:** `run-autopilot.ts` — non-streaming, read-only tools, checks todos + tasks

### Dorabot
- **RFC 5545 iCal RRULE** scheduling (not cron expressions)
- **Calendar items:** SQLite `calendar_items` table with DTSTART, RRULE, VALARM
- **Tick interval:** 30 seconds (configurable)
- **Autonomy pulse:** 15m–2h intervals, 9-priority work loop (advance tasks → monitor → follow up → research → engage → propose)
- **Timezone-aware:** IANA timezone names, wall-clock execution

### OpenClaw
- **Cron tool:** Standard 5-field cron expressions
- **Wake events:** Gateway-managed triggers
- **Webhook handling:** Gmail Pub/Sub, custom webhooks
- **Execution:** In-process, single-threaded per session
- **No formal retry system** — tool execution is fire-and-forget

### What's different
- **Sunder** uses DB-backed triggers with atomic claiming — designed for cloud (multiple function instances could race). **Dorabot** and **OpenClaw** are single-process, no contention.
- **Dorabot** uses RFC 5545 iCal (same standard as calendar apps). More expressive than cron for recurring events. **Sunder** and **OpenClaw** use cron expressions.
- **Dorabot** has the most sophisticated autonomy loop (9-priority hierarchy). **Sunder's** autopilot is simpler (check todos + tasks). **OpenClaw** doesn't have a structured pulse system.
- Only **Sunder** has webhook and RSS trigger types. **Dorabot** has calendar events. **OpenClaw** has cron + webhooks.

---

## 12. Channel / Messaging Integration

### Sunder
- **Web chat only** — single channel, streamed via AI SDK
- No external messaging integration (Phase 2+)
- Composio integration (OAuth for Gmail, Calendar) planned

### Dorabot
- **3 channels:** Web chat (desktop), WhatsApp (Baileys), Telegram (grammy)
- Channel handler registry: `registerChannelHandler(channel, {send, edit, delete})`
- Message tool routes to correct handler by channel name
- WhatsApp: QR login, session persistence
- Telegram: Bot token, long polling

### OpenClaw
- **15+ channels:** WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Matrix, Line, Zalo, Teams, email, SMS, etc.
- Provider pattern: each channel has monitor + send adapter + access policies
- Deterministic routing: exact peer → parent peer → guild+roles → account → channel → default
- DM policies: pairing, open, allowlist, disabled
- Group rules: mention-based, chunking
- Session key isolation: DMs → `main`, groups → isolated key

### What's different
- **OpenClaw** is built around multi-channel as the core design. The gateway *is* the message router.
- **Dorabot** adds channels pragmatically (3 channels with a clean registry pattern).
- **Sunder** is web-only for now — channel integration comes via Composio (managed OAuth), not direct protocol integration.
- **OpenClaw's** routing system is the most sophisticated (role-based, guild-scoped, with fallback chains).

---

## 13. Security Model

### Sunder
- **Multi-tenant SaaS model**
- RLS on every table (`client_id` scoping)
- Double-lock: RLS + application-level `clientId` injection
- Two-tier safety: internal work auto-runs, external-facing requires approval
- System prompt instructs agent to ask for confirmation (soft gate)
- Audit log for all CRM mutations

### Dorabot
- **Single-user local model**
- Gateway auth token (64-char hex, filesystem-stored)
- OS keychain for API keys and OAuth tokens
- 3-tier tool approval: auto-allow → notify → require (5-min timeout)
- File access: Path allowlist restricts agent read/write

### OpenClaw
- **Single-operator trust model** — formally specified
- Device auth (Ed25519 keypair challenge-response)
- DM pairing codes for unknown senders
- Docker sandboxing: off / non-main / all sessions
- Sandbox scope: per-session / per-agent / shared
- `tools.elevated` escape hatch for host commands when sandboxed
- Security audit CLI (`openclaw security audit`)
- Formally verified with MITRE ATLAS + TLA+/TLC models

### What's different
- **Sunder** is the only one needing tenant isolation (multi-user SaaS). RLS is critical infrastructure.
- **OpenClaw** has the most rigorous security model — formal verification (TLA+), MITRE ATLAS framework, Docker sandboxing, security audit CLI. Makes sense: it exposes the agent to untrusted external messages.
- **Dorabot** has the simplest model — local user, OS keychain, path allowlist. Sufficient for desktop use.
- Tool approval: **Sunder** = soft (system prompt). **Dorabot** = mechanical (timeout). **OpenClaw** = policy-driven (profiles + sandbox).

---

## 14. Testing

### Sunder
- **Vitest v4** + React Testing Library
- jsdom environment
- Unit + integration tests colocated with source
- Pre-existing test suite (runner, tools, CRM, memory, compaction)

### Dorabot
- **No formal test framework** — ad-hoc integration scripts in `scripts/`
- `test-event-log.ts`, `test-reconnect-replay.ts`, `test-load-7x4.ts`, etc.
- Manual testing via CLI dev mode
- No linter enforced in CI

### OpenClaw
- **Vitest 4.0** + V8 coverage
- Multiple configs: unit, E2E, live (requires API keys), Docker
- 70% line coverage threshold enforced
- 3 workers in CI, 16 locally
- Docker E2E runner for integration tests

### What's different
- **OpenClaw** has the most mature test infrastructure (coverage thresholds, multiple configs, Docker E2E).
- **Sunder** has good unit/integration test coverage with Vitest.
- **Dorabot** has minimal formal testing — relies on manual and ad-hoc scripts.

---

## 15. Type System & Validation

### Sunder
- **Zod v4** everywhere — API inputs, tool params, DB rows, config
- Generated types from Supabase schema (`Database` type)
- No enums — literal unions + maps
- Functional components with TypeScript interfaces

### Dorabot
- **Zod v4** for tool input schemas
- TypeScript strict mode, ES2022 target
- No enums — discriminated unions + maps
- ~95% type coverage
- JSON columns with flexible typing (`data JSON`)

### OpenClaw
- **Zod 4.3** for config validation
- **TypeBox** (`@sinclair/typebox`) for tool schemas — different from Zod
- TypeScript 5.9 strict, ESM
- No enums — unions preferred
- Plugin configs use inline JSON Schema

### What's different
- **Sunder** and **Dorabot** are fully Zod-based. **OpenClaw** uses TypeBox for tools and Zod for config — dual schema systems.
- Only **Sunder** has generated database types (Supabase CLI). The others define types manually.
- All three avoid enums in favor of discriminated unions.

---

## Summary: Key Architectural Trade-offs

| Trade-off | Sunder | Dorabot | OpenClaw |
|-----------|--------|---------|----------|
| **Cloud vs Local** | Cloud-first (Vercel + Supabase) | Local-first (Electron + SQLite) | Local-first (Gateway daemon) |
| **Stateless vs Stateful** | Stateless runs (rebuild from DB) | Stateful SDK sessions (resume) | Stateful gateway sessions |
| **Provider coupling** | Provider-agnostic (AI Gateway) | Claude-first (Agent SDK) | Multi-provider (Pi runtime) |
| **Persistence** | Relational DB (Postgres) | Relational DB (SQLite) | Files (JSON/JSONL/MD) |
| **Context strategy** | Summarize (LLM compaction) | Search (FTS5 on demand) | Hybrid (vector + lexical search) |
| **Security posture** | Multi-tenant RLS | Single-user local | Single-operator, formally verified |
| **Channel strategy** | Web-only + managed OAuth | 3 channels + registry | 15+ channels + plugin system |
| **Tool approval** | Soft (prompt-based) | Mechanical (timeout gate) | Policy-driven (profiles + sandbox) |
| **Extension model** | None (monolith) | Skills (markdown) | Full plugin SDK + extensions |

### What Sunder can learn from

1. **From Dorabot:** Daily memory pattern (date-partitioned work logs), FTS5 as a complement to compaction, RFC 5545 scheduling (richer than cron), cost tracking per run, hook system for extensibility.

2. **From OpenClaw:** Formal security model (MITRE ATLAS framework), Docker sandboxing for tool execution, hybrid search (vector + lexical), coverage thresholds in CI, plugin system for extensibility, multi-provider failover.

3. **From both:** Tool approval as a mechanical gate (not just prompt instruction), reconnection with replay (no missed events), structured autonomy pulse (priority-ordered work loop).
