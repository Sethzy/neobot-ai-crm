# Sunder - AI Orchestration SaaS — App Specification

> **Version:** 2.0
> **Date:** March 1, 2026
> **Status:** Canonical App Spec (replaces v1/v2/v3 specs, now archived)

---

## How to Read This Document

This is the full product vision for Sunder. It defines the complete product and architecture.

> **Important:** For what we're _actually building now_, see the **v2 implementation plan** (`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`). The v2 plan is scope-cut from this spec. Where they conflict, **the v2 plan wins.** This spec describes the aspirational full product; many sections (skills system, sandbox, Goals view, structured input, etc.) are deferred beyond v2.

**Companion documents:**

| Document | Purpose | Path |
|----------|---------|------|
| Architecture Decisions | 154 approved technical decisions across 18 categories | `architecture/architecture-decisions-checklist.json` |
| Implementation Plan | **v2 (active):** 5 phases, 30 PRs (13 done + 17 to build) | `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`. Supersedes original 48-PR plan at `2026-03-01-implementation-phasing-plan.json`. |
| Built-In Services | 13 service integrations with API verification and code examples | `services/01-Built-In Services (Imported from RE-AI-CRM).md` |
| Unit Economics | Per-user cost model across paid service stack | `services/02-Unit Economics Model ($20 Target vs Actual).md` |
| Mission Control UX | UI behavior spec (draft) | `ux-and-pm/01-Mission Control UX Spec (Draft).md` |
| Tasklet Reference | 100+ files documenting Tasklet's architecture, tools, skills, workflows | `references/tasklet/` |
| Fintool Reference | Strategic articles on vertical AI agents, model-market fit | `references/Fintool/` |
| Savoir Extraction Guide | Approved code patterns from Vercel's template | `architecture/04-Savoir Extraction Guide.md` |

**Decision ID convention:** Technical claims reference architecture decision IDs like `FOUND-01`, `LLM-03`, `DATA-06`. Look these up in `architecture-decisions-checklist.json` for full reasoning.

**Conflict rule:** This spec wins on product behavior. The architecture decisions JSON wins on technical implementation details. The implementation plan wins on execution order.

---

## Table of Contents

1. [Overview](#1-overview)
2. [What the Product Is](#2-what-the-product-is)
3. [Who It Is For](#3-who-it-is-for)
4. [User Experience](#4-user-experience)
5. [Architecture Overview](#5-architecture-overview)
6. [Core System Components](#6-core-system-components)
7. [Autopilot](#7-autopilot)
8. [Memory System](#8-memory-system)
9. [Safety and Approvals](#9-safety-and-approvals)
10. [Data Model](#10-data-model)
11. [Sessions and Threads](#11-sessions-and-threads)
12. [Connections and Integrations](#12-connections-and-integrations)
13. [Services](#13-services)
14. [UX and Navigation](#14-ux-and-navigation)
15. [Channels](#15-channels)
16. [Cost and Scaling](#16-cost-and-scaling)
17. [Implementation Phasing](#17-implementation-phasing)
18. [Risks and Mitigations](#18-risks-and-mitigations)
19. [Open Questions](#19-open-questions)
20. [Reference Guide](#20-reference-guide)

---

## 1. Overview

Sunder is a **done-for-you AI orchestration system** for solo real estate agents.

The system runs everyday business work in the background: updating CRM records, preparing follow-ups, summarizing activity, handling inbound information, and drafting communications.

The key product shift is simple:

- We are **not** building a complicated agent framework product.
- We are building a **reliable assistant experience** that feels easy to adopt.
- We follow a **Tasklet-style architecture** for faster shipping and lower complexity.

### Core success criteria

1. User can activate in **under 10 minutes** without handholding.
2. Product is useful from day 1 through web chat.
3. High-risk actions are controlled and auditable.
4. Unit economics stay healthy with a hard cost ceiling of **<$20 per active paid user per month**.
5. Product gets measurably smarter for each user over time through structured memory that compounds.

---

## 2. What the Product Is

In plain language, Sunder is a subscription service where an agent gets an AI teammate that:

1. Keeps their contact and deal memory organized.
2. Prevents follow-ups from slipping.
3. Turns conversation and files into structured CRM updates.
4. Produces useful daily and event-based briefings.
5. Handles repetitive operations and asks approval for risky actions.

Sunder builds a durable understanding of the user's business, their clients, and how they work. The longer they use it, the less they need to explain. This compounding memory is the primary long-term value driver and switching cost.

This is a product for people who do not want to learn complicated software.

The user should feel:

- "I just ask in chat and things get done."
- "I trust what it is doing."
- "I do not need to manage another tool stack."

### Strategic thesis: Bundling fragmented services

Sunder follows the **Toast playbook** for real estate: in verticals where incumbent software is fragmented enough to allow rip-and-replace, the winning strategy is to own the system of record and make every AI feature a retention mechanism rather than a standalone product. The two things that matter are **owning the underlying context** and **deploying intelligence on top of it**.

Rather than layering AI on someone else's platform, Sunder bundles CRM, client memory, scheduling, communications, follow-ups, knowledge management, and document handling into a single AI-native experience. This creates compounding defensibility — the more services consolidated, the richer the context, the better the intelligence, and the higher the switching cost.

> **Reference:** See `references/ease-health/bundling-thesis-reference.md` for the full thesis with comparables (Ease Health's $41M a16z-led round for behavioral health runs the identical playbook).

---

## 3. Who It Is For

### Primary user (v1)

Solo real estate agents in Singapore.

### Why this wedge

1. Their workflow is highly relationship-driven.
2. Work quality depends on consistent follow-up.
3. Admin load is heavy and repetitive.
4. They need speed and reliability more than feature novelty.

### Not in v1

1. Brokerage team workflows (shared ownership, advanced role hierarchies).
2. Full multi-seat enterprise controls.
3. Broad non-RE vertical customization.

---

## 4. User Experience

### 4.1 Onboarding: Two-Phase Model (`UX-09`)

**Phase 1: Quick Activation (<10 minutes)**

1. Sign up (email/password via Supabase Auth).
2. Connect services (Cal.com, Tally — Composio OAuth one-shot).
3. Provision runtime (seed SOUL.md, USER.md, MEMORY.md, memory topic files).
4. First useful output via web chat.

**Phase 2: Deep Profile Interview (scheduled within first week, 30-60 min)**

A structured intake interview via the Guided Interview UI:

1. Branching questions by role/domain.
2. Actively populates `USER.md` and `memory/preferences.md`.
3. Proposes Growth Plan (`memory/growth-plan.md`).

Phase 2 is not required for activation but drives personalization. If skipped, the agent falls back to passive observation via autopilot pulse. Re-suggests max once per 48h.

> **Pattern reference:** Fintool's `AskUserQuestion` mid-workflow pattern. See `references/Fintool/nicbustamante-reverse-engineering-excel-ai-agents-FULL.md`.

### 4.2 Daily Usage

Two operating modes run in parallel:

1. **Interactive chat** — user asks, agent does.
2. **Autopilot** — agent proactively checks state, acts on low-risk items, pauses for approval on high-risk items.

Daily flow:

1. User opens chat, asks for work.
2. Scheduled triggers and autopilot pulse fire in the background.
3. Low-risk actions auto-execute (CRM updates, memory writes, drafts).
4. High-risk actions pause for approval in the relevant thread.
5. User checks Mission Control queue for pending items.

### 4.3 Structured Input Primitive (`UX-05`)

AI can present clickable options with optional freeform input — a conversation pattern, not a dedicated engine. AI decides when and what options to present. v1: web buttons via `streamUI`. v2: Telegram inline keyboards. v3: WhatsApp list/button messages.

Three skills use this primitive:

1. **User Profiling** (Phase 2 onboarding) — structured intake by role/domain.
2. **Skill-Building** (Growth Plan execution) — step-by-step workflow creation.
3. **Workflow Creation** (ad-hoc) — user describes a need, agent proposes structure.

### 4.4 Product Behavior Standards

Every response must:

1. Be clear about what was done.
2. Present approvals in plain language with specific details.
3. Produce practical, action-oriented output.
4. Check existing connections before proposing new ones.
5. Never ask to reconnect when existing connection satisfies the need.
6. Explain access requests in plain language.
7. After approval, resume automatically and report completion.

---

## 5. Architecture Overview

### 5.1 Stack

| Layer | Technology | Decision |
|-------|-----------|----------|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN | `FOUND-05` |
| State/Data | TanStack Query + TanStack Table + React Hook Form | `FOUND-05` |
| AI SDK | Vercel AI SDK v6 + `@ai-sdk/gateway` | `LLM-02` |
| LLM Gateway | Vercel AI Gateway (replaces OpenRouter) | `LLM-01` |
| Database | Supabase (Postgres + RLS) | `DATA-01` |
| File Storage | Supabase Storage (per-client directories) | `DATA-02` |
| Realtime | Supabase Realtime (Postgres changes) | `DATA-07` |
| Auth | Supabase Auth | `DATA-08` |
| Compute | Vercel Functions + Vercel Sandbox (ephemeral Firecracker microVMs) | `FOUND-02`, `EXEC-04`. **v2 scope: Sandbox deferred. No code execution in v1. CRM autopilot doesn't need sandbox.** |
| Scheduling | Vercel cron (1-min scanner) + `agent_triggers` DB table | `FOUND-02` |
| Payments | Stripe (deferred to post-v1) | `FOUND-07` |

**What we don't use:** Trigger.dev (deferred to v3 scaling), sprites.dev, persistent containers, per-client sandboxes.

### 5.2 Compute Model (`FOUND-02`)

All agent work runs in Vercel Functions (15-min Fluid Compute ceiling). No persistent processes.

- **Chat requests**: Vercel Function → `streamText()` / `generateText()` via AI Gateway.
- **Background triggers**: Vercel cron (1-min tick) → scans `agent_triggers` table → invokes runner for due triggers.
- **Code execution**: Vercel Sandbox (ephemeral Firecracker microVM, spun up on demand, destroyed after use).

The cron scanner pattern: a single Vercel cron job runs every minute, queries `SELECT * FROM agent_triggers WHERE next_run_at <= now() AND status = 'active'`, and invokes the runner for each due trigger. Atomic claim via `UPDATE ... SET status = 'running' WHERE status = 'active' RETURNING *` prevents double-execution (`TRIG-02`).

> **Pattern reference:** See `references/tasklet/persistence-and-cron/` for Tasklet's cron semantics. Sunder follows the same model with Vercel cron instead of Tasklet's internal scheduler.

### 5.3 Data Architecture Split

Two storage systems (`DATA-01`):

1. **Supabase Postgres** — structured business state (CRM, threads, messages, runs, triggers, telemetry). RLS per client.
2. **Supabase Storage** — per-client file workspace (`/{clientId}/SOUL.md`, `/{clientId}/USER.md`, `/{clientId}/MEMORY.md`, `/{clientId}/memory/*.md`). Agent interacts via `read_file` / `write_file` tools.

> **Pattern reference:** This mirrors Tasklet's per-agent data model. See `references/tasklet/per-agent-data-model.md`.

---

## 6. Core System Components

### 6.1 Runner Engine (`RUNNER-01` through `RUNNER-08`)

Single orchestration loop. All channels feed into the same runner:

```
load state → build context → call model → execute tools → continue until done → persist run
```

Implementation uses Vercel AI SDK `streamText()` with `maxSteps` for tool-call loops (`RUNNER-02`). The runner is stateless — every invocation loads full context from DB + Storage, runs, and persists results.

**Run statuses** (`RUNNER-08`): `queued` → `running` → `completed` | `partial` | `failed` | `cancelled`

**Context load order** (fixed):
1. System prompt (identity, tools, instructions)
2. `SOUL.md` (personality — `MEM-01`)
3. `USER.md` (profile — `MEM-02`)
4. First 200 lines of `MEMORY.md` (auto memory — `MEM-03`)
5. Thread compaction summary (older messages summarized — `SESSION-07`)
6. Recent thread messages (verbatim)
7. Current message or trigger event

**Model routing** (`LLM-05` through `LLM-09`):

> **v2 scope: Single model (Gemini Flash) for v1. Multi-tier routing is deferred, not cancelled. The table below describes the target state.**

| Tier | Model | Use Case |
|------|-------|----------|
| Background | DeepSeek V3 / Kimi K2.5 | Autopilot pulse, enrichment batch, simple cron triggers |
| Tier 1 (trivial/simple) | Gemini 3 Flash | Greetings, single CRM lookups, simple chat (~60-70% of interactive) |
| Tier 2 (moderate) | Gemini 3.1 Pro | CRM writes, research, multi-source synthesis, large context |
| Tier 3 (complex/high-trust) | Claude Sonnet 4.6 | Complex analysis, approval-adjacent decisions, deep debugging |

Smart routing saves ~94% vs all-Sonnet. 80%+ of cost is Vercel Sandbox (artifact generation) — daily chat is essentially free with Gemini Flash. Router: Gemini 2.5 Flash Lite classifies every inbound interactive message (`LLM-03`). Background tasks skip router — model hardcoded per task type (`LLM-09`).

> **Pattern reference:** Savoir's `routeQuestion` pattern for tier selection. See `architecture/04-Savoir Extraction Guide.md`. Also see `references/tasklet/core-architecture/` for Tasklet's runner loop.

### 6.2 Tool Bridge (`TOOL-01` through `TOOL-08`)

Seven tool categories:

1. **CRM** — search/create/update contacts, deals, interactions, tasks (`TOOL-01`)
2. **File/Storage** — `read_file`, `write_file` on Supabase Storage (`TOOL-03`)
3. **Sandbox** — code execution in Vercel Sandbox (`EXEC-04` through `EXEC-11`)
4. **Workflow/Subagent** — spawn child agents for parallel work (`RUNNER-06`, `RUNNER-07`)
5. **Connections** — Composio actions, MCP calls, direct API (`CONN-01`)
6. **Utility** — web search, web scrape, message tools (`TOOL-02`, `SERVICE-03`)
7. **Triggers** — `create_trigger`, `search_triggers`, `manage_active_triggers` (`TOOL-07`)

**Hybrid contract:** Strict internal tools (CRM, filesystem, workflow, approvals) with normalized envelope for external tools (Composio, MCP, Direct API). Raw provider payloads retained for debugging.

> **Pattern reference:** See `references/tasklet/tools/` for Tasklet's complete tool definitions (30+ built-in tools). Sunder's tool surface mirrors this closely. See `references/tasklet/tools/built-in/` for individual tool specs.

### 6.3 Skills and Subagents

> **v2 scope: Deferred. Skills are markdown files in Supabase Storage, read via `read_file()`. No `skill_registry` table, no guided interview UI, no skill packages in v1.**

**Skills** (`SKILL-01` through `SKILL-08`):

File-based packages: manifest, config, runbook, subagent instructions. Two tiers:
- **System skills** — pre-installed (CRM management, document processing, daily briefing).
- **Custom skills** — user-created via Guided Interview UI or agent-proposed via Growth Plan.

Skills are testable, auditable, and improvement-friendly.

> **Pattern reference:** See `references/tasklet/skills-system/` for Tasklet's skill architecture. Also `references/tasklet/skills-deep-dive-connection-generation-trace.md` for a real skill execution trace.

**Subagents** (`RUNNER-06`, `RUNNER-07`):

Protect main context from bloat. Spawned for parallel research, document analysis, or multi-step tool chains. Results summarized back to parent context.

> **Pattern reference:** See `references/tasklet/tools-skills-subagents.md`.

### 6.4 Trigger and Scheduler System (`TRIG-01` through `TRIG-13`)

One scheduler, two job types, both invoke the same runner:

1. **Scheduled triggers** — user-created cron jobs (e.g., "check PropertyGuru every morning").
2. **Autopilot pulse** — pre-installed on signup, fires every 6 hours by default.

Schema: `agent_triggers` table with `trigger_id`, `client_id`, `thread_id`, `type` (cron/webhook/pulse), `schedule`, `next_run_at`, `status`, `retry_count`.

Execution tracked in `runs` table (`TRIG-04`). Lock release on completion (`TRIG-06`): on success, update `next_run_at` from schedule and set `status = 'active'`; on failure, increment `retry_count`.

Retry policy (`TRIG-12`): Autopilot pulse gets 0 retries (next pulse in ~6h is the natural retry). All other triggers get max 2 retries (cron scanner re-picks on next tick). After max retries: `status = 'failed_permanent'`, visible in UI.

> **Pattern reference:** See `references/tasklet/persistence-and-cron/` for cron semantics and determinism hardening.

---

## 7. Autopilot

### 7.1 Pulse Contract (`TRIG-07`, `TRIG-08`)

Pre-installed on signup. Fires into a dedicated pinned thread. Default interval: every 6 hours (~4 pulses/day). Configurable: 1h / 2h / 6h / 12h. Quiet hours supported.

All autopilot activity visible in this thread. User can reply naturally to autopilot results.

### 7.2 Priority Order (`TRIG-08`)

Strict order, prompt-driven (not hard-coded system logic). Uses two surfaces: `agent_todo` (`list_todo`) for agent work, `crm_tasks` (`search_tasks`) for CRM follow-ups.

1. **Resume interrupted work** — `list_todo` — read payload for next step.
2. **Overdue CRM tasks** — `search_tasks` where `due_date < now`.
3. **Act on monitored triggers** — deal changes, inbound, anything user asked to watch. Live checks via tool calls, not assumptions.
4. **Follow up with user on unanswered questions** — if they answered, incorporate it. If not and it's been a while, nudge.
5. **Handle stale CRM tasks** — open too long without progress.
6. **Research/prepare for upcoming tasks** — if a task needs info, go get it. Check existing research first.
7. **Get to know user** — if `USER.md` is sparse, ask one concise question per pulse.
8. **Engage user** — nudge about pending approvals, remind about next steps.
9. **Propose new CRM tasks** (`create_task`) or self-todos (`manage_todo add`) — notice something worth doing? Create it.
10. **Create momentum** — break large work into smaller pieces.

> **v2 alignment:** Simplified from 11 to 10 items. Uses two surfaces: `agent_todo` (`list_todo`) for agent work, `crm_tasks` (`search_tasks`) for CRM follow-ups.

**Hard rules:**
- Do at least one meaningful action every pulse.
- Do not end without a concrete next action.
- Before declaring "nothing to act on", verify: todos checked, CRM tasks checked, monitoring checked, follow-ups checked, new tasks considered.
- "Nothing to act on" should be rare.

**Bootstrap requirement:** Even though autopilot fires into a thread with full history, the agent MUST call tools to get live state before acting (other threads may have changed things between pulses). Thread history = what autopilot did previously. Tool calls = what's actually true now. Both needed.

> **Pattern reference:** Adapted from Dorabot's 9-level autonomy pulse, extended with CRM-specific priorities. See `references/tasklet/core-architecture/` for Tasklet's operational pulse model.

---

## 8. Memory System

### 8.1 File Taxonomy (`MEM-01` through `MEM-05`)

All memory lives as markdown files in Supabase Storage under `/{clientId}/`:

| File | Purpose | Agent Access | Loaded Every Run |
|------|---------|-------------|-----------------|
| `SOUL.md` | Personality (tone, style, identity) | Read-only | Yes (position #1) |
| `USER.md` | User profile (role, preferences, business context) | Read + Write | Yes (position #2) |
| `MEMORY.md` | Working notebook (first 200 lines loaded) | Read + Write | Yes (position #3, first 200 lines) |
| `memory/preferences.md` | Working style, communication prefs, tool preferences | Read + Write | On-demand via `read_file` |
| `memory/growth-plan.md` | Skill-building roadmap (proposed/approved/in-progress/built) | Read + Write | On-demand |
| `memory/patterns.md` | Recurring behaviors with evidence dates (write after 3+ instances) | Read + Write | On-demand |
| `memory/key-decisions.md` | Umbrella for small decisions. Significant decisions get dedicated files like `memory/key-decisions/2026-02-26-123-main-pricing.md` | Read + Write | On-demand |

Agent creates additional files as needed via `write_file`. Taxonomy is seeded, not locked. Discovery: `read_file('/{clientId}/memory/')` lists all topic files.

**SOUL.md** is agent read-only. User edits from settings UI. **USER.md** is agent read+write, populated organically as agent learns about the user. **MEMORY.md** is a working notebook — agent writes directly, moves detail to topic files as it approaches the 200-line cap.

> **Pattern reference:** Follows both Tasklet and Claude Code memory patterns. See `references/tasklet/first-run-lifecycle/` for file seeding. See `references/claude/claude-code-memory-system.md` for the working notebook pattern.

### 8.2 Auto-Write Rules (`MEM-05`)

Agent reads and writes memory files during any run (chat or trigger) using `read_file` / `write_file`. No separate memory tools. No approval gate.

**Write conditions by file:**

- `memory/preferences.md` — write immediately when user states a lasting preference ("never cold-call sellers", "prefers concise CMAs"). Do NOT write transient requests ("send it now").
- `memory/patterns.md` — write after 3+ instances of same behavior. Include evidence dates.
- `memory/key-decisions/*.md` — write when a significant, hard-to-reverse decision is made. Include reasoning.
- `memory/growth-plan.md` — write when synthesis pulse promotes a confirmed pattern, or user explicitly requests.
- New files — agent creates via `write_file` when observation doesn't fit existing files.

**What NOT to save:** session-specific context, information already in CRM database, speculative or unverified conclusions from a single instance.

### 8.3 Memory Synthesis Pulse (`TRIG-11`)

> **v2 scope: Deferred. Agent self-organizes MEMORY.md during normal work. No dedicated cron pulse in v1.**

Separate trigger from autopilot (different cadence, different purpose). Weekly. Fires into its own dedicated thread (created alongside Autopilot thread on signup).

**Target state (post-v1):** List memory files, check Storage metadata timestamps for files modified since last pulse. Read each changed file, surface a brief summary to the user ("here's what I wrote to memory this week, here's what seems stale, anything to correct?"). User replies in-thread to confirm/adjust. Agent updates or deletes memory files based on feedback. Also checks if MEMORY.md is approaching 200-line cap and self-organizes.

**Further deferred:** Growth Plan proposal/enrichment, performance review, pattern detection into named skill proposals, bi-directional feedback loop.

### 8.4 Memory as Switching Cost (`MEM-07`)

Memory cannot be replicated by competitors: decision history, entity context, behavioral patterns, working style calibration.

Compounding value curve:
- **Week 1** — basic preferences.
- **Month 1** — working patterns, key contacts, deal context.
- **Month 3** — behavioral predictions, proactive suggestions.
- **Month 6+** — full institutional knowledge, Growth Plan skills built from observed patterns.

---

## 9. Safety and Approvals

### 9.1 Two-Tier Model (`SAFETY-01`)

One rule: **if it is destructive or irreversible, expands the agent's external capabilities, or sends something outside the system, it needs approval.**

**Auto-run (internal work):**
- CRM reads plus non-destructive CRM writes (create/update contacts, deals, interactions, tasks, plus link/unlink actions)
- Memory reads/writes
- Generate drafts (CMA, email, notes)
- Web search/research
- Write to thread (responses, summaries)
- Read knowledge base

**Approval required:**
- Activate tools on an existing connection
- Delete any record or connection
- Send email
- Send Telegram (v2), WhatsApp/SMS (v3)
- Schedule meetings on user's calendar
- Publish artifacts (share links externally)

No per-action granularity, no configurable matrix in v1. One rule, two columns. (`SAFETY-04`)

### 9.2 Approval Gate (`SAFETY-02`)

The approval gate is an in-thread chat interaction using AI SDK approval cards. Agent hits an approval-gated tool call → the first run returns an approve/deny card in the thread instead of executing → the user approves or denies in-thread → a follow-up run either executes the tool or handles the denial.

Works identically in chat and trigger threads. Trigger thread shows the pending action; user opens thread to respond.

### 9.3 Required Safeguards (`SAFETY-03`)

1. **Audit trail** — every tool call and result is a `thread_message`. Comes free from thread history.
2. **Memory auto-writes exempt** from approval gates.
3. **Personality (SOUL.md) is agent read-only.**
4. **One run per thread** at a time (`TRIG-06`).

Everything else (idempotency infrastructure, preflight checks, structured subagent outputs, replay persistence, versioned memory rollback) is deferred. Synthesis pulse is the memory correction mechanism.

---

## 10. Data Model

### 10.1 Supabase Tables

`DATA-09` defines **21 new v1 tables** across 6 categories. See the architecture decisions JSON for the full authoritative list. Summary:

| Category | Tables | Decision |
|----------|--------|----------|
| **Core CRM** (6) | `clients`, `contacts`, `deals`, `crm_tasks`, `interactions`, `crm_config` | `DATA-06`, `DATA-09`. **v2 note:** PR 15a expands `crm_config` with custom fields via JSONB columns on `contacts`, `deals`, `crm_tasks`. Agent configures CRM vocabulary and fields via chat. **Three-layer CRM configurability stack:** Layer 1 (vocabulary from `crm_config`), Layer 2 (custom fields via JSONB), Layer 3 (agent-generated views — catalog-based JSON specs per `UX-10`, PR 42a). |
| **Agent System** (5) | `agent_todo`, `runs`, `agent_triggers`, `autopilot_config`, `approval_events` | `TRIG-01`, `RUNNER-08`, `SAFETY-02` |
| **Conversation** (4) | `conversation_threads`, `conversation_messages`, `thread_queue_records`, `guided_interview_sessions` | `SESSION-01`, `DATA-09` |
| **Knowledge & Files** (2) | `vault_files`, `document_processing_records` | `SERVICE-02`, `DATA-09` |
| **Operational** (2) | `usage_telemetry`, `setup_progress` | `EVAL-03`, `UX-09` |
| **Views** (1) | `saved_views` | `UX-10`. Stores agent-generated view specs (JSON) with pin state. PR 42a. |
| **Infrastructure** (3) | `sandbox_sessions`, `skill_registry`, `connections` | `EXEC-04`, `SKILL-01`, `CONN-01` |

> **v2 alignment:** `agent_tasks` replaced by `agent_todo` (Tasklet-parity). `goals` table removed -- goals are written to `MEMORY.md` instead of a dedicated table. `saved_views` added for agent-generated views (PR 42a). Table count: 22.

All tables use RLS with `client_id` for row-level security.

### 10.1.1 Auth→Client Mapping

`clients` table is the root entity. Schema: `client_id` (UUID PK), `user_id` (FK to `auth.users`, unique in v1), `display_name`, `created_at`.

**v1:** 1:1 mapping — one Supabase Auth user = one client. A Supabase database trigger on `auth.users` INSERT automatically creates the `clients` row. All other tables FK to `client_id`, never to `auth.uid()` directly. RLS policies resolve `client_id` via: `client_id = (SELECT client_id FROM clients WHERE user_id = auth.uid())`.

**v2+ (multi-user):** Drop the unique constraint on `user_id`, add `client_memberships` table, update RLS to check membership. No migration needed on the 23 data tables — they already FK to `client_id`.

**Existing tables** (from document processing pipeline — stay untouched):
`cases`, `documents`, `splits`, `report_history`, `user_instructions`, `whatsapp_contacts` (legacy), `whatsapp_messages` (legacy).

### 10.2 Per-Client Storage Files

```
/{clientId}/
  SOUL.md              ← personality (agent read-only)
  USER.md              ← profile (agent read+write)
  MEMORY.md            ← working notebook (first 200 lines loaded every run)
  memory/
    preferences.md     ← seeded empty
    growth-plan.md     ← seeded empty
    patterns.md        ← seeded empty
    key-decisions.md   ← seeded empty
    ...                ← agent creates more as needed
```

### 10.3 Dual Task Model (`TASKLET-05`)

Two task surfaces, distinct purposes:

1. **CRM tasks** (`crm_tasks`) — tracking-only, binary `open` / `completed`. Created by agent to track follow-ups, reminders. User-visible in CRM UI.
2. **Agent todo** (`agent_todo`) — minimal Tasklet-parity scratchpad. Schema: `id` UUID, `client_id` TEXT, `thread_id` UUID, `title` TEXT, `payload` JSONB, `created_at` TIMESTAMPTZ. Binary state: exists (open) or deleted (done). No lifecycle statuses, no approval flags. Tools: `manage_todo` (batch add/update/delete), `list_todo` (per-thread). Purpose: agent's scratchpad for planning and cross-session resume. NOT CRM tasks.

> **v2 alignment:** Replaced full-lifecycle `agent_tasks` (planning → planned → in_progress → review → done / cancelled) with Tasklet-parity `agent_todo`. See v2 plan PR 15.

---

## 11. Sessions and Threads

### 11.1 Thread Identity (`SESSION-01`)

Simple UUID-based threads. No channel routing, no `chat_identity_key`, no lane concept in v1.

Schema: `thread_id` (UUID PK), `client_id` (FK), `title` (user-editable or auto-generated), `is_pinned` (for Autopilot/Synthesis threads), `created_at`, `updated_at`.

Web-only for v1. User creates threads from web UI. Triggers reference threads by `thread_id`.

**v2:** Telegram channel via Vercel AI SDK Chat SDK adapter. **v3:** WhatsApp via Meta Cloud API. Multi-channel identity resolution deferred to v2/v3.

### 11.2 Per-Thread Run Serialization (`TRIG-06`)

One run per thread at a time. Inspired by Dorabot's gateway pattern (see `/Users/sethlim/Documents/dorabot/src/gateway/server.ts` lines 1313-1368).

**Three paths when a message arrives on a thread:**

1. **No active run** → process immediately, create `runs` row with `status = 'running'`.
2. **Active run exists** → queue the message in `thread_queue_records` table, return `{ status: 'queued' }` to frontend/channel. Frontend shows "thinking..." indicator.
3. **Run completes** → runner checks `thread_queue_records` for pending messages on this thread. If any: batch all queued messages into context, start next run. If none: done.

**Locking mechanism:** Atomic check at run start: `INSERT INTO runs ... WHERE NOT EXISTS (SELECT 1 FROM runs WHERE thread_id = $1 AND status = 'running')`. If insert fails, message is queued instead.

**Queue draining:** After run completion, query `SELECT * FROM thread_queue_records WHERE thread_id = $1 ORDER BY created_at`. If rows exist, batch message bodies into a single context block (labeled "Messages received while processing: 1. ... 2. ..."), delete queue rows, start new run. Uses last message as reply anchor (Dorabot pattern).

**Why DB-backed queue (not in-memory):** Sunder runs on serverless (Vercel Functions) — no persistent process to hold an in-memory Map. DB queue survives cold starts and works across concurrent function invocations. Dorabot uses in-memory because it runs as a persistent Node.js process.

**Channel compatibility:** Queue logic lives in the runner/API layer, not the frontend. When Telegram (v2) or WhatsApp (v3) ship, they just POST to the same `/api/chat` endpoint and get identical queuing behavior. No channel-specific concurrency code needed.

> **Pattern reference:** Dorabot's `session.activeRun` + `pendingMessages` Map at `/Users/sethlim/Documents/dorabot/src/gateway/server.ts`. Sunder adapts this to serverless with DB-backed queue.

### 11.3 No Pause-and-Resume (`SESSION-04`)

Agent asks a question, run completes, lock released. User replies whenever. Reply triggers a new run with full thread history — LLM sees its own question and the user's answer, continues naturally. Thread history IS the checkpoint.

Same model as Tasklet. No `waiting_user_input` status, no resume logic, no persisted checkpoints.

### 11.3 Long-Thread Compaction (`SESSION-07`)

When thread exceeds context budget, summarize older messages, keep recent turns verbatim. Never delete source history in `thread_messages` table.

Use provider-native compaction via AI SDK provider options where available. Fallback: AI SDK `prepareStep` callback for providers without native compaction.

Compaction instructions tuned for CRM: "preserve deal names, contact details, task statuses, decisions made."

---

## 12. Connections and Integrations

### 12.1 Four Connection Types (`CONN-01`)

Follows Tasklet pattern exactly:

1. **integrations** — pre-built OAuth connections via Composio (`CONN-02`). Handles OAuth, token refresh, pre-built actions. Self-service: agent discovers need → pops OAuth → user approves → done.
2. **mcp** — custom MCP server connections. **Done-for-you setup in v1** — Sunder team configures the endpoint. User/agent never enters raw MCP URLs.
3. **direct_api** — raw HTTP API with explicit auth config (bearer, header, basic, query-parameter, custom-oauth). **Done-for-you setup in v1** — Sunder team configures the endpoint and auth. User just approves credentials.
4. **computer_use** — remote browser automation (Stagehand + Browserbase, `SERVICE-12`). Not available until v2.

Selection order: reuse existing → integrations → mcp → direct_api → computer_use.

> **v1 constraint (`TOOL-06`):** All 4 types exist in the schema and can hold data. `integrations` is self-service. `mcp` and `direct_api` are done-for-you (Sunder team sets up on request — user/agent cannot enter arbitrary URLs). `computer_use` returns "not yet available." Self-service mcp/direct_api may open in v2 if demand warrants it.

> **Pattern reference:** See `references/tasklet/tools/00-complete-tasklet-tool-definitions-verbatim.md` for Tasklet's connection model.

### 12.1a Future: Dedicated Google Workspace Integration (`CONN-04`)

**Status:** Evaluated 2026-03-05. **Not approved for v1.** Re-evaluate when stable.

Google's `googleworkspace/cli` ([github.com/googleworkspace/cli](https://github.com/googleworkspace/cli)) provides an MCP server (`gws mcp -s drive,gmail,calendar`) that exposes all Google Workspace APIs as structured tools. Key advantages over Composio for Google services: zero per-action cost, complete auto-updated API coverage from Discovery Service, full token custody control, MCP-native design.

**Why not now:** v0.3.4 (first published 2026-03-03), pre-v1 with expected breaking changes, no multi-tenant auth management, CLI-first (not a library), "not an officially supported Google product."

**Re-evaluate when:** (1) reaches v1.0, (2) documents multi-user OAuth patterns, or (3) Composio Google action costs exceed $200/mo. If viable, would replace Composio for Google services only — keep Composio for Cal.com, Tally.so, and other non-Google integrations.

### 12.2 Connection-First Behavior (`CONN-03`)

Follows Tasklet system prompt instruction: "ALWAYS prefer to use existing connections over creating new connections if the existing connection will work."

One-shot setup: user approves OAuth/auth once, connection persists, agent reuses automatically.

---

## 13. Services

Full details in `services/01-Built-In Services (Imported from RE-AI-CRM).md`. Summary:

| Service | Provider | Phase | Decision |
|---------|---------|-------|----------|
| CRM | Custom (Supabase) | 1 | `SERVICE-01` |
| Knowledge Base | Custom (Supabase Storage + DB index) | 1 | `SERVICE-02` |
| Web Search | Brave Search API + Exa | 1 | `SERVICE-03` |
| Scheduling | Cal.com via Composio | 1 | `SERVICE-04` |
| Forms | Tally.so via Composio | 1 | `SERVICE-05` |
| Voice Input | OpenAI Whisper | 5 | `SERVICE-06` |
| Voice Output | Inworld AI | 5 | `SERVICE-07` |
| Document Extraction | Gemini Flash (comprehension) + Sunder Pipeline (structured) | 3 | `SERVICE-09` |
| Document Generation | Vercel Sandbox + custom skills | 3 | `SERVICE-10` |
| Interactive Browser | Stagehand + Browserbase | v3 | `SERVICE-12` |
| Known-Site Scraping | Apify + RapidAPI | v3 | `SERVICE-12b` |
| Open-Ended Scraping | Scrapling + MiniMax | v3 | `SERVICE-12c` |
| Email | Resend | 3 | `SERVICE-13` |

**Three-lane scraping architecture** (`SERVICE-12`, `SERVICE-12b`, `SERVICE-12c`):
- Lane 1 (known-site): Apify/RapidAPI for high-volume scraping of known platforms.
- Lane 2 (open-ended): Scrapling + flat-rate LLM for arbitrary sites. Background job in Vercel Sandbox.
- Lane 3 (interactive): Stagehand + Browserbase for form fills and login-gated automation.

---

## 14. UX and Navigation

### 14.1 Navigation Structure (`UX-01`, `UX-02`)

```
AGENT
  Chat (Home)            ← default entry point
  Mission Control        ← status dashboard + approval queue
  Tasks                  ← unified CRM + agent tasks
  Automations            ← triggers, autopilot config
  Memory                 ← memory files, preferences, Growth Plan

DATABASE
  CRM                    ← contacts, deals, pipeline
  Knowledge              ← knowledge base
  Documents              ← document processing
  Channels               ← v1 placeholder, v2+ active

SYSTEM
  Settings               ← SOUL.md editor, connections, billing
```

### 14.2 Key UX Decisions

- **Chat is home.** Mission Control is a control surface, not the user's primary workspace (`UX-01`).
- **Session rail** in left sidebar. Clicking **Chat** opens a draft canvas; the canonical thread is created server-side on first submitted message, then URL reconciles to `/chat/{threadId}`. One active canvas at a time. No duplicate thread navigator inside chat (`UX-06`).
- **Mission Control** has two tabs: Overview (status dashboard) and Queue (approvals, failures, blocked tasks, goals at risk) (`UX-03`).
- **Tasks** board: sort by Needs Approval → Blocked → Overdue → Due Soon → Recently Updated. Source labels: `[CRM]`, `[MANUAL]`, `[AUTOPILOT]` (`UX-04`).

### 14.3 Frontend Inspirations (`UX-08`)

| Surface | Inspiration |
|---------|------------|
| CRM | Twenty (kanban pipeline, contacts table, activity timeline) |
| Knowledge | Outline (topics, clean editor) |
| Tasks | Super Productivity (board + list views) |
| Interview Cards | Pearl + Fintool AskUserQuestion |

> **Detail:** See `ux-and-pm/01-Mission Control UX Spec (Draft).md` for full component specs and empty state rules.

---

## 15. Channels

| Version | Channel | Technology | Decision |
|---------|---------|-----------|----------|
| v1 | Web chat | Next.js + Vercel AI SDK `useChat` | `UX-01` |
| v2 | Telegram | Vercel AI SDK Chat SDK adapter | `UX-07`, `GAP-09` |
| v3 | WhatsApp | Meta Cloud API | `UX-07`, `GAP-09` |

All channels feed into the same runner. Same safety model, same memory, same CRM. Channel adapters are thin — they translate channel-specific message formats into the unified thread model.

---

## 16. Cost and Scaling

### 16.1 Fixed Costs (`SCALE-01`)

v1 (0-50 clients): ~$45/month fixed.
- Vercel: $20/month (Pro plan)
- Supabase: $25/month (Pro plan)

### 16.2 Per-Client Variable Costs (`SCALE-02`)

| Scale | Per-Client/Month |
|-------|-----------------|
| 10 clients | ~$7-9 |
| 50 clients | ~$2-3 |
| 100 clients | ~$1.50-1.80 |

Well under $20 target at any reasonable scale.

**Cost breakdown:** 80%+ of variable cost is Vercel Sandbox (artifact generation). Daily chat is essentially free with Gemini Flash. Smart model routing saves ~94% vs all-Sonnet.

### 16.3 Scaling Path

- **v1 (0-50 clients):** Current architecture unchanged.
- **v1.5 (50-500):** Artifact hosting → R2 + Workers. Storage tiering. Sandbox snapshots + pre-warming (`SCALE-03`).
- **v2+ (500+):** Evaluate Trigger.dev self-hosting. Supabase Team/Enterprise. Read replicas. Regional deployment only if latency justifies (`SCALE-04`).

> **Detail:** See `services/02-Unit Economics Model ($20 Target vs Actual).md` for full per-service cost model.

---

## 17. Implementation Phasing

Full PR-by-PR breakdown in `docs/product/plans/` (repo root): prose version (`.md`) and checkable JSON task list (`.json`).

| Phase | Theme | PRs | Milestone |
|-------|-------|-----|-----------|
| 1 | Chat + CRM + Basic Tools | ~12 | Agent creates contact from chat → visible in CRM pages |
| 2 | Memory + Personality + Autopilot | ~10 | Agent remembers across sessions; autopilot proactively monitors deals |
| 3 | Skills + Connections + Sandbox | ~10 | Skills system, OAuth integrations, Vercel Sandbox for code execution |
| 4 | Polish + Approvals + Eval | ~8 | Onboarding, approval gates, Mission Control, evals |
| 5 | Channels + Scale | ~5 | Telegram bot, rate limiting, voice I/O |

### Resolved Questions

1. **Existing `pages/api/` routes:** Keep as-is for document processing. App Router for new agent endpoints.
2. **Existing Anthropic Analyst chat:** Replace in Phase 3 when Vercel Sandbox + document tools are ready.
3. **Turborepo:** Defer until a second package is needed.
4. **Legacy WhatsApp tables:** Ignore, rebuild fresh in Phase 5.
5. **Environment variables:** Coexist (AI Gateway + direct API keys), consolidate naturally.

### Existing Codebase

The repo at `/Users/sethlim/Documents/sunder-next-migration-20260225` already has:

- Working auth (Supabase Auth)
- Supabase project + 15 DB migrations
- Next.js 15 deployment on Vercel
- Document processing pipeline (Gemini classification → ExtendAI extraction → PDF viewer)
- Anthropic Analyst chat (to be replaced in Phase 3)
- Placeholder routes for all new features (chat, CRM, automations, channels, knowledge, memory, mission-control, settings, tasks)
- TanStack Query/Table integration

Phase 1 starts from this existing scaffold, not from scratch.

---

## 18. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Broad scope slows launch | Enforce phase-based shipping. Each phase delivers end-to-end working functionality. |
| Cost spikes | One-gateway policy (`LLM-01`). Per-run telemetry. Budget alerts. Smart routing (Gemini Flash default). |
| Trust breaks from external sends | Approval gates (`SAFETY-01`). Audit logging via thread history. Safe defaults. |
| Integration fragility | Preflight checks. Retries + backoff. Graceful degradation. Connection-first behavior (`CONN-03`). |
| Architectural drift | Keep one runner, one hybrid tool contract, reject framework sprawl. Follow Tasklet defaults (`TASKLET-01`). |
| 15-min execution ceiling | Vercel Fluid Compute hard limit (`GAP-17`). No fallback until v3. Design runs to complete within budget. |

---

## 19. Open Questions

These are tracked in the architecture decisions as GAP items:

| ID | Question |
|----|----------|
| `GAP-06` | Threshold for introducing second routing profile |
| `GAP-07` | Final pricing vs usage limits packaging |
| `GAP-08` | Exact depth of voice output in Phase 1 |
| `GAP-09` | Precise criteria and timing for messaging channel launches |
| `GAP-10` | Verified retention window for toolcall artifacts |
| `GAP-11` | Platform limits for task list size |
| `GAP-12` | Memory scope policy: shared by default vs optional private-thread mode |
| `GAP-13` | Bash vs SQL eval study for CRM queries |
| `GAP-15` | Approval timeout — auto-cancel after 24h? |
| `GAP-16` | Per-client rate limiting |

---

## 20. Reference Guide

For a developer joining the project, here's where to find patterns and prior art:

### Tasklet (primary reference architecture)

| Topic | Path |
|-------|------|
| Platform overview | `references/tasklet/README.md` |
| Core architecture (runtime, state, tools, execution) | `references/tasklet/core-architecture/` |
| Complete tool definitions (30+ tools) | `references/tasklet/tools/built-in/` |
| Skills system | `references/tasklet/skills-system/` |
| Persistence and cron semantics | `references/tasklet/persistence-and-cron/` |
| First-run lifecycle (file seeding, persistence) | `references/tasklet/first-run-lifecycle/` |
| System prompt (complete) | `references/tasklet/system-prompt-wholesale/` |
| Real workflow traces | `references/tasklet/simple-price-monitor-workflow/`, `references/tasklet/complex-multi-integration-workflow/` |
| Subagents and tools overview | `references/tasklet/tools-skills-subagents.md` |
| Per-agent data model | `references/tasklet/per-agent-data-model.md` |

### Fintool (strategic reference)

| Topic | Path |
|-------|------|
| Article index | `references/Fintool/README.md` |
| Vertical AI agent strategy | `references/Fintool/nicolasbustamante-crumbling-workflow-moat-FULL.md` |
| Excel agent patterns | `references/Fintool/nicbustamante-reverse-engineering-excel-ai-agents-FULL.md` |
| Background agent architecture | `references/Fintool/jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md` |
| Forward-deployed engineer pattern | `references/Fintool/ishanxnagpal-ai-agent-fde-forward-deployed-engineer-FULL.md` |

### Claude Code (memory and tool patterns)

| Topic | Path |
|-------|------|
| Memory system | `references/claude/claude-code-memory-system.md` |
| System prompt | `references/claude/claude-code-system-prompt.md` |
| Tool definitions | `references/claude/claude-code-tool-definitions.md` |
| Design lessons | `references/claude/lessons-from-building-claude-code.md` |

### Other references

| Topic | Path |
|-------|------|
| OpenClaw patterns | `references/openclaw/` |
| Agent taxonomy (5 levels) | `references/Agents Overview/` |
| Tool infrastructure comparison | `references/Tool-Infrastructure-Comparison/` |
| Notion agent UX research | `references/notion-agents-ux-test-notes.md` |
| Savoir (Vercel template) extraction | `architecture/04-Savoir Extraction Guide.md` |

### Tasklet alignment rule (`TASKLET-01`)

If this spec is silent on a behavior, follow Tasklet references by default. Any deviation must be documented.
