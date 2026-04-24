# Prod-Readiness Audit Fixes Implementation Plan

**Goal:** Close the 21 gaps surfaced by the 2026-04-24 Vercel/React/Next.js best-practices audit so the app is ready for GA.

**Architecture:** Pure hygiene work across existing modules — no new features, no schema changes, no API contract changes. Three phases: ship-blockers (secrets isolation, middleware, webhook durability, public-page cost), important (perf + build enforcement), minor polish. Each task is a focused commit. KISS: where a config flag is enough, we don't write a test.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase, Vitest, Vercel Functions, Trigger.dev.

**Audit source:** The findings this plan addresses came from 4 parallel `code-reviewer` agents that scanned the app against `.agents/skills/vercel-react-best-practices/rules/` (57 rules) and `.agents/skills/nextjs-best-practices/SKILL.md`. Where a task references a rule ID (e.g. `server-cache-react`), the rule file exists under `.agents/skills/vercel-react-best-practices/rules/` and can be opened for context.

## Commit convention

`fix(audit): <scope> — <what>` for each task. Keep commits atomic — one task = one commit.

---

## Phase 1 — Ship-blockers

Everything in Phase 1 should land before GA. Phase 2 is "first week post-launch acceptable." Phase 3 is iterative polish.

---

### Task 1: Lock secret-holding modules to the server

**Why:** No structural enforcement stops a Client Component from accidentally importing a module that reads `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, or `STRIPE_SECRET_KEY`. One bad import ships those into the browser bundle.

**Fix:** Add `import "server-only"` to the top of every module that reads a server-only secret. Next.js will refuse to bundle any of them client-side and fail the build loudly if someone tries.

**Files to modify (add `import "server-only";` as the very first import line):**

- `src/lib/env.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/property-public-server.ts`
- `src/lib/stripe/stripe.ts`
- `src/lib/managed-agents/anthropic-client.ts`
- `src/lib/redis.ts`
- `src/lib/rate-limit.ts`
- `src/lib/browser-use/auth-state.ts`
- `src/lib/composio/client.ts`

**Step 1:** Install the package (Next.js ships it but verify): `pnpm list server-only` — if missing, `pnpm add server-only`.

**Step 2:** Add `import "server-only";` to each file above. The import must be the first line (before any other import). Example top of `src/lib/env.ts`:

```typescript
import "server-only";

import { z } from "zod";
// ...existing imports
```

**Step 3:** Run the full build to confirm nothing accidentally imports these from a client component:

```bash
pnpm build
```

Expected: build succeeds. If it fails with `You're importing a component that imports server-only`, follow the error to the offending client file and fix that import (usually means moving a helper to a server-only file or inlining the value).

**Step 4:** Run unit tests:

```bash
pnpm test
```

Expected: PASS (no test changes required).

**Step 5:** Commit.

```bash
git add src/lib/env.ts src/lib/supabase/server.ts src/lib/supabase/property-public-server.ts \
  src/lib/stripe/stripe.ts src/lib/managed-agents/anthropic-client.ts src/lib/redis.ts \
  src/lib/rate-limit.ts src/lib/browser-use/auth-state.ts src/lib/composio/client.ts
git commit -m "fix(audit): add server-only guards to secret-holding modules"
```

---

### Task 2: Middleware — verified auth, tighter matcher, gated logging

**Why:**
1. `middleware.ts:102` uses `supabase.auth.getSession()` — returns a locally-cached session without JWT validation. An attacker with a tampered cookie is "logged in" for the duration of the middleware decision. Supabase's own guidance: use `getUser()` in middleware when the decision depends on identity.
2. `middleware.ts:134` matcher runs on `favicon.ico`, `robots.txt`, `sitemap.xml`, every asset with an extension — wasted edge invocations.
3. `middleware.ts:107-109` unconditionally `console.log`s every authenticated request — log spend + minor pathname leak.

**Files:**
- Modify: `middleware.ts`
- Test: `__tests__/middleware.test.ts` (create if doesn't exist)

**Step 1:** Replace `getSession()` with `getUser()`.

In `middleware.ts` around line 95-110, replace:

```typescript
const getSessionStart = performance.now();
const {
  data: { session },
} = await supabase.auth.getSession();
const getSessionMs = (performance.now() - getSessionStart).toFixed(0);
const user = session?.user ?? null;
```

with:

```typescript
const getUserStart = performance.now();
const {
  data: { user },
} = await supabase.auth.getUser();
const getUserMs = (performance.now() - getUserStart).toFixed(0);
```

Update the `Server-Timing` header + log line references from `getSession*` → `getUser*`.

**Step 2:** Gate the debug log on `DEBUG_LATENCY`.

Wrap the `console.log` at line 107-109 (the `[middleware] ${pathname} | ...` line):

```typescript
if (process.env.DEBUG_LATENCY === "1") {
  console.log(
    `[middleware] ${pathname} | getUser: ${getUserMs}ms | supabase total: ${supabaseMs}ms`
  );
}
```

Keep the `Server-Timing` response header — it's cheap and useful.

**Step 3:** Tighten the matcher to skip static assets and extensioned files.

Replace the `matcher` array at line 134 with:

```typescript
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|.*\\..*).*)",
  ],
};
```

The final `.*\\..*` pattern excludes any path with a file extension. The inner `STATIC_FILE_REGEX` fallback inside the middleware body can stay for belt-and-braces, or be removed if you're confident.

**Step 4:** Run the dev server and spot-check a protected route:

```bash
pnpm dev
```

Open `/chat` in a browser — should work as before. Open browser devtools → Network → hard refresh → confirm no middleware logs in the Vercel dev output for `/favicon.ico`.

**Step 5:** Run existing tests:

```bash
pnpm test
```

Expected: PASS. If middleware tests fail because they asserted on `getSession`, update them to `getUser`.

**Step 6:** Commit.

```bash
git add middleware.ts
git commit -m "fix(audit): middleware — verified auth, tighter matcher, gated logging"
```

---

### Task 3: Telegram webhook durability — persist before work

**Why:** `app/api/webhook/telegram/route.ts` verifies the secret header (good), then moves all DB writes + outbound Telegram delivery into `after()`. If the `after()` handler throws, Telegram gets `200 OK` but the work silently vanishes. This is a user-visible reliability bug — messages disappear without retry.

**Fix:** Before the `after()` call, insert a row into a durable inbound-updates table. If the `after()` handler crashes, the row is still there and can be reprocessed by a manual sweep or a re-delivery job.

**Files:**
- Migrate: new Supabase migration for `telegram_inbound_updates` table
- Modify: `app/api/webhook/telegram/route.ts`
- Test: `app/api/webhook/telegram/__tests__/route.test.ts`

**Step 1:** Create the migration. Use `mcp__supabase__apply_migration` or the SQL editor — the table stores the raw update keyed by Telegram's `update_id` (unique per bot).

```sql
create table if not exists public.telegram_inbound_updates (
  update_id bigint primary key,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.telegram_inbound_updates enable row level security;
-- Service-role only. No client access.
```

**Step 2:** Write the failing test — "if after() throws, the update row exists".

In `app/api/webhook/telegram/__tests__/route.test.ts`, add:

```typescript
it("persists the raw update before calling after()", async () => {
  const supabase = mockSupabase();
  const insertSpy = vi.spyOn(supabase.from("telegram_inbound_updates"), "insert");

  const update = { update_id: 42, message: { text: "/start" } };
  const response = await POST(buildRequest(update));

  expect(response.status).toBe(200);
  expect(insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({ update_id: 42, payload: update })
  );
});
```

**Step 3:** Run the test to see it fail:

```bash
pnpm vitest run app/api/webhook/telegram/__tests__/route.test.ts -t "persists the raw update"
```

Expected: FAIL.

**Step 4:** In `app/api/webhook/telegram/route.ts`, after the secret verification at line ~557 and before the `after()` block at line ~569, insert the row. Use `ON CONFLICT DO NOTHING` so retries from Telegram are idempotent:

```typescript
const adminClient = await createAdminClient();

const { error: insertError } = await adminClient
  .from("telegram_inbound_updates")
  .upsert({ update_id: update.update_id, payload: update }, { onConflict: "update_id" });

if (insertError) {
  // Fail closed — if we can't persist, Telegram retries.
  return new Response("storage error", { status: 500 });
}

after(async () => {
  try {
    // ...existing after() body
    await adminClient
      .from("telegram_inbound_updates")
      .update({ processed_at: new Date().toISOString() })
      .eq("update_id", update.update_id);
  } catch (error) {
    await adminClient
      .from("telegram_inbound_updates")
      .update({ error: error instanceof Error ? error.message : String(error) })
      .eq("update_id", update.update_id);
    throw error;
  }
});

return new Response("ok", { status: 200 });
```

**Step 5:** Run tests:

```bash
pnpm vitest run app/api/webhook/telegram/__tests__/route.test.ts
```

Expected: PASS.

**Step 6:** Commit.

```bash
git add supabase/migrations/*_telegram_inbound_updates.sql \
  app/api/webhook/telegram/route.ts \
  app/api/webhook/telegram/__tests__/route.test.ts
git commit -m "fix(audit): telegram webhook — persist inbound update before after()"
```

---

### Task 4: Meetings ingest idempotency — insert first, then process

**Why:** `app/api/meetings/ingest/route.ts:72-272` checks for an existing `idempotency_key` row via `.maybeSingle()` then inserts if absent. Two fast requests with the same key race past the check and create duplicates — costing two LLM bills and two STT runs per double-fire.

**Fix:** Make `idempotency_key` a unique column (if not already) and attempt insert first with `ON CONFLICT DO NOTHING`. Only the winner proceeds. Losers return the existing row.

**Files:**
- Migrate: new migration adding unique constraint if missing
- Modify: `app/api/meetings/ingest/route.ts`
- Test: `app/api/meetings/__tests__/ingest.test.ts` (create if missing)

**Step 1:** Check current constraint:

```bash
grep -rn "idempotency_key" supabase/migrations/ | head
```

If no unique constraint exists, add a migration:

```sql
alter table public.meeting_records
  add constraint meeting_records_idempotency_key_unique unique (client_id, idempotency_key);
```

**Step 2:** Write the failing test — "two concurrent requests with the same key produce exactly one record".

In `app/api/meetings/__tests__/ingest.test.ts`:

```typescript
it("is idempotent under concurrent identical requests", async () => {
  const payload = buildValidPayload({ idempotency_key: "test-key-1" });
  const [a, b] = await Promise.all([POST(buildRequest(payload)), POST(buildRequest(payload))]);

  expect(a.status).toBe(200);
  expect(b.status).toBe(200);

  const { count } = await supabase
    .from("meeting_records")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", "test-key-1");

  expect(count).toBe(1);
});
```

**Step 3:** Run — expect FAIL:

```bash
pnpm vitest run app/api/meetings/__tests__/ingest.test.ts -t "idempotent under concurrent"
```

**Step 4:** In `app/api/meetings/ingest/route.ts`, replace the maybeSingle-then-insert block (around line 101) with:

```typescript
const { data: existingRow, error: insertError } = await supabase
  .from("meeting_records")
  .insert({
    client_id: clientId,
    idempotency_key: payload.idempotency_key,
    status: "pending",
    // ...other required columns
  })
  .select()
  .maybeSingle();

if (insertError && insertError.code !== "23505") {
  // 23505 = unique violation → someone beat us, not an error
  return jsonError("Failed to create meeting record", 500);
}

if (!existingRow) {
  // Duplicate — fetch and return the existing record
  const { data: dupeRow } = await supabase
    .from("meeting_records")
    .select("*")
    .eq("client_id", clientId)
    .eq("idempotency_key", payload.idempotency_key)
    .single();
  return Response.json({ meeting: dupeRow, deduplicated: true });
}

// Only the winner reaches the STT + summary path.
// Consider moving the long-running STT/LLM work to Trigger.dev and returning early.
```

**Step 5:** Run tests:

```bash
pnpm vitest run app/api/meetings/__tests__/ingest.test.ts
```

Expected: PASS.

**Step 6:** Commit.

```bash
git add supabase/migrations/*_meeting_idempotency.sql app/api/meetings/ingest/route.ts \
  app/api/meetings/__tests__/ingest.test.ts
git commit -m "fix(audit): meetings ingest — insert-first idempotency"
```

---

### Task 5: Cap public agent page transactions + add revalidate

**Why:** `app/market/agents/[regNo]/page.tsx:103-109` fetches all CEA transactions for an agent with no `.limit()`. Top agents have thousands of rows. This payload gets serialized twice into the RSC bundle (once as `transactions`, once as mapped `dates`/`towns`). Public page → crawlers hit it constantly → uncapped cost.

**Files:**
- Modify: `app/market/agents/[regNo]/page.tsx`

**Step 1:** Add `.limit(500)` to the transactions query around line 103-109:

```typescript
const { data: recentTransactions } = await client
  .from("cea_transactions")
  .select("...")
  .eq("salesperson_reg_num", registrationNo)
  .order("transaction_date", { ascending: false })
  .limit(500);
```

**Step 2:** Add `revalidate` at module top (matches sibling `/market/areas/[slug]/page.tsx`):

```typescript
export const revalidate = 21_600; // 6h
```

**Step 3:** Derive `dates` and `towns` inside the client chart components (via `useMemo`), not on the server — pass a single `transactions` array only. Open `src/components/property/charts/*` and move any `transactions.map(...)` derivations into the chart component's `useMemo`. If the charts already do that, just remove the server-side `.map()` calls in the page.

**Step 4:** Smoke-test: open `/market/agents/<reg-no>` in dev, verify charts render.

```bash
pnpm dev
```

**Step 5:** Commit.

```bash
git add app/market/agents/[regNo]/page.tsx src/components/property/charts/
git commit -m "fix(audit): cap agent profile transactions at 500 + revalidate 6h"
```

---

### Task 6: Add revalidate to `/market/properties/[slug]`

**Why:** Sibling pages (`hdb`, `areas`, `agencies`) all declare `export const revalidate = 21_600`. This one doesn't — every bot hit goes to DB.

**Files:**
- Modify: `app/market/properties/[slug]/page.tsx`

**Step 1:** Add at top of file:

```typescript
export const revalidate = 21_600;
```

**Step 2:** Commit.

```bash
git add app/market/properties/[slug]/page.tsx
git commit -m "fix(audit): add 6h revalidate to public properties page"
```

---

## Phase 2 — Important (first-week post-launch)

---

### Task 7: Wrap `resolveClientId` with `React.cache()`

**Why:** `resolveClientId` gets called from every authed Server Component — layout + page + usage helpers — often 2-4 times per request. `React.cache()` dedupes within a single request. Rule: `server-cache-react`.

**Files:**
- Modify: `src/lib/chat/client-id.ts`
- Modify: `src/lib/chat/client-resolver.ts` (wherever `getClientId` / `resolveClientId` is exported)

**Step 1:** At the top of `src/lib/chat/client-id.ts`, add import:

```typescript
import { cache } from "react";
```

**Step 2:** Change the export — wrap the async function:

```typescript
export const resolveClientId = cache(async function resolveClientId(
  supabase: SupabaseClient
): Promise<string> {
  // ...existing body
});
```

Same treatment for any `getClientId` / `getAuthenticatedUser` helper in `src/lib/chat/client-resolver.ts`.

**Step 3:** Build & test:

```bash
pnpm build && pnpm test
```

**Step 4:** Commit.

```bash
git add src/lib/chat/client-id.ts src/lib/chat/client-resolver.ts
git commit -m "fix(audit): wrap resolveClientId in React.cache for per-request dedup"
```

---

### Task 8: Dashboard layout — log auth errors instead of swallowing

**Why:** `app/(dashboard)/layout.tsx:44-46` has `} catch {}` around the session prefetch. If Supabase auth starts failing in prod, we lose the only surface that would signal it.

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Step 1:** Replace the bare `catch {}` with a Sentry breadcrumb:

```typescript
import * as Sentry from "@sentry/nextjs";

// ...
try {
  // existing prefetch
} catch (error) {
  Sentry.captureException(error, { tags: { location: "dashboard-layout-prefetch" } });
  // Graceful fallback still applies — user sees empty state, not an error page.
}
```

**Step 2:** Commit.

```bash
git add app/\(dashboard\)/layout.tsx
git commit -m "fix(audit): log dashboard layout prefetch errors to Sentry"
```

---

### Task 9: `authenticateAndParseBody` helper + roll out

**Why:** ~20 API routes do `await authenticateRequest()` then `await request.json()` sequentially. They're independent — parallelize them. Per-route win: 50-200ms.

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Roll out across: `app/api/chat/route.ts`, `app/api/tool-confirm/route.ts`, `app/api/chat/interrupt/route.ts`, `app/api/browser/session/route.ts`, `app/api/browser/session/cleanup/route.ts`, `app/api/browser/verify/route.ts`, `app/api/files/presign/route.ts`, `app/api/files/confirm/route.ts`, `app/api/crm/attachments/presign/route.ts`, `app/api/crm/attachments/confirm/route.ts`, `app/api/connections/initiate/route.ts`, `app/api/meetings/upload-url/route.ts`, `app/api/meetings/ingest/route.ts`, `app/api/settings/autopilot/route.ts`, `app/api/pdf/route.ts` (start with these; finish the remainder as you spot them).

**Step 1:** Add the helper at the end of `src/lib/api/route-helpers.ts`:

```typescript
import type { ZodTypeAny, z } from "zod";

type AuthAndBody<TSchema extends ZodTypeAny> =
  | { ok: true; auth: Exclude<AuthResult, { ok: false }>; body: z.infer<TSchema> }
  | { ok: false; response: Response };

export async function authenticateAndParseBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema
): Promise<AuthAndBody<TSchema>> {
  const [authResult, rawBody] = await Promise.all([
    authenticateRequest(),
    request.json().catch(() => null),
  ]);

  if (!authResult.ok) return { ok: false, response: authResult.response };
  if (rawBody === null) return { ok: false, response: jsonError("Invalid JSON body", 400) };

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, response: jsonError("Invalid body: " + parsed.error.message, 400) };
  }

  return { ok: true, auth: authResult, body: parsed.data };
}
```

**Step 2:** Refactor one route to use it as the template. Pick `app/api/tool-confirm/route.ts`:

```typescript
const result = await authenticateAndParseBody(request, ToolConfirmBodySchema);
if (!result.ok) return result.response;
const { auth, body } = result;
// ...rest
```

**Step 3:** Run the route's tests:

```bash
pnpm vitest run app/api/tool-confirm
```

**Step 4:** Roll out to the remaining routes one at a time. Don't batch-commit — one route per commit so bisect is clean:

```bash
git add app/api/<route>/route.ts
git commit -m "fix(audit): <route> — parallelize auth and body parsing"
```

**Step 5:** Once the helper itself is ready, commit it first:

```bash
git add src/lib/api/route-helpers.ts
git commit -m "feat(api): authenticateAndParseBody helper for parallel auth+body parsing"
```

---

### Task 10: Parallelize the trigger scanner

**Why:** `src/trigger/triggers/scanner.ts:228` awaits `dispatch(trigger)` in a `for` loop. One slow trigger (e.g. slow Anthropic session creation) stalls the whole batch inside the 60s `maxDuration`. Autopilot bottleneck.

**Files:**
- Modify: `src/trigger/triggers/scanner.ts`
- Test: `src/trigger/__tests__/scanner.test.ts`

**Step 1:** Write the failing test — "one slow trigger does not block others":

```typescript
it("dispatches claimed triggers in parallel", async () => {
  const dispatchOrder: string[] = [];
  vi.spyOn(executor, "dispatch").mockImplementation(async (t) => {
    if (t.id === "slow") await new Promise((r) => setTimeout(r, 500));
    dispatchOrder.push(t.id);
  });

  const start = Date.now();
  await scanTriggers([{ id: "slow" }, { id: "fast-1" }, { id: "fast-2" }]);
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(700); // would be 1500ms+ if serial
  expect(dispatchOrder).toContain("fast-1");
});
```

**Step 2:** Run: FAIL.

**Step 3:** Replace the sequential loop with `Promise.allSettled` + bounded concurrency. Simplest KISS option — no concurrency cap, just `allSettled`:

```typescript
await Promise.allSettled(claimedTriggers.map((t) => dispatch(t)));
```

If there's concern about blowing up Anthropic quota with 50+ parallel sessions, add a small concurrency limit using `p-limit`:

```typescript
import pLimit from "p-limit";
const limit = pLimit(10);
await Promise.allSettled(claimedTriggers.map((t) => limit(() => dispatch(t))));
```

Start without `p-limit`. Add it if dashboards show contention.

**Step 4:** Run test: PASS.

**Step 5:** Commit.

```bash
git add src/trigger/triggers/scanner.ts src/trigger/__tests__/scanner.test.ts
git commit -m "fix(audit): parallelize trigger scanner dispatch"
```

---

### Task 11: Move PostHog telemetry off the critical path

**Why:** `await captureServerEvent(...)` blocks response in several routes. Rule: `server-after-nonblocking`. ~50-150ms per request.

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:52-121`
- Modify: `app/api/connections/initiate/route.ts:106-112`
- Modify: `app/api/connections/callback/route.ts:255-261`
- Modify: `app/api/tool-confirm/route.ts:87-96`

**Step 1:** Ensure `after` is imported at top:

```typescript
import { after } from "next/server";
```

**Step 2:** Wrap every `await captureServerEvent(...)` call:

```typescript
// Before:
await captureServerEvent(...);

// After:
after(() => captureServerEvent(...));
```

If `captureServerEvent` can throw and you want visibility, add a `.catch`:

```typescript
after(() => captureServerEvent(...).catch((e) => console.error("posthog", e)));
```

**Step 3:** Run tests:

```bash
pnpm test
```

**Step 4:** Commit (one per file is fine; batching is also fine since the change is trivial).

```bash
git add app/api/stripe/webhook/route.ts app/api/connections/*/route.ts app/api/tool-confirm/route.ts
git commit -m "fix(audit): move PostHog telemetry to after() in webhook + connection routes"
```

---

### Task 12: Metadata on auth pages

**Why:** `/login`, `/register`, `/forgot-password`, `/update-password`, `/auth/confirm`, `/demo` inherit the root marketing title. Wrong for auth tabs.

**Files:**
- Modify: `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/update-password/page.tsx`, `app/auth/confirm/page.tsx`, `app/demo/page.tsx`

**Step 1:** Add to each file (adjust copy per page):

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Sunder",
  description: "Sign in to your Sunder account.",
  robots: { index: false, follow: false }, // auth pages shouldn't be indexed
};
```

For `/demo`, don't set `robots: noindex` — that's a lead-gen page. Give it proper OG tags:

```typescript
export const metadata: Metadata = {
  title: "Book a Sunder demo",
  description: "See how Sunder runs your CRM, follow-ups, and meeting prep on autopilot.",
  openGraph: {
    title: "Book a Sunder demo",
    description: "See how Sunder runs your CRM, follow-ups, and meeting prep on autopilot.",
    images: ["/og/demo.png"], // update if you have a real asset
  },
};
```

**Step 2:** Smoke-test — open each route in the browser, verify the title in the tab.

**Step 3:** Commit.

```bash
git add app/login/page.tsx app/register/page.tsx app/forgot-password/page.tsx \
  app/update-password/page.tsx app/auth/confirm/page.tsx app/demo/page.tsx
git commit -m "fix(audit): per-route metadata on auth + demo pages"
```

---

### Task 13: Lazy-load heavy libs

**Why:** recharts, dnd-kit, framer-motion, property charts all ship statically in pages that rarely or conditionally use them. Rule: `bundle-dynamic-imports`.

**Files — each is an independent small commit:**

**13a. `src/lib/views/registry.tsx` — lazy-load chart panels**

```typescript
import dynamic from "next/dynamic";

const BarChartPanel = dynamic(() =>
  import("@/components/views/chart-panels").then((m) => m.BarChartPanel),
  { ssr: false }
);
const DonutChartPanel = dynamic(() =>
  import("@/components/views/chart-panels").then((m) => m.DonutChartPanel),
  { ssr: false }
);
// ...same for FunnelChartPanel, LineChartPanel
```

Commit: `fix(audit): lazy-load recharts-based chart panels from json-render registry`

**13b. `app/(dashboard)/customers/deals/page.tsx:24` — lazy-load KanbanBoard**

Mirror the pattern already used in `app/(dashboard)/tasks/page.tsx:43`:

```typescript
const KanbanBoard = dynamic(
  () => import("@/components/crm/kanban-board").then((m) => m.KanbanBoard),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);
```

Commit: `fix(audit): lazy-load deals kanban (dnd-kit)`

**13c. `src/components/property/charts/*` — lazy-load**

In whichever parent mounts these (property detail page), wrap with `dynamic(..., { ssr: false })`. One commit per parent.

Commit: `fix(audit): lazy-load property charts (recharts)`

**13d. Landing — framer-motion-heavy components**

`src/components/landing/HeroIdentityAnimation.tsx`, `UseCases.tsx`, `PrimaryFeatures.tsx`, `SparkleDecoration.tsx`, `SunburstDecoration.tsx` — wrap the parent imports in `app/page.tsx` with `dynamic(..., { ssr: false })` where the component is primarily motion-driven, or `dynamic(..., { ssr: true })` for ones that should SSR.

Reference: `SecondaryFeatures.tsx` is already done this way.

Commit: `fix(audit): lazy-load framer-motion-heavy landing sections`

**Verify each:** `pnpm build` should show reduced First Load JS. The exact improvement will show in the build output — screenshot or note it in the commit body if motivating to the team.

---

### Task 14: Fix filter overlay derived-state anti-pattern

**Why:** `src/components/ui/filter-overlay.tsx:225-231` uses `useState(initialValues)` + `useEffect(() => setDraftValues(initialValues), [initialValues])`. Parent re-render with a new `initialValues` object identity nukes in-progress edits. Rule: `rerender-derived-state-no-effect`.

**Files:**
- Modify: `src/components/ui/filter-overlay.tsx`
- Test: `src/components/__tests__/filter-overlay.test.tsx` (create if missing)

**Step 1:** Write the failing test:

```typescript
it("preserves in-progress draft when parent re-renders with new initialValues identity", () => {
  const { rerender, getByRole } = render(
    <FilterOverlay initialValues={{ status: "open" }} onApply={vi.fn()} />
  );

  fireEvent.change(getByRole("textbox", { name: /search/i }), { target: { value: "typing" } });
  rerender(<FilterOverlay initialValues={{ status: "open" }} onApply={vi.fn()} />);

  expect((getByRole("textbox", { name: /search/i }) as HTMLInputElement).value).toBe("typing");
});
```

**Step 2:** FAIL.

**Step 3:** Fix with the React-recommended pattern — track last-seen `initialValues` via a ref and reset only when the caller passes a new `key`, OR compare during render:

```typescript
// Replace the useEffect pattern with render-time sync:
const [draftValues, setDraftValues] = useState(initialValues);
const lastInitialRef = useRef(initialValues);
if (lastInitialRef.current !== initialValues && !areFilterValuesEqual(lastInitialRef.current, initialValues)) {
  lastInitialRef.current = initialValues;
  setDraftValues(initialValues);
}
```

React officially supports "adjusting state while rendering" — see: <https://react.dev/reference/react/useState#storing-information-from-previous-renders>.

Alternatively — and simpler — have callers pass `key={filterResetToken}` and let the component fully remount. Pick whichever is less invasive at the call site. Check callers first:

```bash
grep -rn "FilterOverlay" src/ app/
```

**Step 4:** Test: PASS.

**Step 5:** Commit.

```bash
git add src/components/ui/filter-overlay.tsx src/components/__tests__/filter-overlay.test.tsx
git commit -m "fix(audit): filter overlay — sync draft during render, not in effect"
```

---

### Task 15: Passive scroll listener in row-actions

**Why:** `src/components/ui/row-actions.tsx:121` registers scroll with `capture: true` but non-passive. Can briefly block scroll on mobile.

**Files:**
- Modify: `src/components/ui/row-actions.tsx`

**Step 1:** Change line 121 from:

```typescript
window.addEventListener("scroll", handleWindowChange, true);
```

to:

```typescript
window.addEventListener("scroll", handleWindowChange, { capture: true, passive: true });
```

Matching `removeEventListener` on the corresponding cleanup — update the options argument to match, or just pass `true` (browsers match on capture only for `removeEventListener`):

```typescript
window.removeEventListener("scroll", handleWindowChange, true);
```

**Step 2:** Commit.

```bash
git add src/components/ui/row-actions.tsx
git commit -m "fix(audit): passive scroll listener in row-actions"
```

---

### Task 16: Meetings page — server-prefetch instead of client fetch

**Why:** `app/(dashboard)/meetings/page.tsx` is `'use client'` and calls `useMeetings()`. Every load waterfalls layout → client mount → hook → fetch. The automations page uses the correct pattern — server fetch + `HydrationBoundary`.

**Files:**
- Modify: `app/(dashboard)/meetings/page.tsx`
- Create: `app/(dashboard)/meetings/meetings-page-client.tsx`

**Step 1:** Read `app/(dashboard)/automations/page.tsx` as the reference pattern. It's a server component that `dehydrate()`s a prefetched query and wraps the client with `HydrationBoundary`.

**Step 2:** Move the current `app/(dashboard)/meetings/page.tsx` body into a new `meetings-page-client.tsx` marked `"use client"`.

**Step 3:** Replace `page.tsx` with a server component that prefetches meetings:

```typescript
import { HydrationBoundary, dehydrate, QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import { resolveClientId } from "@/lib/chat/client-id";
import { fetchMeetings, meetingsQueryKey } from "@/lib/meetings/queries";
import { MeetingsPageClient } from "./meetings-page-client";

export default async function MeetingsPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: meetingsQueryKey(clientId),
    queryFn: () => fetchMeetings(supabase, clientId),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MeetingsPageClient />
    </HydrationBoundary>
  );
}
```

Names depend on the existing `useMeetings` implementation — match its query key.

**Step 4:** Smoke-test:

```bash
pnpm dev
```

Open `/meetings`. Verify list renders without a flash of empty state.

**Step 5:** Commit.

```bash
git add app/\(dashboard\)/meetings/page.tsx app/\(dashboard\)/meetings/meetings-page-client.tsx
git commit -m "fix(audit): meetings page — server-prefetch into HydrationBoundary"
```

---

### Task 17: Enable ESLint at build time

**Why:** `next.config.ts:101` has `eslint.ignoreDuringBuilds: true`. Combined with `react-hooks/exhaustive-deps` and `no-explicit-any` being `warn` (not `error`), nothing catches the patterns we claim to follow.

**Files:**
- Modify: `eslint.config.js`
- Modify: `next.config.ts`

**Step 1:** In `eslint.config.js`, bump rules:

```javascript
rules: {
  "react-hooks/exhaustive-deps": "error",
  "@typescript-eslint/no-explicit-any": "error",
  // ...existing rules
}
```

**Step 2:** Split the `globals` by scope — browser for components/hooks, node for `src/trigger/**` and `src/lib/**/server*.ts`. Add to the flat config:

```javascript
{
  files: ["src/trigger/**/*.{ts,tsx}", "src/lib/**/server*.{ts,tsx}", "app/api/**/*.{ts,tsx}"],
  languageOptions: { globals: globals.node },
},
{
  files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/contexts/**/*.{ts,tsx}"],
  languageOptions: { globals: globals.browser },
},
```

**Step 3:** Run lint:

```bash
pnpm lint
```

Expect a wall of existing warnings → errors. Fix or suppress with explicit `// eslint-disable-next-line` + reason. Don't rush this. Can be one commit that bumps rules + adds disables for known-acceptable cases, and another pass that actually fixes them.

**Step 4:** Once clean, flip `next.config.ts`:

```typescript
eslint: {
  ignoreDuringBuilds: false,
},
```

**Step 5:** `pnpm build` — must succeed.

**Step 6:** Commit in two parts:

```bash
git add eslint.config.js
git commit -m "fix(audit): enforce react-hooks/exhaustive-deps and no-explicit-any as errors"

# after the cleanup pass:
git add next.config.ts
git commit -m "fix(audit): remove eslint.ignoreDuringBuilds flag"
```

---

## Phase 3 — Minor polish

---

### Task 18: Centralize logging + gate dev console output

**Why:** 142 `console.log` statements across `src/lib/managed-agents/**`, storage helpers, STT. In prod, they bloat Vercel logs.

**Files:**
- Scan: `grep -rn "console\." src/lib src/hooks`
- Modify: all hits that aren't behind `DEBUG_*` flags

**Step 1:** Decide convention — either route all through a `logger.ts` module, or gate behind `process.env.DEBUG === "1"`. Pick the simpler option (env gate) unless you already have a logger.

**Step 2:** Grep for unguarded logs and wrap:

```typescript
if (process.env.NODE_ENV !== "production") {
  console.log(...);
}
```

Or delete the log outright if it was pure debug scaffolding.

**Step 3:** Commit in chunks per directory:

```bash
git commit -m "fix(audit): gate dev console logs in managed-agents"
git commit -m "fix(audit): gate dev console logs in storage helpers"
```

---

### Task 19: Versioned localStorage helper

**Why:** Unversioned keys break returning users on the first schema change. Rule: `client-localstorage-schema`.

**Files:**
- Create: `src/lib/storage/versioned-local.ts`
- Modify: `src/hooks/use-view-preference.ts`, `src/hooks/use-global-search.ts`, `src/hooks/use-meeting-recording.ts`

**Step 1:** Write the helper:

```typescript
type VersionedValue<T> = { v: number; d: T };

export function readVersionedJSON<T>(key: string, version: number, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as VersionedValue<T>;
    if (parsed.v !== version) return fallback;
    return parsed.d;
  } catch {
    return fallback;
  }
}

export function writeVersionedJSON<T>(key: string, version: number, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: version, d: data }));
  } catch {
    // quota / disabled — silently ignore
  }
}
```

**Step 2:** Migrate the three hooks to use it. `version: 1` on first adoption.

**Step 3:** Commit.

```bash
git add src/lib/storage/versioned-local.ts src/hooks/use-view-preference.ts \
  src/hooks/use-global-search.ts src/hooks/use-meeting-recording.ts
git commit -m "fix(audit): versioned localStorage helper + migrate hooks"
```

---

### Task 20: `next.config.ts` hygiene

**Why:** `poweredByHeader` off, image cache TTL up.

**Files:**
- Modify: `next.config.ts`

**Step 1:** Add:

```typescript
poweredByHeader: false,
images: {
  // ...existing
  minimumCacheTTL: 2_592_000, // 30 days for Supabase-hosted assets
},
```

**Step 2:** Commit.

```bash
git add next.config.ts
git commit -m "fix(audit): next.config hygiene — poweredByHeader off, 30d image cache"
```

---

### Task 21: Cap PDF route body size

**Why:** `app/api/pdf/route.ts:39-57` accepts `z.unknown()` for the spec with no size cap. Hostile client can OOM the function.

**Files:**
- Modify: `app/api/pdf/route.ts`

**Step 1:** Check `Content-Length` before parsing:

```typescript
const contentLength = Number(request.headers.get("content-length") ?? 0);
if (contentLength > 256 * 1024) {
  return jsonError("Payload too large", 413);
}
```

**Step 2:** Tighten the Zod schema — replace `z.unknown()` with a bounded structure, e.g. `z.object({ elements: z.array(...).max(500) })`.

**Step 3:** Commit.

```bash
git add app/api/pdf/route.ts
git commit -m "fix(audit): cap PDF route body size + tighten spec schema"
```

---

## Relevant Files

**Ship-blocker files:**
- `src/lib/env.ts`, `src/lib/supabase/server.ts`, `src/lib/stripe/stripe.ts`, `src/lib/managed-agents/anthropic-client.ts`, `src/lib/redis.ts`, `src/lib/rate-limit.ts`, `src/lib/browser-use/auth-state.ts`, `src/lib/composio/client.ts`
- `middleware.ts`
- `app/api/webhook/telegram/route.ts`, `app/api/webhook/telegram/__tests__/route.test.ts`
- `app/api/meetings/ingest/route.ts`, `app/api/meetings/__tests__/ingest.test.ts` (new)
- `app/market/agents/[regNo]/page.tsx`, `app/market/properties/[slug]/page.tsx`
- New migrations: `telegram_inbound_updates`, meeting idempotency unique constraint

**Important-tier files:**
- `src/lib/chat/client-id.ts`, `src/lib/chat/client-resolver.ts`
- `app/(dashboard)/layout.tsx`
- `src/lib/api/route-helpers.ts` + ~20 API route files
- `src/trigger/triggers/scanner.ts`, `src/trigger/__tests__/scanner.test.ts`
- `app/api/stripe/webhook/route.ts`, `app/api/connections/*/route.ts`, `app/api/tool-confirm/route.ts`
- `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/update-password/page.tsx`, `app/auth/confirm/page.tsx`, `app/demo/page.tsx`
- `src/lib/views/registry.tsx`, `src/components/views/chart-panels.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `src/components/property/charts/*`
- `app/page.tsx` + `src/components/landing/*`
- `src/components/ui/filter-overlay.tsx`, `src/components/__tests__/filter-overlay.test.tsx` (new)
- `src/components/ui/row-actions.tsx`
- `app/(dashboard)/meetings/page.tsx`, `app/(dashboard)/meetings/meetings-page-client.tsx` (new)
- `eslint.config.js`, `next.config.ts`

**Minor-tier files:**
- Unguarded `console.*` in `src/lib/managed-agents/**`, `src/lib/transcription/**`, `src/lib/storage/**`
- `src/lib/storage/versioned-local.ts` (new), `src/hooks/use-view-preference.ts`, `src/hooks/use-global-search.ts`, `src/hooks/use-meeting-recording.ts`
- `next.config.ts`
- `app/api/pdf/route.ts`

---

## Notes

- Each task is one commit unless explicitly split (Tasks 9 and 17 split for reviewability).
- No task touches a feature contract. Any UI change is a perf/correctness fix, not a design change.
- If a step fails and you can't resolve it in ~15 minutes, stop and flag — the audit was based on current `main` state; if you've rebased onto something newer, line numbers may have shifted.
- Skipped from this plan (intentional YAGNI): demo page Flexoki migration, CSP Report-Only → Enforcing promotion, large-file decomposition of `prompt-input.tsx` / `tool-call-inline.tsx`, `use-realtime` ref-sync optimization, resize listener consolidation. These are either low-impact, or they warrant their own focused project with staging validation.
