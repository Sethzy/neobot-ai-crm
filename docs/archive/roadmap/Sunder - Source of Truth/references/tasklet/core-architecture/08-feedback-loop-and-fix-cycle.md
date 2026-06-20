# Feedback Loop and Fix Cycle

## Typical Iteration Loop

1. Failure is detected (wrong output/error/manual review).
2. User requests correction.
3. Agent inspects artifacts/logs and current subagent/config files.
4. Agent patches files (for example with targeted edit operations).
5. Optional validation run is performed.

## Risk Profile

- Incorrect fix due to misunderstanding
- Regression in adjacent behavior
- No native rollback if artifacts are overwritten
- Fixing run is itself stateless and must rediscover context

## Operational Guidance

Treat subagent/config files as the source of truth and keep them explicit, versioned externally when possible.
