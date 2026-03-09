# Analysis: Tasklet Already Does This (And Goes Further)

**Context:** Vercel's blog post ([verbatim](./00-agents-md-outperforms-skills-verbatim.md)) found that passive context in `AGENTS.md` (100% pass rate) crushed active skill retrieval (53-79%) for teaching agents framework knowledge. The three winning factors: no decision point, consistent availability, no ordering issues.

Tasklet's architecture independently converged on the same pattern — but applied it to a much harder problem (runtime agent orchestration, not just code generation).

---

## 1. System-Reminder = Tasklet's AGENTS.md

Vercel's insight: embed a compressed docs index in `AGENTS.md` so the agent always has it, eliminating the "should I look this up?" decision.

Tasklet does exactly this with `<system-reminder>` — a block injected into every turn containing:

```xml
<system-reminder>
Current time: Thu, 26 Feb 2026 15:56 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Current intelligence level: genius
- Active triggers: 0
- Open tasks: 0
- DB tables: 1

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this skill file...
</system-reminder>
```

This is the same "passive context beats active retrieval" principle, applied to runtime state instead of framework docs. The agent never has to call a tool to know what time it is, what connections exist, or how many tasks are open. It's just *there*.

**Parallel to Vercel's findings:**
- Vercel: Agent doesn't reliably invoke the Next.js docs skill (56% failure to trigger)
- Tasklet: Agent would similarly fail to reliably call `get_agent_state()` before every action — so the platform just injects it

---

## 2. Skills as Read-on-Demand Files (Not Invocable Tools)

Vercel found that the winning `AGENTS.md` pattern uses a **compressed index** that points to files the agent can `read` when needed:

```
[Next.js Docs Index]|root: ./.next-docs
|01-app/01-getting-started:{01-installation.mdx,...}
```

Tasklet's skill system works identically. Skills are NOT tool invocations — they're plain markdown files at `/agent/skills/` that the agent reads with `read_file`:

```
/agent/skills/
├── system/                      # How to use built-in platform features
│   └── {name}/SKILL.md
└── connections/                 # Skills for activated connections
    └── {id}/SKILL.md
```

The system-reminder tells the agent *which skills exist* (passive index), and the agent reads the specific `SKILL.md` when it needs the details. This is the exact two-tier architecture Vercel converged on: compressed index in system prompt → full docs on filesystem → agent reads on demand.

**Key difference:** Tasklet goes further by making skill reads *mandatory* via system-reminder instructions:
```
You MUST read this skill file before using the tools for this connection: /agent/skills/connections/conn_xxx/SKILL.md
```

This addresses Vercel's "fragile wording" problem head-on. Instead of hoping the agent decides to consult docs, Tasklet makes it a hard rule in the passive context.

---

## 3. The Three Vercel Factors in Tasklet

| Vercel's Factor | How Tasklet Implements It |
|---|---|
| **No decision point** | System-reminder is auto-injected every turn. Agent never decides "should I check my state?" — it's already in context. |
| **Consistent availability** | System-reminder is assembled server-side before every model call. Not optional, not invocable, just present. |
| **No ordering issues** | State summary comes *before* the user's message in context. No sequencing decision about "explore first vs. read docs first." |

---

## 4. Where Tasklet Goes Beyond AGENTS.md

Vercel's `AGENTS.md` is static — a compressed docs index that doesn't change between turns. Tasklet's system-reminder is **dynamic passive context**:

- **State changes between turns.** If the agent creates a trigger, the next system-reminder shows `Active triggers: 1`. If a new connection is added, it appears in the connections list.
- **Scoped to runtime, not just knowledge.** The system-reminder carries operational state (time, tasks, connections, triggers), not just "here's how to use the framework."
- **Bidirectional.** The `AGENTS.md` pattern is write-once-read-many (humans write it, agent reads it). Tasklet's system-reminder reflects the agent's own actions back to it — the agent changes state via tools, and the platform reflects that state back passively.

This is a harder problem than framework docs. Framework docs are stable across a session. Agent runtime state changes on every tool call.

---

## 5. Context Compression Parallel

Vercel compressed 40KB → 8KB (80% reduction) using pipe-delimited format.

Tasklet solves the same problem differently:
- **System-reminder is already compressed** — it's a structured summary, not raw data. Connection info is just `conn_id: N of M tools activated`, not full API schemas.
- **`<context-removed>` tags** — when conversation grows long, Tasklet truncates old tool results and replaces them with block references. The agent can `read_file("/agent/blocks/{blockId}/result")` to recover them.
- **Subagent isolation** — heavy processing happens in subagents whose full execution trace never enters the parent's context. Only the final response comes back.

All three are responses to the same constraint Vercel identified: passive context is powerful, but you have to manage its size.

---

## 6. Implications for Sunder

Our system prompt + system-reminder architecture (being built in Phase 2) should follow these patterns:

1. **System-reminder = dynamic passive context.** Inject agent state (time, active triggers, open tasks, connection summary, memory file index) into every model call. Don't make the agent call a tool to learn its own state.
2. **Skill files = on-demand deep knowledge.** Keep connection-specific instructions, complex tool usage guides, and domain knowledge as readable files. Reference them from the system-reminder.
3. **Mandatory read directives.** When the system-reminder references a skill file, use strong language: "You MUST read this file before using these tools."
4. **Compress the index, not the knowledge.** The system-reminder should be a compressed summary pointing to full docs the agent can read. Don't try to stuff everything into the prompt.
5. **Design for retrieval.** Structure our knowledge files (SOUL.md, USER.md, MEMORY.md, skill files) so the agent can find and read specific sections rather than needing everything upfront.

This is already the direction our architecture is heading — the Vercel research validates it empirically.
