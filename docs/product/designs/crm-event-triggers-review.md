# CRM Event Triggers — Review Notes

**Date:** 2026-04-01  
**Reviewer:** Codex  
**Related proposal:** `docs/product/designs/crm-event-triggers.md`

## Executive Summary

The proposal is directionally right on three points:

- `crm_event` belongs in the trigger system, not as a one-off CRM feature.
- Application-level emission from Sunder's CRM mutation boundary is the right integration point for v1.
- The initial event set should stay narrow.

But the current design is **not implementation-safe as written** against the existing trigger system.

The biggest issue is that Sunder's current trigger runtime tracks only **one in-flight claim per trigger definition** (`agent_triggers.current_run_id`). That works for schedules and inbound webhooks because those sources can be re-scanned or retried externally. It does **not** give CRM events a durable per-occurrence queue. Under the proposed design, CRM events can be dropped when:

1. the matching trigger is already running,  
2. the matching thread is already busy, or  
3. the fire-and-forget dispatch never completes.

Because CRM events originate inside Sunder, there is no external sender to retry them. That makes reliable per-event persistence the key missing design piece.

## Compatibility with the Existing Trigger System

### What Fits Cleanly

- `agent_triggers` already supports non-scheduled trigger types with `cron_expression` / `next_fire_at = null`, so `crm_event` fits the current table shape.
- `src/lib/triggers/executor.ts` already has the generic path needed for non-pulse triggers:
  - build trigger-event message
  - insert system message into the trigger thread
  - call `runAgent()`
- `src/lib/runner/tools/triggers/setup-trigger.ts` and `src/lib/runner/tools/triggers/search-triggers.ts` can be extended in a straightforward way.
- `src/lib/triggers/webhook-claim.ts` is a usable pattern reference for an atomic event-driven claim helper.

### What Does Not Fit Safely Yet

#### 1. `agent_triggers.current_run_id` is not a durable CRM event queue

The proposal matches triggers with `current_run_id IS NULL`, then claims and dispatches them. That means a CRM event that occurs while the same trigger is already running has no durable place to go.

Current behavior by source:

- schedules: can be re-picked later because `next_fire_at` persists
- inbound webhooks: return `409` and rely on the sender to retry
- CRM events: have no retrying sender

For CRM events, `409` or "skip if busy" is data loss.

#### 2. `/api/trigger/run` is synchronous today

`app/api/trigger/run/route.ts` directly calls `executeTrigger()` and waits for the result. That route is built for the cron scanner, which needs an immediate success/failure signal to manage retries.

The proposal says CRM tools should do a fire-and-forget POST to `/api/trigger/run`. That creates a bad choice:

- `await fetch(...)`: CRM write tools block on the full triggered agent run
- `void fetch(...)`: best-effort delivery only, vulnerable to request teardown / network failure

That is not a reliable delivery contract for internal CRM mutations.

#### 3. Busy-thread queueing loses the exact trigger occurrence

`executeTrigger()` currently inserts the trigger-event system message first, then calls `runAgent()` with the generic nudge:

`"Process the most recent trigger event for this thread."`

If the thread is busy, the queue only stores that generic nudge plus `triggerType`. It does **not** store the specific trigger occurrence or payload.

That is already a soft edge for low-frequency schedules. For CRM events it becomes a correctness problem:

- multiple CRM events can queue behind an active thread
- the follow-up run only gets "process the most recent trigger event"
- older queued trigger-event blocks can become ambiguous or effectively skipped

#### 4. Batch CRM writes are unspecified

Both CRM tools support batches:

- `create_record`: up to 50 records
- `update_record`: up to 50 updates

The proposal only describes single-record emission. Before implementation, the design needs to state whether batch writes:

- emit one automation event per affected record,
- emit one batched event, or
- deliberately do not emit CRM events in v1.

This matters for both correctness and cost.

#### 5. UI surfaces are already affected

Even without a UI trigger-creation flow, `crm_event` will surface in the existing automations UI:

- `useTriggers()` already loads all non-pulse triggers
- `AutomationsTable` only has labels/config formatting for `schedule`, `webhook`, `rss`
- the Automations page copy only mentions scheduled jobs, inbound webhooks, and RSS

So the proposal's "files to change" list is incomplete.

#### 6. Mutation-boundary assumption is temporary

The proposal assumes all relevant create/update mutations happen through:

- `src/lib/runner/tools/crm/create-record.ts`
- `src/lib/runner/tools/crm/update-record.ts`

That is true enough for direct create/update in v1, but it is not a durable architecture. There are already direct UI delete paths in the dashboard pages, which shows the codebase is not converging on a single CRM mutation boundary yet. If CRM eventing is meant to last, emission should move behind shared CRM write helpers rather than staying tool-local.

## Platform Research

## HubSpot Workflows

Official docs reviewed:

- https://knowledge.hubspot.com/workflows/set-your-workflow-enrollment-triggers
- https://knowledge.hubspot.com/reports/create-custom-events
- https://knowledge.hubspot.com/workflows/how-do-i-use-webhooks-with-hubspot-workflows

Observed model:

- Trigger taxonomy is broad, not just record-change:
  - when an event occurs
  - when filter criteria is met
  - when a webhook is received
  - based on a schedule
  - manual
- The workflow docs explicitly allow up to **250 enrollment filters**.
- Event triggers and filter triggers are separate concepts.
- Records enroll once by default, but workflows can be configured to **re-enroll every time the trigger occurs**.
- Custom event enrollment can be refined further with additional filters.
- Custom event enrollment triggers are OR-combined when multiple event triggers are added.

Payload / context shape:

- HubSpot's contract is record-enrollment centric, not raw-event centric.
- The workflow runs against the enrolled record and associated-object data.
- For custom events, event properties are available and monitored in Event Management.
- For outbound webhooks, HubSpot can POST record data to external systems.

Execution model / failure handling:

- Managed workflow engine with enrollment history and action execution history.
- Webhook actions are explicitly regulated separately and can slow an action when the webhook is slow or times out.
- Event ingestion docs expose delivery-error monitoring for custom events.
- In the docs reviewed, I did **not** find a clean general-purpose "every failed record-trigger action retries N times" rule for standard record-trigger workflows.

Takeaway for Sunder:

- HubSpot strongly validates **record-centric enrollment + trigger-level conditions + explicit re-enrollment**.
- It also suggests Sunder should not ship record-change automations without at least a minimal condition model.

## Salesforce Flow / Process Builder

Official docs reviewed:

- https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/build-a-record-triggered-flow
- https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/meet-flow-trigger-explorer
- https://trailhead.salesforce.com/content/learn/projects/migrate-workflows-and-processes-to-flows

Observed model:

- Salesforce's current automation center of gravity is **record-triggered Flow**.
- Process Builder / Workflow Rules are legacy enough that Salesforce now has a dedicated "Migrate Workflows and Processes to Flows" path.
- Record-triggered Flow supports:
  - created
  - updated
  - deleted
  - created or updated
- It also distinguishes execution timing:
  - before-save
  - after-save
  - run asynchronously
  - scheduled paths
- Flow Trigger Explorer is used to inspect and control execution ordering.
- Salesforce explicitly notes that **asynchronous path execution order is not guaranteed**.

Payload / context shape:

- Flow operates on the current record context rather than an external payload envelope.
- Conditions are defined in the flow start element, then the flow can branch further.

Execution model / failure handling:

- Strongly modeled execution stages and ordering.
- Pending scheduled executions are visible in Time-Based Automations.
- The docs reviewed clearly expose ordering and pending execution management; they do not present Flow as a best-effort fire-and-forget mechanism.

Takeaway for Sunder:

- Salesforce reinforces two design needs:
  - start conditions belong in the trigger definition, not hidden in instruction text
  - execution ordering / pending-event handling matters once record-change automations become common

## Pipedrive Automations

Official docs reviewed:

- https://support.pipedrive.com/en/article/workflow-automation
- https://support.pipedrive.com/en/article/workflow-automation-frequency-limits
- https://support.pipedrive.com/en/article/automations-date-triggers-faq

Observed model:

- Pipedrive supports two major trigger families:
  - **event triggers**
  - **date triggers**
- Event triggers support six entities:
  - deal
  - person
  - activity
  - lead
  - organization
  - project
- Each event-trigger entity supports three trigger events:
  - added
  - updated
  - deleted
- Trigger conditions can be suggested or custom.
- More advanced flows can add wait-for-condition or if/else branches.

Payload / context shape:

- Like HubSpot and Salesforce, the automation model is record-centric.
- Users do not define a raw event payload; actions operate on the item that triggered the automation.

Execution model / failure handling:

- Actions execute sequentially from top to bottom.
- Pipedrive notes that an action can fail and the automation will not automatically resume later. Example from the docs: if a create-deal action fails because the account is at its open-deal limit, the automation does not resume even if the limit issue is later fixed.
- Pending delayed executions can be cancelled from History.
- Pipedrive imposes **frequency limits** explicitly to prevent loops and infrastructure abuse.
- Their docs call out cross-automation chaining as a reason these limits exist.

Takeaway for Sunder:

- Pipedrive is the clearest evidence that CRM-event automation needs **loop guards** and **execution-history visibility** from day one.

## Zoho CRM Workflow Rules

Official docs reviewed:

- https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflow-management/articles/configuring-workflow-rules
- https://help.zoho.com/portal/en/kb/crm/faqs/automation/workflow-rules/articles/faqs-workflow

Observed model:

- Zoho supports richer record-change trigger taxonomy than the current Sunder proposal:
  - create
  - edit
  - create or edit
  - delete
  - date/time based
  - score based
- For edit-triggered rules, Zoho distinguishes:
  - any field edited
  - specific fields edited
  - section edited
- Zoho exposes a "Repeat this workflow every time a record is edited" control.
- Rules can trigger field updates, tasks, webhooks, custom functions, and record creation.

Payload / context shape:

- Record-centric workflow evaluation with criteria patterns and action rules.

Execution model / failure handling:

- Scheduled actions can be rescheduled or deleted when later edits change whether criteria still match.
- Zoho's docs explicitly describe built-in loop stopping:
  - self-trigger loop stops after 2 executions
  - cross-workflow loop stops after 3 executions

Takeaway for Sunder:

- Zoho is the strongest reference point for adding a **simple recursion cap** early instead of treating loops as purely prompt-level behavior.

## Recommended Changes Before Implementation

### 1. Add a durable per-occurrence event layer

This is the most important change.

Do **not** model CRM events as "claim the trigger row and immediately run it." That makes each trigger definition carry both configuration and occurrence state, which is not enough for an internal event stream.

Recommended shape:

- keep `agent_triggers` as the trigger-definition table
- add an `agent_trigger_events` (or similarly named) table for individual CRM event occurrences

Suggested columns:

- `id`
- `trigger_id`
- `client_id`
- `thread_id`
- `event_type`
- `payload`
- `status` (`pending` / `claimed` / `queued` / `completed` / `failed`)
- `current_run_id`
- `retry_count`
- `created_at`
- `claimed_at`
- `completed_at`
- `source_run_id` nullable

Suggested flow:

1. CRM mutation succeeds.
2. Match enabled `crm_event` triggers.
3. Insert one durable event row per matched trigger occurrence.
4. Claim event rows, not trigger rows.
5. Executor loads event row payload and starts the trigger run.

This solves:

- lost events when the trigger definition is already busy
- lack of per-occurrence retry state
- lack of exact event identity in the queue

### 2. Preserve exact event identity through busy-thread queueing

Do not queue only `CRON_RUN_NUDGE`.

Queue at least one of:

- `trigger_event_id`
- full serialized trigger occurrence payload

Otherwise multiple queued CRM events on the same thread remain ambiguous.

### 3. Use a hybrid payload, not full record snapshot only

Attio's ID-only payload is too thin for Sunder. The current proposal's full-record snapshot is too heavy for Sunder's trigger-event message format.

Recommended v1 payload:

```json
{
  "event_type": "deal.stage_changed",
  "entity": "deals",
  "record_id": "uuid",
  "changed_fields": ["stage"],
  "before": { "stage": "lead" },
  "after": { "stage": "qualified" },
  "snapshot": {
    "address": "123 Main St",
    "stage": "qualified",
    "amount": 850000
  }
}
```

Rationale:

- enough context for simple instructions
- small enough for the trigger-event message
- full record can still be fetched via `search_crm`

### 4. Add recursion metadata and a hard cap

This should not be left entirely to prompting.

At minimum, persist:

- `source_run_id`
- `source_trigger_id`
- `dispatch_depth`

Recommended v1 policy:

- hard cap at depth 2 or 3
- log and drop beyond the cap

If implementation simplicity is more important than chaining in v1, an even safer initial rule is:

- CRM event triggers do not emit further CRM events when the current run itself was started by a trigger

That is more restrictive, but safer than silent loops.

### 5. Add a minimal condition model in v1

Full Attio-style `$and` / `$or` expressions can wait.

But stage/value filtering should **not** be deferred entirely if this feature ships. Every major reference platform exposes conditions at trigger setup time.

Recommended minimal v1:

- exact-equals filters only
- small allowlist of keys

Examples:

- `deal.stage_changed` with `new_stage = "qualified"`
- `deal.created` with `record.stage = "lead"`

This is enough to support the motivating use case without building a full expression engine.

### 6. Keep the event taxonomy narrow in v1

I would **not** add `deal.updated` or `record.deleted` to the first implementation.

Recommended v1 events:

- `deal.created`
- `deal.stage_changed`
- `contact.created`
- `company.created`

Why not `deal.updated` yet:

- too noisy without field-level filters
- much higher recursion risk
- poor prompt ergonomics

Why not `record.deleted` yet:

- payload must be captured pre-delete
- mutation boundary is not centralized enough yet
- current proposal does not need it for the primary use case

### 7. Define batch behavior explicitly

This needs a written rule before implementation starts.

My recommendation:

- emit **one event per affected record**
- cap burst dispatch per mutation
- document that large batch writes may create many automation runs

If that is too expensive for v1, the safer fallback is:

- CRM event triggers fire only for single-record writes in v1

But that must be explicit in the design.

### 8. Move toward a shared CRM mutation boundary

Tool-local emission is acceptable as a temporary bridge, but it should be treated as temporary.

Recommended direction:

- extract shared CRM write helpers
- have both agent tools and future UI/API write paths call those helpers

This is especially important if Sunder later adds:

- "Add deal" UI
- imports
- public/internal APIs
- deleted/linked/unlinked events

### 9. Add an index for CRM trigger matching

Once CRM writes emit events synchronously, trigger lookup sits on the hot path of every matching mutation.

Recommended DB support:

- partial index for enabled idle `crm_event` triggers by `client_id`
- expression index on `payload->>'event_type'`

Without this, trigger lookup becomes a table scan against `agent_triggers` on every CRM write.

### 10. Update the existing automations surfaces

At minimum:

- add `crm_event` label + config formatting in `src/components/automations/automations-table.tsx`
- update copy in `app/(dashboard)/automations/page.tsx`
- ensure trigger list / view / edit responses render sensible arguments for CRM event triggers

## Suggested PR Planning

This should be a **new PR entry**, not a silent extension of historical PR 20.

Reason:

- it introduces a new trigger source
- it crosses trigger runtime + CRM mutation boundaries
- it likely needs a durable event-occurrence layer, not just an enum extension
- it affects automations UI and queue semantics

If it is added to the phased plan, it fits best as a follow-on trigger PR after the existing trigger work, not as a retroactive amendment inside PR 20.

## Recommended Status

**Do not implement from the current design doc without revision.**

Recommended next step:

- revise `crm-event-triggers.md` to incorporate the durable event-occurrence model, queue identity preservation, minimal trigger filters, and recursion handling
- then split the work into a dedicated PR entry

## Sources

Official external references reviewed on 2026-04-01:

- HubSpot workflow enrollment triggers:
  - https://knowledge.hubspot.com/workflows/set-your-workflow-enrollment-triggers
- HubSpot custom events:
  - https://knowledge.hubspot.com/reports/create-custom-events
- HubSpot workflow webhooks:
  - https://knowledge.hubspot.com/workflows/how-do-i-use-webhooks-with-hubspot-workflows
- Salesforce record-triggered flow:
  - https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/build-a-record-triggered-flow
- Salesforce Flow Trigger Explorer:
  - https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/meet-flow-trigger-explorer
- Salesforce workflow/process migration:
  - https://trailhead.salesforce.com/content/learn/projects/migrate-workflows-and-processes-to-flows
- Pipedrive automations:
  - https://support.pipedrive.com/en/article/workflow-automation
- Pipedrive automation frequency limits:
  - https://support.pipedrive.com/en/article/workflow-automation-frequency-limits
- Pipedrive date trigger execution history FAQ:
  - https://support.pipedrive.com/en/article/automations-date-triggers-faq
- Zoho CRM workflow rules:
  - https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflow-management/articles/configuring-workflow-rules
- Zoho CRM workflow FAQs:
  - https://help.zoho.com/portal/en/kb/crm/faqs/automation/workflow-rules/articles/faqs-workflow
