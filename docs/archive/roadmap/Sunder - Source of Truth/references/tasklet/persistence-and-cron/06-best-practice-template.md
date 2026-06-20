# Best-Practice Template for Reliable Reruns

Use this pattern for recurring automations:

1. Trigger
- narrow and explicit name
- explicit schedule/timezone

2. Main subagent
- clear objective
- deterministic step sequence
- strict output schema

3. Config artifact
- `/agent/home/config/<workflow>.json`
- all tunable behavior externalized

4. SQL schema
- cache + execution log tables
- idempotency keys when relevant

5. Deterministic worker script (optional but preferred)
- place non-LLM transforms in script
- subagent acts as orchestrator + exception handler

## One-line guidance

If it must rerun predictably, encode it as artifacts plus deterministic code, not implicit model memory.

