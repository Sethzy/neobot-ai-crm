# Runner Unification — Design Doc

**Status:** Design doc (not yet implemented)
**Date:** 2026-03-23
**Reference codebases:**
- [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) (local: `/Users/sethlim/Documents/deepagents`)
- Dorabot (local: `/Users/sethlim/Documents/dorabot-1`)
**Related:** `02-harness-fixes-design-doc.md` (Fix 3, deferred from harness fixes PR)

---

## Problem

Two runner functions with ~60% duplicated logic:

- `src/lib/runner/run-agent.ts` — chat runs (streaming, 200 lines)
- `src/lib/runner/run-autopilot.ts` — autopilot pulse runs (non-streaming, 140 lines)

Both do the same core work: acquire lock, assemble context, create tools, call the LLM, finalize the run. Every future runner improvement (context pipeline, prompt caching, lazy connections) requires changes in both files. This doubles maintenance and creates risk of behavioral drift between the two modes.

---

## Reference Patterns

### Dorabot

**File:** `/Users/sethlim/Documents/dorabot-1/src/agent.ts`

Dorabot has `runAgent()` (non-streaming) and `streamAgent()` (async generator). They're parallel implementations with ~99% identical code — the only difference is `yield msg` vs. collecting messages.

Both chat messages and pulse triggers go through the same `handleAgentRun()` gateway function, which calls `streamAgent()`. The runner doesn't know who triggered it. The caller passes different parameters:

```typescript
// Chat
streamAgent({ prompt: userMessage, channel: "telegram", ... })

// Pulse
streamAgent({ prompt: buildAutonomousPrompt(), lastPulseAt: ..., ... })
```

One runner, multiple entry points, context-specific parameters.

### Deep Agents

**File:** `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/graph.py`

One factory: `create_deep_agent()` (lines 83-332). Returns a compiled graph. The caller picks invocation style (`invoke()` for blocking, `astream()` for streaming). The orchestration logic (middleware, tools, subagents) is written once.

---

## Current Sunder Code

### What's duplicated (written twice, same logic)

| Operation | `run-agent.ts` | `run-autopilot.ts` |
|-----------|---------------|-------------------|
| `markStaleRunsFailed()` | line 176 | line 48 |
| `createRun()` | line 179 | line 50 |
| `assembleContext()` | lines 240-251 | lines 56-63 |
| Composio loading | lines 215-228 | lines 72-77 |
| `createRunnerTools()` | lines 254-261 | lines 64-69 |
| `createSubagentTool()` | lines 262-266 | lines 79-81 |
| Tool combination | lines 269-273 | lines 96-100 |
| `finalizeRun()` | lines 305-316 | lines 107-118 |

### What's different (7 behavioral differences)

| # | Concern | `runAgent` (chat) | `runAutopilot` (pulse) |
|---|---------|-------------------|------------------------|
| 1 | **Model call** | `streamText()` with `onFinish`/`onError` callbacks | `generateText()` with direct `await` |
| 2 | **Busy thread** | Enqueue message, return `{ status: "queued" }` | Return `{ status: "skipped_busy" }` |
| 3 | **User message** | Created in DB (line 195, unless cron) | Never created |
| 4 | **Quota** | Consumed with rollback guard | Never consumed |
| 5 | **Connection mutations** | Enabled (default `true`) | Disabled (hardcoded `false`, line 66) |
| 6 | **Instructions** | None (default system prompt) | `AUTOPILOT_INSTRUCTION_PROMPT` (line 61) |
| 7 | **Error contract** | Throws (caller catches) | Catches internally, returns `{ status: "failed", error }` |

---

## Design

### Approach: Extract shared core, keep thin wrappers

Extract the shared logic (lock → context → tools → model call → finalize) into an internal `executeRun()` function. Keep `runAgent()` and `runAutopilot()` as thin wrappers that handle their mode-specific concerns.

This preserves both public contracts. `executor.ts` keeps calling `runAutopilot()` and getting `{ status: "failed", error }`. `chat/route.ts` keeps calling `runAgent()` and catching throws. No callers change.

### Internal config type

```typescript
/** Internal run configuration — not exposed to callers. */
interface ExecuteRunConfig {
  // Identity
  clientId: string
  threadId: string
  supabase: ChatSupabaseClient

  // Mode
  modelCall: "stream" | "generate"
  triggerType: "chat" | "cron" | "webhook" | "pulse"
  channel: "web" | "telegram" | "whatsapp"

  // Context
  input: string
  fileParts?: FilePart[]
  instructions?: string           // autopilot instruction override
  crmMode?: "normal" | "setup"

  // Tool permissions
  allowTriggerMutations: boolean
  allowConnectionMutations: boolean
  includeBrowserTools: boolean
  includeConfigTool?: boolean

  // Plumbing
  createUserMessage: boolean      // false for pulse
  runType: RunType
}
```

### The three functions

```
executeRun(config)           ~180 lines — shared core (private)
  ├── markStaleRunsFailed
  ├── createRun (lock)
  ├── loadCrmConfig + Composio (parallel)
  ├── assembleContext
  ├── createRunnerTools + createSubagentTool
  ├── model call (streamText or generateText based on config.modelCall)
  └── finalizeRun + analytics

runAgent(payload, supabase)  ~30 lines — chat wrapper (public, same contract as today)
  ├── quota consumption + rollback guard
  ├── user message creation
  ├── busy → enqueue
  └── calls executeRun({ modelCall: "stream", ... })

runAutopilot(input)          ~15 lines — autopilot wrapper (public, same contract as today)
  ├── busy → return skipped_busy
  ├── try/catch → return { status: "failed", error }
  └── calls executeRun({ modelCall: "generate", ... })
```

### How `executeRun` handles streaming vs. non-streaming

The model call is the one place where streaming and non-streaming truly diverge. `executeRun` branches on `config.modelCall`:

```typescript
if (config.modelCall === "stream") {
  // Returns streamText result — caller (runAgent) returns it to chat API
  const streamResult = await propagateAttributes(..., () =>
    streamText({
      ..., // shared: model, system, messages, tools, prepareStep
      onError: ...,
      onFinish: async ({ text, steps, totalUsage }) => {
        await finalizeRun({ ... })
        await captureServerEvent({ ... })
      },
    })
  )
  return { status: "streaming", streamResult }
} else {
  // Blocks until complete, then finalizes
  const result = await propagateAttributes(..., () =>
    generateText({
      ..., // shared: model, system, messages, tools, prepareStep
    })
  )
  await finalizeRun({
    ...,
    steps: result.steps,
    text: result.text,
    totalUsage: result.totalUsage,
  })
  await captureServerEvent({ ... })
  return { status: "completed" }
}
```

The shared parts (model, system prompt, messages, tools, `stopWhen`, `prepareStep`, `providerOptions`, telemetry) are computed once and passed to whichever model call is selected.

### Busy-thread handling

`executeRun` doesn't handle busy-thread logic. The wrappers do:

```typescript
// runAgent wrapper:
const lockResult = await createRun(...)
if (!lockResult.created) {
  await enqueueMessage(...)         // chat queues
  return { status: "queued" }
}
return executeRun({ ..., runId: lockResult.runId })

// runAutopilot wrapper:
const lockResult = await createRun(...)
if (!lockResult.created) {
  return { status: "skipped_busy" } // autopilot skips
}
return executeRun({ ..., runId: lockResult.runId })
```

Wait — this means lock acquisition is also in the wrappers, not in `executeRun`. That's correct because:
- `runAgent` needs the lock result to decide queue-vs-skip
- `runAgent` needs the lock before creating the user message (line 195 depends on knowing the run was created)
- `runAutopilot` has different behavior on lock failure

So `executeRun` receives a `runId` (lock already acquired) and does: context → tools → model call → finalize.

### Updated function boundaries

```
runAgent(payload, supabase)      ~50 lines
  ├── quota consumption
  ├── markStaleRunsFailed
  ├── createRun (lock)
  ├── busy → enqueue, return "queued"
  ├── create user message
  └── return executeRun({ runId, modelCall: "stream", ... })

runAutopilot(input)              ~25 lines
  ├── markStaleRunsFailed
  ├── createRun (lock)
  ├── busy → return "skipped_busy"
  ├── try { return executeRun({ runId, modelCall: "generate", ... }) }
  └── catch → completeRun(failed), return { status: "failed", error }

executeRun(config)               ~150 lines (private)
  ├── loadCrmConfig + Composio (parallel)
  ├── assembleContext
  ├── createRunnerTools + createSubagentTool
  ├── model call (stream or generate)
  ├── finalizeRun
  └── captureServerEvent (analytics)
```

### Lock + stale-run marking

Both wrappers call `markStaleRunsFailed()` and `createRun()`. This is 2 lines of duplication (vs. 60% today). Acceptable — the busy-thread response logic differs between wrappers, so the lock must be the wrapper's concern.

---

## What Changes for Callers

**Nothing.** Both public APIs keep their exact signatures and return types:

| Function | Signature | Return type | Error contract |
|----------|-----------|-------------|----------------|
| `runAgent()` | `(payload: RunnerPayload, supabase) → Promise<RunAgentResult>` | `{ status: "streaming", streamResult } \| { status: "queued" }` | Throws on failure |
| `runAutopilot()` | `({ clientId, threadId, supabase }) → Promise<RunAutopilotResult>` | `{ status: "completed" } \| { status: "skipped_busy" } \| { status: "failed", error }` | Never throws |

`executor.ts`, `chat/route.ts`, `webhook/telegram/route.ts` — none of these change.

---

## Files to Touch

| File | Change |
|------|--------|
| `src/lib/runner/execute-run.ts` | **Create** — shared `executeRun()` function |
| `src/lib/runner/run-agent.ts` | **Modify** — shrink to ~50 lines, delegate to `executeRun()` |
| `src/lib/runner/run-autopilot.ts` | **Modify** — shrink to ~25 lines, delegate to `executeRun()` |
| `src/lib/runner/__tests__/execute-run.test.ts` | **Create** — tests for shared logic |
| `src/lib/runner/__tests__/run-agent.test.ts` | **Modify** — update mocks, may need to mock `executeRun` |
| `src/lib/runner/__tests__/run-autopilot.test.ts` | **Modify** — update mocks |

**No changes to callers:**
- `app/api/chat/route.ts` — unchanged
- `app/api/webhook/telegram/route.ts` — unchanged
- `src/lib/triggers/executor.ts` — unchanged
- `src/lib/approvals/continue-after-approval.ts` — unchanged

---

## Drift from References

| Pattern | Dorabot | Deep Agents | Sunder (proposed) | Drift? |
|---------|---------|-------------|-------------------|--------|
| Composition root | `streamAgent()` — one function for both modes | `create_deep_agent()` — one factory | `executeRun()` — shared core, two wrappers | Minor — wrappers handle mode-specific plumbing (quota, queue, error contract). References don't have these concerns. |
| Streaming vs. non-streaming | `runAgent()` collects, `streamAgent()` yields — both are top-level | Caller picks `invoke()` vs `astream()` | Branch inside `executeRun()` on `modelCall` flag | Aligned — same branch point, different API surface |
| Lock/concurrency | Not relevant (single-process CLI) | Not relevant (LangGraph sessions) | Wrappers own lock + busy logic | Justified — serverless needs explicit locking |
| Error contract | Returns result (no separate error type) | Graph handles errors internally | `runAgent` throws, `runAutopilot` returns `{ status: "failed" }` | Justified — preserves existing caller contracts |

**No unjustified drift.**

---

## AI SDK v6 API Notes

Current code uses these AI SDK v6 shapes (verified against source):

```typescript
// Streaming (run-agent.ts:288)
streamText({
  stopWhen: stepCountIs(MAX_STEPS),  // NOT maxSteps (v5)
  // ...
  onFinish: ({ text, steps, totalUsage }) => { ... }
})

// Non-streaming (run-autopilot.ts:91-95)
generateText({
  stopWhen: stepCountIs(MAX_STEPS),  // NOT maxSteps (v5)
  // ...
})
// result.totalUsage (NOT result.usage)
// result.steps, result.text
```

`executeRun` must use `stopWhen: stepCountIs()` and `result.totalUsage`, not the v5 `maxSteps` / `result.usage`.

---

## Testing Strategy

1. **`execute-run.test.ts`** — test the shared core in isolation:
   - Context assembly called with correct params for both modes
   - Tools created with correct permissions per mode
   - `streamText` called when `modelCall: "stream"`
   - `generateText` called when `modelCall: "generate"`
   - `finalizeRun` called with correct args in both modes

2. **`run-agent.test.ts`** — test wrapper concerns only:
   - Quota consumption and rollback
   - User message creation
   - Enqueue on busy thread
   - Delegates to `executeRun` with correct config

3. **`run-autopilot.test.ts`** — test wrapper concerns only:
   - Returns `skipped_busy` on lock failure
   - Catches errors, returns `{ status: "failed", error }`
   - Calls `completeRun(failed)` on error
   - Delegates to `executeRun` with correct config (no mutations, no browser, pulse instructions)

---

## Implementation Order

1. Create `execute-run.ts` with the shared logic (copy from `run-agent.ts`, parameterize the 7 differences)
2. Write `execute-run.test.ts` — verify both streaming and non-streaming paths
3. Rewrite `run-agent.ts` to delegate to `executeRun()`
4. Update `run-agent.test.ts` mocks
5. Rewrite `run-autopilot.ts` to delegate to `executeRun()`
6. Update `run-autopilot.test.ts` mocks
7. Run full test suite — verify zero behavior changes
8. Commit: `refactor: unify runner pipeline — extract shared executeRun() from runAgent/runAutopilot`
