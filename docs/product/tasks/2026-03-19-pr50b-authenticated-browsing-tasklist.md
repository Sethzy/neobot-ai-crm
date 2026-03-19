# Authenticated Browsing Implementation Plan

**PR:** PR 50b: Browser automation — authenticated browsing (profiles + embedded browser auth)
**Decisions:** SERVICE-12
**Goal:** Extend `browse_website` with profile-based auth so the agent can access login-gated platforms (PropNex, PropertyGuru, URA, HDB) using the user's own credentials, stored as Browser-Use Cloud profiles.

**Architecture:** Browser-Use profiles persist cookies/login state across sessions. When the agent needs a login-gated platform and no profile exists, the tool returns `{ needsAuth: true, platform }`. The frontend renders an auth card (inline from tool output, following the existing `isPdfDownload` pattern — no new message part protocol) with embedded `liveUrl` iframe (new-tab fallback if iframe fails). User logs in, clicks "Done," a verify route confirms login via structured output `{ loggedIn: boolean }`, saves the opaque Browser-Use profile ID to our `browser_profiles` table, and stops the session. Subsequent requests reuse the saved profile. On re-auth (expired cookies), the session route reuses the existing Browser-Use profile instead of creating a new one. Manual retry after login — no auto-resume.

**Tech Stack:** `browser-use-sdk` (BrowserUse class, `profiles.create()`, `sessions.create()`, `tasks.create()`, `tasks.wait()`, `sessions.stop()`), Supabase (browser_profiles table + RLS), Vitest, Next.js App Router API routes, sonner (toasts)

**Depends on:** PR 50 (public browsing — already shipped)

**Design doc:** `roadmap docs/Sunder - Source of Truth/references/browser-use/00-browser-use-cloud-design-doc.md` Sections 6.2–6.6

**Review fixes applied (2026-03-19):**
1. Use real SDK surface (`profiles.create()`, `sessions.create()`, `tasks.create()`, `tasks.wait()`) — not outdated method names from earlier tasklist
2. Embedded liveUrl iframe as primary UX, new-tab as fallback — plan-faithful
3. Reuse existing Browser-Use profiles on reconnect — check DB first, only `profiles.create()` on first connect
4. Preserve PR50 conditional prompt gating — extend `BROWSER_AUTOMATION_PROMPT` constant, not global `SYSTEM_PROMPT`
5. Factor auth actions into helper/hook, use sonner toast instead of `alert()`, namespace sessionStorage keys
6. Broader test matrix — migration contract tests, route tests, auth-card rendering tests, tool auth tests

---

## Relevant Files

**Create:**
- `supabase/migrations/20260319000000_create_browser_profiles.sql`
- `supabase/migrations/__tests__/browser-profiles-migration.test.ts`
- `src/lib/browser-use/profiles.ts`
- `src/lib/browser-use/__tests__/profiles.test.ts`
- `src/hooks/use-browser-auth.ts` — auth flow helper hook (connect, verify, state)
- `app/api/browser/session/route.ts`
- `app/api/browser/session/__tests__/route.test.ts`
- `app/api/browser/verify/route.ts`
- `app/api/browser/verify/__tests__/route.test.ts`

**Modify:**
- `src/lib/runner/tools/browser/browse-website.ts` — add `platform` param + profile lookup
- `src/lib/runner/tools/browser/index.ts` — pass supabase + clientId to factory
- `src/lib/runner/tool-registry.ts` — pass supabase + clientId to `createBrowserTools()`
- `src/lib/runner/tools/browser/__tests__/browse-website.test.ts` — add platform tests
- `src/lib/ai/system-prompt.ts` — extend `BROWSER_AUTOMATION_PROMPT` constant (NOT global SYSTEM_PROMPT)
- `src/components/chat/tool-call-inline.tsx` — add auth card rendering for `needsAuth` output
- `src/components/chat/tool-call-inline.test.tsx` — add auth card tests
- `src/types/database.ts` — add browser_profiles type (careful patch, not full regen)

**Reference:**
- `supabase/migrations/20260307160000_create_connections.sql` — migration pattern (RLS, trigger)
- `supabase/migrations/__tests__/connections-migration.test.ts` — migration contract test pattern
- `src/lib/connections/queries.ts:28-45` — strict error semantics (throw on DB error)
- `src/components/chat/tool-call-inline.tsx:36-47` — `isPdfDownload()` special output rendering pattern
- `src/lib/api/route-helpers.ts` — `authenticateRequest()` + `jsonError()`
- `src/lib/runner/context.ts:104-106` — conditional `BROWSER_AUTOMATION_PROMPT` injection
- `src/lib/ai/system-prompt.ts:26` — `BROWSER_AUTOMATION_PROMPT` exported constant
- `src/lib/browser-use/client.ts` — real SDK: `BrowserUse` class, `profiles.create()`, `sessions.create()`, `tasks.create()`, `tasks.wait()`, `sessions.stop()`

---

## Task 1: Database Migration — browser_profiles Table

**Files:**
- Create: `supabase/migrations/20260319000000_create_browser_profiles.sql`
- Create: `supabase/migrations/__tests__/browser-profiles-migration.test.ts`

Reference: `supabase/migrations/20260307160000_create_connections.sql` and `supabase/migrations/__tests__/connections-migration.test.ts`.

**Step 1: Write the migration contract test**

```typescript
// supabase/migrations/__tests__/browser-profiles-migration.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  __dirname,
  "..",
  "20260319000000_create_browser_profiles.sql",
);
const migrationSql = readFileSync(migrationPath, "utf-8");

describe("browser_profiles migration", () => {
  it("creates the browser_profiles table", () => {
    expect(migrationSql).toContain("CREATE TABLE public.browser_profiles");
  });

  it("includes client_id foreign key", () => {
    expect(migrationSql).toContain("REFERENCES public.clients(client_id)");
  });

  it("includes unique constraint on client_id + platform", () => {
    expect(migrationSql).toContain("browser_profiles_client_platform_unique");
  });

  it("enables RLS", () => {
    expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("creates select/insert/update/delete policies", () => {
    expect(migrationSql).toContain("browser_profiles_select_own");
    expect(migrationSql).toContain("browser_profiles_insert_own");
    expect(migrationSql).toContain("browser_profiles_update_own");
    expect(migrationSql).toContain("browser_profiles_delete_own");
  });

  it("creates updated_at trigger", () => {
    expect(migrationSql).toContain("trg_browser_profiles_updated_at");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run supabase/migrations/__tests__/browser-profiles-migration.test.ts
```

Expected: FAIL — file not found.

**Step 3: Write the migration SQL**

```sql
-- PR50b: Browser-Use Cloud profile storage for authenticated browsing.
-- Decision refs: SERVICE-12.

CREATE TABLE public.browser_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  browser_use_profile_id TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT browser_profiles_client_platform_unique UNIQUE (client_id, platform)
);

COMMENT ON TABLE public.browser_profiles IS
  'Maps client + platform to a Browser-Use Cloud profile ID for persistent browser auth state.';
COMMENT ON COLUMN public.browser_profiles.platform IS
  'Platform identifier, e.g. propnex, propertyguru, ura, hdb, srx.';
COMMENT ON COLUMN public.browser_profiles.browser_use_profile_id IS
  'Opaque Browser-Use Cloud profile ID. Created via profiles.create() API. Cookies managed by Browser-Use.';

CREATE INDEX idx_browser_profiles_client_id
  ON public.browser_profiles (client_id);

ALTER TABLE public.browser_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY browser_profiles_select_own
  ON public.browser_profiles FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_insert_own
  ON public.browser_profiles FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_update_own
  ON public.browser_profiles FOR UPDATE
  USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY browser_profiles_delete_own
  ON public.browser_profiles FOR DELETE
  USING (client_id = public.get_my_client_id());

-- Reuses the generic updated_at trigger function from connections migration.
CREATE TRIGGER trg_browser_profiles_updated_at
  BEFORE UPDATE ON public.browser_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_connections_updated_at();
```

**Step 4: Run migration contract test**

```bash
pnpm vitest run supabase/migrations/__tests__/browser-profiles-migration.test.ts
```

Expected: ALL PASS.

**Step 5: Apply the migration locally**

```bash
pnpm supabase db push
```

**Step 6: Patch database types**

Manually add the `browser_profiles` table type to `src/types/database.ts`. Do NOT run full `gen types`. Look at the existing `connections` table entry and add a matching `browser_profiles` entry.

**Step 7: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

**Step 8: Commit**

```bash
git add supabase/migrations/20260319000000_create_browser_profiles.sql supabase/migrations/__tests__/browser-profiles-migration.test.ts src/types/database.ts
git commit -m "feat(pr50b): create browser_profiles table with RLS and contract test"
```

---

## Task 2: Profile CRUD — Tests First

**Files:**
- Create: `src/lib/browser-use/__tests__/profiles.test.ts`

Reference: `src/lib/connections/queries.ts:28-45` — strict error semantics.

**Step 1: Write the failing tests**

Same as previous tasklist — tests for `getProfileForPlatform`, `upsertProfile`, `listProfiles` with strict throw-on-DB-error semantics. (See previous tasklist Task 2 Step 1 for full test code — unchanged.)

**Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/browser-use/__tests__/profiles.test.ts
```

Expected: FAIL — modules not found.

---

## Task 3: Profile CRUD — Implementation

**Files:**
- Create: `src/lib/browser-use/profiles.ts`

Same implementation as previous tasklist Task 3. Strict error semantics: throw on DB errors, return null only for true absence. (See previous tasklist Task 3 for full code — unchanged.)

**Step 1: Write implementation, run tests, commit.**

```bash
pnpm vitest run src/lib/browser-use/__tests__/profiles.test.ts
```

Expected: ALL PASS.

```bash
git add src/lib/browser-use/profiles.ts src/lib/browser-use/__tests__/profiles.test.ts
git commit -m "feat(pr50b): add browser profile CRUD with strict error semantics"
```

---

## Task 4: Extend browse_website with Platform Auth — Tests First

Same as previous tasklist Task 4. Add platform-related tests to `browse-website.test.ts`. Mock `getProfileForPlatform`. Test `needsAuth`, profile pass-through, and no-profile-lookup-without-platform cases.

**Key:** Update existing public-browsing tests to pass `supabase`/`clientId` to `createBrowseWebsiteTool()` since the signature changes. Existing behavior must not break.

---

## Task 5: Extend browse_website with Platform Auth — Implementation

Same as previous tasklist Task 5, but use the **real SDK method names**:
- `sessions.create()` (not `createSession()`)
- Profile lookup via `getProfileForPlatform()` — single call, no duplicate fetch

Update barrel (`index.ts`) and registry (`tool-registry.ts`) to pass `supabase` + `clientId` through.

```bash
git add src/lib/runner/tools/browser/browse-website.ts src/lib/runner/tools/browser/index.ts src/lib/runner/tool-registry.ts src/lib/runner/tools/browser/__tests__/browse-website.test.ts
git commit -m "feat(pr50b): extend browse_website with platform auth + profile lookup"
```

---

## Task 6: Browser Session API Route — Reuse Existing Profiles

**Files:**
- Create: `app/api/browser/session/route.ts`
- Create: `app/api/browser/session/__tests__/route.test.ts`

**Critical difference from previous tasklist:** Check DB for existing profile first. Only call `client.profiles.create()` on first connect. Reuse existing `browser_use_profile_id` for re-auth.

**Step 1: Write the route test**

```typescript
// app/api/browser/session/__tests__/route.test.ts
import { describe, expect, it, vi } from "vitest";

// Mock the dependencies — test the route logic, not auth/DB/SDK
// (exact mock setup depends on how the test runner handles Next.js route handlers)

describe("POST /api/browser/session", () => {
  it("creates a new Browser-Use profile on first connect", async () => {
    // getProfileForPlatform returns null → no existing profile
    // expect profiles.create() called
    // expect sessions.create() called with new profile ID
    // expect response includes liveUrl, sessionId, browserUseProfileId
  });

  it("reuses existing Browser-Use profile on reconnect", async () => {
    // getProfileForPlatform returns existing profile with browser_use_profile_id
    // expect profiles.create() NOT called
    // expect sessions.create() called with existing profile ID
  });

  it("returns 400 for invalid request body", async () => {
    // missing platform → 400
  });

  it("returns 401 for unauthenticated requests", async () => {
    // no auth → 401
  });
});
```

**Step 2: Write the route**

```typescript
// app/api/browser/session/route.ts
/**
 * Creates a Browser-Use session for platform authentication.
 * Reuses existing profile on reconnect; creates new profile on first connect.
 * @module app/api/browser/session/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { getBrowserUseClient } from "@/lib/browser-use/client";
import { getProfileForPlatform } from "@/lib/browser-use/profiles";
import { resolveClientId } from "@/lib/chat/client-id";

const requestSchema = z.object({
  platform: z.string().min(1),
  startUrl: z.string().url().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  try {
    const clientId = await resolveClientId(supabase, userId);
    const client = getBrowserUseClient();

    // Check if we already have a Browser-Use profile for this client+platform
    const existingProfile = await getProfileForPlatform(supabase, clientId, body.platform);
    let browserUseProfileId: string;

    if (existingProfile) {
      // Re-auth: reuse existing remote profile (cookies will be refreshed)
      browserUseProfileId = existingProfile.browser_use_profile_id;
    } else {
      // First connect: create a new remote profile
      const newProfile = await client.profiles.create({
        name: `sunder_${clientId}_${body.platform}`,
      });
      browserUseProfileId = newProfile.id;
    }

    // Create session with the profile
    const session = await client.sessions.create({
      profileId: browserUseProfileId,
      ...(body.startUrl ? { startUrl: body.startUrl } : {}),
    });

    return Response.json({
      sessionId: session.id,
      liveUrl: session.liveUrl,
      browserUseProfileId,
      platform: body.platform,
    });
  } catch (error) {
    console.error("[browser/session] Failed to create session:", error);
    return jsonError("Failed to create browser session.", 500);
  }
}
```

**Step 3: Run route tests, verify TypeScript, commit**

```bash
pnpm vitest run app/api/browser/session/__tests__/route.test.ts && pnpm exec tsc --noEmit
git add app/api/browser/session/
git commit -m "feat(pr50b): add browser session route with profile reuse on reconnect"
```

---

## Task 7: Browser Verify API Route

**Files:**
- Create: `app/api/browser/verify/route.ts`
- Create: `app/api/browser/verify/__tests__/route.test.ts`

Uses **structured output** `{ loggedIn: boolean }` for robust login detection. Real SDK methods: `client.tasks.create()`, `client.tasks.wait()`, `client.sessions.stop()`.

**Step 1: Write route test**

```typescript
// app/api/browser/verify/__tests__/route.test.ts
describe("POST /api/browser/verify", () => {
  it("saves profile when login is verified", async () => {
    // tasks.wait returns { output: { loggedIn: true } }
    // expect upsertProfile called
    // expect response { success: true }
  });

  it("returns error when login is not verified", async () => {
    // tasks.wait returns { output: { loggedIn: false } }
    // expect upsertProfile NOT called
    // expect response { success: false }
  });

  it("handles string output from structured result", async () => {
    // tasks.wait returns { output: '{"loggedIn": true}' }
    // expect parsed correctly → profile saved
  });

  it("stops session even when verification fails", async () => {
    // expect sessions.stop() called in all cases
  });
});
```

**Step 2: Write the route**

Same implementation as previous tasklist Task 7, but with real SDK method names (`client.tasks.create()`, `client.tasks.wait()`, `client.sessions.stop()`). (See previous tasklist Task 7 for full code — update method names only.)

**Step 3: Run tests, verify, commit**

```bash
pnpm vitest run app/api/browser/verify/__tests__/route.test.ts && pnpm exec tsc --noEmit
git add app/api/browser/verify/
git commit -m "feat(pr50b): add browser verify route with structured output"
```

---

## Task 8: Frontend — Auth Card with Embedded iframe + Helper Hook

**Files:**
- Create: `src/hooks/use-browser-auth.ts`
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `src/components/chat/tool-call-inline.test.tsx`

**Key review fixes:** No raw `fetch` inline. No `alert()`. No singleton `sessionStorage` key. Factor auth logic into a hook. Use sonner toast. Namespace storage keys by platform. Embedded iframe as primary, new-tab as fallback.

**Step 1: Write the auth card rendering tests**

Add to `src/components/chat/tool-call-inline.test.tsx`:

```typescript
describe("browser auth card", () => {
  it("renders auth card when browse_website returns needsAuth", () => {
    render(
      <ToolCallInline
        name="browse_website"
        state="output-available"
        input={{ goal: "Search ProMap", platform: "propnex" }}
        output={{ success: false, needsAuth: true, platform: "propnex", error: "No saved login" }}
      />,
    );

    expect(screen.getByTestId("browser-auth-card")).toBeDefined();
    expect(screen.getByText(/propnex/)).toBeDefined();
    expect(screen.getByRole("button", { name: /connect/i })).toBeDefined();
  });

  it("does not render auth card for normal browse_website output", () => {
    render(
      <ToolCallInline
        name="browse_website"
        state="output-available"
        input={{ goal: "Search example.com" }}
        output={{ success: true, output: "data" }}
      />,
    );

    expect(screen.queryByTestId("browser-auth-card")).toBeNull();
  });

  it("does not render auth card for other tools", () => {
    render(
      <ToolCallInline
        name="web_scrape"
        state="output-available"
        input={{ url: "https://example.com" }}
        output={{ success: false, needsAuth: true, platform: "test" }}
      />,
    );

    expect(screen.queryByTestId("browser-auth-card")).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/components/chat/tool-call-inline.test.tsx
```

Expected: FAIL — no `browser-auth-card` testid found.

**Step 3: Create the auth hook**

```typescript
// src/hooks/use-browser-auth.ts
/**
 * Hook for managing browser platform auth flow state.
 * Handles connect (create session), verify (confirm login), and cleanup.
 * @module hooks/use-browser-auth
 */
"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

interface BrowserAuthState {
  status: "idle" | "connecting" | "awaiting-login" | "verifying" | "done" | "error";
  liveUrl: string | null;
  sessionId: string | null;
  browserUseProfileId: string | null;
  platform: string | null;
}

const STORAGE_PREFIX = "sunder-browser-auth:";

export function useBrowserAuth() {
  const [state, setState] = useState<BrowserAuthState>({
    status: "idle",
    liveUrl: null,
    sessionId: null,
    browserUseProfileId: null,
    platform: null,
  });

  const connect = useCallback(async (platform: string) => {
    setState((s) => ({ ...s, status: "connecting", platform }));

    try {
      const res = await fetch("/api/browser/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();

      if (!res.ok || !data.liveUrl) {
        toast.error(data.error ?? "Failed to create browser session.");
        setState((s) => ({ ...s, status: "error" }));
        return;
      }

      // Store pending session info, namespaced by platform
      sessionStorage.setItem(
        `${STORAGE_PREFIX}${platform}`,
        JSON.stringify({
          sessionId: data.sessionId,
          browserUseProfileId: data.browserUseProfileId,
        }),
      );

      setState({
        status: "awaiting-login",
        liveUrl: data.liveUrl,
        sessionId: data.sessionId,
        browserUseProfileId: data.browserUseProfileId,
        platform,
      });
    } catch {
      toast.error("Failed to create browser session.");
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);

  const verify = useCallback(async (platform: string) => {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${platform}`);
    if (!raw) {
      toast.error("No pending login session found. Try connecting again.");
      return;
    }

    const { sessionId, browserUseProfileId } = JSON.parse(raw);
    setState((s) => ({ ...s, status: "verifying" }));

    try {
      const res = await fetch("/api/browser/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, browserUseProfileId, platform }),
      });
      const data = await res.json();

      sessionStorage.removeItem(`${STORAGE_PREFIX}${platform}`);

      if (data.success) {
        toast.success(`Connected to ${platform}! You can now retry your request.`);
        setState((s) => ({ ...s, status: "done", liveUrl: null }));
      } else {
        toast.error(data.error ?? "Login could not be verified. Please try again.");
        setState((s) => ({ ...s, status: "error", liveUrl: null }));
      }
    } catch {
      toast.error("Failed to verify login.");
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);

  return { state, connect, verify };
}
```

**Step 4: Add auth card to tool-call-inline.tsx**

Add `isBrowserNeedsAuth()` detection (same pattern as `isPdfDownload()`). Render an auth card with:
- Embedded iframe showing `liveUrl` (primary)
- "Open in new tab" fallback link
- "Done — I've logged in" button that calls `verify()`
- Use `useBrowserAuth()` hook for state management
- Use sonner toast for success/error feedback

**Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/components/chat/tool-call-inline.test.tsx
```

Expected: ALL PASS.

**Step 6: Commit**

```bash
git add src/hooks/use-browser-auth.ts src/components/chat/tool-call-inline.tsx src/components/chat/tool-call-inline.test.tsx
git commit -m "feat(pr50b): render browser auth card with embedded iframe + helper hook"
```

---

## Task 9: System Prompt — Platform Auth Guidance (Conditional Fragment)

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:26` — extend `BROWSER_AUTOMATION_PROMPT` constant

**IMPORTANT:** Do NOT edit the global `SYSTEM_PROMPT`. The browser guidance is in `BROWSER_AUTOMATION_PROMPT`, which is conditionally injected by `src/lib/runner/context.ts:104-106` only when `includeBrowserAutomation` is true. This gating was added in PR 50 — preserve it.

**Step 1: Add platform auth guidance to BROWSER_AUTOMATION_PROMPT**

In `src/lib/ai/system-prompt.ts`, find the `BROWSER_AUTOMATION_PROMPT` constant (line 26). Add these lines before the closing `</browser-automation>` tag:

```
Platform authentication:
- For login-gated platforms (PropNex ProMap, PropertyGuru, ERA, URA, HDB, SRX), pass the platform parameter (e.g. platform: "propnex").
- If browse_website returns needsAuth, tell the user: "I need access to [platform]. Click 'Connect [platform]' below to log in with your credentials, then click 'Done' when you're logged in."
- After the user confirms login, they will need to repeat their request. Do not auto-retry — simply acknowledge the connection was saved and wait for the next message.
- If a previously working platform returns login/auth errors, tell the user their session may have expired and suggest reconnecting.
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr50b): add platform auth guidance to conditional browser prompt"
```

---

## Task 10: End-to-End Verification

**Step 1: Run all tests**

```bash
pnpm vitest run
```

Expected: All tests pass.

**Step 2: Test first-connect flow manually**

Ask the agent to search PropNex ProMap. Expected flow: needsAuth → auth card → iframe with liveUrl → user logs in → clicks Done → verify confirms → profile saved → toast success.

**Step 3: Test reconnect (re-auth) flow**

Delete the browser_profiles row for the test client+platform. Ask again. Expected: same auth flow, but the session route reuses the existing Browser-Use profile (no new `profiles.create()` call — check server logs).

**Step 4: Test profile reuse**

After connecting, ask another PropNex query. Should use saved profile automatically — no auth card.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pr50b): authenticated browsing complete"
```

---

## Notes

- **Embedded iframe primary, new-tab fallback:** The auth card embeds the liveUrl in an iframe. If the iframe fails (browser policy, CSP), a "Open in new tab" link is shown as fallback. Verified in testing that liveUrl has no X-Frame-Options restriction.
- **Profile reuse on reconnect:** The session route checks DB first. If `browser_profiles` row exists, it reuses the `browser_use_profile_id` for the new session. Only calls `profiles.create()` on first connect. Prevents remote profile sprawl.
- **Manual retry:** After login, user manually retries their request. No auto-resume.
- **Strict error semantics:** Profile queries throw on DB errors. `null` = truly absent.
- **Structured verify output:** JSON schema `{ loggedIn: boolean }`, not prose parsing.
- **Conditional prompt gating:** Auth guidance is in `BROWSER_AUTOMATION_PROMPT` (conditionally injected), not global `SYSTEM_PROMPT`.
- **UI quality:** Uses `useBrowserAuth()` hook, sonner toasts, namespaced `sessionStorage` keys (`sunder-browser-auth:{platform}`). No `alert()`, no raw inline `fetch`.
- **Free tier limit:** Browser-Use free tier allows 2 profiles. Testing multiple platforms requires Business plan ($500/mo).
