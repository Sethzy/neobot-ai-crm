# Core Runtime Model

## Layer 1: Orchestration Layer (Backend)

Responsibilities:
- Account, quota, billing management
- Connection registry and credential lifecycle management
- Trigger registration and event routing
- Tool-call execution and result marshalling

## Layer 2: LLM Instance (Per Invocation)

Properties:
- Stateless by default across runs
- Receives system prompt and invocation context
- No direct raw access to external secrets
- Operates through tool interfaces, not direct privileged channels

## Layer 3: Sandbox Runtime

Execution capabilities:
- Shell command execution via `run_command`
- Script execution (for example Python workflows)
- Ephemeral compute + persistent mounted storage zones

Sandbox activation rule:
- Sandbox execution is on-demand for `run_command`.
- Tool calls like `read_file`, `write_file`, SQL tools, and web tools do not require shell execution.
- In practice: shell/Python/`curl`/`apk` work happens in sandbox; non-shell tool calls do not.

Filesystem profile:
- Persistent: `/agent/home/`, `/agent/subagents/`
- Read-only inputs/instructions: `/agent/uploads/`, `/agent/skills/`, `/agent/toolcalls/`
- Ephemeral: `/tmp/`

## Runtime Model Summary

Tasklet behaves as orchestrated tool-use over a stateless model runtime, with persistence externalized into files, task state, triggers, and connections.
