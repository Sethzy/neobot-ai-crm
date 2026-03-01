# Non-Goals and Limitations

## What Tasklet Is Not

1. Not a deterministic workflow engine
- No strict DAG semantics by default
- No guaranteed same-path execution per trigger

2. Not self-improving by default
- No autonomous learning loop unless explicitly built

3. Not version-controlled by default
- Artifact overwrites can be destructive without external VCS backup

4. Not automatically cost-optimized
- Token usage scales with context/tool payload growth

## Architectural Consequence

Robustness depends more on engineered artifacts and operating discipline than on base platform magic.
