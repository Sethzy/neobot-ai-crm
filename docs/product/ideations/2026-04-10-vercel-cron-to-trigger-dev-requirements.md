---
date: 2026-04-10
topic: vercel-cron-to-trigger-dev
---

# Vercel Cron → Trigger.dev Migration

## Problem Frame

Sunder's entire scheduled-job system currently runs on a single Vercel Cron entry that hits `/api/cron/scan` every minute. Two problems:

1. **Vercel Cron has no retry, no run history, no observability.** When the scanner silently fails, we find out because a user's trigger didn't fire. The Pro plan gives us 1-minute granularity but nothing else.
2. **No atomic coupling between app and job code.** If we ever add more background work (agent runs, queues, long-running jobs), Vercel Cron's "fire an HTTP request" model is a ceiling — tasks have to fit inside a Vercel function timeout.

Trigger.dev solves both: proper run history, retries, per-task observability, atomic deploys via the Vercel integration, and a clear upgrade path for when we want to move agent execution itself into managed tasks (Option B, deferred).

## Requirements

- **R1.** The scanner (`/api/cron/scan`) fires every minute in production, driven by a Trigger.dev scheduled task instead of Vercel Cron.
- **R2.** The Trigger.dev task authenticates to the scanner using the existing `CRON_SECRET` bearer token. No auth changes to `/api/cron/scan` or `/api/trigger/run`.
- **R3.** The `crons` block is removed from `vercel.json` in the same deploy that introduces the Trigger.dev task (hard cutover).
- **R4.** The Vercel ↔ Trigger.dev integration is connected so that `git push` triggers a lockstep deploy of both the Next.js app and the Trigger.dev task. No separate `npx trigger.dev deploy` step in CI.
- **R5.** `TRIGGER_SECRET_KEY` and any other Trigger.dev-managed secrets are synced into Vercel automatically via the integration, not pasted manually.
- **R6.** Rollback path: reverting the migration PR must restore Vercel Cron without manual cleanup in either dashboard.
- **R7.** Trigger.dev's dev environment (`npx trigger.dev@latest dev`) works locally against the dev Trigger.dev project so developers can test scanner ticks without deploying.

## Success Criteria

- After deploy, `claim_due_triggers` RPC continues to be called every 60s on production (verifiable via Supabase logs).
- Vercel Cron no longer appears in the Vercel dashboard for this project.
- A failed scanner run appears in the Trigger.dev dashboard with stack trace + retry history — an observable failure we didn't have before.
- A hotfix reverting the PR fully restores the previous Vercel Cron behavior on redeploy.

## Scope Boundaries

- **No changes to `/api/cron/scan`, `/api/trigger/run`, or `src/lib/triggers/` logic.** The scanner architecture is unchanged. This is a pure ticker swap.
- **No changes to `agent_triggers`, `claim_due_triggers`, `release_stale_trigger_claims`, or any RPCs.** Database layer is untouched.
- **No migration to Option B (per-trigger Trigger.dev schedules).** That's a separate, larger ideation. Option A only.
- **No changes to the dispatch chain.** The Trigger.dev task is a thin HTTP caller — it POSTs to the existing scanner route and forwards the result.
- **No new trigger types, no changes to user-facing trigger behavior.** Users do not see this change.
- **No changes to Langfuse instrumentation.** Trigger.dev's native run history is sufficient observability for the scanner tick itself.
- **`example.ts` from the Trigger.dev init boilerplate is deleted, not kept.** Only `scan-triggers.ts` ships.

## Key Decisions

- **Option A (minimal swap), not Option B (per-trigger schedules).** Rationale: Option A is ~2 hours of work and zero-risk. Option B is a 1-2 day refactor with permanent schedule-sync complexity that doesn't fit RSS/pulse triggers cleanly anyway. Option B is deferred until we have a concrete reason (cost, latency, or trigger volume).
- **Hard cutover, not parallel run or feature flag.** Rationale: `claim_due_triggers` is atomic so parallel run is safe but wasteful, and a feature flag adds permanent dead code for a one-time migration. Revert is cheap (single PR revert) and Trigger.dev's own retry handles transient failures.
- **Thin task that calls the existing HTTP route, not an in-process call to `runScan()`.** Rationale: keeps the architectural change minimal and reversible, and avoids coupling Trigger.dev's build to the Next.js app bundle. The added HTTP hop is ~50ms, negligible at 1-minute granularity.
- **Connect Vercel integration up front, don't defer it.** Rationale: without it, every deploy requires a manual `npx trigger.dev deploy` step that will get missed. Atomic deploys are the reason to use Trigger.dev on Vercel at all.
- **Keep `CRON_SECRET` as the auth token.** Rationale: `/api/cron/scan` and `/api/trigger/run` already validate this header. No new secret to provision, no changes to the auth code path.

## Dependencies / Assumptions

- **Trigger.dev project already initialized.** `trigger.config.ts` and `src/trigger/example.ts` exist from `npx trigger.dev init`. Project ID: `proj_fdrfhuxanxwihenznuox`.
- **Vercel integration requires the Trigger.dev GitHub integration to be connected first.** Per the Trigger.dev changelog, the integration pulls from the repo.
- **`NEXT_PUBLIC_APP_URL` (or equivalent) is set in Trigger.dev's env** so the task knows where to POST. This comes for free once Vercel env var sync is enabled.
- **`CRON_SECRET` is already set in Vercel prod** (confirmed in conversation research) and will sync into Trigger.dev via the integration.

## Outstanding Questions

### Deferred to Planning

- **[Affects R4][Needs research]** Does Sunder currently use Supabase preview branching? The Vercel integration changelog notes that Supabase/Neon branching for previews is incompatible with env var syncing and requires build extensions instead. If we use preview branches, we need the alternative setup path.
- **[Affects R5][Technical]** Env var sync direction: the integration can pull Vercel env vars into Trigger.dev builds AND push Trigger.dev-managed keys back. Determine which envs to sync per environment (prod/preview/dev) — should Trigger.dev preview env be wired to Vercel preview deployments, or only prod?
- **[Affects R7][Technical]** How to run `npx trigger.dev@latest dev` alongside `npm run dev` without a new process manager. Options: a `dev:all` script, concurrently, or just document "run in two terminals."

## Reference Material

- Current scanner: `app/api/cron/scan/route.ts`
- Current dispatch: `app/api/trigger/run/route.ts`
- Scanner logic: `src/lib/triggers/scanner.ts`
- Executor: `src/lib/triggers/executor.ts`
- Trigger.dev config: `trigger.config.ts`
- Trigger.dev boilerplate (to be deleted): `src/trigger/example.ts`
- Vercel integration changelog: https://trigger.dev/changelog/vercel-integration
- Existing event-driven triggers ideation (unrelated, about new trigger *types*): `docs/product/ideations/2026-04-06-event-driven-triggers-requirements.md`

## Next Steps

→ `/plan` for structured implementation planning
