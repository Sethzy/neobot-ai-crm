# Request Parsing and Architecture Decisions

## Input model

Initial request pattern:
- monitor URL
- threshold condition
- notification channel
- check frequency (optional/default)

## Blocking validation

Must-have:
- valid, scrapeable URL

Non-blocking defaults:
- check frequency (e.g. every 6 hours)
- owner-email notification target

## Architecture decision in source

Selected pattern:
- parent orchestrator for trigger + notification
- subagent for scrape/parse/compare routine
- SQL for state persistence

## Why this split

- keeps parent context lean
- isolates scrape-heavy context in subagent
- supports recurring trigger reuse with explicit state

