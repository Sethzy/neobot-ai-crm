---
date: 2026-04-05
topic: timeline-audit-log
---

# Timeline Audit Log

## Problem Frame

Sunder is an autopilot that modifies CRM records on behalf of the user — moving deals through stages, updating contact details, creating tasks. Today, the user has no record of what the agent (or they themselves) changed. The Timeline tab only shows manually-logged interactions (calls, meetings, emails). There is no field-level change history.

This is a trust gap. Advisory sales practitioners need to see what happened to their records, who changed what, and when — especially when an AI agent is making changes autonomously.

## Requirements

- R1. **Automated field-change capture via a shared server-side layer.** Every CRM mutation (create, update, delete) on contacts, companies, deals, and tasks produces a timeline activity entry with: actor, action, field-level diff (before/after), and immutable event timestamp. Capture must happen in a shared utility that ALL write paths go through — UI page-level operations, `use-update-*` hooks, and agent tool functions (`create-record.ts`, `update-record.ts`, `delete-records.ts`, `tasks.ts`). No write path may bypass the audit boundary.
- R2. **Actor attribution.** Each timeline entry identifies who made the change: `user` (human via UI), `agent` (AI agent via tools), or `system` (cron/triggers/automation). User-initiated changes display "You"; agent changes display "Sunder"; system changes display "System".
- R3. **10-minute dedup window, server-side, keyed by record + action + actor.** Dedup happens in the database insert/upsert path (not client-side). Merge criteria must match Twenty exactly: same `record_type` + `record_id` + `event_name` (action type) + `actor` within 10 minutes. Different lifecycle events (create vs update vs delete) never merge, even if they happen within the window.
- R4. **Unified Timeline tab.** The drawer's Timeline tab renders both audit events (field changes) and all existing interaction types (call, meeting, email, message, viewing, note) in a single chronological feed, grouped by month. All 6 interaction types from the current schema must be preserved — not just calls/meetings/emails.
- R5. **Visual diff rendering.** Update events show which fields changed and their new values. Single-field updates render inline: `[author] updated [FieldIcon][FieldName] -> [newValue]`. Multi-field updates render in an expandable card listing all changed fields.
- R6. **Event type rendering.** Created events show `[record] was created by [author]`. Deleted events show `[record] was deleted by [author]`. Each action type has a distinct icon (CirclePlus, PencilLine, Trash2).
- R7. **Month grouping with vertical timeline bar.** Events grouped by month/year with a header and connected via a vertical line on the left, matching Twenty's visual pattern.
- R8. **Immutable event timestamp.** Each timeline activity must have an immutable `happened_at` column recording when the change actually occurred — separate from `created_at`/`updated_at`. Sorting and month grouping must use `happened_at` only, so dedup merges don't shift events to the wrong position.

## Success Criteria

- Opening any CRM record's Timeline tab shows a chronological feed of all changes made to that record
- Agent-initiated changes are visually distinguishable from user-initiated changes
- Rapid field edits in the drawer don't spam the timeline (dedup works)
- All existing interaction types (call, meeting, email, message, viewing, note) still appear in the unified timeline alongside audit events
- No CRM write path (UI pages, drawer hooks, agent tools, system automations) can modify a record without producing a timeline entry

## Scope Boundaries

- No linked-note / linked-task activity events (Twenty tracks these but we don't need them yet)
- No email / calendar integration events (not relevant to Sunder's current channels)
- No full-page timeline view — drawer tab only
- No "before" value display — only show the new value (like Twenty). Before value stored in DB for future use
- No undo/revert from timeline
- Keep existing `interactions` table unchanged — new `timeline_activities` table runs alongside it

## Key Decisions

- **Shared server-side capture utility, not per-hook instrumentation.** A single `captureTimelineActivity()` function that every write path calls. This is the audit boundary — if a write doesn't call it, that's a bug. Unlike Twenty (which uses an ORM event listener + message queue), we go synchronous because we have no persistent queue on Vercel serverless.
- **Server-side dedup only.** The insert/upsert path owns the merge decision. Client caches cannot see agent or system writes, so client-side dedup would be inconsistent.
- **Dedup key matches Twenty exactly.** `record_type` + `record_id` + `event_name` + `actor` within 10 minutes. Never merge different actions (create + update, update + delete).
- **`record_type` + `record_id` instead of polymorphic FKs.** Twenty uses per-type nullable FK columns (`targetPersonId`, `targetCompanyId`, etc.). We use a discriminated `record_type` enum + `record_id` UUID. Simpler, consistent with Sunder patterns.
- **Static field config instead of dynamic metadata.** Twenty resolves field icons/labels/types via a runtime metadata system. We use static maps derived from our Zod schemas + display utilities.
- **Unified feed.** Interactions and audit events merged chronologically in one Timeline tab. No separate tabs. Sort key: `happened_at` (timeline_activities) and `occurred_at` (interactions).

## Dependencies / Assumptions

- The existing `interactions` table and hooks remain unchanged
- All CRM write paths (UI + agent + system) can be routed through or augmented with the shared capture utility
- Agent tools in `src/lib/runner/tools/crm/` already have access to before/after state (they read before updating)

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] How exactly to capture the "before" state in UI page-level writes (creates/deletes) — these don't go through `use-update-*` hooks
- [Affects R1][Technical] For agent tool functions, where exactly to inject the capture call — in each tool's execute function or in a shared wrapper
- [Affects R4][Needs research] How to merge two different data shapes (interactions + timeline_activities) into one sorted list for the unified feed component — normalize to a common type or union type with discriminant

## Reference

Full Twenty implementation analysis: `roadmap docs/Sunder - Source of Truth/references/twenty-crm/timeline-audit-log-reference.md`

## Next Steps

-> `/plan` for structured implementation planning
