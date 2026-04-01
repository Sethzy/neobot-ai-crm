# CRM Event Triggers — Technical Design

## Context

Sunder's trigger system supports schedule, webhook, RSS, and pulse triggers — but nothing fires when records change in Sunder's **own CRM**. We want a "new deal created → auto-research company" flow. This requires a new trigger type: `crm_event`.

The CRM only has one creation path today: the agent's `create_record` tool. The UI is read-only (with inline editing via the agent). So application-level event emission from the CRM tools is sufficient — no need for Postgres triggers or Supabase Realtime hacks.

---

## Design

### New trigger type: `crm_event`

A CRM event trigger watches for specific record mutations (creates, stage changes) and fires the agent on its configured thread with the record snapshot as payload.

**Supported events (v1):**

| Event | Fires when |
|---|---|
| `deal.created` | A deal is inserted via `create_record` |
| `deal.stage_changed` | A deal's stage field changes via `update_record` |
| `contact.created` | A contact is inserted via `create_record` |
| `company.created` | A company is inserted via `create_record` |

### End-to-end flow

```
Agent creates deal via create_record tool
  → DB insert succeeds, record returned
  → dispatchCrmEventTriggers(supabase, clientId, "deal.created", { record })
    → query agent_triggers WHERE trigger_type='crm_event'
        AND payload->>'event_type' = 'deal.created'
        AND enabled = true
        AND current_run_id IS NULL
    → for each match: atomic claim + fire-and-forget POST to /api/trigger/run
  → create_record returns to the agent (doesn't wait for trigger execution)

On the trigger's thread (async, background):
  → executeTrigger() inserts trigger-event message with deal snapshot
  → runAgent() reads instruction file + trigger payload
  → agent executes: web_search, web_scrape, update_record
  → writes findings to deal.notes / custom_fields
```

### User setup flow (via chat)

```
User: "When a new deal is created, research the company and add findings to the deal notes"

Agent:
  1. Creates instruction file → state/triggers/deal-research.md
  2. Calls setup_trigger({
       trigger_id: "crm_event",
       name: "Deal company research",
       instruction_path: "state/triggers/deal-research.md",
       params: { event_type: "deal.created" }
     })
  3. Confirms trigger is active

Later, when a deal is created:
  → Trigger fires automatically
  → Agent researches company via web_search + web_scrape
  → Writes findings to the deal record
```

---

## Files to change

### 1. DB migration — add `crm_event` trigger type

**New file:** `supabase/migrations/YYYYMMDD_add_crm_event_trigger_type.sql`

```sql
ALTER TABLE agent_triggers
  DROP CONSTRAINT agent_triggers_trigger_type_check;

ALTER TABLE agent_triggers
  ADD CONSTRAINT agent_triggers_trigger_type_check
  CHECK (trigger_type IN ('schedule', 'webhook', 'rss', 'pulse', 'crm_event'));
```

### 2. Schema — extend trigger type values

**File:** `src/lib/triggers/schemas.ts`

- Add `"crm_event"` to `triggerTypeValues` array

### 3. CRM event dispatcher (new module)

**New file:** `src/lib/triggers/crm-events.ts`

```typescript
export type CrmEventType =
  | "deal.created"
  | "deal.stage_changed"
  | "contact.created"
  | "company.created";

/**
 * Finds and dispatches all matching CRM event triggers for the given event.
 * Fire-and-forget — errors are logged but never propagate to the caller.
 */
export async function dispatchCrmEventTriggers(
  supabase: TriggerSupabaseClient,
  clientId: string,
  eventType: CrmEventType,
  eventPayload: Record<string, unknown>,
): Promise<void>
```

**Logic:**

1. Query `agent_triggers` for enabled `crm_event` triggers matching client + event type
2. For each match, atomic claim via UPDATE (reuse `claimWebhookTrigger` pattern)
3. Fire-and-forget `fetch()` to `/api/trigger/run` with cron secret
4. All errors logged, never propagated (CRM tool must not fail because a trigger failed)

### 4. Setup trigger tool — add `crm_event` case

**File:** `src/lib/runner/tools/triggers/setup-trigger.ts`

- Add `buildCrmEventInsertRow()` builder
- Params: `{ event_type: CrmEventType }`
- No `cron_expression`, no `next_fire_at` (purely event-driven)

### 5. CRM tools — emit events after mutations

**File:** `src/lib/runner/tools/crm/create-record.ts`

- After successful insert: `dispatchCrmEventTriggers(supabase, clientId, "${entity}.created", { record })`

**File:** `src/lib/runner/tools/crm/update-record.ts`

- After deal stage change: `dispatchCrmEventTriggers(supabase, clientId, "deal.stage_changed", { record, previous_stage, new_stage })`

### 6. Executor — handle `crm_event` type

**File:** `src/lib/triggers/executor.ts`

- `crm_event` follows the same path as schedule/webhook (insert trigger-event message + runAgent)
- Update analytics type mapping
- No special-casing needed

### 7. Search triggers — add to catalog

**File:** `src/lib/runner/tools/triggers/search-triggers.ts`

- Add `crm_event` entry to `TRIGGER_CATALOG`
- Keywords: `["crm", "event", "deal", "contact", "company", "created", "stage", "changed"]`

---

## What's NOT in scope (v1)

- No UI for creating CRM event triggers (agent-only via chat)
- No Postgres triggers or Supabase Database Webhooks
- No event filtering by stage/value (deferred to v2)
- No quiet hours for CRM events
- No retry logic beyond existing executor defaults (max 2 retries)

---

## Reference: How Attio Does It

Attio's webhook system (v2 API) is the closest external analogy. Key similarities and differences:

### Attio's Model

Attio exposes a `POST /v2/webhooks` API where you subscribe to event types with optional filters:

```json
{
  "target_url": "https://your-app.com/attio-webhook",
  "subscriptions": [
    {
      "event_type": "record.created",
      "filter": {
        "$and": [
          { "field": "parent_object_id", "operator": "equals", "value": "some_object_id" }
        ]
      }
    }
  ]
}
```

**Supported event types:** `record.created`, `record.updated`, `record.merged`, `record.deleted`, `task.created`, `task.updated`, `task.deleted`, `list-entry.created`, `list-entry.updated`, `list-entry.deleted`, `note.created`, `note.updated`, `note.deleted`, `comment.created`, `comment.resolved`, `comment.deleted`, etc.

**Webhook payload (v2):** Lightweight — contains IDs only, not full record snapshots:

```json
{
  "event_type": "list-entry.created",
  "id": {
    "workspace_id": "928e88d9-...",
    "list_id": "69815e80-...",
    "entry_id": "861c1071-..."
  },
  "parent_object_id": "7298c9b4-...",
  "parent_record_id": "6003a6aa-..."
}
```

**Filtering:** `$and` / `$or` with `equals` / `not_equals` operators on fields like `parent_object_id`.

### Comparison to Sunder's Approach

| Aspect | Attio | Sunder CRM Events |
|---|---|---|
| **Trigger mechanism** | External webhooks (HTTP POST to your server) | Internal dispatch (application-level, fire-and-forget to `/api/trigger/run`) |
| **Event granularity** | Generic: `record.created`, `record.updated` + object type filter | Specific: `deal.created`, `deal.stage_changed`, `contact.created`, `company.created` |
| **Payload** | IDs only — consumer must call API to fetch full record | Full record snapshot included in trigger payload |
| **Filtering** | Rich `$and`/`$or` filter expressions on any field | None in v1 (event type match only). Could add field filters in v2 |
| **Setup** | API call to create webhook subscription | Agent creates via `setup_trigger` tool in chat |
| **Consumer** | Any external HTTP server | Sunder's own agent (runs instruction file on trigger thread) |

### Key Takeaway

Attio's model is **outward-facing** — it notifies external systems. Sunder's model is **inward-facing** — it triggers its own agent to do work. The event taxonomy is similar (`record.created` ≈ `deal.created`), but Sunder can afford richer payloads since the consumer is internal.

The main idea from Attio worth considering for v2: **field-level filter expressions** (`$and`/`$or` on record fields). This would let users say "only trigger when a deal is created with stage = 'hot leads'" without custom instruction logic.

---

## Verification

1. **Unit tests:** `dispatchCrmEventTriggers` — mock Supabase, verify query/claim/dispatch
2. **Integration:** Create trigger → create deal → verify trigger fires and agent runs
3. **Manual E2E:** Chat "research company when deal created" → create deal → see research in notes
