# Timeline Audit Log — Handover Prompt

Copy everything below and paste it into a fresh Claude Code session.

---

## Task

Implement the Timeline Audit Log feature for Sunder's CRM. This adds automatic field-level change tracking to every CRM record (contacts, companies, deals, tasks), so users can see what changed, who changed it, and when — including changes made by the AI agent.

## Documents to read first

Read these 3 files before doing anything:

1. **Requirements doc** (what to build): `docs/product/ideations/2026-04-05-timeline-audit-log-requirements.md`
2. **Implementation plan** (how to build it): `docs/product/plans/2026-04-05-002-feat-timeline-audit-log-plan.md`
3. **Twenty CRM reference** (patterns to clone): `roadmap docs/Sunder - Source of Truth/references/twenty-crm/timeline-audit-log-reference.md`

## What this feature does

Every time a CRM record is created, updated, or deleted — whether by the user in the UI or by the AI agent — a timeline entry is automatically captured with:
- **Who** did it (user → "You", agent → "Sunder", system → "System")
- **What** changed (field-level diffs: "Stage: Lead → Qualified")
- **When** it happened (immutable timestamp)

The drawer's Timeline tab becomes a unified feed showing these audit events alongside existing manual interactions (calls, meetings, emails, etc.), grouped by month with a vertical timeline bar.

## Architecture (4 layers)

1. **Database** — New `timeline_activities` table + `upsert_timeline_activity` Postgres RPC function that handles 10-minute dedup (merges rapid successive edits by the same actor into one entry)
2. **Capture utility** — `src/lib/crm/timeline-capture.ts` — shared `captureTimelineActivity()` function that calculates field diffs and calls the RPC. Fire-and-forget (never blocks the mutation).
3. **Instrumentation** — Inject `captureTimelineActivity()` calls into all 13 CRM write paths (4 UI update hooks, 3 UI page-level creates/deletes, 6 agent tool functions). See the plan's Write Path Inventory table for the complete list.
4. **Frontend** — New `src/components/crm/timeline/` component directory replacing the old `ContactTimeline` and `InteractionTimeline` components. Renders month-grouped, icon-decorated timeline with inline field diffs for single-field updates and expandable cards for multi-field updates.

## Implementation order

Follow the 7 phases in the plan doc exactly:
1. Database migration + dedup RPC
2. Shared capture utility + Zod types
3. Instrument all 13 write paths
4. `useUnifiedTimeline` data hook (merges timeline_activities + interactions)
5. Frontend timeline components (7 new files in `src/components/crm/timeline/`)
6. Drawer integration (replace timeline in contact/deal drawers, add timeline tab to company/task drawers)
7. Tests

## Key constraints

- **Clone Twenty CRM's patterns** with minimal drift. The reference doc lists exactly what to copy and where we diverge (and why).
- **Fire-and-forget capture** — timeline logging must NEVER block or fail the CRM mutation.
- **Server-side dedup only** — the Postgres RPC owns the merge decision, not the client.
- **Dedup key**: `record_type` + `record_id` + `event_name` + `actor_type` within 10 minutes. Never merge different lifecycle events (create + update, update + delete).
- **Immutable `happened_at`** — sorting/grouping uses this column, not `created_at`/`updated_at`.
- **Unified feed** — Timeline tab merges audit events with all 6 existing interaction types (call, meeting, email, message, viewing, note).

## Blast radius

Very contained. The only things being replaced are:
- `ContactTimeline` component (used only in contact drawer)
- `InteractionTimeline` component (used only in deal drawer)

Dead code to delete as part of this PR:
- `src/components/crm/detail/activities-section.tsx` — not rendered anywhere
- `src/components/crm/detail/notes-section.tsx` — not rendered anywhere

The dashboard `RecentActivity` widget at `/customers` is untouched — it still works, just doesn't show audit events (can be upgraded later).

The `interactions` table is completely unchanged. Agent tools that create/search/delete interactions are unaffected.

## Visual reference

The timeline should look like Twenty CRM's timeline. Key visual patterns:

```
April 2026
─────────────────────────────────────────
(+)      Sarah Tan was created by You                    2 weeks ago
│
(pencil) You updated [Phone] Phone → +65 9876 5432      2 hours ago
│
(pencil) Sunder updated 3 fields on Sarah Tan    [v]     yesterday
│        ┌──────────────────────────────────────────┐
│        │ [Building] Company → PropNex Realty       │
│        │ [Tag] Type → Client                      │
│        │ [StickyNote] Notes → Investor, >3.5%     │
│        └──────────────────────────────────────────┘
│
(phone)  Call with Sarah Tan                             1 week ago
         Discussed Sunday viewing

March 2026
─────────────────────────────────────────
(trash)  Old Contact was deleted by Sunder               3 weeks ago
```

Icons: CirclePlus (created), PencilLine (updated), Trash2 (deleted). Existing interaction types keep their current icons (Phone, Calendar, Mail, etc.).

## Generate tasklist first

Before writing any code, generate a detailed tasklist following the project's tasklist conventions (see `feedback_tasklist_generation_rule.md` in memory). Save it to `docs/product/tasks/`. Get my approval before executing.
