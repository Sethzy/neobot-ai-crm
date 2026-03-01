# Performance Optimization: Eliminate Client-Side Data Fetching Waterfall

## Problem

Dashboard pages use a `'use client'` → TanStack Query pattern that creates a 3-step waterfall:

```
Server HTML (empty shell) → Download + Hydrate JS → Client fetches Supabase → User sees data
```

Every Supabase call from the browser also triggers CORS preflight OPTIONS requests (~30ms each).
The `/cases/[caseId]` page fires 3 parallel queries + preflights = ~150ms of pure overhead.
The `splits` endpoint returns 181 kB unfiltered.

## Approach: Server-Side Prefetch with TanStack Query Hydration

Use Next.js Server Components to prefetch data on the server, then hydrate TanStack Query's cache so
client components have data immediately on mount — zero waterfall, zero CORS preflights.

**Pattern:**
```
Server Component (fetches data via server Supabase client)
  └─ HydrationBoundary (serializes prefetched data)
       └─ Client Component (TanStack Query reads from hydrated cache — no fetch needed)
```

The client hooks (`useCase`, `useDocuments`, etc.) continue working unchanged. They just find
data already in the cache instead of firing a network request.

---

## Phase 1: Setup TanStack Query Server Prefetch Utilities

- [ ] **1.1** Create `src/lib/query-utils.ts` with a `getQueryClient()` helper for Server Components
  - Uses `cache()` from React to share a single QueryClient per request
  - Separate from the client-side QueryClient in `providers.tsx`
- [ ] **1.2** Create a reusable `HydrationProvider` wrapper component
  - Imports `HydrationBoundary` + `dehydrate` from `@tanstack/react-query`
  - Takes a `QueryClient`, dehydrates it, wraps children

**Files:** `src/lib/query-utils.ts`

---

## Phase 2: Prefetch Cases List (`/cases`)

- [ ] **2.1** Convert `app/(dashboard)/cases/page.tsx` from `'use client'` to a Server Component wrapper
  - Server Component calls `prefetchQuery` with the same query key/fn used by `useCases()`
  - Wraps existing client component in `HydrationBoundary`
- [ ] **2.2** Extract client logic into `src/components/cases/cases-page-client.tsx`
  - Move current page contents (state, hooks, JSX) into this client component
  - `useCases()` hook reads from hydrated cache on first render — no loading spinner
- [ ] **2.3** Move server-side query function into shared location
  - Create `src/lib/queries/cases.ts` with `fetchCases(supabase, filters)` used by both hook and server prefetch
  - Keeps query logic DRY between client hook and server prefetch

**Files:** `app/(dashboard)/cases/page.tsx`, `src/components/cases/cases-page-client.tsx`, `src/lib/queries/cases.ts`

---

## Phase 3: Prefetch Case Detail (`/cases/[caseId]`)

This is the highest-impact page — currently fires 3 parallel queries after hydration.

- [ ] **3.1** Convert `app/(dashboard)/cases/[caseId]/page.tsx` to Server Component wrapper
  - Prefetch all 3 queries in parallel using `Promise.all([prefetchQuery(...), ...])`
    - `case` detail
    - `documents_with_status` list
    - `report_history` list
  - Wraps client component in `HydrationBoundary`
- [ ] **3.2** Extract client logic into `src/components/cases/case-detail-client.tsx`
  - Move current page contents into client component
  - All 3 hooks find data in cache immediately — user sees content on first paint
- [ ] **3.3** Create shared query functions
  - `src/lib/queries/documents.ts` — `fetchDocumentsWithStatus(supabase, caseId)`
  - `src/lib/queries/reports.ts` — `fetchReportHistory(supabase, caseId)`

**Files:** `app/(dashboard)/cases/[caseId]/page.tsx`, `src/components/cases/case-detail-client.tsx`, `src/lib/queries/documents.ts`, `src/lib/queries/reports.ts`

**Expected impact:** Eliminates 3 CORS preflights + 3 client-side fetches. Data arrives with the HTML.

---

## Phase 4: Prefetch Document Detail (`/cases/[caseId]/documents/[docId]`)

- [ ] **4.1** Convert `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx` to Server Component wrapper
  - Prefetch document detail + signed URL + splits in parallel
  - Wraps existing client component in `HydrationBoundary`
- [ ] **4.2** Extract client logic into `src/components/documents/document-detail-client.tsx`
- [ ] **4.3** Create shared query function
  - `src/lib/queries/splits.ts` — `fetchSplits(supabase, docId)`

**Files:** `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx`, `src/components/documents/document-detail-client.tsx`, `src/lib/queries/splits.ts`

---

## Phase 5: Reduce `splits` Payload Size

The `splits` endpoint returns 181 kB for a single case. This is the largest single response.

- [ ] **5.1** Audit `useCaseSplits(caseId)` query — determine which columns are actually used
  - Currently selects `*, documents!inner(filename, file_type)` for ALL docs in a case
  - The AnalystSection only needs: `tag_id`, `extracted_data`, `document_id`, `split_index`
  - `extracted_data` (JSON blob) is likely the bulk of the payload
- [ ] **5.2** Create a lean select for the case-level splits query
  - Only select columns needed for tag counting and display
  - Keep the full `useSplits(docId)` query for the document detail page where all fields are needed
- [ ] **5.3** Consider pagination for documents with many splits
  - If a case has 50+ documents, paginate or virtualize the splits list

**Files:** `src/hooks/use-splits.ts`, `src/lib/queries/splits.ts`

---

## Phase 6: Verify & Measure

- [ ] **6.1** Run `ANALYZE=true npx next build` and compare bundle sizes
- [ ] **6.2** Deploy to Vercel preview, test with DevTools Network tab
  - Confirm: no CORS preflights on initial page load
  - Confirm: data visible on first paint (no skeleton flash)
  - Confirm: TanStack Query refetch/polling still works after hydration
- [ ] **6.3** Remove middleware debug logging (console.log + Server-Timing header)

---

## Architecture Notes

**Why not Server Actions for data fetching?**
Server Actions are designed for mutations (POST). Using them for reads is an anti-pattern —
they can't be cached, deduplicated, or prefetched. The TanStack Query hydration pattern is
the recommended approach for read-heavy pages.

**Why keep TanStack Query on the client?**
The client hooks handle: polling (document processing status), optimistic updates (mark reviewed,
update splits), and cache invalidation (after mutations). Server Components can't do any of this.
The prefetch just seeds the cache — the hooks take over for reactivity.

**What about `loading.tsx`?**
The existing `loading.tsx` skeletons still work. They show during server rendering if the prefetch
is slow. But since prefetch runs server-side on the same network as Supabase, it's typically <50ms
vs 200ms+ from the browser with CORS.
