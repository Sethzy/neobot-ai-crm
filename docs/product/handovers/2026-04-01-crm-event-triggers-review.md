# Handover: CRM Event Triggers — Design Review & Research

**Date:** 2026-04-01
**Author:** Seth
**Status:** Design doc written, needs deeper review before implementation

---

## Context

We want Sunder's agent to automatically do work when something changes in the CRM — for example, when a new deal is created, the agent researches the company and writes findings to the deal notes. Today, triggers only fire from external sources (cron schedules, inbound webhooks, RSS feeds). Nothing fires when records change inside Sunder's own CRM.

A design doc has been written: `docs/product/designs/crm-event-triggers.md`

It proposes a new trigger type (`crm_event`) that fires when CRM records are created or deal stages change. The agent's `create_record` and `update_record` tools would emit events after successful mutations, which get matched against registered triggers and dispatched to the agent on a separate thread.

---

## What you need to do

### 1. Review the design doc

Read `docs/product/designs/crm-event-triggers.md` end to end. Understand the proposed architecture, the files it touches, and the end-to-end flow.

### 2. Validate against the existing trigger system

Read the actual implementation of the trigger system and confirm the design is compatible:

- `src/lib/triggers/schemas.ts` — trigger types and row schema
- `src/lib/triggers/executor.ts` — how triggers are executed
- `src/lib/triggers/scanner.ts` — how scheduled triggers are claimed and dispatched
- `src/lib/triggers/webhook-claim.ts` — atomic claim pattern (proposed for reuse)
- `app/api/trigger/webhook/[triggerId]/route.ts` — webhook ingress (pattern reference)
- `app/api/trigger/run/route.ts` — internal dispatch endpoint
- `src/lib/runner/tools/triggers/setup-trigger.ts` — how triggers are created
- `src/lib/runner/tools/triggers/search-triggers.ts` — trigger catalog
- `src/lib/runner/tools/crm/create-record.ts` — where deal/contact/company creation happens
- `src/lib/runner/tools/crm/update-record.ts` — where deal stage changes happen

### 3. Research how other platforms handle CRM events

We've already looked at:

- **Attio** — webhook subscriptions with `record.created`/`record.updated` events + `$and`/`$or` field filters. Payloads are ID-only (consumer fetches full record). Documented in the design doc.
- **DenchClaw** (`/Users/sethlim/Documents/DenchClaw-1`) — no automatic triggers at all. Manual action buttons only. No event emission after record mutations.

Please also research:

- **HubSpot** workflows — how do they trigger automations on record creation/updates? What event types and filter conditions do they support?
- **Salesforce** Flow/Process Builder — how does their trigger-on-record-change system work?
- **Pipedrive** automations — what CRM events can trigger workflows?
- **Any other CRM with event-driven automation** that's relevant

Focus on: event taxonomy (what events exist), filter/condition model (how users narrow which records trigger), payload shape (what data is passed), and execution model (sync vs async, retries, failure handling).

### 4. Identify gaps or risks in the design

Specifically look for:

- **Race conditions** — Can a CRM event trigger create a record that triggers another CRM event trigger? Is there a recursion risk? Should we cap trigger depth?
- **Thread contention** — The trigger fires on its own thread, but what if that thread is busy with another run? The existing system returns 409/queued — is that acceptable for CRM events?
- **Payload size** — We're including the full record snapshot in the trigger payload. Is this the right call vs Attio's ID-only approach?
- **Missing events** — Should we support `deal.updated` (any field change) and `record.deleted` in v1, or is the proposed set sufficient?
- **UI creation path** — The design assumes deals are only created via the agent's `create_record` tool. If we later add UI-based record creation (e.g., an "Add deal" button), we'd need to emit events from there too. Is this a concern?
- **Filter expressions** — The design defers field-level filters to v2. Is that the right call, or should we include basic filters (e.g., "only fire when stage = X") from the start?

### 5. Write up your findings

Add your review notes, research findings, and recommendations directly to the design doc or as a companion doc in `docs/product/designs/`. Flag anything that should change before implementation begins.

---

## Key files

| File | What it is |
|---|---|
| `docs/product/designs/crm-event-triggers.md` | The design doc to review |
| `src/lib/triggers/` | Trigger system core (schemas, executor, scanner) |
| `src/lib/runner/tools/triggers/` | Agent-facing trigger tools (setup, manage, search) |
| `src/lib/runner/tools/crm/` | CRM tools (create-record, update-record) |
| `app/api/trigger/` | Trigger API routes (webhook ingress, run endpoint) |

---

## Authority chain reminder

1. **v2 plan** (`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`) — wins on scope and phasing
2. **App Spec** (`roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`) — product vision
3. **Arch Decisions** (`roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`) — technical rationale

CRM event triggers are not currently in the v2 plan — this is a new feature proposal. The reviewer should assess whether it fits as an extension of the existing trigger PRs (19-22) or needs its own PR entry.
