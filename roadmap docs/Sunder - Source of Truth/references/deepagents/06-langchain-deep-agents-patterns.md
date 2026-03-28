# LangChain Deep Agents — Consolidated Patterns Reference

> Source: https://docs.langchain.com/oss/python/deepagents/harness
> Captured: 2026-03-25

LangChain Deep Agents is an agent harness built on LangGraph providing durable execution, streaming, and pluggable backends. This document consolidates all patterns and principles from the official docs for cross-referencing against our own agent architecture.

---

## 1. Harness Capabilities Overview

An agent harness combines several capabilities for building long-running agents:

| Capability | Purpose |
|------------|---------|
| Planning | Structured task decomposition with status tracking |
| Virtual Filesystem | Pluggable file I/O (read, write, edit, glob, grep, ls) |
| Task Delegation | Ephemeral subagents for isolated multi-step work |
| Context Management | Compression, offloading, summarization within token limits |
| Code Execution | Sandboxed shell execution via `execute` tool |
| Human-in-the-Loop | Opt-in approval gates on specified tool calls |
| Skills | On-demand domain knowledge via progressive disclosure |
| Memory | Persistent context files loaded every conversation |

---

## 2. Planning

- Built-in `write_todos` tool maintains structured task lists
- Tasks have statuses: `pending`, `in_progress`, `completed`
- Persisted in agent state
- Designed for long-running, multi-step work

**Pattern**: Agent decomposes complex goals into trackable subtasks before execution.

---

## 3. Virtual Filesystem

Configurable filesystem with pluggable backends:

| Tool | Description |
|------|-------------|
| `ls` | List files with metadata (size, modified time) |
| `read_file` | Read contents with line numbers, offset/limit; multimodal for images |
| `write_file` | Create new files |
| `edit_file` | Exact string replacements (with global replace mode) |
| `glob` | Find files matching patterns (e.g., `**/*.py`) |
| `grep` | Search file contents with multiple output modes |
| `execute` | Run shell commands (sandbox backends only) |

**Key principle**: Filesystem is the universal persistence layer used by skills, memory, code execution, and context management.

### Backend Options

| Backend | Persistence | Use Case |
|---------|------------|----------|
| StateBackend | Single thread (ephemeral) | Scratch work, intermediate files |
| FilesystemBackend | Disk | Local development, must use `virtual_mode=True` |
| StoreBackend | LangGraph Store (durable) | Cross-thread persistent storage |
| LocalShellBackend | Disk + shell | Full host access (dangerous) |
| CompositeBackend | Hybrid per-route | Route `/memories/` to Store, `/workspace/` to Sandbox |
| Sandbox backends | Container-isolated | Production code execution |

**Security warnings**:
- FilesystemBackend can expose secrets via SSRF when combined with network tools
- LocalShellBackend grants unrestricted shell execution on host
- Always use sandbox backends in production
- Keep API keys/credentials in host-environment tools, not inside sandboxes

---

## 4. Task Delegation (Subagents)

Main agent spawns ephemeral subagents for isolated multi-step tasks.

**Benefits**:
- **Context isolation**: Prevents clutter in main agent context
- **Parallel execution**: Multiple subagents can run concurrently
- **Specialization**: Different tools/configs per subagent
- **Token efficiency**: Compressed results returned to parent

**Mechanism**:
1. Main agent has `task` tool
2. Creates fresh agent instance with own context
3. Subagent executes autonomously until completion
4. Returns single final report (stateless, single-message return)

**Default subagent**: "general-purpose" — includes filesystem tools, inherits main agent skills automatically.

**Custom subagents**: Define specialized agents (code-reviewer, web-researcher, test-runner) with explicit `skills` parameters and isolated skill states.

**Best practice**: Instruct subagents to return summaries, not raw data. Use filesystem for large data; main agent reads what it needs.

---

## 5. Context Engineering

Five context layers enable reliable task execution:

| Layer | Function | Scope |
|-------|----------|-------|
| Input context | System prompt, memory, skills, tool prompts | Static per run |
| Runtime context | User metadata, API keys, connections | Per invocation |
| Context compression | Offloading and summarization | Automatic |
| Context isolation | Subagent quarantine | Per delegation |
| Long-term memory | Persistent storage | Cross-thread |

### Input Context Components

- **System prompt**: Custom instructions prepended to built-in guidance. Can use `@dynamic_prompt` middleware for context-aware instructions.
- **Memory files**: Always loaded into system prompt. Keep minimal — project conventions, user preferences, critical guidelines only.
- **Skills**: On-demand via progressive disclosure. Keep each skill focused on a single workflow/domain.
- **Tool prompts**: Clear name, description, argument descriptions. Include *when* to use the tool.

### Runtime Context

- Passed per invocation via `config`
- NOT automatically included in model prompt — only visible if tools/middleware explicitly inject it
- Propagates to all subagents (child agents receive identical config)

### Context Compression

**Offloading** (automatic):
- Tool inputs/results > 20,000 tokens → persisted to filesystem
- At 85% context window capacity → older tool calls truncated with filesystem pointers

**Summarization** (when offloading exhausted):
- LLM generates structured summary: session intent, artifacts created, next steps
- Replaces full conversation history
- Dual records: in-context summary + original messages on filesystem for recovery

**Proactive summarization**: Optional `create_summarization_tool_middleware` allows agents to trigger summarization between tasks.

### Best Practices

1. Maintain minimal memory for always-relevant content
2. Delegate multi-step heavy work to subagents
3. Document long-term memory structure
4. Use filesystem persistence for large outputs
5. Pass runtime context for tool-specific configuration
6. Adjust subagent output guidance in system prompts

---

## 6. Code Execution (Sandboxes)

### Two Integration Patterns

| Pattern | Description | Pros | Cons |
|---------|-------------|------|------|
| Agent-in-Sandbox | Agent runs inside container | Mirrors local dev | API keys in sandbox, infra for comms |
| Sandbox-as-Tool | Agent on host, sandbox is a callable tool | Credentials outside sandbox, instant updates, parallel execution | Network latency per call |

### Providers

- **AgentCore**: AWS MicroVM isolation
- **Modal**: ML/AI workloads with GPU
- **Daytona**: Fast cold starts for TypeScript/Python
- **Runloop**: Disposable devboxes

### Architecture

- Core method: `execute()` — runs shell commands, returns stdout/stderr + exit code
- All filesystem operations built atop `execute()` through constructed scripts
- Large outputs truncated automatically

### Security

- Context injection remains a vulnerability — attackers controlling input can instruct agent to read/exfiltrate data
- **Never store secrets inside sandboxes** — keep credentials in host-environment tools
- Implement TTL on idle sandboxes (billing)
- Maintain unique sandbox per conversation thread

---

## 7. Human-in-the-Loop

Opt-in approval gates that pause execution at specified tool calls.

**Configuration**: Pass `interrupt_on` to agent creation with tool names:
```python
interrupt_on={"edit_file": True}  # pauses before file edits
```

**Flow**: Agent pauses → human reviews → approves/modifies/denies → execution continues.

**Use cases**:
- Safety gates for destructive operations
- User verification before expensive API calls
- Interactive debugging and guidance

**Requires**: `MemorySaver` checkpointer for state persistence during pause.

---

## 8. Skills

Specialized workflows providing domain knowledge via progressive disclosure.

### Structure

Each skill is a directory with:
- `SKILL.md`: Instructions with frontmatter metadata (name, description, allowed-tools)
- Optional: scripts, reference docs, templates, resources

### Progressive Disclosure

1. Agent scans skill descriptions at startup (frontmatter only)
2. When a task matches, agent reads full `SKILL.md`
3. Tokens conserved — full skill loaded only when relevant

### Key Rules

- `SKILL.md` max 10 MB
- Description max 1,024 characters
- Last source in `skills` array takes precedence (layered architecture)
- General-purpose subagents inherit main agent skills; custom subagents require explicit config

### Skills vs Memory

| Aspect | Skills | Memory |
|--------|--------|--------|
| Loading | On-demand (progressive disclosure) | Always loaded |
| Best for | Large, task-specific contexts | Always-relevant conventions |
| Token cost | Low (loaded only when matched) | Constant overhead |

---

## 9. Memory

Persistent context files providing extra context across conversations.

### Implementation

- Uses `AGENTS.md` files for persistent context
- Always loaded into system prompt (unlike skills)
- Stored in agent's backend (State, Store, Filesystem)
- Agent updates memory based on interactions and identified patterns

### Best Practices

- Keep memory minimal — only always-relevant content
- Use for: user preferences, project guidelines, domain knowledge
- Do NOT use for: large task-specific contexts (use skills instead)
- Document memory structure so agent knows what/where to save

---

## 10. Customization & Resilience

### Connection Resilience

- Automatic retry with exponential backoff
- Default: up to 6 retries for network errors, rate limits (429), server errors (5xx)
- For unreliable networks: set `max_retries` to 10-15 with checkpointing

### Middleware Architecture

Default middleware stack:
1. TodoList
2. Filesystem
3. SubAgent
4. Summarization
5. AnthropicPromptCaching
6. PatchToolCalls

Additional middleware activated by: memory, skills, human-in-the-loop features.

Custom middleware via `@wrap_tool_call` decorators — intercept and log operations. **Critical**: Do not mutate middleware attributes after initialization; use graph state for thread-safe tracking.

### Structured Output

- Pydantic `BaseModel` schemas as `response_format`
- Validated output in `structured_response` state key

---

## 11. Summary: Core Patterns for Effective Agents

### Architecture Patterns

1. **Single orchestration loop**: Load state → build context → call model → execute tools → persist
2. **Pluggable backends**: Abstract filesystem behind swappable implementations
3. **Progressive disclosure**: Load knowledge only when task-relevant (skills)
4. **Context compression**: Automatic offloading + summarization at token thresholds
5. **Subagent isolation**: Quarantine heavy work, return compressed results
6. **Approval gates**: Opt-in human-in-the-loop on destructive/expensive operations

### Context Engineering Patterns

7. **Layered context**: System prompt → memory → skills → runtime → live stats
8. **Token budgeting**: Offload at 20K tokens per tool result; summarize at 85% window
9. **Dual records**: Keep both summary (in-context) and full history (on filesystem)
10. **Minimal memory**: Only always-relevant content in persistent memory
11. **Tool prompt quality**: Clear name, description, argument docs, usage guidance

### Execution Patterns

12. **Sandbox-as-tool**: Keep credentials on host, sandbox is callable
13. **Stateless subagents**: Fresh context, single-message return, no conversation history
14. **Task decomposition**: Break complex goals into trackable subtasks before execution
15. **Filesystem as universal persistence**: All components share filesystem for data exchange
16. **Retry with backoff**: Automatic retries for transient failures (network, rate limits)

### Safety Patterns

17. **Two-tier safety**: Auto-run internal work; gate external-facing actions
18. **Context injection defense**: Never store secrets in sandboxes
19. **Virtual mode**: Always enable for filesystem backends in production
20. **TTL on sandboxes**: Prevent billing leaks from idle containers
