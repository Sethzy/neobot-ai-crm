---
name: debug-trace
description: Trace a Sunder managed-agent session. Paste a chat URL, thread ID, or session ID and get the full Anthropic event timeline with tool calls, errors, and cost.
user_invocable: true
---

# Debug Trace

Trace a managed-agent session end-to-end using the Anthropic Sessions Events API. The user pastes a URL, thread ID, or session ID and you pull the timeline, diagnose what went wrong, and point to the source code.

## Step 1: Extract the ID

The user's input can be any of:
- A chat URL: `localhost:3005/chat/<threadId>` — extract the UUID
- A bare thread UUID: `7245f7eb-bfbd-4119-a667-e47b0eb9ccd5`
- A session ID: `sesn_011CZzBWbTvXtSr1SXMEZg2D`

## Step 2: Pull the trace

Run `pnpm trace` which calls `scripts/debug-trace/fetch-events.ts`. It resolves thread → session via Supabase, then fetches the full event history from the Anthropic Sessions Events API.

```bash
pnpm trace "<ID>" 2>/dev/null
```

Present the output verbatim — the user wants to see the raw timeline first.

## Step 3: Flag problems

Scan the timeline for:

| Signal | What it means |
|--------|--------------|
| `-> pending` on a CUSTOM TOOL | Tool call was never answered — session is deadlocked |
| `stop_reason=requires_action` | Session waiting for a tool result or approval that never came |
| `stop_reason=retries_exhausted` | Anthropic gave up after repeated failures |
| `error=true` on any tool | Tool handler returned an error — check the result text |
| `SESSION ERROR` | Anthropic-side error — check the message |
| `SESSION TERMINATED` | Session died — check preceding events for cause |
| Very high token counts on a MODEL REQUEST | Possible context blowup or missing cache |
| `CONTEXT COMPACTED` | Session hit context limits — check if important context was lost |

## Step 4: Trace to source code

Once you identify the bug category, check the relevant source:

| Bug type | Files to check |
|----------|---------------|
| Custom tool logic | `src/lib/managed-agents/tools/` — find the specific tool handler |
| Tool dispatch / routing | `src/lib/managed-agents/dispatcher.ts` |
| Session runner loop | `src/lib/managed-agents/session-runner.ts` |
| Stream forwarding to UI | `src/lib/managed-agents/session-stream-forwarder.ts` |
| Chat adapter / POST handler | `src/lib/managed-agents/adapter.ts`, `app/api/chat/route.ts` |
| Event translation | `src/lib/managed-agents/event-translator.ts` |
| Frontend rendering | `src/components/chat/` — message-list, message-bubble, data-stream |
| Auto-resume / thread switch | `src/hooks/use-auto-resume.ts`, `app/(dashboard)/chat/[threadId]/` |
| Approval flow | `src/lib/approvals/`, session-runner.ts approval handling |
| System prompt / agent config | `scripts/managed-agents/create-agent.ts` |
| CRM tools | `src/lib/crm/` |
| File / storage tools | `src/lib/managed-agents/tools/storage/` |

## Step 5: Propose fix

Present:
1. **What happened** — 1-2 sentences from the trace
2. **Root cause** — which file/function, what went wrong
3. **Proposed fix** — specific code change

Ask the user if they want you to implement the fix.

## Ad-hoc recovery

If the session is stuck (`requires_action` with a pending custom tool), you can unstick it:

```bash
ant beta:sessions:events send \
  --session-id <SESSION_ID> \
  --event '{type: user.custom_tool_result, custom_tool_use_id: <TOOL_USE_EVENT_ID>, content: [{type: text, text: "{\"success\":false,\"error\":\"Session recovered after client disconnect\"}"}], is_error: true}'
```
