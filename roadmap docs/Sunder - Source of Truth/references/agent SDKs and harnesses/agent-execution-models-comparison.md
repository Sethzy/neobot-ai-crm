# Agent Execution Models — Serverless vs Persistent vs Durable Serverless

> Reference article comparing three fundamental execution models for AI agents, with migration paths from Sunder's current Vercel AI SDK architecture.
>
> **Date:** April 3, 2026
> **Context:** Research discussion comparing LangChain Deep Agents, Claude Agent SDK, Vercel Workflow DevKit, and Fintool's Temporal architecture. Captures decision rationale for staying on AI SDK and documents the migration path if we ever need to switch.

---

## Table of Contents

1. [The Three Execution Models](#the-three-execution-models)
2. [Model 1: Serverless (Sunder Today)](#model-1-serverless-sunder-today)
3. [Model 2: Persistent Process (Fintool / Temporal / LangGraph)](#model-2-persistent-process)
4. [Model 3: Durable Serverless (Vercel Workflow DevKit)](#model-3-durable-serverless)
5. [Agent Harness Comparison: Deep Agents vs Claude Agent SDK vs AI SDK](#agent-harness-comparison)
6. [LangChain Product Hierarchy](#langchain-product-hierarchy)
7. [Cost Model Comparison](#cost-model-comparison)
8. [Migration Path: AI SDK → Claude Agent SDK](#migration-path-ai-sdk-to-claude-agent-sdk)
9. [Migration Path: AI SDK → Workflow DevKit (Recommended)](#migration-path-ai-sdk-to-workflow-devkit)
10. [Current Assessment & Decision](#current-assessment--decision)

---

## The Three Execution Models

### Mental Model

| Model | Analogy | How it works |
|---|---|---|
| **Serverless** | Taxi — shows up, drives you, disappears | Function boots, loads context from DB, does work, saves state, dies. Every message = new function. |
| **Persistent process** | Personal driver in the parking lot | Process stays alive between messages. State in memory. No cold starts. Runs for hours/weeks. |
| **Durable serverless** | Taxi with auto-save notebook | Each step is a serverless function. Between steps, state is saved. Crashes resume from last checkpoint. |

---

## Model 1: Serverless (Sunder Today)

**Stack:** Vercel Functions + AI SDK v6 (`streamText` + `maxSteps`)

```
Message arrives
  → Cold start: boot up a new process (~500ms-2s)
  → Load context: read thread history from DB
  → Load memory: read SOUL.md, USER.md from storage
  → Build system prompt (7-layer context assembly)
  → Call the LLM
  → Execute tools
  → Save everything back to DB
  → Process dies
```

**Strengths:**
- $0 idle cost — nothing running = nothing billed
- Zero ops — `git push` deploys, Vercel manages everything
- Auto-scaling — 1 to 1,000 users, no configuration
- Instant deploys — no rolling deploy coordination

**Weaknesses:**
- 300s function timeout — long-running work can't complete
- No crash recovery — function dies mid-run = run lost
- Cold start on every message — context reload each time
- No native pause/resume for human-in-the-loop

**Sunder's workarounds:**
- Thread queue (`thread_queue_records` + `drain_thread_queue` RPC) for concurrency
- Approval system stored in DB, fresh function picks up on user response
- `maxSteps` keeps agent loop within timeout window

---

## Model 2: Persistent Process

**Examples:** Fintool (Temporal on Heroku), LangGraph Platform, Claude Agent SDK on Cloud Run

```
Process is already running, context already loaded

Message arrives
  → Call the LLM (immediately, no cold start)
  → Execute tools
  → Keep going as long as needed
  → Stay alive, wait for next message
```

**Strengths:**
- No cold starts — process already warm
- No timeouts — work can run for hours
- State in memory between messages — no context reload
- Crash recovery (with Temporal/LangGraph) — checkpointing after each step

**Weaknesses:**
- Always-on cost — servers running even when idle (~$100-400/month baseline)
- Ops burden — manage servers, worker pools, health checks, scaling
- Deployment coordination — rolling deploys, in-flight workflow compatibility
- More infrastructure — 5+ services vs 2 (Vercel + Supabase)

### Fintool's Specific Architecture (Reference)

| Component | Technology |
|---|---|
| Durable execution | Temporal (workers on Heroku dynos) |
| File storage | S3 (source of truth) → Lambda sync → Postgres (`fs_files`) |
| User memory | `/private/memories/UserMemories.md` in S3 (≈ Sunder's SOUL.md) |
| Sandbox | E2B (pre-warmed when user starts typing) |
| Streaming | SSE → Redis Stream → API → Frontend |
| Skills | Markdown files in S3 with 3-tier shadowing (private > shared > public) |
| Worker pools | Chat workers (25 concurrent) + Background workers (10 concurrent) |
| Tenant isolation | AWS ABAC (attribute-based access control) — IAM policies scoped to S3 prefixes |
| Reconciliation | `fs-sync` Lambda (real-time) + `fs-reconcile` Lambda (every 3 hours) |

**Key Fintool insight:** "The model is not the product. The skills are the product." Skills are markdown files that encode domain expertise. Non-engineers can create them. No deployment needed.

**Key Temporal insight:** If a Heroku dyno restarts mid-conversation, Temporal automatically retries on another worker. User never knows. Uses heartbeats for cancellation handling.

---

## Model 3: Durable Serverless

**Example:** Vercel Workflow DevKit (beta, April 2026)

```
Step 1: LLM call  → saved ✓  (runs in serverless function, 30s)
Step 2: tool call → saved ✓  (runs in serverless function, 5s)
Step 3: tool call → 💀 crash
  → new function boots → sees steps 1 & 2 done → resumes at step 3
```

**How it works:**
- Split agent into "steps" (each LLM call, each tool call)
- Each step runs in its own serverless function
- Between steps, inputs/outputs are cached in a durable store (Postgres, Redis, file)
- Orchestration layer briefly wakes up to decide "what's next"
- No single function runs for more than a few minutes
- Total workflow can run for hours/days/weeks

**Strengths:**
- $0 idle cost (same as serverless)
- Zero ops (same as serverless, it's still Vercel)
- Crash recovery (same as persistent process)
- `sleep()` — pause for hours/days, zero compute cost
- Webhooks for human-in-the-loop — built-in pause/resume
- Resumable streams — reconnect after disconnect
- Built-in observability (`workflow web` CLI)
- Workflow versioning — upgrade in-flight workflows to new code

**Weaknesses:**
- Beta (as of April 2026)
- Each step still has serverless timeout (300s) — single long-running commands don't fit
- New abstraction to learn (use workflow, use step directives)
- Step boundaries add small overhead

**Key features from the Vercel workshop (Peter Wielander, April 2026):**

- `use workflow` directive marks the orchestration function
- `use step` directive marks each tool/LLM call as a checkpoint
- `DurableAgent` class wraps AI SDK `agent()` with automatic step marking
- `sleep(duration)` suspends workflow for any duration (zero compute while sleeping)
- `webhook()` creates a URL, suspends until someone hits it — perfect for approval flows
- `getWritable()` provides streams accessible from any step in the workflow
- Streams are decoupled from API handlers — client can reconnect anytime
- `workflow web` CLI inspects runs locally or in production
- Workflows are deployment-pinned — new deploys don't affect in-flight workflows
- Upgrade button checks step signature compatibility for in-place migration
- Concurrency controls planned (max N workflows, queue overflow)

**Reference implementation:** [vercel/examples/apps/vibe-coding-platform](https://github.com/vercel/examples/tree/main/apps/vibe-coding-platform) — AI coding agent with 4 tools (createSandbox, getSandboxURL, runCommand, generateFiles). Supports Claude Opus, Sonnet, GPT-5.3, Grok 4.1 via AI Gateway.

---

## Agent Harness Comparison

### Deep Agents vs Claude Agent SDK vs Vercel AI SDK

| Dimension | LangChain Deep Agents | Claude Agent SDK | Vercel AI SDK (current) |
|---|---|---|---|
| **Philosophy** | Structured graph orchestration | Give a smart model a sandbox | Thin model-calling layer, you own the loop |
| **Model support** | Any (model-agnostic) | Claude only | Any (via AI Gateway) |
| **Hosting** | LangGraph Platform (managed) or self-hosted | BYO containers (Cloud Run, Railway, Fly, Vercel Sandbox) | Vercel Functions (serverless) |
| **Filesystem** | Virtual (LangGraph state dict, not real files) | Real (container has actual FS + bash) | None (predefined tools only) |
| **Durability** | Built-in (LangGraph checkpointing) | None built-in (process crash = run lost) | None (add via Workflow DevKit) |
| **Tools** | LangChain tool objects | MCP servers | AI SDK tool objects (factory + closure) |
| **Sandbox** | Optional (only for `execute` tool) | The agent IS the sandbox | Separate (Vercel Sandbox / Sprites / E2B) |
| **Streaming** | Built-in via LangGraph | Custom (HTTP/WebSocket, you build it) | Built-in (`useChat()`, `streamText()`) |
| **Observability** | LangSmith (tightly integrated) | BYO (Langfuse, etc.) | BYO (Langfuse, etc.) |
| **Subagents** | Built-in | Built-in | Manual (you build it) |
| **Planning** | Built-in (todo tool) | Model-driven (Claude decides) | Manual (you build it) |
| **Ops burden** | Low (managed) to medium (self-hosted) | Medium-high (manage containers) | Near zero |
| **Cost at low traffic** | $100-300/month (servers) or free (lite) | ~$0.05/hr per container | Near zero |
| **Frontend integration** | None (SDK/CLI only) | None (you build UI) | `useChat()` hook (free, batteries-included) |

### Core Philosophical Difference

- **Claude Agent SDK** trusts the **model**. "Claude is smart enough to figure things out if you give it the right environment." The harness is thin. The model does the heavy lifting.
- **Deep Agents** trusts the **graph**. "Define the structure, control the flow, checkpoint the state." The harness is thick. The orchestration does the heavy lifting.
- **AI SDK** trusts the **developer**. "Here's a model-calling layer. You build the loop, the tools, the orchestration." Thinnest abstraction.

---

## LangChain Product Hierarchy

LangChain splits their world into three layers (announced 2026):

| Layer | Product | What it does | Trade-off |
|---|---|---|---|
| **Runtime** | LangGraph | Low-level orchestration: state machines, durable execution, persistence, streaming. You define nodes + edges. | Most control, most work |
| **Framework** | LangChain 1.0 | Standardized abstractions: agent loop, tool calling, structured output. Built ON LangGraph. | Balance of convenience + control |
| **Harness** | Deep Agents SDK | Opinionated batteries-included: planning, subagents, virtual FS, token management. Built ON LangChain. | Most convenience, least control |

**Key insight:** They're acknowledging "agent framework" is too vague — there are three distinct jobs (runtime orchestration, developer abstractions, pre-built agent behaviors) and they now have a product for each.

### Deep Agents Technical Details

- **Virtual filesystem**: `read_file`, `write_file`, `edit_file`, `ls`, `glob`, `grep` — all backed by LangGraph state dict (key-value pairs), not real disk. Files persist via LangGraph checkpointing.
- **Planning tool**: "No-op" todo list for context management — structured chain-of-thought.
- **Subagent spawning**: Each subagent gets isolated file namespace + context window.
- **Auto-summarization**: Compresses long conversations automatically.
- **CLI**: Interactive TUI (rich terminal) + headless mode for scripts/CI.
- **No user-facing UI**: Developer tool for building agents, not a product. You build your own frontend.

### LangGraph Platform Hosting

| Tier | Description |
|---|---|
| Self-Hosted Lite | Free up to 1M node executions |
| Cloud SaaS | Managed by LangChain, hosted inside LangSmith |
| BYOC | Runs in your AWS VPC, managed by LangChain |
| Self-Hosted Enterprise | Fully your infra, your ops |

---

## Cost Model Comparison

### The Crossover Point

```
Cost
 │
 │  Persistent ─────────────────────────────
 │             ╱
 │            ╱    Serverless
 │           ╱         ╱
 │          ╱         ╱
 │─────────╱─────────╱──────────────────────
 │ Persistent      ╱
 │ (idle cost)    ╱
 │               ╱
 └──────────────────────────────────────────
   0        1K       10K      100K     messages/month
```

| Traffic level | Serverless | Persistent | Durable Serverless |
|---|---|---|---|
| Low (< 1K msg/day) | **Cheapest** (~$20/mo) | Expensive (~$200-400/mo) | **Cheapest** (~$20/mo) |
| Medium (~5K msg/day) | Roughly equal | Roughly equal | Roughly equal |
| High (> 10K msg/day) | Gets expensive | **Cheapest** (fixed cost) | Gets expensive |

**The real cost is LLM tokens, not infrastructure.** At scale, the model API bill dwarfs the hosting bill regardless of execution model.

### Claude Agent SDK Sandbox Cost

~$0.05/hour per container. If average session is 5 minutes = $0.004 per conversation. At 1,000 conversations/day ≈ $4/day ≈ $120/month. Cheap.

---

## Migration Path: AI SDK → Claude Agent SDK

> **Status:** Documented but NOT recommended (April 2026). See [Decision](#current-assessment--decision).
> **Companion doc:** `references/claude/claude-agent-sdk-saas-deployment-guide.md`

### What Stays the Same

- Supabase (auth, DB, storage, realtime) — unchanged
- Frontend components (message-bubble, tool-call-inline, etc.) — mostly unchanged
- CRM schemas, system prompt content, platform instructions — unchanged
- Langfuse tracing — needs rewiring but same concept

### What Has to Be Rebuilt

| Component | Current | After Migration | Effort |
|---|---|---|---|
| Runner | `run-agent.ts` (streamText + maxSteps) | `claudeCode()` or `agent.run()` | 3-4 days |
| Tools (~30+) | AI SDK tool objects (factory + closure) | MCP servers (stateless, API-level auth) | 7-10 days |
| Streaming protocol | `useChat()`, `createUIMessageStream()`, parts-based | Custom WebSocket/SSE + custom hook | 5-7 days |
| Tool approval flow | Approval parts in stream | Rebuild from scratch | 2 days |
| Stream resumption | Redis + resumable-stream library | Rebuild | 1-2 days |
| Container hosting | N/A (Vercel Functions) | Cloud Run / Railway / Vercel Sandbox | 1-2 days |
| Model routing | AI Gateway (multi-model) | Claude only | Breaking change |
| Testing + edge cases | — | — | 3-5 days |
| **Total** | | | **~3-4 weeks solo** |

### Deployment Patterns (from Anthropic docs)

| Pattern | Description | Sunder Fit |
|---|---|---|
| Ephemeral | New container per task, destroy when done | Most conversations (quick CRM ops) |
| Long-running | Container stays alive, serves many requests | Background agents, autopilot |
| **Hybrid** | Ephemeral but hydrated with history/state on startup | **Best fit** — intermittent user check-ins |
| Single container | Multiple agents in one box | Not relevant |

### Architecture Diagram (If We Switch)

```
Vercel (Next.js frontend + API routes)
    ↓ HTTP/WebSocket
Container Service (Cloud Run / Railway / Vercel Sandbox)
    ↓ runs Claude Agent SDK
    ↓ MCP tools call Supabase directly (scoped by client_id + RLS)
    ↓ streams response back
```

### Key Trade-offs

**What you gain:**
- Real sandbox (filesystem + bash + code execution)
- Agent creativity (can write novel scripts to solve unanticipated problems)
- No function timeout (agent runs as long as needed)
- MCP tools are portable (reusable by external agents)

**What you lose:**
- Multi-model support (locked to Claude)
- `useChat()` convenience (rebuild streaming from scratch)
- Vercel zero-ops DX (now managing containers)
- `compaction_model` flexibility (can't use Gemini Flash Lite for compaction)

---

## Migration Path: AI SDK → Workflow DevKit (Recommended)

> **Status:** Recommended next step when durability is needed. Lower risk, incremental adoption.

### What Changes

| Component | Change | Effort |
|---|---|---|
| `run-agent.ts` | Wrap in `use workflow` directive, use `DurableAgent` | 1-2 days |
| Tool execute functions | Add `use step` to each | 1 day |
| Approval flow | Replace DB-based approval with `await webhook()` | 1-2 days |
| Cron/autopilot | Replace cron scanner with `sleep('1 day')` loops | 1 day |
| Stream resumption | Built-in (replace Redis resumable-stream) | 1 day |
| `next.config.ts` | Add `withWorkflow()` compiler plugin | 10 minutes |
| **Total** | | **~1 week solo** |

### What Stays the Same

- `useChat()` — unchanged
- All tools — unchanged (just add `use step` directive)
- AI Gateway + multi-model — unchanged
- Supabase everything — unchanged
- Frontend components — unchanged
- Langfuse tracing — unchanged

### Architecture (After)

```
User sends message
  → Vercel API route (unchanged)
  → start(codeWorkflow, { messages, ... })
  → Workflow orchestrator dispatches steps:
      Step 1: LLM call (DurableAgent)  → cached ✓
      Step 2: tool call (use step)     → cached ✓
      Step 3: tool call (use step)     → cached ✓
      ...
  → Stream via getWritable() → returned to frontend
  → useChat() consumes stream (unchanged)
```

### Why This Is Better Than Agent SDK Migration

| Dimension | Workflow DevKit | Claude Agent SDK |
|---|---|---|
| Effort | ~1 week | ~3-4 weeks |
| Risk | Low (incremental, everything else unchanged) | High (rebuild streaming, tools, runner) |
| Model lock-in | None (keep multi-model) | Claude only |
| Frontend changes | None | Rebuild useChat, streaming hook |
| Tool changes | Add directive only | Rebuild as MCP servers |
| Ops changes | None (still Vercel) | Container management |
| Durability | Yes (checkpointing) | Yes (persistent process) |
| Sandbox | Add separately if needed | Built-in |

---

## Current Assessment & Decision

**Decision (April 2026): Stay on Vercel AI SDK. Add Workflow DevKit when durability is needed.**

### Why Stay

1. **Product is 80%+ built** — switching SDKs now is rebuilding, not building
2. **Multi-model matters** — Gemini Flash 3 is Tier 1, Claude for Tier 2; Agent SDK locks to Claude
3. **Zero ops** — solo developer, can't afford infrastructure management overhead
4. **Serverless costs** — near-zero at current usage; persistent processes cost $100-400/month idle
5. **`useChat()` is free** — streaming, history, abort, loading, resume — all built-in
6. **PostHog's own advice:** "Don't use innovation points on the harness"
7. **Vercel is closing the gap** — Workflow DevKit gives durability without leaving the ecosystem

### When to Reconsider

| Trigger | Action |
|---|---|
| Function timeouts causing user-facing problems | Add Workflow DevKit (~1 week) |
| Need agent to write/run arbitrary code | Add Vercel Sandbox to current setup |
| Need Temporal-level durability + sandbox | Evaluate Claude Agent SDK migration |
| Claude becomes primary model AND we need sandbox | Claude Agent SDK migration makes sense |
| LangChain ecosystem has compelling features | Evaluate Deep Agents / LangGraph |

### Upgrade Sequence (Most Likely Path)

```
Current: AI SDK + Vercel Functions (serverless, no durability)
    ↓ when timeouts hurt
Step 1: Add Workflow DevKit (durable serverless, ~1 week)
    ↓ when sandbox needed
Step 2: Add Vercel Sandbox for code execution tools
    ↓ if Claude becomes primary AND we need deeper sandbox
Step 3: Evaluate Agent SDK migration (3-4 weeks)
```

---

## Related References

- `references/claude/claude-agent-sdk-saas-deployment-guide.md` — PostHog's Agent SDK architecture, migration path
- `references/claude/claude-agent-sdk-hosting-guide.md` — Official Anthropic hosting docs
- `references/Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md` — Fintool's Temporal + S3 + E2B architecture
- `references/Fintool/jesseprovo-fintool-background-agents-reactive-to-proactive-FULL.md` — Fintool's background agent patterns
- Vercel Workflow DevKit workshop: [YouTube — Peter Wielander, Vercel](https://www.youtube.com/watch?v=kmV-qg4uoNI)
- Vercel Workflow DevKit docs: [use-workflow.dev](https://use-workflow.dev)
- Vibe Coding Platform example: [vercel/examples/apps/vibe-coding-platform](https://github.com/vercel/examples/tree/main/apps/vibe-coding-platform)
- LangChain products overview: [docs.langchain.com/oss/python/concepts/products](https://docs.langchain.com/oss/python/concepts/products)
- Deep Agents repo: [github.com/langchain-ai/deepagents](https://github.com/langchain-ai/deepagents)

---

## Tags

`#execution-model` `#serverless` `#persistent-process` `#durable-serverless` `#vercel-workflow-devkit` `#claude-agent-sdk` `#langchain-deep-agents` `#langgraph` `#temporal` `#fintool` `#migration-path` `#architecture-decision` `#ai-sdk` `#mcp` `#sandbox`

---

**Last Updated:** April 3, 2026
