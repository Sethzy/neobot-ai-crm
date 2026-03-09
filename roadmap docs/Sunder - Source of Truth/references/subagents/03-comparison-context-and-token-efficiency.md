# Subagent Comparison — Context Management & Token Efficiency

> Cross-reference: [01-claude-code-subagents.md](01-claude-code-subagents.md) and [02-codex-subagents.md](02-codex-subagents.md) for full architecture details on each system.

---

## 1. The Problem: Quadratic Token Growth

Both Claude Code and Codex use stateless APIs — every LLM call ships the **entire conversation history**. Without mitigation, token consumption is quadratic:

```
Turn 1:  [system + user]                                    ~5K input tokens
Turn 2:  [system + user + tool1 + result1]                   ~8K input tokens
Turn 3:  [system + user + t1 + r1 + t2 + r2]                ~11K input tokens
...
Turn N:  [everything accumulated]                            O(N) per turn
Total across N turns:                                        O(N²) tokens billed
```

For a 50-turn session with tool calls averaging 2K tokens each, that's ~2.5M cumulative input tokens — most of which are re-reading old results.

Both systems solve this with two complementary strategies: **context partitioning** (subagents) and **context compression** (compaction).

---

## 2. Context Partitioning via Subagents

### Core Mechanism (Same in Both)

Subagents run in **separate context windows**. The parent's context only grows by the subagent call + its returned summary — not by the subagent's internal work.

```
WITHOUT subagents (inline):
  Parent context: [sys] [user] [glob1] [result: 200 files] [read1] [result: 500 lines]
                  [grep1] [result: 80 matches] [read2] [result: 300 lines] ...
  → ~16K+ tokens added to parent

WITH subagents:
  Parent context: [sys] [user] [agent_call: "explore X"] [agent_result: "summary"]
  → ~1K tokens added to parent

  Subagent context (separate, discarded after): [sys] [prompt] [glob1] [200 files]
                                                [read1] [500 lines] [grep1] [80 matches] ...
  → exists only during subagent execution
```

### Token Math Example

| Scenario | Inline Cost | Subagent Cost | Savings |
|---|---|---|---|
| 8 tool calls × 2K results | 16K tokens in parent | ~1K tokens in parent | 15K tokens |
| 20 tool calls × 3K results | 60K tokens in parent | ~2K tokens in parent | 58K tokens |
| 5 subagents × 8 calls each | 80K tokens in parent | ~5K tokens in parent | 75K tokens |

These savings **compound** — every future parent turn avoids re-reading those tokens.

---

## 3. Communication Model Differences

### Claude Code: Fire-and-Forget (Minimal Parent Cost)

```
Parent context growth per subagent:
  [Agent tool call]   → +1 message (prompt)
  [Agent tool result] → +1 message (final summary)
  Total: exactly 2 messages, always
```

The parent cannot send follow-up messages to a running subagent. The prompt is the **only input channel**. This guarantees minimal, predictable parent context growth.

### Codex: Persistent Threads (Variable Parent Cost)

```
Parent context growth per subagent:
  spawn_agent(...)  → +1 message
  send_input(...)   → +1 message (per call)
  send_input(...)   → +1 message (per call)
  wait(...)         → +1 message (result)
  close_agent(...)  → +1 message
  Total: 2 + N messages (where N = number of follow-up interactions)
```

The richer orchestration model (bidirectional communication, follow-ups, resume) trades **more parent context consumption** for **more flexible control**.

### Implication

If you need to give an agent a complex multi-step task with corrections:
- **Claude Code:** write one very detailed prompt upfront (front-loaded context cost)
- **Codex:** start simple, course-correct with `send_input()` (distributed but higher total cost)

---

## 4. Compaction Strategies

### Claude Code: LLM-Based Summarization

- **Trigger:** ~95% of context window (configurable via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`)
- **Method:** sends full conversation to Claude, receives a compressed summary
- **Result:** old history replaced with LLM-generated summary
- **Quality:** lossy — depends on summarization quality; may lose nuanced details
- **Subagent survival:** subagent transcripts stored in separate JSONL files, **unaffected by parent compaction**

### Codex: API-Level Encrypted Compaction

- **Trigger:** configurable token threshold (tracked per-turn via `TokenUsageInfo`)
- **Method:** sends context to special Responses API compaction endpoint
- **Result:** returns an **opaque "encrypted compaction item"** — server-compressed, not human-readable
- **Quality:** lossless within the API's compression guarantees; the server optimizes what to preserve
- **Persistence:** full state survives via SQLite + JSONL backup (three-layer persistence)

### Key Difference

Claude Code's compaction is **transparent** (you can see the summary) but **lossy** (LLM decides what matters). Codex's compaction is **opaque** (encrypted blob) but potentially **higher fidelity** (server-optimized).

---

## 5. Prompt Caching

### Both Systems

Both use **prefix-match caching** — if the beginning of the prompt is identical to a previous call, the cached prefix is reused and you only pay for the new suffix.

### Claude Code

- Static content (system prompt, CLAUDE.md, tool definitions) at the beginning
- Variable content (conversation history) at the end
- Cache invalidated by: changing tools, model, permissions

### Codex

- Same prefix-caching principle
- **Server-determined ordering** — the API server decides the optimal order of static components to maximize cache hits
- Explicit tracking: `cached_tokens` field in `TokenUsageInfo`
- Cache invalidated by: changing tools, model, sandbox config, approval mode, working directory

### Practical Impact

In a 50-turn session where the system prompt + tools = 4K tokens:
- **Without caching:** 50 × 4K = 200K tokens wasted re-reading static content
- **With caching:** 4K tokens read once, cached on subsequent turns → ~4K total for static content

---

## 6. Output Caps

| System | Cap Type | Limit | Effect |
|---|---|---|---|
| **Claude Code** | Subagent output tokens | 32K tokens (hardcoded) | Forces summarization; prevents context flooding |
| **Codex** | Shell output bytes | 1 MiB per command | Truncates large command outputs |
| **Codex** | Shell output events | 10,000 deltas per command | Caps streaming event count |

Claude Code's cap operates at the **subagent level** (total output), while Codex's caps operate at the **individual tool call level** (per command).

---

## 7. Model Selection for Token Efficiency

### Claude Code

| Subagent | Model | Why |
|---|---|---|
| **Explore** | Haiku (cheapest) | Read-only search — doesn't need expensive reasoning |
| **claude-code-guide** | Haiku | FAQ answering — simple retrieval |
| **Plan** | Inherits (Opus/Sonnet) | Needs reasoning for architectural decisions |
| **general-purpose** | Inherits (Opus/Sonnet) | Needs full capabilities |

**Strategy:** route high-volume, low-complexity work to cheap models. Keep expensive models for decision-making in the parent.

### Codex

- Roles can override model per agent type
- Custom roles specify model in TOML config
- No built-in cheap-model routing — all roles default to the session's model unless overridden

---

## 8. Background Execution and Token Timing

### Claude Code

Background subagents add **zero tokens** to parent context until results are retrieved:

```
Timeline:
  t0: Parent spawns background agent     → +0 tokens in parent
  t1: Parent continues other work        → agent running independently
  t2: Agent completes                    → results stored, not yet in parent
  t3: Parent checks results              → +result tokens in parent (only now)
```

This means you can **defer context cost** — spawn multiple background agents, do other work, then retrieve results only when needed.

### Codex

Same principle — `spawn_agent()` is non-blocking. Parent context only grows when `wait()` retrieves results.

---

## 9. Strategies for Maximum Token Efficiency

### Both Systems

| Strategy | Rationale |
|---|---|
| Push exploratory work to subagents | Keep parent context focused on decisions, not raw data |
| Write detailed upfront prompts | Avoids follow-up interactions that grow parent context |
| Use cheap models for read-only work | Don't pay Opus/GPT-4 prices for file searching |
| Let compaction run | Don't fight it — compaction reclaims context space |
| Parallelize independent research | Multiple subagents run without inflating parent context linearly |

### Claude Code Specific

| Strategy | Rationale |
|---|---|
| Use `Explore` (Haiku) for all codebase search | Cheapest model, read-only tools, minimal parent cost |
| Prefer background agents for independent tasks | Zero context cost until retrieval |
| Single detailed prompt per subagent | Fire-and-forget model rewards upfront investment in prompt quality |
| Limit subagent output to summaries | 32K cap exists but returning less is better |
| Resume instead of re-spawning | Resumed agents keep prior context; re-spawning starts fresh and wastes the prior work |

### Codex Specific

| Strategy | Rationale |
|---|---|
| Minimize `send_input()` calls | Each one adds a message to parent context |
| Avoid frequent model/tool/sandbox changes | Cache-busting resets prefix caching and increases token costs |
| Use `spawn_agents_on_csv` for batch work | Parallelizes without proportional parent context growth |
| Leverage server-side prompt ordering | Don't manually reorder prompt components; let the API optimize for caching |
| Use progressive skill disclosure | Skills load metadata-only until activated, keeping base context lean |

---

## 10. Side-by-Side Summary

| Dimension | Claude Code | Codex |
|---|---|---|
| **Parent cost per subagent** | Exactly 2 messages (fixed) | 2 + N messages (variable) |
| **Communication model** | Unidirectional (prompt → result) | Bidirectional (spawn, send_input, wait, close) |
| **Compaction method** | LLM summarization (transparent, lossy) | API-level encrypted blob (opaque, higher fidelity) |
| **Compaction trigger** | ~95% context window | Configurable token threshold |
| **Prompt caching** | Prefix-match, client-ordered | Prefix-match, server-optimized ordering |
| **Cheap model routing** | Built-in (Explore → Haiku) | Manual (role config overrides) |
| **Output cap** | 32K tokens per subagent (hardcoded) | 1 MiB per shell command |
| **Background deferral** | Yes — zero cost until retrieval | Yes — zero cost until `wait()` |
| **Batch processing** | No equivalent | `spawn_agents_on_csv` (up to 64 concurrent) |
| **Token tracking** | Not exposed in detail | Per-turn input/output/cached/reasoning breakdown |
| **Transcript persistence** | Separate JSONL (survives compaction) | Three-layer: JSONL + SQLite + memory |
| **Subagent nesting** | Flat only (depth = 1, hardcoded) | Configurable `max_depth` (default 1) |

---

## 11. Architectural Takeaway

Both systems use subagents primarily as a **context window management tool**. The core insight is the same: **partition work into separate context windows so the parent only pays for summaries, not raw data**.

The key trade-off is:
- **Claude Code** optimizes for **simplicity and predictability** — fixed 2-message cost, no follow-ups, forced summarization via output cap
- **Codex** optimizes for **flexibility and control** — bidirectional communication, batch processing, configurable depth, but at the cost of potentially higher parent context consumption

For **Sunder's architecture** (runner engine, tool-heavy agent loops), the Claude Code model is most relevant since we use Claude as the underlying model. Key patterns to adopt:
- Route high-volume tool work (CRM searches, file reads, memory lookups) through subagent-like context partitioning
- Use compaction to manage long-running autopilot sessions
- Keep the parent runner context focused on decision-making and user-facing outputs
