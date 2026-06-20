# Stripe Integration Reference Analysis

**Reference repo:** [nextjs/saas-starter](https://github.com/nextjs/saas-starter) (15.5k stars, official Next.js team)
**Local clone:** `/Users/sethlim/Documents/saas-starter`
**DeepWiki:** https://deepwiki.com/nextjs/saas-starter
**Sunder design doc:** `docs/product/designs/stripe-billing-integration.md`
**Date:** 2026-03-10

---

## Part I: Patterns the Reference Codebase Uses

### 1. Stripe Checkout — Redirect Mode (NOT Embedded)

The saas-starter uses **Stripe-hosted redirect checkout**. User clicks "Get Started" → Server Action creates a Checkout Session → user is redirected to `checkout.stripe.com` → after payment, Stripe redirects back to `/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`.

**No client-side Stripe packages.** No `@stripe/stripe-js`, no `@stripe/react-stripe-js`. The entire Stripe interaction is server-side only. The only dependency is:

```json
"stripe": "^18.1.0"
```

This is the simplest possible approach. Zero client-side JS for payments.

### 2. Server Actions (NOT Route Handlers) for Checkout + Portal

Checkout and portal are triggered via **Server Actions** bound to HTML forms:

```tsx
// pricing/page.tsx
<form action={checkoutAction}>
  <input type="hidden" name="priceId" value={priceId} />
  <SubmitButton />
</form>
```

The Server Action is wrapped with a `withTeam` middleware that resolves the authenticated user and their team before executing:

```typescript
// lib/payments/actions.ts
'use server';
export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  await createCheckoutSession({ team, priceId });
});

export const customerPortalAction = withTeam(async (_, team) => {
  const portalSession = await createCustomerPortalSession(team);
  redirect(portalSession.url);
});
```

### 3. Subscription Data Lives ON the Team Table (No Separate Tables)

There is **no separate `customers` or `subscriptions` table**. All Stripe fields are columns directly on the `teams` table:

```typescript
// lib/db/schema.ts — teams table
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});
```

This is 5 Stripe columns. No join tables, no separate lookups. When you need subscription status, you already have it on the team/tenant record.

### 4. Products/Prices Fetched Live from Stripe API (No DB Cache)

No `stripe_products` or `stripe_prices` tables. The pricing page fetches directly from Stripe's API with ISR caching:

```typescript
// pricing/page.tsx
export const revalidate = 3600; // Re-fetch from Stripe every hour

export default async function PricingPage() {
  const [prices, products] = await Promise.all([
    getStripePrices(),
    getStripeProducts(),
  ]);
  // ...render
}
```

```typescript
// lib/payments/stripe.ts
export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring'
  });
  return prices.data.map((price) => ({
    id: price.id,
    productId: typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });
  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId: typeof product.default_price === 'string'
      ? product.default_price
      : product.default_price?.id
  }));
}
```

### 5. Checkout Success Handler — Route Handler (GET)

After Stripe redirects back, a **GET route handler** processes the session:

```
success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`
```

This handler (`app/api/stripe/checkout/route.ts`):
1. Retrieves the checkout session from Stripe (with `expand: ['customer', 'subscription']`)
2. Retrieves the full subscription (with `expand: ['items.data.price.product']`)
3. Looks up the user via `client_reference_id` (set during session creation)
4. Finds the user's team
5. Updates the team with all Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`, `stripeProductId`, `planName`, `subscriptionStatus`)
6. Sets the user session (refreshes auth)
7. Redirects to `/dashboard`

This is a **belt-and-suspenders approach**: the checkout handler does the initial write, and webhooks handle ongoing lifecycle changes. Stripe recommends this — don't rely on redirects alone (user might close browser), but don't rely on webhooks alone either (webhook delivery can be delayed).

### 6. Webhook Handler — Minimal, Two Events Only

```typescript
// app/api/stripe/webhook/route.ts
switch (event.type) {
  case 'customer.subscription.updated':
  case 'customer.subscription.deleted':
    await handleSubscriptionChange(subscription);
    break;
  default:
    console.log(`Unhandled event type ${event.type}`);
}
```

Only two events. No `checkout.session.completed`, no `invoice.payment_failed`, no `invoice.payment_succeeded`. The checkout success handler takes care of the initial setup; webhooks handle subscription lifecycle after that.

### 7. `handleSubscriptionChange` Logic

```typescript
export async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const team = await getTeamByStripeCustomerId(customerId);
  if (!team) { console.error(...); return; }

  if (status === 'active' || status === 'trialing') {
    // Update team with active subscription data
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: subscriptionId,
      stripeProductId: plan?.product as string,
      planName: (plan?.product as Stripe.Product).name,
      subscriptionStatus: status
    });
  } else if (status === 'canceled' || status === 'unpaid') {
    // Clear subscription data on cancellation
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: null,
      subscriptionStatus: status
    });
  }
}
```

Key: on cancellation, subscription fields are **nulled out** (except `subscriptionStatus`). Simple.

### 8. Customer Portal — Programmatic Configuration

The portal session is created with a programmatic configuration (not just dashboard config):

```typescript
export async function createCustomerPortalSession(team: Team) {
  // Check for existing configurations first
  const configurations = await stripe.billingPortal.configurations.list();
  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    // Create a new configuration programmatically
    configuration = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'Manage your subscription' },
      features: {
        subscription_update: { enabled: true, ... },
        subscription_cancel: { enabled: true, mode: 'at_period_end', ... },
        payment_method_update: { enabled: true }
      }
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`,
    configuration: configuration.id
  });
}
```

### 9. Pricing Page — Server Component, Hardcoded Plan Names

The pricing page is a **Server Component** that fetches products from Stripe, then matches them by name:

```typescript
const basePlan = products.find((product) => product.name === 'Base');
const plusPlan = products.find((product) => product.name === 'Plus');
```

Plan features are **hardcoded** in the component, not fetched from Stripe metadata. Product names must match exactly ('Base', 'Plus').

### 10. Stripe SDK Singleton

```typescript
// lib/payments/stripe.ts
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil'
});
```

Single instance, exported and reused everywhere.

### 11. Seed Script Creates Stripe Products

```typescript
// lib/db/seed.ts
async function createStripeProducts() {
  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });
  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800,
    currency: 'usd',
    recurring: { interval: 'month', trial_period_days: 7 },
  });
  // ... same for Plus plan
}
```

### 12. Environment Variables

```
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
BASE_URL=http://localhost:3000
```

Only **3 env vars** for Stripe. No publishable key needed (no client-side Stripe).

### 13. No Subscription Gating in Middleware

The `middleware.ts` only checks if a session cookie exists. It does **not** check subscription status. The pricing page is accessible to logged-in users without a subscription. The dashboard does not gate on subscription status.

This is a v1 simplicity choice — subscription gating can be added later.

---

## Part II: Complete File Map

### Files to Copy/Adapt from saas-starter

| # | saas-starter file | Sunder equivalent | Action |
|---|---|---|---|
| 1 | `lib/payments/stripe.ts` | `src/lib/stripe/stripe.ts` | **Copy + adapt.** Core file. Contains: Stripe singleton, `createCheckoutSession`, `createCustomerPortalSession`, `handleSubscriptionChange`, `getStripePrices`, `getStripeProducts`. Adapt `Team` → `Client`, Drizzle queries → Supabase queries. |
| 2 | `lib/payments/actions.ts` | `src/lib/stripe/actions.ts` | **Copy + adapt.** Server Actions for checkout and portal. Replace `withTeam` with Sunder's auth pattern (`authenticateRequest` → `resolveClientId`). |
| 3 | `app/api/stripe/webhook/route.ts` | `app/api/stripe/webhook/route.ts` | **Copy nearly verbatim.** Webhook handler. Same signature verification, same event handling. Only change: import paths. |
| 4 | `app/api/stripe/checkout/route.ts` | `app/api/stripe/checkout/route.ts` | **Copy + adapt.** Checkout success GET handler. Replace Drizzle queries with Supabase. Replace `teams`/`teamMembers` with `clients` table. |
| 5 | `app/(dashboard)/pricing/page.tsx` | `app/(dashboard)/pricing/page.tsx` | **Copy + adapt.** Pricing page Server Component. Change plan names/features/copy to match Sunder. Keep the ISR `revalidate = 3600` pattern. |
| 6 | `app/(dashboard)/pricing/submit-button.tsx` | `app/(dashboard)/pricing/submit-button.tsx` | **Copy verbatim.** Client component for form submit with loading state. |
| 7 | `lib/db/schema.ts` (teams table) | Supabase migration | **Adapt.** Add 5 Stripe columns to `clients` table instead of `teams`. |
| 8 | `lib/db/queries.ts` (Stripe-related) | `src/lib/stripe/queries.ts` | **Adapt.** `getTeamByStripeCustomerId` → `getClientByStripeCustomerId`. `updateTeamSubscription` → `updateClientSubscription`. Use Supabase client instead of Drizzle. |
| 9 | `lib/db/seed.ts` (Stripe products) | `supabase/seed.sql` or setup script | **Adapt.** Create Stripe products/prices via seed script. |
| 10 | `.env.example` | `.env.example` | **Add** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` entries. |

### Files NOT Needed (saas-starter has them, we skip)

| File | Why skip |
|---|---|
| `lib/db/setup.ts` | Interactive setup wizard. We use Supabase, not raw Postgres + Docker. |
| `lib/auth/middleware.ts` (`withTeam`) | We have our own auth middleware (`authenticateRequest` + `resolveClientId`). We'll build a `withClient` equivalent. |
| `lib/auth/session.ts` | Custom JWT auth. We use Supabase Auth. |

---

## Part III: Where Sunder Drifts — and Why

### Drift 1: Supabase instead of Drizzle ORM — JUSTIFIED

| Aspect | saas-starter | Sunder |
|---|---|---|
| Database | Raw Postgres + Drizzle ORM | Supabase (Postgres + RLS + client SDK) |
| Query pattern | `db.select().from(teams).where(...)` | `supabase.from('clients').select('*').eq(...)` |
| Schema definition | Drizzle `pgTable()` | SQL migrations in `supabase/migrations/` |

**Why drift:** Sunder's entire data layer is Supabase. Every hook, every API route, every RLS policy uses the Supabase client. Switching to Drizzle for Stripe alone would be inconsistent. The Stripe logic is identical — only the query syntax differs.

### Drift 2: Supabase Auth instead of Custom JWT — JUSTIFIED

| Aspect | saas-starter | Sunder |
|---|---|---|
| Auth | Custom JWT via `jose` + `bcryptjs` | Supabase Auth |
| Session | Cookie-based JWT signed with `AUTH_SECRET` | Supabase session (also JWT-based, managed by `@supabase/ssr`) |
| User ID | `users.id` (serial integer) | `auth.users.id` (UUID) |
| Middleware | Verifies JWT, refreshes session cookie | Validates Supabase session, redirects unauthenticated |

**Why drift:** Sunder already has Supabase Auth fully wired. All RLS policies use `auth.uid()`. Replacing this with custom JWT auth would require rewriting every RLS policy and auth hook.

### Drift 3: `clients` Table instead of `teams` Table — JUSTIFIED

| Aspect | saas-starter | Sunder |
|---|---|---|
| Tenant entity | `teams` (multi-member, `team_members` join table) | `clients` (1:1 with auth user) |
| Lookup | `teamMembers.userId` → `teams.id` | `clients.user_id` → `clients.client_id` |
| Stripe fields go on | `teams` table | `clients` table |

**Why drift:** Sunder is single-user (one agent per real estate agent). There is no team concept. The `clients` table is the equivalent tenant entity. Stripe columns go directly on `clients` — same pattern, different table name.

### Drift 4: `client_reference_id` Type — MINOR

| Aspect | saas-starter | Sunder |
|---|---|---|
| `client_reference_id` | `user.id.toString()` (integer → string) | `user.id` (already a UUID string) |

No real drift, just a type difference.

### NO DRIFT on These (Match Reference Exactly)

| Pattern | Match? | Notes |
|---|---|---|
| Redirect checkout (not embedded) | **YES** | Follow reference. Simpler, no client-side packages. |
| Server Actions for checkout/portal | **YES** | Follow reference. Forms + `useFormStatus`. |
| Stripe fields on tenant table (not separate tables) | **YES** | 5 columns on `clients` instead of separate `customers`/`subscriptions` tables. |
| Prices fetched from Stripe API (no DB cache) | **YES** | ISR with `revalidate = 3600`. No `stripe_products`/`stripe_prices` tables. |
| Webhook handles only 2 events | **YES** | `customer.subscription.updated` + `customer.subscription.deleted`. |
| Checkout success via GET route handler | **YES** | `/api/stripe/checkout?session_id={id}` → process + redirect. |
| Customer portal via Server Action | **YES** | Programmatic configuration + redirect. |
| Seed script creates Stripe products | **YES** | Adapt to Sunder's seed/setup pattern. |
| `SubmitButton` with `useFormStatus` | **YES** | Copy verbatim. |
| `revalidate = 3600` on pricing page | **YES** | ISR caching, prices fresh for 1 hour. |
| Only `stripe` package (no client-side deps) | **YES** | No `@stripe/stripe-js`, no `@stripe/react-stripe-js`. |
| 3 env vars only | **YES** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BASE_URL` (we already have `NEXT_PUBLIC_SITE_URL`). |

---

## Part IV: Detailed Implementation Guide

### Step 1: Add Stripe Columns to `clients` Table

**Migration:** `supabase/migrations/YYYYMMDD_add_stripe_to_clients.sql`

```sql
-- Add Stripe billing columns to clients table
-- Mirrors nextjs/saas-starter teams table pattern
alter table public.clients
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column stripe_product_id text,
  add column plan_name varchar(50),
  add column subscription_status varchar(20);

-- RLS: users can read their own Stripe data (already covered by existing clients RLS)
-- Webhook updates use service role (bypasses RLS)
```

**Then regenerate types:** `pnpm supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > src/types/database.ts`

### Step 2: Create `src/lib/stripe/stripe.ts`

Adapted from `saas-starter/lib/payments/stripe.ts`. This is the core file.

```typescript
/**
 * Stripe integration — server-side only.
 * Pattern: copied from nextjs/saas-starter with Supabase adaptations.
 * @see https://github.com/nextjs/saas-starter/blob/main/lib/payments/stripe.ts
 */
import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

// --- Types ---

interface Client {
  client_id: string;
  user_id: string;
  display_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_product_id: string | null;
  plan_name: string | null;
  subscription_status: string | null;
}

// --- Checkout ---

export async function createCheckoutSession({
  client,
  priceId,
}: {
  client: Client | null;
  priceId: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!client || !user) {
    redirect(`/register?redirect=checkout&priceId=${priceId}`);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
    customer: client.stripe_customer_id || undefined,
    client_reference_id: user.id,
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 14,
    },
  });

  redirect(session.url!);
}

// --- Customer Portal ---

export async function createCustomerPortalSession(client: Client) {
  if (!client.stripe_customer_id || !client.stripe_product_id) {
    redirect('/pricing');
  }

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await stripe.billingPortal.configurations.list();

  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    const product = await stripe.products.retrieve(client.stripe_product_id);
    if (!product.active) {
      throw new Error("Client's product is not active in Stripe");
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the client's product");
    }

    configuration = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'Manage your subscription' },
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          proration_behavior: 'create_prorations',
          products: [
            {
              product: product.id,
              prices: prices.data.map((price) => price.id),
            },
          ],
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: [
              'too_expensive',
              'missing_features',
              'switched_service',
              'unused',
              'other',
            ],
          },
        },
        payment_method_update: { enabled: true },
      },
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
    configuration: configuration.id,
  });
}

// --- Webhook Handler ---

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('client_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!client) {
    console.error('Client not found for Stripe customer:', customerId);
    return;
  }

  if (status === 'active' || status === 'trialing') {
    const plan = subscription.items.data[0]?.plan;
    await supabaseAdmin
      .from('clients')
      .update({
        stripe_subscription_id: subscriptionId,
        stripe_product_id: plan?.product as string,
        plan_name: (plan?.product as Stripe.Product).name,
        subscription_status: status,
      })
      .eq('client_id', client.client_id);
  } else if (status === 'canceled' || status === 'unpaid') {
    await supabaseAdmin
      .from('clients')
      .update({
        stripe_subscription_id: null,
        stripe_product_id: null,
        plan_name: null,
        subscription_status: status,
      })
      .eq('client_id', client.client_id);
  }
}

// --- Pricing Data ---

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring',
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days,
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price'],
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id,
  }));
}
```

### Step 3: Create `src/lib/stripe/actions.ts`

```typescript
/**
 * Stripe Server Actions.
 * Pattern: copied from nextjs/saas-starter.
 * @see https://github.com/nextjs/saas-starter/blob/main/lib/payments/actions.ts
 */
'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession, createCustomerPortalSession } from './stripe';
import { createClient } from '@/lib/supabase/server';
import { resolveClientId } from '@/lib/chat/client-id';

async function getClientForUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const clientId = await resolveClientId(supabase);
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('client_id', clientId)
    .single();

  return client;
}

export async function checkoutAction(formData: FormData) {
  const priceId = formData.get('priceId') as string;
  const client = await getClientForUser();
  await createCheckoutSession({ client, priceId });
}

export async function customerPortalAction() {
  const client = await getClientForUser();
  if (!client) redirect('/login');
  const portalSession = await createCustomerPortalSession(client);
  redirect(portalSession.url);
}
```

### Step 4: Create `app/api/stripe/webhook/route.ts`

```typescript
/**
 * Stripe webhook handler.
 * Pattern: copied from nextjs/saas-starter.
 * @see https://github.com/nextjs/saas-starter/blob/main/app/api/stripe/webhook/route.ts
 */
import Stripe from 'stripe';
import { handleSubscriptionChange, stripe } from '@/lib/stripe/stripe';
import { NextRequest, NextResponse } from 'next/server';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 },
    );
  }

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
```

### Step 5: Create `app/api/stripe/checkout/route.ts`

```typescript
/**
 * Stripe checkout success handler (GET).
 * Called after Stripe redirects back from checkout.
 * Pattern: copied from nextjs/saas-starter.
 * @see https://github.com/nextjs/saas-starter/blob/main/app/api/stripe/checkout/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session.customer || typeof session.customer === 'string') {
      throw new Error('Invalid customer data from Stripe.');
    }

    const customerId = session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error('No subscription found for this session.');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    const plan = subscription.items.data[0]?.price;
    if (!plan) throw new Error('No plan found for this subscription.');

    const productId = (plan.product as Stripe.Product).id;
    if (!productId) throw new Error('No product ID found for this subscription.');

    const userId = session.client_reference_id;
    if (!userId) throw new Error("No user ID found in session's client_reference_id.");

    // Look up the client by user_id (Sunder adaptation)
    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('client_id')
      .eq('user_id', userId)
      .single();

    if (error || !client) {
      throw new Error('Client not found for user.');
    }

    // Update client with Stripe data
    await supabaseAdmin
      .from('clients')
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_product_id: productId,
        plan_name: (plan.product as Stripe.Product).name,
        subscription_status: subscription.status,
      })
      .eq('client_id', client.client_id);

    return NextResponse.redirect(new URL('/chat', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/pricing', request.url));
  }
}
```

### Step 6: Create Pricing Page

Copy `saas-starter/app/(dashboard)/pricing/page.tsx` and adapt plan names/features.
Copy `saas-starter/app/(dashboard)/pricing/submit-button.tsx` verbatim.

### Step 7: Add Billing Management to Account Page

A "Manage Billing" button that triggers `customerPortalAction`:

```typescript
<form action={customerPortalAction}>
  <Button type="submit">Manage Billing</Button>
</form>
```

### Step 8: Environment Variables

Add to `.env.example`:
```
STRIPE_SECRET_KEY=sk_test_***
STRIPE_WEBHOOK_SECRET=whsec_***
```

`BASE_URL` → we already have `NEXT_PUBLIC_SITE_URL`.

### Step 9: Install Dependency

```bash
pnpm add stripe
```

That's it. One package. No `@stripe/stripe-js`, no `@stripe/react-stripe-js`.

---

## Part V: What Changed from Previous Design Doc

The previous design doc (`docs/product/designs/stripe-billing-integration.md`) was written before analyzing the reference. Key changes:

| Previous Design Doc | Updated (Reference-Aligned) | Why |
|---|---|---|
| Embedded Checkout | **Redirect Checkout** | Reference uses redirect. Simpler, no client-side deps. |
| 3 npm packages (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`) | **1 npm package** (`stripe`) | No client-side Stripe needed for redirect checkout. |
| 4 separate DB tables (`customers`, `subscriptions`, `stripe_products`, `stripe_prices`) | **5 columns on `clients` table** | Reference puts Stripe fields on tenant table. Much simpler. |
| Route handlers for checkout/portal | **Server Actions** | Reference uses Server Actions + forms. More idiomatic Next.js 15. |
| Custom `useSubscription` TanStack Query hook | **Not needed initially** | Subscription status is on the `clients` table, already available. |
| 6+ webhook events | **2 webhook events** | Reference handles only `subscription.updated` + `subscription.deleted`. |
| Separate checkout success page | **GET route handler** that processes + redirects | Reference processes checkout in a route handler, then redirects to dashboard. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var | **Not needed** | No client-side Stripe. |
| Middleware subscription gating | **Not in v1** | Reference doesn't gate on subscription in middleware. Add later. |

---

## Part VI: Testing Checklist

### Local Development Setup
1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
4. Copy webhook secret from CLI output → `STRIPE_WEBHOOK_SECRET`
5. Create test products: run seed script or manually in Stripe Dashboard

### Manual Test Checklist
- [ ] Pricing page loads with correct plans and prices from Stripe
- [ ] "Get Started" button redirects to Stripe Checkout
- [ ] Completing checkout redirects back to `/api/stripe/checkout` → `/chat`
- [ ] `clients` row has `stripe_customer_id`, `stripe_subscription_id`, `stripe_product_id`, `plan_name`, `subscription_status` populated
- [ ] Cancelling subscription in Customer Portal → webhook fires → `subscription_status` set to `canceled`, other Stripe fields nulled
- [ ] Upgrading/downgrading plan → webhook fires → fields updated
- [ ] "Manage Billing" button opens Stripe Customer Portal
- [ ] Test card `4242 4242 4242 4242` works for successful payment
- [ ] Test card `4000 0000 0000 0002` shows decline error on Stripe Checkout
- [ ] Webhook signature verification rejects invalid signatures (return 400)
- [ ] Duplicate webhook events handled idempotently (update, not error)

### Stripe CLI Trigger Tests
```bash
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger checkout.session.completed
```

---

## Appendix: Full File Inventory of saas-starter Stripe Code

For developer reference — read these files in this order:

1. **`lib/payments/stripe.ts`** — Core Stripe logic (singleton, checkout, portal, webhook handler, pricing fetchers)
2. **`lib/payments/actions.ts`** — Server Actions (2 lines each, just wrap the core functions with auth)
3. **`app/api/stripe/webhook/route.ts`** — Webhook endpoint (34 lines)
4. **`app/api/stripe/checkout/route.ts`** — Checkout success handler (97 lines)
5. **`app/(dashboard)/pricing/page.tsx`** — Pricing page (95 lines)
6. **`app/(dashboard)/pricing/submit-button.tsx`** — Submit button (31 lines)
7. **`lib/db/schema.ts`** — Teams table with Stripe columns (lines 22-32)
8. **`lib/db/queries.ts`** — `getTeamByStripeCustomerId`, `updateTeamSubscription` (lines 39-65)
9. **`lib/db/seed.ts`** — `createStripeProducts` (lines 6-39)
10. **`.env.example`** — 3 Stripe env vars
