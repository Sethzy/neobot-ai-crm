# Next.js Performance Optimization Implementation Plan

**Goal:** Make page transitions and initial loads feel as snappy as the old TanStack Router + Vite SPA by applying Vercel's React best practices to our post-migration Next.js codebase.

**Architecture:** The app was recently migrated from a Vite SPA with TanStack Router to Next.js 15 App Router. The migration preserved all client-side patterns (TanStack Query, client-side Supabase SDK) but didn't take advantage of Next.js server-side capabilities. The main perf bottleneck is: every dashboard page is a fat client bundle with no streaming, no loading skeletons, and no `optimizePackageImports`. We'll fix this in 4 phases, ordered by impact.

**Tech Stack:** Next.js 15, React 19, TanStack Query, Supabase SSR, shadcn/ui, Tailwind CSS, lucide-react, date-fns, react-icons

**Reference:** All rules from `.agents/skills/vercel-react-best-practices/` — especially `async-suspense-boundaries`, `bundle-barrel-imports`, `bundle-dynamic-imports`, `bundle-preload`, `server-serialization`, `rendering-usetransition-loading`.

---

## Phase 1: Quick Wins — Loading States & Streaming (Highest Impact, Lowest Effort)

The single biggest reason the app feels slow vs the old SPA: there are **zero `loading.tsx` files** and only **one Suspense boundary** in the entire app. When navigating between pages, the user sees a blank white screen while JS downloads + data fetches. The old SPA showed instant skeleton UIs.

---

### Task 1: Add `loading.tsx` to dashboard cases routes

**Why:** When navigating to `/cases` or `/cases/[caseId]`, the browser downloads the page JS chunk, then fires TanStack Query, then renders — user sees blank white screen the entire time. A `loading.tsx` shows a skeleton instantly via Next.js streaming.

**Files:**
- Create: `app/(dashboard)/cases/loading.tsx`
- Create: `app/(dashboard)/cases/[caseId]/loading.tsx`
- Create: `app/(dashboard)/cases/[caseId]/documents/[docId]/loading.tsx`

**Step 1: Create the cases list loading skeleton**

Create `app/(dashboard)/cases/loading.tsx`:

```tsx
/** Skeleton shown while /cases page JS chunk + data loads. */
export default function CasesLoading() {
  return (
    <div className="px-12 py-10 animate-pulse">
      {/* Header */}
      <div className="h-7 w-40 rounded bg-muted" />
      <div className="mt-2 h-4 w-96 rounded bg-muted/60" />

      {/* Button row */}
      <div className="mt-6 flex justify-end">
        <div className="h-7 w-16 rounded-lg bg-muted" />
      </div>

      {/* Search bar */}
      <div className="mt-3 h-12 w-full rounded-md bg-muted/40" />

      {/* Table rows */}
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create the case detail loading skeleton**

Create `app/(dashboard)/cases/[caseId]/loading.tsx`:

```tsx
/** Skeleton shown while /cases/[caseId] page JS chunk + data loads. */
export default function CaseDetailLoading() {
  return (
    <div className="flex h-full flex-col bg-muted/5 animate-pulse">
      {/* Breadcrumb + header */}
      <div className="z-10 flex flex-col bg-background">
        <div className="px-6 pb-1 pt-3">
          <div className="mb-1 h-3 w-32 rounded bg-muted/40" />
          <div className="mt-2 h-6 w-64 rounded bg-muted" />
        </div>
        {/* Tabs */}
        <div className="border-b border-border/40 px-6">
          <div className="flex gap-4 py-2">
            {["w-12", "w-12", "w-20", "w-16"].map((w, i) => (
              <div key={i} className={`h-5 ${w} rounded bg-muted/50`} />
            ))}
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="min-h-0 flex-1 p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create the document detail loading skeleton**

Create `app/(dashboard)/cases/[caseId]/documents/[docId]/loading.tsx`:

```tsx
import { Loader2 } from "lucide-react";

/** Skeleton shown while the document detail page loads. */
export default function DocumentDetailLoading() {
  return (
    <div className="flex h-screen flex-col bg-background animate-pulse">
      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b border-border/40 px-5 py-3">
        <div className="h-8 w-8 rounded bg-muted/40" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>
      {/* Split panes */}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 items-center justify-center border-r border-[#E5E5E5] bg-neutral-50/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="w-1/2 bg-muted/10 p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Verify loading skeletons appear during navigation**

Run: `npm run dev`

Test by navigating between `/cases` → `/cases/[id]` → `/cases/[id]/documents/[docId]`. You should see skeleton UIs instead of blank screens.

**Step 5: Commit**

```bash
git add app/(dashboard)/cases/loading.tsx app/(dashboard)/cases/\[caseId\]/loading.tsx app/(dashboard)/cases/\[caseId\]/documents/\[docId\]/loading.tsx
git commit -m "perf: add loading.tsx skeletons to cases routes for instant navigation feedback"
```

---

### Task 2: Configure TanStack Query `staleTime` globally

**Why:** The QueryClient has **no `defaultOptions`**. This means every query has `staleTime: 0` (default) — every navigation triggers a refetch, even if data was fetched 2 seconds ago. The old SPA felt fast partly because TanStack Router loaders cached data. We need similar behavior.

**Files:**
- Modify: `app/providers.tsx`

**Step 1: Read current file**

Read `app/providers.tsx` — currently the QueryClient is instantiated with no options:

```tsx
const [queryClient] = useState(() => new QueryClient());
```

**Step 2: Add sensible staleTime defaults**

Update `app/providers.tsx` — set `staleTime: 60_000` (1 minute) so navigating back to a recently-visited page is instant:

```tsx
const [queryClient] = useState(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          refetchOnWindowFocus: false,
        },
      },
    })
);
```

**Rationale:**
- `staleTime: 60_000` — Data fetched within the last 60s is served from cache instantly, no loading spinner. Back/forward feels instant (like the old SPA).
- `refetchOnWindowFocus: false` — Prevents jarring refetch flashes when users alt-tab back. Mutations already invalidate queries on success.

**Step 3: Verify no regressions**

Run: `npm run test:run`

Then manually test: navigate `/cases` → `/cases/[id]` → back to `/cases`. Second load of `/cases` should be instant (no spinner).

**Step 4: Commit**

```bash
git add app/providers.tsx
git commit -m "perf: set global staleTime and disable refetchOnWindowFocus for instant back-nav"
```

---

### Task 3: Replace blank loading states with skeleton UI

**Why:** Multiple pages return `null` or `<div />` while loading. This causes blank flashes. Replace with the loading skeletons from Task 1 (or simple inline spinners).

**Files:**
- Modify: `app/(dashboard)/cases/page.tsx:50` — `{isLoading ? null : ...}`
- Modify: `app/(dashboard)/cases/[caseId]/page.tsx:46-48` — `return <div />;`
- Modify: `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx:101-103` — `return null;`

**Step 1: Fix cases page blank state**

In `app/(dashboard)/cases/page.tsx`, change line 50 from:

```tsx
{isLoading ? null : cases.length === 0 ? (
```

to:

```tsx
{isLoading ? (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-14 rounded-lg bg-muted/30" />
    ))}
  </div>
) : cases.length === 0 ? (
```

**Step 2: Fix case detail blank state**

In `app/(dashboard)/cases/[caseId]/page.tsx`, change lines 46-48 from:

```tsx
if (!caseData) {
  return <div />;
}
```

to:

```tsx
if (!caseData) {
  return (
    <div className="flex h-full flex-col bg-muted/5 animate-pulse">
      <div className="z-10 flex flex-col bg-background">
        <div className="px-6 pb-1 pt-3">
          <div className="mb-1 h-3 w-32 rounded bg-muted/40" />
          <div className="mt-2 h-6 w-64 rounded bg-muted" />
        </div>
        <div className="border-b border-border/40 px-6 py-4" />
      </div>
      <div className="min-h-0 flex-1 p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Fix document detail blank state**

In `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx`, change lines 101-103 from:

```tsx
if (!caseId || !docId || isLoading || !document || !pdfUrl) {
  return null;
}
```

to:

```tsx
if (!caseId || !docId || isLoading || !document || !pdfUrl) {
  return (
    <div className="flex h-screen flex-col bg-background animate-pulse">
      <div className="flex items-center gap-4 border-b border-border/40 px-5 py-3">
        <div className="h-8 w-8 rounded bg-muted/40" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 items-center justify-center border-r border-[#E5E5E5]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
        <div className="w-1/2 p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Test transitions**

Run: `npm run dev`

Navigate between pages — you should see skeletons instead of blank screens at every transition point.

**Step 5: Commit**

```bash
git add app/(dashboard)/cases/page.tsx app/(dashboard)/cases/\[caseId\]/page.tsx app/(dashboard)/cases/\[caseId\]/documents/\[docId\]/page.tsx
git commit -m "perf: replace blank loading states with skeleton UI in cases routes"
```

---

## Phase 2: Bundle Size Optimization (Critical Impact)

These changes reduce the JS downloaded on every page load.

---

### Task 4: Add `optimizePackageImports` to `next.config.ts`

**Why:** `lucide-react` is imported in **65+ files** across the codebase using barrel imports (`import { X, Y } from 'lucide-react'`). According to the Vercel React best practices rule `bundle-barrel-imports`, this can add **200-800ms** to cold starts. `date-fns` and `react-icons` have the same problem.

Next.js 13.5+ has `optimizePackageImports` which automatically transforms barrel imports to direct imports at build time — zero code changes needed.

**Files:**
- Modify: `next.config.ts`

**Step 1: Read current config**

Read `next.config.ts` — currently has no `optimizePackageImports`.

**Step 2: Add optimizePackageImports**

In `next.config.ts`, add to the `experimental` block:

```ts
const nextConfig: NextConfig = {
  experimental: {
    devtoolSegmentExplorer: false,
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'react-icons',
      '@radix-ui/react-radio-group',
      'framer-motion',
      'class-variance-authority',
      'recharts',
    ],
  },
  // ... rest unchanged
};
```

**Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no import resolution errors.

**Step 4: Commit**

```bash
git add next.config.ts
git commit -m "perf: add optimizePackageImports for lucide-react, date-fns, react-icons"
```

---

### Task 5: Preload tab content on hover (case detail page)

**Why:** The case detail page (`/cases/[caseId]`) uses `next/dynamic` for 3 tab contents (Rules, AI Analyst, Reports). When clicking a tab, user waits for the chunk to download. Per the `bundle-preload` rule, we can trigger the import on hover so the chunk is ready when the user clicks.

**Files:**
- Modify: `app/(dashboard)/cases/[caseId]/page.tsx`

**Step 1: Add preload functions**

In `app/(dashboard)/cases/[caseId]/page.tsx`, after the dynamic imports (line 16), add:

```tsx
/** Preload functions — trigger chunk download on tab hover */
const preloadValidationRules = () => void import("@/components/cases/validation-rules-section");
const preloadAnalyst = () => void import("@/components/analyst/analyst-section");
const preloadLibrary = () => void import("@/components/library");
```

**Step 2: Attach preloads to TabsTrigger elements**

Update the `<TabsTrigger>` elements to add `onMouseEnter` and `onFocus`:

For the "Rules" tab trigger (~line 94):
```tsx
<TabsTrigger
  value="rules"
  onMouseEnter={preloadValidationRules}
  onFocus={preloadValidationRules}
  className="..."
>
```

For the "AI Analyst" tab trigger (~line 100):
```tsx
<TabsTrigger
  value="analyst"
  onMouseEnter={preloadAnalyst}
  onFocus={preloadAnalyst}
  className="..."
>
```

For the "Reports" tab trigger (~line 107):
```tsx
<TabsTrigger
  value="library"
  onMouseEnter={preloadLibrary}
  onFocus={preloadLibrary}
  className="..."
>
```

**Step 3: Test**

Run: `npm run dev`. Open Network tab. Hover over the "Rules" tab — you should see the chunk start downloading before you click.

**Step 4: Commit**

```bash
git add app/(dashboard)/cases/\[caseId\]/page.tsx
git commit -m "perf: preload dynamic tab content on hover for instant tab switching"
```

---

### Task 6: Use `next/dynamic` with `ssr: false` for PDF viewer

**Why:** The document detail page currently uses `React.lazy()` + `Suspense` for the PDF viewer. In Next.js, `React.lazy` doesn't integrate with server-side streaming — use `next/dynamic` with `ssr: false` instead, which also ensures the ~500KB PDF viewer + pdfjs-dist bundle is never included in SSR.

**Files:**
- Modify: `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx`

**Step 1: Replace React.lazy with next/dynamic**

In `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx`:

Remove the `lazy` import from React (line 5):
```tsx
import { useState, useCallback, Suspense, useEffect } from "react";
```

Replace the `lazy` declaration (lines 25-29):
```tsx
const PdfViewerPane = lazy(() =>
  import("@/components/documents/pdf-viewer-pane").then((m) => ({
    default: m.PdfViewerPane,
  }))
);
```

With:
```tsx
import dynamic from "next/dynamic";

const PdfViewerPane = dynamic(
  () => import("@/components/documents/pdf-viewer-pane").then((m) => ({ default: m.PdfViewerPane })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full flex-col bg-neutral-50/50">
        <div className="h-10 border-b border-[#d1d1d1] bg-[#eeeeee]" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    ),
  }
);
```

Then remove the `<Suspense>` wrapper (lines 141-152) and use the component directly:

```tsx
<div className="w-1/2 border-r border-[#E5E5E5]">
  <PdfViewerPane pdfUrl={pdfUrl} fileType={document.file_type} />
</div>
```

**Step 2: Verify the PDF viewer still loads correctly**

Run: `npm run dev`, navigate to a completed document. The PDF should render after a brief loading spinner.

**Step 3: Commit**

```bash
git add app/(dashboard)/cases/\[caseId\]/documents/\[docId\]/page.tsx
git commit -m "perf: switch PDF viewer from React.lazy to next/dynamic with ssr:false"
```

---

## Phase 3: Server-Side Wins — Sidebar Cookie & Login Page (High Impact)

---

### Task 7: Read sidebar cookie on the server instead of client

**Why:** The sidebar open/closed state is read from `document.cookie` synchronously on every render in the client component `app-layout.tsx` (line 20-24). This is unnecessary — Next.js can read cookies on the server via the `cookies()` API, avoiding a client-side DOM read and potential hydration flash.

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/app-layout.tsx`

**Step 1: Read cookie in the server layout**

Update `app/(dashboard)/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { AppLayout } from "@/components/layout/app-layout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value === "true";

  return <AppLayout defaultSidebarOpen={sidebarOpen}>{children}</AppLayout>;
}
```

**Step 2: Accept the prop in AppLayout**

In `src/components/layout/app-layout.tsx`:

Remove the `getSidebarDefaultOpen` function (lines 19-24) entirely.

Update the interface and component:

```tsx
interface AppLayoutProps {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}

export function AppLayout({ children, defaultSidebarOpen }: AppLayoutProps) {
```

Update the `SidebarProvider` to use the prop:

```tsx
<SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh">
```

**Step 3: Run tests**

Run: `npm run test:run`

Then verify in browser: sidebar should initialize in correct state without a flash.

**Step 4: Commit**

```bash
git add app/(dashboard)/layout.tsx src/components/layout/app-layout.tsx
git commit -m "perf: read sidebar cookie on server to avoid client-side DOM access"
```

---

### Task 8: Convert login page to use `searchParams` prop

**Why:** The login page uses `useEffect` + `window.location.search` to read the redirect param (line 21-24). In Next.js App Router, the `searchParams` prop is provided to page components — no client-side JS needed for this.

**Important:** The login page still needs `'use client'` because of the form state and Supabase auth calls. But we can eliminate the useEffect.

**Files:**
- Modify: `app/login/page.tsx`

**Step 1: Accept searchParams and remove useEffect**

In `app/login/page.tsx`:

Change the component signature to accept `searchParams`:

```tsx
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
```

Remove the `useEffect` and `redirect` state (lines 15, 21-24):

```tsx
// REMOVE:
// const [redirect, setRedirect] = useState<string | null>(null);
// useEffect(() => {
//   const params = new URLSearchParams(window.location.search);
//   setRedirect(params.get("redirect"));
// }, []);
```

Use React's `use()` to unwrap the searchParams promise:

```tsx
import { use } from "react";

// Inside the component:
const { redirect } = use(searchParams);
```

The `router.replace` on line 43 stays the same:
```tsx
router.replace(redirect ?? "/cases");
```

**Step 2: Verify login redirect flow**

Run: `npm run dev`

1. Navigate to `/cases` while logged out → should redirect to `/login?redirect=/cases`
2. Log in → should redirect back to `/cases`

**Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "perf: use searchParams prop instead of useEffect for login redirect"
```

---

## Phase 4: Structural Improvements (Medium Impact, More Effort)

---

### Task 9: Add `<Link prefetch>` for high-traffic navigation paths

**Why:** Next.js auto-prefetches `<Link>` components that are visible in the viewport, but only the static shell. For the most common user journey (cases list → case detail), we can explicitly prefetch to ensure the page chunk is ready before the user clicks.

**Files:**
- Modify: `src/components/cases/cases-table.tsx` (wherever Link to `/cases/[caseId]` is rendered)

**Step 1: Find the cases table Link elements**

Read `src/components/cases/cases-table.tsx` and find where `<Link href={/cases/${case.id}}>` is rendered.

**Step 2: Ensure Links use default prefetch behavior**

Next.js 15 defaults `prefetch` to `"auto"` (prefetches on viewport entry). Verify there is no `prefetch={false}` being set. If the links are `<Link>` already, this is a no-op (just confirm).

If the table rows use `router.push()` instead of `<Link>`, convert them to `<Link>` for automatic prefetching. Example:

```tsx
// BAD: no prefetch
<tr onClick={() => router.push(`/cases/${c.id}`)}>

// GOOD: auto-prefetch when visible
<Link href={`/cases/${c.id}`} className="contents">
  <tr>...</tr>
</Link>
```

**Step 3: Test**

Open Network tab in DevTools. Scroll the cases table — you should see prefetch requests for case detail pages.

**Step 4: Commit**

```bash
git add src/components/cases/cases-table.tsx
git commit -m "perf: ensure cases table rows use Link for auto-prefetching"
```

---

### Task 10: Move middleware env var reads to module scope

**Why:** `getSupabaseEnv()` in `middleware.ts` (line 44-57) reads `process.env` on every single request. Environment variables are constant — read them once at module load time.

**Files:**
- Modify: `middleware.ts`

**Step 1: Hoist env reads to module scope**

In `middleware.ts`, replace the `getSupabaseEnv()` function (lines 44-57) with module-level constants:

```ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
```

Update the middleware function to use these directly:

```ts
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicRoute(pathname) && !AUTH_ONLY_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase env vars.");
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // ... rest stays the same
  });
```

**Step 2: Verify middleware works**

Run: `npm run dev`. Navigate to a protected route while logged out — should redirect to `/login`. Navigate while logged in — should pass through.

**Step 3: Commit**

```bash
git add middleware.ts
git commit -m "perf: hoist env var reads to module scope in middleware"
```

---

### Task 11: Add `next/image` for Supabase-hosted images

**Why:** Several components render user-uploaded images (thumbnails, report previews) using `<img>`. These images come from Supabase Storage and could benefit from Next.js Image Optimization (automatic resizing, WebP conversion, lazy loading).

**Scope:** Only apply to Supabase-hosted images (already configured in `next.config.ts` `remotePatterns`). Do NOT convert landing page decorative images or CSS-masked images (they need raw `<img>` for styling control).

**Files:**
- Modify: `src/components/documents/pdf-viewer-pane.tsx:112` (image file preview)
- Modify: `src/components/analyst/file-download.tsx:128` (report thumbnail)
- Modify: `src/components/analyst/chat-message.tsx:108` (message images)

**Step 1: Read each file to identify the `<img>` tags**

Read each file and identify:
- What the `src` is (Supabase URL? Local asset? Data URL?)
- What dimensions are known
- Whether CSS transforms/masks are applied

**Step 2: Convert Supabase-hosted `<img>` to `next/image`**

For each file where `src` comes from Supabase Storage (signed URL pattern `https://xtewwwycvapskgvfnliq.supabase.co/...`):

```tsx
import Image from "next/image";

// Replace:
<img src={url} alt={alt} className="..." />

// With:
<Image src={url} alt={alt} width={W} height={H} className="..." />
```

Use appropriate `width`/`height` based on the component's layout. If the size is dynamic, use `fill` with a sized container.

**Step 3: Verify images render correctly**

Run: `npm run dev`. Navigate to a document with image files. Verify thumbnails/previews still render correctly.

**Step 4: Commit**

```bash
git add src/components/documents/pdf-viewer-pane.tsx src/components/analyst/file-download.tsx src/components/analyst/chat-message.tsx
git commit -m "perf: use next/image for Supabase-hosted images (auto resize + WebP)"
```

---

### Task 12: Add Suspense boundary around AnalystSection `forceMount`

**Why:** On the case detail page, `AnalystSection` uses `forceMount` (line 131-135) so the chat state persists when switching tabs. This means the analyst component mounts and loads its data even when the user never clicks the tab. Wrap it in a Suspense to at least defer its rendering.

**Files:**
- Modify: `app/(dashboard)/cases/[caseId]/page.tsx`

**Step 1: Import Suspense**

Add to the imports:
```tsx
import { Suspense } from "react";
```

**Step 2: Wrap the forceMount tab content**

Change the analyst TabsContent (lines 129-135) to:

```tsx
<TabsContent
  value="analyst"
  className="mt-0 h-full data-[state=inactive]:hidden"
  forceMount
>
  <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading analyst...</div>}>
    <AnalystSection key={caseId} caseId={caseId} />
  </Suspense>
</TabsContent>
```

**Step 3: Test**

Run: `npm run dev`. Navigate to a case. Verify the Files tab loads quickly. Click AI Analyst tab — should show "Loading analyst..." briefly then the actual section.

**Step 4: Commit**

```bash
git add app/(dashboard)/cases/\[caseId\]/page.tsx
git commit -m "perf: wrap forceMount AnalystSection in Suspense boundary"
```

---

## Relevant Files Summary

| File | Action | Task |
|------|--------|------|
| `app/(dashboard)/cases/loading.tsx` | Create | 1 |
| `app/(dashboard)/cases/[caseId]/loading.tsx` | Create | 1 |
| `app/(dashboard)/cases/[caseId]/documents/[docId]/loading.tsx` | Create | 1 |
| `app/providers.tsx` | Modify | 2 |
| `app/(dashboard)/cases/page.tsx` | Modify | 3 |
| `app/(dashboard)/cases/[caseId]/page.tsx` | Modify | 3, 5, 12 |
| `app/(dashboard)/cases/[caseId]/documents/[docId]/page.tsx` | Modify | 3, 6 |
| `next.config.ts` | Modify | 4 |
| `app/(dashboard)/layout.tsx` | Modify | 7 |
| `src/components/layout/app-layout.tsx` | Modify | 7 |
| `app/login/page.tsx` | Modify | 8 |
| `src/components/cases/cases-table.tsx` | Modify | 9 |
| `middleware.ts` | Modify | 10 |
| `src/components/documents/pdf-viewer-pane.tsx` | Modify | 11 |
| `src/components/analyst/file-download.tsx` | Modify | 11 |
| `src/components/analyst/chat-message.tsx` | Modify | 11 |

## What We Deliberately Chose NOT To Do (YAGNI)

- **Convert dashboard pages to Server Components** — The 3 active pages (`cases`, `cases/[id]`, `cases/[id]/documents/[docId]`) all need heavy client interactivity (search, tabs, drag-drop, real-time polling). Converting them to hybrid server/client would be a major refactor with marginal gain since TanStack Query already handles caching well.
- **Add Route Handlers / API routes** — The Supabase client SDK with RLS is working fine. Adding a server API layer adds complexity without clear perf benefit.
- **Replace Remotion animations on landing page** — Already dynamically imported. Landing page is not the perf concern (dashboard navigation is).
- **Replace framer-motion** — Only used in 2 landing page decoration components. Already lazy-loaded.
- **Add `@next/bundle-analyzer`** — Good for ongoing monitoring but doesn't fix anything now. Can add later when we have a baseline to measure against.
- **Server-side data fetching in layouts** — Would require replacing TanStack Query patterns with server component fetching + hydration. High effort, marginal gain given our `staleTime` fix.

---

## Execution Checklist

- [x] Task 1: Add `loading.tsx` skeletons
- [x] Task 2: Configure TanStack Query `staleTime`
- [x] Task 3: Replace blank loading states with skeleton UI
- [x] Task 4: Add `optimizePackageImports`
- [x] Task 5: Preload tab content on hover
- [x] Task 6: Use `next/dynamic` for PDF viewer
- [x] Task 7: Server-side sidebar cookie read
- [x] Task 8: Login page `searchParams` prop
- [x] Task 9: Ensure `<Link>` prefetching in cases table
- [x] Task 10: Hoist middleware env var reads
- [x] Task 11: `next/image` for Supabase images
- [x] Task 12: Suspense around forceMount AnalystSection
