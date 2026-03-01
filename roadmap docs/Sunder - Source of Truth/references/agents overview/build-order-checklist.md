# Build Order Checklist (Practical)

**Use this before adding complexity.**

## Level 1: Agent + tools

- [ ] Can reliably read/write files
- [ ] Can run shell commands and parse failures
- [ ] Produces a clear stop message when done
- [ ] Handles at least 5 representative tasks end-to-end

Move up only if this is stable.

## Level 2: Storage + knowledge

- [ ] Session history is persisted
- [ ] Agent can retrieve team docs/standards
- [ ] Follow-up requests work without repasting context
- [ ] You can inspect what happened per run

## Level 3: Memory + learning

- [ ] Agent can store useful user/team preferences
- [ ] Future sessions apply those preferences
- [ ] Learning quality is reviewed (not blindly trusted)
- [ ] Bad learnings can be corrected/removed

## Level 4: Multi-agent team

- [ ] Roles are explicit (ex: coder, reviewer, tester)
- [ ] Role permissions are constrained
- [ ] Team output is more reliable than single-agent baseline
- [ ] Human supervision path exists for disagreements

## Level 5: Production runtime

- [ ] Production DB + vector store are in place
- [ ] Tracing exists for each step/tool call
- [ ] API/service boundaries are clear
- [ ] Failure, retry, and observability paths are tested
- [ ] Cost and latency are monitored continuously

## Operational Checks (Any Level)

- [ ] Keep tool list stable across turns where possible
- [ ] Track context growth
- [ ] Compact/summarize when context gets large
- [ ] Prefer deterministic flows before adding autonomy
- [ ] Add complexity only after proving need
