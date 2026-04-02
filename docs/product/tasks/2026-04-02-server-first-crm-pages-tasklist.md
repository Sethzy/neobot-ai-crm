# Server-First CRM Dashboard Pages Implementation Plan

**PR:** Out-of-plan — production hardening (perceived performance)
**Decisions:** FOUND-05 (App Router + TanStack Query)
**Goal:** Convert `"use client"` CRM list pages to the Server Component + HydrationBoundary pattern so the first paint includes data instead of an empty shell.

**Architecture:** TanStack Query v5 has first-class support for server-side prefetching via `queryClient.prefetchQuery()` + `dehydrate()` + `<HydrationBoundary>`. The pattern is:

1. `page.tsx` becomes an **async Server Component** that creates a `QueryClient`, prefetches the initial query using the server-side Supabase client, dehydrates the cache, and wraps the existing client component in `<HydrationBoundary>`.
2. The existing page logic moves to a **Client Component** file (e.g., `deals-page-client.tsx`) unchanged — TanStack Query hydrates the prefetched data into the cache, so `useQuery` resolves instantly on first render (no loading spinner).
3. Client-side interactivity (filters, pagination, search, mutations, realtime) continues working exactly as before.

This requires:
- A shared `getQueryClient()` utility (server-safe singleton)
- Server-side fetch functions that use `createClient()` (from `@/lib/supabase/server`) instead of the browser `supabase` singleton
- One `page.tsx` + one `*-page-client.tsx` per page

**Scope:** 3 CRM list pages (deals, people, companies). The cases/documents page is excluded — it uses a different data pattern and is lower traffic.

**Tech Stack:** TanStack Query v5 (`dehydrate`, `HydrationBoundary`), `@supabase/ssr` (`createClient`), Next.js 15 App Router Server Components, Vitest

---

## Relevant Files

### Shared infrastructure (create)
- `src/lib/query-client.ts` — server-safe `getQueryClient()` singleton

### Deals (modify + create)
- Modify: `src/hooks/use-deals.ts` — add server-side fetch that accepts a Supabase client
- Create: `app/(dashboard)/customers/deals/deals-page-client.tsx` — move existing page logic here
- Modify: `app/(dashboard)/customers/deals/page.tsx` — convert to Server Component wrapper
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx` — update imports

### People (modify + create)
- Modify: `src/hooks/use-contacts.ts` — add server-side fetch that accepts a Supabase client
- Create: `app/(dashboard)/customers/people/people-page-client.tsx` — move existing page logic here
- Modify: `app/(dashboard)/customers/people/page.tsx` — convert to Server Component wrapper
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx` — update imports

### Companies (modify + create)
- Modify: `src/hooks/use-companies.ts` — add server-side fetch that accepts a Supabase client
- Create: `app/(dashboard)/customers/companies/companies-page-client.tsx` — move existing page logic here
- Modify: `app/(dashboard)/customers/companies/page.tsx` — convert to Server Component wrapper
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx` — update imports

---

## Task 1: Create the shared `getQueryClient()` utility

The TanStack Query docs require a `getQueryClient()` function that returns a new `QueryClient` on the server (one per request) and a singleton on the browser. This prevents cross-request data leaks on the server. The existing `app/providers.tsx` creates the client inside `useState` — that's the browser singleton and stays as-is.

**Files:**
- Create: `src/lib/query-client.ts`
- Create: `src/lib/__tests__/query-client.test.ts`

**Step 1: Write the failing test**

```typescript
/**
 * Tests for the server-safe QueryClient factory.
 * @module lib/__tests__/query-client.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

describe("getQueryClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a QueryClient instance", async () => {
    const { getQueryClient } = await import("../query-client");
    const client = getQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
  });

  it("returns the same instance on repeated browser calls", async () => {
    const { getQueryClient } = await import("../query-client");
    const a = getQueryClient();
    const b = getQueryClient();
    expect(a).toBe(b);
  });

  it("configures staleTime on queries", async () => {
    const { getQueryClient } = await import("../query-client");
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBeGreaterThan(0);
  });

  it("configures dehydrate to include pending queries", async () => {
    const { getQueryClient } = await import("../query-client");
    const client = getQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.dehydrate?.shouldDehydrateQuery).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm vitest run src/lib/__tests__/query-client.test.ts
```

Expected: FAIL — module `../query-client` does not exist.

**Step 3: Write minimal implementation**

```typescript
/**
 * Server-safe QueryClient factory for TanStack Query SSR.
 *
 * On the server: returns a fresh QueryClient per call (one per request).
 * On the browser: returns a singleton (same instance for the React tree).
 *
 * Used by Server Component pages for prefetching via dehydrate/HydrationBoundary.
 * The browser-side `app/providers.tsx` continues to use its own useState-based client.
 *
 * @module lib/query-client
 */
import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    return makeQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm vitest run src/lib/__tests__/query-client.test.ts
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/query-client.ts src/lib/__tests__/query-client.test.ts
git commit -m "feat(ssr): add server-safe getQueryClient() for TanStack Query prefetching

Creates a QueryClient factory that returns a fresh client per server request
and a singleton on the browser. Configures dehydrate to include pending
queries for streaming SSR support. Used by Server Component page wrappers."
```

---

## Task 2: Add server-side fetch functions to deals hook

The existing `fetchPaginatedDeals` in `use-deals.ts` imports the browser `supabase` singleton. We need a parallel function that accepts a Supabase server client as a parameter so the Server Component can call it.

**Files:**
- Modify: `src/hooks/use-deals.ts`
- Create: `src/hooks/__tests__/use-deals-server-fetch.test.ts`

**Step 6: Write the failing test**

```typescript
/**
 * Tests for the server-compatible deals fetch function.
 * @module hooks/__tests__/use-deals-server-fetch.test
 */
import { describe, it, expect, vi } from "vitest";

describe("fetchPaginatedDealsWithClient", () => {
  it("calls the provided supabase client instead of the browser singleton", async () => {
    const { fetchPaginatedDealsWithClient } = await import("../use-deals");

    const mockData = [
      {
        deal_id: "deal-1",
        address: "123 Test St",
        stage: "leads",
        amount: 100000,
        deal_contacts: [],
        companies: null,
      },
    ];

    const mockRange = vi.fn().mockResolvedValue({
      data: mockData,
      count: 1,
      error: null,
    });

    const mockOrder = vi.fn(() => ({ range: mockRange }));
    const mockSelect = vi.fn(() => ({ order: mockOrder }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    const fakeClient = { from: mockFrom } as never;

    const result = await fetchPaginatedDealsWithClient(fakeClient, {
      page: 1,
      pageSize: 20,
    });

    expect(mockFrom).toHaveBeenCalledWith("deals");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].deal_id).toBe("deal-1");
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });
});
```

**Step 7: Run test to verify it fails**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-deals-server-fetch.test.ts
```

Expected: FAIL — `fetchPaginatedDealsWithClient` is not exported from `use-deals`.

**Step 8: Add the server-compatible fetch function**

In `src/hooks/use-deals.ts`, add a new exported function near the existing `fetchPaginatedDeals`. It mirrors the same logic but accepts a Supabase client parameter instead of importing the browser singleton.

Add before the `export { fetchDeals, fetchDeal, fetchPaginatedDeals };` line (line 267):

```typescript
/**
 * Server-compatible paginated deals fetch.
 * Accepts a Supabase client (from createClient on the server) instead of
 * the browser singleton, so it can be used in Server Components for SSR prefetching.
 */
export async function fetchPaginatedDealsWithClient(
  client: Pick<typeof supabase, "from">,
  filters: PaginatedDealFilters,
): Promise<PaginatedDealsResult> {
  const { search, stage, createdAt, page = 1, pageSize = 20 } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = client
    .from("deals")
    .select(
      "*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name)), companies!deals_company_id_fkey(company_id, name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyDealFilters(query, { search, stage, createdAt });

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const total = count ?? 0;

  return {
    rows: (data ?? []) as DealWithContact[],
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
}
```

And update the export line:

```typescript
export { fetchDeals, fetchDeal, fetchPaginatedDeals, fetchPaginatedDealsWithClient };
```

**Step 9: Run test to verify it passes**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-deals-server-fetch.test.ts
```

Expected: PASS

**Step 10: Commit**

```bash
git add src/hooks/use-deals.ts src/hooks/__tests__/use-deals-server-fetch.test.ts
git commit -m "feat(deals): add server-compatible fetchPaginatedDealsWithClient

Mirrors fetchPaginatedDeals but accepts a Supabase client parameter for
Server Component prefetching. The browser hooks continue using the singleton."
```

---

## Task 3: Add server-side fetch functions to contacts hook

Same pattern as deals — add a `fetchPaginatedContactsWithClient` that accepts a Supabase client.

**Files:**
- Modify: `src/hooks/use-contacts.ts`
- Create: `src/hooks/__tests__/use-contacts-server-fetch.test.ts`

**Step 11: Write the failing test**

```typescript
/**
 * Tests for the server-compatible contacts fetch function.
 * @module hooks/__tests__/use-contacts-server-fetch.test
 */
import { describe, it, expect, vi } from "vitest";

describe("fetchPaginatedContactsWithClient", () => {
  it("calls the provided supabase client instead of the browser singleton", async () => {
    const { fetchPaginatedContactsWithClient } = await import("../use-contacts");

    const mockData = [
      {
        contact_id: "contact-1",
        first_name: "Sarah",
        last_name: "Chen",
        email: "sarah@example.com",
        phone: null,
        type: "buyer",
        companies: null,
      },
    ];

    const mockRange = vi.fn().mockResolvedValue({
      data: mockData,
      count: 1,
      error: null,
    });

    const mockOrder = vi.fn(() => ({ range: mockRange }));
    const mockSelect = vi.fn(() => ({ order: mockOrder }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    const fakeClient = { from: mockFrom } as never;

    const result = await fetchPaginatedContactsWithClient(fakeClient, {
      page: 1,
      pageSize: 20,
    });

    expect(mockFrom).toHaveBeenCalledWith("contacts");
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
```

**Step 12: Run test to verify it fails**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-contacts-server-fetch.test.ts
```

Expected: FAIL — `fetchPaginatedContactsWithClient` not exported.

**Step 13: Add the server-compatible fetch function**

In `src/hooks/use-contacts.ts`, add before the final `export { fetchPaginatedContacts };` line:

```typescript
/**
 * Server-compatible paginated contacts fetch.
 * Accepts a Supabase client parameter for Server Component prefetching.
 */
export async function fetchPaginatedContactsWithClient(
  client: Pick<typeof supabase, "from">,
  filters: PaginatedContactFilters,
): Promise<PaginatedContactsResult> {
  const { search, type, hasEmail, hasPhone, createdAt, page = 1, pageSize = 20 } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = client
    .from("contacts")
    .select("*, companies!contacts_company_id_fkey(company_id, name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    query = query.or(buildSearchExpression(search, ["first_name", "last_name", "email", "phone"]));
  }

  if (type) {
    query = query.eq("type", type);
  }

  if (hasEmail === true) {
    query = query.not("email", "is", null);
  }

  if (hasEmail === false) {
    query = query.is("email", null);
  }

  if (hasPhone === true) {
    query = query.not("phone", "is", null);
  }

  if (hasPhone === false) {
    query = query.is("phone", null);
  }

  if (createdAt?.from) {
    query = query.gte("created_at", createdAt.from);
  }

  if (createdAt?.to) {
    query = query.lte("created_at", createdAt.to);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const total = count ?? 0;

  return {
    rows: (data ?? []) as ContactWithCompany[],
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
}
```

Update the export line:

```typescript
export { fetchPaginatedContacts, fetchPaginatedContactsWithClient };
```

**Step 14: Run test to verify it passes**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-contacts-server-fetch.test.ts
```

Expected: PASS

**Step 15: Commit**

```bash
git add src/hooks/use-contacts.ts src/hooks/__tests__/use-contacts-server-fetch.test.ts
git commit -m "feat(contacts): add server-compatible fetchPaginatedContactsWithClient

Mirrors fetchPaginatedContacts but accepts a Supabase client parameter for
Server Component prefetching."
```

---

## Task 4: Add server-side fetch functions to companies hook

Same pattern. Companies has an extra step — it calls `fetchCompanyRelationCounts` for contact/deal counts.

**Files:**
- Modify: `src/hooks/use-companies.ts`
- Create: `src/hooks/__tests__/use-companies-server-fetch.test.ts`

**Step 16: Write the failing test**

```typescript
/**
 * Tests for the server-compatible companies fetch function.
 * @module hooks/__tests__/use-companies-server-fetch.test
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./use-company-relations", () => ({
  fetchCompanyRelationCounts: vi.fn().mockResolvedValue({
    "company-1": { contactCount: 3, dealCount: 2 },
  }),
}));

describe("fetchPaginatedCompaniesWithClient", () => {
  it("calls the provided supabase client instead of the browser singleton", async () => {
    const { fetchPaginatedCompaniesWithClient } = await import("../use-companies");

    const mockData = [
      {
        company_id: "company-1",
        name: "Acme Realty",
        industry: "agency",
        phone: null,
        email: null,
        website: null,
        address: null,
        notes: null,
        custom_fields: {},
        created_at: "2026-03-01T00:00:00+08:00",
        updated_at: "2026-03-01T00:00:00+08:00",
      },
    ];

    const mockRange = vi.fn().mockResolvedValue({
      data: mockData,
      count: 1,
      error: null,
    });

    const mockOrder = vi.fn(() => ({ range: mockRange }));
    const mockSelect = vi.fn(() => ({ order: mockOrder }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    const fakeClient = { from: mockFrom } as never;

    const result = await fetchPaginatedCompaniesWithClient(fakeClient, {
      page: 1,
      pageSize: 20,
    });

    expect(mockFrom).toHaveBeenCalledWith("companies");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].contact_count).toBe(3);
    expect(result.rows[0].deal_count).toBe(2);
    expect(result.total).toBe(1);
  });
});
```

**Step 17: Run test to verify it fails**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-companies-server-fetch.test.ts
```

Expected: FAIL — `fetchPaginatedCompaniesWithClient` not exported.

**Step 18: Add the server-compatible fetch function**

In `src/hooks/use-companies.ts`, add before the final export line:

```typescript
/**
 * Server-compatible paginated companies fetch.
 * Accepts a Supabase client parameter for Server Component prefetching.
 */
export async function fetchPaginatedCompaniesWithClient(
  client: Pick<typeof supabase, "from">,
  filters: PaginatedCompanyFilters,
): Promise<PaginatedCompaniesResult> {
  const { search, industry, hasEmail, hasPhone, createdAt, page = 1, pageSize = 20 } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = client
    .from("companies")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search?.trim()) {
    query = query.or(
      buildSearchExpression(search, ["name", "website", "phone", "email", "address", "notes"]),
    );
  }

  if (industry) {
    query = query.eq("industry", industry);
  }

  if (hasEmail === true) {
    query = query.not("email", "is", null);
  }

  if (hasEmail === false) {
    query = query.is("email", null);
  }

  if (hasPhone === true) {
    query = query.not("phone", "is", null);
  }

  if (hasPhone === false) {
    query = query.is("phone", null);
  }

  if (createdAt?.from) {
    query = query.gte("created_at", createdAt.from);
  }

  if (createdAt?.to) {
    query = query.lte("created_at", createdAt.to);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  const companies = (data ?? []) as Company[];
  const relationCounts = await fetchCompanyRelationCounts(
    companies.map((company) => company.company_id),
  );
  const total = count ?? 0;

  return {
    rows: companies.map((company) => ({
      ...company,
      contact_count: relationCounts[company.company_id]?.contactCount ?? 0,
      deal_count: relationCounts[company.company_id]?.dealCount ?? 0,
    })),
    total,
    totalPages: total > 0 ? Math.ceil(total / safePageSize) : 1,
    page: safePage,
    pageSize: safePageSize,
  };
}
```

Update the export line:

```typescript
export { fetchPaginatedCompanies, fetchPaginatedCompaniesWithClient };
```

**Step 19: Run test to verify it passes**

Run:
```bash
pnpm vitest run src/hooks/__tests__/use-companies-server-fetch.test.ts
```

Expected: PASS

**Step 20: Commit**

```bash
git add src/hooks/use-companies.ts src/hooks/__tests__/use-companies-server-fetch.test.ts
git commit -m "feat(companies): add server-compatible fetchPaginatedCompaniesWithClient

Mirrors fetchPaginatedCompanies but accepts a Supabase client parameter for
Server Component prefetching. Preserves relation count enrichment."
```

---

## Task 5: Convert Deals page to Server Component wrapper

This is the core transformation. The existing `page.tsx` becomes the client component file, and a new `page.tsx` Server Component wraps it with `HydrationBoundary`.

**Files:**
- Rename: `app/(dashboard)/customers/deals/page.tsx` → `app/(dashboard)/customers/deals/deals-page-client.tsx`
- Create: `app/(dashboard)/customers/deals/page.tsx` (new Server Component)
- Modify: `app/(dashboard)/customers/deals/__tests__/page.test.tsx` (update import)

**Step 21: Write the failing test for the Server Component wrapper**

Add a test that verifies the Server Component page module exists and is not a client component:

```typescript
/**
 * Tests that the deals page Server Component wrapper prefetches and hydrates.
 * @module app/(dashboard)/customers/deals/__tests__/page-server.test
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
        })),
      })),
    })),
  }),
}));

describe("DealsPage server wrapper", () => {
  it("exports a default function (not a 'use client' re-export)", async () => {
    const mod = await import("../page");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 22: Run test to verify it fails**

Run:
```bash
pnpm vitest run "app/(dashboard)/customers/deals/__tests__/page-server.test.ts"
```

Expected: FAIL — the current `page.tsx` is a `"use client"` module, which will either fail to import in this test context or won't match expectations once we check for HydrationBoundary usage.

**Step 23: Move existing page to client component file**

Rename `app/(dashboard)/customers/deals/page.tsx` to `app/(dashboard)/customers/deals/deals-page-client.tsx`. No code changes needed — just the filename.

```bash
git mv "app/(dashboard)/customers/deals/page.tsx" "app/(dashboard)/customers/deals/deals-page-client.tsx"
```

**Step 24: Create the Server Component wrapper**

Create `app/(dashboard)/customers/deals/page.tsx`:

```typescript
/**
 * Deals page — Server Component wrapper with SSR prefetching.
 *
 * Prefetches the initial paginated deals query on the server using the
 * authenticated Supabase client, then dehydrates the TanStack Query cache
 * into HydrationBoundary so the client component renders with data immediately.
 *
 * @module app/(dashboard)/customers/deals/page
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/server";
import { getQueryClient } from "@/lib/query-client";
import { dealKeys, type PaginatedDealFilters } from "@/hooks/use-deals";
import { fetchPaginatedDealsWithClient } from "@/hooks/use-deals";

import DealsPageClient from "./deals-page-client";

const defaultFilters: PaginatedDealFilters = { page: 1, pageSize: 20 };

export default async function DealsPage() {
  const queryClient = getQueryClient();
  const supabase = await createClient();

  void queryClient.prefetchQuery({
    queryKey: dealKeys.paginatedList(defaultFilters),
    queryFn: () => fetchPaginatedDealsWithClient(supabase, defaultFilters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DealsPageClient />
    </HydrationBoundary>
  );
}
```

**Step 25: Update existing test imports**

In `app/(dashboard)/customers/deals/__tests__/page.test.tsx`, change the import on line 11:

Replace:
```typescript
import DealsPage from "../page";
```

With:
```typescript
import DealsPage from "../deals-page-client";
```

**Step 26: Run all deals tests to verify they pass**

Run:
```bash
pnpm vitest run "app/(dashboard)/customers/deals/__tests__/"
```

Expected: ALL PASS — the client component tests run against the renamed file, the server wrapper test verifies the new `page.tsx` exports correctly.

**Step 27: Commit**

```bash
git add "app/(dashboard)/customers/deals/"
git commit -m "feat(deals): convert deals page to Server Component with SSR prefetching

Moves the existing client page to deals-page-client.tsx and creates a new
async Server Component page.tsx that prefetches the initial paginated deals
query using the server Supabase client + TanStack Query HydrationBoundary.

First paint now includes data instead of showing a loading spinner."
```

---

## Task 6: Convert People page to Server Component wrapper

Same pattern as deals.

**Files:**
- Rename: `app/(dashboard)/customers/people/page.tsx` → `app/(dashboard)/customers/people/people-page-client.tsx`
- Create: `app/(dashboard)/customers/people/page.tsx` (new Server Component)
- Modify: `app/(dashboard)/customers/people/__tests__/page.test.tsx` (update import)

**Step 28: Move existing page to client component file**

```bash
git mv "app/(dashboard)/customers/people/page.tsx" "app/(dashboard)/customers/people/people-page-client.tsx"
```

**Step 29: Create the Server Component wrapper**

Create `app/(dashboard)/customers/people/page.tsx`:

```typescript
/**
 * People page — Server Component wrapper with SSR prefetching.
 * @module app/(dashboard)/customers/people/page
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/server";
import { getQueryClient } from "@/lib/query-client";
import { contactKeys, type PaginatedContactFilters } from "@/hooks/use-contacts";
import { fetchPaginatedContactsWithClient } from "@/hooks/use-contacts";

import PeoplePageClient from "./people-page-client";

const defaultFilters: PaginatedContactFilters = { page: 1, pageSize: 20 };

export default async function PeoplePage() {
  const queryClient = getQueryClient();
  const supabase = await createClient();

  void queryClient.prefetchQuery({
    queryKey: contactKeys.paginatedList(defaultFilters),
    queryFn: () => fetchPaginatedContactsWithClient(supabase, defaultFilters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PeoplePageClient />
    </HydrationBoundary>
  );
}
```

**Step 30: Update existing test imports**

In `app/(dashboard)/customers/people/__tests__/page.test.tsx`, change line 11:

Replace:
```typescript
import PeoplePage from "../page";
```

With:
```typescript
import PeoplePage from "../people-page-client";
```

**Step 31: Run all people tests to verify they pass**

Run:
```bash
pnpm vitest run "app/(dashboard)/customers/people/__tests__/"
```

Expected: ALL PASS

**Step 32: Commit**

```bash
git add "app/(dashboard)/customers/people/"
git commit -m "feat(people): convert people page to Server Component with SSR prefetching

Same pattern as deals — moves client logic to people-page-client.tsx, new
Server Component prefetches initial contacts query via HydrationBoundary."
```

---

## Task 7: Convert Companies page to Server Component wrapper

Same pattern as deals and people.

**Files:**
- Rename: `app/(dashboard)/customers/companies/page.tsx` → `app/(dashboard)/customers/companies/companies-page-client.tsx`
- Create: `app/(dashboard)/customers/companies/page.tsx` (new Server Component)
- Modify: `app/(dashboard)/customers/companies/__tests__/page.test.tsx` (update import)

**Step 33: Move existing page to client component file**

```bash
git mv "app/(dashboard)/customers/companies/page.tsx" "app/(dashboard)/customers/companies/companies-page-client.tsx"
```

**Step 34: Create the Server Component wrapper**

Create `app/(dashboard)/customers/companies/page.tsx`:

```typescript
/**
 * Companies page — Server Component wrapper with SSR prefetching.
 * @module app/(dashboard)/customers/companies/page
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/server";
import { getQueryClient } from "@/lib/query-client";
import { companyKeys, type PaginatedCompanyFilters } from "@/hooks/use-companies";
import { fetchPaginatedCompaniesWithClient } from "@/hooks/use-companies";

import CompaniesPageClient from "./companies-page-client";

const defaultFilters: PaginatedCompanyFilters = { page: 1, pageSize: 20 };

export default async function CompaniesPage() {
  const queryClient = getQueryClient();
  const supabase = await createClient();

  void queryClient.prefetchQuery({
    queryKey: companyKeys.paginatedList(defaultFilters),
    queryFn: () => fetchPaginatedCompaniesWithClient(supabase, defaultFilters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompaniesPageClient />
    </HydrationBoundary>
  );
}
```

**Step 35: Update existing test imports**

In `app/(dashboard)/customers/companies/__tests__/page.test.tsx`, change line 11:

Replace:
```typescript
import CompaniesPage from "../page";
```

With:
```typescript
import CompaniesPage from "../companies-page-client";
```

**Step 36: Run all companies tests to verify they pass**

Run:
```bash
pnpm vitest run "app/(dashboard)/customers/companies/__tests__/"
```

Expected: ALL PASS

**Step 37: Run full test suite for the customers directory**

Run:
```bash
pnpm vitest run "app/(dashboard)/customers/"
```

Expected: ALL PASS, no warnings.

**Step 38: Commit**

```bash
git add "app/(dashboard)/customers/companies/"
git commit -m "feat(companies): convert companies page to Server Component with SSR prefetching

Same pattern as deals and people — moves client logic to companies-page-client.tsx,
new Server Component prefetches initial companies query via HydrationBoundary."
```

---

## Notes

**What this does NOT change:**
- **Client-side hooks** (`useDeals`, `useContacts`, `useCompanies`) — these continue working exactly as before. The `useQuery` call in the client component will find the prefetched data already in the cache and return it synchronously on first render.
- **Realtime subscriptions** — these are set up inside the client hooks and still work. When the agent creates/updates a deal via the runner, the realtime subscription invalidates the query and TanStack Query refetches.
- **Filters, search, pagination** — all client-side state. After the initial prefetch, subsequent queries go through the browser Supabase client as before.
- **The `app/providers.tsx` QueryClient** — stays as-is. The `getQueryClient()` utility is only used by Server Component wrappers. On the browser, TanStack Query uses the provider's client.

**Why `void queryClient.prefetchQuery()` (no await):**
Not awaiting the prefetch allows Next.js to stream the page. The `<HydrationBoundary>` serializes pending promises, so the client receives the data as soon as the server query resolves. If you `await` instead, the entire page blocks until the query finishes. Both approaches work — streaming is better for perceived performance.

**Cases/Documents page excluded:**
`app/(dashboard)/cases/page.tsx` uses `useCases` which has a simpler data pattern. It's also lower traffic. Can be converted later using the same pattern.

---

## Verification Checklist

- [ ] Every new test has been watched to fail before implementation
- [ ] Each test failed for expected reason (missing export/module, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass (including existing page tests with updated imports)
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use mocked Supabase clients (no real DB calls in tests)
- [ ] Server Component wrappers don't use `"use client"` directive
- [ ] Client component files retain `"use client"` directive
- [ ] `getQueryClient()` returns fresh instances on server, singleton on browser
- [ ] Prefetch query keys match exactly what the client hooks use
