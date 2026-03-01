# Savoir Extraction Guide — What to Copy from `vercel-labs/knowledge-agent-template`

> **Date:** February 25, 2026
> **Status:** Approved extraction targets. Three patterns, not a fork.
> **Source repo:** `https://github.com/vercel-labs/knowledge-agent-template`
> **Sunder stack (unchanged):** React 19 + Vite 7 + Tailwind 4 + ShadCN + TanStack | Supabase (DB + Storage + Auth + Realtime) | Vercel (hosting + Sandbox) | Trigger.dev | OpenRouter via Vercel AI SDK

---

## Why Extraction, Not Fork

Savoir is a read-only docs chatbot built on Vue/Nuxt + NuxtHub + Better Auth. Sunder is a read-write autonomous agent on React + Supabase. Wholesale fork means rewriting ~80% of the codebase while losing our existing React frontend (landing, auth, dashboard already built) and Supabase RLS tenant isolation.

Three patterns are worth extracting. Everything else we build ourselves.

---

## Extraction 1: Question Routing (`routeQuestion`)

### What it does

Classifies every inbound question by complexity using a cheap model, then returns the right model + step budget. Prevents expensive models from handling trivial questions.

### Where to find it

```
packages/agent/src/router/route-question.ts    — main function
packages/agent/src/router/agent-config.ts       — schema + defaults (complexity levels, model mapping, maxSteps)
packages/agent/src/router/prompts.ts            — ROUTER_SYSTEM_PROMPT
```

### Savoir's implementation

```
Complexity levels:  trivial | simple | moderate | complex
maxSteps mapping:   4      | 8      | 15       | 25
Model mapping:      gemini-3-flash | gemini-3-flash | claude-sonnet-4.6 | claude-opus-4.6
Router model:       google/gemini-2.5-flash-lite (cheap classifier)
Fallback default:   moderate / 15 steps / claude-sonnet-4.6
```

Uses Vercel AI SDK `generateObject()` with a Zod schema to get structured classification output.

### How to adapt for Sunder

Create `src/lib/llm/route-question.ts` in your codebase. Changes required:

1. **Swap model IDs to OpenRouter equivalents:**

| Savoir Model | Sunder Equivalent (OpenRouter) | Tier |
|---|---|---|
| `google/gemini-2.5-flash-lite` (router) | `google/gemini-2.5-flash` (router — cheapest available) | Router |
| `google/gemini-3-flash` (trivial/simple) | `google/gemini-2.5-flash` | Tier 1 |
| `anthropic/claude-sonnet-4.6` (moderate) | `moonshotai/kimi-k2.5` or `google/gemini-3.1-pro` | Tier 2 |
| `anthropic/claude-opus-4.6` (complex) | `anthropic/claude-sonnet-4.6` | Tier 3 |

2. **Add Sunder-specific complexity signals.** Savoir classifies based on question text alone. Sunder should also factor in:
   - Does this require CRM writes? (escalate if high-risk)
   - Does this need sandbox code execution? (escalate for compute budget)
   - Does this need approval? (force Tier 3 high-trust model)
   - Is this a trigger/autopilot pulse? (use Tier 1 default unless task requires escalation)

3. **Wire through `llm-gateway.ts`.** The router result (model ID + maxSteps) feeds into your existing gateway wrapper. Product code never sees model IDs.

4. **Use `@openrouter/ai-sdk-provider` instead of Vercel AI Gateway.** The `generateObject()` call is identical — just different provider constructor.

### Integration point

```
Runner loads context → routeQuestion(messages) → { model, maxSteps, complexity }
                                                        ↓
                                            llm-gateway.ts resolves OpenRouter model ID
                                                        ↓
                                            generateText({ model, tools, maxSteps })
```

### Estimated effort

Half a day. The function is ~100 lines. The adaptation is model ID swaps + adding Sunder-specific escalation signals.

---

## Extraction 2: Vercel Sandbox Session Management

### What it does

Manages the lifecycle of Vercel Sandbox instances: create from snapshot, pool across sessions, reuse active sandboxes, handle cleanup. Prevents cold-starting a new microVM on every request.

### Where to find it

```
apps/app/server/utils/sandbox/manager.ts        — getOrCreateSandbox(), getOrCreateSnapshot(), session pooling
apps/app/server/api/sandbox/shell.post.ts       — API endpoint for executing commands
packages/sdk/src/shell-policy.ts                — validateShellCommand() allowlist/blocklist
packages/sdk/src/tools/shell.ts                 — createBashTool(), createBashBatchTool() definitions
```

### Savoir's implementation

- `getOrCreateSandbox()` checks KV for existing session → reuses if active → otherwise boots from snapshot
- `getOrCreateSnapshot()` checks for snapshot in KV → creates from Git repo if missing
- Sessions stored in KV with TTL
- Commands validated against allowlist (read-only: `grep`, `find`, `cat`, `head`, `tail`, `ls`, `wc`, `sort`, `uniq`, `diff`, `echo`, `stat`, `file`, `du`)
- Blocked: `rm`, `mkdir`, `touch`, `chmod`, `curl`, `wget`, `git`, `ssh`, `sudo`, redirects, interpreters
- Output truncated to 50,000 chars

### How to adapt for Sunder

**This is the extraction that requires the most rewriting.** Savoir's sandbox is read-only (docs search). Sunder's sandbox is read-write (code execution, artifact generation, file processing).

Create `src/lib/sandbox/manager.ts` and `src/lib/sandbox/tools.ts`. Changes required:

1. **Replace KV session storage with Supabase.**
   - Savoir uses NuxtHub KV for session state. Use Supabase `sandbox_sessions` table instead:
   ```sql
   create table sandbox_sessions (
     id text primary key,
     client_id uuid references clients(id),
     sandbox_id text not null,
     snapshot_id text,
     created_at timestamptz default now(),
     expires_at timestamptz not null,
     status text default 'active'
   );
   ```
   - Scope sessions per `client_id` — never share sandbox instances across clients.

2. **Change the security model from read-only to read-write with guardrails.**
   - **Allow:** `python`, `node`, `npx`, `pip install`, `ffmpeg`, file writes, redirects within `/workspace/`
   - **Block:** `rm -rf /`, `curl` to external hosts (except allowlisted APIs), `sudo`, anything outside `/workspace/`
   - **Scope:** All writes confined to `/workspace/{clientId}/` directory
   - **Timeout:** 5 min default, 30 min for deep-research tasks (matches Trigger.dev task timeouts)

3. **Change the snapshot model.**
   - Savoir: one global snapshot of docs, shared across all users (read-only, no isolation needed)
   - Sunder: per-use-case snapshots with pre-installed tooling
     - `snapshot:base` — Node.js + Python + FFmpeg + common packages
     - No per-client snapshot. Client files are loaded from Supabase Storage into `/workspace/` at sandbox boot.

4. **Add file extraction.** Savoir never gets files OUT of the sandbox. Sunder needs to:
   - After code execution, upload generated artifacts (reports, HTML, CSVs) to Supabase Storage
   - Tool: `extract_file(sandbox_path, storage_destination)` — reads file from sandbox, uploads to Supabase Storage, returns signed URL

5. **Build Sunder-specific tools (not from Savoir):**

| Tool | Type | What it does |
|---|---|---|
| `sandbox_exec` | Write | Execute a script in the sandbox. Replaces Savoir's read-only `bash`. |
| `sandbox_exec_batch` | Write | Execute multiple commands. Replaces `bash_batch`. |
| `sandbox_upload` | Write | Upload a file FROM Supabase Storage INTO the sandbox `/workspace/` |
| `sandbox_extract` | Read | Download a file FROM the sandbox, upload to Supabase Storage, return signed URL |
| `sandbox_status` | Read | Check if a sandbox session is active, get remaining TTL |

### What to copy verbatim

- The `getOrCreateSandbox()` session pooling logic (check existing → reuse → boot new). Adapt storage backend from KV to Supabase.
- The output truncation pattern (50,000 char max). Keep this.
- The `createBashTool` / `createBashBatchTool` Vercel AI SDK tool registration pattern. Same `tool()` shape, different command policy.

### What to NOT copy

- `validateShellCommand()` — Savoir's read-only allowlist is wrong for your use case. Write your own policy from scratch.
- `getOrCreateSnapshot()` from Git repo — you don't clone repos. Your snapshots are pre-built base images.
- Session sharing across users — Savoir pools sandboxes across all users (safe because read-only). You MUST isolate per client.

### Integration point

```
Agent decides code execution would help
    ↓
sandbox_exec({ command: "python analyze.py", client_id })
    ↓
getOrCreateSandbox(client_id)
  → check Supabase for active session for this client
  → if exists and not expired → reuse
  → if not → boot new sandbox from snapshot:base
  → load client files from Supabase Storage into /workspace/{clientId}/
    ↓
Execute command in sandbox
    ↓
Return stdout/stderr (truncated to 50k chars)
    ↓
(Optional) sandbox_extract → upload artifact to Supabase Storage → return signed URL
```

### Estimated effort

2-3 days. The session management pattern is reusable but the security model, file I/O, and tenant isolation are all new.

---

## Extraction 3: Chat Streaming with Tool Visualization

### What it does

Streams the agent's response to the UI in real-time, including tool call names, arguments, and results as they execute. User sees "Searching for files...", "Reading middleware.md...", then the streamed answer.

### Where to find it

```
apps/app/server/utils/chat/stream.ts            — createUIMessageStream(), merges agent execution into stream
apps/app/server/api/chats/[id].post.ts          — chat API endpoint, wires routing → agent → stream
apps/app/app/components/chat/                    — Vue chat components (reference only, rebuild in React)
packages/agent/src/agents/base.ts               — createAgent() showing how streamText + tools produce stream events
```

### Savoir's implementation

- Uses Vercel AI SDK `streamText()` which emits events: `text-delta`, `tool-call`, `tool-result`, `finish`
- `createUIMessageStream()` wraps the agent execution and merges tool events + text into a single stream
- Frontend subscribes to the stream and renders tool calls in real-time
- Messages stored in DB with `parts` column (JSONB) containing tool call history

### How to adapt for Sunder

**This is a design reference, not a code copy.** Savoir's frontend is Vue. Yours is React. But the streaming protocol is the same (Vercel AI SDK), so the backend is directly portable.

#### Backend (copy + adapt)

1. **Copy the streaming pattern from `[id].post.ts`.** The flow is:
   ```
   routeQuestion(messages) → config
   createAgent({ model: config.model, tools, maxSteps: config.maxSteps })
   return agent.stream() → Response
   ```
   This maps directly to your runner. Replace `createAgent()` with your own agent invocation using `streamText()` from Vercel AI SDK.

2. **Copy the message persistence pattern.** Savoir stores messages with:
   ```typescript
   {
     id, chatId, role, parts: jsonb,  // tool calls embedded here
     model, inputTokens, outputTokens, durationMs, source, createdAt
   }
   ```
   Add `client_id` and `thread_id` to match your threading contract. The `parts` JSONB approach for storing tool call history is clean — adopt it.

3. **Copy the `createUIMessageStream()` merge pattern.** It handles the edge case where the agent makes multiple tool calls before responding with text. The merge ensures the UI gets a coherent stream.

#### Frontend (build in React, reference Savoir's design)

Use `@ai-sdk/react` (the React binding for Vercel AI SDK) instead of Savoir's Vue implementation:

```typescript
import { useChat } from '@ai-sdk/react';

// This gives you streaming + tool call events out of the box
const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
});
```

The `useChat` hook from `@ai-sdk/react` handles:
- Streaming text display
- Tool call events (you render these as status cards)
- Message history
- Loading states

Reference Savoir's Vue components for **what to render**, not how to render it:
- Tool call in progress → show tool name + "running..." indicator
- Tool result → show collapsible result panel (files read, data returned)
- Approval request → show approve/deny card (Sunder-specific, not in Savoir)
- Question card → show Guided Interview card (Sunder-specific, not in Savoir)

#### Sunder-specific stream events (not in Savoir)

Your chat stream needs to handle events Savoir doesn't have:

| Event | Trigger | UI Rendering |
|---|---|---|
| `approval-request` | Agent hits high-risk action | Approve/Deny card with action summary |
| `question-card` | Guided Interview needs user input | Pearl-style clickable option card |
| `memory-write` | Agent auto-writes to memory | Subtle "Memory updated" indicator |
| `sandbox-status` | Sandbox booting/executing | Progress indicator with command being run |
| `cost-update` | Per-run cost tracking | Running cost counter (admin/debug only) |

### Estimated effort

Backend streaming: 1 day (mostly wiring `streamText()` + message persistence).
Frontend chat with tool visualization: 3-5 days (React components, but `useChat` handles the hard parts).

---

## What NOT to Extract

For clarity, these Savoir components are irrelevant to Sunder:

| Component | Why skip |
|---|---|
| Content sync pipeline (GitHub repos → snapshot) | You don't ingest repos. Per-client files come from Supabase Storage. |
| YouTube source ingestion | Not a Sunder feature. |
| Better Auth | You have Supabase Auth with RLS integration. Better Auth loses you RLS. |
| NuxtHub (D1/KV/Blob) | You have Supabase (Postgres/Storage). More capable, already chosen. |
| Nuxt/Vue framework | You have React + Vite + TanStack. Already built. |
| GitHub bot adapter | Not a v1 channel. If you need it later, the adapter pattern is simple. |
| Discord bot adapter | Not a v1 channel. |
| Admin agent + admin tools | Your Mission Control is a different scope (CRM analytics, deal pipeline, not docs management). Build it native. |
| `webSearchTool` | You have Brave Search + Exa with your own integration. |

---

## Extraction Checklist

```
[ ] Clone vercel-labs/knowledge-agent-template locally (read-only reference)
[ ] Extract 1: routeQuestion
    [ ] Copy route-question.ts, agent-config.ts, prompts.ts
    [ ] Create src/lib/llm/route-question.ts
    [ ] Swap model IDs to OpenRouter equivalents
    [ ] Add Sunder escalation signals (CRM risk, sandbox need, approval)
    [ ] Wire into llm-gateway.ts
    [ ] Test: trivial question → Tier 1, complex question → Tier 3
[ ] Extract 2: Sandbox session management
    [ ] Copy manager.ts session pooling pattern
    [ ] Create src/lib/sandbox/manager.ts
    [ ] Replace KV with Supabase sandbox_sessions table
    [ ] Write new command policy (read-write with guardrails)
    [ ] Build sandbox_exec, sandbox_exec_batch, sandbox_upload, sandbox_extract tools
    [ ] Add per-client isolation (never share sandbox across clients)
    [ ] Build file extraction flow (sandbox → Supabase Storage → signed URL)
    [ ] Test: boot sandbox, run script, extract artifact, verify client isolation
[ ] Extract 3: Chat streaming + tool visualization
    [ ] Copy streaming pattern from [id].post.ts
    [ ] Create API route with streamText() + tool events
    [ ] Add message persistence with parts JSONB (include client_id, thread_id)
    [ ] Build React chat component using @ai-sdk/react useChat hook
    [ ] Add tool call rendering (name, status, result)
    [ ] Add Sunder-specific events (approval cards, question cards, memory indicators)
    [ ] Test: send message, see tool calls stream, see final answer stream
```

---

## Total Estimated Effort

| Extraction | Time |
|---|---|
| routeQuestion routing | 0.5 days |
| Sandbox session management | 2-3 days |
| Chat streaming + tool vis | 4-6 days (1 backend + 3-5 frontend) |
| **Total** | **~7-10 days** |

This gets you the three genuinely valuable patterns from Savoir, integrated into your existing React + Supabase stack, without the fork tax.
