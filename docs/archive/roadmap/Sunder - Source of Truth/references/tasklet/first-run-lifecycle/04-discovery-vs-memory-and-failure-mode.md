# Discovery vs Memory and Failure Mode

## Discovery vs memory

Persistent trigger workflows are reconstructed through artifacts.

What is not reliably present on future runs:
- Original setup chat
- Setup rationale details
- Implicit assumptions never written down

What must be present for reliable execution:
- Explicit subagent instructions
- Explicit config files
- Optional SQL state schema/logging
- Trigger metadata and connection availability

## Failure mode: underspecified subagent

If instructions are vague (for example, "do the briefing thing"), the future run must infer missing details from generic priors.

Likely outcomes:
- Inconsistent behavior across runs
- Wrong ordering of operations
- Incorrect output format/content

## Hard rule

Treat setup as writing an operational contract for a future stateless executor.

