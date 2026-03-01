# Consistency vs Determinism

## Determinism ladder

1. Trigger name only
- low determinism
- model re-derives most behavior

2. Trigger + subagent
- medium determinism
- behavior follows instruction quality

3. Trigger + detailed subagent + explicit config/DB contracts
- high determinism
- less interpretive ambiguity

4. Trigger + subagent that invokes deterministic script
- very high determinism
- model orchestrates, script performs exact logic

## Drift modes

- model forgets to invoke intended subagent
- vague subagent text allows interpretation drift
- missing config defaults cause behavior variation

## Mitigation

- strict subagent contracts (input/output/errors)
- explicit config files and schema
- deterministic code for fragile business logic

