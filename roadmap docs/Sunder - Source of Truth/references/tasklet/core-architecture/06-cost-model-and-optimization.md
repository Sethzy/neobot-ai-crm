# Cost Model and Optimization

## Primary Cost Structure

Each invocation incurs token cost from:
- Input context (system prompt + history + tool outputs)
- Output tokens (responses and tool-call scaffolding)

## Major Cost Drivers

- Large raw tool outputs
- Long interactive sessions
- Repeated subagent calls
- Verbose intermediate reasoning/formatting

## Optimization Patterns

1. Deterministic scripts for heavy data processing
- Let runtime scripts do compute-intensive transformation.
- Return compact summaries to LLM context.

2. Subagent isolation
- Push bulky tasks into subagents.
- Return only final distilled outputs to parent.

3. Query minimization
- Request only required fields and bounded ranges.
- Avoid dumping large payloads into context.

## Practical Note

Cost optimization is usually emergent from architecture and prompting discipline, not guaranteed by default behavior.
