# Claude Code Subagents — Architecture Reference

> Sources: [Official docs](https://code.claude.com/docs/en/sub-agents), [SDK subagents](https://platform.claude.com/docs/en/agent-sdk/subagents), [Agent Teams](https://code.claude.com/docs/en/agent-teams), [Skills docs](https://code.claude.com/docs/en/skills), [Common workflows](https://code.claude.com/docs/en/common-workflows), [DEV Community deep-dive](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2), [ClaudeLog mechanics](https://claudelog.com/mechanics/task-agent-tools/), [Async workflows guide](https://claudefa.st/blog/guide/agents/async-workflows), [Git worktree support](https://supergok.com/claude-code-git-worktree-support/), [Best practices (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/), [Skills vs Subagents (DEV)](https://dev.to/nunc/claude-code-skills-vs-subagents-when-to-use-what-4d12), [Dual-agent architecture](https://ai-coding.wiselychen.com/en/anthropic-dual-agent-architecture/), [Master loop architecture (ZenML)](https://www.zenml.io/llmops-database/claude-code-agent-architecture-single-threaded-master-loop-for-autonomous-coding), [Subagents guide (Shipyard)](https://shipyard.build/blog/claude-code-subagents-guide/), [awesome-claude-code-subagents (GitHub)](https://github.com/VoltAgent/awesome-claude-code-subagents)

---

## 1. What Subagents Are

A subagent is a **specialized Claude instance** that runs a focused subtask in its own context window, with its own system prompt, tool allow/deny list, and permission mode. The parent Claude Code session delegates work via the **Agent tool** (renamed from "Task tool" in v2.1.63; the old `Task(...)` references still work as aliases).

### Invocation

```
Agent({
  subagent_type: "Explore",           // which agent to invoke
  prompt: "Find all API routes...",   // detailed instructions (sole input channel)
  description: "Find API routes",     // 3-5 word summary
  run_in_background: false,           // async execution
  model: "claude-haiku-4-5",          // optional model override
  resume: "agent-abc123",             // resume a previous subagent
  isolation: "worktree"               // optional git worktree isolation
})
```

Claude decides when to invoke subagents **automatically** based on task description matching against each subagent's `description` field.

---

## 2. Built-in Subagent Types

| Agent | Model | Tools | Purpose |
|---|---|---|---|
| **Explore** | Haiku (fast, cheap) | Read-only (Glob, Grep, LS, Read) | Codebase search/analysis. Supports thoroughness levels: quick, medium, very thorough |
| **Plan** | Inherits from parent | Read-only (no Edit/Write) | Research agent for plan mode; gathers context before presenting a plan |
| **general-purpose** | Inherits from parent | All tools | Complex multi-step tasks requiring both exploration and modification |
| **Bash** | Inherits from parent | Bash only | Running terminal commands in separate context |
| **statusline-setup** | Sonnet | Specific tools | Configuring the status line |
| **claude-code-guide** | Haiku | Specific tools | Answering questions about Claude Code features |

---

## 3. Custom Subagents

Defined as Markdown files with YAML frontmatter. Loaded from (highest to lowest priority):

1. `--agents` CLI flag (session-only, highest priority)
2. `.claude/agents/` (project scope)
3. `~/.claude/agents/` (user scope)
4. Plugin `agents/` directory (lowest priority)

### Example Custom Agent

```markdown
---
name: code-reviewer
description: Reviews code for quality, patterns, and bugs
model: claude-sonnet-4-6
tools:
  - Read
  - Glob
  - Grep
  - Bash
disallowedTools:
  - Edit
  - Write
memory: project
background: false
---

You are a senior code reviewer. Analyze the provided code for:
- Correctness and edge cases
- Performance issues
- Security vulnerabilities
- Adherence to project conventions
```

### Configurable Fields

- `tools` — allowlist (only these tools available)
- `disallowedTools` — denylist (remove from inherited/specified set)
- `model` — override model
- `memory` — `user | project | local` for persistent memory across sessions
- `background` — default to background execution
- `isolation` — `worktree` for git worktree isolation
- `skills` — pre-load skill content into context at startup
- `mcpServers` — inline MCP server configurations
- Hooks: `PreToolUse`, `PostToolUse`, `Stop`

---

## 4. Context Management

### What Subagents Receive

- Their own system prompt (from frontmatter/markdown body)
- The Agent tool's `prompt` string from the parent
- Project CLAUDE.md files
- Tool definitions (inherited or subset from `tools` field)

### What Subagents Do NOT Receive

- The parent's conversation history
- The parent's tool results
- The parent's system prompt
- Skills (unless explicitly listed in `skills` field)

### How Results Flow Back

The parent receives the subagent's **final message only** — all intermediate tool calls, results, and reasoning stay inside the subagent's separate context window. This is the core mechanism for token efficiency.

```
Parent sees:
  [Agent tool call]  →  [Final summary from subagent]

Parent does NOT see:
  8x Glob calls, 12x Read calls, 3x Grep calls that happened inside the subagent
```

### Transcript Storage

Each subagent's full conversation is stored as a separate JSONL file:

```
~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl
```

These transcripts:
- Persist independently of the main conversation
- **Survive main conversation compaction** (stored separately)
- Enable full resumption via `resume: agentId`
- Auto-cleanup after `cleanupPeriodDays` (default: 30 days)

---

## 5. Token Efficiency Mechanics

### The Quadratic Problem

Without subagents, every tool call result stays in the parent context. Each subsequent LLM call re-reads all previous results:

```
Turn 1:  [system + user]                                    ~5K tokens input
Turn 2:  [system + user + tool1 + result1]                   ~8K tokens input
Turn 3:  [system + user + tool1 + r1 + tool2 + r2]           ~11K tokens input
Turn N:  [everything accumulated]                            O(N) per turn, O(N²) total
```

### How Subagents Fix This

The parent pays for exactly **2 messages** per subagent delegation (the prompt out + the summary back), regardless of internal work:

```
Cost comparison for a codebase exploration (8 tool calls, ~2K tokens each):

Inline:     ~16K tokens added to parent context (8 × 2K)
Subagent:   ~500-1K tokens added (prompt + returned summary)
Savings:    ~15K tokens per delegation

These savings COMPOUND — every future parent turn avoids re-reading those 15K tokens.
```

### Compaction (When Context Fills Anyway)

Auto-compaction triggers at **~95% of context window capacity** (configurable via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`):

1. Takes the full conversation history
2. Sends it to Claude with instructions to compress
3. Replaces old history with a condensed summary
4. Logs `compact_boundary` entries in transcript JSONL showing `preTokens` count
5. Continues with the compressed context

### The 32K Output Cap

Subagents have a **hardcoded 32,000 token output limit** (not configurable via `CLAUDE_CODE_MAX_OUTPUT_TOKENS`). This:
- Prevents runaway subagents from flooding parent context
- Forces subagents to summarize rather than dump raw data
- Acts as a natural compression mechanism

### Background Agents: Zero-Cost Until Retrieved

Background subagents (`run_in_background: true`) add **zero tokens** to the parent context until results are explicitly retrieved. The parent gets only an agent ID and continues working.

---

## 6. Foreground vs Background Execution

### Foreground (Default)

- Blocks the main conversation until the subagent completes
- Permission prompts pass through to user
- Result immediately injected into parent context

### Background

Triggered by: `run_in_background: true`, asking Claude to "run in background", pressing **Ctrl+B** during execution, or setting `background: true` in frontmatter.

Key behaviors:
- **Permission pre-approval:** Before launching, Claude prompts for all tool permissions upfront. Auto-denied if not pre-approved.
- `AskUserQuestion` tool calls fail silently (subagent continues without human input)
- Up to **~7 subagents** can run simultaneously
- Async notifications (v2.0.64+): background agents can send messages to wake up the main agent
- Disable with `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`

If a background subagent fails due to missing permissions, you can **resume it in foreground** to retry with interactive prompts.

---

## 7. Resume/Continuation

1. When a subagent completes, Claude receives its **agent ID** in the Agent tool result
2. The `resume` parameter accepts this ID
3. Resumed subagents **retain their full conversation history** — all previous tool calls, results, and reasoning
4. Picks up exactly where it stopped (not a fresh start)

**Programmatic resumption (SDK):**
1. Capture `session_id` from messages during first query
2. Extract `agentId` from Agent tool result content
3. Pass `resume: sessionId` in second query's options

---

## 8. Isolation Modes

### Context Isolation (Default)

Every subagent runs in its own fresh context window. No shared memory with parent or siblings.

### Worktree Isolation

`isolation: worktree` gives the subagent its own **git worktree** — a separate working directory with its own branch that shares repository history.

- Worktrees created at `.claude/worktrees/{name}/`
- All worktrees share the same `.git` history and remote
- **Automatic cleanup:** no-change worktrees removed when subagent finishes; changed worktrees prompt for keep-or-remove
- Non-git VCS supported via `WorktreeCreate` and `WorktreeRemove` hooks

### CLI-Level Worktree

`claude --worktree [name]` starts an entire session in its own worktree. Combinable with `--tmux` for background terminal sessions.

---

## 9. Permission Model

### Tool Access Control

- **Default:** subagents inherit all tools from parent (including MCP tools)
- **Allowlist:** `tools` field restricts to only named tools
- **Denylist:** `disallowedTools` removes specific tools

### Permission Modes

| Mode | Behavior |
|---|---|
| `default` | Standard permission checking with prompts |
| `acceptEdits` | Auto-accept file edits |
| `dontAsk` | Auto-deny permission prompts (explicitly allowed tools still work) |
| `bypassPermissions` | Skip ALL checks — **cascades to all subagents, cannot be overridden** |
| `plan` | Read-only exploration mode |

### Disabling Specific Subagents

```json
{ "permissions": { "deny": ["Agent(Explore)", "Agent(my-custom-agent)"] } }
```

---

## 10. Agent Teams (Experimental — Distinct from Subagents)

Multiple independent Claude sessions coordinate **peer-to-peer** (not parent-child):
- Teammates message each other directly
- Claim tasks from shared task lists
- Each gets its own worktree
- No hierarchy — flat coordination model

This is architecturally different from subagents, which always report back to a single parent.

---

## 11. Limitations

- **No nested spawning:** subagents cannot spawn sub-subagents (flat, single depth)
- **32K token output limit** (hardcoded)
- **No parent context:** subagents start fresh — they don't see parent's conversation
- **Prompt is the only input channel:** no follow-up messages, no bidirectional communication
- **Context consumption:** subagent results still consume parent context tokens when returned
- **Windows:** very long prompts may fail due to 8191-character command line limits

---

## 12. Hooks System

### Subagent-Scoped Hooks (in frontmatter)

```yaml
hooks:
  PreToolUse:
    - matcher: Bash
      command: "validate-sql-readonly.sh"
  PostToolUse:
    - matcher: "*"
      command: "log-tool-use.sh"
  Stop:
    - command: "cleanup.sh"
```

### Project-Level Subagent Hooks (in settings.json)

`SubagentStart` and `SubagentStop` events with matcher support for specific agent types.

---

## 13. Persistent Memory

When `memory: user|project|local` is set in frontmatter:

- A persistent directory is created (e.g., `~/.claude/agent-memory/<name>/` for user scope)
- First 200 lines of `MEMORY.md` auto-injected into subagent's system prompt
- Subagent can read/write to its memory directory
- Read, Write, and Edit tools auto-enabled for memory management
- Memory persists across sessions — the subagent "learns" over time
