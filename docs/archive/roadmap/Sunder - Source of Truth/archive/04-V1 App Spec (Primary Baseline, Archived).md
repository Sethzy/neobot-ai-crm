# Sunder - AI Orchestration SaaS (v1) App Specification

> **Version:** 1.2 (Memory-as-Moat Update)
> **Last Updated:** February 24, 2026
> **Status:** Approved Baseline Runtime Contract (Inherited by v2 unless explicitly overridden)

---

## Table of Contents

1. [Overview](#overview)
2. [What the Product Is](#what-the-product-is)
3. [Who It Is For](#who-it-is-for)
4. [User Experience](#user-experience)
5. [Guided Interview UI (JIT) for Workflow Creation and Mid-Run Clarification](#guided-interview-ui-jit-for-workflow-creation-and-mid-run-clarification)
6. [v1 Scope and Release Waves](#v1-scope-and-release-waves)
7. [End-to-End Architecture](#end-to-end-architecture)
8. [Technical Architecture (Providers and SDKs)](#technical-architecture-providers-and-sdks)
9. [Tasklet Reference Alignment (Source-of-Truth)](#tasklet-reference-alignment-source-of-truth)
10. [Request Lifecycle (Technical Flow)](#request-lifecycle-technical-flow)
11. [Technical Trade-Offs and Best Practices](#technical-trade-offs-and-best-practices)
12. [Core System Components](#core-system-components)
13. [Data and State Design](#data-and-state-design)
14. [Safety and Approval Rules](#safety-and-approval-rules)
15. [Cost and Performance Strategy](#cost-and-performance-strategy)
16. [Implementation Plan](#implementation-plan)
17. [Testing and Launch Gates](#testing-and-launch-gates)
18. [Operational Considerations](#operational-considerations)
19. [Retention Model: Memory as Switching Cost](#retention-model-memory-as-switching-cost)
20. [Risks and Mitigations](#risks-and-mitigations)
21. [Unresolved Questions](#unresolved-questions)

---

## Overview

Sunder v1 is a **done-for-you AI orchestration system** for solo real estate agents.

The system runs everyday business work in the background: updating CRM records, preparing follow-ups, summarizing activity, handling inbound information, and drafting communications.

The key product shift is simple:

- We are **not** building a complicated agent framework product.
- We are building a **reliable assistant experience** that feels easy to adopt.
- We are moving to a **Tasklet-style architecture** for faster shipping and lower complexity.

### Core success criteria for v1

1. User can activate in **under 10 minutes** without handholding.
2. Product is useful from day 1 through web chat.
3. High-risk actions are controlled and auditable.
4. Unit economics stay healthy with a hard cost ceiling of **<$20 per active paid user per month**.
5. Product gets measurably smarter for each user over time through structured memory that compounds.

---

## What the Product Is

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

---

## Who It Is For

### Primary user (v1)

- Solo real estate agents in Singapore.

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

## User Experience

## Onboarding flow (two phases)

Onboarding has two distinct phases. Phase 1 delivers immediate value. Phase 2 builds the personalized foundation that makes everything else compound.

### Phase 1: Quick Activation (target: <10 minutes)

1. User signs up.
2. User connects required services.
3. Sunder provisions their isolated runtime.
4. User opens web chat.
5. First useful automation result appears quickly (for example: today’s follow-up plan + CRM updates + suggested drafts).

No separate multi-page setup wizard. Setup is guided in chat through onboarding skills.
No complex workflow builder.

### Phase 2: Deep Profile Interview (target: scheduled within first week)

Quick Activation does not replace profiling. It defers it to a dedicated session so the user is not blocked from getting value, but the deep interview still happens early.

1. At the end of Quick Activation, Sunder proposes a dedicated profiling session ("I’d like to spend 30-60 minutes learning how you work so I can be much more useful — want to schedule that now?").
2. User schedules the session (or starts immediately).
3. Sunder runs a structured intake interview using the Guided Interview UI. The interview follows a pre-built profiling guide with branching flows depending on the user’s role and domain.
4. Interview covers: job function, responsibilities, current projects, biggest pain points, tools and integrations in use, working style preferences, communication preferences, and where Sunder can provide the most leverage.
5. Sunder actively populates `USER.md` (stable profile) and `memory/preferences.md` (working style) from interview answers, rather than waiting to observe these passively over time.
6. At the end, Sunder proposes a Growth Plan: a visible, co-owned list of skills to build together over time, written to `memory/growth-plan.md`. Each item explains what the skill would do and why Sunder thinks it’s relevant based on the interview.
7. User reviews, edits, and approves the Growth Plan. This becomes the shared roadmap for personalization.
8. Sunder suggests one activity from the Growth Plan to start with immediately.

Phase 2 is not required for activation but is required for full personalization. If the user skips or delays Phase 2, Sunder falls back to passive observation (auto-writes during normal usage) and periodically re-suggests scheduling the profile interview until it is completed.

### Guided setup in chat (skills-based wizard pattern)

1. Sunder detects missing prerequisites for the requested outcome.
2. Sunder completes setup steps automatically where possible.
3. Sunder pauses only for user-required actions (sign-in, permission approval, explicit choice).
4. Sunder resumes from the last completed step after user confirmation.
5. Sunder runs a verification pass and reports pass/fail in plain language.
6. Sunder delivers the first useful output immediately after verification.

### First-class connection flow (locked for v1)

1. For any task that needs an external service, Sunder checks existing user connections first.
2. If a working connection already exists, Sunder uses it and does not ask the user to reconnect.
3. If a needed connection is missing, Sunder shows one clear in-chat connection card with:
   - service name,
   - plain-language reason for access,
   - exact permissions being requested.
4. User completes one approval flow (`Connect` -> provider sign-in -> consent).
5. Sunder resumes automatically from the same step and completes the requested task.
6. If authentication fails later, Sunder asks for reauthorization and retries from the blocked step.
7. Normal first-time setup should feel one-shot: approve once, continue immediately.

### Connection types (locked for v1)

1. Sunder supports three first-class connection types in v1: `integrations` (Composio-backed), `mcp`, and `direct_api`.
2. Selection order follows Tasklet connection guidance:
   - always reuse a compatible existing connection first (any type),
   - if a new connection is required, prefer `integrations`,
   - use `mcp` when integration coverage is insufficient,
   - use `direct_api` when no integration or MCP path can satisfy the request.
3. v1 launch policy for `mcp` and `direct_api` is managed allowlist only.
4. First approved external MCP in v1 is Granola. Internal approved MCP path is document generation.
5. Direct API in v1 is provisioned from approved templates with fixed base URL, allowed methods, auth schema, and read-safe verification tests.
6. Arbitrary user-entered MCP server URLs and arbitrary raw API base URLs are out of scope for v1 production flows.
7. This is a product gating policy only. Runtime lifecycle behavior still follows Tasklet create/activate/reauthorize flow.

### Optional ad hoc setup: meeting transcripts

This is optional and does not block activation.

1. User asks to connect meeting transcripts.
2. Sunder runs a guided onboarding skill in chat.
3. User signs up for Granola themselves (user-managed account).
4. User completes the one-time connection steps from the guide.
5. Sunder confirms setup and starts using meeting transcripts for CRM updates and follow-up suggestions.
6. Meeting transcript outputs are treated as Knowledge/CRM/Tasks inputs, not Documents pipeline records.

### Operating modes (managed default)

Sunder has two ways of working:

1. Scheduled Automations
- Runs fixed jobs at fixed times.
- Best for predictable routines.

2. Autopilot
- Runs regular check-ins.
- Reviews goals, agent tasks, and knowledge.
- Moves work forward and asks for approval before risky actions.

## Daily usage flow

1. User can ask naturally in chat at any time.
2. Scheduled Automations run fixed jobs at exact times.
3. Autopilot runs regular check-ins and chooses the next best action.
4. Low-risk work executes automatically.
5. High-risk work pauses for approval.
6. User reviews outcomes in chat and Mission Control.

### UX source-of-truth linkage (locked for v1)

1. `../ux-and-pm/01-Mission Control UX Spec (Draft).md` is the product-facing UI contract for navigation, page purpose, and interaction patterns.
2. This v1 spec defines the backend/runtime contracts needed to power that UI.
3. If a UI-to-backend mismatch is found, both docs must be updated in the same change.

### Primary web navigation (v1 locked)

1. Chat (Home)
2. Mission Control
3. Tasks
4. CRM
5. Knowledge
6. Memory
7. Automations
8. Documents
9. Channels (coming soon placeholder in v1)
10. Settings

### Mission Control and Tasks shape (v1 lock)

1. Mission Control has exactly two tabs: `Overview` and `Queue`.
2. Tasks is one unified surface for all work items (CRM-linked, manual, and Autopilot-created).
3. Default Tasks board columns are: `Planned`, `In Progress`, `Review`, `Done`.
4. `Blocked` and `Needs approval` are card flags and queue signals, not permanent board columns.

## Product behavior standards

1. Every response should be clear about what was done.
2. Approvals should be plain language and specific.
3. Output should be practical and action-oriented.
4. Always check existing connections before proposing a new connection.
5. Never ask for reconnect when an existing connection can satisfy the request.
6. When requesting access, explain what is needed and why in plain language.
7. After approval, resume automatically and report whether the task completed.

---

## Guided Interview UI (JIT) for User Profiling, Skill Building, and Workflow Creation

This is a **locked v1 retention feature**.

The Guided Interview UI is a general-purpose engine used across three distinct flows in v1. It is not scoped to workflow creation alone.

### Three interview flows (v1 scope)

1. **User Profiling Interview** — Run during Phase 2 onboarding (Deep Profile Interview). Follows a pre-built profiling guide with branching flows depending on role and domain. Populates `USER.md`, `memory/preferences.md`, and proposes `memory/growth-plan.md`. This is the foundational interview that makes all subsequent personalization possible.
2. **Skill-Building Interview** — Run when a user asks to create a new skill, or when the agent proposes building a Growth Plan skill during normal conversation. The agent asks focused questions about how the user wants this specific task performed, asks for and helps find examples, and workshops the approach. The output is a personalized, approved skill — not a generic template. Every skill starts life as an interview, never as a pre-configured default.
3. **Workflow Creation Interview** — Run when a user asks to set up a new workflow or automation. This is the original scope described below.

All three flows use the same question card engine, the same pause/resume mechanics, and the same plain-language preview pattern. The difference is the interview guide (what questions to ask) and the output artifact (profile data, skill definition, or workflow package).

### Why this is in v1

1. Setup quality is the biggest predictor of early user success — for profiles, skills, and workflows alike.
2. Most users do not want to type detailed setup prompts.
3. Guided interviews reduce confusion, bad assumptions, and failed automation runs.
4. Better setup quality improves activation speed and retention.

### Design inspiration and product pattern

1. UI interaction style: Pearl-inspired question cards (clear, clickable, one decision at a time).
2. Agent collaboration pattern: Fintool-style `AskUserQuestion` mid-workflow interaction.
3. We are adopting the behavior pattern, not copying product code.

### What the user experience looks like

1. User says: "Set up this workflow."
2. Sunder asks one focused question at a time in clickable cards.
3. Each question offers fast options plus "Other" for custom input.
4. Sunder only asks missing questions and skips what is already known.
5. At the end, Sunder shows a plain-language preview:
   - what will happen,
   - when it will run,
   - where outputs will go,
   - whether approval is required.
6. User chooses: `Save Draft`, `Test Once`, or `Activate`.

Behind the scenes, the UI uses a structured question payload so cards render consistently across setup and mid-run clarification.

### Mid-run clarification behavior (when agent needs user input)

1. If a run needs a user choice, Sunder pauses cleanly.
2. Sunder shows a short question card with recommended options.
3. User answers quickly through click or custom input.
4. Sunder resumes from the same step and completes the run.

### Before vs After

Before:

1. User writes long instructions in free text.
2. Setup is back-and-forth and easy to misinterpret.
3. Workflows are often activated with missing assumptions.

After:

1. User completes setup through guided, low-friction questions.
2. Setup is faster, clearer, and easier to trust.
3. Workflow quality is higher before activation.

### ASCII reference diagrams (for implementation)

#### 1) Workflow interview flow

```text
[User asks to build workflow]
            |
            v
[Q1 card: pick goal/source/frequency/action]
            |
            v
[User selects option or types custom answer]
            |
            v
[Next missing question card]
            |
            v
[Plain-language workflow preview]
  - What it will do
  - When it runs
  - Output destination
  - Approval mode
            |
            v
[Save Draft] [Test Once] [Activate]
```

#### 2) Mid-run pause and resume (AskUserQuestion pattern)

```text
[Workflow run in progress]
            |
            v
[Needs user decision?] --- no ---> [Continue run]
            |
           yes
            |
            v
[Show question card with choices]
            |
            v
[User answers]
            |
            v
[Resume same run step]
            |
            v
[Complete + report result]
```

#### 3) Edit existing workflow through quick interview

```text
[Open existing workflow]
            |
            v
[Quick edit card]
  - Change frequency
  - Change source
  - Change action
  - Change approval rule
            |
            v
[Updated preview]
            |
            v
[Test Once] -> [Activate update]
```

### v1 acceptance criteria for this feature

1. Users can create a new workflow without writing a long prompt.
2. Users can complete setup through clickable interview cards.
3. Agent can pause for clarification and resume the same run reliably.
4. Every workflow creation/edit flow ends with a plain-language preview.
5. The actions `Save Draft`, `Test Once`, and `Activate` are always present for workflow flows.
6. Deep Profile Interview can be completed end-to-end and correctly populates `USER.md`, `memory/preferences.md`, and `memory/growth-plan.md`.
7. Skill-Building Interview can be completed for any Growth Plan item and produces a personalized skill definition that the user reviews before activation.
8. No skill is activated without completing its Skill-Building Interview first (except guardrail-scoped instructions with user acknowledgment).

---

## v1 Scope and Release Waves

We are keeping the broad service vision from `../services/01-Built-In Services (Imported from RE-AI-CRM).md`, but shipping in controlled waves.

### Scope precedence rule (locked)

1. If a capability is marked **MVP** in `../services/01-Built-In Services (Imported from RE-AI-CRM).md`, it is included in v1.
2. If a capability is marked **Phase 2** or **Phase 3** there, it is deferred from v1 unless explicitly re-approved.

## Foundation (build first, hidden from users)

1. Runner loop and tool bridge.
2. Per-client runtime provisioning.
3. Supabase schema and policies.
4. Usage metering and cost controls.
5. Approval and audit framework.

## Wave 1 (launch day, all non-deferred built-in services)

1. CRM core (contacts, deals, tasks, interactions).
2. Follow-up engine and daily briefing.
3. Knowledge intelligence layer (topic-based reusable findings with source links and freshness tracking).
4. Web search and enrichment.
5. Scheduling integration (Cal.com via Composio).
6. Forms ingestion (Tally via Composio).
7. Web scraping and browser automation (three lanes: Apify/RapidAPI known-site, Scrapling open-ended, Stagehand+Browserbase interactive).
8. Voice input/transcription.
9. Voice output.
10. Document extraction (Gemini + ExtendAI).
11. Document generation (custom MCP path).
12. Guided Interview UI (JIT) for user profiling, skill building, workflow creation, and mid-run clarification.

## Wave 2 (fast follow-on)

1. Deeper service quality and reliability hardening for launched v1 capabilities.
2. More robust automation templates and service depth.
3. Expanded operational tooling and observability.

## Wave 3 (deferred)

1. Social media workflows (Phase 2 in built-in services).
2. Email workflows (Phase 3 in built-in services).
3. Link attribution workflows (Phase 3 in built-in services).
4. Document signing workflows (Phase 3 in built-in services).
5. Additional channel expansion beyond v2 launch channels (WhatsApp + Telegram), after post-launch evidence and approval.

---

## End-to-End Architecture

v1 uses a simple three-layer model inspired by Tasklet.

## Layer 1: Control Layer (Central Platform)

Responsibilities:

1. Web chat API and session management.
2. Auth, billing, provisioning, and plan checks.
3. Routing work to the right client runtime.
4. Approval checks and audit event writing.

## Layer 2: Execution Layer (Per-Client Storage + On-Demand Sandbox)

> **Note:** This section supersedes all prior "Per-Client Container" references. See `../architecture/02-Infrastructure Blueprint.md` for full infrastructure details.

Each client gets isolated storage (Supabase Storage) and on-demand code execution (Vercel Sandbox):

1. Workflow files (Supabase Storage).
2. Subagent files (Supabase Storage).
3. Runtime logs and checkpoints (Supabase Storage + DB).
4. Generated outputs and artifacts (Supabase Storage).
5. Code execution environment (Vercel Sandbox — ephemeral Firecracker microVMs, spun up when the agent determines code execution would produce a better result).

The sandbox is a **first-class capability**: the agent uses it for ~30-40% of interactions where code execution produces meaningfully richer outputs (reports, data analysis, file processing, generated artifacts). Pure API-call interactions (CRM updates, messaging, web search) skip the sandbox for speed.

## Layer 3: Data Layer (Supabase)

Stores structured and queryable business state:

1. Contacts, deals, tasks, interactions.
2. Message/session history metadata.
3. Trigger configurations and run history.
4. Approval records and usage data.

## Core runtime principle

Every model invocation is treated as stateless. Reliability comes from persisted artifacts and contracts, not hidden memory.

---

## Technical Architecture (Providers and SDKs)

This section defines the concrete stack for v1 so engineering can move without ambiguity.

### v1 LLM and routing decision (locked)

1. Use **OpenRouter only** as the LLM gateway (no fallback gateway in v1).
2. Use **Vercel AI SDK Core** with `@openrouter/ai-sdk-provider`.
3. Keep one integration wrapper module (`llm-gateway.ts`) so we can change policy later without rewriting product code.
4. Route to a **named model set** — do not use `openrouter/auto` in production (opaque routing, unpredictable tool-calling quality, unreproducible bugs).

#### v1 approved model set (OpenRouter-accessible)

| Model | Intended use | Routing tier |
| --- | --- | --- |
| `Gemini 2.5 Flash` | Default for routine runs (chat, CRM updates, briefings, simple tool calls) | Tier 1 (cheapest) |
| `Gemini 3.0 Flash` | Fallback tier 1 alternative (speed-priority tasks) | Tier 1 alt |
| `Kimi 2.5` | Mid-tier for research, enrichment, web search synthesis | Tier 2 |
| `Gemini 3.1 Pro` | Complex multi-step reasoning, document extraction, large context | Tier 3 |
| `Claude Sonnet 4.6` | High-trust runs: approvals, sensitive CRM writes, final review steps | Tier 3 (high-trust) |

Exact OpenRouter model IDs are owned by `llm-gateway.ts` and can change without spec rewrites.

#### Routing policy

1. Default tier: Gemini 2.5 Flash for all routine runs.
2. Escalate to Tier 2 (Kimi) when: web research depth required, context > 32k tokens, or Tier 1 returns tool-calling errors.
3. Escalate to Tier 3 when: explicit approval decisions, large document processing, or Tier 2 fails.
4. Claude Sonnet 4.6 is the preferred Tier 3 model for high-trust operations (approval gates, user-facing sensitive actions).
5. Model selection must be logged per run in telemetry: selected model, tokens, cost, and escalation reason if applicable.
6. Exact model IDs, escalation thresholds, and fallback order are owned by `llm-gateway.ts` — product code must not hardcode model IDs.

### Core product stack

1. Frontend: React 19 + Vite 7 + Tailwind 4 + ShadCN + TanStack Router + TanStack Query + TanStack Table + TanStack Form. **This is the confirmed stack from the existing `/Documents/Sunder` codebase (landing, auth, and dashboard already built). Any reference to Next.js in other documents is stale and overridden by this spec.**
2. Backend/control API: Node.js + TypeScript.
3. Structured data/auth: Supabase (`@supabase/supabase-js`).
4. Per-client files: Supabase Storage. Code execution: Vercel Sandbox (on-demand, three-tier model).
5. Billing: Stripe.

### Provider and SDK matrix

| Capability | Provider | SDK/Access Method | v1 Status |
| --- | --- | --- | --- |
| LLM orchestration | OpenRouter (named model set — see routing decision above) | Vercel AI SDK Core + `@openrouter/ai-sdk-provider` | Launch |
| CRM + app data | Supabase | `@supabase/supabase-js` | Launch |
| Knowledge intelligence store | Custom (filesystem + Supabase index) | Filesystem APIs + Supabase | Launch |
| Per-client files | Supabase Storage | `@supabase/supabase-js` Storage SDK | Launch |
| Code execution | Vercel Sandbox | `@vercel/sandbox` SDK | Launch |
| Web search (default) | Brave Search API (LLM Context) | Direct HTTP API | Launch |
| Known-URL extraction (default) | Exa `/contents` (`text` mode) | Exa API | Launch |
| Search alternative | Parallel Search API | Direct HTTP API | Launch (optional A/B only) |
| Interactive browser (Lane 3) | Stagehand + Browserbase | Stagehand SDK + Browserbase API | Launch |
| Known-site scraping (Lane 1) | Apify actors + RapidAPI | Apify API + RapidAPI | Launch |
| Open-ended scraping (Lane 2) | Scrapling + MiniMax (flat-rate LLM) | Python in Vercel Sandbox (background job via Trigger.dev) | Launch |
| LinkedIn intelligence | LinkedIn MCP (interactive) + RapidAPI (bulk) | MCP connection + RapidAPI | Launch |
| Scheduling auth/actions | Composio + Cal.com | Composio SDK/API | Launch |
| Forms auth/actions | Composio + Tally.so | Composio SDK/API | Launch |
| External MCP connections | Managed MCP registry (Granola first) | Tasklet-style `mcp` connection flow | Launch (managed-only) |
| Private REST API connections | Managed Direct API templates | Tasklet-style `direct_api` connection flow | Launch (managed-only) |
| Link attribution | Composio + Short.io | Composio SDK/API | Deferred (Phase 3) |
| Email | Resend | Resend SDK/API | Deferred (Phase 3) |
| Voice transcription | OpenAI speech-to-text | OpenAI SDK/API | Launch |
| Meeting transcripts (optional) | Granola (user-managed account) | Guided onboarding skill + Granola MCP connection | Launch (ad hoc optional) |
| Voice output | Inworld AI | Inworld API/SDK | Launch (basic depth) |
| Document extraction | Gemini 2.5 Flash + ExtendAI | Direct APIs | Launch |
| Document generation | Custom MCP (ported from Sunder) | Internal MCP/tooling path | Launch |
| Artifact publishing ("Mini Lovable") | Custom (frontend-design skill + static hosting) | Internal skill + Vercel Sandbox + Supabase Storage signed URLs | Launch |
| Document signing | DocuSeal | API | Deferred |
| Social workflows | Postiz | API | Deferred (Phase 2) |

### Integration model parity with Tasklet (locked)

1. Tasklet uses a Pipedream-backed integration marketplace; Sunder uses a Composio-backed integration marketplace for `integrations`.
2. Sunder keeps Tasklet connection lifecycle and type model for `integrations`, `mcp`, and `direct_api`.
3. v1 safety gate: `mcp` and `direct_api` are managed allowlist only (ops-approved templates/servers), while lifecycle behavior stays unchanged.
4. Sunder adds a hybrid contract layer so workflows read predictable output fields while still retaining raw provider responses.

### Search and scraping/browser policy (locked from built-in services, updated Feb 25 2026)

**Search (unchanged):**
1. Search default in v1: Brave Search API (LLM Context).
2. Known URL extraction default: Exa `/contents` in `text` mode.
3. Parallel Search is available as an optional alternative if quality/latency wins in tests.

**Web scraping and browser automation (three lanes):**
4. Lane 1 (known-site scrapers): Apify actors + RapidAPI for high-value known sites (PropertyGuru, LinkedIn bulk). Pre-built, maintained, per-run pricing.
5. Lane 2 (open-ended scraping): Scrapling + flat-rate LLM (MiniMax M2.5, ~$20/mo) for arbitrary unknown sites. Runs as async background job in Vercel Sandbox via Trigger.dev. User prompts, results delivered when done.
6. Lane 3 (interactive browser): Stagehand + Browserbase for real-time form fills, RPA, and login-gated automation. Action caching means ~80% speedup on repeated actions.
7. LinkedIn-specific: LinkedIn MCP server for interactive lookups (read-only, 7 tools). RapidAPI for bulk scraping.
8. Firecrawl and Tinyfish are not v1 default paths. Firecrawl may be used selectively for bulk URL content extraction edge cases.

### Frontend inspiration baselines (locked)

We are not copying product code. We are borrowing proven UX patterns from leading OSS products.

| Frontend surface in Sunder | OSS product reference | Why this reference | What we adopt in v1 |
| --- | --- | --- | --- |
| CRM workspace (contacts, deals, activity) | [Twenty](https://github.com/twentyhq/twenty) | Most aligned open-source CRM UX for table + kanban + record workflows | Dense data tables, saved views, filters/sorts, quick record side panel, relationship-first timeline presentation |
| Knowledge surface (topics + readable notes) | [Outline](https://github.com/outline/outline) | Clean, fast, readable docs UX with strong information hierarchy | Left tree navigation, fast search-first retrieval, clean markdown reading/editing surfaces, low-noise typography |
| Tasks / to-do tracker | [Super Productivity](https://github.com/super-productivity/super-productivity) | Strong open-source to-do focused UX (not full CRM/project suite) with mature personal task ergonomics | Simple inbox/today/upcoming task flows, fast add/edit/complete loop, due dates, priorities, recurring tasks, low-friction keyboard-first operation |
| Guided workflow interview cards | [Pearl](https://bubblelab.ai/) (product inspiration), Fintool AskUserQuestion pattern | Best-in-class pattern for painless setup and user-in-the-loop decisions | One-question-at-a-time cards, clickable options + custom answer, pause/resume mid-run questions, final plain-language preview with `Save Draft`, `Test Once`, `Activate` |

#### To-do OSS selection decision (research-backed)

As of **February 20, 2026** (GitHub source):

1. `super-productivity/super-productivity`: **17,541 stars** (selected for Sunder to-do UX baseline)
2. `go-vikunja/vikunja`: **3,364 stars** (simple self-hostable to-do app reference)
3. `chrisvel/tududi`: **2,219 stars** (self-hosted task management reference)
4. `BaldissaraMatheus/Tasks.md`: **2,004 stars** (markdown-board style task reference)

Decision for v1:

1. Use **Super Productivity** as the primary inspiration for the Sunder task/to-do experience because it best matches your requirement: simple task tracking over full project-suite complexity.
2. Use **Vikunja** as a secondary reference for clean, self-hostable, list-first task patterns.
3. Keep **Plane** out of the core to-do tracker inspiration for v1 tasks UI (too broad for the simple tracker goal).

---

## Tasklet Reference Alignment (Source-of-Truth)

This is locked for v1:

1. We adopt Tasklet patterns as the default behavior for runtime architecture, tool calling, skills, subagents, cron/trigger execution, and system prompt structure.
2. If we deviate from Tasklet behavior, we must explicitly document the delta (what changed, why, risk, rollback path, and review date).
3. If this spec is silent on behavior, engineering should follow the Tasklet references below first.

### Connection parity policy (zero-drift lock for v1)

1. Connection behavior follows Tasklet connection lifecycle exactly unless a documented delta is approved first.
2. Required order for any external-service request:
   - check existing connections first,
   - verify capability and exact tool names on existing connections,
   - activate least-required tools with user approval,
   - if a new connection is required, choose in order: `integrations` -> `mcp` -> `direct_api`,
   - enforce managed allowlist policy for `mcp` and `direct_api` in v1,
   - create a new connection only if no existing connection can satisfy,
   - on auth failure, run reauthorization and retry.
3. Success bar: one-shot setup. After user approval, the same run should continue without asking the user to restart.
4. Any intentional deviation must be recorded in `../architecture/01-Tasklet Delta Register.md` before merge.
5. Required references for this lock:
   - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`
   - `references/tasklet/tools/built-in/23-list_users_connections.md`
   - `references/tasklet/tools/built-in/24-get_details_for_connections.md`
   - `references/tasklet/tools/built-in/27-manage_activated_tools_for_connections.md`
   - `references/tasklet/tools/built-in/28-reauthorize_connection.md`
   - `references/tasklet/tools/built-in/30-create_new_connections.md`
   - `references/tasklet/skills-system/03-creating-connections-skill.md`
   - `references/tasklet/complex-multi-integration-workflow/02-connection-setup-and-auth-failure-handling.md`

### Required reference domains (must be used in design and implementation)

| Domain | v1 rule in Sunder | Tasklet reference paths |
| --- | --- | --- |
| Core runtime model | Keep 3-layer model: control plane, stateless invocation, isolated runtime | `references/tasklet/core-architecture/01-core-runtime-model.md` |
| Tool contracts and execution flow | Hybrid contracts: strict schemas for internal tools, normalized envelope + raw passthrough for external integration tools; tools remain the only mutation path | `references/tasklet/core-architecture/03-tool-system-and-execution-flow.md`, `references/tasklet/tools/00-complete-tasklet-tool-definitions-verbatim.md` |
| Tool-call context management | Implement truncation recovery using `blockId` and toolcall artifacts, with explicit Sunder fallback behavior for missing artifacts | `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`, `references/tasklet/11-sunder-verified-behavior-context-and-task-list.md` |
| Task list semantics | Dual model at runtime, single Tasks page in UI: CRM tasks remain tracking-only while Agent Tasks are executable work items with approval gating and explicit status lifecycle. Tasklet's core mechanic (binary open/deleted, LLM reads on wake-up and acts) is the foundation; Sunder extends with status lifecycle and approval gating. | `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`, `references/tasklet/tools/built-in/12-manage_tasks.md`, `references/tasklet/tools/built-in/13-list_tasks.md`, `references/tasklet/11-sunder-verified-behavior-context-and-task-list.md`, `references/tasklet/task-list-system/00-task-list-live-trace.md` |
| Skills system | Use read-only system and connection skills; allow user-facing customization skills only under bounded contract (guided interview -> approval -> verify), with no silent activation | `references/tasklet/skills-system/01-skills-system-overview.md`, `references/tasklet/skills-system/02-building-preview-apps-skill.md`, `references/tasklet/skills-system/03-creating-connections-skill.md` |
| Subagents | Subagent files are reusable markdown contracts; final-response-only return pattern | `references/tasklet/core-architecture/05-subagent-lifecycle.md`, `references/tasklet/persistence-and-cron/05-subagent-file-anatomy.md`, `references/tasklet/tools/built-in/14-run_subagent.md` |
| Cron and trigger lifecycle | Fresh invocation on each trigger; use discover -> setup -> manage/simulate flow | `references/tasklet/persistence-and-cron/03-cron-trigger-execution-semantics.md`, `references/tasklet/tools/built-in/15-search_triggers.md`, `references/tasklet/tools/built-in/16-setup_trigger.md`, `references/tasklet/tools/built-in/17-manage_active_triggers.md` |
| Connection lifecycle | Check existing connections first; verify tool names; activate with user approval; reauthorize on auth failure | `references/tasklet/tools/built-in/23-list_users_connections.md`, `references/tasklet/tools/built-in/24-get_details_for_connections.md`, `references/tasklet/tools/built-in/27-manage_activated_tools_for_connections.md`, `references/tasklet/tools/built-in/28-reauthorize_connection.md` |
| First-run setup behavior | Use guided setup skills for setup requests: discover prerequisites -> prepare artifacts -> connect/authorize -> verify before activation | `references/tasklet/first-run-lifecycle/01-first-run-instructions-and-decision-path.md`, `references/tasklet/first-run-lifecycle/03-how-saved-state-is-used-on-later-runs.md` |
| State boundaries | Keep system-managed vs agent-managed state explicit | `references/tasklet/core-architecture/02-state-surfaces-system-vs-agent.md`, `references/tasklet/persistence-and-cron/01-persistence-model.md` |
| Reliability and determinism | Use determinism ladder; encode behavior via artifacts + deterministic scripts for fragile logic | `references/tasklet/persistence-and-cron/04-consistency-vs-determinism.md`, `references/tasklet/persistence-and-cron/06-best-practice-template.md` |
| Partial-failure and run status | Treat `partial` as valid terminal state; preserve useful output under partial failures | `references/tasklet/complex-multi-integration-workflow/06-edge-case-and-partial-failure-policy.md`, `references/tasklet/complex-multi-integration-workflow/05-trigger-run-execution-trace.md` |
| System prompt operating policy | Keep explicit sections for context management, subagents, triggers, notifications, and task management | `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md` |

### v1 hard contracts: context recovery and task semantics

These are explicit runtime contracts in Sunder v1 (not optional guidance).

#### Context recovery contract

1. When `<context-removed>` appears, treat in-thread truncated snippets as non-authoritative.
2. Recover full artifacts from `/agent/toolcalls/{blockId}/result` before using that data.
3. Recover `/agent/toolcalls/{blockId}/args` when historical input fidelity matters.
4. If artifact recovery fails and safe re-run is possible, re-run from recovered args.
5. If safe re-run is not possible, do not guess data; return constrained/partial output and ask for guidance.
6. For blocked autonomous runs, create/update a tracking task with resume details and notify user once.

#### Task semantics contract

1. CRM tasks (`manage_tasks` and `list_tasks`) remain required compatibility surfaces for user-visible tracking.
2. CRM tasks remain tracking-only; they do not execute or schedule work.
3. `delete` remains the completion action for CRM tasks (binary state: open or removed).
4. Agent Tasks are separate runtime work items that may execute actions through the normal runner path.
5. Agent Task completion is a status transition to `done` (not delete).
6. UI shows one unified Tasks surface that merges CRM tasks and Agent Tasks.
7. Every task card must expose source as one of: `CRM`, `Manual`, `Autopilot`.
8. Default board columns map to: `Planned`, `In Progress`, `Review`, `Done`.
9. Canonical Agent Task lifecycle statuses are: `planning`, `planned`, `in_progress`, `review`, `done`, `cancelled`.
10. `Blocked` and `Needs approval` are flags/badges (`is_blocked`, `needs_approval`) plus queue signals, not lifecycle statuses and not standalone board columns.
11. Lifecycle-to-board mapping is locked:
    - `planning`, `planned` -> `Planned`
    - `in_progress` -> `In Progress`
    - `review` -> `Review`
    - `done`, `cancelled` -> `Done` (cancelled must show `Cancelled` badge).
12. CRM task board mapping is locked:
    - `open` -> `Planned`
    - `removed` -> hidden from active board/list surfaces.
13. CRM-linked follow-ups must link back to CRM records; CRM views reference those tasks instead of owning a separate CRM-task surface.
14. Blocked Agent Tasks must store resume details and explicit unblock requirements.

#### Reference lock for these contracts

1. `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`
2. `references/tasklet/tools/built-in/12-manage_tasks.md`
3. `references/tasklet/tools/built-in/13-list_tasks.md`
4. `references/tasklet/11-sunder-verified-behavior-context-and-task-list.md`
5. `references/tasklet/task-list-system/00-task-list-live-trace.md`

### v1 hard contracts: session continuity, shared memory, and queueing

These are explicit runtime contracts in Sunder v1 (not optional guidance).

#### Plain-language definitions contract

1. `App` means one Sunder assistant setup for one client account.
2. `Thread` means one conversation lane inside that app.
3. `Memory` means long-term user facts and preferences shared across that app's threads.
4. A new thread is not a new app. Threads are separate chat lanes that use the same assistant and shared memory.

#### Thread identity contract

1. Every inbound chat or channel message must resolve one stable `chat_identity_key`: `channel + chat_type + chat_id`.
2. `chat_identity_key` identifies the messaging surface (for example, one Telegram chat), not one immutable thread lane.
3. Each conversation lane must have its own `thread_id` and `thread_key`.
4. `thread_key` must be deterministic per lane: `chat_identity_key + ":" + thread_sequence`.
5. Reopened conversations must reuse the selected existing thread lane by default.
6. A new lane is created only through explicit `new_thread_requested` input from the user.
7. Thread identity resolution must happen before prompt assembly and before queue lookup.

#### Conversation fork contract (`new_thread_requested`)

1. If no explicit fork signal is present, inbound messages route to the active thread lane for that `chat_identity_key`.
2. If the UI sends an explicit `thread_id` (user opened an existing thread), route to that exact thread lane.
3. If the UI sends `new_thread_requested`, create a new lane with `thread_sequence + 1`, new `thread_key`, and new `thread_id`.
4. On lane creation, store `parent_thread_id` (if one exists) and mark the new lane as active for that `chat_identity_key`.
5. After fork, later inbound messages on that chat identity route to the new active lane unless the user explicitly opens another thread.

#### Queueing and concurrency contract

1. Keep one active runner execution per `thread_id` at a time.
2. If a message arrives while the same `thread_id` is active, queue it in arrival order.
3. Different thread IDs may run concurrently.
4. Queue processing must resume automatically after the active run completes.
5. Per-thread queue behavior must be idempotent and retry-safe.

#### Pause-and-resume contract (user answer required)

1. If a run needs a user answer, set run status to `waiting_user_input`.
2. Persist a resume checkpoint with: pending question, blocked step, and required answer shape.
3. Release the per-thread run lock immediately after the checkpoint is saved.
4. The next inbound message on that same thread must first check for a pending `waiting_user_input` checkpoint.
5. If the message satisfies the pending question, consume it as resume input, reacquire the lock, and continue from the blocked step.
6. If the message does not satisfy the pending question, keep the run paused and ask the user to either answer the pending question or cancel it.
7. A paused run can exit only by `resumed`, `cancelled`, or `expired` policy outcome.
8. Queue ordering still applies only while a run is actively executing; `waiting_user_input` is not treated as an active lock holder.

#### Approval pause contract (high-risk action required)

1. If a run needs high-risk approval, set run status to `waiting_approval` before any side-effecting action.
2. Persist an approval checkpoint with: action summary, risk reason, expected effect, and blocked step.
3. Release the per-thread run lock immediately after the approval checkpoint is saved.
4. The next inbound decision on that same thread must first check for a pending `waiting_approval` checkpoint.
5. If user approves, consume decision as resume input, reacquire the lock, and execute the blocked action.
6. If user rejects/cancels or the request expires, skip the blocked risky action and end as `partial` or `cancelled` with a clear reason.
7. Queue ordering still applies only while a run is actively executing; `waiting_approval` is not treated as an active lock holder.

#### Replay and reconnect contract

1. Stream events for each thread must be persisted with monotonic sequence IDs.
2. UI clients must store a per-thread replay cursor.
3. On reconnect, UI must replay missed events from the cursor before resuming live stream.
4. Replayed events must be deduped by sequence ID on the client.

#### Shared memory write and read contract

1. At run start, load shared user memory (`MEMORY.md` index) before recent thread history. Load detailed `memory/*.md` files on-demand based on conversation need.
2. Agent auto-writes memory observations during conversations — preferences, decisions, context, patterns — to the appropriate `memory/*.md` file in real-time. No approval gate for memory writes.
3. `SOUL.md` and `USER.md` remain manual-edit only (assistant cannot auto-edit them).
4. Every memory write must be versioned with change summary and rollback note.
5. Memory synthesis pulse periodically presents auto-written entries for user cleanup/review.
6. Memory must be available across all threads for the same app/client.
7. System-reminder advertises memory state (file count, last write time) each turn so the agent knows what exists without loading everything.

#### Long-thread compaction contract

1. When thread history exceeds context budget, summarize older messages and keep recent turns verbatim.
2. Compaction summaries must preserve key user facts, key decisions, and open tasks.
3. Compaction must never delete source history from durable storage.
4. Prompt assembly should use: shared memory -> latest compaction summary -> recent thread turns.

#### Reference lock for these contracts

1. `references/tasklet/core-architecture/04-execution-modes-and-rediscovery.md`
2. `references/tasklet/core-architecture/02-state-surfaces-system-vs-agent.md`
3. `references/tasklet/persistence-and-cron/01-persistence-model.md`
4. `references/tasklet/persistence-and-cron/02-what-persists-vs-what-does-not.md`
5. `references/tasklet/first-run-lifecycle/03-how-saved-state-is-used-on-later-runs.md`
6. `references/tasklet/tools/built-in/06-run_agent_memory_sql.md`

### Adoption guardrails for this architecture document

1. Any new architecture section for tools, skills, cron, system prompt, or connections must include at least one Tasklet path reference.
2. Any intentional deviation must be captured in the Tasklet Delta Register at `../architecture/01-Tasklet Delta Register.md` with fields: `area`, `tasklet-baseline`, `sunder-change`, `reason`, `risk`, `rollback`, `review-date`.
3. We avoid nested runtime complexity by default. Main runner gets direct tool access; subagents are for specialization only.

---

## Request Lifecycle (Technical Flow)

This is the single flow for both chat and automation runs.

1. User sends a message or a trigger fires.
2. Control API authenticates and resolves `client_id`.
3. For chat/channel messages, control API derives `chat_identity_key` from channel + chat type + chat ID.
4. For chat/channel messages, control API resolves target thread lane before queueing:
   - if inbound payload has explicit `thread_id`, route to that existing thread lane,
   - if inbound payload has `new_thread_requested`, create a new lane (`thread_sequence + 1`) and set it active for that `chat_identity_key`,
   - otherwise route to the active lane for that `chat_identity_key` (or create lane 1 if none exists yet).
5. Resolve pending pause state and acquire per-thread run lock:
   - if same thread has `waiting_user_input` and the inbound message is a valid answer, resume from the blocked step before normal queue processing,
   - if same thread has `waiting_approval` and the inbound message is a valid decision, resume from the blocked step before normal queue processing,
   - if same thread is actively running, enqueue message and process it after current run,
   - if thread is idle (or paused without valid resume input), start run immediately.
6. Runner loads prompt context in fixed order:
   - `SOUL.md` assistant personality file (or default personality fallback if missing),
   - `USER.md` stable user profile/preferences file (or empty-profile fallback if missing),
   - shared user memory (`MEMORY.md` + `memory/*.md`),
   - latest thread compaction summary (if present),
   - recent thread messages, state, and active workflow artifacts.
7. If the request is onboarding/setup/customization, runner loads the relevant skill, current step state, and bounded-customization policy checks.
8. Runner sends request through `llm-gateway.ts`, which applies the named-model routing policy above via OpenRouter.
9. Model returns either:
   - final answer, or
   - tool calls.
10. If the planned next action is high-risk, approval gate blocks execution before side effects:
   - set run status to `waiting_approval`,
   - show plain-language approval request,
   - if rejected/cancelled/expired, do not execute the risky action and continue with clear `partial` or `cancelled` outcome messaging.
11. Before using external integrations, runner executes connection preflight in Tasklet order:
   - list existing connections,
   - verify capability coverage and exact tool names,
   - activate minimum required tools with user approval,
   - if a new connection is required, choose in order: `integrations` -> `mcp` -> `direct_api`,
   - enforce managed allowlist policy for `mcp` and `direct_api` in v1,
   - only create a new connection if no existing one can satisfy the request.
12. Tool bridge executes tools against:
   - Supabase (CRM/business records),
   - Supabase Storage (per-client files/subagents) + Vercel Sandbox (code execution),
   - search providers (Brave, Exa) + scraping/browser providers (Apify, RapidAPI, Scrapling via Vercel Sandbox, Stagehand+Browserbase, LinkedIn MCP),
   - connection providers (Composio, managed MCP servers, managed Direct API templates, Resend, etc.).
13. For setup and customization skills, runner auto-completes repairable steps and pauses only for user-required actions.
    - when pause reason is user answer required, runner writes a `waiting_user_input` checkpoint and releases the per-thread lock after checkpoint persistence.
    - resume must continue from the same blocked step once a valid answer is received.
14. Tool results (strict internal outputs or normalized external outputs) are sent back to model for final synthesis.
15. Final response streams to UI.
16. Persist run and thread metadata: selected model, tokens, estimated cost, latency, status, setup-step progress (when applicable), and latest replay sequence cursor.
17. After run completion, auto-process the next queued message for the same thread until queue is empty.
    - a run paused in `waiting_user_input` does not block reply handling for that same thread.
    - a run paused in `waiting_approval` does not block decision handling for that same thread.

The scheduler does not create a separate execution path. It invokes the same runner with trigger context, which keeps behavior consistent and easier to debug.

### Canonical run-status contract (locked)

1. Non-terminal run statuses: `queued`, `running`, `waiting_user_input`, `waiting_approval`.
2. Terminal run statuses: `completed`, `partial`, `failed`, `cancelled`.
3. Required transitions:
   - `queued` -> `running`,
   - `running` -> `waiting_user_input` -> `running`,
   - `running` -> `waiting_approval` -> `running`,
   - `running` -> `completed | partial | failed | cancelled`,
   - `waiting_user_input` -> `cancelled | failed` (policy timeout),
   - `waiting_approval` -> `partial | cancelled | failed` (reject/timeout/policy).
4. `waiting_user_input` and `waiting_approval` must release the active execution lock after checkpoint persistence.
5. Run status must be persisted before the UI receives terminal completion events.

---

## Technical Trade-Offs and Best Practices

### Why AI SDK + OpenRouter provider (instead of raw fetch everywhere)

1. Faster build for streaming + tool calling.
2. Cleaner code than custom transport plumbing in every endpoint.
3. Still keeps lock-in low because model access remains behind one gateway wrapper.

### Trade-offs we accept in v1

1. One-router simplicity may occasionally route heavier than needed.
2. Single gateway means fewer moving parts but no cross-gateway fallback.
3. Multi-provider operations add dependencies, but keep feature velocity high.

### Best-practice rules for this architecture

1. Keep all provider calls in adapter modules (no direct calls from feature code).
2. Log per-run telemetry: selected model, tokens, cost, latency, tool errors.
3. Enforce hybrid tool contracts: strict input/output schemas for internal tools, normalized output envelope for external integrations.
4. Use preflight checks for integrations before recurring workflows are activated.
5. Build setup skills as idempotent step sequences so interrupted onboarding can resume safely.
6. Add second routing profile only when hard metrics show failure against cost/quality targets.

---

## Core System Components

## 1) Runner Engine (single orchestration loop)

Input: user event + client context.

Runner steps:

1. Load client state and active artifacts.
2. Build system context.
3. Call model with available tools.
4. Execute tool calls.
5. Continue loop until final answer.
6. Persist run and return user response.

This is the heart of the platform. All channels feed into this same runner.

## 2) Tool Bridge

Tool categories:

1. CRM tools (read/write structured records).
2. Storage tools (per-client files in Supabase Storage).
3. Sandbox tools (code execution in Vercel Sandbox — used when agent determines code would produce better results).
4. Workflow/subagent tools.
5. Connection tools (Composio integrations, MCP servers, Direct API templates).
6. Utility tools (search, extraction pipeline controls, run metadata).
7. Scraping and browser tools (three lanes: known-site scrapers, open-ended Scrapling background jobs, interactive Stagehand+Browserbase, LinkedIn MCP).

Contract model (hybrid):

1. Internal platform tools (CRM, filesystem, workflow/subagent, approvals, run metadata) use strict, versioned input and output contracts.
2. External connection tools (Composio-backed, MCP-backed, and Direct API-backed providers) use strict input contracts and a normalized output envelope for workflow reliability.
3. Provider-specific raw payloads are retained for debugging and edge-case handling without breaking workflow expectations.

## 3) Workflow Packs and Subagents

Reusable workflows are file-based packages (manifest, config, runbook, subagent instructions).

This makes recurring automations testable, auditable, and easier to improve over time.

## 4) Trigger/Scheduler System

One scheduler supports two job types:

1. Scheduled job (exact time)
2. Autopilot pulse (regular check-in)

Both invoke the same runner path.

```text
[Scheduler]
   |-- Scheduled Job --> [Runner] --> [Approval Gate] --> [Result]
   '-- Autopilot Pulse -> [Runner] --> [Approval Gate] --> [Result]
```

### 4a) Autopilot Pulse — Implementation Contract

#### What this is

A repeating alarm clock. Every 30 minutes a timer fires, invokes the AI with the prompt "anything to do? here's your current state", and the AI reads what's written down, does the most useful thing it can, writes back what it did, and goes back to sleep. This is the mechanism that lets Sunder work overnight without user interaction. The AI is stateless — it has no memory between pulses beyond what is explicitly written to Supabase. The quality of overnight operation is entirely determined by what the AI writes back after each pulse.

#### Scheduler loop

1. Single scheduler loop runs in the shared worker process.
2. Tick interval: 30s.
3. On each tick: iterate all workspaces where `autopilot_enabled = true` and `next_pulse_at <= now`.
4. Recompute `next_pulse_at = last_pulse_at + interval_ms` after each run (no drift).
5. New autopilot activations fire on the first tick after enabling (no wait for first interval).

#### Pulse configuration schema (per workspace, in Supabase)

| Field | Type | Default |
|---|---|---|
| `autopilot_enabled` | boolean | false |
| `pulse_interval` | `'15m' \| '30m' \| '1h' \| '2h'` | `'30m'` |
| `quiet_hours_start` | string \| null | null |
| `quiet_hours_end` | string \| null | null |
| `last_pulse_at` | timestamp \| null | null |
| `next_pulse_at` | timestamp \| null | null |

#### Gate order (all must pass before invoking runner)

1. `autopilot_enabled = true`.
2. `next_pulse_at <= now`.
3. Quiet hours: skip if current time is within `[quiet_hours_start, quiet_hours_end)` in workspace timezone. Only enforced when both quiet hours fields are set.
4. Queue empty: skip if workspace has an in-flight agent run. Prevents pulse from interrupting an active conversation.

#### Invocation context

Pulse invocation passes the following to the runner:

```json
{
  "clientId": "...",
  "workspaceId": "...",
  "triggerType": "autopilot_pulse",
  "lastPulseAt": "<ISO timestamp or null>",
  "prompt": "<AUTOPILOT_PULSE_PROMPT>"
}
```

The `triggerType` field causes the runner to apply the pulse-specific system prompt block (priority ordering and `AUTOPILOT_OK` instruction).

#### Autopilot pulse prompt — priority order

The pulse is general-purpose. The agent wakes up, reads its state, and picks the highest-value action across all work types — not just CRM. Agent must attempt the top applicable item and fall back only if nothing is actionable:

1. Advance any `in_progress` tasks: check status, execute the next concrete step. This includes CRM actions, research tasks, monitoring jobs, or any other active work item.
2. Check open follow-up items: deals or tasks overdue for next step, pending owner replies past the configured follow-up window.
3. Handle blockers: if a prior question was sent to the owner and an answer is present in the channel, resume the blocked action.
4. Start next approved task: if nothing is in progress and approved items exist, move the top item to `in_progress`. Requires approval if the first step is a risky external action.
5. Propose new work: if the queue is empty, propose the next highest-value action based on current contacts, deals, knowledge, and any monitored signals. This includes nudging the user to build unbuilt Growth Plan skills from `memory/growth-plan.md` (status: `proposed` or approved-but-not-built). If the user agrees, the pulse triggers the Skill-Building Interview flow via the Guided Interview UI.
5a. If Phase 2 (Deep Profile Interview) has not been completed and was not declined, the pulse may also re-suggest scheduling it as a priority-5 proposal. Do not re-suggest more than once per 48 hours.

If none of the above produces actionable work: respond with `AUTOPILOT_OK` only (no-op signal, no message sent).

#### No-op suppression

1. If pulse response is exactly `AUTOPILOT_OK` (after trimming whitespace): do not deliver any message to the user.
2. Prune the pulse turn from the conversation transcript on `AUTOPILOT_OK` to prevent context pollution from empty pulses.
3. Duplicate suppression: if the last delivered non-no-op pulse message is identical to the current response and was delivered within the last 24h, suppress delivery.

#### Approval-gated risky actions during pulse

1. Pulse follows the same approval gate as all other runner invocations (guardrail pattern #5).
2. Pulse may propose actions freely.
3. Pulse must not execute external side effects (send messages, create calendar events, submit forms) without explicit user approval.
4. On approval-required action: send an approval request, pause further action on that item, and do not re-propose the same item on subsequent pulses until approval is resolved.

#### Post-pulse write-back

Write-back is load-bearing. Because each pulse starts cold, the next pulse is only as good as what the previous one wrote down.

1. Append pulse run record to Supabase: `{ pulse_at, trigger, outcome, no_op, approval_requested }` (this is the `Autopilot pulse run history` item in the data model).
2. Update `last_pulse_at = now` and `next_pulse_at = now + interval_ms`.
3. Reflect any task or CRM action state changes before the next tick.
4. Write a brief journal entry for what was done this pulse (feeds the conversation window loaded at the next pulse for continuity).

#### Source references

- `dorabot/src/autonomous.ts` — pulse schedule ID, interval config, autonomous prompt priority order, CalendarItem wrapper
- `dorabot/src/calendar/scheduler.ts` — RRULE-based scheduler loop, tick/execute mechanics, concurrency guard
- `openclaw/src/infra/heartbeat-runner.ts` — gate order, no-op token, transcript pruning, duplicate suppression, queue-empty check
- `openclaw/docs/automation/cron-vs-heartbeat.md` — heartbeat vs cron decision guide (heartbeat = shared context, soft interval; cron = isolated session, exact timing)

### 4b) Memory Synthesis Pulse — Implementation Contract

#### What this is

A periodic cleanup, review, and feedback cycle. The agent auto-writes memory observations during conversations in real-time. Every few days, the synthesis pulse does two jobs: (1) **memory cleanup** — aggregates recent auto-written entries and daily changelogs, presents them for user review/pruning, and detects higher-order patterns; (2) **performance review** — synthesizes what worked, what didn't, and what to expand based on daily changelogs, task completion, and CRM activity. This is the primary mechanism for memory quality control, pattern detection, and continuous improvement.

#### Why this is separate from Autopilot Pulse

The Autopilot Pulse (4a) is an operational heartbeat: short interval, action-oriented, advance tasks and check follow-ups. The Memory Synthesis Pulse is a reflection, cleanup, and feedback job: longer interval, knowledge-oriented, review auto-written entries, detect higher-order patterns, and synthesize a performance review. Different cadence, different prompt, different output shape. Both use the same runner path.

#### How memory writes work (two paths)

1. **During conversation (auto-write, no approval gate):** The agent writes observations to the appropriate `memory/*.md` file in real-time as it works. System prompt instruction: *"If you learn something worth remembering — a preference, a decision, a client detail, a pattern — write it to the appropriate memory file immediately. Don't wait. Your context is limited; your files are permanent."* The agent also writes a cross-thread daily rollup to `memory/daily-changelog/YYYY-MM-DD.md` at the end of each day's last conversation.
2. **Synthesis pulse (cleanup/review):** Aggregates and presents auto-written entries for user review. See below.

#### Scheduler configuration (per workspace, in Supabase)

| Field | Type | Default |
|---|---|---|
| `memory_synthesis_enabled` | boolean | true |
| `memory_synthesis_interval` | `'2d' \| '3d' \| '5d' \| '7d'` | `'3d'` |
| `last_synthesis_at` | timestamp \| null | null |
| `next_synthesis_at` | timestamp \| null | null |

#### Gate order (all must pass before invoking runner)

1. `memory_synthesis_enabled = true`.
2. `next_synthesis_at <= now`.
3. Quiet hours: skip if current time is within quiet hours window. Only enforced when both quiet hours fields are set.
4. Queue empty: skip if workspace has an in-flight agent run.

#### Invocation context

Memory synthesis pulse passes the following to the runner:

```json
{
  "clientId": "...",
  "workspaceId": "...",
  "triggerType": "memory_synthesis",
  "lastSynthesisAt": "<ISO timestamp or null>",
  "prompt": "<MEMORY_SYNTHESIS_PROMPT>"
}
```

#### Memory synthesis prompt — what the agent does

**Part 1: Memory cleanup**

1. Load current memory state (`MEMORY.md` + `memory/*.md`).
2. Load `memory/daily-changelog/` entries since `lastSynthesisAt`.
3. Load current active goals, agent tasks, deals, contacts, and knowledge items for cross-reference.
4. Review all auto-written entries since last synthesis: identify entries that look stale, possibly wrong, or redundant.
5. Detect higher-order patterns across accumulated daily changelogs that weren't captured in-conversation (e.g., "you've asked about renovation costs in 4 of the last 5 property evaluations").
6. Load `memory/growth-plan.md`. For each detected pattern in step 5, check if it maps to an existing Growth Plan item. If it does, enrich the item with new evidence. If it doesn't and the pattern suggests a repeatable skill, propose a new Growth Plan item with `status: proposed`, evidence dates, and a plain-language explanation of what the skill would do.

**Part 2: Performance review**

6. Synthesize from daily changelogs + task completion history + CRM activity:
   - **What worked this cycle** — completed tasks, successful follow-ups, deals advanced, workflows that ran smoothly.
   - **What didn't work** — missed follow-ups, stalled deals, dropped tasks, workflows that failed or needed intervention.
   - **What to expand** — patterns suggesting new workflows, adjustments to timing/approach, skills to consider.
7. Surface both the memory review and performance review to the user as a single conversational briefing.

#### Review shape (user-facing)

The pulse is delivered as a single chat message with two sections:

**Section 1: Memory cleanup**

1. **Auto-written since last review** -- summary of what the agent captured, organized by taxonomy category. User can confirm, edit, or delete individual entries.
2. **Flagged for review** -- entries the agent thinks might be stale, wrong, or redundant. User confirms or deletes.
3. **Patterns detected** -- higher-order behavioral signals detected across daily changelogs. User approves to add to `patterns.md` or dismisses.
4. **Growth Plan updates** -- new skill proposals from detected patterns (user approves to add to `memory/growth-plan.md` or dismisses), plus evidence updates for existing Growth Plan items. Shows current Growth Plan status summary (X proposed, Y in-progress, Z built this cycle).

**Section 2: Performance review**

5. **What worked** -- completed tasks, successful follow-ups, deals advanced, workflows that ran well. Includes performance of recently-built Growth Plan skills if any were activated this cycle.
6. **What didn't work** -- missed follow-ups, stalled deals, dropped tasks, workflows that needed intervention.
7. **What to expand** -- suggested workflow changes, timing adjustments, and Growth Plan skills to prioritize building next based on observed patterns and frequency.

User feedback during the performance review section is itself auto-written back to memory (preferences, decisions) — creating a feedback loop where each review makes future reviews better.

The user can also confirm all, skip this cycle, or adjust the synthesis interval.

#### Review and write-back

1. Review analysis (reading, aggregating, flagging) is low-risk auto-run. No approval needed for the analysis step.
2. User confirms, edits, or deletes auto-written entries through the review UI.
3. Confirmed entries stay in their current `memory/*.md` files unchanged.
4. Edited entries are updated in-place with version history.
5. Deleted entries are removed from memory files with a deletion record for audit.
6. Newly approved patterns are written to `patterns.md`.

#### Housekeeping duties

1. Update `last_synthesis_at = now` and `next_synthesis_at = now + interval`.
2. Persist synthesis run record: `{ synthesis_at, items_reviewed, items_confirmed, items_edited, items_deleted, patterns_added, performance_review_delivered }`.
3. Prune daily changelogs older than 30 days — compress into monthly summary files (`memory/daily-changelog/2026-01-summary.md`).
4. Update `MEMORY.md` index if significant changes were made during review.

---

## 5) Mission Control Dashboard

Purpose in v1:

1. Visibility into contacts, deals, goals, unified tasks, and knowledge updates.
2. Two-tab operating view only: `Overview` and `Queue`.
3. Activity and run history.
4. Approval queue and outcomes.
5. Autopilot status visibility (enabled state, cadence, last run, next run).
6. Health and usage visibility.

## 6) Guided Onboarding Skill Pack

Purpose in v1:

1. Run Phase 1 (Quick Activation) setup in chat for initial service connections and first useful output.
2. Execute checks and auto-fix steps through tools when no user action is required.
3. Ask for user input only when needed (auth sign-in, permission approval, explicit choices).
4. Persist step status so onboarding can resume from the correct point after interruption.
5. Run final verification and return a clear readiness summary.
6. Enforce connection-first setup behavior so setup is one-shot when possible (reuse existing connection -> request minimum needed access -> auto-resume).
7. At the end of Quick Activation, propose and schedule the Phase 2 Deep Profile Interview session.
8. Run the Phase 2 Deep Profile Interview using the User Profiling interview-guide template via the Guided Interview UI. Populate `USER.md`, `memory/preferences.md`, and propose `memory/growth-plan.md`.
9. Run optional capability onboarding (for example, meeting transcripts) either during Phase 2 or ad hoc when the user requests it later.

## 7) Guided Interview UI and Question Card Engine

Purpose in v1:

1. Provide a general-purpose interview engine used across three flows: User Profiling, Skill Building, and Workflow Creation.
2. Ask one focused question at a time with clickable options.
3. Pause and resume runs when user input is required.
4. Ensure each interview flow ends with a plain-language preview of what was captured/built and clear action buttons.
5. Use one structured question payload format so all interview cards are rendered consistently across all three flows.
6. Support interview-guide templates: pre-built question sequences with branching logic that guide the agent through a specific profiling, skill-building, or workflow-creation conversation.

## 8) Bounded Customization Contract (skills-first, locked)

Purpose in v1:

1. Keep the core runtime small and stable; customization lives in skills and workflow artifacts.
2. Let users customize outcomes through guided skills, not free-form config-file editing.
3. Allowed customization scope: channel/workflow preferences, trigger timing, approval mode selection, output format, and user working-style preferences.
4. Disallowed user-level scope: runner loop internals, tenant isolation policy, high-risk safety gates, audit logging requirements, and core internal tool schemas.
5. Reusable customization flow is fixed: guided interview -> plain-language plan preview -> explicit user approval -> apply -> verification summary.
6. No silent skill activation: new reusable skills must remain uncreated/inactive until user approval to create and activate.
7. Every approved customization must store approver, change summary, expected outcome, and rollback note in run metadata.

### Skills ship as interview guides, not pre-configured defaults (locked for v1)

1. No skill ships with pre-configured behavior that runs without the user having discussed and approved it. Default "generic" skills are not activated automatically.
2. Every skill that Sunder offers (whether built-in or from a future marketplace) ships as an **interview-guide template**: a structured set of questions the agent needs to ask the user in order to build a personalized version of that skill.
3. First activation of any skill triggers the Skill-Building Interview flow (Guided Interview UI). The agent asks the user how they want this specific task performed, what formats they prefer, what edge cases matter, and workshops the approach using the user's own examples where possible.
4. The interview output is a personalized skill definition that the user reviews and approves before activation. This is the only path to an active skill.
5. The only exception is guardrail instructions (for example: "don't use placeholder values in sensitivity tables", "always confirm before sending external messages"). These are safety-scoped and may be imported without a full interview, but still require user acknowledgment.
6. Built-in interview-guide templates may be shown as examples if the user asks what Sunder can do, but they must not be silently instantiated or activated.
7. This rule applies to the Growth Plan: items on the Growth Plan are skill proposals, not active skills. Each one becomes active only after the user completes its Skill-Building Interview.

## 9) Compounding Memory System

Memory is the primary long-term value driver and the user's switching cost. Every interaction makes Sunder more useful. After 30 days of use, Sunder knows the user's client relationships, follow-up preferences, deal patterns, market focus, and decision history. This accumulated intelligence cannot be replicated by switching to a competing product.

### Memory as moat

When agents mediate the SaaS experience, traditional switching costs (UI muscle memory, workflow lock-in, training investment) collapse. But when the agent itself IS the accumulated memory, switching cost stays high. A competitor can replicate Sunder's features. They cannot replicate 6 months of institutional knowledge about how this specific user runs their business.

### Memory categories (taxonomy)

Memory captures four categories of knowledge:

1. **Preferences** -- how the user works, communicates, and makes decisions. Examples: preferred follow-up timing, communication tone, report format, working hours.
2. **Decisions** -- what was decided, when, and why. This is institutional knowledge that would otherwise live in the user's head and be lost. Examples: why they chose to focus on a specific district, why they dropped a lead, how they evaluate properties.
3. **Context** -- entity-level knowledge about clients, deals, areas, and market conditions. Examples: that Mrs. Tan prefers morning viewings, that District 9 condos are their current focus, that a specific buyer has a renovation budget concern.
4. **Patterns** -- behavioral signals the agent detects over time from repeated interactions. Examples: the user always asks about renovation costs before recommending older properties, follow-up emails sent on Monday mornings get better response rates for this user's client base.

### Memory population model

Memory is populated through three paths:

1. **Agent auto-write during conversation** -- the agent captures observations (preferences, decisions, context, patterns) to appropriate `memory/*.md` files in real-time as it works. No approval gate. This is the primary path for knowledge capture — the agent writes at the moment of highest signal, not days later from transcript archaeology. System prompt instruction: *"If you learn something worth remembering, write it to the appropriate file immediately."*
2. **Explicit user instruction** -- user says "remember that Mrs. Tan prefers morning viewings" and the agent saves immediately. No batch wait.
3. **Daily changelog** -- at the end of each day's last conversation, the agent writes a cross-thread rollup to `memory/daily-changelog/YYYY-MM-DD.md` summarizing actions taken, decisions made, and CRM changes across all threads that day.

Memory quality is maintained through the **memory synthesis pulse** — a periodic cleanup/review cycle (default: every 3 days) where the user reviews, edits, and prunes auto-written entries. The pulse also detects higher-order patterns across daily changelogs. See Trigger/Scheduler section for implementation details.

### Compounding value curve

The memory system is designed so that product value increases non-linearly with usage duration:

- **Week 1:** Basic preferences captured. Agent starts adapting tone and format.
- **Month 1:** Client context builds. Agent knows key relationships and active deals without being told.
- **Month 3:** Decision history accumulates. Agent can reference past reasoning and suggest consistent strategies.
- **Month 6+:** Pattern detection matures. Agent proactively surfaces insights the user hasn't asked for, based on accumulated behavioral signals.

Memory is shared across all threads and channels. It persists indefinitely. It is the user's primary reason to stay.

---

## 10) Goals, Agent Tasks, and Domain Boundaries

Purpose in v1:

1. Goals
- Outcome the user wants.
- States: active, paused, done.

2. Agent Tasks
- Concrete next steps under goals.
- Lifecycle states: planning, planned, in_progress, review, done, cancelled.
- Runtime flags: is_blocked, needs_approval.
- `blocked` is a flag and must not replace lifecycle state.
- Important actions require user approval.

3. Knowledge
- Synthesized reusable intelligence organized by topic with source links.
- Primary examples: market trends, area briefs, buyer-objection patterns, and research summaries.
- Sources can include web research, conversation history, and meeting transcripts.

4. Documents
- Strictly the file-extraction pipeline for inbound files (PDF/image/scans/contracts/reports).
- Use this domain only when Gemini + ExtendAI OCR/structured extraction is required.
- Tracks extraction lifecycle and links structured output to CRM records.
- Can optionally emit synthesized Knowledge items with back-links to source document IDs.

Naming rule for v1:

1. Use "Agent Tasks" for executable assistant work.
2. Use "CRM tasks" for business record tracking.
3. Use "Knowledge" as the user-facing term for reusable findings.
4. Use "Documents" as the user-facing term for extraction pipeline records only.
5. Meeting transcripts default to the Knowledge domain (not Documents).

---

## Data and State Design

Simple source-of-truth split:

1. **Supabase** for structured business state and reporting.
2. **Per-client workspace files** for runtime artifacts and workflow definitions.

### Data classes in Supabase

1. Client accounts and subscription state.
2. Contacts, deals, CRM tasks, interactions.
3. Goals.
4. Agent tasks.
5. Knowledge items (legacy storage alias `research_items` allowed during migration only).
6. Document processing records (incoming file metadata, extraction status, structured extraction output, linked CRM IDs, source file references).
7. Trigger definitions and run logs.
8. Autopilot pulse configuration and pulse run history.
9. Approval events and outbound action records.
10. Setup/onboarding progress (current step, blocked reason, last successful verification).
11. Usage and cost telemetry.
12. Conversation threads (`thread_id`, `thread_key`, `thread_sequence`, `parent_thread_id`, `chat_identity_key`, `client_id`, `channel`, `chat_type`, `chat_id`, lifecycle timestamps, active-lane flag).
13. Conversation messages/transcripts (normalized inbound/outbound messages with provenance metadata).
14. Per-thread queue and idempotency records (run ordering and safe retry state).
15. Stream replay events and per-client replay cursors.
16. Thread compaction summaries for long-history context control.
17. Shared memory profile and memory version history (what changed, rollback note, write source: auto-write vs explicit instruction vs synthesis edit).
18. Memory synthesis pulse configuration and run history (`synthesis_at`, `items_reviewed`, `items_confirmed`, `items_edited`, `items_deleted`, `patterns_added`).
19. Memory depth metrics per user (total items by taxonomy category, last synthesis date, auto-write rate, cleanup rate).

### UI-to-backend mapping contract (v1 locked)

1. `Tasks` page reads a unified list composed from CRM tasks and Agent Tasks.
2. Each task item includes: `source`, `status`, `needs_approval`, `is_blocked`, `due_at`, and optional `crm_record_link`.
3. `CRM` page does not own a separate task list UX; it links to tasks inside the unified Tasks surface.
4. `Knowledge` page reads/writes Knowledge items and shows topic/list views.
5. `Documents` page reads/writes document-processing records for Gemini + ExtendAI extraction flow and shows `Incoming` + `Library` views.
6. Meeting transcript artifacts feed Knowledge/CRM/Tasks and must not auto-create Documents records.
7. `Automations` page reads/writes both scheduled jobs and Autopilot pulse settings.
8. `Mission Control` reads approval events, failed actions, blocked tasks, and goals-at-risk into the Queue tab.
9. `Channels` nav exists in v1 as a non-operational coming-soon page only.
10. `Chat` sidebar reads thread list from conversation thread records.
11. Opening a thread reads message history from conversation messages/transcripts.
12. `Memory` page reads shared memory profile and version history with rollback visibility.
13. Chat clients use replay cursor to recover missed stream events after reconnect.

### Data classes in client workspace

1. Workflow package files.
2. Subagent instructions.
3. Run checkpoints and execution artifacts.
4. Setup checklists, setup logs, and verification artifacts.
5. Generated documents/output files.
6. Optional memory compaction artifacts used for audit/debug only (source transcript remains canonical in Supabase).

### Personality, user profile, and memory contract (locked for v1)

1. Each client workspace has one `SOUL.md` file for assistant personality only.
2. Each client workspace has one `USER.md` file for stable user profile/preferences only.
3. `SOUL.md` controls assistant tone/style/behavior and is loaded on every run.
4. `USER.md` stores stable profile details (for example: preferred tone, timezone, response style) and is loaded on every run.
5. `MEMORY.md` is a concise index/summary loaded on every run. `memory/*.md` files hold detailed category-specific memory.
6. If `SOUL.md` is missing, use a short default personality.
7. If `USER.md` is missing, use an empty profile fallback.
8. `SOUL.md` and `USER.md` are manual-edit only in v1 (assistant must not auto-edit them).
9. Keep `SOUL.md` and `USER.md` concise to avoid prompt bloat.
10. Agent auto-writes memory observations during conversations to appropriate `memory/*.md` files in real-time. No approval gate for memory writes. This is the primary knowledge capture path.
11. `SOUL.md` and `USER.md` are the only files the assistant cannot auto-edit. All `memory/*.md` files are auto-writable.
12. Every memory write must be versioned with change summary, write source (auto-write / explicit instruction / synthesis edit), and rollback note.
13. Prompt assembly must load `MEMORY.md` index before recent thread history. Detailed `memory/*.md` files are loaded on-demand based on conversation need.
14. System-reminder advertises memory state each turn (file count, last write time, categories) so the agent knows what exists without loading everything.
15. `MEMORY.md` should stay concise and prune stale entries; detailed chronology belongs in daily changelogs and thread transcripts.
16. `UserMemories` is the UI/product label for this same shared-memory contract; do not create a second parallel memory system.
17. Memory synthesis pulse is a periodic cleanup/review cycle where the user confirms, edits, or prunes auto-written entries. The pulse also detects higher-order patterns across daily changelogs.

### Memory file taxonomy (locked for v1)

Memory files follow a defined taxonomy so the agent has clear write targets during conversation and clear read targets at session start:

```
MEMORY.md                        <- Concise index loaded every run (key facts, active context, <200 lines)
memory/
├── growth-plan.md               <- Visible, co-owned skill-building roadmap (proposed during Deep Profile Interview, updated during reviews)
├── preferences.md               <- Working style, communication, formats, timing
├── key-decisions/               <- Timestamped decision logs with reasoning
│   └── YYYY-MM-topic.md         <- Example: 2026-02-district-focus.md
├── daily-changelog/             <- Cross-thread daily rollup of actions/decisions/CRM changes
│   ├── YYYY-MM-DD.md            <- Example: 2026-02-25.md
│   └── YYYY-MM-summary.md       <- Monthly summary (compressed from daily files after 30 days)
├── context/                     <- Entity-level knowledge
│   ├── clients.md               <- Key client preferences and relationship notes
│   ├── areas.md                 <- Market/area knowledge and focus zones
│   └── deals.md                 <- Active deal context and history
└── patterns.md                  <- Detected behavioral patterns with evidence dates
```

Rules:

1. `MEMORY.md` is the index. It should contain the most important current facts and pointers to detailed files. Keep under 200 lines. Agent updates it when major new items are added.
2. `memory/preferences.md` captures how the user works. Auto-written during conversations when the agent observes or is told a preference.
3. `memory/key-decisions/` stores decision logs with reasoning. Each file is timestamped and topic-scoped. Auto-written when user makes a significant choice during conversation.
4. `memory/daily-changelog/` stores cross-thread daily rollups. Auto-generated at the end of each day's last conversation. Summarizes actions taken, decisions made, and CRM changes. Retained for 30 days, then compressed into monthly summaries by the synthesis pulse.
5. `memory/context/` stores entity-level knowledge. Organized by entity type. Auto-written when new client/deal/area context surfaces in conversation.
6. `memory/patterns.md` stores behavioral patterns the agent detects over repeated interactions. Each pattern must include evidence dates and confidence level. Auto-written when evidence is sufficient, and enriched by the synthesis pulse which detects higher-order patterns across daily changelogs.
7. `memory/growth-plan.md` stores the visible, co-owned skill-building roadmap. Initially proposed during the Deep Profile Interview (Phase 2 onboarding). Each entry includes: skill name, what it would do, why it's relevant (linked to interview answers or observed patterns), status (proposed / in-progress / built / declined), and date. Updated when: the user and agent workshop a new skill, the synthesis pulse detects a pattern that maps to a planned skill, or the user explicitly adds/removes items. The agent may propose new Growth Plan items during normal conversation if a task maps to an unbuilt skill, but creation still requires user approval per the bounded customization contract.
8. The taxonomy is the write target for both in-conversation auto-writes and synthesis pulse cleanup. Each auto-written entry maps to a specific file and category.
8. Explicit user instructions ("remember X") write immediately to the appropriate taxonomy file. No wait for synthesis cycle.
9. The synthesis pulse reviews, cleans up, and prunes auto-written entries — it does not propose new ones (except higher-order patterns detected across daily changelogs).

### Design intent

- Keep runtime behavior debuggable from files and logs.
- Keep business entities queryable and dashboard-ready in SQL.

---

## Safety and Approval Rules

v1 uses mixed autonomy.

### Auto-run (low risk)

1. Data organization and tagging.
2. Internal summaries and briefings.
3. Draft generation and suggestions.
4. Non-destructive enrichment steps.

### Approval-required (high risk)

1. Sending outbound communication to external recipients.
2. Irreversible changes to critical records.
3. Any action with direct customer-facing risk.

### Required safeguards

1. Idempotency and dedupe for events/runs.
2. Preflight checks before activation.
3. Structured subagent outputs (no brittle free-text parsing).
4. Full audit trail for high-risk actions.
5. `SOUL.md` and `USER.md` are read-only for the assistant at runtime (manual edits only).
6. One active run per thread; later same-thread messages are queued in order.
7. Replay cursor and stream-event persistence are required for reconnect reliability.
8. Memory auto-writes are exempt from approval gates (memory IS the product value). All writes are versioned for rollback and reviewed via synthesis pulse. `SOUL.md` and `USER.md` remain manual-edit only.

---

## Cost and Performance Strategy

The business model requires cost discipline from day one.

### Cost guardrails

1. One-router policy (OpenRouter + named-model routing) with usage telemetry on every run.
2. Context budget controls (avoid oversized prompts and noisy history) with long-thread compaction.
3. Cache expensive results where possible.
4. Enforce usage budgets per client.
5. Monthly routing review to decide whether one-router policy should be split into two profiles.
6. Bound replay-event retention and compaction cadence to keep storage/query cost predictable.

### Performance strategy

1. Fast first response for chat interactions.
2. One-at-a-time execution per thread with parallelism across different threads.
3. Background processing for heavy work.
4. Retries with backoff for transient errors.
5. Cursor-based replay for fast reconnect recovery.
6. Clear failure surfacing when retries are exhausted.

### Financial constraint

Design target: stay below **$20** cost per active paid user monthly while charging around the planned pricing band.

---

## Implementation Plan

## Sprint 1: Core runner and chat

1. Create runner engine and hybrid tool contract layer (strict internal + normalized external).
2. Build web chat + streaming response UX.
3. Persist basic run/session history.
4. Build onboarding skill framework (step state, resume behavior, verification summary) covering both Phase 1 Quick Activation and Phase 2 Deep Profile Interview.
5. Implement bounded customization policy enforcement (allowed/disallowed surfaces, approval gate before side effects, audit payload, and verification summary). Enforce that skills ship as interview-guide templates and cannot be activated without completing their Skill-Building Interview.
6. Add cost and usage tracking foundation.
7. Import Tasklet system prompt sections and tool contract baselines into a local reference package.
8. Stand up Tasklet Delta Register and record all known v1 deviations (if any).
9. Build Guided Interview UI v1 foundation (one-question cards, answer capture, preview card, action buttons) supporting all three interview flows: User Profiling, Skill Building, and Workflow Creation. Include interview-guide template format with branching logic.
9a. Build User Profiling interview-guide template (branching by role/domain, populates `USER.md` + `memory/preferences.md`, proposes `memory/growth-plan.md`).
9b. Build Skill-Building interview flow (triggered from Growth Plan items or ad hoc skill requests, produces personalized skill definition for user review/approval).
10. Implement toolcall artifact recovery handling for `<context-removed>` (`blockId` -> `/agent/toolcalls/{id}/args|result`) with explicit fallback policy.
11. Implement dual-task model foundation: CRM task parity adapter (`manage_tasks`/`list_tasks`) plus Agent Task state model.
12. Implement Autopilot pulse job type on the existing scheduler and route it through the same runner.
13. Add automated contract tests for context recovery and task semantics.
14. Implement thread identity resolution (`chat_identity_key` + lane-based `thread_key`/`thread_id`), explicit `new_thread_requested` transition, and per-thread queueing.
15. Implement stream-event persistence and replay cursor contract for reconnect safety.
16. Implement shared-memory auto-write policy (agent writes to `memory/*.md` during conversations; system-reminder advertises memory state each turn; `MEMORY.md` index loaded every run; detailed files loaded on-demand).
17. Implement long-thread compaction with summary + recent-turn prompt assembly.
18. Add continuity acceptance tests (cross-thread memory, cross-channel continuity, queue ordering, reconnect replay).
19. Implement `SOUL.md` + `USER.md` prompt contract in prompt assembly (fixed load order, default/empty fallback, manual-edit guardrail).
20. Implement memory file taxonomy structure (`memory/growth-plan.md`, `memory/preferences.md`, `memory/key-decisions/`, `memory/daily-changelog/`, `memory/context/`, `memory/patterns.md`) with auto-write helpers and version tracking.
21. Implement memory synthesis pulse as cleanup/review cycle (separate cadence from Autopilot, default 3-day interval, gate order, review prompt, daily-changelog aggregation, housekeeping for old changelogs).
22. Implement memory review UI (confirm/edit/delete individual entries, confirm all, skip cycle, adjust interval, pattern approval).

## Sprint 2: CRM and core workflows

1. Implement contacts/deals/tasks/interactions models.
2. Add follow-up engine and daily briefing flow.
3. Add trigger scheduler and run logging.
4. Implement goals, agent tasks, and knowledge models with status lifecycle.
5. Add Mission Control Autopilot visibility (enabled state, cadence, last run, next run).

## Sprint 3: Integrations for Wave 1

1. Scheduling integration.
2. Forms integration.
3. Search integration (Brave default, Exa known-URL extraction).
4. Scraping and browser integration (Lane 1: Apify/RapidAPI known-site, Lane 2: Scrapling open-ended background, Lane 3: Stagehand+Browserbase interactive, LinkedIn MCP).
5. Voice input/transcription workflow.
6. Granola transcript onboarding skill (optional ad hoc setup path).
7. Voice output workflow.
8. Document extraction flow.
9. Document generation integration.
10. Knowledge indexing/retrieval flow and Documents extraction-state indexing flow.
11. Tasklet-parity connection-first UX and one-shot resume flow across all integrations.

## Sprint 4: Hardening and launch readiness

1. Safety gates and approval UX polish.
2. Reliability hardening and failure handling.
3. Cost tuning and model routing optimization.
4. Mission control visibility and operational dashboards.
5. Full parity audit against Tasklet references for skills, cron, system prompt, and tool calling.
6. Execute and sign off on context recovery + task list parity acceptance suite.

## Sprint 5: Post-launch Wave 2 acceleration

1. Knowledge quality and freshness improvements.
2. Documents extraction pipeline quality improvements.
3. Document generation/report workflow depth.
4. Broader automation polish from real usage data.

---

## Testing and Launch Gates

v1 should not launch unless these are true:

1. Activation P95 is under 10 minutes.
2. Core Wave 1 workflows pass end-to-end tests.
3. Duplicate action rate is near zero.
4. Unauthorized high-risk action count is zero.
5. Monthly active-user cost remains under threshold.

### Test categories

1. Onboarding and activation tests (Phase 1 Quick Activation and Phase 2 Deep Profile Interview).
2. Workflow correctness tests.
3. Search, scraping, and browser workflow tests (all three lanes).
4. Knowledge workflows, Documents extraction workflows, and document generation workflow tests.
5. Onboarding skill interruption/resume and verification tests (both Phase 1 and Phase 2).
6. Failure handling and retry behavior tests.
7. Cost regression tests.
8. Approval and audit integrity tests.
9. Guided interview tests — covers all three flows (User Profiling, Skill Building, Workflow Creation): question ordering, skip-known behavior, pause/resume correctness, preview accuracy, interview-guide template branching, and create/edit completion rate.
9a. Deep Profile Interview tests: `USER.md` and `memory/preferences.md` correctly populated from interview answers, `memory/growth-plan.md` proposed and reviewable, Phase 2 scheduling and re-suggestion behavior when skipped.
9b. Skill-Building Interview tests: Growth Plan item triggers correct interview-guide template, personalized skill output matches interview answers, no skill activated without completed interview, guardrail-only exception path works correctly.
9c. Growth Plan lifecycle tests: items added during profiling, items proposed during normal conversation, status transitions (proposed/in-progress/built/declined), synthesis pulse integration for pattern-to-skill mapping.
10. Connection lifecycle parity tests (existing-first check, minimum-permission activation, one-shot connect-and-resume, and reauthorization retry flow).
11. Context recovery and task semantics tests (full artifact recovery, graceful missing-artifact handling, CRM task tracking-only behavior, Agent Task execution lifecycle, and unified Tasks-source rendering).
12. Bounded customization contract tests (allowed vs blocked customization, create/activate approval gating, audit metadata capture, and rollback-note presence).
13. Autopilot pulse tests (cadence handling, no-op suppression behavior, and approval-gated risky actions).
13a. Memory auto-write tests (in-conversation writes land in correct taxonomy files, version history recorded, daily changelog generated at end-of-day, `MEMORY.md` index stays under 200 lines, `SOUL.md`/`USER.md` remain unmodified by agent).
13b. Memory synthesis pulse tests (cadence handling, review aggregation from daily changelogs, confirm/edit/delete behavior, higher-order pattern detection, old changelog compression to monthly summaries, no duplicate entries after cleanup).
13c. Memory compounding tests (memory depth increases over time, auto-written items persist correctly across taxonomy files, explicit user instructions write immediately, daily changelogs accumulate cross-thread activity).
14. Session continuity tests (stable thread identity, same-thread ordered queueing, and cross-thread parallel execution).
15. Shared memory tests (cross-thread recall, cross-channel recall, auto-write version history integrity, synthesis pulse cleanup correctness).
16. Reconnect/replay tests (cursor replay correctness, dedupe behavior, and no missed stream events after reconnect).
17. Long-thread compaction tests (summary quality, key-fact retention, and source transcript preservation).

### Required parity acceptance tests (context + task semantics + continuity)

1. Single-result truncation recovery: recover full result from `blockId` and answer from recovered data.
2. Full tool-call eviction recovery: recover omitted `blockId` data and answer correctly.
3. Multi-`blockId` eviction recovery: recover all omitted calls, not only the first.
4. Args recovery correctness: answer historical-input questions from recovered `/args`.
5. Graceful missing-artifact behavior: no hallucination; use fallback policy.
6. Task persistence across invocations: tasks remain visible and resumable.
7. No side effects from CRM tasks: CRM task operations do not execute business actions.
8. Delete equals done for CRM tasks: deleted CRM task no longer appears in active list.
9. Batch task operations: mixed add/update/delete behavior is reliable in one call.
10. Unified task surfacing: CRM and Agent Tasks both appear in one Tasks dataset with correct source labels.
11. Board-state mapping: each task maps correctly to one of Planned/In Progress/Review/Done plus blocked/approval badges.
12. Agent lifecycle mapping correctness: `planning/planned`, `in_progress`, `review`, `done/cancelled` map to the correct board columns.
13. CRM mapping correctness: `open` appears in `Planned`; `removed` does not appear in active board/list surfaces.
14. Flag independence: `is_blocked` and `needs_approval` badges can coexist with any mapped board column without changing column assignment.
15. Payload continuity: structured payload remains parseable for resume paths.
16. Stable default thread continuity: repeated messages from same chat identity route to the current active thread lane unless user explicitly requests a new conversation.
17. New conversation fork behavior: `new_thread_requested` creates a new lane (`thread_sequence + 1`) and later messages route to that new active lane until user switches.
18. Queue ordering: same-thread concurrent messages execute in arrival order without overlap.
19. Cross-thread parallelism: independent threads can run concurrently without cross-write collisions.
20. Replay recovery: reconnect with saved cursor replays missed events exactly once.
21. Shared memory continuity: memory saved in one thread is available in another thread for same client.
22. Memory auto-writes are versioned and reviewable: every auto-written entry has change summary and rollback note; `SOUL.md`/`USER.md` remain manual-edit only.
23. Compaction quality: long-thread compaction keeps key user facts, decisions, and open tasks.
24. Compaction safety: source transcript remains intact after compaction.

### Rollout strategy

1. Phase 1: internal dogfooding on real workflows.
2. Phase 2: small pilot cohort (3-5 users) with daily run review.
3. Phase 3: paid rollout after activation, safety, and cost gates are stable.

---

## Operational Considerations

1. Per-client health views (status, failures, stalled runs).
2. Daily internal health digest for ops.
3. Run-level logs with reasoned failure classification.
4. Fast rollback switches per integration.
5. Clear support runbook for frontline troubleshooting.

This is required to avoid silent failure and manual chaos during growth.

---

## Retention Model: Memory as Switching Cost

### Why memory is the moat

When AI agents mediate the software experience, traditional SaaS switching costs collapse. The agent doesn't have years of muscle memory on your interface. It doesn't care about your workflow automations because it builds its own. It doesn't need training or migration support. From the agent's perspective, switching from one CRM to another is pointing to a different API endpoint.

But Sunder is not a tool the agent connects to. Sunder IS the agent. And the agent's accumulated memory about the user's business cannot be replicated by switching products.

A competitor can replicate Sunder's features, runner architecture, and integrations. They cannot replicate:

1. 6 months of decision history with reasoning about why the user made specific choices.
2. Entity-level context about 50+ client relationships, preferences, and interaction history.
3. Behavioral patterns detected across hundreds of interactions that make the agent proactively useful.
4. Working style preferences calibrated through dozens of feedback cycles.

### Retention mechanics

1. **Memory auto-write + synthesis pulse** creates a continuous retention signal. The agent captures knowledge in real-time during every conversation. The periodic pulse delivers both a memory cleanup and a performance review (what worked, what didn't, what to expand) — demonstrating the agent is getting smarter and creating a bi-directional feedback loop. User feedback during the review is auto-written back to memory, making future reviews better. This is a tangible "the product is working for me" signal.
2. **Compounding value curve** means the product is more valuable at month 3 than month 1, and more valuable at month 6 than month 3. This is the opposite of most SaaS products where value plateaus after onboarding.
3. **Institutional knowledge capture** means the agent holds context that would otherwise be lost. When a user considers switching, they're not just losing a tool — they're losing an assistant that knows their business.

### Retention metrics to track (v1)

1. Memory depth per user: total items across all taxonomy categories.
2. Memory synthesis engagement rate: percentage of synthesis reviews where user confirms, edits, or prunes at least one item.
3. Memory recall frequency: how often the agent references memory items in responses (proxy for memory usefulness).
4. Retention correlation: retention rate segmented by memory depth quartiles.

---

## Risks and Mitigations

## Risk 1: Broad scope slows launch

Mitigation:

1. Keep architecture broad, but enforce wave-based shipping.
2. Protect launch scope from feature creep.

## Risk 2: Cost spikes from uncontrolled model usage

Mitigation:

1. Enforce one-router policy with per-run cost telemetry.
2. Budget alerts and kill switches.

## Risk 3: Trust breaks from incorrect external sends

Mitigation:

1. Approval gates.
2. Audit logging.
3. Safe defaults for outbound actions.

## Risk 4: Integration fragility

Mitigation:

1. Preflight checks.
2. Retries + graceful degradation.
3. Clear user-facing recovery prompts.

## Risk 5: Architectural drift back to over-complexity

Mitigation:

1. Keep one runner.
2. Keep one hybrid tool contract layer (strict internal + normalized external).
3. Reject parallel framework sprawl during v1.

---

## Unresolved Questions

1. Final approval matrix per exact action type.
2. Exact threshold for introducing a second routing profile if one-router cost/quality drifts.
3. Final packaging of pricing vs usage limits.
4. Exact depth of voice output in Wave 1.
5. Scope confirmation for any Phase 2/3 capabilities that may be pulled forward after pilot evidence.
6. Precise criteria and timing for WhatsApp channel launch after web-chat stabilization.
7. Verified retention window and cross-session guarantees for `/agent/toolcalls/{blockId}` artifacts.
8. Platform limits and ordering guarantees for task list size and `list_tasks` output.
9. Memory scope policy at launch: shared across all threads by default vs optional private-thread mode.

---

## Final Direction Summary

Sunder v1 will ship as a **simple, reliable AI operations platform** with:

1. Fast activation.
2. Strong trust controls.
3. Cost-disciplined architecture.
4. A broad service roadmap delivered in practical waves.

This is the path to shipping a real product quickly without repeating framework complexity mistakes.
