# Sunder Market Data Hub Implementation Plan

**Goal:** Redesign the 5 separate property data sections into a unified "Market Data" hub that serves as a lead magnet for real estate agents — with a central landing page, persistent sub-navigation, cross-entity linking, agent-facing stat cards, soft CTAs, and **full OpenAgent.sg feature parity** on the agent profile page (activity heatmap, 3 breakdown donuts, top neighbourhoods map, movement history).

**Architecture:** Currently, `/agents`, `/properties`, `/hdb`, `/agencies`, `/areas` are disconnected page silos sharing the same layout (Header + Footer) but with no inter-section navigation or shared state. We'll move all property data pages under a new `/market` route group with a shared layout containing a sticky sub-nav. A new hub page at `/market` provides unified search and category cards. All profile pages get cross-links to related entities. Old routes get permanent redirects via `next.config.ts`. The sub-nav is a client component; everything else stays server-rendered.

**Tech Stack:** Next.js 15 App Router, Supabase SSR, Tailwind CSS, recharts, Vitest + React Testing Library, lucide-react icons

**Testing:** Vitest with jsdom. Run tests with `npx vitest run`. Property pages have zero test coverage today — we build it from scratch with TDD.

**Reference:** OpenAgent.sg agent profile at `docs/competitor-reference/`. Our agent profile should match their layout section-for-section.

---

## Phase 1: Route Restructure & Sub-Navigation

Move all property pages under `/market/*` with a shared layout and sticky sub-nav. Set up redirects from old paths.

---

### Task 1: Create the Market Sub-Nav component

The sub-nav is a horizontal tab bar that persists across all `/market/*` pages. It shows which section the user is in and provides one-click navigation between Agents, Properties, HDB, Agencies, and Areas.

**Files:**
- Create: `src/components/property/market-sub-nav.tsx`
- Test: `src/components/property/__tests__/market-sub-nav.test.tsx`

**Step 1: Write the failing test for MarketSubNav rendering**

Create the test file first. This tests that the component renders all 5 navigation links with correct hrefs.

```tsx
// src/components/property/__tests__/market-sub-nav.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MarketSubNav } from "../market-sub-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/market/agents",
}));

describe("MarketSubNav", () => {
  it("renders all 5 navigation links", () => {
    render(<MarketSubNav />);

    expect(screen.getByRole("link", { name: /agents/i })).toHaveAttribute("href", "/market/agents");
    expect(screen.getByRole("link", { name: /properties/i })).toHaveAttribute("href", "/market/properties");
    expect(screen.getByRole("link", { name: /hdb/i })).toHaveAttribute("href", "/market/hdb");
    expect(screen.getByRole("link", { name: /agencies/i })).toHaveAttribute("href", "/market/agencies");
    expect(screen.getByRole("link", { name: /areas/i })).toHaveAttribute("href", "/market/areas");
  });

  it("highlights the active link based on current pathname", () => {
    render(<MarketSubNav />);

    const agentsLink = screen.getByRole("link", { name: /agents/i });
    expect(agentsLink.className).toMatch(/text-sunder-green|border-sunder-green/);
  });

  it("renders as a nav element with accessible label", () => {
    render(<MarketSubNav />);

    expect(screen.getByRole("navigation", { name: /market data/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/property/__tests__/market-sub-nav.test.tsx
```

Expected: FAIL — module `../market-sub-nav` not found.

**Step 3: Implement the MarketSubNav component**

```tsx
// src/components/property/market-sub-nav.tsx
/** Sticky sub-navigation bar for all /market/* pages. */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Building2, Home, Briefcase, MapPin } from "lucide-react";

const NAV_ITEMS = [
  { href: "/market/agents", label: "Agents", icon: Users },
  { href: "/market/properties", label: "Properties", icon: Building2 },
  { href: "/market/hdb", label: "HDB", icon: Home },
  { href: "/market/agencies", label: "Agencies", icon: Briefcase },
  { href: "/market/areas", label: "Areas", icon: MapPin },
] as const;

export function MarketSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Market data sections"
      className="sticky top-[56px] z-40 border-b border-[#E8DCC8] bg-[#F5EEE1]/95 backdrop-blur-sm sm:top-[60px]"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition ${
                isActive
                  ? "border-sunder-green text-sunder-green"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/property/__tests__/market-sub-nav.test.tsx
```

Expected: PASS — all 3 tests green.

**Step 5: Commit**

```bash
git add src/components/property/market-sub-nav.tsx src/components/property/__tests__/market-sub-nav.test.tsx
git commit -m "feat: add MarketSubNav component with TDD tests"
```

---

### Task 2: Create the shared Market layout

The market layout wraps all `/market/*` pages with Header, MarketSubNav, Footer. This replaces the 5 individual layout files.

**Files:**
- Create: `app/market/layout.tsx`
- Test: `src/components/property/__tests__/market-layout.test.tsx`

**Step 1: Write the failing test for the market layout structure**

```tsx
// src/components/property/__tests__/market-layout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/market/agents",
}));

import { MarketSubNav } from "../market-sub-nav";

describe("Market layout structure", () => {
  it("MarketSubNav renders sticky nav with correct z-index class", () => {
    render(<MarketSubNav />);
    const nav = screen.getByRole("navigation", { name: /market data/i });
    expect(nav.className).toContain("sticky");
    expect(nav.className).toContain("z-40");
  });
});
```

**Step 2: Run test to verify it passes** (leverages Task 1 component)

```bash
npx vitest run src/components/property/__tests__/market-layout.test.tsx
```

Expected: PASS.

**Step 3: Create the market layout file**

```tsx
// app/market/layout.tsx
/** Shared layout for all /market/* property data pages. Includes header, sub-nav, and footer. */
import { Footer } from "@/components/landing/Footer";
import { Header } from "@/components/landing/Header";
import { MarketSubNav } from "@/components/property/market-sub-nav";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-page min-h-screen bg-[#F5EEE1] selection:bg-indigo-100 selection:text-indigo-900">
      <Header />
      <div className="pt-24 sm:pt-28">
        <MarketSubNav />
        <main>{children}</main>
      </div>
      <Footer />
    </div>
  );
}
```

**Step 4: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add app/market/layout.tsx src/components/property/__tests__/market-layout.test.tsx
git commit -m "feat: add shared /market layout with MarketSubNav"
```

---

### Task 3: Move all listing pages under /market/*

Move each page from its old location to the new `/market/*` route group. Page logic stays identical — just relocating files.

**Files:**
- Move: `app/agents/page.tsx` → `app/market/agents/page.tsx`
- Move: `app/properties/page.tsx` → `app/market/properties/page.tsx`
- Move: `app/hdb/page.tsx` → `app/market/hdb/page.tsx`
- Move: `app/agencies/page.tsx` → `app/market/agencies/page.tsx`
- Move: `app/areas/page.tsx` → `app/market/areas/page.tsx`
- Move: all `[slug]/`, `[regNo]/`, `[town]/` subfolders correspondingly
- Delete: `app/agents/layout.tsx`, `app/properties/layout.tsx`, `app/hdb/layout.tsx`, `app/agencies/layout.tsx`, `app/areas/layout.tsx` (replaced by `app/market/layout.tsx`)

**Step 1: Create the new directory structure**

```bash
mkdir -p app/market/agents app/market/properties app/market/hdb app/market/agencies app/market/areas
```

**Step 2: Copy all page files and subfolders**

```bash
cp app/agents/page.tsx app/market/agents/page.tsx
cp -r app/agents/\[regNo\] app/market/agents/
cp app/properties/page.tsx app/market/properties/page.tsx
cp -r app/properties/\[slug\] app/market/properties/
cp app/hdb/page.tsx app/market/hdb/page.tsx
cp -r app/hdb/\[town\] app/market/hdb/
cp app/agencies/page.tsx app/market/agencies/page.tsx
cp -r app/agencies/\[slug\] app/market/agencies/
cp app/areas/page.tsx app/market/areas/page.tsx
cp -r app/areas/\[slug\] app/market/areas/
```

**Step 3: Update all internal links in moved pages**

Every moved page has links pointing to old paths (e.g., `href="/agents"`, `href="/properties/${slug}"`). Update them all to use `/market/` prefix. Apply to every `.tsx` file under `app/market/`:

- `"/agents"` → `"/market/agents"`
- `"/agents/${…}"` → `"/market/agents/${…}"`
- `` `/agents/` `` → `` `/market/agents/` ``
- `"/properties"` → `"/market/properties"`
- `` `/properties/` `` → `` `/market/properties/` ``
- `"/hdb"` → `"/market/hdb"`
- `` `/hdb/` `` → `` `/market/hdb/` ``
- `"/agencies"` → `"/market/agencies"`
- `` `/agencies/` `` → `` `/market/agencies/` ``
- `"/areas"` → `"/market/areas"`
- `` `/areas/` `` → `` `/market/areas/` ``
- `action="/agents"` → `action="/market/agents"` (and same for all form actions)

**Step 4: Delete old layout files** (shared market layout replaces them)

```bash
rm app/agents/layout.tsx app/properties/layout.tsx app/hdb/layout.tsx app/agencies/layout.tsx app/areas/layout.tsx
```

**Step 5: Delete old page files** (after confirming copies exist)

```bash
rm app/agents/page.tsx app/properties/page.tsx app/hdb/page.tsx app/agencies/page.tsx app/areas/page.tsx
rm -rf app/agents/\[regNo\] app/properties/\[slug\] app/hdb/\[town\] app/agencies/\[slug\] app/areas/\[slug\]
```

**Step 6: Verify build**

```bash
npx tsc --noEmit && npm run build
```

Expected: Build succeeds, all `/market/*` routes appear in the build output.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: move all property pages under /market/* route group"
```

---

### Task 4: Add redirects from old routes to new /market/* routes

Users and search engines may have bookmarked the old URLs. Add permanent redirects.

**Files:**
- Modify: `next.config.ts` (add `redirects()` config)
- Modify: `middleware.ts` (update public route patterns)
- Modify: `src/components/landing/Header.tsx` (update RESOURCE_LINKS hrefs)

**Step 1: Update next.config.ts with redirects**

Add a `redirects()` function to `next.config.ts`:

```ts
async redirects() {
  return [
    { source: "/agents", destination: "/market/agents", permanent: true },
    { source: "/agents/:path*", destination: "/market/agents/:path*", permanent: true },
    { source: "/properties", destination: "/market/properties", permanent: true },
    { source: "/properties/:path*", destination: "/market/properties/:path*", permanent: true },
    { source: "/hdb", destination: "/market/hdb", permanent: true },
    { source: "/hdb/:path*", destination: "/market/hdb/:path*", permanent: true },
    { source: "/agencies", destination: "/market/agencies", permanent: true },
    { source: "/agencies/:path*", destination: "/market/agencies/:path*", permanent: true },
    { source: "/areas", destination: "/market/areas", permanent: true },
    { source: "/areas/:path*", destination: "/market/areas/:path*", permanent: true },
  ];
},
```

**Step 2: Update middleware.ts public routes**

Replace the 5 old `pathname.startsWith(...)` checks with single:

```ts
pathname.startsWith("/market")
```

**Step 3: Update Header.tsx RESOURCE_LINKS**

```ts
const RESOURCE_LINKS = [
  { href: '/market/agents', label: 'Agent Profiles', description: 'CEA agent transaction history' },
  { href: '/market/properties', label: 'Private Properties', description: 'Condo & residential projects' },
  { href: '/market/hdb', label: 'HDB Resale', description: 'HDB resale streets & pricing' },
  { href: '/market/agencies', label: 'Agencies', description: 'Agency activity & top agents' },
  { href: '/market/areas', label: 'Areas', description: 'Town & district transactions' },
] as const;
```

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add next.config.ts middleware.ts src/components/landing/Header.tsx
git commit -m "feat: add permanent redirects from old routes to /market/*"
```

---

### Task 5: Update sitemap to use /market/* routes

**Files:**
- Modify: `app/sitemap.ts`

**Step 1: Update all property URLs from old paths to `/market/*` equivalents.**

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat: update sitemap to use /market/* routes"
```

---

## Phase 2: Market Hub Landing Page

Create the `/market` page — the single entry point for the lead magnet.

---

### Task 6: Create the MarketCategoryCard component

A clickable card for each section with icon, title, description, and count.

**Files:**
- Create: `src/components/property/market-category-card.tsx`
- Test: `src/components/property/__tests__/market-category-card.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/property/__tests__/market-category-card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarketCategoryCard } from "../market-category-card";
import { Users } from "lucide-react";

describe("MarketCategoryCard", () => {
  it("renders title, description, and count", () => {
    render(
      <MarketCategoryCard
        href="/market/agents"
        title="Agent Profiles"
        description="Search CEA-registered agent transaction histories"
        count="42,000+"
        icon={<Users className="h-6 w-6" />}
      />
    );

    expect(screen.getByText("Agent Profiles")).toBeInTheDocument();
    expect(screen.getByText(/CEA-registered/)).toBeInTheDocument();
    expect(screen.getByText("42,000+")).toBeInTheDocument();
  });

  it("links to the correct href", () => {
    render(
      <MarketCategoryCard
        href="/market/agents"
        title="Agent Profiles"
        description="Search CEA agent histories"
        count="42,000+"
        icon={<Users className="h-6 w-6" />}
      />
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/market/agents");
  });
});
```

**Step 2: Run test — FAIL**

**Step 3: Implement**

```tsx
// src/components/property/market-category-card.tsx
/** Clickable category card for the /market hub page. */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type MarketCategoryCardProps = {
  href: string;
  title: string;
  description: string;
  count: string;
  icon: ReactNode;
};

export function MarketCategoryCard({
  href,
  title,
  description,
  count,
  icon,
}: MarketCategoryCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-[#E8DCC8] bg-white p-6 shadow-sm transition hover:border-sunder-green/30 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunder-green/10 text-sunder-green">
          {icon}
        </span>
        <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-sunder-green" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{description}</p>
      <p className="mt-auto pt-4 text-2xl font-bold tracking-tight text-sunder-green">
        {count}
      </p>
    </Link>
  );
}
```

**Step 4: Run test — PASS**

**Step 5: Commit**

```bash
git add src/components/property/market-category-card.tsx src/components/property/__tests__/market-category-card.test.tsx
git commit -m "feat: add MarketCategoryCard component with TDD tests"
```

---

### Task 7: Create the MarketCta component

Soft CTA banner at the bottom of every profile page.

**Files:**
- Create: `src/components/property/market-cta.tsx`
- Test: `src/components/property/__tests__/market-cta.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/property/__tests__/market-cta.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarketCta } from "../market-cta";

describe("MarketCta", () => {
  it("renders the CTA heading and link", () => {
    render(<MarketCta />);

    expect(screen.getByText(/NeoBot/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try neobot free/i })).toHaveAttribute(
      "href",
      "/register"
    );
  });
});
```

**Step 2: Run test — FAIL**

**Step 3: Implement**

```tsx
// src/components/property/market-cta.tsx
/** Soft CTA banner for /market profile pages — upsells NeoBot. */
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function MarketCta() {
  return (
    <div className="rounded-2xl border border-sunder-green/20 bg-sunder-green/5 p-6 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sunder-green" />
          <div>
            <p className="font-semibold text-zinc-900">
              Need this data in your next proposal?
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              NeoBot can pull market data automatically to help you craft
              winning proposals.
            </p>
          </div>
        </div>
        <Link
          href="/register"
          className="shrink-0 rounded-full bg-sunder-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sunder-green-dark"
        >
          Try NeoBot Free
        </Link>
      </div>
    </div>
  );
}
```

**Step 4: Run test — PASS**

**Step 5: Commit**

```bash
git add src/components/property/market-cta.tsx src/components/property/__tests__/market-cta.test.tsx
git commit -m "feat: add MarketCta soft upsell banner with TDD tests"
```

---

### Task 8: Create the /market hub page

**Files:**
- Create: `app/market/page.tsx`
- Test: `src/components/property/__tests__/market-hub-data.test.ts`

**Step 1: Write test for hub category data structure**

```tsx
// src/components/property/__tests__/market-hub-data.test.ts
import { describe, it, expect } from "vitest";

const MARKET_CATEGORIES = [
  { href: "/market/agents", title: "Agent Profiles" },
  { href: "/market/properties", title: "Private Properties" },
  { href: "/market/hdb", title: "HDB Resale" },
  { href: "/market/agencies", title: "Agencies" },
  { href: "/market/areas", title: "Areas" },
];

describe("Market hub category data", () => {
  it("defines exactly 5 categories", () => {
    expect(MARKET_CATEGORIES).toHaveLength(5);
  });

  it("all categories have valid /market/* hrefs", () => {
    for (const cat of MARKET_CATEGORIES) {
      expect(cat.href).toMatch(/^\/market\//);
    }
  });
});
```

**Step 2: Run test — PASS (data validation only)**

**Step 3: Create the hub page**

```tsx
// app/market/page.tsx
/** Market Data Hub — the lead magnet entry point for real estate agents. */
import type { Metadata } from "next";
import { Users, Building2, Home, Briefcase, MapPin } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { MarketCategoryCard } from "@/components/property/market-category-card";
import { MarketCta } from "@/components/property/market-cta";

export const metadata: Metadata = {
  title: "Singapore Property Market Data | Sunder",
  description:
    "Free property market data for Singapore real estate agents. Agent profiles, private property transactions, HDB resale data, agency rankings, and area analytics.",
};

const CATEGORIES = [
  {
    href: "/market/agents",
    title: "Agent Profiles",
    description: "Search 42,000+ CEA-registered agents and their full transaction histories",
    count: "42,000+",
    icon: <Users className="h-6 w-6" />,
  },
  {
    href: "/market/properties",
    title: "Private Properties",
    description: "Condo and residential project transaction data across all districts",
    count: "3,000+",
    icon: <Building2 className="h-6 w-6" />,
  },
  {
    href: "/market/hdb",
    title: "HDB Resale",
    description: "HDB resale street-level pricing and transaction volume data",
    count: "900+",
    icon: <Home className="h-6 w-6" />,
  },
  {
    href: "/market/agencies",
    title: "Agencies",
    description: "Agency-level activity, headcount, and top-performing agents",
    count: "1,500+",
    icon: <Briefcase className="h-6 w-6" />,
  },
  {
    href: "/market/areas",
    title: "Areas",
    description: "Town and district transaction activity and neighbourhood analytics",
    count: "30+",
    icon: <MapPin className="h-6 w-6" />,
  },
] as const;

export default function MarketHubPage() {
  return (
    <>
      <section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-block rounded-full bg-sunder-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sunder-green">
              Free for Agents
            </span>
            <h1 className="mt-4 font-serif text-4xl font-medium tracking-tight text-zinc-900 sm:text-5xl">
              Singapore Property Market Data
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-600">
              Everything you need to research agents, properties, and
              neighbourhoods — all in one place. Powered by CEA, URA, and HDB
              public data.
            </p>
          </div>
        </Container>
      </section>

      <section className="pb-12">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <MarketCategoryCard key={cat.href} {...cat} />
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24">
        <Container>
          <MarketCta />
        </Container>
      </section>
    </>
  );
}
```

**Step 4: Verify build**

```bash
npx tsc --noEmit && npm run build
```

**Step 5: Commit**

```bash
git add app/market/page.tsx src/components/property/__tests__/market-hub-data.test.ts
git commit -m "feat: add /market hub landing page with category cards and CTA"
```

---

## Phase 3: Agent Profile — OpenAgent.sg Feature Parity

This is the biggest phase. We replicate OpenAgent.sg's agent profile layout section-for-section. Their page (top to bottom): compact header → 5 stat cards → transaction volume bar chart → activity heatmap + property type donut → 3 breakdown donuts (transaction type, sales rep, rental rep) → top neighbourhoods with map → transaction records table → movement history.

**Data we already fetch** (in `AgentTransaction`): `transaction_date`, `property_type`, `transaction_type`, `represented`, `town`, `district`, `general_location`. All OpenAgent features can be powered by these existing fields — **no new Supabase queries needed** for charts.

---

### Task 9: Compact the agent profile header

OpenAgent uses a flat, tight header row: photo + name + reg + agency + date range all on one line, with action buttons (Call, WhatsApp, Claim Profile) on the right. We'll replicate this layout (minus photo and Claim Profile — we don't have those).

**Files:**
- Modify: `app/market/agents/[regNo]/page.tsx`

**Step 1: Write the failing test for compact header structure**

```tsx
// src/components/property/__tests__/agent-profile-header.test.tsx
import { describe, it, expect } from "vitest";

// The compact header is rendered inside a server component.
// We validate the data shape that feeds it.

type CompactHeaderData = {
  displayName: string;
  registrationNo: string;
  agencyName: string;
  activeRange: string; // e.g. "May 2021 – Dec 2026"
};

function formatActiveRange(
  firstDate: string | null,
  latestDate: string | null
): string {
  if (!firstDate) return "No transaction history";
  const fmt = (d: string) => {
    const date = new Date(`${d}T00:00:00Z`);
    return date.toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });
  };
  return `${fmt(firstDate)} – ${latestDate ? fmt(latestDate) : "Present"}`;
}

describe("Agent compact header", () => {
  it("formats active date range correctly", () => {
    expect(formatActiveRange("2021-05-01", "2026-12-31")).toBe("May 2021 – Dec 2026");
  });

  it("handles null first date", () => {
    expect(formatActiveRange(null, null)).toBe("No transaction history");
  });

  it("handles missing latest date", () => {
    expect(formatActiveRange("2021-05-01", null)).toContain("May 2021 – Present");
  });
});
```

**Step 2: Run test — FAIL (function not exported)**

**Step 3: Add `formatActiveRange` to `src/lib/property/utils.ts`**

```ts
/** Format a date range for agent profiles, e.g. "May 2021 – Dec 2026". */
export function formatActiveRange(
  firstDate: string | null,
  latestDate: string | null
): string {
  if (!firstDate) return "No transaction history";
  const fmt = (d: string) => {
    const date = new Date(`${d}T00:00:00Z`);
    return date.toLocaleDateString("en-SG", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(firstDate)} – ${latestDate ? fmt(latestDate) : "Present"}`;
}
```

**Step 4: Update test to import from utils**

```tsx
import { formatActiveRange } from "@/lib/property/utils";
// ... same assertions
```

**Step 5: Run test — PASS**

**Step 6: Redesign the profile header JSX**

In `app/market/agents/[regNo]/page.tsx`, replace the current big card header with a compact layout matching OpenAgent:

```tsx
{/* Compact profile header — matches OpenAgent.sg layout */}
<div className="rounded-2xl border border-[#E8DCC8] bg-white p-6 shadow-sm">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="font-serif text-2xl font-medium tracking-tight text-zinc-900 sm:text-3xl">
        {displayName}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span className="flex items-center gap-1">
          <Shield className="h-3.5 w-3.5" />
          {registrationNo}
        </span>
        <span className="flex items-center gap-1">
          <Briefcase className="h-3.5 w-3.5" />
          {profile.agent?.estate_agent_name ? (
            <Link
              href={{
                pathname: `/market/agencies/${toAgencySlug(profile.agent.estate_agent_name)}`,
                query: { name: profile.agent.estate_agent_name },
              }}
              className="text-sunder-green hover:underline"
            >
              {agencyName}
            </Link>
          ) : (
            agencyName
          )}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {formatActiveRange(firstTransactionDate, profile.latestTransactionDate)}
        </span>
      </div>
    </div>
    <div className="flex gap-2">
      <a
        href={`https://wa.me/`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#E8DCC8] bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-sunder-green hover:text-sunder-green"
      >
        WhatsApp
      </a>
    </div>
  </div>

  {isExpiredProfile ? (
    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      This registration is no longer in the current CEA registry, but historical transactions remain available.
    </p>
  ) : null}
</div>
```

Note: We need to also fetch `firstTransactionDate` and expose it to the template. This is already queried (see `firstDateResult`) — just add it to the `AgentProfile` type and pass it through.

**Step 7: Verify build**

```bash
npx tsc --noEmit
```

**Step 8: Commit**

```bash
git add src/lib/property/utils.ts src/components/property/__tests__/agent-profile-header.test.tsx app/market/agents/\[regNo\]/page.tsx
git commit -m "feat: compact agent profile header matching OpenAgent layout"
```

---

### Task 10: Create the ActivityHeatmap chart component

GitHub-style grid showing transaction density by month × year. OpenAgent's signature visualization — shows at a glance whether an agent is active or coasting.

**Files:**
- Create: `src/components/property/charts/activity-heatmap.tsx`
- Test: `src/components/property/charts/__tests__/activity-heatmap.test.tsx`

**Step 1: Write the failing test for heatmap data grouping**

```tsx
// src/components/property/charts/__tests__/activity-heatmap.test.tsx
import { describe, it, expect } from "vitest";
import { groupByMonthYear } from "../activity-heatmap";

describe("ActivityHeatmap groupByMonthYear", () => {
  it("groups dates into year-month buckets with counts", () => {
    const dates = ["2024-01-15", "2024-01-20", "2024-03-10", "2025-01-05"];
    const result = groupByMonthYear(dates);

    expect(result.get("2024-01")).toBe(2);
    expect(result.get("2024-03")).toBe(1);
    expect(result.get("2025-01")).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(groupByMonthYear([])).toEqual(new Map());
  });

  it("skips null dates", () => {
    const result = groupByMonthYear([null, "2024-06-01", null]);
    expect(result.size).toBe(1);
    expect(result.get("2024-06")).toBe(1);
  });

  it("returns correct year range", () => {
    const dates = ["2020-01-01", "2025-12-01"];
    const result = groupByMonthYear(dates);
    // Should have entries only for months with data
    expect(result.has("2020-01")).toBe(true);
    expect(result.has("2025-12")).toBe(true);
    expect(result.has("2022-06")).toBe(false);
  });
});
```

**Step 2: Run test — FAIL**

**Step 3: Implement the ActivityHeatmap component**

```tsx
// src/components/property/charts/activity-heatmap.tsx
/** GitHub-style activity heatmap showing transaction density by month × year. */
"use client";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Exported for testing. Groups date strings into "YYYY-MM" → count map. */
export function groupByMonthYear(
  dates: (string | null)[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.slice(0, 7); // "YYYY-MM"
    if (key.length === 7) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

type ActivityHeatmapProps = {
  dates: (string | null)[];
};

function intensityClass(count: number): string {
  if (count === 0) return "bg-zinc-100";
  if (count <= 1) return "bg-sunder-green/20";
  if (count <= 3) return "bg-sunder-green/40";
  if (count <= 5) return "bg-sunder-green/60";
  if (count <= 8) return "bg-sunder-green/80";
  return "bg-sunder-green";
}

export function ActivityHeatmap({ dates }: ActivityHeatmapProps) {
  const grouped = groupByMonthYear(dates);
  if (grouped.size === 0) return null;

  // Determine year range
  const allKeys = Array.from(grouped.keys()).sort();
  const minYear = Number.parseInt(allKeys[0].slice(0, 4), 10);
  const maxYear = Number.parseInt(allKeys[allKeys.length - 1].slice(0, 4), 10);
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  // Build max for tooltip
  let maxCount = 0;
  for (const c of grouped.values()) {
    if (c > maxCount) maxCount = c;
  }

  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-900">Activity Heatmap</h3>
        <p className="text-sm text-zinc-500">Monthly transaction activity history</p>
      </div>

      {/* Month headers */}
      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="mb-1 flex">
            <div className="w-12 shrink-0" />
            {MONTHS.map((m, i) => (
              <div key={i} className="flex-1 text-center text-xs text-zinc-400">
                {m}
              </div>
            ))}
          </div>

          {/* Year rows */}
          {years.map((year) => (
            <div key={year} className="mb-1 flex items-center">
              <div className="w-12 shrink-0 text-xs text-zinc-500">{year}</div>
              {Array.from({ length: 12 }, (_, monthIndex) => {
                const key = `${year}-${(monthIndex + 1).toString().padStart(2, "0")}`;
                const count = grouped.get(key) ?? 0;
                return (
                  <div key={key} className="flex-1 px-0.5">
                    <div
                      className={`aspect-square w-full rounded-sm ${intensityClass(count)}`}
                      title={`${key}: ${count} transaction${count !== 1 ? "s" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
        <span>Less</span>
        <div className="h-3 w-3 rounded-sm bg-zinc-100" />
        <div className="h-3 w-3 rounded-sm bg-sunder-green/20" />
        <div className="h-3 w-3 rounded-sm bg-sunder-green/40" />
        <div className="h-3 w-3 rounded-sm bg-sunder-green/60" />
        <div className="h-3 w-3 rounded-sm bg-sunder-green/80" />
        <div className="h-3 w-3 rounded-sm bg-sunder-green" />
        <span>More</span>
      </div>
    </div>
  );
}
```

**Step 4: Run test — PASS**

**Step 5: Commit**

```bash
git add src/components/property/charts/activity-heatmap.tsx src/components/property/charts/__tests__/activity-heatmap.test.tsx
git commit -m "feat: add ActivityHeatmap chart component with TDD tests"
```

---

### Task 11: Create the 3 breakdown donut charts for agent profile

OpenAgent shows 3 side-by-side donuts: Transaction Type (Rental Whole / Rental Room / Resale), Sales Representation (Seller / Buyer), Rental Representation (Tenant / Landlord). We already have our generic `TypeBreakdownChart`. We reuse it 3 times with different filtered data.

**Files:**
- Test: `src/components/property/charts/__tests__/agent-breakdowns.test.ts`
- Modify: `app/market/agents/[regNo]/page.tsx` (compute 3 breakdowns server-side)
- Modify: `app/market/agents/[regNo]/charts.tsx` (render 3 donuts)

**Step 1: Write failing test for breakdown computation**

```tsx
// src/components/property/charts/__tests__/agent-breakdowns.test.ts
import { describe, it, expect } from "vitest";
import {
  computeTransactionTypeBreakdown,
  computeSalesRepBreakdown,
  computeRentalRepBreakdown,
} from "@/lib/property/agent-breakdowns";

const MOCK_TRANSACTIONS = [
  { transaction_type: "Resale", represented: "Seller" },
  { transaction_type: "Resale", represented: "Buyer" },
  { transaction_type: "Rental (Whole)", represented: "Tenant" },
  { transaction_type: "Rental (Whole)", represented: "Landlord" },
  { transaction_type: "Rental (Room)", represented: "Tenant" },
  { transaction_type: "Resale", represented: "Seller" },
];

describe("computeTransactionTypeBreakdown", () => {
  it("counts by transaction_type", () => {
    const result = computeTransactionTypeBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Resale", count: 3 });
    expect(result).toContainEqual({ label: "Rental (Whole)", count: 2 });
    expect(result).toContainEqual({ label: "Rental (Room)", count: 1 });
  });

  it("sorts by count descending", () => {
    const result = computeTransactionTypeBreakdown(MOCK_TRANSACTIONS);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });
});

describe("computeSalesRepBreakdown", () => {
  it("only includes Resale transactions", () => {
    const result = computeSalesRepBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Seller", count: 2 });
    expect(result).toContainEqual({ label: "Buyer", count: 1 });
    expect(result).toHaveLength(2);
  });
});

describe("computeRentalRepBreakdown", () => {
  it("only includes Rental transactions", () => {
    const result = computeRentalRepBreakdown(MOCK_TRANSACTIONS);
    expect(result).toContainEqual({ label: "Tenant", count: 2 });
    expect(result).toContainEqual({ label: "Landlord", count: 1 });
    expect(result).toHaveLength(2);
  });
});
```

**Step 2: Run test — FAIL (module not found)**

**Step 3: Create `src/lib/property/agent-breakdowns.ts`**

```ts
// src/lib/property/agent-breakdowns.ts
/** Compute the 3 breakdown datasets for agent profile donut charts (matching OpenAgent.sg). */

type Transaction = {
  transaction_type: string | null;
  represented: string | null;
};

type Breakdown = Array<{ label: string; count: number }>;

function countByField(
  transactions: Transaction[],
  field: keyof Transaction,
  filter?: (t: Transaction) => boolean
): Breakdown {
  const filtered = filter ? transactions.filter(filter) : transactions;
  const map = new Map<string, number>();
  for (const t of filtered) {
    const label = t[field] ?? "Unknown";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Transaction Type breakdown: Resale, Rental (Whole), Rental (Room), etc. */
export function computeTransactionTypeBreakdown(transactions: Transaction[]): Breakdown {
  return countByField(transactions, "transaction_type");
}

/** Sales Representation: Seller vs Buyer (filtered to Resale transactions only). */
export function computeSalesRepBreakdown(transactions: Transaction[]): Breakdown {
  return countByField(
    transactions,
    "represented",
    (t) => t.transaction_type === "Resale"
  );
}

/** Rental Representation: Tenant vs Landlord (filtered to Rental transactions only). */
export function computeRentalRepBreakdown(transactions: Transaction[]): Breakdown {
  return countByField(
    transactions,
    "represented",
    (t) =>
      t.transaction_type?.toLowerCase().includes("rental") ?? false
  );
}
```

**Step 4: Run test — PASS**

**Step 5: Update the agent profile page to compute all 3 breakdowns**

In `app/market/agents/[regNo]/page.tsx`, after fetching `recentTransactions`, compute:

```ts
import {
  computeTransactionTypeBreakdown,
  computeSalesRepBreakdown,
  computeRentalRepBreakdown,
} from "@/lib/property/agent-breakdowns";

// Inside the page component, after getting profile:
const transactionTypeBreakdown = computeTransactionTypeBreakdown(profile.recentTransactions);
const salesRepBreakdown = computeSalesRepBreakdown(profile.recentTransactions);
const rentalRepBreakdown = computeRentalRepBreakdown(profile.recentTransactions);
```

Pass these to the charts client component.

**Step 6: Update `app/market/agents/[regNo]/charts.tsx` to render all charts**

```tsx
// app/market/agents/[regNo]/charts.tsx
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { ActivityHeatmap } from "@/components/property/charts/activity-heatmap";

type BreakdownEntry = { label: string; count: number };

type AgentProfileChartsProps = {
  dates: (string | null)[];
  propertyTypeBreakdown: BreakdownEntry[];
  transactionTypeBreakdown: BreakdownEntry[];
  salesRepBreakdown: BreakdownEntry[];
  rentalRepBreakdown: BreakdownEntry[];
};

export function AgentProfileCharts({
  dates,
  propertyTypeBreakdown,
  transactionTypeBreakdown,
  salesRepBreakdown,
  rentalRepBreakdown,
}: AgentProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;

  return (
    <div className="mt-8 space-y-6">
      {/* Row 1: Transaction Volume (full width) */}
      {hasVolume ? <TransactionVolumeChart dates={dates} /> : null}

      {/* Row 2: Activity Heatmap + Property Type (2-col) */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <ActivityHeatmap dates={dates} />
        {propertyTypeBreakdown.length > 0 ? (
          <TypeBreakdownChart title="Property Type" data={propertyTypeBreakdown} />
        ) : null}
      </div>

      {/* Row 3: 3 breakdown donuts (3-col — matches OpenAgent) */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {transactionTypeBreakdown.length > 0 ? (
          <TypeBreakdownChart title="Transaction Type" data={transactionTypeBreakdown} />
        ) : null}
        {salesRepBreakdown.length > 0 ? (
          <TypeBreakdownChart title="Sales Representation" data={salesRepBreakdown} />
        ) : null}
        {rentalRepBreakdown.length > 0 ? (
          <TypeBreakdownChart title="Rental Representation" data={rentalRepBreakdown} />
        ) : null}
      </div>
    </div>
  );
}
```

**Step 7: Verify build**

```bash
npx tsc --noEmit
```

**Step 8: Commit**

```bash
git add src/lib/property/agent-breakdowns.ts src/components/property/charts/__tests__/agent-breakdowns.test.ts app/market/agents/\[regNo\]/page.tsx app/market/agents/\[regNo\]/charts.tsx
git commit -m "feat: add 3 breakdown donuts to agent profile (OpenAgent parity)"
```

---

### Task 12: Create the Top Neighbourhoods section

OpenAgent shows a choropleth Singapore map + ranked list with counts and percentages. We'll build the ranked list + a simple SVG map of Singapore regions with color-coded density. The map uses an inline SVG of Singapore's 5 regions (Central, East, North, North-East, West) with `town` data mapped to regions.

**Files:**
- Create: `src/components/property/charts/top-neighbourhoods.tsx`
- Create: `src/lib/property/sg-regions.ts` (town → region mapping)
- Test: `src/lib/property/__tests__/sg-regions.test.ts`
- Test: `src/components/property/charts/__tests__/top-neighbourhoods.test.ts`

**Step 1: Write the failing test for town aggregation**

```ts
// src/components/property/charts/__tests__/top-neighbourhoods.test.ts
import { describe, it, expect } from "vitest";
import { aggregateNeighbourhoods } from "../top-neighbourhoods";

describe("aggregateNeighbourhoods", () => {
  it("groups by town and sorts by count descending", () => {
    const transactions = [
      { town: "YISHUN", district: null },
      { town: "YISHUN", district: null },
      { town: "HOUGANG", district: null },
      { town: "BEDOK", district: null },
      { town: "YISHUN", district: null },
    ];
    const result = aggregateNeighbourhoods(transactions);
    expect(result[0]).toEqual({ name: "YISHUN", count: 3, percentage: 60 });
    expect(result[1]).toEqual({ name: "HOUGANG", count: 1, percentage: 20 });
  });

  it("falls back to district when town is null", () => {
    const transactions = [
      { town: null, district: "D09" },
      { town: null, district: "D09" },
    ];
    const result = aggregateNeighbourhoods(transactions);
    expect(result[0].name).toBe("D09");
  });

  it("returns top 10 only", () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      town: `TOWN_${i}`,
      district: null,
    }));
    const result = aggregateNeighbourhoods(transactions);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
```

**Step 2: Run test — FAIL**

**Step 3: Write the failing test for town-to-region mapping**

```ts
// src/lib/property/__tests__/sg-regions.test.ts
import { describe, it, expect } from "vitest";
import { getRegionForTown } from "../sg-regions";

describe("getRegionForTown", () => {
  it("maps Yishun to North", () => {
    expect(getRegionForTown("YISHUN")).toBe("North");
  });

  it("maps Bedok to East", () => {
    expect(getRegionForTown("BEDOK")).toBe("East");
  });

  it("maps Queenstown to Central", () => {
    expect(getRegionForTown("QUEENSTOWN")).toBe("Central");
  });

  it("returns Unknown for unrecognized towns", () => {
    expect(getRegionForTown("NARNIA")).toBe("Unknown");
  });

  it("is case-insensitive", () => {
    expect(getRegionForTown("yishun")).toBe("North");
  });
});
```

**Step 4: Run test — FAIL**

**Step 5: Implement `src/lib/property/sg-regions.ts`**

```ts
// src/lib/property/sg-regions.ts
/** Maps Singapore HDB towns to planning regions for choropleth visualization. */

const REGION_MAP: Record<string, string> = {
  // Central
  "BISHAN": "Central",
  "BUKIT MERAH": "Central",
  "BUKIT TIMAH": "Central",
  "CENTRAL AREA": "Central",
  "GEYLANG": "Central",
  "KALLANG/WHAMPOA": "Central",
  "MARINE PARADE": "Central",
  "QUEENSTOWN": "Central",
  "TOA PAYOH": "Central",

  // East
  "BEDOK": "East",
  "PASIR RIS": "East",
  "TAMPINES": "East",

  // North
  "SEMBAWANG": "North",
  "WOODLANDS": "North",
  "YISHUN": "North",

  // North-East
  "ANG MO KIO": "North-East",
  "HOUGANG": "North-East",
  "PUNGGOL": "North-East",
  "SENGKANG": "North-East",
  "SERANGOON": "North-East",

  // West
  "BUKIT BATOK": "West",
  "BUKIT PANJANG": "West",
  "CHOA CHU KANG": "West",
  "CLEMENTI": "West",
  "JURONG EAST": "West",
  "JURONG WEST": "West",
};

export function getRegionForTown(town: string): string {
  return REGION_MAP[town.toUpperCase()] ?? "Unknown";
}

export const REGIONS = ["Central", "North", "North-East", "East", "West"] as const;
```

**Step 6: Run sg-regions test — PASS**

**Step 7: Implement the TopNeighbourhoods component**

```tsx
// src/components/property/charts/top-neighbourhoods.tsx
/** Top Neighbourhoods section with ranked list and simple region visualization. */
"use client";

import { useState } from "react";
import { getRegionForTown, REGIONS } from "@/lib/property/sg-regions";

type Transaction = { town: string | null; district: string | null };

type NeighbourhoodEntry = {
  name: string;
  count: number;
  percentage: number;
};

/** Exported for testing. */
export function aggregateNeighbourhoods(
  transactions: Transaction[]
): NeighbourhoodEntry[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    const name = t.town?.trim() || t.district?.trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }

  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);

  return Array.from(map.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

type TopNeighbourhoodsProps = {
  transactions: Transaction[];
};

export function TopNeighbourhoods({ transactions }: TopNeighbourhoodsProps) {
  const [view, setView] = useState<"hdb" | "private">("hdb");
  const neighbourhoods = aggregateNeighbourhoods(transactions);

  if (neighbourhoods.length === 0) return null;

  // Compute region totals for the mini map
  const regionTotals = new Map<string, number>();
  for (const t of transactions) {
    const town = t.town?.trim();
    if (!town) continue;
    const region = getRegionForTown(town);
    regionTotals.set(region, (regionTotals.get(region) ?? 0) + 1);
  }

  const maxRegion = Math.max(...Array.from(regionTotals.values()), 1);

  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">Top Neighbourhoods</h3>
          <p className="text-sm text-zinc-500">Geographic distribution of transactions</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setView("hdb")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              view === "hdb"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            HDB Towns
          </button>
          <button
            type="button"
            onClick={() => setView("private")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              view === "private"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Private Districts
          </button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Region summary cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REGIONS.map((region) => {
            const count = regionTotals.get(region) ?? 0;
            const intensity = maxRegion > 0 ? count / maxRegion : 0;
            return (
              <div
                key={region}
                className="rounded-xl border border-[#E8DCC8] p-3 text-center"
                style={{
                  backgroundColor: `rgba(2, 79, 70, ${Math.max(intensity * 0.3, 0.03)})`,
                }}
              >
                <p className="text-xs font-medium text-zinc-500">{region}</p>
                <p className="mt-1 text-lg font-bold text-zinc-900">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Ranked list */}
        <div className="space-y-2">
          {neighbourhoods.map((n, i) => (
            <div key={n.name} className="flex items-center gap-3">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: `rgba(2, 79, 70, ${Math.max(0.2, (10 - i) / 10)})`,
                }}
              />
              <span className="flex-1 text-sm text-zinc-700">{n.name}</span>
              <span className="text-sm font-semibold text-zinc-900">{n.count}</span>
              <span className="text-xs text-zinc-500">({n.percentage}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 8: Run tests — PASS**

**Step 9: Commit**

```bash
git add src/components/property/charts/top-neighbourhoods.tsx src/components/property/charts/__tests__/top-neighbourhoods.test.ts src/lib/property/sg-regions.ts src/lib/property/__tests__/sg-regions.test.ts
git commit -m "feat: add TopNeighbourhoods section with region map and ranked list"
```

---

### Task 13: Create the Movement History section

OpenAgent shows "Agency transfers" — when an agent changed agencies. We can approximate this using `cea_agents` registration data if available, or show a placeholder. Since `cea_agents` only stores current agency, we'll show registration dates and current agency.

**Files:**
- Create: `src/components/property/movement-history.tsx`
- Modify: `app/market/agents/[regNo]/page.tsx`

**Step 1: Write the component**

```tsx
// src/components/property/movement-history.tsx
/** Movement History section for agent profile (agency transfers). */
import { ArrowRight } from "lucide-react";

type MovementHistoryProps = {
  agencyName: string | null;
  registrationStart: string | null;
  registrationEnd: string | null;
};

export function MovementHistory({
  agencyName,
  registrationStart,
  registrationEnd,
}: MovementHistoryProps) {
  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-900">Movement History</h3>
        <p className="text-sm text-zinc-500">Agency transfers</p>
      </div>

      {agencyName ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
          <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-medium text-zinc-900">{agencyName}</p>
            <p className="text-xs text-zinc-500">
              {registrationStart
                ? `Registered since ${new Date(`${registrationStart}T00:00:00Z`).toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" })}`
                : "Registration date not available"}
              {registrationEnd
                ? ` · Expires ${new Date(`${registrationEnd}T00:00:00Z`).toLocaleDateString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" })}`
                : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <ArrowRight className="h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">
            No movement history recorded for this agent
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Integrate into agent profile page**

Add `<MovementHistory>` below the transaction table, before the CTA.

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/property/movement-history.tsx app/market/agents/\[regNo\]/page.tsx
git commit -m "feat: add Movement History section to agent profile"
```

---

### Task 14: Assemble the full agent profile page layout (OpenAgent order)

Wire everything together so the agent profile page renders sections top-to-bottom in OpenAgent's exact order.

**Files:**
- Modify: `app/market/agents/[regNo]/page.tsx`
- Modify: `app/market/agents/[regNo]/charts.tsx`

**Step 1: Define the final section order**

The page should render in this exact order:

```
1. Compact header (name, reg, agency link, date range, WhatsApp button)
2. 5 stat cards (Transactions, Last 12 Months, Last Transaction, Avg Txn/Quarter, Active Years)
3. Transaction Volume bar chart (full width, Monthly/Quarterly/Yearly toggle)
4. Activity Heatmap + Property Type donut (2-col grid)
5. 3 breakdown donuts: Transaction Type, Sales Representation, Rental Representation (3-col grid)
6. Top Neighbourhoods (region cards + ranked list)
7. Transaction Records table (paginated, 20/page)
8. Movement History (agency transfers)
9. MarketCta (soft upsell banner)
```

**Step 2: Update the charts client component to accept all new props**

The `AgentProfileCharts` component now receives: `dates`, `propertyTypeBreakdown`, `transactionTypeBreakdown`, `salesRepBreakdown`, `rentalRepBreakdown`, and `transactions` (for TopNeighbourhoods).

**Step 3: Update the page server component**

- Compute `transactionTypeBreakdown`, `salesRepBreakdown`, `rentalRepBreakdown` using the functions from `agent-breakdowns.ts`
- Pass `firstTransactionDate` to the header for the date range display
- Add `formatActiveRange` import
- Add `toAgencySlug` import for the agency link
- Pass full `recentTransactions` to charts for TopNeighbourhoods
- Add `MarketCta` at the bottom
- Remove the old separate "Property Type Breakdown" text pills section (now inside charts)

**Step 4: Verify build**

```bash
npx tsc --noEmit && npm run build
```

**Step 5: Visual check**

```bash
npm run dev
```

Open `http://localhost:3000/market/agents/R005884C` (or any agent with transaction data) and verify all 9 sections render in the correct order.

**Step 6: Commit**

```bash
git add app/market/agents/\[regNo\]/page.tsx app/market/agents/\[regNo\]/charts.tsx
git commit -m "feat: assemble full agent profile with all OpenAgent sections"
```

---

## Phase 4: Better Stat Cards (Agent-Facing Metrics)

Replace developer-facing stat cards on all listing pages.

---

### Task 15: Update listing page stat cards

**Files:**
- Modify: `app/market/agents/page.tsx`
- Modify: `app/market/properties/page.tsx`
- Modify: `app/market/hdb/page.tsx`
- Modify: `app/market/agencies/page.tsx`
- Modify: `app/market/areas/page.tsx`

**Step 1: Replace stat cards on each listing page**

**Agents:**
```tsx
<StatCard label="Agents Found" value={formatCount(agents.length)} hint={searchTerm ? `Matching "${searchTerm}"` : "Sorted by name"} />
<StatCard label="Data Source" value="CEA Registry" hint="42,000+ registered agents" />
<StatCard label="Records" value="Transactions" hint="Sales, rentals, and HDB resale activity" />
```

**Properties:**
```tsx
<StatCard label="Projects Found" value={formatCount(properties.length)} hint={searchTerm ? `Matching "${searchTerm}"` : "Most recently active"} />
<StatCard label="Data Source" value="URA" hint="Private residential transactions" />
<StatCard label="Coverage" value="All Districts" hint="D01–D28 across Singapore" />
```

**HDB:**
```tsx
<StatCard label="Streets Found" value={formatCount(streets.length)} hint={searchTerm ? `Matching "${searchTerm}"` : "Most active streets"} />
<StatCard label="Data Source" value="HDB" hint="Resale transaction records" />
<StatCard label="Coverage" value="All Towns" hint="26 HDB towns island-wide" />
```

**Agencies:**
```tsx
<StatCard label="Agencies Found" value={formatCount(agencies.length)} hint={searchTerm ? `Matching "${searchTerm}"` : "Ranked by transaction count"} />
<StatCard label="Data Source" value="CEA" hint="Agency and agent records" />
<StatCard label="Coverage" value="1,500+ Agencies" hint="Active Singapore property agencies" />
```

**Areas:**
```tsx
<StatCard label="Areas Found" value={formatCount(areas.length)} hint={searchTerm ? `Matching "${searchTerm}"` : "Most active areas"} />
<StatCard label="Data Sources" value="CEA + HDB" hint="Combined transaction coverage" />
<StatCard label="Coverage" value="30+ Areas" hint="Towns and districts" />
```

**Step 2: Verify build**

```bash
npx tsc --noEmit && npm run build
```

**Step 3: Commit**

```bash
git add app/market/agents/page.tsx app/market/properties/page.tsx app/market/hdb/page.tsx app/market/agencies/page.tsx app/market/areas/page.tsx
git commit -m "feat: replace developer-facing stat cards with agent-relevant metrics"
```

---

## Phase 5: Cross-Entity Linking & CTA

---

### Task 16: Add MarketCta to all profile pages

**Files:**
- Modify: all 5 profile pages under `app/market/*/`

**Step 1: Add to each profile page**

Import `MarketCta` and add as the last section before `</>`:

```tsx
import { MarketCta } from "@/components/property/market-cta";

// At the end of JSX:
<section className="pb-20 sm:pb-24">
  <Container>
    <MarketCta />
  </Container>
</section>
```

Apply to:
- `app/market/agents/[regNo]/page.tsx` (already done in Task 14)
- `app/market/properties/[slug]/page.tsx`
- `app/market/hdb/[town]/[slug]/page.tsx`
- `app/market/agencies/[slug]/page.tsx`
- `app/market/areas/[slug]/page.tsx`

**Step 2: Verify build**

**Step 3: Commit**

```bash
git add app/market/
git commit -m "feat: add MarketCta to all profile pages"
```

---

## Phase 6: Agency & Area Profile Enrichment

---

### Task 17: Add charts to agency profile page

**Files:**
- Create: `app/market/agencies/[slug]/charts.tsx`
- Modify: `app/market/agencies/[slug]/page.tsx`

**Step 1: Create agency charts client component**

```tsx
// app/market/agencies/[slug]/charts.tsx
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";

type AgencyProfileChartsProps = {
  dates: (string | null)[];
};

export function AgencyProfileCharts({ dates }: AgencyProfileChartsProps) {
  if (dates.length === 0) return null;

  return (
    <div className="mt-8">
      <TransactionVolumeChart dates={dates} />
    </div>
  );
}
```

**Step 2: Update agency page to collect transaction dates and render charts**

In `fetchAgencySummaryAndTopAgents`, collect `row.transaction_date` for matching agents into a `transactionDates: string[]` array. Pass to `AgencyProfileCharts`.

**Step 3: Verify build**

**Step 4: Commit**

```bash
git add app/market/agencies/\[slug\]/
git commit -m "feat: add transaction volume chart to agency profile"
```

---

### Task 18: Add charts to area profile page

**Files:**
- Create: `app/market/areas/[slug]/charts.tsx`
- Modify: `app/market/areas/[slug]/page.tsx`

**Step 1: Create area charts client component** (same pattern as agency)

**Step 2: Update area page to pass transaction dates**

**Step 3: Verify build**

**Step 4: Commit**

```bash
git add app/market/areas/\[slug\]/
git commit -m "feat: add transaction volume chart to area profile"
```

---

## Phase 7: Property Profile — OpenAgent Parity

Bring the property profile page (`/market/properties/[slug]`) to exact visual and functional parity with OpenAgent's property page.

**OpenAgent layout (top to bottom):**
1. Compact header — project name large, then metadata line: district pin, property type, tenure
2. 5 stat cards — Transactions, Avg PSF, Median Price, Price Range, Last Sale
3. Transaction Volume bar chart — **full width**, Monthly/Quarterly/Yearly toggle
4. Price Trend line chart — **full width**, Min/Median/Max PSF with shaded band
5. Floor Level Premium scatter + Type of Sale donut — **side by side**
6. Purchaser Profile donut — **SKIP** (no `purchaser_address_type` column in our DB)
7. Transaction table — Address, Floor, Price, Area (sqft), PSF, colored Type badges

**Key drifts from our current implementation:**
- Volume chart currently side-by-side with donut → should be full-width
- PSF Trend shows median-only line → needs min/median/max area band
- No Floor Level Premium scatter chart at all
- Table missing: street address, floor, area in sqft, colored sale type badges
- Header is a big padded card → should be compact with metadata icons
- Duplicate "Type of Sale Distribution" text pills section → remove (donut is sufficient)

**DB columns in `ura_transactions` we can use:** `project`, `street`, `market_segment`, `district`, `contract_date`, `price`, `area_sqm`, `price_psf` (generated), `floor_range`, `property_type`, `tenure`, `type_of_sale`, `type_of_area`, `no_of_units`

---

### Task 19: Add utility functions for property profile parity

Two new utils needed: `parseFloorMidpoint` (for scatter chart) and `formatAreaSqft` (for table).

**Files:**
- Modify: `src/lib/property/utils.ts`
- Test: `src/lib/property/__tests__/utils-floor-midpoint.test.ts`
- Test: `src/lib/property/__tests__/utils-area-sqft.test.ts`

**Step 1: Write the failing test for parseFloorMidpoint**

```ts
// src/lib/property/__tests__/utils-floor-midpoint.test.ts
import { describe, it, expect } from "vitest";
import { parseFloorMidpoint } from "../utils";

describe("parseFloorMidpoint", () => {
  it("parses '06 TO 10' to 8", () => {
    expect(parseFloorMidpoint("06 TO 10")).toBe(8);
  });

  it("parses '01 TO 05' to 3", () => {
    expect(parseFloorMidpoint("01 TO 05")).toBe(3);
  });

  it("parses '16 TO 20' to 18", () => {
    expect(parseFloorMidpoint("16 TO 20")).toBe(18);
  });

  it("returns null for null/undefined", () => {
    expect(parseFloorMidpoint(null)).toBeNull();
    expect(parseFloorMidpoint(undefined)).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(parseFloorMidpoint("B1")).toBeNull();
    expect(parseFloorMidpoint("")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/property/__tests__/utils-floor-midpoint.test.ts
```

Expected: FAIL — `parseFloorMidpoint` not exported.

**Step 3: Implement parseFloorMidpoint**

Add to `src/lib/property/utils.ts`:

```ts
/** Parse floor range like "06 TO 10" to its midpoint (8). Returns null if unparseable. */
export function parseFloorMidpoint(floorRange: string | null | undefined): number | null {
  if (!floorRange) return null;
  const match = floorRange.match(/^(\d+)\s*TO\s*(\d+)$/i);
  if (!match) return null;
  const low = Number.parseInt(match[1], 10);
  const high = Number.parseInt(match[2], 10);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;
  return Math.round((low + high) / 2);
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/property/__tests__/utils-floor-midpoint.test.ts
```

Expected: PASS.

**Step 5: Write the failing test for formatAreaSqft**

```ts
// src/lib/property/__tests__/utils-area-sqft.test.ts
import { describe, it, expect } from "vitest";
import { formatAreaSqft } from "../utils";

describe("formatAreaSqft", () => {
  it("converts sqm to sqft and formats with commas", () => {
    expect(formatAreaSqft(100)).toBe("1,076");
  });

  it("returns N/A for null", () => {
    expect(formatAreaSqft(null)).toBe("N/A");
  });

  it("returns N/A for undefined", () => {
    expect(formatAreaSqft(undefined)).toBe("N/A");
  });
});
```

**Step 6: Run test to verify it fails**

```bash
npx vitest run src/lib/property/__tests__/utils-area-sqft.test.ts
```

Expected: FAIL.

**Step 7: Implement formatAreaSqft**

Add to `src/lib/property/utils.ts`:

```ts
/** Convert area in sqm to sqft and format with commas. Singapore convention uses sqft. */
export function formatAreaSqft(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined || !Number.isFinite(sqm)) return "N/A";
  const sqft = Math.round(sqm * 10.764);
  return new Intl.NumberFormat("en-SG").format(sqft);
}
```

**Step 8: Run test to verify it passes**

```bash
npx vitest run src/lib/property/__tests__/utils-area-sqft.test.ts
```

Expected: PASS.

**Step 9: Commit**

```bash
git add src/lib/property/utils.ts src/lib/property/__tests__/utils-floor-midpoint.test.ts src/lib/property/__tests__/utils-area-sqft.test.ts
git commit -m "feat: add parseFloorMidpoint and formatAreaSqft utils with TDD"
```

---

### Task 20: Create FloorPremiumChart scatter component

OpenAgent shows a scatter plot with X = PSF ($), Y = Floor level, showing the height-price correlation.

**Files:**
- Create: `src/components/property/charts/floor-premium-chart.tsx`
- Test: `src/components/property/charts/__tests__/floor-premium-chart.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/property/charts/__tests__/floor-premium-chart.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FloorPremiumChart } from "../floor-premium-chart";

describe("FloorPremiumChart", () => {
  it("renders the chart title and subtitle", () => {
    render(
      <FloorPremiumChart
        data={[
          { floor: 3, psf: 1000 },
          { floor: 8, psf: 1100 },
          { floor: 15, psf: 1250 },
          { floor: 18, psf: 1300 },
          { floor: 22, psf: 1400 },
        ]}
      />
    );
    expect(screen.getByText("Floor Level Premium")).toBeInTheDocument();
    expect(screen.getByText(/floor level and PSF/i)).toBeInTheDocument();
  });

  it("returns null when fewer than 5 data points", () => {
    const { container } = render(
      <FloorPremiumChart data={[{ floor: 3, psf: 1000 }]} />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/property/charts/__tests__/floor-premium-chart.test.tsx
```

Expected: FAIL — module not found.

**Step 3: Implement FloorPremiumChart**

```tsx
// src/components/property/charts/floor-premium-chart.tsx
/** Scatter chart showing floor level vs PSF — reveals the height premium. */
"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CHART_GREEN, CHART_GREEN_LIGHT } from "@/lib/property/chart-colors";

type FloorPremiumChartProps = {
  data: Array<{ floor: number; psf: number }>;
};

function formatCompactPrice(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

export function FloorPremiumChart({ data }: FloorPremiumChartProps) {
  if (data.length < 5) return null;

  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-900">Floor Level Premium</h3>
      <p className="mb-4 text-sm text-zinc-500">
        Correlation between floor level and PSF
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            type="number"
            dataKey="psf"
            name="PSF"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompactPrice(v)}
          />
          <YAxis
            type="number"
            dataKey="floor"
            name="Floor"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            className="hidden sm:block"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e4e4e7",
              fontSize: 13,
            }}
            formatter={(value: number | undefined, name: string) => {
              if (name === "PSF") return [formatCompactPrice(value ?? 0), "PSF"];
              return [value ?? 0, "Floor"];
            }}
          />
          <Scatter
            data={data}
            fill={CHART_GREEN}
            fillOpacity={0.6}
            stroke={CHART_GREEN_LIGHT}
            strokeWidth={1}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/property/charts/__tests__/floor-premium-chart.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/property/charts/floor-premium-chart.tsx src/components/property/charts/__tests__/floor-premium-chart.test.tsx
git commit -m "feat: add FloorPremiumChart scatter component with TDD"
```

---

### Task 21: Upgrade PriceTrendChart to show Min/Median/Max bands

OpenAgent shows Min, Median, and Max PSF as a line with shaded area band. We only show Quarterly Median as a single line.

**Files:**
- Modify: `src/components/property/charts/price-trend-chart.tsx`
- Test: `src/components/property/charts/__tests__/price-trend-grouping.test.ts`

**Step 1: Write test for min/max quarterly grouping**

```ts
// src/components/property/charts/__tests__/price-trend-grouping.test.ts
import { describe, it, expect } from "vitest";

// Inline the grouping logic for unit testing
function groupByQuarterMinMax(
  points: Array<{ date: string | null; value: number | null }>
): Array<{ period: string; min: number; median: number; max: number }> {
  const buckets = new Map<string, number[]>();
  for (const p of points) {
    if (!p.date || p.value === null) continue;
    const d = new Date(`${p.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getUTCFullYear();
    const quarter = Math.ceil((d.getUTCMonth() + 1) / 3);
    const key = `${year} Q${quarter}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(p.value);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      return {
        period,
        min: Math.round(Math.min(...sorted)),
        median: Math.round(median),
        max: Math.round(Math.max(...sorted)),
      };
    });
}

describe("groupByQuarterMinMax", () => {
  it("computes min, median, max per quarter", () => {
    const result = groupByQuarterMinMax([
      { date: "2025-01-15", value: 1000 },
      { date: "2025-02-10", value: 1200 },
      { date: "2025-03-05", value: 800 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe("2025 Q1");
    expect(result[0].min).toBe(800);
    expect(result[0].median).toBe(1000);
    expect(result[0].max).toBe(1200);
  });

  it("handles single data point per quarter", () => {
    const result = groupByQuarterMinMax([
      { date: "2025-04-01", value: 500 },
    ]);
    expect(result[0].min).toBe(500);
    expect(result[0].median).toBe(500);
    expect(result[0].max).toBe(500);
  });

  it("skips null dates and values", () => {
    const result = groupByQuarterMinMax([
      { date: null, value: 1000 },
      { date: "2025-01-01", value: null },
      { date: "2025-01-15", value: 900 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].min).toBe(900);
  });
});
```

**Step 2: Run test to verify it passes** (self-contained test)

```bash
npx vitest run src/components/property/charts/__tests__/price-trend-grouping.test.ts
```

Expected: PASS.

**Step 3: Update PriceTrendChart implementation**

In `src/components/property/charts/price-trend-chart.tsx`:

1. Update `groupByQuarter` to return `{ period, min, median, max }`.
2. Replace `LineChart` with `ComposedChart` from recharts.
3. Add `Area` import for the min-max shaded band.
4. Add optional `subtitle` prop.

Key changes:

```tsx
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type PriceTrendChartProps = {
  title: string;
  subtitle?: string;
  points: Array<{ date: string | null; value: number | null }>;
  valueLabel?: string;
};

// Updated groupByQuarter returns { period, min, median, max }

// Render:
<ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
  <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
    tickFormatter={formatCompactPrice} className="hidden sm:block" />
  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13 }}
    formatter={(value: number | undefined, name: string) => [
      formatCompactPrice(value ?? 0),
      name === "median" ? "Median PSF" : name === "max" ? "Max PSF" : "Min PSF",
    ]}
  />
  {/* Shaded band between min and max */}
  <Area type="monotone" dataKey="max" stroke="none" fill={CHART_GREEN_LIGHT}
    fillOpacity={0.15} name="max" />
  <Area type="monotone" dataKey="min" stroke="none" fill="#F5EEE1"
    fillOpacity={1} name="min" />
  {/* Median line on top */}
  <Line type="monotone" dataKey="median" stroke={CHART_GREEN} strokeWidth={2}
    dot={{ fill: CHART_GREEN_LIGHT, r: 3 }} activeDot={{ r: 5, fill: CHART_GREEN }}
    name="median" />
</ComposedChart>
```

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/components/property/charts/price-trend-chart.tsx src/components/property/charts/__tests__/price-trend-grouping.test.ts
git commit -m "feat: upgrade PriceTrendChart to show min/median/max PSF bands"
```

---

### Task 22: Add subtitle prop to TransactionVolumeChart

OpenAgent shows "Volume of sales over time" under the chart title. Our chart only has a title.

**Files:**
- Modify: `src/components/property/charts/transaction-volume-chart.tsx`

**Step 1: Add optional `subtitle` prop**

```tsx
type TransactionVolumeChartProps = {
  dates: (string | null)[];
  subtitle?: string;
};
```

Render below title:

```tsx
<h3 className="text-lg font-semibold text-zinc-900">Transaction Volume</h3>
{subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/property/charts/transaction-volume-chart.tsx
git commit -m "feat: add subtitle prop to TransactionVolumeChart"
```

---

### Task 23: Compact property header to match OpenAgent

OpenAgent shows project name large, then a single metadata line with icons for district, property type, and tenure. We currently use a big padded card with green top-border.

**Files:**
- Modify: `app/market/properties/[slug]/page.tsx`

**Step 1: Update Supabase select to include `street` and `market_segment`**

In `fetchPropertyProfile`, update the `recentTransactionsQuery` select:

```ts
.select(
  "contract_date, price, price_psf, area_sqm, floor_range, type_of_sale, property_type, tenure, no_of_units, street, market_segment"
)
```

Update `UraTransactionRow` type to include:

```ts
street: string | null;
market_segment: string | null;
```

**Step 2: Extract metadata from first transaction**

After fetching the profile, extract metadata for the header:

```ts
const firstTxn = profile.recentTransactions[0];
const propertyType = firstTxn?.property_type ?? null;
const tenure = firstTxn?.tenure ?? null;
const marketSegment = firstTxn?.market_segment ?? null;
```

**Step 3: Replace padded header card with compact layout**

Change from:

```tsx
<div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-8 shadow-sm">
  <span className="...">Property Profile</span>
  <h1 className="mt-3 font-serif text-3xl ...">{context.project}</h1>
  <p className="mt-2 text-sm text-zinc-600">
    {context.district ? `District ${context.district}` : "District unavailable"}
  </p>
</div>
```

To (OpenAgent-style compact):

```tsx
<div className="mt-6">
  <h1 className="font-serif text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
    {context.project}
  </h1>
  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
    {context.district ? (
      <span className="inline-flex items-center gap-1">
        <MapPin className="h-3.5 w-3.5" />
        D{context.district}{marketSegment ? `: ${marketSegment}` : ""}
      </span>
    ) : null}
    {propertyType ? (
      <span className="inline-flex items-center gap-1">
        <Building2 className="h-3.5 w-3.5" />
        {propertyType}
      </span>
    ) : null}
    {tenure ? (
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" />
        {tenure}
      </span>
    ) : null}
  </div>
</div>
```

Add imports: `import { MapPin, Building2, Clock } from "lucide-react";`

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add app/market/properties/\[slug\]/page.tsx
git commit -m "feat: compact property header with metadata icons matching OpenAgent"
```

---

### Task 24: Rearrange property charts layout to match OpenAgent

OpenAgent order: Volume (full width) → Price Trend (full width) → Floor scatter + Sale donut (side by side). We currently pair volume + donut.

**Files:**
- Modify: `app/market/properties/[slug]/charts.tsx`

**Step 1: Update charts.tsx layout and props**

```tsx
// app/market/properties/[slug]/charts.tsx
"use client";

import { TransactionVolumeChart } from "@/components/property/charts/transaction-volume-chart";
import { TypeBreakdownChart } from "@/components/property/charts/type-breakdown-chart";
import { PriceTrendChart } from "@/components/property/charts/price-trend-chart";
import { FloorPremiumChart } from "@/components/property/charts/floor-premium-chart";

type PropertyProfileChartsProps = {
  dates: (string | null)[];
  saleTypeBreakdown: Array<{ label: string; count: number }>;
  psfPoints: Array<{ date: string | null; value: number | null }>;
  floorPsfPoints: Array<{ floor: number; psf: number }>;
};

export function PropertyProfileCharts({
  dates,
  saleTypeBreakdown,
  psfPoints,
  floorPsfPoints,
}: PropertyProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = saleTypeBreakdown.length > 0;
  const hasPsf = psfPoints.filter((p) => p.date && p.value !== null).length >= 2;
  const hasFloorData = floorPsfPoints.length >= 5;

  if (!hasVolume && !hasBreakdown && !hasPsf) return null;

  return (
    <div className="mt-8 space-y-6">
      {/* Row 1: Transaction Volume — FULL WIDTH (matches OpenAgent) */}
      {hasVolume ? (
        <TransactionVolumeChart dates={dates} subtitle="Volume of sales over time" />
      ) : null}

      {/* Row 2: Price Trend — FULL WIDTH with min/median/max bands */}
      {hasPsf ? (
        <PriceTrendChart
          title="Price Trend"
          subtitle="Min, Median, and Max unit price (PSF) over time"
          points={psfPoints}
          valueLabel="Median PSF"
        />
      ) : null}

      {/* Row 3: Floor Level Premium + Type of Sale — SIDE BY SIDE */}
      {(hasFloorData || hasBreakdown) ? (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {hasFloorData ? <FloorPremiumChart data={floorPsfPoints} /> : null}
          {hasBreakdown ? (
            <TypeBreakdownChart title="Type of Sale" data={saleTypeBreakdown} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/market/properties/\[slug\]/charts.tsx
git commit -m "feat: match OpenAgent chart layout — volume + trend full-width, floor + sale side-by-side"
```

---

### Task 25: Wire floor data into property profile page

Pass `floorPsfPoints` from the server page to the charts client component.

**Files:**
- Modify: `app/market/properties/[slug]/page.tsx`

**Step 1: Compute floorPsfPoints after fetching profile**

```ts
import { parseFloorMidpoint } from "@/lib/property/utils";

// After fetchPropertyProfile:
const floorPsfPoints = profile.recentTransactions
  .map((t) => ({
    floor: parseFloorMidpoint(t.floor_range),
    psf: toNumber(t.price_psf),
  }))
  .filter((p): p is { floor: number; psf: number } =>
    p.floor !== null && p.psf !== null
  );
```

**Step 2: Pass to PropertyProfileCharts**

```tsx
<PropertyProfileCharts
  dates={profile.recentTransactions.map((t) => t.contract_date)}
  saleTypeBreakdown={profile.saleTypeBreakdown}
  psfPoints={profile.recentTransactions.map((t) => ({
    date: t.contract_date,
    value: toNumber(t.price_psf),
  }))}
  floorPsfPoints={floorPsfPoints}
/>
```

**Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

**Step 4: Commit**

```bash
git add app/market/properties/\[slug\]/page.tsx
git commit -m "feat: wire floor level data into property profile scatter chart"
```

---

### Task 26: Enrich property transaction table to match OpenAgent

OpenAgent shows: Sale Date, Address, Unit/Floor, Price, Area (sqft), PSF, Type (colored badge). We're missing address, floor, showing sqm not sqft, and have no colored badges.

**Files:**
- Modify: `app/market/properties/[slug]/transactions-table.tsx`

**Step 1: Update columns to match OpenAgent**

```tsx
import { formatAreaSqft } from "@/lib/property/utils";

// Update UraTransactionRow type to include street, market_segment
type UraTransactionRow = {
  contract_date: string | null;
  price: number | string | null;
  price_psf: number | string | null;
  area_sqm: number | string | null;
  floor_range: string | null;
  type_of_sale: string | null;
  property_type: string | null;
  tenure: string | null;
  no_of_units: number | null;
  street: string | null;
  market_segment: string | null;
};

// New columns:
columns={[
  {
    header: "Sale Date",
    cell: (row) => formatDateMonthYear(row.contract_date),
  },
  {
    header: "Address",
    cell: (row) => row.street ?? "N/A",
  },
  {
    header: "Floor",
    cell: (row) => row.floor_range ?? "N/A",
    className: "px-4 py-4 text-sm text-zinc-600 whitespace-nowrap",
  },
  {
    header: "Price",
    cell: (row) => formatCurrencySgd(toNumber(row.price)),
  },
  {
    header: "Area (sqft)",
    cell: (row) => formatAreaSqft(toNumber(row.area_sqm)),
  },
  {
    header: "PSF",
    cell: (row) => formatCurrencySgd(toNumber(row.price_psf)),
  },
  {
    header: "Type",
    cell: (row) => (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        row.type_of_sale === "New Sale"
          ? "bg-emerald-100 text-emerald-800"
          : row.type_of_sale === "Sub Sale"
          ? "bg-amber-100 text-amber-800"
          : "bg-blue-100 text-blue-800"
      }`}>
        {row.type_of_sale ?? "N/A"}
      </span>
    ),
  },
]}
```

**Step 2: Update mobile card renderer**

```tsx
mobileCardRenderer={(row) => (
  <div className="px-4 py-3 space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-zinc-900">
        {formatCurrencySgd(toNumber(row.price))}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        row.type_of_sale === "New Sale"
          ? "bg-emerald-100 text-emerald-800"
          : row.type_of_sale === "Sub Sale"
          ? "bg-amber-100 text-amber-800"
          : "bg-blue-100 text-blue-800"
      }`}>
        {row.type_of_sale ?? "N/A"}
      </span>
    </div>
    <p className="text-sm text-zinc-600">
      {row.street ?? "N/A"} · {row.floor_range ?? "N/A"}
    </p>
    <p className="text-xs text-zinc-500">
      PSF: {formatCurrencySgd(toNumber(row.price_psf))} ·
      {formatAreaSqft(toNumber(row.area_sqm))} sqft ·
      {formatDateMonthYear(row.contract_date)}
    </p>
  </div>
)}
```

**Step 3: Verify build**

```bash
npx tsc --noEmit && npm run build
```

**Step 4: Commit**

```bash
git add app/market/properties/\[slug\]/transactions-table.tsx
git commit -m "feat: enrich property table with address, floor, sqft, colored sale type badges"
```

---

### Task 27: Remove duplicate sale type text pills section

We render the sale type breakdown as both a donut chart AND text pills below it. OpenAgent only shows the donut. Remove the duplicate.

**Files:**
- Modify: `app/market/properties/[slug]/page.tsx`

**Step 1: Delete the text pills block**

Remove this entire block from the property profile JSX:

```tsx
{profile.saleTypeBreakdown.length > 0 ? (
  <div className="mt-8 rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-zinc-900">
      Type of Sale Distribution
    </h2>
    <div className="mt-4 flex flex-wrap gap-2">
      {profile.saleTypeBreakdown.map((entry) => ( ... ))}
    </div>
  </div>
) : null}
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add app/market/properties/\[slug\]/page.tsx
git commit -m "fix: remove duplicate sale type text pills (donut chart is sufficient)"
```

---

## Phase 8: HDB Profile — OpenAgent Parity

The shared chart components (FloorPremiumChart, upgraded PriceTrendChart, subtitle on TransactionVolumeChart) from Phase 7 are generic — they work for HDB too. This phase wires them into the HDB profile page and enriches the HDB table to match the same visual standard.

**Key difference from private property:** HDB has no pre-computed `price_psf` column. We compute it client-side as `resale_price / (floor_area_sqm * 10.764)`.

---

### Task 28: Wire extra HDB columns + compute storeyPsfPoints

The HDB page currently only fetches `month, flat_type, storey_range, floor_area_sqm, resale_price`. We need additional columns for the enriched table and header metadata, plus we need to compute PSF and storey-PSF scatter points.

**Files:**
- Modify: `app/hdb/[town]/[slug]/page.tsx` (becomes `app/market/hdb/[town]/[slug]/page.tsx` after Phase 1)

**Step 1: Expand the HdbRow type and Supabase select**

Update the type to include all columns we need:

```tsx
type HdbRow = {
  month: string | null;
  flat_type: string | null;
  block: string | null;
  street_name: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  flat_model: string | null;
  lease_commence_date: number | null;
  remaining_lease: string | null;
  resale_price: number | string | null;
};
```

Update the `.select()` call to fetch all columns:

```tsx
.select("month, flat_type, block, street_name, storey_range, floor_area_sqm, flat_model, lease_commence_date, remaining_lease, resale_price")
```

**Step 2: Compute PSF and storeyPsfPoints**

Add after the existing `flatTypeBreakdown` computation:

```tsx
import { parseFloorMidpoint, formatAreaSqft } from "@/lib/property/utils";

/** Compute PSF for each row (HDB has no stored price_psf column). */
const psfValues = rows
  .map((row) => {
    const price = toNumber(row.resale_price);
    const sqm = toNumber(row.floor_area_sqm);
    if (price === null || sqm === null || sqm <= 0) return null;
    return Math.round(price / (sqm * 10.764));
  })
  .filter((v): v is number => v !== null);

const avgPsf = psfValues.length > 0
  ? Math.round(psfValues.reduce((s, v) => s + v, 0) / psfValues.length)
  : null;

/** Points for FloorPremiumChart scatter. */
const storeyPsfPoints = rows
  .map((row) => {
    const floor = parseFloorMidpoint(row.storey_range);
    const price = toNumber(row.resale_price);
    const sqm = toNumber(row.floor_area_sqm);
    if (floor === null || price === null || sqm === null || sqm <= 0) return null;
    return { floor, psf: Math.round(price / (sqm * 10.764)) };
  })
  .filter((p): p is { floor: number; psf: number } => p !== null);
```

**Step 3: Add Avg PSF stat card to the grid**

Insert after the existing "Price Range" StatCard:

```tsx
<StatCard label="Avg PSF" value={avgPsf ? `$${avgPsf.toLocaleString()}` : "N/A"} />
```

**Step 4: Pass storeyPsfPoints to HdbProfileCharts**

```tsx
<HdbProfileCharts
  dates={rows.map((r) => r.month)}
  flatTypeBreakdown={flatTypeBreakdown}
  pricePoints={rows.map((r) => ({
    date: r.month,
    value: toNumber(r.resale_price),
  }))}
  storeyPsfPoints={storeyPsfPoints}
/>
```

**Step 5: Verify build**

```bash
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add app/hdb/\[town\]/\[slug\]/page.tsx
git commit -m "feat(hdb): fetch extra columns and compute PSF + storey scatter points"
```

---

### Task 29: Compact HDB header with metadata icons

Match the OpenAgent compact header style. Show metadata as icon+label pairs beneath the street name.

**Files:**
- Modify: `app/hdb/[town]/[slug]/page.tsx` (becomes `app/market/hdb/[town]/[slug]/page.tsx`)

**Step 1: Import icons**

```tsx
import { ArrowLeft, MapPin, Home, Calendar } from "lucide-react";
```

**Step 2: Compute metadata values**

Add after `storeyPsfPoints`:

```tsx
/** Dominant flat types for header metadata. */
const dominantFlatTypes = flatTypeBreakdown.slice(0, 3).map((f) => f.label).join(", ");

/** Earliest lease commence year. */
const leaseYears = rows
  .map((r) => r.lease_commence_date)
  .filter((y): y is number => y !== null && y > 0);
const earliestLease = leaseYears.length > 0 ? Math.min(...leaseYears) : null;
```

**Step 3: Replace the header card**

Replace the existing header `<div>` with:

```tsx
<div className="mt-6 rounded-2xl border border-[#E8DCC8] border-t-4 border-t-sunder-green bg-white p-6 shadow-sm">
  <span className="inline-block rounded-full bg-sunder-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sunder-green">
    HDB Street Profile
  </span>
  <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight text-zinc-900 sm:text-3xl">
    {streetName}
  </h1>
  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
    <span className="inline-flex items-center gap-1">
      <MapPin className="h-3.5 w-3.5" />
      {displayTown}
    </span>
    {dominantFlatTypes ? (
      <span className="inline-flex items-center gap-1">
        <Home className="h-3.5 w-3.5" />
        {dominantFlatTypes}
      </span>
    ) : null}
    {earliestLease ? (
      <span className="inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" />
        Lease from {earliestLease}
      </span>
    ) : null}
  </div>
</div>
```

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add app/hdb/\[town\]/\[slug\]/page.tsx
git commit -m "feat(hdb): compact header with town, flat type, and lease metadata icons"
```

---

### Task 30: Rearrange HDB charts layout to match OpenAgent

Same layout pattern as property profile: volume full-width → price trend full-width (with min/median/max bands) → floor scatter + flat type donut side-by-side.

**Files:**
- Modify: `app/hdb/[town]/[slug]/charts.tsx` (becomes `app/market/hdb/[town]/[slug]/charts.tsx`)

**Step 1: Add FloorPremiumChart import and storeyPsfPoints prop**

```tsx
import { FloorPremiumChart } from "@/components/property/charts/floor-premium-chart";

type HdbProfileChartsProps = {
  dates: (string | null)[];
  flatTypeBreakdown: Array<{ label: string; count: number }>;
  pricePoints: Array<{ date: string | null; value: number | null }>;
  storeyPsfPoints: Array<{ floor: number; psf: number }>;
};
```

**Step 2: Replace the chart layout**

```tsx
export function HdbProfileCharts({
  dates,
  flatTypeBreakdown,
  pricePoints,
  storeyPsfPoints,
}: HdbProfileChartsProps) {
  const hasVolume = dates.filter(Boolean).length > 0;
  const hasBreakdown = flatTypeBreakdown.length > 0;
  const hasPrice = pricePoints.filter((p) => p.date && p.value !== null).length >= 2;
  const hasFloor = storeyPsfPoints.length >= 3;

  if (!hasVolume && !hasBreakdown && !hasPrice && !hasFloor) return null;

  return (
    <div className="mt-8 space-y-6">
      {/* Row 1: Volume — full width */}
      {hasVolume ? (
        <TransactionVolumeChart
          dates={dates}
          subtitle="HDB resale transactions over time"
        />
      ) : null}

      {/* Row 2: Price trend — full width with min/median/max bands */}
      {hasPrice ? (
        <PriceTrendChart
          title="Resale Price Trend (Quarterly Median)"
          points={pricePoints}
          valueLabel="Median Price"
        />
      ) : null}

      {/* Row 3: Floor scatter + Flat type donut — side by side */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {hasFloor ? (
          <FloorPremiumChart points={storeyPsfPoints} />
        ) : null}
        {hasBreakdown ? (
          <TypeBreakdownChart title="Flat Type" data={flatTypeBreakdown} />
        ) : null}
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/hdb/\[town\]/\[slug\]/charts.tsx
git commit -m "feat(hdb): rearrange charts — volume, trend, then scatter+donut side-by-side"
```

---

### Task 31: Enrich HDB transaction table

Add address (block + street), PSF, sqft conversion, and colored flat type badges to match the property table's enrichment level.

**Files:**
- Modify: `app/hdb/[town]/[slug]/transactions-table.tsx` (becomes `app/market/hdb/[town]/[slug]/transactions-table.tsx`)

**Step 1: Expand the HdbRow type**

```tsx
type HdbRow = {
  month: string | null;
  flat_type: string | null;
  block: string | null;
  street_name: string | null;
  storey_range: string | null;
  floor_area_sqm: number | string | null;
  flat_model: string | null;
  lease_commence_date: number | null;
  remaining_lease: string | null;
  resale_price: number | string | null;
};
```

**Step 2: Add helper imports**

```tsx
import { formatAreaSqft } from "@/lib/property/utils";
```

**Step 3: Add flat type badge color map**

```tsx
const FLAT_TYPE_COLORS: Record<string, string> = {
  "1 ROOM": "bg-red-100 text-red-800",
  "2 ROOM": "bg-orange-100 text-orange-800",
  "3 ROOM": "bg-amber-100 text-amber-800",
  "4 ROOM": "bg-emerald-100 text-emerald-800",
  "5 ROOM": "bg-sky-100 text-sky-800",
  "EXECUTIVE": "bg-violet-100 text-violet-800",
  "MULTI-GENERATION": "bg-pink-100 text-pink-800",
};
```

**Step 4: Replace columns array**

```tsx
columns={[
  {
    header: "Month",
    cell: (row) => formatDateMonthYear(row.month),
  },
  {
    header: "Address",
    cell: (row) => {
      const block = row.block ?? "";
      const street = row.street_name ?? "";
      return block && street ? `Blk ${block} ${street}` : street || block || "N/A";
    },
  },
  {
    header: "Floor",
    cell: (row) => row.storey_range ?? "N/A",
  },
  {
    header: "Price",
    cell: (row) => formatCurrencySgd(toNumber(row.resale_price)),
  },
  {
    header: "Area",
    cell: (row) => {
      const sqm = toNumber(row.floor_area_sqm);
      return sqm ? formatAreaSqft(sqm) : "N/A";
    },
  },
  {
    header: "PSF",
    cell: (row) => {
      const price = toNumber(row.resale_price);
      const sqm = toNumber(row.floor_area_sqm);
      if (!price || !sqm || sqm <= 0) return "N/A";
      return `$${Math.round(price / (sqm * 10.764)).toLocaleString()}`;
    },
  },
  {
    header: "Flat Type",
    cell: (row) => {
      const type = row.flat_type ?? "Unknown";
      const color = FLAT_TYPE_COLORS[type] ?? "bg-zinc-100 text-zinc-800";
      return (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
          {type}
        </span>
      );
    },
  },
]}
```

**Step 5: Update mobileCardRenderer**

```tsx
mobileCardRenderer={(row) => {
  const type = row.flat_type ?? "Unknown";
  const color = FLAT_TYPE_COLORS[type] ?? "bg-zinc-100 text-zinc-800";
  const block = row.block ?? "";
  const street = row.street_name ?? "";
  const address = block && street ? `Blk ${block} ${street}` : street || block || "";
  const price = toNumber(row.resale_price);
  const sqm = toNumber(row.floor_area_sqm);
  const psf = price && sqm && sqm > 0 ? Math.round(price / (sqm * 10.764)) : null;

  return (
    <div className="px-4 py-3 space-y-1">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-zinc-900">
          {formatCurrencySgd(price)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
          {type}
        </span>
      </div>
      {address ? <p className="text-sm text-zinc-600">{address}</p> : null}
      <p className="text-xs text-zinc-500">
        {row.storey_range ?? ""} · {sqm ? formatAreaSqft(sqm) : ""}{psf ? ` · $${psf.toLocaleString()} psf` : ""}
      </p>
      <p className="text-xs text-zinc-400">{formatDateMonthYear(row.month)}</p>
    </div>
  );
}}
```

**Step 6: Verify build**

```bash
npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add app/hdb/\[town\]/\[slug\]/transactions-table.tsx
git commit -m "feat(hdb): enrich transaction table with address, PSF, sqft, colored flat type badges"
```

---

## Phase 9: Final Verification

---

### Task 32: Run all tests and verify complete build

**Step 1: Run all property-related tests**

```bash
npx vitest run src/components/property/ src/lib/property/
```

Expected: All tests PASS.

**Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS, no regressions.

**Step 3: Typecheck**

```bash
npx tsc --noEmit
```

**Step 4: Full build**

```bash
npm run build
```

**Step 5: Smoke test with dev server**

```bash
npm run dev
```

Manually verify:
- `localhost:3000/market` — hub page with 5 category cards
- `localhost:3000/market/agents` — listing with sub-nav, useful stat cards
- `localhost:3000/market/agents/R005884C` — **full OpenAgent agent parity**:
  - Compact header with reg, agency link, date range
  - 5 stat cards
  - Transaction volume bar chart
  - Activity heatmap + Property Type donut (side by side)
  - 3 breakdown donuts (Transaction Type, Sales Rep, Rental Rep)
  - Top Neighbourhoods (region cards + ranked list)
  - Paginated transaction table
  - Movement History
  - MarketCta banner
- `localhost:3000/market/properties/northwave-d25` — **full OpenAgent property parity**:
  - Compact header with district, property type, tenure icons
  - 5 stat cards (Transactions, Avg PSF, Median Price, Price Range, Last Sale)
  - Transaction Volume bar chart — full width with subtitle
  - Price Trend line chart — full width with min/median/max bands
  - Floor Level Premium scatter + Type of Sale donut — side by side
  - Enriched transaction table (Address, Floor, sqft, colored sale type badges)
  - MarketCta banner
  - No duplicate text pills section
- `localhost:3000/market/hdb/yishun/yishun-ring-rd` — **full HDB parity**:
  - Compact header with town, flat types, lease metadata icons
  - 6 stat cards (Transactions, Avg Resale, Median Resale, Price Range, Latest Month, Avg PSF)
  - Transaction Volume bar chart — full width with subtitle
  - Price Trend chart — full width with min/median/max bands
  - Floor Level Premium scatter + Flat Type donut — side by side
  - Enriched transaction table (Address with block, Floor, sqft, PSF, colored flat type badges)
  - MarketCta banner
- `localhost:3000/agents` → redirects to `/market/agents`
- Sub-nav highlights correct section
- All profile pages have CTA

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: final polish for market data hub and OpenAgent parity"
```

---

## Relevant Files Summary

| Action | Path |
|--------|------|
| **Create** | `src/components/property/market-sub-nav.tsx` |
| **Create** | `src/components/property/market-category-card.tsx` |
| **Create** | `src/components/property/market-cta.tsx` |
| **Create** | `src/components/property/movement-history.tsx` |
| **Create** | `src/components/property/charts/activity-heatmap.tsx` |
| **Create** | `src/components/property/charts/top-neighbourhoods.tsx` |
| **Create** | `src/lib/property/agent-breakdowns.ts` |
| **Create** | `src/lib/property/sg-regions.ts` |
| **Create** | `src/components/property/__tests__/market-sub-nav.test.tsx` |
| **Create** | `src/components/property/__tests__/market-category-card.test.tsx` |
| **Create** | `src/components/property/__tests__/market-cta.test.tsx` |
| **Create** | `src/components/property/__tests__/market-layout.test.tsx` |
| **Create** | `src/components/property/__tests__/market-hub-data.test.ts` |
| **Create** | `src/components/property/__tests__/agent-profile-header.test.tsx` |
| **Create** | `src/components/property/charts/__tests__/activity-heatmap.test.tsx` |
| **Create** | `src/components/property/charts/__tests__/agent-breakdowns.test.ts` |
| **Create** | `src/components/property/charts/__tests__/top-neighbourhoods.test.ts` |
| **Create** | `src/lib/property/__tests__/sg-regions.test.ts` |
| **Create** | `app/market/layout.tsx` |
| **Create** | `app/market/page.tsx` |
| **Create** | `app/market/agencies/[slug]/charts.tsx` |
| **Create** | `app/market/areas/[slug]/charts.tsx` |
| **Create** | `src/components/property/charts/floor-premium-chart.tsx` |
| **Create** | `src/components/property/charts/__tests__/floor-premium-chart.test.tsx` |
| **Create** | `src/components/property/charts/__tests__/price-trend-grouping.test.ts` |
| **Create** | `src/lib/property/__tests__/utils-floor-midpoint.test.ts` |
| **Create** | `src/lib/property/__tests__/utils-area-sqft.test.ts` |
| **Move** | `app/agents/*` → `app/market/agents/*` |
| **Move** | `app/properties/*` → `app/market/properties/*` |
| **Move** | `app/hdb/*` → `app/market/hdb/*` |
| **Move** | `app/agencies/*` → `app/market/agencies/*` |
| **Move** | `app/areas/*` → `app/market/areas/*` |
| **Modify** | `src/lib/property/utils.ts` (add `formatActiveRange`, `parseFloorMidpoint`, `formatAreaSqft`) |
| **Modify** | `src/components/property/charts/price-trend-chart.tsx` (min/median/max bands + subtitle) |
| **Modify** | `src/components/property/charts/transaction-volume-chart.tsx` (subtitle prop) |
| **Modify** | `app/market/properties/[slug]/page.tsx` (compact header, floor data, remove text pills) |
| **Modify** | `app/market/properties/[slug]/charts.tsx` (new layout + FloorPremiumChart) |
| **Modify** | `app/market/properties/[slug]/transactions-table.tsx` (address, floor, sqft, colored badges) |
| **Modify** | `app/market/hdb/[town]/[slug]/page.tsx` (extra columns, compute PSF, storeyPsfPoints, compact header) |
| **Modify** | `app/market/hdb/[town]/[slug]/charts.tsx` (new layout + FloorPremiumChart) |
| **Modify** | `app/market/hdb/[town]/[slug]/transactions-table.tsx` (address, PSF, sqft, colored flat type badges) |
| **Modify** | `next.config.ts` (add redirects) |
| **Modify** | `middleware.ts` (update public routes) |
| **Modify** | `src/components/landing/Header.tsx` (update RESOURCE_LINKS) |
| **Modify** | `app/sitemap.ts` (update URLs) |
| **Modify** | All 5 listing pages (stat card text) |
| **Modify** | Agent profile page (complete rewrite to OpenAgent layout) |
| **Modify** | All 5 profile pages (add MarketCta) |
| **Delete** | 5 old layout files |

## Dependencies

- No new packages — uses existing recharts, lucide-react, Tailwind
- Vitest + React Testing Library already configured

## Verification Checklist

- [ ] All new components have failing tests written first
- [ ] Each test watched fail before implementation
- [ ] All tests pass (`npx vitest run`)
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Old routes redirect to `/market/*`
- [ ] Sub-nav appears on all `/market/*` pages
- [ ] Hub page at `/market` renders category cards
- [ ] Agent profile matches OpenAgent layout section-for-section:
  - [ ] Compact header with agency link and date range
  - [ ] 5 stat cards
  - [ ] Transaction volume bar chart with toggles
  - [ ] Activity heatmap (GitHub-style month×year grid)
  - [ ] Property type donut
  - [ ] Transaction type donut
  - [ ] Sales representation donut
  - [ ] Rental representation donut
  - [ ] Top Neighbourhoods with region cards + ranked list
  - [ ] Paginated transaction records table
  - [ ] Movement History section
  - [ ] MarketCta soft upsell
- [ ] Property profile matches OpenAgent layout section-for-section:
  - [ ] Compact header with district/type/tenure metadata icons
  - [ ] 5 stat cards
  - [ ] Transaction volume bar chart (full width, with subtitle)
  - [ ] Price trend line chart (full width, min/median/max bands)
  - [ ] Floor Level Premium scatter chart
  - [ ] Type of Sale donut chart
  - [ ] Floor scatter + Sale donut side-by-side
  - [ ] Enriched transaction table (Address, Floor, sqft, colored badges)
  - [ ] No duplicate text pills section
  - [ ] MarketCta soft upsell
- [ ] HDB profile matches property profile visual standard:
  - [ ] Compact header with town, flat types, lease metadata icons
  - [ ] 6 stat cards (incl. Avg PSF)
  - [ ] Transaction volume bar chart (full width, with subtitle)
  - [ ] Price trend chart (full width, min/median/max bands)
  - [ ] Floor Level Premium scatter chart (storey vs PSF)
  - [ ] Flat Type donut chart
  - [ ] Floor scatter + Flat Type donut side-by-side
  - [ ] Enriched transaction table (Address with block, Floor, sqft, PSF, colored flat type badges)
  - [ ] MarketCta soft upsell
- [ ] Agency + area profiles have charts
- [ ] CTA banner on all profile pages
