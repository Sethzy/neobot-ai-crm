# OpenAI Codex CLI Subagents — Architecture Reference

> Sources: [Multi-agents docs](https://developers.openai.com/codex/multi-agent/), [Security docs](https://developers.openai.com/codex/security), [Agent approvals](https://developers.openai.com/codex/agent-approvals-security), [Unrolling the agent loop (OpenAI blog)](https://openai.com/index/unrolling-the-codex-agent-loop/), [CLI features](https://developers.openai.com/codex/cli/features/), [Advanced config](https://developers.openai.com/codex/config-advanced/), [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md/), [Agents SDK integration](https://developers.openai.com/codex/guides/agents-sdk/), [Agent Skills](https://developers.openai.com/codex/skills/), [Worktrees (Codex App)](https://developers.openai.com/codex/app/worktrees/), [Config reference](https://developers.openai.com/codex/config-reference), [CLI reference](https://developers.openai.com/codex/cli/reference/), [Introducing Codex (OpenAI)](https://openai.com/index/introducing-codex/), [Context management strategies](https://datalakehousehub.com/blog/2026-03-context-management-openai-codex/), [Compaction API](https://developers.openai.com/api/docs/guides/compaction/), [GitHub repo](https://github.com/openai/codex), [Rust rewrite discussion (#1174)](https://github.com/openai/codex/discussions/1174), [Multi-subagent orchestration PR (#3655)](https://github.com/openai/codex/pull/3655), [Agent jobs PR (#10935)](https://github.com/openai/codex/pull/10935), [Sub-agent discussion (#3898)](https://github.com/openai/codex/discussions/3898), [DeepWiki architecture](https://deepwiki.com/openai/codex)

> Source code references below are from the open-source repo: [github.com/openai/codex](https://github.com/openai/codex), local clone at `/Users/sethlim/Documents/codex`.

---

## 1. What Subagents Are

Codex's multi-agent system is an **experimental feature** (enabled via `/experimental`) that spawns specialized agent threads in parallel, collects results, and returns consolidated responses. Unlike Claude Code's fire-and-forget model, Codex agents are **persistent threads** with bidirectional communication.

### Invocation

Agents are spawned via model-initiated tool calls or the `/agent` CLI command:

```
spawn_agent({
  message: "Explore the codebase and find all API routes",
  agent_type: "explorer",           // role-based config
  fork_context: false,               // inherit parent conversation?
  items: [...]                       // optional file/image attachments
})
```

Returns a `ThreadId` for subsequent interactions.

---

## 2. Built-in Agent Roles

| Role | Purpose | Optimization |
|---|---|---|
| **default** | General-purpose fallback | Standard model and sandbox |
| **worker** | Implementation and fixes | Execution-focused |
| **explorer** | Codebase exploration | Read-heavy, optimized for scanning |
| **monitor** | Long-running command/task monitoring | Optimized for waiting/polling |

Each role can override `model`, `sandbox_mode`, and `developer_instructions`.

### Configuration

```toml
# codex.toml
[agents]
max_threads = 6                    # concurrent open threads (default: 6)
max_depth = 1                      # nesting limit (root = depth 0)
job_max_runtime_seconds = 1800     # per-worker timeout (30 min)

[agents.custom_role]
description = "Custom specialist"
config_file = "path/to/config.toml"
model = "gpt-5.3-codex"
sandbox_mode = "read-only"
```

Custom roles take precedence over built-in roles of the same name. Child agents **inherit** any unspecified configuration from the parent session.

---

## 3. Agent Lifecycle & Orchestration

### Available Operations

| Tool | Purpose |
|---|---|
| `spawn_agent(message?, items?, agent_type?, fork_context?)` | Create new agent thread |
| `send_input(id, message/items)` | Send follow-up message to running agent |
| `resume_agent(id)` | Resume paused agent |
| `wait(id?, timeout_ms?)` | Block until agent completes or timeout |
| `close_agent(id)` | Terminate running agent |

> Source: `codex-rs/core/src/tools/handlers/multi_agents.rs`

### Orchestration Flow

```
1. Model requests spawn_agent(message, agent_type)
2. Orchestrator reserves spawn slot via Guards
3. Config layering: base → role overrides → runtime overrides
4. Agent spawned with inherited SessionServices
5. Parent receives ThreadId for reference
6. Spawned agent runs independently
7. Parent can send_input(), wait(), resume(), close_agent()
```

### Status Lifecycle

States: `pending → running → succeeded | failed | interrupted | not_found`

> Source: `codex-rs/core/src/agent/status.rs`

### Depth Limiting

Parent-child relationships tracked via `SessionSource::SubAgent(SubAgentSource::ThreadSpawn)`. Depth incremented on each spawn. Configurable `agent_max_depth` prevents runaway nesting.

> Source: `codex-rs/core/src/agent/control.rs` — `AgentControl` struct, `spawn_agent()` / `spawn_agent_with_options()`

---

## 4. Batch Processing: `spawn_agents_on_csv`

A unique Codex feature — creates **one worker sub-agent per CSV row**:

```
spawn_agents_on_csv({
  csv_path: "data/clients.csv",
  instruction: "Research {company_name} and summarize their tech stack",
  id_column: "company_id",
  output_schema: { ... },
  max_concurrency: 16,              // default 16, max 64
  max_runtime_seconds: 1800         // per-item timeout
})
```

Key behaviors:
- Each worker **must** call `report_agent_job_result` exactly once
- Workers that exit without reporting are marked as failed
- Results exported as CSV with original data plus `job_id`, `item_id`, `status`, `last_error`, `result_json`
- Built-in progress tracking with ETA estimates

> Source: `codex-rs/core/src/tools/handlers/agent_jobs.rs`

---

## 5. Context Management

### Stateless API Design

Every API request ships the **entire conversation history**. No server-side state. This supports Zero Data Retention policies but creates quadratic prompt growth.

```
Turn 1:  [system + prompt]                              → ~5K tokens
Turn 2:  [system + prompt + turn1 + response1]           → ~10K tokens
Turn N:  [everything accumulated]                        → O(N²) total tokens
```

### How Subagents Partition Context

Each agent thread has its own context window:

```
Parent thread context:
  [...history...] [spawn_agent("explore")] [agent_status: spawned, id: abc]
  [...continues working...] [wait(id: abc)] [agent_result: "summary"]

Agent thread "abc" context (separate):
  [system + role config] [initial message from parent]
  [shell: find ...] [result: ...]
  [shell: cat ...] [result: ...]
  [...all intermediate work...]
  [final output] ← returned to parent on wait()
```

Intermediate work stays in the child's context. Parent only sees spawn/result messages.

### Bidirectional Communication Cost

Each interaction with a child adds messages to parent context:

```
spawn_agent(...)  → +1 message in parent
send_input(...)   → +1 message in parent (per call)
wait(...)         → +1 message in parent (result)
close_agent(...)  → +1 message in parent
```

5 `send_input()` calls = 5 extra messages. More communication = more parent context consumed.

### API-Level Compaction

When token usage exceeds threshold, compaction triggers:

1. Full context sent to special Responses API compaction endpoint
2. Returns an **"encrypted compaction item"** — opaque compressed representation
3. Old history replaced with this single item
4. Future turns: `[system + compacted_blob + recent_turns]`

Converts quadratic growth to **roughly linear**.

> Source: `codex-rs/core/src/context_manager/history.rs` — `ContextManager` tracks token usage, triggers compaction

### Prompt Caching

Prompts are structured for **prefix caching**:

```
[STATIC: system instructions + tool definitions + AGENTS.md]  ← cached across turns
[VARIABLE: conversation history + current input]               ← changes each turn
```

Cache hits require **exact prefix matches**. Cache-busting operations:
- Changing available tools
- Switching models
- Changing sandbox configuration
- Changing approval mode
- Changing working directory

The **server** determines component ordering to optimize cache hit rates.

### Token Accounting

Per-turn tracking via `TokenUsageInfo`:

```rust
struct TokenUsageInfo {
    input_tokens: u64,
    output_tokens: u64,
    cached_tokens: u64,     // cache hits
    reasoning_tokens: u64,  // chain-of-thought
}
```

`ContextManager` uses this to decide when compaction is needed. `TurnState` tracks `token_usage_at_turn_start` for per-turn cost calculation.

> Source: `codex-rs/core/src/state/turn.rs`

### Output Buffering

Shell command output capped at **1 MiB** (hard limit) and **10,000 output deltas** per command. Prevents a single command from blowing up context.

> Source: `codex-rs/core/src/exec.rs`

---

## 6. State Persistence

Three persistence layers work together:

### JSONL Rollout Files (`RolloutRecorder`)

Records all operations, events, tool results, and turn markers. Enables session replay and recovery.

### SQLite State Database (`codex-state` crate)

Stores conversation metadata, session indices, and long-term history.

### In-Memory Context (`ContextManager`)

Chronological transcript with token accounting for context window management.

```rust
pub(crate) struct ContextManager {
    items: Vec<ResponseItem>,              // conversation transcript
    token_info: Option<TokenUsageInfo>,     // token tracking
    reference_context_item: Option<TurnContextItem>,  // change detection
}
```

### Session Resume and Fork

- **Resume:** loads `SessionConfiguration` from previous snapshot, restores `ContextManager` from SQLite + JSONL. Preserves conversation, token accounting, git context, enabled apps.
- **Fork:** clones configuration and history up to a user-selected point, starts new independent session.

> Source: `codex-rs/core/src/state/session.rs`

---

## 7. Sandboxing & Isolation

### Platform-Specific Implementations

| Platform | Technology | Source |
|---|---|---|
| **Linux** | Landlock + seccomp (Bubblewrap fallback) | `codex-rs/core/src/landlock.rs`, `codex-linux-sandbox` crate |
| **macOS** | Seatbelt (`/usr/bin/sandbox-exec`) | `codex-rs/core/src/seatbelt.rs` |
| **Windows** | Restricted Token + AppContainer | `codex-rs/core/src/windows_sandbox.rs` |

### Sandbox Modes

| Mode | Filesystem | Network |
|---|---|---|
| **Read-only** | No writes | Blocked |
| **Workspace-write** (default for VCS dirs) | Writes in `$PWD` + `/tmp`; `.git/`, `.agents/`, `.codex/` read-only | Blocked |
| **Danger-full-access** | Unrestricted | Unrestricted |

### Environment Variable Protection

```toml
[shell_environment_policy]
inherit = "none"
exclude = ["AWS_*", "AZURE_*"]
ignore_default_excludes = false   # keeps automatic SECRET/TOKEN/KEY filtering
```

### Shell Snapshot Isolation

At session start, `ShellSnapshot::start_snapshotting()` captures the user's shell environment into `<codex_home>/shell_snapshots/<thread_id>.sh`. Sourced before command execution for reproducibility.

### Sandbox Inheritance

Sub-agents **inherit the parent's sandbox policy**. Interactive approval requests surface from inactive threads with thread-source labeling. Runtime overrides (`/approvals`, flags) reapplied to children.

---

## 8. Permission/Approval Model

### Three Autonomy Levels

| Mode | File Changes | Shell Commands |
|---|---|---|
| **Suggest** (default) | Requires approval | Requires approval |
| **Auto-edit** | Auto-approved | Requires approval |
| **Full-auto** | Auto-approved | Auto-approved (still sandboxed) |

### Approval Caching

```rust
pub(crate) struct ApprovalStore {
    map: HashMap<String, ReviewDecision>,
}
```

Once approved for session, same action auto-approves. Keyed by serialized request hash (command + cwd + tty + permissions).

> Source: `codex-rs/core/src/tools/sandboxing.rs`

### Tool Orchestration Flow

```
1. Approval Stage — check if command requires approval
2. Sandbox Selection — choose appropriate sandbox level
3. Attempt Stage — execute with selected sandbox
4. Retry Logic — on denial, escalate sandbox + re-attempt (no re-approval needed)
```

> Source: `codex-rs/core/src/tools/orchestrator.rs`

### Smart Defaults

- Version-controlled folders → `auto-edit + workspace-write`
- Non-VCS folders → `read-only`
- Protected paths (`.git`, `.agents`, `.codex`) → always read-only

---

## 9. Git Worktree Isolation (Codex App)

In the Codex App (not CLI), worktrees provide filesystem-level isolation:

- Created in `$CODEX_HOME/worktrees` from HEAD of selected branch
- Operate in **detached HEAD** state (no branch namespace pollution)
- ~15 managed worktrees by default (configurable)
- Auto-deletion when threads archived, with snapshots for restoration
- "Handoff" enables thread migration between Local and Worktree checkouts

---

## 10. MCP Server Mode (External Orchestration)

Codex CLI can run as an **MCP server** (`codex mcp-server`), exposing two tools:

| Tool | Purpose |
|---|---|
| `codex()` | Start new session (prompt, approval-policy, sandbox, model, cwd) |
| `codex-reply()` | Continue existing session (prompt + threadId) |

Enables the **OpenAI Agents SDK** to orchestrate Codex as part of multi-agent pipelines:

```
Project Manager Agent
  ├── Designer Agent (via Codex MCP)
  ├── Frontend Agent (via Codex MCP)
  ├── Backend Agent (via Codex MCP)
  └── Tester Agent (via Codex MCP)
```

All traces appear in the OpenAI Traces dashboard.

---

## 11. Agent Skills (Progressive Disclosure)

Skills use a **progressive disclosure** pattern for token efficiency:

1. Initially only metadata (`name`, `description`) is loaded into context
2. Full `SKILL.md` instructions load **only when the agent activates the skill**
3. Keeps context lean while allowing extensibility

---

## 12. Key Source Code Files

| Component | File | Purpose |
|---|---|---|
| Agent control plane | `core/src/agent/control.rs` | Spawning, guards, inter-agent communication |
| Agent roles | `core/src/agent/role.rs` | Role-based config layering |
| Multi-agent tools | `core/src/tools/handlers/multi_agents.rs` | spawn, send_input, wait, close |
| Batch agent jobs | `core/src/tools/handlers/agent_jobs.rs` | CSV-based parallel agent execution |
| Agent status | `core/src/agent/status.rs` | Lifecycle states, depth limiting |
| Main session | `core/src/codex.rs` | Session, turn, event loop |
| API client | `core/src/client.rs` | Model client, streaming, WebSocket |
| macOS sandbox | `core/src/seatbelt.rs` | Seatbelt policy generation |
| Linux sandbox | `core/src/landlock.rs` | Landlock/Bubblewrap wrapper |
| Execution engine | `core/src/exec.rs` | Command execution, timeouts, output buffering |
| Exec policy | `core/src/exec_policy.rs` | Permission rules, approval engine |
| Tool orchestrator | `core/src/tools/orchestrator.rs` | Approve → Sandbox → Execute → Retry |
| Tool router | `core/src/tools/router.rs` | Tool dispatch to handlers |
| Sandbox setup | `core/src/sandboxing/mod.rs` | Platform-agnostic sandbox abstraction |
| Session state | `core/src/state/session.rs` | Persistent session storage |
| Turn state | `core/src/state/turn.rs` | Per-turn pending ops, token tracking |
| Context manager | `core/src/context_manager/history.rs` | Conversation history, token counting |
