# UI Production Readiness Audit Remediation Implementation Plan

**Goal:** Make the current dashboard and marketing UI pass a production build, remove the remaining high-impact responsiveness gaps from the 2026-04-23 audit rerun, and ship consistent Sunder branding across live user-facing surfaces.

**Architecture:** Reuse the three focused tasklists already drafted on 2026-04-23 for route loading/dataflow, CRM hot-path performance, and chat/tasks/settings performance. This master plan owns the remaining gaps those plans do not cover: unblock the type-checking build failure, lazy-load the command menu after first open, stop the landing smooth-scroll RAF leak, sweep inconsistent `NeoBot`/`document processing` copy, and finish with a hard production verification gate. Keep the existing Next.js App Router, TanStack Query, and Supabase architecture. No new state layer, no UI redesign, no framework swap.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query v5, Supabase JS, Vitest, React Testing Library, Next bundle analyzer

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Implement the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Relevant Files

- Reference: `docs/tasks/2026-04-23-route-loading-and-dataflow-perf-tasklist.md`
- Reference: `docs/tasks/2026-04-23-crm-hot-path-perf-tasklist.md`
- Reference: `docs/tasks/2026-04-23-chat-tasks-settings-perf-tasklist.md`
- Modify: `src/lib/crm/view-state.ts`
- Test: `src/lib/crm/__tests__/view-state.test.ts`
- Modify: `src/components/layout/app-layout.tsx`
- Test: `src/components/layout/app-layout.test.tsx`
- Modify: `app/page.tsx`
- Modify: `src/components/landing/SmoothScroll.tsx`
- Create: `src/components/landing/SmoothScroll.test.tsx`
- Create: `src/lib/branding/site.ts`
- Create: `src/lib/branding/site.test.ts`
- Modify: `app/layout.tsx`
- Create: `app/page.test.tsx`
- Modify: `src/components/landing/Header.tsx`
- Modify: `src/components/landing/Logo.tsx`
- Modify: `src/components/landing/Footer.tsx`
- Create: `src/components/landing/Footer.test.tsx`
- Modify: `src/components/landing/Faqs.tsx`
- Modify: `src/components/landing/SlimLayout.tsx`
- Modify: `src/components/landing/WhatsAppCard.tsx`
- Modify: `src/components/landing/WhatsAppPhoneMockup.tsx`
- Modify: `app/demo/page.tsx`
- Modify: `src/components/property/market-cta.tsx`

## Skills To Use

- `@plan` for keeping the master sequencing document authoritative and DRY
- `@nextjs-best-practices` for Server Component boundaries, route loading, and dynamic import placement
- `@vercel-react-best-practices` for `bundle-dynamic-imports`, `rendering-content-visibility`, `rerender-transitions`, and avoiding effect-driven work
- `@test-driven-development` for every parent task
- `@requesting-code-review` after each parent task is green

## Parallel Ownership Boundary

- The three referenced 2026-04-23 tasklists remain the leaf plans for route loading/dataflow, CRM hot-path performance, and chat/tasks/settings performance.
- This master tasklist owns only the work those plans do not cover: the build blocker, command-menu lazy loading, landing smooth-scroll cleanup, branding/metadata consistency, and the final production gate.
- Do **not** reopen the scope of the three referenced tasklists here. If a file conflict appears while landing them, resolve the conflict and return to the owning plan.

## Notes

- This plan is derived from the 2026-04-23 UI audit rerun. No separate design doc was provided, so the audit findings and the shipped code are the source of truth for this batch.
- `pnpm build` currently fails on `src/lib/crm/view-state.ts`. Task 1 must land before you claim any of the other tasks are production-ready.
- The existing three tasklists already contain exact files, code snippets, tests, and commit guidance. Execute them instead of rewriting them.
- Use `rg -n 'NeoBot|AI Document Processing|neobot.com' app src/components src/lib` before and after the branding sweep. The before-result is your checklist. The after-result should contain only harmless historical comments, if any.
- If any Managed Agents-related test is involved while running these tasks, use `claude-haiku-4-5` only.

---

### Task 1: Unblock the production build by narrowing CRM saved-view filter types

**Files:**
- Modify: `src/lib/crm/view-state.ts`
- Test: `src/lib/crm/__tests__/view-state.test.ts`

**Step 1: Add a regression test next to the saved-view normalizer**

Append this test to `src/lib/crm/__tests__/view-state.test.ts`:

```ts
it("keeps valid saved-view filters when malformed partial state is normalized", () => {
  const result = normalizeCrmViewState({
    entityType: "deals",
    state: {
      filters: {
        stage: ["offer"],
        created_at_after: "$today",
      },
    },
  });

  expect(result.filters).toEqual({
    stage: ["offer"],
    created_at_after: "$today",
  });
});
```

**Step 2: Reproduce the current failure**

Run:

```bash
pnpm vitest run src/lib/crm/__tests__/view-state.test.ts
pnpm build
```

Expected:

- The Vitest file still passes or remains green.
- `pnpm build` FAILS with the existing type error at `src/lib/crm/view-state.ts:144` about `Record<string, unknown>` not matching the stricter filter shape.

**Step 3: Write the minimal type-safe fix**

Update `src/lib/crm/view-state.ts` so the filter helper returns the schema-backed type instead of a widened record:

```ts
import {
  ENTITY_ALLOWED_COLUMNS,
  viewFiltersSchema,
  type ViewFilters,
} from "@/lib/crm/view-filters";

function normalizeFilters(value: unknown): ViewFilters {
  const parsed = viewFiltersSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
```

Do **not** widen `CrmViewStatePatch`. Fix the helper type instead.

**Step 4: Verify the fix**

Run:

```bash
pnpm vitest run src/lib/crm/__tests__/view-state.test.ts
pnpm build
```

Expected:

- The saved-view tests PASS.
- `pnpm build` no longer fails on `src/lib/crm/view-state.ts`.

**Step 5: Commit**

```bash
git add src/lib/crm/view-state.ts src/lib/crm/__tests__/view-state.test.ts
git commit -m "fix(prXX): unblock crm view state build typing"
```

---

### Task 2: Land the route loading and dataflow pass exactly as already planned

**Files:**
- Reference: `docs/tasks/2026-04-23-route-loading-and-dataflow-perf-tasklist.md`

**Step 1: Treat the referenced tasklist as authoritative**

Open `docs/tasks/2026-04-23-route-loading-and-dataflow-perf-tasklist.md` and copy its `Relevant Files`, `Notes`, and parent tasks into your working checklist for this branch.

**Step 2: Execute the referenced parent tasks in order**

Run the exact TDD loop from the referenced tasklist for:

1. Shared CRM list loading shells
2. Tasks/Meetings/Settings route-level loading shells
3. Pricing server fetch parallelization
4. Meeting transcript deferral

Do **not** change scope while executing it.

**Step 3: Run the referenced verification commands**

Run every test command listed in the referenced tasklist, plus this smoke bundle:

```bash
pnpm vitest run \
  src/components/crm/__tests__/crm-list-loading-shell.test.tsx \
  src/components/crm/__tests__/tasks-page-loading.test.tsx \
  src/components/meetings/__tests__/meeting-detail-loading.test.tsx \
  src/components/settings/__tests__/settings-page-loading.test.tsx \
  app/'(dashboard)'/pricing/__tests__/page.test.tsx \
  app/'(dashboard)'/meetings/'[id]'/page.test.tsx
```

Expected: PASS.

**Step 4: Manual QA**

Run the app and verify these routes show route-shaped loading states instead of a generic spinner:

- `/customers/deals`
- `/customers/companies`
- `/customers/people`
- `/tasks`
- `/meetings`
- `/meetings/[id]`
- `/settings`

**Step 5: Commit**

```bash
git add app src/components
git commit -m "perf(prXX): finish route loading and dataflow pass"
```

---

### Task 3: Land the CRM hot-path performance pass exactly as already planned

**Files:**
- Reference: `docs/tasks/2026-04-23-crm-hot-path-perf-tasklist.md`

**Step 1: Treat the referenced tasklist as authoritative**

Open `docs/tasks/2026-04-23-crm-hot-path-perf-tasklist.md` and use its `Relevant Files` section as the source of truth for the files you touch.

**Step 2: Execute the referenced parent tasks in order**

Run the exact TDD loop from the referenced tasklist for:

1. `QuickEditCell` memoization
2. Stable deals-page cell props and callbacks
3. Stable companies-page props and empty filter objects
4. Stable people-page props and empty filter objects
5. Optimistic cache updates for deal/company/contact edits and deletes

Do **not** add virtualization, new state containers, or a drawer URL redesign.

**Step 3: Run the referenced verification commands**

Run every test command listed in the referenced tasklist, plus this focused bundle:

```bash
pnpm vitest run \
  src/components/crm/__tests__/quick-edit-cell.test.tsx \
  src/components/ui/__tests__/list-table.test.tsx \
  src/components/crm/__tests__/kanban-board.test.tsx \
  "app/(dashboard)/customers/deals/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/companies/__tests__/page.test.tsx" \
  "app/(dashboard)/customers/people/__tests__/page.test.tsx"
```

Expected: PASS.

**Step 4: Manual QA**

Run the app and verify:

- typing into inline cells feels immediate
- board moves reflect immediately
- customer pages stop flashing stale values after edits
- opening a drawer does not rerender the entire visible list unnecessarily

**Step 5: Commit**

```bash
git add app src/components src/hooks
git commit -m "perf(prXX): finish crm hot path pass"
```

---

### Task 4: Land the chat, tasks, and settings performance pass exactly as already planned

**Files:**
- Reference: `docs/tasks/2026-04-23-chat-tasks-settings-perf-tasklist.md`

**Step 1: Treat the referenced tasklist as authoritative**

Open `docs/tasks/2026-04-23-chat-tasks-settings-perf-tasklist.md` and use its `Relevant Files` section as the source of truth for the files you touch.

**Step 2: Execute the referenced parent tasks in order**

Run the exact TDD loop from the referenced tasklist for:

1. deferred Tasks search and code-split non-table task views
2. optimistic task updates
3. chat long-thread rendering improvements
4. settings control cleanup

Do **not** replace chat transport or add a virtualization dependency unless the referenced plan explicitly proves it is needed.

**Step 3: Run the referenced verification commands**

Run every test command listed in the referenced tasklist, plus this focused bundle:

```bash
pnpm vitest run \
  "app/(dashboard)/tasks/__tests__/page.test.tsx" \
  src/hooks/__tests__/use-update-crm-task.test.ts \
  src/components/chat/__tests__/message-list.test.tsx \
  src/components/settings/messaging-channels/__tests__/telegram-connect-row.test.tsx \
  src/components/settings/__tests__/settings-nav.test.tsx
```

Expected: PASS.

**Step 4: Manual QA**

Verify:

- `/tasks` search responds without a 1s “dead” feel
- switching between tasks table/kanban/calendar does not stall
- long chat threads stay scrollable
- the Telegram connect row and mobile settings navigation no longer log render-phase warnings

**Step 5: Commit**

```bash
git add app src/components src/hooks app/globals.css
git commit -m "perf(prXX): finish chat tasks settings pass"
```

---

### Task 5: Lazy-load the command menu after the first real open

**Files:**
- Modify: `src/components/layout/app-layout.tsx`
- Test: `src/components/layout/app-layout.test.tsx`

**Step 1: Write the failing test**

Update `src/components/layout/app-layout.test.tsx` so the `CommandMenu` mock records every render:

```tsx
const mockCommandMenuRender = vi.fn();

vi.mock("@/components/command-menu", () => ({
  CommandMenu: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => {
    mockCommandMenuRender(open);
    return open ? <input aria-label="Global search" placeholder="Search records..." /> : null;
  },
}));

it("does not mount the command menu before the user opens it", () => {
  render(
    <AppLayout>
      <div>Page Content</div>
    </AppLayout>,
  );

  expect(mockCommandMenuRender).not.toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/layout/app-layout.test.tsx
```

Expected: FAIL because `AppLayout` currently mounts `CommandMenu` immediately with `open={false}`.

**Step 3: Write minimal implementation**

Refactor `src/components/layout/app-layout.tsx` to lazy-load the menu module and only mount it after the first real open:

```tsx
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const LazyCommandMenu = dynamic(
  () => import("@/components/command-menu").then((mod) => ({ default: mod.CommandMenu })),
  { ssr: false },
);

const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
const [hasOpenedCommandMenu, setHasOpenedCommandMenu] = useState(false);

const handleCommandMenuOpenChange = useCallback((nextOpen: boolean) => {
  if (nextOpen) {
    setHasOpenedCommandMenu(true);
  }

  setIsCommandMenuOpen(nextOpen);
}, []);

// ...

{hasOpenedCommandMenu ? (
  <LazyCommandMenu
    open={isCommandMenuOpen}
    onOpenChange={handleCommandMenuOpenChange}
  />
) : null}
```

Route the sidebar “Search” button and the keyboard shortcut through `handleCommandMenuOpenChange(true)` so the first open loads the module and all later opens stay instant.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/layout/app-layout.test.tsx
```

Expected: PASS.

**Step 5: Manual smoke**

Run the app and verify:

- dashboard loads normally
- `Cmd+K` or `Ctrl+K` opens the global search dialog
- clicking the sidebar search entry still opens the same dialog

**Step 6: Commit**

```bash
git add src/components/layout/app-layout.tsx src/components/layout/app-layout.test.tsx
git commit -m "perf(prXX): lazy load command menu after first open"
```

---

### Task 6: Fix the landing smooth-scroll RAF leak and keep the wrapper cheap

**Files:**
- Modify: `app/page.tsx`
- Modify: `src/components/landing/SmoothScroll.tsx`
- Create: `src/components/landing/SmoothScroll.test.tsx`

**Step 1: Write the failing test**

Create `src/components/landing/SmoothScroll.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SmoothScroll } from "./SmoothScroll";

const destroySpy = vi.fn();

vi.mock("lenis", () => ({
  default: vi.fn().mockImplementation(() => ({
    raf: vi.fn(),
    destroy: destroySpy,
  })),
}));

describe("SmoothScroll", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    destroySpy.mockReset();
  });

  it("cancels the scheduled animation frame on unmount", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(123);
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

    const { unmount } = render(
      <SmoothScroll>
        <div>Landing</div>
      </SmoothScroll>,
    );

    unmount();

    expect(cancelSpy).toHaveBeenCalledWith(123);
    expect(destroySpy).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/components/landing/SmoothScroll.test.tsx
```

Expected: FAIL because `SmoothScroll` currently starts a recursive `requestAnimationFrame` loop and never calls `cancelAnimationFrame` during cleanup.

**Step 3: Write minimal implementation**

Update `src/components/landing/SmoothScroll.tsx` to keep the current behavior but clean up correctly:

```tsx
const rafIdRef = useRef<number | null>(null);

function raf(time: number) {
  lenis.raf(time);
  rafIdRef.current = requestAnimationFrame(raf);
}

rafIdRef.current = requestAnimationFrame(raf);

return () => {
  if (rafIdRef.current !== null) {
    cancelAnimationFrame(rafIdRef.current);
  }

  lenis.destroy();
  lenisRef.current = null;
};
```

Then change `app/page.tsx` to dynamically import `SmoothScroll` on the client:

```tsx
const SmoothScroll = dynamic(
  () => import("@/components/landing/SmoothScroll").then((mod) => ({ default: mod.SmoothScroll })),
  { ssr: false },
);
```

Keep the existing below-the-fold dynamic sections as-is. This task is about removing the leak and keeping the wrapper cheap, not redesigning the landing page.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run src/components/landing/SmoothScroll.test.tsx src/components/landing/Hero.test.tsx
```

Expected: PASS.

**Step 5: Manual smoke**

Verify:

- landing page still scrolls smoothly on desktop
- reduced-motion/mobile users do not get forced smooth scroll
- navigating away from the landing page does not leave runaway animation work behind

**Step 6: Commit**

```bash
git add app/page.tsx src/components/landing/SmoothScroll.tsx src/components/landing/SmoothScroll.test.tsx
git commit -m "perf(prXX): clean up landing smooth scroll loop"
```

---

### Task 7: Sweep metadata and live copy to a single Sunder brand

**Files:**
- Create: `src/lib/branding/site.ts`
- Create: `src/lib/branding/site.test.ts`
- Modify: `app/layout.tsx`
- Create: `app/page.test.tsx`
- Modify: `app/page.tsx`
- Modify: `src/components/landing/Header.tsx`
- Modify: `src/components/landing/Logo.tsx`
- Modify: `src/components/landing/Footer.tsx`
- Create: `src/components/landing/Footer.test.tsx`
- Modify: `src/components/landing/Faqs.tsx`
- Modify: `src/components/landing/SlimLayout.tsx`
- Modify: `src/components/landing/WhatsAppCard.tsx`
- Modify: `src/components/landing/WhatsAppPhoneMockup.tsx`
- Modify: `app/demo/page.tsx`
- Modify: `src/components/property/market-cta.tsx`

**Step 1: Write the failing tests**

Create `src/lib/branding/site.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { siteBrand } from "./site";

describe("siteBrand", () => {
  it("exports the canonical Sunder marketing brand", () => {
    expect(siteBrand.name).toBe("Sunder");
    expect(siteBrand.siteUrl).toBe("https://www.trysunder.com");
    expect(JSON.stringify(siteBrand)).not.toContain("NeoBot");
  });
});
```

Create `app/page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";

import { metadata } from "./page";

describe("landing metadata", () => {
  it("exports Sunder marketing metadata", () => {
    expect(String(metadata.title)).toContain("Sunder");
    expect(JSON.stringify(metadata)).not.toContain("NeoBot");
  });
});
```

Create `src/components/landing/Footer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders Sunder branding instead of NeoBot branding", () => {
    render(<Footer />);

    expect(screen.queryByText(/neobot/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sunder/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run \
  src/lib/branding/site.test.ts \
  app/page.test.tsx \
  src/components/landing/Footer.test.tsx
```

Expected: FAIL because the canonical brand file does not exist yet and live metadata/footer copy still reference `NeoBot` or the older document-processing positioning.

**Step 3: Write the minimal implementation**

Create `src/lib/branding/site.ts` with the canonical marketing copy:

```ts
export const siteBrand = {
  name: "Sunder",
  siteUrl: "https://www.trysunder.com",
  marketingTitle: "Sunder",
  marketingDescription:
    "Sunder is an autopilot for solo practitioners in advisory sales. It handles CRM updates, follow-up, briefings, and inbound work with approval gates for external actions.",
  ogImageUrl: "https://www.trysunder.com/exports/og-image.png",
  supportEmail: "hello@trysunder.com",
} as const;
```

Then wire the runtime surfaces to it:

- `app/layout.tsx`: replace the outdated `"AI Document Processing for Singapore SMEs"` metadata with the actual Sunder positioning
- `app/page.tsx`: replace all `NeoBot` metadata, `neobot.com`, and canonical URLs with `siteBrand`
- `src/components/landing/Header.tsx`: change the home link label from `NeoBot Home` to `Sunder Home`
- `src/components/landing/Logo.tsx`: change the wordmark from `neobot` to `sunder`
- `src/components/landing/Footer.tsx`: change the footer brand, support email, and copyright string
- `src/components/landing/Faqs.tsx`: replace `What is NeoBot?` and `Everything you need to know about NeoBot.`
- `src/components/landing/SlimLayout.tsx`, `src/components/landing/WhatsAppCard.tsx`, and `src/components/landing/WhatsAppPhoneMockup.tsx`: replace visible `NeoBot` wordmarks
- `app/demo/page.tsx`: replace `See NeoBot Handle...`
- `src/components/property/market-cta.tsx`: replace `Try NeoBot Free` and related copy

After the targeted changes, run:

```bash
rg -n 'NeoBot|AI Document Processing|neobot.com' app src/components src/lib
```

Any remaining matches must be explained and either removed or confirmed to be harmless historical comments only.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/lib/branding/site.test.ts \
  app/page.test.tsx \
  src/components/landing/Footer.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/branding/site.ts \
        src/lib/branding/site.test.ts \
        app/layout.tsx \
        app/page.tsx \
        app/page.test.tsx \
        src/components/landing/Header.tsx \
        src/components/landing/Logo.tsx \
        src/components/landing/Footer.tsx \
        src/components/landing/Footer.test.tsx \
        src/components/landing/Faqs.tsx \
        src/components/landing/SlimLayout.tsx \
        src/components/landing/WhatsAppCard.tsx \
        src/components/landing/WhatsAppPhoneMockup.tsx \
        app/demo/page.tsx \
        src/components/property/market-cta.tsx
git commit -m "fix(prXX): unify sunder branding and metadata"
```

---

### Task 8: Run the hard production gate before merge

**Files:**
- Reference: `docs/tasks/2026-04-23-route-loading-and-dataflow-perf-tasklist.md`
- Reference: `docs/tasks/2026-04-23-crm-hot-path-perf-tasklist.md`
- Reference: `docs/tasks/2026-04-23-chat-tasks-settings-perf-tasklist.md`
- Reference: `docs/tasks/2026-04-23-ui-production-readiness-master-tasklist.md`

**Step 1: Run the focused automated suites from every landed task**

Run:

```bash
pnpm vitest run \
  src/lib/crm/__tests__/view-state.test.ts \
  src/components/layout/app-layout.test.tsx \
  src/components/landing/SmoothScroll.test.tsx \
  src/lib/branding/site.test.ts \
  app/page.test.tsx \
  src/components/landing/Footer.test.tsx
```

Expected: PASS.

**Step 2: Run the production build**

Run:

```bash
pnpm build
```

Expected: PASS with no type errors and no route-level build failures.

**Step 3: Run a bundle-analysis build**

Run:

```bash
ANALYZE=true pnpm build
```

Expected:

- PASS
- bundle analyzer output is generated
- first-load JS for the dashboard is not worse than before the command-menu lazy-load and route/code-splitting work

**Step 4: Manual QA the hot routes on desktop and mobile widths**

Run the app and verify:

- `/` loads with the updated Sunder metadata/copy and no obvious animation leaks
- `/chat` and `/chat/[threadId]` remain interactive
- `/tasks` search and view switching feel responsive
- `/customers/deals`, `/customers/companies`, and `/customers/people` feel stable during inline edits
- `/meetings` and `/meetings/[id]` show route-shaped loading states
- `/settings` loads with the correct shell
- `Cmd+K` still opens the command menu

**Step 5: Final commit**

```bash
git add docs/tasks/2026-04-23-ui-production-readiness-master-tasklist.md
git commit -m "chore(prXX): close ui production readiness plan"
```
