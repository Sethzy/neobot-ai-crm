# Handover H3: Managed Agents Migration — Adapter + Dispatcher + Evaluators

## Your job

Generate **one TDD tasklist** that covers the chat adapter, custom tool dispatcher, and evaluator refactor. Follow the tasklist generation rule already in your memory (`feedback_tasklist_generation_rule.md`). Save the output to:

```
docs/product/tasks/2026-04-10-managed-agents-h3-adapter-dispatcher-tasklist.md
```

Do NOT implement the code yourself. Your output is the tasklist. Someone else executes it.

## Big picture (60 seconds)

Sunder is migrating its custom AI agent runner to Anthropic Managed Agents. Anthropic runs the agent loop; Sunder provides tools as custom tools (per D9) executed by a chat adapter.

You are **H3**. Your job: build the adapter + dispatcher + refactor evaluators. When this ships, the new code is fully tested but NOT wired into the chat route yet. H4 will do the atomic cutover (wire it in + delete the legacy runner + delete Langfuse).

**The adapter is the replacement for `streamText()` + tool dispatch + persistence.** It consumes Anthropic's SSE event stream, translates events into the AI SDK `UIMessageStream` format (so `useChat` and all frontend components work unchanged), dispatches custom tools using the user-authenticated Supabase client (preserving RLS), and persists messages + approval events + run scores.

Critical patterns to follow live in Anthropic's own `shared/managed-agents-client-patterns.md` (load via `/claude-api` skill). Five of them directly apply to your scope:
- §1 Lossless stream reconnect (dedup + terminal gate)
- §5 Correct idle-break gate (don't break on bare `session.status_idle`)
- §7 Stream-first, then send (open stream BEFORE sending kickoff)
- §6 Post-idle status-write race (don't delete sessions on idle — applies to H5 more but good to know)
- §2 `processed_at` queued vs processed (optional polish for sending UI state)

## Files to read first (in order)

0. **Spike script (read AND run this first):** `scripts/spike/managed-agents-custom-tool-spike.ts` — working end-to-end custom tool round-trip against the real Anthropic API. Read it, then run it (`pnpm tsx scripts/spike/managed-agents-custom-tool-spike.ts`), then read the "Spike findings" section below. Understanding the exact event sequence the spike observed will save you hours of guessing at event shapes. The spike is ~350 LOC, fully typed against the installed SDK, and cleans up after itself.
1. **Plan doc:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md` — focus on:
   - Phase 2 "Chat adapter" section (your primary reference)
   - Decision Log D3, D4, D6
   - Integration Test Scenarios 1-12 (you'll write unit tests that prove the adapter supports them, even though E2E happens in H4)
   - "Tactical additions from claude-api skill verification" — 5 gotchas at the end of the decision log
2. **claude-api skill — managed agents:** run `/claude-api` in your session and load:
   - `shared/managed-agents-events.md` — event types reference
   - `shared/managed-agents-client-patterns.md` — ESPECIALLY §1, §5, §7
   - `shared/managed-agents-api-reference.md` — SDK method signatures
   - `typescript/managed-agents/README.md` — code examples
3. **Existing runner for reference:**
   - `src/lib/runner/run-agent.ts` — the current `runAgent()` entry point. You're building `runManagedAgent()` to replace it.
   - `src/lib/runner/message-utils.ts` — `buildAssistantPartsFromSteps()` shows the `PersistedPart[]` shape the DB expects. Your adapter must produce the same shape.
   - `src/lib/runner/run-persistence.ts` — `createMessages()`, `completeRun()`, `createApprovalEvent()` — reuse these helpers
4. **Existing chat route for spec-fence pattern:**
   - `app/api/chat/route.ts:374` — shows `writer.merge(pipeJsonRender(streamResult.toUIMessageStream()))`. Your adapter output goes through `pipeJsonRender` the same way.
5. **Current Langfuse evaluator code (you're refactoring this):**
   - `src/lib/eval/run-evaluators.ts` — `runEvaluatorsForTrace(traceId)` — the old entry point
   - `src/lib/eval/extract-tool-sequence.ts` — currently reads Langfuse observations, you're adding an overload that reads `Event[]`
   - `src/lib/eval/safety-gate-eval.ts`
   - `src/lib/eval/crm-hallucination-eval.ts`
   - `src/lib/eval/langfuse-api.ts` — don't delete this, H4 does
6. **Tool factories from H2:** `src/lib/managed-agents/tools/*` — the dispatcher will import these

## Spike findings (2026-04-10) — refinements to the plan below

**Before H3 scope: a real end-to-end spike was run against the Anthropic Managed Agents beta API.** Script at `scripts/spike/managed-agents-custom-tool-spike.ts`. It creates an ephemeral environment + agent + session, opens the SSE stream, sends a kickoff message that forces a custom tool call, dispatches the tool, sends back `user.custom_tool_result`, and verifies the agent reaches `session.status_idle` with `end_turn`. **All 5 assertions passed on first try. Total run time 15.6s.**

Read these findings before implementing — they are concrete facts from a working run, not guesses.

### ✅ What the spike validated (no H3 guessing needed)

- **Stream-first-then-send works.** `client.beta.sessions.events.stream(sessionId)` is called, then `events.send({events: [{type: "user.message", ...}]})` — no race, first event arrived ~670ms after send.
- **SDK auto-adds the beta header.** `managed-agents-2026-04-01` is sent automatically by every `client.beta.agents.*` and `client.beta.sessions.*` call. You do NOT need to pass `betas: [...]` manually.
- **Custom tool dispatch loop works exactly as designed.** `agent.custom_tool_use` carries `{id, name, input, processed_at}`. You send `user.custom_tool_result` with `custom_tool_use_id: event.id` and a `content` array of text blocks. The session resumes immediately.
- **Terminal gate differentiation works.** First `session.status_idle` had `stop_reason: { type: "requires_action", event_ids: [sevt_...] }` — NOT terminal, loop continued. Second `session.status_idle` had `stop_reason: { type: "end_turn" }` — terminal, loop broke. The skill §5 warning is real and the handover's terminal gate logic is correct.
- **Token usage is per-request, not cumulative.** Each `span.model_request_end.model_usage` gives `{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}` for THAT single LLM call. Session-runner must accumulate them across events, not just read the last one.
- **Initial session status is `idle`, not `running`.** When you create a session with `client.beta.sessions.create()`, `session.status === "idle"`. It transitions to `running` AFTER you send the first user message. The session-runner should not assume a fresh session is already running.
- **Cleanup contracts work.** `sessions.delete()` → `agents.archive()` → `environments.delete()` in a finally block succeeded cleanly. The skill §6 post-idle delete race did NOT fire — possibly because we waited for `end_turn` before cleanup, which is the right posture.
- **Model string `claude-sonnet-4-6` is valid** for Managed Agents.

### 🔥 The exact event sequence H3 must translate (reference)

Observed end-to-end for "How many contacts do I have named Sarah?" with one custom tool:

```
session.status_running        (after first events.send)
user.message                  (ECHO of what we sent — DO NOT re-persist, already in DB)
span.model_request_start
agent.thinking                (progress signal, no content — see note)
agent.message                 (preamble: "Let me look that up for you right away!")
agent.custom_tool_use         (name=lookup_contacts, input={query:"Sarah"}, id=sevt_...)
span.model_request_end        (in=1175, out=87)
session.status_idle           (stop_reason: requires_action, event_ids=[sevt_...])
                              (⚠️ NOT terminal — loop continues)
[client sends user.custom_tool_result]
user.custom_tool_result       (ECHO — DO NOT re-emit as tool-result UI part, already emitted)
session.status_running
span.model_request_start
agent.message                 (final: "You have 2 contacts named Sarah — Sarah Lim (buyer) and Sarah Tan (seller).")
span.model_request_end        (in=1328, out=31)
session.status_idle           (stop_reason: end_turn)  ← TERMINAL, break
```

### ⚠️ Findings that UPDATE the plan below

1. **`agent.message` arrives as WHOLE TEXT, not as streaming deltas.** Each event carries `content: Array<{type: "text", text: "complete string"}>` — the text is fully formed by the time the event arrives. Anthropic Managed Agents does NOT stream tokens incrementally the way `streamText()` does today. Implications:
   - The adapter's `onAgentMessage` callback will emit ONE `text-delta` with the complete chunk, not many small deltas.
   - The UX will be "text chunks pop in" rather than "characters stream." For a turn with a preamble + tool call + final response, the user sees text appear in two bursts (preamble, then final answer), not a smooth character-by-character crawl.
   - `pipeJsonRender` is designed for incremental deltas — it still works with whole-text emits, but the spec-fence splitter will see the entire fence in one write rather than splitting it across deltas. **This is actually SAFER for pipeJsonRender, not riskier** (no partial-fence states to reason about). The D3/R42 concern about "burst-sized deltas breaking pipeJsonRender" is empirically moot from this spike — but the Phase 2 smoke test is still worth running with a real spec-fence prompt to be sure.
   - **Product call required:** do you want to synthesize finer-grained streaming by word-splitting, or accept coarse chunks as the trade-off for Managed Agents adoption? Document the decision; default is "accept coarse chunks, revisit if user-visible regression."

2. **Multiple `agent.message` events per turn are normal.** The spike saw 2 agent.message events in one turn — a preamble before the tool call and a final answer after. The session-runner's `onAgentMessage` callback must handle being called multiple times per turn, and the DB persistence must accumulate them into a single assistant turn (not two separate rows).

3. **`agent.thinking` exists and the handover doesn't mention it.** Add it to the event translation list:
   - `agent.thinking` → progress signal, no content. Options: (a) ignore, (b) emit a `step-start` UI part, (c) log only. **Recommendation: ignore for chat** (no UI benefit over the text-delta itself); **log in debug-trace** for observability.

4. **`user.message` and `user.custom_tool_result` are ECHOED back in the stream.** Events you send via `events.send()` reappear in the SSE stream as-is. The session-runner must filter these out — they are not new state, they are confirmations of what you already sent. Do not emit UIMessageStream parts for echoed user events. Do not re-persist them to the DB. The echoed events DO have fresh event IDs, which matters for reconnect dedup.

5. **Cost formula needs cache fields.** `model_usage` exposes `cache_read_input_tokens` and `cache_creation_input_tokens`. Anthropic's prompt caching pricing for Sonnet 4.6 is different from raw input:
   - Uncached input: $3/M
   - Cache write (5-minute TTL): ~$3.75/M
   - Cache read: ~$0.30/M
   - Output: $15/M
   - Session runtime: $0.08/h
   
   Revised formula (replaces the one in Gotchas further below):
   ```
   uncached_input = input_tokens - cache_read_input_tokens - cache_creation_input_tokens
   total_cost = (
     uncached_input × $3 +
     cache_creation_input_tokens × $3.75 +
     cache_read_input_tokens × $0.30 +
     output_tokens × $15
   ) / 1_000_000 +
     active_seconds / 3600 × $0.08
   ```
   
   Put the constants in `src/lib/managed-agents/pricing.ts` — do not scatter magic numbers across the adapter and evaluators. Verify current Sonnet 4.6 prices against the Anthropic pricing page before committing.

6. **Latency budget is higher than the plan assumed.** The spike's single-tool turn took ~14 seconds end-to-end (after session creation). Breakdown:
   - First LLM inference: ~3.0s (model_request_start → agent.custom_tool_use)
   - Tool dispatch round-trip: ~2.5s (agent.custom_tool_use → user.custom_tool_result echo in stream — most of this is Anthropic processing the sent event, not our dispatch)
   - Second LLM inference: ~3.1s (second model_request_start → final agent.message)
   - Ambient overhead: ~5s (session creation + stream open + kickoff round-trip)
   
   This is significantly slower than today's Gemini Flash 3 baseline (~3-5s per typical turn). **A 10-tool turn would take ~30-40s** on Sonnet 4.6 via Managed Agents. This is within the plan's "2× chat latency NFR" budget but may be a noticeable regression for users. **Action:** add latency measurement to Phase 2 acceptance criteria (p50/p95 per turn), decide during cutover whether to route simple turns to Haiku 4.5 as a fast path.

7. **The reconnect + dedup loop was NOT tested by the spike.** It is still the single highest-risk piece of H3. See "Additional spike recommendation" below.

### 🧪 Additional spike recommendation (before or during H3)

**Spike 2: reconnect with dedup + terminal gate.** 10-minute task. Fork `scripts/spike/managed-agents-custom-tool-spike.ts`, add:

1. After the first `session.status_idle` with `requires_action`, close the stream (don't send the tool result yet).
2. Send the tool result via a fresh `events.send()` call (outside the stream).
3. Open a fresh stream via `events.stream(sessionId)`.
4. Backfill via `client.beta.sessions.events.list(sessionId)`, seed `seenEventIds`.
5. Iterate the new stream with dedup.
6. Assert: no duplicate UI parts emitted, terminal `end_turn` fires correctly, final answer is present.
7. Variant: put the `session.status_idle` with `end_turn` in the history backfill (not the live stream) and verify the terminal gate still breaks the loop.

Run this **before** implementing `consumeAnthropicSession` in Part B. 10 minutes of spike saves 2+ days of debugging a deadlock in production.

---

## Your scope

Four tightly-coupled pieces. All go in one handover because the adapter calls the dispatcher which calls the tools, the adapter calls the evaluators at completion, and the session-runner core is reused by H5's trigger listener.

### ⚠️ Architectural note: split the adapter into reusable core + chat wrapper

**H5 will build a Trigger.dev task (`runTriggerAgent`) that consumes Anthropic session events in real-time — the same event consumption, tool dispatch, persistence, and terminal gate logic as the chat adapter.** If you build the adapter as a single monolithic function, H5 will have to either duplicate it or refactor your code. Much better to design for reuse upfront.

**The split:**
- **`src/lib/managed-agents/session-runner.ts`** — the reusable core. Takes a session ID + context + options and runs the event consumption loop. Returns accumulated events + cost on terminal state. Fires callbacks for agent messages, tool calls, approvals, persistence events. Does NOT know about UIMessageStream. Does NOT write to a browser. Handles reconnect + terminal gate + dispatch + incremental persistence.
- **`src/lib/managed-agents/adapter.ts`** — the chat wrapper. Calls `consumeAnthropicSession()` with callbacks that write to a `UIMessageStream` via `createUIMessageStream` + `pipeJsonRender`. Returns `ReadableStream<UIMessageStreamPart>` for the chat route.

H5's `src/trigger/run-trigger-agent.ts` (Trigger.dev task) will call the SAME `consumeAnthropicSession()` core with callbacks that write only to Supabase persistence and skip the UI stream. Both paths share 100% of the complex event handling logic.

### Part A — Custom Tool Dispatcher

`src/lib/managed-agents/dispatcher.ts`

Takes an `agent.custom_tool_use` event + a context object. Looks up the tool in the registry (from H2). Validates `chatOnly` flag against context. Executes the tool. Returns the result as a `user.custom_tool_result` content array.

```typescript
export interface DispatchContext {
  supabase: SupabaseClient<Database>;  // user-auth in chat, service-role in trigger
  clientId: string;
  threadId?: string;
  isChatContext: boolean;  // for chatOnly enforcement
}

export async function dispatchCustomTool(
  event: AgentCustomToolUseEvent,
  context: DispatchContext,
): Promise<CustomToolResultContent> {
  const tool = MANAGED_AGENT_TOOLS[event.name];
  if (!tool) {
    return errorResult(`Unknown tool: ${event.name}`);
  }
  if (tool.chatOnly && !context.isChatContext) {
    return errorResult("Tool not available in trigger runs.");
  }
  const input = tool.inputSchema.parse(event.input);
  const result = await tool.execute(input, context);
  return successResult(result);
}
```

Unit tests:
- Valid tool call → executes and returns success result
- Unknown tool name → returns error result
- `chatOnly` tool called with `isChatContext: false` → returns `{success: false, error: "Tool not available in trigger runs."}`
- `chatOnly` tool called with `isChatContext: true` → executes normally
- Invalid input schema → returns error result (Zod validation error surfaced)

### Part B — Session Runner Core

`src/lib/managed-agents/session-runner.ts`

The reusable core. Consumed by both the chat adapter (Part C) and H5's Trigger.dev listener task. Takes a session ID + context + callbacks. Handles everything except UI-specific output.

**Signature:**

```typescript
export interface SessionRunnerCallbacks {
  // Fired as events arrive. Callbacks are the extension point for output (UI stream vs DB persist vs both).
  onAgentMessage?: (event: AgentMessageEvent) => void | Promise<void>;
  onAgentToolUse?: (event: AgentToolUseEvent | AgentCustomToolUseEvent) => void | Promise<void>;
  onAgentToolResult?: (event: AgentToolResultEvent | AgentCustomToolResultEvent) => void | Promise<void>;
  onApprovalRequired?: (event: AgentToolUseEvent, approvalId: string) => void | Promise<void>;
  onSpanModelRequestStart?: (event: SpanModelRequestStartEvent) => void | Promise<void>;
  onSpanModelRequestEnd?: (event: SpanModelRequestEndEvent) => void | Promise<void>;
  onSessionError?: (event: SessionErrorEvent) => void | Promise<void>;
  onPersistMessage?: (persistedPart: PersistedPart, sourceEventId: string) => void | Promise<void>;
}

export interface SessionRunnerOptions {
  sessionId: string;
  context: DispatchContext;  // supabase, clientId, threadId, isChatContext
  callbacks: SessionRunnerCallbacks;
  // Trigger-specific behaviors (chat uses defaults):
  autoDenyApprovals?: boolean;  // trigger runs can't show approval UI — auto-send user.tool_confirmation with deny
  autoDenyMessage?: string;
  persistIncrementally?: boolean;  // when true, persist messages as they arrive (both chat and triggers use this)
  kickoffMessage?: string;  // if provided, send as user.message after opening the stream (fresh sessions)
  // Reconnect: if the runner is resuming a session that was interrupted, this is automatic via events.list + dedup per skill §1
}

export interface SessionRunnerResult {
  status: "complete" | "failed";
  reason: "end_turn" | "retries_exhausted" | "terminated" | "session_error";
  accumulatedEvents: AgentEvent[];
  cost: { inputTokens: number; outputTokens: number; runtimeSeconds: number };
  approvalEventIds: string[];  // approval_events rows created during the run (chat uses these to resolve later)
}

export async function consumeAnthropicSession(
  options: SessionRunnerOptions,
): Promise<SessionRunnerResult>;
```

**Internal logic:**

1. **Stream-first, then send** (skill §7). Open SSE stream via `client.beta.sessions.events.stream(sessionId)` BEFORE sending the kickoff message.

2. **Reconnect with dedup** (skill §1). Fetch history via `events.list(sessionId)` after opening the stream, seed `seenEventIds` set, tail live stream with dedup. **Terminal gate checks run even for already-seen events** — critical for correctness.

3. **Event translation loop:**
   - `agent.message` → invoke `callbacks.onAgentMessage(event)` + accumulate text for final persistence. **Per spike finding #1, each event carries COMPLETE text (not a delta). Multiple agent.message events per turn are normal — see spike finding #2.** Callbacks may fire more than once.
   - `agent.thinking` → progress signal, no content. **Spike finding #3:** ignore for chat by default (no UI benefit), log for observability.
   - `agent.custom_tool_use` → invoke `callbacks.onAgentToolUse(event)` → call `dispatchCustomTool(event, context)` → send `user.custom_tool_result` via `client.beta.sessions.events.send()` → invoke `callbacks.onAgentToolResult(...)` with the synthesized result event
   - `agent.tool_use` with `evaluated_permission === "ask"` → create `approval_events` row with `session_id` + `tool_use_id = event.id`, save to result's `approvalEventIds`, invoke `callbacks.onApprovalRequired(event, approvalId)`. **If `options.autoDenyApprovals === true`**: immediately send `user.tool_confirmation` with `{result: "deny", deny_message: options.autoDenyMessage ?? "Approval not available in this context."}` and continue consuming events (no UI wait).
   - `user.message` → **ECHO of something we sent. Per spike finding #4, filter these out entirely.** Do not emit UIMessageStream parts, do not re-persist (the user message was already written to `conversation_messages` before the kickoff). Still track the event ID for reconnect dedup.
   - `user.custom_tool_result` → **ECHO of something we sent.** Same treatment: do not re-emit as `tool-result` UI part (already emitted by `onAgentToolResult` when we synthesized it above), do not re-persist. Track event ID for dedup only.
   - `user.tool_confirmation` → ECHO, same treatment.
   - `session.status_running` → invoke `callbacks.onSessionStatusRunning?.(event)` if defined; otherwise ignore. Useful for UI "agent is working" indicators.
   - `span.model_request_start` → invoke `callbacks.onSpanModelRequestStart(event)`
   - `span.model_request_end` → accumulate `model_usage.input_tokens` + `output_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` into cost totals (per spike finding #5), invoke `callbacks.onSpanModelRequestEnd(event)`
   - `session.error` → invoke `callbacks.onSessionError(event)`, log, continue (not auto-terminal per skill guidance)
   - Other event types → ignore or log

4. **Incremental persistence** (when `persistIncrementally: true`). After each `agent.message` or `agent.custom_tool_result`, translate the accumulated state into `PersistedPart[]` format and upsert into `conversation_messages` using `source_event_id` for idempotency. Invoke `callbacks.onPersistMessage` for observers. Chat uses this so the browser sees messages stream in; triggers use this so the run detail page shows live progress.

5. **Terminal gate** (skill §5 — critical):
   - `session.status_idle` with `stop_reason.type === "end_turn"` → return `{status: "complete", reason: "end_turn", ...}`
   - `session.status_idle` with `stop_reason.type === "requires_action"` → if `autoDenyApprovals: true`, the auto-deny was already sent — continue the loop; otherwise, persist current state, return `{status: "complete", reason: "requires_action", ...}` (chat returns here to let the user respond via UI; the chat adapter later re-enters the session with a new kickoff)
   - `session.status_idle` with `stop_reason.type === "retries_exhausted"` → return `{status: "failed", reason: "retries_exhausted", ...}`
   - `session.status_terminated` → return `{status: "failed", reason: "terminated", ...}`

6. **Cost tracking:** Fetch `session.stats.active_seconds` via `client.beta.sessions.retrieve(sessionId)` just before returning terminal result. Include in `cost.runtimeSeconds`. Note: per skill §6 post-idle status-write race, there may be a brief moment where session stats aren't updated — you can poll briefly (1s max) or accept a near-final value.

**Unit tests for session-runner:**
- Fixture event sequences → expected callback invocations in correct order. **Use the spike-observed sequence (see Spike findings above) as at least one golden fixture.**
- Terminal gate: `end_turn`, `retries_exhausted`, `terminated` all return correctly typed results
- Terminal gate differentiation: `session.status_idle` with `requires_action` → NOT terminal, loop continues; `session.status_idle` with `end_turn` → terminal, loop breaks. Spike confirmed both behaviors — make them non-negotiable test cases.
- Reconnect: history contains a terminal event → loop breaks even though event was deduped (test explicitly, this is a silent deadlock trap)
- **Echo filter (per spike finding #4):** fixture sequence includes `user.message` and `user.custom_tool_result` echoes → `onAgentMessage` / `onAgentToolResult` callbacks are NOT called for those echoes, `onPersistMessage` is NOT called for them, but the event IDs ARE added to `seenEventIds` for dedup.
- **Multi-message turn (per spike finding #2):** fixture sequence has two `agent.message` events in one turn (preamble + final answer) → `onAgentMessage` fires twice, persistence accumulates both into a single assistant turn (same `run_id`), not two turns.
- `autoDenyApprovals: true` + `agent.tool_use` with ask policy → `user.tool_confirmation` with deny sent, loop continues
- `autoDenyApprovals: false` (default, chat) + same event → returns with reason `requires_action`, no auto-deny sent
- Custom tool dispatch: `agent.custom_tool_use` → dispatcher called with correct context → result sent via `events.send`
- Incremental persistence: `persistIncrementally: true` → `onPersistMessage` fires for each agent message with correct `source_event_id`
- **Cost accumulation (per spike finding #5):** multiple `span.model_request_end` events with mixed cache fields → totals correct for `uncached_input`, `cache_read`, `cache_creation`, `output` separately. Fixture: event 1 has 1000 input / 0 cache, event 2 has 1500 input / 800 cache_read → accumulator reports `{uncachedInput: 1700, cacheRead: 800, cacheCreation: 0, output: ...}`.

### Part C — Chat Adapter (thin wrapper over session-runner)

`src/lib/managed-agents/adapter.ts`

Main entry point: `runManagedAgent(payload, supabase)` returns `ReadableStream<UIMessageStreamPart>`. **This is a thin wrapper — all the hard event-handling logic lives in session-runner (Part B).** The adapter's only job is:

1. Session management (create or reuse for the thread, pin to agent version)
2. Build kickoff content
3. Call `consumeAnthropicSession(...)` with callbacks that write to a `UIMessageStream` via `writer.write(...)`
4. Wrap the UIMessageStream in `pipeJsonRender` for spec fence rendering
5. On terminal result, finalize the run (persist messages already written incrementally, call `completeRun()`, run evaluators, write scores)

**Concrete shape:**

```typescript
export async function runManagedAgent(
  payload: ChatPayload,
  supabase: SupabaseClient<Database>,
): Promise<ReadableStream<UIMessageStreamPart>> {
  // 1. Session management
  const sessionId = await getOrCreateSession(supabase, payload.threadId, {
    agent: {
      type: "agent",
      id: process.env.ANTHROPIC_AGENT_ID!,
      version: Number(process.env.ANTHROPIC_AGENT_VERSION!),
    },
    environment_id: process.env.ANTHROPIC_ENVIRONMENT_ID!,
    title: payload.threadTitle,
  });

  // 2. Build kickoff content: [client_profile] + [user_preferences] + [system_reminders] + [user message]
  const kickoffMessage = await buildKickoffContent(supabase, payload);

  // 3. Create the outer UIMessageStream. Inside execute(), call session-runner with callbacks.
  return createUIMessageStream({
    execute: async ({ writer }) => {
      // Wrap writer in pipeJsonRender so spec fences are detected and emitted as data-spec parts.
      // (Implementation: pipeJsonRender returns a wrapped writer that tracks accumulated text and
      // splits it into text + data-spec chunks as fences are detected.)
      const pipedWriter = pipeJsonRender(writer);

      const result = await consumeAnthropicSession({
        sessionId,
        context: {
          supabase,
          clientId: payload.clientId,
          threadId: payload.threadId,
          isChatContext: true,
        },
        kickoffMessage,
        persistIncrementally: true,
        autoDenyApprovals: false,  // chat waits for user to resolve approvals via UI
        callbacks: {
          onAgentMessage: (event) => {
            for (const block of event.content) {
              if (block.type === "text") {
                pipedWriter.write({ type: "text-delta", delta: block.text });
              }
            }
          },
          onAgentToolUse: (event) => {
            pipedWriter.write({
              type: "tool-call",
              toolCallId: event.id,
              toolName: event.name,
              args: event.input,
            });
          },
          onAgentToolResult: (event) => {
            pipedWriter.write({
              type: "tool-result",
              toolCallId: event.tool_use_id,
              result: event.result,
            });
          },
          onApprovalRequired: (event, approvalId) => {
            pipedWriter.write({
              type: "tool-approval-request",
              approvalId,
              toolCall: { toolCallId: event.id, toolName: event.name, input: event.input },
            });
          },
          onSpanModelRequestStart: () => {
            pipedWriter.write({ type: "step-start" });
          },
          // Persistence is handled by the session-runner directly via persistIncrementally: true.
          // No callback needed for onPersistMessage unless the chat UI needs to know.
        },
      });

      // 4. Finalize run on terminal state
      if (result.status === "complete" && result.reason === "end_turn") {
        await completeRun(supabase, payload.runId, {
          tokens_in: result.cost.inputTokens,
          tokens_out: result.cost.outputTokens,
          cost_usd: calculateCost(result.cost),
          status: "complete",
        });
        // Run evaluators in-process (H3 Part D refactors these to read Event[])
        const toolSequence = extractToolSequenceFromEvents(result.accumulatedEvents);
        const safetyResult = evaluateSafetyGate(toolSequence);
        const crmResult = evaluateCrmHallucination(toolSequence);
        await writeRunScore(supabase, payload.runId, { evaluator_name: "safety-gate", ... });
        await writeRunScore(supabase, payload.runId, { evaluator_name: "crm-hallucination", ... });
      } else if (result.status === "complete" && result.reason === "requires_action") {
        // User needs to resolve approvals. Persist current state, close stream — chat UI will
        // send a follow-up message via /api/tool-confirm or Telegram callback, which re-enters
        // the session with a new kickoff. No finalize yet.
      } else {
        // retries_exhausted, terminated, or session_error
        await completeRun(supabase, payload.runId, {
          status: "failed",
          error_message: result.reason,
        });
      }
    },
  });
}
```

**The adapter's event translation is essentially callback wiring.** It doesn't implement the event loop, reconnect logic, terminal gate, or dispatcher — session-runner does all of that. The adapter's job is just to map session-runner callbacks to UIMessageStream writes, plus finalization logic.

**Why this split matters:** H5 builds `src/trigger/run-trigger-agent.ts` as a Trigger.dev task that calls `consumeAnthropicSession(...)` with different options (`isChatContext: false`, `autoDenyApprovals: true`) and different callbacks (no UI writes — just persistence callbacks for observers + finalization). Triggers and chat share 100% of the complex event handling code.

**Unit tests for adapter (thin — most logic is tested at the session-runner layer):**
- Session creation pins correct agent version from env vars
- Kickoff content assembly: given `client_profile`, `user_preferences`, `system_reminders`, user message → correct concatenated string
- Callbacks correctly map session-runner events to UIMessageStream writes (mock session-runner, fire fixture callbacks, verify writer receives expected parts)
- Finalization on `end_turn` → `completeRun` called with correct cost math, evaluators called, scores written
- Finalization on `retries_exhausted` → `completeRun` called with failed status
- `requires_action` → stream closes without finalize, run stays in-progress
- `pipeJsonRender` integration: fire a fixture `agent.message` containing a spec fence → verify the writer receives `text-delta` + `data-spec` parts

### Part D — Evaluator Refactor

Goal: make `safety-gate-eval` and `crm-hallucination-eval` work on `Event[]` from `events.list()` instead of Langfuse observations, while keeping the old Langfuse path working (H4 deletes the old path).

**Refactor plan:**

1. `src/lib/eval/extract-tool-sequence.ts` — add an overload:
   ```typescript
   export function extractToolSequenceFromObservations(observations: Observation[]): ToolCall[] { ... }  // existing
   export function extractToolSequenceFromEvents(events: AgentEvent[]): ToolCall[] { ... }  // NEW
   ```
   The new function walks `Event[]`, finds pairs of `agent.custom_tool_use` + matching `user.custom_tool_result` (by `custom_tool_use_id`) and `agent.tool_use` + matching `agent.tool_result` (by tool_use_id). Returns the same `ToolCall[]` shape as the old function so downstream evaluators don't care about the source.

2. `src/lib/eval/safety-gate-eval.ts` — takes `ToolCall[]` already. Unchanged logic. Just make sure it works with the new extract function's output.

3. `src/lib/eval/crm-hallucination-eval.ts` — same.

4. Create `src/lib/eval/run-scores-writer.ts` — new helper that writes evaluator results to the `run_scores` Supabase table. Replaces the old `createScore` Langfuse call. Interface:
   ```typescript
   export async function writeRunScore(
     supabase: SupabaseClient<Database>,
     runId: string,
     score: { evaluator_name: string; score_type: string; score_value: number; comment?: string },
   ): Promise<void>;
   ```

5. New entry point for the adapter: `runEvaluatorsForEvents(events: AgentEvent[], runId: string, supabase)` in `src/lib/eval/run-evaluators.ts`. Keep the old `runEvaluatorsForTrace(traceId)` intact for now — H4 deletes it.

Unit tests:
- Golden fixtures: take real Langfuse observations from recent runs (via `/debug-trace` skill), translate to equivalent `AgentEvent[]`, verify `safety-gate-eval` produces the same score either way
- Known-bad case: `agent.custom_tool_use(delete_records)` WITHOUT prior `agent.custom_tool_use(ask_user_question)` → safety gate FAIL
- Known-good case: `ask_user_question` → user confirms → `delete_records` → safety gate PASS
- `writeRunScore` writes correctly to `run_scores` with all fields populated
- Score retrieval via Supabase query works

## Entry state (assume after H1 and H2)

- Schema in place: `runs.session_id`, `conversation_threads.session_id`, `approval_events.session_id + tool_use_id`, `conversation_messages.source_event_id` with unique index, `run_scores` table
- Env vars: `ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`, `ANTHROPIC_ENVIRONMENT_ID`
- Agent + environment live in Anthropic
- `src/lib/managed-agents/tools/*` exists with all 38 tools, CI lint passing
- `src/lib/memory/` deleted
- Legacy runner still handles production traffic

## Exit state

- `src/lib/managed-agents/adapter.ts` and `src/lib/managed-agents/dispatcher.ts` fully implemented + unit tested
- Evaluators refactored with `extractToolSequenceFromEvents` + `writeRunScore`, old Langfuse path still works (H4 deletes it)
- Adapter is NOT yet wired into `app/api/chat/route.ts` — legacy runner still handles production traffic
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass
- Langfuse is NOT deleted yet (H4 does it)

## Key decisions that apply to your scope

- **D3** — JIT UI stays via `pipeJsonRender`. Wrap adapter output in `pipeJsonRender()` the same way `app/api/chat/route.ts:374` does today.
- **D4** — Drop Langfuse in favor of `events.list()` + in-process evaluators + `run_scores` table. Your evaluator refactor is the preparation; H4 does the actual Langfuse deletion.
- **D6** — Telegram approvals via `approval_events` indirection. You create the rows in the adapter on `agent.tool_use` with `evaluated_permission === "ask"`; H4 updates the Telegram callback handler and `/api/tool-confirm` route to look them up.

## Gotchas / non-negotiables

- **Stream-first, then send** (skill §7). If you reverse this, you miss early events and the adapter behaves flakily in tests.
- **Terminal gate must check even for seen events** (skill §1). Every per-event handler should have the break check BEFORE the dedup skip. Test this explicitly with a fixture where the history list includes a `session.status_idle` with `end_turn`.
- **Handle `retries_exhausted` as a distinct terminal state** (skill §5). Don't just treat `session.status_idle` as end. `stop_reason.type` matters.
- **`pipeJsonRender` smoke test early.** Per D3, the adapter's spec-fence rendering via `pipeJsonRender` is unverified for burst-sized `agent.message` deltas. Include a manual smoke test task in your tasklist: run a prompt that emits a spec fence, verify the browser renders it. If janky, fall back to pre-splitter via `splitTextAndSpecParts` from `src/lib/runner/message-utils.ts`. Last resort: cut JIT UI.
- **Don't send `user.tool_confirmation` from the adapter.** The adapter creates the `approval_events` row and emits UI parts. External resolution (Telegram callback or `/api/tool-confirm`) is H4's responsibility.
- **Cost formula (updated per spike finding #5):** Do NOT use a naive `input × $3 + output × $15` formula — it ignores prompt caching which Managed Agents uses automatically. The correct formula is:

  ```
  uncached_input = input_tokens - cache_read_input_tokens - cache_creation_input_tokens
  total_cost = (
    uncached_input × $3 +
    cache_creation_input_tokens × $3.75 +
    cache_read_input_tokens × $0.30 +
    output_tokens × $15
  ) / 1_000_000 +
    active_seconds / 3600 × $0.08
  ```

  Put the constants in `src/lib/managed-agents/pricing.ts`. Verify current Sonnet 4.6 prices against the Anthropic pricing page before committing. Pull prices from the module, do not hardcode across the codebase.
- **Agent version pinning is REQUIRED**, not optional. Use `{type: "agent", id, version}` form, not string shorthand. Per skill `shared/managed-agents-core.md` §Versioning.
- **`source_event_id` on persisted messages.** The unique index prevents duplicates on polling cron reprocess. Use the Anthropic event ID (e.g., `sevt_...`) as the source_event_id.
- **Keep the old Langfuse evaluator path intact.** H4 deletes it. If you delete it now, H4 will break.
- **Adapter does NOT touch `app/api/chat/route.ts`.** That's the cutover PR. Your code is dead code until H4 wires it up.
- **Mock Anthropic SDK heavily.** Don't hit the real API in unit tests. Use `vi.mock("@anthropic-ai/sdk", ...)` with controlled fixture responses. Only integration smoke tests may use the real API, gated by an env flag.

## Output format reminder

Follow the tasklist generation rule in memory. Structure:

```markdown
# Managed Agents Migration — H3 Adapter + Dispatcher + Evaluators

**Goal:** [one sentence]

**Architecture:** [2-3 sentences referencing D3, D4, D6, stream-first, terminal gate]

**Tech Stack:** [Anthropic SDK, Vercel AI SDK UIMessageStream types, pipeJsonRender, Zod, Vitest]

## Relevant Files
...

---

## Task 1: Dispatcher implementation
...

## Task 2: Adapter skeleton
...

## Task 3: Event translation loop
...
```

Each bite-sized step must be 2-5 minutes of actual work. Write test and implementation code inline.

Commit messages use `feat(h3):`, `refactor(h3):`.

## Scale estimate

- `src/lib/managed-agents/adapter.ts` — ~500 LOC
- `src/lib/managed-agents/dispatcher.ts` — ~150 LOC
- `src/lib/eval/extract-tool-sequence.ts` — +200 LOC for the new overload
- `src/lib/eval/run-scores-writer.ts` — ~60 LOC
- Unit tests — ~800 LOC across ~15 test files
- Total: ~15 files, ~1700 LOC net added

## One last thing

When you've generated the tasklist, end your response with:

> "Tasklist complete and saved to `docs/product/tasks/2026-04-10-managed-agents-h3-adapter-dispatcher-tasklist.md`. Ask user to open a new session to do batch execution with checkpoint."

Then stop. Do not start implementing.

---

## Smoke test results (2026-04-11)

- ⏸️ **Deferred — requires live Anthropic Managed Agents credentials.** The H3 surface is unit-tested end-to-end (160/160 passing in `src/lib/managed-agents` + `src/lib/eval`, full repo: 2643/2643 passing). The pipeJsonRender wrap is exercised in `adapter.test.ts` (`emits data-spec parts when agent.message contains a spec fence`), but a real Anthropic SSE round-trip with a model that emits a spec fence has not yet been run from this branch.
- **Action for H4 / human verifier:** before merging the chat-route cutover, run the spike with `ANTHROPIC_SMOKE_TEST=1` against a session pinned to the env-var agent version with a prompt like _"Show me a donut chart of my open deals by stage"_ and confirm:
  1. Stream yields `text-delta` parts until the spec fence opens.
  2. Between fence open/close, yields `data-spec` parts (one per JSONL line).
  3. Trailing prose comes back as `text-delta`.
- If janky on burst deltas → swap the adapter's `onAgentMessage` text-delta write for `splitTextAndSpecParts` and drop the `pipeJsonRender` wrap. Last resort per D3: cut JIT UI.

---

## Code-review fix pass (2026-04-11)

The first H3 review surfaced 8 findings (1 critical, 6 important, 1 minor).
All addressed in commits prefixed `fix(h3):` (F1–F8). Final state:
**196/196 tests passing in `src/lib/managed-agents` + `src/lib/eval` +
`src/lib/chat` + `src/lib/approvals`. tsc clean. lint clean on the H3 surface.**

| # | Finding | Fix |
|---|---|---|
| F1 | Stream-first ordering bug — `iterateSessionEvents` was an async generator, so the real `events.stream()` call was deferred until the first iteration, AFTER the kickoff send. | Split into eager `openSessionStream()` + dedup-iterator `iterateSessionEvents(client, sessionId, handle)`. Runner opens the live stream first, sends kickoff, then iterates. New unit test pins `events.stream` invocation order before `events.send`. |
| F2 | Adapter could leave the run row stuck in `running` if anything threw between `createRun()` and `completeRun()`. | Wrap the execute body in try/catch; on error call `completeRun(failed)` then re-throw so the UIMessageStream surfaces the error to the consumer. |
| F3 | `getOrCreateSession` silently destructured `data` and ignored Supabase errors on both the session_id select and the cache update — orphan-session leak risk. | Throw on either error path with the underlying message. |
| F4 | D6 not implemented: `createApprovalEvent` never populated `session_id` / `tool_use_id`, so H4's `/api/tool-confirm` and Telegram callback can't route the resolution back to Anthropic. | Add optional `sessionId` + `toolUseId` to `CreateApprovalEventInput`, plumb through the runner approval branch, new test asserting the columns are persisted. |
| F5 | Cost math used the v1 formula and ignored `cache_read_input_tokens` / `cache_creation_input_tokens`. Cached turns were charged at the uncached rate. | Updated `accumulateModelUsage` + `computeTurnCost` to use the handover's revised formula: uncached × $3 + cache_creation × $3.75 + cache_read × $0.30 + output × $15. New constants `CACHE_READ_PER_M` + `CACHE_CREATION_PER_M`. Threaded cache fields through `AccumulatedUsage` → `TranslatorState` → `SessionRunnerResult.cost`. |
| F6 | Production code imported `AnthropicEvent` from `__tests__/fixtures/events`, pointing six production files at a test path. | New `src/lib/managed-agents/event-types.ts` with explicit interface definitions. Fixtures file re-exports `AnthropicEvent` so existing tests keep working. Six production import sites updated. |
| F7 | `extractToolSequenceFromEvents` only paired `agent.custom_tool_use` with `user.custom_tool_result` — built-in tools (notably bash) were invisible to the safety-gate evaluator. | Added the `agent.tool_use` → `agent.tool_result` pairing branch keyed by `tool_use_id`, captures `{text, isError}` on the result. New `builtInToolResultEvent` fixture + four tests. |
| F8 | Three persistence gaps: (a) approval requests never persisted as `approval-requested` parts, (b) `user.custom_tool_result` couldn't resolve `tool-call`/`tool-result` pairs in the per-event projector, (c) no `source_event_id`-based upsert for run-restart idempotency. | (a) `buildAssistantPartsFromEvents` now emits `approval-requested` parts for `agent.tool_use` with `evaluated_permission='ask'`, and full output-available/output-error parts for built-in tool results. (b) Dropped the half-built incremental persistence path entirely (`persistIncrementally` + `onPersistMessage` removed) — the chat UI streams via the AI SDK transport, not DB polling, and H5's run-detail page can read the terminal row. (c) New `upsertMessage(supabase, {...source_event_id})` helper in `chat/messages.ts` keyed by `source_event_id` with `onConflict: source_event_id`. Adapter picks the terminal `session.status_idle` event id as the per-turn idempotency key. |

Pre-existing failures unrelated to H3 (`src/components/chat/spinner/use-animation-frame.ts` IntersectionObserver, `app/(dashboard)/settings/page.test.tsx`) are from another branch and untouched by this work.
