You are an expert in Next.js, Vercel AI SDK, and Supabase. Our database is hosted on Supabase. Our serverless functions and frontend deployment are on Vercel.

## Product Context

**Sunder** is a done-for-you AI orchestration SaaS for solo real estate agents in Singapore. The agent runs everyday business work in the background: CRM updates, follow-ups, briefings, inbound handling, and draft communications.

Key product traits:
- User activates in <10 minutes, useful from day 1 via web chat.
- Compounding memory is the primary long-term value driver (SOUL.md, USER.md, MEMORY.md).
- High-risk actions (anything external-facing) require user approval; internal work auto-runs.
- Both desktop and mobile responsiveness required.

## Source of Truth

All product and architecture decisions live in `roadmap docs/Sunder - Source of Truth/`. Start with `00-START-HERE (PM-Friendly).md` for the full read order.

Authority chain (what wins in conflicts):

1. **`roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`** — canonical product spec. Wins on product behavior, architecture, phasing, and scope.
2. **`roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`** — 154 approved decisions across 18 categories. Wins on technical implementation. Referenced by IDs like `FOUND-01`, `LLM-03`, `DATA-06`.
3. **`docs/product/plans/2026-03-01-implementation-phasing-plan.json`** — PR-by-PR execution checklist (48 PRs across 5 phases). Prose version: `docs/product/plans/2026-03-01-implementation-phasing-plan.md`.
4. Everything else in `roadmap docs/` is supporting reference material.

**Before making architectural decisions**, check the App Spec and architecture decisions JSON. If the spec is silent on a behavior, follow Tasklet reference patterns by default (`TASKLET-01`).
## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN | `FOUND-05` |
| State/Data | TanStack Query + TanStack Table + React Hook Form | `FOUND-05` |
| AI SDK | Vercel AI SDK v6 + `@ai-sdk/gateway` | `LLM-02` — all LLM calls go through AI SDK, not direct provider SDKs |
| LLM Gateway | Vercel AI Gateway | `LLM-01` — single gateway for all models |
| Database | Supabase (Postgres + RLS) | `DATA-01` — all tables use RLS with `client_id` |
| File Storage | Supabase Storage (per-client directories) | `DATA-02` |
| Realtime | Supabase Realtime (Postgres changes) | `DATA-07` |
| Auth | Supabase Auth | `DATA-08` |
| Compute | Vercel Functions + Vercel Sandbox | `FOUND-02`, `EXEC-04` |
| Connections | Composio (OAuth integrations) | `CONN-02` |

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
- **Model routing:** 4 tiers (Background → Flash → Pro → Sonnet). Router classifies inbound messages. Background tasks skip router.

## UI and Styling

- Use ShadCN UI for consistent, accessible component design.
- Use Tailwind CSS for styling.
- Implement consistent design and responsive patterns across the app.
- Tables: Always ask the user if they want to use TanStack Table.
- Forms: Use Zod validation and lightweight controlled/uncontrolled React form patterns.

## Testing and Documentation

- Where required, write unit tests for components using Vitest and React Testing Library.
- All code **must** be thoroughly documented using JSDoc-style comments. Assume a junior developer audience. Over-explain complex or non-obvious logic. Optimize comments for IDE IntelliSense.
- Always add a concise line of file-level JSDoc docs at the top of each file when a file represents a clear module or feature.
