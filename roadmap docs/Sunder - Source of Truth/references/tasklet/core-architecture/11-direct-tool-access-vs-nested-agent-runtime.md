# Direct Tool Access vs Nested Agent Runtime

## Clarification

Tasklet's default model is:

- One active LLM context
- One flat tool list at that same level (for example `run_command`, `read_file`, `write_file`, web tools, and `run_subagent`)
- A sandbox used only as command execution infrastructure for `run_command`

Tasklet does **not** need to run a second Agent SDK instance inside the sandbox just to use filesystem or shell tools.

## Why This Matters

If you nest an inner agent runtime inside a sandbox, you create an avoidable communication boundary:

- Inner-agent output must be serialized back to outer-agent context
- Error handling gets split between sandbox errors and inner-agent errors
- Token usage/accounting becomes harder to reason about
- Context passing turns into prompt-within-prompt protocol work

With direct tools, the active agent just calls the needed tool immediately.

## Specialization Pattern

Use subagents for specialization, not for basic tool access:

1. Parent agent invokes `run_subagent` with specialist instructions + payload.
2. Platform spawns a fresh LLM instance with the same core tool surface (unless policy-restricted).
3. Subagent returns a final message string to the parent and exits.

This gives context isolation and reusable specialist behavior without nested runtime complexity.

## Practical Rule

- Default: direct tool access on the main agent.
- Optional: fresh subagent for specialist workflows.
- Avoid: agent-inside-sandbox nesting unless strict process isolation is an explicit requirement.
