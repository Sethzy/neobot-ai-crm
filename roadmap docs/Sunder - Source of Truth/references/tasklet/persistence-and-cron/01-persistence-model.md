# Persistence Model

This document normalizes how state persists in Tasklet-style agents.

## Core principle

Persistence is explicit, not learned.

If behavior is not encoded into artifacts, future runs will not reliably reproduce it.

## Persistence surfaces

1. Filesystem artifacts
- `/agent/home/`: scripts, configs, templates, outputs
- `/agent/subagents/`: reusable workflow instructions

2. SQL state
- schema + rows created through `run_agent_memory_sql`
- used for caches, logs, and cross-run state

3. System-managed objects
- triggers (when to invoke)
- connections (credential-backed tool access)

## Non-persistent by default

- conversation-level intent unless written down
- implicit setup rationale
- unwritten heuristics/preferences

