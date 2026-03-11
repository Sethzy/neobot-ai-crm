# Stripe Billing Integration

## Status

**Implemented on 2026-03-11.**

This design reflects the billing system currently wired into the app. If implementation changes, the code is canonical first, then this document and the handover should be updated.

## Source Of Truth

- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` (`PR 38b`, `PR 38c`)
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
- Paid plan mapping is pinned to explicit Stripe price ids, not mutable dashboard product names.
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
  - plan discovery from configured live Stripe price ids
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
- `src/lib/usage/message-quota.ts`
  - Shared RPC wrappers for message quota status/consumption
- `src/lib/usage/message-quota-server.ts`
  - Server-side quota loader for pricing, settings, and chat
- `src/hooks/use-message-quota.ts`
  - Client-side TanStack Query hook for live quota refresh

## Message Usage Caps

- Stripe still decides which plan the client is on.
- Message usage accounting lives in Supabase, not Stripe metered billing.
- Monthly caps are:
  - `Free`: `100`
  - `Pro`: `500`
  - `Max`: `2,000`
- The month boundary is `Asia/Singapore`.
- A billable message is one brand-new inbound user-authored chat turn.
- Do not count:
  - assistant replies
  - approval continuations
  - queued replays
  - tool calls
  - pulse/cron runs

Migration:

- `supabase/migrations/20260311010000_create_message_quota.sql`

Data model:

- `public.client_message_usage_monthly`
  - keyed by `client_id` + Singapore `period_start`
  - stores `messages_used`
- RPCs:
  - `get_message_quota_status`
  - `consume_message_quota`

## Checkout Flow

1. Authenticated user opens `/pricing`.
2. Free user selects `Pro` or `Max`.
3. A server action validates the Stripe `priceId` and creates a hosted Checkout session.
4. Stripe redirects back to `/api/stripe/checkout?session_id=...`.
5. The fallback route attempts a direct sync and redirects the user to `/settings?billing=success`.
6. Webhooks remain the canonical billing sync path even if the fallback route succeeds.

Before creating Checkout, Sunder queries live Stripe subscriptions for the current customer. If Stripe already has a non-terminal subscription, Sunder resyncs local billing state and routes the user back to the billing UI instead of opening a second Checkout session.

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
- If no client can be resolved from the Stripe customer id or metadata, the webhook path fails closed so Stripe retries delivery

## UI Behavior

### Pricing

- Shows `Free`, `Pro`, and `Max`
- Reads live paid pricing from Stripe
- Reads those paid prices from explicitly configured Stripe price ids
- Shows each plan's monthly message cap
- Shows the current plan's used/remaining quota plus reset date when quota is available
- Blocks duplicate paid checkout if a live paid subscription already exists
- Sends paid users to the Stripe Customer Portal instead of opening another checkout session

### Settings

- Shows current mirrored plan state from `clients`
- Shows monthly message cap, used count, remaining count, and reset date
- Shows Stripe customer and subscription identifiers for support/debug visibility
- Opens Stripe Customer Portal when a Stripe customer exists
- Shows a billing success alert after the checkout fallback redirect completes

### Chat

- `/chat` and `/chat/[threadId]` hydrate the current quota server-side for fast first paint
- The composer shows current usage and a reset date
- When remaining quota reaches `0`, the composer disables new sends and attachments
- The upgrade path is `/pricing`
- If the user hits the cap on send, the API returns a structured `402` payload and the chat UI surfaces a friendly quota error instead of raw JSON

## Environment

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_MAX_PRICE_ID`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL` as fallback
- `SUPABASE_SERVICE_ROLE_KEY`

## Stripe Dashboard Setup

Create recurring monthly prices in `sgd` for:

- `Pro` at SGD 25/month
- `Max` at SGD 99/month

Configure:

- 7-day trial for both paid plans
- Stripe Customer Portal with subscription cancellation, payment-method management, and plan switching enabled
- Authenticated portal sessions from Sunder rather than the standalone Stripe portal login link
- Checkout set to limit customers to one subscription and redirect existing subscribers to the Customer Portal
- Webhook endpoint at `/api/stripe/webhook`
- The five event types listed above

## Verification

- `/pricing` renders `Free`, `Pro`, and `Max`
- Paid prices load from live Stripe data
- `/pricing` shows plan caps and current usage state
- Checkout redirects to Stripe-hosted billing
- Successful checkout lands on `/settings?billing=success`
- `public.clients` syncs current Stripe state
- `client_message_usage_monthly` enforces Singapore-month message quotas
- Customer Portal opens from `/settings`
- `/chat` disables new sends at zero remaining quota and links to `/pricing`
- Stripe CLI event replay updates mirrored billing state correctly

## Deliberate Non-Goals

- No client-side Stripe Elements or embedded checkout flow
- No historical invoice analytics inside Sunder
- No separate internal billing admin system
- No multi-seat or per-user subscription model
