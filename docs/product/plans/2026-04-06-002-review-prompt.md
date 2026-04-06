# Review Prompt: Event-Driven Triggers

## Documents to review

1. **Requirements:** `docs/product/ideations/2026-04-06-event-driven-triggers-requirements.md`
2. **Plan:** `docs/product/plans/2026-04-06-002-feat-event-driven-triggers-plan.md`
3. **Reference (background):** `roadmap docs/Sunder - Source of Truth/references/tasklet/trigger-system-internals.md`

## What to check

### Requirements doc
- Do R1-R18 fully cover the two trigger types (internal CRM + external Composio)?
- Are the scope boundaries reasonable? Anything we're excluding that we shouldn't be?
- Are success criteria testable and specific enough?

### Plan doc
- Does the plan cover every requirement (R1-R18)?
- Is the `trigger_events` queue table the right approach, or would direct invocation (bypassing the scanner) be better for internal triggers?
- Is the `capture_crm_event()` Postgres trigger function correct? Specifically: does the `to_jsonb(OLD)` / `to_jsonb(NEW)` diff approach handle all column types properly? Any edge cases with JSONB columns or NULLs?
- Is the `claim_due_db_events()` RPC sound? Does the atomic UPDATE + JOIN match pattern have race conditions?
- For Composio triggers: is `payload->>'composio_trigger_id'` the right lookup key for matching incoming webhooks? Does Composio's `IncomingTriggerPayload` actually include the trigger instance ID in a field we can match on?
- Is the field filter syntax (`{ "stage": { "new": "Closing" } }`) expressive enough for real use cases?
- Any missing error handling or edge cases?

### Cross-cutting
- Do the two PRs have clean boundaries? Can PR A ship and be useful without PR B?
- Is the migration sequencing correct? (PR A adds `db_event`, PR B adds `composio_event` — both modify the same CHECK constraint)
- Does the plan align with existing trigger patterns? (Compare against `webhook` type for the Composio route, `schedule`/`rss` for scanner integration)
