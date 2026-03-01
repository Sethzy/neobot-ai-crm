# Sunder Implementation Phasing Plan

> **⚠ SUPERSEDED:** The canonical plan is the JSON version at `docs/product/plans/2026-03-01-implementation-phasing-plan.json` (48 PRs, 5 phases). This markdown is kept for readability but is not maintained — it is missing 3 PRs (12a, 19a, 32a) and has stale decision IDs. When in doubt, trust the JSON.

**Date:** 2026-03-01
**Status:** Superseded by JSON
**Architecture decisions:** `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` (154 active decisions)
**Codebase:** `/Users/sethlim/Documents/sunder-next-migration-20260225`

---

## Context

### What Already Exists

The codebase is a Next.js 15 app with:
- **Working:** Supabase Auth + middleware, Vercel deployment, landing page, document processing pipeline (Gemini classification → ExtendAI extraction → PDF viewer), Anthropic Analyst chat with container code execution, report generation
- **DB:** 15 migrations — `cases`, `documents`, `splits`, `report_history`, `user_instructions`, `whatsapp_contacts`, `whatsapp_messages`
- **Placeholder routes:** `/chat`, `/crm`, `/automations`, `/channels`, `/knowledge`, `/mission-control`, `/settings`, `/tasks`, `/memory`
- **Stack:** Next.js 15, React 19, Tailwind 4, ShadCN, TanStack Query/Table, Supabase, Vercel

### What We're Building

A conversational AI agent for real estate professionals. The existing document processing pipeline becomes a specialized tool the agent can call. The agent is the primary interface — it manages CRM, memory, triggers, skills, and tools.

### Architecture Relationship

| Existing | New (Architecture Decisions) | Relationship |
|----------|------------------------------|-------------|
| Cases/Documents/Splits | Document processing tool | Agent calls existing `/api/gemini/process` as a tool |
| Analyst chat (Anthropic containers) | Runner engine + agent chat | **Replaced** by new runner engine (Vercel AI SDK, not raw Anthropic SDK) |
| `pages/api/chat.ts` | `/api/chat` (App Router) | New endpoint, new architecture |
| Supabase Auth | Supabase Auth | **Kept as-is** |
| Landing page | Landing page | **Kept as-is** |
| Placeholder routes | Real implementations | Built across phases |

### Monorepo Decision

FOUND-04 specifies Turborepo + pnpm workspaces. The existing app is a single Next.js app. **Phase 1 does NOT migrate to Turborepo** — that's premature complexity for one app. Turborepo becomes relevant when/if we add a second package (e.g., shared SDK). For now, the existing single-app structure is correct.

---

## Phase Overview

| Phase | Theme | New Decisions | PRs (est.) | Demoable Moment |
|-------|-------|--------------|------------|-----------------|
| **1** | Chat + CRM + Basic Tools | 39 | ~12 | "I met John Smith at 123 Oak St" → agent creates contact + deal, user sees it in CRM page |
| **2** | Memory + Personality + Autopilot | 34 | ~10 | Agent remembers your name next session. Autopilot emails you about stale deals |
| **3** | Skills + Connections + Sandbox | 36 | ~10 | User connects Gmail, agent drafts follow-up. Agent generates CMA in sandbox |
| **4** | Polish + Approval Gates + Eval | 27 | ~8 | Onboarding flow, Mission Control, agent asks permission before sending |
| **5** | Channels + Scale | 14 | ~5 | Telegram bot works, rate limiting, observability |

---

## Phase 1: Chat + CRM + Basic Tools

**Goal:** User can chat with an AI agent that reads/writes CRM data, searches the web, and reads/writes files. Read-only CRM pages let the user verify what the agent did.

**What's already done (free from existing codebase):**
- Auth + middleware (DATA-08) ✓
- Supabase project + deployment (FOUND-02) ✓
- Next.js + React + Tailwind + ShadCN (FOUND-05) ✓
- Placeholder routes for all pages ✓
- TanStack Query/Table wired up ✓

### PR Sequence

#### PR 1: Vercel AI Gateway + basic streaming endpoint
**Decisions:** LLM-01, LLM-02, LLM-05, EXEC-01 (interactive mode only)

- Install `@ai-sdk/gateway`, `ai` (Vercel AI SDK)
- Create `app/api/chat/route.ts` (App Router, replaces `pages/api/chat.ts` for agent)
- Wire up Vercel AI Gateway with `AI_GATEWAY_API_KEY`
- Basic `streamText()` call with Gemini Flash (Tier 1)
- Hardcoded system prompt (real estate agent persona — placeholder for RUNNER-03 full assembly in Phase 2)
- No tools yet, just streaming text responses
- **Test:** curl the endpoint, get a streamed response

#### PR 2: Chat UI with streaming
**Decisions:** UX-01, UX-06

- Replace `/chat` placeholder with real chat interface
- `useChat()` hook from Vercel AI SDK pointed at new endpoint
- Message list, input box, streaming response display
- Thread rail in sidebar (new thread button, thread list)
- Chat is default home after login (redirect from `/` dashboard)
- **Test:** Log in, type a message, see streamed response

#### PR 3: Clients + conversation threads + messages DB schema
**Decisions:** SESSION-01, DATA-09 (partial — platform tables only), RUNNER-08

- New migration: `clients` table (client_id UUID PK, user_id FK to auth.users UNIQUE, display_name, created_at)
- New migration: database trigger on `auth.users` INSERT → auto-creates `clients` row
- New migration: `conversation_threads` table (thread_id UUID PK, client_id FK, title, is_pinned, created_at, updated_at)
- New migration: `conversation_messages` table (message_id, thread_id FK, role, content, parts JSONB, created_at)
- New migration: `runs` table (run_id, thread_id FK, client_id FK, status enum [queued, running, completed, partial, failed, cancelled], model, tokens_in, tokens_out, created_at, completed_at)
- RLS policies: users see only their client's conversation_threads/conversation_messages/runs (DATA-03)
- Wire chat UI to persist messages to DB
- Wire thread rail to list/create conversation_threads from DB
- **Test:** Create thread, send messages, refresh page — conversation persists

#### PR 4: Runner engine (core loop) + per-thread serialization
**Decisions:** RUNNER-01, RUNNER-02, RUNNER-05, TOOL-01, TRIG-06

- Create `src/lib/runner/run-agent.ts` — the single `runAgent()` function both execution modes call
- Context assembly: hardcoded system prompt + thread message history (RUNNER-03 skeleton)
- `streamText()` with `maxSteps: 4` (Tier 1) and empty tools array
- Run status tracking: create run record on start, update on completion
- Stateless invocation model (RUNNER-05): every call loads fresh from DB
- Strict tool contract types with Zod schemas (TOOL-01)
- Per-thread run serialization (TRIG-06, Dorabot pattern): atomic run insert checks no active run exists on thread; if active run, queue message in `thread_queue_records`; on run completion, drain queue and start next run
- New migration: `thread_queue_records` table (record_id, thread_id FK, client_id FK, content JSONB, channel TEXT, created_at)
- Refactor `/api/chat/route.ts` to call `runAgent()` with queue check
- **Test:** Chat works exactly as before, but now goes through runner. Send two messages fast — second gets queued, processed after first completes

#### PR 5: CRM schema + seed data
**Decisions:** DATA-09 (partial — 6 CRM tables), DATA-01

- New migration: `contacts` (contact_id, client_id, first_name, last_name, email, phone, type enum [buyer, seller, vendor, other], notes, created_at, updated_at)
- New migration: `deals` (deal_id, client_id, address, stage enum [prospect, active, under_contract, closed_won, closed_lost], price, contact_id FK, notes, created_at, updated_at)
- New migration: `interactions` (interaction_id, client_id, contact_id FK, deal_id FK nullable, type enum [call, meeting, email, note, showing], summary, occurred_at, created_at)
- New migration: `crm_tasks` (task_id, client_id, title, description, status enum [open, completed], due_date, contact_id FK nullable, deal_id FK nullable, created_at)
- New migration: `crm_config` (config_id, client_id, deal_stages JSONB, task_types JSONB, interaction_types JSONB)
- RLS on all tables
- **Test:** Tables exist, RLS works, can insert/query via Supabase dashboard

#### PR 6: CRM tools for the agent
**Decisions:** TOOL-03 (CRM category), TOOL-09

- Implement tool definitions: `search_contacts`, `create_contact`, `update_contact`, `search_deals`, `create_deal`, `update_deal`, `create_interaction`, `search_tasks`, `create_task`, `update_task`
- Each tool: Zod input schema, Supabase query, formatted response
- Register tools in runner's `streamText()` call
- Bump `maxSteps` to 8 for tool usage
- **Test:** Ask agent "create a contact for John Smith, phone 555-1234" → contact appears in DB

#### PR 7: File tools (Supabase Storage)
**Decisions:** DATA-02, DATA-04, TOOL-03 (Storage/File category)

- Create per-client storage layout: `/{clientId}/` root in Supabase Storage
- Implement `read_file` tool (dual-purpose: file path → content, directory path → tree listing)
- Implement `write_file` tool (writes to Supabase Storage, path-scoped to client)
- Storage bucket: `agent-files` (new, separate from existing `documents`/`reports`)
- RLS on storage: client can only access own prefix
- **Test:** Ask agent "write a note about today's showing" → file appears in Storage

#### PR 8: Web search tool
**Decisions:** SERVICE-03, TOOL-03 (Utility category), TOOL-10

- Implement `web_search` tool using Brave Search API
- Input: query string. Output: formatted search results (title, snippet, URL)
- Implement `web_scrape` tool (fetch URL → extract text content)
- **Test:** Ask agent "search for recent home sales in Austin TX" → returns real results

#### PR 9: Supabase Realtime for live updates
**Decisions:** DATA-07

- Wire Supabase Realtime subscriptions on CRM tables
- When agent creates/updates a contact or deal, frontend reflects immediately
- Subscribe on thread page load, unsubscribe on unmount
- **Test:** Have agent create a contact while CRM page is open in another tab → appears without refresh

#### PR 10: CRM read-only pages (Contacts)
**Decisions:** UX-02 (nav)

- Replace `/crm` placeholder with tabbed CRM section
- Contacts list page: TanStack Table with search/filter
- Contact detail page: read-only fields + linked deals + interaction timeline
- Navigation: add CRM to sidebar nav
- **Test:** Agent creates contacts via chat, user browses them in CRM pages

#### PR 11: CRM read-only pages (Deals + Tasks)
**Decisions:** UX-02 (nav)

- Deals list page: TanStack Table with stage badges
- Deal detail page: read-only fields + linked contact + interactions
- Tasks list page: table view with status, due date, linked contact/deal
- **Test:** Full CRM browse experience across contacts, deals, tasks

#### PR 12: Audit trail + basic safety
**Decisions:** SAFETY-03 (audit trail only), SCALE-01

- Every tool call logged: tool name, input, output, timestamp, run_id → `tool_calls` column on runs table (JSONB array)
- Basic error handling: tool failures don't crash the run, agent gets error message and can retry
- Cost tracking stub: log model + token count per run (foundation for LLM-10 in Phase 2)
- **Test:** Check runs table after a conversation — tool calls are logged

### Phase 1 End State
- User logs in → sees chat → talks to agent → agent creates CRM data → user verifies in CRM pages
- Existing document processing (cases/splits/extraction) untouched and still works
- All data persisted in Supabase with RLS
- 6 CRM tables + 3 platform tables (conversation_threads, conversation_messages, runs) added to existing schema

---

## Phase 2: Memory + Personality + Autopilot

**Goal:** Agent remembers across sessions. Background autopilot proactively monitors deals. Smart model routing reduces cost.

### PR Sequence (estimated)

#### PR 13: Storage layout + SOUL.md + USER.md
**Decisions:** MEM-01, MEM-02, DATA-04

- Bootstrap `/{clientId}/SOUL.md` and `/{clientId}/USER.md` on first login
- Default SOUL.md: real estate agent personality template
- Default USER.md: empty, agent populates during conversations
- Runner reads SOUL.md + USER.md at context assembly time (RUNNER-03 becomes real)

#### PR 14: Memory system
**Decisions:** MEM-03, MEM-05, MEM-06, DATA-06

- Seed `/{clientId}/memory/` directory with 4 starter files (MEM-03 taxonomy)
- Agent reads memory files during context assembly
- Agent auto-writes to memory during runs (MEM-05)
- Memory files are storage-only, no DB rows — discovered via directory listing (DATA-06)
- Memory shared across all threads (MEM-06)

#### PR 15: Platform instructions + system-reminder
**Decisions:** RUNNER-09, RUNNER-04

- Platform instructions layer (position #0 in context assembly)
- System-reminder injection per turn (~130 tokens: time, user, trigger count, task count, etc.)
- Forked from Tasklet system prompt, adapted for Sunder

#### PR 16: Model routing
**Decisions:** LLM-03, LLM-04, LLM-08, LLM-09

- `routeQuestion()` classifier (Gemini Flash Lite)
- Named model set with fallback chains
- Background tier for cheap work (DeepSeek/Kimi)
- Two routing paths: interactive (classifier) and trigger (hardcoded tier)

#### PR 17: Per-run telemetry
**Decisions:** LLM-10, LLM-11

- Log model, tokens, cost, latency per run to `usage_telemetry` table
- Cost ceiling monitoring (target: <$20/user/mo)

#### PR 18: Cron scanner + agent_triggers table
**Decisions:** TRIG-01, TRIG-02, TRIG-04, TRIG-05

- `agent_triggers` table schema
- `/api/cron/scan` route (Vercel cron, 1 min)
- Scanner queries next_run_at, fires `/api/trigger/run`
- Per-thread serialization (TRIG-06)

#### PR 19: Autopilot thread + pulse
**Decisions:** TRIG-07, TRIG-08, TRIG-09, TRIG-10

- Pre-installed "Sunder Autopilot" thread on signup
- Autopilot trigger auto-created (6h default pulse)
- Autopilot runs in trigger mode (generateText, not streamText)
- Email notifications for results (TRIG-06b)

#### PR 20: Trigger tools + user-created triggers
**Decisions:** TRIG-03, TRIG-12

- Agent can call `create_trigger`, `search_triggers`, `manage_active_triggers`
- Two retry policies (autopilot: 0, everything else: max 2)

#### PR 21: Memory synthesis pulse
**Decisions:** TRIG-11

- Separate trigger from autopilot (weekly cadence)
- Reads memory files, detects patterns, proposes skill items

#### PR 22: Context recovery + thread compaction
**Decisions:** DATA-10, SESSION-07, TASKLET-04

- Toolcall artifact recovery on context truncation
- Long-thread summarization when context budget exceeded

---

## Phase 3: Skills + Connections + Sandbox

**Goal:** Agent becomes extensible — skills customize behavior, connections integrate external services, sandbox runs code.

### PR Sequence (estimated)

#### PR 23-24: Skill system (registry + loading)
**Decisions:** SKILL-01 through SKILL-08

#### PR 25-26: Composio connections + OAuth
**Decisions:** CONN-01 through CONN-03, TOOL-04, TOOL-06

#### PR 27-28: Vercel Sandbox integration
**Decisions:** EXEC-04 through EXEC-11

#### PR 29: Subagents
**Decisions:** RUNNER-06, RUNNER-07

#### PR 30-31: Full tool surface + scraping lanes
**Decisions:** TOOL-02, TOOL-07, TOOL-08, SERVICE-12/b/c/d

#### PR 32: Document processing as agent tool
- Wire existing `/api/gemini/process` as a tool the agent can call
- Agent can trigger document classification/extraction on behalf of user

---

## Phase 4: Polish + Approval Gates + Eval

**Goal:** Product feels complete. Approval gates, onboarding, Mission Control.

### PR Sequence (estimated)

#### PR 33-34: Approval system
**Decisions:** SAFETY-01, SAFETY-02, SAFETY-04

#### PR 35-36: Mission Control + Tasks UI
**Decisions:** UX-03, UX-04

#### PR 37: Structured AI input
**Decisions:** UX-05

#### PR 38: Onboarding flow
**Decisions:** UX-09

#### PR 39: Higher tier models
**Decisions:** LLM-06, LLM-07

#### PR 40: Eval harness + observability
**Decisions:** EVAL-01 through EVAL-04

---

## Phase 5: Channels + Scale

**Goal:** Telegram channel, scaling infrastructure, voice I/O.

### PR Sequence (estimated)

#### PR 41-42: Telegram integration
**Decisions:** GAP-09 (v2), UX-07

#### PR 43: Rate limiting + cost controls
**Decisions:** GAP-16, SCALE-02

#### PR 44: Scaling prep (R2, Workers)
**Decisions:** SCALE-03, SCALE-04

#### PR 45: Voice I/O
**Decisions:** SERVICE-06, SERVICE-07

---

## Cross-Phase Dependencies

```
Phase 1 (Chat + CRM)
  └── Phase 2 (Memory + Autopilot)
       ├── Phase 3 (Skills + Connections + Sandbox)
       │    └── Phase 4 (Polish + Approvals)
       │         └── Phase 5 (Channels + Scale)
       └── Phase 4 can start in parallel with Phase 3 for UX work
```

## Resolved Questions

1. **Existing `pages/api/` routes**: **Keep as-is.** Pages Router stays for document processing endpoints (`/api/gemini/process`, `/api/docgen/generate`). App Router (`app/api/`) for new agent endpoints. Next.js supports both simultaneously.
2. **Existing Anthropic Analyst chat**: **Replace in Phase 3.** The Analyst chat (raw Anthropic SDK + containers) gets replaced when the new agent gains Vercel Sandbox (PR 27-28) and document processing tools (PR 32). Same workflow, better infra — Vercel Sandbox avoids the Anthropic container gotchas. Analyst chat code stays untouched until then.
3. **Turborepo migration timing**: **Defer until needed.** No Turborepo until a second package actually emerges. Single Next.js app with well-organized `src/lib/` folders is sufficient through at least Phase 2.
4. **Existing WhatsApp tables**: **Ignore, rebuild in Phase 5.** `whatsapp_contacts` and `whatsapp_messages` are legacy from an earlier approach. Phase 5 designs WhatsApp integration fresh to fit the channel architecture. Old tables cost nothing sitting inert.
5. **Environment variables**: **Coexist, no action needed.** AI Gateway (`AI_GATEWAY_API_KEY`) for new agent. Direct Gemini key for doc processing. Direct Anthropic key for Analyst chat until Phase 3 removes it. Keys consolidate naturally as features migrate to the gateway.
