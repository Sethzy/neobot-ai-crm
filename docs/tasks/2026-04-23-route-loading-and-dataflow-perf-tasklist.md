# Route Loading And Dataflow Performance Implementation Plan

**Goal:** Improve perceived speed on auth-protected navigation by replacing generic spinners with route-shaped loading shells and by removing avoidable fetch waterfalls.

**Architecture:** Keep the existing App Router route tree and route-level loading conventions. Add lightweight shared skeleton components that match the actual customer/tasks/meetings/settings layouts, parallelize independent server fetches on pricing, and defer the meeting transcript fetch until the user asks for it. Do not add a new data cache layer, suspense framework, or dashboard-wide redesign.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query, Supabase JS, Vitest, React Testing Library

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Create: `src/components/crm/crm-list-loading-shell.tsx`
- Create: `src/components/crm/__tests__/crm-list-loading-shell.test.tsx`
- Create: `app/(dashboard)/customers/deals/loading.tsx`
- Create: `app/(dashboard)/customers/companies/loading.tsx`
- Create: `app/(dashboard)/customers/people/loading.tsx`
- Create: `src/components/tasks/tasks-page-loading.tsx`
- Create: `src/components/crm/__tests__/tasks-page-loading.test.tsx`
- Create: `app/(dashboard)/tasks/loading.tsx`
- Create: `src/components/meetings/meeting-detail-loading.tsx`
- Create: `src/components/meetings/__tests__/meeting-detail-loading.test.tsx`
- Create: `app/(dashboard)/meetings/loading.tsx`
- Create: `app/(dashboard)/meetings/[id]/loading.tsx`
- Create: `src/components/settings/settings-page-loading.tsx`
- Create: `src/components/settings/__tests__/settings-page-loading.test.tsx`
- Create: `app/settings/loading.tsx`
- Modify: `app/(dashboard)/pricing/page.tsx`
- Create: `app/(dashboard)/pricing/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/meetings/[id]/page.tsx`
- Modify: `src/components/meetings/transcript-section.tsx`
- Create: `src/components/meetings/__tests__/transcript-section.test.tsx`

## Skills To Use

- `@nextjs-best-practices` for route `loading.tsx` placement and App Router streaming behavior
- `@vercel-react-best-practices` for `async-suspense-boundaries`, `async-parallel`, and `async-dependencies`
- `@test-driven-development` for every parent task
- `@requesting-code-review` after each parent task is green

## Parallel Ownership Boundary

- This tasklist owns loading shells, pricing server parallelism, and meeting transcript deferral.
- Do **not** touch `src/components/chat/message-list.tsx`, `app/(dashboard)/tasks/page.tsx`, `src/hooks/use-update-crm-task.ts`, or customer-page rerender logic here.
- The customer pages themselves should only be touched if a loading shell needs to share extracted skeleton JSX.

## Notes

- `app/(dashboard)/loading.tsx` already exists. Do not remove it. Add route-specific shells beneath it.
- Prefer extracted skeleton components over duplicating JSX inside both the route `loading.tsx` file and the main page.
- Keep the loading shells static and cheap. No client hooks.
- The meeting transcript is currently fetched even when the transcript accordion is closed. Fix that without redesigning the meeting page.

---

### Task 1: Add shared customer-list loading shells and route-level customer `loading.tsx` files

**Files:**
- Create: `src/components/crm/crm-list-loading-shell.tsx`
- Create: `src/components/crm/__tests__/crm-list-loading-shell.test.tsx`
- Create: `app/(dashboard)/customers/deals/loading.tsx`
- Create: `app/(dashboard)/customers/companies/loading.tsx`
- Create: `app/(dashboard)/customers/people/loading.tsx`

**Step 1: Write the failing test**

Create `src/components/crm/__tests__/crm-list-loading-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { CrmListLoadingShell } from "../crm-list-loading-shell";

it("renders a six-row crm table skeleton", () => {
  render(<CrmListLoadingShell title="Deals" />);

  expect(screen.getByText("Deals")).toBeInTheDocument();
  expect(screen.getAllByTestId("crm-loading-row")).toHaveLength(6);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/crm-list-loading-shell.test.tsx
```

Expected: FAIL because the component does not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/crm/crm-list-loading-shell.tsx` with a server-safe skeleton:

```tsx
/**
 * Shared loading shell for CRM list routes.
 * @module components/crm/crm-list-loading-shell
 */
import { PageCanvas, PageSurface } from "@/components/layout/page-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export function CrmListLoadingShell({ title, description }: {
  title: string;
  description?: string;
}) {
  return (
    <PageCanvas>
      <PageHeader title={title} description={description} />
      <PageSurface>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} data-testid="crm-loading-row" className="grid grid-cols-5 gap-3 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-10 justify-self-end" />
          </div>
        ))}
      </PageSurface>
    </PageCanvas>
  );
}
```

Then wire each route `loading.tsx` to that shared component with route-specific copy.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/crm-list-loading-shell.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/crm/crm-list-loading-shell.tsx \
        src/components/crm/__tests__/crm-list-loading-shell.test.tsx \
        app/'(dashboard)'/customers/deals/loading.tsx \
        app/'(dashboard)'/customers/companies/loading.tsx \
        app/'(dashboard)'/customers/people/loading.tsx
git commit -m "perf(prXX): add crm list loading shells"
```

---

### Task 2: Add route-level loading shells for Tasks, Meetings, and Settings

**Files:**
- Create: `src/components/tasks/tasks-page-loading.tsx`
- Create: `src/components/crm/__tests__/tasks-page-loading.test.tsx`
- Create: `app/(dashboard)/tasks/loading.tsx`
- Create: `src/components/meetings/meeting-detail-loading.tsx`
- Create: `src/components/meetings/__tests__/meeting-detail-loading.test.tsx`
- Create: `app/(dashboard)/meetings/loading.tsx`
- Create: `app/(dashboard)/meetings/[id]/loading.tsx`
- Create: `src/components/settings/settings-page-loading.tsx`
- Create: `src/components/settings/__tests__/settings-page-loading.test.tsx`
- Create: `app/settings/loading.tsx`

**Step 1: Write the failing tests**

Create one smoke test per shared shell:

```tsx
it("renders the settings rail and content placeholders", () => {
  render(<SettingsPageLoading />);
  expect(screen.getByTestId("settings-loading-nav")).toBeInTheDocument();
  expect(screen.getAllByTestId("settings-loading-line").length).toBeGreaterThan(2);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/tasks-page-loading.test.tsx \
  src/components/meetings/__tests__/meeting-detail-loading.test.tsx \
  src/components/settings/__tests__/settings-page-loading.test.tsx
```

Expected: FAIL because the loading-shell components do not exist yet.

**Step 3: Write minimal implementation**

Create three extracted loading-shell components and route files that simply return them.

Use this shape for settings:

```tsx
export function SettingsPageLoading() {
  return (
    <div className="flex h-svh w-full">
      <aside data-testid="settings-loading-nav" className="hidden w-64 border-r md:block">
        <div className="space-y-3 p-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-32" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} data-testid="settings-loading-line" className="mb-4 h-5 w-full max-w-xl" />
        ))}
      </main>
    </div>
  );
}
```

For `meetings/[id]/loading.tsx`, reuse the meeting-detail shell instead of plain text.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/tasks-page-loading.test.tsx \
  src/components/meetings/__tests__/meeting-detail-loading.test.tsx \
  src/components/settings/__tests__/settings-page-loading.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/tasks/tasks-page-loading.tsx \
        src/components/crm/__tests__/tasks-page-loading.test.tsx \
        app/'(dashboard)'/tasks/loading.tsx \
        src/components/meetings/meeting-detail-loading.tsx \
        src/components/meetings/__tests__/meeting-detail-loading.test.tsx \
        app/'(dashboard)'/meetings/loading.tsx \
        app/'(dashboard)'/meetings/'[id]'/loading.tsx \
        src/components/settings/settings-page-loading.tsx \
        src/components/settings/__tests__/settings-page-loading.test.tsx \
        app/settings/loading.tsx
git commit -m "perf(prXX): add route specific loading shells"
```

---

### Task 3: Parallelize the Pricing page server fetches

**Files:**
- Modify: `app/(dashboard)/pricing/page.tsx`
- Create: `app/(dashboard)/pricing/__tests__/page.test.tsx`

**Step 1: Write the failing test**

Create `app/(dashboard)/pricing/__tests__/page.test.tsx` with a fetch-order regression test:

```tsx
it("starts billing summary, quota, and stripe plan fetches in parallel", async () => {
  const events: string[] = [];

  mockGetBillingSummary.mockImplementation(async () => {
    events.push("summary:start");
    await Promise.resolve();
    events.push("summary:end");
    return billingSummaryFixture;
  });

  mockLoadCurrentMessageQuota.mockImplementation(async () => {
    events.push("quota:start");
    await Promise.resolve();
    events.push("quota:end");
    return quotaFixture;
  });

  mockListStripePlans.mockImplementation(async () => {
    events.push("plans:start");
    await Promise.resolve();
    events.push("plans:end");
    return [];
  });

  await PricingPage({ searchParams: Promise.resolve({}) });

  expect(events.slice(0, 3)).toEqual(["summary:start", "quota:start", "plans:start"]);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run "app/(dashboard)/pricing/__tests__/page.test.tsx"
```

Expected: FAIL because the current implementation awaits the calls sequentially.

**Step 3: Write minimal implementation**

Change the route to:

```tsx
const [{ billing }, billingSummary, messageQuota, stripePlansResult] = await Promise.all([
  searchParams,
  getBillingSummary(),
  loadCurrentMessageQuota(),
  listStripePlans()
    .then((plans) => ({ paidPlans: plans, pricingError: null }))
    .catch((error: unknown) => ({
      paidPlans: [],
      pricingError:
        error instanceof Error ? error.message : "Failed to load Stripe plans.",
    })),
]);
```

Keep the rest of the page logic intact.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run "app/(dashboard)/pricing/__tests__/page.test.tsx"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/'(dashboard)'/pricing/page.tsx \
        app/'(dashboard)'/pricing/__tests__/page.test.tsx
git commit -m "perf(prXX): parallelize pricing page fetches"
```

---

### Task 4: Defer meeting transcript loading until the transcript is opened

**Files:**
- Modify: `app/(dashboard)/meetings/[id]/page.tsx`
- Modify: `src/components/meetings/transcript-section.tsx`
- Create: `src/components/meetings/__tests__/transcript-section.test.tsx`

**Step 1: Write the failing test**

Create `src/components/meetings/__tests__/transcript-section.test.tsx`:

```tsx
it("does not request transcript content until the section is opened", async () => {
  const onOpenChange = vi.fn();

  render(
    <TranscriptSection
      transcriptText={undefined}
      segments={undefined}
      isOpen={false}
      onOpenChange={onOpenChange}
      isLoading={false}
      hasTranscript
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /transcript/i }));
  expect(onOpenChange).toHaveBeenCalledWith(true);
});
```

Then add a page-level test proving the storage download helper is not called until the section is opened.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/meetings/__tests__/transcript-section.test.tsx
```

Expected: FAIL because the component is uncontrolled and the page fetches on mount.

**Step 3: Write minimal implementation**

1. Make `TranscriptSection` controlled:

```tsx
interface TranscriptSectionProps {
  transcriptText?: string;
  segments?: TranscriptSegment[];
  hasTranscript: boolean;
  isLoading?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}
```

2. In `app/(dashboard)/meetings/[id]/page.tsx`, add:

```tsx
const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

useEffect(() => {
  if (!isTranscriptOpen || !transcriptKey || !clientId || !transcriptPath) {
    return;
  }

  // existing transcript download logic
}, [clientId, isTranscriptOpen, transcriptKey, transcriptPath]);
```

3. Pass loading/open props into `TranscriptSection` so the shell can show `"Loading transcript..."` only after expansion.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/meetings/__tests__/transcript-section.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/'(dashboard)'/meetings/'[id]'/page.tsx \
        src/components/meetings/transcript-section.tsx \
        src/components/meetings/__tests__/transcript-section.test.tsx
git commit -m "perf(prXX): defer meeting transcript loading"
```

---

### Task 5: Run the route-shell verification suite and do manual navigation QA

**Files:**
- No new code. Verification only.

**Step 1: Run the focused automated suite**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/crm-list-loading-shell.test.tsx \
  src/components/crm/__tests__/tasks-page-loading.test.tsx \
  src/components/meetings/__tests__/meeting-detail-loading.test.tsx \
  src/components/settings/__tests__/settings-page-loading.test.tsx \
  src/components/meetings/__tests__/transcript-section.test.tsx \
  "app/(dashboard)/pricing/__tests__/page.test.tsx"
```

Expected: PASS.

**Step 2: Start the app**

Run:

```bash
pnpm dev
```

Expected: local app starts on an available port.

**Step 3: Manual QA**

Navigate through:

- `/customers/deals`, `/customers/companies`, `/customers/people`
- `/tasks`
- `/meetings`
- one `/meetings/[id]` detail page
- `/settings/profile`
- `/pricing`

Verify:

- each route shows a shaped shell instead of a blank or generic spinner
- `/pricing` still renders plan data correctly
- meeting detail does **not** hit transcript storage until the transcript is opened

**Step 4: Commit**

```bash
git add .
git commit -m "test(prXX): verify route loading and dataflow perf fixes"
```
