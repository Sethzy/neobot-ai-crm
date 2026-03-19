# Viktor System Prompt & Context Assembly

Source: Direct Q&A with Viktor instance (2026-03-16)

## System Prompt Contents

Viktor's system prompt covers:

1. **Identity & philosophy** — who Viktor is, that it works by programming
2. **Skills system** — how SKILL.md files work as persistent memory
3. **Work approach** — investigate deeply, script everything, quality-check
4. **Slack rules** — Slack is Viktor's only voice, humans can't see internal reasoning
5. **Operating rules** — parallelize, use relative paths, log actions
6. **Available skills catalog** — every skill's name + description (18 currently), so Viktor knows what it knows without reading every file
7. **Structured output** — when to use AI parsing vs doing it directly

### What's NOT in the system prompt:
- Conversation history
- Workspace file listings
- Integration-specific docs

These are loaded **dynamically** via tool calls.

## Context Assembly Per Thread

Each thread gets assembled roughly as:

```
[system prompt]              — static, ~same every run
[thread metadata]            — path, trigger type, active threads
[slack message]              — what user just said
[recent conversation log]    — last few messages from DM log file
[active thread summaries]    — other running threads (for routing)
[instructions]               — routing logic (e.g., forward to original thread)
```

Then Viktor **dynamically loads more context** by:
- Reading skill files
- Grepping Slack logs
- Checking integrations

**"The system prompt is the skeleton; my tool calls flesh it out."**

## Context Compaction

Viktor's honest answer: "I don't have visibility into whether the platform does compaction/summarization above me."

From Viktor's perspective:
- In a long thread, earlier messages are there until they're not
- Starting a **new thread for a new topic** is the recommended strategy
- Long threads accumulate tokens and cost more credits regardless of compaction

## Comparison to Tasklet Context Assembly

| Layer | Tasklet | Viktor |
|---|---|---|
| Static prompt | Personality, filesystem layout, blocks system, skills directory, SQL patterns, subagent lifecycle, sandbox behavior | Identity, skills system, work approach, Slack rules, operating rules, skills catalog |
| Dynamic injection | System-reminder blocks, triggered context | Thread metadata, active thread summaries, routing instructions |
| Loaded on demand | Skill files, connection skills | Skill files, Slack logs, integration docs |
| Conversation history | SQL blocks (opaque, system-managed) | Recent conversation log (from DM log file on disk) |
| Compaction | Unknown (platform-managed) | Unknown (platform-managed) |

## Comparison to Sunder Context Assembly

| Layer | Sunder | Viktor |
|---|---|---|
| System prompt | 7-layer assembly (`assembleContext()`) | Static prompt + skill catalog |
| CRM context | CRM config, schemas, field definitions | None (loads via integration tools) |
| Memory context | SOUL.md, USER.md injected into prompt | Skills loaded on demand via file reads |
| Thread history | Full message replay from Supabase | Recent messages from DM log file |
| Compaction | None currently | Unknown |
| Dynamic loading | Minimal — most context pre-assembled | Heavy — skill files, Slack grep, integration checks |

## Key Architectural Difference

**Sunder: Front-load context into the system prompt.**
The 7-layer context assembly gives the agent everything it needs upfront. This is expensive in tokens but means fewer tool calls.

**Viktor: Lazy-load context via tool calls.**
The system prompt is a skeleton with a "table of contents" (skill names). Viktor reads files and greps logs to fill in context on demand. This is cheaper per run but means more tool calls and potential for missed context.

Both are valid. The tradeoff is token cost vs tool call cost and latency.
