# CRM UX Upgrade Implementation Plan

**Goal:** Add Right Drawer, Inline Edit, View Switcher (Table/Kanban/Calendar), and Command Menu to the CRM — enabling a supervisor glance-and-fix workflow inspired by Twenty CRM.

**Architecture:** Four features share one integration point: the `?detail=[id]` query param. Table rows, Kanban cards, Calendar items, and Command Menu results all open the same `RecordDrawer` (ShadCN `Sheet`) which renders `InlineEditField` components. View switcher is localStorage-based with no server persistence. Command menu uses a single Supabase RPC for cross-table search.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Table v8, TanStack Query v5, ShadCN UI (Sheet, Command, Button, Badge, Select, Calendar popover), Tailwind 4, date-fns, Vitest + React Testing Library

**Design Doc:** `docs/plans/2026-03-04-crm-ux-upgrade-design.md`

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

| # | Task | PR Scope |
|---|------|----------|
| 1 | `useRecordDrawer` hook | Right Drawer foundation |
| 2 | `RecordDrawer` component (contact) | Right Drawer — contacts |
| 3 | `RecordDrawer` component (deal + task) | Right Drawer — deals + tasks |
| 4 | Wire drawer into list pages + retire detail routes | Right Drawer integration |
| 5 | `InlineEditField` component | Inline Edit |
| 6 | Wire inline edit into drawer + mutation hooks | Inline Edit integration |
| 7 | `ViewToggle` component + `useViewPreference` hook | View Switcher |
| 8 | `KanbanBoard` component | Kanban view |
| 9 | `CalendarGrid` component | Calendar view |
| 10 | Wire view switcher into pages | View Switcher integration |
| 11 | `search_records` Supabase RPC | Command Menu backend |
| 12 | `CommandMenu` component + keyboard shortcut | Command Menu UI |
| 13 | Wire command menu into app layout | Command Menu integration |

---

## Task 1: `useRecordDrawer` Hook

**Goal:** A hook that reads/writes `?detail=[id]` query param and controls drawer open/close state.

**Files:**
- Create: `src/hooks/use-record-drawer.ts`
- Test: `src/hooks/__tests__/use-record-drawer.test.ts`

**Step 1: Write the failing test for the hook**

```tsx
// src/hooks/__tests__/use-record-drawer.test.ts
import { renderHook, act } from "@testing-library/react";
import { useRecordDrawer } from "@/hooks/use-record-drawer";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/crm/contacts",
}));

describe("useRecordDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete("detail");
  });

  it("returns isOpen=false when no detail param", () => {
    const { result } = renderHook(() => useRecordDrawer());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.recordId).toBeNull();
  });

  it("returns isOpen=true and recordId when detail param set", () => {
    mockSearchParams.set("detail", "abc-123");
    const { result } = renderHook(() => useRecordDrawer());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.recordId).toBe("abc-123");
  });

  it("open() sets detail param via router.replace", () => {
    const { result } = renderHook(() => useRecordDrawer());
    act(() => result.current.open("def-456"));
    expect(mockReplace).toHaveBeenCalledWith("/crm/contacts?detail=def-456", { scroll: false });
  });

  it("close() removes detail param via router.replace", () => {
    mockSearchParams.set("detail", "abc-123");
    const { result } = renderHook(() => useRecordDrawer());
    act(() => result.current.close());
    expect(mockReplace).toHaveBeenCalledWith("/crm/contacts", { scroll: false });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/use-record-drawer.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the hook**

```tsx
// src/hooks/use-record-drawer.ts
/**
 * Hook for managing the record detail drawer via URL query params.
 * @module hooks/use-record-drawer
 */
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DETAIL_PARAM = "detail";

interface UseRecordDrawerReturn {
  /** Whether the drawer is currently open. */
  isOpen: boolean;
  /** The record ID from the query param, or null if closed. */
  recordId: string | null;
  /** Opens the drawer for a given record ID. */
  open: (id: string) => void;
  /** Closes the drawer by removing the query param. */
  close: () => void;
}

/**
 * Reads/writes `?detail=[id]` query param to control the record drawer.
 * Uses `router.replace` so back button closes the drawer naturally.
 */
export function useRecordDrawer(): UseRecordDrawerReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const recordId = searchParams.get(DETAIL_PARAM);
  const isOpen = recordId !== null;

  const open = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(DETAIL_PARAM, id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DETAIL_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return useMemo(() => ({ isOpen, recordId, open, close }), [isOpen, recordId, open, close]);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/use-record-drawer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/use-record-drawer.ts src/hooks/__tests__/use-record-drawer.test.ts
git commit -m "feat(crm-ux): add useRecordDrawer hook for ?detail query param"
```

---

## Task 2: `RecordDrawer` — Contact Variant

**Goal:** A Sheet-based drawer that renders contact detail with header (name + badge), fields, related deals, and activity timeline. Reuses existing `ContactTimeline` and `useContactDeals` hook.

**Files:**
- Create: `src/components/crm/record-drawer/record-drawer.tsx`
- Create: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Create: `src/components/crm/record-drawer/drawer-section.tsx`
- Create: `src/components/crm/record-drawer/index.ts`
- Test: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- Test: `src/components/crm/record-drawer/__tests__/record-drawer.test.tsx`

**Context:** The existing `useContact` hook is in `src/hooks/use-contacts.ts`. The existing `ContactTimeline` is at `src/components/crm/contact-timeline.tsx`. The `useContactDeals` hook is in `src/hooks/use-contact-relations.ts`. The ShadCN Sheet component is at `src/components/ui/sheet.tsx` — use `side="right"` on desktop and `side="bottom"` on mobile. Sheet width is overridden to `w-[420px]` (default is `w-3/4 sm:max-w-sm`).

**Step 1: Create `drawer-section.tsx` — simple section divider**

```tsx
// src/components/crm/record-drawer/drawer-section.tsx
/**
 * Section header used inside the record drawer.
 * @module components/crm/record-drawer/drawer-section
 */
interface DrawerSectionProps {
  title: string;
  children: React.ReactNode;
}

export function DrawerSection({ title, children }: DrawerSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </div>
  );
}
```

**Step 2: Write failing test for `ContactDrawerContent`**

Test that it renders contact name, type badge, field values, and sections for Deals and Activity. Mock `useContact`, `useContactDeals`, and render the `ContactTimeline` (which itself uses `useContactInteractions`).

```tsx
// src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx
import { render, screen } from "@testing-library/react";
import { ContactDrawerContent } from "../contact-drawer-content";

// Mock the data hooks
vi.mock("@/hooks/use-contacts", () => ({
  useContact: () => ({
    data: {
      contact_id: "c1",
      first_name: "Sarah",
      last_name: "Tan",
      type: "seller",
      phone: "9234-5678",
      email: "sarah@me.com",
      notes: "Looking to sell in Bishan",
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useContactDeals: () => ({ data: [], isLoading: false }),
  useContactInteractions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

describe("ContactDrawerContent", () => {
  it("renders contact name and type badge", () => {
    render(<ContactDrawerContent contactId="c1" />);
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("seller")).toBeInTheDocument();
  });

  it("renders phone and email fields", () => {
    render(<ContactDrawerContent contactId="c1" />);
    expect(screen.getByText("9234-5678")).toBeInTheDocument();
    expect(screen.getByText("sarah@me.com")).toBeInTheDocument();
  });

  it("renders section headers", () => {
    render(<ContactDrawerContent contactId="c1" />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
Expected: FAIL — module not found

**Step 4: Implement `ContactDrawerContent`**

```tsx
// src/components/crm/record-drawer/contact-drawer-content.tsx
/**
 * Drawer content for a contact record.
 * @module components/crm/record-drawer/contact-drawer-content
 */
"use client";

import { Badge } from "@/components/ui/badge";
import { ContactTimeline } from "@/components/crm/contact-timeline";
import { DrawerSection } from "./drawer-section";
import { StageBadge } from "@/components/crm/stage-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useContact } from "@/hooks/use-contacts";
import { useContactDeals } from "@/hooks/use-contact-relations";
import { contactTypeBadgeVariantMap, formatContactFullName, formatCrmPrice } from "@/lib/crm/display";

interface ContactDrawerContentProps {
  contactId: string;
}

export function ContactDrawerContent({ contactId }: ContactDrawerContentProps) {
  const { data: contact, isLoading, isError } = useContact(contactId);
  const { data: deals = [] } = useContactDeals(contactId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (isError || !contact) {
    return <div className="p-6 text-sm text-destructive">Failed to load contact</div>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{formatContactFullName(contact)}</h2>
        <Badge variant={contactTypeBadgeVariantMap[contact.type]}>{contact.type}</Badge>
      </div>

      {/* Details — will be replaced with InlineEditField in Task 6 */}
      <DrawerSection title="Details">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className="text-foreground/80">{contact.phone ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground/80">{contact.email ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Notes</span>
            <span className="max-w-[200px] truncate text-foreground/80">{contact.notes ?? "—"}</span>
          </div>
        </div>
      </DrawerSection>

      {/* Related Deals */}
      <DrawerSection title="Deals">
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked deals</p>
        ) : (
          <div className="space-y-2">
            {deals.map((dc) => (
              <div key={dc.deal_id} className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm">
                <span className="font-medium">{dc.deals?.address ?? "—"}</span>
                {dc.deals?.stage ? <StageBadge stage={dc.deals.stage} /> : null}
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      {/* Activity */}
      <DrawerSection title="Activity">
        <ContactTimeline contactId={contactId} />
      </DrawerSection>
    </div>
  );
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
Expected: PASS

**Step 6: Write failing test for `RecordDrawer` shell**

Test that it renders a Sheet, passes the right content based on `objectType`, and calls `onClose` when close button is clicked.

```tsx
// src/components/crm/record-drawer/__tests__/record-drawer.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordDrawer } from "../record-drawer";

// Mock the content components so we can test the shell in isolation
vi.mock("../contact-drawer-content", () => ({
  ContactDrawerContent: ({ contactId }: { contactId: string }) => (
    <div data-testid="contact-content">{contactId}</div>
  ),
}));

describe("RecordDrawer", () => {
  const onClose = vi.fn();

  it("renders nothing when closed", () => {
    render(<RecordDrawer isOpen={false} recordId={null} objectType="contact" onClose={onClose} />);
    expect(screen.queryByTestId("contact-content")).not.toBeInTheDocument();
  });

  it("renders contact content when open with objectType=contact", () => {
    render(<RecordDrawer isOpen={true} recordId="c1" objectType="contact" onClose={onClose} />);
    expect(screen.getByTestId("contact-content")).toHaveTextContent("c1");
  });
});
```

**Step 7: Implement `RecordDrawer` shell**

```tsx
// src/components/crm/record-drawer/record-drawer.tsx
/**
 * Record detail drawer shell. Wraps object-specific content in a ShadCN Sheet.
 * @module components/crm/record-drawer/record-drawer
 */
"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ContactDrawerContent } from "./contact-drawer-content";
import { DealDrawerContent } from "./deal-drawer-content";
import { TaskDrawerContent } from "./task-drawer-content";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export type RecordObjectType = "contact" | "deal" | "task";

interface RecordDrawerProps {
  isOpen: boolean;
  recordId: string | null;
  objectType: RecordObjectType;
  onClose: () => void;
}

export function RecordDrawer({ isOpen, recordId, objectType, onClose }: RecordDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[420px] p-0 sm:max-w-[420px]">
        <VisuallyHidden><SheetTitle>Record Detail</SheetTitle></VisuallyHidden>
        {recordId ? (
          <>
            {objectType === "contact" && <ContactDrawerContent contactId={recordId} />}
            {objectType === "deal" && <DealDrawerContent dealId={recordId} />}
            {objectType === "task" && <TaskDrawerContent taskId={recordId} />}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 8: Create barrel export**

```tsx
// src/components/crm/record-drawer/index.ts
export { RecordDrawer, type RecordObjectType } from "./record-drawer";
```

**Step 9: Run tests to verify they pass**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/`
Expected: PASS (record-drawer test passes; contact-drawer-content test passes)

**Step 10: Commit**

```bash
git add src/components/crm/record-drawer/
git commit -m "feat(crm-ux): add RecordDrawer shell + ContactDrawerContent"
```

---

## Task 3: `RecordDrawer` — Deal + Task Variants

**Goal:** Add `DealDrawerContent` and `TaskDrawerContent` so the drawer works for all three object types.

**Files:**
- Create: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Create: `src/components/crm/record-drawer/task-drawer-content.tsx`
- Test: `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- Test: `src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx`

**Context:** `useDeal(dealId)` is in `src/hooks/use-deals.ts` — returns `DealWithContact` (deal + `deal_contacts` join). `useDealInteractions(dealId)` is in `src/hooks/use-contact-relations.ts`. For tasks, there's no `useCrmTask(taskId)` single-fetch hook yet — you'll need to add one to `src/hooks/use-crm-tasks.ts` (follow `useDeal` pattern). Task drawer is simpler: just fields + link to parent contact/deal, no timeline.

**Step 1: Write failing test for `DealDrawerContent`**

```tsx
// src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx
import { render, screen } from "@testing-library/react";
import { DealDrawerContent } from "../deal-drawer-content";

vi.mock("@/hooks/use-deals", () => ({
  useDeal: () => ({
    data: {
      deal_id: "d1",
      address: "Bishan St 22 #12-34",
      stage: "offer",
      price: 1200000,
      notes: "Pending valuation",
      deal_contacts: [{ contact_id: "c1", role: "buyer", is_primary: true, contacts: { first_name: "Sarah", last_name: "Tan" } }],
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-contact-relations", () => ({
  useDealInteractions: () => ({ data: [], isLoading: false }),
}));

describe("DealDrawerContent", () => {
  it("renders deal address and stage badge", () => {
    render(<DealDrawerContent dealId="d1" />);
    expect(screen.getByText("Bishan St 22 #12-34")).toBeInTheDocument();
    expect(screen.getByText("Offer")).toBeInTheDocument();
  });

  it("renders price and contact name", () => {
    render(<DealDrawerContent dealId="d1" />);
    expect(screen.getByText("$1,200,000")).toBeInTheDocument();
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
  });

  it("renders section headers", () => {
    render(<DealDrawerContent dealId="d1" />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `DealDrawerContent`**

Follow the same pattern as `ContactDrawerContent`. Use `useDeal(dealId)` for the deal data and `useDealInteractions(dealId)` for the activity timeline. The Contacts section lists `deal_contacts` as chips. The Details section shows: address, stage (StageBadge), price (formatted), notes.

```tsx
// src/components/crm/record-drawer/deal-drawer-content.tsx
/**
 * Drawer content for a deal record.
 * @module components/crm/record-drawer/deal-drawer-content
 */
"use client";

import { StageBadge } from "@/components/crm/stage-badge";
import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { DrawerSection } from "./drawer-section";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeal } from "@/hooks/use-deals";
import { useDealInteractions } from "@/hooks/use-contact-relations";
import { formatContactFullName, formatCrmPrice } from "@/lib/crm/display";

interface DealDrawerContentProps {
  dealId: string;
}

export function DealDrawerContent({ dealId }: DealDrawerContentProps) {
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: interactions = [] } = useDealInteractions(dealId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (isError || !deal) {
    return <div className="p-6 text-sm text-destructive">Failed to load deal</div>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{deal.address}</h2>
        <StageBadge stage={deal.stage} />
      </div>

      <DrawerSection title="Details">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price</span>
            <span className="tabular-nums text-foreground/80">{formatCrmPrice(deal.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Notes</span>
            <span className="max-w-[200px] truncate text-foreground/80">{deal.notes ?? "—"}</span>
          </div>
        </div>
      </DrawerSection>

      <DrawerSection title="Contacts">
        {deal.deal_contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked contacts</p>
        ) : (
          <div className="space-y-2">
            {deal.deal_contacts.map((dc) => (
              <div key={dc.contact_id} className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm">
                <span className="font-medium">
                  {dc.contacts ? formatContactFullName(dc.contacts) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{dc.role}</span>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Activity">
        <InteractionTimeline interactions={interactions} />
      </DrawerSection>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
Expected: PASS

**Step 5: Add `useCrmTask` single-fetch hook**

The existing `use-crm-tasks.ts` only has `useCrmTasks` (list). Add `useCrmTask(taskId)` for single-record fetch, following the `useDeal` pattern:

```tsx
// Add to src/hooks/use-crm-tasks.ts

async function fetchCrmTask(taskId: string): Promise<CrmTaskWithRelations> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*, contacts!crm_tasks_contact_id_fkey(first_name, last_name), deals!crm_tasks_deal_id_fkey(address)")
    .eq("task_id", taskId)
    .single();

  if (error) throw error;
  return data as CrmTaskWithRelations;
}

export function crmTaskDetailQueryOptions(taskId: string) {
  return queryOptions({
    queryKey: [...crmTaskKeys.all, "detail", taskId] as const,
    queryFn: () => fetchCrmTask(taskId),
  });
}

export function useCrmTask(taskId: string) {
  return useQuery({
    ...crmTaskDetailQueryOptions(taskId),
    enabled: Boolean(taskId),
  });
}
```

**Step 6: Write failing test for `TaskDrawerContent`**

```tsx
// src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx
import { render, screen } from "@testing-library/react";
import { TaskDrawerContent } from "../task-drawer-content";

vi.mock("@/hooks/use-crm-tasks", () => ({
  useCrmTask: () => ({
    data: {
      task_id: "t1",
      title: "Follow up with Sarah",
      description: "Call about Bishan viewing",
      status: "open",
      due_date: "2026-03-10T00:00:00+08:00",
      contacts: { first_name: "Sarah", last_name: "Tan" },
      deals: { address: "Bishan St 22" },
      created_at: "2026-03-01T00:00:00+08:00",
      updated_at: "2026-03-04T00:00:00+08:00",
    },
    isLoading: false,
    isError: false,
  }),
}));

describe("TaskDrawerContent", () => {
  it("renders task title and status", () => {
    render(<TaskDrawerContent taskId="t1" />);
    expect(screen.getByText("Follow up with Sarah")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders linked contact and deal", () => {
    render(<TaskDrawerContent taskId="t1" />);
    expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
    expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
  });
});
```

**Step 7: Run test to verify it fails**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx`
Expected: FAIL — module not found

**Step 8: Implement `TaskDrawerContent`**

Simpler than contacts/deals — just fields + linked records, no activity timeline.

```tsx
// src/components/crm/record-drawer/task-drawer-content.tsx
/**
 * Drawer content for a CRM task record (simplified).
 * @module components/crm/record-drawer/task-drawer-content
 */
"use client";

import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import { DrawerSection } from "./drawer-section";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmTask } from "@/hooks/use-crm-tasks";
import { formatContactFullName, formatCrmDate } from "@/lib/crm/display";

interface TaskDrawerContentProps {
  taskId: string;
}

export function TaskDrawerContent({ taskId }: TaskDrawerContentProps) {
  const { data: task, isLoading, isError } = useCrmTask(taskId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (isError || !task) {
    return <div className="p-6 text-sm text-destructive">Failed to load task</div>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{task.title}</h2>
        <TaskStatusBadge status={task.status} />
      </div>

      <DrawerSection title="Details">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Due Date</span>
            <span className="text-foreground/80">{formatCrmDate(task.due_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Description</span>
            <span className="max-w-[200px] truncate text-foreground/80">{task.description ?? "—"}</span>
          </div>
        </div>
      </DrawerSection>

      {(task.contacts || task.deals) && (
        <DrawerSection title="Linked Records">
          <div className="space-y-2 text-sm">
            {task.contacts && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span className="text-foreground/80">{formatContactFullName(task.contacts)}</span>
              </div>
            )}
            {task.deals && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deal</span>
                <span className="text-foreground/80">{task.deals.address}</span>
              </div>
            )}
          </div>
        </DrawerSection>
      )}
    </div>
  );
}
```

**Step 9: Run all drawer tests**

Run: `npx vitest run src/components/crm/record-drawer/__tests__/`
Expected: ALL PASS

**Step 10: Commit**

```bash
git add src/components/crm/record-drawer/ src/hooks/use-crm-tasks.ts
git commit -m "feat(crm-ux): add DealDrawerContent + TaskDrawerContent + useCrmTask hook"
```

---

## Task 4: Wire Drawer into List Pages + Retire Detail Routes

**Goal:** Replace row-click-navigates-to-detail-page with row-click-opens-drawer. Remove full-page detail routes.

**Files:**
- Modify: `app/(dashboard)/crm/contacts/page.tsx`
- Modify: `app/(dashboard)/crm/deals/page.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `src/components/crm/contacts-table.tsx` — row click calls `onRowClick(contactId)` instead of `router.push`
- Modify: `src/components/crm/deals-table.tsx` — row click calls `onRowClick(dealId)` instead of `router.push`
- Modify: `src/components/crm/crm-tasks-table.tsx` — add row click handler
- Delete: `app/(dashboard)/crm/contacts/[contactId]/` (entire directory)
- Delete: `app/(dashboard)/crm/deals/[dealId]/` (entire directory)
- Test: Update existing table and page tests

**Step 1: Add `onRowClick` prop to `DealsTable`**

Change the table component to accept an `onRowClick` callback instead of using `router.push` directly. This decouples the table from navigation so the page can wire it to the drawer.

In `src/components/crm/deals-table.tsx`:
- Add `onRowClick?: (dealId: string) => void` to `DealsTableProps`
- In `handleRowClick`, call `onRowClick?.(dealId)` instead of `router.push(...)`
- Remove the `router.prefetch` on mouse enter
- Change the address `<Link>` to a plain `<span>` (no more navigating to detail page)

**Step 2: Add `onRowClick` prop to `ContactsTable`**

Same change in `src/components/crm/contacts-table.tsx`.

**Step 3: Add `onRowClick` prop to `CrmTasksTable`**

Same change in `src/components/crm/crm-tasks-table.tsx`. This table currently has no row click — add cursor-pointer + hover + click handler matching the deals/contacts pattern.

**Step 4: Wire drawer into `/crm/contacts` page**

In `app/(dashboard)/crm/contacts/page.tsx`:
- Import `useRecordDrawer` and `RecordDrawer`
- Call `useRecordDrawer()` to get `{ isOpen, recordId, open, close }`
- Pass `onRowClick={open}` to `<ContactsTable>`
- Render `<RecordDrawer isOpen={isOpen} recordId={recordId} objectType="contact" onClose={close} />` at the bottom of the page

**Step 5: Wire drawer into `/crm/deals` page**

Same pattern for `app/(dashboard)/crm/deals/page.tsx` with `objectType="deal"`.

**Step 6: Wire drawer into `/tasks` page**

Same pattern for `app/(dashboard)/tasks/page.tsx` with `objectType="task"`.

**Step 7: Delete detail route directories**

```bash
rm -rf app/(dashboard)/crm/contacts/[contactId]
rm -rf app/(dashboard)/crm/deals/[dealId]
```

**Step 8: Update existing tests**

Update table test files to account for the new `onRowClick` prop. Update page tests to verify the drawer renders.

**Step 9: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (no broken imports referencing deleted detail pages)

**Step 10: Commit**

```bash
git add -A
git commit -m "feat(crm-ux): wire RecordDrawer into list pages, retire detail routes"
```

---

## Task 5: `InlineEditField` Component

**Goal:** A reusable component with three states: display → edit → saving. Supports text input, textarea, select dropdown, and date picker.

**Files:**
- Create: `src/components/crm/inline-edit-field.tsx`
- Test: `src/components/crm/__tests__/inline-edit-field.test.tsx`

**Step 1: Write failing tests**

```tsx
// src/components/crm/__tests__/inline-edit-field.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEditField } from "@/components/crm/inline-edit-field";

describe("InlineEditField", () => {
  const onSave = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => vi.clearAllMocks());

  it("renders label and value in display mode", () => {
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("9234-5678")).toBeInTheDocument();
  });

  it("shows input on click", async () => {
    const user = userEvent.setup();
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    await user.click(screen.getByText("9234-5678"));
    expect(screen.getByRole("textbox")).toHaveValue("9234-5678");
  });

  it("saves on blur", async () => {
    const user = userEvent.setup();
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222");
    await user.tab(); // blur
    expect(onSave).toHaveBeenCalledWith("9111-2222");
  });

  it("saves on Enter", async () => {
    const user = userEvent.setup();
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222{Enter}");
    expect(onSave).toHaveBeenCalledWith("9111-2222");
  });

  it("reverts on Escape without saving", async () => {
    const user = userEvent.setup();
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    await user.click(screen.getByText("9234-5678"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "9111-2222");
    await user.keyboard("{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("9234-5678")).toBeInTheDocument();
  });

  it("does not save when value is unchanged", async () => {
    const user = userEvent.setup();
    render(<InlineEditField label="Phone" value="9234-5678" onSave={onSave} />);
    await user.click(screen.getByText("9234-5678"));
    await user.tab(); // blur without changing
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders select for type=select", async () => {
    const user = userEvent.setup();
    render(
      <InlineEditField
        label="Stage"
        value="offer"
        type="select"
        options={[
          { value: "leads", label: "Leads" },
          { value: "offer", label: "Offer" },
          { value: "lost", label: "Lost" },
        ]}
        onSave={onSave}
      />,
    );
    expect(screen.getByText("Offer")).toBeInTheDocument();
  });

  it("renders dash for null value", () => {
    render(<InlineEditField label="Email" value={null} onSave={onSave} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/inline-edit-field.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement `InlineEditField`**

```tsx
// src/components/crm/inline-edit-field.tsx
/**
 * Inline-editable field with display → edit → save states.
 * Used inside the RecordDrawer for supervisor corrections.
 * @module components/crm/inline-edit-field
 */
"use client";

import { Check, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SelectOption {
  value: string;
  label: string;
}

interface InlineEditFieldProps {
  label: string;
  value: string | null;
  type?: "text" | "textarea" | "select";
  options?: SelectOption[];
  onSave: (value: string) => Promise<void> | void;
}

export function InlineEditField({ label, value, type = "text", options = [], onSave }: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [isSaved, setIsSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  /** Reset draft when external value changes. */
  useEffect(() => {
    if (!isEditing) setDraft(value ?? "");
  }, [value, isEditing]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) {
      setIsEditing(false);
      return;
    }
    await onSave(trimmed);
    setIsEditing(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 1500);
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value ?? "");
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && type !== "textarea") {
        event.preventDefault();
        void handleSave();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel, type],
  );

  const handleSelectChange = useCallback(
    async (newValue: string) => {
      if (newValue !== (value ?? "")) {
        await onSave(newValue);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 1500);
      }
      setIsEditing(false);
    },
    [value, onSave],
  );

  const displayValue = value ?? "—";
  const displayLabel = type === "select"
    ? options.find((o) => o.value === value)?.label ?? displayValue
    : displayValue;

  return (
    <div
      className="group flex items-start justify-between rounded px-1 py-1.5 transition-colors hover:bg-muted/30"
      role="button"
      tabIndex={0}
      onClick={() => { if (!isEditing) setIsEditing(true); }}
      onKeyDown={(e) => { if (e.key === "Enter" && !isEditing) setIsEditing(true); }}
    >
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>

      <div className="flex items-center gap-1.5">
        {isEditing ? (
          type === "select" ? (
            <Select defaultValue={value ?? undefined} onValueChange={(v) => void handleSelectChange(v)}>
              <SelectTrigger className="h-7 w-auto min-w-[120px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : type === "textarea" ? (
            <textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              className="w-full max-w-[200px] resize-none rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void handleSave()}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type="text"
              className="w-full max-w-[200px] rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void handleSave()}
              onKeyDown={handleKeyDown}
            />
          )
        ) : (
          <>
            <span className="max-w-[200px] truncate text-sm text-foreground/80">{displayLabel}</span>
            {isSaved ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/inline-edit-field.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/crm/inline-edit-field.tsx src/components/crm/__tests__/inline-edit-field.test.tsx
git commit -m "feat(crm-ux): add InlineEditField component with display/edit/save states"
```

---

## Task 6: Wire Inline Edit into Drawer + Mutation Hooks

**Goal:** Replace the static field displays in drawer content components with `InlineEditField`, and add Supabase update mutation hooks.

**Files:**
- Create: `src/hooks/use-update-contact.ts`
- Create: `src/hooks/use-update-deal.ts`
- Create: `src/hooks/use-update-crm-task.ts`
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/task-drawer-content.tsx`
- Test: `src/hooks/__tests__/use-update-contact.test.ts`
- Update: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`

**Context:** Each mutation hook follows the same pattern: `useMutation` wrapping a Supabase `.update()` call, invalidating the relevant query keys on success. Use `contactKeys`, `dealKeys`, `crmTaskKeys` for cache invalidation.

**Step 1: Create `useUpdateContact` hook**

```tsx
// src/hooks/use-update-contact.ts
/**
 * Mutation hook for updating a single contact field.
 * @module hooks/use-update-contact
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { contactKeys } from "@/hooks/use-contacts";
import { supabase } from "@/lib/supabase";
import type { Contact } from "@/lib/crm/schemas";

type ContactUpdate = Partial<Pick<Contact, "first_name" | "last_name" | "phone" | "email" | "type" | "notes">>;

export function useUpdateContact(contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ContactUpdate) => {
      const { error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("contact_id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}
```

**Step 2: Create `useUpdateDeal` and `useUpdateCrmTask` hooks**

Follow the exact same pattern with the appropriate table name, id column, update type, and query keys.

**Step 3: Write test for `useUpdateContact`**

Mock Supabase, verify it calls `.update()` with the right args and invalidates the cache.

**Step 4: Replace static fields in `ContactDrawerContent` with `InlineEditField`**

Replace the Details section:

```tsx
<DrawerSection title="Details">
  <div className="space-y-0.5">
    <InlineEditField label="Phone" value={contact.phone} onSave={(v) => updateContact.mutateAsync({ phone: v })} />
    <InlineEditField label="Email" value={contact.email} onSave={(v) => updateContact.mutateAsync({ email: v })} />
    <InlineEditField
      label="Type"
      value={contact.type}
      type="select"
      options={contactTypeValues.map((t) => ({ value: t, label: t }))}
      onSave={(v) => updateContact.mutateAsync({ type: v as Contact["type"] })}
    />
    <InlineEditField label="Notes" value={contact.notes} type="textarea" onSave={(v) => updateContact.mutateAsync({ notes: v })} />
  </div>
</DrawerSection>
```

**Step 5: Replace static fields in `DealDrawerContent`**

Same pattern. Editable fields: address, stage (select), price, notes.

**Step 6: Replace static fields in `TaskDrawerContent`**

Same pattern. Editable fields: title, status (select), due date, description.

**Step 7: Update drawer content tests**

Update mocks to include the mutation hooks. Verify `InlineEditField` renders for each editable field.

**Step 8: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 9: Commit**

```bash
git add -A
git commit -m "feat(crm-ux): wire InlineEditField into drawer with mutation hooks"
```

---

## Task 7: `ViewToggle` Component + `useViewPreference` Hook

**Goal:** A localStorage-backed hook and an icon toggle group for switching between table/kanban/calendar views.

**Files:**
- Create: `src/hooks/use-view-preference.ts`
- Create: `src/components/crm/view-toggle.tsx`
- Test: `src/hooks/__tests__/use-view-preference.test.ts`
- Test: `src/components/crm/__tests__/view-toggle.test.tsx`

**Step 1: Write failing test for `useViewPreference`**

```tsx
// src/hooks/__tests__/use-view-preference.test.ts
import { renderHook, act } from "@testing-library/react";
import { useViewPreference } from "@/hooks/use-view-preference";

describe("useViewPreference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to table", () => {
    const { result } = renderHook(() => useViewPreference("deals"));
    expect(result.current.view).toBe("table");
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useViewPreference("deals"));
    act(() => result.current.setView("kanban"));
    expect(result.current.view).toBe("kanban");
    expect(localStorage.getItem("view-deals")).toBe("kanban");
  });

  it("reads from localStorage on mount", () => {
    localStorage.setItem("view-deals", "calendar");
    const { result } = renderHook(() => useViewPreference("deals"));
    expect(result.current.view).toBe("calendar");
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("view-deals", "invalid");
    const { result } = renderHook(() => useViewPreference("deals"));
    expect(result.current.view).toBe("table");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/use-view-preference.test.ts`
Expected: FAIL

**Step 3: Implement `useViewPreference`**

```tsx
// src/hooks/use-view-preference.ts
/**
 * localStorage-backed view preference (table/kanban/calendar) per object type.
 * @module hooks/use-view-preference
 */
"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ViewType = "table" | "kanban" | "calendar";

const VALID_VIEWS = new Set<ViewType>(["table", "kanban", "calendar"]);

function getStorageKey(objectType: string): string {
  return `view-${objectType}`;
}

function getSnapshot(objectType: string): ViewType {
  const stored = localStorage.getItem(getStorageKey(objectType));
  return stored && VALID_VIEWS.has(stored as ViewType) ? (stored as ViewType) : "table";
}

function getServerSnapshot(): ViewType {
  return "table";
}

export function useViewPreference(objectType: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const handler = (e: StorageEvent) => {
        if (e.key === getStorageKey(objectType)) callback();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [objectType],
  );

  const view = useSyncExternalStore(
    subscribe,
    () => getSnapshot(objectType),
    getServerSnapshot,
  );

  const setView = useCallback(
    (newView: ViewType) => {
      localStorage.setItem(getStorageKey(objectType), newView);
      // Force re-render since useSyncExternalStore won't catch same-tab writes
      window.dispatchEvent(new StorageEvent("storage", { key: getStorageKey(objectType) }));
    },
    [objectType],
  );

  return { view, setView };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/use-view-preference.test.ts`
Expected: PASS

**Step 5: Write failing test for `ViewToggle`**

```tsx
// src/components/crm/__tests__/view-toggle.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToggle } from "@/components/crm/view-toggle";

describe("ViewToggle", () => {
  const onChange = vi.fn();

  it("renders three buttons for deals", () => {
    render(<ViewToggle current="table" views={["table", "kanban", "calendar"]} onChange={onChange} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("highlights the active view", () => {
    render(<ViewToggle current="kanban" views={["table", "kanban", "calendar"]} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toHaveAttribute("data-active", "true");
  });

  it("calls onChange on click", async () => {
    const user = userEvent.setup();
    render(<ViewToggle current="table" views={["table", "kanban", "calendar"]} onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]); // calendar
    expect(onChange).toHaveBeenCalledWith("calendar");
  });
});
```

**Step 6: Implement `ViewToggle`**

```tsx
// src/components/crm/view-toggle.tsx
/**
 * Icon toggle group for switching between table/kanban/calendar views.
 * @module components/crm/view-toggle
 */
"use client";

import { CalendarDays, Columns3, LayoutGrid } from "lucide-react";
import type { ElementType } from "react";

import { Button } from "@/components/ui/button";
import type { ViewType } from "@/hooks/use-view-preference";

const viewIconMap: Record<ViewType, ElementType> = {
  table: LayoutGrid,
  kanban: Columns3,
  calendar: CalendarDays,
};

const viewLabelMap: Record<ViewType, string> = {
  table: "Table view",
  kanban: "Kanban view",
  calendar: "Calendar view",
};

interface ViewToggleProps {
  current: ViewType;
  views: ViewType[];
  onChange: (view: ViewType) => void;
}

export function ViewToggle({ current, views, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/20 p-0.5">
      {views.map((view) => {
        const Icon = viewIconMap[view];
        const isActive = view === current;
        return (
          <Button
            key={view}
            variant="ghost"
            size="icon-xs"
            data-active={isActive}
            aria-label={viewLabelMap[view]}
            className={isActive ? "bg-background shadow-sm" : "text-muted-foreground"}
            onClick={() => onChange(view)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
```

**Step 7: Run tests**

Run: `npx vitest run src/hooks/__tests__/use-view-preference.test.ts src/components/crm/__tests__/view-toggle.test.tsx`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/hooks/use-view-preference.ts src/hooks/__tests__/use-view-preference.test.ts src/components/crm/view-toggle.tsx src/components/crm/__tests__/view-toggle.test.tsx
git commit -m "feat(crm-ux): add ViewToggle component + useViewPreference hook"
```

---

## Task 8: `KanbanBoard` Component

**Goal:** A read-only Kanban board that groups records into columns by a category field. Click card → opens drawer.

**Files:**
- Create: `src/components/crm/kanban-board.tsx`
- Test: `src/components/crm/__tests__/kanban-board.test.tsx`

**Context:** The component is generic — it takes an array of items, a `groupBy` function that returns the column key, column definitions (key + label), and a `renderCard` function. This way the same component works for deals (grouped by stage) and tasks (grouped by status).

**Step 1: Write failing test**

```tsx
// src/components/crm/__tests__/kanban-board.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/crm/kanban-board";

const columns = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
];

const items = [
  { id: "1", title: "Task A", status: "open" },
  { id: "2", title: "Task B", status: "completed" },
  { id: "3", title: "Task C", status: "open" },
];

describe("KanbanBoard", () => {
  const onCardClick = vi.fn();

  it("renders column headers with counts", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 open items
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // 1 completed item
  });

  it("renders cards in correct columns", () => {
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
  });

  it("calls onCardClick when a card is clicked", async () => {
    const user = userEvent.setup();
    render(
      <KanbanBoard
        items={items}
        columns={columns}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
        getItemId={(item) => item.id}
      />,
    );
    await user.click(screen.getByText("Task A"));
    expect(onCardClick).toHaveBeenCalledWith("1");
  });

  it("shows empty column state", () => {
    render(
      <KanbanBoard
        items={[{ id: "1", title: "Task A", status: "open" }]}
        columns={[...columns, { key: "blocked", label: "Blocked" }]}
        groupBy={(item) => item.status}
        renderCard={(item) => <div>{item.title}</div>}
        onCardClick={onCardClick}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument(); // Blocked column shows 0
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/kanban-board.test.tsx`
Expected: FAIL

**Step 3: Implement `KanbanBoard`**

```tsx
// src/components/crm/kanban-board.tsx
/**
 * Read-only Kanban board that groups items into columns. No drag-and-drop.
 * @module components/crm/kanban-board
 */
"use client";

import { Badge } from "@/components/ui/badge";

interface KanbanColumn {
  key: string;
  label: string;
}

interface KanbanBoardProps<T> {
  items: T[];
  columns: KanbanColumn[];
  groupBy: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onCardClick?: (id: string) => void;
  getItemId?: (item: T) => string;
}

export function KanbanBoard<T>({
  items,
  columns,
  groupBy,
  renderCard,
  onCardClick,
  getItemId,
}: KanbanBoardProps<T>) {
  /** Group items by column key. */
  const grouped = new Map<string, T[]>();
  for (const col of columns) grouped.set(col.key, []);
  for (const item of items) {
    const key = groupBy(item);
    const list = grouped.get(key);
    if (list) list.push(item);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const columnItems = grouped.get(col.key) ?? [];
        return (
          <div
            key={col.key}
            className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border/40 bg-muted/10"
          >
            {/* Column header */}
            <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2.5">
              <span className="text-sm font-medium">{col.label}</span>
              <Badge variant="secondary" className="text-[10px]">
                {columnItems.length}
              </Badge>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2">
              {columnItems.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground/50">No items</p>
              ) : (
                columnItems.map((item, index) => (
                  <div
                    key={getItemId ? getItemId(item) : index}
                    className="cursor-pointer rounded-lg border border-border/30 bg-card p-3 shadow-sm transition-colors hover:bg-muted/30"
                    onClick={() => {
                      if (onCardClick && getItemId) onCardClick(getItemId(item));
                    }}
                  >
                    {renderCard(item)}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/kanban-board.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/crm/kanban-board.tsx src/components/crm/__tests__/kanban-board.test.tsx
git commit -m "feat(crm-ux): add generic KanbanBoard component"
```

---

## Task 9: `CalendarGrid` Component

**Goal:** A read-only month grid that shows dots for days with items. Click a day → shows item list below. Click an item → calls `onItemClick`.

**Files:**
- Create: `src/components/crm/calendar-grid.tsx`
- Test: `src/components/crm/__tests__/calendar-grid.test.tsx`

**Context:** Uses `date-fns` for week calculations (`startOfMonth`, `endOfMonth`, `eachWeekOfInterval`, `startOfWeek`, `endOfWeek`, `eachDayOfInterval`, `format`, `isSameDay`, `isSameMonth`, `isToday`). The component is generic — takes items with a `getDate` accessor.

**Step 1: Install date-fns if not present**

Run: `npm ls date-fns` — check if already installed. If not: `npm install date-fns`

**Step 2: Write failing test**

```tsx
// src/components/crm/__tests__/calendar-grid.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarGrid } from "@/components/crm/calendar-grid";

const items = [
  { id: "1", title: "Task A", date: "2026-03-10T00:00:00+08:00" },
  { id: "2", title: "Task B", date: "2026-03-10T00:00:00+08:00" },
  { id: "3", title: "Task C", date: "2026-03-15T00:00:00+08:00" },
];

describe("CalendarGrid", () => {
  it("renders month/year header", () => {
    render(
      <CalendarGrid
        items={items}
        getDate={(item) => new Date(item.date)}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)} // March 2026
      />,
    );
    expect(screen.getByText(/March 2026/)).toBeInTheDocument();
  });

  it("renders day-of-week headers", () => {
    render(
      <CalendarGrid
        items={items}
        getDate={(item) => new Date(item.date)}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("shows item list when a day with items is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CalendarGrid
        items={items}
        getDate={(item) => new Date(item.date)}
        getItemId={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );
    // Click on day 10 — there are 2 items
    await user.click(screen.getByText("10"));
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  it("navigates to next/prev month", async () => {
    const user = userEvent.setup();
    render(
      <CalendarGrid
        items={[]}
        getDate={() => new Date()}
        getItemId={() => ""}
        renderItem={() => null}
        initialMonth={new Date(2026, 2, 1)}
      />,
    );
    await user.click(screen.getByLabelText("Next month"));
    expect(screen.getByText(/April 2026/)).toBeInTheDocument();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/calendar-grid.test.tsx`
Expected: FAIL

**Step 4: Implement `CalendarGrid`**

Build a month grid using `date-fns`. Each day cell shows a dot indicator for items on that day. Clicking a day sets `selectedDate` state and renders an item list below the grid.

The component should:
- Show `< March 2026 >` navigation header
- Render a 7-column CSS grid with Mon–Sun headers
- Each day cell shows the day number + dot indicators (max 3 dots)
- Today gets a blue ring highlight
- Days outside the current month get `text-muted-foreground/30`
- Selected day gets `bg-muted` fill
- Below the grid: if a day is selected and has items, render the items via `renderItem`
- `onItemClick` callback on each item in the expanded list

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/calendar-grid.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/crm/calendar-grid.tsx src/components/crm/__tests__/calendar-grid.test.tsx
git commit -m "feat(crm-ux): add CalendarGrid component with date-fns"
```

---

## Task 10: Wire View Switcher into Pages

**Goal:** Add `ViewToggle` to deals and tasks pages. Conditionally render table, kanban, or calendar based on selected view.

**Files:**
- Modify: `app/(dashboard)/crm/deals/page.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Create: `src/components/crm/deal-kanban-card.tsx` (card content for deals kanban)
- Create: `src/components/crm/task-kanban-card.tsx` (card content for tasks kanban)
- Test: Page-level integration tests

**Context:** Kanban columns for deals come from `dealStageValues` in `src/lib/crm/schemas.ts` + labels from `dealStageLabelMap` in `src/components/crm/stage-badge.tsx`. Task columns come from `crmTaskStatusValues`. Calendar date field: deals use `updated_at` (no close date field yet), tasks use `due_date`.

**Step 1: Create `DealKanbanCard` — small render component**

```tsx
// src/components/crm/deal-kanban-card.tsx
/**
 * Card content rendered inside the Kanban board for a deal.
 * @module components/crm/deal-kanban-card
 */
import { formatContactFullName, formatCrmPrice } from "@/lib/crm/display";
import type { DealWithContact } from "@/hooks/use-deals";

interface DealKanbanCardProps {
  deal: DealWithContact;
}

export function DealKanbanCard({ deal }: DealKanbanCardProps) {
  const primary = deal.deal_contacts?.find((dc) => dc.is_primary) ?? deal.deal_contacts?.[0];
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{deal.address}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{formatCrmPrice(deal.price)}</p>
      {primary?.contacts && (
        <p className="text-xs text-muted-foreground">{formatContactFullName(primary.contacts)}</p>
      )}
    </div>
  );
}
```

**Step 2: Create `TaskKanbanCard`**

```tsx
// src/components/crm/task-kanban-card.tsx
/**
 * Card content rendered inside the Kanban board for a CRM task.
 * @module components/crm/task-kanban-card
 */
import { formatContactFullName, formatCrmDate } from "@/lib/crm/display";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";

interface TaskKanbanCardProps {
  task: CrmTaskWithRelations;
}

export function TaskKanbanCard({ task }: TaskKanbanCardProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{task.title}</p>
      {task.due_date && (
        <p className="text-xs text-muted-foreground">{formatCrmDate(task.due_date)}</p>
      )}
      {task.contacts && (
        <p className="text-xs text-muted-foreground">{formatContactFullName(task.contacts)}</p>
      )}
    </div>
  );
}
```

**Step 3: Wire into `/crm/deals` page**

In `app/(dashboard)/crm/deals/page.tsx`:
- Import `useViewPreference`, `ViewToggle`, `KanbanBoard`, `CalendarGrid`, `DealKanbanCard`
- Add `const { view, setView } = useViewPreference("deals");`
- Add `<ViewToggle>` in the page header next to the search input
- Conditionally render:
  - `view === "table"` → `<DealsTable>` (existing)
  - `view === "kanban"` → `<KanbanBoard>` with `dealStageValues` as columns
  - `view === "calendar"` → `<CalendarGrid>` with `getDate: (deal) => new Date(deal.updated_at)`

**Step 4: Wire into `/tasks` page**

Same pattern with `crmTaskStatusValues` for kanban columns and `due_date` for calendar.

**Step 5: Write integration tests**

Test that the view toggle renders, clicking switches the view, and the correct component renders for each view type.

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(crm-ux): wire ViewToggle + Kanban + Calendar into deals and tasks pages"
```

---

## Task 11: `search_records` Supabase RPC

**Goal:** A Postgres function that searches across contacts, deals, crm_tasks, and threads by text, returning typed results.

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_search_records_rpc.sql`
- Create: `src/hooks/use-search-records.ts`
- Test: `src/hooks/__tests__/use-search-records.test.ts`

**Step 1: Write the migration**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_search_records_rpc.sql
CREATE OR REPLACE FUNCTION public.search_records(query text)
RETURNS TABLE (
  type text,
  id uuid,
  title text,
  subtitle text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Contacts: search by first_name, last_name
  SELECT
    'contact' AS type,
    contact_id AS id,
    first_name || ' ' || last_name AS title,
    COALESCE(type, '') AS subtitle
  FROM contacts
  WHERE
    (first_name ILIKE '%' || query || '%' OR last_name ILIKE '%' || query || '%')
    AND client_id = auth.uid()
  LIMIT 3

  UNION ALL

  -- Deals: search by address
  SELECT
    'deal' AS type,
    deal_id AS id,
    address AS title,
    COALESCE(stage, '') AS subtitle
  FROM deals
  WHERE
    address ILIKE '%' || query || '%'
    AND client_id = auth.uid()
  LIMIT 3

  UNION ALL

  -- CRM Tasks: search by title
  SELECT
    'task' AS type,
    task_id AS id,
    title,
    COALESCE(status, '') AS subtitle
  FROM crm_tasks
  WHERE
    title ILIKE '%' || query || '%'
    AND client_id = auth.uid()
  LIMIT 3

  UNION ALL

  -- Threads: search by title
  SELECT
    'thread' AS type,
    thread_id AS id,
    COALESCE(title, 'Untitled thread') AS title,
    '' AS subtitle
  FROM conversation_threads
  WHERE
    title ILIKE '%' || query || '%'
    AND client_id = auth.uid()
    AND is_archived = false
  LIMIT 3
$$;
```

**Step 2: Create `useSearchRecords` hook**

```tsx
// src/hooks/use-search-records.ts
/**
 * TanStack Query hook for cross-table record search via Supabase RPC.
 * @module hooks/use-search-records
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface SearchResult {
  type: "contact" | "deal" | "task" | "thread";
  id: string;
  title: string;
  subtitle: string;
}

export function useSearchRecords(query: string) {
  return useQuery({
    queryKey: ["search-records", query],
    queryFn: async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase.rpc("search_records", { query });
      if (error) throw error;
      return (data ?? []) as SearchResult[];
    },
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
}
```

**Step 3: Write test for `useSearchRecords`**

Mock `supabase.rpc` and verify:
- Does not execute when query is empty or < 2 chars
- Returns typed results when query is provided
- Groups correctly by type

**Step 4: Apply migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup)

**Step 5: Commit**

```bash
git add supabase/migrations/ src/hooks/use-search-records.ts src/hooks/__tests__/use-search-records.test.ts
git commit -m "feat(crm-ux): add search_records RPC + useSearchRecords hook"
```

---

## Task 12: `CommandMenu` Component + Keyboard Shortcut

**Goal:** A `Cmd+K` modal that searches across all record types and navigates on select.

**Files:**
- Create: `src/components/command-menu.tsx`
- Test: `src/components/__tests__/command-menu.test.tsx`

**Context:** Built on ShadCN `CommandDialog` from `src/components/ui/command.tsx`. The `CommandDialog` renders inside a `Dialog` positioned at `top-1/3`, with `CommandInput` and `CommandList`. We use `useSearchRecords` for data and debounce the input with a 300ms delay.

**Step 1: Write failing test**

```tsx
// src/components/__tests__/command-menu.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandMenu } from "@/components/command-menu";

vi.mock("@/hooks/use-search-records", () => ({
  useSearchRecords: (query: string) => ({
    data: query.length >= 2
      ? [
          { type: "contact", id: "c1", title: "Sarah Tan", subtitle: "seller" },
          { type: "deal", id: "d1", title: "Bishan St 22", subtitle: "offer" },
          { type: "thread", id: "t1", title: "Update phone", subtitle: "" },
        ]
      : [],
    isLoading: false,
  }),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("CommandMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders search input when open", () => {
    render(<CommandMenu open onOpenChange={() => {}} />);
    expect(screen.getByPlaceholderText(/Search contacts/)).toBeInTheDocument();
  });

  it("shows grouped results on search", async () => {
    const user = userEvent.setup();
    render(<CommandMenu open onOpenChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "sarah");
    await waitFor(() => {
      expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
      expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
    });
  });

  it("navigates to contact page with detail param on select", async () => {
    const user = userEvent.setup();
    render(<CommandMenu open onOpenChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "sarah");
    await waitFor(() => screen.getByText("Sarah Tan"));
    await user.click(screen.getByText("Sarah Tan"));
    expect(mockPush).toHaveBeenCalledWith("/crm/contacts?detail=c1");
  });

  it("navigates to thread on select", async () => {
    const user = userEvent.setup();
    render(<CommandMenu open onOpenChange={() => {}} />);
    await user.type(screen.getByRole("combobox"), "update");
    await waitFor(() => screen.getByText("Update phone"));
    await user.click(screen.getByText("Update phone"));
    expect(mockPush).toHaveBeenCalledWith("/chat/t1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/command-menu.test.tsx`
Expected: FAIL

**Step 3: Implement `CommandMenu`**

```tsx
// src/components/command-menu.tsx
/**
 * Global command menu for quick search across contacts, deals, tasks, threads.
 * Triggered via Cmd+K / Ctrl+K.
 * @module components/command-menu
 */
"use client";

import { Contact, Handshake, CheckSquare, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ElementType } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSearchRecords, type SearchResult } from "@/hooks/use-search-records";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const typeIconMap: Record<SearchResult["type"], ElementType> = {
  contact: Contact,
  deal: Handshake,
  task: CheckSquare,
  thread: MessageCircle,
};

const typeLabelMap: Record<SearchResult["type"], string> = {
  contact: "Contacts",
  deal: "Deals",
  task: "Tasks",
  thread: "Threads",
};

const typeRouteMap: Record<SearchResult["type"], (id: string) => string> = {
  contact: (id) => `/crm/contacts?detail=${id}`,
  deal: (id) => `/crm/deals?detail=${id}`,
  task: (id) => `/tasks?detail=${id}`,
  thread: (id) => `/chat/${id}`,
};

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: results = [], isLoading } = useSearchRecords(debouncedQuery);

  /** Group results by type. */
  const grouped = new Map<SearchResult["type"], SearchResult[]>();
  for (const result of results) {
    const list = grouped.get(result.type) ?? [];
    list.push(result);
    grouped.set(result.type, list);
  }

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      setQuery("");
      router.push(typeRouteMap[result.type](result.id));
    },
    [router, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" showCloseButton={false}>
      <CommandInput
        placeholder="Search contacts, deals, tasks, threads..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {debouncedQuery.length >= 2 && !isLoading && results.length === 0 && (
          <CommandEmpty>No results for &ldquo;{debouncedQuery}&rdquo;</CommandEmpty>
        )}
        {(["contact", "deal", "task", "thread"] as const).map((type) => {
          const items = grouped.get(type);
          if (!items?.length) return null;
          return (
            <CommandGroup key={type} heading={typeLabelMap[type]}>
              {items.map((result) => {
                const Icon = typeIconMap[type];
                return (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleSelect(result)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{result.title}</span>
                    {result.subtitle && (
                      <span className="ml-2 text-xs text-muted-foreground">{result.subtitle}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
```

**Step 4: Create `useDebouncedValue` hook if it doesn't exist**

Check `src/hooks/` for an existing debounce hook. If absent, create a simple one:

```tsx
// src/hooks/use-debounced-value.ts
"use client";
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/command-menu.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/command-menu.tsx src/components/__tests__/command-menu.test.tsx src/hooks/use-debounced-value.ts
git commit -m "feat(crm-ux): add CommandMenu component with grouped search results"
```

---

## Task 13: Wire Command Menu into App Layout

**Goal:** Mount the command menu globally, add `Cmd+K` keyboard shortcut, and add search icon to sidebar.

**Files:**
- Modify: `src/components/layout/app-layout.tsx` (or wherever the dashboard layout shell lives)
- Modify: `src/components/layout/app-sidebar.tsx` — add search icon button in sidebar header
- Test: Integration test for keyboard shortcut

**Step 1: Add `useCommandMenu` hook for keyboard shortcut**

Create a thin hook or inline the effect. On mount, listen for `keydown` and open the menu on `Cmd+K` / `Ctrl+K`:

```tsx
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      setCommandMenuOpen((prev) => !prev);
    }
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

**Step 2: Mount `CommandMenu` in the layout**

In the dashboard layout (the component that wraps all `(dashboard)` routes), add:

```tsx
const [commandMenuOpen, setCommandMenuOpen] = useState(false);

// ... keyboard shortcut effect above ...

return (
  <>
    {/* existing layout */}
    <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
  </>
);
```

**Step 3: Add search icon to sidebar header**

In `src/components/layout/app-sidebar.tsx`, add a `Button` with `Search` icon in the `SidebarHeader` area. On click, it opens the command menu. Pass the setter down via context or lift state. Simplest approach: use a custom event:

```tsx
// In sidebar:
<Button
  variant="ghost"
  size="icon-xs"
  aria-label="Search"
  onClick={() => document.dispatchEvent(new CustomEvent("open-command-menu"))}
>
  <Search className="h-4 w-4" />
</Button>

// In layout, add to useEffect:
const handleOpenCommandMenu = () => setCommandMenuOpen(true);
document.addEventListener("open-command-menu", handleOpenCommandMenu);
return () => document.removeEventListener("open-command-menu", handleOpenCommandMenu);
```

**Step 4: Write integration test**

Test that pressing `Cmd+K` opens the command menu dialog.

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(crm-ux): wire CommandMenu into app layout with Cmd+K shortcut"
```

---

## Summary of All New/Modified Files

### New Files (~18)
- `src/hooks/use-record-drawer.ts`
- `src/hooks/use-view-preference.ts`
- `src/hooks/use-search-records.ts`
- `src/hooks/use-debounced-value.ts`
- `src/hooks/use-update-contact.ts`
- `src/hooks/use-update-deal.ts`
- `src/hooks/use-update-crm-task.ts`
- `src/components/crm/record-drawer/record-drawer.tsx`
- `src/components/crm/record-drawer/contact-drawer-content.tsx`
- `src/components/crm/record-drawer/deal-drawer-content.tsx`
- `src/components/crm/record-drawer/task-drawer-content.tsx`
- `src/components/crm/record-drawer/drawer-section.tsx`
- `src/components/crm/record-drawer/index.ts`
- `src/components/crm/inline-edit-field.tsx`
- `src/components/crm/view-toggle.tsx`
- `src/components/crm/kanban-board.tsx`
- `src/components/crm/calendar-grid.tsx`
- `src/components/crm/deal-kanban-card.tsx`
- `src/components/crm/task-kanban-card.tsx`
- `src/components/command-menu.tsx`
- `supabase/migrations/YYYYMMDDHHMMSS_add_search_records_rpc.sql`

### Modified Files (~8)
- `app/(dashboard)/crm/contacts/page.tsx`
- `app/(dashboard)/crm/deals/page.tsx`
- `app/(dashboard)/tasks/page.tsx`
- `src/components/crm/contacts-table.tsx`
- `src/components/crm/deals-table.tsx`
- `src/components/crm/crm-tasks-table.tsx`
- `src/hooks/use-crm-tasks.ts`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/app-sidebar.tsx`

### Deleted
- `app/(dashboard)/crm/contacts/[contactId]/` (entire directory)
- `app/(dashboard)/crm/deals/[dealId]/` (entire directory)

### Test Files (~14)
- `src/hooks/__tests__/use-record-drawer.test.ts`
- `src/hooks/__tests__/use-view-preference.test.ts`
- `src/hooks/__tests__/use-search-records.test.ts`
- `src/hooks/__tests__/use-update-contact.test.ts`
- `src/components/crm/record-drawer/__tests__/record-drawer.test.tsx`
- `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- `src/components/crm/record-drawer/__tests__/task-drawer-content.test.tsx`
- `src/components/crm/__tests__/inline-edit-field.test.tsx`
- `src/components/crm/__tests__/view-toggle.test.tsx`
- `src/components/crm/__tests__/kanban-board.test.tsx`
- `src/components/crm/__tests__/calendar-grid.test.tsx`
- `src/components/__tests__/command-menu.test.tsx`
- Updated existing page/table tests
