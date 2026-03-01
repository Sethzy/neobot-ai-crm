# Fintool Architecture Comparison — Fintool vs Tasklet vs Sunder

> **Version:** 1.1
> **Date:** February 24, 2026
> **Status:** Reference analysis
> **Sources:** `../references/Fintool/` (all docs), `02-Infrastructure Blueprint.md` (Sunder), `02b-Infrastructure Blueprint (Tasklet Native).md` v1.3 (Tasklet)
> **Changelog:** v1.1 — Updated Tasklet skill discovery to reflect two pointer mechanisms (hardcoded base prompt + dynamic system-reminder), added token economics of lazy-loading, added cross-environment data handoff pattern in sandbox section, added tool name prefixing for OAuth routing, updated drift assessment tables for consistency with 02b v1.3. v1.0 — Initial three-way comparison.

---

## Why This Document Exists

Fintool is the strongest public reference for building a vertical AI agent product at production scale. They serve hedge funds, have Anthropic backing, and have published detailed architecture, operational patterns, and strategic thinking across 10+ articles.

This document maps Fintool's architecture against both Tasklet (our behavioral reference) and Sunder (our actual infrastructure) — pattern by pattern, decision by decision — so we know exactly where we're aligned, where we're diverging, and whether each divergence is intentional.

---

## Three Architectures at a Glance

| Dimension | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Primary interface** | Chat only | Chat + triggers | Chat + Mission Control dashboard |
| **File storage** | S3 (source of truth) → Postgres mirror | FUSE-mounted cloud filesystem (`/agent/`) | Supabase Storage (per-client paths) |
| **Structured data** | PostgreSQL (read-optimized mirror of S3) | Per-agent SQLite (system-managed) | Supabase DB (we own schema) |
| **Code execution** | E2B (ephemeral Firecracker sandbox) | `run_command` (ephemeral Alpine sandbox, preinstalled tools) | Vercel Sandbox (ephemeral Firecracker, bare image + snapshots, three-tier usage model) |
| **Background jobs** | Temporal (durable workflows) | Platform-managed triggers (fresh LLM per fire) | Trigger.dev (managed workers) |
| **Scheduling** | CloudWatch Events + Lambda (10-min polling) | Platform trigger system (`setup_trigger`) | Trigger.dev cron (30s pulse-checker) |
| **LLM provider** | Anthropic (Claude) directly | Platform-managed (model per invocation) | OpenRouter (named model set, multi-model routing) |
| **Streaming** | SSE → Redis Stream → API → Frontend (delta ops) | Platform-managed streaming | Vercel AI SDK streaming (token-by-token SSE) |
| **Skill system** | Markdown files in S3 with three-tier shadowing + SQL discovery index | Markdown files on FUSE, lazy-loaded via two pointer mechanisms (base prompt for system skills, system-reminder for connection skills) | Markdown files in codebase + Supabase Storage, pre-assembled into system prompt |
| **Tool routing** | Not documented | Tool name prefixing: `conn_{id}__{toolName}` — platform parses prefix to select OAuth token | Composio connection IDs serve same routing purpose |
| **Memory** | `UserMemories.md` in S3 (user-editable) | Agent-managed files + SQL | `MEMORY.md` in Supabase Storage (approval-gated) |
| **Isolation model** | AWS ABAC (IAM-level prefix scoping per user) | Platform-enforced FUSE mount per agent | Supabase RLS + Storage path scoping per client |
| **Hosting** | Heroku (confirmed) + AWS services | Platform-managed (opaque) | Vercel + Supabase + Trigger.dev (fully owned) |
| **Team size** | 6 people | Unknown (platform team) | 1 person |

---

## Pattern-by-Pattern Comparison

### A. Data Architecture

#### A1. Source of truth for files

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Where files live** | S3 (authoritative) | FUSE-mounted cloud storage | Supabase Storage |
| **Database relationship** | Postgres is a read mirror, synced via Lambda | SQL is independent (not a file mirror) | Supabase DB is independent (not a file mirror) |
| **Sync mechanism** | `fs-sync` Lambda (real-time on S3 events) + `fs-reconcile` Lambda (full scan every 3 hours) | No sync needed — files and SQL are separate concerns | No sync needed — files and DB are separate concerns |
| **File versioning** | S3 versioning enabled — automatic audit trail per file | No built-in versioning | No built-in versioning |
| **Write flow** | Write → S3 → Lambda trigger → Postgres upsert | Write → FUSE → cloud storage | Write → Supabase Storage API |
| **Read flow** | Postgres for queries, S3 for file content | FUSE read (~10-100ms) | Supabase Storage download (~50-100ms) |

**Analysis:** Fintool's S3-first architecture is the most sophisticated. They get built-in versioning (every file edit creates a recoverable version), 11-nines durability, and human-debuggable YAML/Markdown. The cost is a sync layer (two Lambdas) and a 2-3 second write-to-query delay that they hide with optimistic UI updates.

Sunder and Tasklet both treat files and structured data as independent concerns — simpler, no sync layer, but no automatic file version history. Sunder could add Supabase Storage versioning later if needed but this is not a default feature of Supabase today.

**Verdict:** Intentional divergence. The sync layer adds complexity that doesn't pay off at <50 clients. Revisit when file audit trails become a product requirement.

---

#### A2. Skill storage and discovery

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Location** | S3: `/private/skills/`, `/shared/skills/`, `/public/skills/` | FUSE: `/agent/skills/system/`, `/agent/skills/connections/` | Codebase (system) + Supabase Storage (custom) |
| **Shadowing** | Three-tier: private > shared > public | Two-tier: system (read-only) + connection-specific | Two-tier: system (bundled, read-only) + custom (per-client) |
| **Discovery** | SQL query against `fs_files` table (NOT filesystem traversal) | Two pointer mechanisms: system skills have hardcoded pointers in base prompt (build-time, permanent); connection skills have dynamic pointers in `<system-reminder>` (runtime, appears/disappears with connection) | Runner has a manifest; assembles into system prompt |
| **Lazy loading** | Yes — skill loaded only when relevant (prevents context pollution) | Yes — LLM reads via `read_file()` on demand. Pointers cost ~20-30 tokens each; actual skill content costs ~200-1500 tokens. With 5 connections, saves ~1,000-7,000 tokens/turn when unused. | Partially — runner includes relevant skills at prompt assembly time (simpler but pre-loads more context) |
| **Connection skill generation** | Not documented (skills authored by team) | Generated **only for connections with API quirks** — not every connection (e.g., Gmail gets a SKILL.md for readMask guidance, label name vs ID rules, link format; Google Calendar and Google Forms do not — their tool definitions are self-sufficient) | We write integration skills manually per service |
| **Metadata index** | `fs_files.metadata` stores parsed YAML frontmatter for filtering | No explicit metadata index | No explicit metadata index |
| **Non-engineer authoring** | Yes — domain experts write markdown directly | Not applicable (platform skills are platform-authored) | Not yet — custom skills are user-approved but Sunder-authored in v1 |

**Analysis:** Fintool's skill system is the most mature. The SQL-based discovery with frontmatter metadata means the agent can find relevant skills without loading all files into context (which burns tokens and confuses the model). The three-tier shadowing lets users override platform defaults without touching shared/platform files.

Tasklet's model is more sophisticated than initially documented. The two-pointer mechanism (system skills with permanent pointers in the base prompt vs connection skills with dynamic pointers in the system-reminder) is an elegant balance: system skills are always discoverable (build-time guarantee), while connection skills appear and disappear at runtime as integrations are added/removed. Both types lazy-load the actual content via `read_file()`, keeping the per-turn pointer cost to ~20-30 tokens while deferring the ~200-1500 token skill content until actually needed. **Corrected (Feb 2026):** Connection skills are NOT auto-generated for every connection. Empirical testing showed only Gmail received a skill file (due to API quirks: readMask, label name vs ID, link format). Google Calendar and Google Forms did not — their tool definitions were self-sufficient. Skill files are conditional on API complexity, not automatic per connection.

Sunder's model is the most constrained — system skills are bundled in the codebase (can't be overridden per-client), custom skills are per-client in Storage. No SQL discovery index. Skills are pre-assembled into the system prompt (simpler but less token-efficient with many integrations).

**Gap for Sunder:** Add a `skill_registry` table in Supabase DB with columns: `client_id`, `slug`, `display_name`, `type` (system/custom), `frontmatter` (JSONB). Populated on deploy (system skills) and on user skill creation. Runner queries this to decide which skills to include in prompt assembly. Small addition, high value as skill library grows.

**Gap for Sunder:** Three-tier shadowing isn't needed in v1 (solo agents, no org tier). But the file layout should anticipate it: `/{clientId}/skills/custom/` already exists; add `/{orgId}/skills/shared/` when multi-seat ships in a future version.

---

#### A3. Memory system

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Format** | `UserMemories.md` in S3 (one file per user) | Agent-managed files + SQL tables | `MEMORY.md` + `memory/*.md` in Supabase Storage |
| **User editable** | Yes — directly in the UI | Agent writes; user doesn't edit directly | Yes — but only with approval gate |
| **Write policy** | Agent updates memory based on conversations (no explicit approval mentioned) | Agent writes freely to `/agent/home/` | Approval-required for every memory write |
| **Loaded when** | Start of every conversation | Agent reads from filesystem/SQL as needed | Start of every run (before thread history) |
| **Scope** | Per-user, cross-conversation | Per-agent (effectively per-user) | Per-client, cross-thread |

**Analysis:** Fintool and Sunder are philosophically aligned — memory is a markdown file, user-visible, loaded at conversation start. The main difference is write policy: Fintool lets the agent update memory freely (implicit trust in the model), while Sunder requires explicit user approval (higher safety bar for regulated-adjacent use).

Fintool's memory also feeds their three FDE loops: the Learning Loop builds memory during onboarding, the Automation Loop suggests skills based on repeated patterns, and the Outreach Loop re-engages quiet users with personalized content based on their memory.

**Sunder gap:** We don't have the Automation Loop yet (weekly scan of conversations → suggest skills based on repeated patterns). This is a v2/v3 growth feature but worth noting — it's how Fintool's skills compound over time without the user doing anything.

---

### B. Execution Architecture

#### B1. Sandbox and code execution

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Technology** | E2B (Firecracker microVMs) | Alpine Linux 3.23 sandbox (ephemeral) | Vercel Sandbox (Firecracker microVMs) |
| **Lifecycle** | Ephemeral, spun up on demand | Ephemeral per session, spun up with every interaction | Ephemeral, spun up on demand via three-tier routing |
| **Cold start mitigation** | Pre-warming on keypress (sandbox spins up while user types) | No cold start — sandbox is the session itself | Snapshots for pre-installed environments; pre-warming planned for v1.5 |
| **Preinstalled tools** | Not documented (E2B uses custom templates) | ffmpeg, pandoc, imagemagick, jq, Python 3.12, bash | None (bare Amazon Linux 2023; install via `dnf` or use snapshots) |
| **Security model** | Three mount points: `/private` (rw), `/shared` (ro), `/public` (ro). AWS ABAC with short-lived credentials scoped per user. | Platform-enforced FUSE mount per agent | Sandbox doesn't mount client files; runner mediates all storage access |
| **% of interactions using sandbox** | High (bash tools, file processing, Plotly generation) | 100% (every session has `run_command`) | ~30-40% (three-tier model: pure tools ~60-70%, sandbox-enhanced ~25-30%, full sandbox ~5-10%) |
| **Cross-environment data handoff** | Not documented | Platform truncation pattern: large tool results (e.g., 21KB Gmail threads) truncated in LLM context (~5KB) but saved in full to `/agent/toolcalls/{blockId}/result`. Sandbox reads full data from disk via FUSE. External API → platform saves → FUSE → sandbox. | Runner mediates: download from Supabase Storage → pass to sandbox. Same pattern, explicit download instead of FUSE mount. |

**Analysis:** This divergence has narrowed significantly from earlier versions of Sunder's architecture.

Fintool and Tasklet both treat the sandbox as a core part of every interaction. The agent can always run code, process files, generate charts. Fintool goes further with IAM-level isolation (AWS ABAC) and pre-warming on keypress.

Sunder now treats the sandbox as a **first-class capability** — the agent decides when code execution would produce a meaningfully better result (richer reports, data analysis, file processing, generated artifacts) and uses the sandbox transparently. The user never knows a sandbox was involved. The three-tier model means pure API-call interactions (CRM updates, simple follow-ups, web search) still skip the sandbox for speed, but anything that benefits from code execution uses it freely.

The remaining divergence is usage rate (~30-40% vs ~100% for Tasklet). This is because Sunder's CRM/relationship-management workload has a genuine pure-tool tier that doesn't benefit from code execution, while Fintool's financial analysis workload almost always benefits from code (calculations, chart generation, data processing).

**Verdict:** Converging. Sunder is now philosophically aligned with Fintool/Tasklet on sandbox-as-capability. The remaining difference is workload-driven, not architectural. Pre-warming (v1.5) will further close the UX gap.

---

#### B2. Durable workflow orchestration

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Technology** | Temporal | Platform-managed triggers | Trigger.dev |
| **Crash recovery** | Automatic — Temporal replays workflow from last checkpoint on worker crash | Platform handles — fresh LLM instance on each trigger fire | Trigger.dev retries with exponential backoff |
| **Cancellation** | Heartbeat-based — agent sends heartbeats every few seconds; user clicks "stop" and activity responds within seconds | Not documented for triggers | Not designed yet — need to implement |
| **Worker pools** | Separate: chat workers (25 concurrent) and background workers (10 concurrent) | Platform-managed (opaque) | Trigger.dev concurrency per job type (we configure) |
| **Saga/compensation** | Full Temporal saga support (multi-step with rollback) | Not applicable (single LLM invocation per trigger) | Not supported — Trigger.dev is simpler than Temporal |

**Analysis:** Fintool's Temporal usage is the most sophisticated. They explicitly call out that before Temporal, long-running tasks (5-minute company analyses) were a disaster if servers restarted or users closed tabs. Temporal gives them crash recovery, heartbeat cancellation, and saga patterns.

Tasklet's trigger model is the simplest — fire a fresh LLM, let it execute, done. No multi-step workflow orchestration. Crash recovery is implicit (the trigger just fires again on the next interval).

Sunder's Trigger.dev is in between — durable retries and observability, but not Temporal-grade workflow orchestration with saga rollback.

**Sunder gap: Heartbeat cancellation.** When a user kicks off a 10-minute background research task, they should be able to cancel it mid-flight. Trigger.dev supports this via `io.yield()` checkpoints, but we haven't designed the cancellation flow yet. This should be a Sprint 2 addition.

**Sunder non-gap: Saga patterns.** Our v1 background jobs are straightforward (loop through items, process each, write results). No multi-step branching with compensation logic. If v3's managed lead-generation pipeline requires this, we'd evaluate Temporal then.

---

#### B3. Scheduling and triggers

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Scheduled triggers** | CloudWatch Events → Lambda every 10 min, queries `next_run_at <= NOW()` | `setup_trigger` tool — agent creates cron/webhook/RSS triggers at runtime | Trigger.dev cron (pulse-checker every 30s) + planned `agent_triggers` DB table |
| **Event triggers** | SQS queue on document ingestion → Lambda evaluates against active alerts | Platform webhook/app-event triggers | Vercel webhook handlers (WhatsApp, Telegram, Tally, Cal.com) |
| **Agent self-configuration** | Partially — user creates alerts via chat, but the scheduling infrastructure is fixed (CloudWatch + Lambda) | Full — agent calls `setup_trigger` to create/modify/delete triggers at runtime | Partially — planned `agent_triggers` table lets agent create schedules; Trigger.dev jobs are deploy-time code |
| **Conditional scheduling** | Yes — pre-check bash scripts in E2B: "only if market is open", "only if portfolio down >2%". Script stdout == "true" → fire alert | Not documented | Not implemented. Could add pre-check functions to pulse-checker scan. |
| **Self-configuring alerts** | Yes — an alert can update its own `next_run_at` based on outcomes ("run again 7 days before next earnings date") | Not documented | Not implemented. `agent_triggers` table could support this with a `self_update` flag. |
| **Schedule format** | iCal VEVENT (RRULE for recurrence, DTSTART for one-time) | Cron expressions | Cron expressions + DB-stored configs |

**Analysis:** Fintool's alert system is the most feature-rich. The combination of event-driven (SQS on document ingestion) and time-based (CloudWatch polling) with pre-check scripts and self-configuring schedules creates a very flexible proactive intelligence layer.

Two patterns worth stealing:

1. **Conditional scheduling:** "Run every hour, but only if market is open" → pre-check script evaluates first, skip if false. We could add this to our `agent_triggers` table: a `pre_check` field that stores a function or prompt to evaluate before firing.

2. **Self-configuring alerts:** "Schedule next run for 7 days before the next earnings date in watchlist" → the alert updates its own `next_run_at` after each execution. We could support this by allowing the trigger payload to include `update_next_run_at` in its output.

**Sunder gap:** Conditional scheduling and self-configuring schedules are not in v1 scope but should be noted for v2/v3. Both are small additions to the `agent_triggers` table design.

---

#### B4. Streaming and real-time

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Protocol** | SSE → Redis Stream → API → Frontend | Platform-managed | Vercel AI SDK SSE (direct from `streamText`) |
| **Update strategy** | Delta operations (ADD, APPEND, REPLACE, PATCH, TRUNCATE) | Not documented | Token-by-token streaming (AI SDK default) |
| **Rich content** | Plotly charts (AI generates JSON spec), SpreadJS for Excel, KaTeX for equations, Shiki for code, Gotenberg for Office→PDF | `show_user_preview` for HTML/app previews | Markdown rendering + Mini Lovable artifacts (signed URLs) |

**Analysis:** Fintool's rendering stack is the most ambitious. They render interactive Plotly charts, Excel spreadsheets with full styling, and LaTeX equations inline in chat. This is because their users (hedge fund analysts) need rich analytical output directly in the conversation.

Sunder's rendering needs are simpler — markdown text, occasional links, approval cards, and Mini Lovable artifacts served as separate URLs. We don't need inline charts or spreadsheets in v1.

The delta-operation streaming pattern (sending "append 50 chars" instead of full state) is an optimization that matters at scale. Vercel AI SDK handles this natively for text streaming, but for complex multi-part responses (text + chart + table), Fintool's explicit delta protocol is more efficient.

**Verdict:** Not a gap for v1. Our rendering requirements are simpler than Fintool's. If we add inline rich content later, the delta-operation pattern is worth adopting.

---

### C. Quality and Operations

#### C1. Evaluation infrastructure

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Domain-specific evals** | 2,000+ test cases across ticker disambiguation, fiscal period extraction, numeric precision, adversarial grounding | Not documented (platform-internal) | Defined in spec (24 acceptance criteria) but no harness built |
| **Skill-eval pairing** | Every skill has a companion eval (e.g., DCF skill has 40 test cases) | Not documented | Not implemented |
| **Automated quality gates** | PR blocked if eval score drops >5%. No exceptions. | Not documented | Not implemented |
| **Adversarial tests** | 50 test cases: inject fake numbers, verify model cites real source | Not documented | Not implemented |
| **Observability** | Braintrust (LLM traces) + Temporal UI (workflow debug) + Datadog (infra) | Platform-managed | Trigger.dev dashboard (jobs) + Vercel logs (functions) |
| **Auto-filed issues** | Error → GitHub issue with conversation ID, user info, traceback, Braintrust + Temporal links. Paying users get `priority:high` | Not documented | Not implemented |

**Analysis:** This is the biggest operational gap between Fintool and Sunder. Fintool has invested heavily in eval infrastructure because they operate in finance where wrong numbers are catastrophic. A response that's "semantically similar" but has the wrong dollar figure is a complete failure.

For Sunder, the equivalent failure modes are:
- Wrong contact linked to a deal
- Follow-up sent to the wrong person
- Meeting booked at the wrong time
- CRM data overwritten incorrectly
- Fabricated property details

These are less numerically precise than finance but equally trust-destroying for a solo agent.

**Sunder action items (ordered by impact):**

1. **CRM accuracy evals** — Test cases for: contact dedup correctness, deal stage transitions, follow-up timing accuracy, correct contact-to-deal linking. These protect the core product value.

2. **Approval gate evals** — Test cases for: high-risk actions correctly blocked, low-risk actions correctly auto-executed, no false negatives (risky action runs without approval). These protect trust.

3. **Skill-eval pairing** — Every system skill ships with at least 5 test cases. Blocks deploy if score drops.

4. **Adversarial grounding** — Inject fake property data into context, verify agent cites real CRM records not fabricated ones.

5. **Auto-filed issues** — Error in production → Supabase log entry with conversation ID, client ID, traceback, link to Trigger.dev run. Flag `priority:high` for paying clients.

---

#### C2. Model routing

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Strategy** | Complexity-based: Haiku (simple) → Sonnet (complex). Enterprise users always get best model. | Platform-managed (opaque) | Tier-based: Gemini 2.5 Flash (routine) → Kimi 2.5 (research) → Gemini 3.1 Pro / Claude Sonnet 4.6 (complex/high-trust) |
| **Routing decision** | Per-query classification | Not exposed | Per-run classification in `llm-gateway.ts` |
| **Cost awareness** | Yes — Braintrust tracks cost per trace | Platform absorbs (likely markup) | Yes — per-run telemetry (model, tokens, cost, latency) |

**Analysis:** Both Fintool and Sunder route by complexity. Fintool's routing is simpler (two tiers: cheap model vs expensive model). Sunder's is more granular (four tiers with explicit escalation triggers). Both log cost per run.

Fintool's insight about enterprise users always getting the best model is worth noting — it's a pricing lever, not a technical decision.

**Verdict:** Aligned. Different provider choices but same pattern.

---

#### C3. Testing approach

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Eval framework** | Custom domain-specific (2,000+ cases), Braintrust for traces | Not documented | Planned (24 acceptance criteria in spec) |
| **Key insight** | Generic NLP metrics (BLEU, ROUGE) don't work for domain-specific agents. Need domain-specific accuracy measures. | N/A | Same principle should apply — generic LLM evals won't catch RE-specific failures |
| **Bash vs SQL study** | Ran rigorous eval: SQL 100% accuracy / $0.51, Bash 53% / $3.34, Hybrid 100% / $1.02. Used this to decide tool strategy per query type. | N/A | We should run equivalent eval for our tool strategies |
| **Iterative benchmark correction** | 200+ test messages revealed wrong expected answers, performance bottlenecks, data loading bugs. Evals need iteration. | N/A | Budget time for eval iteration — first pass will have wrong expected answers |

**Analysis:** Fintool's Bash vs SQL eval study is directly applicable to Sunder. We should run an equivalent study:
- CRM queries: direct Supabase SDK vs agent-written SQL vs natural language → Supabase
- Search: single Brave query vs multi-step search+extract pipeline
- Enrichment: single API call vs multi-source synthesis

The finding that hybrid approaches achieve 100% accuracy through emergent self-verification (query first, then verify against another source) is powerful.

---

### D. Product and Strategy

#### D1. Growth engine

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Programmatic SEO** | Same agent architecture runs a content engine. Triggers fire on market events → agent writes articles → publishes. 10M+ monthly impressions, no content team. | Not applicable (platform, not product) | Not in v1 scope. Architecture supports it (scheduled trigger → agent generates content → publishes to R2/Vercel). |
| **AI referral traffic** | Converts 4x better than traditional search. Content structured for both humans and models. | N/A | Not implemented. Worth noting for v2 growth. |
| **Three FDE loops** | Learning (onboarding), Automation (weekly pattern detection → skill suggestions), Outreach (re-engagement with personalized content) | N/A | Learning loop exists (onboarding skills). Automation and Outreach loops not designed yet. |

**Analysis:** Fintool's three FDE loops are a product playbook, not just architecture. The Automation Loop (weekly scan → suggest skills) and Outreach Loop (re-engage quiet users with relevant content) are growth features that compound over time. Both are buildable on our architecture but not designed yet.

The programmatic SEO engine is a free growth lever — same skills, same agent, different trigger. Worth prototyping in v2.

---

#### D2. Personalization depth

| | Fintool | Tasklet | Sunder |
|---|---|---|---|
| **Memory** | UserMemories.md (user preferences, investment style, sector focus) | Agent-managed files + SQL | MEMORY.md + memory/*.md |
| **Watchlists/portfolios** | Per-user watchlists drive alert filtering, content personalization, and proactive intelligence | N/A | CRM data (contacts, deals, pipeline) serves same function |
| **Connected cloud services** | Notion, OneDrive — agent reads user's existing documents for context | Connections framework (integrations, MCP, direct API) | Composio + MCP (same concept, different providers) |
| **Thesis files** | AI synthesizes investment memos, emails, models, expert call notes into living `{ticker}-thesis.md`. Each new alert evaluates against the thesis. Drift detection when evidence contradicts assumptions. | N/A | No equivalent yet. Could do `{deal}-thesis.md` per deal with drift detection on market changes. |
| **"Any unpersonalized feature will be commoditized"** | Core philosophy — without memory, they're just another chatbot | Implied (persistence model) | Stated in spec ("context is the product") |

**Analysis:** Fintool's thesis file pattern is directly translatable to RE: a living `{deal}-analysis.md` per active deal that accumulates market data, comparable transactions, buyer sentiment, and pricing signals. Each autopilot pulse could evaluate the deal against its thesis and flag drift ("comparable unit in same building just sold 15% below your listing price").

**Sunder gap:** No deal-thesis or contact-thesis pattern designed yet. This is a v2 feature that would significantly deepen the autopilot pulse's intelligence.

---

#### D3. Strategic philosophy

| | Fintool | Sunder | Alignment |
|---|---|---|---|
| "The model is not the product" | Anyone can call Claude. The moat is everything around it: data, skills, UX, reliability. | Same — we don't compete on model access | **Aligned** |
| "Chat is the only interface" | Scrapped every feature except chat. New features are new tools, not new pages. | Chat is primary, but we also build Mission Control, Tasks, CRM, Knowledge pages | **Diverged** — we have more UI surface area |
| "Context is the product" | Agent quality depends on giving the model high-quality, well-structured context | SOUL.md + USER.md + MEMORY.md + CRM state loaded every run | **Aligned** |
| "Any unpersonalized feature will be commoditized" | Without persistent memory, Fintool is just another generic chatbot | Same — memory + skills + CRM state differentiate us | **Aligned** |
| Model-Market Fit (MMF) | Can the model, given same inputs as a human expert, produce output a customer would pay for without significant human correction? | Our MMF question: Can the model manage a RE agent's CRM, follow-ups, and admin without constant correction? | **Aligned in framework, different domain** |
| Crumbling workflow moat | Interface moats are dead. Proprietary data is the only durable defense. | Our data moat: accumulated CRM data, relationship history, deal context per client | **Aligned** |

**Chat-only vs multi-surface:** Fintool made a deliberate bet to scrap every UI except chat. Their argument: zero learning curve, zero maintenance burden, full discoverability. They render charts, spreadsheets, and documents inline in chat.

Sunder has more UI surfaces (Mission Control, Tasks, CRM, Knowledge, Documents, Memory, Automations, Settings). This is intentional — RE agents need at-a-glance pipeline visibility (kanban board), contact lists, and task boards that chat alone can't deliver. But it means more frontend maintenance and more surfaces to keep consistent.

The question is whether our additional surfaces will prove their value or become maintenance burden. Fintool's position is that chat can do everything. Worth revisiting after v1 pilot — if users primarily use chat and ignore dashboard surfaces, consider simplifying.

---

## Summary: Drift Assessment

### Zero or near-zero drift (same pattern, different providers)

| Pattern | Notes |
|---|---|
| Skills as markdown files | All three use markdown. Fintool has most mature discovery (SQL index). Tasklet has two-pointer lazy-loading mechanism (build-time base prompt + runtime system-reminder). Sunder pre-assembles (simpler, less token-efficient at scale). |
| Memory as user-editable file | All three. Fintool most permissive (agent writes freely). Sunder most controlled (approval-gated). |
| Ephemeral sandbox for code execution | All three. Different providers (E2B, Alpine, Vercel Sandbox). Same isolation model. |
| Stateless LLM per invocation | All three. Every run starts fresh. State comes from files and DB. |
| Two trigger types → one agent runtime | All three. Event-driven + time-based triggers, same execution path. |
| Tool-mediated mutation | All three. All state changes go through tool calls. |
| Context recovery from persisted artifacts | All three. Toolcall artifacts for truncation recovery. Tasklet: platform truncates large results in context, saves full to `/agent/toolcalls/`. Sunder: runner saves full results to Supabase Storage. |
| Cross-environment data handoff | Tasklet: external API → platform saves to disk → sandbox reads via FUSE. Sunder: runner downloads from Supabase Storage → passes to sandbox. Same pattern, different plumbing (FUSE mount vs explicit download). |
| Tool routing for OAuth | Tasklet: `conn_{id}__{toolName}` prefix tells platform which OAuth token to use. Sunder: Composio connection IDs serve same routing purpose. |
| Cost-aware model routing | Fintool and Sunder. Tasklet opaque. Same principle. |
| State injection per turn | Tasklet: system-reminder (~200-400 tokens) regenerated every turn with time, user, connections, triggers. Sunder: runner assembles equivalent state block from Supabase. Fintool: not documented at this granularity. |

### Intentional divergence (different by design, justified)

| Pattern | Fintool | Sunder | Why we diverge |
|---|---|---|---|
| Chat-only interface | No UI except chat. Everything renders inline. | Chat + 10 dashboard pages | RE agents need visual pipeline/contact/task surfaces. |
| S3-first file storage | S3 → Postgres mirror with sync Lambdas | Supabase Storage (direct, no sync layer) | Simpler. No sync complexity. Fine for <50 clients. Revisit at scale. |
| Sandbox usage rate | E2B spins up for most queries (financial analysis needs code) | Sandbox for ~30-40% of interactions (three-tier model) | Our workload has a genuine pure-tool tier (CRM updates, messaging) that Fintool doesn't. Sandbox is first-class but not every interaction needs it. |
| Memory write policy | Agent writes freely | Approval-gated | Higher safety bar for regulated-adjacent use (sending messages to clients). |
| AWS ABAC for isolation | IAM-level prefix scoping per user | Supabase RLS + Storage policies | Equivalent isolation for our threat model. We don't mount client files into sandboxes. |

### Gaps to close (Fintool has it, we should add it)

| Gap | Fintool pattern | Sunder status | Priority | Effort |
|---|---|---|---|---|
| **Eval infrastructure** | 2,000+ domain-specific test cases, skill-eval pairing, PR quality gates, adversarial grounding | 24 acceptance criteria defined, no harness built | **High** — biggest operational gap | Medium (2-3 weeks for initial harness) |
| **Skill metadata index** | SQL query against `fs_files` with parsed frontmatter for discovery | No skill discovery index | **Medium** — matters as skill library grows | Small (1 DB table + populate on deploy) |
| **Heartbeat cancellation** | User can cancel long-running tasks mid-flight via Temporal heartbeats | Not designed | **Medium** — UX quality for background jobs | Small (Trigger.dev `io.yield` + cancel API) |
| **Conditional scheduling** | Pre-check scripts: "only fire if condition X is true" | Not designed | **Low** for v1 — useful for v2 proactive intelligence | Small (add `pre_check` field to `agent_triggers`) |
| **Self-configuring schedules** | Alert updates its own `next_run_at` after execution | Not designed | **Low** for v1 | Small (allow trigger output to update schedule) |
| **Deal thesis files** | Living `{ticker}-thesis.md` with drift detection | No equivalent | **Medium** — deepens autopilot intelligence | Medium (design thesis format + pulse evaluation) |
| **Automation Loop** | Weekly conversation scan → suggest skills based on repeated patterns | Not designed | **Low** for v1, **High** for retention | Medium (weekly cron + conversation analysis prompt) |
| **Auto-filed issues** | Error → GitHub issue with context + priority label | Not implemented | **Medium** — ops quality | Small (error handler → Supabase log + optional GitHub API) |
| **Sandbox pre-warming** | Spin up sandbox when user starts typing | Not implemented (planned v1.5) | **Medium** — ~30-40% of interactions use sandbox, cold-start latency matters | Small (WebSocket keypress → sandbox create) |

### Things Fintool has that we don't need

| Fintool pattern | Why we don't need it |
|---|---|
| Fiscal period normalization database (10,000+ companies) | We're in RE, not equities research. No fiscal calendars to normalize. |
| Plotly chart generation inline in chat | RE agents don't need inline charts. Mission Control dashboard handles visualization. |
| SpreadJS for Excel rendering in chat | We generate Excel files for download (doc gen MCP), not inline rendering. |
| Snowflake integration for market data | No equivalent data warehouse need in v1. |
| KaTeX for equation rendering | No mathematical notation in RE workflows. |
| Redis Stream for streaming | Vercel AI SDK handles streaming natively. Redis adds complexity we don't need. |
| 13F filing parser / SEC document pipeline | Completely different domain. No equivalent in RE. |

---

## The One-Page Takeaway

Fintool is proof that this architecture shape works at production scale with paying enterprise customers. Their core patterns (file-based skills, user-editable memory, ephemeral sandboxes, two trigger types feeding one agent, stateless LLM per invocation) are the same patterns we're implementing.

The three areas where Fintool is ahead of us in ways that matter:

1. **Eval infrastructure** — they have 2,000+ domain-specific test cases with automated quality gates. We have acceptance criteria on paper. This is the single highest-leverage gap to close.

2. **Proactive intelligence loops** — their Automation Loop (suggest skills from repeated patterns) and alert system (conditional scheduling, self-configuring schedules, thesis drift detection) make the product smarter over time without user effort. Our autopilot pulse is the foundation but needs these layers.

3. **Skill discovery at scale** — their SQL-based skill index with frontmatter metadata prevents context pollution as the skill library grows. Tasklet's two-pointer mechanism (base prompt for system skills, system-reminder for connection skills) with lazy-loading achieves similar token efficiency through a different approach. Both are ahead of our pre-assembly model, which loads all relevant skills regardless of whether they're needed this turn. Small investment, important as we add more skills.

Everything else is either intentional divergence justified by our different workload (RE vs finance), converging divergence (sandbox usage model — now first-class capability, narrowing the gap with Fintool), or a different provider choice for the same pattern (Trigger.dev vs Temporal, Supabase vs S3+Postgres, Vercel Sandbox vs E2B). The cross-environment data handoff patterns (how data moves from external APIs through the platform into sandbox processing) are architecturally identical across all three — the differences are just plumbing (FUSE mount vs S3 access vs Supabase Storage download).
