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
   - `agent.message` → invoke `callbacks.onAgentMessage(event)` + accumulate text for final persistence
   - `agent.custom_tool_use` → invoke `callbacks.onAgentToolUse(event)` → call `dispatchCustomTool(event, context)` → send `user.custom_tool_result` via `client.beta.sessions.events.send()` → invoke `callbacks.onAgentToolResult(...)` with the synthesized result event
   - `agent.tool_use` with `evaluated_permission === "ask"` → create `approval_events` row with `session_id` + `tool_use_id = event.id`, save to result's `approvalEventIds`, invoke `callbacks.onApprovalRequired(event, approvalId)`. **If `options.autoDenyApprovals === true`**: immediately send `user.tool_confirmation` with `{result: "deny", deny_message: options.autoDenyMessage ?? "Approval not available in this context."}` and continue consuming events (no UI wait).
   - `span.model_request_start` → invoke `callbacks.onSpanModelRequestStart(event)`
   - `span.model_request_end` → accumulate `model_usage.input_tokens` + `output_tokens` into cost totals, invoke `callbacks.onSpanModelRequestEnd(event)`
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
- Fixture event sequences → expected callback invocations in correct order
- Terminal gate: `end_turn`, `retries_exhausted`, `terminated` all return correctly typed results
- Reconnect: history contains a terminal event → loop breaks even though event was deduped (test explicitly, this is a silent deadlock trap)
- `autoDenyApprovals: true` + `agent.tool_use` with ask policy → `user.tool_confirmation` with deny sent, loop continues
- `autoDenyApprovals: false` (default, chat) + same event → returns with reason `requires_action`, no auto-deny sent
- Custom tool dispatch: `agent.custom_tool_use` → dispatcher called with correct context → result sent via `events.send`
- Incremental persistence: `persistIncrementally: true` → `onPersistMessage` fires for each agent message with correct `source_event_id`
- Cost accumulation: multiple `span.model_request_end` events → totals correct

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
- **Cost formula:** `total_cost = (input_tokens × $3 + output_tokens × $15) / 1_000_000 + session.stats.active_seconds / 3600 × $0.08`. Pull prices from a constant, don't hardcode across the codebase.
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
