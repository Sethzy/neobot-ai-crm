# CRM UI Primitive Consolidation Implementation Plan

**Goal:** Reduce CRM and shared-surface UI duplication by extracting high-leverage primitives that are reused across People, Companies, Deals, Tasks, and Settings without adding a second page-shell abstraction.

**Architecture:** Keep `src/components/crm/crm-workspace-shell.tsx` as the existing shared CRM shell. Extract smaller reusable building blocks around list-cell rendering, record-detail loading states, kanban meta rows, status badges, and route-state wiring so the page files become declarative instead of hand-assembling the same behaviors. Do not introduce a new metadata system, a new page shell, or a generic async wrapper that competes with `ListTable`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind 4, ShadCN UI, TanStack Query, Vitest, React Testing Library

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Create: `src/components/crm/record-link-cell.tsx`
- Create: `src/components/crm/crm-inline-cells.tsx`
- Create: `src/components/crm/__tests__/record-link-cell.test.tsx`
- Create: `src/components/crm/__tests__/crm-inline-cells.test.tsx`
- Create: `src/components/crm/crm-record-detail-skeleton.tsx`
- Create: `src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx`
- Create: `src/components/crm/kanban-card-row.tsx`
- Create: `src/components/crm/status-badge.tsx`
- Create: `src/components/crm/__tests__/kanban-card-row.test.tsx`
- Create: `src/components/crm/__tests__/status-badge.test.tsx`
- Create: `src/components/crm/use-crm-list-route-state.ts`
- Create: `src/components/crm/__tests__/use-crm-list-route-state.test.tsx`
- Create: `src/components/settings/settings-nav-meta.ts`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`
- Modify: `src/components/crm/quick-edit-cell.tsx`
- Modify: `src/components/crm/record-detail/company-detail-content.tsx`
- Modify: `src/components/crm/record-detail/contact-detail-content.tsx`
- Modify: `src/components/crm/record-detail/deal-detail-content.tsx`
- Modify: `src/components/crm/deal-kanban-card.tsx`
- Modify: `src/components/crm/task-kanban-card.tsx`
- Modify: `src/components/crm/stage-badge.tsx`
- Modify: `src/components/crm/task-status-badge.tsx`
- Modify: `src/components/crm/__tests__/quick-edit-cell.test.tsx`
- Modify: `src/components/crm/__tests__/stage-badge.test.tsx`
- Modify: `src/components/crm/__tests__/task-status-badge.test.tsx`
- Modify: `src/lib/ui/color-maps.ts`
- Modify: `src/components/settings/settings-nav.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/__tests__/settings-nav.test.tsx`

## Skills To Use

- `@nextjs-best-practices` for client/server boundaries and App Router-safe primitive placement
- `@vercel-react-best-practices` for avoiding unnecessary memoization churn while extracting reusable React components
- `@test-driven-development` for every parent task
- `@requesting-code-review` after each parent task is green

## Audit Verdict

- The CRM extraction opportunities are real, but the top audit item should be corrected: `src/components/crm/crm-workspace-shell.tsx` already exists, so do **not** build a second `CrmListPageShell`.
- The actual page-level duplication lives in page-controller code: saved-view query param sync, ad hoc search/filter/page state, view-preference syncing, and repeated record-name cell renderers.
- The detail skeleton duplication is real in `src/components/crm/record-detail/company-detail-content.tsx`, `contact-detail-content.tsx`, and `deal-detail-content.tsx`.
- The quick-edit cell duplication is real across `companies/page.tsx`, `people/page.tsx`, and `deals/page.tsx`.
- The kanban row and badge work is real, but keep it modest: extract row/badge primitives, not a universal “everything editable everywhere” card framework.
- The settings audit is overstated: `SettingsMobileNav` already renders `SettingsNav`. Only extract nav metadata helpers; do not merge them into a new viewport-aware mega component.
- Do **not** extract a generic `StateLoadingErrorEmpty` wrapper yet. `ListTable` already owns loading/error/empty states on three list pages. Re-evaluate only after the CRM controller work lands.
- Do **not** unify `InlineEditField` drawer rows with kanban rows in this pass. Their interaction models are materially different.

## Source Documents

- Origin: `docs/product/ideations/2026-04-23-kiss-crm-ux-foundation-requirements.md`
- Related plan: `docs/product/plans/2026-04-23-001-feat-kiss-crm-ux-foundation-plan.md`

## Parallel Ownership Boundary

- This tasklist owns CRM page/component modularity only.
- Do **not** redesign CRM IA, saved-view storage, record routes, or Supabase schema here.
- Do **not** duplicate route-loading-shell work that may already be underway in parallel.
- Do **not** touch unrelated dirty files in chat, pricing, meetings, or settings messaging beyond the files listed above.

## Non-Goals

- No new top-level CRM shell component
- No generic async-state abstraction for `ListTable`
- No drawer/page data model rewrite
- No attempt to merge `InlineEditField` and `QuickEditCell`
- No full settings navigation redesign

---

### Task 1: Extract CRM list-cell primitives for record links and inline quick edits

**Files:**
- Create: `src/components/crm/record-link-cell.tsx`
- Create: `src/components/crm/crm-inline-cells.tsx`
- Create: `src/components/crm/__tests__/record-link-cell.test.tsx`
- Create: `src/components/crm/__tests__/crm-inline-cells.test.tsx`
- Modify: `src/components/crm/quick-edit-cell.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `src/components/crm/__tests__/quick-edit-cell.test.tsx`

**Step 1: Write the failing tests**

Create `src/components/crm/__tests__/record-link-cell.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { RecordLinkCell } from "../record-link-cell";

it("renders a record-open button and keeps the affordance hint visible", () => {
  const onOpen = vi.fn();

  render(
    <RecordLinkCell label="Ada Lovelace" onOpen={onOpen} />
  );

  fireEvent.click(screen.getByRole("button", { name: "Ada Lovelace" }));

  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("open-record-hint")).toBeInTheDocument();
});
```

Create `src/components/crm/__tests__/crm-inline-cells.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { LinkQuickEditCell } from "../crm-inline-cells";

it("preserves a tel link in read mode and saves the raw phone value", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);

  render(
    <LinkQuickEditCell
      ariaLabel="Phone"
      value="+1 415 555 0100"
      hrefBuilder={(value) => `tel:${value}`}
      onSave={onSave}
    />
  );

  expect(screen.getByRole("link", { name: "+1 415 555 0100" })).toHaveAttribute(
    "href",
    "tel:+1 415 555 0100",
  );
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/record-link-cell.test.tsx \
  src/components/crm/__tests__/crm-inline-cells.test.tsx
```

Expected: FAIL because the new primitives do not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/crm/record-link-cell.tsx`:

```tsx
/**
 * Reusable first-column record link cell for CRM list tables.
 * @module components/crm/record-link-cell
 */
"use client";

import { OpenRecordHint } from "@/components/crm/open-record-hint";

export function RecordLinkCell({
  label,
  onOpen,
}: {
  label: string;
  onOpen: () => void;
}) {
  return (
    <span className="flex w-full min-w-0 items-center">
      <button
        type="button"
        className="block max-w-[250px] truncate font-medium text-foreground hover:underline"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {label}
      </button>
      <OpenRecordHint />
    </span>
  );
}
```

Create `src/components/crm/crm-inline-cells.tsx` with typed wrappers over `QuickEditCell` instead of page-local one-off components:

```tsx
/**
 * Shared inline-edit cells for CRM list views.
 * @module components/crm/crm-inline-cells
 */
"use client";

import { QuickEditCell } from "@/components/crm/quick-edit-cell";

export function LinkQuickEditCell(props: {
  ariaLabel: string;
  value: string | null;
  hrefBuilder: (value: string) => string;
  onSave: (value: string | number | null) => Promise<void> | void;
}) {
  const { ariaLabel, value, hrefBuilder, onSave } = props;

  return (
    <QuickEditCell ariaLabel={ariaLabel} value={value} displayValue={value} onSave={onSave}>
      {value ? (
        <a
          href={hrefBuilder(value)}
          className="block max-w-[220px] truncate text-foreground/80 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {value}
        </a>
      ) : null}
    </QuickEditCell>
  );
}
```

Then refactor the list pages:

- Replace the repeated first-column name button blocks with `RecordLinkCell`
- Replace `CompanyPhoneCell`, `CompanyEmailCell`, `CompanyWebsiteCell`, `ContactPhoneCell`, `ContactEmailCell`, `DealStageCell`, `DealAmountCell`, and `DealAddressCell` internals with shared wrappers
- Keep page-specific mutation hooks in the page files for now; do not invent a cross-entity mutation abstraction

If `QuickEditCell` needs a tiny prop addition for one wrapper, add only that prop and cover it in `src/components/crm/__tests__/quick-edit-cell.test.tsx`.

**Step 4: Run the focused tests**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/record-link-cell.test.tsx \
  src/components/crm/__tests__/crm-inline-cells.test.tsx \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx
```

Expected: PASS. Existing behavior around read-mode links, edit affordances, and row-click suppression must remain unchanged.

**Step 5: Commit**

```bash
git add src/components/crm/record-link-cell.tsx \
        src/components/crm/crm-inline-cells.tsx \
        src/components/crm/__tests__/record-link-cell.test.tsx \
        src/components/crm/__tests__/crm-inline-cells.test.tsx \
        src/components/crm/quick-edit-cell.tsx \
        src/components/crm/__tests__/quick-edit-cell.test.tsx \
        app/'(dashboard)'/customers/companies/page.tsx \
        app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
        app/'(dashboard)'/customers/people/page.tsx \
        app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
        app/'(dashboard)'/customers/deals/page.tsx \
        app/'(dashboard)'/customers/deals/__tests__/page.test.tsx
git commit -m "refactor(prXX): extract crm list cell primitives"
```

---

### Task 2: Extract a shared CRM record-detail loading skeleton

**Files:**
- Create: `src/components/crm/crm-record-detail-skeleton.tsx`
- Create: `src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx`
- Modify: `src/components/crm/record-detail/company-detail-content.tsx`
- Modify: `src/components/crm/record-detail/contact-detail-content.tsx`
- Modify: `src/components/crm/record-detail/deal-detail-content.tsx`

**Step 1: Write the failing test**

Create `src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { CrmRecordDetailSkeleton } from "../crm-record-detail-skeleton";

it("renders the shared header, tab rail, and six field rows", () => {
  render(<CrmRecordDetailSkeleton tabCount={6} />);

  expect(screen.getAllByTestId("crm-detail-tab-skeleton")).toHaveLength(6);
  expect(screen.getAllByTestId("crm-detail-field-skeleton")).toHaveLength(6);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx
```

Expected: FAIL because the skeleton component does not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/crm/crm-record-detail-skeleton.tsx`:

```tsx
/**
 * Shared loading skeleton for CRM record detail surfaces.
 * @module components/crm/crm-record-detail-skeleton
 */
import { Skeleton } from "@/components/ui/skeleton";

export function CrmRecordDetailSkeleton({ tabCount = 6 }: { tabCount?: number }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-5">
          <header className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="ml-auto h-3 w-24 shrink-0" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </header>
          <div className="-mx-5 border-b border-border/60 px-5">
            <div className="flex items-center gap-5">
              {Array.from({ length: tabCount }).map((_, index) => (
                <div key={index} className="flex h-10 items-center" data-testid="crm-detail-tab-skeleton">
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-px pt-1">
            <Skeleton className="mb-4 h-3 w-10" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 py-2" data-testid="crm-detail-field-skeleton">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-3 max-w-[160px] flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Then replace the three inline `isLoading` branches with:

```tsx
if (isLoading) {
  return <CrmRecordDetailSkeleton tabCount={6} />;
}
```

Use `tabCount={5}` for contact if its tab strip stays at five.

**Step 4: Run tests to verify it passes**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx
```

Expected: PASS.

**Step 5: Run regression tests for the three detail surfaces**

Run:

```bash
pnpm vitest run \
  src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx
```

Expected: PASS. Loading behavior should stay visually consistent while removing duplicated JSX.

**Step 6: Commit**

```bash
git add src/components/crm/crm-record-detail-skeleton.tsx \
        src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx \
        src/components/crm/record-detail/company-detail-content.tsx \
        src/components/crm/record-detail/contact-detail-content.tsx \
        src/components/crm/record-detail/deal-detail-content.tsx
git commit -m "refactor(prXX): extract crm detail skeleton"
```

---

### Task 3: Extract shared kanban meta rows and a generalized status badge

**Files:**
- Create: `src/components/crm/kanban-card-row.tsx`
- Create: `src/components/crm/status-badge.tsx`
- Create: `src/components/crm/__tests__/kanban-card-row.test.tsx`
- Create: `src/components/crm/__tests__/status-badge.test.tsx`
- Modify: `src/components/crm/deal-kanban-card.tsx`
- Modify: `src/components/crm/task-kanban-card.tsx`
- Modify: `src/components/crm/stage-badge.tsx`
- Modify: `src/components/crm/task-status-badge.tsx`
- Modify: `src/components/crm/__tests__/stage-badge.test.tsx`
- Modify: `src/components/crm/__tests__/task-status-badge.test.tsx`
- Modify: `src/lib/ui/color-maps.ts`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`

**Step 1: Write the failing tests**

Create `src/components/crm/__tests__/kanban-card-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { KanbanCardRow } from "../kanban-card-row";

it("renders a label/value row with placeholder styling when empty", () => {
  render(
    <KanbanCardRow icon={<span data-testid="icon" />} value={null} placeholder="Contact" />
  );

  expect(screen.getByTestId("icon")).toBeInTheDocument();
  expect(screen.getByText("Contact")).toBeInTheDocument();
});
```

Create `src/components/crm/__tests__/status-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";

import { StatusBadge } from "../status-badge";

it("renders the supplied label with the mapped badge variant", () => {
  render(
    <StatusBadge
      label="In progress"
      value="in_progress"
      variantMap={{ in_progress: "secondary" }}
    />
  );

  expect(screen.getByText("In progress")).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/kanban-card-row.test.tsx \
  src/components/crm/__tests__/status-badge.test.tsx
```

Expected: FAIL because the new primitives do not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/crm/kanban-card-row.tsx`:

```tsx
/**
 * Shared metadata row for CRM kanban cards.
 * @module components/crm/kanban-card-row
 */
import { cn } from "@/lib/utils";

export function KanbanCardRow({
  icon,
  value,
  placeholder,
  className,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  placeholder: string;
  className?: string;
}) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {icon}
      <span className={hasValue ? "truncate" : "truncate text-muted-foreground/40"}>
        {hasValue ? value : placeholder}
      </span>
    </div>
  );
}
```

Create `src/components/crm/status-badge.tsx` as the generic implementation, then make the existing wrappers thin:

```tsx
/**
 * Entity-agnostic status badge primitive.
 * @module components/crm/status-badge
 */
import { Badge } from "@/components/ui/badge";

export function StatusBadge<T extends string>({
  label,
  value,
  variantMap,
}: {
  label: string;
  value: T;
  variantMap: Partial<Record<T, React.ComponentProps<typeof Badge>["variant"]>>;
}) {
  return <Badge variant={variantMap[value] ?? "secondary"}>{label}</Badge>;
}
```

Implementation rules:

- Move task status variant definitions into `src/lib/ui/color-maps.ts` so they sit next to other semantic UI maps
- Keep `StageBadge` and `TaskStatusBadge` exports for call-site stability; turn them into wrappers around `StatusBadge`
- Use `KanbanCardRow` in `task-kanban-card.tsx`
- Use `KanbanCardRow` only for the read-only rows in `deal-kanban-card.tsx`; do not try to force the popover-edit rows through it

**Step 4: Run the focused tests**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/kanban-card-row.test.tsx \
  src/components/crm/__tests__/status-badge.test.tsx \
  src/components/crm/__tests__/stage-badge.test.tsx \
  src/components/crm/__tests__/task-status-badge.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.integration.test.tsx
```

Expected: PASS. Badge copy and board rendering must remain stable.

**Step 5: Commit**

```bash
git add src/components/crm/kanban-card-row.tsx \
        src/components/crm/status-badge.tsx \
        src/components/crm/__tests__/kanban-card-row.test.tsx \
        src/components/crm/__tests__/status-badge.test.tsx \
        src/components/crm/deal-kanban-card.tsx \
        src/components/crm/task-kanban-card.tsx \
        src/components/crm/stage-badge.tsx \
        src/components/crm/task-status-badge.tsx \
        src/components/crm/__tests__/stage-badge.test.tsx \
        src/components/crm/__tests__/task-status-badge.test.tsx \
        src/lib/ui/color-maps.ts \
        app/'(dashboard)'/tasks/__tests__/page.integration.test.tsx
git commit -m "refactor(prXX): consolidate crm kanban rows and badges"
```

---

### Task 4: Extract a thin CRM list route-state hook instead of building another page shell

**Files:**
- Create: `src/components/crm/use-crm-list-route-state.ts`
- Create: `src/components/crm/__tests__/use-crm-list-route-state.test.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`

**Step 1: Write the failing hook test**

Create `src/components/crm/__tests__/use-crm-list-route-state.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import { useCrmListRouteState } from "../use-crm-list-route-state";

it("replaces only the savedView query param while preserving the rest of the URL", () => {
  const replace = vi.fn();

  const { result } = renderHook(() =>
    useCrmListRouteState({
      basePath: "/customers/people",
      searchParamsString: "view=kanban&savedView=old",
      replace,
    }),
  );

  result.current.handleSavedViewChange("new");

  expect(replace).toHaveBeenCalledWith("/customers/people?view=kanban&savedView=new");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/use-crm-list-route-state.test.tsx
```

Expected: FAIL because the hook does not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/crm/use-crm-list-route-state.ts`:

```tsx
/**
 * Shared route-state helpers for CRM list pages.
 * @module components/crm/use-crm-list-route-state
 */
"use client";

import { useMemo } from "react";

export function useCrmListRouteState({
  basePath,
  searchParamsString,
  replace,
}: {
  basePath: string;
  searchParamsString: string;
  replace: (href: string) => void;
}) {
  return useMemo(() => {
    return {
      savedViewId: new URLSearchParams(searchParamsString).get("savedView"),
      handleSavedViewChange(viewId: string | null) {
        const params = new URLSearchParams(searchParamsString);
        if (viewId) {
          params.set("savedView", viewId);
        } else {
          params.delete("savedView");
        }

        const nextQuery = params.toString();
        replace(nextQuery ? `${basePath}?${nextQuery}` : basePath);
      },
    };
  }, [basePath, replace, searchParamsString]);
}
```

Then integrate it:

- `companies/page.tsx`: replace the inline `savedViewId` parsing and `handleSavedViewChange`
- `people/page.tsx`: same
- `deals/page.tsx`: use the hook for `savedView`; keep the separate `view=kanban` URL logic local because it is deals-specific
- `tasks/page.tsx`: use the hook for `savedView`; keep task search/view-specific logic local

This task is deliberately narrow. Do **not** try to absorb every page’s search/filter/pagination state into one hook in the first pass.

**Step 4: Run the focused tests**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/use-crm-list-route-state.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.test.tsx
```

Expected: PASS. Existing view-switching and search persistence behavior must still work.

**Step 5: Commit**

```bash
git add src/components/crm/use-crm-list-route-state.ts \
        src/components/crm/__tests__/use-crm-list-route-state.test.tsx \
        app/'(dashboard)'/customers/companies/page.tsx \
        app/'(dashboard)'/customers/people/page.tsx \
        app/'(dashboard)'/customers/deals/page.tsx \
        app/'(dashboard)'/tasks/page.tsx \
        app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
        app/'(dashboard)'/tasks/__tests__/page.test.tsx
git commit -m "refactor(prXX): share crm list route state"
```

---

### Task 5: Extract the settings nav metadata helper without inventing a new nav component

**Files:**
- Create: `src/components/settings/settings-nav-meta.ts`
- Modify: `src/components/settings/settings-nav.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/__tests__/settings-nav.test.tsx`

**Step 1: Write the failing test**

Add this case to `src/components/settings/__tests__/settings-nav.test.tsx`:

```tsx
it("derives the current mobile title from the shared nav metadata", () => {
  expect(resolveSettingsCurrentTitle("/settings/agent/memory")).toBe("Memory");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: FAIL because the shared helper does not exist yet.

**Step 3: Write minimal implementation**

Create `src/components/settings/settings-nav-meta.ts`:

```tsx
/**
 * Shared metadata helpers for settings navigation.
 * @module components/settings/settings-nav-meta
 */

export interface SettingsNavItem {
  label: string;
  href: string;
}

export interface SettingsNavSection {
  label: string;
  items: readonly SettingsNavItem[];
}

export function resolveSettingsCurrentTitle(
  pathname: string,
  sections: readonly SettingsNavSection[],
) {
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.label;
      }
    }
  }
  return "Settings";
}
```

Then:

- Move the `NavItem` / `NavSection` types out of `settings-nav.tsx` if needed
- Keep `SETTINGS_NAV_SECTIONS` where it is or move it into the helper file, whichever yields the smaller diff
- Replace the local `resolveCurrentTitle` in `settings-mobile-nav.tsx` with `resolveSettingsCurrentTitle`
- Do **not** create a viewport-switching `SettingsNav` mega-component

**Step 4: Run tests to verify it passes**

Run:

```bash
pnpm vitest run src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/settings/settings-nav-meta.ts \
        src/components/settings/settings-nav.tsx \
        src/components/settings/settings-mobile-nav.tsx \
        src/components/settings/__tests__/settings-nav.test.tsx
git commit -m "refactor(prXX): share settings nav metadata"
```

---

## Final Verification

Run the targeted suite:

```bash
pnpm vitest run \
  src/components/crm/__tests__/record-link-cell.test.tsx \
  src/components/crm/__tests__/crm-inline-cells.test.tsx \
  src/components/crm/__tests__/crm-record-detail-skeleton.test.tsx \
  src/components/crm/__tests__/kanban-card-row.test.tsx \
  src/components/crm/__tests__/status-badge.test.tsx \
  src/components/crm/__tests__/use-crm-list-route-state.test.tsx \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  src/components/crm/__tests__/stage-badge.test.tsx \
  src/components/crm/__tests__/task-status-badge.test.tsx \
  app/'(dashboard)'/customers/companies/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/people/__tests__/page.test.tsx \
  app/'(dashboard)'/customers/deals/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.test.tsx \
  app/'(dashboard)'/tasks/__tests__/page.integration.test.tsx \
  src/components/settings/__tests__/settings-nav.test.tsx
pnpm lint
```

Expected:

- All targeted Vitest suites PASS
- `pnpm lint` PASS
- No UX regressions in table row clicking, quick-edit flows, deal kanban popovers, task board rendering, or settings mobile-nav title resolution

## Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5

Do not start Task 4 until Tasks 1-3 are green. The page-controller extraction is safer after the cell and detail primitives have already reduced page noise.
