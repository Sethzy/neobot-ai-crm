# Subagent Architecture Comparison: Sunder vs Tasklet vs Claude Code vs Codex

> Research note — March 2026

## The Core Problem

Every tool step in an agentic loop **re-sends the full context** (system prompt + conversation history) as input tokens. If your system prompt is 5K tokens and history is 10K tokens, a 10-step run costs ~195K input tokens (cumulative). Move those 10 steps into a subagent, and the **parent** drops to ~1-2 steps while the **subagent** runs its own steps against a **smaller context** (no thread history).

## Architecture Comparison

| Aspect | **Sunder (Current)** | **Tasklet (Reference)** | **Claude Code** | **Codex** |
|---|---|---|---|---|
| Main loop | `streamText()` / `maxSteps: 9` | Similar agentic loop | Agent loop until no tool calls | Responses API agent loop |
| Subagent call | `generateText()` — sync, blocking | Fresh LLM call | Separate Claude instance, own context | Separate thread per agent |
| Context to subagent | System prompt + memory, **no thread history** | Same | Own context window, task-scoped | Own thread, task-scoped |
| Return to parent | `result.text` only | Text only | Summary to main conversation | Combined results |
| Intermediate outputs | Block storage, stripped from parent | Same | Stay in subagent context | Stay in subagent thread |
| Subagent model | Same (Gemini Flash) | Same model | Can use Haiku (cheaper) | Can use Spark (cheaper) |
| Nesting | **Blocked** | Allowed but rare | Supported (agent teams) | Supported (multi-level) |
| Parallelism | Sequential only | Sequential | **Parallel** agent teams | **Parallel** multi-agent |
| Trigger | LLM decides (tool call) | LLM decides | User or agent | User or agent |
| Large output handling | Block storage (>5KB) | Same | Auto-compaction at ~200K | Per-thread context mgmt |

## Token Cost Math

### Without subagent (10 tool steps, 15K base context)

Each step re-sends everything accumulated so far:

```
Step 1:  15K input
Step 2:  16K input (15K + 1K tool result)
Step 3:  17K input
...
Step 10: 24K input
Total:   ~195K input tokens
```

### With subagent (1 parent step + 10 subagent steps)

Parent context = 15K (system + history). Subagent context = 8K (system only, no history).

```
Parent:   15K × 2 steps       = ~30K input tokens
Subagent: 8K + 9K + ... + 17K = ~125K input tokens
Total:    ~155K input tokens
```

**~20% savings with short history.** With long conversations (50K+ history), the savings are much larger because the subagent's base context (8K) is dramatically smaller than the parent's (58K+).

### Real-world example (50K history)

```
Without subagent: 58K × 10 steps avg  = ~580K+ input tokens
With subagent:    58K × 2 + 8K × 10   = ~196K input tokens
Savings:          ~66%
```

## Key Differences for Sunder

### What we do well
- **Context isolation** — subagent gets full "brain" (system prompt + memory) but zero thread history. Clean separation.
- **Block storage** — large tool outputs persisted externally, parent sees only summary. Prevents context bloat.
- **Aligned with Tasklet** — our implementation matches the reference architecture closely.

### Gaps vs Claude Code / Codex

1. **No parallel subagents** — Both Claude Code and Codex fan out multiple agents simultaneously. We run one at a time. Deliberate v1 simplicity.
2. **No model tiering** — Claude Code uses Haiku for simple subagent tasks, Codex uses Spark. We use Gemini Flash for everything. Easy future win.
3. **No nesting** — Claude/Codex support multi-level hierarchies. We block `run_subagent` from within subagents. Keeps things predictable.
4. **LLM-initiated only** — Claude/Codex let users explicitly spawn agents. In Sunder, only the LLM decides when to delegate.

## Conclusion

Sunder's subagent pattern follows the same core principle as industry leaders: **isolate noisy tool work in a separate, smaller context** to reduce both context pollution and token costs. The token savings are real and scale with conversation length.

Future optimizations (in priority order):
1. **Model tiering** — Use Flash-Lite for subagent tasks (cheapest win, ~5x cost reduction on subagent steps)
2. **Parallel subagents** — Fan-out for independent tasks (e.g., research multiple contacts simultaneously)
3. **Nesting** — Allow subagents to spawn sub-subagents for deeply hierarchical tasks

## Sources

- [Claude Code cost management](https://code.claude.com/docs/en/costs)
- [Claude Agent SDK — How the agent loop works](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Claude Code multi-agent systems guide](https://www.eesel.ai/blog/claude-code-multiple-agent-systems-complete-2026-guide)
- [OpenAI — Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [OpenAI Codex multi-agents](https://developers.openai.com/codex/concepts/multi-agents/)
- [Codex CLI architecture deep dive](https://www.zenml.io/llmops-database/building-production-ready-ai-agents-openai-codex-cli-architecture-and-agent-loop-design)
