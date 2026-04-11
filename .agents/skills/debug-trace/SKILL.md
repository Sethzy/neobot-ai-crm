---
name: debug-trace
description: Debug a Sunder agent bug by pulling the Anthropic managed-agent session history for a thread visible in a screenshot. Paste a screenshot of the bug + describe what's wrong, and this skill resolves the session, prints the event timeline, shows tool calls/errors, and helps troubleshoot.
user_invocable: true
---

# Debug Trace

You are debugging a bug the user encountered while testing Sunder in dev. The user will paste a screenshot of the chat UI and describe the problem. Your job is to pull the managed-agent session history, show what happened, and troubleshoot together.

## Step 1: Extract the thread ID

Look at the screenshot URL bar. The thread ID is the UUID in `localhost:3001/chat/<threadId>`.

If the screenshot already shows a `sesn_*` id somewhere, you can use that directly instead.

## Step 2: Pull the managed-agent session timeline

The helper script accepts a thread id, session id, or full chat URL. It resolves `conversation_threads.session_id` via Supabase when needed, then fetches:

- `client.beta.sessions.retrieve(sessionId)`
- `client.beta.sessions.events.list(sessionId)`

Run:

```bash
source .env.local && pnpm tsx scripts/debug-trace/fetch-events.ts "<THREAD_ID_OR_SESSION_ID_OR_CHAT_URL>"
```

The output is the raw trace timeline. Show that first before you analyze it.

## Step 3: Read the timeline

The report is organized into:

1. Session summary
2. Timeline
3. Final agent message

Focus on these event pairs and signals:

- `user.message` / `agent.message`
- `agent.custom_tool_use` / `user.custom_tool_result`
- `agent.tool_use` / `agent.tool_result`
- `agent.mcp_tool_use` / `agent.mcp_tool_result`
- `span.model_request_start` / `span.model_request_end`
- `user.tool_confirmation`
- `session.error`
- `session.status_idle` and `session.status_terminated`

What to extract from the report:

1. Step sequence: what happened, in order
2. Tool calls: tool name, summarized input, summarized result, and any `error=true`
3. Errors: session errors, denied approvals, tool failures, `retries_exhausted`, terminated sessions
4. Token/runtime cost: use the report’s cost summary as the baseline
5. Final agent message: compare this to what the user saw in the UI

## Step 4: Analyze against the user's bug report

Compare what the session history shows vs what the user described:

- Data issue: did tools return the right records?
- Rendering issue: did the backend produce the right assistant parts but the UI render them incorrectly?
- Tool selection issue: did the agent choose the wrong tool or skip a necessary one?
- Approval issue: did a `tool_use` stall, get denied, or resume incorrectly?
- Context issue: was the wrong profile/preferences/context sent at kickoff?
- Error propagation issue: did a tool or session error happen but the UI surface the wrong thing?

## Step 5: Trace to source code

Once you identify the bug category, inspect the current post-cutover files:

| Bug type | Files to check |
|----------|---------------|
| Kickoff / context assembly | `src/lib/managed-agents/session-kickoff.ts`, `src/lib/runner/system-reminder.ts` |
| Session loop / event handling | `src/lib/managed-agents/session-runner.ts`, `src/lib/managed-agents/session-reconnect.ts`, `src/lib/managed-agents/event-translator.ts` |
| Chat entrypoint / approval continuation | `app/api/chat/route.ts`, `src/lib/managed-agents/adapter.ts`, `app/api/tool-confirm/route.ts`, `app/api/webhook/telegram/route.ts` |
| Tool logic | `src/lib/managed-agents/tools/` |
| Assistant-part persistence / delivery | `src/lib/managed-agents/events-to-assistant-parts.ts`, `src/lib/chat/messages.ts`, `src/lib/channels/deliver.ts` |
| Frontend rendering | `src/components/chat/` |
| Trigger-only bug | `src/lib/triggers/executor.ts`, `src/lib/managed-agents/spawn-trigger-run.ts`, `src/trigger/run-trigger-agent.ts`, `src/lib/managed-agents/finalize-trigger-run.ts` |

Do not point at deleted Langfuse or legacy-runner files. They are gone.

## Step 6: Propose fix

Present your findings in this order:

1. What happened
2. Root cause
3. Proposed fix

Ask the user if they want you to implement the fix.

## Browser Testing / Reproduction

When you need to reproduce a bug or test a fix in the browser, use Playwright MCP. Do not use Vercel Agent Browser for localhost.

Log in with the test account:

- Email: `limzheyi1996@gmail.com`
- Password: `123456`

Useful sequence:

1. Navigate to `http://localhost:3001`
2. Fill the login form
3. Use `browser_snapshot` to inspect DOM state
4. Use `browser_take_screenshot` to capture the visual result

## Notes

- Always show the raw timeline first before you analyze it.
- If the timeline looks correct but the UI looks wrong, focus on `src/components/chat/` and the persisted assistant parts.
- If a thread has no `session_id`, the bug may have happened before managed-agent kickoff. Check the browser console or server logs next.
- The helper script uses Anthropic + Supabase directly. It does not depend on Langfuse.
