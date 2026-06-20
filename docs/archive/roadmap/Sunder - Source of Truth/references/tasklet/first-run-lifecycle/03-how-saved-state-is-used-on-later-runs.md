# How Saved State Is Used on Later Runs

## Trigger-run input model

When the trigger fires on a future run, the model receives:

- The same base system prompt
- Current system reminder (connections, DB table counts, triggers, time)
- Trigger event payload

It does not receive prior conversation transcript by default.

## Rediscovery sequence

A typical run reconstructs intent by reading persisted artifacts:

1. Inspect `/agent/subagents/` to identify relevant workflow definitions.
2. Read primary subagent instructions to recover task semantics.
3. Read `/agent/home` config/preferences for user-specific parameters.
4. Query SQL state for cache/history/log information.
5. Execute workflow (often via `run_subagent`) and then write logs/results.

## Example usage pattern

- Parent trigger handler reads subagent/config.
- Parent runs main subagent with payload.
- Main subagent uses connection tools and SQL cache.
- Parent sends output and logs execution state.

## Key principle

Later runs rely on artifact discovery, not conversational memory recall.

