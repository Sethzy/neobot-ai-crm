# Optimization and State Machine

## Optimization opportunities

1. Batching strategy
- reduce per-entity call overhead with batch-oriented subagent patterns
- tradeoff: larger context and broader failure blast radius

2. Delta briefings
- track what changed since last report
- emphasize new data instead of repeating known context

3. Preemptive caching
- research ahead of scheduled briefings when upstream signals exist
- tradeoff: complexity and wasted work on canceled meetings

## High-level state machine

1. Parse request and collect required clarifications.
2. Set up/verify connection permissions.
3. Create schemas, subagents, and configs.
4. Register schedule trigger.
5. On trigger fire:
- fetch calendar
- filter and dedupe
- enrich via cache + research
- generate document
- deliver message
- persist execution metrics

## Operating principle

Prefer explicit state transitions and idempotent writes so repeated runs remain safe and auditable.

