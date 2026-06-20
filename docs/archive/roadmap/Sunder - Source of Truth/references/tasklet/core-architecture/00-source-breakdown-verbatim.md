# Tasklet Architecture - Complete Breakdown (Verbatim Capture)

Captured from user-provided reverse-engineering notes. This preserves the original structure and wording as closely as possible.

---

Tasklet Architecture: Complete Breakdown

1. Core Runtime Model

```text
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                        │
│                   (Tasklet's backend service)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Responsibilities:                                              │
│    • Manages user accounts, billing, quotas                     │
│    • Stores connections (OAuth tokens, API keys)                │
│    • Stores trigger definitions                                 │
│    • Routes trigger even  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LLM INSTANCE                            │
│                    (Stateless, per-invocation)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Receives:                                                      │
│    • System prompt (static, ~4K tokens)                         │
│  Has NO:                                                        │
│    • Memory between sessions                                    │
│    • Direct network access                                      │
│    • Direct filesystem access                                   │
│    • Knowledge of previous conversations                        │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          SANDBOX                                │
│                                                                 │
│  Executes:                                                      │
│    • Python scripts                                             │
│    • Shell commands via tool invocation (run_command)           │
│    • Python 3.12 + uv for packages                              │
│    • Preinstalled tools (ffmpeg, imagemagick, pandoc, etc.)     │
│    • Network access (can curl, but shouldn't for APIs)          │
│                                                                 │
│  Filesystem:                                                    │
│    • /agent/home/ — persistent (FUSE-mounted cloud storage)     │
│    • /agent/subagents/ — persistent (subagent markdown files)   │
│    • /agent/uploads/ — read-only (user uploads)                 │
│    • /agent/skills/ — read-only (system instructions)           │
│    • /agent/toolcalls/ — read-only (historical tool data)       │
│    • /tmp/ — ephemeral (fast, lost after session)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

2. State Surfaces

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTEM-MANAGED (Opaque)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONNECTIONS                                                    │
│    • OAuth tokens, API keys, credentials                        │
│    • Agent can query metadata, cannot read raw secrets          │
│    • Tools: list_users_connections, create_new_connections      │
│    • Lifetime: until user disconnects                           │
│                                                                 │
│  TRIGGERS                                                       │
│    • Schedule definitions, webhook URLs, event subscriptions    │
│    • Agent can create/delete, cannot modify internals           │
│                                                                 │
│  CONTACT METHODS                                                │
│    • Verified email addresses, phone numbers                    │
│    • Tools: list_contact_methods, add_contact_method            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    AGENT-MANAGED (Transparent)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FILESYSTEM (/agent/home/)                                      │
│    • Arbitrary files: scripts, configs, reports, data           │
│    • Agent has full read/write                                  │
│    • Good for: large data, documents, code, templates           │
│    • Tools: read_file, write_file                               │
│                                                                 │
│  SUBAGENTS (/agent/subagents/)                                  │
│    • Markdown files with instructions                           │
│    • Agent creates/edits/deletes                                │
│    • Executed via run_subagent                                  │
│                                                                 │
│  TASKS                                                          │
│    • In-memory task list (visible to user)                      │
│    • Tools: manage_tasks, list_tasks                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

3. Tool System

```text
┌─────────────────────────────────────────────────────────────────┐
│                        TOOL CATEGORIES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BUILT-IN (Always available)                                    │
│  ├── Filesystem: read_file, write_file                          │
│  ├── Sandbox: run_coage_active_*  │
│  ├── Connections: list_users_connections, create_new_*, etc.    │
│  └── UI: show_user_preview, close_user_preview, rename_chat     │
│                                                                 │
│  CONNECTION TOOLS (Activated per-connection)                    │
│  ├── Prefixed with connection ID: conn_abc__send_email          │
│  ├── User must approve activation                               │
│  ├── Examples: Gmail send, Google Calendar read, Slack post     │
│  └── Defined by integration or MCP server                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Tool Execution Flow:

```text
  LLM outputs:            Orchestration:           Result:
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ {            │        │              │        │              │
  │  "tool":    │  ----> │  Executes    │  ----> │  JSON result │
  │   "read_file",│      │  Sandboxes   │        │  to LLM      │
  │  "params":   │        │              │        │              │
  │    {...}     │        │              │        │              │
  │ }            │        │              │        │              │
  └──────────────┘        └──────────────┘        └──────────────┘
```

4. Execution Modes

```text
┌─────────────────────────────────────────────────────────────────┐
│                    MODE 1: INTERACTIVE CHAT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User message -> LLM -> tools -> LLM -> response               │
│  • LLM continues until done                                     │
│  • User sees response, can continue conversation                │
│                                                                 │
│  Context accumulates within session                             │
│  Session ends -> context lost (except persisted artifacts)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   MODE 2: TRIGGER EXECUTION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Event -> Fresh LLM (no conversation history)                   │
│                                                                 │
│  • Trigger fires (schedule, webhook, email, etc.)              │
│  • Orchestration constructs prompt:                             │
│      [System Prompt]                                            │
│      [System Reminder: time, connections, triggers, DB tables] │
│      [Trigger Payload: event details]                           │
│  • Fresh LLM instance receives this                             │
│  • LLM must REDISCOVER intent:                                  │
│      -> Read /agent/subagents/ to find instructions             │
│      -> Read /agent/home/config/ for settings                   │
│      -> Query database for state                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

5. Subagent Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                      SUBAGENT LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Creation (by parent agent):                                    │
│    write_file(                                                  │
│      path: "/agent/subagents/daily_briefing.md",               │
│      content: "# Daily Briefing\n\n## Instru"                  │
│    )                                                            │
│                                                                 │
│  Execution:                                                     │
│    1. Orchestration spawns NEW LLM instance                     │
│    2. Sends: [System Prompt] + [Markdown Content] + [Payload]   │
│    3. Subagent LLM runs until final message                     │
│    4. Only final message returned to parent                     │
│    5. Subagent context discarded                                │
│                                                                 │
│  Properties:                                                    │
│    • Same tools as parent (including connections)               │
│    • Same filesystem and database access                        │
│    • NO access to parent's conversation context                 │
│    • NO ability to show UI (preview, create connection card)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Purpose:
- Context management (keep parent context small)
- Encapsulation (reusable workflow units)
- Cost isolation (subagent context separate from parent)

6. The Rediscovery Pattern

```text
┌─────────────────────────────────────────────────────────────────┐
│           WHY REDISCOVERY IS NECESSARY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Trigger gives event data, not full intent                      │
│  Fresh LLM has no memory of prior planning                      │
│         -> Reads artifacts -> Interprets -> Executes            │
│    (Probabilistic, requires rediscovery of intent)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

What Gets Rediscovered:

```text
  System Reminder tells LLM:          LLM must then read:
  ┌────────────────────────┐          ┌────────────────────────┐
  │ • Connections exist    │    ->    │ • Subagent files       │
  │ • Triggers active      │          │   (what to do)         │
  │ • DB tables present    │          │ • Config files         │
  │ • Contact methods      │          │   (user preferences)   │
  └────────────────────────┘          └────────────────────────┘
```

7. Cost Model

```text
┌─────────────────────────────────────────────────────────────────┐
│                        TOKEN COSTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Every LLM invocation:                                          │
│    Input tokens: system prompt + context + tool results         │
│    Output tokens: reasoning + tool calls + responses            │
│                                                                 │
│  Cost drivers:                                                  │
│    • Large tool results (API responses, scraped pages)          │
│    • Long conversations (context accumulates)                   │
│    • Multiple subagent invocations                              │
│    • Verbose reasoning                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   OPTIMIZATION STRATEGIES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Scripts for deterministic work                              │
│     • Python script fetches/processes data                      │
│     • LLM only sees summary output                              │
│     • Script cost: ~0 (compute only)                            │
│                                                                 │
│  2. Subagents for isolation                                     │
│     • Heavy processing in subagent                              │
│     • Parent only sees final result                             │
│     • Subagent context discarded                                │
│                                                                 │
│  3. Query minimization                                           │
│     • Query specific fields, not full dumps                     │
│                                                                 │
│  NOT in system prompt:                                          │
│     • No mandate to use scripts                                 │
│     • No cost-awareness instructions                            │
│     • Optimization is emergent, not guaranteed                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

8. Reliability Characteristics

```text
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCES OF VARIANCE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LLM Non-Determinism:                                           │
│    • Same prompt may produce different plans                    │
│    • Error recovery behavior varies                             │
│    • Edge cases may be handled differently each time            │
│                                                                 │
│  External Dependencies:                                         │
│    • APIs may fail, rate limit, change                          │
│    • Web pages may change structure                             │
│    • OAuth tokens may expire                                    │
│                                                                 │
│  Context Limitations:                                           │
│    • Large data may be truncated                                │
│    • Tool results may overflow context                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 HOW TO MAKE IT MORE RELIABLE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  More Deterministic:                                            │
│    ✓ Detailed subagent instructions                             │
│    ✓ Explicit config files with all parameters                  │
│    ✓ Python scripts for data processing                         │
│    ✓ Database state tracking                                    │
│    ✓ Specific error handling instructions                       │
│                                                                 │
│  Less Deterministic:                                            │
│    ✗ Vague trigger names ("handle stuff")                       │
│    ✗ Minimal subagent instructions                              │
│    ✗ Relying on LLM to "figure it out"                          │
│    ✗ No state tracking                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

9. Feedback Loop (Editing/Fixing)

```text
┌─────────────────────────────────────────────────────────────────┐
│                    ITERATION LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Problem detected:                                              │
│    • User notices wrong output                                  │
│    • User gets error notification                               │
│    • User checks manually                                       │
│                                                                 │
│  Fix process:                                                   │
│    1. User asks agent to fix                                    │
│    2. Agent investigates logs/files                             │
│    3. Agent reads current subagent                              │
│       -> read_file("/agent/subagents/daily_briefing.md")        │
│    4. Agent edits subagent file                                 │
│       -> write_file(op: "edit", old_string, new_string)         │
│    5. Optionally tests                                          │
│                                                                 │
│  Risks:                                                         │
│    • Agent misunderstands the fix                               │
│    • Agent breaks something else                                │
│    • No version control (can't undo)                            │
│    • Fixing agent is also amnesiac                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

10. What Tasklet Is NOT

```text
┌─────────────────────────────────────────────────────────────────┐
│                         NON-GOALS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NOT a workflow engine:                                         │
│    • No DAGs, no explicit step dependencies                     │
│    • No retry policies, no circuit breakers                     │
│    • No visual workflow builder                                 │
│                                                                 │
│  NOT deterministic:                                              │
│    • Same trigger may execute differently                       │
│    • Reliability depends on instruction quality                 │
│                                                                 │
│  NOT self-improving:                                            │
│    • No automatic learning from failures                        │
│    • No feedback loops unless explicitly built                  │
│    • Requires human intervention to fix                         │
│                                                                 │
│  NOT version controlled:                                        │
│    • No git for subagents/configs                               │
│    • Overwrites are permanent                                   │
│    • No rollback mechanism                                      │
│                                                                 │
│  NOT cheap at scale:                                            │
│    • Every execution = LLM tokens                               │
│    • No automatic optimization                                  │
│    • Cost grows with complexity                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Summary Mental Model

Tasklet = Stateless LLM + Persistence Layer + Tool Bridge

Why this matters:
- Every session starts fresh (amnesiac)
- Intent must be rediscovered from artifacts
- Reliability depends on artifact quality
- Cost scales with LLM usage
