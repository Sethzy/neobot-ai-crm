# QA Surface 30: Production Hardening

> **PRs covered:** 47a (error boundaries), 47b (env validation), 47c (health check), 47d (security headers), 47e (Sentry), 47f (rate limiting)
> **Dogfoodable:** Partial (health check and headers testable via curl, error boundaries need manual error injection, rate limiting needs rapid-fire)
> **Time estimate:** 15-20 min manual
> **Components:** `app/error.tsx`, `app/global-error.tsx`, `app/(dashboard)/error.tsx`, `src/components/chat/chat-error-boundary.tsx`, `src/lib/env.ts`, `app/api/health/route.ts`, `src/lib/security-headers.ts`, `sentry.*.config.ts`, `src/lib/rate-limit.ts`

---

## Prerequisites

- App running locally or on a Vercel preview deployment
- `.env.local` has all required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`)
- `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set (same value) for Sentry tests
- Redis running (`REDIS_URL` set) for rate limiting tests
- Logged-in user session for chat rate limit test

---

## Dogfood Checklist (automated browser pass)

- [ ] `/api/health` returns 200 with `{ status: "ok", checks: { supabase: "ok" } }`
- [ ] Response headers on any page include `X-Frame-Options: DENY`
- [ ] Response headers include `X-Content-Type-Options: nosniff`
- [ ] Response headers include `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Response headers include `Content-Security-Policy-Report-Only` (not enforcing)

---

## Manual QA Scenarios

### PR 47a: Error Boundaries

### 30.1 Dashboard route error shows boundary, not white screen

1. Temporarily add `throw new Error("test")` at the top of any dashboard page component (e.g., settings)
2. Navigate to that page
3. **Expected:** "Something went wrong" error boundary with "Try again" button appears, sidebar is still visible
4. Click "Try again"
5. **Expected:** Page attempts to re-render

**Notes / failures:**

---

### 30.2 Chat render crash shows chat error boundary

1. Temporarily add a throw inside a chat message renderer component
2. Open a chat thread that triggers the throw
3. **Expected:** "Something went wrong — Your conversation is safe" message with "Try again" button
4. **Expected:** Dashboard shell (sidebar, header) remains intact

**Notes / failures:**

---

### 30.3 Root error boundary catches non-dashboard errors

1. Temporarily add a throw in a non-dashboard page (e.g., landing page component)
2. Navigate to that page
3. **Expected:** Full-page "Something went wrong" with "Try again" button

**Notes / failures:**

---

### PR 47b: Environment Validation

### 30.4 Missing required env var fails fast

1. Remove `AI_GATEWAY_API_KEY` from `.env.local`
2. Restart the dev server or trigger a server-side function that uses `getServerEnv()`
3. **Expected:** Error message: `[env] Missing or invalid required environment variables: AI_GATEWAY_API_KEY`
4. Restore the env var

**Notes / failures:**

---

### PR 47c: Health Check

### 30.5 Health check returns ok when healthy

1. `curl http://localhost:3000/api/health`
2. **Expected:** 200 status, JSON body with `{ status: "ok", checks: { supabase: "ok", redis: "ok" }, timestamp: "...", version: "..." }`

**Notes / failures:**

---

### 30.6 Health check returns degraded when Redis is down

1. Stop Redis or unset `REDIS_URL`
2. `curl http://localhost:3000/api/health`
3. **Expected:** 200 status, `{ status: "ok", checks: { supabase: "ok", redis: "degraded" } }`

**Notes / failures:**

---

### PR 47d: Security Headers

### 30.7 Security headers present on all responses

1. `curl -sI http://localhost:3000/ | grep -iE 'x-frame|x-content|referrer|permissions|content-security'`
2. **Expected:** All 5 headers present:
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Content-Security-Policy-Report-Only: default-src 'self'; ...`

**Notes / failures:**

---

### PR 47e: Sentry Integration

### 30.8 Sentry captures server-side errors

1. Trigger a server error (e.g., bad API request)
2. Check Sentry dashboard
3. **Expected:** Error appears with stack trace, request context, environment tag
4. **Verify:** No PII (no cookies, no authorization headers, no Supabase tokens in URLs)

**Notes / failures:**

---

### 30.9 Sentry captures client-side error boundary crashes

1. Trigger a render crash (same as 30.2)
2. Check Sentry dashboard
3. **Expected:** Error appears with React component stack in contexts

**Notes / failures:**

---

### PR 47f: Rate Limiting

### 30.10 Chat rate limit returns 429 after threshold

1. Log in and open a chat
2. Send 31 messages in rapid succession (can use browser console or script)
3. **Expected:** 31st message returns 429 status with `Retry-After` header
4. Wait 60 seconds
5. **Expected:** Next message succeeds normally

**Notes / failures:**

---

### 30.11 Webhook rate limit returns 429 per IP

1. Send 61 POST requests to `/api/trigger/webhook/{triggerId}` from same IP within 60s
2. **Expected:** 61st request returns 429 with `Retry-After` header
3. **Expected:** Normal usage (1-2 requests) never hits the limit

**Notes / failures:**

---

## Edge Cases

- [ ] Health check works when called concurrently (no race conditions)
- [ ] Rate limiter fails open when Redis is unavailable (requests still go through)
- [ ] CSP report-only does not block any existing functionality (Supabase Realtime, PostHog, Composio)
- [ ] Error boundaries don't swallow errors silently — check console.error output
- [ ] Sentry `beforeSend` strips Supabase `apikey=` and `token=` from URLs

---

## Pass / Fail Criteria

- **Pass:** All 5 headers present, health check returns correct status, error boundaries prevent white screens, rate limiting enforces thresholds, Sentry captures errors without PII
- **Fail:** Missing headers, white screen on error, rate limit permanently blocks a user (orphaned Redis key), PII visible in Sentry, health check falsely reports degraded
