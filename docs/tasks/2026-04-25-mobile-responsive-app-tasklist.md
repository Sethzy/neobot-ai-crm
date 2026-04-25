# Mobile Responsive App Implementation Plan

**Goal:** Make the authenticated Sunder app usable on phone widths without losing desktop density.

**Architecture:** Keep the existing Next.js App Router, React 19, Tailwind 4, ShadCN/Radix, TanStack Table, and CRM shell architecture. Add a shared mobile contract at the primitive layer, then adapt CRM list/table surfaces, CRM control surfaces, kanban/calendar workflows, and high-frequency chat/automation/settings routes. Finish with an automated responsive QA matrix so regressions are caught before review.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind 4, ShadCN/Radix UI, TanStack Table, TanStack Query, Vitest, React Testing Library, Playwright, Supabase Auth test account

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Source Design Doc

- `docs/product/plans/2026-04-25-001-refactor-mobile-responsive-app-plan.md`
- `PRODUCT.md`

## Skills To Reference

- `@impeccable` for responsive UX quality, density, hierarchy, accessibility, and visual review
- `@nextjs-best-practices` for App Router and client/server placement
- `@vercel-react-best-practices` for React component boundaries and unnecessary rerender avoidance
- `@test-driven-development` for each parent task
- `@requesting-code-review` after each committed parent task

## Responsive Rules To Preserve

- Mobile-first Tailwind: unprefixed classes define phone behavior, `sm:` / `md:` / `lg:` restore larger layouts.
- Use container queries where the component width matters more than the viewport.
- Dashboard components must use Flexoki semantic tokens. Do not add raw Tailwind palette classes like `bg-amber-500` or `text-green-600`.
- Desktop density is a feature. Do not globally inflate desktop table rows or sidebar controls.
- Mobile touch targets should be at least 44px by 44px for primary interactive controls.
- CRM phone flows must not require document-level horizontal scrolling.

## Relevant Files

- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/toggle.tsx`
- Modify: `src/components/ui/toggle-group.tsx`
- Modify: `src/components/ui/sidebar.tsx`
- Modify: `src/components/ui/input-group.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/layout/app-layout.tsx`
- Modify: `src/components/layout/page-header.tsx`
- Modify: `app/globals.css`
- Create: `src/components/ui/__tests__/touch-targets.test.tsx`
- Modify: `src/components/ui/list-table.tsx`
- Modify: `src/components/ui/row-actions.tsx`
- Create: `src/components/crm/mobile-record-card.tsx`
- Create: `src/components/crm/__tests__/mobile-record-card.test.tsx`
- Modify: `src/components/ui/__tests__/list-table.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`
- Modify: `src/components/crm/crm-workspace-shell.tsx`
- Modify: `src/components/crm/view-picker.tsx`
- Modify: `src/components/crm/view-toggle.tsx`
- Modify: `src/components/ui/filter-bar.tsx`
- Modify: `src/components/ui/filter-overlay.tsx`
- Modify: `src/components/crm/record-drawer/record-drawer.tsx`
- Modify: `src/components/crm/record-drawer/record-detail-panel-shell.tsx`
- Create: `src/components/crm/__tests__/crm-workspace-shell.test.tsx`
- Modify: `src/components/ui/__tests__/filter-overlay.test.tsx`
- Modify: `src/components/crm/kanban-board.tsx`
- Modify: `src/components/crm/deal-kanban-card.tsx`
- Modify: `src/components/crm/task-kanban-view.tsx`
- Modify: `src/components/crm/task-calendar-view.tsx`
- Modify: `src/components/crm/crm-tasks-calendar.tsx`
- Modify: `src/components/crm/__tests__/kanban-board.test.tsx`
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-welcome.tsx`
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/chat-composer.test.tsx`
- Modify: `src/components/automations/automations-list.tsx`
- Modify: `src/components/automations/automation-launcher-composer.tsx`
- Modify: `src/components/automations/__tests__/automations-list.test.tsx`
- Modify: `app/settings/layout.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/settings-nav.tsx`
- Modify: `app/(dashboard)/pricing/page.tsx`
- Create: `scripts/qa/responsive-matrix.ts`
- Modify: `package.json`
- Modify: `docs/qa/README.md`
- Modify: `docs/qa/04-crm-pages.md`
- Modify: `docs/qa/08-triggers-and-automations.md`
- Modify: `docs/qa/16-crm-working-surfaces.md`

## Verification Commands

Run these after each task unless a task gives a narrower command:

```bash
pnpm lint
pnpm test:run
pnpm build
```

Expected after a completed task: all commands exit 0.

For responsive browser QA:

```bash
pnpm dev
QA_USER_EMAIL="<test user>" QA_USER_PASSWORD="<test password>" pnpm qa:responsive
```

Expected before CRM mobile list work: FAIL on `/customers/people` and `/customers/deals` phone overflow.

Expected after all tasks: PASS for the responsive route matrix.

---

### Task 1: Responsive Primitive Contract

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/toggle.tsx`
- Modify: `src/components/ui/toggle-group.tsx`
- Modify: `src/components/ui/sidebar.tsx`
- Modify: `src/components/ui/input-group.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/layout/app-layout.tsx`
- Modify: `src/components/layout/page-header.tsx`
- Modify: `app/globals.css`
- Create: `src/components/ui/__tests__/touch-targets.test.tsx`

**Step 1: Write the failing touch-target tests**

Create `src/components/ui/__tests__/touch-targets.test.tsx`:

```tsx
/**
 * Tests for the shared mobile touch-target contract.
 * @module components/ui/__tests__/touch-targets
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../button";
import { InputGroupButton } from "../input-group";
import { Switch } from "../switch";
import { Toggle } from "../toggle";

describe("mobile touch target contract", () => {
  it("keeps compact desktop button sizes but adds phone-safe classes", () => {
    render(
      <div>
        <Button size="sm">Filter</Button>
        <Button size="icon-sm" aria-label="Open menu" />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Filter" })).toHaveClass("max-sm:h-11");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveClass("max-sm:size-11");
  });

  it("applies the same phone-safe contract to toggles and input-group buttons", () => {
    render(
      <div>
        <Toggle size="sm">Table</Toggle>
        <InputGroupButton aria-label="Attach files" size="icon-sm" />
      </div>,
    );

    expect(screen.getByRole("button", { name: "Table" })).toHaveClass("max-sm:h-11");
    expect(screen.getByRole("button", { name: "Attach files" })).toHaveClass("max-sm:size-11");
  });

  it("expands switch hit area on phones without changing the visual track", () => {
    render(<Switch aria-label="Enable automation" />);

    expect(screen.getByRole("switch", { name: "Enable automation" })).toHaveClass("max-sm:after:-inset-3");
  });
});
```

**Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm vitest run src/components/ui/__tests__/touch-targets.test.tsx
```

Expected: FAIL because the current shared components do not expose the `max-sm:*` touch classes.

**Step 3: Add the touch utility in globals**

Modify `app/globals.css` near the existing utilities:

```css
@utility touch-target {
  min-width: 2.75rem;
  min-height: 2.75rem;
}
```

Do not use this to inflate every desktop control. It is for opt-in mobile actions and row action triggers.

**Step 4: Update button variants**

Modify `src/components/ui/button.tsx` so existing compact variants become touch-safe only on phones:

```tsx
size: {
  default:
    "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 max-sm:h-11 max-sm:px-3",
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-caption in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 max-sm:h-10 max-sm:px-3 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 max-sm:h-11 max-sm:px-3 [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 gap-1.5 px-2.5 max-sm:h-11 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
  icon: "size-8 max-sm:size-11",
  "icon-xs":
    "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg max-sm:size-10 [&_svg:not([class*='size-'])]:size-3",
  "icon-sm":
    "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg max-sm:size-11",
  "icon-lg": "size-9 max-sm:size-11",
}
```

**Step 5: Update toggle variants**

Modify `src/components/ui/toggle.tsx`:

```tsx
size: {
  default: "h-8 min-w-8 px-2 max-sm:h-11 max-sm:min-w-11 max-sm:px-3",
  sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-1.5 text-caption max-sm:h-11 max-sm:min-w-11 max-sm:px-3",
  lg: "h-9 min-w-9 px-2.5 max-sm:h-11 max-sm:min-w-11",
}
```

**Step 6: Update input-group button variants**

Modify `src/components/ui/input-group.tsx`:

```tsx
size: {
  xs: "h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 max-sm:h-10 max-sm:px-3 [&>svg:not([class*='size-'])]:size-3.5",
  sm: "max-sm:h-11 max-sm:px-3",
  "icon-xs":
    "size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0 max-sm:size-10",
  "icon-sm": "size-8 p-0 has-[>svg]:p-0 max-sm:size-11",
}
```

**Step 7: Update switch hit area**

Modify `src/components/ui/switch.tsx` so the visual switch stays compact but the phone target grows:

```tsx
"peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 max-sm:after:-inset-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50"
```

**Step 8: Update sidebar trigger sizing**

Modify `src/components/ui/sidebar.tsx`. Find `SidebarTrigger`. Keep the API stable, but ensure the trigger uses a phone-safe class:

```tsx
<Button
  ref={ref}
  data-sidebar="trigger"
  variant="ghost"
  size="icon-sm"
  className={cn("max-sm:size-11", className)}
  onClick={(event) => {
    onClick?.(event);
    toggleSidebar();
  }}
  {...props}
>
  <PanelLeft className="size-4" />
  <span className="sr-only">Toggle Sidebar</span>
</Button>
```

Use the actual icon/name already present in the file if it differs.

**Step 9: Tighten app mobile header**

Modify `src/components/layout/app-layout.tsx` so the mobile header stays 48-52px tall and uses the phone-safe sidebar trigger:

```tsx
<header className="flex h-12 shrink-0 items-center gap-2 border-b border-app-border-subtle bg-background px-2 sm:hidden">
  <SidebarTrigger />
  <div className="min-w-0 flex-1" />
</header>
```

Do not add a bottom nav in this task.

**Step 10: Make page-header actions wrap correctly**

Modify `src/components/layout/page-header.tsx`. If the actions cluster is a single row, change it to mobile-first wrapping:

```tsx
<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div className="min-w-0 space-y-1">{/* title and description */}</div>
  {actions ? (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {actions}
    </div>
  ) : null}
</div>
```

Preserve the existing props and text styles.

**Step 11: Run the primitive tests**

Run:

```bash
pnpm vitest run src/components/ui/__tests__/touch-targets.test.tsx
```

Expected: PASS.

**Step 12: Run a focused lint check**

Run:

```bash
pnpm lint
```

Expected: PASS.

**Step 13: Commit**

Run:

```bash
git add app/globals.css \
  src/components/ui/button.tsx \
  src/components/ui/toggle.tsx \
  src/components/ui/toggle-group.tsx \
  src/components/ui/sidebar.tsx \
  src/components/ui/input-group.tsx \
  src/components/ui/switch.tsx \
  src/components/layout/app-layout.tsx \
  src/components/layout/page-header.tsx \
  src/components/ui/__tests__/touch-targets.test.tsx
git commit -m "refactor(mobile): establish responsive touch primitives"
```

---

### Task 2: CRM Mobile List Mode

**Files:**
- Modify: `src/components/ui/list-table.tsx`
- Modify: `src/components/ui/row-actions.tsx`
- Create: `src/components/crm/mobile-record-card.tsx`
- Create: `src/components/crm/__tests__/mobile-record-card.test.tsx`
- Modify: `src/components/ui/__tests__/list-table.test.tsx`
- Modify: `app/(dashboard)/customers/people/page.tsx`
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/companies/page.tsx`
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/customers/deals/page.tsx`
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.test.tsx`
- Modify: `app/(dashboard)/tasks/__tests__/page.integration.test.tsx`

**Step 1: Write the failing ListTable mobile renderer test**

Append this test to `src/components/ui/__tests__/list-table.test.tsx`:

```tsx
it("renders mobile cards below md while keeping the desktop table path", () => {
  render(
    <ListTable<PersonRow>
      columns={[...columns]}
      data={rows}
      getRowId={(row) => row.id}
      mobileCardRenderer={(row, helpers) => (
        <button
          type="button"
          data-testid={`mobile-card-${row.id}`}
          onClick={helpers.openRow}
        >
          {row.name}
        </button>
      )}
    />,
  );

  expect(screen.getByRole("table")).toHaveClass("max-md:hidden");
  expect(screen.getByTestId("mobile-card-1")).toHaveClass("md:hidden");
  expect(screen.getByTestId("mobile-card-2")).toHaveTextContent("Adam Tan");
});
```

**Step 2: Run the failing ListTable test**

Run:

```bash
pnpm vitest run src/components/ui/__tests__/list-table.test.tsx -t "mobile cards"
```

Expected: FAIL because `mobileCardRenderer` is not yet a prop.

**Step 3: Extend the ListTable props**

Modify `src/components/ui/list-table.tsx`:

```tsx
export interface ListTableMobileCardHelpers {
  actions: React.ReactNode;
  isSelected: boolean;
  openRow: () => void;
  rowId?: string;
}

export interface ListTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pagination?: ListTablePagination;
  isLoading?: boolean;
  error?: React.ReactNode;
  emptyState?: React.ReactNode;
  rowActions?: (row: TData) => RowActionItem[];
  onRowClick?: (row: TData) => void;
  selectedRowId?: string;
  getRowId?: (row: TData) => string;
  initialSorting?: SortingState;
  pinFirstColumn?: boolean;
  onColumnResize?: (columnId: string, width: number) => void;
  mobileCardRenderer?: (row: TData, helpers: ListTableMobileCardHelpers) => React.ReactNode;
  className?: string;
}
```

**Step 4: Render the mobile card branch**

Inside `ListTable`, build a helper before the `return`:

```tsx
const mobileRows = table.getRowModel().rows;

const renderMobileCards = () => {
  if (!mobileCardRenderer) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-2 md:hidden" data-testid="list-table-mobile-loading">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-app-border-subtle bg-app-surface p-3"
          >
            <Skeleton className="mb-3 h-4 w-2/3" />
            <Skeleton className="mb-2 h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="md:hidden">{renderTableState(error, 1, "text-destructive")}</div>;
  }

  if (mobileRows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-app-border-subtle p-4 text-center text-muted-foreground md:hidden">
        {emptyState ?? "No results."}
      </div>
    );
  }

  return (
    <div className="space-y-2 md:hidden" data-testid="list-table-mobile-cards">
      {mobileRows.map((row) => {
        const rowId = getRowId?.(row.original);
        const isSelected = Boolean(selectedRowId && rowId === selectedRowId);
        const actions = rowActions ? (
          <RowActions
            items={rowActions(row.original)}
            triggerClassName="touch-target text-muted-foreground"
          />
        ) : null;

        return (
          <div key={row.id} className="md:hidden">
            {mobileCardRenderer(row.original, {
              actions,
              isSelected,
              rowId,
              openRow: () => onRowClick?.(row.original),
            })}
          </div>
        );
      })}
    </div>
  );
};
```

Then change the JSX so the desktop table is hidden when a mobile renderer exists:

```tsx
<div className={cn("min-w-0", className)}>
  {renderMobileCards()}
  <div className={cn("overflow-x-auto", mobileCardRenderer && "max-md:hidden")}>
    <table
      className={cn("w-full", mobileCardRenderer && "max-md:hidden", isColumnResizeEnabled && "min-w-full table-fixed")}
      style={isColumnResizeEnabled ? { width: table.getTotalSize() } : undefined}
    >
      {/* existing table */}
    </table>
  </div>
  {/* existing pagination */}
</div>
```

If `renderTableState` cannot be reused inside a `div`, create a small mobile state helper instead of rendering a `tr` outside a table.

**Step 5: Make RowActions accept trigger classes**

Modify `src/components/ui/row-actions.tsx`:

```tsx
interface RowActionsProps {
  items?: RowActionItem[];
  triggerClassName?: string;
}

export function RowActions({ items = [], triggerClassName }: RowActionsProps) {
  // existing implementation
}
```

Update the trigger button:

```tsx
className={cn(
  "inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors",
  "hover:bg-muted hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  triggerClassName,
)}
```

**Step 6: Create the shared mobile record card**

Create `src/components/crm/mobile-record-card.tsx`:

```tsx
/**
 * Compact mobile card used by CRM list pages below the md breakpoint.
 * @module components/crm/mobile-record-card
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MobileRecordCardField {
  label: string;
  value: ReactNode;
}

interface MobileRecordCardProps {
  actions?: ReactNode;
  eyebrow?: ReactNode;
  fields?: MobileRecordCardField[];
  isSelected?: boolean;
  meta?: ReactNode;
  onOpen?: () => void;
  title: ReactNode;
}

export function MobileRecordCard({
  actions,
  eyebrow,
  fields = [],
  isSelected = false,
  meta,
  onOpen,
  title,
}: MobileRecordCardProps) {
  return (
    <article
      className={cn(
        "rounded-md border border-app-border-subtle bg-app-surface p-3 transition-colors",
        onOpen && "cursor-pointer hover:bg-app-hover/60",
        isSelected && "bg-[var(--selection)]",
      )}
      onClick={(event) => {
        if (!onOpen) return;
        if (
          (event.target as HTMLElement).closest(
            "a,button,input,select,textarea,label,[role='button'],[data-actions-cell]",
          )
        ) {
          return;
        }
        onOpen();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-caption text-muted-foreground">{eyebrow}</div> : null}
          <div className="type-row-title text-foreground">{title}</div>
          {meta ? <div className="mt-1 type-row-meta text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div data-actions-cell>{actions}</div> : null}
      </div>
      {fields.length > 0 ? (
        <dl className="mt-3 grid gap-2 text-control">
          {fields.map((field) => (
            <div key={field.label} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
```

**Step 7: Test the mobile card**

Create `src/components/crm/__tests__/mobile-record-card.test.tsx`:

```tsx
/**
 * Tests for CRM mobile record cards.
 * @module components/crm/__tests__/mobile-record-card
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileRecordCard } from "../mobile-record-card";

describe("MobileRecordCard", () => {
  it("opens from card body and isolates action clicks", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    const action = vi.fn();

    render(
      <MobileRecordCard
        title="Sarah Lim"
        meta="Buyer"
        onOpen={open}
        actions={<button type="button" onClick={action}>More</button>}
      />,
    );

    await user.click(screen.getByText("Sarah Lim"));
    await user.click(screen.getByRole("button", { name: "More" }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
```

Run:

```bash
pnpm vitest run src/components/crm/__tests__/mobile-record-card.test.tsx
```

Expected: PASS after the component exists.

**Step 8: Add mobile card renderers to People**

Modify `app/(dashboard)/customers/people/page.tsx`. At the `ListTable` call, add:

```tsx
mobileCardRenderer={(contact, helpers) => (
  <MobileRecordCard
    title={formatContactFullName(contact)}
    eyebrow={formatCrmEnumLabel(contact.type)}
    meta={contact.companies?.name ?? "No company"}
    isSelected={helpers.isSelected}
    actions={helpers.actions}
    onOpen={helpers.openRow}
    fields={[
      {
        label: "Phone",
        value: contact.phone ? (
          <a href={`tel:${contact.phone}`} className="truncate hover:underline">
            {contact.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
      },
      {
        label: "Email",
        value: contact.email ? (
          <a href={`mailto:${contact.email}`} className="truncate hover:underline">
            {contact.email}
          </a>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
      },
      { label: "Updated", value: formatCrmDate(contact.updated_at) },
    ]}
  />
)}
```

Add the import:

```tsx
import { MobileRecordCard } from "@/components/crm/mobile-record-card";
```

Use the exact local field names already present in the page. If the contact name helper expects first/last fields, keep using `formatContactFullName(contact)`.

**Step 9: Add mobile card renderers to Companies**

Modify `app/(dashboard)/customers/companies/page.tsx`. Add the same import and pass:

```tsx
mobileCardRenderer={(company, helpers) => (
  <MobileRecordCard
    title={company.name}
    meta={company.website ?? "No website"}
    isSelected={helpers.isSelected}
    actions={helpers.actions}
    onOpen={helpers.openRow}
    fields={[
      { label: "People", value: company.contact_count ?? 0 },
      { label: "Deals", value: company.deal_count ?? 0 },
      { label: "Phone", value: company.phone ?? <span className="text-muted-foreground">None</span> },
      { label: "Updated", value: formatCrmDate(company.updated_at) },
    ]}
  />
)}
```

Adjust `contact_count` / `deal_count` names to the actual `CompanyWithCounts` fields if they differ.

**Step 10: Add mobile card renderers to Deals**

Modify `app/(dashboard)/customers/deals/page.tsx`. Add:

```tsx
mobileCardRenderer={(deal, helpers) => (
  <MobileRecordCard
    title={deal.name ?? deal.address}
    eyebrow={formatDealStageLabel(deal.stage)}
    meta={formatCompactCurrency(deal.amount)}
    isSelected={helpers.isSelected}
    actions={helpers.actions}
    onOpen={helpers.openRow}
    fields={[
      { label: "Address", value: deal.address },
      { label: "Company", value: deal.companies?.name ?? <span className="text-muted-foreground">None</span> },
      { label: "Contact", value: getPrimaryContactLabel(deal) || <span className="text-muted-foreground">None</span> },
      { label: "Updated", value: formatCrmDate(deal.updated_at) },
    ]}
  />
)}
```

Keep the table renderer unchanged for `md+`.

**Step 11: Add mobile card renderers to Tasks**

Modify `app/(dashboard)/tasks/page.tsx`. Add:

```tsx
mobileCardRenderer={(task, helpers) => (
  <MobileRecordCard
    title={task.title}
    eyebrow={formatCrmEnumLabel(task.status)}
    meta={task.due_date ? formatCrmDate(task.due_date) : "No due date"}
    isSelected={helpers.isSelected}
    actions={helpers.actions}
    onOpen={helpers.openRow}
    fields={[
      { label: "Contact", value: task.contacts ? formatContactFullName(task.contacts) : <span className="text-muted-foreground">None</span> },
      { label: "Deal", value: task.deals?.name ?? task.deals?.address ?? <span className="text-muted-foreground">None</span> },
      { label: "Updated", value: formatCrmDate(task.updated_at) },
    ]}
  />
)}
```

Adjust relation names to match the page's existing task row type.

**Step 12: Add page tests for renderer wiring**

In each page test that already captures `mockedListTable`, add an assertion:

```tsx
const listProps = mockedListTable.mock.lastCall?.[0] as {
  mobileCardRenderer?: unknown;
};

expect(listProps.mobileCardRenderer).toEqual(expect.any(Function));
```

Run each changed test:

```bash
pnpm vitest run \
  app/(dashboard)/customers/people/__tests__/page.test.tsx \
  app/(dashboard)/customers/companies/__tests__/page.test.tsx \
  app/(dashboard)/customers/deals/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.integration.test.tsx
```

Expected: PASS.

**Step 13: Run ListTable and mobile card tests**

Run:

```bash
pnpm vitest run \
  src/components/ui/__tests__/list-table.test.tsx \
  src/components/crm/__tests__/mobile-record-card.test.tsx
```

Expected: PASS.

**Step 14: Commit**

Run:

```bash
git add src/components/ui/list-table.tsx \
  src/components/ui/row-actions.tsx \
  src/components/ui/__tests__/list-table.test.tsx \
  src/components/crm/mobile-record-card.tsx \
  src/components/crm/__tests__/mobile-record-card.test.tsx \
  app/(dashboard)/customers/people/page.tsx \
  app/(dashboard)/customers/people/__tests__/page.test.tsx \
  app/(dashboard)/customers/companies/page.tsx \
  app/(dashboard)/customers/companies/__tests__/page.test.tsx \
  app/(dashboard)/customers/deals/page.tsx \
  app/(dashboard)/customers/deals/__tests__/page.test.tsx \
  app/(dashboard)/tasks/page.tsx \
  app/(dashboard)/tasks/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.integration.test.tsx
git commit -m "refactor(mobile): add CRM mobile list cards"
```

---

### Task 3: CRM Toolbar, Filters, And Detail Sheets

**Files:**
- Modify: `src/components/crm/crm-workspace-shell.tsx`
- Modify: `src/components/crm/view-picker.tsx`
- Modify: `src/components/crm/view-toggle.tsx`
- Modify: `src/components/ui/filter-bar.tsx`
- Modify: `src/components/ui/filter-overlay.tsx`
- Modify: `src/components/crm/record-drawer/record-drawer.tsx`
- Modify: `src/components/crm/record-drawer/record-detail-panel-shell.tsx`
- Create: `src/components/crm/__tests__/crm-workspace-shell.test.tsx`
- Modify: `src/components/ui/__tests__/filter-overlay.test.tsx`

**Step 1: Write a failing CRM shell layout test**

Create `src/components/crm/__tests__/crm-workspace-shell.test.tsx`:

```tsx
/**
 * Tests for the shared CRM workspace responsive toolbar.
 * @module components/crm/__tests__/crm-workspace-shell
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CrmWorkspaceShell } from "../crm-workspace-shell";

vi.mock("@/hooks/use-crm-views", () => ({
  useCrmViews: () => ({ data: [] }),
}));

describe("CrmWorkspaceShell", () => {
  it("renders the CRM toolbar as a mobile-first control stack", () => {
    render(
      <CrmWorkspaceShell
        activeViewId={null}
        count={12}
        entityType="contacts"
        onViewChange={vi.fn()}
        onViewTypeChange={vi.fn()}
        onSearchChange={vi.fn()}
        searchValue=""
        searchPlaceholder="Search people"
        title="People"
        viewContent={<div>Rows</div>}
        viewType="table"
        views={["table", "kanban"]}
      />,
    );

    expect(screen.getByTestId("crm-toolbar-stack")).toHaveClass("grid");
    expect(screen.getByPlaceholderText("Search people")).toHaveClass("h-11");
  });
});
```

**Step 2: Run the failing CRM shell test**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/crm-workspace-shell.test.tsx
```

Expected: FAIL because the stack test id and mobile search height do not exist.

**Step 3: Add a stack hook to FilterBar**

Modify `src/components/ui/filter-bar.tsx`. Add a prop:

```tsx
mobileStacked?: boolean;
```

Update the root toolbar row:

```tsx
<div
  data-testid={mobileStacked ? "crm-toolbar-stack" : undefined}
  className={cn(
    "w-full",
    mobileStacked
      ? "grid gap-2 sm:flex sm:flex-wrap sm:items-center"
      : "flex flex-wrap items-center gap-1",
  )}
>
```

Update the search wrapper/input:

```tsx
<div className={cn(
  "relative w-full",
  mobileStacked ? "sm:ml-auto sm:w-auto sm:min-w-[240px] sm:max-w-[320px]" : "sm:ml-auto sm:w-auto sm:min-w-[240px] sm:max-w-[320px]",
)}>
  <Input
    value={searchDraft}
    onChange={(event) => setSearchDraft(event.target.value)}
    placeholder={searchPlaceholder}
    className="h-11 border-app-border-subtle bg-app-surface pl-8 pr-2 shadow-none sm:h-10"
  />
</div>
```

Keep the existing debounce behavior.

**Step 4: Use the stack in CrmWorkspaceShell**

Modify `src/components/crm/crm-workspace-shell.tsx`:

```tsx
<FilterBar
  mobileStacked
  filterPosition="trailing"
  leadingSlot={(
    <div className="flex min-w-0 flex-wrap items-center gap-1 sm:-ml-2.5">
      <ViewPicker
        entityType={entityType}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        count={count}
      />
      <ViewToggle
        current={viewType}
        views={views}
        onChange={onViewTypeChange ?? (() => {})}
        disabled={isSavedViewActive || !onViewTypeChange}
      />
    </div>
  )}
  trailingSlot={(
    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
      {secondaryActions}
      {primaryAction}
    </div>
  )}
  ...
/>
```

Do not change the query state model.

**Step 5: Make ViewPicker mobile-safe**

Modify `src/components/crm/view-picker.tsx`:

```tsx
className="max-w-full gap-1.5 rounded-md px-2.5 font-medium text-foreground ring-1 ring-transparent transition-colors hover:bg-app-hover/60 hover:ring-app-border-subtle max-sm:h-11"
```

Also wrap the label:

```tsx
<span className="min-w-0 truncate">{triggerLabel}</span>
```

**Step 6: Make ViewToggle mobile icon-first**

Modify `src/components/crm/view-toggle.tsx` so the text label hides on very small screens:

```tsx
<AppIcon name={viewIconMap[view]} className="size-4 sm:size-3.5" />
<span className="sr-only sm:not-sr-only">{viewLabelMap[view]}</span>
```

Because `Toggle` was updated in Task 1, the hit area is already phone-safe.

**Step 7: Write a failing FilterOverlay mobile placement test**

Append to `src/components/ui/__tests__/filter-overlay.test.tsx`:

```tsx
it("uses a bottom-sheet frame on phones and side-panel frame on larger screens", () => {
  render(
    <FilterOverlay
      open
      onOpenChange={vi.fn()}
      onApply={vi.fn()}
      filters={[{ id: "query", label: "Search term", type: "text" }]}
      initialValues={{}}
    />,
  );

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveClass("bottom-0");
  expect(dialog).toHaveClass("sm:inset-y-0");
  expect(dialog).toHaveClass("max-h-[90dvh]");
});
```

**Step 8: Run the failing FilterOverlay test**

Run:

```bash
pnpm vitest run src/components/ui/__tests__/filter-overlay.test.tsx -t "bottom-sheet"
```

Expected: FAIL until the overlay frame changes.

**Step 9: Convert FilterOverlay to mobile bottom sheet**

Modify `src/components/ui/filter-overlay.tsx` content class:

```tsx
className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col rounded-t-xl border-t border-border/40 bg-background shadow-xl outline-none data-open:animate-in data-open:slide-in-from-bottom-10 data-closed:animate-out data-closed:slide-out-to-bottom-10 sm:inset-y-0 sm:left-0 sm:bottom-auto sm:max-h-none sm:max-w-[380px] sm:rounded-none sm:border-r sm:border-t-0 sm:data-open:slide-in-from-left-10 sm:data-closed:slide-out-to-left-10"
```

Update close/apply/clear buttons to rely on Task 1 mobile sizing. Do not duplicate custom `h-11` on every button.

**Step 10: Add RecordDrawer phone height contract**

Modify `src/components/crm/record-drawer/record-drawer.tsx`:

```tsx
<SheetContent
  side={isMobile ? "bottom" : "right"}
  className="max-h-[90dvh] w-full overflow-hidden p-0 sm:h-dvh sm:max-h-none sm:w-[540px] sm:max-w-[540px]"
>
```

The drawer body should scroll inside its own content, not the document.

**Step 11: Pin record detail header/footer behavior**

Modify `src/components/crm/record-drawer/record-detail-panel-shell.tsx`. The shell should have:

```tsx
<div className="flex h-full max-h-[90dvh] min-h-0 flex-col sm:max-h-none">
  <header className="shrink-0 border-b border-app-border-subtle bg-background">
    {/* existing header */}
  </header>
  <div className="min-h-0 flex-1 overflow-y-auto">
    {/* existing body */}
  </div>
</div>
```

If the file already has equivalent sections, change only the classes.

**Step 12: Run focused tests**

Run:

```bash
pnpm vitest run \
  src/components/crm/__tests__/crm-workspace-shell.test.tsx \
  src/components/ui/__tests__/filter-overlay.test.tsx
```

Expected: PASS.

**Step 13: Run CRM page tests**

Run:

```bash
pnpm vitest run \
  app/(dashboard)/customers/people/__tests__/page.test.tsx \
  app/(dashboard)/customers/companies/__tests__/page.test.tsx \
  app/(dashboard)/customers/deals/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.test.tsx
```

Expected: PASS.

**Step 14: Commit**

Run:

```bash
git add src/components/crm/crm-workspace-shell.tsx \
  src/components/crm/view-picker.tsx \
  src/components/crm/view-toggle.tsx \
  src/components/ui/filter-bar.tsx \
  src/components/ui/filter-overlay.tsx \
  src/components/crm/record-drawer/record-drawer.tsx \
  src/components/crm/record-drawer/record-detail-panel-shell.tsx \
  src/components/crm/__tests__/crm-workspace-shell.test.tsx \
  src/components/ui/__tests__/filter-overlay.test.tsx
git commit -m "refactor(mobile): adapt CRM controls and detail sheets"
```

---

### Task 4: Mobile Kanban And Calendar Workflows

**Files:**
- Modify: `src/components/crm/kanban-board.tsx`
- Modify: `src/components/crm/deal-kanban-card.tsx`
- Modify: `src/components/crm/task-kanban-view.tsx`
- Modify: `src/components/crm/task-calendar-view.tsx`
- Modify: `src/components/crm/crm-tasks-calendar.tsx`
- Modify: `src/components/crm/__tests__/kanban-board.test.tsx`

**Step 1: Write the failing mobile kanban test**

Append to `src/components/crm/__tests__/kanban-board.test.tsx`:

```tsx
it("renders a one-column mobile board with an explicit move control instead of drag handles", async () => {
  window.innerWidth = 390;
  window.dispatchEvent(new Event("resize"));

  const onColumnChange = vi.fn().mockResolvedValue(undefined);

  render(
    <KanbanBoard
      items={items}
      columns={columns}
      groupBy={(item) => item.status}
      renderCard={(item) => <div>{item.title}</div>}
      getItemId={(item) => item.id}
      onColumnChange={onColumnChange}
      mobileColumnChangeLabel="status"
    />,
  );

  expect(await screen.findByTestId("kanban-mobile-board")).toBeInTheDocument();
  expect(screen.queryByTestId("kanban-desktop-board")).not.toBeVisible();

  await userEvent.selectOptions(screen.getByLabelText("Move Task A to status"), "done");

  expect(onColumnChange).toHaveBeenCalledWith("1", "todo", "done");
});
```

If jsdom does not make `not.toBeVisible()` reliable because CSS is class-based, assert `toHaveClass("max-md:hidden")` on the desktop frame instead.

**Step 2: Run the failing mobile kanban test**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/kanban-board.test.tsx -t "one-column mobile board"
```

Expected: FAIL because the board has no mobile path.

**Step 3: Extend KanbanBoard props**

Modify `src/components/crm/kanban-board.tsx`:

```tsx
interface KanbanBoardBaseProps<T> {
  boardLabel?: string;
  items: T[];
  columns: KanbanColumn[];
  groupBy: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onCardClick?: (id: string) => void;
  getColumnSummary?: (columnKey: string, columnItems: T[]) => string | undefined;
  emptyStateMessage?: string;
  mobileColumnChangeLabel?: string;
}
```

**Step 4: Add a mobile board frame**

Add a mobile-only renderer in `src/components/crm/kanban-board.tsx`:

```tsx
function MobileKanbanBoardContent<T>({
  columns,
  emptyStateMessage,
  getItemId,
  groupBy,
  items,
  mobileColumnChangeLabel = "column",
  onCardClick,
  onColumnChange,
  renderCard,
}: (StaticKanbanBoardProps<T> | DraggableKanbanBoardProps<T>) & {
  emptyStateMessage: string;
}) {
  const [activeColumnKey, setActiveColumnKey] = useState(columns[0]?.key ?? "");
  const groupedItems = groupItemsByColumn({ columns, getItemId, groupBy, items });
  const activeColumn = columns.find((column) => column.key === activeColumnKey) ?? columns[0];
  const activeItems = activeColumn ? groupedItems.get(activeColumn.key) ?? [] : [];
  const canMove = typeof onColumnChange === "function" && typeof getItemId === "function";

  return (
    <div className="space-y-3 md:hidden" data-testid="kanban-mobile-board">
      <label className="grid gap-1.5">
        <span className="type-control text-muted-foreground">Stage</span>
        <select
          className="h-11 rounded-md border border-input bg-background px-3 text-control"
          value={activeColumn?.key ?? ""}
          onChange={(event) => setActiveColumnKey(event.target.value)}
        >
          {columns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </label>

      <section className="space-y-2">
        {activeItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-center type-empty-copy text-muted-foreground">
            {emptyStateMessage}
          </p>
        ) : (
          activeItems.map((item) => {
            const itemId = getItemId?.(item);
            const currentColumn = groupBy(item);

            return (
              <div key={itemId ?? JSON.stringify(item)} className="space-y-2">
                <KanbanCardShell
                  className={onCardClick && itemId ? "cursor-pointer" : ""}
                  onClick={() => {
                    if (onCardClick && itemId) onCardClick(itemId);
                  }}
                >
                  {renderCard(item)}
                </KanbanCardShell>
                {canMove && itemId ? (
                  <label className="grid gap-1.5">
                    <span className="sr-only">Move {String((item as { title?: unknown }).title ?? itemId)} to {mobileColumnChangeLabel}</span>
                    <select
                      aria-label={`Move ${String((item as { title?: unknown }).title ?? itemId)} to ${mobileColumnChangeLabel}`}
                      className="h-11 rounded-md border border-input bg-background px-3 text-control"
                      value={currentColumn}
                      onChange={(event) => {
                        void onColumnChange(itemId, currentColumn, event.target.value);
                      }}
                    >
                      {columns.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
```

Keep the implementation generic. Do not introduce a deal-specific branch in the board primitive.

**Step 5: Mark the desktop board frame**

Modify `KanbanBoardFrame`:

```tsx
<div className="min-w-0 max-md:hidden" data-testid="kanban-desktop-board">
  {/* existing content */}
</div>
```

**Step 6: Render both mobile and desktop paths**

In `KanbanBoard`, return a fragment:

```tsx
export function KanbanBoard<T>(props: KanbanBoardProps<T>) {
  const emptyStateMessage = props.emptyStateMessage ?? "No items yet.";

  return (
    <>
      <MobileKanbanBoardContent {...props} emptyStateMessage={emptyStateMessage} />
      {"onColumnChange" in props && props.onColumnChange ? (
        <DraggableKanbanBoardContent {...props} emptyStateMessage={emptyStateMessage} />
      ) : (
        <StaticKanbanBoardContent {...props} emptyStateMessage={emptyStateMessage} />
      )}
    </>
  );
}
```

**Step 7: Pass a meaningful move label for deals and tasks**

Modify `app/(dashboard)/customers/deals/page.tsx` where `KanbanBoard` is rendered:

```tsx
mobileColumnChangeLabel="stage"
```

Modify `src/components/crm/task-kanban-view.tsx`:

```tsx
mobileColumnChangeLabel="status"
```

**Step 8: Audit deal and task kanban cards for mobile wrapping**

Modify `src/components/crm/deal-kanban-card.tsx` and task card files so long addresses and names use:

```tsx
className="min-w-0 truncate"
```

For multi-line copy use:

```tsx
className="line-clamp-2 break-words"
```

Do not add decorative cards inside cards.

**Step 9: Review task calendar mobile structure**

Modify `src/components/crm/crm-tasks-calendar.tsx` and `src/components/crm/task-calendar-view.tsx` only if the current layout has horizontal page overflow. Prefer:

```tsx
<div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-7">
```

For day cells:

```tsx
<section className="min-w-0 rounded-md border border-app-border-subtle bg-app-surface p-2">
```

For event text:

```tsx
<button className="min-h-11 w-full min-w-0 rounded-md px-2 text-left">
  <span className="block truncate">{task.title}</span>
</button>
```

**Step 10: Run kanban tests**

Run:

```bash
pnpm vitest run src/components/crm/__tests__/kanban-board.test.tsx
```

Expected: PASS.

**Step 11: Run deals and tasks tests**

Run:

```bash
pnpm vitest run \
  app/(dashboard)/customers/deals/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.test.tsx \
  app/(dashboard)/tasks/__tests__/page.integration.test.tsx
```

Expected: PASS.

**Step 12: Commit**

Run:

```bash
git add src/components/crm/kanban-board.tsx \
  src/components/crm/deal-kanban-card.tsx \
  src/components/crm/task-kanban-view.tsx \
  src/components/crm/task-calendar-view.tsx \
  src/components/crm/crm-tasks-calendar.tsx \
  src/components/crm/__tests__/kanban-board.test.tsx \
  app/(dashboard)/customers/deals/page.tsx
git commit -m "refactor(mobile): add phone-safe kanban workflows"
```

---

### Task 5: Chat, Automations, Settings, And Pricing Polish

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-welcome.tsx`
- Modify: `src/components/chat/message-list.tsx`
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/chat-composer.test.tsx`
- Modify: `src/components/automations/automations-list.tsx`
- Modify: `src/components/automations/automation-launcher-composer.tsx`
- Modify: `src/components/automations/__tests__/automations-list.test.tsx`
- Modify: `app/settings/layout.tsx`
- Modify: `src/components/settings/settings-mobile-nav.tsx`
- Modify: `src/components/settings/settings-nav.tsx`
- Modify: `app/(dashboard)/pricing/page.tsx`

**Step 1: Write a failing ChatComposer touch test**

Append to `src/components/chat/chat-composer.test.tsx`:

```tsx
it("renders phone-safe composer controls", () => {
  renderComposer(<ChatComposer {...baseProps} />);

  expect(screen.getByRole("button", { name: /attach files/i })).toHaveClass("max-sm:size-11");
  expect(screen.getByRole("button", { name: /submit/i })).toHaveClass("max-sm:size-11");
});
```

If the attach button is hidden when attachments are disabled in the helper, pass `allowAttachments`.

**Step 2: Run the failing ChatComposer test**

Run:

```bash
pnpm vitest run src/components/chat/chat-composer.test.tsx -t "phone-safe composer"
```

Expected: FAIL if Task 1 did not already cover the input-group classes in rendered output.

**Step 3: Make composer control classes explicit**

Modify `src/components/chat/chat-composer.tsx`. For attach, stop, and submit buttons, add:

```tsx
className="max-sm:size-11"
```

For the composer footer/tools row use:

```tsx
className="flex flex-wrap items-center gap-2"
```

Keep the submit behavior unchanged.

**Step 4: Reduce phone welcome padding**

Modify `src/components/chat/chat-welcome.tsx`. Replace large top padding with mobile-first spacing:

```tsx
className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-6 sm:py-10"
```

For category tabs or chips, use:

```tsx
className="flex w-full gap-2 overflow-x-auto pb-1"
```

Each tab should use at least:

```tsx
className="min-h-11 shrink-0"
```

**Step 5: Constrain message content**

Modify `src/components/chat/message-list.tsx` and `src/components/chat/message-bubble.tsx` so message content uses:

```tsx
className="min-w-0 max-w-full break-words"
```

For code/spec/artifact wrappers use:

```tsx
className="max-w-full overflow-x-auto"
```

The allowed horizontal scroll region is inside code/artifact blocks, not on the document.

**Step 6: Write failing automation list mobile test**

Append to `src/components/automations/__tests__/automations-list.test.tsx`:

```tsx
it("uses mobile-safe row layout and switch target", () => {
  render(
    <AutomationsList
      triggers={[
        {
          id: "trigger-1",
          thread_id: "thread-1",
          name: "Daily briefing",
          trigger_type: "schedule",
          cron_expression: "0 9 * * *",
          payload: {},
          enabled: true,
          next_fire_at: "2026-04-25T00:00:00.000Z",
          last_fired_at: null,
          last_status: "completed",
          isRunning: false,
          invocation_message: null,
          instruction_path: "state/triggers/daily-briefing.md",
        },
      ]}
      onToggleEnabled={vi.fn()}
    />,
  );

  expect(screen.getByTestId("automation-row-trigger-1")).toHaveClass("max-sm:items-start");
  expect(screen.getByRole("switch")).toHaveClass("max-sm:after:-inset-3");
});
```

**Step 7: Run the failing automation test**

Run:

```bash
pnpm vitest run src/components/automations/__tests__/automations-list.test.tsx -t "mobile-safe"
```

Expected: FAIL until row test id and mobile classes are added.

**Step 8: Update automation rows**

Modify `src/components/automations/automations-list.tsx`:

```tsx
<div
  data-testid={`automation-row-${trigger.id}`}
  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-app-hover/60 max-sm:items-start max-sm:py-3"
>
  <Link
    href={`/automations/${trigger.id}`}
    className="flex min-w-0 flex-1 items-center gap-3"
  >
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="type-row-title text-foreground/90">{trigger.name}</span>
        <Badge variant={getStatusVariant(trigger)}>{getStatusLabel(trigger)}</Badge>
      </div>
      <span className="mt-1 block type-row-meta text-muted-foreground">
        {cronToHuman(trigger.cron_expression)}
      </span>
    </div>
  </Link>
  <div className="flex shrink-0 items-center gap-4 max-sm:flex-col max-sm:items-end max-sm:gap-2">
    {trigger.enabled && trigger.next_fire_at ? (
      <span className="type-row-meta text-muted-foreground">
        {formatCountdown(trigger.next_fire_at)}
      </span>
    ) : null}
    <Switch
      checked={trigger.enabled}
      onCheckedChange={(checked) => onToggleEnabled(trigger.id, checked)}
    />
  </div>
</div>
```

**Step 9: Add safe-area padding to automation launcher composer**

Modify `src/components/automations/automation-launcher-composer.tsx` wrapper classes:

```tsx
className="pb-[max(env(safe-area-inset-bottom),0.75rem)]"
```

Keep sticky behavior unchanged.

**Step 10: Settings mobile audit and fixes**

Open each settings route under `app/settings/**/page.tsx`. For any phone-visible button/select/input below 44px, use existing primitives from Task 1 rather than local one-off height classes.

Specific checks:

```bash
rg "size=\"xs\"|size=\"icon-xs\"|h-7|h-8|size-7|size-8" app/settings src/components/settings
```

Expected: any remaining tiny classes are either hidden on phone or updated with `max-sm:*`.

**Step 11: Pricing mobile audit and fixes**

Open `app/(dashboard)/pricing/page.tsx`. Ensure:

```tsx
className="grid gap-3 md:grid-cols-3"
```

for plan cards and:

```tsx
className="min-h-11 w-full"
```

for phone-visible checkout actions if the Button variant does not already cover it.

**Step 12: Run focused tests**

Run:

```bash
pnpm vitest run \
  src/components/chat/chat-composer.test.tsx \
  src/components/automations/__tests__/automations-list.test.tsx \
  app/settings/notifications/page.test.tsx \
  app/settings/agent/general/page.test.tsx \
  app/(dashboard)/pricing/__tests__/page.test.tsx
```

Expected: PASS.

**Step 13: Commit**

Run:

```bash
git add src/components/chat/chat-composer.tsx \
  src/components/chat/chat-welcome.tsx \
  src/components/chat/message-list.tsx \
  src/components/chat/message-bubble.tsx \
  src/components/chat/chat-composer.test.tsx \
  src/components/automations/automations-list.tsx \
  src/components/automations/automation-launcher-composer.tsx \
  src/components/automations/__tests__/automations-list.test.tsx \
  app/settings \
  src/components/settings \
  app/(dashboard)/pricing/page.tsx
git commit -m "refactor(mobile): polish chat automations settings pricing"
```

---

### Task 6: Responsive QA Harness

**Files:**
- Create: `scripts/qa/responsive-matrix.ts`
- Modify: `package.json`
- Modify: `docs/qa/README.md`
- Modify: `docs/qa/04-crm-pages.md`
- Modify: `docs/qa/08-triggers-and-automations.md`
- Modify: `docs/qa/16-crm-working-surfaces.md`

**Step 1: Create the failing responsive QA script**

Create `scripts/qa/responsive-matrix.ts`:

```ts
#!/usr/bin/env npx tsx
/**
 * Responsive route matrix for authenticated app surfaces.
 * @module scripts/qa/responsive-matrix
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const QA_EMAIL = process.env.QA_USER_EMAIL ?? "";
const QA_PASSWORD = process.env.QA_USER_PASSWORD ?? "";
const OUTPUT_DIR = join("scripts", "qa", "output", `responsive-${Date.now()}`);

const viewports = [
  { name: "phone", width: 390, height: 844, enforceTouch: true },
  { name: "tablet", width: 768, height: 1024, enforceTouch: false },
  { name: "desktop", width: 1440, height: 1000, enforceTouch: false },
] as const;

const routes = [
  "/chat",
  "/customers/people",
  "/customers/companies",
  "/customers/deals",
  "/tasks",
  "/automations",
  "/settings/profile",
  "/pricing",
] as const;

interface RouteResult {
  route: string;
  viewport: string;
  finalUrl: string;
  horizontalOverflow: number;
  smallTargets: Array<{ label: string; width: number; height: number }>;
  status: "pass" | "fail";
  screenshot?: string;
}

async function signIn(page: Page) {
  if (!QA_EMAIL || !QA_PASSWORD) {
    throw new Error("Set QA_USER_EMAIL and QA_USER_PASSWORD for responsive QA.");
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/chat")) {
    return;
  }

  await page.getByLabel(/email address/i).fill(QA_EMAIL);
  await page.getByLabel(/^password$/i).fill(QA_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
}

async function auditRoute(page: Page, route: string, viewport: typeof viewports[number]): Promise<RouteResult> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  const audit = await page.evaluate((enforceTouch) => {
    const root = document.documentElement;
    const body = document.body;
    const horizontalOverflow = Math.max(0, root.scrollWidth - root.clientWidth, body.scrollWidth - body.clientWidth);
    const interactiveSelectors = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='switch']",
      "[role='tab']",
    ].join(",");

    const ignoredSelectors = [
      "[data-nextjs-toast]",
      "[data-nextjs-dialog]",
      "[data-agentation-root]",
      "[aria-hidden='true']",
    ].join(",");

    const smallTargets = enforceTouch
      ? Array.from(document.querySelectorAll<HTMLElement>(interactiveSelectors))
          .filter((element) => {
            if (element.closest(ignoredSelectors)) return false;
            const style = window.getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") return false;
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            return rect.width < 44 || rect.height < 44;
          })
          .slice(0, 20)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label:
                element.getAttribute("aria-label") ||
                element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ||
                element.tagName,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
      : [];

    return { horizontalOverflow, smallTargets };
  }, viewport.enforceTouch);

  const status = audit.horizontalOverflow > 0 || audit.smallTargets.length > 0 ? "fail" : "pass";
  let screenshot: string | undefined;

  if (status === "fail") {
    screenshot = join(OUTPUT_DIR, `${viewport.name}-${route.replaceAll("/", "_").replace(/^_/, "") || "root"}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  return {
    route,
    viewport: viewport.name,
    finalUrl: page.url(),
    horizontalOverflow: audit.horizontalOverflow,
    smallTargets: audit.smallTargets,
    status,
    screenshot,
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const results: RouteResult[] = [];

  try {
    await signIn(page);

    for (const viewport of viewports) {
      for (const route of routes) {
        results.push(await auditRoute(page, route, viewport));
      }
    }
  } finally {
    await browser.close();
  }

  const manifestPath = join(OUTPUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(results, null, 2));

  const failures = results.filter((result) => result.status === "fail");

  for (const result of results) {
    const overflow = result.horizontalOverflow > 0 ? ` overflow=${result.horizontalOverflow}` : "";
    const smallTargets = result.smallTargets.length > 0 ? ` smallTargets=${result.smallTargets.length}` : "";
    console.log(`${result.status.toUpperCase()} ${result.viewport} ${result.route}${overflow}${smallTargets}`);
  }

  console.log(`Manifest: ${manifestPath}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

**Step 2: Add the package script**

Modify `package.json`:

```json
"qa:responsive": "tsx scripts/qa/responsive-matrix.ts"
```

Keep the existing scripts unchanged.

**Step 3: Run the QA script before finishing all fixes**

Run:

```bash
pnpm dev
QA_USER_EMAIL="<test user>" QA_USER_PASSWORD="<test password>" pnpm qa:responsive
```

Expected before all implementation is done: FAIL on current CRM phone overflow and small controls. This confirms the harness catches the problem.

Stop the dev server after the run.

**Step 4: Update QA README**

Modify `docs/qa/README.md`. Add under "How to Use":

````md
### Responsive matrix

Run this after UI changes that affect authenticated app layout:

```bash
pnpm dev
QA_USER_EMAIL=x QA_USER_PASSWORD=y pnpm qa:responsive
```

The script checks `/chat`, CRM list pages, tasks, automations, settings profile, and pricing at 390, 768, and 1440 widths. It fails on document-level horizontal overflow and on phone-visible interactive controls below 44px. Failed route screenshots and a JSON manifest are written to `scripts/qa/output/`.
````

**Step 5: Update CRM QA docs**

Modify `docs/qa/04-crm-pages.md` and add:

```md
### Mobile responsive checks

- [ ] At 390px, `/customers/people` has no document-level horizontal overflow.
- [ ] At 390px, `/customers/companies` has no document-level horizontal overflow.
- [ ] At 390px, `/customers/deals` has no document-level horizontal overflow.
- [ ] At 390px, CRM list rows render as cards, not horizontally scrolled tables.
- [ ] Mobile card tap opens the record detail sheet.
- [ ] Mobile row action menu opens from a 44px target.
```

**Step 6: Update automations QA docs**

Modify `docs/qa/08-triggers-and-automations.md` and add:

```md
### Mobile responsive checks

- [ ] At 390px, `/automations` has no document-level horizontal overflow.
- [ ] Automation rows stack metadata below the automation name.
- [ ] Enable/disable switch can be toggled from a 44px hit area.
- [ ] Sticky launcher composer respects safe-area padding.
```

**Step 7: Update CRM working surfaces QA docs**

Modify `docs/qa/16-crm-working-surfaces.md` and add:

```md
### Mobile responsive checks

- [ ] At 390px, CRM filter overlay opens as a bottom sheet.
- [ ] Filter Apply and Clear controls remain visible or reachable after scrolling options.
- [ ] Record detail opens as a bottom sheet with content scrolling inside the sheet.
- [ ] Deals board can move a deal by explicit stage selector, without requiring drag-and-drop.
- [ ] Tasks calendar does not require document-level horizontal scrolling.
```

**Step 8: Run the responsive matrix after all fixes**

Run:

```bash
pnpm dev
QA_USER_EMAIL="<test user>" QA_USER_PASSWORD="<test password>" pnpm qa:responsive
```

Expected:

```text
PASS phone /chat
PASS phone /customers/people
PASS phone /customers/companies
PASS phone /customers/deals
PASS phone /tasks
PASS phone /automations
PASS phone /settings/profile
PASS phone /pricing
...
```

There may be more PASS lines for tablet and desktop. Any FAIL must be fixed before committing this task.

**Step 9: Run full validation**

Run:

```bash
pnpm lint
pnpm test:run
pnpm build
```

Expected: all commands exit 0.

**Step 10: Commit**

Run:

```bash
git add scripts/qa/responsive-matrix.ts \
  package.json \
  docs/qa/README.md \
  docs/qa/04-crm-pages.md \
  docs/qa/08-triggers-and-automations.md \
  docs/qa/16-crm-working-surfaces.md
git commit -m "test(mobile): add responsive QA matrix"
```

---

## Final End-To-End Acceptance

- [ ] `pnpm lint` passes.
- [ ] `pnpm test:run` passes.
- [ ] `pnpm build` passes.
- [ ] `QA_USER_EMAIL=x QA_USER_PASSWORD=y pnpm qa:responsive` passes against local dev server.
- [ ] `/chat` has no document overflow at 390px.
- [ ] `/customers/people` has no document overflow at 390px.
- [ ] `/customers/companies` has no document overflow at 390px.
- [ ] `/customers/deals` has no document overflow at 390px.
- [ ] `/tasks` has no document overflow at 390px.
- [ ] `/automations` has no document overflow at 390px.
- [ ] `/settings/profile` has no document overflow at 390px.
- [ ] `/pricing` has no document overflow at 390px.
- [ ] Phone-visible primary controls are at least 44px by 44px.
- [ ] Desktop CRM tables preserve TanStack sorting/resizing behavior.
- [ ] No new raw Tailwind palette classes were added to authenticated dashboard components.

## Execution Handoff

Tasklist complete and saved to `docs/tasks/2026-04-25-mobile-responsive-app-tasklist.md`.

Open a new session to do batch execution with checkpoints. Execute Task 1 first, commit, then Task 2, commit, and continue through Task 6. Do not bundle all six tasks into one commit.
