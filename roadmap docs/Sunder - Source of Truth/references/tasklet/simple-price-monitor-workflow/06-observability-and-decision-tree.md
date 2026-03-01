# Observability and Decision Tree

## What to persist for debugging

- execution log per trigger run (success/error/duration)
- price history snapshots
- parse snippets when extraction fails
- failure counters and rate-limit timestamps

## What is not inherently replayable

- full internal reasoning path
- exact historical context window content

## Operational implication

Without explicit logs, postmortem analysis is shallow. Treat observability as part of core design, not optional extras.

## Decision tree summary

1. Validate request parameters.
2. Choose recurring architecture with explicit persistence.
3. Build schema and subagent.
4. Validate scrape once.
5. Register trigger.
6. On each run: scrape -> compare -> update -> notify conditionally.
7. Apply anti-spam and failure escalation rules.

