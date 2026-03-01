# Subagent File Anatomy

Subagent files are markdown instruction contracts for a fresh model instance.

## Typical sections

1. Title/description
- what the subagent does

2. Input contract
- expected payload fields and constraints

3. Procedure/instructions
- ordered execution steps

4. Output contract
- strict response shape (prefer JSON schema-like structure)

5. Error handling
- retries, fallback behavior, partial-result policy

6. Caching/state policy
- SQL/table usage, TTL, idempotency behavior

## Execution model

`run_subagent(path, payload)` spawns a new model context that reads markdown + payload, runs tools, then returns only final output to parent.

## Reliability rule

Subagent markdown should be written as executable SOP, not as a short reminder.

