# CRM Read-Only Pages (Deals + Tasks) Implementation Plan

**PR:** PR 11: CRM read-only pages (Deals + Tasks)
**Decisions:** UX-02, DATA-01, DATA-07, DATA-09
**Goal:** Build read-only deals and tasks pages so users can browse CRM data the agent created via chat.

**Architecture:** Deals live under the CRM section (`/crm/deals`, `/crm/deals/[dealId]`). Tasks live at `/tasks` as a top-level AGENT nav item (UX-02: Tasks is under AGENT, not DATABASE). This PR keeps `/tasks` as a CRM-task table only for minimal scope; unified board/list/goals tasks UX (`UX-04`) remains deferred to the later tasks-surface PR. Both list surfaces use TanStack Table and TanStack Query, matching existing patterns. All data is read via Supabase PostgREST with RLS — `client_id` scoping is automatic (DATA-01). Realtime invalidation should be wired via `useRealtimeTable` for `deals`, `crm_tasks`, and `interactions` (DATA-07). Deal stages use colored badges. CRM tasks show binary `open`/`completed` status with due dates. Deal detail page shows linked contact info and interaction timeline.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Table, TanStack Query, Supabase (PostgREST + RLS), Tailwind 4, ShadCN (Badge, Table components), Vitest + React Testing Library

**Prerequisites:** PR 10 must be done first — it creates the CRM section layout at `/crm` with tab navigation (Contacts, Deals) and establishes the CRM route structure. This PR adds the Deals tab content and the Tasks page.

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

| Task | Component | TDD? | Depends On |
|------|-----------|------|------------|
| 1 | TanStack Query hooks for deals | Yes | PR 10 (CRM section exists) |
| 2 | TanStack Query hooks for CRM tasks | Yes | — |
| 3 | Extend existing interaction relation hooks with deal-scoped query | Yes | — |
| 4 | Stage badge component | Yes | — |
| 5 | Task status badge component | Yes | — |
| 6 | Deals list page (table + route) | Yes | Tasks 1, 4 |
| 7 | Deal detail page | Yes | Tasks 1, 3, 4 |
| 8 | Tasks list page | Yes | Tasks 2, 5 |
| 9 | Update CRM layout tabs + verify routes | No (wiring) | Tasks 6, 7, 8 |

---

### Task 1: TanStack Query Hooks for Deals

**Context:** Follow the exact same pattern as `src/hooks/use-cases.ts` for query key factories and `queryOptions()`. Use `keepPreviousData` on list queries only; detail queries should avoid stale entity flashes. Reuse shared PostgREST escaping helpers (extend `src/lib/crm/postgrest-filters.ts` for deals/tasks search) instead of raw string interpolation. The deals table has columns: `deal_id`, `client_id`, `address`, `stage`, `price`, `contact_id`, `notes`, `created_at`, `updated_at`. We join on `contacts` to display linked contact name. All queries go through the Supabase browser client at `src/lib/supabase.ts`, which auto-applies RLS via `client_id`.

**Files:**
- Create: `src/hooks/use-deals.ts`
- Test: `src/hooks/__tests__/use-deals.test.ts`
- Reference: `src/hooks/use-cases.ts` (pattern to follow)
- Reference: `src/types/database.ts:595-644` (deals table types)
- Reference: `src/lib/crm/schemas.ts:71-108` (Deal, dealStageValues)

**Step 1: Write failing tests for deal query key factory and fetch function**

```typescript
// src/hooks/__tests__/use-deals.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

// Mock Supabase before importing hooks
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockIlike = vi.fn();
const mockOr = vi.fn();
const mockSingle = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

// Chain builder: each mock returns the chain object
function setupChain(resolvedData: unknown, error: unknown = null) {
  const chain = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    ilike: mockIlike,
    or: mockOr,
    single: mockSingle,
  };
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockOrder.mockReturnValue(chain);
  mockIlike.mockReturnValue(chain);
  mockOr.mockReturnValue(chain);
  // Terminal: order() resolves the query for list, single() for detail
  mockOrder.mockResolvedValue({ data: resolvedData, error });
  mockSingle.mockResolvedValue({ data: resolvedData, error });
}

import { dealKeys, fetchDeals, fetchDeal } from "../use-deals";

describe("dealKeys", () => {
  test("generates consistent query keys", () => {
    expect(dealKeys.all).toEqual(["deals"]);
    expect(dealKeys.lists()).toEqual(["deals", "list"]);
    expect(dealKeys.list({ search: "oak" })).toEqual(["deals", "list", { search: "oak" }]);
    expect(dealKeys.list({})).toEqual(["deals", "list", {}]);
    expect(dealKeys.details()).toEqual(["deals", "detail"]);
    expect(dealKeys.detail("abc-123")).toEqual(["deals", "detail", "abc-123"]);
  });
});

describe("fetchDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches all deals ordered by updated_at descending", async () => {
    const mockDeals = [
      { deal_id: "d1", address: "123 Oak St", stage: "leads" },
    ];
    setupChain(mockDeals);

    const result = await fetchDeals({});

    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(mockSelect).toHaveBeenCalledWith("*, contacts(first_name, last_name)");
    expect(mockOrder).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result).toEqual(mockDeals);
  });

  test("applies search filter using ilike on address", async () => {
    setupChain([]);

    await fetchDeals({ search: "oak" });

    expect(mockOr).toHaveBeenCalledWith(
      "address.ilike.%oak%,notes.ilike.%oak%"
    );
  });

  test("applies stage filter", async () => {
    setupChain([]);

    await fetchDeals({ stage: "viewing" });

    expect(mockEq).toHaveBeenCalledWith("stage", "viewing");
  });

  test("throws on Supabase error", async () => {
    setupChain(null, { message: "RLS denied" });

    await expect(fetchDeals({})).rejects.toEqual({ message: "RLS denied" });
  });
});

describe("fetchDeal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches a single deal by ID with joined contact", async () => {
    const mockDeal = { deal_id: "d1", address: "123 Oak St" };
    setupChain(mockDeal);

    const result = await fetchDeal("d1");

    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(mockSelect).toHaveBeenCalledWith("*, contacts(first_name, last_name)");
    expect(mockEq).toHaveBeenCalledWith("deal_id", "d1");
    expect(mockSingle).toHaveBeenCalled();
    expect(result).toEqual(mockDeal);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-deals.test.ts
```

Expected: FAIL — `use-deals` module does not exist.

**Step 3: Implement the hooks**

```typescript
// src/hooks/use-deals.ts
/**
 * TanStack Query hooks for deals CRUD operations.
 * Follows the same pattern as use-cases.ts.
 * @module hooks/use-deals
 */
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Deal } from "@/lib/crm/schemas";

/** Deal row with joined contact name from the foreign key relation. */
export type DealWithContact = Deal & {
  contacts: { first_name: string; last_name: string } | null;
};

/**
 * Query key factory for deals.
 * Provides consistent keys for caching and invalidation.
 */
export const dealKeys = {
  all: ["deals"] as const,
  lists: () => [...dealKeys.all, "list"] as const,
  list: (filters: { search?: string; stage?: string }) =>
    [...dealKeys.lists(), filters] as const,
  details: () => [...dealKeys.all, "detail"] as const,
  detail: (id: string) => [...dealKeys.details(), id] as const,
};

interface FetchDealsOptions {
  search?: string;
  stage?: string;
}

/**
 * Fetches deals from the database with optional search and stage filter.
 * Joins on contacts to include linked contact name.
 */
export async function fetchDeals({ search, stage }: FetchDealsOptions): Promise<DealWithContact[]> {
  let query = supabase
    .from("deals")
    .select("*, contacts(first_name, last_name)")
    .order("updated_at", { ascending: false });

  if (search) {
    query = query.or(`address.ilike.%${search}%,notes.ilike.%${search}%`);
  }

  if (stage) {
    query = query.eq("stage", stage);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as DealWithContact[];
}

/**
 * Fetches a single deal by ID with joined contact name.
 */
export async function fetchDeal(dealId: string): Promise<DealWithContact> {
  const { data, error } = await supabase
    .from("deals")
    .select("*, contacts(first_name, last_name)")
    .eq("deal_id", dealId)
    .single();
  if (error) throw error;
  return data as DealWithContact;
}

/**
 * Query options factory for fetching a single deal.
 */
export function dealDetailQueryOptions(dealId: string) {
  return queryOptions({
    queryKey: dealKeys.detail(dealId),
    queryFn: () => fetchDeal(dealId),
  });
}

/**
 * Query options factory for fetching deals list.
 */
export function dealsQueryOptions(params: FetchDealsOptions) {
  return queryOptions({
    queryKey: dealKeys.list({ search: params.search, stage: params.stage }),
    queryFn: () => fetchDeals(params),
  });
}

/**
 * Fetches all deals with optional filtering.
 * Uses keepPreviousData for smooth transitions during search/filter changes.
 */
export function useDeals(options: FetchDealsOptions = {}) {
  return useQuery({
    ...dealsQueryOptions(options),
    placeholderData: keepPreviousData,
  });
}

/**
 * Fetches a single deal by ID.
 * Disabled when dealId is empty/falsy.
 */
export function useDeal(dealId: string) {
  return useQuery({
    ...dealDetailQueryOptions(dealId),
    enabled: !!dealId,
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-deals.test.ts
```

Expected: PASS — all 5 tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-deals.ts src/hooks/__tests__/use-deals.test.ts
git commit -m "feat(crm): add TanStack Query hooks for deals with tests"
```

---

### Task 2: TanStack Query Hooks for CRM Tasks

**Context:** Same pattern as Task 1 but for `crm_tasks` table. CRM tasks have binary `open`/`completed` status (not the full agent task lifecycle). We join on `contacts` and `deals` to show linked entity names. The tasks page at `/tasks` is under the AGENT nav section (UX-02), separate from CRM. Reuse shared PostgREST escaping helpers for search filters; do not use raw interpolation.

**Files:**
- Create: `src/hooks/use-crm-tasks.ts`
- Test: `src/hooks/__tests__/use-crm-tasks.test.ts`
- Reference: `src/hooks/use-deals.ts` (pattern from Task 1)
- Reference: `src/types/database.ts:534-593` (crm_tasks table types)
- Reference: `src/lib/crm/schemas.ts:148-179` (CrmTask, crmTaskStatusValues)

**Step 1: Write failing tests for task query key factory and fetch function**

```typescript
// src/hooks/__tests__/use-crm-tasks.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockOr = vi.fn();
const mockLte = vi.fn();
const mockGte = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

function setupChain(resolvedData: unknown, error: unknown = null) {
  const chain = {
    select: mockSelect,
    eq: mockEq,
    order: mockOrder,
    or: mockOr,
    lte: mockLte,
    gte: mockGte,
  };
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockOrder.mockReturnValue(chain);
  mockOr.mockReturnValue(chain);
  mockLte.mockReturnValue(chain);
  mockGte.mockReturnValue(chain);
  mockOrder.mockResolvedValue({ data: resolvedData, error });
}

import { crmTaskKeys, fetchCrmTasks } from "../use-crm-tasks";

describe("crmTaskKeys", () => {
  test("generates consistent query keys", () => {
    expect(crmTaskKeys.all).toEqual(["crm-tasks"]);
    expect(crmTaskKeys.lists()).toEqual(["crm-tasks", "list"]);
    expect(crmTaskKeys.list({ status: "open" })).toEqual([
      "crm-tasks", "list", { status: "open" },
    ]);
  });
});

describe("fetchCrmTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches all tasks with joined contact and deal, ordered by due_date", async () => {
    const mockTasks = [
      { task_id: "t1", title: "Follow up", status: "open" },
    ];
    setupChain(mockTasks);

    const result = await fetchCrmTasks({});

    expect(mockFrom).toHaveBeenCalledWith("crm_tasks");
    expect(mockSelect).toHaveBeenCalledWith(
      "*, contacts(first_name, last_name), deals(address)"
    );
    expect(mockOrder).toHaveBeenCalledWith("due_date", { ascending: true, nullsFirst: false });
    expect(result).toEqual(mockTasks);
  });

  test("filters by status", async () => {
    setupChain([]);

    await fetchCrmTasks({ status: "open" });

    expect(mockEq).toHaveBeenCalledWith("status", "open");
  });

  test("filters by search on title", async () => {
    setupChain([]);

    await fetchCrmTasks({ search: "follow" });

    expect(mockOr).toHaveBeenCalledWith(
      "title.ilike.%follow%,description.ilike.%follow%"
    );
  });

  test("throws on Supabase error", async () => {
    setupChain(null, { message: "permission denied" });

    await expect(fetchCrmTasks({})).rejects.toEqual({ message: "permission denied" });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-crm-tasks.test.ts
```

Expected: FAIL — `use-crm-tasks` module does not exist.

**Step 3: Implement the hooks**

```typescript
// src/hooks/use-crm-tasks.ts
/**
 * TanStack Query hooks for CRM task operations.
 * CRM tasks use binary open/completed status (not agent task lifecycle).
 * @module hooks/use-crm-tasks
 */
import {
  useQuery,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CrmTask } from "@/lib/crm/schemas";

/** CRM task row with joined contact and deal names. */
export type CrmTaskWithRelations = CrmTask & {
  contacts: { first_name: string; last_name: string } | null;
  deals: { address: string } | null;
};

/**
 * Query key factory for CRM tasks.
 */
export const crmTaskKeys = {
  all: ["crm-tasks"] as const,
  lists: () => [...crmTaskKeys.all, "list"] as const,
  list: (filters: { status?: string; search?: string }) =>
    [...crmTaskKeys.lists(), filters] as const,
};

interface FetchCrmTasksOptions {
  status?: string;
  search?: string;
}

/**
 * Fetches CRM tasks with optional status and search filters.
 * Joins on contacts and deals to include linked entity names.
 * Orders by due_date ascending (soonest first, nulls last).
 */
export async function fetchCrmTasks({
  status,
  search,
}: FetchCrmTasksOptions): Promise<CrmTaskWithRelations[]> {
  let query = supabase
    .from("crm_tasks")
    .select("*, contacts(first_name, last_name), deals(address)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CrmTaskWithRelations[];
}

/**
 * Query options factory for fetching CRM tasks list.
 */
export function crmTasksQueryOptions(params: FetchCrmTasksOptions) {
  return queryOptions({
    queryKey: crmTaskKeys.list({ status: params.status, search: params.search }),
    queryFn: () => fetchCrmTasks(params),
  });
}

/**
 * Fetches CRM tasks with optional filtering.
 */
export function useCrmTasks(options: FetchCrmTasksOptions = {}) {
  return useQuery({
    ...crmTasksQueryOptions(options),
    placeholderData: keepPreviousData,
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-crm-tasks.test.ts
```

Expected: PASS — all 4 tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-crm-tasks.ts src/hooks/__tests__/use-crm-tasks.test.ts
git commit -m "feat(crm): add TanStack Query hooks for CRM tasks with tests"
```

---

### Task 3: Extend Existing Relation Hooks with Deal Interactions

**Context:** Interactions are loaded on the deal detail page to show activity timeline. They're append-only records (call, meeting, email, message, viewing, note) linked to a contact and optionally a deal. To avoid duplicate hook surfaces, extend `src/hooks/use-contact-relations.ts` with deal-scoped interaction query keys/hooks instead of creating a second interactions hook file.

**Files:**
- Modify: `src/hooks/use-contact-relations.ts`
- Modify: `src/hooks/__tests__/use-contact-relations.test.tsx`
- Reference: `src/types/database.ts:646-698` (interactions table types)
- Reference: `src/lib/crm/schemas.ts:110-146` (Interaction, interactionTypeValues)

**Step 1: Write failing tests**

```typescript
// src/hooks/__tests__/use-contact-relations.test.tsx
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

function setupChain(resolvedData: unknown, error: unknown = null) {
  const chain = { select: mockSelect, eq: mockEq, order: mockOrder };
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockOrder.mockReturnValue(chain);
  mockOrder.mockResolvedValue({ data: resolvedData, error });
}

import { interactionKeys, fetchInteractions } from "../use-contact-relations";

describe("interactionKeys", () => {
  test("generates consistent query keys", () => {
    expect(interactionKeys.all).toEqual(["interactions"]);
    expect(interactionKeys.byDeal("d1")).toEqual(["interactions", "deal", "d1"]);
    expect(interactionKeys.byContact("c1")).toEqual(["interactions", "contact", "c1"]);
  });
});

describe("fetchInteractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fetches interactions for a deal ordered by occurred_at desc", async () => {
    const mockInteractions = [
      { interaction_id: "i1", type: "call", summary: "Discussed price" },
    ];
    setupChain(mockInteractions);

    const result = await fetchInteractions({ dealId: "d1" });

    expect(mockFrom).toHaveBeenCalledWith("interactions");
    expect(mockSelect).toHaveBeenCalledWith(
      "*, contacts(first_name, last_name)"
    );
    expect(mockEq).toHaveBeenCalledWith("deal_id", "d1");
    expect(mockOrder).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(result).toEqual(mockInteractions);
  });

  test("fetches interactions for a contact", async () => {
    setupChain([]);

    await fetchInteractions({ contactId: "c1" });

    expect(mockEq).toHaveBeenCalledWith("contact_id", "c1");
  });

  test("throws on Supabase error", async () => {
    setupChain(null, { message: "RLS denied" });

    await expect(fetchInteractions({ dealId: "d1" })).rejects.toEqual({
      message: "RLS denied",
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/use-contact-relations.test.tsx
```

Expected: FAIL — `use-contact-relations` deal interaction hook does not exist.

**Step 3: Implement the hooks**

```typescript
// src/hooks/use-contact-relations.ts
/**
 * TanStack Query hooks for interaction timeline data.
 * Interactions are append-only activity records linked to contacts and deals.
 * @module hooks/use-contact-relations
 */
import {
  useQuery,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Interaction } from "@/lib/crm/schemas";

/** Interaction row with joined contact name. */
export type InteractionWithContact = Interaction & {
  contacts: { first_name: string; last_name: string } | null;
};

/**
 * Query key factory for interactions.
 */
export const interactionKeys = {
  all: ["interactions"] as const,
  byDeal: (dealId: string) => [...interactionKeys.all, "deal", dealId] as const,
  byContact: (contactId: string) =>
    [...interactionKeys.all, "contact", contactId] as const,
};

interface FetchInteractionsOptions {
  dealId?: string;
  contactId?: string;
}

/**
 * Fetches interactions filtered by deal or contact.
 * At least one of dealId or contactId must be provided.
 * Orders by occurred_at descending (most recent first).
 */
export async function fetchInteractions({
  dealId,
  contactId,
}: FetchInteractionsOptions): Promise<InteractionWithContact[]> {
  let query = supabase
    .from("interactions")
    .select("*, contacts(first_name, last_name)")
    .order("occurred_at", { ascending: false });

  if (dealId) {
    query = query.eq("deal_id", dealId);
  }

  if (contactId) {
    query = query.eq("contact_id", contactId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as InteractionWithContact[];
}

/**
 * Fetches interactions for a specific deal.
 */
export function useDealInteractions(dealId: string) {
  return useQuery({
    queryKey: interactionKeys.byDeal(dealId),
    queryFn: () => fetchInteractions({ dealId }),
    enabled: !!dealId,
  });
}

/**
 * Fetches interactions for a specific contact.
 */
export function useContactInteractions(contactId: string) {
  return useQuery({
    queryKey: interactionKeys.byContact(contactId),
    queryFn: () => fetchInteractions({ contactId }),
    enabled: !!contactId,
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/use-contact-relations.test.tsx
```

Expected: PASS — all 4 tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-contact-relations.ts src/hooks/__tests__/use-contact-relations.test.tsx
git commit -m "feat(crm): add TanStack Query hooks for interactions with tests"
```

---

### Task 4: Stage Badge Component

**Context:** Deal stages (`leads`, `viewing`, `offer`, `negotiation`, `otp`, `completion`, `lost`) need distinct visual treatment. Use the existing ShadCN `Badge` component at `src/components/ui/badge.tsx` and reuse shared maps/formatting from `src/lib/crm/display.ts` where possible to avoid duplicate stage config.

**Files:**
- Create: `src/components/crm/stage-badge.tsx`
- Test: `src/components/crm/__tests__/stage-badge.test.tsx`
- Reference: `src/components/ui/badge.tsx` (existing Badge component with variants: default, secondary, destructive, outline, success, info, warning, tag)
- Reference: `src/lib/crm/schemas.ts:72-80` (dealStageValues)

**Step 1: Write failing tests**

```tsx
// src/components/crm/__tests__/stage-badge.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageBadge } from "../stage-badge";

describe("StageBadge", () => {
  test("renders the stage label with correct text", () => {
    render(<StageBadge stage="leads" />);
    expect(screen.getByText("Leads")).toBeInTheDocument();
  });

  test("renders OTP stage with uppercase label", () => {
    render(<StageBadge stage="otp" />);
    expect(screen.getByText("OTP")).toBeInTheDocument();
  });

  test("renders completion stage with success styling", () => {
    const { container } = render(<StageBadge stage="completion" />);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-variant", "success");
  });

  test("renders lost stage with destructive styling", () => {
    const { container } = render(<StageBadge stage="lost" />);
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  test("renders all valid stages without errors", () => {
    const stages = ["leads", "viewing", "offer", "negotiation", "otp", "completion", "lost"] as const;
    for (const stage of stages) {
      const { unmount } = render(<StageBadge stage={stage} />);
      expect(screen.getByText(/.+/)).toBeInTheDocument();
      unmount();
    }
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/stage-badge.test.tsx
```

Expected: FAIL — `stage-badge` module does not exist.

**Step 3: Implement the component**

```tsx
// src/components/crm/stage-badge.tsx
/**
 * Badge component for deal pipeline stages.
 * Maps each stage to a ShadCN Badge variant and human-readable label.
 * @module components/crm/stage-badge
 */
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/lib/crm/schemas";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "info"
  | "warning"
  | "tag";

/** Maps deal stage values to display labels and badge variants. */
const stageConfig: Record<Deal["stage"], { label: string; variant: BadgeVariant }> = {
  leads: { label: "Leads", variant: "outline" },
  viewing: { label: "Viewing", variant: "info" },
  offer: { label: "Offer", variant: "tag" },
  negotiation: { label: "Negotiation", variant: "warning" },
  otp: { label: "OTP", variant: "default" },
  completion: { label: "Completion", variant: "success" },
  lost: { label: "Lost", variant: "destructive" },
};

interface StageBadgeProps {
  stage: Deal["stage"];
}

/** Renders a colored badge for a deal pipeline stage. */
export function StageBadge({ stage }: StageBadgeProps) {
  const config = stageConfig[stage] ?? { label: stage, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/stage-badge.test.tsx
```

Expected: PASS — all 5 tests green.

**Step 5: Commit**

```bash
git add src/components/crm/stage-badge.tsx src/components/crm/__tests__/stage-badge.test.tsx
git commit -m "feat(crm): add StageBadge component for deal pipeline stages"
```

---

### Task 5: Task Status Badge Component

**Context:** CRM tasks use binary `open`/`completed` status. Similar to Task 4 but simpler — just two states with distinct colors. Open tasks use an outline badge, completed tasks use success. Keep it as a thin display wrapper with no duplicate formatting logic elsewhere.

**Files:**
- Create: `src/components/crm/task-status-badge.tsx`
- Test: `src/components/crm/__tests__/task-status-badge.test.tsx`
- Reference: `src/lib/crm/schemas.ts:148-151` (crmTaskStatusValues)

**Step 1: Write failing tests**

```tsx
// src/components/crm/__tests__/task-status-badge.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskStatusBadge } from "../task-status-badge";

describe("TaskStatusBadge", () => {
  test("renders open status with outline variant", () => {
    const { container } = render(<TaskStatusBadge status="open" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "outline");
  });

  test("renders completed status with success variant", () => {
    const { container } = render(<TaskStatusBadge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    const badge = container.querySelector("[data-slot='badge']");
    expect(badge).toHaveAttribute("data-variant", "success");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/task-status-badge.test.tsx
```

Expected: FAIL — `task-status-badge` module does not exist.

**Step 3: Implement the component**

```tsx
// src/components/crm/task-status-badge.tsx
/**
 * Badge component for CRM task status (open/completed).
 * @module components/crm/task-status-badge
 */
import { Badge } from "@/components/ui/badge";
import type { CrmTask } from "@/lib/crm/schemas";

type BadgeVariant = "outline" | "success";

const statusConfig: Record<CrmTask["status"], { label: string; variant: BadgeVariant }> = {
  open: { label: "Open", variant: "outline" },
  completed: { label: "Completed", variant: "success" },
};

interface TaskStatusBadgeProps {
  status: CrmTask["status"];
}

/** Renders a colored badge for a CRM task's open/completed status. */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/task-status-badge.test.tsx
```

Expected: PASS — all 2 tests green.

**Step 5: Commit**

```bash
git add src/components/crm/task-status-badge.tsx src/components/crm/__tests__/task-status-badge.test.tsx
git commit -m "feat(crm): add TaskStatusBadge component for open/completed status"
```

---

### Task 6: Deals List Page (Table + Route)

**Context:** The deals list page shows all deals in a TanStack Table with sortable columns, stage badges, linked contact names, and search. Follow the `cases-table.tsx` pattern — `useReactTable()` with `getCoreRowModel()`, `getSortedRowModel()`, column helper, row click navigation. The page lives at `app/(dashboard)/crm/deals/page.tsx`. PR 10 should have created the CRM section layout; this adds the deals sub-route.

**Files:**
- Create: `src/components/crm/deals-table.tsx`
- Create: `app/(dashboard)/crm/deals/page.tsx`
- Test: `src/components/crm/__tests__/deals-table.test.tsx`
- Reference: `src/components/cases/cases-table.tsx` (TanStack Table pattern)
- Reference: `app/(dashboard)/cases/page.tsx` (page layout pattern)
- Depends: `src/hooks/use-deals.ts` (Task 1), `src/components/crm/stage-badge.tsx` (Task 4)

**Step 1: Write failing tests for DealsTable component**

```tsx
// src/components/crm/__tests__/deals-table.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DealsTable } from "../deals-table";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockDeals = [
  {
    deal_id: "d1",
    client_id: "c1",
    address: "123 Oak Street",
    stage: "viewing" as const,
    price: 1500000,
    contact_id: "ct1",
    notes: "Nice unit",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    contacts: { first_name: "John", last_name: "Smith" },
  },
  {
    deal_id: "d2",
    client_id: "c1",
    address: "456 Elm Ave",
    stage: "lost" as const,
    price: null,
    contact_id: null,
    notes: null,
    created_at: "2026-02-28T00:00:00Z",
    updated_at: "2026-02-28T00:00:00Z",
    contacts: null,
  },
];

describe("DealsTable", () => {
  test("renders table headers", () => {
    render(<DealsTable deals={mockDeals} />);

    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText("Stage")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  test("renders deal rows with correct data", () => {
    render(<DealsTable deals={mockDeals} />);

    expect(screen.getByText("123 Oak Street")).toBeInTheDocument();
    expect(screen.getByText("456 Elm Ave")).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  test("formats price with dollar sign and commas", () => {
    render(<DealsTable deals={mockDeals} />);

    expect(screen.getByText("SGD 1,500,000")).toBeInTheDocument();
  });

  test("shows em-dash for null price", () => {
    render(<DealsTable deals={mockDeals} />);

    // The second deal has null price — should show em-dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  test("shows em-dash for null contact", () => {
    render(<DealsTable deals={mockDeals} />);

    // Second deal has no linked contact
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  test("renders empty state when no deals", () => {
    render(<DealsTable deals={[]} />);

    // Table should render but with no body rows
    const rows = screen.queryAllByRole("row");
    // Only header row
    expect(rows.length).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/deals-table.test.tsx
```

Expected: FAIL — `deals-table` module does not exist.

**Step 3: Implement the DealsTable component**

```tsx
// src/components/crm/deals-table.tsx
/**
 * Deals table component using TanStack Table.
 * Displays deals with sortable columns, stage badges, and contact names.
 * Follows the same pattern as cases-table.tsx.
 * @module components/crm/deals-table
 */
'use client';

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { StageBadge } from "@/components/crm/stage-badge";
import type { DealWithContact } from "@/hooks/use-deals";

const columnHelper = createColumnHelper<DealWithContact>();

/**
 * Formats a number as a dollar amount with commas.
 * Returns em-dash for null/undefined values.
 */
function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Formats a date string to "2 Mar 2026" format.
 * Returns em-dash for null values.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface DealsTableProps {
  deals: DealWithContact[];
}

/** Renders a sortable table of deals with stage badges and linked contacts. */
export function DealsTable({ deals }: DealsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, dealId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }
    router.push(`/crm/deals/${dealId}`);
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "index",
        header: "#",
        size: 40,
        cell: ({ row, table }) => {
          const visualIndex =
            table.getRowModel().rows.findIndex((r) => r.id === row.id) + 1;
          return (
            <span className="text-muted-foreground/70 tabular-nums">
              {visualIndex}
            </span>
          );
        },
      }),
      columnHelper.accessor("address", {
        header: "Address",
        size: 220,
        cell: (info) => (
          <Link
            href={`/crm/deals/${info.row.original.deal_id}`}
            className="text-left hover:underline font-medium"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("stage", {
        header: "Stage",
        size: 120,
        cell: (info) => <StageBadge stage={info.getValue()} />,
      }),
      columnHelper.accessor("price", {
        header: "Price",
        size: 130,
        cell: (info) => (
          <span className="tabular-nums">{formatPrice(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("contacts", {
        id: "contact",
        header: "Contact",
        size: 160,
        cell: (info) => {
          const contact = info.getValue();
          if (!contact) {
            return <span className="text-muted-foreground">—</span>;
          }
          return `${contact.first_name} ${contact.last_name}`;
        },
        enableSorting: false,
      }),
      columnHelper.accessor("updated_at", {
        header: "Updated",
        size: 120,
        cell: (info) => (
          <span className="whitespace-nowrap">{formatDate(info.getValue())}</span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data: deals,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 md:px-5 py-3 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
                  style={{
                    width: header.getSize() !== 150 ? header.getSize() : undefined,
                  }}
                >
                  <div
                    className="flex items-center gap-1 cursor-pointer hover:text-foreground/80 whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? null}
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
              onMouseEnter={() =>
                router.prefetch(`/crm/deals/${row.original.deal_id}`)
              }
              onClick={(event) => handleRowClick(event, row.original.deal_id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 md:px-5 py-3 md:py-4 text-[13px] text-foreground/80"
                >
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
npx vitest run src/components/crm/__tests__/deals-table.test.tsx
```

Expected: PASS — all 6 tests green.

**Step 5: Create the deals list page**

```tsx
// app/(dashboard)/crm/deals/page.tsx
/**
 * Deals list page — read-only table of all deals in the CRM.
 * @module app/(dashboard)/crm/deals/page
 */
'use client';

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { DealsTable } from "@/components/crm/deals-table";
import { useDeals } from "@/hooks/use-deals";
import { Search, Handshake } from "lucide-react";

export default function DealsPage() {
  const [search, setSearch] = useState("");
  const { data: deals = [], isLoading } = useDeals({ search });

  return (
    <div className="px-4 py-6 md:px-12 md:py-10 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Deals</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse your deal pipeline. Deals are created and updated by the agent via chat.
        </p>
      </div>

      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          placeholder="Search deals by address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
        />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 md:p-20 text-center shadow-sm">
            <Handshake className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {search ? "No deals match your search" : "No deals yet"}
            </p>
            {!search && (
              <p className="mt-2 text-sm text-muted-foreground/60">
                Ask the agent to create a deal in chat
              </p>
            )}
          </div>
        ) : (
          <DealsTable deals={deals} />
        )}
      </div>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/crm/deals-table.tsx src/components/crm/__tests__/deals-table.test.tsx app/\(dashboard\)/crm/deals/page.tsx
git commit -m "feat(crm): add deals list page with TanStack Table and stage badges"
```

---

### Task 7: Deal Detail Page

**Context:** The deal detail page shows read-only deal information, linked contact card, and interaction timeline. Follow the `cases/[caseId]/page.tsx` pattern — breadcrumb nav, header, tabbed or sectioned layout. No editing in v1 — this is read-only. Interactions are fetched via `useDealInteractions()` from Task 3. Contact info comes from the deal's joined `contacts` relation.

**Files:**
- Create: `app/(dashboard)/crm/deals/[dealId]/page.tsx`
- Create: `src/components/crm/interaction-timeline.tsx`
- Test: `src/components/crm/__tests__/interaction-timeline.test.tsx`
- Reference: `app/(dashboard)/cases/[caseId]/page.tsx` (detail page pattern)
- Depends: `src/hooks/use-deals.ts` (Task 1), `src/hooks/use-contact-relations.ts` (Task 3)

**Step 1: Write failing tests for InteractionTimeline component**

```tsx
// src/components/crm/__tests__/interaction-timeline.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { InteractionTimeline } from "../interaction-timeline";

const mockInteractions = [
  {
    interaction_id: "i1",
    client_id: "c1",
    contact_id: "ct1",
    deal_id: "d1",
    type: "call" as const,
    summary: "Discussed pricing and timeline",
    occurred_at: "2026-03-01T14:30:00Z",
    created_at: "2026-03-01T14:30:00Z",
    updated_at: "2026-03-01T14:30:00Z",
    contacts: { first_name: "John", last_name: "Smith" },
  },
  {
    interaction_id: "i2",
    client_id: "c1",
    contact_id: "ct1",
    deal_id: "d1",
    type: "viewing" as const,
    summary: "Property viewing at 123 Oak St",
    occurred_at: "2026-02-28T10:00:00Z",
    created_at: "2026-02-28T10:00:00Z",
    updated_at: "2026-02-28T10:00:00Z",
    contacts: { first_name: "John", last_name: "Smith" },
  },
];

describe("InteractionTimeline", () => {
  test("renders interaction summaries", () => {
    render(<InteractionTimeline interactions={mockInteractions} />);

    expect(screen.getByText("Discussed pricing and timeline")).toBeInTheDocument();
    expect(screen.getByText("Property viewing at 123 Oak St")).toBeInTheDocument();
  });

  test("renders interaction types as labels", () => {
    render(<InteractionTimeline interactions={mockInteractions} />);

    expect(screen.getByText("Call")).toBeInTheDocument();
    expect(screen.getByText("Viewing")).toBeInTheDocument();
  });

  test("renders contact names", () => {
    render(<InteractionTimeline interactions={mockInteractions} />);

    const names = screen.getAllByText("John Smith");
    expect(names.length).toBeGreaterThan(0);
  });

  test("shows empty state when no interactions", () => {
    render(<InteractionTimeline interactions={[]} />);

    expect(screen.getByText("No interactions yet")).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/interaction-timeline.test.tsx
```

Expected: FAIL — `interaction-timeline` module does not exist.

**Step 3: Implement InteractionTimeline component**

```tsx
// src/components/crm/interaction-timeline.tsx
/**
 * Chronological timeline of interactions (calls, meetings, viewings, etc.).
 * Used on both deal detail and contact detail pages.
 * @module components/crm/interaction-timeline
 */
import {
  Phone,
  Users,
  Mail,
  MessageSquare,
  Eye,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Interaction } from "@/lib/crm/schemas";

/** Maps interaction type to an icon and human-readable label. */
const typeConfig: Record<string, { icon: LucideIcon; label: string }> = {
  call: { icon: Phone, label: "Call" },
  meeting: { icon: Users, label: "Meeting" },
  email: { icon: Mail, label: "Email" },
  message: { icon: MessageSquare, label: "Message" },
  viewing: { icon: Eye, label: "Viewing" },
  note: { icon: StickyNote, label: "Note" },
};

/** Formats a timestamp to "1 Mar 2026, 2:30 PM" format. */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface InteractionTimelineProps {
  interactions: Array<
    Interaction & { contacts: { first_name: string; last_name: string } | null }
  >;
}

/** Renders a vertical timeline of interactions sorted by occurred_at. */
export function InteractionTimeline({ interactions }: InteractionTimelineProps) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No interactions yet</p>
    );
  }

  return (
    <div className="space-y-4">
      {interactions.map((interaction) => {
        const config = typeConfig[interaction.type] ?? {
          icon: StickyNote,
          label: interaction.type,
        };
        const Icon = config.icon;
        const contactName = interaction.contacts
          ? `${interaction.contacts.first_name} ${interaction.contacts.last_name}`
          : null;

        return (
          <div
            key={interaction.interaction_id}
            className="flex gap-3 rounded-lg border border-border/30 bg-card p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/50">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {config.label}
                </Badge>
                {contactName && (
                  <span className="text-xs text-muted-foreground">
                    {contactName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground/60 ml-auto whitespace-nowrap">
                  {formatDateTime(interaction.occurred_at)}
                </span>
              </div>
              {interaction.summary && (
                <p className="mt-1.5 text-sm text-foreground/80">
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

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/crm/__tests__/interaction-timeline.test.tsx
```

Expected: PASS — all 4 tests green.

**Step 5: Create the deal detail page**

```tsx
// app/(dashboard)/crm/deals/[dealId]/page.tsx
/**
 * Deal detail page — read-only view of deal fields, linked contact, and interactions.
 * @module app/(dashboard)/crm/deals/[dealId]/page
 */
'use client';

import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeal } from "@/hooks/use-deals";
import { useDealInteractions } from "@/hooks/use-contact-relations";
import { StageBadge } from "@/components/crm/stage-badge";
import { InteractionTimeline } from "@/components/crm/interaction-timeline";
import { User, DollarSign, StickyNote } from "lucide-react";

/** Formats a number as a dollar amount with commas. */
function formatPrice(price: number | null): string {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(price);
}

/** Formats a date string to "2 Mar 2026" format. */
function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DealDetailPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = params?.dealId ?? "";
  const { data: deal, isError, isLoading } = useDeal(dealId);
  const { data: interactions = [] } = useDealInteractions(dealId);

  if (!dealId) return null;

  if (!isLoading && (isError || !deal)) {
    return (
      <div className="px-4 py-6 md:px-12 md:py-10 text-center">
        <p className="text-destructive">Deal not found</p>
        <Link href="/crm/deals" className="mt-4 inline-block text-primary hover:underline">
          Back to Deals
        </Link>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex h-full animate-pulse flex-col">
        <div className="px-4 md:px-12 py-6 md:py-10">
          <div className="mb-1 h-3 w-32 rounded bg-muted/40" />
          <div className="mt-2 h-7 w-64 rounded bg-muted" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-20 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const contactName = deal.contacts
    ? `${deal.contacts.first_name} ${deal.contacts.last_name}`
    : null;

  return (
    <div className="px-4 py-6 md:px-12 md:py-10 overflow-auto">
      {/* Breadcrumb */}
      <nav className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
        <Link
          href="/crm/deals"
          className="hover:text-foreground transition-colors"
        >
          Deals
        </Link>
        <span className="font-light text-muted-foreground/30">/</span>
        <span className="font-semibold text-foreground/70 truncate max-w-xs">
          {deal.address}
        </span>
      </nav>

      {/* Header */}
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {deal.address}
        </h1>
        <StageBadge stage={deal.stage} />
      </div>

      {/* Detail cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider">
            <DollarSign className="h-3.5 w-3.5" />
            Price
          </div>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {formatPrice(deal.price)}
          </p>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider">
            <User className="h-3.5 w-3.5" />
            Contact
          </div>
          <p className="mt-2 text-lg font-semibold">
            {contactName ?? (
              <span className="text-muted-foreground font-normal">None</span>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider">
            Created
          </div>
          <p className="mt-2 text-sm">{formatDate(deal.created_at)}</p>
        </div>

        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider">
            Updated
          </div>
          <p className="mt-2 text-sm">{formatDate(deal.updated_at)}</p>
        </div>
      </div>

      {/* Notes */}
      {deal.notes && (
        <div className="mt-6 rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 uppercase tracking-wider mb-2">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </div>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {deal.notes}
          </p>
        </div>
      )}

      {/* Interaction timeline */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Interactions
        </h2>
        <InteractionTimeline interactions={interactions} />
      </div>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/crm/interaction-timeline.tsx src/components/crm/__tests__/interaction-timeline.test.tsx app/\(dashboard\)/crm/deals/\[dealId\]/page.tsx
git commit -m "feat(crm): add deal detail page with interaction timeline"
```

---

### Task 8: Tasks List Page

**Context:** The Tasks page lives at `/tasks` under the AGENT nav section (UX-02). In v1 it shows CRM tasks only in a table view (the full board view with agent tasks comes in PR 36). Columns: title, status badge, due date, linked contact name, linked deal address. Replace the existing "Coming soon" placeholder at `app/(dashboard)/tasks/page.tsx`.

**Files:**
- Create: `src/components/crm/crm-tasks-table.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx` (replace placeholder)
- Test: `src/components/crm/__tests__/crm-tasks-table.test.tsx`
- Depends: `src/hooks/use-crm-tasks.ts` (Task 2), `src/components/crm/task-status-badge.tsx` (Task 5)

**Step 1: Write failing tests for CrmTasksTable component**

```tsx
// src/components/crm/__tests__/crm-tasks-table.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrmTasksTable } from "../crm-tasks-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

const mockTasks = [
  {
    task_id: "t1",
    client_id: "c1",
    title: "Follow up with John about viewing",
    description: "He wants to see 123 Oak St",
    status: "open" as const,
    due_date: "2026-03-05T00:00:00Z",
    contact_id: "ct1",
    deal_id: "d1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    contacts: { first_name: "John", last_name: "Smith" },
    deals: { address: "123 Oak St" },
  },
  {
    task_id: "t2",
    client_id: "c1",
    title: "Send OTP documents",
    description: null,
    status: "completed" as const,
    due_date: null,
    contact_id: null,
    deal_id: null,
    created_at: "2026-02-28T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    contacts: null,
    deals: null,
  },
];

describe("CrmTasksTable", () => {
  test("renders table headers", () => {
    render(<CrmTasksTable tasks={mockTasks} />);

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Due Date")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Deal")).toBeInTheDocument();
  });

  test("renders task rows with correct data", () => {
    render(<CrmTasksTable tasks={mockTasks} />);

    expect(screen.getByText("Follow up with John about viewing")).toBeInTheDocument();
    expect(screen.getByText("Send OTP documents")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("123 Oak St")).toBeInTheDocument();
  });

  test("shows em-dash for null due date", () => {
    render(<CrmTasksTable tasks={mockTasks} />);

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  test("shows em-dash for null contact and deal", () => {
    render(<CrmTasksTable tasks={mockTasks} />);

    // Second task has no contact or deal
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  test("renders empty state when no tasks", () => {
    render(<CrmTasksTable tasks={[]} />);

    const rows = screen.queryAllByRole("row");
    expect(rows.length).toBe(1); // header row only
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/crm/__tests__/crm-tasks-table.test.tsx
```

Expected: FAIL — `crm-tasks-table` module does not exist.

**Step 3: Implement CrmTasksTable component**

```tsx
// src/components/crm/crm-tasks-table.tsx
/**
 * CRM tasks table component using TanStack Table.
 * Shows task title, status badge, due date, linked contact, and linked deal.
 * @module components/crm/crm-tasks-table
 */
'use client';

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { TaskStatusBadge } from "@/components/crm/task-status-badge";
import type { CrmTaskWithRelations } from "@/hooks/use-crm-tasks";

const columnHelper = createColumnHelper<CrmTaskWithRelations>();

/**
 * Formats a date string to "5 Mar 2026" format.
 * Returns em-dash for null values.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Checks if a due date is overdue (before today) and the task is still open.
 */
function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "completed") return false;
  return new Date(dueDate) < new Date();
}

interface CrmTasksTableProps {
  tasks: CrmTaskWithRelations[];
}

/** Renders a sortable table of CRM tasks with status badges and linked entities. */
export function CrmTasksTable({ tasks }: CrmTasksTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "due_date", desc: false },
  ]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "index",
        header: "#",
        size: 40,
        cell: ({ row, table }) => {
          const visualIndex =
            table.getRowModel().rows.findIndex((r) => r.id === row.id) + 1;
          return (
            <span className="text-muted-foreground/70 tabular-nums">
              {visualIndex}
            </span>
          );
        },
      }),
      columnHelper.accessor("title", {
        header: "Title",
        size: 280,
        cell: (info) => (
          <span className="font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        size: 110,
        cell: (info) => <TaskStatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("due_date", {
        header: "Due Date",
        size: 120,
        cell: (info) => {
          const dueDate = info.getValue();
          const overdue = isOverdue(dueDate, info.row.original.status);
          return (
            <span
              className={`whitespace-nowrap ${overdue ? "text-destructive font-medium" : ""}`}
            >
              {formatDate(dueDate)}
            </span>
          );
        },
      }),
      columnHelper.accessor("contacts", {
        id: "contact",
        header: "Contact",
        size: 150,
        cell: (info) => {
          const contact = info.getValue();
          if (!contact) {
            return <span className="text-muted-foreground">—</span>;
          }
          return `${contact.first_name} ${contact.last_name}`;
        },
        enableSorting: false,
      }),
      columnHelper.accessor("deals", {
        id: "deal",
        header: "Deal",
        size: 180,
        cell: (info) => {
          const deal = info.getValue();
          if (!deal) {
            return <span className="text-muted-foreground">—</span>;
          }
          return deal.address;
        },
        enableSorting: false,
      }),
    ],
    []
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 md:px-5 py-3 md:py-4 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70"
                  style={{
                    width: header.getSize() !== 150 ? header.getSize() : undefined,
                  }}
                >
                  <div
                    className="flex items-center gap-1 cursor-pointer hover:text-foreground/80 whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[header.column.getIsSorted() as string] ?? null}
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
              className="border-t border-border/30 hover:bg-muted/40 transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-3 md:px-5 py-3 md:py-4 text-[13px] text-foreground/80"
                >
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
npx vitest run src/components/crm/__tests__/crm-tasks-table.test.tsx
```

Expected: PASS — all 5 tests green.

**Step 5: Replace the Tasks placeholder page**

```tsx
// app/(dashboard)/tasks/page.tsx
/**
 * Tasks list page — shows CRM tasks in a table with status, due dates, and links.
 * v1: CRM tasks only. Agent tasks + board view added in PR 19a/36.
 * @module app/(dashboard)/tasks/page
 */
'use client';

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { CrmTasksTable } from "@/components/crm/crm-tasks-table";
import { useCrmTasks } from "@/hooks/use-crm-tasks";
import { Search, CheckSquare } from "lucide-react";

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const { data: tasks = [], isLoading } = useCrmTasks({ search });

  return (
    <div className="px-4 py-6 md:px-12 md:py-10 overflow-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Follow-ups, reminders, and to-dos created by the agent.
        </p>
      </div>

      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
        />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 md:p-20 text-center shadow-sm">
            <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {search ? "No tasks match your search" : "No tasks yet"}
            </p>
            {!search && (
              <p className="mt-2 text-sm text-muted-foreground/60">
                Ask the agent to create tasks in chat
              </p>
            )}
          </div>
        ) : (
          <CrmTasksTable tasks={tasks} />
        )}
      </div>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/crm/crm-tasks-table.tsx src/components/crm/__tests__/crm-tasks-table.test.tsx app/\(dashboard\)/tasks/page.tsx
git commit -m "feat(crm): add tasks list page with CRM tasks table and status badges"
```

---

### Task 9: Update CRM Layout Tabs + Verify Routes

**Context:** PR 10 creates the CRM section layout with a Contacts tab. This task adds a "Deals" tab to the CRM layout so users can navigate between contacts and deals. Then verify all new routes work end-to-end. Also update the sidebar active state detection for the new `/crm/deals` sub-route.

**Note:** If PR 10 uses a different CRM layout approach (e.g., no tabs, or a different route structure), adapt this task accordingly. The key deliverable is that navigating to CRM shows both Contacts and Deals, and Tasks is accessible from the sidebar.

**Files:**
- Modify: `app/(dashboard)/crm/layout.tsx` (add Deals tab — created by PR 10)
- Reference: `src/components/layout/app-sidebar.tsx:52-66` (nav items — CRM active state)

**Step 1: Add Deals tab to CRM layout**

The CRM layout created by PR 10 should have a tab structure. Add a "Deals" tab linking to `/crm/deals`. Example modification (adapt to PR 10's actual implementation):

```tsx
// In app/(dashboard)/crm/layout.tsx — add to the tab list:
<TabsTrigger value="deals" asChild>
  <Link href="/crm/deals">Deals</Link>
</TabsTrigger>
```

If PR 10 uses a sub-nav component instead of Tabs, add the link there instead.

**Step 2: Verify sidebar active state**

Check that navigating to `/crm/deals` still highlights the "CRM" item in the sidebar. The current implementation in `app-sidebar.tsx:104-107` uses `pathname.startsWith(item.href)`, and CRM's href is `/crm`, so `/crm/deals` should already match. Verify this works.

**Step 3: Verify all routes manually**

Run the dev server and verify:

```bash
npm run dev
```

1. Navigate to `/crm/deals` — should show deals table (empty or with seed data)
2. Search for a deal — search should filter results
3. Click a deal row — should navigate to `/crm/deals/[dealId]`
4. Deal detail shows breadcrumb, stage badge, price, contact, notes, interactions
5. Navigate to `/tasks` — should show tasks table (no longer "Coming soon")
6. Search for a task — search should filter results
7. Sidebar: CRM is highlighted when on `/crm/deals`, Tasks is highlighted when on `/tasks`

**Step 4: Run targeted PR11 tests + type-check**

```bash
npx vitest run src/hooks/__tests__/use-deals.test.ts src/hooks/__tests__/use-crm-tasks.test.ts src/hooks/__tests__/use-contact-relations.test.tsx src/components/crm/__tests__/ app/\(dashboard\)/crm/deals app/\(dashboard\)/tasks
npx tsc --noEmit
```

Expected: PR11-targeted tests and type-check pass. Run full `vitest` once concurrent PR churn stabilizes.

**Step 5: Commit**

```bash
git add app/\(dashboard\)/crm/layout.tsx
git commit -m "feat(crm): wire deals tab into crm layout and verify routes"
```

---

## Relevant Files

### Created
- `src/hooks/use-deals.ts` — TanStack Query hooks for deals
- `src/hooks/__tests__/use-deals.test.ts` — Tests
- `src/hooks/use-crm-tasks.ts` — TanStack Query hooks for CRM tasks
- `src/hooks/__tests__/use-crm-tasks.test.ts` — Tests
- `src/hooks/__tests__/use-contact-relations.test.tsx` — Extended tests for deal interaction hooks
- `src/components/crm/stage-badge.tsx` — Deal stage badge
- `src/components/crm/__tests__/stage-badge.test.tsx` — Tests
- `src/components/crm/task-status-badge.tsx` — Task status badge
- `src/components/crm/__tests__/task-status-badge.test.tsx` — Tests
- `src/components/crm/deals-table.tsx` — Deals TanStack Table
- `src/components/crm/__tests__/deals-table.test.tsx` — Tests
- `src/components/crm/interaction-timeline.tsx` — Interaction timeline
- `src/components/crm/__tests__/interaction-timeline.test.tsx` — Tests
- `src/components/crm/crm-tasks-table.tsx` — CRM tasks TanStack Table
- `src/components/crm/__tests__/crm-tasks-table.test.tsx` — Tests
- `app/(dashboard)/crm/deals/page.tsx` — Deals list page
- `app/(dashboard)/crm/deals/[dealId]/page.tsx` — Deal detail page

### Modified
- `app/(dashboard)/tasks/page.tsx` — Replaced "Coming soon" placeholder
- `app/(dashboard)/crm/layout.tsx` — Added Deals tab (depends on PR 10's structure)
- `src/hooks/use-contact-relations.ts` — Added deal-scoped interaction hook/query keys

### Reference (read-only)
- `src/hooks/use-cases.ts` — Pattern for query key factory + hooks
- `src/components/cases/cases-table.tsx` — Pattern for TanStack Table component
- `app/(dashboard)/cases/page.tsx` — Pattern for list page layout
- `app/(dashboard)/cases/[caseId]/page.tsx` — Pattern for detail page layout
- `src/components/ui/badge.tsx` — Badge component with variant support
- `src/lib/crm/schemas.ts` — Zod schemas, type exports, enum values
- `src/types/database.ts` — Supabase generated types
- `src/components/layout/app-sidebar.tsx` — Navigation structure
- `vitest.config.ts` — Test configuration
- `src/test/setup.ts` — Test setup (jest-dom, ResizeObserver mock)
