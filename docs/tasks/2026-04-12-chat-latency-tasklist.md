# Chat Back-and-Forth Responsiveness Tasklist

**Goal:** Make every chat turn feel faster — first-token latency, subsequent-turn latency, and recovery after failures. Three tasks, in strict execution order. Everything else considered and deliberately rejected (see bottom of file).

**Architecture mental model:** Chat latency is the sum of four serial phases:
1. **Route setup** — auth, rate limit, DB lookups, quota (~50–200ms)
2. **Session handshake** — open SSE stream, send kickoff `user.message` (~100–300ms, plus ~200–500ms for `sessions.create` on turn 1 only)
3. **Model generation** — Claude processes prefix + new message, starts emitting tokens (~300–1500ms time-to-first-token)
4. **Streaming to browser** — SSE events arrive, get translated to UI deltas, React renders (~10–50ms per chunk, *if* nothing is buffering)

The three tasks below target phase 4 (streaming), phase 2 (handshake), and phase 1 (setup) respectively, in that order — cheapest investigation first, biggest visible win second, biggest architectural refactor last.

**Tech Stack:** Next.js 15 App Router · React 19 · Anthropic Managed Agents (`@anthropic-ai/sdk/beta/sessions`) · Supabase (Postgres + RLS) · Vercel Functions · Vitest

## What's Already In Flight

**Do not start any task in this file until `docs/tasks/2026-04-12-chat-context-engineering-cleanup-tasklist.md` has shipped** (both PR A and PR B). That cleanup's Task 3 parallelizes `persistUserInput` + `getOrCreateSession` + `buildSystemReminder` into one `Promise.all`, which is the baseline everything in this tasklist builds on top of. Overlap surface: `src/lib/managed-agents/adapter.ts` around lines 400–440.

---

## Task 1: Verify SSE streaming has no buffering on the edge

**Type:** Investigation / spike. Do this first — it's the cheapest task in the file and could reveal a free win that changes everything downstream.

**Why it affects chat latency:** When Claude is generating a response, tokens stream out of the Managed Agents SSE in chunks (~every 50ms). Each chunk translates to a `{ type: "text-delta" }` event in our response stream and should reach the browser within another ~50ms. That's how "text types itself out" in real time.

But somewhere between our `/api/chat` handler and the user's browser, an intermediary might **buffer** — accumulate a bunch of data before flushing. When that happens, the stream stutters:

```
[silence for 600ms]
↓
Whole paragraph appears at once
↓
[silence for 400ms]
↓
Next paragraph appears at once
```

From the user's perspective this looks like slow generation even though Claude is producing tokens smoothly. The Langfuse trace shows events arriving every 50ms. The browser shows them arriving every 500ms. Something in between is holding data back.

**Where buffering can sneak in:**
1. **Vercel runtime choice** — Node.js runtime and Edge runtime stream differently. One is the correct choice for `/api/chat` and the other isn't.
2. **Response headers** — missing `Cache-Control: no-cache, no-transform` or `X-Accel-Buffering: no` lets intermediaries decide to buffer.
3. **Compression middleware** — gzip/brotli waits to accumulate ~1KB before compressing a block. For SSE that means waiting for several chunks before releasing any.
4. **React state batching on the client** — rare, but aggressive batching in the text-delta handler can compound render lag.

### What to do

**Step 1: Capture a baseline.** Open the chat app, open browser DevTools → Network tab → send a message that produces a multi-paragraph response. Click into the `/api/chat` request while it's still streaming. Watch the raw response chunks arrive live.

Look for: chunks arriving **constantly** (every 50–100ms) vs. chunks arriving **in clumps** (hundreds of ms of silence followed by big drops).

**Step 2: Cross-reference with Langfuse.** Pull the same turn's trace. Note the timestamps on the `agent.message` events — they should be spaced ~50ms apart during generation. If Langfuse shows smooth 50ms spacing but the browser receives data in 500ms clumps, the buffering is definitely between our server and the browser (not in Claude's generation).

**Step 3: Identify the culprit (only if step 1/2 show buffering).**

Check in this order:
1. `app/api/chat/route.ts` — confirm the response is constructed with `createUIMessageStreamResponse()` and NOT being accidentally wrapped in something that awaits the full body
2. `vercel.json` (or absence of it) — confirm `/api/chat` runs on the Node.js runtime, not Edge (Edge has stricter streaming semantics and tighter memory caps)
3. Response headers on `/api/chat` in the Network tab — look for `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Transfer-Encoding: chunked`. If any are missing, intermediaries might buffer.
4. Any middleware in `middleware.ts` — some middleware accidentally awaits `response.body` which collapses streaming.
5. Client-side: the `useChat` transport handler — verify it's processing chunks incrementally, not waiting for a full response.

**Step 4: Report back.**

Write a ~100-word summary with: where the buffering was (or wasn't), what the fix was (if any), and what the before/after looks like on a representative turn. Paste this into the PR description or a Langfuse trace comparison.

### Expected outcomes

- **No buffering found.** Close out in 30 minutes, rule it out, move to Task 2. Good outcome — you eliminated a variable.
- **Buffering found, one-line fix.** Add the missing header, flip the runtime flag, whatever. Ship as its own small PR. Typical impact: **200–500ms of perceived smoothness per turn**.
- **Buffering found, deeper problem.** Rare. Might involve restructuring how the response is constructed. Scope a real task at that point.

### Files that might change

- `app/api/chat/route.ts` (response construction)
- `vercel.json` (runtime config)
- Possibly `middleware.ts` (if it's eating the stream)
- No test changes unless the fix is non-obvious — this is primarily a human-eyeball verification, Vitest can't really catch network buffering.

---

## Task 2: Session warming on thread page mount

**Type:** New endpoint + frontend wiring. Ready to build, no spike needed.

**Why it affects chat latency:** The single biggest latency difference between the first message on a new thread and every subsequent message is the `anthropic.beta.sessions.create` round-trip inside `getOrCreateSession`. That call costs roughly **200–500ms** on a warm connection and only happens on turn 1 of a new thread. After the context engineering cleanup's Task 3 lands, this round-trip is literally the dominant source of first-message latency — everything else is parallelized around it.

The fix: **pre-create the session in the background** when the user opens the chat page, before they've even started typing. By the time they finish their message and hit send, the session already exists and `getOrCreateSession` returns the cached id immediately.

### What to build

**1. New endpoint: `POST /api/chat/warm`**

Lives at `app/api/chat/warm/route.ts`. Skeleton:

```ts
/**
 * Eagerly pre-creates the Anthropic Managed Agents session for a thread
 * so the first /api/chat call on a new thread doesn't pay the
 * sessions.create round-trip.
 *
 * Fire-and-forget from the thread page on mount. If the session already
 * exists (cached session_id on conversation_threads), this is a no-op.
 *
 * @module app/api/chat/warm/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { getOrCreateSession } from "@/lib/managed-agents/session-kickoff";
import { z } from "zod";

const warmRequestSchema = z.object({
  threadId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  let body: { threadId: string };
  try {
    body = warmRequestSchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  const clientId = await resolveClientId(supabase, userId);

  // Verify the thread belongs to this client before warming.
  const { data: thread, error } = await supabase
    .from("conversation_threads")
    .select("thread_id, session_id, title")
    .eq("thread_id", body.threadId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonError("Thread lookup failed.", 500);
  if (!thread) return Response.json({ warmed: false, reason: "thread_not_found" });
  if (thread.session_id) return Response.json({ warmed: false, reason: "already_warm" });

  const anthropic = getAnthropicClient();
  const session = await getOrCreateSession({
    anthropic,
    supabase,
    threadId: body.threadId,
    threadTitle: thread.title ?? null,
  });

  return Response.json({ warmed: session.created, sessionId: session.id });
}
```

Rate limit this aggressively — it's a free Anthropic API call on demand, so we don't want it to be an abuse vector. Reuse `checkRateLimit` from the main chat route with a lower per-minute limit (e.g., 10/min per user).

**2. Frontend fire-and-forget on mount**

In `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` (or wherever the thread page client component lives):

```tsx
useEffect(() => {
  const abortController = new AbortController();
  // Fire and forget — we don't care about the response, we just
  // want the server to have called sessions.create before the
  // user sends their first message.
  fetch("/api/chat/warm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId }),
    signal: abortController.signal,
  }).catch(() => {
    // Silently swallow errors — if warming fails, the first
    // /api/chat call still works, just slightly slower.
  });
  return () => abortController.abort();
}, [threadId]);
```

Fire once on mount. Don't await. Don't show any loading state for it. If it fails, the user experiences exactly today's behavior — `/api/chat` creates the session itself on their first message.

**3. Race handling: the user sends before the warm call finishes**

`getOrCreateSession` is already idempotent in the read path (it does `SELECT session_id` first and only calls Anthropic if null). But if two concurrent paths both see null and both call `sessions.create`, you get two Anthropic sessions — the second one wins the subsequent `UPDATE conversation_threads SET session_id`, and the first one leaks.

Fix options:
- **Accept the leak.** Rare edge case (fast typer + slow warm call), Anthropic reaps idle sessions, cost is minimal.
- **Add a Postgres advisory lock inside `getOrCreateSession`.** Correct but adds complexity.
- **Use `INSERT … ON CONFLICT DO NOTHING`** on a session-pending row to serialize. Slightly more code, guarantees correctness.

Recommendation: **accept the leak for v1** and revisit if it shows up in billing. The race is rare and non-correctness-affecting.

### Test plan

- `app/api/chat/warm/route.test.ts` — unit test the endpoint:
  - warms a fresh thread (null `session_id`) → calls `getOrCreateSession`, returns `warmed: true`
  - skips a thread that already has `session_id` → returns `warmed: false, reason: already_warm`
  - rejects unauth'd requests
  - rejects requests for threads belonging to another client
  - rejects malformed bodies with 400
- No test for the `useEffect` — trivial fetch call, verify by hand in dev and by watching server logs for `/api/chat/warm` hits on page load.

### Expected impact

- ~200–500ms off the first message on every new thread
- First-message latency drops into the same range as subsequent-message latency
- User perception: **"it feels instant now"** — this is the single change in this whole tasklist most likely to produce that reaction in a demo.

### Files

- Create: `app/api/chat/warm/route.ts`
- Create: `app/api/chat/warm/route.test.ts`
- Modify: `app/(dashboard)/chat/[threadId]/chat-thread-page-client.tsx` (add the `useEffect`)
- (Optional) Modify: `src/lib/managed-agents/session-kickoff.ts` (if you decide to harden against the race)

---

## Task 3: Move `markStaleRunsFailed` sweep from hot path to pg_cron

**Type:** Migration + hot-path deletion. Small, ~30 minutes of work.

**Why it affects chat latency:** `markStaleRunsFailed` currently runs at the very top of `runManagedAgent` on every chat turn, costing ~10–40 ms of strictly serialized DB work. On 99%+ of turns it does nothing — the `runs` table is clean because the prior turn's try/catch called `completeRun` itself. It only finds stuck rows in the rare case where the Vercel function got hard-killed mid-turn (OOM, function timeout, cold kill) without running the adapter's catch block. Paying 10–40 ms per turn to defend against a <1% failure mode is exactly the kind of defensive-code-on-the-hot-path pattern that compounds over millions of turns.

The fix: keep the exact same sweep logic, just move it to a Supabase `pg_cron` job that runs every 5 minutes in the background. The lock protection still exists, stuck rows still get cleaned up — they just get cleaned up on a ≤5-minute delay instead of before every single user's message.

**The UX trade-off, so you know what you're accepting:**
- Today: if a function hard-kills mid-turn, the next `/api/chat` call on that thread sweeps the stuck row and proceeds cleanly. The user might see a partial response on turn N, but turn N+1 works.
- After this task: if a function hard-kills mid-turn, the stuck row survives until the next cron sweep. Until it runs, the thread is locked and any new message on it returns 409 "Another response is still in progress for this thread. Please wait and try again." Worst case: **5 minutes of lockout for the affected user**. Average: 2.5 minutes. We accept this because stuck rows should be rare under Managed Agents (the adapter's try/catch handles most failure paths), and the per-turn tax on every other user is a bigger cost than a rare multi-minute wait for one.

**The thing we are NOT doing, for the record:** replacing the `runs` table lock with either (a) a Postgres advisory lock primitive, or (b) a "trust Anthropic session status" refactor. Option (a) is a cleaner end state but ~2 hours of work for an extra 20–40 ms saving, and we can revisit later if the failure rate justifies it. Option (b) was pitched earlier in the design conversation and walked back because it doesn't solve the real problem: **even if Anthropic's session status tells us whether the model is idle, we still need a local lock to prevent two of our server processes from both dispatching the same custom tool call**. Managed Agents is managed infrastructure for the model and session state, but custom tool dispatch runs on our side, and that's what the lock actually protects. See "Considered and Rejected" below.

### Step 3.1: Audit the current `markStaleRunsFailed` SQL behavior

Before writing the migration, open `src/lib/runner/run-lifecycle.ts` and read the actual body of `markStaleRunsFailed`. You need to know:

1. What columns does it update? (`status`, `completed_at`, maybe `failure_reason` or similar)
2. What's the staleness threshold? (check for a `WHERE created_at < NOW() - INTERVAL '...'` clause)
3. Does the current version scope by `thread_id`, or is it already global?
4. Are there any `client_id` / RLS considerations?

Write the current SQL equivalent on a scratch line so you can port it faithfully into the cron function. Don't commit this.

### Step 3.2: Write the failing test for the cron migration

Create `supabase/migrations/__tests__/stale-runs-cron.test.ts`:

```ts
/**
 * Tests for the stale-runs sweep pg_cron migration.
 *
 * The old hot-path call in runManagedAgent is being removed (see
 * adapter.ts changes in this task); this migration replaces it with
 * a background cron sweep.
 *
 * @module supabase/migrations/__tests__/stale-runs-cron
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readMigrationSql(): string {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith("_stale_runs_cron.sql"));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one *_stale_runs_cron.sql migration, found ${files.length}`);
  }
  return fs.readFileSync(path.join(dir, files[0]), "utf8");
}

describe("stale runs pg_cron migration", () => {
  it("enables the pg_cron extension", () => {
    expect(readMigrationSql()).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_cron/i);
  });

  it("creates a sweep_stale_runs function that flips running → failed", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.sweep_stale_runs/i);
    expect(sql).toMatch(/UPDATE public\.runs/i);
    expect(sql).toMatch(/status\s*=\s*'failed'/i);
    expect(sql).toMatch(/WHERE status\s*=\s*'running'/i);
  });

  it("schedules the sweep to run every 5 minutes via pg_cron", () => {
    const sql = readMigrationSql();
    expect(sql).toMatch(/cron\.schedule/);
    expect(sql).toMatch(/'\*\/5 \* \* \* \*'/);
  });
});
```

Run it:
```bash
pnpm vitest run supabase/migrations/__tests__/stale-runs-cron.test.ts
```
Expected: FAIL — migration doesn't exist yet.

### Step 3.3: Write the migration

Create `supabase/migrations/<TODAY_TIMESTAMP>_stale_runs_cron.sql`:

```sql
-- Move the stale-runs sweep from the chat hot path to a background
-- cron job.
--
-- Previously `runManagedAgent` called `markStaleRunsFailed` at the top
-- of every turn, costing ~10–40ms of serialized DB work per request.
-- On 99%+ of turns it did nothing — stuck rows are rare under Managed
-- Agents because the adapter's try/catch handles most failure paths.
-- The sweep only exists to clean up the rare case where Vercel hard-
-- kills a function mid-turn without running the catch block.
--
-- Running every 5 minutes in the background preserves the cleanup
-- behavior at the cost of a worst-case 5-minute thread lockout for
-- users whose function happened to crash. Accepted trade-off.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Sweep function. Runs as the function owner (service role via
-- SECURITY DEFINER) so RLS doesn't gate it. Ports the exact logic
-- from src/lib/runner/run-lifecycle.ts:markStaleRunsFailed, with the
-- thread scope removed (the cron is global).
--
-- IMPORTANT: verify the column names below match the current `runs`
-- table before running this migration. See Step 3.1.
CREATE OR REPLACE FUNCTION public.sweep_stale_runs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.runs
  SET
    status = 'failed',
    completed_at = NOW()
  WHERE status = 'running'
    AND created_at < NOW() - INTERVAL '15 minutes';
$$;

-- Schedule: every 5 minutes
SELECT cron.schedule(
  'sweep-stale-runs',
  '*/5 * * * *',
  $cron$SELECT public.sweep_stale_runs()$cron$
);
```

**Column verification:** the `UPDATE ... SET completed_at = NOW()` line assumes the runs table has a `completed_at` column. If the current schema uses `ended_at`, `finished_at`, or something else, update the migration to match. Look at the existing `completeRun` function in `src/lib/runner/run-lifecycle.ts` for the canonical column names — the cron should write the same columns `completeRun(status: "failed")` writes.

Run the test:
```bash
pnpm vitest run supabase/migrations/__tests__/stale-runs-cron.test.ts
```
Expected: PASS.

### Step 3.4: Write the failing test for the hot-path deletion

In `src/lib/managed-agents/__tests__/adapter.test.ts`, add a regression test:

```ts
it("does not sweep stale runs on the hot path — moved to pg_cron", async () => {
  // Reuse the existing happy-path setup (mockCreateRun, mockConsumeMessageQuota,
  // mockGetOrCreateSession, etc.)
  mockCreateRun.mockResolvedValue({ created: true, runId: "run_1" });

  await runManagedAgent({
    anthropic: {} as never,
    supabase: {} as never,
    clientId: "client_1",
    threadId: "thread_1",
    input: "hi",
    clientProfile: null,
    userPreferences: null,
    threadTitle: null,
  });

  expect(mockMarkStaleRunsFailed).not.toHaveBeenCalled();
});
```

Make sure `mockMarkStaleRunsFailed` is in the `vi.hoisted` mock block at the top of the file. If it's not, add it following the pattern of the other `run-lifecycle` mocks.

Run:
```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts -t "does not sweep stale runs on the hot path"
```
Expected: FAIL — the current adapter still calls `markStaleRunsFailed`.

### Step 3.5: Delete the hot-path call from the adapter

In `src/lib/managed-agents/adapter.ts`:

1. **Line 6 (module JSDoc):** delete the bullet that mentions `markStaleRunsFailed` sweeping stale rows. Keep the surrounding "run lock" description — `createRun` still provides the lock.

2. **Line 51 (imports):** remove `markStaleRunsFailed,` from the run-lifecycle import block. The remaining import should read:
   ```ts
   import {
     completeRun,
     createRun,
   } from "@/lib/runner/run-lifecycle";
   ```

3. **Line 380 (top of `runManagedAgent`):** delete the call entirely:
   ```ts
   await markStaleRunsFailed(input.supabase, { threadId: input.threadId });
   ```
   Leave `const lock = await createRun(...)` that immediately follows it untouched.

4. **Line 508 (catch block comment):** update the stale reference:
   ```ts
   // Anything thrown after createRun() but before the run is
   // marked complete leaves the row stuck in `running` until the
   // pg_cron `sweep_stale_runs` job picks it up (runs every 5
   // minutes — see supabase/migrations/*_stale_runs_cron.sql).
   // Mark failed eagerly so the thread isn't locked, then re-throw
   // so the UIMessageStream surfaces the error to the consumer.
   ```

Run the adapter tests:
```bash
pnpm vitest run src/lib/managed-agents/__tests__/adapter.test.ts
```
Expected: PASS — new regression test passes and no existing tests regress.

### Step 3.6: Verify `markStaleRunsFailed` itself still has its tests

The function stays in `src/lib/runner/run-lifecycle.ts` — we're not deleting it, just moving its caller. The pg_cron function in the migration calls the same SQL, and anyone writing their own cleanup scripts can still import the function.

Run:
```bash
pnpm vitest run src/lib/runner/__tests__/run-lifecycle.test.ts
```
Expected: PASS (unchanged).

### Step 3.7: Smoke test locally (optional, if you have Supabase local dev)

If you run Supabase locally:

```bash
supabase db reset    # applies all migrations
supabase db sql -f - <<EOF
-- Insert a fake stale run
INSERT INTO runs (run_id, thread_id, client_id, status, created_at)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'running', NOW() - INTERVAL '20 minutes');

-- Run the sweep manually
SELECT public.sweep_stale_runs();

-- Verify the fake row got flipped
SELECT status FROM runs WHERE created_at < NOW() - INTERVAL '20 minutes' LIMIT 1;
EOF
```
Expected: the fake row's status is now `'failed'`.

If you can't run Supabase locally, skip this step and verify on a staging project before merging.

### Step 3.8: Commit

```bash
git add supabase/migrations/*_stale_runs_cron.sql \
        supabase/migrations/__tests__/stale-runs-cron.test.ts \
        src/lib/managed-agents/adapter.ts \
        src/lib/managed-agents/__tests__/adapter.test.ts
git commit -m "$(cat <<'EOF'
perf(h5): move stale-runs sweep from chat hot path to pg_cron

The per-turn markStaleRunsFailed call was costing ~10–40ms of
serialized DB work at the top of every runManagedAgent invocation.
On 99%+ of turns it did nothing — stuck rows are rare under Managed
Agents because the adapter's try/catch handles most failure paths.
It was paying a defensive tax on every user's every message for a
<1% failure mode.

Move the sweep to a Supabase pg_cron job running every 5 minutes.
The lock protection still exists; stuck rows still get cleaned up;
the sweep just isn't on the hot path anymore. Worst-case thread
lockout for an affected user is now ~5 minutes instead of zero,
which is the accepted trade-off for removing the per-turn tax.

Delete the import and hot-path call in the adapter. Update the
catch-block comment to point future operators at the cron job.
The markStaleRunsFailed function itself stays — it's the same SQL
as the pg_cron function and other callers (manual cleanup, etc.)
may still want it.

The `runs`-table-as-lock pattern is still intact. Replacing it with
a Postgres advisory lock or a "trust Anthropic session status"
refactor are both scoped out; see docs/tasks/2026-04-12-chat-latency-
tasklist.md for the rationale.
EOF
)"
```

### Expected impact

- **~10–40 ms off every chat turn** (the serialized sweep is gone from the hot path)
- Stuck rows still get cleaned up, just on a ≤5-minute delay instead of per-request
- Worst-case user lockout on a hard-kill: ~5 minutes (down from "never" today, but up from "your next message sweeps it")
- Zero architectural risk — the lock mechanism, the `runs` table shape, and the `createRun` semantics are all unchanged

### Risk

- **Low.** The only real risk is the migration itself failing in production (pg_cron not enabled on the Supabase instance, schema column mismatch, permission issue on `SECURITY DEFINER`). Test on a staging project before merging to main.
- Small UX regression for users whose function hard-kills — they now wait up to 5 minutes vs. zero minutes. Monitor the sweep's output for the first week: if it's finding >1 stuck row per day, the failure rate is higher than expected and we should revisit the trade-off.

---

## Execution notes

**Strict order:** Task 1 → Task 2 → Task 3. Do not parallelize. Each task ships as its own PR.

**Task 1 is cheap data gathering.** Budget 30 minutes, maybe 2 hours if you find buffering and have to debug. The value is proportional to how much buffering exists — zero if everything's fine (rule it out, move on), real if you find something (ship a one-line fix).

**Task 2 is the big visible win.** After this ships, first-message latency drops into the same range as subsequent-message latency. This is the task most likely to get a "wow, the chat feels so much faster" reaction in a demo.

**Task 3 is the hot-path tax removal.** Small migration + hot-path deletion. Keeps the existing `runs`-table lock exactly as it is but moves the cleanup sweep to a background cron. ~30 minutes of focused work. The architectural refactors (advisory lock, trust-Anthropic-session) are both scoped out — see "Considered and Rejected."

**Measure before and after, always.** For every task:
1. Record current `[chat/timing]` deltas on a representative set of turns (first message, subsequent message, approval continuation) before starting
2. Record them again after shipping
3. Write the delta in the PR description

If the win doesn't materialize, the task isn't worth it or there's a different bottleneck than you thought. Don't skip this step — you'll end up with a pile of "refactors that definitely made things faster, probably" that you can't point at in a postmortem.

**Do not start any of these until the chat context engineering cleanup has shipped.** Both PR A and PR B from that tasklist need to be in main first. PR A's parallelization of `persistUserInput` + `getOrCreateSession` + `buildSystemReminder` is the foundation everything here builds on top of.

---

## Considered and Rejected

Every other idea that came up while scoping this tasklist, with a one-line reason for each. Keep these here so future-you doesn't re-discover them and waste an afternoon re-rejecting them.

- **Optimistic "typing..." UI on send** — already in the product. No-op.
- **Replace the `runs`-table lock with a Postgres advisory lock** — would save an extra ~20–40 ms per turn on top of Task 3 AND make the whole "stuck row" category of bug impossible (advisory locks auto-release on connection drop). ~2 hours of work. Scoped out for now because Task 3 already gets most of the per-turn win with ~30 minutes of work, and the advisory lock primitive is only worth doing if the 5-minute cron sweep turns out to leave stuck rows that users actually notice. Revisit if Task 3's cron is finding more than ~1 stuck row per day in practice.
- **"Trust Anthropic session status" refactor (drop the `runs` lock entirely, check `sessions.retrieve` instead)** — pitched earlier in the design conversation and walked back. Doesn't actually work: Anthropic's session state tells us whether the *model* is busy, but not whether one of our server processes is currently draining the SSE stream and dispatching custom tools. Two of our processes both seeing "session idle" and both starting a turn would each receive the same `agent.custom_tool_use` event and each run the tool locally, producing duplicate writes / duplicate emails / duplicate CRM mutations. Managed Agents is managed infrastructure for the model and session state, but custom tool dispatch still runs on our side, so a local lock is still required. Do not revisit this without first proving concurrent tool dispatch on the same session is actually safe on Anthropic's end.
- **Cold-start mitigation (Vercel keep-warm cron)** — investigation first. If cold starts aren't actually hitting users in production (check Vercel function logs), don't build a cron to solve a non-problem. Defer until there's data showing real cold-start latency on `/api/chat`.
- **Cache auth state in a signed cookie** — maybe 20–60ms per turn, but auth caching is exactly the kind of thing that introduces confused-deputy bugs if done wrong. Not worth the risk until bigger wins are shipped.
- **Parallelize rate limit with auth** — small (~10–30ms), trivial, could be bundled into Task 2's route file if someone's already touching that code. Don't make it its own task.
- **Skip `events.list` on brand-new sessions** — saves ~50–150ms on turn 1, but becomes **mostly moot after Task 2 (session warming)** ships because sessions are warmed before the user sends. If after Task 2 first-message latency still feels bad, revisit.
- **Verify Supabase + Vercel region alignment** — free to check (look at Vercel project settings and Supabase region), potentially big win if misaligned (could be 800ms+ of network RTT), but scoping a region migration is its own project. Investigate after shipping Tasks 1–3. If latency is still bad, this becomes the next task.
- **Multi-tier model routing (Haiku for simple turns)** — speculative. Needs a reliable classifier for "this turn is simple enough for Haiku" and that's hard to get right without making the agent silently dumber. Don't start until there's a clear product signal that responsiveness is gating conversion.
- **Prompt cache keepalive pings** — probably impossible. Cache is an Anthropic implementation detail we can't directly manipulate. Research-only, don't build.
- **Edge runtime for `/api/chat`** — Edge has tighter CPU/memory limits, and the route does enough DB + Anthropic + tool dispatch work that Node.js runtime is almost certainly the right choice. Don't migrate without a specific reason.
- **Streaming compression (gzip/br on SSE)** — small win, weird interactions with SSE framing. Risk/reward is bad.
- **Client-side message caching / prefetch** — solving a problem that doesn't exist. The browser already renders optimistically via `useChat`.
- **Bypassing Anthropic's session for "simple" turns by calling the Messages API directly** — loses every benefit of Managed Agents (session state, prompt caching, tool dispatch, event log). Don't.
