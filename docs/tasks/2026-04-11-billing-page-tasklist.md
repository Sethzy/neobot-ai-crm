# Billing Page Implementation Plan

**Goal:** Ship a dead-simple `/settings/billing` page that shows the user's current plan + one button that opens the Stripe Customer Portal — the standard SaaS pattern, no custom payment/invoice/cancel UI.

**Architecture:** Stripe owns the entire billing UI surface (payment methods, plan changes, invoices, cancellation) via the hosted Customer Portal. Sunder just renders a one-card summary read from cached fields on the `clients` table. We add two new columns (`current_period_end`, `cancel_at_period_end`) populated by the existing webhook sync function so the page renders without round-tripping to Stripe on each load. The page is a Server Component using the existing `loadCurrentBillingState()` loader and `customerPortalAction()` server action — both already exist.

**Tech Stack:** Next.js 15 App Router (Server Components), TypeScript, Stripe Node SDK v20, Supabase Postgres, ShadCN UI + Flexoki semantic tokens, Vitest for tests.

---

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

---

## Relevant Files

### Create
- `supabase/migrations/20260411120000_add_billing_period_to_clients.sql` — DB migration adding `current_period_end` + `cancel_at_period_end` columns.
- `src/lib/stripe/billing-view-model.ts` — Pure helper that turns a `ClientBillingRow` into a render-ready view model (state, copy, primary action).
- `src/lib/stripe/billing-view-model.test.ts` — Unit tests for every state branch in `buildBillingViewModel`.
- `app/(dashboard)/settings/billing/page.tsx` — The new Server Component page.

### Modify
- `src/types/database.ts:344-391` — Add the two new column types to the `clients` table generated types (Row/Insert/Update). Run `pnpm supabase gen types` if available, otherwise hand-edit.
- `src/lib/stripe/stripe.ts:29-38` — Extend the `ClientBillingRow` `Pick<>` to include the two new columns.
- `src/lib/stripe/stripe.ts:78-79` — Extend `clientBillingSelect` constant to fetch the new columns.
- `src/lib/stripe/stripe.ts:468-494` — Extend `buildBillingUpdateFromSubscription` to set `current_period_end` and `cancel_at_period_end` from the Stripe subscription.
- `src/lib/stripe/stripe.ts:597-632` — Extend `syncBillingStateFromDeletedSubscription` to clear the two new columns.
- `src/lib/stripe/stripe.ts:453-466` — Update `createCustomerPortalSession` `return_url` from `/settings` to `/settings/billing`.
- `src/lib/stripe/stripe.test.ts` — Update existing sync test expectations to include the two new columns + add a new test for trial-end + cancel-at-period-end propagation.
- `app/(dashboard)/settings/page.tsx:189-290` — Replace the giant embedded billing card with a small one-line link card pointing at `/settings/billing`.

### Tests
- `src/lib/stripe/billing-view-model.test.ts` — New, covers all 6 view states.
- `src/lib/stripe/stripe.test.ts` — Existing, expand expectations.

---

## Notes

- **Stripe API field caveat.** `Stripe.Subscription.current_period_end` is a top-level Unix timestamp on API versions before 2025-04-30. The repo pins `stripe ^20.4.1`, so the top-level field is fine. If TypeScript complains in Task 2 because the SDK already moved the field to `subscription.items.data[0].current_period_end`, fall back to that path — both work, the value is identical for single-item subs (which is all we have).
- **Date handling.** Stripe returns Unix seconds. Convert with `new Date(seconds * 1000).toISOString()` before persisting to a `TIMESTAMPTZ` column. Display formatting is done in the view-model with `Intl.DateTimeFormat("en-SG")`.
- **No new tests for the page itself.** The page is a thin Server Component that only forwards data to JSX — all the branching lives in `buildBillingViewModel`, which gets full unit coverage. Don't write a Playwright test for this; eyeball it via `pnpm dev` and the manual smoke at the end.
- **Frequent commits.** Each task ends with a commit. Don't bundle.
- **Design system.** Flexoki tokens only — no `bg-amber-500` / `text-green-600`. Use the existing `Badge` variants (`info`, `success`, `warning`, `destructive`, `outline`) — those are already wired to Flexoki Layer 2 tokens at `src/components/ui/badge.tsx:22-26`.
- **DRY / YAGNI.** No usage charts, no cancel modal, no invoice list, no settings sidebar refactor. If you find yourself building any of those, stop and ask.
- **TDD.** Every code path you can isolate as a pure function gets a failing test first. The view-model is the main TDD surface here.
- Reference skill: @1-test-driven-development (TDD discipline), @1-finishing-a-development-feature (after the last commit).

---

## Task 1: Add `current_period_end` + `cancel_at_period_end` to `clients`

**Why:** The page needs to show "Trial ends April 18" / "Renews May 11" / "Cancels May 11" without hitting Stripe on every render. Cache it in the row, sync via webhook (next task).

**Files:**
- Create: `supabase/migrations/20260411120000_add_billing_period_to_clients.sql`
- Modify: `src/types/database.ts:344-391`

**Step 1.1: Create the migration file**

Write to `supabase/migrations/20260411120000_add_billing_period_to_clients.sql`:

```sql
-- Cache Stripe subscription period info on the client row so the in-app
-- billing page can render renewal/trial/cancel dates without round-tripping
-- to Stripe on every page load. Mirrored from webhook events.

ALTER TABLE public.clients
  ADD COLUMN current_period_end TIMESTAMPTZ,
  ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.current_period_end IS
  'End of the current Stripe billing period. When trialing this is the trial-end timestamp; when active this is the next renewal. Null when no paid subscription exists.';

COMMENT ON COLUMN public.clients.cancel_at_period_end IS
  'True when the customer has scheduled a cancellation that takes effect at current_period_end. Drives the "Cancels on {date}" copy on the billing page.';
```

**Step 1.2: Apply the migration locally**

Run: `pnpm supabase db push` (or whatever command this repo uses — check `package.json` scripts and `supabase/README.md` if uncertain; if neither helps, run the migration via the Supabase MCP `apply_migration` tool or paste it into the local Supabase Studio SQL editor).

Expected: Migration applies cleanly. No errors. The `clients` table now has two new columns. Verify with:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients'
  AND column_name IN ('current_period_end', 'cancel_at_period_end');
```

Expected: Two rows returned, `current_period_end` is `timestamp with time zone` nullable, `cancel_at_period_end` is `boolean` not null default `false`.

**Step 1.3: Regenerate (or hand-edit) database types**

If the repo has a typegen script, run it. Check with:

```bash
cat package.json | grep -i "supabase\|typegen\|gen:types"
```

If a script exists, run it. Otherwise hand-edit `src/types/database.ts` at lines 344-391 to add the two columns to the `clients` table's `Row`, `Insert`, and `Update` interfaces:

```typescript
// In Row (around line 345):
        Row: {
          client_id: string
          client_profile: string | null
          created_at: string
          display_name: string | null
          is_bootstrapped: boolean
          plan_name: string | null
          quota_exempt: boolean
          stripe_customer_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          user_id: string
          user_preferences: string | null
        }
        // In Insert (around line 360): same fields, all optional except those already required
        Insert: {
          // ...existing fields...
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          // ...rest...
        }
        // In Update (around line 375): same fields, all optional
        Update: {
          // ...existing fields...
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          // ...rest...
        }
```

**Step 1.4: Type-check to make sure nothing else broke**

Run: `pnpm tsc --noEmit`

Expected: PASS (no new errors). If existing errors are present that aren't related to your change, ignore them — but verify your edits compile cleanly.

**Step 1.5: Commit**

```bash
git add supabase/migrations/20260411120000_add_billing_period_to_clients.sql src/types/database.ts
git commit -m "feat(billing): add current_period_end and cancel_at_period_end to clients"
```

---

## Task 2: Sync the new columns from Stripe webhooks (TDD)

**Why:** The migration created empty columns. Now teach `syncBillingStateFromSubscriptionId` and `syncBillingStateFromDeletedSubscription` to populate them when Stripe sends `customer.subscription.updated` / `customer.subscription.deleted` / `checkout.session.completed`.

**Files:**
- Modify: `src/lib/stripe/stripe.ts` (lines 29-38, 78-79, 468-494, 597-632)
- Modify: `src/lib/stripe/stripe.test.ts` (existing tests at lines 198-303 + new test)

**Step 2.1: Write the failing test for trial-end propagation**

Open `src/lib/stripe/stripe.test.ts`. Add a new test inside the `describe("lib/stripe/stripe", ...)` block, after the existing "syncs an active subscription" test (around line 260):

```typescript
  it("propagates current_period_end and cancel_at_period_end from a trialing subscription", async () => {
    const updates: Array<{ clientId: string; update: Record<string, unknown> }> = [];
    const client = {
      client_id: "client-1",
      display_name: "Seth",
      plan_name: null,
      stripe_customer_id: null,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: null,
    } satisfies MockClientRow;

    mockCreateAdminClient.mockResolvedValue(
      createMockAdminClient({
        customerLookup: null,
        metadataLookup: client,
        updates,
      }),
    );
    // 2026-04-18T00:00:00Z = 1776643200
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: true,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_trialing",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_pro",
              product: { active: true, id: "prod_pro", name: "Pro" },
            },
          },
        ],
      },
      metadata: { clientId: "client-1" },
      status: "trialing",
    });

    const { syncBillingStateFromSubscriptionId } = await import("./stripe");

    await syncBillingStateFromSubscriptionId("sub_trialing");

    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: true,
          current_period_end: "2026-04-18T00:00:00.000Z",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_trialing",
          subscription_status: "trialing",
        },
      },
    ]);
  });
```

**Step 2.2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts -t "propagates current_period_end"`

Expected: FAIL — `Expected ... to deeply equal ...` because the existing `buildBillingUpdateFromSubscription` doesn't write `current_period_end` or `cancel_at_period_end`.

**Step 2.3: Update existing test expectations to match the new shape**

The existing test "syncs an active subscription onto the matching client row" (line 198) and the existing "clears paid billing fields when Stripe deletes the subscription" (line 261) and "syncs checkout sessions" (line 305) and "blocks duplicate checkout" (line 371) all assert exact `update` shapes. After our code change they'll start writing the two new fields, so update them now.

For each of those four tests, find the `expect(updates).toEqual(...)` block and:
- For active/trialing subs (writes from a non-deleted sub): add `current_period_end: <iso string or null>` and `cancel_at_period_end: <bool>` to the `update` object.
- For deleted sub: add `current_period_end: null, cancel_at_period_end: false`.

For each existing test, you'll also need to add `current_period_end` and `cancel_at_period_end` to the mock subscription objects so the implementation has something to read. Use `current_period_end: 1776643200` and `cancel_at_period_end: false` for the active and checkout-session tests.

**Concretely** — in the "syncs an active subscription" test (line 217-238), update the `mockSubscriptionsRetrieve.mockResolvedValue` call to include:

```typescript
    mockSubscriptionsRetrieve.mockResolvedValue({
      cancel_at_period_end: false,
      current_period_end: 1776643200,
      customer: "cus_123",
      id: "sub_123",
      items: {
        data: [
          {
            current_period_end: 1776643200,
            price: {
              id: "price_pro",
              product: { active: true, id: "prod_pro", name: "Pro" },
            },
          },
        ],
      },
      metadata: { clientId: "client-1" },
      status: "active",
    });
```

Then update its `expect(updates).toEqual(...)` block (around line 247) to:

```typescript
    expect(updates).toEqual([
      {
        clientId: "client-1",
        update: {
          cancel_at_period_end: false,
          current_period_end: "2026-04-18T00:00:00.000Z",
          plan_name: "Pro",
          stripe_customer_id: "cus_123",
          stripe_product_id: "prod_pro",
          stripe_subscription_id: "sub_123",
          subscription_status: "active",
        },
      },
    ]);
```

Repeat the same shape change for:
- "clears paid billing fields when Stripe deletes the subscription" (line 261) — the deleted-sub case writes `current_period_end: null, cancel_at_period_end: false`.
- "syncs checkout sessions by retrieving the created Stripe subscription" (line 305) — add the two fields to both the mock and the expected update; use `cancel_at_period_end: false, current_period_end: "2026-04-18T00:00:00.000Z"` for the trialing-Max example.
- "blocks duplicate checkout when Stripe already has a live subscription" (line 371) — same pattern, the live sub mock at line 402 needs `current_period_end: 1776643200, cancel_at_period_end: false` and the resulting update needs the two new fields.

**Step 2.4: Run the full Stripe test file to confirm all tests now fail**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts`

Expected: 5 failing assertions (the new test + the four updated existing ones), 1-2 passing (the unconfigured-price-id test and customer-portal test, which don't touch sub sync).

**Step 2.5: Extend `ClientBillingRow` and `clientBillingSelect`**

Open `src/lib/stripe/stripe.ts`. Update lines 29-38:

```typescript
type ClientBillingRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "client_id"
  | "display_name"
  | "plan_name"
  | "stripe_customer_id"
  | "stripe_product_id"
  | "stripe_subscription_id"
  | "subscription_status"
  | "current_period_end"
  | "cancel_at_period_end"
>;
```

And line 78-79:

```typescript
const clientBillingSelect =
  "client_id, display_name, plan_name, stripe_customer_id, stripe_product_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end";
```

**Step 2.6: Extend `buildBillingUpdateFromSubscription` to write the two new fields**

Open `src/lib/stripe/stripe.ts` around line 468. Replace the entire function with:

```typescript
function buildBillingUpdateFromSubscription(args: {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  customerId: string;
  planName: PaidBillingPlanName | null;
  productId: string | null;
  status: Stripe.Subscription.Status;
}): Pick<
  Database["public"]["Tables"]["clients"]["Update"],
  | "cancel_at_period_end"
  | "current_period_end"
  | "plan_name"
  | "stripe_customer_id"
  | "stripe_product_id"
  | "stripe_subscription_id"
  | "subscription_status"
> {
  if (terminalStatuses.has(args.status)) {
    return {
      cancel_at_period_end: false,
      current_period_end: null,
      plan_name: null,
      stripe_customer_id: args.customerId,
      stripe_product_id: null,
      stripe_subscription_id: null,
      subscription_status: args.status,
    };
  }

  return {
    cancel_at_period_end: args.cancelAtPeriodEnd,
    current_period_end: args.currentPeriodEnd,
    plan_name: args.planName,
    stripe_customer_id: args.customerId,
    stripe_product_id: args.productId,
    stripe_subscription_id: null,
    subscription_status: args.status,
  };
}
```

**Step 2.7: Update `syncBillingStateFromSubscriptionId` to read the period fields off the subscription**

In the same file, find `syncBillingStateFromSubscriptionId` (line 547). Inside the function, after the `const primaryPrice = ...` line, add:

```typescript
  const periodEndSeconds =
    subscription.current_period_end ??
    subscription.items.data[0]?.current_period_end ??
    null;
  const currentPeriodEnd = periodEndSeconds
    ? new Date(periodEndSeconds * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
```

Then update the call to `buildBillingUpdateFromSubscription` (around line 574) to pass the new fields:

```typescript
  const update = buildBillingUpdateFromSubscription({
    cancelAtPeriodEnd,
    currentPeriodEnd,
    customerId,
    planName,
    productId: primaryProduct?.id ?? null,
    status: subscription.status,
  });
```

**Note:** If TypeScript complains that `subscription.current_period_end` doesn't exist on the SDK type, drop the top-level `??` lookup and use only `subscription.items.data[0]?.current_period_end`. Both forms work — Stripe is in the middle of moving the field down to items, and v20.4.1 may have already done so for the type definitions.

**Step 2.8: Update `syncBillingStateFromDeletedSubscription` to clear the new fields**

Same file, find `syncBillingStateFromDeletedSubscription` (line 597). Update its `persistBillingUpdate` call to:

```typescript
  await persistBillingUpdate(client.client_id, {
    cancel_at_period_end: false,
    current_period_end: null,
    plan_name: null,
    stripe_customer_id: customerId,
    stripe_product_id: null,
    stripe_subscription_id: null,
    subscription_status: subscription.status,
  });
```

**Step 2.9: Run the Stripe test file again to verify everything passes**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts`

Expected: ALL tests PASS, including the new one.

**Step 2.10: Run the webhook route tests too (just to be safe — they mock the sync function so should be unaffected)**

Run: `pnpm vitest run app/api/stripe/webhook/route.test.ts`

Expected: All tests still PASS — these tests stub the sync functions entirely, so they shouldn't care about the new fields.

**Step 2.11: Type-check**

Run: `pnpm tsc --noEmit`

Expected: No new errors. If `subscription.current_period_end` errors out, apply the fallback noted in Step 2.7.

**Step 2.12: Commit**

```bash
git add src/lib/stripe/stripe.ts src/lib/stripe/stripe.test.ts
git commit -m "feat(billing): sync current_period_end and cancel_at_period_end from Stripe webhooks"
```

---

## Task 3: Build the `buildBillingViewModel` helper (TDD)

**Why:** All the page's branching logic ("trialing → 'Trial ends X'", "past_due → 'Update payment'", etc.) is pure data → data, so it goes in a unit-tested helper. The page becomes a dumb renderer.

**Files:**
- Create: `src/lib/stripe/billing-view-model.ts`
- Create: `src/lib/stripe/billing-view-model.test.ts`

**Step 3.1: Write the failing test file**

Create `src/lib/stripe/billing-view-model.test.ts`:

```typescript
/**
 * Tests for the billing-page view model that maps a client billing row to render-ready props.
 * @module lib/stripe/billing-view-model.test
 */
import { describe, expect, it } from "vitest";

import { buildBillingViewModel } from "./billing-view-model";

const baseRow = {
  cancel_at_period_end: false,
  current_period_end: null,
  plan_name: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
} as const;

describe("buildBillingViewModel", () => {
  it("returns the free state when no Stripe customer exists", () => {
    const view = buildBillingViewModel({ ...baseRow });

    expect(view.state).toBe("free");
    expect(view.planName).toBe("Free");
    expect(view.primaryAction).toBe("upgrade");
    expect(view.statusLine).toBe("You're on the Free plan.");
  });

  it("returns the free state when a Stripe customer exists but plan is null", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      stripe_customer_id: "cus_123",
    });

    expect(view.state).toBe("free");
    expect(view.primaryAction).toBe("upgrade");
  });

  it("returns the trialing state with trial-end copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      cancel_at_period_end: false,
      current_period_end: "2026-04-18T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "trialing",
    });

    expect(view.state).toBe("trialing");
    expect(view.planName).toBe("Pro");
    expect(view.monthlyPriceSgd).toBe(25);
    expect(view.primaryAction).toBe("manage");
    expect(view.statusLine).toContain("Trial ends");
    expect(view.statusLine).toContain("18 April 2026");
  });

  it("returns the active state with renewal copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.state).toBe("active");
    expect(view.statusLine).toContain("Renews on");
    expect(view.statusLine).toContain("11 May 2026");
    expect(view.primaryAction).toBe("manage");
  });

  it("returns the canceling state when cancel_at_period_end is true", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      cancel_at_period_end: true,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.state).toBe("canceling");
    expect(view.statusLine).toContain("Cancels on");
    expect(view.statusLine).toContain("11 May 2026");
    expect(view.primaryAction).toBe("manage");
  });

  it("returns the past_due state with update-payment copy", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "past_due",
    });

    expect(view.state).toBe("past_due");
    expect(view.primaryAction).toBe("update_payment");
    expect(view.statusLine).toContain("Payment failed");
  });

  it("returns the past_due state for unpaid subscriptions too", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      plan_name: "Pro",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "unpaid",
    });

    expect(view.state).toBe("past_due");
    expect(view.primaryAction).toBe("update_payment");
  });

  it("returns the canceled state when subscription was terminated", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      plan_name: null,
      stripe_customer_id: "cus_123",
      subscription_status: "canceled",
    });

    expect(view.state).toBe("canceled");
    expect(view.primaryAction).toBe("upgrade");
  });

  it("uses the Max plan price when plan_name is Max", () => {
    const view = buildBillingViewModel({
      ...baseRow,
      current_period_end: "2026-05-11T00:00:00.000Z",
      plan_name: "Max",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });

    expect(view.planName).toBe("Max");
    expect(view.monthlyPriceSgd).toBe(99);
  });
});
```

**Step 3.2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/stripe/billing-view-model.test.ts`

Expected: FAIL — `Cannot find module './billing-view-model'`.

**Step 3.3: Implement the helper**

Create `src/lib/stripe/billing-view-model.ts`:

```typescript
/**
 * Pure helper that maps a `clients` table billing row into the props the
 * /settings/billing page renders. All branching logic for plan/state/copy
 * lives here so the page itself stays a dumb Server Component.
 *
 * @module lib/stripe/billing-view-model
 */
import type { Database } from "@/types/database";

import {
  billingPlanCatalog,
  isPaidBillingPlanName,
  type BillingPlanName,
} from "./plans";

/** All the discrete states the billing page knows how to render. */
export type BillingViewState =
  | "free"
  | "trialing"
  | "active"
  | "canceling"
  | "past_due"
  | "canceled";

/** What the primary CTA on the page should do. */
export type BillingPrimaryAction = "manage" | "upgrade" | "update_payment";

export interface BillingViewModel {
  state: BillingViewState;
  planName: BillingPlanName;
  monthlyPriceSgd: number;
  /** ISO date string the page can re-format if it ever wants to, or null. */
  periodEndsAt: string | null;
  /** True iff the client has a Stripe customer (so the portal is reachable). */
  hasStripeCustomer: boolean;
  /** Localized "what comes next" sentence — e.g. "Trial ends 18 April 2026." */
  statusLine: string;
  primaryAction: BillingPrimaryAction;
}

/** Subset of the `clients` row that this helper actually reads. */
type BillingRow = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  | "cancel_at_period_end"
  | "current_period_end"
  | "plan_name"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "subscription_status"
>;

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatPeriodEnd(iso: string | null): string {
  if (!iso) {
    return "soon";
  }
  return dateFormatter.format(new Date(iso));
}

/**
 * Maps a `clients` row into a render-ready view model for /settings/billing.
 *
 * Branching priority (first match wins):
 *   1. terminal states (`canceled`, `incomplete_expired`) → "canceled"
 *   2. no customer / no paid plan_name → "free"
 *   3. dunning states (`past_due`, `unpaid`) → "past_due"
 *   4. `cancel_at_period_end` flag → "canceling"
 *   5. `trialing` status → "trialing"
 *   6. anything else → "active"
 */
export function buildBillingViewModel(client: BillingRow): BillingViewModel {
  const status = client.subscription_status;
  const hasStripeCustomer = Boolean(client.stripe_customer_id);
  const periodEndCopy = formatPeriodEnd(client.current_period_end);

  const isTerminal = status === "canceled" || status === "incomplete_expired";
  const planName: BillingPlanName =
    client.plan_name && isPaidBillingPlanName(client.plan_name) && !isTerminal
      ? client.plan_name
      : "Free";

  if (isTerminal) {
    return {
      state: "canceled",
      planName: "Free",
      monthlyPriceSgd: 0,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "Your subscription has ended.",
      primaryAction: "upgrade",
    };
  }

  if (planName === "Free") {
    return {
      state: "free",
      planName: "Free",
      monthlyPriceSgd: 0,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "You're on the Free plan.",
      primaryAction: "upgrade",
    };
  }

  const planDef = billingPlanCatalog[planName];

  if (status === "past_due" || status === "unpaid") {
    return {
      state: "past_due",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: "Payment failed. Update your card to keep access.",
      primaryAction: "update_payment",
    };
  }

  if (client.cancel_at_period_end) {
    return {
      state: "canceling",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: `Cancels on ${periodEndCopy}.`,
      primaryAction: "manage",
    };
  }

  if (status === "trialing") {
    return {
      state: "trialing",
      planName,
      monthlyPriceSgd: planDef.monthlyPriceSgd,
      periodEndsAt: client.current_period_end,
      hasStripeCustomer,
      statusLine: `Trial ends ${periodEndCopy}.`,
      primaryAction: "manage",
    };
  }

  return {
    state: "active",
    planName,
    monthlyPriceSgd: planDef.monthlyPriceSgd,
    periodEndsAt: client.current_period_end,
    hasStripeCustomer,
    statusLine: `Renews on ${periodEndCopy}.`,
    primaryAction: "manage",
  };
}
```

**Step 3.4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/stripe/billing-view-model.test.ts`

Expected: All 9 tests PASS.

**Step 3.5: Type-check**

Run: `pnpm tsc --noEmit`

Expected: PASS.

**Step 3.6: Commit**

```bash
git add src/lib/stripe/billing-view-model.ts src/lib/stripe/billing-view-model.test.ts
git commit -m "feat(billing): add buildBillingViewModel helper for /settings/billing page"
```

---

## Task 4: Build the `/settings/billing` page

**Why:** The actual user-facing page. A Server Component that loads the row, runs the view model, and renders one card with one button.

**Files:**
- Create: `app/(dashboard)/settings/billing/page.tsx`

**Step 4.1: Create the page file**

Create `app/(dashboard)/settings/billing/page.tsx`:

```typescript
/**
 * Standard SaaS billing page: one card showing the current plan + a single
 * button that opens the Stripe Customer Portal. All payment methods, plan
 * changes, invoices, and cancellation flows live in Stripe.
 *
 * @module app/(dashboard)/settings/billing/page
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/stripe/actions";
import {
  buildBillingViewModel,
  type BillingPrimaryAction,
  type BillingViewState,
} from "@/lib/stripe/billing-view-model";
import { loadCurrentBillingState } from "@/lib/stripe/stripe";

import { SubmitButton } from "../../pricing/submit-button";

const stateBadge: Record<BillingViewState, { label: string; variant: "info" | "success" | "warning" | "destructive" | "outline" } | null> = {
  free: null,
  trialing: { label: "Trial", variant: "info" },
  active: { label: "Active", variant: "success" },
  canceling: { label: "Canceling", variant: "warning" },
  past_due: { label: "Payment failed", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
};

const ctaLabel: Record<BillingPrimaryAction, string> = {
  manage: "Manage subscription",
  upgrade: "Choose a plan",
  update_payment: "Update payment",
};

export default async function BillingPage() {
  const client = await loadCurrentBillingState();
  const view = buildBillingViewModel(client);
  const badge = stateBadge[view.state];

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your plan, payment, and invoices in Stripe.
          </p>
        </div>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="gap-2">
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
              {view.planName === "Free" ? "Free" : `Sunder ${view.planName}`}
              {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {view.planName !== "Free" ? (
              <p className="font-medium text-foreground">
                S${view.monthlyPriceSgd} per month
              </p>
            ) : null}
            <p>{view.statusLine}</p>
          </CardContent>

          <CardFooter className="flex justify-end border-t pt-4">
            {view.primaryAction === "upgrade" ? (
              <Button asChild>
                <Link href="/pricing">{ctaLabel[view.primaryAction]}</Link>
              </Button>
            ) : (
              <form action={customerPortalAction}>
                <SubmitButton
                  idleLabel={ctaLabel[view.primaryAction]}
                  pendingLabel="Opening portal..."
                />
              </form>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
```

**Step 4.2: Type-check**

Run: `pnpm tsc --noEmit`

Expected: PASS.

**Step 4.3: Manual smoke test**

Start the dev server: `pnpm dev`

Then in a browser:

1. Navigate to `http://localhost:3000/settings/billing`.
2. Confirm the page renders without errors.
3. If you're on the Free plan: header reads "Free", body says "You're on the Free plan.", button reads "Choose a plan" and links to `/pricing`.
4. If you're on a paid plan in trial: header reads "Sunder Pro" (or Max) with a blue "Trial" badge, body says "S$25 per month" and "Trial ends {date}.", button reads "Manage subscription".
5. Click the button → confirm it redirects to Stripe Customer Portal.
6. (Don't worry about every state — the unit tests covered the rest.)

If anything looks broken, fix before committing.

**Step 4.4: Commit**

```bash
git add app/(dashboard)/settings/billing/page.tsx
git commit -m "feat(billing): add /settings/billing page with Stripe portal handoff"
```

---

## Task 5: Replace the embedded billing card on `/settings` with a one-line link

**Why:** The current `/settings` page has a large billing card embedded in it. Now that `/settings/billing` exists, the in-page card is duplication. Replace it with a tiny "Billing →" link card.

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx` (lines 150-321)

**Step 5.1: Read the current settings page to plan the edit**

You should already be familiar with this file. The relevant block is the `Card` at lines 189-290 (the giant billing card with usage grids).

**Step 5.2: Remove now-unused imports and the giant billing card**

Open `app/(dashboard)/settings/page.tsx`. Make these edits:

1. **Remove unused imports** (lines 5-22) — keep what's still needed for Telegram, Autopilot, and Skills cards. Specifically, remove these imports because they're only used by the billing card we're deleting:
   - `customerPortalAction` from `@/lib/stripe/actions`
   - `getBillingPlanMessageLimit` from `@/lib/stripe/plans`
   - `loadCurrentBillingState` from `@/lib/stripe/stripe`
   - `formatMessageQuotaResetDate` from `@/lib/usage/message-quota`
   - `loadCurrentMessageQuota` from `@/lib/usage/message-quota-server`
   - `SubmitButton` from `../pricing/submit-button`
   - `ExternalLink` from the lucide-compat import (but keep `AlertCircle` and `CheckCircle`)

2. **Remove `renderBillingAlert`** (lines 66-96), `getStatusVariant` (lines 98-113) — both only used by the billing card.

3. **Remove the billing data loaders from `Promise.all`** (lines 152-157):

```typescript
// Before:
const [client, messageQuota, telegramChatId, autopilotConfig] = await Promise.all([
  loadCurrentBillingState(),
  loadCurrentMessageQuota(),
  loadTelegramChatId(),
  loadAutopilotConfig(),
]);

// After:
const [telegramChatId, autopilotConfig] = await Promise.all([
  loadTelegramChatId(),
  loadAutopilotConfig(),
]);
```

4. **Remove the billing variables** (lines 162-167) — `billingAlert`, `currentPlanName`, `statusLabel`, `hasPortal`, `monthlyMessageLimit`. Also remove the `{billingAlert}` JSX line.

5. **Replace the giant billing card** at lines 189-290 with a small one-line link card:

```tsx
<div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
  <Card className="border-border/70 bg-card shadow-sm">
    <CardHeader className="gap-2">
      <CardDescription>Account</CardDescription>
      <CardTitle className="text-2xl">Billing</CardTitle>
    </CardHeader>

    <CardContent className="text-sm text-muted-foreground">
      <p>Manage your plan, payment, and invoices in Stripe.</p>
    </CardContent>

    <CardFooter className="border-t pt-4">
      <Button asChild variant="outline">
        <Link href="/settings/billing">Open billing</Link>
      </Button>
    </CardFooter>
  </Card>

  <div className="space-y-4">
    <TelegramConnectCard initialChatId={telegramChatId} />
  </div>
</div>
```

6. **Remove the now-unused `renderBillingAlert` call and the `billingAlert` variable references** anywhere they remain.

**Step 5.3: Type-check**

Run: `pnpm tsc --noEmit`

Expected: PASS. If you get unused-import warnings, delete those imports too.

**Step 5.4: Lint**

Run: `pnpm lint app/(dashboard)/settings/page.tsx`

Expected: PASS or the only warnings/errors are pre-existing (not from your edits).

**Step 5.5: Manual smoke test**

With dev server running:

1. Navigate to `http://localhost:3000/settings`.
2. Confirm the giant billing card is gone, replaced by a small "Billing → Open billing" card.
3. Click "Open billing" → lands on `/settings/billing`.
4. Confirm Telegram, Autopilot, and Skills cards still render correctly.

**Step 5.6: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "refactor(settings): replace embedded billing card with link to /settings/billing"
```

---

## Task 6: Update the Customer Portal `return_url` to land back on `/settings/billing`

**Why:** When users finish managing their subscription in Stripe, they should land back on the billing page they came from — not the generic `/settings` page.

**Files:**
- Modify: `src/lib/stripe/stripe.ts:453-466`
- Modify: `src/lib/stripe/stripe.test.ts:516-541` (the existing portal test asserts the exact return URL).

**Step 6.1: Update the existing portal test to expect the new return URL**

Open `src/lib/stripe/stripe.test.ts`. Find the test "creates a Stripe Customer Portal session for the current client" (line 516). Update line 539:

```typescript
// Before:
expect(mockBillingPortalCreate).toHaveBeenCalledWith({
  customer: "cus_123",
  return_url: "https://app.trysunder.com/settings",
});

// After:
expect(mockBillingPortalCreate).toHaveBeenCalledWith({
  customer: "cus_123",
  return_url: "https://app.trysunder.com/settings/billing",
});
```

**Step 6.2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts -t "creates a Stripe Customer Portal session"`

Expected: FAIL — the actual call still uses `/settings`.

**Step 6.3: Update `createCustomerPortalSession` in stripe.ts**

Open `src/lib/stripe/stripe.ts` line 460-463. Update the `return_url`:

```typescript
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${resolveAppBaseUrl()}/settings/billing`,
  });
```

**Step 6.4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts -t "creates a Stripe Customer Portal session"`

Expected: PASS.

**Step 6.5: Run the entire stripe test file as a final regression check**

Run: `pnpm vitest run src/lib/stripe/stripe.test.ts`

Expected: ALL tests PASS.

**Step 6.6: Also update the portal-error redirect in `actions.ts`**

The `customerPortalAction` server action redirects to `/settings?billing=portal-error` on failure (`src/lib/stripe/actions.ts:62`). After this change the natural place is `/settings/billing?billing=portal-error`. But the `renderBillingAlert` helper in `app/(dashboard)/settings/page.tsx` was deleted in Task 5, so the existing query-string handler is gone anyway. Update the redirect target so a portal failure puts the user on the billing page:

Open `src/lib/stripe/actions.ts:62`:

```typescript
// Before:
redirect(`/settings?billing=${billingErrorCodes.portalError}`);

// After:
redirect(`/settings/billing?billing=${billingErrorCodes.portalError}`);
```

For now we don't have to render the error banner — KISS — but the URL is correct so we can wire a small inline banner later if it ever happens in practice.

**Step 6.7: Check whether `actions.ts` has a test that asserts on the redirect URL**

Run: `pnpm vitest run src/lib/stripe/actions.test.ts`

Expected: PASS. If a test asserts `/settings?billing=portal-error`, update it to `/settings/billing?billing=portal-error` and re-run.

**Step 6.8: Commit**

```bash
git add src/lib/stripe/stripe.ts src/lib/stripe/stripe.test.ts src/lib/stripe/actions.ts
git commit -m "feat(billing): point Stripe portal return_url at /settings/billing"
```

---

## Final Smoke Test

After all six tasks, do one end-to-end pass:

1. `pnpm tsc --noEmit` — full repo type check, expect PASS (or only pre-existing errors).
2. `pnpm vitest run src/lib/stripe/ app/api/stripe/` — every Stripe-related test, expect PASS.
3. `pnpm dev` and walk through:
   - `/settings` → small "Billing" card with link → click it
   - `/settings/billing` → renders correct state for the current logged-in user
   - Click "Manage subscription" or "Choose a plan" → goes to Stripe portal / `/pricing`
   - From the Stripe portal, hit "Return to Sunder" → lands back on `/settings/billing`

If everything works, the feature is done. Then invoke @1-finishing-a-development-feature to decide on PR vs merge.

---

## Anti-Goals (do NOT build any of these)

- ❌ A custom cancel-reason modal — Stripe Portal has one
- ❌ A usage chart on the billing page — separate concern, not what was asked for
- ❌ A settings sidebar refactor — Task 5 just adds a link, doesn't restructure
- ❌ An invoice list — Stripe Portal handles it
- ❌ Custom payment-method UI — Stripe Portal handles it
- ❌ Multi-currency / locale switching — SGD-only is fine for now
- ❌ A "compare plans" table on the billing page — that's `/pricing`'s job
- ❌ Webhook handling for new event types — the existing `customer.subscription.updated` already fires when `cancel_at_period_end` toggles or `current_period_end` rolls forward. Don't add new event types.
