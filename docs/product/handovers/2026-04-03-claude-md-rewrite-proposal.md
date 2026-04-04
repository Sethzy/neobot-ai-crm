# CLAUDE.md Rewrite Proposal

## What changed

| Section | Before | After |
|---------|--------|-------|
| Product Context | 4-line feature list | **Market** — full positioning thesis with Sequoia framing |
| Source of Truth | 20-line authority chain + Tasklet refs | **2 lines** — v2 plan is the living reference, that's it |
| Architecture Conventions | 5 bullet points buried at the bottom | **Architecture** — elevated to section 2, expanded with harness/loop/traces |
| Key Principles | Mixed into middle of doc | **Own section**, kept verbatim |
| Tech Stack | Table with decision IDs (`FOUND-05`, `CONN-02`) | Same table, IDs stripped |
| 6 small convention sections | Scattered (TS, state, routing, backend, UI, testing) | **Conventions** — single merged section |
| Design system | Referenced `roadmap docs/...design-system.md` | Rule kept inline, file reference dropped |
| Tasklet references | Full section with paths | Removed |
| Decision IDs throughout | `FOUND-01`, `LLM-03`, `DATA-06`, etc. | Removed |

---

## BEFORE (current)

```markdown
You are an expert in Next.js, Vercel AI SDK, and Supabase. Our database is hosted on Supabase. Our serverless functions and frontend deployment are on Vercel.

## Product Context

**Sunder** is a done-for-you AI orchestration SaaS for solo practitioners in advisory sales — real estate agents, insurance advisors, financial planners, and similar client-facing roles. The agent runs everyday business work in the background: CRM updates, follow-ups, briefings, inbound handling, and draft communications.

Key product traits:

- User activates in <10 minutes, useful from day 1 via web chat.
- Compounding memory is the primary long-term value driver (SOUL.md, USER.md, MEMORY.md).
- High-risk actions (anything external-facing) require user approval; internal work auto-runs.
- Both desktop and mobile responsiveness required.

## Source of Truth

All product and architecture decisions live in `roadmap docs/Sunder - Source of Truth/`. Start with `00-START-HERE (PM-Friendly).md` for the full read order.

Authority chain (what wins in conflicts):

1. **`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`** — **THE source of truth for what to build.** PR-by-PR execution checklist (30 PRs across 5 phases, 13 done + 17 to build). Wins on scope, implementation details, and phasing. Supersedes the original 48-PR plan.
2. **`roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`** — full product vision and rationale. Useful for understanding _why_ things exist. Where it conflicts with the v2 plan, **the v2 plan wins** (the App Spec describes the aspirational full product; the v2 plan is the scoped build).
3. **`roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`** — 154 approved decisions across 18 categories. Reference for technical rationale and decision IDs (`FOUND-01`, `LLM-03`, `DATA-06`). Where a decision conflicts with the v2 plan, **the v2 plan wins**.
4. Everything else in `roadmap docs/` (including Tasklet references) is supporting reference material.

**Before making architectural decisions**, check the v2 plan first, then the App Spec and architecture decisions JSON for rationale. If the v2 plan is silent on a behavior, follow Tasklet reference patterns by default (`TASKLET-01`).

### Tasklet Reference Docs

All Tasklet reference material lives in `roadmap docs/Sunder - Source of Truth/references/tasklet/`. **Always use v2 — ignore v1 (deprecated).** The most useful references when building agent features:

- **v2 built-in tool definitions:** `tasklet tools/built-in/v2/` — 31 tool specs covering file I/O, tasks, triggers, connections, messaging, and more. Use these as the canonical reference for how Sunder's tools should behave.
- **v2 system prompt:** `tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` — full production system prompt. Essential reference for context assembly, system-reminder format, and agent persona.
- **Other references** (core architecture, persistence, skills, workflows, etc.) are all useful supporting material — read as needed.

## Tech Stack

| Layer        | Technology                                               | Notes                                                                |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN | `FOUND-05`                                                           |
| State/Data   | TanStack Query + TanStack Table + React Hook Form        | `FOUND-05`                                                           |
| AI SDK       | Vercel AI SDK v6 + `@ai-sdk/gateway`                     | `LLM-02` — all LLM calls go through AI SDK, not direct provider SDKs |
| LLM Gateway  | Vercel AI Gateway                                        | `LLM-01` — single gateway for all models                             |
| Database     | Supabase (Postgres + RLS)                                | `DATA-01` — all tables use RLS with `client_id`                      |
| File Storage | Supabase Storage (per-client directories)                | `DATA-02`                                                            |
| Realtime     | Supabase Realtime (Postgres changes)                     | `DATA-07`                                                            |
| Auth         | Supabase Auth                                            | `DATA-08`                                                            |
| Compute      | Vercel Functions + Vercel Sandbox                        | `FOUND-02`, `EXEC-04`                                                |
| Connections  | Composio (OAuth integrations)                            | `CONN-02`                                                            |

## Key Principles

- In all interactions, give concise, technical responses with accurate TypeScript examples. Be concise.
- Use functional, declarative programming. Avoid classes.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`).
- Use lowercase with dashes for directories (e.g., `components/auth-wizard`).
- **Remember:** We optimize for straightforward, standard and DRY, and readable implementations over clever abstractions. When in doubt, choose the boring solution.
- **You have unlimited time.** Take as long as needed to get it right. All features must work end-to-end through the UI.
- **YAGNI ruthlessly** — Remove unnecessary features from all designs.
- **Verify and Question**. No performative agreement. Technical rigor always. Prefer technical correctness over social comfort.
- **Session Boundaries:** If the user's request isn't directly related to the current context and can be safely started in a fresh session, suggest starting from scratch to avoid context confusion.
- **Commit after each PR.** When executing tasklists from `docs/product/tasks/`, commit all work for a PR before moving to the next one. Use the PR number in the commit message (e.g., `feat(pr11): CRM deals and tasks pages`).

## TypeScript Usage

- Use TypeScript for all code.
- Avoid enums. Use maps instead for better type safety and flexibility.
- Use functional components with TypeScript interfaces.

## State Management and Data Fetching

- Use TanStack Query to handle global state and data fetching. Prefer it over `useEffect`.
- Implement validation using Zod for robust schema validation.

## Routing and Navigation

- Use Next.js App Router with file-based routing under `app/**`.
- Prefer Server Components where possible, and use client-side navigation/state only when necessary.

## Backend and Database

- Use Supabase for backend services, including authentication and database interactions. Always follow Supabase guidelines for security and performance.
- Use Zod schemas to validate data exchanged with the backend. Use the latest version Zod 4.
- All LLM calls use Vercel AI SDK v6 via `@ai-sdk/gateway`. Do not import provider SDKs directly (no `@google/genai`, no `@anthropic-ai/sdk` for runtime calls).

## Architecture Conventions

- **Runner engine:** Single orchestration loop — `load state → build context → call model → execute tools → continue until done → persist run`. Uses AI SDK `streamText()` with `maxSteps`.
- **Memory system:** Per-client files in Supabase Storage (`SOUL.md`, `USER.md`, `MEMORY.md`, `memory/*.md`). Agent reads/writes via `read_file`/`write_file` tools.
- **Safety model:** Two tiers only. Internal work auto-runs. External-facing actions require approval. No per-action granularity in v1.
- **Thread serialization:** One run per thread at a time. DB-backed queue for messages arriving during active runs.
- **Model routing:** Single model (Gemini Flash) for v1. Multi-tier routing deferred.

## UI and Styling

- Use ShadCN UI for consistent, accessible component design.
- Use Tailwind CSS for styling.
- Implement consistent design and responsive patterns across the app.
- Tables: Always ask the user if they want to use TanStack Table.
- Forms: Use Zod validation and lightweight controlled/uncontrolled React form patterns.
- **Design System:** Dashboard uses Flexoki semantic tokens — **never raw Tailwind palette classes** (`bg-amber-500`, `text-green-600`, etc.) in dashboard components. Use Layer 2 tokens (`text-warning`, `bg-success/10`) for states and Layer 3 tokens (`border-l-stage-leads`, `text-filetype-pdf`) for CRM concepts. No `dark:` prefixes on accent colors — CSS cascade handles it. Import class-string maps from `src/lib/ui/color-maps.ts` — don't define inline maps. Full reference: `roadmap docs/Sunder - Source of Truth/ux-and-pm/design-system.md`.

## Testing and Documentation

- Where required, write unit tests for components using Vitest and React Testing Library.
- All code **must** be thoroughly documented using JSDoc-style comments. Assume a junior developer audience. Over-explain complex or non-obvious logic. Optimize comments for IDE IntelliSense.
- Always add a concise line of file-level JSDoc docs at the top of each file when a file represents a clear module or feature.
```

---

## AFTER (proposed)

```markdown
You are an expert in Next.js, Vercel AI SDK, and Supabase. Our database is hosted on Supabase. Our serverless functions and frontend deployment are on Vercel.

## Market

**Sunder** is an autopilot for solo practitioners in advisory sales — real estate agents, insurance advisors, financial planners, and similar client-facing roles.

We don't sell a tool. We sell the work done: CRM updated, follow-up sent, briefing prepared, inbound handled. Every improvement in the underlying model makes Sunder faster and cheaper — it doesn't commoditize us.

Advisory sales sits in the **autopilot quadrant**: high intelligence-to-judgement ratio, work already partially outsourced to VAs and assistants. Sunder is a vendor swap, not a reorg. The practitioner keeps the judgement (which deal to pursue, how to handle a tricky client). Sunder handles the intelligence work (data entry, scheduling, drafting, research).

**Why Sunder wins over time:**

- **Compounding memory is the data moat.** Per-client files (SOUL.md, USER.md, MEMORY.md) accumulate proprietary context with every run. This is not replicable by a better model — it's earned one outcome at a time.
- **The approval gate is the human backstop.** Internal work auto-runs. External-facing actions require user approval. This is the autonomy slider — we dial it up as trust compounds.
- **Model improvements accelerate us.** The harness (runner + tools + context engineering) is the constant. Better models make every run more capable without changing our architecture.

User activates in <10 minutes, useful from day 1 via web chat. Both desktop and mobile.

## Architecture

Sunder is a general agent harness: a looping runner with tools that operates on behalf of the user.

- **Runner engine:** Single orchestration loop — `load state → build context → call model → execute tools → continue until done → persist run`. Uses AI SDK `streamText()` with `maxSteps`. Entry point: `src/lib/runner/run-agent.ts`.
- **Tools:** Factory pattern in `src/lib/runner/tools/`. CRM operations, file I/O, messaging, triggers. Tool response shape: `{ success: true, entity } | { success: false, error }`.
- **Memory system:** Per-client files in Supabase Storage (`SOUL.md`, `USER.md`, `MEMORY.md`, `memory/*.md`). Agent reads/writes via `read_file`/`write_file` tools. This is the compounding data layer.
- **Context assembly:** 7-layer system prompt built in `src/lib/ai/system-prompt.ts`. Includes client profile, CRM state, memory, active tasks, and conversation history.
- **Safety model:** Two tiers. Internal work auto-runs. External-facing actions require approval. No per-action granularity — binary internal/external.
- **Thread serialization:** One run per thread at a time. `thread_queue_records` table + `drain_thread_queue` RPC for messages arriving during active runs.
- **Autopilot:** Cron scanner + `agent_triggers` table + pulse system for scheduled and event-driven runs.
- **Improvement loop:** Langfuse traces instrument every run. Evals score tool-call correctness and safety. The feedback cycle is: run → trace → evaluate → improve context engineering → run again.
- **Tenant isolation:** `clientId` injected into tool closures + RLS double-lock on every table.
- **Model routing:** Gemini Flash 3 as Tier 1 via Vercel AI Gateway. Multi-tier routing available but not yet active.

### Source of Truth

The product has shipped. The living reference for what's built and what remains is:

**`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`** — PR-by-PR execution plan across 5 phases. Updated as we ship. Where the codebase has diverged from the original plan, the v2 JSON reflects the actual state.

Everything in `roadmap docs/` is supporting reference material — useful for understanding historical rationale but not authoritative over the v2 plan or the shipped code.

## Tech Stack

| Layer        | Technology                                               | Notes                                          |
| ------------ | -------------------------------------------------------- | ---------------------------------------------- |
| Frontend     | Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN |                                                |
| State/Data   | TanStack Query + TanStack Table + React Hook Form        |                                                |
| AI SDK       | Vercel AI SDK v6 + `@ai-sdk/gateway`                     | All LLM calls go through AI SDK, not direct provider SDKs |
| LLM Gateway  | Vercel AI Gateway                                        | Single gateway for all models                  |
| Database     | Supabase (Postgres + RLS)                                | All tables use RLS with `client_id`            |
| File Storage | Supabase Storage (per-client directories)                |                                                |
| Realtime     | Supabase Realtime (Postgres changes)                     |                                                |
| Auth         | Supabase Auth                                            |                                                |
| Compute      | Vercel Functions                                         |                                                |
| Connections  | Composio (OAuth integrations)                            |                                                |
| Observability| Langfuse (traces, evals, scoring)                        |                                                |

## Key Principles

- In all interactions, give concise, technical responses with accurate TypeScript examples. Be concise.
- Use functional, declarative programming. Avoid classes.
- Use descriptive variable names with auxiliary verbs (e.g., `isLoading`).
- Use lowercase with dashes for directories (e.g., `components/auth-wizard`).
- **Remember:** We optimize for straightforward, standard and DRY, and readable implementations over clever abstractions. When in doubt, choose the boring solution.
- **You have unlimited time.** Take as long as needed to get it right. All features must work end-to-end through the UI.
- **YAGNI ruthlessly** — Remove unnecessary features from all designs.
- **Verify and Question**. No performative agreement. Technical rigor always. Prefer technical correctness over social comfort.
- **Session Boundaries:** If the user's request isn't directly related to the current context and can be safely started in a fresh session, suggest starting from scratch to avoid context confusion.
- **Commit after each PR.** Use the PR number in the commit message (e.g., `feat(pr11): CRM deals and tasks pages`).

## Conventions

### TypeScript
- Use TypeScript for all code. Avoid enums — use maps instead.
- Use functional components with TypeScript interfaces.

### State Management
- Use TanStack Query for global state and data fetching. Prefer it over `useEffect`.
- Validate with Zod (v4). Use Zod schemas for all data exchanged with the backend.

### Routing
- Next.js App Router with file-based routing under `app/**`.
- Prefer Server Components. Use client-side navigation/state only when necessary.

### Backend and Database
- Use Supabase for backend services, auth, and database interactions.
- All LLM calls use Vercel AI SDK v6 via `@ai-sdk/gateway`. Do not import provider SDKs directly (no `@google/genai`, no `@anthropic-ai/sdk` for runtime calls).

### UI and Styling
- ShadCN UI for components. Tailwind CSS for styling.
- Responsive across desktop and mobile.
- Tables: Always ask the user if they want to use TanStack Table.
- Forms: Zod validation with lightweight controlled/uncontrolled React form patterns.
- **Design system:** Flexoki semantic tokens only — **never raw Tailwind palette classes** (`bg-amber-500`, `text-green-600`, etc.) in dashboard components. Use Layer 2 tokens (`text-warning`, `bg-success/10`) for states and Layer 3 tokens (`border-l-stage-leads`, `text-filetype-pdf`) for CRM concepts. No `dark:` prefixes on accent colors — CSS cascade handles it. Import class-string maps from `src/lib/ui/color-maps.ts`.

### Testing and Documentation
- Unit tests with Vitest and React Testing Library where required.
- All code documented with JSDoc-style comments. Assume a junior developer audience. Over-explain complex or non-obvious logic. Optimize for IDE IntelliSense.
- Add file-level JSDoc at the top of each file when it represents a clear module or feature.
```
