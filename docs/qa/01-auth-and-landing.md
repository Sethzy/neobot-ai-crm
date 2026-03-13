# QA Surface 1: Auth & Landing

> **PRs covered:** 38 (tasks 1-7 — auth funnel). For conversational onboarding (tasks 8-12), see [Surface 13: Onboarding](13-onboarding.md).
> **Dogfoodable:** Yes
> **Time estimate:** 15-20 min manual

---

## Prerequisites

- App running locally (`pnpm dev`) or on Vercel preview
- A test Google account you can use for OAuth
- A fresh email address for email/password signup (or use + alias)
- Access to Supabase dashboard to verify client rows

---

## Dogfood Checklist (automated browser pass)

- [ ] Landing page (`/`) loads without errors
- [ ] Landing page CTA links to `/register`
- [ ] `/register` page renders: split layout, Google CTA primary, email/password fallback
- [ ] `/login` page renders: split layout, Google CTA primary, email/password fallback
- [ ] No console errors on either auth page
- [ ] Responsive: auth pages look correct on mobile viewport (375px)
- [ ] Navigation between `/login` and `/register` works (links present and functional)
- [ ] Invalid email format shows validation error on register
- [ ] Empty form submission shows validation errors

---

## Manual QA Scenarios

### 1.1 Email/password registration (happy path)

1. Open `/register` in incognito
2. Enter a fresh email and password (min 6 chars)
3. Click "Sign up"
4. **Expected:** Confirmation email sent (check Supabase Auth logs or email inbox)
5. Click the confirmation link in email
6. **Expected:** Redirected to `/chat` (not `/` or `/dashboard`)
7. **Verify in Supabase:** `auth.users` has new row, `clients` table has matching row with `user_id` FK
8. **Verify:** `display_name` in clients is derived from email (since no metadata from email signup)

**Notes / failures:**

---

### 1.2 Google OAuth registration (happy path)

1. Open `/register` in incognito
2. Click Google CTA button
3. Complete Google OAuth consent screen
4. **Expected:** Redirected to `/chat` after callback
5. **Verify in Supabase:** `clients.display_name` is the Google account's full name (not raw email)
6. **Verify:** `/auth/callback` route handled the code exchange cleanly (no error flash)

**Notes / failures:**

---

### 1.3 Login with existing account

1. Open `/login` in incognito
2. Enter credentials from scenario 1.1
3. Click "Log in"
4. **Expected:** Redirected to `/chat`
5. **Verify:** No duplicate `clients` row created

**Notes / failures:**

---

### 1.4 Google OAuth login (returning user)

1. Open `/login` in incognito
2. Click Google CTA
3. Complete OAuth (same Google account as 1.2)
4. **Expected:** Redirected to `/chat`, same client session

**Notes / failures:**

---

### 1.5 Auth redirect consistency

1. Try accessing `/chat` while logged out
2. **Expected:** Redirected to `/login` (middleware guard)
3. Try accessing `/crm` while logged out
4. **Expected:** Redirected to `/login`
5. After login, **Expected:** lands on `/chat` (not the originally requested page — current behavior)

**Notes / failures:**

---

### 1.6 Already-authenticated redirect

1. While logged in, navigate to `/login`
2. **Expected:** Redirected to `/chat` (don't show login to authenticated users)
3. Navigate to `/register`
4. **Expected:** Same redirect to `/chat`

**Notes / failures:**

---

## Edge Cases

- [ ] Password too short (< 6 chars) — shows clear error
- [ ] Duplicate email registration — shows clear error (not a crash)
- [ ] OAuth popup blocked — graceful fallback or message
- [ ] Refresh `/auth/callback` after initial code exchange — doesn't crash
- [ ] Logout and re-login — session restores cleanly, same client_id

---

## Pass / Fail Criteria

- **Pass:** All happy path scenarios (1.1-1.4) complete without errors. Auth redirects (1.5-1.6) are consistent. `clients` table rows are correct with proper `display_name`.
- **Fail:** Any scenario where user gets stuck, sees a raw error, lands on wrong page after auth, or `clients` row is missing/malformed.
