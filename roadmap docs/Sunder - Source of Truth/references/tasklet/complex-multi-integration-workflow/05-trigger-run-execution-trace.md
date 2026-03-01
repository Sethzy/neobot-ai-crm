# Trigger-Run Execution Trace

## Canonical run sequence

1. Initialize execution log row.
2. Fetch today's events from calendar tool.
3. Filter meetings and deduplicate attendees.
4. Query person/company cache tables.
5. Run subagents for uncached entities.
6. Persist new cache entries.
7. Generate briefing artifact (markdown/PDF or body fallback).
8. Send email to owner.
9. Finalize execution log with metrics/status.

## Failure posture

- auth failures: notify and request reauth
- transient API failures: retry policy + log
- no meetings: clean success, optionally no-email mode
- per-entity research failures: partial output, not full abort

## Logging metrics

Recommended per-run fields:
- meetings_found
- people_researched
- companies_researched
- cache_hits
- first_meeting_time
- sent_at
- terminal_status (`success`/`partial`/`failed`)

