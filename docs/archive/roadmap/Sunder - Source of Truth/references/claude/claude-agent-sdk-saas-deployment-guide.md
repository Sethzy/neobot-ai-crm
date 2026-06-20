# Claude Agent SDK — SaaS Deployment at Scale

> Reference for if/when Sunder wants to move from Vercel AI SDK to Claude Agent SDK for the chat agent backend.

## Source

PostHog article (March 2026): "What we wish we knew about building AI agents" — describes their 3-iteration journey from custom harness → single agent loop with 44 tools → Claude Agent SDK + MCP tools + sandbox.

PostHog AI confirmed it runs on Claude Agent SDK with MCP tools (verified in-product).

## Why PostHog Moved to Agent SDK

1. **Sandbox** — agent can write and execute arbitrary SQL/scripts without a dedicated tool for every query type. Their old approach (44 hand-written tools) didn't scale.
2. **MCP as canonical interface** — tools work for both their built-in agent AND their external MCP server (which accounts for 34% of AI-created dashboards).
3. **Agent creativity** — sandbox lets the agent solve problems the team didn't anticipate.

## Key Architectural Difference from Sunder

| | Sunder (current) | PostHog (Agent SDK) |
|---|---|---|
| SDK | Vercel AI SDK v6 (`streamText` + `maxSteps`) | Claude Agent SDK (`agent.run()`) |
| Hosting | Vercel Functions (serverless, max 300s) | Container service (long-running process) |
| Model | Gemini Flash via AI Gateway (multi-model) | Claude only |
| Tools | AI SDK tool objects (factory + closure) | MCP servers |
| Sandbox | None — predefined tools only | Yes — agent writes + runs arbitrary code |
| Frontend | `useChat()` hook (built-in streaming protocol) | Custom (WebSocket/SSE to container) |

## PostHog's Architecture Diagram (From Article)

```
ENTRY POINTS                    SANDBOX (MODAL)                        MCP TOOLS
┌──────────────┐          ┌──────────────────────────┐          ┌─────────────────────────┐
│              │          │                          │          │ Atomic tools auto-       │
│ • PostHog AI │ ──────►  │   CLAUDE AGENT SDK       │ ──────►  │ generated from Django    │
│ • More       │          │                          │          │ API + YAML config        │
│   coming     │  ◄────── │ • Read files, write code,│          │                         │
│   soon ••    │          │   run scripts, use git   │          │ • feature-flag-create    │
│              │          │ • Single agent loop      │          │ • survey-list            │
└──────────────┘          │ • LLM calls via PostHog  │          │ • execute-sql            │
                          │   LLM Gateway            │          │ • cohort-update          │
                          └──────────┬───────────────┘          └─────────────────────────┘
                                     │
                                     │
                                     ▼
                              ┌─────────────────────────┐
                              │ SKILLS                   │
                              │ Manuals that teach       │
                              │ workflows                │
                              │                         │
                              │ • References             │
                              │ • Models                 │
                              │ • Examples               │
                              │ • Script                 │
                              └─────────────────────────┘
```

Key details from the diagram:
- **Sandbox runs on Modal** — they use Modal (Python container platform) for sandboxed execution
- **MCP tools are auto-generated** from their Django API + YAML config (not hand-written)
- **Skills are markdown "manuals"** that teach the agent workflows, containing references, models, examples, and scripts
- **LLM calls go through PostHog's own LLM Gateway** — not direct to Anthropic API
- **Multiple entry points planned** — PostHog AI is the first, more coming

## How It Works (Multi-Tenant SaaS)

```
Browser → API route → Auth (resolve tenant) → Spawn agent in container
                                                    ↓
                                              Claude Agent SDK
                                              - System prompt + skills + context
                                              - MCP tools (scoped to tenant via API auth)
                                              - Sandbox (for arbitrary code execution)
                                                    ↓
                                              MCP tools call back into PostHog's own API
                                              (scoped to user's project_id)
                                                    ↓
                                              Stream response back to browser
```

Multi-tenancy is at the **application layer**, not the SDK. Each request:
1. Authenticates the user, resolves project/tenant
2. Builds tenant-scoped MCP tools (tools can only access that tenant's data)
3. Injects runtime context (current page state, project metadata, memory)
4. Runs agent in a container
5. Streams back via WebSocket or SSE

## Agent SDK Hosting Constraint

Agent SDK is a **long-running process** (persistent shell, file ops, tool execution with state). It cannot run in Vercel Functions (max 300s timeout, stateless).

### Hosting Options (Simplest → Most Complex)

1. **Google Cloud Run** — Serverless containers, scale to zero, up to 60 min timeout. Closest to Vercel DX but for long-running. Best fit for Sunder if we ever switch.
2. **Railway** — Git push deploy for containers. Scale to zero. Very simple.
3. **Render** — Same as Railway, slightly different pricing.
4. **Fly.io Machines** — Scale to zero, CLI deploy, good for latency-sensitive.
5. **AWS ECS / Fargate** — Full control, more operational overhead.
6. **E2B** — Sandbox-as-a-service (for just the code execution part, not the full agent).

### Hybrid Architecture (If We Switch)

Frontend stays on Vercel. Agent backend moves to containers:

```
Vercel (Next.js frontend + API routes)
    ↓ HTTP/WebSocket
Container Service (Cloud Run / Railway)
    ↓ runs Claude Agent SDK
    ↓ MCP tools call Supabase directly (scoped by client_id + RLS)
    ↓ streams response back
```

## Migration Path (If We Ever Do This)

Recommended sequencing:
1. **Extract tools into MCP servers** — useful regardless, makes tools portable between SDKs and usable by external agents
2. **Swap orchestration layer** — replace `run-agent.ts` streamText loop with Agent SDK `agent.run()`
3. **Rebuild streaming** — replace `useChat()` with custom SSE/WebSocket hook
4. **Set up container hosting** — Cloud Run or Railway

Estimated effort: ~2 weeks for a solo dev.

## Why NOT to Switch (Current Assessment, March 2026)

- **No sandbox need** — Sunder's tools are predefined CRM ops, not arbitrary queries
- **Multi-model matters** — Gemini Flash is cheaper/faster for Tier 1; Agent SDK locks to Claude
- **Vercel DX** — `git push` deploy, no infra to manage
- **`useChat()` is free** — streaming, message history, abort, loading states all built-in
- **PostHog's own advice**: "Don't use innovation points on the harness"

## When It WOULD Make Sense to Switch

- If we need sandbox execution (e.g., agent writing custom analysis scripts for clients)
- If we want to expose Sunder tools as MCP servers for external agents anyway
- If Claude becomes our primary model (currently Gemini Flash)
- If Vercel function timeouts become a bottleneck for complex multi-step runs

## PostHog's 5 Lessons (Summary)

1. **Consider MCP server first** — simpler than a full agent, validates demand
2. **Don't over-engineer the harness** — use existing SDKs, don't innovate here
3. **Context is your moat** — product data + user state + structured skills
4. **Observability from day one** — tracing, evals, "traces hour" for manual review
5. **Reliability > capabilities** — users care about consistent performance, not feature count
