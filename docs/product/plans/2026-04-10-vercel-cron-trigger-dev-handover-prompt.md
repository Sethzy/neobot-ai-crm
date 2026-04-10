# Handover: Migrate Sunder scheduled jobs from Vercel Cron to Trigger.dev

## Your job

Implement the Vercel Cron → Trigger.dev migration end to end. This is a minimal "ticker swap" — you are **not** rewriting the scanner, RPCs, or dispatch chain. You are only replacing what calls `/api/cron/scan` every minute: Vercel Cron goes out, a Trigger.dev scheduled task comes in. The Vercel ↔ Trigger.dev integration gets connected so both ship atomically on `git push`.

Hard cutover. No parallel run. No feature flag.

## Why this matters

Vercel Cron has no retries, no run history, no failure alerts. When the scanner silently fails today, we only find out because a user reports their trigger didn't fire. Trigger.dev gives us proper per-run observability, retries, and atomic deploys. It also unblocks a future larger refactor (Option B, deferred) without committing to it now.

The whole point of this migration is reversibility and low blast radius — the scanner logic is untouched so any regression is caught by the existing infrastructure, and a single PR revert fully restores the old state.

## Files to read first (in this order)

1. **Implementation plan (primary):** `docs/product/plans/2026-04-10-001-feat-migrate-vercel-cron-to-trigger-dev-plan.md` — 4 phases, acceptance criteria, pre-merge gates, rollback path. This is your source of truth.
2. **Origin requirements doc:** `docs/product/ideations/2026-04-10-vercel-cron-to-trigger-dev-requirements.md` — the product decisions (Option A vs B, hard cutover rationale, why thin HTTP caller not in-process).
3. **Current scanner route:** `app/api/cron/scan/route.ts` — understand what you're calling. Note: it's **GET only**, uses `Authorization: Bearer ${CRON_SECRET}`, returns `{ success, claimed, dispatched, staleReleased, errors }`, and has `maxDuration: 45`.
4. **Current cron config:** `vercel.json` — the `crons` block you will remove.
5. **Trigger.dev config:** `trigger.config.ts` — already exists at repo root with project `proj_fdrfhuxanxwihenznuox`. Don't modify it.
6. **Init boilerplate to delete:** `src/trigger/example.ts` — delete in the same commit as your new task file. Do not leave it in place.
7. **Env schema:** `src/lib/env.ts` — Zod schema. You'll add one optional entry.
8. **CLAUDE.md** at the repo root — conventions (TypeScript, Zod v4, ShadCN, no `@google/genai`, commit message format, YAGNI rules).

## What's already been set up

- `npx trigger.dev@latest init` has been run. `trigger.config.ts`, `src/trigger/example.ts`, `.trigger` in `.gitignore`, and `tsconfig.json` references are in place.
- `@trigger.dev/sdk@4.4.3` and `@trigger.dev/build@4.4.3` are installed.
- The Trigger.dev cloud project exists (`proj_fdrfhuxanxwihenznuox`) and the user is logged in.
- `CRON_SECRET` is already set in Vercel production.
- Sunder does **not** use Supabase preview branching — the Vercel integration's env-sync-vs-branching warning in the Trigger.dev changelog does not apply.

## Pre-merge gates (MUST be green before the PR lands)

These are hard blockers. Do not merge until all three are satisfied:

1. **Trigger.dev paid tier active.** The task fires at 1/minute = **43,200 runs/month**. Trigger.dev's free tier is 5,000/month — you will exhaust it in under 4 days. Before doing any work, confirm with the user that `proj_fdrfhuxanxwihenznuox` is on the paid developer plan (or higher). If not, stop and raise the billing question.
2. **Phase 3 integration connected.** The Vercel ↔ Trigger.dev integration must be live in both dashboards before the code PR merges, otherwise the cutover will ship without a ticker. Phase 3 is dashboard-only work — it cannot be committed to the repo.
3. **Revert dry-run performed.** On a test branch, verify that reverting the PR cleanly restores Vercel Cron *and* deactivates the Trigger.dev task on redeploy.

## Execution phases

### Phase 1: Task file + env wiring (code PR)

**Create** `src/trigger/scan-triggers.ts`:

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
  maxDuration: 60, // scanner route is capped at 45s internally
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

**Delete** `src/trigger/example.ts` in the same commit.

**Edit** `src/lib/env.ts` — add to the server Zod schema (follow the existing optional pattern used for `CRON_SECRET`):

```ts
TRIGGER_SECRET_KEY: z.string().min(1).optional(),
```

Leave `CRON_SECRET` as-is — it's already optional in the schema and enforced at runtime by `requireCronSecret` in `src/lib/triggers/route-auth.ts`. Don't touch that file.

**Edit** `vercel.json` — remove the `crons` block. Final state:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "outputDirectory": ".next",
  "regions": ["sin1"]
}
```

**Verify Phase 1:**
- `npx tsc --noEmit` clean
- Lint clean
- `npx trigger.dev@latest dev` discovers the new `scan-triggers` task and registers it in the dev environment

### Phase 2: Local dev ergonomics (same PR)

Add `concurrently` as a dev dep and a new script so developers who need the scanner firing locally can run both processes from one command:

```bash
pnpm add -D concurrently   # or npm install -D concurrently
```

Add to `package.json` scripts:

```json
"dev:all": "concurrently -n next,trigger -c cyan,magenta \"npm run dev\" \"npx trigger.dev@latest dev\""
```

**Do not modify** the existing `dev` script. Developers who don't need the task runner running locally shouldn't pay the startup cost.

**Verify Phase 2:**
- `npm run dev:all` starts both processes and both print ready logs
- `npm run dev` standalone still works exactly as before

### Phase 3: Vercel ↔ Trigger.dev integration (dashboards only)

This phase cannot be committed. Perform it in the Trigger.dev and Vercel dashboards **before merging** the Phase 1-2 PR. Changelog reference: https://trigger.dev/changelog/vercel-integration

1. **Trigger.dev → GitHub integration:** Trigger.dev Settings → Integrations → GitHub → connect the `Sethzy/neobot_next` repo.
2. **Trigger.dev → Vercel integration:** Trigger.dev Settings → Integrations → Vercel → connect the Sunder Vercel project.
3. **Env var sync config — production only:**
   - Pull Vercel env vars into Trigger.dev before build: **enabled**
   - Push `TRIGGER_SECRET_KEY` back to Vercel: **enabled**
   - Auto-discover new envs: **enabled**
4. **Atomic deploys:** enabled for production (default). Leave preview sync **disabled** for now — revisit only if Sunder adopts Supabase preview branching later.
5. **Verify Phase 3:** trigger a redeploy of the current `main` (no code change). Confirm:
   - Trigger.dev build runs as part of the Vercel build pipeline
   - `TRIGGER_SECRET_KEY` appears in Vercel production env vars without manual paste
   - Trigger.dev dashboard shows a production deployment matching the Vercel commit SHA

### Phase 4: Cutover + verification

1. Merge the Phase 1-2 PR. Integration from Phase 3 must already be live.
2. Within 3 minutes of deploy, verify in the Trigger.dev dashboard:
   - `scan-triggers` shows at least 1 successful run (first fire happens at the next cron minute boundary after deploy completes)
   - The run's return value shows `{ success: true, claimed, dispatched, staleReleased, errors: [] }` — zero counts are fine, they just mean no triggers were due at that tick.
3. Verify in the Vercel dashboard: **Project Settings → Cron Jobs is empty.** No `/api/cron/scan` entry.
4. Verify in Supabase logs: `claim_due_triggers` RPC continues to be called at ~1/minute (same baseline as before migration).
5. Observe for 15 minutes with no scanner errors in the Trigger.dev dashboard → cutover complete.

## Files you MUST NOT touch

The scanner architecture is out of scope. Do not modify:

- `app/api/cron/scan/route.ts`
- `app/api/trigger/run/route.ts`
- `src/lib/triggers/scanner.ts`
- `src/lib/triggers/executor.ts`
- `src/lib/triggers/route-auth.ts`
- `trigger.config.ts` (already correct — don't touch project ID or retries config)
- Any migration under `supabase/migrations/`
- Any `agent_triggers`, `thread_queue_records`, or RPC functions

If you find yourself wanting to refactor the scanner, stop. That's Option B and it's explicitly deferred in the origin ideation. This PR stays small.

## Gotchas and non-obvious things

1. **The scanner is GET only.** Do not POST to `/api/cron/scan`. It's `export async function GET(request: Request)`. A POST will 405.
2. **`@trigger.dev/sdk/v3` import path is correct even on SDK v4.x.** The `/v3` is the API export path, not the package version. Don't "fix" it to `/v4` — that doesn't exist.
3. **`CRON_SECRET` is `.optional()` in the Zod schema** but enforced at runtime by `requireCronSecret()`. Do not promote it to `.min(1).required()` — that would break local dev where it's unset.
4. **Trigger.dev tasks run in Trigger.dev's runtime, not Vercel's.** The task's `fetch` goes over public HTTPS to `https://${NEXT_PUBLIC_APP_URL}/api/cron/scan`, not through Next.js internals. Make sure `NEXT_PUBLIC_APP_URL` is set in Trigger.dev's env (the integration will sync it).
5. **Trigger.dev's retry config** (`trigger.config.ts`) defaults to 3 attempts with exponential backoff (1s → 10s). The scanner's stale-claim window is 15 minutes (`release_stale_trigger_claims(15)`), so there's no risk of a retry racing a stale claim release. Don't change either.
6. **Langfuse / OpenTelemetry context is NOT inherited** by the Trigger.dev task. That's fine — the task itself doesn't need LLM tracing; Trigger.dev's native run history is the observability for the tick. Langfuse continues to own LLM tracing inside agent runs because those still execute inside Vercel function invocations driven by `/api/trigger/run`.
7. **Commit convention:** `feat(cron): migrate scanner ticker to trigger.dev` (or similar). Not a numbered PR from the v2 phasing plan, so no `pr<N>` tag. See CLAUDE.md for the rule.

## Acceptance criteria

See the plan file's "Acceptance Criteria" and "Pre-merge gates" sections. Summary:

- [ ] `src/trigger/scan-triggers.ts` exists and is a minute-cadence `schedules.task`
- [ ] Task GETs `/api/cron/scan` with `Authorization: Bearer ${CRON_SECRET}`
- [ ] `vercel.json` has no `crons` block
- [ ] `src/trigger/example.ts` deleted
- [ ] `TRIGGER_SECRET_KEY` added to `src/lib/env.ts` Zod schema (optional)
- [ ] `npm run dev:all` works; `npm run dev` unchanged
- [ ] Vercel ↔ Trigger.dev integration connected with env var sync enabled for production
- [ ] `TRIGGER_SECRET_KEY` appears in Vercel prod env vars without manual paste
- [ ] Post-deploy: scanner tick visible in Trigger.dev dashboard within 3 minutes
- [ ] Post-deploy: Vercel dashboard shows no cron jobs
- [ ] Typecheck clean, lint clean, smoke tests pass, pre-merge gates green

## Rollback

If anything breaks in Phase 4: **revert the migration PR.** That's the entire rollback plan.

On redeploy, two things happen in lockstep (because of the Vercel integration):
1. Vercel re-enables the cron entry and resumes ticking `/api/cron/scan`
2. Trigger.dev sees the task file is gone and deactivates the `scan-triggers` schedule automatically — no manual cleanup in either dashboard

Leave the Vercel ↔ Trigger.dev integration connected either way. It's inert if no Trigger.dev tasks exist in the repo, and you'll want it next time.

## If you get stuck

- **Before starting:** confirm with the user that the Trigger.dev paid plan is active. Do not proceed on the free tier.
- **During Phase 3:** if the Vercel integration setup hits the "Supabase branching" warning from the changelog, stop and ask — the plan assumes Sunder doesn't use branching, and if that changed recently, the env sync strategy needs to change.
- **During Phase 4:** if `scan-triggers` doesn't fire within 3 minutes of deploy, check Trigger.dev dashboard first (deployment status), then Vercel build logs (did the integration actually build the task?), then `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` in Trigger.dev's env panel.
- **For any scanner logic question:** you shouldn't need to touch the scanner. If you think you do, you're probably drifting into Option B. Re-read the origin ideation's "Option A only" scope boundary and ask the user.

## What you're NOT doing

(Keeping scope tight — these are explicitly not in this PR.)

- Not moving agent execution into Trigger.dev (that's Option B, deferred)
- Not adding per-trigger Trigger.dev schedules
- Not adding new trigger types
- Not changing `agent_triggers`, RPCs, or any database state
- Not adding Langfuse instrumentation to the Trigger.dev task
- Not wiring up Supabase preview branching
- Not modifying `trigger.config.ts` (retry config, project ID, directories)
- Not adding a feature flag or env toggle

If a task in front of you seems to need any of the above, you've gone off-scope. Stop and ask.
