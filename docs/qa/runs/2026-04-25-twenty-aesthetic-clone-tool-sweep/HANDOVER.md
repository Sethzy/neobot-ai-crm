# Handover: Tool-by-tool UI smoke for `feat/twenty-aesthetic-clone`

You are picking up a UI smoke-test pass for the recent commits on the
`feat/twenty-aesthetic-clone` branch of the Sunder repo. The previous engineer
has already mapped out every test you need to run. Your job is to execute
the checklist end-to-end through a real browser, mark each item, and write
repros for failures.

## Repo + branch

- Repo root: `/Users/sethlim/Documents/sunder-next-migration-20260225`
- Branch: `feat/twenty-aesthetic-clone`
- Dev server: should already be running at `http://localhost:3000`. If not:
  `pnpm dev` (or `npm run dev`) from repo root.

## What you must read first (in this exact order)

1. `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json` —
   the worklist. **Every `done: false` item is a TODO.**
2. `CLAUDE.md` at repo root — project rules. Pay attention to the **Haiku-only
   for testing** rule.
3. `src/lib/managed-agents/tools/declarations.ts` — canonical list of the 43
   managed-agent tools you're exercising.

## Hard rules — non-negotiable

- **Model: Haiku 4.5 only.** Every chat turn must run on
  `anthropic/claude-haiku-4-5`. Sonnet/Opus cost real money. Set the model
  via the in-app selector (Basic — Haiku 4.5) before sending the first prompt
  and verify it stays selected for the whole run.
- **Real browser only.** Drive everything through `agent-browser` (the
  Vercel agent-browser CLI, version 0.25.4 confirmed installed at
  `/opt/homebrew/bin/agent-browser`). Use the snapshot → ref → interact →
  re-snapshot loop. **No curl-only verification. No `evaluate` JS hacks to
  bypass the UI.**
- **Screenshots at every step.** All paths are pre-listed in the JSON under
  each item's `screenshot` field. Save them there.
- **Console errors are failures.** Capture the browser console; any red
  error while a tool is running counts as a fail unless the same error
  reproduces on `main` (note that fact in `notes` if so).
- **Don't actually send external messages.** For T42 (sendMessage approval
  flow), click Reject — never Approve. For T36/T37 (OAuth modals), open the
  modal and screenshot it but do not complete the OAuth flow.

## Test credentials

- Email: `limzheyi1996@gmail.com`
- Password: `123456`

## How to mark progress

For each entry in the JSON checklist:

1. Run the test exactly as described (`chat_prompt`, then verify the
   `expected_tool_card`, then verify the `side_effect_check`).
2. Capture the screenshot at the listed path.
3. Edit the JSON: set `done: true`, `result` to `"pass"` | `"fail"` |
   `"blocked"`, and put any quirks/observations in `notes`.
4. If `fail` or `blocked`, also write a repro file at
   `/tmp/sunder-qa/issues/<ID>-<short-slug>.md` containing:
   - Test ID and tool name
   - The exact prompt sent
   - Expected vs actual
   - Screenshot path
   - Any console errors verbatim
   - Your guess at the responsible file (cross-reference the recent commits
     in `git log --oneline -10` and the "Critical files" list below)
   - Link this repro file from the JSON `notes` field

## Suggested execution order (respects preconditions)

1. Pre-flight (P0–P4)
2. Storage (T16, T17) — needed by attachments
3. CRM core (T01–T15)
4. Utility (T18–T22)
5. Web/market/meetings (T23–T27)
6. Browser tools (T28–T30)
7. Connections (T31–T38) — be careful with OAuth/destructive ones
8. Triggers (T39–T41)
9. Approvals + ask-user (T42, T43)
10. Page-only checks (PG01–PG07) at the end while everything is fresh

## Critical files (for cross-referencing failures)

- `src/lib/managed-agents/tools/declarations.ts` — tool list
- `src/lib/managed-agents/tools/**` — handlers (per-tool root-cause)
- `src/lib/managed-agents/session-runner.ts` — SSE consumer
- `src/lib/ai/models.ts` — model registry (Haiku selector source)
- `src/components/chat/chat-composer.tsx` — model selector + send
- `src/components/chat/message-list.tsx` — touched in fc05650b
- `src/components/layout/app-layout.tsx` — touched in fc05650b
- `src/components/settings/agent-context-form.tsx` — touched in fc05650b
- `src/components/meetings/transcript-section.tsx` — touched in fc05650b
- `src/hooks/meetings/use-meeting-recording.ts`, `src/hooks/use-meetings.ts` — touched in fc05650b
- `src/lib/branding/site.ts` — single source of brand strings (a1cb0f59)
- `src/lib/triggers/automation-trigger-query.ts` — pulse filter removed (d8699759); regression risk on /automations list

## Useful agent-browser cheatsheet

```bash
# Open + snapshot
agent-browser open http://localhost:3000/chat
agent-browser snapshot -i --json   # get refs

# Interact
agent-browser fill @e7 "limzheyi1996@gmail.com"
agent-browser click @e10
agent-browser type @e15 "your prompt here"
agent-browser press Enter

# Verify
agent-browser get text @e23
agent-browser screenshot --full /tmp/sunder-qa/01-x.png
agent-browser console               # capture console messages
```

For sending a chat message: find the textarea ref via snapshot, `fill` it
with the prompt from the JSON, then `press Enter` (or click the send
button). Wait ~5–15s for tool calls to stream in, re-snapshot, screenshot
the resulting tool card.

## What "done" looks like

- Every entry in the JSON has `done: true` and a non-null `result`.
- Final summary at the top of the JSON file (`summary` field):
  `<N>/43 tools green, <M>/7 pages green`.
- All screenshots present in `/tmp/sunder-qa/`.
- One repro file per failure in `/tmp/sunder-qa/issues/`.
- Hand the filled-in JSON + the issues folder back.

## If something is genuinely blocked (not a bug)

Examples: no Google connection exists for T35, no meetings exist for T27/PG05,
no throwaway connection to delete for T38. Mark `result: "blocked"` and
explain the blocker in `notes`. Don't fabricate test data unless the
checklist's `preconditions` already say to.

## Don't do these things

- Don't switch the model away from Haiku mid-run "just to see".
- Don't use JS evaluation to skip past UI bugs you find — they're the point.
- Don't approve external sends (T42).
- Don't run destructive tool calls outside the checklist.
- Don't commit anything. This is read-only verification of an existing branch.

Good luck. Ping back with a tally + the issues folder.
