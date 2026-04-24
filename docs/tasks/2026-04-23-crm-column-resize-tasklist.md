# CRM Column Resize — Twenty Parity Implementation Plan

**Goal:** Add draggable, per-column resize to the CRM list tables (Companies, People, Deals) with widths that persist to the user's `crm_config` so they survive page reload and device changes.

**Architecture:** Piggy-back on the existing `crm_config` JSONB storage — the `FieldDefinition.width` field is already in the Zod schema, already saved by `PATCH /api/crm/config`, and already wired into `buildColumnsFromConfig` as TanStack Table's `size`. We only need to (a) render a drag handle on each `<th>`, (b) flip the table to `table-layout: fixed`, (c) provide sensible default widths per field type so columns don't collapse when `width` is unset, and (d) add a `useUpdateFieldWidth` mutation hook that reuses the existing PATCH endpoint. No migration, no new API route, no new table.

**Tech Stack:** TanStack Table v8 (`enableColumnResizing`, `columnResizeMode: "onEnd"`), React 19, Tailwind 4, Zod 4, TanStack Query (mutation + optimistic cache), Vitest + React Testing Library.

## Bite-Sized Step Granularity

Each Step is one action (2-5 minutes):
- "Write the failing test" — Step
- "Run it to make sure it fails" — step
- "Implement the minimal code" — step
- "Run tests, make sure they pass" — step
- "Commit" — step

## Out of Scope

- **Tasks page.** The Tasks list uses hardcoded columns from `src/lib/crm/task-columns.tsx`, not the `FieldDefinition`-driven config. We will leave Tasks on `table-layout: auto` behavior for this PR and revisit if needed. The shared `ListTable` must keep working for Tasks without regressions.
- **Mobile resize UX.** On `< 640px` we disable resize handles (like Twenty does) but keep widths applied.
- **Double-click-to-autofit.** Twenty has this; we don't.
- **Server-side width validation beyond positive integer.** Already enforced by existing Zod schema.

## Relevant Files

### Create
- `src/lib/crm/column-widths.ts` — pure helper: `getDefaultWidthForFieldType(type)` + `RESIZE_MIN_WIDTH` constant.
- `src/lib/crm/__tests__/column-widths.test.ts` — Vitest unit test.
- `src/hooks/use-update-field-width.ts` — TanStack Query mutation that optimistically updates the `crm-config` cache and PATCHes the server.
- `src/hooks/__tests__/use-update-field-width.test.ts` — Vitest test for optimistic update + rollback.

### Modify
- `src/lib/crm/field-definitions.ts` — add `width` to every entry in `CONTACT_DEFAULT_FIELDS`, `COMPANY_DEFAULT_FIELDS`, `DEAL_DEFAULT_FIELDS`.
- `src/lib/crm/build-columns.tsx` — use the default-width helper when `field.width` is missing; pass `minSize`.
- `src/components/ui/list-table.tsx` — flip to `table-layout: fixed`, enable TanStack `enableColumnResizing`, render resize handles on `<th>`, apply `style={{ width }}` to `<th>` and `<td>`, accept a new `onColumnResize` prop.
- `app/(dashboard)/customers/companies/page.tsx` — pass `onColumnResize` to `ListTable`, use `useUpdateFieldWidth` with entity `"companies"`.
- `app/(dashboard)/customers/people/page.tsx` — same.
- `app/(dashboard)/customers/deals/page.tsx` — same.

### Test files already exist (will extend)
- `src/components/ui/__tests__/list-table.test.tsx` (if present — check; otherwise create minimal)
- `app/(dashboard)/customers/companies/__tests__/page.test.tsx` — ensure our change doesn't break current assertions.

---

## Task 1: Default width helper + min-width constant

**Context:** Twenty enforces a 104px column min and uses per-view defaults. We need a pure helper that returns a sensible default width given a `FieldType` (`"text" | "email" | "phone" | ...`). Kept pure so it's trivially testable and reusable by future column-picker UIs.

**Files:**
- Create: `src/lib/crm/column-widths.ts`
- Test: `src/lib/crm/__tests__/column-widths.test.ts`

### Step 1.1: Write the failing test

Create `src/lib/crm/__tests__/column-widths.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { getDefaultWidthForFieldType, RESIZE_MIN_WIDTH } from "../column-widths";

describe("getDefaultWidthForFieldType", () => {
  it("returns wider default for primary-identifier fields", () => {
    expect(getDefaultWidthForFieldType("full_name")).toBe(240);
  });

  it("returns medium default for text-like fields", () => {
    expect(getDefaultWidthForFieldType("text")).toBe(180);
    expect(getDefaultWidthForFieldType("email")).toBe(220);
    expect(getDefaultWidthForFieldType("url")).toBe(200);
  });

  it("returns compact default for dates and numbers", () => {
    expect(getDefaultWidthForFieldType("date")).toBe(140);
    expect(getDefaultWidthForFieldType("number")).toBe(120);
    expect(getDefaultWidthForFieldType("currency")).toBe(140);
  });

  it("returns 180 default for unknown types (safe fallback)", () => {
    // @ts-expect-error — deliberately unknown type
    expect(getDefaultWidthForFieldType("martian")).toBe(180);
  });

  it("exports a min-width matching Twenty (104px)", () => {
    expect(RESIZE_MIN_WIDTH).toBe(104);
  });
});
```

### Step 1.2: Run test to verify it fails

```bash
pnpm vitest run src/lib/crm/__tests__/column-widths.test.ts
```

Expected: FAIL with `Failed to resolve import "../column-widths"`.

### Step 1.3: Write minimal implementation

Create `src/lib/crm/column-widths.ts`:

```typescript
/**
 * Default column widths keyed by FieldType.
 *
 * Used when a FieldDefinition has no saved `width` yet. Values chosen to match
 * Twenty's visual rhythm: primary identifier columns are ~240px, text columns
 * ~180px, dates/numbers ~120-140px.
 *
 * @module lib/crm/column-widths
 */
import type { FieldType } from "./field-definitions";

/** Minimum column width while dragging. Matches Twenty's RECORD_TABLE_COLUMN_MIN_WIDTH. */
export const RESIZE_MIN_WIDTH = 104;

const DEFAULT_BY_TYPE: Record<FieldType, number> = {
  text: 180,
  full_name: 240,
  number: 120,
  currency: 140,
  email: 220,
  phone: 160,
  url: 200,
  date: 140,
  boolean: 100,
  select: 180,
  tags: 200,
  richtext: 220,
  file: 160,
  relation: 200,
};

/** Returns the default pixel width for a given field type, or 180 as a safe fallback. */
export function getDefaultWidthForFieldType(type: FieldType): number {
  return DEFAULT_BY_TYPE[type] ?? 180;
}
```

### Step 1.4: Run tests and verify pass

```bash
pnpm vitest run src/lib/crm/__tests__/column-widths.test.ts
```

Expected: PASS (5 tests).

### Step 1.5: Commit

```bash
git add src/lib/crm/column-widths.ts src/lib/crm/__tests__/column-widths.test.ts
git commit -m "feat(crm): add default column width helper and resize min constant"
```

---

## Task 2: Backfill widths into default field arrays

**Context:** When a new client loads the CRM, `CONTACT_DEFAULT_FIELDS` / `COMPANY_DEFAULT_FIELDS` / `DEAL_DEFAULT_FIELDS` are shipped as the initial config. We want every default field to have an explicit `width` so the first render under `table-layout: fixed` isn't a mess. We do this by updating the constant arrays — no migration needed because existing rows fall through to the runtime default from Task 1.

**Files:**
- Modify: `src/lib/crm/field-definitions.ts`

### Step 2.1: Write the failing test

Append to `src/lib/crm/__tests__/column-widths.test.ts`:

```typescript
import {
  COMPANY_DEFAULT_FIELDS,
  CONTACT_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "../field-definitions";

describe("default field arrays have widths", () => {
  it.each([
    ["contacts", CONTACT_DEFAULT_FIELDS],
    ["companies", COMPANY_DEFAULT_FIELDS],
    ["deals", DEAL_DEFAULT_FIELDS],
  ])("every %s default field has a positive width", (_, fields) => {
    for (const f of fields) {
      expect(
        f.width,
        `${f.key} is missing width`,
      ).toBeGreaterThan(0);
    }
  });
});
```

### Step 2.2: Run test to verify it fails

```bash
pnpm vitest run src/lib/crm/__tests__/column-widths.test.ts
```

Expected: FAIL — fields currently have `width: undefined`.

### Step 2.3: Add widths to CONTACT_DEFAULT_FIELDS

In `src/lib/crm/field-definitions.ts`, find the `CONTACT_DEFAULT_FIELDS` array (starts ~line 82) and add `width: N` to each entry:

```typescript
export const CONTACT_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", ...snip, width: 240 },
  { key: "emails", label: "Email", type: "email", ...snip, width: 220 },
  { key: "phones", label: "Phone", type: "phone", ...snip, width: 160 },
  { key: "city", label: "City", type: "text", ...snip, width: 160 },
  { key: "company_id", label: "Company", type: "relation", ...snip, width: 200 },
  { key: "job_title", label: "Job Title", type: "text", ...snip, width: 180 },
  { key: "type", label: "Type", type: "select", ...snip, width: 160 },
  { key: "linkedin", label: "Linkedin", type: "url", ...snip, width: 200 },
  { key: "x_link", label: "X", type: "url", ...snip, width: 160 },
  { key: "created_at", label: "Created", type: "date", ...snip, width: 140 },
  { key: "updated_at", label: "Updated", type: "date", ...snip, width: 140 },
  { key: "created_by", label: "Created by", type: "text", ...snip, width: 160 },
];
```

Note: `...snip` is shorthand — keep every existing property (`source`, `tier`, `visible`, `order`, `editable`, `required`, and any `options`/`related_entity`). Only append `width: N` at the end.

### Step 2.4: Add widths to COMPANY_DEFAULT_FIELDS

```typescript
export const COMPANY_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", ...existing, width: 240 },
  { key: "website", ...existing, width: 200 },
  { key: "address", ...existing, width: 220 },
  { key: "phone", ...existing, width: 160 },
  { key: "email", ...existing, width: 220 },
  { key: "industry", ...existing, width: 180 },
  { key: "linkedin", ...existing, width: 200 },
  { key: "created_at", ...existing, width: 140 },
  { key: "updated_at", ...existing, width: 140 },
];
```

### Step 2.5: Add widths to DEAL_DEFAULT_FIELDS

```typescript
export const DEAL_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", ...existing, width: 240 },
  { key: "amount", ...existing, width: 140 },
  { key: "close_date", ...existing, width: 140 },
  { key: "stage", ...existing, width: 160 },
  { key: "company_id", ...existing, width: 200 },
  { key: "point_of_contact", ...existing, width: 200 },
  { key: "address", ...existing, width: 220 },
  { key: "created_at", ...existing, width: 140 },
  { key: "updated_at", ...existing, width: 140 },
];
```

### Step 2.6: Run tests and verify pass

```bash
pnpm vitest run src/lib/crm/__tests__/column-widths.test.ts
```

Expected: PASS (6 tests: original 5 + new 3 `.each` cases).

### Step 2.7: Sanity-check other uses of these arrays

```bash
pnpm vitest run src/lib/crm/__tests__
pnpm tsc --noEmit
```

Expected: PASS, no type errors.

### Step 2.8: Commit

```bash
git add src/lib/crm/field-definitions.ts src/lib/crm/__tests__/column-widths.test.ts
git commit -m "feat(crm): backfill default column widths into field definitions"
```

---

## Task 3: Wire default-width fallback into `buildColumnsFromConfig`

**Context:** `buildColumnsFromConfig` currently passes `size: field.width` — which will be `undefined` for any saved config that predates Task 2 (i.e. existing clients who already have a `crm_config` row). We need the runtime to fall back to the per-type default so those users also get sane widths. We also need `minSize: 104` so TanStack enforces the floor on drag.

**Files:**
- Modify: `src/lib/crm/build-columns.tsx`
- Test: `src/lib/crm/__tests__/build-columns.test.tsx` (create if missing — check first)

### Step 3.1: Check for existing test file

```bash
ls src/lib/crm/__tests__/build-columns.test.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If MISSING, create a minimal file in Step 3.2; if EXISTS, extend it.

### Step 3.2: Write the failing test

Create or append to `src/lib/crm/__tests__/build-columns.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";

import { buildColumnsFromConfig } from "../build-columns";
import type { FieldDefinition } from "../field-definitions";

describe("buildColumnsFromConfig — column sizing", () => {
  const base: Omit<FieldDefinition, "key" | "type" | "width"> = {
    label: "X",
    source: "column",
    tier: "default",
    visible: true,
    order: 0,
    editable: true,
    required: false,
  };

  it("uses saved width when present", () => {
    const cols = buildColumnsFromConfig<Record<string, unknown>>(
      [{ ...base, key: "x", type: "text", width: 333 }],
      "companies",
    );
    expect(cols[0].size).toBe(333);
  });

  it("falls back to type-default when width is missing", () => {
    const cols = buildColumnsFromConfig<Record<string, unknown>>(
      [{ ...base, key: "x", type: "date" }], // no width
      "companies",
    );
    expect(cols[0].size).toBe(140); // date default
  });

  it("sets minSize to RESIZE_MIN_WIDTH (104)", () => {
    const cols = buildColumnsFromConfig<Record<string, unknown>>(
      [{ ...base, key: "x", type: "text", width: 180 }],
      "companies",
    );
    expect(cols[0].minSize).toBe(104);
  });
});
```

### Step 3.3: Run test to verify it fails

```bash
pnpm vitest run src/lib/crm/__tests__/build-columns.test.tsx
```

Expected: FAIL — second test returns `undefined`, third returns `undefined`.

### Step 3.4: Update `build-columns.tsx`

Replace the `.map` body in `src/lib/crm/build-columns.tsx`:

```tsx
import { getDefaultWidthForFieldType, RESIZE_MIN_WIDTH } from "./column-widths";

// inside the .map:
return {
  id: field.key,
  accessorFn: (row: TData) => getFieldValue(row as Record<string, unknown>, field.key, field.source),
  header: () => (
    <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {field.label}
    </span>
  ),
  size: field.width ?? getDefaultWidthForFieldType(field.type),
  minSize: RESIZE_MIN_WIDTH,
  cell: ({ getValue }: { getValue: () => unknown }) => renderFieldCell(field.type, getValue()),
};
```

### Step 3.5: Run tests and verify pass

```bash
pnpm vitest run src/lib/crm/__tests__/build-columns.test.tsx
```

Expected: PASS (3 tests).

### Step 3.6: Commit

```bash
git add src/lib/crm/build-columns.tsx src/lib/crm/__tests__/build-columns.test.tsx
git commit -m "feat(crm): fall back to type-default width and enforce 104px minSize"
```

---

## Task 4: Resize handle UI + TanStack wiring in `ListTable`

**Context:** This is the meatiest task. We enable TanStack's `enableColumnResizing`, render a 6px-wide drag handle on the right edge of each `<th>`, switch the `<table>` to `table-layout: fixed`, apply `style={{ width }}` to every `<th>` and `<td>`, and expose an `onColumnResize(columnId, size)` prop for the caller to persist. Resize mode is `"onEnd"` so the callback fires once at mouseup, not on every pointer event.

### Step 4.1: Read the current `ListTable` top-to-bottom one more time

```bash
cat src/components/ui/list-table.tsx | wc -l
```

Expected: ~370 lines. You are about to change lines ~200-330. Refresh your mental model before editing.

### Step 4.2: Write the failing test — resize handle renders

Create (or extend existing) `src/components/ui/__tests__/list-table.test.tsx`. If missing:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import { ListTable } from "../list-table";

interface Row { id: string; name: string }

const columns: ColumnDef<Row, unknown>[] = [
  { id: "name", accessorKey: "name", header: "Name", size: 200, minSize: 104 },
];

describe("ListTable — resize", () => {
  it("renders a resize handle on each resizable column header", () => {
    render(
      <ListTable<Row>
        columns={columns}
        data={[{ id: "1", name: "Acme" }]}
        onColumnResize={() => {}}
      />,
    );
    const handles = screen.getAllByRole("separator", { name: /resize/i });
    expect(handles).toHaveLength(1);
  });

  it("applies the column size as inline width on the th", () => {
    render(
      <ListTable<Row>
        columns={columns}
        data={[{ id: "1", name: "Acme" }]}
        onColumnResize={() => {}}
      />,
    );
    const th = screen.getByRole("columnheader", { name: /Name/ });
    expect(th).toHaveStyle({ width: "200px" });
  });

  it("fires onColumnResize with the new size when drag ends", () => {
    const onColumnResize = vi.fn();
    render(
      <ListTable<Row>
        columns={columns}
        data={[{ id: "1", name: "Acme" }]}
        onColumnResize={onColumnResize}
      />,
    );
    const handle = screen.getByRole("separator", { name: /resize/i });
    fireEvent.mouseDown(handle, { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 260 });
    fireEvent.mouseUp(document, { clientX: 260 });

    expect(onColumnResize).toHaveBeenCalledTimes(1);
    expect(onColumnResize).toHaveBeenCalledWith("name", expect.any(Number));
  });
});
```

### Step 4.3: Run test to verify it fails

```bash
pnpm vitest run src/components/ui/__tests__/list-table.test.tsx
```

Expected: FAIL (no handle rendered, no width style).

### Step 4.4: Extend `ListTableProps`

In `src/components/ui/list-table.tsx`, add to the `ListTableProps` interface near line 42:

```typescript
/**
 * Called at the end of a column drag. Receives the column id and its new
 * pixel width. Omit to disable column resizing entirely.
 */
onColumnResize?: (columnId: string, size: number) => void;
```

### Step 4.5: Enable TanStack column resizing + `table-layout: fixed`

Replace the `useReactTable` call (~line 183) to:

```typescript
// eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the project-standard table engine.
const table = useReactTable({
  data,
  columns: resolvedColumns,
  state: { sorting },
  onSortingChange: setSorting,
  enableColumnResizing: Boolean(onColumnResize),
  columnResizeMode: "onEnd",
  onColumnSizingChange: (updater) => {
    if (!onColumnResize) return;
    const next =
      typeof updater === "function" ? updater(table.getState().columnSizing) : updater;
    for (const [columnId, size] of Object.entries(next)) {
      onColumnResize(columnId, size);
    }
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
```

Change the `<table>` element (~line 203) to:

```tsx
<table className="w-full table-fixed">
```

### Step 4.6: Apply width styles + resize handle on `<th>`

Replace the `<th>` JSX block (~line 211-240) with:

```tsx
<th
  key={header.id}
  style={{ width: header.getSize() }}
  className={cn(
    "relative h-8 px-2 text-left text-[13px] font-medium text-muted-foreground",
    isActionsColumn && "w-[1%] text-right",
    isPinnedColumn && "sticky left-0 z-10 bg-background",
  )}
>
  {header.isPlaceholder ? null : header.column.getCanSort() ? (
    <button
      type="button"
      className="inline-flex items-center gap-1 transition-colors duration-[var(--duration-hover)] hover:text-foreground"
      onClick={() =>
        header.column.toggleSorting(header.column.getIsSorted() === "asc")
      }
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      {header.column.getIsSorted() ? (
        <span className="text-muted-foreground">
          {header.column.getIsSorted() === "asc" ? "▲" : "▼"}
        </span>
      ) : null}
    </button>
  ) : (
    <span className="inline-flex items-center">
      {flexRender(header.column.columnDef.header, header.getContext())}
    </span>
  )}
  {onColumnResize && header.column.getCanResize() && !isActionsColumn ? (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${String(header.column.columnDef.header ?? header.id)}`}
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className={cn(
        "absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none",
        "opacity-0 transition-opacity hover:opacity-100",
        header.column.getIsResizing() && "bg-primary/40 opacity-100",
      )}
    />
  ) : null}
</th>
```

Note: `w-1.5` = 6px. Handle is invisible by default, visible blue while dragging. Row hover doesn't show it — only direct hover, to stay unobtrusive.

### Step 4.7: Apply width styles to skeleton `<td>`s and data `<td>`s

For the **skeleton row `<td>`** (~line 255), add `style={{ width: resolvedColumns[colIndex]?.size as number | undefined }}`:

```tsx
<td
  key={colIndex}
  style={{ width: (col as { size?: number }).size }}
  className={cn(
    "h-[41px] px-2",
    !isLastCol && "border-r border-app-border-subtle/80",
    isActionsCol && "w-[1%] text-right",
    isPinnedCol && PINNED_FIRST_COL_CLASSES,
  )}
>
```

For the **data row `<td>`** (~line 316), add `style={{ width: cell.column.getSize() }}`:

```tsx
<td
  key={cell.id}
  style={{ width: cell.column.getSize() }}
  className={cn(
    "h-[41px] px-2 text-meta text-foreground",
    !isLastCell && "border-r border-app-border-subtle/80",
    isActionsColumn && "w-[1%] whitespace-nowrap text-right",
    isPinnedCell && PINNED_FIRST_COL_CLASSES,
    isPinnedCell && isSelected && "bg-[var(--selection)]",
  )}
>
```

### Step 4.8: Run tests and verify pass

```bash
pnpm vitest run src/components/ui/__tests__/list-table.test.tsx
```

Expected: PASS (3 tests). If the "fires onColumnResize" test is flaky — because jsdom doesn't lay out rAF cleanly — you can relax the assertion to `expect(onColumnResize).toHaveBeenCalled()` without `times(1)`.

### Step 4.9: Run the full test suite

```bash
pnpm vitest run src/components/ui/ src/lib/crm/
```

Expected: PASS. If any existing list-table consumer test breaks because rows no longer auto-size, assert `toHaveStyle({ width: ... })` is only checked when the test specifies a `size`.

### Step 4.10: Commit

```bash
git add src/components/ui/list-table.tsx src/components/ui/__tests__/list-table.test.tsx
git commit -m "feat(crm): add draggable column resize handle and fixed table layout"
```

---

## Task 5: Persistence hook — `useUpdateFieldWidth`

**Context:** When a user releases the mouse after dragging, `onColumnResize(columnId, size)` fires. We need a hook that (a) updates the `crm-config` TanStack Query cache optimistically so subsequent renders use the new width, (b) PATCHes `/api/crm/config` with the full `{entity}_fields` array (server expects the whole array, not a diff), and (c) rolls back the cache on error. The hook takes `entity` at construction time so each page instantiates its own.

**Files:**
- Create: `src/hooks/use-update-field-width.ts`
- Test: `src/hooks/__tests__/use-update-field-width.test.ts`

### Step 5.1: Write the failing test

Create `src/hooks/__tests__/use-update-field-width.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";

import { useUpdateFieldWidth } from "../use-update-field-width";
import { crmConfigKeys } from "../use-crm-config";

const baseCompanies = [
  {
    key: "name", label: "Name", type: "full_name", source: "column",
    tier: "indestructible", visible: true, order: 0, editable: false,
    required: true, width: 240,
  },
  {
    key: "email", label: "Email", type: "email", source: "column",
    tier: "default", visible: true, order: 1, editable: true,
    required: false, width: 220,
  },
];

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useUpdateFieldWidth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("optimistically updates the target field's width in cache", async () => {
    const client = new QueryClient();
    client.setQueryData(crmConfigKeys.current(), {
      hasConfig: true,
      config: { company_fields: baseCompanies, contact_fields: [], deal_fields: [] },
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        hasConfig: true,
        config: { company_fields: baseCompanies, contact_fields: [], deal_fields: [] },
      }),
    });

    const { result } = renderHook(() => useUpdateFieldWidth("companies"), {
      wrapper: wrapper(client),
    });

    act(() => {
      result.current.mutate({ columnId: "email", size: 333 });
    });

    const cached = client.getQueryData(crmConfigKeys.current()) as {
      config: { company_fields: Array<{ key: string; width: number }> };
    };
    expect(cached.config.company_fields.find((f) => f.key === "email")?.width).toBe(333);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/crm/config",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("rolls back on server error", async () => {
    const client = new QueryClient();
    client.setQueryData(crmConfigKeys.current(), {
      hasConfig: true,
      config: { company_fields: baseCompanies, contact_fields: [], deal_fields: [] },
    });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "nope" }),
    });

    const { result } = renderHook(() => useUpdateFieldWidth("companies"), {
      wrapper: wrapper(client),
    });

    act(() => {
      result.current.mutate({ columnId: "email", size: 333 });
    });

    await waitFor(() => {
      const cached = client.getQueryData(crmConfigKeys.current()) as {
        config: { company_fields: Array<{ key: string; width: number }> };
      };
      expect(cached.config.company_fields.find((f) => f.key === "email")?.width).toBe(220);
    });
  });
});
```

### Step 5.2: Run test to verify it fails

```bash
pnpm vitest run src/hooks/__tests__/use-update-field-width.test.ts
```

Expected: FAIL — module not found.

### Step 5.3: Write minimal implementation

Create `src/hooks/use-update-field-width.ts`:

```typescript
/**
 * Mutation hook that persists a single column's new width to the crm_config row.
 * Optimistically updates the cached FieldDefinition array; rolls back on error.
 *
 * @module hooks/use-update-field-width
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { FieldDefinition } from "@/lib/crm/field-definitions";

import { crmConfigKeys, type CrmConfigResponse } from "./use-crm-config";

type Entity = "contacts" | "companies" | "deals";

const ENTITY_TO_KEY: Record<Entity, "contact_fields" | "company_fields" | "deal_fields"> = {
  contacts: "contact_fields",
  companies: "company_fields",
  deals: "deal_fields",
};

interface Variables {
  columnId: string;
  size: number;
}

export function useUpdateFieldWidth(entity: Entity) {
  const queryClient = useQueryClient();
  const configKey = crmConfigKeys.current();
  const fieldKey = ENTITY_TO_KEY[entity];

  return useMutation<CrmConfigResponse, Error, Variables, { previous: CrmConfigResponse | undefined }>({
    mutationFn: async ({ columnId, size }) => {
      const previous = queryClient.getQueryData<CrmConfigResponse>(configKey);
      const currentFields = (previous?.config?.[fieldKey] as FieldDefinition[] | undefined) ?? [];
      const nextFields = currentFields.map((f) =>
        f.key === columnId ? { ...f, width: size } : f,
      );

      const response = await fetch("/api/crm/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: nextFields }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update column width.");
      }

      return response.json() as Promise<CrmConfigResponse>;
    },
    onMutate: async ({ columnId, size }) => {
      await queryClient.cancelQueries({ queryKey: configKey });
      const previous = queryClient.getQueryData<CrmConfigResponse>(configKey);

      if (previous) {
        const currentFields = (previous.config[fieldKey] as FieldDefinition[] | undefined) ?? [];
        const nextFields = currentFields.map((f) =>
          f.key === columnId ? { ...f, width: size } : f,
        );
        queryClient.setQueryData<CrmConfigResponse>(configKey, {
          ...previous,
          config: { ...previous.config, [fieldKey]: nextFields },
        });
      }

      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(configKey, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(configKey, data);
    },
  });
}
```

### Step 5.4: Run tests and verify pass

```bash
pnpm vitest run src/hooks/__tests__/use-update-field-width.test.ts
```

Expected: PASS (2 tests).

### Step 5.5: Commit

```bash
git add src/hooks/use-update-field-width.ts src/hooks/__tests__/use-update-field-width.test.ts
git commit -m "feat(crm): add useUpdateFieldWidth optimistic mutation hook"
```

---

## Task 6: Wire persistence into Companies page

**Context:** One of three page-level wirings. Each is identical except for the `entity` argument.

**Files:**
- Modify: `app/(dashboard)/customers/companies/page.tsx`

### Step 6.1: Add the import

Near the other hook imports (around line 30):

```typescript
import { useUpdateFieldWidth } from "@/hooks/use-update-field-width";
```

### Step 6.2: Instantiate the hook inside the component

Near the top of the page component, after `useCrmConfig()`:

```typescript
const { mutate: updateFieldWidth } = useUpdateFieldWidth("companies");
```

### Step 6.3: Pass `onColumnResize` to `ListTable`

Find the `<ListTable` JSX usage and add the prop:

```tsx
<ListTable<CompanyWithCounts>
  columns={columns}
  data={companies}
  {/* ...existing props... */}
  onColumnResize={(columnId, size) => updateFieldWidth({ columnId, size })}
/>
```

### Step 6.4: Run page tests + typecheck

```bash
pnpm vitest run app/\(dashboard\)/customers/companies/
pnpm tsc --noEmit
```

Expected: PASS, no type errors.

### Step 6.5: Commit

```bash
git add app/\(dashboard\)/customers/companies/page.tsx
git commit -m "feat(crm): wire column resize persistence into Companies page"
```

---

## Task 7: Wire persistence into People page

**Files:**
- Modify: `app/(dashboard)/customers/people/page.tsx`

### Step 7.1: Mirror Task 6 exactly, using `entity: "contacts"`

```typescript
import { useUpdateFieldWidth } from "@/hooks/use-update-field-width";
// ...
const { mutate: updateFieldWidth } = useUpdateFieldWidth("contacts");
// ...
<ListTable<ContactWithCompany>
  onColumnResize={(columnId, size) => updateFieldWidth({ columnId, size })}
  {/* ... */}
/>
```

### Step 7.2: Tests + commit

```bash
pnpm vitest run app/\(dashboard\)/customers/people/
git add app/\(dashboard\)/customers/people/page.tsx
git commit -m "feat(crm): wire column resize persistence into People page"
```

---

## Task 8: Wire persistence into Deals page

**Files:**
- Modify: `app/(dashboard)/customers/deals/page.tsx`

### Step 8.1: Mirror Task 6, using `entity: "deals"`

```typescript
const { mutate: updateFieldWidth } = useUpdateFieldWidth("deals");
```

### Step 8.2: Tests + commit

```bash
pnpm vitest run app/\(dashboard\)/customers/deals/
git add app/\(dashboard\)/customers/deals/page.tsx
git commit -m "feat(crm): wire column resize persistence into Deals page"
```

---

## Task 9: Manual end-to-end verification

**Context:** Automated tests only go so far with drag interactions. The following walks the three pages in a real browser to catch layout regressions (`table-layout: fixed` + sticky first column is the riskiest combination).

### Step 9.1: Start dev server

```bash
pnpm dev
```

### Step 9.2: Verify Companies page

1. Navigate to `http://localhost:3000/customers/companies`.
2. Hover the right edge of the **Name** column header — cursor should change to `col-resize`, a faint handle appears.
3. Drag it 100px wider — column visibly widens live, cells reflow.
4. Release — there is one brief network request to `PATCH /api/crm/config`. Confirm in devtools Network tab.
5. Reload the page — width persists.
6. Repeat on a middle column (e.g. Industry). Confirm.
7. Try to drag smaller than 104px — resize stops at 104px.
8. Confirm the row hover (`OPEN` hint) still appears flush-right.
9. Confirm the sticky pinned first column still scrolls correctly horizontally.

### Step 9.3: Verify People page

Same checks on `/customers/people`.

### Step 9.4: Verify Deals page

Same checks on `/customers/deals`. Also toggle the kanban view and back — table-layout switch should not affect kanban.

### Step 9.5: Verify Tasks page is untouched

Navigate to `/tasks`. Columns render with `table-layout: fixed` but **no resize handles** (because the Tasks page does not pass `onColumnResize`). Behavior should match main before this PR — Tasks columns don't resize, but they also don't break visually.

> If Tasks columns collapse weirdly because `task-columns.tsx` has no `size` set: add explicit `size` values to each column def there. This is the one mitigation we may need to apply in scope.

### Step 9.6: Verify loading + empty states

- Navigate to a page with an empty CRM (or filter to no results). Empty state row spans the full table width.
- Navigate with a slow connection (Network: Slow 3G). Skeleton rows respect column widths.

### Step 9.7: Verify mobile (< 640px)

Open devtools device emulation. Resize handles should be invisible (pointer hover doesn't exist on touch), widths are still applied. No accidental drags on scroll.

### Step 9.8: Commit any Tasks-column fixups

If Step 9.5 required edits to `src/lib/crm/task-columns.tsx`:

```bash
git add src/lib/crm/task-columns.tsx
git commit -m "fix(crm): add explicit column sizes to task-columns for fixed-layout compat"
```

---

## Task 10: Final sweep

### Step 10.1: Run full test suite

```bash
pnpm vitest run
```

Expected: all pass.

### Step 10.2: Typecheck + lint

```bash
pnpm tsc --noEmit
pnpm lint
```

Expected: clean.

### Step 10.3: Diff review

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat
```

Sanity-check: no unintended files, no untouched `pagination` / `row-actions` behavior.

### Step 10.4: Final commit if needed

Any doc-comment/small-fix sweeps.

```bash
git commit -am "chore(crm): docstring cleanup for column-resize feature"
```

---

## Summary of commits

1. `feat(crm): add default column width helper and resize min constant`
2. `feat(crm): backfill default column widths into field definitions`
3. `feat(crm): fall back to type-default width and enforce 104px minSize`
4. `feat(crm): add draggable column resize handle and fixed table layout`
5. `feat(crm): add useUpdateFieldWidth optimistic mutation hook`
6. `feat(crm): wire column resize persistence into Companies page`
7. `feat(crm): wire column resize persistence into People page`
8. `feat(crm): wire column resize persistence into Deals page`
9. *(optional)* `fix(crm): add explicit column sizes to task-columns for fixed-layout compat`
10. *(optional)* `chore(crm): docstring cleanup for column-resize feature`

## Risks watched for

| Risk | Mitigation |
|---|---|
| `table-layout: fixed` collapses columns that have no explicit `size` | Task 2 backfills every default field + Task 3 runtime fallback covers saved configs |
| Pinned first column (`position: sticky`) breaks under `table-layout: fixed` | `<th>`/`<td>` already have explicit width from Task 4 — sticky positioning layers on top without conflict |
| PATCH request storm during drag | `columnResizeMode: "onEnd"` fires only at mouseup |
| Optimistic update diverges from server | `onSuccess` replaces cache with server response; `onError` rolls back |
| Touch devices accidentally trigger resize on scroll | Handle is `w-1.5` (6px) and `touch-none`; hitbox is effectively nil on touch |
| Tests fail under jsdom because it doesn't lay out | Relax resize end-to-end assertion to `toHaveBeenCalled()` if flaky |
