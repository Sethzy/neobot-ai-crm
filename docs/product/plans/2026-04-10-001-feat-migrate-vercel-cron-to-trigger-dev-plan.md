---
title: "feat: Migrate scheduled jobs from Vercel Cron to Trigger.dev"
type: feat
status: active
date: 2026-04-10
origin: docs/product/ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md
---

# feat: Migrate scheduled jobs from Vercel Cron to Trigger.dev

## Overview

Replace Sunder's single Vercel Cron entry (`/api/cron/scan` every minute) with an equivalent Trigger.dev scheduled task, and wire up the Vercel ↔ Trigger.dev integration for atomic deploys. This is a minimal "ticker swap" (Option A from the origin ideation) — the scanner, RPCs, dispatch chain, and database layer are all untouched. The only change is what pulls the trigger.

## Problem Statement / Motivation

(Carried forward from origin: [docs/product/ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md](../ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md).)

Vercel Cron is the single ticker driving all of Sunder's scheduled work. It has no retry, no run history, and no failure alerts — when the scanner silently fails, we find out because a user's trigger didn't fire. Trigger.dev replaces it with proper run history, retries per task, a per-run dashboard, and atomic lockstep deploys with the Next.js app via the Vercel integration.

This also unblocks a future, separate Option B migration (per-trigger Trigger.dev schedules) if trigger volume or observability needs grow.

## Proposed Solution

Add one Trigger.dev scheduled task at `src/trigger/scan-triggers.ts` that GETs `/api/cron/scan` every minute using the existing `CRON_SECRET` bearer token. Delete the cron block from `vercel.json`. Delete the Trigger.dev init boilerplate (`src/trigger/example.ts`). Add `TRIGGER_SECRET_KEY` to the Zod env schema. Connect the Vercel ↔ Trigger.dev integration so `git push` ships both app and task atomically. Hard cutover — no parallel run, no feature flag.

## Technical Approach

### Architecture

**Before:**
```
Vercel Cron (every min, GET)
  → /api/cron/scan (maxDuration: 45s)
    → runScan()
      → claim_due_triggers() RPC
      → release_stale_trigger_claims(15)
      → POST /api/trigger/run (per claimed trigger)
```

**After:**
```
Trigger.dev scheduled task (cron: * * * * *)
  → fetch(GET /api/cron/scan, Bearer CRON_SECRET)
    → (same dispatch chain — no changes)
```

The Trigger.dev task is a thin HTTP caller. It forwards the scanner's JSON response so failures surface as task failures in the Trigger.dev dashboard (with stack traces, retries, run history).

### File-level changes

```
NEW:
  src/trigger/scan-triggers.ts          # The scheduled task

DELETED:
  src/trigger/example.ts                # Init boilerplate

MODIFIED:
  vercel.json                           # Remove crons[] block
  src/lib/env.ts                        # Add TRIGGER_SECRET_KEY (optional)
  package.json                          # Add dev:all script + concurrently dev dep
  README.md (if exists)                 # Document new dev workflow (optional)

UNCHANGED:
  app/api/cron/scan/route.ts            # Scanner auth, logic, response
  app/api/trigger/run/route.ts          # Dispatch handler
  src/lib/triggers/scanner.ts           # runScan()
  src/lib/triggers/executor.ts          # executeTrigger()
  src/lib/triggers/route-auth.ts        # requireCronSecret()
  All agent_triggers / RPC migrations   # DB layer untouched
  trigger.config.ts                     # Already correct
```

### Implementation Phases

#### Phase 1: Task file + env wiring

**Tasks:**
1. Create `src/trigger/scan-triggers.ts`:
   ```ts
   import { schedules, logger } from "@trigger.dev/sdk/v3";

   /**
    * Scanner tick — fires every minute.
    * Thin HTTP caller: GETs /api/cron/scan with the existing CRON_SECRET bearer.
    * All scanner logic stays in the Next.js route; this task just surfaces failures
    * to the Trigger.dev dashboard so we get retry + run history we didn't have
    * with Vercel Cron.
    */
   export const scanTriggers = schedules.task({
     id: "scan-triggers",
     cron: "* * * * *",
     maxDuration: 60, // scanner route itself is capped at 45s
     run: async () => {
       const baseUrl =
         process.env.NEXT_PUBLIC_APP_URL ??
         (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
       if (!baseUrl) {
         throw new Error("NEXT_PUBLIC_APP_URL or VERCEL_URL must be set");
       }
       if (!process.env.CRON_SECRET) {
         throw new Error("CRON_SECRET must be set");
       }

       const res = await fetch(`${baseUrl}/api/cron/scan`, {
         method: "GET",
         headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
       });

       const body = await res.json();
       if (!res.ok) {
         logger.error("Scanner call failed", { status: res.status, body });
         throw new Error(`scan failed: ${res.status}`);
       }

       logger.info("Scanner tick ok", body);
       return body;
     },
   });
   ```

2. Delete `src/trigger/example.ts`.

3. Add to `src/lib/env.ts` server schema (keeps pattern of optional `.min(1)`):
   ```ts
   TRIGGER_SECRET_KEY: z.string().min(1).optional(),
   ```
   Leave `CRON_SECRET` as-is (already optional in schema, enforced at runtime by `requireCronSecret`).

4. `vercel.json` — remove the `crons` array:
   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "framework": "nextjs",
     "outputDirectory": ".next",
     "regions": ["sin1"]
   }
   ```

**Success criteria:**
- `npx trigger.dev@latest dev` discovers the new `scan-triggers` task and registers the schedule in the dev env
- Typecheck + lint clean

#### Phase 2: Local dev ergonomics

**Tasks:**
1. `pnpm add -D concurrently` (or `npm install -D concurrently`)
2. Add to `package.json` scripts:
   ```json
   "dev:all": "concurrently -n next,trigger -c cyan,magenta \"npm run dev\" \"npx trigger.dev@latest dev\""
   ```
3. Leave existing `dev` script unchanged — developers who don't need the task runner running locally shouldn't pay the startup cost.

**Success criteria:**
- `npm run dev:all` starts both processes and both print ready logs
- Existing `npm run dev` still works standalone for the common case

#### Phase 3: Vercel ↔ Trigger.dev integration + deploy

> **Important:** All tasks in this phase are performed in the Trigger.dev and Vercel dashboards. They cannot be committed to the repo and must be completed **before** merging the code PR from Phases 1-2, otherwise the cutover will ship without a ticker.

**Tasks (performed in dashboards, not code):**
1. **Trigger.dev → GitHub integration:** Trigger.dev Settings → Integrations → GitHub → connect the `Sethzy/neobot_next` repo (public, no `.github/workflows` — this is the only CI path).
2. **Trigger.dev → Vercel integration:** Trigger.dev Settings → Integrations → Vercel → connect the Sunder Vercel project. Follow the changelog's setup flow: https://trigger.dev/changelog/vercel-integration
3. **Env var sync config** — enable bidirectional sync for production:
   - **Pull from Vercel before build:** yes (so `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, Supabase keys reach the task)
   - **Push `TRIGGER_SECRET_KEY` back to Vercel:** yes (so we never paste manually)
   - **Auto-discover new envs:** yes (convenience; low risk since Sunder has no secrets it shouldn't share between app and tasks)
4. **Atomic deploys:** enable for production (default on). Leave preview at default until we decide preview strategy — see Dependencies below.
5. **Verify:** trigger a redeploy; confirm that (a) Trigger.dev build runs as part of the Vercel build, (b) `TRIGGER_SECRET_KEY` appears in Vercel env vars, (c) Trigger.dev dashboard shows a prod deployment matching the commit SHA.

**Success criteria:**
- `git push` to main produces a matched app + task deploy
- No manual `npx trigger.dev deploy` step in any runbook

#### Phase 4: Cutover + verification

**Tasks:**
1. Merge the PR containing Phases 1-2. Integration (Phase 3) must already be connected — otherwise the Trigger.dev side won't deploy.
2. Within 3 minutes of deploy, verify in the Trigger.dev dashboard:
   - `scan-triggers` task shows 1+ successful runs (first fire happens at the next cron minute boundary after deploy completes)
   - Each run logs a non-zero or zero `claimed` / `dispatched` count (zero is fine — it means no triggers were due)
3. Verify in the Vercel dashboard:
   - Project Settings → Cron Jobs is empty (no `/api/cron/scan` entry)
4. Verify in Supabase logs:
   - `claim_due_triggers` RPC calls continue at ~1/minute cadence (matches pre-migration baseline)
5. Observe for 15 minutes. No scanner errors → done.

**Rollback path (if anything is wrong):**
- Revert the migration PR. This restores the `crons` block in `vercel.json` and deletes `src/trigger/scan-triggers.ts`. On redeploy, two things happen in lockstep (thanks to the Vercel integration):
  1. Vercel re-enables the cron entry and resumes ticking `/api/cron/scan`
  2. Trigger.dev sees the task file is gone from the deployed task set and deactivates the `scan-triggers` schedule automatically — no manual cleanup in the Trigger.dev dashboard required
- The Vercel integration itself (connected in Phase 3) can stay connected. It's inert if no Trigger.dev tasks exist in the repo.

## System-Wide Impact

### Interaction Graph

Trigger.dev task fires every minute:
1. `scheduled task run` → `fetch GET /api/cron/scan` (over public HTTPS, not internal fetch)
2. `/api/cron/scan` GET handler → `requireCronSecret` → `runScan()`
3. `runScan` → `supabase.rpc("claim_due_triggers")` → `supabase.rpc("release_stale_trigger_claims", 15)` → for each claimed trigger, `fetch POST /api/trigger/run`
4. `/api/trigger/run` → `executeTrigger()` → `runAgent()` (in the original request context, not the Trigger.dev task's context)

**Key point:** the Trigger.dev task is only observable for the *tick itself*. Individual trigger runs still execute inside Vercel function invocations driven by `/api/trigger/run`, and their observability continues to come from Langfuse + Sentry (unchanged). The migration does **not** move agent execution into Trigger.dev.

### Error & Failure Propagation

- **Scanner route 5xx** → task throws → Trigger.dev marks run failed → retry per `trigger.config.ts` default (3 attempts, exponential backoff 1s → 10s) → if all retries fail, run appears red in dashboard.
- **401 from bad `CRON_SECRET`** → task throws immediately → retries will also fail → red run, actionable.
- **Network timeout beyond scanner's 45s** → task's fetch hangs → Trigger.dev kills at `maxDuration: 60` → retries per config.
- **Scanner partially succeeds** (some triggers claimed but some dispatches failed) → scanner returns 200 with `errors: [...]` populated → task returns success but logs the errors via `logger.error`. Trigger.dev run shows green but the log surfaces the partial failure. Acceptable: matches current Vercel Cron behavior.

### State Lifecycle Risks

- **Retry double-claim risk:** `claim_due_triggers` is atomic via status transition (per v2 plan PR 18, line 1297). If Trigger.dev retries the scanner call within a few seconds, the second call will see already-claimed triggers and skip them. Safe.
- **Stale claim window is 15 min** (hardcoded in the scanner call to `release_stale_trigger_claims(15)`). Trigger.dev's max retry window (1s → 10s × 3 attempts) is well below this, so no risk of releasing claims while a retry is still in flight.
- **No orphaned rows** — the scanner writes nothing permanent; it only transitions `agent_triggers.status` and logs.

### API Surface Parity

- The only HTTP surface is `/api/cron/scan` (GET, `Bearer CRON_SECRET`). Unchanged. Any other caller (e.g., a developer manually hitting it for testing) continues to work.
- No changes to `/api/trigger/run`.
- No changes to agent tools, trigger creation UX, or any user-visible surface.

### Integration Test Scenarios

These are scenarios that unit tests with mocks cannot validate — worth manually walking through after deploy:

1. **Happy path:** Deploy → within 60s, a `scan-triggers` run appears in Trigger.dev dashboard with `success: true` and Supabase logs show `claim_due_triggers` called.
2. **Scanner returns errors:** Manually insert a malformed `agent_triggers` row that causes `executeTrigger` to fail. Verify the task still completes green but logs the error, and the next tick still runs.
3. **CRON_SECRET drift:** Temporarily change `CRON_SECRET` in Vercel without updating Trigger.dev (or with env sync disabled). Verify task fails with 401 and appears red in dashboard. Then re-sync and verify recovery on next tick.
4. **Post-deploy atomicity:** Push a commit that modifies both `app/api/cron/scan/route.ts` and `src/trigger/scan-triggers.ts`. Verify both deploy in lockstep and the task invokes the new route version.
5. **Rollback:** Revert the cutover PR on a test branch, redeploy, verify Vercel Cron re-appears in the Vercel dashboard and the Trigger.dev task stops being invoked (dashboard shows no new runs).

## Acceptance Criteria

### Functional

- [ ] **R1** `src/trigger/scan-triggers.ts` exists with a `schedules.task` using cron `* * * * *`, importing from `@trigger.dev/sdk/v3`
- [ ] **R2** Task uses `Authorization: Bearer ${CRON_SECRET}` and does a `GET` (not POST) on `/api/cron/scan`
- [ ] **R3** `vercel.json` no longer contains a `crons` array; other fields unchanged
- [ ] **R4** `src/trigger/example.ts` deleted
- [ ] **R5** Vercel ↔ Trigger.dev integration connected with env var sync enabled for production
- [ ] **R6** `TRIGGER_SECRET_KEY` appears in Vercel production env vars without manual paste
- [ ] **R7** `npm run dev:all` starts both Next.js and Trigger.dev dev runner concurrently
- [ ] **R8** `src/lib/env.ts` includes `TRIGGER_SECRET_KEY` (optional) in the server Zod schema
- [ ] After deploy: scanner tick runs visible in Trigger.dev dashboard with success status
- [ ] After deploy: Vercel dashboard shows no cron jobs for the project

### Non-functional

- [ ] Scanner tick latency (Trigger.dev fire → scanner GET completion) under 5s at p50
- [ ] Task maxDuration set to 60s (room above the scanner's 45s internal cap)
- [ ] Revert PR cleanly restores pre-migration state (verified on a test branch before cutover)

### Quality gates

- [ ] Typecheck clean (`tsc --noEmit`)
- [ ] Lint clean
- [ ] Manual smoke test through all 5 integration scenarios above before closing the PR
- [ ] Commit message uses the PR tag convention: `feat(cron): migrate scanner ticker to trigger.dev`

### Pre-merge gates (must be green before PR merges)

- [ ] **Trigger.dev plan tier verified** to support ≥ 43,200 runs/month (1/min × 30d). Free tier's 5k ceiling is insufficient — confirm developer plan or higher is active on the `proj_fdrfhuxanxwihenznuox` project before merging
- [ ] **Phase 3 integration connected** — Vercel ↔ Trigger.dev integration is live and has at least one successful test deploy showing lockstep app + task build
- [ ] **Revert dry-run** — verified on a test branch that reverting the PR cleanly restores Vercel Cron and deactivates the Trigger.dev task

## Success Metrics

- **Observability:** a scanner failure is visible in the Trigger.dev dashboard within 1 minute of occurrence (vs. "silently never" today).
- **Retry success:** transient scanner failures self-heal via Trigger.dev retry (3 attempts, exponential backoff). Target: ≥ 95% of transient failures recover without a second tick.
- **Deploy integrity:** zero deploys where app version ≠ task version after the Vercel integration is connected.
- **Zero regressions:** `claim_due_triggers` call rate in Supabase logs stays at the pre-migration baseline (~1/minute) after cutover.

## Dependencies & Risks

### Dependencies

- **Trigger.dev CLI initialized** (done — `trigger.config.ts` exists, project `proj_fdrfhuxanxwihenznuox`)
- **Trigger.dev GitHub integration** must be connected before the Vercel integration — prerequisite per the changelog
- **`CRON_SECRET` already set in Vercel production** (confirmed in research)
- **`NEXT_PUBLIC_APP_URL` or `VERCEL_URL` reachable from Trigger.dev cloud workers** — both are public HTTPS URLs, no VPC or private networking, so this is fine
- **Public GitHub repo** (`Sethzy/neobot_next`) — makes the GitHub integration setup straightforward

### Risks

- **Risk: Trigger.dev free-tier run budget (merge blocker).** 1 run/minute × 60 × 24 × 30 = 43,200 runs/month. Trigger.dev free tier is 5k/month, so this migration **will immediately exhaust the free tier in under 4 days** and require at least the paid developer plan. This is a hard pre-merge gate — see the Pre-merge gates checklist above.
  - **Mitigation:** confirm paid plan is active on `proj_fdrfhuxanxwihenznuox` before deploying. If cost is a blocker, do not proceed — stay on Vercel Cron.
- **Risk: Vercel env var sync conflict with Supabase branching.** Research confirmed Sunder does **not** use Supabase preview branching today, so the changelog's warning about branching + env sync does not apply. But if preview branching is added later, Trigger.dev env sync for preview environments will need to be disabled and replaced with a build extension.
  - **Mitigation:** leave Trigger.dev preview env sync disabled initially; only enable for production. Revisit if Sunder adopts preview branches.
- **Risk: Langfuse OpenTelemetry context loss.** The Trigger.dev task runs in Trigger.dev's runtime, not Vercel's. It will not inherit Sunder's OpenTelemetry / Langfuse context. When the task `fetch`es `/api/cron/scan`, the scanner route runs in a fresh Next.js request context with its own Langfuse span — so LLM-level tracing inside `runAgent` is unaffected.
  - **Mitigation:** none needed. The tick itself doesn't need Langfuse tracing; Trigger.dev's native run history is the observability for the tick. Langfuse continues to own LLM tracing inside agent runs.
- **Risk: Forgetting `example.ts` deletion.** Leaving it in place would double-tick the scanner (example.ts is an hourly boilerplate, not minutely, so not catastrophic, but still noise).
  - **Mitigation:** delete in the same commit as the new task file.

## Alternative Approaches Considered

(From the origin ideation.)

- **Option B — per-trigger Trigger.dev schedules.** Rejected for now: ~1-2 days of work with permanent schedule-sync complexity (`agent_triggers` ↔ Trigger.dev schedules must be kept in sync forever via CRUD hooks), and RSS/pulse triggers don't fit the schedule model cleanly. Deferred until there's a concrete pressure (cost, latency, or trigger volume).
- **Parallel run (Vercel Cron + Trigger.dev simultaneously for 1-2 days).** Safe because `claim_due_triggers` is atomic, but wasteful (2× scanner calls during overlap) and a feature flag adds dead code. Rejected in favor of hard cutover with a cheap revert path.
- **Feature flag / env toggle (`TRIGGER_SCANNER_SOURCE`).** Rejected for the same reason — permanent complexity for a one-time migration. Revert is simpler.
- **In-process call to `runScan()` directly from the task.** Rejected because it would require bundling Next.js app code into the Trigger.dev build, coupling the two, and making the change larger than necessary. HTTP hop is ~50ms — negligible at 1-minute granularity.

## Outstanding Questions

### Deferred to Planning (resolved here)

- **[From origin R4] Supabase preview branching compatibility:** Research confirmed Sunder does not use Supabase branching. No action needed. If branching is adopted later, disable env var sync for preview environments in the Trigger.dev integration.
- **[From origin R5] Env var sync direction:** Enable full bidirectional sync for production only. Leave preview sync disabled until preview deployment strategy is decided separately.
- **[From origin R7] Local dev process management:** Add `dev:all` script using `concurrently`. Keep existing `dev` for devs who don't need the Trigger.dev runner locally.

### New questions (raised during research)

- **[Risk: billing]** Confirm Trigger.dev account has enough run budget for 43,200 runs/month before merging. This is a prerequisite, not a blocker for planning.

## Sources & References

### Origin

- **Origin document:** [docs/product/ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md](../ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md)
- **Key decisions carried forward:**
  1. Option A (minimal swap, not Option B per-trigger schedules)
  2. Hard cutover (not parallel run or feature flag)
  3. Thin HTTP caller task (not in-process `runScan()` call)
  4. Connect Vercel integration up front (not deferred)
  5. Reuse existing `CRON_SECRET` (no new auth)

### Internal references

- Current scanner route: `app/api/cron/scan/route.ts` (GET only, `maxDuration: 45`)
- Cron secret auth helper: `src/lib/triggers/route-auth.ts` (`requireCronSecret`)
- Scanner logic: `src/lib/triggers/scanner.ts`
- Executor: `src/lib/triggers/executor.ts`
- Env schema: `src/lib/env.ts` (CRON_SECRET at line 24, Zod pattern)
- Current cron config: `vercel.json` (lines 6-11)
- Trigger.dev config: `trigger.config.ts` (project `proj_fdrfhuxanxwihenznuox`)
- Boilerplate to delete: `src/trigger/example.ts`
- v2 phasing plan, PR 18 (scanner atomic claim mechanism): `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`

### External references

- Trigger.dev Vercel integration announcement: https://trigger.dev/changelog/vercel-integration
- Trigger.dev v3 schedules docs: https://trigger.dev/docs/v3/tasks-scheduled
- Trigger.dev project dashboard: https://cloud.trigger.dev (project `proj_fdrfhuxanxwihenznuox`)

### Related work

- Event-driven triggers ideation (unrelated topic — new trigger *types*, not ticker replacement): `docs/product/ideations/2026-04-06-event-driven-triggers-requirements.md`
- v2 phasing plan PR 19 (Autopilot 6h pulse) — depends on the scanner continuing to work; this migration must not regress it
