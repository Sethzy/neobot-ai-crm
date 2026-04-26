# Handover — Final QA pass: regress + finish + fix

You are picking up a multi-day tool-sweep QA on the `feat/twenty-aesthetic-clone` branch. The first 27 tool tests have been run and all 6 confirmed bugs fixed under Haiku v10. Your job is the **final pass**: re-run T01–T27 to catch any regressions from the fixes, run the 16 untested tool tests T28–T43, run the 7 page-only checks PG01–PG07, and fix anything that breaks. Then tally.

---

## State of play (read this before anything else)

**Branch:** `feat/twenty-aesthetic-clone`
**Repo root:** `/Users/sethlim/Documents/sunder-next-migration-20260225`
**Pinned managed agent:** Haiku v10 (`ANTHROPIC_AGENT_VERSION_HAIKU="10"` in `.env.local`)
**Dev server:** `pnpm dev` from repo root → `http://localhost:3000`
**Test creds:** `limzheyi1996@gmail.com` / `123456`

### What's already done

- T01–T27 all retested live on Haiku v10. All 27 currently `result: "pass"` in
  `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json`.
- 6 confirmed runtime bugs fixed across 2 commits:
  - `c0e204f3 fix(managed-agents/crm): close 5 tool fails surfaced by tool-sweep QA` — T03 (alias normalisation + dedup), T05 (multi-token search), T09 (update_task status description), T10 (fresh CRM config), T26 (search_market_data description).
  - `9fbdffbb fix(managed-agents/web): buffer drive_time departureTime 30s into future` — T25.
- Earlier shipped fixes still apply: PR-A.1 boolean type, PR-D.2 approval action_type, PR-E description hardening, PR-F attach mime allowlist, PR-G eval/runner finalization.
- Repro markdowns in `/tmp/sunder-qa/issues/` document each historical bug in detail.

### What's NOT done (your scope)

1. **Regression check on T01–T27.** All passing today, but the fixes touched several handler paths. Re-run each test exactly once with the canonical prompt to confirm nothing flipped.
2. **T28–T43.** 16 tool tests — browser tools (T28–T30), Composio connections (T31–T38), triggers (T39–T41), approvals + ask-user (T42–T43). Untested.
3. **PG01–PG07.** 7 page-only checks — settings pages, meetings list/detail, long chat thread, landing footer. Untested.
4. **Fix what breaks.** Same pattern as before — small focused PRs, re-test under Haiku before flipping JSON entries.

---

## Hard rules — non-negotiable

- **Model: Haiku 4.5 only.** Every chat turn under `anthropic/claude-haiku-4-5`. No Sonnet, no Opus. Cost discipline is in CLAUDE.md.
- **Republish if you change tool descriptions or schemas.** Local code edits are not enough. Run:
  ```bash
  set -a && . .env.local && set +a && \
    node --import tsx --loader ./scripts/managed-agents/_server-only-shim-loader.mjs \
    scripts/managed-agents/create-agent.ts --model claude-haiku-4-5
  ```
  Then bump `ANTHROPIC_AGENT_VERSION_HAIKU` in `.env.local` (current = `10`, next would be `11`) and restart `pnpm dev` so it reads the new env.
- **Real browser only.** `agent-browser` (vercel-agent-browser CLI, version 0.25.4 at `/opt/homebrew/bin/agent-browser`). Snapshot → ref → interact → re-snapshot. **No curl-only verification. No `evaluate` JS hacks to bypass UI.**
- **Screenshots at every step.** Save under `/tmp/sunder-qa/`. The checklist already names them per test.
- **Console errors are failures.** Watch for any red error in the browser console; treat as a failure unless reproducible on `main`.
- **Don't actually send external messages or complete OAuth.** For T36/T37 (Notion / Google reauth) open the modal and screenshot but don't complete the flow. For T42 (sendMessage) click Reject — never Approve.

---

## How to run the regression pass (T01–T27)

Single fresh thread on Haiku per test cluster is fine. **Do not use long-running threads** — Haiku model is per-thread, and a thread started before your last republish may have a stale tool catalog.

For each test in T01–T27:
1. Send the exact `chat_prompt` from the JSON entry.
2. Watch the tool calls in the chat. Match the result against the existing `notes` (which describe what should happen post-fix).
3. If it still passes, append a one-line `RETESTED YYYY-MM-DD:` note. Don't rewrite history.
4. If it regressed, mark `result: "fail"`, write a repro to `/tmp/sunder-qa/issues/T<NN>-regression-<slug>.md`, and stop the regression pass — fix it before continuing.

This step is fast — ~2 minutes per test if nothing breaks. Budget 1 hour for the full regression sweep.

---

## How to run the new tests (T28–T43)

Use the existing per-test entries in `checklist.json` — every entry has `chat_prompt`, `expected_tool_card`, and `side_effect_check`. Same execution pattern as the first 27. Notes:

- **T28 browseWebsite** — embedded live browser. Watch the chat for an iframe / panel; it should render trysunder.com inside.
- **T29 search99co / T30 searchPropertyGuru** — these go through Browser-Use Cloud. Watch for rate limits / OAuth-required errors; document if the test environment doesn't have credentials wired up.
- **T31–T35 (Composio read/list/execute)** — should work without OAuth completion as long as a Google connection exists. If not: skip with `result: "blocked"` and a note.
- **T36 createConnection** / **T37 reauthorizeConnection** — open the OAuth modal, screenshot, **close** without completing. The repro is the modal opening cleanly.
- **T38 deleteConnection** — needs a throwaway connection. If you don't have one, mark `blocked`.
- **T39–T41 triggers** — create a daily 9am email check, list, pause. The `pulse` filter was already removed (commit d8699759), so these should work cleanly.
- **T42 requestApproval + sendMessage** — **Reject** the approval. Verify no message actually sent.
- **T43 askUserQuestion** — the agent renders an inline question, type a reply, agent should resume.

Same writeup pattern: success = update notes + flip to `pass`; failure = flip to `fail`, write repro, fix, re-test before moving on.

## How to run the page checks (PG01–PG07)

These don't need chat — just navigate + look. Each entry lists what to verify (e.g. PG01 settings/agent/general — page renders, agent-context-form saves, no console errors). Same pattern as tool tests for marking results.

---

## Pattern matching: known recurring bug shapes

When you find new failures, check if they match these shapes:

1. **Silent input drop** — schema accepts a field, handler ignores it. Examples already fixed: T03 `name`/`emails`, T26 `town`. Look for similar in any tool that takes a record-shaped input.
2. **Tool description ambiguity** — a noun in the description (`updates`, `payload`, `params`) tricks the model into wrapping inputs. Already fixed for `configure_crm`. PR-E.2 in the older tasklist asked for a project-wide audit.
3. **Stale CRM config** — config is loaded once per session; tools that read it after a configure_crm write will miss the new fields. Fixed for manage_views (T10) by re-loading at execute time. Could affect other tools that read `context.crmConfig`.
4. **Unpublished agent description** — local schema/description changes don't affect Haiku until you republish + bump `ANTHROPIC_AGENT_VERSION_HAIKU`. If you fix code but the model still misbehaves, this is the first thing to check.
5. **Past-instant timestamps** — Google APIs reject `new Date().toISOString()` as past by the time the request lands. Buffer 30s if needed (drive-time pattern).

---

## Fix workflow

For each new bug:

1. Reproduce on Haiku v10. Capture the exact tool args, error, and result.
2. Write a repro file at `/tmp/sunder-qa/issues/T<NN>-<slug>.md` with: prompt, expected vs actual, root-cause hypothesis, file paths to fix, screenshot.
3. Fix in source.
4. Run `pnpm vitest run <relevant-paths>` to confirm targeted tests pass. Existing unrelated failures are OK; document in the report.
5. **If you changed tool descriptions or schemas**, republish Haiku and bump version in `.env.local`. Restart `pnpm dev`.
6. Live re-run the failing test on the fresh agent version.
7. Flip JSON entry to `pass` with notes describing the fix + the retest evidence.
8. Commit: `fix(<area>): <one-line>` — separate commits per fix unless they're literally the same code path.

---

## Final deliverables

When you're done with this pass, the following must be true:

- [ ] All T01–T43 entries in `checklist.json` have `result` ∈ {`pass`, `fail`, `blocked`} with a non-empty `notes` field.
- [ ] All PG01–PG07 entries in `checklist.json` have a result.
- [ ] The `summary` field at the top of the JSON reads `<N>/43 tools green, <M>/7 pages green` with the actual counts.
- [ ] Every new failure has a repro at `/tmp/sunder-qa/issues/T<NN>-<slug>.md` (or PG entry).
- [ ] Anything you fixed has a small commit referenced in the matching note.
- [ ] If anything is `blocked` (env / data / OAuth gap), the note explains exactly what's missing and how to unblock.
- [ ] `pnpm vitest run src/lib/managed-agents src/lib/crm` is green for the bits you touched. Document any pre-existing unrelated failures in the report (don't try to fix them in this pass).
- [ ] Final tally posted at the top of the JSON in `summary`. Ping back with the result.

---

## Don't do these things

- Don't switch the model away from Haiku.
- Don't skip the republish step after a description/schema change.
- Don't approve external sends (T42).
- Don't complete OAuth (T36, T37).
- Don't run destructive tool calls outside the checklist.
- Don't rewrite the existing per-test `notes` from prior passes — append `RETESTED YYYY-MM-DD: ...` lines.
- Don't commit unrelated working-tree changes alongside your fixes (`git status` first).
- Don't tackle T28–T43 on a thread that was started before your last republish — start fresh threads.

---

## Quick reference

**Latest commits:**
- `9fbdffbb fix(managed-agents/web): buffer drive_time departureTime 30s into future` (T25)
- `c0e204f3 fix(managed-agents/crm): close 5 tool fails surfaced by tool-sweep QA` (T03/T05/T09/T10/T26)
- `6455b318 fix(pr-g): unblock finalization after evals` (eval false-positive + runner hang)
- `1663011d fix(pr-f): allow text CRM attachments` (T11 mime allowlist)
- `93a52568 docs(pr-e): record haiku wrapper sanity pass`
- `e5e9e510 fix(pr-e): harden managed agent tool descriptions`
- `a6bf6ecb fix(managed-agents/crm): forbid updates-wrapper in configure_crm description`
- `eba39289 fix(managed-agents/approvals): enumerate action_type values in tool description`

**Critical files (in case you need to fix things):**
- `src/lib/managed-agents/tools/crm/**` — CRM tool handlers
- `src/lib/managed-agents/tools/web/drive-time.ts` — drive time
- `src/lib/managed-agents/tools/market/search-market-data.ts` — property data
- `src/lib/managed-agents/tools/connections/**` — Composio connections
- `src/lib/managed-agents/tools/triggers/**` — automations
- `src/lib/managed-agents/tools/browser/**` — browse_website + property search
- `src/lib/managed-agents/tools/approvals/request-approval.ts` — approval gate
- `src/lib/managed-agents/tools/browser-side/**` — ask_user_question + create/reauth_connection
- `src/lib/managed-agents/session-runner.ts` + `adapter.ts` — SSE consumer / finalization
- `src/lib/eval/safety-gate-eval.ts` — eval that loosened in PR-G
- `scripts/managed-agents/create-agent.ts` — publish CLI
- `scripts/managed-agents/_server-only-shim-loader.mjs` — required loader for the publish CLI

**`agent-browser` cheatsheet:**
```bash
agent-browser open http://localhost:3000/chat
agent-browser snapshot -i --json   # get refs
agent-browser fill @e7 "user@example.com"
agent-browser click @e10
agent-browser wait 5000
agent-browser get url
agent-browser screenshot --full /tmp/sunder-qa/T01.png
agent-browser console               # capture console messages
```

Hand back: filled JSON + `RETEST-REPORT.md` (write at `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/RETEST-REPORT.md`) + the issues folder + a one-line tally in your reply.

Good luck.
