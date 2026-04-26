# Handover — Re-run T01–T27, hunt edge cases, report, fix

You are picking up the second pass on the tool-sweep QA. The first pass was a single run-through of every test prompt in `checklist.json`. Your job is to **harden** that pass — replay every test, push past the happy path, write a structured report of what you find, then fix what's worth fixing.

The first pass found **5 real bugs and 1 config gap** in 27 tests. The remaining 16 tests (T28–T43) and 7 page checks (PG01–PG07) have not been touched. **Do not start those.** Stay on T01–T27 — depth, not breadth.

---

## Repo + branch

- Repo root: `/Users/sethlim/Documents/sunder-next-migration-20260225`
- Branch: `feat/twenty-aesthetic-clone`
- Dev server: should already be running at `http://localhost:3000`. If not: `pnpm dev` from repo root.
- Test creds: `limzheyi1996@gmail.com` / `123456`

## Read these first (in order)

1. **`docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json`** — every test entry has `chat_prompt`, `expected_tool_card`, `side_effect_check`, plus a `notes` field with the first pass's findings. **Read the notes for every T01–T27 entry before re-testing it** — that's where the edge cases will hide.
2. **`docs/product/tasks/2026-04-25-crm-tool-bugs-from-qa-tasklist.md`** — the original bug tasklist. PR-A.1, PR-D.2, PR-E are marked done. PR-A.2 (silent drop), PR-A.3 (status), PR-A.4 (filter allowlist), PR-B (search/dedup), PR-C (renderer), PR-D.3 (UI hardening), PR-E.2 (description sweep) are still open.
3. **`docs/product/tasks/2026-04-26-attach-and-eval-bugs-tasklist.md`** — PR-F (attach allowlist) and PR-G (eval/runner finalization) marked done; verification re-tested live and live.
4. **`/tmp/sunder-qa/issues/`** — five repro markdown files. Read them. They name file paths and root-cause hypotheses.
5. **`CLAUDE.md`** at repo root — project rules. **The Haiku-only-for-testing rule is non-negotiable.**

## Hard rules — same as last time

- **Model: Haiku 4.5 only.** Every chat turn under `anthropic/claude-haiku-4-5`. No Sonnet, no Opus. Cost discipline.
- **Real browser only.** Drive everything through `agent-browser` (CLI at `/opt/homebrew/bin/agent-browser`). Snapshot → ref → interact → re-snapshot. **No curl-only verification. No `evaluate` JS hacks to bypass UI.**
- **Screenshots at every step.** Save under `/tmp/sunder-qa/`. The checklist already names them per test.
- **Console errors are failures.** Watch for any red error in the browser console; treat as a failure unless reproducible on `main`.
- **Don't actually send external messages or complete OAuth.** (Same rules as before — only matters if you also touch T36/T37/T42.)

## What "re-run + edge cases" means in practice

For each test T01–T27:

### Step A — Replay the canonical prompt
Send `chat_prompt` exactly as written in `checklist.json`. Verify it now matches the recorded `result` in the notes — `pass` should still pass, `fail` should still fail. **If something flipped, that's interesting — investigate.**

### Step B — Push past the happy path
For every test, also try at least 2 of these where it makes sense:
- **Empty / missing input.** Prompt with vague phrasing ("create a contact" with no name/email — what does Haiku do?).
- **Malformed input.** Wrong field names, wrong types, extra fields the schema doesn't know about.
- **Boundary input.** Names with apostrophes (`O'Brien`), unicode (`日本`), very long strings (>500 chars), emoji, multiple spaces, leading/trailing whitespace.
- **Conflicting input.** Both `name` AND `first_name` in `create_record`. Both `emails[]` AND `email`. See if the silent-drop bug from T03 ALSO applies in the conflict case.
- **Stale data.** Send a prompt that references something the agent shouldn't know (e.g., a contact id from another client) and watch for RLS leakage.
- **Multi-call sequencing.** Chain two test prompts in one turn (e.g., create + immediately update + immediately search). Often surfaces stale-cache / index-refresh bugs.
- **Per-tool weirdness.** Read the existing `notes` for the test and try the specific edge case the first pass implied. Examples below.

### Step C — Targeted edge cases per test (start here, then go deeper)

| Test | Edge case to try |
|---|---|
| T01 `getCrmConfig` | Run on a fresh client with no config row — does it return defaults? |
| T02 `configureCrm` | Now that boolean shipped, try string `"true"` / `"1"` / `"yes"` as `default` — does the validator coerce or error cleanly? |
| T03 `createRecord` | Confirm the silent drop is still there (last seen: yes). Try `O'Brien`, unicode names, both `name` AND `first_name` set together. |
| T04 `updateRecord` | Try updating a `qa_test_flag` to a value not in the select options — does the validator reject? |
| T05 `searchCrm` | Search by partial name (`QA`), by case-mismatch (`qa bot`), by company name. |
| T06 `linkRecords` | Try linking a contact to a non-existent company id. |
| T07 `createInteraction` | Try `duration_minutes: 0`, negative, or null. |
| T08 `createTask` | TZ check — first pass found 06:00 UTC instead of 07:00 UTC for "3pm SGT". Reproduce, then check the source of the offset. |
| T09 `updateTask` | Confirm `status` field still missing (last seen: yes). Try `due_date` change instead — does that work? |
| T10 `manageViews` | Try saving a view with a *core* column filter (e.g., `type = "buyer"`) — should work. Then try a custom_field filter — should fail (until PR-A.4 ships). |
| T11–T14 (attachments) | After PR-F, retest with `text/csv`, `text/markdown`, `application/json`, `image/png`. Also try uploading a file the storage layer rejects. |
| T15 `deleteRecords` | Try deleting a record that doesn't exist. Try deleting 10 in one approval. |
| T16 `storageWrite` | Try writing to a path with `..` in it (RLS / path-traversal check). Try writing a 1MB string. |
| T17 `storageRead` | Try reading a non-existent path. Try negative line indices. |
| T18 `getAgentDbSchema` | Verify it doesn't leak system tables (`auth.*`, `storage.*`). |
| T19 `runSql` | **Critical RLS test.** Try `SELECT * FROM contacts WHERE client_id != '<your client_id>'` — must return zero rows. Try `INSERT`, `UPDATE`, `DELETE` — should be rejected (read-only). Try `pg_sleep(60)` — should be rate-limited. |
| T20 `manageTodo` | Add 50 items in one call. Try empty title. |
| T21 `listTodo` | Run on a thread with no todos. |
| T22 `renameChat` | Try a 500-char title. Try empty string. Try emoji. |
| T23 `webSearch` | Try a query with no results. Try a non-English query. |
| T24 `webScrape` | Try a 404 URL. Try a JS-heavy SPA that needs render. Try a non-HTTPS URL. |
| T25 `calculateDriveTime` | Currently blocked on missing `GOOGLE_MAPS_API_KEY`. Add the env var first if you want to verify. |
| T26 `searchMarketData` | Confirm the town-filter bug is still there. Try `flat_type`, `block`, `street_name` filters — do those work, or are they all silently dropped? |
| T27 `searchMeetings` | Filter by date range. Filter by a contact id. Run on a thread with zero meetings. |

## Edge case categories worth pattern-matching across all tools

When you find something weird, ask: **does this same shape exist in other tools?**

The first pass identified two recurring patterns:

1. **Silent input drop** (schema accepts a field, handler ignores it). Confirmed in `create_record` (T03 — `name`, `emails`) and `search_market_data` (T26 — `town`). **Sweep every CRM/market/web tool for the same shape.**
2. **Tool description ambiguity** (a noun in the description tricks the LLM into wrapping/reshaping the input). Already fixed for `configure_crm` (PR-E). PR-E.2 in the tasklist asks for a project-wide audit of every tool's description for similar wording traps — your retest is a good chance to flag any that bite Haiku in practice.

## What to write — the report doc

After the retest, write your findings to:

`/Users/sethlim/Documents/sunder-next-migration-20260225/docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/RETEST-REPORT.md`

Structure:

```markdown
# Tool Sweep — Re-test Report (T01–T27)
**Run date:** YYYY-MM-DD
**Model:** claude-haiku-4-5
**Reviewer:** <your name>

## Summary
- Re-tested: N/27
- Confirmed broken (still): list IDs
- Confirmed fixed: list IDs
- Newly flipped (was pass, now fail OR was fail, now pass): list IDs with explanation
- New edge-case bugs found: list with severity

## Per-test details
For each test where the result CHANGED, or where you found a new edge-case bug, write a short paragraph:
- What you tried beyond the canonical prompt
- What happened
- Whether it's a regression, a new bug, or an existing bug newly characterised
- Link to a repro file at `/tmp/sunder-qa/issues/<TID>-<slug>.md` (write one for each new finding)

## Patterns found
Group new findings by category if you see the same shape twice. (See "Edge case categories" above.)

## Recommended next steps
Sorted by severity. Each item names: target file, suggested PR boundary, rough effort estimate.
```

## Fix what you find

After the report:

1. **Triage.** Anything `severity: high` AND `effort: small` — fix in the same PR.
2. **Group fixes by shape.** If you find 3 silent-drop bugs in CRM tools, ship them together as one PR (same review, same regression-test surface).
3. **One-PR-per-tool only when shapes are unrelated.** Don't blow up the diff for unrelated work.
4. **Re-test after each fix.** Run the original test prompt + at least one of your new edge cases through Haiku again. Flip the JSON entry to `result: "pass"` only when both the canonical and edge case work.

## Don't do these things

- Don't switch the model away from Haiku.
- Don't skip ahead to T28–T43 — depth on T01–T27 is the whole point of this pass.
- Don't approve external sends in T42 if you stumble onto it.
- Don't complete OAuth in T36 / T37.
- Don't commit anything destructive without the user's confirmation.
- Don't rewrite the repro files in `/tmp/sunder-qa/issues/`. Add new ones; preserve old ones for diff history.

## What "done" looks like

- Every entry T01–T27 in `checklist.json` has either:
  - `result` flipped if behaviour changed, OR
  - a `notes` append starting with `RETESTED YYYY-MM-DD:` describing the edge cases tried and the outcome.
- `RETEST-REPORT.md` exists and is structured as above.
- All NEW bug repros in `/tmp/sunder-qa/issues/` follow the same naming `T<NN>-<short-slug>.md` pattern.
- Existing tasklists updated with any new findings (add a sub-bullet under the matching PR letter, or a new PR letter if the shape is genuinely new).
- Last `pnpm test` run is green for any new tests you added (unrelated existing failures don't count, but document them in the report).

Good luck. Hand back: filled JSON + `RETEST-REPORT.md` + the issues folder.
