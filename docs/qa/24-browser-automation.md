# QA Surface 24: Browser Automation

> **PRs covered:** PR 50 (public browsing), PR 50b (authenticated browsing)
> **Dogfoodable:** Partial (agent tool — requires chat prompts, auth flow requires manual login)
> **Time estimate:** 20-30 min manual
> **v2 tools:** `browse_website`

---

## Prerequisites

- Logged in with working chat
- `BROWSER_USE_API_KEY` set in env (verify: agent has `browse_website` tool available)
- Browser-Use account has credits ($2+ for testing)
- Chat core (Surface 2) passing — tool call rendering works
- For auth tests: a login-gated platform account (e.g., PropNex, PropertyGuru, or any site with a login)

---

## Dogfood Checklist (automated browser pass)

- [ ] Agent has `browse_website` tool available (tool pill appears when called)
- [ ] Tool pill shows with spinner during browsing (30-60s)
- [ ] Tool result shows `success: true` with output data on completion
- [ ] Tool result includes `cost` field showing actual cost
- [ ] Auth card appears when tool returns `needsAuth: true` for a platform
- [ ] Auth card has "Connect [platform]" button and "Done — I've logged in" button
- [ ] No console errors during browsing flow

---

## Manual QA Scenarios

### 24.1 Public site browsing (happy path)

1. In chat: **"Search 99.co for 3-bedroom condos for sale in District 15, under $2M. Extract the project name, price, size, and listing URL for each result."**
2. **Expected:** Agent recognizes the request is specific enough — proceeds without asking clarifying questions
3. **Expected:** Agent calls `browse_website` — tool pill appears with spinner
4. **Expected:** After 15-60 seconds, tool completes with `success: true`
5. **Expected:** Agent presents listing data in a structured format

**Notes / failures:**

---

### 24.2 Agent clarifies ambiguous browsing request

1. In chat: **"What's available in D15?"**
2. **Expected:** Agent uses `ask_user_question` to clarify — asks about portal, property type, filters, budget
3. Respond: **"99.co, condo sale, 2-3 bed, no budget cap"**
4. **Expected:** Agent now calls `browse_website` with a specific, detailed goal
5. **Expected:** Results returned

**Notes / failures:**

---

### 24.3 Agent uses web_scrape instead of browse_website for static pages

1. In chat: **"Read this article: https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases/pr26-01"**
2. **Expected:** Agent uses `web_scrape`, NOT `browse_website` (static content, known URL, no interaction needed)

**Notes / failures:**

---

### 24.4 browse_website uses web search for wrong results

1. Run scenario 24.1, get results
2. In chat: **"No, I meant new launches only, not resale"**
3. **Expected:** Agent tells you the results were wrong and asks how to refine — does NOT silently retry
4. After you confirm, agent calls `browse_website` again with updated goal
5. **Expected:** New results reflect the refinement

**Notes / failures:**

---

### 24.5 Authenticated platform — first connect (no saved profile)

1. In chat: **"Search PropNex ProMap for 2-3 bed condos in D15"**
2. **Expected:** Agent calls `browse_website` with `platform: "propnex"`
3. **Expected:** Tool returns `{ success: false, needsAuth: true, platform: "propnex" }`
4. **Expected:** Agent tells user to connect PropNex
5. **Expected:** Auth card appears below tool pill with "Connect propnex" button
6. Click "Connect propnex"
7. **Expected:** Embedded iframe (or new tab) opens with a live Browser-Use browser
8. Log in to PropNex with your credentials
9. Click "Done — I've logged in"
10. **Expected:** Toast notification: "Connected to propnex!"
11. **Expected:** Agent tells you to retry your request

**Notes / failures:**

---

### 24.6 Authenticated platform — profile reuse (already connected)

1. After completing 24.5, in chat: **"Search PropNex ProMap for 4-bed condos in D10"**
2. **Expected:** Agent calls `browse_website` with `platform: "propnex"` — no auth prompt this time
3. **Expected:** Session uses saved profile — already logged in
4. **Expected:** Results returned

**Notes / failures:**

---

### 24.7 Authenticated platform — session expired (re-auth)

1. Delete the `browser_profiles` row for your client + propnex in Supabase (simulates expiry)
2. In chat: **"Search PropNex ProMap for HDB resale in Tampines"**
3. **Expected:** Agent detects no profile → triggers auth flow again
4. **Expected:** On re-auth, the session route reuses the existing Browser-Use remote profile (not creating a new one)
5. After re-login, retry request
6. **Expected:** Results returned

**Notes / failures:**

---

### 24.8 browse_website not available without API key

1. Remove `BROWSER_USE_API_KEY` from env and restart dev server
2. In chat: **"Search 99.co for condos"**
3. **Expected:** Agent does NOT have `browse_website` available — uses `web_scrape` or tells user browsing is not configured
4. Restore the API key and restart

**Notes / failures:**

---

### 24.9 browse_website not available to subagents

1. Trigger a subagent run (e.g., via a trigger with `run_subagent`)
2. Check the subagent's available tools in Langfuse trace
3. **Expected:** `browse_website` is NOT in the subagent's tool set

**Notes / failures:**

---

### 24.10 Cost tracking

1. After any successful browse (e.g., scenario 24.1), expand the tool pill
2. **Expected:** Tool result includes `cost` field (e.g., `"0.042"`)
3. **Expected:** Cost is reasonable for the task (~$0.02-0.16)

**Notes / failures:**

---

## Edge Cases

- [ ] Very complex browsing goal (e.g., multi-page pagination) — handles within 25-step cap or reports limitation
- [ ] Site that blocks bots — returns failure, agent reports to user
- [ ] Browse request during an active background automation run — `browse_website` not available in trigger context
- [ ] Multiple browse requests in quick succession — each creates its own session, no interference
- [ ] Browse to a non-existent URL — returns failure gracefully
- [ ] Auth flow: user clicks "Done" without actually logging in — verify route detects login failure, shows error toast
- [ ] Auth flow: user closes the browser tab before clicking "Done" — pending session eventually times out on Browser-Use's side

---

## Pass / Fail Criteria

- **Pass:** Agent calls `browse_website` for interactive site tasks. Agent clarifies ambiguous requests before browsing. Agent does NOT retry silently on bad results. Auth card renders inline when `needsAuth` is returned. User can log in via embedded browser and profile is saved. Subsequent requests reuse saved profile. Tool not available to subagents or when API key is missing. Cost field present in results.
- **Fail:** Agent uses `browse_website` for static pages that `web_scrape` handles. Agent retries silently without telling user. Auth card doesn't appear when `needsAuth` is returned. Profile not saved after successful login. Browser tools leak into subagent/background-trigger contexts. Auth flow crashes the chat UI. No cost tracking in tool output.
