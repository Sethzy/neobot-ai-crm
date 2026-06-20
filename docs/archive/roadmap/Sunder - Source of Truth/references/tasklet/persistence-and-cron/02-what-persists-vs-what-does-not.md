# What Persists vs What Does Not

## Persists

- Trigger definitions and schedules
- Connection registrations and activated tools
- Files under `/agent/home` and `/agent/subagents`
- SQL tables and data

## Does not persist reliably

- The model's prior run conversational context
- Setup-time reasoning unless encoded into files/DB
- Unwritten preferences and decision rules

## Operational consequence

Rerun reliability depends on artifact quality, not on model memory.

