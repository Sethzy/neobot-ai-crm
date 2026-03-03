# PR 10: CRM Read-Only Pages (Contacts) — Implementation Plan

**PR:** PR 10: CRM read-only pages (Contacts)
**Decisions:** `UX-02` (primary navigation structure), `DATA-09` (CRM tables), `DATA-07` (realtime capability via `useRealtimeTable`)
**Goal:** Build the read-only Contacts list page and Contact detail page so users can browse CRM data the agent created via chat.

**Architecture:** Add a minimal CRM route shell now (`app/(dashboard)/crm/layout.tsx`) so PR11 can extend it without route churn, and keep `/crm` redirecting to `/crm/contacts`. The Contacts list uses TanStack Table with search and type filter. The Contact detail page shows read-only fields, linked deals, and an interaction timeline. Data fetching uses TanStack Query hooks calling Supabase PostgREST (RLS scopes to `client_id` automatically). No create/edit UI — the agent writes CRM data via chat; these pages are for inspection.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Table v8, TanStack Query v5, Supabase PostgREST, ShadCN UI (Badge, Tabs, Card, Input), Tailwind 4, Vitest + React Testing Library

**App Spec Sections:** §10.1 (CRM tables), §14.1 (navigation structure — CRM under DATABASE), §14.3 (Twenty CRM inspiration)

**UX Spec Reference:** Mission Control UX Spec §5.4 — CRM section: "Inspect and lightly edit contact and deal state. Keep AI-updated relationship history visible. Avoid becoming a heavyweight data-entry surface." Table view: "Dense but readable. Columns: contact name, phone/email (clickable), property/deal count, last interaction, next touch date, interaction history link, status tag. Sortable. Quick filter by stage."

---

## Prerequisites

| PR | What it creates | Why PR 10 needs it |
|----|----------------|-------------------|
| PR 3 | `clients` table, `get_my_client_id()` function | RLS resolution for browser queries |
| PR 5 | CRM migrations (`contacts`, `deals`, `interactions`, `crm_tasks`) + `src/lib/crm/schemas.ts` | Tables must exist; types imported from schemas |
| PR 6 | CRM tools registered in runner | Agent can create contacts/deals/interactions via chat (test criteria dependency) |

**Verify before starting:**
- `src/lib/crm/schemas.ts` exports `Contact`, `Deal`, `Interaction`, `CrmTask`, `contactTypeValues`, `dealStageValues`, `interactionTypeValues`
- `src/types/database.ts` includes `contacts`, `deals`, `interactions`, `crm_tasks` table types
- `app/(dashboard)/crm/page.tsx` is a placeholder "Coming soon" page

---

## Bite-Sized Step Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

---

## Task Overview

| Task | Component | Files Created/Modified | Tests | Depends On |
|------|-----------|----------------------|-------|------------|
| 1 | TanStack Query hooks for contacts | 1 source + 1 test | ~8 tests | — |
| 2 | Contacts list page (TanStack Table) | 2 source (page + table component) | ~6 tests | Task 1 |
| 3 | Contact detail page (read-only) | 1 source (page) | ~5 tests | Task 1 |
| 4 | TanStack Query hooks for related data (deals, interactions) | 1 source + 1 test | ~5 tests | — |
| 5 | Contact detail — linked deals + interaction timeline tabs | 2 source (tabs content components) | ~4 tests | Tasks 3, 4 |
| 6 | CRM landing page redirect + sidebar active state | 1 modify (page.tsx) | ~2 tests | Task 2 |

**Total: ~11 files created/modified, ~33 tests**

---

## Relevant Files

**Create:**
- `src/hooks/use-contacts.ts` — TanStack Query hooks for contacts CRUD
- `src/hooks/__tests__/use-contacts.test.tsx` — Hook tests
- `src/hooks/use-contact-relations.ts` — Hooks for deals/interactions by contact_id
- `src/hooks/__tests__/use-contact-relations.test.tsx` — Relation hook tests
- `app/(dashboard)/crm/layout.tsx` — CRM route shell (tab scaffold, PR11 extends)
- `app/(dashboard)/crm/contacts/page.tsx` — Contacts list page
- `src/components/crm/contacts-table.tsx` — TanStack Table for contacts
- `src/components/crm/__tests__/contacts-table.test.tsx` — Table component tests
- `app/(dashboard)/crm/contacts/[contactId]/page.tsx` — Contact detail page
- `app/(dashboard)/crm/contacts/[contactId]/__tests__/page.test.tsx` — Detail page tests
- `src/components/crm/contact-deals.tsx` — Linked deals list for detail page
- `src/components/crm/contact-timeline.tsx` — Interaction timeline for detail page

**Modify:**
- `app/(dashboard)/crm/page.tsx` — Replace placeholder with redirect to `/crm/contacts`

**Reference (read-only):**
- `src/lib/crm/schemas.ts` — Zod schemas with type/stage enums (PR 5)
- `src/types/database.ts` — Supabase-generated types
- `src/hooks/use-cases.ts` — Reference pattern for TanStack Query hooks
- `src/components/cases/cases-table.tsx` — Reference pattern for TanStack Table
- `app/(dashboard)/cases/page.tsx` — Reference pattern for list page layout
- `app/(dashboard)/cases/[caseId]/page.tsx` — Reference pattern for detail page layout
- `src/components/ui/badge.tsx` — Badge variants (success, warning, info, outline)
- `src/components/ui/tabs.tsx` — Tab variants (default, line)
- `src/components/ui/card.tsx` — Card components
- `vitest.config.ts` — Test config (alias `@` → `./src`, jsdom environment)
- `src/test/setup.ts` — Test setup (RTL jest-dom matchers, matchMedia mock)

---

### Task 0: CRM Layout Shell (Route Stabilization)

**Files:**
- Create: `app/(dashboard)/crm/layout.tsx`

**Context:** Add a minimal CRM shell now so PR11 can add Deals without route architecture churn. Keep `/crm` redirecting to `/crm/contacts`.

**Deliverable:**
- `layout.tsx` wraps all `/crm/*` pages
- shows tab scaffold with Contacts active state
- no clickable broken `/crm/deals` link yet (PR11 adds Deals route and tab link)

---

### Task 1: TanStack Query Hooks for Contacts

**Files:**
- Create: `src/hooks/use-contacts.ts`
- Test: `src/hooks/__tests__/use-contacts.test.tsx`

**Context:** All data fetching uses TanStack Query with a query key factory pattern (see `src/hooks/use-cases.ts` for the exact pattern). The hooks query Supabase PostgREST via the browser client. RLS automatically scopes results to the authenticated user's `client_id` — no explicit `client_id` filter needed in browser queries (unlike server-side tool code which passes `clientId` explicitly). The hook accepts optional `search` and `type` filter params.

Use the existing PostgREST escaping helper pattern for `or(...)` filters (escape `%`, `_`, backslashes, and quote literals safely).

**Step 1: Write failing tests for the query key factory and useContacts hook**

```typescript
// src/hooks/__tests__/use-contacts.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { contactKeys, useContacts, useContact } from "../use-contacts";

/* ---------- mocks ---------- */

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

/* ---------- helpers ---------- */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Builds a chainable Supabase query builder mock that resolves to { data, error }. */
function mockQueryBuilder(data: unknown[], error: null | { message: string } = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then: undefined as unknown,
  };
  // Make the builder itself thenable so `await supabase.from(...).select(...)` resolves
  builder.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);
  return builder;
}

/* ---------- tests ---------- */

describe("contactKeys", () => {
  test("all key is stable", () => {
    expect(contactKeys.all).toEqual(["contacts"]);
  });

  test("list key includes filters", () => {
    expect(contactKeys.list({ search: "john", type: "buyer" })).toEqual([
      "contacts",
      "list",
      { search: "john", type: "buyer" },
    ]);
  });

  test("detail key includes contact id", () => {
    expect(contactKeys.detail("c-1")).toEqual(["contacts", "detail", "c-1"]);
  });
});

describe("useContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches contacts ordered by updated_at desc", async () => {
    const contacts = [
      { contact_id: "c-1", first_name: "John", last_name: "Smith" },
    ];
    const builder = mockQueryBuilder(contacts);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  test("applies search filter via or() with ilike on first_name, last_name, email, phone", async () => {
    const builder = mockQueryBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({ search: "john" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.or).toHaveBeenCalledWith(
      expect.stringContaining("first_name.ilike.%john%")
    );
  });

  test("applies type filter via eq()", async () => {
    const builder = mockQueryBuilder([]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({ type: "buyer" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith("type", "buyer");
  });

  test("returns empty array on error", async () => {
    const builder = mockQueryBuilder([], { message: "RLS denied" });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContacts({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches single contact by id", async () => {
    const contact = { contact_id: "c-1", first_name: "John", last_name: "Smith" };
    const builder = mockQueryBuilder([contact]);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContact("c-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "c-1");
    expect(builder.single).toHaveBeenCalled();
  });

  test("is disabled when contactId is empty", () => {
    const { result } = renderHook(() => useContact(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-contacts.test.tsx
```

Expected: FAIL — `useContacts` and `useContact` not found (module does not exist yet).

**Step 3: Implement the hooks**

```typescript
// src/hooks/use-contacts.ts
/**
 * TanStack Query hooks for CRM contacts.
 * RLS automatically scopes results to the authenticated user's client_id.
 * @module hooks/use-contacts
 */
import {
  useQuery,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Contact } from "@/lib/crm/schemas";
import { contactTypeValues } from "@/lib/crm/schemas";

type ContactType = (typeof contactTypeValues)[number];

interface ContactFilters {
  search?: string;
  type?: ContactType;
}

/**
 * Query key factory for contacts.
 * Consistent keys for caching and invalidation.
 */
export const contactKeys = {
  all: ["contacts"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (filters: ContactFilters) => [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, "detail"] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
};

/**
 * Fetches contacts from Supabase with optional search and type filter.
 * RLS scopes to client_id automatically.
 */
async function fetchContacts({ search, type }: ContactFilters): Promise<Contact[]> {
  let query = supabase
    .from("contacts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (search) {
    const escaped = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`
    );
  }

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Contact[];
}

/** Query options factory for contacts list. */
export function contactsQueryOptions(filters: ContactFilters) {
  return queryOptions({
    queryKey: contactKeys.list(filters),
    queryFn: () => fetchContacts(filters),
  });
}

/** Query options factory for single contact. */
export function contactDetailQueryOptions(contactId: string) {
  return queryOptions({
    queryKey: contactKeys.detail(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("contact_id", contactId)
        .single();
      if (error) throw error;
      return data as Contact;
    },
  });
}

/**
 * Fetches all contacts with optional search and type filter.
 * @param filters - Optional search string and contact type filter
 */
export function useContacts(filters: ContactFilters) {
  return useQuery({
    ...contactsQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetches a single contact by ID.
 * @param contactId - The contact UUID
 */
export function useContact(contactId: string) {
  return useQuery({
    ...contactDetailQueryOptions(contactId),
    placeholderData: keepPreviousData,
    enabled: !!contactId,
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-contacts.test.tsx
```

Expected: PASS — all 8 tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-contacts.ts src/hooks/__tests__/use-contacts.test.tsx
git commit -m "feat(crm): add TanStack Query hooks for contacts (PR 10)"
```

---

### Task 2: Contacts List Page with TanStack Table

**Files:**
- Create: `src/components/crm/contacts-table.tsx`
- Create: `app/(dashboard)/crm/contacts/page.tsx`
- Test: `src/components/crm/__tests__/contacts-table.test.tsx`

**Context:** Follow the exact pattern from `app/(dashboard)/cases/page.tsx` (list page layout) and `src/components/cases/cases-table.tsx` (TanStack Table). The contacts table shows: name (first + last), email (clickable mailto), phone (clickable tel), type badge, and last updated date. Sortable columns. Row click navigates to `/crm/contacts/[contactId]`. Search bar filters by name/email/phone. Type dropdown filters by contact type.

Per UX spec §5.4 table view: "Dense but readable. Columns: contact name, phone/email (clickable), property/deal count, last interaction, next touch date, interaction history link, status tag. Sortable. Quick filter by stage." — For PR 10 we implement the core columns (name, email, phone, type, updated). Deal count and last interaction require joins that we add in Task 5.

**Step 1: Write failing tests for ContactsTable**

```typescript
// src/components/crm/__tests__/contacts-table.test.tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { ContactsTable } from "../contacts-table";

// Mock next/navigation
const mockPush = vi.fn();
const mockPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, prefetch: mockPrefetch }),
}));

const sampleContacts = [
  {
    contact_id: "c-1",
    client_id: "cl-1",
    first_name: "John",
    last_name: "Smith",
    email: "john@example.com",
    phone: "+6591234567",
    type: "buyer" as const,
    notes: null,
    created_at: "2026-02-01T00:00:00+08:00",
    updated_at: "2026-03-01T00:00:00+08:00",
  },
  {
    contact_id: "c-2",
    client_id: "cl-1",
    first_name: "Sarah",
    last_name: "Lee",
    email: null,
    phone: null,
    type: "seller" as const,
    notes: "Interested in Bukit Timah",
    created_at: "2026-02-15T00:00:00+08:00",
    updated_at: "2026-02-28T00:00:00+08:00",
  },
];

describe("ContactsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders all contacts with name, email, phone, type columns", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Sarah Lee")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("buyer")).toBeInTheDocument();
    expect(screen.getByText("seller")).toBeInTheDocument();
  });

  test("renders email as mailto link when present", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    const emailLink = screen.getByText("john@example.com").closest("a");
    expect(emailLink).toHaveAttribute("href", "mailto:john@example.com");
  });

  test("renders phone as tel link when present", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    const phoneLink = screen.getByText("+6591234567").closest("a");
    expect(phoneLink).toHaveAttribute("href", "tel:+6591234567");
  });

  test("renders dash for missing email/phone", () => {
    render(<ContactsTable contacts={sampleContacts} />);

    // Sarah Lee has no email and no phone
    const rows = screen.getAllByRole("row");
    const sarahRow = rows.find((row) => within(row).queryByText("Sarah Lee"));
    expect(sarahRow).toBeDefined();
    // Should contain em-dashes for missing fields
    const cells = within(sarahRow!).getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  test("navigates to contact detail on row click", async () => {
    const user = userEvent.setup();
    render(<ContactsTable contacts={sampleContacts} />);

    const rows = screen.getAllByRole("row");
    // Click the first data row (index 0 is header)
    await user.click(rows[1]);

    expect(mockPush).toHaveBeenCalledWith("/crm/contacts/c-1");
  });

  test("renders empty state when no contacts", () => {
    render(<ContactsTable contacts={[]} />);

    expect(screen.getByText(/no contacts/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/contacts-table.test.tsx
```

Expected: FAIL — `ContactsTable` module does not exist.

**Step 3: Implement ContactsTable component**

```typescript
// src/components/crm/contacts-table.tsx
/**
 * Contacts table using TanStack Table with sortable columns.
 * Displays contact name, email, phone, type badge, and last updated.
 * Row click navigates to contact detail page.
 * @module components/crm/contacts-table
 */
"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { Contact } from "@/lib/crm/schemas";

const columnHelper = createColumnHelper<Contact>();

/** Badge variant map for contact types. */
const typeVariantMap: Record<Contact["type"], "default" | "secondary" | "outline" | "info" | "success" | "warning"> = {
  buyer: "info",
  seller: "success",
  landlord: "warning",
  tenant: "secondary",
  agent: "outline",
  other: "secondary",
};

/** Formats a date string to "2 Mar 2026" format. */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, contactId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }
    router.push(`/crm/contacts/${contactId}`);
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "name",
        header: "Name",
        cell: ({ row }) => {
          const { first_name, last_name } = row.original;
          return `${first_name} ${last_name}`;
        },
        sortingFn: (rowA, rowB) => {
          const a = `${rowA.original.first_name} ${rowA.original.last_name}`;
          const b = `${rowB.original.first_name} ${rowB.original.last_name}`;
          return a.localeCompare(b);
        },
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: (info) => {
          const email = info.getValue();
          if (!email) return <span className="text-muted-foreground">—</span>;
          return (
            <a href={`mailto:${email}`} className="text-foreground/80 hover:underline" onClick={(e) => e.stopPropagation()}>
              {email}
            </a>
          );
        },
      }),
      columnHelper.accessor("phone", {
        header: "Phone",
        cell: (info) => {
          const phone = info.getValue();
          if (!phone) return <span className="text-muted-foreground">—</span>;
          return (
            <a href={`tel:${phone}`} className="text-foreground/80 hover:underline" onClick={(e) => e.stopPropagation()}>
              {phone}
            </a>
          );
        },
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: (info) => {
          const type = info.getValue();
          return (
            <Badge variant={typeVariantMap[type] ?? "secondary"}>
              {type}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("updated_at", {
        header: "Last Updated",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: contacts,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No contacts yet</p>
        <p className="mt-2 text-sm text-muted-foreground/60">
          Contacts created by the agent will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 md:px-5 py-3 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 cursor-pointer hover:text-foreground/80"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
              onMouseEnter={() => router.prefetch(`/crm/contacts/${row.original.contact_id}`)}
              onClick={(event) => handleRowClick(event, row.original.contact_id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 md:px-5 py-3 md:py-4 text-[13px] text-foreground/80">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/contacts-table.test.tsx
```

Expected: PASS — all 6 tests green.

**Step 5: Implement the Contacts list page**

```typescript
// app/(dashboard)/crm/contacts/page.tsx
/**
 * CRM Contacts list page.
 * Displays a searchable, filterable table of all contacts.
 * Contacts are created by the AI agent via chat — this page is read-only.
 * @module app/(dashboard)/crm/contacts/page
 */
"use client";

import { useState } from "react";
import { useContacts } from "@/hooks/use-contacts";
import { ContactsTable } from "@/components/crm/contacts-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users } from "lucide-react";
import { contactTypeValues } from "@/lib/crm/schemas";

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: contacts = [], isLoading } = useContacts({
    search: search || undefined,
    type: typeFilter === "all" ? undefined : (typeFilter as (typeof contactTypeValues)[number]),
  });

  return (
    <div className="px-4 py-6 md:px-12 md:py-10 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Contacts
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Contacts created and managed by your AI agent. Browse, search, and inspect details.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-12 w-full sm:w-40 border-border/50 shadow-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {contactTypeValues.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 md:p-20 text-center shadow-sm">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {search || typeFilter !== "all"
                ? "No contacts match your filters"
                : "No contacts yet"}
            </p>
            {!search && typeFilter === "all" && (
              <p className="mt-2 text-sm text-muted-foreground/60">
                Ask your AI agent to create contacts via chat
              </p>
            )}
          </div>
        ) : (
          <ContactsTable contacts={contacts} />
        )}
      </div>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/crm/contacts-table.tsx src/components/crm/__tests__/contacts-table.test.tsx app/\(dashboard\)/crm/contacts/page.tsx
git commit -m "feat(crm): add contacts list page with TanStack Table (PR 10)"
```

---

### Task 3: Contact Detail Page (Read-Only Fields)

**Files:**
- Create: `app/(dashboard)/crm/contacts/[contactId]/page.tsx`
- Test: `app/(dashboard)/crm/contacts/[contactId]/__tests__/page.test.tsx`

**Context:** Follow the pattern from `app/(dashboard)/cases/[caseId]/page.tsx`. The detail page shows: breadcrumb nav (CRM > Contacts > Name), read-only fields (name, email, phone, type, notes), and tabbed sections for linked deals and interaction timeline (built in Task 5). Uses `useContact(contactId)` hook from Task 1. Shows loading skeleton while fetching, 404-style message if not found.

**Step 1: Write failing tests for the detail page**

```typescript
// app/(dashboard)/crm/contacts/[contactId]/__tests__/page.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock useParams
vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

// Mock the hook
vi.mock("@/hooks/use-contacts", () => ({
  useContact: vi.fn(),
}));

import ContactDetailPage from "../page";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const sampleContact = {
  contact_id: "c-1",
  client_id: "cl-1",
  first_name: "John",
  last_name: "Smith",
  email: "john@example.com",
  phone: "+6591234567",
  type: "buyer" as const,
  notes: "Met at condo viewing on Orchard Road",
  created_at: "2026-02-01T00:00:00+08:00",
  updated_at: "2026-03-01T00:00:00+08:00",
};

describe("ContactDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders contact name and fields when loaded", async () => {
    const { useParams } = await import("next/navigation");
    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });

    const { useContact } = await import("@/hooks/use-contacts");
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("buyer")).toBeInTheDocument();
    expect(screen.getByText(/Met at condo viewing/)).toBeInTheDocument();
  });

  test("renders breadcrumb with link back to contacts list", async () => {
    const { useParams } = await import("next/navigation");
    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });

    const { useContact } = await import("@/hooks/use-contacts");
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    const contactsLink = screen.getByRole("link", { name: /contacts/i });
    expect(contactsLink).toHaveAttribute("href", "/crm/contacts");
  });

  test("shows loading skeleton when data is pending", async () => {
    const { useParams } = await import("next/navigation");
    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });

    const { useContact } = await import("@/hooks/use-contacts");
    vi.mocked(useContact).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    const { container } = render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  test("shows not-found message when contact does not exist", async () => {
    const { useParams } = await import("next/navigation");
    vi.mocked(useParams).mockReturnValue({ contactId: "c-missing" });

    const { useContact } = await import("@/hooks/use-contacts");
    vi.mocked(useContact).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  test("renders tabs for Deals and Activity", async () => {
    const { useParams } = await import("next/navigation");
    vi.mocked(useParams).mockReturnValue({ contactId: "c-1" });

    const { useContact } = await import("@/hooks/use-contacts");
    vi.mocked(useContact).mockReturnValue({
      data: sampleContact,
      isLoading: false,
      isError: false,
    } as never);

    render(<ContactDetailPage />, { wrapper: createWrapper() });

    expect(screen.getByRole("tab", { name: /deals/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /activity/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run app/\(dashboard\)/crm/contacts/\[contactId\]/__tests__/page.test.tsx
```

Expected: FAIL — module does not exist.

**Step 3: Implement the Contact detail page**

```typescript
// app/(dashboard)/crm/contacts/[contactId]/page.tsx
/**
 * Contact detail page.
 * Shows read-only contact fields, linked deals, and interaction timeline.
 * @module app/(dashboard)/crm/contacts/[contactId]/page
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useContact } from "@/hooks/use-contacts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Phone } from "lucide-react";

/** Badge variant map for contact types — same as contacts-table.tsx. */
const typeVariantMap: Record<string, "default" | "secondary" | "outline" | "info" | "success" | "warning"> = {
  buyer: "info",
  seller: "success",
  landlord: "warning",
  tenant: "secondary",
  agent: "outline",
  other: "secondary",
};

export default function ContactDetailPage() {
  const params = useParams<{ contactId: string }>();
  const contactId = params?.contactId ?? "";
  const { data: contact, isLoading, isError } = useContact(contactId);

  if (!contactId) return null;

  if (isLoading || (!contact && !isError)) {
    return (
      <div className="flex h-full animate-pulse flex-col bg-muted/5">
        <div className="px-4 md:px-12 pt-6 pb-4">
          <div className="mb-2 h-3 w-32 rounded bg-muted/40" />
          <div className="mt-2 h-7 w-64 rounded bg-muted" />
        </div>
        <div className="px-4 md:px-12 py-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-16 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10 text-center">
        <p className="text-destructive">Contact not found</p>
        <Link href="/crm/contacts" className="mt-4 inline-block text-primary hover:underline">
          Back to Contacts
        </Link>
      </div>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name}`;

  return (
    <div className="px-4 py-6 md:px-12 md:py-10 overflow-auto">
      {/* Breadcrumb */}
      <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
        <Link
          href="/crm/contacts"
          className="hover:text-foreground transition-colors"
        >
          Contacts
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <span className="font-semibold text-foreground/70">{fullName}</span>
      </nav>

      {/* Header */}
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {fullName}
        </h1>
        <Badge variant={typeVariantMap[contact.type] ?? "secondary"}>
          {contact.type}
        </Badge>
      </div>

      {/* Contact info cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm hover:underline">
                <Mail className="h-4 w-4 text-muted-foreground/60" />
                {contact.email}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Phone
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground/60" />
                {contact.phone}
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">
              {contact.notes ?? <span className="text-muted-foreground">—</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for deals and activity timeline */}
      <div className="mt-8">
        <Tabs defaultValue="deals">
          <TabsList variant="line" className="-mb-[1px] h-auto w-full justify-start gap-4 border-b border-border/40 p-0 [&_button::after]:!bottom-[-1px]">
            <TabsTrigger
              value="deals"
              className="px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
            >
              Deals
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="px-1 py-2 text-foreground/60 data-[state=active]:font-semibold hover:text-foreground"
            >
              Activity
            </TabsTrigger>
          </TabsList>
          <TabsContent value="deals" className="mt-4">
            <p className="text-sm text-muted-foreground">No linked deals</p>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <p className="text-sm text-muted-foreground">No activity recorded</p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run app/\(dashboard\)/crm/contacts/\[contactId\]/__tests__/page.test.tsx
```

Expected: PASS — all 5 tests green.

**Step 5: Commit**

```bash
git add app/\(dashboard\)/crm/contacts/\[contactId\]/page.tsx app/\(dashboard\)/crm/contacts/\[contactId\]/__tests__/page.test.tsx
git commit -m "feat(crm): add contact detail page with read-only fields (PR 10)"
```

---

### Task 4: TanStack Query Hooks for Related Data (Deals, Interactions by Contact)

**Files:**
- Create: `src/hooks/use-contact-relations.ts`
- Test: `src/hooks/__tests__/use-contact-relations.test.tsx`

**Context:** The contact detail page needs to show linked deals and interactions for a specific contact. These hooks query Supabase with a `contact_id` filter. RLS scopes to `client_id` automatically. Each hook returns an array of the related entity. We keep them in a separate file from `use-contacts.ts` to avoid circular dependencies and keep the contact hooks simple.

**Step 1: Write failing tests**

```typescript
// src/hooks/__tests__/use-contact-relations.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  useContactDeals,
  useContactInteractions,
  contactRelationKeys,
} from "../use-contact-relations";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function mockQueryBuilder(data: unknown[], error: null | { message: string } = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  builder.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data, error }).then(resolve);
  return builder;
}

describe("contactRelationKeys", () => {
  test("deals key includes contact id", () => {
    expect(contactRelationKeys.deals("c-1")).toEqual(["contact-relations", "deals", "c-1"]);
  });

  test("interactions key includes contact id", () => {
    expect(contactRelationKeys.interactions("c-1")).toEqual(["contact-relations", "interactions", "c-1"]);
  });

});

describe("useContactDeals", () => {
  beforeEach(() => vi.clearAllMocks());

  test("fetches deals for a contact", async () => {
    const deals = [{ deal_id: "d-1", address: "123 Oak St" }];
    const builder = mockQueryBuilder(deals);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContactDeals("c-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "c-1");
  });

  test("is disabled when contactId is empty", () => {
    const { result } = renderHook(() => useContactDeals(""), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useContactInteractions", () => {
  beforeEach(() => vi.clearAllMocks());

  test("fetches interactions ordered by occurred_at desc", async () => {
    const interactions = [{ interaction_id: "i-1", type: "call" }];
    const builder = mockQueryBuilder(interactions);
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useContactInteractions("c-1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFrom).toHaveBeenCalledWith("interactions");
    expect(builder.eq).toHaveBeenCalledWith("contact_id", "c-1");
    expect(builder.order).toHaveBeenCalledWith("occurred_at", { ascending: false });
  });
});

```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-contact-relations.test.tsx
```

Expected: FAIL — module does not exist.

**Step 3: Implement the hooks**

```typescript
// src/hooks/use-contact-relations.ts
/**
 * TanStack Query hooks for data related to a specific contact.
 * Fetches deals and interactions linked via contact_id.
 * @module hooks/use-contact-relations
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Deal, Interaction } from "@/lib/crm/schemas";

/**
 * Query key factory for contact-related data.
 */
export const contactRelationKeys = {
  all: ["contact-relations"] as const,
  deals: (contactId: string) => [...contactRelationKeys.all, "deals", contactId] as const,
  interactions: (contactId: string) => [...contactRelationKeys.all, "interactions", contactId] as const,
};

/**
 * Fetches deals linked to a contact.
 * @param contactId - The contact UUID
 */
export function useContactDeals(contactId: string) {
  return useQuery({
    queryKey: contactRelationKeys.deals(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
    enabled: !!contactId,
  });
}

/**
 * Fetches interactions for a contact, ordered by most recent first.
 * @param contactId - The contact UUID
 */
export function useContactInteractions(contactId: string) {
  return useQuery({
    queryKey: contactRelationKeys.interactions(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data as Interaction[];
    },
    enabled: !!contactId,
  });
}

```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-contact-relations.test.tsx
```

Expected: PASS — all 6 tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-contact-relations.ts src/hooks/__tests__/use-contact-relations.test.tsx
git commit -m "feat(crm): add TanStack Query hooks for contact relations (PR 10)"
```

---

### Task 5: Contact Detail — Linked Deals + Interaction Timeline Tabs

**Files:**
- Create: `src/components/crm/contact-deals.tsx`
- Create: `src/components/crm/contact-timeline.tsx`
- Modify: `app/(dashboard)/crm/contacts/[contactId]/page.tsx` — replace placeholder tab content with real components

**Context:** The Deals tab shows a simple table of linked deals with address, stage badge, price, and last updated. The Activity tab shows a chronological timeline of interactions (call, meeting, email, etc.) with type icon, summary, and occurred_at date. Both use hooks from Task 4. Per UX spec: "Timeline: Chronological feed of interactions + updates. Source tagged. Expandable for detail."

**Step 1: Write failing tests for ContactDeals**

```typescript
// src/components/crm/__tests__/contact-deals.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactDeals: vi.fn(),
}));

import { ContactDeals } from "../contact-deals";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ContactDeals", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders linked deals with address, stage, and price", async () => {
    const { useContactDeals } = await import("@/hooks/use-contact-relations");
    vi.mocked(useContactDeals).mockReturnValue({
      data: [
        {
          deal_id: "d-1",
          client_id: "cl-1",
          contact_id: "c-1",
          address: "123 Orchard Road",
          stage: "viewing",
          price: 1500000,
          notes: null,
          created_at: "2026-02-01T00:00:00+08:00",
          updated_at: "2026-03-01T00:00:00+08:00",
        },
      ],
      isLoading: false,
    } as never);

    render(<ContactDeals contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("123 Orchard Road")).toBeInTheDocument();
    expect(screen.getByText("viewing")).toBeInTheDocument();
    expect(screen.getByText("$1,500,000")).toBeInTheDocument();
  });

  test("shows empty state when no deals", async () => {
    const { useContactDeals } = await import("@/hooks/use-contact-relations");
    vi.mocked(useContactDeals).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<ContactDeals contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/no linked deals/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/contact-deals.test.tsx
```

Expected: FAIL — module does not exist.

**Step 3: Implement ContactDeals**

```typescript
// src/components/crm/contact-deals.tsx
/**
 * Displays deals linked to a specific contact.
 * Shows address, stage badge, price, and last updated.
 * @module components/crm/contact-deals
 */
"use client";

import { useContactDeals } from "@/hooks/use-contact-relations";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/crm/schemas";

/** Badge variant map for deal stages. */
const stageVariantMap: Record<Deal["stage"], "default" | "secondary" | "outline" | "info" | "success" | "warning" | "destructive"> = {
  leads: "secondary",
  viewing: "info",
  offer: "warning",
  negotiation: "warning",
  otp: "success",
  completion: "success",
  lost: "destructive",
};

/** Formats a number as currency (SGD). */
function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(price);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface ContactDealsProps {
  contactId: string;
}

export function ContactDeals({ contactId }: ContactDealsProps) {
  const { data: deals = [], isLoading } = useContactDeals(contactId);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="h-12 rounded-lg bg-muted/30" />
        ))}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No linked deals</p>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Address</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Stage</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Price</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Updated</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr key={deal.deal_id} className="border-t border-border/30">
              <td className="px-4 py-3 text-sm text-foreground/80">{deal.address}</td>
              <td className="px-4 py-3">
                <Badge variant={stageVariantMap[deal.stage] ?? "secondary"}>{deal.stage}</Badge>
              </td>
              <td className="px-4 py-3 text-sm text-foreground/80">{formatPrice(deal.price)}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(deal.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/contact-deals.test.tsx
```

Expected: PASS — all 2 tests green.

**Step 5: Write failing tests for ContactTimeline**

```typescript
// src/components/crm/__tests__/contact-timeline.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactInteractions: vi.fn(),
}));

import { ContactTimeline } from "../contact-timeline";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ContactTimeline", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders interactions with type, summary, and date", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");
    vi.mocked(useContactInteractions).mockReturnValue({
      data: [
        {
          interaction_id: "i-1",
          client_id: "cl-1",
          contact_id: "c-1",
          deal_id: null,
          type: "call",
          summary: "Discussed pricing for Orchard unit",
          occurred_at: "2026-03-01T10:30:00+08:00",
          created_at: "2026-03-01T10:30:00+08:00",
          updated_at: "2026-03-01T10:30:00+08:00",
        },
        {
          interaction_id: "i-2",
          client_id: "cl-1",
          contact_id: "c-1",
          deal_id: "d-1",
          type: "viewing",
          summary: "Viewing at 123 Orchard Road",
          occurred_at: "2026-02-28T14:00:00+08:00",
          created_at: "2026-02-28T14:00:00+08:00",
          updated_at: "2026-02-28T14:00:00+08:00",
        },
      ],
      isLoading: false,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/Discussed pricing/)).toBeInTheDocument();
    expect(screen.getByText(/Viewing at 123 Orchard/)).toBeInTheDocument();
    expect(screen.getByText("call")).toBeInTheDocument();
    expect(screen.getByText("viewing")).toBeInTheDocument();
  });

  test("shows empty state when no interactions", async () => {
    const { useContactInteractions } = await import("@/hooks/use-contact-relations");
    vi.mocked(useContactInteractions).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<ContactTimeline contactId="c-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/no activity/i)).toBeInTheDocument();
  });
});
```

**Step 6: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/contact-timeline.test.tsx
```

Expected: FAIL — module does not exist.

**Step 7: Implement ContactTimeline**

```typescript
// src/components/crm/contact-timeline.tsx
/**
 * Interaction timeline for a specific contact.
 * Chronological feed of calls, meetings, emails, etc.
 * @module components/crm/contact-timeline
 */
"use client";

import { useContactInteractions } from "@/hooks/use-contact-relations";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  Calendar,
  Mail,
  MessageCircle,
  Eye,
  StickyNote,
} from "lucide-react";
import type { Interaction } from "@/lib/crm/schemas";

/** Icon map for interaction types. */
import type { ElementType } from "react";

const typeIconMap: Record<Interaction["type"], ElementType> = {
  call: Phone,
  meeting: Calendar,
  email: Mail,
  message: MessageCircle,
  viewing: Eye,
  note: StickyNote,
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ContactTimelineProps {
  contactId: string;
}

export function ContactTimeline({ contactId }: ContactTimelineProps) {
  const { data: interactions = [], isLoading } = useContactInteractions(contactId);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-muted/30" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-muted/30" />
              <div className="h-3 w-32 rounded bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded</p>
    );
  }

  return (
    <div className="space-y-4">
      {interactions.map((interaction) => {
        const Icon = typeIconMap[interaction.type] ?? StickyNote;
        return (
          <div key={interaction.interaction_id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {interaction.type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(interaction.occurred_at)}
                </span>
              </div>
              {interaction.summary && (
                <p className="mt-1 text-sm text-foreground/80">
                  {interaction.summary}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 8: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/contact-timeline.test.tsx
```

Expected: PASS — all 2 tests green.

**Step 9: Wire components into the contact detail page**

Modify `app/(dashboard)/crm/contacts/[contactId]/page.tsx`:
- Import `ContactDeals` and `ContactTimeline`
- Replace placeholder tab content with the real components

Replace:
```typescript
          <TabsContent value="deals" className="mt-4">
            <p className="text-sm text-muted-foreground">No linked deals</p>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <p className="text-sm text-muted-foreground">No activity recorded</p>
          </TabsContent>
```

With:
```typescript
          <TabsContent value="deals" className="mt-4">
            <ContactDeals contactId={contactId} />
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <ContactTimeline contactId={contactId} />
          </TabsContent>
```

Add imports at the top:
```typescript
import { ContactDeals } from "@/components/crm/contact-deals";
import { ContactTimeline } from "@/components/crm/contact-timeline";
```

**Step 10: Run all tests to verify nothing broke**

```bash
npx vitest run src/components/crm/ app/\(dashboard\)/crm/
```

Expected: All tests pass.

**Step 11: Commit**

```bash
git add src/components/crm/contact-deals.tsx src/components/crm/__tests__/contact-deals.test.tsx src/components/crm/contact-timeline.tsx src/components/crm/__tests__/contact-timeline.test.tsx app/\(dashboard\)/crm/contacts/\[contactId\]/page.tsx
git commit -m "feat(crm): add contact deals and interaction timeline tabs (PR 10)"
```

---

### Task 6: CRM Landing Page Redirect + Sidebar Active State

**Files:**
- Modify: `app/(dashboard)/crm/page.tsx` — replace placeholder with redirect to `/crm/contacts`
- Test: `app/(dashboard)/crm/__tests__/page.test.tsx`

**Context:** Currently `/crm` shows a "Coming soon" placeholder. After PR 10, it should redirect to `/crm/contacts` (the only CRM sub-page in this PR). PR 11 adds Deals + Tasks pages. The sidebar already highlights CRM when `pathname.startsWith("/crm")`, which will correctly match `/crm/contacts` and `/crm/contacts/[id]`.

**Step 1: Write failing test for the redirect**

```typescript
// app/(dashboard)/crm/__tests__/page.test.tsx
import { describe, expect, test, vi } from "vitest";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("CRM landing page", () => {
  test("redirects to /crm/contacts", async () => {
    // Dynamic import after mocks are set up
    await import("../page").catch(() => {
      // redirect() throws in Next.js — that's expected
    });
    expect(mockRedirect).toHaveBeenCalledWith("/crm/contacts");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run app/\(dashboard\)/crm/__tests__/page.test.tsx
```

Expected: FAIL — current page renders "Coming soon", does not call `redirect`.

**Step 3: Replace the placeholder with a redirect**

```typescript
// app/(dashboard)/crm/page.tsx
/**
 * CRM landing page — redirects to /crm/contacts.
 * @module app/(dashboard)/crm/page
 */
import { redirect } from "next/navigation";

export default function CrmPage() {
  redirect("/crm/contacts");
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run app/\(dashboard\)/crm/__tests__/page.test.tsx
```

Expected: PASS.

**Step 5: Run targeted PR10 tests and type-check**

```bash
npx vitest run src/hooks/__tests__/use-contacts.test.tsx src/hooks/__tests__/use-contact-relations.test.tsx src/components/crm/__tests__/ app/\(dashboard\)/crm/
npx tsc --noEmit
```

Expected: Targeted PR10 tests and type-check pass. Run full `vitest` suite once concurrent PR8/PR9 churn stabilizes.

**Step 6: Commit**

```bash
git add app/\(dashboard\)/crm/page.tsx app/\(dashboard\)/crm/__tests__/page.test.tsx
git commit -m "feat(crm): redirect /crm to /crm/contacts (PR 10)"
```

---

## Completion Checklist

- [ ] `useContacts` and `useContact` hooks work with TanStack Query key factory pattern
- [ ] Contacts list page: search by name/email/phone, filter by type, TanStack Table with sortable columns
- [ ] Row click navigates to contact detail page
- [ ] Contact detail page: breadcrumb, read-only fields (name, email, phone, type, notes)
- [ ] Contact detail tabs: Deals (linked deals table), Activity (interaction timeline)
- [ ] `/crm` redirects to `/crm/contacts`
- [ ] Sidebar correctly highlights CRM for all `/crm/*` routes
- [ ] Email rendered as `mailto:` link, phone as `tel:` link
- [ ] Empty states for: no contacts, no search results, no deals, no activity
- [ ] Loading skeletons for all data-fetching states
- [ ] Each test was watched failing before implementation (TDD red step)
- [ ] No production code without a failing test first
- [ ] Targeted PR10 tests pass
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Full `vitest` suite run after concurrent PR churn stabilizes
- [ ] Test acceptance: "Agent creates contacts via chat, user browses them in CRM pages" (manual E2E after deployment)
