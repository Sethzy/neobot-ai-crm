# Handover: Chat Latency Optimization — Review Request

**Author:** Seth + Claude Code
**Date:** 2026-04-13
**Status:** Ready for review — not yet committed

## What changed

We instrumented the `POST /api/chat` request lifecycle with `performance.now()` timing, identified bottlenecks, and applied latency optimizations. All 44 relevant tests pass. No functional changes — only execution order and concurrency.

## Why

Chat response felt slow. Timing logs revealed ~6s of avoidable setup latency before the Anthropic agent even starts thinking, plus ~500ms–1s of post-response blocking during finalization.

## Files changed (latency-related only)

Other files in the diff are from prior uncommitted work — **only review these**:

| File | What changed |
|---|---|
| `app/api/chat/route.ts` | Timing instrumentation + parallelized `checkRateLimit` / `resolveClientId` + parallelized thread lookup / client context |
| `src/lib/managed-agents/adapter.ts` | Parallelized `createRunRecord` / `consumeMessageQuota` + moved `listCustomizedSkillSlugs` into existing `Promise.all` + parallelized `completeRun` / `runEvaluators` in `finalizeRun` + made `deliverToExternalChannels` fire-and-forget |
| `src/lib/managed-agents/session-runner.ts` | Timing instrumentation + made `session.retrieve` for cost non-blocking (fires concurrently with finalization, awaited before `onTerminal`) |
| `src/lib/managed-agents/session-kickoff.ts` | Timing instrumentation on `sessions.create` and `isSessionAlive` |
| `src/lib/runner/skills/list-customized-skill-slugs.ts` | Removed N serial `bucket.download()` calls — directory existence is now the signal (one `list()` call instead of 1 + N) |
| `src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts` | Updated test to match new behavior (directory existence = customized) |

## Specific things to verify

### 1. `deliverToExternalChannels` is now fire-and-forget (`adapter.ts:194`)

**Before:** `await deliverToExternalChannels(...).catch(...)`
**After:** `deliverToExternalChannels(...).catch(...)`  (no `await`)

The message is already durable via `upsertMessage` on the line above. External delivery (Telegram) doesn't need to block the HTTP response.

**Check:** Is there any downstream code that assumes delivery completed before the response closes? Does the Vercel Function runtime guarantee the fire-and-forget promise runs to completion, or could it get killed when the response stream ends?

### 2. `session.retrieve` for cost is now concurrent (`session-runner.ts:363-381`)

**Before:** Sequential — blocked the return of `consumeAnthropicSession`.
**After:** Fires immediately after loop exit, `cost.runtimeSeconds` starts as 0, the retrieve mutates the `cost` object in-flight. `retrievePromise` is awaited before `onTerminal` fires.

**Check:** Is there a race where `finalizeRun` reads `cost.runtimeSeconds` before the retrieve populates it? The `await retrievePromise` on line 384 should prevent this, but verify the ordering.

### 3. `listCustomizedSkillSlugs` trusts directory existence (`list-customized-skill-slugs.ts`)

**Before:** Listed directories, then downloaded `SKILL.md` from each to verify existence.
**After:** If a non-reserved directory exists under `{clientId}/skills/`, it's treated as customized.

**Check:** Could there be orphaned directories in Supabase Storage that don't have a `SKILL.md`? If so, the agent would get a kickoff hint to read a skill that doesn't exist — it would call `storage_read` and get an error back. Confirm this is acceptable (agent would just proceed without the custom skill).

### 4. `createRunRecord` + `consumeMessageQuota` parallelized (`adapter.ts:333-342`)

**Before:** Sequential — run record created first, then quota checked.
**After:** `Promise.all([createRunRecord, consumeMessageQuota])`.

**Check:** The `Promise.all` is OUTSIDE the try/catch block — if either promise rejects, the error propagates up without reaching the catch. The catch only handles errors from inside the try (where `runId` is always defined). Confirmed safe. However, if `consumeMessageQuota` throws (DB error, not quota exceeded), `createRunRecord` may have created an orphaned run row in `running` state. The `sweep_stale_runs` pg_cron job would eventually clean it up, but verify this is acceptable.

### 5. `completeRun` + `runEvaluators` parallelized in `finalizeRun` (`adapter.ts:280-295`)

**Before:** Sequential chain: persist → complete → evaluate.
**After:** Persist first (must be durable), then `Promise.all([completeRun, runEvaluators])`.

**Check:** `runEvaluatorsForEvents` is documented as fire-and-forget safe (never throws). Confirm `completeRun` doesn't depend on evaluator results and vice versa.

### 6. Route-level: `checkRateLimit` + `resolveClientId` parallel (`route.ts:157-175`)

**Before:** Rate limit checked first, then clientId resolved.
**After:** `Promise.all([checkRateLimit, resolveClientId])`.

**Check:** If rate limit is exceeded, we now also resolved clientId unnecessarily (wasted one RPC call). This is acceptable — rate-limited requests are rare, and the RPC is cheap. But confirm `resolveClientId` has no side effects that matter on rejected requests.

## Expected latency improvement

| Phase | Before (ms) | After (ms) | How |
|---|---|---|---|
| Route: rateLimit + clientId | ~60 (sum) | ~50 (max) | Parallelized |
| Route: threadLookup + clientContext | ~170 (sum) | ~100 (max) | Parallelized |
| Adapter: runRecord + quota | ~150 (sum) | ~90 (max) | Parallelized |
| Adapter: kickoffBuild (listCustomizedSkillSlugs) | 1,400–5,000 | ~0 (hidden) | Removed N downloads + moved into Promise.all |
| Finalize: completeRun + evaluators | ~200 (sum) | ~100 (max) | Parallelized |
| Finalize: deliverToExternalChannels | ~50-200 | 0 (fire-and-forget) | Not awaited |
| Post-loop: session.retrieve | ~500 (blocking) | ~0 (concurrent) | Runs during finalization |
| **Total savings** | | **~6s cold / ~2s warm** | |

## How to verify

1. Start the dev server (`npm run dev`)
2. Send a chat message in a **new thread** — check the console for `[api/chat] route setup timing`, `[runManagedAgent] adapter setup timing`, and `[session-runner] ...` timing logs
3. Send a follow-up message in the **same thread** — check timing for the warm path
4. Upload a file and send a message — check that `attachFiles` timing appears correctly
5. Run `npx vitest run src/lib/managed-agents/__tests__/adapter.test.ts src/lib/managed-agents/__tests__/session-kickoff.test.ts src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts app/api/chat/__tests__/route.test.ts` — all 44 tests should pass
