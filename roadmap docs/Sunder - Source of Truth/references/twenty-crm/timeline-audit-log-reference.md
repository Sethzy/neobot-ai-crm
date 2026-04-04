# Twenty CRM: Timeline Audit Log Reference

> Reference analysis for cloning Twenty's timeline/audit log feature into Sunder.
> Source repo: https://github.com/twentyhq/twenty (cloned at `/Users/sethlim/Documents/twenty`)
> Date: 2026-04-05

---

## 1. Architecture Overview

Twenty's timeline audit log is an event-driven system with 4 layers:

```
ORM (insert/update/delete)
  -> Event Emission (diff calculation, event formatting)
    -> Message Queue (entityEventsToDbQueue)
      -> Job Processor (upsert with 10-minute dedup)
        -> timelineActivity table (persisted)

Frontend reads timelineActivity table and renders:
  EventList -> EventsGroup (month) -> EventRow -> EventRowMainObject -> EventFieldDiff
```

---

## 2. Backend: Data Model

### 2.1 TimelineActivity Entity

**File:** `packages/twenty-server/src/modules/timeline/standard-objects/timeline-activity.workspace-entity.ts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `happensAt` | Date | When the activity occurred |
| `name` | string \| null | Event type: `"company.created"`, `"person.updated"`, `"linked-note.created"` |
| `properties` | JSON \| null | Contains `{ diff, before, after, updatedFields }` |
| `linkedRecordCachedName` | string \| null | Cached display name of linked record |
| `linkedRecordId` | string \| null | ID of linked record (note/task) |
| `linkedObjectMetadataId` | string \| null | Object metadata ID of linked record |
| `workspaceMemberId` | string \| null | Who made the change |
| `targetPersonId` | string \| null | Polymorphic FK to person |
| `targetCompanyId` | string \| null | Polymorphic FK to company |
| `targetOpportunityId` | string \| null | Polymorphic FK to opportunity |
| `targetNoteId` | string \| null | Polymorphic FK to note |
| `targetTaskId` | string \| null | Polymorphic FK to task |
| `createdAt` | timestamp | Auto-generated |
| `updatedAt` | timestamp | Auto-generated |

### 2.2 Event Name Convention

Format: `{objectSingularName}.{action}` or `linked-{objectSingularName}.{action}`

Actions: `created`, `updated`, `deleted`, `restored`

Examples:
- `company.created` — A company record was created
- `person.updated` — A person record was updated
- `linked-note.created` — A note was linked to a record

### 2.3 Properties JSON Shape

For **create** events:
```json
{ "after": { /* full record */ } }
```

For **update** events:
```json
{
  "updatedFields": ["stage", "amount"],
  "before": { /* full record before */ },
  "after": { /* full record after */ },
  "diff": {
    "stage": { "before": "lead", "after": "qualified" },
    "amount": { "before": 100000, "after": 150000 }
  }
}
```

For **delete** events:
```json
{
  "before": { /* full record before */ },
  "after": { /* record with deletedAt set */ },
  "updatedFields": ["deletedAt"],
  "diff": { "deletedAt": { "before": null, "after": "2026-04-05T..." } }
}
```

---

## 3. Backend: Event Capture

### 3.1 Diff Calculation

**File:** `packages/twenty-server/src/engine/core-modules/event-emitter/utils/object-record-changed-values.ts`

Core function that compares old vs new record field-by-field:

```typescript
export const objectRecordChangedValues = (
  oldRecord: Partial<ObjectRecord>,
  newRecord: Partial<ObjectRecord>,
  objectMetadataItem: FlatObjectMetadata,
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
) => {
  return Object.keys(newRecord).reduce((acc, key) => {
    // Skip: updatedAt, searchVector, RELATION fields
    if (key === 'updatedAt' || key === 'searchVector' || field?.type === 'RELATION') {
      return acc;
    }
    // Compare using deepEqual
    if (deepEqual(oldRecordValue, newRecordValue)) {
      return acc;
    }
    acc[key] = { before: oldRecordValue, after: newRecordValue };
    return acc;
  }, {});
};
```

**Key pattern:** Skip auto-updated fields (`updatedAt`), skip relations (they have their own events), use deep equality for comparison.

### 3.2 Diff Type

**File:** `packages/twenty-shared/src/database-events/object-record-diff.ts`

```typescript
export type ObjectRecordDiff<T> = {
  [K in keyof T]: { before: T[K]; after: T[K] };
};
```

### 3.3 Base Event Class

**File:** `packages/twenty-shared/src/database-events/object-record.base.event.ts`

```typescript
export class ObjectRecordBaseEvent<T = object> {
  recordId: string;
  userId?: string;
  workspaceMemberId?: string;
  properties: {
    updatedFields?: string[];
    before?: T;
    after?: T;
    diff?: Partial<ObjectRecordDiff<T>>;
  };
}
```

### 3.4 Event Emission Point

**File:** `packages/twenty-server/src/engine/twenty-orm/utils/format-twenty-orm-event-to-database-batch-event.util.ts`

Events are emitted from the ORM layer after INSERT/UPDATE/DELETE operations. The ORM compares before/after states, calculates the diff, and emits an event with the full payload.

**File:** `packages/twenty-server/src/engine/api/graphql/workspace-query-runner/listeners/entity-events-to-db.listener.ts`

The listener routes events to the message queue. Only objects with `isAuditLogged: true` generate timeline activities. DESTROY (permanent delete) events are excluded.

---

## 4. Backend: Event Processing

### 4.1 Job Processor

**File:** `packages/twenty-server/src/modules/timeline/jobs/upsert-timeline-activity-from-internal-event.job.ts`

```typescript
@Processor(MessageQueue.entityEventsToDbQueue)
export class UpsertTimelineActivityFromInternalEvent {
  @Process(UpsertTimelineActivityFromInternalEvent.name)
  async handle(workspaceEventBatch: WorkspaceEventBatch<ObjectRecordNonDestructiveEvent>) {
    // 1. Filter out non-audited objects
    // 2. Map userId -> workspaceMemberId
    // 3. Delegate to TimelineActivityService.upsertEvents()
  }
}
```

### 4.2 Timeline Activity Service

**File:** `packages/twenty-server/src/modules/timeline/services/timeline-activity.service.ts`

Transforms raw events into `TimelineActivityPayload`:

```typescript
type TimelineActivityPayload = {
  properties: ObjectRecordBaseEvent['properties'];
  linkedObjectMetadataId?: string;
  linkedRecordId?: string;
  linkedRecordCachedName?: string;
  workspaceMemberId?: string;
  name: string;        // e.g. "company.updated"
  recordId: string;    // target record ID
  objectSingularName?: string;
};
```

### 4.3 10-Minute Dedup & Upsert

**File:** `packages/twenty-server/src/modules/timeline/repositories/timeline-activity.repository.ts`

**Algorithm:**
1. For each new payload, query for existing timeline activity with:
   - Same `recordId` (target object)
   - Same `name` (event type)
   - Same `workspaceMemberId` (actor)
   - Created within last **10 minutes**
2. If match found: **merge diffs** and UPDATE existing record
3. If no match: INSERT new timeline activity

**Diff merge** (`object-record-diff-merge.ts`):
```typescript
// Common fields: keep before from old, after from new
// Old-only fields: keep as-is
// New-only fields: add them
```

Example: User changes field A, then field B within 10 minutes:
- First: `{ diff: { A: { before: 'x', after: 'y' } } }`
- Second: `{ diff: { B: { before: 'p', after: 'q' } } }`
- Merged: `{ diff: { A: { before: 'x', after: 'y' }, B: { before: 'p', after: 'q' } } }`

---

## 5. Frontend: Rendering Pipeline

### 5.1 Component Tree

```
TimelineCard (entry point, data fetching)
  EventList (filtering, month grouping)
    EventsGroup (month header + vertical bar)
      EventRow (icon + author + timestamp)
        EventRowDynamicComponent (routes by event type)
          EventRowMainObject (created/updated/deleted/restored)
            EventRowMainObjectUpdated (field diff rendering)
              EventFieldDiffContainer (per-field)
                EventFieldDiff (icon + label + arrow + value)
                  EventFieldDiffLabel
                  EventFieldDiffValue (reuses FieldDisplay)
          EventRowActivity (linked note/task)
          EventRowMessage (linked email)
          EventRowCalendarEvent (linked calendar)
```

### 5.2 Key Frontend Files

| File | Purpose |
|------|---------|
| `modules/activities/timeline-activities/components/TimelineCard.tsx` | Entry point, fetches data |
| `modules/activities/timeline-activities/components/EventList.tsx` | Filters invalid activities, groups by month |
| `modules/activities/timeline-activities/components/EventsGroup.tsx` | Month header + vertical timeline bar |
| `modules/activities/timeline-activities/components/EventRow.tsx` | Individual row: icon, author name, timestamp |
| `modules/activities/timeline-activities/rows/components/EventRowDynamicComponent.tsx` | Routes to specific row type |
| `modules/activities/timeline-activities/rows/components/EventIconDynamicComponent.tsx` | Maps action to icon |
| `modules/activities/timeline-activities/rows/main-object/components/EventRowMainObject.tsx` | Handles create/update/delete/restore |
| `modules/activities/timeline-activities/rows/main-object/components/EventRowMainObjectUpdated.tsx` | Renders field diffs for updates |
| `modules/activities/timeline-activities/rows/main-object/components/EventFieldDiff.tsx` | Single field diff: label -> value |
| `modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffContainer.tsx` | Looks up field metadata |
| `modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffLabel.tsx` | Field icon + name |
| `modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffValue.tsx` | Rendered field value |
| `modules/activities/timeline-activities/rows/main-object/components/EventFieldDiffValueEffect.tsx` | Populates record store for FieldDisplay |
| `modules/activities/timeline-activities/hooks/useTimelineActivities.ts` | Data fetching hook |
| `modules/activities/timeline-activities/types/TimelineActivity.ts` | TypeScript type |
| `modules/activities/timeline-activities/utils/groupEventsByMonth.ts` | Month grouping utility |
| `modules/activities/timeline-activities/utils/getTimelineActivityAuthorFullName.ts` | Author display name |
| `modules/activities/timeline-activities/utils/filterOutInvalidTimelineActivities.ts` | Validates diff keys |
| `modules/activities/timeline-activities/rows/components/EventCard.tsx` | Expandable card wrapper |
| `modules/activities/timeline-activities/rows/components/EventCardToggleButton.tsx` | Chevron toggle |

### 5.3 Visual Rendering Pattern

**Created event:**
```
(+) [author] was created by [You]                    [timestamp]
```

**Single field update:**
```
(pencil) [author] updated [icon][FieldName] -> [newValue]     [timestamp]
```

**Multiple field update (expanded):**
```
(pencil) [author] updated 3 fields on [RecordName]   [v]      [timestamp]
  +--------------------------------------------+
  | [icon] Stage -> Qualified                  |
  | [icon] Amount -> $150,000                  |
  | [icon] Notes -> Updated pricing            |
  +--------------------------------------------+
```

**Deleted event:**
```
(trash) [author] was deleted by [You]                 [timestamp]
```

### 5.4 Event Icon Mapping

```typescript
created  -> IconCirclePlus    (lucide: CirclePlus)
updated  -> IconEditCircle    (lucide: PencilLine or EditCircle equivalent)
deleted  -> IconTrash          (lucide: Trash2)
restored -> IconRestore        (lucide: RotateCcw)
default  -> linked object's icon
```

### 5.5 Month Grouping

```typescript
type EventGroup = { month: number; year: number; items: TimelineActivity[] };
```

Groups sorted descending (newest first). Each group renders a month/year header with a horizontal rule.

### 5.6 Author Display

- If current user made the change: shows **"You"**
- Otherwise: shows `firstName lastName`
- Fallback: "Twenty" (system)

---

## 6. Where Sunder Must Drift (and Why)

### 6.1 No Message Queue -> Synchronous Capture

**Twenty:** Uses BullMQ message queue (`entityEventsToDbQueue`) for async event processing.

**Sunder:** Runs on Vercel serverless with Supabase. No persistent message queue available.

**Drift:** Capture timeline events **synchronously** in application-level hooks (the `use-update-*.ts` mutation hooks or a shared utility called from the API route). Alternatively, use a **Postgres trigger** to capture changes at the database level.

**Recommended approach:** Application-level capture in the mutation hooks/API layer. Postgres triggers are harder to debug, don't know about the actor (user vs agent), and can't access application context.

### 6.2 No GraphQL -> Supabase Client

**Twenty:** Frontend fetches timeline via GraphQL with `useFindManyRecords`.

**Sunder:** Uses Supabase client + TanStack Query.

**Drift:** Replace GraphQL hook with a standard `useQuery` + `supabase.from('timeline_activities').select(...)` pattern, consistent with all other Sunder data hooks.

### 6.3 No Polymorphic Relations -> record_type + record_id Pattern

**Twenty:** Uses polymorphic FK columns (`targetPersonId`, `targetCompanyId`, `targetOpportunityId`, etc.) — one nullable FK per object type.

**Sunder:** Our CRM has 4 object types (contacts, companies, deals, tasks). Using polymorphic FKs would mean 4 nullable columns. This is workable but the `record_type` + `record_id` discriminated pattern is simpler and consistent with how Sunder handles other cross-entity references.

**Drift:** Use `record_type` enum + `record_id` UUID instead of per-type nullable FKs. This is a simplification, not a divergence in behavior.

### 6.4 No Object Metadata System -> Static Field Maps

**Twenty:** Uses a dynamic object metadata system to look up field types, icons, and labels at runtime. The `EventFieldDiffValue` component reuses `FieldDisplay` by populating a Jotai store with an artificial record.

**Sunder:** CRM schemas are static (Zod schemas in `src/lib/crm/schemas.ts`). Field metadata is known at build time.

**Drift:** Replace the dynamic metadata lookup with static field config maps. Instead of Twenty's `FieldDisplay` + Jotai store pattern, render field values directly using our existing display utilities (`formatCrmEnumLabel`, `formatCrmPrice`, etc.).

### 6.5 Actor: User vs Agent vs System

**Twenty:** Only tracks `workspaceMemberId` (human users).

**Sunder:** Has 3 actor types — the human user, the AI agent, and the system (cron/triggers).

**Drift:** Add an `actor_type` column (`'user' | 'agent' | 'system'`) to the timeline table. This is an extension, not a divergence. The frontend renders "You" for user, "Sunder" (or agent name) for agent, "System" for automated actions.

### 6.6 Existing Interactions Table

**Twenty:** Has a single unified timeline system. No separate interactions table.

**Sunder:** Already has an `interactions` table (call, meeting, email, viewing, note) for manually-logged CRM interactions.

**Drift:** Keep the `interactions` table as-is. The new `timeline_activities` table captures automated field-change events. The Timeline tab in the drawer renders BOTH — interactions (manual) and timeline_activities (automated) — merged chronologically. This gives a unified view without requiring a data migration.

### 6.7 No i18n / Lingui

**Twenty:** Uses `@lingui/react/macro` for internationalization.

**Sunder:** No i18n system.

**Drift:** Use plain strings. Trivial.

### 6.8 No Linaria Styled Components

**Twenty:** Uses `@linaria/react` for CSS-in-JS styling.

**Sunder:** Uses Tailwind CSS.

**Drift:** Rewrite styles as Tailwind classes. The layout/spacing patterns from Twenty should be preserved.

---

## 7. Files to Create in Sunder

### 7.1 Database

| File | Description |
|------|-------------|
| `supabase/migrations/YYYYMMDD_create_timeline_activities.sql` | New table + RLS policies + index |

**Table schema (derived from Twenty):**

```sql
CREATE TABLE public.timeline_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  record_type TEXT NOT NULL,           -- 'contact', 'company', 'deal', 'task'
  record_id UUID NOT NULL,             -- FK to the target record
  name TEXT NOT NULL,                  -- 'contact.created', 'deal.updated', etc.
  properties JSONB,                    -- { diff, before, after, updatedFields }
  actor_type TEXT NOT NULL DEFAULT 'user',  -- 'user', 'agent', 'system'
  actor_label TEXT,                    -- Display name: user name, 'Sunder', 'System'
  linked_record_type TEXT,             -- For linked note/task events
  linked_record_id UUID,
  linked_record_name TEXT,             -- Cached display name
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by record
CREATE INDEX idx_timeline_activities_record
  ON public.timeline_activities(client_id, record_type, record_id, created_at DESC);

-- RLS
ALTER TABLE public.timeline_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.timeline_activities
  USING (client_id = current_setting('app.client_id')::uuid);
```

### 7.2 Backend / Hooks

| File | Description |
|------|-------------|
| `src/lib/crm/timeline-activity.ts` | Core utility: `captureTimelineActivity()` — builds diff, dedup, insert |
| `src/hooks/use-timeline-activities.ts` | TanStack Query hook to fetch timeline activities for a record |

### 7.3 Frontend Components

| File | Twenty Equivalent | Description |
|------|-------------------|-------------|
| `src/components/crm/timeline/timeline-activity-list.tsx` | `EventList.tsx` | Filters, groups by month, renders groups |
| `src/components/crm/timeline/timeline-activity-group.tsx` | `EventsGroup.tsx` | Month header + vertical timeline bar |
| `src/components/crm/timeline/timeline-activity-row.tsx` | `EventRow.tsx` | Icon + content + timestamp |
| `src/components/crm/timeline/timeline-activity-updated.tsx` | `EventRowMainObjectUpdated.tsx` | Field diff rendering for updates |
| `src/components/crm/timeline/timeline-field-diff.tsx` | `EventFieldDiff.tsx` | Single field: icon + label + arrow + value |
| `src/components/crm/timeline/timeline-activity-icon.tsx` | `EventIconDynamicComponent.tsx` | Action -> icon mapping |
| `src/components/crm/timeline/utils.ts` | Various utils | `groupByMonth`, `getAuthorLabel`, field value formatting |

### 7.4 Integration Points

| File | Change |
|------|--------|
| `src/hooks/use-update-contact.ts` | Add timeline capture on mutation success |
| `src/hooks/use-update-company.ts` | Add timeline capture on mutation success |
| `src/hooks/use-update-deal.ts` | Add timeline capture on mutation success |
| `src/hooks/use-update-crm-task.ts` | Add timeline capture on mutation success |
| `app/api/chat/route.ts` (or runner tools) | Capture agent-initiated changes |
| `src/components/crm/record-drawer/*-drawer-content.tsx` | Replace current timeline with new unified timeline |

---

## 8. What to Copy Exactly (No Drift)

These patterns should be cloned as closely as possible:

1. **Diff shape:** `{ [fieldName]: { before, after } }` — identical to Twenty
2. **Event name convention:** `{objectType}.{action}` — identical
3. **Properties JSON structure:** `{ diff, before, after, updatedFields }` — identical
4. **10-minute dedup window** — same algorithm, same merge logic
5. **Month grouping utility** — port `groupEventsByMonth` directly
6. **Visual layout:** Icon column + vertical line + content + timestamp — same structure
7. **Single vs multi-field rendering:** Inline for 1 field, expandable card for 2+ — same pattern
8. **Field diff format:** `[icon] [FieldName] -> [newValue]` — same visual
9. **Author display:** "You" for self, name for others — same logic
10. **Action icons:** CirclePlus (created), PencilLine (updated), Trash2 (deleted), RotateCcw (restored)

---

## 9. Complete Twenty File Manifest

### Backend
```
packages/twenty-shared/src/database-events/
  object-record-diff.ts                    # Diff type definition
  object-record.base.event.ts             # Base event class
  object-record-create.event.ts           # Create event
  object-record-update.event.ts           # Update event
  object-record-delete.event.ts           # Delete event
  object-record-restore.event.ts          # Restore event
  object-record-destroy.event.ts          # Destroy event (excluded from timeline)

packages/twenty-server/src/modules/timeline/
  standard-objects/timeline-activity.workspace-entity.ts   # Data model
  types/timeline-activity-payload.ts                       # Payload type
  constants/system-objects-with-timeline-activities.constant.ts
  services/timeline-activity.service.ts                    # Core service
  repositories/timeline-activity.repository.ts             # Dedup & persistence
  jobs/upsert-timeline-activity-from-internal-event.job.ts # Job processor
  timeline-activity.module.ts                              # Module registration
  jobs/timeline-job.module.ts                              # Job module
  utils/timeline-activity-related-morph-field-metadata-name-builder.util.ts
  utils/extract-object-singular-name-from-target-column-name.util.ts

packages/twenty-server/src/engine/core-modules/event-emitter/utils/
  object-record-changed-values.ts         # Diff calculation
  object-record-diff-merge.ts             # Diff merging for dedup

packages/twenty-server/src/engine/twenty-orm/utils/
  format-twenty-orm-event-to-database-batch-event.util.ts  # Event formatting

packages/twenty-server/src/engine/api/graphql/workspace-query-runner/listeners/
  entity-events-to-db.listener.ts         # Event routing to queue
```

### Frontend
```
packages/twenty-front/src/modules/activities/timeline-activities/
  components/
    TimelineCard.tsx                       # Entry point
    EventList.tsx                          # Grouping + filtering
    EventsGroup.tsx                        # Month header
    EventRow.tsx                           # Individual row
  rows/
    components/
      EventRowDynamicComponent.tsx         # Type router
      EventIconDynamicComponent.tsx        # Icon mapping
      EventCard.tsx                        # Expandable card
      EventCardToggleButton.tsx            # Toggle chevron
    main-object/components/
      EventRowMainObject.tsx               # Created/updated/deleted/restored
      EventRowMainObjectUpdated.tsx        # Field diff rendering
      EventFieldDiffContainer.tsx          # Field metadata lookup
      EventFieldDiff.tsx                   # Label + arrow + value
      EventFieldDiffLabel.tsx              # Icon + field name
      EventFieldDiffValue.tsx              # Rendered value
      EventFieldDiffValueEffect.tsx        # Store population
    activity/components/
      EventRowActivity.tsx                 # Linked note/task
    message/components/
      EventRowMessage.tsx                  # Linked email
      EventCardMessage.tsx                 # Email preview
    calendar/components/
      EventRowCalendarEvent.tsx            # Linked calendar
      EventCardCalendarEvent.tsx           # Calendar preview
  hooks/
    useTimelineActivities.ts              # Data fetching
    useLinkedObjectsTitle.ts              # Batch title fetch
    useLinkedObjectObjectMetadataItem.ts  # Metadata lookup
  types/
    TimelineActivity.ts                    # Core type
    TimelineActivityLinkedObject.ts        # Linked object type
  utils/
    groupEventsByMonth.ts                  # Month grouping
    getTimelineActivityAuthorFullName.ts   # Author name
    filterOutInvalidTimelineActivities.ts  # Validation
  contexts/
    TimelineActivityContext.ts             # React context
  constants/
    FindManyTimelineActivitiesOrderBy.ts   # Sort order
```
