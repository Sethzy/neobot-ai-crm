# PostHog Analytics — Handover

## Status

**Implemented on March 11, 2026.** Core product, billing, CRM, connection, trigger, memory, upload, and auth analytics are wired. The remaining work is operational: confirm live production events in PostHog, build dashboards, and start using the data.

## Goal

Add PostHog product analytics to Sunder so we can measure acquisition, activation, engagement, retention, and revenue across the full user lifecycle.

## Chosen Approach

- **PostHog Cloud** (US or EU region) — no self-hosted.
- **Client-side SDK** (`posthog-js`) for browser events + autocapture.
- **Server-side SDK** (`posthog-node`) for API route events (chat, billing, agent runs).
- **Identify on auth** — link Supabase `client_id` to the PostHog person with plan/client properties.
- PostHog autocapture handles pageviews, clicks, and form interactions for free. Custom events cover product-specific flows.

## Packages

```bash
pnpm add posthog-js posthog-node
```

## Environment Variables

Add to `.env.example` and `.env.local`:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_7S4UAyLFmXL9x9qgqWN6oTpKDQhwvPhYEdV7CaS0hxE
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_ENVIRONMENT=production
NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS=sunder.com
```

No server-only key is needed — `posthog-node` uses the same project API key.

`NEXT_PUBLIC_POSTHOG_ENVIRONMENT` and `NEXT_PUBLIC_POSTHOG_INTERNAL_EMAIL_DOMAINS` are optional but recommended. They let PostHog tag preview/dev traffic and mark internal team accounts so PM dashboards can filter them out cleanly.

## Files to Create

### 1. `instrumentation-client.ts` — Client-side init (Next.js 15.3+)

Next.js 15.3+ supports `instrumentation-client.ts` at the project root. This runs once on the client before any component mounts — no provider component needed.

```ts
/**
 * PostHog client-side initialization via Next.js instrumentation hook.
 * @module instrumentation-client
 */
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
});
```

The `defaults` option applies PostHog's recommended settings for new projects (autocapture, pageviews, session recording config, etc.). See [SDK defaults docs](https://posthog.com/docs/libraries/js#sdk-defaults) for what it includes.

After this, `import posthog from "posthog-js"` works anywhere in client components — no wrapper or context needed.

### 2. `src/lib/analytics/posthog-server.ts` — Server singleton

```ts
/**
 * PostHog server-side client for API route events.
 * @module lib/analytics/posthog-server
 */
import { PostHog } from "posthog-node";

let client: PostHog | null = null;

/** Returns the server-side PostHog client. Safe to call in any API route or server action. */
export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    });
  }

  return client;
}
```

**Docs drift update:** Current `posthog-node` guidance and typings no longer center the older `flushAt: 1` / `flushInterval: 0` pattern. For Vercel/serverless, prefer a shared singleton plus helper functions that use `captureImmediate()` for one-off events and `capture()` + `flush()` for batched events.

**Important:** If you ever move away from the shared singleton and create a new `PostHog` instance per request, explicitly flush or shut it down before the request exits.

## Files to Modify

### 3. Identify on Auth — wherever Supabase session resolves on the client

After the user signs in and you have both a Supabase session and the resolved `clientId`, call:

```ts
import posthog from "posthog-js";

posthog.identify(clientId, {
  email: user.email,
  name: user.user_metadata?.display_name,
  plan_name: client.plan_name,           // from clients table
  subscription_status: client.subscription_status,
  environment: "production",
  is_internal: false,
});
```

On sign out:

```ts
import posthog from "posthog-js";
posthog.reset();
```

The best place for this is wherever the app resolves the current user session on the client side. In the current implementation this lives in `src/contexts/thread-context.tsx`. Email auth events are queued until that `clientId` identity is available so they still land on the right person.

### 4. `.env.example` — Add the two PostHog env vars

```
# Analytics (PostHog)
NEXT_PUBLIC_POSTHOG_KEY=phc_7S4UAyLFmXL9x9qgqWN6oTpKDQhwvPhYEdV7CaS0hxE
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

---

## Event Taxonomy

All custom events below. PostHog autocapture from `instrumentation-client.ts` handles pageviews, clicks, and basic interactions automatically — these are product-specific events only.

### Priority 1 — Instrument First (Core Loop + Billing)

These give you activation, engagement, and revenue signal immediately.

| Event | Properties | Where to Add | Source |
|-------|-----------|-------------|--------|
| `chat_message_sent` | `thread_id`, `is_new_thread`, `has_files`, `file_count` | `app/api/chat/route.ts` — after `runAgent()` returns `streaming` | server |
| `agent_run_completed` | `run_id`, `thread_id`, `trigger_type`, `duration_ms`, `steps`, `total_tokens`, `tools_called` | `src/lib/runner/run-agent.ts` — inside `finalizeRun` or the `onFinish` callback | server |
| `agent_run_failed` | `run_id`, `thread_id`, `trigger_type`, `run_type`, `duration_ms`, `error_stage`, `error_name`, `error` | `src/lib/runner/run-agent.ts` — error path | server |
| `approval_requested` | `approval_id`, `run_id`, `thread_id`, `tool_name`, `trigger_type` | `src/lib/runner/run-persistence.ts` — after approval rows persist | server |
| `approval_resolved` | `tool_name`, `approval_id`, `outcome` (approved/denied) | `app/api/chat/route.ts` — after `resolveApprovalEvent` succeeds | server |
| `checkout_started` | `plan_name`, `billing_interval` | `src/lib/stripe/actions.ts` — after Stripe session is created | server |
| `subscription_created` | `plan_name`, `trial`, `stripe_customer_id` | `app/api/stripe/webhook/route.ts` — inside `checkout.session.completed` case | server |
| `subscription_canceled` | `plan_name` | `app/api/stripe/webhook/route.ts` — inside `customer.subscription.deleted` case | server |
| `payment_failed` | `plan_name` | `app/api/stripe/webhook/route.ts` — inside `invoice.payment_failed` case | server |

#### Instrumentation Pattern for Server Events

```ts
import { captureServerEvent } from "@/lib/analytics/posthog-server";

await captureServerEvent({
  distinctId: clientId,   // use clientId as the distinct ID for server events
  event: "chat_message_sent",
  properties: {
    thread_id: threadId,
    is_new_thread: isNewThread,
    has_files: fileParts.length > 0,
    file_count: fileParts.length,
  },
});
```

For Stripe webhook events where you don't have a `clientId` at the webhook entrypoint, resolve it from billing sync logic before emitting the event. Do not emit Stripe events against `stripe_customer_id`; the shipped implementation resolves `clientId` first so those events stay on the same identified person.

### Priority 2 — Instrument Next (CRM + Connections)

| Event | Properties | Where to Add | Source |
|-------|-----------|-------------|--------|
| `crm_record_created` | `entity_type`, `source` (agent/manual) | CRM tool functions in `src/lib/runner/tools/crm/` AND any client-side create flows | server |
| `crm_record_viewed` | `entity_type`, `record_id` | Detail page components (`/customers/people/[contactId]`, etc.) | client |
| `deal_stage_changed` | `from_stage`, `to_stage`, `deal_value` | Deal update tool + kanban drag handler | server/client |
| `connection_initiated` | `toolkit_slug` | `app/api/connections/initiate/route.ts` | server |
| `connection_completed` | `toolkit_slug` | `app/api/connections/callback/route.ts` | server |
| `trigger_created` | `trigger_type` | Trigger setup tool in runner tools | server |
| `trigger_executed` | `trigger_id`, `thread_id`, `trigger_type`, `result_status`, `success`, `duration_ms` | Cron scanner / trigger execution path | server |

### Priority 3 — Instrument Later (Nice to Have)

| Event | Properties | Where to Add |
|-------|-----------|-------------|
| `memory_file_saved` | `filename`, `operation`, `size_bytes`, `source` (`dashboard`/`agent`) | Memory page save handler and agent `write_file` tool |
| `file_uploaded` | `file_type`, `size_bytes` | `/api/files/upload` |
| `command_menu_opened` | — | `src/components/command-menu.tsx` |
| `signed_up` | `method` (email/google) | Auth callback / register page |
| `signed_in` | `method` (email/google) | Auth callback / login page |

**Note on `signed_up` / `signed_in`:** PostHog autocapture on the `/register` and `/login` form submissions may be sufficient. Only add custom events if you need the `method` property split or the autocaptured data is noisy.

---

## Dashboard Recommendations

Build these in PostHog once events are flowing. The live PostHog project has already been migrated to this v2 stack and naming.

### Dashboard 1: Time to Trusted Value (Build First)

| Insight | Type | Definition |
|---------|------|-----------|
| Signup → first message | Funnel | `signed_up` → `chat_message_sent` |
| Time to first message | Distribution | Time between `signed_up` and first `chat_message_sent` |
| Signup → first completed run | Funnel | `signed_up` → `agent_run_completed` |
| Time to first completed run | Distribution | Time between `signed_up` and first `agent_run_completed` |
| Repeat usage within 7 days | Funnel | `signed_up` → first `chat_message_sent` → repeat `chat_message_sent` within 7 days |
| Weekly active chat users | Trend | Unique users with `chat_message_sent` per week |

### Dashboard 2: Trust & Autonomy

| Insight | Type | Definition |
|---------|------|-----------|
| Run success vs failure | Trend | `agent_run_completed` vs `agent_run_failed` |
| Approval requests over time | Trend | `approval_requested` count per day or week |
| Approval outcomes | Trend | `approval_resolved` broken down by `outcome` |
| Top tools used | Bar chart | `agent_run_completed` → breakdown by `tools_called` |
| Run duration P50/P95 | Trend | `agent_run_completed` → `duration_ms` percentiles |
| Runs by trigger type | Trend | `agent_run_completed` broken down by `trigger_type` |
| Failed runs by stage | Bar | `agent_run_failed` broken down by `error_stage` |
| Token usage trend | Trend | `agent_run_completed` → sum of `total_tokens` per day |

### Dashboard 3: Compounding Usage

| Insight | Type | Definition |
|---------|------|-----------|
| Memory writes over time | Trend | `memory_file_saved` count per week |
| Connections completed over time | Trend | `connection_completed` count per week |
| Automations created over time | Trend | `trigger_created` count per week |
| Automations executed over time | Trend | `trigger_executed` count per week |
| CRM work completed over time | Trend | `crm_record_created` and `deal_stage_changed` per week |
| Weekly chat retention | Retention | Cohort on `signed_up`, returning on `chat_message_sent` |

### Dashboard 4: Revenue Readiness

| Insight | Type | Definition |
|---------|------|-----------|
| Plan distribution | Pie | Unique users by `plan_name` person property |
| Trial → Paid conversion | Funnel | `checkout_started` → `subscription_created` |
| Churn over time | Trend | `subscription_canceled` count per week |
| Payment failure rate | Trend | `payment_failed` count per week |
| Pricing page → checkout | Funnel | `$pageview /pricing` → `checkout_started` |

### Dashboard 5: Acquisition

| Insight | Type | Definition |
|---------|------|-----------|
| Unique visitors | Trend | `$pageview` unique users per day |
| Traffic sources | Bar | `$pageview` breakdown by `$referring_domain` or UTM source |
| Landing → Signup | Funnel | `$pageview /` → `$pageview /register` → `signed_up` |
| Signup method split | Pie | `signed_up` breakdown by `method` |

---

## Implementation Order

1. **Install packages** (`pnpm add posthog-js posthog-node`) + add env vars to `.env.example` and `.env.local`
2. **Create `instrumentation-client.ts`** at project root — this alone gives you autocapture + pageviews with zero provider wiring
3. **Create `src/lib/analytics/posthog-server.ts`** — server-side singleton
4. **Add identify call** on auth — gives you person profiles with plan data
5. **Instrument Priority 1 events** — chat route, run-agent, stripe webhook (~8 `ph.capture()` calls total)
6. **Build Dashboard 1 and 2** in PostHog UI
7. **Instrument Priority 2 events** when you need CRM/connection analytics
8. **Build remaining dashboards** as data accumulates

## Gotchas

- **`distinctId` consistency:** Use `clientId` (not `userId`) as the PostHog `distinctId` everywhere. This matches your tenant model (one client per user). Call `posthog.identify(clientId)` on the client side too, not `userId`, so server and client events merge correctly.
- **Stripe webhook `distinctId`:** In the webhook handler you don't have a `clientId` in the request context. You'll need to look it up from the subscription's `stripe_customer_id` against the `clients` table, which `syncBillingStateFromSubscriptionId` already does. Emit the PostHog event inside or after that sync function where `clientId` is available.
- **Serverless flush:** Current PostHog docs favor explicit `captureImmediate()` / `flush()` calls for serverless safety instead of relying on the older `flushAt` / `flushInterval` constructor options.
- **No PII in event properties:** Don't put email, name, or phone in event properties. Those go on the person profile via `identify` only.
- **`instrumentation-client.ts` location:** Must be at the project root (next to `package.json`), not inside `src/`. Next.js 15.3+ picks it up automatically.
- **PostHog Toolbar / Feature Flags:** Not needed for v1. Ignore those features for now.

## Verification

After implementing steps 1-5:

- [ ] Open the app in a browser → check PostHog Live Events → you should see `$pageview` events firing on navigation
- [ ] Sign in → check PostHog Persons → your user should appear with `email`, `plan_name` properties
- [ ] Send a chat message → check Live Events → `chat_message_sent` should appear with correct properties
- [ ] Complete a Stripe test checkout → `subscription_created` should appear in Live Events
- [ ] Sign out → `posthog.reset()` should clear the identified user

## References

- [PostHog Next.js guide](https://posthog.com/docs/libraries/next-js)
- [PostHog Node.js guide](https://posthog.com/docs/libraries/node)
- Existing billing integration pattern: `docs/product/handovers/stripe-billing-handover.md`
