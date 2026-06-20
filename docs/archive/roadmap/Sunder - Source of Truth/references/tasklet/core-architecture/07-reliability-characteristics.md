# Reliability Characteristics

## Variance Sources

1. Model non-determinism
- Same inputs can produce different decomposition and recovery behavior.

2. External dependency volatility
- API failures, rate limits, schema drift, auth expiry.

3. Context and payload constraints
- Truncation or oversized tool outputs can degrade decisions.

## Reliability Improvement Levers

- Highly specific subagent instructions
- Explicit config files for parameters and limits
- Deterministic scripts for fragile data logic
- Persistent state tracking for retries/idempotency
- Concrete error-handling branches in instructions

## Anti-Patterns

- Vague trigger names
- Thin/no operational instructions
- Implicit state with no artifact trail
- Assuming model will infer exact desired behavior every run
