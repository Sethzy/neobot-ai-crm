# Dogfood Report: Sunder

| Field | Value |
|-------|-------|
| **Date** | 2026-03-11 16:01:37 +08 |
| **App URL** | http://localhost:3005 |
| **Session** | sunder-stripe-e2e-3005 |
| **Scope** | Full Stripe billing + message quota feature end-to-end pass covering pricing, checkout, settings billing state, Stripe portal, duplicate-subscription protection, quota enforcement, and PR38c regressions via browser-only testing. |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 2 |
| Low | 0 |
| **Total** | **4** |

## Issues

### ISSUE-001: Paid pricing cards are unavailable, so checkout cannot start

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | http://localhost:3005/pricing |
| **Repro Video** | N/A |

**Description**

After signing into a free account and landing on `/pricing`, the `Pro` and `Max` cards both render `Unavailable/mo` with disabled `Unavailable` CTAs instead of showing live Stripe prices and upgrade actions. This blocks the hosted Stripe Checkout flow entirely, so the user cannot upgrade from Free to a paid plan.

**Repro Steps**

1. Sign in with the provided account and open `http://localhost:3005/pricing`.
   ![Result](screenshots/pricing-page.png)

2. **Observe:** The `Pro` and `Max` cards show `Unavailable/mo`, and both paid CTAs are disabled.
   ![Result](screenshots/pricing-page.png)

---

### ISSUE-002: Settings shows impossible quota math for the free plan

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | http://localhost:3005/settings |
| **Repro Video** | N/A |

**Description**

The billing summary on `/settings` reports `Monthly cap 100`, `Used this month 0`, and `Remaining 0` for the same free account. Those values cannot all be true at once. Expected behavior was internally consistent quota math, such as `remaining = cap - used`, so the user can trust whether the workspace is actually blocked.

**Repro Steps**

1. Sign in with the provided account and open `http://localhost:3005/settings`.
   ![Result](screenshots/settings-page.png)

2. **Observe:** The billing card shows `Monthly cap 100`, `Used this month 0`, and `Remaining 0` simultaneously.
   ![Result](screenshots/settings-page.png)

---

### ISSUE-003: Quota-exhausted quick prompts still prefill the disabled composer and leave the user in a dead end

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:3005/chat |
| **Repro Video** | [issue-003-repro-v3.webm](videos/issue-003-repro-v3.webm) |

**Description**

When the workspace is already at the monthly message limit, the main composer, attachment button, and submit button are disabled as expected. However, the suggested `Try it` prompt cards remain enabled. Clicking one injects a full prompt into the disabled composer, but the message still cannot be sent and no quota-specific feedback appears. This creates a misleading dead end instead of a clean blocked-send experience.

**Repro Steps**

1. Open `http://localhost:3005/chat` while the account is quota-exhausted.
   ![Step 1](screenshots/issue-003-step-1b.png)

2. Click the `Morning CRM briefing ... Try it` prompt card.
   ![Step 2](screenshots/issue-003-step-2b.png)

3. **Observe:** The disabled composer is prefilled with the prompt text, but submit remains disabled and the page provides no friendly quota error or next-step guidance beyond the existing banner.
   ![Result](screenshots/issue-003-result-b.png)

---

### ISSUE-004: Chat quota banner drops the used-count number and renders malformed usage copy

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | http://localhost:3005/chat |
| **Repro Video** | N/A |

**Description**

The quota banner on `/chat` renders as `/ 100 messages used this month`, with the numerator missing entirely. Users cannot tell whether they have used `0`, `100`, or some other number of messages. This also undermines trust in the quota state, especially because `/settings` simultaneously reports inconsistent remaining counts.

**Repro Steps**

1. Open `http://localhost:3005/chat`.
   ![Result](screenshots/issue-004.png)

2. **Observe:** The banner copy begins with `/ 100 messages used this month` instead of showing a complete value such as `0 / 100` or `100 / 100`.
   ![Result](screenshots/issue-004.png)

---

## Coverage Notes

- Confirmed in-browser on `localhost:3005`: login, `/pricing`, `/settings`, `/chat`, `/chat/[threadId]`, desktop/mobile layouts, quota banner, disabled composer, disabled attachments, and upgrade CTA routing to `/pricing`.
- Not reproduced: a ghost thread being created from the blocked root `/chat` state. Clicking a suggested prompt mutated the disabled composer but did not create a new thread during this run.
- No page-level JS exceptions were surfaced by `agent-browser errors` on the explored screens. Console output was limited to dev-mode notices and a Next.js image priority warning.
- Blocked from deeper Stripe billing coverage because paid plans never exposed a usable checkout CTA on `/pricing`. That prevented browser verification of hosted Checkout, `/api/stripe/checkout?session_id=...`, `/settings?billing=success`, duplicate-subscription protection on an already-paid user, Stripe Customer Portal flows, and webhook-driven billing-state refresh after plan changes.
- Approval-continuation quota behavior could not be induced from the browser alone in this environment, so the PR38c approval regression remains unverified.
