# QA Surface 14: Billing (Stripe)

> **PRs covered:** 38b (Stripe billing + settings surface)
> **Dogfoodable:** Partial (Stripe Checkout requires manual interaction)
> **Time estimate:** 20-25 min manual

---

## Prerequisites

- Logged in with a test account
- Stripe test mode configured (test API keys, webhook forwarding active)
- Stripe CLI installed for local webhook testing (`stripe listen --forward-to`)
- Stripe test card numbers available (e.g., `4242 4242 4242 4242`)
- Access to Supabase dashboard to verify `clients` billing columns

---

## Dogfood Checklist (automated browser pass)

- [ ] `/pricing` page loads without errors
- [ ] Three plan cards render: Free, Pro, Max
- [ ] Each paid plan has a CTA button
- [ ] Free plan shows current state (if on free)
- [ ] `/settings` page loads without errors
- [ ] Billing section visible in settings
- [ ] No console errors on either page
- [ ] Responsive: pricing cards stack correctly on mobile viewport

---

## Manual QA Scenarios

### 14.1 Pricing page — plan display (PR 38b, task 4)

1. Navigate to `/pricing`
2. **Expected:** Three plans rendered: Free, Pro, Max
3. **Expected:** Each plan shows features and price
4. **Expected:** Current plan is highlighted or marked "Current"
5. **Expected:** Paid plans have "Upgrade" or "Subscribe" CTA
6. **Expected:** Free plan has no purchase CTA (or shows "Current" if active)

**Notes / failures:**

---

### 14.2 Checkout flow — subscribe to Pro (PR 38b, tasks 2-3)

1. On `/pricing`, click the Pro plan CTA
2. **Expected:** Redirected to Stripe hosted Checkout
3. **Expected:** Checkout shows correct plan name and price
4. Complete checkout with test card `4242 4242 4242 4242`, any future expiry, any CVC
5. **Expected:** After successful payment, redirected back to `/settings`
6. **Expected:** Settings shows billing success state
7. **Verify in Supabase:** `clients` row updated:
   - `stripe_customer_id` populated
   - `stripe_subscription_id` populated
   - `stripe_product_id` matches Pro product
   - `plan_name` = "pro"
   - `subscription_status` = "active"

**Notes / failures:**

---

### 14.3 Settings — billing details (PR 38b, task 5)

1. After subscribing (14.2), navigate to `/settings`
2. **Expected:** Current plan displayed (Pro)
3. **Expected:** Subscription status shown (active)
4. **Expected:** "Manage Billing" or "Customer Portal" button available

**Notes / failures:**

---

### 14.4 Stripe Customer Portal (PR 38b, task 5)

1. On `/settings`, click the Customer Portal button
2. **Expected:** Redirected to Stripe hosted Customer Portal
3. **Expected:** Portal shows current subscription, payment method, invoices
4. **Expected:** Can cancel, update payment method, or change plan from portal
5. Navigate back to app
6. **Expected:** App reflects any changes made in portal (after webhook sync)

**Notes / failures:**

---

### 14.5 Webhook sync — subscription updated (PR 38b, task 3)

1. In Stripe dashboard (test mode), cancel the test subscription
2. **Expected:** Webhook fires (`customer.subscription.deleted`)
3. **Verify in Supabase:** `clients` row updated:
   - `subscription_status` = "canceled" or reset
   - `plan_name` reverts to "free"
4. Refresh `/settings`
5. **Expected:** UI reflects free plan

**Notes / failures:**

---

### 14.6 Webhook sync — payment failure (PR 38b, task 3)

1. Subscribe with a card that will fail on next payment (`4000 0000 0000 0341`)
2. Trigger a payment attempt (or wait for Stripe test invoice)
3. **Expected:** Webhook fires (`invoice.payment_failed`)
4. **Verify in Supabase:** `subscription_status` reflects the failure state
5. **Expected:** App handles gracefully (doesn't crash, shows appropriate state)

**Notes / failures:**

---

### 14.7 Upgrade from Pro to Max

1. While on Pro plan, navigate to `/pricing`
2. Click Max plan CTA
3. **Expected:** Checkout or portal handles the upgrade
4. Complete the flow
5. **Verify in Supabase:** `plan_name` = "max", `stripe_product_id` updated

**Notes / failures:**

---

## Edge Cases

- [ ] Free user visits `/settings` — billing section shows "Free" plan, no portal button
- [ ] User completes checkout but webhook is delayed — app handles eventual consistency
- [ ] Double-click on CTA — doesn't create duplicate Checkout sessions
- [ ] Refresh `/pricing` while checkout is in another tab — no crash
- [ ] User navigates away from Checkout without completing — no orphaned state
- [ ] Stripe webhook signature validation — invalid signatures rejected

---

## Pass / Fail Criteria

- **Pass:** Pricing page shows all plans correctly. Checkout works end-to-end with test cards. `clients` row syncs billing state via webhooks. Settings shows current plan and portal link. Upgrades and cancellations sync correctly.
- **Fail:** Checkout redirects fail. `clients` billing columns not updated after payment. Webhook events lost. Settings shows stale billing data. Portal link broken.
