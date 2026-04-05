# Timeline Audit Log Implementation Plan

**Goal:** Add automatic field-level audit logging for CRM contacts, companies, deals, and tasks, then render those audit events together with existing interactions in a unified drawer Timeline tab.

**Architecture:** Add a new `timeline_activities` table plus a Postgres `upsert_timeline_activity` RPC that owns 10-minute deduplication. Route every CRM write path through a shared `captureTimelineActivity()` helper, then build a `useUnifiedTimeline()` hook and a new `src/components/crm/timeline/` component set that replaces the current contact and deal timeline UIs.

**Tech Stack:** Supabase Postgres + RLS + RPC, Supabase JS client, Next.js App Router, React 19, TanStack Query, Vitest + React Testing Library, Zod, Lucide React, `date-fns`

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

## Preflight Notes

- Use `@test-driven-development` for all TypeScript and React code in this PR.
- Save work under `docs/product/tasks/` for this handoff. The generic rule block says `docs/tasks/`, but the feature handoff explicitly overrides that path.
- The current implementation plan’s effective write-path inventory is **13**, not 14. Use the plan’s final `Write Path Inventory (13 paths)` table as the source of truth.
- The handoff says to delete `src/components/crm/detail/activities-section.tsx` and `src/components/crm/detail/notes-section.tsx`, but those files are already absent in the current tree. Do not spend time on that cleanup unless they reappear.
- Add file-level JSDoc to every new module.
- In new CRM timeline UI code, use semantic tokens only. Do not introduce raw Tailwind palette accents like `bg-amber-500` or `text-green-600`.
- Keep the `interactions` table unchanged. Audit history lives beside it, not inside it.
- Timeline capture is best-effort and fire-and-forget. Never let a timeline failure fail the underlying CRM mutation.

## Relevant Files

- Create: `supabase/migrations/20260405100001_create_timeline_activities.sql`
- Create: `src/lib/crm/timeline-capture.ts`
- Create: `src/lib/crm/__tests__/timeline-capture.test.ts`
- Create: `src/hooks/use-unified-timeline.ts`
- Create: `src/hooks/__tests__/use-unified-timeline.test.tsx`
- Create: `src/components/crm/timeline/unified-timeline.tsx`
- Create: `src/components/crm/timeline/timeline-month-group.tsx`
- Create: `src/components/crm/timeline/timeline-event-row.tsx`
- Create: `src/components/crm/timeline/timeline-audit-row.tsx`
- Create: `src/components/crm/timeline/timeline-field-diff.tsx`
- Create: `src/components/crm/timeline/timeline-interaction-row.tsx`
- Create: `src/components/crm/timeline/timeline-event-icon.tsx`
- Create: `src/components/crm/timeline/utils.ts`
- Create: `src/components/crm/timeline/__tests__/unified-timeline.test.tsx`
- Modify: `src/lib/crm/schemas.ts`
- Modify: `src/types/database.ts`
- Modify: `src/hooks/use-update-contact.ts`
- Modify: `src/hooks/use-update-company.ts`
- Modify: `src/hooks/use-update-deal.ts`
- Modify: `src/hooks/use-update-crm-task.ts`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `src/lib/runner/tools/crm/create-record.ts`
- Modify: `src/lib/runner/tools/crm/update-record.ts`
- Modify: `src/lib/runner/tools/crm/delete-records.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`
- Modify: `src/lib/runner/tools/crm/link-records.ts`
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/company-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/task-drawer-content.tsx`
- Modify: `src/hooks/__tests__/use-update-contact.test.ts`
- Modify: `src/hooks/__tests__/use-update-company.test.ts`
- Modify: `src/hooks/__tests__/use-update-deal.test.ts`
- Modify: `src/hooks/__tests__/use-update-crm-task.test.ts`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `src/lib/runner/tools/crm/__tests__/create-record.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/update-record.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/delete-records.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/link-records.test.ts`
- Modify: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx`
- Delete: `src/components/crm/contact-timeline.tsx`
- Delete: `src/components/crm/interaction-timeline.tsx`
- Delete: `src/components/crm/__tests__/contact-timeline.test.tsx`
- Delete: `src/components/crm/__tests__/interaction-timeline.test.tsx`

---

### Task 1: Database Migration and Dedup RPC

**Files:**
- Create: `supabase/migrations/20260405100001_create_timeline_activities.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the migration file**

Create `supabase/migrations/20260405100001_create_timeline_activities.sql` with:

```sql
-- Timeline audit log for CRM records.
create table public.timeline_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  record_type text not null check (record_type in ('contact', 'company', 'deal', 'task')),
  record_id uuid not null,
  name text not null,
  properties jsonb,
  actor_type text not null default 'user' check (actor_type in ('user', 'agent', 'system')),
  actor_label text,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_timeline_activities_lookup
  on public.timeline_activities(client_id, record_type, record_id, happened_at desc);

create index idx_timeline_activities_dedup
  on public.timeline_activities(client_id, record_type, record_id, name, actor_type, created_at desc);

create trigger update_timeline_activities_updated_at
  before update on public.timeline_activities
  for each row execute function update_updated_at_column();

alter table public.timeline_activities enable row level security;

create policy timeline_activities_select_own
  on public.timeline_activities for select
  using (client_id = public.get_my_client_id());

create policy timeline_activities_insert_own
  on public.timeline_activities for insert
  with check (client_id = public.get_my_client_id());

create policy timeline_activities_update_own
  on public.timeline_activities for update
  using (client_id = public.get_my_client_id());

create policy timeline_activities_delete_own
  on public.timeline_activities for delete
  using (client_id = public.get_my_client_id());
```

Add the `public.upsert_timeline_activity(...)` function in the same migration. Requirements:
- Dedup key is `client_id + record_type + record_id + name + actor_type`
- Dedup window is `created_at > now() - interval '10 minutes'`
- `happened_at` never changes on merge
- Diff merge keeps the oldest `before` and the newest `after`
- Use `security definer`
- Set an explicit search path in the function body

**Step 2: Apply the migration locally**

Run:

```bash
supabase db reset
```

Expected: all migrations apply successfully and the new migration completes without SQL errors.

**Step 3: Regenerate database types**

Run:

```bash
supabase gen types typescript --local > src/types/database.ts
```

Expected: `timeline_activities` and the `upsert_timeline_activity` RPC appear in `src/types/database.ts`.

**Step 4: Smoke-check the generated type surface**

Open `src/types/database.ts` and verify:
- table columns include `happened_at`, `actor_type`, `actor_label`, `properties`
- RPC args include `p_client_id`, `p_record_type`, `p_record_id`, `p_name`, `p_properties`, `p_actor_type`, `p_actor_label`, `p_happened_at`

**Step 5: Commit**

```bash
git add supabase/migrations/20260405100001_create_timeline_activities.sql src/types/database.ts
git commit -m "feat: add timeline activities table and dedup rpc"
```

---

### Task 2: Shared Capture Utility and CRM Schemas

**Files:**
- Create: `src/lib/crm/timeline-capture.ts`
- Create: `src/lib/crm/__tests__/timeline-capture.test.ts`
- Modify: `src/lib/crm/schemas.ts`

**Step 1: Write the failing tests for diff calculation and RPC invocation**

Create `src/lib/crm/__tests__/timeline-capture.test.ts` with tests for:
- `calculateDiff` returns `null` for no-op updates
- `calculateDiff` skips `created_at`, `updated_at`, `client_id`, `search_vector`
- `captureTimelineActivity()` sends `created` events with `{ after }`
- `captureTimelineActivity()` sends `deleted` events with `{ before }`
- `captureTimelineActivity()` sends `updated` events with `{ diff, before, after, updatedFields }`
- `captureTimelineActivity()` swallows RPC errors
- `captureTimelineActivity()` defaults labels to `Sunder` and `System`

Example test skeleton:

```typescript
it("builds updated properties and calls the dedup rpc", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: "activity-1", error: null });

  await captureTimelineActivity({
    supabase: { rpc } as never,
    clientId: "client-1",
    recordType: "contact",
    recordId: "record-1",
    action: "updated",
    actorType: "user",
    before: { first_name: "Sarah", phone: null },
    after: { first_name: "Sarah", phone: "+6598765432" },
  });

  expect(rpc).toHaveBeenCalledWith(
    "upsert_timeline_activity",
    expect.objectContaining({
      p_name: "contact.updated",
      p_properties: expect.objectContaining({
        updatedFields: ["phone"],
      }),
    }),
  );
});
```

**Step 2: Run the new test file and verify it fails**

Run:

```bash
pnpm vitest run src/lib/crm/__tests__/timeline-capture.test.ts
```

Expected: FAIL because `timeline-capture.ts` does not exist yet.

**Step 3: Implement the minimal capture utility**

Create `src/lib/crm/timeline-capture.ts` with:
- `ActorType`, `TimelineRecordType`, `CrmTimelineAction` string unions
- `calculateDiff(before, after)`
- `captureTimelineActivity(params)`
- best-effort `void supabase.rpc(...)` call wrapped in `Promise.resolve(...).catch(...)`

Use this interface:

```typescript
interface CaptureTimelineActivityParams {
  supabase: SupabaseClient<Database>;
  clientId: string;
  recordType: "contact" | "company" | "deal" | "task";
  recordId: string;
  action: "created" | "updated" | "deleted";
  actorType: "user" | "agent" | "system";
  actorLabel?: string;
  happenedAt?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}
```

**Step 4: Add Zod schemas and exported types**

Modify `src/lib/crm/schemas.ts` to add:
- `timelineActorTypeValues`
- `timelineRecordTypeValues`
- `timelineActivitySchema`
- `timelineActivityPropertiesSchema`
- `timelineAuditDiffSchema`
- `unifiedTimelineEntrySchema` or a pair of exported TS types for the merged feed

Keep the schema boring and explicit. Do not introduce enums.

**Step 5: Re-run the focused tests**

Run:

```bash
pnpm vitest run src/lib/crm/__tests__/timeline-capture.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/crm/timeline-capture.ts src/lib/crm/__tests__/timeline-capture.test.ts src/lib/crm/schemas.ts
git commit -m "feat: add shared timeline capture utility"
```

---

### Task 3: Instrument All 13 CRM Write Paths

**Files:**
- Modify: `src/hooks/use-update-contact.ts`
- Modify: `src/hooks/use-update-company.ts`
- Modify: `src/hooks/use-update-deal.ts`
- Modify: `src/hooks/use-update-crm-task.ts`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `src/lib/runner/tools/crm/create-record.ts`
- Modify: `src/lib/runner/tools/crm/update-record.ts`
- Modify: `src/lib/runner/tools/crm/delete-records.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`
- Modify: `src/lib/runner/tools/crm/link-records.ts`
- Modify: `src/hooks/__tests__/use-update-contact.test.ts`
- Modify: `src/hooks/__tests__/use-update-company.test.ts`
- Modify: `src/hooks/__tests__/use-update-deal.test.ts`
- Modify: `src/hooks/__tests__/use-update-crm-task.test.ts`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `src/lib/runner/tools/crm/__tests__/create-record.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/update-record.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/delete-records.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/link-records.test.ts`

**Step 1: Write the failing hook tests**

Update these tests:
- `src/hooks/__tests__/use-update-contact.test.ts`
- `src/hooks/__tests__/use-update-company.test.ts`
- `src/hooks/__tests__/use-update-deal.test.ts`
- `src/hooks/__tests__/use-update-crm-task.test.ts`

Add assertions that:
- `captureTimelineActivity()` is called after a successful mutation
- the correct `recordType`, `recordId`, `action: "updated"`, and `actorType: "user"` are sent
- the helper receives a full `before` snapshot from cache or a fallback query
- a no-op timeline failure does not reject the mutation promise

Also fix the existing invalid task status in `use-update-crm-task.test.ts` from `"completed"` to `"done"` while touching that file.

**Step 2: Run the hook tests and verify they fail**

Run:

```bash
pnpm vitest run \
  src/hooks/__tests__/use-update-contact.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts
```

Expected: FAIL because none of the hooks call `captureTimelineActivity()` yet.

**Step 3: Implement capture in the four update hooks**

In each hook:
- read the `before` snapshot from the detail query cache first
- fall back to a Supabase read if the cache is missing and the diff needs a full record
- call `captureTimelineActivity()` in `onSuccess`
- build `after` from the committed update payload plus the previous record

Specific targets:
- `useUpdateContact(contactId)`
- `useUpdateCompany(companyId)`
- `useUpdateDeal(dealId)`
- `useUpdateCrmTask(taskId)` and `useUpdateCrmTaskMutation()`

**Step 4: Re-run the hook tests**

Run the same command from Step 2.

Expected: PASS.

**Step 5: Write the failing page-level mutation tests**

Update these page tests:
- `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- `app/(dashboard)/tasks/__tests__/page.test.tsx`

Add coverage for:
- contact create
- contact delete
- company create
- company delete
- deal create
- deal delete
- task create

Each test should assert that successful page-level mutations call `captureTimelineActivity()` with the correct `created` or `deleted` action and `actorType: "user"`.

**Step 6: Run the page tests and verify they fail**

Run:

```bash
pnpm vitest run \
  app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.test.tsx
```

Expected: FAIL because the pages do not invoke timeline capture yet.

**Step 7: Implement capture in page-level create and delete mutations**

Modify:
- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/tasks/page.tsx`

Implementation rules:
- create paths use inserted row as `after`
- delete paths read the row before deletion and send it as `before`
- keep UX behavior unchanged
- timeline capture remains fire-and-forget

**Step 8: Re-run the page tests**

Run the same command from Step 6.

Expected: PASS.

**Step 9: Write the failing agent-tool tests**

Update:
- `src/lib/runner/tools/crm/__tests__/create-record.test.ts`
- `src/lib/runner/tools/crm/__tests__/update-record.test.ts`
- `src/lib/runner/tools/crm/__tests__/delete-records.test.ts`
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- `src/lib/runner/tools/crm/__tests__/link-records.test.ts`

Add assertions that:
- `create_record` captures `created`
- `update_record` captures `updated`
- `delete_records` captures `deleted` for contacts, companies, deals, and tasks
- `create_task` and `update_task` capture task audit entries
- `link_records` captures FK updates on `contact_company` and `deal_company`

Do not add coverage for contact-deal link rows, because junction table events are out of scope for this feature.

**Step 10: Run the agent-tool tests and verify they fail**

Run:

```bash
pnpm vitest run \
  src/lib/runner/tools/crm/__tests__/create-record.test.ts \
  src/lib/runner/tools/crm/__tests__/update-record.test.ts \
  src/lib/runner/tools/crm/__tests__/delete-records.test.ts \
  src/lib/runner/tools/crm/__tests__/tasks.test.ts \
  src/lib/runner/tools/crm/__tests__/link-records.test.ts
```

Expected: FAIL because the tools do not call `captureTimelineActivity()` yet.

**Step 11: Implement capture in the five agent-tool modules**

Modify:
- `src/lib/runner/tools/crm/create-record.ts`
- `src/lib/runner/tools/crm/update-record.ts`
- `src/lib/runner/tools/crm/delete-records.ts`
- `src/lib/runner/tools/crm/tasks.ts`
- `src/lib/runner/tools/crm/link-records.ts`

Implementation rules:
- actor type is always `"agent"`
- keep current analytics and record-note behavior intact
- batch operations capture one event per record
- delete paths fetch `before` before deleting
- `link_records` only captures the two FK-updating relationships

**Step 12: Re-run the agent-tool tests**

Run the same command from Step 10.

Expected: PASS.

**Step 13: Commit**

```bash
git add \
  src/hooks/use-update-contact.ts \
  src/hooks/use-update-company.ts \
  src/hooks/use-update-deal.ts \
  src/hooks/use-update-crm-task.ts \
  app/'(dashboard)'/customers/people/page.tsx \
  app/'(dashboard)'/customers/companies/page.tsx \
  app/'(dashboard)'/customers/deals/page.tsx \
  app/'(dashboard)'/tasks/page.tsx \
  src/lib/runner/tools/crm/create-record.ts \
  src/lib/runner/tools/crm/update-record.ts \
  src/lib/runner/tools/crm/delete-records.ts \
  src/lib/runner/tools/crm/tasks.ts \
  src/lib/runner/tools/crm/link-records.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.test.tsx \
  src/lib/runner/tools/crm/__tests__/create-record.test.ts \
  src/lib/runner/tools/crm/__tests__/update-record.test.ts \
  src/lib/runner/tools/crm/__tests__/delete-records.test.ts \
  src/lib/runner/tools/crm/__tests__/tasks.test.ts \
  src/lib/runner/tools/crm/__tests__/link-records.test.ts
git commit -m "feat: instrument crm write paths for timeline audit"
```

---

### Task 4: Unified Timeline Data Hook

**Files:**
- Create: `src/hooks/use-unified-timeline.ts`
- Create: `src/hooks/__tests__/use-unified-timeline.test.tsx`
- Modify: `src/lib/crm/schemas.ts`

**Step 1: Write the failing hook tests**

Create `src/hooks/__tests__/use-unified-timeline.test.tsx` covering:
- merges audit entries and interactions into one list
- sorts by `happened_at` for audit entries and `occurred_at` for interactions
- disables interaction fetches for `company` and `task`
- subscribes to realtime invalidation for `timeline_activities`
- returns stable empty arrays for no data

Example assertion:

```typescript
expect(result.current.data.map((entry) => entry.kind)).toEqual([
  "audit",
  "interaction",
  "audit",
]);
```

**Step 2: Run the new hook test and verify it fails**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-unified-timeline.test.tsx
```

Expected: FAIL because `use-unified-timeline.ts` does not exist yet.

**Step 3: Implement `useUnifiedTimeline()`**

Create `src/hooks/use-unified-timeline.ts` with:
- a fetch for `timeline_activities`
- conditional interaction fetches for contact and deal
- merged return shape with a discriminant like `kind: "audit" | "interaction"`
- descending sort by event timestamp
- realtime invalidation for `timeline_activities`

Prefer a small pure helper for merging and sorting if it simplifies the tests.

**Step 4: Export any missing timeline types**

If the hook needs explicit types that are awkward in Zod, add exported TS types in `src/lib/crm/schemas.ts` beside the new schemas.

**Step 5: Re-run the hook tests**

Run:

```bash
pnpm vitest run src/hooks/__tests__/use-unified-timeline.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/hooks/use-unified-timeline.ts src/hooks/__tests__/use-unified-timeline.test.tsx src/lib/crm/schemas.ts
git commit -m "feat: add unified timeline data hook"
```

---

### Task 5: Timeline Components and Twenty-Style Rendering

**Files:**
- Create: `src/components/crm/timeline/unified-timeline.tsx`
- Create: `src/components/crm/timeline/timeline-month-group.tsx`
- Create: `src/components/crm/timeline/timeline-event-row.tsx`
- Create: `src/components/crm/timeline/timeline-audit-row.tsx`
- Create: `src/components/crm/timeline/timeline-field-diff.tsx`
- Create: `src/components/crm/timeline/timeline-interaction-row.tsx`
- Create: `src/components/crm/timeline/timeline-event-icon.tsx`
- Create: `src/components/crm/timeline/utils.ts`
- Create: `src/components/crm/timeline/__tests__/unified-timeline.test.tsx`

**Step 1: Write the failing component tests**

Create `src/components/crm/timeline/__tests__/unified-timeline.test.tsx` covering:
- month grouping headers render correctly
- create/update/delete audit rows render with `CirclePlus`, `PencilLine`, `Trash2`
- single-field updates render inline diff text
- multi-field updates render an expandable summary card
- interaction rows preserve existing interaction labels and summaries
- empty state renders for records with no timeline entries
- author labels render as `You`, `Sunder`, and `System`

**Step 2: Run the component tests and verify they fail**

Run:

```bash
pnpm vitest run src/components/crm/timeline/__tests__/unified-timeline.test.tsx
```

Expected: FAIL because the component directory does not exist yet.

**Step 3: Implement the timeline utilities first**

Create `src/components/crm/timeline/utils.ts` with:
- month-grouping helper
- author-label helper
- field label and icon maps
- formatting helpers for changed values

Clone Twenty’s rendering rules with minimal drift:
- create: `"{record} was created by {author}"`
- delete: `"{record} was deleted by {author}"`
- single update: `"{author} updated {field} -> {newValue}"`
- multi update: `"{author} updated {n} fields on {record}"`

**Step 4: Implement the atomic row components**

Create:
- `timeline-event-icon.tsx`
- `timeline-field-diff.tsx`
- `timeline-audit-row.tsx`
- `timeline-interaction-row.tsx`
- `timeline-event-row.tsx`
- `timeline-month-group.tsx`

Keep these components dumb and composable. Avoid loading state in leaf rows.

**Step 5: Implement the entry component**

Create `src/components/crm/timeline/unified-timeline.tsx` that:
- calls `useUnifiedTimeline(recordType, recordId)`
- renders loading, error, empty, and grouped success states
- delegates each entry to the correct row component

**Step 6: Re-run the component tests**

Run:

```bash
pnpm vitest run src/components/crm/timeline/__tests__/unified-timeline.test.tsx
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/components/crm/timeline
git commit -m "feat: add unified crm timeline components"
```

---

### Task 6: Drawer Integration and Legacy Timeline Cleanup

**Files:**
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/company-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/task-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx`
- Delete: `src/components/crm/contact-timeline.tsx`
- Delete: `src/components/crm/interaction-timeline.tsx`
- Delete: `src/components/crm/__tests__/contact-timeline.test.tsx`
- Delete: `src/components/crm/__tests__/interaction-timeline.test.tsx`

**Step 1: Write the failing drawer tests**

Update the four drawer test files so they assert:
- contact drawer still has a Timeline tab, now rendering `UnifiedTimeline`
- deal drawer Timeline tab now renders the unified feed instead of `InteractionTimeline`
- company drawer gains a Timeline tab
- task drawer gains a tab shell and a Timeline tab

**Step 2: Run the drawer tests and verify they fail**

Run:

```bash
pnpm vitest run \
  src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx
```

Expected: FAIL because the drawers do not yet render the new timeline component or task tabs.

**Step 3: Integrate `UnifiedTimeline` into the four drawers**

Modify:
- `contact-drawer-content.tsx`
- `deal-drawer-content.tsx`
- `company-drawer-content.tsx`
- `task-drawer-content.tsx`

Implementation rules:
- contact uses `recordType="contact"`
- deal uses `recordType="deal"`
- company adds a new `"timeline"` tab and uses `recordType="company"`
- task adds a shell with tabs and uses `recordType="task"`

**Step 4: Delete the legacy timeline components and tests**

Delete:

```text
src/components/crm/contact-timeline.tsx
src/components/crm/interaction-timeline.tsx
src/components/crm/__tests__/contact-timeline.test.tsx
src/components/crm/__tests__/interaction-timeline.test.tsx
```

**Step 5: Re-run the drawer tests**

Run the same command from Step 2.

Expected: PASS.

**Step 6: Commit**

```bash
git add \
  src/components/crm/record-drawer/contact-drawer-content.tsx \
  src/components/crm/record-drawer/deal-drawer-content.tsx \
  src/components/crm/record-drawer/company-drawer-content.tsx \
  src/components/crm/record-drawer/task-drawer-content.tsx \
  src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx
git rm \
  src/components/crm/contact-timeline.tsx \
  src/components/crm/interaction-timeline.tsx \
  src/components/crm/__tests__/contact-timeline.test.tsx \
  src/components/crm/__tests__/interaction-timeline.test.tsx
git commit -m "feat: integrate unified timeline into crm drawers"
```

---

### Task 7: Focused Regression Pass and Manual Verification

**Files:**
- Modify as needed based on failures from the focused test pass

**Step 1: Run the focused test suite**

Run:

```bash
pnpm vitest run \
  src/lib/crm/__tests__/timeline-capture.test.ts \
  src/hooks/__tests__/use-update-contact.test.ts \
  src/hooks/__tests__/use-update-company.test.ts \
  src/hooks/__tests__/use-update-deal.test.ts \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  src/hooks/__tests__/use-unified-timeline.test.tsx \
  src/components/crm/timeline/__tests__/unified-timeline.test.tsx \
  src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx \
  app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.test.tsx \
  src/lib/runner/tools/crm/__tests__/create-record.test.ts \
  src/lib/runner/tools/crm/__tests__/update-record.test.ts \
  src/lib/runner/tools/crm/__tests__/delete-records.test.ts \
  src/lib/runner/tools/crm/__tests__/tasks.test.ts \
  src/lib/runner/tools/crm/__tests__/link-records.test.ts
```

Expected: PASS.

**Step 2: Run lint or typecheck for changed code if the repo has a standard command**

Run the project-standard verification command for this repo. Prefer:

```bash
pnpm test
```

If that is too broad or unavailable, run the narrower standard command used by the repo owner for PR validation.

Expected: PASS, or capture the exact known unrelated failures before merging.

**Step 3: Manual UI verification**

Start the app, then verify these flows end-to-end:

1. Create a contact from `/customers/people`, open the drawer, and confirm a `created` audit entry appears in Timeline.
2. Edit one contact field from the drawer and confirm a single-field inline diff renders.
3. Edit several fields on the same contact within 10 minutes and confirm they dedup into one expandable update card.
4. Open a deal with existing interactions and confirm audit entries and interactions appear in one merged feed.
5. Create a task from `/tasks`, open the drawer, and confirm the new Timeline tab renders.
6. Use an agent CRM tool path locally or via tests and confirm the actor label shows `Sunder`.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: ship crm timeline audit log"
```

## Notes for the Implementer

- Clone Twenty’s patterns, not its abstractions. We want the rendering and dedup behavior, not an ORM event bus.
- Keep `happened_at` immutable. Only `updated_at` should move when dedup merges an existing row.
- Prefer duplicate audit rows over missing audit rows if something goes wrong.
- Do not change the `interactions` schema or existing interaction creation tools.
- Do not add a full-page timeline. Drawer-only is the boundary.
- Do not add undo, revert, or before-value rendering in the UI.

## Execution Handoff

**Tasklist complete and saved to `docs/product/tasks/2026-04-05-timeline-audit-log-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint.**
