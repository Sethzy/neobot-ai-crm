# Managed Agents Official Pattern — Handover Prompts

Four prompts to sequence the refactor across sessions. Each prompt is self-contained — paste it into a fresh Claude Code session. The dev does not need context from prior sessions; the tasklist has everything.

---

## Prompt 1: Batch A — Quick wins (Tasks 1–5)

```
Execute Tasks 1 through 5 from the tasklist at:
docs/tasks/2026-04-12-managed-agents-official-pattern-tasklist.md

Read the full tasklist first — especially the "Orientation: files you must read before starting" section. Then execute each task in order. Each task has bite-sized steps with exact file paths, code, test commands, and commit messages.

Key points:
- Tasks 1–4 are independent. Ship each as its own commit.
- Task 5 is a pure refactor (extract `buildUiStreamCallbacks` from adapter.ts into session-stream-forwarder.ts). No behavior change — existing tests must stay green.
- After Task 5, verify the extracted forwarder's interface is clean: it takes a `UIMessageStreamWriter`, returns `SessionRunnerCallbacks`, and both the legacy adapter path and a future stream endpoint can import it unchanged.
- Run `pnpm vitest run src/lib/managed-agents` after every task.
- Commit after each task with the message format shown in the tasklist.

When done, list what you shipped and any issues encountered. Do not proceed to Task 6.
```

---

## Prompt 2: Batch B — Server-side send + stream (Tasks 6–7)

```
Execute Tasks 6 and 7 from the tasklist at:
docs/tasks/2026-04-12-managed-agents-official-pattern-tasklist.md

These are the two server-side endpoints that replace the one-POST-per-turn model:
- Task 6: GET /api/chat/stream — long-lived SSE subscription per thread
- Task 7: POST /api/chat/send — fire-and-forget user message endpoint

Read the full tasklist first, then focus on Tasks 6 and 7. Task 5 (the forwarder extraction) is already complete — import `buildUiStreamCallbacks` from `src/lib/managed-agents/session-stream-forwarder.ts`.

Key decisions already made (don't re-debate these):
- The stream endpoint is read-only. Persistence belongs to the send endpoint's background worker.
- Use `after()` from `next/server` for the background persistence worker (not fire-and-forget void promises — Vercel Functions kill those after the response is sent).
- `iterateSessionEventsForever` wraps the existing `iterateSessionEvents` in a loop that re-subscribes after each idle, exiting only on abort signal.
- Two subscribers on the same Anthropic session is fine — they're read-only fan-outs.

Smoke test with curl before declaring done:
  Terminal 1: curl -N "http://localhost:3000/api/chat/stream?threadId=<t>" -H "Cookie: <auth>"
  Terminal 2: curl -X POST "http://localhost:3000/api/chat/send" -H "Cookie: <auth>" -H "Content-Type: application/json" -d '{"threadId":"<t>","message":{"role":"user","parts":[{"type":"text","text":"hello"}]}}'

Expected: stream prints agent events; send returns {"ok":true} instantly.

Ship as one commit covering both tasks. Do not proceed to Task 8.
```

---

## Prompt 3: Batch C — Client transport cutover (Task 8)

```
Execute Task 8 from the tasklist at:
docs/tasks/2026-04-12-managed-agents-official-pattern-tasklist.md

This is the client-side cutover: a custom AI SDK v6 ChatTransport that uses /api/chat/send + /api/chat/stream instead of the legacy POST /api/chat.

BEFORE WRITING ANY CODE, do this research step:
1. Read the AI SDK v6 ChatTransport interface. Use context7 MCP to query AI SDK docs for "ChatTransport interface custom transport sendMessages". Also read the types directly in node_modules/ai/dist/ or node_modules/@ai-sdk/react/dist/.
2. Understand how DefaultChatTransport works today — read src/components/chat/chat-panel.tsx to see how useChat is wired.
3. Read the tasklist's Step 8.2 through 8.2b carefully — it includes event dedup (seenEventIds Set) and optimistic user messages, both borrowed from the Vercel managed-agents starter.

Key constraints:
- Ship behind a feature flag: NEXT_PUBLIC_CHAT_TRANSPORT_MODE. Default is "legacy". Set to "session" to activate.
- The legacy transport must keep working unchanged — this flag is the rollback path.
- Test with: localStorage.setItem("sunder_chat_transport", "session") in the browser console.

Manual browser test checklist (all must pass):
- Network panel: /api/chat/stream open as long as the thread is visible
- Network panel: each send is a small POST /api/chat/send
- UI behavior: identical to legacy transport
- Send a second message while the first is still streaming — second response appends, no 409
- Click Stop — agent halts
- Navigate to another thread and back — stream re-subscribes
- Optimistic messages: user message appears instantly on enter, no flicker when real event arrives
- Event dedup on reconnect: throttle network, force reconnect, verify no duplicate text blocks

Ship as one commit. Do not proceed to Task 9 — that requires staging validation first.
```

---

## Prompt 4: Batch D — Cleanup (Task 9)

```
Execute Task 9 from the tasklist at:
docs/tasks/2026-04-12-managed-agents-official-pattern-tasklist.md

Prerequisites (verify before starting):
- The session transport (NEXT_PUBLIC_CHAT_TRANSPORT_MODE=session) has been running on staging for at least a week with no regressions.
- Tasks 1–8 are all merged to main.

This task removes the legacy chat path. There is no rollback after this — the feature flag is gone.

Step 1: Grep for every caller of the legacy path:
- "runManagedAgent(" — should only be the legacy chat route
- "create_run_if_idle" — should only be run-lifecycle + the RPC migration
- "DefaultChatTransport" — should only be chat-panel.tsx
If anything unexpected calls these, STOP and report back.

Step 2: Follow Steps 9.2 through 9.8 in the tasklist exactly.

Step 3: Run the full test suite:
  pnpm vitest run
  pnpm tsc --noEmit
  pnpm lint

Step 4: Verify exit criteria (from the bottom of the tasklist):
1. Two rapid messages on the same thread both get answered — no 409
2. Stop button halts the agent cleanly
3. Thread navigation reconnects the stream without losing events
4. Network panel shows one /api/chat/stream per visible thread, sends are small POSTs < 100ms
5. grep -r "create_run_if_idle" returns nothing except the drop migration
6. grep -r "queued" in managed-agents code returns nothing
7. All tests green, tsc green, lint green

Ship as one commit.
```
