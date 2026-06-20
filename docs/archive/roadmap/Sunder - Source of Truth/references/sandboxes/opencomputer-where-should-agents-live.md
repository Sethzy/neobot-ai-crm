# Where Should the Agent(s) Live?

> **Source:** https://opencomputer.dev/blog/where-should-agents-live
> **Repo:** https://github.com/diggerhq/opencomputer
> **Authors:** Utpal Nadiger, Mohamed Habib, Igor Zalutski
> **Date:** March 20, 2026

---

## Core Question

Where should the agent process live relative to the sandbox (execution environment) where it actually runs code, touches files, and installs dependencies?

## Three Placement Models

### 1. Agent Outside the Sandbox

Agent lives in its own environment. Every tool call (file read, shell command, install) crosses the sandbox boundary over the network.

- **Pro:** Orchestration logic, credentials, and conversation state stay outside the blast radius.
- **Con:** Every tool call pays a network round-trip penalty. Compounds across dozens of loops.

### 2. Agent Inside the Sandbox

Agent is co-located with the tool/filesystem environment. Tool calls are local — no network hop.

- **Pro:** Fastest. Simplest operationally (one environment to manage).
- **Con:** Compromised agent sits next to the files and tools it uses. Needs zero-trust posture.

### 3. Hybrid Placement

Safe tool calls (file reads/writes) execute locally alongside the agent. Risky tool calls (network installs, privileged system access) route into a separate sandboxed environment.

- **Pro:** Keeps most of the latency benefit without giving everything the same trust boundary.
- **Con:** Most operationally complex. Router logic decides safe vs risky. Misclassification = failure mode.

## Their Recommendation

**Agent inside the sandbox** — usually the fastest and simplest approach. Does not materially change the security posture as long as:
1. The sandbox is strongly isolated
2. Treated as untrusted
3. Durable credentials stay outside it (zero-secret sandbox / short-lived session tokens)

## Latency Breakdown

Four sources of time in the agent loop:
1. **Model network latency** — round-trip to LLM provider
2. **Agent-sandbox hop latency** — only applies when agent is outside
3. **Model runtime** — time the model spends thinking
4. **Tool runtime** — time executing commands, edits, installs

With default assumptions (160ms sandbox boundary, 30 tool calls per task), agent-outside adds ~9.6s of pure boundary-crossing overhead vs agent-inside.

## Security Model

Two layers of isolation regardless of placement:
- **OS sandbox** — constrains the agent process (filesystem allowlists, network domain allowlists, process boundaries)
- **Execution environment** — container or VM boundary around the whole machine

### Credentials Pattern
- Agent holds only a short-lived, session-bound, scoped, revocable token
- All privileged operations route through an auth proxy / control plane
- Provider secrets never enter the sandbox ("zero-secret sandbox")

## Sandbox Lifecycle Patterns

| Pattern | Description | Best For |
|---------|-------------|----------|
| **Ephemeral** | Created per task, destroyed on completion | One-shot tasks |
| **Long-running** | Stays alive across tasks | High-frequency or proactive agents |
| **Hybrid** | Can shut down between bursts, state preserved and reloaded | Best economics for intermittent workloads |
| **Shared container** | Multiple agents share one environment | Tightly coordinated multi-agent systems |

Their recommendation: **Long-lived or hybrid** for most user-facing agent products.

OpenComputer uses a middle path — environments pause/resume on the same host when possible, with external state persistence as fallback.

## Relevance to Sunder

Sunder's current architecture runs the agent (runner) in Vercel Functions, with the sandbox (Vercel Sandbox) as a separate execution environment for code execution tools. This maps to the "agent outside" model. The article argues this is fine for Sunder's use case (background agent, not a code-generation platform like Lovable), but the latency and credential patterns are worth understanding for future sandbox-heavy features.
