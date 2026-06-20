# Edge Case and Partial-Failure Policy

## Edge case domains

1. Calendar anomalies
- all-day/private/tentative events
- very large attendee lists
- multi-calendar aggregation

2. Research anomalies
- ambiguous identities
- sparse/no public presence
- stale or conflicting sources
- non-company email domains

3. Timing anomalies
- early first meetings
- long processing windows
- DST and travel timezone drift

## Partial-failure contract

User-facing output should remain useful even when some enrichments fail.

Policy:
- include all relevant attendees
- attach confidence and missing-data notes
- do not block briefing on single-person research failure
- persist failure reasons for later debugging

## Success semantics

`partial` is a valid terminal status when core delivery succeeded but enrichment completeness is below target.

