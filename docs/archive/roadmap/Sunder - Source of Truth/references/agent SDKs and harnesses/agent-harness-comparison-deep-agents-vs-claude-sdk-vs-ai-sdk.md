# Agent Harness Comparison: Deep Agents vs Claude Agent SDK vs Vercel AI SDK

> Reference for evaluating the three main agent SDK/harness options relevant to Sunder. Written April 2026.
>
> **Related docs:**
> - `references/claude/claude-agent-sdk-saas-deployment-guide.md` — PostHog's Claude Agent SDK deployment model
> - `references/claude/claude-agent-sdk-hosting-guide.md` — Anthropic's official hosting guide

---

## The Three Models at a Glance

| | Vercel AI SDK (Sunder today) | Claude Agent SDK | Deep Agents (LangChain) |
|---|---|---|---|
| **One-liner** | Thin streaming SDK, you own the loop | Give Claude a sandbox and get out of the way | Structured orchestration with managed hosting |
| **Philosophy** | You build everything; SDK handles model calls + streaming | Trust the model — it's smart enough if you give it the right environment | Trust the graph — define structure, control flow, checkpoint state |
| **Execution model** | Serverless (Vercel Functions) | Long-running container process | Long-running process (LangGraph Platform or BYO) |
| **Model support** | Any model via AI Gateway | Claude only | Any model (model-agnostic) |
| **Hosting** | Vercel (git push, done) | BYO containers (Cloud Run, Railway, Fly, Modal) | LangGraph Platform (managed) or self-hosted |

---

## Deep Agents (LangChain)

### What It Is

An opinionated agent harness built on LangGraph. Inspired by coding agents (Claude Code), generalized for any domain. Ships with built-in planning, a virtual filesystem, subagent spawning, and auto-summarization.

**GitHub:** `langchain-ai/deepagents`
**Install:** `pip install deepagents`

### How It Works

```
User message
  → LangGraph state machine picks up the message
  → Agent node calls the LLM
  → LLM picks tools (filesystem, planning, subagents, execute, custom)
  → Tool results written to graph state
  → Checkpoint saved to Postgres/SQLite
  → Loop continues until done
  → Response streamed back
```

### Key Architecture Decisions

**Virtual filesystem.** `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep` — but they operate on a file tree stored in **LangGraph state**, not real disk. Files persist via checkpointing (Postgres, SQLite, or in-memory). No container needed for the filesystem.

**Checkpointing / durability.** After every node execution, state is saved. If the process crashes, a new process reads the last checkpoint and resumes. This is the Temporal pattern, built into LangGraph natively.

**Planning tool.** A "todo list" tool the agent uses to decompose work and track progress. It's a no-op structurally (just writes to state), but it gives the agent a way to reason about multi-step tasks.

**Subagent spawning.** The agent can delegate work to child agents with isolated context windows. Each subagent gets its own filesystem namespace.

**Model-agnostic.** Use Claude, GPT, Gemini, Llama — whatever. The harness doesn't care.

### Hosting: LangGraph Platform

Deep Agents returns a compiled LangGraph graph, which means it deploys to LangGraph Platform natively. Four tiers:

| Tier | What it is | Cost |
|---|---|---|
| Self-Hosted Lite | Free, run locally or on your own box | Free (up to 1M node executions) |
| Cloud SaaS | Managed by LangChain, hosted inside LangSmith | Usage-based |
| BYOC | Runs in your AWS VPC, managed by LangChain | Enterprise contract |
| Self-Hosted Enterprise | Fully your infra, your ops | Enterprise contract |

Under the hood: horizontally scalable server with task queues. Not serverless — processes stay alive. But the managed tiers handle scaling and ops for you.

### UX Surface

- **CLI:** Interactive TUI with streaming (think Claude Code for any domain)
- **SDK:** Programmatic Python API
- **Headless mode:** For scripts/CI
- **LangGraph Studio:** Web-based debugger/playground (developer tool, not end-user UI)
- **No built-in chat UI.** You build your own frontend.

### Observability

LangSmith integration is tight — traces, tool calls, state snapshots, time-travel debugging all built-in. You can also use Langfuse or any OpenTelemetry-compatible tool, but LangSmith is the first-class path.

---

## Claude Agent SDK

### What It Is

The engine that powers Claude Code, packaged as an SDK. A persistent process that gives Claude a real shell environment, file operations, and MCP tool access. The agent runs in a sandbox (container) with full code execution capabilities.

### How It Works

```
User message
  → Your API authenticates user, resolves tenant
  → Spawns agent in a container (or reuses existing)
  → Agent gets: system prompt + skills + MCP tools (scoped to tenant)
  → Claude runs in a real environment — actual bash, actual files
  → Agent calls tools, writes scripts, executes code as needed
  → Streams response back via WebSocket/SSE
  → Container stays alive (or is torn down per-request)
```

### Key Architecture Decisions

**Real sandbox.** This is the defining feature. The agent has a real filesystem, real bash shell, can install packages, write and run scripts. Not a virtual abstraction — actual code execution in an isolated container.

**MCP as the tool interface.** Tools are MCP servers. This means your tools work for both the built-in agent AND external MCP clients. PostHog reports 34% of their AI-created dashboards come from MCP integrations (not the chat UI).

**Skills as markdown files.** Identical concept to Fintool's skills — markdown instructions that teach the agent domain workflows. Non-engineers can write them.

**Claude only.** The SDK is Claude Code's engine. It's designed around Claude's capabilities (tool use patterns, extended thinking, etc.). You can't swap in GPT or Gemini.

**No built-in durability.** Unlike LangGraph, there's no automatic checkpointing. If the container crashes mid-run, the run is lost. You'd need to build your own persistence layer or accept the failure mode.

### Hosting: BYO Containers

You host it yourself. The SDK needs a **long-running process** with a persistent shell, so serverless (Vercel Functions, AWS Lambda) doesn't work.

Options (from PostHog's architecture + Anthropic's hosting guide):

| Provider | Model | Notes |
|---|---|---|
| Modal | Serverless containers | PostHog's choice. Scale to zero possible. |
| Google Cloud Run | Serverless containers | Up to 60 min timeout. Closest to Vercel DX. |
| Railway | Git push deploy | Scale to zero. Very simple. |
| Fly.io Machines | Edge containers | Scale to zero. Good latency. |
| Cloudflare Sandboxes | Isolate workers | Cloudflare-native option. |
| Daytona | Dev environments | Purpose-built for agent sandboxes. |
| AWS ECS / Fargate | Managed containers | Full control, more ops. |

**Resource requirements per instance:** 1 GiB RAM, 5 GiB disk, 1 CPU (from Anthropic's docs). This is per-agent-session, not per-user.

### UX Surface

- **SDK:** TypeScript and Python APIs
- **No built-in UI.** You build your own frontend and streaming layer (WebSocket/SSE).
- **CLI:** Claude Code itself is the reference CLI.

### Observability

BYO. Use Langfuse, LangSmith, Braintrust, or any tracing solution. No built-in observability beyond what the SDK logs.

---

## Vercel AI SDK (Sunder's Current Stack)

### What It Is

A thin SDK for calling LLMs, streaming responses, and executing tools. Not an "agent harness" in the same sense — it's a building block. You build the agent loop, tool registry, context assembly, and orchestration yourself.

### How It Works

```
User message
  → Vercel Function boots (cold start possible)
  → Load thread history, memory files, client config from Supabase
  → Build system prompt (7-layer context assembly)
  → streamText() with maxSteps (the agent loop)
  → LLM picks tools → tools execute → loop continues
  → Save results to DB
  → Function dies
```

### Key Architecture Decisions

**Serverless execution.** Functions spin up per-request and die after. No persistent state. Everything is loaded from and saved to the database every time.

**You own the orchestration.** AI SDK gives you `streamText()` and tool definitions. Everything else — the runner loop, tool registry, memory system, queue, context assembly — is your code.

**Multi-model via AI Gateway.** Any model from any provider through a single gateway. Swap models without changing call sites. Currently using Gemini Flash as Tier 1 for cost/speed.

**`useChat()` for streaming.** Built-in React hook that handles streaming, message history, abort, loading states. Zero custom streaming code needed on the frontend.

**No sandbox.** Tools are predefined functions (CRM ops, file I/O, search). The agent can't write and execute arbitrary code.

**No built-in durability.** Functions are stateless. Sunder works around this with a thread queue + drain RPC for message ordering, but there's no crash recovery for in-flight runs.

**Vercel Workflows (new, not yet adopted).** Vercel now offers `DurableAgent` — checkpointing for serverless. Each tool execution becomes a retryable, resumable step. Workflows can pause for minutes or months. This would give Temporal-like durability without leaving the Vercel ecosystem.

### Hosting

Vercel. `git push` and done. Auto-scaling, zero ops, global edge network. $0 idle cost.

### UX Surface

- **`useChat()` hook** — full-featured chat UI streaming out of the box
- **Built-in message protocol** — tool calls, loading states, abort all handled
- **No CLI or studio** — it's a web SDK, not a developer tool

### Observability

BYO. Sunder uses Langfuse for tracing.

---

## Head-to-Head Comparison

### Execution Model

| | Vercel AI SDK | Claude Agent SDK | Deep Agents |
|---|---|---|---|
| Process type | Serverless function (ephemeral) | Long-running container (persistent) | Long-running process (persistent) |
| Cold start | Yes (~500ms-2s) | No (process already running) | No (process already running) |
| Timeout | 300s max (Vercel Functions) | No limit | No limit |
| Crash recovery | None (run lost) | None built-in (run lost) | Built-in checkpointing (resumes from last step) |
| Idle cost | $0 | Server always running ($5-300/month) | Server always running (or managed Platform) |
| Scaling | Automatic (Vercel) | Manual (container scaling) | Manual or managed (LangGraph Platform) |

### Agent Capabilities

| | Vercel AI SDK | Claude Agent SDK | Deep Agents |
|---|---|---|---|
| Code execution | No | Yes (real sandbox with bash) | Optional (only for `execute` tool) |
| Filesystem | Real files in Supabase Storage | Real files in sandbox container | Virtual (LangGraph state) |
| Planning tool | Custom (agent_triggers, tasks) | Via skills/prompting | Built-in (todo list in state) |
| Subagents | Custom (PR 30) | Via MCP or custom | Built-in (isolated context windows) |
| Agent creativity | Limited to predefined tools | High — can write novel scripts | Medium — follows graph structure |
| Human-in-the-loop | Custom (approval gate in DB) | Custom (you build it) | Built-in (`interrupt()` / `Command(resume=...)`) |

### Developer Experience

| | Vercel AI SDK | Claude Agent SDK | Deep Agents |
|---|---|---|---|
| Setup complexity | `npm install ai` + write tools | Container + SDK + MCP servers + sandbox | `pip install deepagents` + configure |
| Deployment | `git push` to Vercel | Configure container service | Deploy to LangGraph Platform or BYO |
| Frontend streaming | `useChat()` — zero custom code | Custom WebSocket/SSE | Custom or LangGraph Studio |
| Observability | BYO (Langfuse) | BYO (Langfuse) | LangSmith (tight integration) |
| Model flexibility | Any model via Gateway | Claude only | Any model |
| Tool interface | AI SDK tool objects (closures) | MCP servers | LangChain tools |
| Learning curve | Low (thin SDK, you know the patterns) | Medium (containers, MCP, sandbox) | High (LangGraph concepts, graph DSL) |

### Cost Model

| | Vercel AI SDK | Claude Agent SDK | Deep Agents |
|---|---|---|---|
| At 10 users | ~$20/month | ~$50-200/month (containers) | ~$100-300/month (Platform or servers) |
| At 10K users | ~$500-1000/month | ~$300-600/month | ~$300-500/month |
| Idle cost | $0 | Depends on scale-to-zero support | Depends on tier |
| Primary cost driver | LLM API calls | LLM API + container compute | LLM API + platform/server |

### Multi-Tenancy

| | Vercel AI SDK | Claude Agent SDK | Deep Agents |
|---|---|---|---|
| Isolation method | `client_id` in closures + RLS | MCP tools scoped to tenant via API auth | Graph state scoped per-session |
| Data separation | Supabase RLS (row-level) | API-level scoping (MCP tools call your API) | State-level (each session is isolated) |
| Filesystem isolation | Per-client Supabase Storage paths | Per-container or ABAC-scoped sandbox | Per-session virtual FS in state |

---

## When Each Makes Sense for Sunder

### Stay with Vercel AI SDK (current) when:
- Agent workloads complete in <60 seconds (most CRM ops, chat, drafts)
- Multi-model flexibility matters (Gemini Flash for cost, Claude for quality)
- Team is small and ops burden must be near zero
- `useChat()` and Vercel DX are valuable (they are)
- **New option:** Adopt Vercel Workflows / `DurableAgent` for durability without leaving Vercel

### Switch to Claude Agent SDK when:
- Sandbox execution becomes core (agent writing custom analysis scripts, building files)
- Claude becomes the primary model (cost/quality tradeoff shifts)
- You want MCP tools as the canonical interface (reusable by external agents)
- You're OK managing container infrastructure (or using Modal/Cloud Run scale-to-zero)

### Switch to Deep Agents when:
- Durability/crash recovery is critical (long multi-step workflows that can't be lost)
- You want managed hosting without managing containers yourself
- Model-agnostic is a hard requirement
- You're already in or willing to adopt the LangChain/LangSmith ecosystem
- Agent work is structured and predictable (graph-based orchestration fits well)

---

## The Convergence Trend

All three are converging:

- **Vercel** added `DurableAgent` (Workflows) — serverless gets durability
- **Claude Agent SDK** is adding more hosting partners and sandbox options — containers get easier
- **LangGraph** added Deep Agents — graphs get agent-harness-level convenience

The differences that will persist:
1. **Real sandbox vs virtual FS** — fundamentally different capability (creative code execution vs structured state)
2. **Model lock-in** — Claude SDK will always be Claude; the others won't
3. **Managed vs BYO** — LangGraph Platform offers managed; Claude SDK likely never will (Anthropic isn't a hosting company)

---

## Sunder's Current Assessment (April 2026)

**Stay with Vercel AI SDK.** The reasons from the Claude Agent SDK guide still hold:

1. No sandbox need — Sunder's tools are predefined CRM/memory/communication ops
2. Multi-model matters — Gemini Flash is cheaper/faster for Tier 1
3. Vercel DX — git push deploy, zero ops, auto-scaling
4. `useChat()` — streaming, message history, abort all built-in
5. PostHog's own advice: "Don't use innovation points on the harness"

**Future trigger for re-evaluation:**
- Vercel Workflows / `DurableAgent` maturity — could solve the durability gap without switching
- If agent workloads grow past function timeouts consistently
- If sandbox execution becomes a product requirement (unlikely for advisory sales CRM)
- If LangGraph Platform pricing becomes compelling vs Vercel Pro

---

**Last Updated:** April 3, 2026
