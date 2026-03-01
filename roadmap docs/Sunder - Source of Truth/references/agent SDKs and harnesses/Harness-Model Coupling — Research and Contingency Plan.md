# Harness-Model Coupling — Research and Contingency Plan

> **Type:** Reference / Future Contingency
> **Last Updated:** February 21, 2026
> **Status:** Research complete. No action required for V1/V2.

---

## Table of Contents

1. [What This Document Is](#what-this-document-is)
2. [The Harness-Model Coupling Thesis](#the-harness-model-coupling-thesis)
3. [Evidence: OpenAI Codex](#evidence-openai-codex)
4. [Evidence: Anthropic Claude Code](#evidence-anthropic-claude-code)
5. [Important Nuance: Claude vs Codex](#important-nuance-claude-vs-codex)
6. [Harness Patterns Are Transferable](#harness-patterns-are-transferable)
7. [Industry Approaches to Sandbox Agent Architecture](#industry-approaches-to-sandbox-agent-architecture)
8. [When This Becomes Relevant to Sunder](#when-this-becomes-relevant-to-sunder)
9. [The Two-Layer Stack (If Triggered)](#the-two-layer-stack-if-triggered)
10. [Migration Path](#migration-path)
11. [Sources](#sources)

---

## What This Document Is

This is a **research reference and contingency plan**, not an architecture decision.

Sunder V1/V2 workloads (CRM, chat, briefings, document extraction, template-based generation) do not require native agent SDK harnesses. Vercel AI SDK with well-designed tools is the correct choice for current scope.

However, if Sunder's roadmap expands into workloads that involve **autonomous multi-step coding, iterative code-test-fix loops, or long-running sandbox operations**, the harness-model coupling problem becomes real. This doc captures the research so we don't have to redo it later, and defines the trigger conditions for adopting a two-layer architecture.

---

## The Harness-Model Coupling Thesis

The core insight emerging from both Anthropic and OpenAI in early 2026:

> "The model and the harness aren't separate pieces assembled later — they're co-designed. Codex models are trained in the presence of the harness. Tool use, execution loops, compaction, and iterative verification aren't bolted on behaviors — they're part of how the model learns to operate."
>
> — OpenAI, "Harness Engineering" (Feb 2026)

For **software engineering tasks specifically**, the model's performance is tied to:
- The exact tool schemas it was trained against
- The error recovery and retry patterns baked into the harness
- Context management strategies (compaction, progress files, checkpointing)
- The iterative verification loops (run → test → fix → verify)

Swap the harness for a generic tool-calling framework, and the model loses access to these learned behaviors. Performance degrades even though the model weights are identical.

**Scope of this claim:** This applies primarily to **coding and software engineering tasks**. For structured output, Q&A, CRM operations, and template-based generation, the performance gap between native harness and generic tool-calling is minimal to negligible.

---

## Evidence: OpenAI Codex

From "Unlocking the Codex harness: how we built the App Server" (Feb 4, 2026):

- Codex models are **explicitly RL'd against the Codex harness**. The model's tool-use patterns, planning strategies, and error correction are learned in the context of Codex's exact tool schemas and execution model.
- The harness is exposed via a **JSON-RPC App Server** (`codex-rs/core` in Rust). CLI, VS Code, Xcode, and the macOS app all use the identical agent loop.
- OpenAI warns about cross-provider protocols: *"These protocols often converge on the common subset of capabilities, which can make richer interactions harder to represent, especially when provider-specific tool and session semantics matter."*
- The App Server manages: thread lifecycle/persistence, tool execution in sandbox, MCP integration, compaction, and bidirectional streaming. Clients talk to it via stdio JSON-RPC.
- Multiple integration paths exist: App Server (full harness), MCP server mode (reduced capabilities), Codex SDK (TypeScript library), cross-provider protocols (lowest common denominator).

**Key takeaway:** For Codex, the harness coupling is strong and intentional. The model was trained with the harness. Using Codex through a generic framework means losing capabilities the model expects to have.

---

## Evidence: Anthropic Claude Code

From "Effective harnesses for long-running agents" (Feb 2026):

- The Claude Agent SDK provides: compaction (context management across windows), structured progress tracking, initializer/coding agent decomposition.
- Even with the native harness, "a frontier coding model like Opus 4.5 running on the Claude Agent SDK in a loop across multiple context windows will fall short" without proper harness engineering (progress files, incremental work, git checkpoints, browser testing).
- When the Claude Code team shipped a harness bug on Jan 26, 2026, benchmark performance dropped measurably. The model was unchanged. The fix was a harness rollback. Community tracked via marginlab.ai.
- Key harness patterns that improved performance:
  - **Initializer agent**: First session sets up environment (init.sh, progress file, feature list, initial git commit)
  - **Coding agent**: Subsequent sessions make incremental progress, commit to git, update progress file
  - **Feature list in JSON**: Model is less likely to inappropriately modify JSON vs Markdown
  - **Browser testing via Puppeteer MCP**: Dramatically improved feature verification vs unit tests alone

**Key takeaway:** The harness matters enormously for coding tasks, but the specific patterns (progress files, incremental work, git discipline) are *prompt and orchestration patterns*, not locked to the SDK.

---

## Important Nuance: Claude vs Codex

These are **not equivalent** on harness coupling:

| | Codex | Claude |
|---|---|---|
| Model-harness RL training | Explicit — model trained with the harness | Not confirmed — Claude is general-purpose; Claude Code adds a system prompt + tools on top |
| Harness coupling strength | Strong — model expects specific tools | Moderate — model works well with good tools generally |
| Performance outside native harness | Likely significant degradation | Likely moderate degradation for coding, minimal for other tasks |
| Analogy | Federer's racquet (co-evolved) | A great coach with a playbook (transferable skills) |

The OpenAI quotes about "co-designed" and "trained in the presence of the harness" apply directly to **Codex**. Applying them to Claude without qualification is inaccurate. Claude's general-purpose tool-use capabilities transfer across tool schemas better than Codex's specialized ones.

---

## Harness Patterns Are Transferable

The Anthropic article on long-running agents is actually teaching **harness engineering patterns that you can implement in any framework**:

| Pattern | Native SDK | Implementable in Vercel AI SDK? |
|---|---|---|
| Progress files (claude-progress.txt) | Built-in | Yes — add a tool that reads/writes a progress file |
| Feature list in JSON | Prompt pattern | Yes — same prompt pattern works |
| Incremental work (one feature at a time) | Prompt pattern | Yes — system prompt discipline |
| Git checkpointing | Tool | Yes — add git tools |
| Browser testing via Puppeteer | MCP server | Yes — same MCP server works |
| Compaction across context windows | Built-in | Partially — would need custom implementation |
| Initializer/coding agent split | Harness logic | Yes — different system prompts per phase |

The one capability that's hard to replicate outside the native SDK is **compaction** — the automatic context management that lets an agent work across multiple context windows without losing critical state. Everything else is transferable prompt and tool design.

**Implication for Sunder:** Before reaching for the Claude Agent SDK, first try implementing these harness patterns within Vercel AI SDK. You may get 80% of the benefit with 0% of the complexity.

---

## Industry Approaches to Sandbox Agent Architecture

### Vercel: Claude Agent SDK in Vercel Sandbox

Vercel published an official guide (Jan 29, 2026) for running Claude Agent SDK inside Vercel Sandbox:
- Install Claude Code CLI + Anthropic SDK in an ephemeral sandbox
- 4 vCPUs, configurable timeout (up to 5 hours Pro/Enterprise, 45 min Hobby)
- ANTHROPIC_API_KEY passed as environment variable
- First-party supported pattern

### LangChain Deep Agents: Two Sandbox Patterns

LangChain identifies two architectures (Feb 2026):

**Pattern 1 — Agent Inside Sandbox.** Full agent runs in the container. Simple. Risk: API keys inside sandbox.

**Pattern 2 — Sandbox as Tool (Recommended).** Agent runs on your server, delegates code execution to sandbox via API. API keys stay outside. Supports parallel sandboxes.

LangChain recommends Pattern 2 for production. Integrates with Runloop, Daytona, Modal, E2B.

### OpenAI: Codex App Server as Subprocess

Codex exposes its harness via JSON-RPC. External clients launch the App Server as a child process, communicate via stdio. Same pattern — native harness as subprocess, orchestrator talks to it via protocol.

### Community: ai-sdk-provider-claude-code

A community Vercel AI SDK provider that wraps Claude Agent SDK. Lets you call it through Vercel's unified interface. Maturity unknown. Worth tracking.

### Practitioner Consensus (Lighten AI, calv.info, others)

The emerging pattern is: **Vercel AI SDK for the user-facing layer, native agent SDK for backend autonomous work.** This is the two-layer stack.

---

## When This Becomes Relevant to Sunder

### Current V1/V2 workloads — NOT relevant

| Workload | Needs Native Harness? | Why Not |
|---|---|---|
| CRM updates | No | Structured tool calls, no iteration |
| Follow-ups and briefings | No | Text generation, single-pass |
| Document extraction | No | API calls to Gemini + ExtendAI |
| Document generation | No | Template filling, not code generation |
| Web search/enrichment | No | API calls, no sandbox |
| Browser use | No | Browserbase handles execution |
| Chat, Q&A | No | Conversational, no tools needed |

### Trigger conditions — WHEN to adopt the two-layer stack

Adopt the native harness approach **only when** Sunder needs to:

1. **Generate custom code artifacts** — e.g., user asks "build me a landing page" or "create a custom report template" and the system needs to write, run, test, and iterate on code in a sandbox.

2. **Run multi-step code-test-fix loops** — e.g., generating a document processing pipeline that needs to be tested against sample data, errors caught and fixed automatically.

3. **Operate autonomously across multiple context windows** — e.g., a task so large it exceeds a single context window and needs compaction + progress tracking to maintain coherence.

4. **Demonstrate measurable quality gap** — before adopting the two-layer stack, run a concrete A/B test: same task via AI SDK generic tools vs Claude Agent SDK. If the quality difference is <10%, the complexity isn't worth it.

### Leading indicators to watch

- Users requesting custom automation that requires code generation (not template filling)
- Quality complaints on artifact generation tasks specifically
- Tasks failing due to context window limits on complex multi-step operations
- Competitive pressure from products using native agent SDKs for similar workloads

---

## The Two-Layer Stack (If Triggered)

If trigger conditions are met, the architecture would be:

```text
[Vercel AI SDK]  ← routing, streaming, UI, cost optimization
       |
       ├── Simple tasks → Direct API (Gemini Flash / Claude Haiku)
       |
       └── Coding tasks → Claude Agent SDK in Sandbox
                              - Claude Code CLI installed
                              - Anthropic SDK
                              - Native harness (compaction, progress, git)
                              - Ephemeral or persistent depending on task
```

### Key design decisions (to resolve at adoption time)

1. **Sandbox provider**: Vercel Sandbox (ephemeral Firecracker microVMs, on-demand)
2. **IPC design**: How does the control plane communicate with the Agent SDK subprocess? stdio? HTTP? Webhook on completion?
3. **API key management**: Short-lived scoped tokens vs environment variable injection
4. **Cost model**: Sandbox compute + double API calls — must stay within <$20/user/month ceiling
5. **Version pinning**: Both AI SDK and Agent SDK versions must be locked and regression-tested
6. **Startup latency**: Pre-built images vs cold install (~30-60s for npm install in ephemeral sandbox)

### Security considerations (if adopted)

- API keys must be passed into sandbox — use short-lived tokens, don't persist
- Claude Agent SDK can execute arbitrary shell commands — sandbox must enforce filesystem isolation, network restrictions, resource limits, timeout
- Supply chain: pin exact SDK versions, monitor for harness changes (Jan 26 incident)
- Blast radius: sandbox failures stay in sandbox, CRM data accessed only via control plane API

---

## Migration Path

```text
V1 (now)     → Vercel AI SDK only. All tasks via generic tool-calling.
                No native harness needed.

V1.x         → If quality issues appear on specific tasks, implement
                harness PATTERNS (progress files, incremental work, git
                checkpoints) within Vercel AI SDK first. This is the
                cheap test.

V2/V3        → If harness patterns in AI SDK aren't sufficient AND
                trigger conditions are met, introduce Claude Agent SDK
                for specific task types only. Start with one workload,
                measure, then expand.

Future       → If multi-provider coding harness is needed (Claude +
                Codex), evaluate whether the complexity of multiple
                native harnesses is justified by quality differences.
```

**Future note (explicit):** For dedicated coding workloads, Sunder may
offload execution to Claude Code or Codex CLI in a sandboxed path. The
implementation approach is intentionally TBD (for example: subprocess,
App Server/protocol bridge, or managed sandbox worker).

---

## Sources

- Anthropic, "Effective harnesses for long-running agents" (Feb 2026) — https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- OpenAI, "Unlocking the Codex harness: how we built the App Server" (Feb 4, 2026) — https://openai.com/index/unlocking-the-codex-harness/
- Vercel, "Using Vercel Sandbox to run Claude's Agent SDK" (Jan 29, 2026) — https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk
- LangChain, "The two patterns by which agents connect sandboxes" (Feb 10, 2026) — https://blog.langchain.com/the-two-patterns-by-which-agents-connect-sandboxes/
- Cobus Greyling, "LangChain's Approach To Sandboxing" (Feb 12, 2026) — https://cobusgreyling.medium.com/langchains-approach-to-sandboxing-native-isolation-vs-docker-containers-746a60b265c1
- Berto Mill, "Vercel AI SDK vs Claude Agent SDK" (Feb 5, 2026) — https://bertomill.medium.com/vercel-ai-sdk-vs-claude-agent-sdk-which-one-should-you-build-with-a88d2d6a4311
- calv.info, "Coding Agents in Feb 2026" — https://calv.info/agents-feb-2026
- Hacker News, Claude Code benchmarks discussion (Jan 29, 2026) — https://news.ycombinator.com/item?id=46810282
