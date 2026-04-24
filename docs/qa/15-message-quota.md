# QA Surface 15: Message Quota

> **PRs covered:** 38c (message usage caps + quota UX)
> **Dogfoodable:** Partial (hard to test exhaustion via dogfood without burning real quota)
> **Time estimate:** 20-25 min manual

---

## Prerequisites

- Logged in with a test account on Free plan (100 messages/month cap)
- Or: a quota-exempt account for non-exhaustion tests (set `quota_exempt = true` in `clients`)
- Supabase dashboard open (to verify `client_message_usage_monthly` rows)
- Access to `/pricing` and `/settings` pages

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat composer shows quota status (used / limit)
- [ ] `/pricing` shows message caps per plan (Free 100, Pro 500, Max 2000)
- [ ] `/settings` shows monthly usage and remaining count
- [ ] Reset date shown in both settings and chat
- [ ] No console errors on any quota-related surface

---

## Manual QA Scenarios

### 15.1 Quota display in chat composer (PR 38c, task 5)

1. Open `/chat`
2. **Expected:** Quota status visible near the composer (e.g., "5 / 100 messages used this month")
3. **Expected:** Remaining count shown
4. **Expected:** Reset date shown (next month boundary in Singapore time)
5. **Expected:** Link to `/pricing` visible

**Notes / failures:**

---

### 15.2 Quota display on pricing page (PR 38c, task 4)

1. Navigate to `/pricing`
2. **Expected:** Each plan card shows monthly message limit:
   - Free: 100 messages / month
   - Pro: 500 messages / month
   - Max: 2,000 messages / month
3. **Expected:** Current plan shows usage (used / remaining / reset date)

**Notes / failures:**

---

### 15.3 Quota display on settings page (PR 38c, task 4)

1. Navigate to `/settings`
2. **Expected:** Three-column display: monthly cap, used this month, remaining
3. **Expected:** Reset date with timezone label (Asia/Singapore)

**Notes / failures:**

---

### 15.4 Quota consumption — normal chat (PR 38c, task 3)

1. Note current usage count
2. Send a new message in chat
3. **Expected:** Usage count increments by 1 after the message completes
4. Send another message
5. **Expected:** Usage count increments by 1 again
6. **Verify in Supabase:** `client_message_usage_monthly` row has `messages_used` matching the UI

**Notes / failures:**

---

### 15.5 Exempt flows — no quota consumption (PR 38c, task 3)

1. Trigger an approval continuation (approve a pending tool call)
2. **Expected:** Usage count does NOT increment (approval continuations are exempt)
3. Let `Daily Orchestrator` or any other cron automation fire
4. **Expected:** Usage count does NOT increment (cron automation runs are exempt)
5. Queue a message while a run is active
6. **Expected:** Queue replay does NOT consume additional quota

**Notes / failures:**

---

### 15.6 Quota exhaustion — composer lockout (PR 38c, task 5)

1. Set test account to near-limit (manually update `messages_used` to 99 for Free plan in Supabase)
2. Send one message
3. **Expected:** Message sends successfully (99 → 100)
4. Try to send another message
5. **Expected:** Composer is disabled — input placeholder says "Monthly message limit reached"
6. **Expected:** Submit button and file attachment disabled
7. **Expected:** Upgrade CTA links to `/pricing`
8. **Expected:** No run is created (enforcement happens before run creation)

**Notes / failures:**

---

### 15.7 Quota error handling — optimistic thread rollback

1. Start a new thread (no prior messages)
2. If quota is exhausted, send a message
3. **Expected:** Optimistic thread creation is rolled back
4. **Expected:** Error message is clear, not a crash

**Notes / failures:**

---

### 15.8 Quota refresh at month boundary

1. Check the reset date shown in the UI
2. **Expected:** Date is the first of next month in Asia/Singapore timezone
3. After month rolls over (or manually reset in DB):
4. **Expected:** Quota auto-refreshes in the UI without page reload
5. **Expected:** Composer re-enables

**Notes / failures:**

---

### 15.9 Quota-exempt accounts

1. Set `quota_exempt = true` on the test client in Supabase
2. Refresh the chat
3. **Expected:** Quota shows effectively unlimited (999,999 or similar)
4. **Expected:** Composer never locks out

**Notes / failures:**

---

## Edge Cases

- [ ] Brand new account with zero messages — shows 0 / 100, composer enabled
- [ ] Quota consumed but run fails at startup — quota released (not stuck)
- [ ] Multiple rapid messages — each consumes exactly 1 quota
- [ ] Plan upgrade mid-month (Free → Pro) — cap changes to 500, used count preserved
- [ ] Plan downgrade mid-month (Pro → Free) — if used > 100, composer locks immediately
- [ ] Concurrent messages from same user — atomic quota consumption (no race condition)

---

## Pass / Fail Criteria

- **Pass:** Quota displays correctly across chat, pricing, settings. Only user-authored messages consume quota. Composer locks at zero remaining. Exempt flows don't consume. Quota refreshes at month boundary. Error handling is graceful.
- **Fail:** Quota not displayed. Non-user-authored flows consume quota. Composer doesn't lock at zero. Quota errors crash the app. Month boundary doesn't refresh.
