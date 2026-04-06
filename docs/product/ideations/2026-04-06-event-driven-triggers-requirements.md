---
date: 2026-04-06
topic: event-driven-triggers
---

# Event-Driven Triggers

## Problem Frame

Sunder's trigger system today is poll-based: a cron scanner runs every 60 seconds, checking `agent_triggers` rows for due schedule/rss/pulse types. The only event-driven path is the generic webhook type, which requires users to configure external services to POST to a Sunder URL manually.

Two categories of valuable triggers are missing:

1. **Internal CRM events** — "When a deal moves to Closing, draft a follow-up." These events happen inside Sunder's own database but have no way to fire an agent run today.
2. **External app events** — "When I get an email, triage it." These events happen in connected apps (Gmail, Calendar, Drive) but Sunder has no ingestion path for them.

Advisory sales practitioners need both. Internal triggers automate CRM workflow (the core product loop). External triggers extend the agent's reach to the practitioner's inbox and calendar — where most of their actual work happens.

## Requirements

### Part 1: Internal CRM Event Triggers (PR A)

- R1. When a CRM record (contact, company, deal, task) is created, updated, or deleted, an event is captured at the database layer and can fire an agent run.
- R2. Users configure internal triggers conversationally via the agent (e.g., "notify me when a deal moves to Closing"). No settings UI.
- R3. Each trigger specifies: entity type, action (create/update/delete), and optional field-level filter (e.g., "stage changed to Closing").
- R4. Each trigger has an instruction SOP (same `instruction_path` pattern as existing triggers). Agent reads the SOP and executes it when the trigger fires.
- R5. Internal triggers use the existing scanner/executor infrastructure. Latency target: event captured to agent invoked within 60 seconds.
- R6. The agent's `search_triggers` tool includes `db_event` in the catalog so the agent can discover and set up internal triggers conversationally.
- R7. The agent's `manage_active_triggers` tool supports list/view/delete/edit/simulate for internal triggers, consistent with existing trigger types.

### Part 2: External App Event Triggers via Composio (PR B)

- R8. When an event occurs in a connected external app (e.g., new Gmail message, Calendar event created), Composio delivers it to Sunder via webhook, and it can fire an agent run.
- R9. Users configure external triggers conversationally via the agent (e.g., "watch my Gmail for new emails"). No settings UI.
- R10. External triggers use a curated catalog of Composio trigger types. Initial catalog: Gmail (new message, email sent), Google Calendar (event created, event updated, event cancelled, event starting soon). Expand over time.
- R11. Each trigger has an instruction SOP (same pattern as R4).
- R12. Sunder receives Composio webhook events at a single project-level endpoint, verifies HMAC signature, matches to the correct `agent_trigger` row, and invokes the agent.
- R13. The trigger event payload (subject, sender, body text, etc.) is included in the agent's context when the run starts, so the agent can act on it without a follow-up API call for basic cases.
- R14. The agent's `search_triggers` and `manage_active_triggers` tools support external triggers, consistent with existing trigger types.
- R15. Composio trigger lifecycle is managed: creating a Sunder trigger creates a Composio trigger instance; deleting it deletes the Composio instance.

### Latency Upgrade Path (Ops, not code)

- R16. Phase A ships with Composio-managed OAuth (15 min polling floor). This is acceptable for launch.
- R17. Registering Sunder's own Google OAuth app (1 min polling) is a separate ops task that should start immediately as it takes 1-4 weeks for Google verification.
- R18. When own OAuth is ready, switching to 1 min polling requires only Composio dashboard config changes (per-toolkit auth config) and user reconnection — no code changes.

## Success Criteria

- A user can say "when a deal moves to Closing, draft a follow-up email" and the agent sets up an internal trigger that fires within 60 seconds of the deal update.
- A user can say "watch my Gmail and summarize new emails" and the agent sets up an external trigger that fires when a new email arrives (within polling interval).
- Both trigger types appear in the agent's trigger catalog and are manageable via existing trigger tools.
- No regression to existing trigger types (schedule, webhook, rss, pulse).

## Scope Boundaries

- **No settings UI for triggers.** Agent-only creation and management, consistent with existing pattern.
- **No Pipedream integration.** Composio is sufficient for launch. Revisit only if 1 min polling proves insufficient.
- **No real-time (sub-minute) external triggers.** Polling-based via Composio. The Pub/Sub approach (Pipedream-style) is explicitly deferred.
- **No dynamic Composio catalog discovery.** Curated catalog only. Agent does not query Composio's full trigger type list at runtime.
- **No Google OAuth app registration in this work.** That's a separate ops task (R17). Code ships working with managed OAuth at 15 min polling.
- **Internal triggers use the existing scanner tick (60s).** Near-instant via `pg_notify` is deferred.

## Key Decisions

- **Composio over Pipedream for external triggers:** Already integrated, no new vendor. Polling latency is acceptable for advisory sales use cases. See `references/tasklet/trigger-system-internals.md` for full comparison.
- **Agent-only UX:** Consistent with existing schedule/webhook/rss triggers. No new UI surfaces.
- **Curated catalog:** Predictable, tested. Avoids surfacing untested Composio triggers that could confuse the agent.
- **Instruction SOP pattern:** Same as existing triggers. User defines what the agent should do when the event fires.
- **Two separate PRs:** Part 1 (internal) is self-contained Postgres + scanner. Part 2 (external) adds Composio webhook infra. Independent review and rollback.
- **`@composio/core` for SDK:** Already initialized in `src/lib/composio/client.ts`. Exposes `composio.triggers.*` — no new package needed.

## Dependencies / Assumptions

- Composio webhook subscription API (`POST /api/v3/webhook_subscriptions`) is stable and supports project-level webhook URL.
- Composio `@composio/core` SDK exposes `triggers.create`, `triggers.delete`, `triggers.verifyWebhook` — confirmed in verification.
- Gmail trigger `message_text` field may be a snippet, not full body. Agent should use `payload` (raw Gmail object) for full fidelity or follow up with Gmail tools.
- `attachment_list` does not contain file bytes — agent must use Gmail tools for attachment download.
- Switching Composio auth config to custom OAuth only affects new connections; existing users must reconnect.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Should Postgres triggers insert into a queue table (scanner picks up) or use a direct route (bypassing scanner)? Queue is simpler; direct route is lower latency.
- [Affects R3][Technical] What field-level filter syntax should `agent_triggers.payload` use for `db_event` type? Needs to support equality checks ("stage = Closing") and possibly "changed from X to Y."
- [Affects R12][Technical] How to map incoming Composio webhook to the correct `agent_trigger` row, given that Composio only supports one project-level webhook URL (no per-trigger URL)? Likely by Composio trigger instance ID in the payload.
- [Affects R10][Needs research] Confirm exact Composio trigger slugs for the curated catalog. We have `GMAIL_NEW_GMAIL_MESSAGE` and `GMAIL_EMAIL_SENT_TRIGGER` confirmed. Need to verify Calendar slugs.
- [Affects R13][Needs research] Confirm what fields Composio actually includes in the webhook payload for each curated trigger type. The `triggersTypes.retrieve()` schema may not match the actual fired payload.

## Reference Material

- Full research + verification: `roadmap docs/Sunder - Source of Truth/references/tasklet/trigger-system-internals.md`
- Verification prompt + dev response: `roadmap docs/Sunder - Source of Truth/references/tasklet/composio-triggers-verification-prompt.md`
- Existing trigger infrastructure: `src/lib/triggers/`, `app/api/cron/scan/`, `app/api/trigger/`
- Composio client: `src/lib/composio/client.ts`

## Next Steps

`/plan` for structured implementation planning (two PRs: Part 1 internal, Part 2 external)
