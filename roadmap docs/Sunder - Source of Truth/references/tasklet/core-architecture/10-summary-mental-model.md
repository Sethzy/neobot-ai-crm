# Summary Mental Model

Tasklet can be modeled as:

`Stateless LLM + Persistence Layer + Tool Bridge`

## Implications

1. Fresh-run amnesia is normal.
- Every trigger run starts with limited immediate memory.

2. Intent must be rediscoverable.
- Durable artifacts (subagents/config/state) are mandatory for reliability.

3. Quality of artifacts drives outcomes.
- Better instructions + explicit state -> higher determinism.

4. Cost scales with model usage and context size.
- Architecture choices directly shape token spend.

## One-Line Operating Principle

Engineer for rediscovery, not recall.
