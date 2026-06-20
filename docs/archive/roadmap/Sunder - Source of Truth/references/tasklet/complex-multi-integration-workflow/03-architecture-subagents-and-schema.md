# Architecture, Subagents, and Schema

## Layered design

1. Trigger layer
- schedule invocation

2. Main orchestration layer
- fetch meetings
- coordinate research
- compile and deliver briefing

3. Subagent layer
- person-research subagent
- company-research subagent

4. Data layer
- SQL caches and execution logs
- filesystem artifacts (templates, generated docs)

## Why split into two subagents

- domain specialization (person vs company)
- lower per-subagent context pressure
- cleaner failure isolation and cache boundaries

## Suggested SQL entities

- `person_research_cache`
- `company_research_cache`
- `briefing_executions`
- `meeting_history`

## Cache policy

Baseline strategy:
- time-based expiry (for example 30 days)
- refresh on expiry
- optional lightweight freshness checks on use

