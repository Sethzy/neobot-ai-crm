# Edge Cases and Failure Recovery

## Failure domains

1. Scrape failures
- parse drift after site redesign
- transient HTTP failures
- long-term page removal

2. State failures
- DB write failure after notification
- concurrent trigger overlap causing duplicate sends

3. Messaging failures
- notification dispatch fails or attachment constraints

## Recovery patterns

1. Failure counters + escalation thresholds
- notify user only after repeated consecutive failures

2. Idempotent operations
- guard duplicate inserts/sends
- use conditional updates and unique constraints

3. Graceful degradation
- keep core alerting alive when non-critical telemetry fails

4. Checkpointed setup
- schema -> monitor record -> subagent -> validation -> trigger
- resume from failed step instead of full reset

