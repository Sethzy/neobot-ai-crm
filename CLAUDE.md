You are an expert in Next.js, Anthropic Managed Agents, Vercel AI SDK, and Supabase. Our database is hosted on Supabase. Our serverless functions and frontend deployment are on Vercel.

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

- **Runner engine:** Anthropic Managed Agents. The agent definition (system prompt, tools, skills) is registered on Anthropic's platform via `scripts/managed-agents/create-agent.ts`. At runtime, a **session** is created per thread, an SSE event stream is opened, and a `user.message` kickoff is sent. The runner consumes the stream, dispatches `agent.custom_tool_use` events to local tool handlers, and posts results back as `user.custom_tool_result`. The agent loop itself (context management, caching, compaction, multi-step) runs on Anthropic's infrastructure. Entry point: `consumeAnthropicSession()` in `src/lib/managed-agents/session-runner.ts`.
- **Tools:** Custom tool declarations in `src/lib/managed-agents/tools/`. Registered on the agent at deploy time. At runtime, `dispatcher.ts` routes `agent.custom_tool_use` events to the matching handler. Tool response shape: `{ success: true, entity } | { success: false, error }`.
- **Memory system:** Per-client files in Supabase Storage (`SOUL.md`, `USER.md`, `MEMORY.md`, `memory/*.md`). Agent reads/writes via `storage_read`/`storage_write` tools. This is the compounding data layer.
- **Context assembly:** System prompt baked into the agent definition at registration time (`create-agent.ts`). Per-run dynamic context (client profile, CRM state, memory) is injected via the kickoff `user.message`, not reassembled in the runner on every request.
- **Safety model:** Two tiers. Internal work auto-runs. External-facing actions require approval via `agent.requires_action` → `user.tool_confirmation` round-trip. No per-action granularity — binary internal/external.
- **Thread serialization:** One run per thread at a time. `thread_queue_records` table + `drain_thread_queue` RPC for messages arriving during active runs.
- **Autopilot:** Cron scanner + `agent_triggers` table + pulse system for scheduled and event-driven runs.
- **Improvement loop:** Langfuse traces instrument every run. Evals score tool-call correctness and safety. The feedback cycle is: run → trace → evaluate → improve context engineering → run again.
- **Tenant isolation:** `clientId` injected into tool closures + RLS double-lock on every table.
- **Model routing:** Main agent model is `claude-sonnet-4-6`, pinned by `ANTHROPIC_AGENT_VERSION`. Gemini models (via Vercel AI Gateway) are used only for cheap helpers: title generation (`google/gemini-3-flash`) and thread compaction (`google/gemini-2.5-flash-lite`).

## Capabilities

What the agent can do today (shipped):

### Agent Tools
- **CRM:** Create, read, update, delete, search, link/unlink across people, companies, deals, tasks. Configurable vocabulary + custom fields. Schema introspection.
- **Files:** Read/write files in per-client Supabase Storage. Multimodal — images, PDFs. Negative line indices. Absolute `/agent/` path convention.
- **Memory:** Read/write SOUL.md, USER.md, MEMORY.md, and `memory/*.md` files. Compounding context across runs.
- **Web search:** Exa-powered search + scrape.
- **Browser automation:** Browse any public site via Browser-Use Cloud. Authenticated browsing with saved profiles for login-gated platforms. Embedded live browser in chat.
- **Connections:** Composio OAuth — Google Drive, Docs, Sheets, and any supported integration. Agent discovers and uses connection tools dynamically.
- **Triggers:** User-created automations via `agent_triggers` table. Cron, webhook, and RSS trigger types.
- **Subagents:** Spawn child agent runs for parallel/delegated work.
- **Sandbox:** Vercel Sandbox ephemeral VMs with bash tool. Excel analysis (Python + LibreOffice), artifact publishing (React + Vite), workflow skills.
- **Ask user question:** Agent can pause and ask the user for clarification.
- **Agent-generated views:** Inline json-render specs — stat metrics, deal/contact cards, task lists, bar/donut/funnel charts. LLM emits JSONL in ```spec fences, frontend renders deterministically.

### Channels
- **Web chat:** Primary interface. Multimodal (image + PDF upload). Streaming responses. Thread rail.
- **Telegram:** Bot with deep-link pairing, InlineKeyboard approvals, outbound delivery.

### Source of Truth

The product has shipped. The living reference for what's built and what remains is:

**`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`** — PR-by-PR execution plan across 5 phases. Updated as we ship. Where the codebase has diverged from the original plan, the v2 JSON reflects the actual state.

Everything in `roadmap docs/` is supporting reference material — useful for understanding historical rationale but not authoritative over the v2 plan or the shipped code.

## Tech Stack

| Layer        | Technology                                               | Notes                                          |
| ------------ | -------------------------------------------------------- | ---------------------------------------------- |
| Frontend     | Next.js 15 (App Router) + React 19 + Tailwind 4 + ShadCN |                                                |
| State/Data   | TanStack Query + TanStack Table + React Hook Form        |                                                |
| Agent Runner | Anthropic Managed Agents (beta) + `@anthropic-ai/sdk`    | Primary agent harness — sessions, SSE event stream, custom tools, skills |
| AI SDK       | Vercel AI SDK v6 + `@ai-sdk/gateway`                     | Chat UI message types + title generation + thread compaction only |
| LLM Gateway  | Vercel AI Gateway                                        | Gemini models only (title + compaction) — not used for main agent |
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
- The agent loop uses `@anthropic-ai/sdk` directly via Managed Agents. Do not replace this with Vercel AI SDK calls.
- Vercel AI SDK (`ai`, `@ai-sdk/gateway`) is used only for title generation, thread compaction, and chat UI message type adapters. Do not use it for agent tool calls or session management.
- Do not import Google/Gemini provider SDKs directly (no `@google/genai`). Gemini calls go through `@ai-sdk/gateway`.

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
