# Stripe Billing Integration — Handover

## Status

**Implemented and approved on 2026-03-11.**

`FOUND-07` is no longer deferred. Stripe billing now ships as a Phase 4 scope exception in the v2 plan.

## Grounding

- **Source of truth scope:** `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` (`PR 38b`)
- **Architecture decision:** `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json` (`FOUND-07`)
- **Design doc:** `docs/product/designs/stripe-billing-integration.md`
- **Official Stripe guidance:** hosted Checkout + Customer Portal + webhook provisioning/lifecycle sync
- **Official Vercel reference:** `vercel/nextjs-subscription-payments` for Supabase/Stripe wiring patterns
- **Current Next.js reference:** `nextjs/saas-starter` for App Router server-action structure

## Chosen Model

- **Free** is an internal default state, not a Stripe subscription.
- **Pro** and **Max** are paid Stripe plans.
- Stripe is the billing source of truth.
- Sunder mirrors only the **current** billing state onto `clients`.
- No `products`, `prices`, `customers`, or `subscriptions` tables are introduced in Sunder.
- Paid plan selection is pinned to explicit Stripe **price ids**, not mutable product names.
- Checkout is only for **starting** a paid subscription.
- Upgrades, downgrades, cancellations, and payment-method changes happen in the **Stripe Customer Portal**.
- Webhooks are canonical. The `/api/stripe/checkout` redirect handler is only a user-facing fallback.

## Files

- `supabase/migrations/20260311000000_add_stripe_fields_to_clients.sql`
- `src/lib/stripe/plans.ts`
- `src/lib/stripe/stripe.ts`
- `src/lib/stripe/actions.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/stripe/checkout/route.ts`
- `app/(dashboard)/pricing/page.tsx`
- `app/(dashboard)/pricing/submit-button.tsx`
- `app/(dashboard)/settings/page.tsx`

## Clients Table Fields

- `stripe_customer_id`
- `stripe_subscription_id`
- `stripe_product_id`
- `plan_name`
- `subscription_status`

This is intentionally a lightweight mirror of the current paid state for one-client-per-user Sunder.

## Webhook Contract

Subscribe Stripe to these events:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Behavior:

- `checkout.session.completed` provisions the initial paid subscription.
- `invoice.paid` keeps the paid state current across billing cycles.
- `invoice.payment_failed` keeps the client row aligned with payment trouble states.
- `customer.subscription.updated` syncs plan/status changes.
- `customer.subscription.deleted` clears paid-plan state while keeping the Stripe customer id.
- If Sunder cannot map the Stripe event back to a client, the webhook returns `500` so Stripe retries instead of dropping the event.

## Redirect Flow

1. Authenticated user opens `/pricing`
2. Free user chooses `Pro` or `Max`
3. Server action creates hosted Stripe Checkout session
4. Stripe redirects back to `/api/stripe/checkout?session_id=...`
5. Fallback route syncs billing state and redirects to `/settings?billing=success`
6. Webhooks remain the canonical background sync path

Duplicate-subscription protection:

- Sunder checks live Stripe subscriptions for the current customer before creating a Checkout session.
- If Stripe already has a live subscription, Sunder resyncs local billing state and sends the user back to `/pricing?billing=already-subscribed`.
- Stripe Checkout should also be configured to limit customers to one subscription and redirect existing subscribers to the Customer Portal as defense in depth.

## Settings Behavior

- `/settings` shows the current mirrored billing state
- `/settings` opens the Stripe Customer Portal if `stripe_customer_id` exists
- Free users are sent to `/pricing` to start a paid subscription

## Stripe Dashboard Setup

Create these recurring monthly products/prices in **SGD**:

- `Pro` — SGD 25/month
- `Max` — SGD 99/month

Trials:

- `Pro` — 7 days
- `Max` — 7 days

Also:

- Enable **Customer Portal**
- Allow customers to update payment methods
- Allow customers to cancel subscriptions
- Allow customers to switch between the configured paid products/prices
- Use authenticated portal sessions from Sunder `/settings`; no standalone Stripe portal login page is required
- Configure Checkout to **limit customers to one subscription** and redirect existing subscribers to the Customer Portal
- Point the Stripe webhook endpoint at `/api/stripe/webhook`
- Add the five event types above

## Environment

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_MAX_PRICE_ID`
- `NEXT_PUBLIC_APP_URL` preferred for app callbacks
- `NEXT_PUBLIC_SITE_URL` fallback if needed
- `SUPABASE_SERVICE_ROLE_KEY`

## Verification

- Free user sees `Free` as current plan in `/pricing`
- Paid plans render from live Stripe pricing data
- Starting `Pro` or `Max` redirects to hosted Checkout
- Successful Checkout syncs `clients` and redirects to `/settings?billing=success`
- `/settings` shows current plan and opens the Customer Portal
- `stripe trigger checkout.session.completed` updates billing state
- `stripe trigger invoice.paid` updates billing state
- `stripe trigger invoice.payment_failed` updates billing state
- `stripe trigger customer.subscription.updated` updates billing state
- `stripe trigger customer.subscription.deleted` clears paid-plan state

## Notes

- Do not add client-side Stripe SDK packages.
- Do not create normalized Stripe mirror tables unless Sunder later needs historical billing analytics.
- If billing logic changes, update the actual implementation first, then this handover and the design doc.
