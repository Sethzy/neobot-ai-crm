# Agent Harness Design — @systematicls / OpenForage

**Source:** Twitter/X thread by @systematicls, posted 2026-03-29
**Author:** OpenForage (systematic trading background, building autonomous coding harness)

## Core Thesis

All harness design exists to overcome two root problems:
1. Agents become **lazy and cut corners**
2. Agents become **confused and stupid**

## The Failure Taxonomy

### Pre-Task
- **Insufficient context before starting** → acts on wrong/missing info. Fix: systematically check for incomplete/contradictory information before starting.

### Planning Phase
- **Wrong attack vectors** — usually from misalignment (misinterpreting what the user wants), not stupidity. Fix: ensure agent covers all related files before planning; keep repo contradiction-free.
- **Short-term thinking** — no consequences for tech debt. Fix: remind agent at planning phase to think like a founder (scalable, maintainable, respects paradigms). Consider N-plan approach with a judge agent selecting the most maintainable plan.

### Task Execution
- **Context anxiety** — as context grows, agents become increasingly desperate to end the session. Especially pervasive with Claude. Fix: smart session handoffs with information-dense compaction prompts. Custom compaction beats provider-native because you understand your repo structure better.
- **Planning deviations (planning stickiness)** — agent implements A' instead of A, then all downstream code is wired to A'. Fix: verify early and often that implementation matches plan before continuing.
- **Complexity fear** — agents avoid complex tasks via stubs, declaring out-of-scope, or weaseling. Learned from RL: penalized for getting complex things wrong → avoid complexity. Fix: break into sub-hundred-line tasks, string 500 of them together. Same as human productivity advice (activation energy → in-progress).

### Post-Task
- **Verification laziness** — writes weak tests that pass A' instead of A, declares success. Worsens under context pressure. Fix: dedicated verification agent with fresh context; verify actual production behavior (real button click → real backend payload), not generic stubs.
- **Entropy maximization** — changes function X but leaves all docs referencing old behavior. Repeated 100× → unmaintainable repo, constantly confused agents. Fix: allocate a fresh-context agent after every long session to clean state, resolve contradictions, remove dead code and stale docs.

## Why Build Your Own Harness

Native harnesses (Claude Code, Codex) have limited hooks and limited orchestration tooling. When Claude acts as orchestrator, it accumulates orchestration context that crowds out task context.

Custom harness enables:
- **Algorithmic contracts per session** — a monitor agent enforces session exit criteria
- **Complexity classifier** — if task is high-complexity, spawn a decomposition agent first
- **Blast-radius cleanup agent** — after every session, scan everything touched for contradictions
- **Telemetry + rubrics** — collect prompts/traces/outcomes, score harness quality, iterate

## Relevance to Sunder

Sunder's runner (`src/lib/runner/run-agent.ts`) faces all of these problems at scale:
- Context anxiety: addressed via stateless runs + queue system
- Planning stickiness: tasklist format + bite-sized steps in `docs/product/tasks/`
- Entropy: QA surface files + `ship-feature` skill for post-ship cleanup
- Verification laziness: Langfuse traces + eval scoring for tool-call correctness

The article validates Sunder's improvement loop (run → trace → evaluate → improve context engineering → run again) and suggests that **custom telemetry rubrics** and **fresh-context cleanup agents** are the next frontier.
