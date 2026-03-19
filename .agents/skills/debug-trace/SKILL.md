---
name: debug-trace
description: Debug a Sunder agent bug by pulling the Langfuse trace for a thread visible in a screenshot. Paste a screenshot of the bug + describe what's wrong, and this skill pulls the full trace, shows tool calls/errors, and helps troubleshoot.
user_invocable: true
---

# Debug Trace

You are debugging a bug the user encountered while testing Sunder in dev. The user will paste a screenshot of the chat UI and describe the problem. Your job is to pull the Langfuse trace, show what happened, and troubleshoot together.

## Step 1: Extract the thread ID

Look at the screenshot URL bar. The thread ID is the UUID in `localhost:3001/chat/<threadId>`.

## Step 2: Pull the Langfuse trace

The test account is always the same:
- **Email:** `limzheyi1996@gmail.com`
- **Password:** `123456`
- **Client ID (userId in Langfuse):** `d66bc1b7-d6b0-4651-96b2-f8ee25f3708a`
- **Credentials:** loaded from `.env.local` via `--env .env.local`

Run this to get traces for that thread:

```bash
source .env.local && npx langfuse-cli --env .env.local api traces list \
  --session-id "<THREAD_ID>" \
  --order-by "timestamp.desc" \
  --limit 5 \
  --json 2>/dev/null
```

From the results, identify the **latest `sunder-chat` trace** (ignore traces with very low token counts — those are title-generation calls from `generateText`).

## Step 3: Get observations for the trace

```bash
source .env.local && npx langfuse-cli --env .env.local api observations list \
  --trace-id "<TRACE_ID>" \
  --limit 100 \
  --json 2>/dev/null
```

Parse the observations and present a clear timeline:

1. **Step sequence:** Show the GENERATION → TOOL → GENERATION flow in order
2. **Tool calls:** For each tool call, show:
   - Tool name
   - Input arguments (summarized if large)
   - Output (summarized — look for `success: false` or error fields)
   - Duration
3. **Errors:** Flag any observations where:
   - `level === "ERROR"`
   - `statusMessage` is non-null
   - Tool output contains `{ success: false, error: "..." }`
4. **Token usage:** Show prompt/completion/total tokens per GENERATION step
5. **Model output:** Show the final assistant message content from the last GENERATION

## Step 4: Analyze against the user's bug report

Compare what the trace shows vs what the user described as the bug:

- **Data issue:** Did tools return correct data? Check if `search_crm`, `run_sql`, or `calculate` returned expected results.
- **Rendering issue:** Did the model produce valid markdown/mermaid? Is the frontend rendering it correctly?
- **Tool selection:** Did the model call the right tools? Did it skip a tool it should have used?
- **Hallucination:** Did the model make up data not present in tool results?
- **Context issue:** Was the system prompt missing something? Was the context too large/truncated?
- **Error propagation:** Did a tool error get swallowed silently?

## Step 5: Trace to source code

Once you identify the bug category, look at the relevant source:

| Bug type | Files to check |
|----------|---------------|
| Tool logic | `src/lib/runner/tools/` — find the specific tool factory |
| System prompt | `src/lib/ai/system-prompt.ts` |
| Chat route / streaming | `app/api/chat/route.ts` |
| Runner orchestration | `src/lib/runner/run-agent.ts` |
| Frontend rendering | `src/components/chat/` — message rendering, markdown, mermaid |
| View/surface rendering | `src/lib/views/` and `src/components/views/` |
| CRM data | `src/lib/crm/` — schemas, queries |

## Step 6: Propose fix

Present your findings:
1. **What happened** (1-2 sentences from the trace)
2. **Root cause** (which file/function, what went wrong)
3. **Proposed fix** (specific code change)

Ask the user if they want you to implement the fix.

## Browser Testing / Reproduction

When you need to reproduce a bug or test a fix in the browser, use **Playwright MCP** (not Vercel Agent Browser — that's a remote service and can't reach localhost).

Log in with the test account:
- **Email:** `limzheyi1996@gmail.com`
- **Password:** `123456`

Useful sequence:
1. `mcp__playwright__browser_navigate` → `http://localhost:3001`
2. Fill login form with test credentials
3. `mcp__playwright__browser_snapshot` to inspect DOM state
4. `mcp__playwright__browser_take_screenshot` to capture visual state

## Notes

- Always show the raw trace timeline first before analyzing — the user wants to see what happened.
- If the trace shows no errors but the output looks wrong, focus on the model's final generation and what data it had available.
- If you can't find the trace (e.g., the message failed before hitting the runner), check the browser console or Next.js server logs instead.
- The `--env .env.local` flag loads LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY automatically.
