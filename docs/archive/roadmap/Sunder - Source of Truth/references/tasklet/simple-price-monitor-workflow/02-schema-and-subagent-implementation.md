# Schema and Subagent Implementation

## Base schema

Primary monitor table fields:
- URL
- target price
- last observed price
- last check timestamp
- notification sent timestamp

Optional support tables:
- price history
- execution log

## Idempotent setup posture

- `CREATE TABLE IF NOT EXISTS`
- avoid duplicate inserts by using unique constraints and upserts where possible

## Subagent contract

Subagent responsibilities:
1. scrape page
2. extract price candidate(s)
3. compare against stored state
4. return structured JSON result

Parent responsibilities:
- trigger scheduling
- decision to notify
- notification dispatch
- persistent state updates

## Subagent output contract

Use strict structured result (success, current/previous price, price_changed, error) to avoid brittle text parsing in parent.

