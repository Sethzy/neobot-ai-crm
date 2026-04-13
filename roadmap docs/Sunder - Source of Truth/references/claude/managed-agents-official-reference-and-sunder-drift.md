# Anthropic Managed Agents: Official Reference Patterns vs Sunder Chat Drift

Date: 2026-04-12

## Decision

For browser chat, Sunder should default to the official Anthropic managed-agents pattern:

1. One request path owns the turn.
2. That same path streams events to the UI.
3. That same path dispatches `agent.custom_tool_use` and sends `user.custom_tool_result`.
4. That same path decides when the turn is done or paused for approval.

Sunder already has this architecture in the shared server runtime:

- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/session-runner.ts`

The main drift is the browser-only `POST /api/chat/send` + `GET /api/chat/stream` split plus `SessionChatTransport`. That split is the overengineered part. The shared runner is not.

## Source Corpus

Primary sources used:

- Anthropic docs:
  - https://platform.claude.com/docs/en/managed-agents/overview
  - https://platform.claude.com/docs/en/managed-agents/quickstart
  - https://platform.claude.com/docs/en/api/beta/sessions/events
  - https://platform.claude.com/docs/en/api/python/beta/sessions
- Anthropic cookbook pages:
  - https://platform.claude.com/cookbook/managed-agents-data-analyst-agent
  - https://platform.claude.com/cookbook/managed-agents-slack-data-bot
- Official cookbook repo, local clone:
  - `/Users/sethlim/Documents/managed_agents/README.md`
  - `/Users/sethlim/Documents/managed_agents/utilities.py`
  - `/Users/sethlim/Documents/managed_agents/data_analyst_agent.ipynb`
  - `/Users/sethlim/Documents/managed_agents/CMA_iterate_fix_failing_tests.ipynb`
  - `/Users/sethlim/Documents/managed_agents/CMA_gate_human_in_the_loop.ipynb`
  - `/Users/sethlim/Documents/managed_agents/slack_data_bot.ipynb`
  - `/Users/sethlim/Documents/managed_agents/CMA_operate_in_production.ipynb`
  - `/Users/sethlim/Documents/managed_agents/sre_incident_responder.ipynb`

Supplementary source:

- Context7 on `/anthropics/anthropic-sdk-typescript` for SDK surface sanity-checking. It was useful for SDK confirmation, but not sufficient for Managed Agents architecture. The docs and cookbooks above are the source of truth.

## What The Official Reference Actually Says

### 1. The core object model is agent -> environment -> session -> events

Anthropic's overview and quickstart are consistent on the core model:

- Agent: model, system prompt, tools, MCP servers, skills.
- Environment: cloud container template.
- Session: a running agent instance inside that environment.
- Events: the protocol between your app and the session.

This matches Sunder's mental model already.

### 2. The canonical runtime shape is one loop consuming one session turn

The cookbook entry-point notebook (`CMA_iterate_fix_failing_tests.ipynb`) shows the canonical loop:

- create session
- open `client.beta.sessions.events.stream(session.id)`
- send a `user.message`
- iterate events in one loop
- render `agent.message`
- note `agent.tool_use`
- break on `session.status_idle` where `stop_reason.type == "end_turn"`

The helper extracted into `utilities.py` is explicit:

- `stream_until_end_turn()` is the shared loop for ordinary turns
- it prints text/tool usage
- it exits only on `end_turn`
- it deliberately does not handle `requires_action`

This is the important architectural pattern: one event consumer owns the turn.

### 3. Custom tools are handled inline in that same loop

The human-in-the-loop cookbook (`CMA_gate_human_in_the_loop.ipynb`) keeps the loop inline because custom tool agents must react mid-turn:

- record each `agent.custom_tool_use`
- when `session.status_idle.stop_reason.type == "requires_action"`, inspect `event_ids`
- send `user.custom_tool_result` for each pending custom tool call
- continue the same session until the idle reason is `end_turn`

This notebook also documents a real edge case:

- `stop_reason.event_ids` can be a sliding window for parallel tool calls
- clients must dedupe event ids they already answered

That logic belongs in the single runtime loop, not in a separate UI-only subscriber.

### 4. Multi-turn UI integrations still keep one runtime owner per turn

The Slack cookbook (`slack_data_bot.ipynb`) is also simple:

- one Slack thread maps to one Anthropic session
- `events.send(user.message)` starts the turn
- `relay_stream(session_id, ...)` consumes the session stream and relays progress to Slack
- follow-up replies reuse the same session and call the same relay function

The integration surface changes, but the runtime pattern does not.

### 5. Webhooks are the production alternative for long human waits, not the default chat pattern

`CMA_operate_in_production.ipynb` and the gate notebook are clear:

- local streaming is good when everything happens in one process
- webhook-driven `session.status_idled` handling is for production workflows where you do not want to hold a connection open while humans think
- the code that responds with `user.custom_tool_result` stays the same; only the trigger changes

This is important for Sunder:

- webhook/polling is justified for triggers, external integrations, or long approval delays
- it is not a reason to complicate ordinary browser chat if browser chat wants live streaming

### 6. Public docs allow send-first-then-stream, but still assume one place owns the turn

Anthropic's public quickstart says the API buffers events until the stream attaches. So this is valid:

- send `user.message`
- then attach the stream

The cookbooks usually show stream-first-then-send in one process.

These do not conflict. The real invariant is:

- do not split tool dispatch, UI streaming, and terminal detection across unrelated consumers unless you intentionally chose a webhook/polling architecture

## Official Files To Copy Or Reference

These are the exact official files to work from.

### 1. `utilities.py`

Use for:

- the simplest possible `stream_until_end_turn` loop
- the `wait_for_idle_status` race absorber before archive/retrieve cleanup

What to copy:

- the control flow, almost line-for-line
- not the Python syntax

### 2. `CMA_iterate_fix_failing_tests.ipynb`

Use for:

- the canonical first-run managed-agents event loop
- session creation + file mounts + send + stream

What to copy:

- session lifecycle order
- event loop shape
- `end_turn` as the terminal signal for ordinary turns

### 3. `CMA_gate_human_in_the_loop.ipynb`

Use for:

- custom tool round-trip
- `requires_action` handling
- deduping `stop_reason.event_ids`

What to copy:

- keep a map of tool-use events by id
- keep a set of event ids already answered
- send `user.custom_tool_result` from the same runtime loop

### 4. `slack_data_bot.ipynb`

Use for:

- multi-turn session reuse
- relaying progress to a user-facing surface in real time

What to copy:

- one external conversation thread -> one Anthropic session
- a thin relay function over the event stream

### 5. `CMA_operate_in_production.ipynb`

Use for:

- deciding when to use webhook-driven continuation instead of live streaming

What to copy:

- only for trigger/HITL production cases where holding a live connection is undesirable
- not for standard browser chat

### 6. `data_analyst_agent.ipynb`

Use for:

- session resources
- file mounting
- output file retrieval

What to copy:

- resource mounting on session creation
- reuse of environment + agent ids

## Sunder Today

### Current browser architecture

```text
Browser useChat
  -> SessionChatTransport
    -> POST /api/chat/send
      -> persist user message
      -> get/create session
      -> send user.message
      -> after() background consumeAnthropicSession(...)
    -> GET /api/chat/stream
      -> separate read-only SSE forwarder
      -> separate finish semantics for useChat
```

Relevant files:

- `app/api/chat/send/route.ts`
- `app/api/chat/stream/route.ts`
- `src/components/chat/session-chat-transport.ts`
- `src/components/chat/chat-panel.tsx`

### What is already correct in Sunder

These parts already match the official reference shape:

- `src/lib/managed-agents/adapter.ts`
  - `runManagedAgent()` is already the right browser-chat architecture: one streaming response, one runtime owner, one call into the session runner.
- `src/lib/managed-agents/session-runner.ts`
  - `consumeAnthropicSession()` already does the right cookbook work:
  - consume events
  - dispatch custom tools
  - send `user.custom_tool_result`
  - persist approval requests
  - stop on `end_turn` / `requires_action` / failures
- `src/lib/managed-agents/session-kickoff.ts`
  - session creation, version pinning, and file resources are already aligned with the cookbook model
- `app/api/webhook/telegram/route.ts`
  - already uses `runManagedAgent()` and drains the stream, which is the right shape

### Where Sunder drifts today

#### Drift 1: browser chat split turn ownership across two request lifecycles

Current code:

- `app/api/chat/send/route.ts` sends the event and starts the background runner
- `app/api/chat/stream/route.ts` separately watches the session for UI output

Why this drifts:

- the official cookbooks keep the turn owner in one place
- Sunder split dispatch/persistence and UI streaming into different routes and different timing domains
- this created the exact race you observed: the turn can finish before the page transport that initiated the send is still alive to consume the chunks

Verdict:

- unjustified drift for browser chat

#### Drift 2: client transport complexity exists to support the split, not the product

Current code:

- `src/components/chat/session-chat-transport.ts`

What it does:

- eagerly/lazily manages thread-level SSE
- manufactures per-turn `ReadableStream`s for `useChat`
- tracks source event ids and replay state
- distinguishes approval continuation payloads
- tries to guarantee client-side subscribe-before-send

Why this drifts:

- none of this exists in the Anthropic reference
- most of this complexity is compensating for the send/stream split
- public Anthropic quickstart explicitly says the API buffers until the stream attaches, so the browser transport does not need to carry the architectural burden here

Verdict:

- unjustified drift for browser chat

#### Drift 3: `requires_action` disambiguation is duplicated across layers

Current code:

- `src/lib/managed-agents/session-runner.ts`
- `app/api/chat/stream/route.ts`

Why this drifts:

- the cookbook pattern keeps `requires_action` handling in the loop that also dispatches tool results
- Sunder duplicated stale-vs-genuine `requires_action` logic in both the real runtime and the read-only stream forwarder

Verdict:

- unjustified drift caused by dual consumers

#### Drift 4: browser chat does not use the internal path that already matches the docs

Current code:

- Telegram uses `runManagedAgent()`
- browser chat does not

Why this drifts:

- the more correct path already exists in-repo
- browser chat chose the more complicated architecture

Verdict:

- unjustified drift

## Target Sunder Architecture

For browser chat, use the same shape as `runManagedAgent()`.

```text
Browser useChat
  -> POST /api/chat
    -> authenticate + rate limit
    -> persist user message
    -> get/create session
    -> build kickoff content
    -> runManagedAgent(...)
      -> consumeAnthropicSession(...)
        -> open/consume session stream
        -> dispatch custom tools
        -> send user.custom_tool_result
        -> emit UI chunks
        -> persist approvals
        -> finalize run
```

What disappears from browser chat:

- `GET /api/chat/stream`
- `POST /api/chat/send`
- `SessionChatTransport`
- the browser-specific dual-consumer model

What stays:

- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/session-runner.ts`
- `src/lib/managed-agents/session-kickoff.ts`
- `src/lib/managed-agents/dispatcher.ts`
- `src/lib/managed-agents/session-stream-forwarder.ts`
- approval persistence and resume logic
- Telegram / trigger / webhook flows

## Files To Touch For The Migration

### Create

- `app/api/chat/route.ts`

Purpose:

- browser chat streaming POST route that wraps `runManagedAgent()`

### Modify

- `src/components/chat/chat-panel.tsx`
  - remove `SessionChatTransport`
  - switch browser chat back to the default `useChat` request/stream path
- `src/lib/managed-agents/adapter.ts`
  - likely only light extraction or request-shape cleanup
  - do not rewrite the core loop unless strictly necessary
- `app/api/tool-confirm/route.ts`
  - verify whether approval resume stays as-is or is folded into the new `/api/chat` route
- `app/api/webhook/telegram/route.ts`
  - no architectural change expected
  - keep as an internal reference that already uses the correct server path

### Retire

- `app/api/chat/send/route.ts`
- `app/api/chat/stream/route.ts`
- `src/components/chat/session-chat-transport.ts`
- the tests dedicated only to the split transport

## Internal Sunder Files That Are The Best Starting Point

If another engineer implements this, these are the in-repo files to start from:

1. `src/lib/managed-agents/adapter.ts`
   - start at `runManagedAgent()`
   - this is the closest thing Sunder already has to the official cookbook architecture
2. `src/lib/managed-agents/session-runner.ts`
   - this is the actual cookbook-equivalent runtime loop
3. `src/lib/managed-agents/session-kickoff.ts`
   - session creation and kickoff content
4. `app/api/webhook/telegram/route.ts`
   - proof that Sunder already uses the correct server-side streaming path successfully

## Drift Matrix

| Concern | Official reference | Sunder today | Keep or remove |
|---|---|---|---|
| Session object model | Agent/environment/session/events | Matches | Keep |
| File resources on session create | Cookbook standard | Matches | Keep |
| Agent version pinning | Cookbook standard | Matches | Keep |
| One runtime owner per turn | Cookbook standard | Browser path drifts | Remove drift |
| Custom tool dispatch inside same loop | Cookbook standard | Shared runner matches, browser path splits around it | Remove browser drift |
| `requires_action` handling in runtime owner | Cookbook standard | Duplicated in runner and stream route | Remove drift |
| Multi-turn session reuse | Slack cookbook standard | Matches | Keep |
| Webhooks for long HITL waits | Production cookbook standard | Matches for triggers/external flows | Keep |
| Browser-specific send/stream split | Not required by docs/cookbooks | Present | Remove |
| Client-side subscribe-before-send machinery | Not required for browser chat | Present | Remove |

## Reasons We May Need To Drift

Default assumption: no drift unless the reason is product-specific and unavoidable.

### Valid drift

These are valid, product-specific drifts:

- Supabase persistence for `conversation_messages`, `runs`, `approval_events`
- Langfuse/evaluator hooks
- multi-tenant `clientId` scoping and RLS
- explicit approval persistence/resume endpoints for web + Telegram
- Sunder-specific UI chunk translation for AI SDK / JSON render

These do not change the core Anthropic runtime pattern.

### Invalid drift

These are not good reasons to drift for browser chat:

- "we do not want to hold a function open"
  - browser chat explicitly wants live streaming
  - `runManagedAgent()` already does this
- "we need one subscriber for UI and one for tools"
  - official cookbooks do not do this
  - Sunder's own shared runner proves it is unnecessary
- "client must subscribe before send"
  - public Anthropic quickstart says the API buffers until the stream attaches
  - the browser transport does not need to be architected around this

## Implementation Guidance For The Next Engineer

Do not redesign the runtime. Reuse the runtime that already exists.

### Copy this control flow

Use this exact control-flow shape in TypeScript:

1. authenticate
2. rate limit
3. persist user input
4. get or create the Anthropic session
5. build kickoff content
6. call `runManagedAgent()`
7. return the streaming response

Inside `runManagedAgent()` keep the existing shape:

1. create run record
2. create/reuse session
3. attach uploads/resources
4. call `consumeAnthropicSession()`
5. emit UI chunks through `buildUiStreamCallbacks(writer)`
6. finalize persistence/cost/evals

### Do not copy this

Do not continue investing in:

- session-tail background workers for browser chat
- a separate `/api/chat/stream` UI relay
- browser-side SSE lifecycle orchestration
- duplicated `requires_action` detection in a read-only path

## Testing Checklist

### Unit tests to update or add

- `src/lib/managed-agents/__tests__/adapter.test.ts`
- new tests for `app/api/chat/route.ts`
- `src/components/chat/chat-panel.test.tsx`
- approval resume tests if request shapes change

### Tests that can be deleted or rewritten

- `app/api/chat/send/__tests__/route.test.ts`
- `app/api/chat/stream/__tests__/route.test.ts`
- `src/components/chat/__tests__/session-chat-transport.test.ts`
- `src/components/chat/session-chat-transport.test.ts`

### Manual checks

1. First message on a brand-new thread streams immediately.
2. Follow-up message on an existing thread streams immediately.
3. File upload on first turn mounts correctly.
4. Custom tools continue in the same streamed turn.
5. Approval-gated tools pause and resume correctly.
6. Thread navigation does not lose the first streamed response.
7. Interrupt still works.

## Bottom Line

Anthropic's official references are simple:

- one session
- one turn owner
- one event loop
- inline tool round-trip
- webhooks only when you intentionally stop doing live streaming

Sunder's reusable managed-agents runtime already follows that pattern.

Sunder's browser chat transport does not.

The clean migration is not a rewrite. It is a deletion:

- remove the browser-only send/stream split
- route browser chat through `runManagedAgent()`
- keep the shared session runner as the one true runtime
