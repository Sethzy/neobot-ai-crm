# Subagent Lifecycle

## Creation

Parent agent writes markdown instructions into `/agent/subagents/<name>.md`.

## Execution

1. Orchestrator spawns a new model instance.
2. Context includes system prompt + subagent markdown + optional payload.
3. Subagent executes with tool access.
4. Only final subagent message is returned to parent.
5. Subagent conversation context is discarded.

## Properties

- Same core runtime/tool surface as parent unless restricted by platform policy.
- No direct access to parent conversational chain-of-thought/context.
- Useful for context isolation and reusable operational modules.

## Why It Matters

Subagents are the main mechanism for composability and controlling context bloat in complex workflows.
