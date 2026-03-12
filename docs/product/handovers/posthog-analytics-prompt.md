# PostHog Analytics — Implementation Prompt

Copy-paste this into a new Claude Code session.

---

## Prompt

Implement PostHog analytics for Sunder end-to-end. The full design doc is at `docs/product/handovers/posthog-analytics-handover.md` — read it fully before writing any code. It has the event taxonomy, dashboard specs, gotchas, and verification checklist.

This prompt tells you exactly what to build and where. Do everything below in order, committing after each phase.

---

### Phase 1: Foundation

**1. Install packages**

```bash
pnpm add posthog-js posthog-node
```

**2. Add env vars**

Add to both `.env.example` and `.env.local`:

```
# Analytics (PostHog)
NEXT_PUBLIC_POSTHOG_KEY=phc_7S4UAyLFmXL9x9qgqWN6oTpKDQhwvPhYEdV7CaS0hxE
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

**3. Create `instrumentation-client.ts` at the project root** (next to `package.json`, NOT inside `src/`)

Use the Next.js 15.3+ instrumentation hook. Initialize `posthog-js` with `defaults: "2026-01-30"`. This runs once on the client before any component mounts — no provider component needed. After this, `import posthog from "posthog-js"` works anywhere in client components. See the handover doc for the exact code.

**4. Create `src/lib/analytics/posthog-server.ts`**

Singleton that returns a `PostHog` node client. Follow the current PostHog serverless pattern from the handover doc: use a shared client plus small helper functions such as `captureServerEvent()` and `captureServerEvents()` that call `captureImmediate()` for one-off events and `flush()` for batches. Returns `null` if the env var is missing.

**5. Wire up `posthog.identify()` on auth**

Find where the app resolves the Supabase session on the client side (look for auth hooks, layouts, or providers that access the Supabase user). Add:

- On sign in: `posthog.identify(clientId, { email, name, plan_name, subscription_status })`
- On sign out: `posthog.reset()`

Don't create new files for this. Find the existing auth flow and add the calls there. Use `clientId` as the distinct ID (not `userId`) — this matches our tenant model where every query filters by `client_id`.

If an auth event can fire before `clientId` is available, queue it and flush it after `identify(clientId, ...)` runs so `signed_in` / `signed_up` still land on the identified person.

**Commit:** `feat: posthog foundation — SDK init, server singleton, identify on auth`

---

### Phase 2: Priority 1 Events (Core Loop + Billing)

These are server-side events. Use the helpers from `src/lib/analytics/posthog-server.ts` and emit every event with `distinctId: clientId`.

**6. Chat events — `app/api/chat/route.ts`**

- After `runAgent()` returns `{ status: "streaming" }`, capture `chat_message_sent`:
  ```ts
  { thread_id, is_new_thread: isNewThread, has_files: fileParts.length > 0, file_count: fileParts.length }
  ```

- After `resolveApprovalEvent` succeeds (inside the approval resolution loop), capture `approval_resolved`:
  ```ts
  { approval_id: response.approvalId, outcome: response.approved ? "approved" : "denied" }
  ```

**7. Agent run events — `src/lib/runner/run-agent.ts`**

Read the file to understand the run lifecycle. Find where runs complete successfully and where they fail.

- On successful completion (inside `finalizeRun` or the `onFinish` callback), capture `agent_run_completed`:
  ```ts
  { run_id, thread_id, trigger_type, duration_ms, steps, total_tokens, tools_called }
  ```
  For `tools_called`, extract the list of unique tool names that were invoked during the run. For `duration_ms`, compute from run start to finish. For `steps` and `total_tokens`, extract from the stream result's usage data.

- On failure (error/catch paths), capture `agent_run_failed`:
  ```ts
  { run_id, thread_id, trigger_type, run_type, duration_ms, error_stage, error_name, error: errorMessage }
  ```

- When a run persists approval-gated tool calls, capture `approval_requested` only after the approval rows are saved:
  ```ts
  { approval_id, run_id, thread_id, tool_name, trigger_type }
  ```

**8. Billing events — `app/api/stripe/webhook/route.ts` and `src/lib/stripe/actions.ts`**

For the Stripe webhook events, you need `clientId` as the `distinctId`. The webhook handler doesn't have `clientId` in the request context — it only has Stripe subscription/customer data. Read `src/lib/stripe/stripe.ts` to understand how `syncBillingStateFromSubscriptionId` resolves the client. You'll need to either:
- Emit the PostHog event inside the sync function where `clientId` is available, OR
- Have the sync function return the `clientId` so you can emit from the webhook handler

Choose whichever is cleaner. The events:

- `src/lib/stripe/actions.ts` — after Stripe checkout session is created, capture `checkout_started`:
  ```ts
  { plan_name, billing_interval }
  ```

- Webhook `checkout.session.completed` → capture `subscription_created`:
  ```ts
  { plan_name, trial: boolean, stripe_customer_id }
  ```

- Webhook `customer.subscription.deleted` → capture `subscription_canceled`:
  ```ts
  { plan_name }
  ```

- Webhook `invoice.payment_failed` → capture `payment_failed`:
  ```ts
  { plan_name }
  ```

**Commit:** `feat: posthog Priority 1 events — chat, agent runs, billing`

---

### Phase 3: Priority 2 Events (CRM + Connections + Automations)

**9. CRM events**

- In the CRM tool functions (`src/lib/runner/tools/crm/`), after a record is successfully created, capture `crm_record_created`:
  ```ts
  { entity_type: "contact" | "company" | "deal" | "task", source: "agent" }
  ```
  If there are also client-side (manual) create flows for CRM records, instrument those too with `source: "manual"` using the client-side `posthog.capture()`.

- In detail page components (`/customers/people/[contactId]`, `/customers/companies/[companyId]`, `/customers/deals/[dealId]`), capture `crm_record_viewed` on mount:
  ```ts
  { entity_type, record_id }
  ```
  Use a `useEffect` with the client-side `posthog.capture()`.

- When a deal's stage changes (in the deal update tool and/or kanban drag handler), capture `deal_stage_changed`:
  ```ts
  { from_stage, to_stage, deal_value }
  ```

**10. Connection events**

- `app/api/connections/initiate/route.ts` — after initiating the OAuth flow, capture `connection_initiated`:
  ```ts
  { toolkit_slug }
  ```

- `app/api/connections/callback/route.ts` — after a successful callback, capture `connection_completed`:
  ```ts
  { toolkit_slug }
  ```

**11. Automation events**

- When a trigger is created (via the agent's `setup_trigger` tool), capture `trigger_created`:
  ```ts
  { trigger_type: "cron" | "webhook" | "rss" | "pulse" }
  ```

- When a trigger executes (cron scanner or webhook execution path), capture `trigger_executed`:
  ```ts
  { trigger_id, thread_id, trigger_type, result_status, success: boolean, duration_ms }
  ```

**Commit:** `feat: posthog Priority 2 events — CRM, connections, automations`

---

### Phase 4: Priority 3 Events (Nice to Have)

**12. Remaining events**

- Memory page save handler and agent `write_file` memory writes → `memory_file_saved` with `{ filename, operation, size_bytes, source }`
- `/api/files/upload` → `file_uploaded` with `{ file_type, size_bytes }`
- `src/components/command-menu.tsx` → `command_menu_opened` (client-side, on open)
- Auth register page → `signed_up` with `{ method: "email" | "google" }` (only if autocapture on the form submit isn't enough — check first)
- Auth login page → `signed_in` with `{ method: "email" | "google" }` (same caveat)

**Commit:** `feat: posthog Priority 3 events — memory, uploads, auth, command menu`

---

### Rules

- **`distinctId`:** Always use `clientId` (not `userId`) as the PostHog `distinctId` for both client and server events. This matches our tenant model.
- **Client-side:** `import posthog from "posthog-js"` — no custom wrapper needed.
- **Server-side:** `import { captureServerEvent, captureServerEvents } from "@/lib/analytics/posthog-server"` — prefer those helpers over raw client usage.
- **Filtering:** Tag events with `environment`, and tag identified users with `is_internal` so PM dashboards can exclude preview/dev and internal-team traffic.
- **No PII in event properties.** Email, name, phone go on the person profile via `identify` only.
- **Don't create a PostHog provider component.** `instrumentation-client.ts` handles initialization.
- **Don't modify `app/providers.tsx` or `app/layout.tsx`.**
- **Don't add dashboards via code.** Dashboards are built manually in the PostHog UI after events are flowing. The handover doc has the full dashboard specs.
- **Follow existing code conventions:** JSDoc on new files, functional style, no classes, descriptive variable names.
- **Read each file before modifying it.** Understand the existing code before adding instrumentation.
- **Minimal changes.** Add analytics capture calls at the right locations. Don't refactor surrounding code.

---

### Verification

After all phases:

- [ ] `pnpm build` succeeds with no type errors
- [ ] `instrumentation-client.ts` exists at project root
- [ ] `src/lib/analytics/posthog-server.ts` exists
- [ ] `.env.example` has the two PostHog vars
- [ ] `.env.local` has the two PostHog vars with actual keys
- [ ] Identify call is wired into existing auth flow (not a new file)
- [ ] `posthog.reset()` is called on sign out
- [ ] All 8 Priority 1 events have `capture()` calls in correct locations
- [ ] All 7 Priority 2 events have `capture()` calls in correct locations
- [ ] All Priority 3 events have `capture()` calls in correct locations
- [ ] No PII in any event properties
- [ ] All `distinctId` values use `clientId`, not `userId`
- [ ] Open the app → PostHog Live Events shows `$pageview` on navigation
- [ ] Sign in → PostHog Persons shows user with `plan_name` property
- [ ] Send a chat message → `chat_message_sent` appears in Live Events
- [ ] Run `pnpm test` — no regressions in existing tests
