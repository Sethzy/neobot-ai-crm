# Tasklet Core Architecture

Explicit reverse-engineering docs for Tasklet's runtime model and operational characteristics.

## Files

- `00-source-breakdown-verbatim.md` - raw source capture from analysis notes
- `01-core-runtime-model.md` - orchestration/LLM/sandbox model
- `02-state-surfaces-system-vs-agent.md` - opaque vs transparent state model
- `03-tool-system-and-execution-flow.md` - tool taxonomy and execution pipeline
- `04-execution-modes-and-rediscovery.md` - chat vs trigger and rediscovery behavior
- `05-subagent-lifecycle.md` - subagent creation/execution properties
- `06-cost-model-and-optimization.md` - token/cost drivers and mitigation patterns
- `07-reliability-characteristics.md` - variance sources and reliability levers
- `08-feedback-loop-and-fix-cycle.md` - iterative repair lifecycle and risks
- `09-non-goals-and-limitations.md` - explicit non-goals and constraints
- `10-summary-mental-model.md` - compact architectural summary
- `11-direct-tool-access-vs-nested-agent-runtime.md` - why direct tools + subagents beat nested agent-in-sandbox designs

## Scope

This section documents architecture, reliability, and operating-model analysis.
