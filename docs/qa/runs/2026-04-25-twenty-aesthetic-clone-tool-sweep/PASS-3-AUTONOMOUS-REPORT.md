# Pass 3 Autonomous Run — Report

**Date:** 2026-04-30
**Driver:** Claude via agent-browser (vercel)
**Branch:** feat/twenty-aesthetic-clone
**Models exercised:** Haiku 4.5 (intended) + Sonnet 4.6 (leaked — see issues)
**Screenshots:** `/tmp/sunder-qa/pass3/`
**Issues:** `/tmp/sunder-qa/issues/`

## Tally

| Result | Count | Items |
|---|---|---|
| ✅ PASS | 6 | T43, T28, T39, T40, T41, T31, T33 |
| ⛔ BLOCKED (env) | 2 | T29, T30 |
| ⏩ N/A (retired) | 2 | T32, T34 |
| 🔁 DEFERRED to handhold | 1 | T38 |

## Per-tool detail

### ✅ T43 askUserQuestion
Agent rendered the listbox question UI with seeded stage options. Picked "leads", agent resumed and replied. Clean.

### ✅ T28 browseWebsite
Agent invoked `browse_website` (and `web_scrape`) for example.com, returned "Example Domain" H1.

### ⛔ T29 search99co
Agent invoked tool with correct args; tool returned `{"success":false,"error":"BROWSER_USE_API_KEY is not configured."}`. **Repro fix:** add `BROWSER_USE_API_KEY` to `.env.local`. See `issues/T29-T30-browser-use-key-missing.md`.

### ⛔ T30 searchPropertyGuru
Same blocker as T29. Skipped live invocation to save tokens.

### ✅ T39 setupTrigger
Created cron trigger `dbe894f1-1f16-4266-9fdb-a8af7977319b` — `0 9 * * 1` Asia/Singapore, next_fire_at 2026-05-04 01:00 UTC. Deleted at end of T41.

### ✅ T40 searchTriggers
Invoked during T39 to look up `schedule` schema. Returned full `setupSchema`/`editSchema` payload as expected.

### ✅ T41 manageActiveTriggers
Three sequential calls: `list` → `edit` (cron → Feb 31 as a disable workaround) → `delete`. All success.
- **Tool gap:** `manage_active_triggers` has no native `disable`/`pause` action. Agent had to fake it via impossible cron. Worth a `disable` action, but not a blocker.
- **DB hygiene:** user has 12+ duplicate "Morning briefing" triggers. Cleanup TODO.

### ✅ T31 listConnections
Returned 3 active integrations: Gmail, Google Drive, Notion.

### ⏩ T32 getIntegrationCapabilities — N/A
Tool exists in source but is **explicitly excluded** by `src/lib/managed-agents/tools/__tests__/declarations.test.ts:32` (`expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("get_integration_capabilities")`). Replacement is `list_composio_tools` (T33). **Action:** remove T32 from `checklist.json`.

### ✅ T33 listComposioTools
Returned 60+ Gmail actions (send/fetch/draft, labels, filters, contacts, forwarding, attachments, vacation).

### ⏩ T34 manageActivatedTools — N/A
Agent reported tool not available. Source has `manage_activated_tools_for_connections` (note suffix) which is also retired by the same test. Activation/deactivation now handled implicitly by `execute_composio_tool`. **Action:** remove T34 from checklist or rename to track `execute_composio_tool` activation semantics.

### 🔁 T38 deleteConnection — Deferred
Tool IS published (`delete_connection` in `tools/declarations.ts`). Skipped autonomous run because exercising it would destroy one of the user's 3 real OAuth connections, forcing a re-OAuth handhold. **Action:** test alongside H1/H3 in `PASS-3-HANDHOLD-CHECKLIST.md` against a disposable test connection.

## 🚨 Critical bug surfaced

### Sonnet leak on fresh threads
Full writeup: `issues/T41-sonnet-default-leak.md`

After re-login, opening `/chat` fresh and clicking "New Task" defaults the model picker to **"Claude Sonnet 4.6"**, not Haiku. First message locks the row to Sonnet — every subsequent run on that thread bills Sonnet rates.

This violates `CLAUDE.md`'s explicit "Haiku only for dev testing" rule and silently 5–10x's API spend per thread. T41 was unintentionally executed on Sonnet (~3 round-trips) before I noticed.

**Likely root cause:** the post-`0b666442` default-resolution path for new threads doesn't fall back to Haiku in dev. Worth checking `app/api/chat/route.ts` and the new-thread row insert.

**QA workaround:** click model picker → "Basic — Haiku 4.5" before sending the first message in any new thread. This was confirmed working — picker is interactive on draft threads, locked once the first message lands.

## Other notes

- Composer Submit button is unreliable — clicks intermittently don't fire. Workaround that worked consistently: click textbox → press `Meta+Enter`. Pressing plain `Enter` once caused a navigation to `about:blank` and a forced re-login. Worth investigating; not in scope here.
- Login session does not survive a hard `agent-browser open` if cookies aren't flushed cleanly — got bumped to `/login` mid-run.

## Next steps

1. **Add `BROWSER_USE_API_KEY` to `.env.local`** → unblocks T29, T30 immediately.
2. **Remove T32 and T34 from `checklist.json`** (retired tools).
3. **Triage Sonnet-leak bug** — file in tracker; this is the highest-value fix from this run.
4. **Run handhold checklist** (`PASS-3-HANDHOLD-CHECKLIST.md`) — covers T36, T35, T37, plus T38 against a disposable connection.
5. **Optional:** add `disable`/`pause` action to `manage_active_triggers` so the agent doesn't have to fake it with impossible cron.

## Coverage delta

Before this run: 27/43 tools green.
After this run: 33/43 reviewed (6 new PASS, 2 blocked, 2 N/A, 1 deferred).
Remaining for handhold: 4 (T35, T36, T37, T38). T42 still owed in regression sweep. T29/T30 unblock with one env var.
