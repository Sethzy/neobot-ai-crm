# Stripe Billing Integration

## Status

**Implemented on 2026-03-11.**

This design reflects the billing system currently wired into the app. If implementation changes, the code is canonical first, then this document and the handover should be updated.

## Source Of Truth

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` (`PR 38b`)
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` (`FOUND-07`)
- `docs/product/handovers/stripe-billing-handover.md`

## External References

- Stripe hosted subscription guidance: Checkout + Customer Portal + webhook-based provisioning
- Stripe recurring billing lifecycle guidance: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`
- Vercel reference patterns:
  - `vercel/nextjs-subscription-payments` for Supabase + Stripe sync shape
  - `nextjs/saas-starter` for current App Router structure

## Product Model

- `Free` is the internal default state and does not exist as a Stripe subscription.
- `Pro` and `Max` are paid monthly Stripe subscriptions.
- Stripe remains the canonical billing source of truth.
- Sunder mirrors only the current billing state onto `public.clients`.
- Sunder does not maintain separate normalized Stripe mirror tables for products, prices, customers, or subscriptions.
- Subscription creation happens in hosted Stripe Checkout.
- Subscription changes happen in the Stripe Customer Portal.

## Data Model

Stripe billing state is mirrored onto `public.clients` through:

- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_product_id`
- `plan_name`
- `subscription_status`

Migration:

- `supabase/migrations/20260311000000_add_stripe_fields_to_clients.sql`

This is intentionally the smallest shape that supports gating, settings UI, and billing awareness for one-client-per-user v1.

## Server Components And Routes

- `src/lib/stripe/plans.ts`
  - Declares the internal billing catalog (`Free`, `Pro`, `Max`)
- `src/lib/stripe/stripe.ts`
  - Stripe client bootstrap
  - plan discovery from live Stripe prices
  - checkout session creation
  - customer portal session creation
  - webhook sync helpers back into Supabase
- `src/lib/stripe/actions.ts`
  - Server actions for Checkout and Customer Portal entry
- `app/api/stripe/webhook/route.ts`
  - Canonical background sync endpoint
- `app/api/stripe/checkout/route.ts`
  - Fallback success redirect sync, then redirect to `/settings?billing=success`
- `app/(dashboard)/pricing/page.tsx`
  - Authenticated pricing surface
- `app/(dashboard)/settings/page.tsx`
  - Billing summary and portal access

## Checkout Flow

1. Authenticated user opens `/pricing`.
2. Free user selects `Pro` or `Max`.
3. A server action validates the Stripe `priceId` and creates a hosted Checkout session.
4. Stripe redirects back to `/api/stripe/checkout?session_id=...`.
5. The fallback route attempts a direct sync and redirects the user to `/settings?billing=success`.
6. Webhooks remain the canonical billing sync path even if the fallback route succeeds.

## Webhook Contract

The webhook endpoint subscribes to:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Behavior:

- `checkout.session.completed`
  - Provisions the initial paid subscription state
- `invoice.paid`
  - Refreshes the mirrored active state on successful recurring charges
- `invoice.payment_failed`
  - Preserves Stripe as canonical and mirrors payment trouble states into `subscription_status`
- `customer.subscription.updated`
  - Syncs upgrades, downgrades, trial transitions, and other state changes
- `customer.subscription.deleted`
  - Clears paid subscription fields while retaining the Stripe customer id

## UI Behavior

### Pricing

- Shows `Free`, `Pro`, and `Max`
- Reads live paid pricing from Stripe
- Blocks duplicate paid checkout if a live paid subscription already exists
- Sends paid users to the Stripe Customer Portal instead of opening another checkout session

### Settings

- Shows current mirrored plan state from `clients`
- Shows Stripe customer and subscription identifiers for support/debug visibility
- Opens Stripe Customer Portal when a Stripe customer exists
- Shows a billing success alert after the checkout fallback redirect completes

## Environment

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL` as fallback
- `SUPABASE_SERVICE_ROLE_KEY`

## Stripe Dashboard Setup

Create recurring monthly prices in `sgd` for:

- `Pro` at SGD 25/month
- `Max` at SGD 99/month

Configure:

- 7-day trial for both paid plans
- Stripe Customer Portal
- Webhook endpoint at `/api/stripe/webhook`
- The five event types listed above

## Verification

- `/pricing` renders `Free`, `Pro`, and `Max`
- Paid prices load from live Stripe data
- Checkout redirects to Stripe-hosted billing
- Successful checkout lands on `/settings?billing=success`
- `public.clients` syncs current Stripe state
- Customer Portal opens from `/settings`
- Stripe CLI event replay updates mirrored billing state correctly

## Deliberate Non-Goals

- No client-side Stripe Elements or embedded checkout flow
- No historical invoice analytics inside Sunder
- No separate internal billing admin system
- No multi-seat or per-user subscription model
