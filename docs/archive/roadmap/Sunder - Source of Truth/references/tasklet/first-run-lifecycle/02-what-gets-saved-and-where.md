# What Gets Saved and Where

This document maps each persistence surface to storage owner, visibility, and lifetime.

## 1. Connection state

Examples:
- OAuth grant metadata
- Activated connection tools

Storage:
- System-managed connection store (not regular `/agent/home` files).

Agent visibility:
- Can list/use connection tools.
- Cannot read raw token secrets.

Lifetime:
- Persists until disconnected/revoked.

## 2. SQL state (`run_agent_memory_sql`)

Examples:
- Cache tables (`person_cache`)
- Execution logs (`briefing_log`)

Storage:
- Persistent agent SQL DB managed by platform.

Agent visibility:
- Full query/write via SQL tool.

Lifetime:
- Persists until rows/tables are deleted.

## 3. Subagent files (`/agent/subagents/`)

Examples:
- `calendar-briefing.md`
- `person-researcher.md`

Storage:
- Persistent filesystem under `/agent/subagents`.

Agent visibility:
- Read/write/delete via file tools.

Lifetime:
- Persists until edited/deleted.

## 4. Config files (`/agent/home/...`)

Examples:
- `briefing-preferences.json`

Storage:
- Persistent filesystem under `/agent/home`.

Agent visibility:
- Read/write via file tools.

Lifetime:
- Persists until edited/deleted.

## 5. Trigger definitions

Examples:
- Schedule trigger with cron/timezone

Storage:
- System-managed trigger registry.

Agent visibility:
- Can list/view/manage through trigger tools.

Lifetime:
- Persists until deleted/disabled.

