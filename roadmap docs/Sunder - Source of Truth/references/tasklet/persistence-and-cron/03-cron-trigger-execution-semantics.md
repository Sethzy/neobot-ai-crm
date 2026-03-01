# Cron Trigger Execution Semantics

## Common misconception

Cron does not directly execute a deterministic workflow file.

## Actual model

When schedule fires:
1. System starts a fresh model invocation.
2. Invocation context includes:
- base system prompt
- runtime reminder/state summary
- trigger payload
3. Model decides what actions/tools to invoke.

## Implication

Execution is model-mediated each time. Consistency is guided by artifacts and naming conventions, not hard workflow-engine determinism.

