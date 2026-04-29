# Run 3 — Final-Pass QA Handover

**You are the QA dev running this. Read this file end-to-end before you start.**

| Field | Value |
|---|---|
| Date issued | 2026-04-30 |
| Branch | `feat/twenty-aesthetic-clone` |
| Pin to SHA | run `git rev-parse HEAD` at start; record in your report |
| App URL | http://localhost:3000 |
| Browser tool | Vercel `agent-browser` CLI (use whatever interaction style you prefer — snapshot+ref, find-by-role, etc.) |
| Model under test | `claude-haiku-4-5` ONLY (cost rule, see `CLAUDE.md`) |
| Agent version | verify `ANTHROPIC_AGENT_VERSION_HAIKU` in `.env.local` matches the version Run 2 verified against (v13). If declarations have drifted, republish to v14 and **note the bump in your report** — do not silently work on a stale version |
| Test credentials | email `limzheyi1996@gmail.com`, password `123456` |
| Screenshots dir | `/tmp/sunder-qa/run-3-final/` |
| Issues dir | `/tmp/sunder-qa/run-3-final/issues/` |
| Report file you write | `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/RUN-3-FINAL-PASS-REPORT.md` |
| Time budget | 4 hours. If you hit it mid-run, stop, file what you have, submit a partial report — partial signal beats none |

## Scope

T01–T27 (happy path) + EC00–EC35 (edges including 2 new this run). Total **63 items**.

**Out of scope** (another dev owns these): T28–T43, PG01–PG07. Don't touch.

## What you read first

Two prior-run documents are the source of truth for prompts, expected behaviour, and pre-existing pass-with-note baselines. **Do not re-derive them; reference them.**

1. **`checklist.json`** — T01–T27 prompts, expected tool cards, side-effect checks, and Run 1 / Run 2 notes per item. Each entry's `notes` field is the calibration baseline.
2. **`EDGE-CASE-TEST-PLAN-T01-T27.md`** — EC00–EC35 prompts, expected behaviour, and the Run 2 results summary at the top. Five items are pass-with-note today (EC07, EC13, EC32, plus two flagged in the table); their existing notes describe *exactly* what behaviour is acceptable.

## How you run each item

For every T## and EC##:

1. Open a fresh `/chat` thread (unless the test explicitly chains, e.g. EC34's three turns or T03→T05→T06).
2. Send the prompt verbatim from the relevant doc.
3. Verify, in this order:
   - Expected tool card(s) appear and return success (or graceful error if that's the test).
   - Side-effect check passes (DB row, file content, view filter, page state, etc.).
   - Composer re-enables after the run.
   - Stop button cancels stuck runs (if you hit one). The 2026-04-30 escalation fix (`interrupt-session.ts`) is committed; if Stop fails to recover within 10 s, that's a hard fail — we regressed it.
   - Console clean — run `agent-browser console` after every cluster of ~5 tests. New red errors = automatic fail unless they match a pre-existing logged issue (link the issue in your notes if so).
4. Take a screenshot to `/tmp/sunder-qa/run-3-final/<ID>-<short-slug>.png`.
5. Record in your report (see template below).

**Run order:** T01 → T27 first (happy path, in id order), THEN EC00 → EC35 (edges, in id order). Don't interleave — a failing T-tier makes edges meaningless, and several edges depend on T-tier artifacts (e.g. EC11/EC14 use the file from T16).

## Pass criteria

For each item, mark one of:

- **pass** — tool card succeeds, side-effect verifies, composer recovers, no new console errors, no visual defects.
- **pass-with-note (matches Run-2 baseline)** — outcome diverges from spec but matches the existing pass-with-note in the prior doc verbatim. No new issue file needed; just cite which prior note it matches.
- **pass-with-note (new)** — outcome diverges from spec in a way the prior runs did not flag. Write an issue file in `/tmp/sunder-qa/run-3-final/issues/<ID>-<slug>.md` AND a one-line "why we accept this" rationale in your report. If you can't write the rationale, it's not pass-with-note — it's fail.
- **fail** — anything else. Issue file required. Tool card error, side-effect missing, composer stuck, Stop ineffective, console error you can't pin to a pre-existing issue, visual breakage, or wrong-record mutation.
- **blocked** — couldn't run the test (preflight failed, dependency not set up, etc.). Note why.

## Two new items this run (EC34, EC35)

These were added 2026-04-30 to cover agent-as-orchestrator behaviour the prior runs didn't exercise. They are **unverified before this run** — there is no prior baseline. Treat them as net-new:

- **EC34** — multi-turn correction on the same deal. Three turns, same thread, watching for context loss / duplicate records / redundant calls. Acceptance: one create + two surgical updates against the same deal_id.
- **EC35** — chain with mid-flight partial failure. One prompt, three contacts (one invalid), expects two successful creates + two links + clean error narration for the third. Hard fail if the agent silently claims full success or aborts the entire chain.

Read their full bodies in `EDGE-CASE-TEST-PLAN-T01-T27.md`.

## Report template (fill this in as you go)

Create `RUN-3-FINAL-PASS-REPORT.md` in this directory with this structure:

```markdown
# Run 3 — Final Pass Report

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Branch SHA | <git rev-parse HEAD output at start> |
| Agent version | <ANTHROPIC_AGENT_VERSION_HAIKU value; bump to v14 if you republished> |
| Dev server | http://localhost:3000 |
| Model | claude-haiku-4-5 |
| Time spent | <hours> |

## T01–T27 results

| ID | Result | Notes |
|----|--------|-------|
| T01 | pass | <one sentence> |
| T02 | pass | <...> |
... (one row per T01–T27)

## EC00–EC35 results

| ID | Result | Notes |
|----|--------|-------|
| EC00 | pass | <one sentence> |
... (one row per EC00–EC35)

## Issues filed

- `<ID>` — `<slug>.md` — one-sentence summary
- ...

## Verdict

- Hard fails: <count> / 63
- Run-2 pass-with-notes still matching their baseline: <count> / 5
- New pass-with-notes (with issue file + rationale): <count>
- Console clean across all runs: <yes/no>

**Decision:** SHIP / HOLD

**Rationale:** (required only if HOLD — one paragraph naming exactly which line of the threshold tripped)
```

## SHIP / HOLD threshold

- **SHIP** iff: `Hard fails == 0` AND `Run-2 baseline matches == 5` AND `Console clean == yes`.
- **HOLD** otherwise. Name the failing line in your rationale; route to the owning area (managed-agents, CRM, storage, web, meetings, runner).

## Operational notes

- **One run per thread**, except where the test chains. The chat is single-threaded server-side; don't open multiple windows hitting the same client.
- **Approval gates:** click `Allow` on cleanup deletes that the test asks you to allow (T15, EC20). Click `Deny` on EC19 (deny-path test). NEVER click `Allow` on a `send_message` external action — there shouldn't be one in this scope, but if you see it, that's a fail.
- **Don't pre-clean prior QA artifacts** (custom fields like `qa_test_flag`, files like `/agent/qa.txt`). Use a `qa_run3_<YYYYMMDD>_*` prefix for any new artifacts you create so they're trivially greppable in your report. Idempotency tests (EC01) explicitly rely on prior artifacts being present.
- **If the dev server hangs** (the EC00 wedge from prior runs): `pnpm dev` was prone to this on Haiku v10/v11; should be fixed by the runner refactors landed since. If you hit it, that's a hard fail on whichever EC was running, plus a separate issue file naming the wedge symptom.
- **The other dev's parallel work** lives at `docs/qa/runs/2026-04-30-product-readiness-pap-eval/`. Ignore it — different scope.

## What "QA done" means

When you submit your report:

- If verdict is **SHIP** — I merge `feat/twenty-aesthetic-clone` to `main`. Done.
- If verdict is **HOLD** — I read the rationale, route to the relevant area dev, and they fix forward. We do **not** loop you back for another full run; the next pass is a delta-only re-test of just the failing items.

You're the gate. Be honest about the threshold; don't paper over a fail to be helpful.
