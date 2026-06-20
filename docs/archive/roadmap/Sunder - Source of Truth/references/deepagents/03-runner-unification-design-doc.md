# Runner Unification — Design Doc

**Status:** Design doc v3 (simplified approach)
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

Every future runner improvement (context pipeline, prompt caching, lazy connections) requires changes in both files.

---

## Reference Pattern

Dorabot has one runner function (`streamAgent`). Both chat and pulse call it with different parameters. The runner doesn't know who triggered it.

---

## Approach: Make `runAutopilot` a thin wrapper around `runAgent`

No new files. No `executeRun()`. No config types. Just make autopilot call the same function chat uses, wait for the stream to finish, and discard it.

This is the dorabot pattern: both modes use the same runner. Autopilot just doesn't show the stream to anyone.

### The wrapper

```typescript
export async function runAutopilot({
  clientId, threadId, supabase,
}: RunAutopilotInput): Promise<RunAutopilotResult> {
  try {
    const result = await runAgent({
      clientId,
      threadId,
      input: "",
      triggerType: "pulse",
      channel: "web",
      consumeMessageQuota: false,
      instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    }, supabase);

    if (result.status === "streaming") {
      // consumeStream({ onError }) waits for the full stream including onFinish
      // (which calls finalizeRun) and detects failures. Do NOT use .text — it
      // resolves before onFinish fires. The onError callback catches:
      // 1. Stream errors → runAgent's onError calls recordFailedRun, then stream
      //    errors, consumeStream catches and calls our onError.
      // 2. onFinish/finalizeRun errors → flush() catches, controller.error(),
      //    stream errors, consumeStream catches and calls our onError.
      let streamError: unknown = null;
      await result.streamResult.consumeStream({
        onError: (error: unknown) => { streamError = error; },
      });

      if (streamError) {
        const message = streamError instanceof Error
          ? streamError.message
          : "Stream consumption failed";
        return { status: "failed", error: message };
      }

      return { status: "completed" };
    }

    // "queued" from runAgent means thread was busy and pulse was not
    // enqueued (pulse guard in runAgent skips enqueue).
    return { status: "skipped_busy" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown autopilot error";

    // Note: runAgent's recordFailedRun already marked the run as failed
    // and emitted analytics before throwing. We just translate the error
    // contract from "throw" to "return { status: failed }".
    return { status: "failed", error: message };
  }
}
```

### Changes needed inside `runAgent`

`runAgent` currently assumes a chat-like caller. Four small changes make it work for pulse too:

#### 1. Don't enqueue pulse messages on busy thread

**Current** (`run-agent.ts:182-192`):
```typescript
if (!lockResult.created) {
  await enqueueMessage(supabase, { ... });
  return { status: "queued" };
}
```

**Change to:**
```typescript
if (!lockResult.created) {
  if (payload.triggerType === "pulse") {
    return { status: "queued" }; // wrapper interprets as skipped
  }
  await enqueueMessage(supabase, { ... });
  return { status: "queued" };
}
```

The wrapper maps `"queued"` → `"skipped_busy"`. No enqueue for pulse.

#### 2. Don't create user message for pulse

**Current** (`run-agent.ts:196`):
```typescript
if (payload.triggerType !== "cron") {
```

**Change to:**
```typescript
if (payload.triggerType !== "cron" && payload.triggerType !== "pulse") {
```

Pulse has no inbound user message to persist.

#### 3. Add `instructions` to schema and pass through

**Add to `schemas.ts:19`:**
```typescript
export const runnerPayloadSchema = z.object({
  // ... existing fields ...
  instructions: z.string().optional(),  // NEW: autopilot instruction override
});
```

**Pass to `assembleContext` (`run-agent.ts:241`):**
```typescript
const { system, messages } = await assembleContext({
  // ... existing fields ...
  instructions: payload.instructions,  // NEW
});
```

#### 4. Disable connection mutations for pulse

**Change `run-agent.ts:257-258`:**

Currently `allowConnectionMutations` is not explicitly set (defaults to `true` in `tool-registry.ts:61`).

**Add to `createRunnerTools` call:**
```typescript
const runnerTools = createRunnerTools(supabase, clientId, threadId, {
  allowTriggerMutations: payload.triggerType === "chat",
  allowConnectionMutations: payload.triggerType !== "pulse",  // NEW: false for pulse only (cron/webhook keep true)
  // ... rest unchanged
});
```

### Intentional behavioral changes

This is not a pure refactor. Pulse runs will gain behavior they didn't have before. All are improvements:

| Change | Before (autopilot) | After (pulse via runAgent) | Impact |
|--------|-------------------|---------------------------|--------|
| CRM config | Not loaded | Loaded (~100ms Supabase query) | Agent gets CRM vocabulary in autonomous work. Improvement. |
| CRM config in tools/subagents | Not passed | Passed through | Subagents get same CRM context. Improvement. |
| Analytics | No `agent_run_completed`/`agent_run_failed` events | Emitted (with `trigger_type: "pulse"`) | Pulse runs visible in analytics dashboards. Improvement. |
| Trace name | `sunder-autopilot` | `sunder-pulse` | Cosmetic. Follows `triggerType` convention. |
| Log label | `autopilot` | `runner` | Cosmetic. Unified logging. |

None of these affect callers or break existing behavior. They're side effects of using the richer chat path.

### What about browser/listing tools?

`runAgent` already gates these on `triggerType === "chat"` (lines 248, 252, 258, 261, 263). Pulse gets `triggerType: "pulse"`, so these are already `false`. No change needed.

---

## Complete diff summary

| File | Change | Lines |
|------|--------|-------|
| `src/lib/runner/schemas.ts` | Add `instructions: z.string().optional()` | +1 line |
| `src/lib/runner/run-agent.ts:182` | Skip enqueue for pulse | +3 lines |
| `src/lib/runner/run-agent.ts:196` | Skip user message for pulse | Change `!== "cron"` to `!== "cron" && !== "pulse"` |
| `src/lib/runner/run-agent.ts:241` | Pass `payload.instructions` to `assembleContext` | +1 line |
| `src/lib/runner/run-agent.ts:258` | Add `allowConnectionMutations: triggerType !== "pulse"` | +1 line |
| `src/lib/runner/run-autopilot.ts` | Replace 140 lines with ~25 line wrapper | -115 lines net |

**Total: ~10 lines changed in `run-agent.ts`, ~5 lines in `schemas.ts`, ~25 lines in `run-autopilot.ts` (replacing 140). No new files.**

---

## What changes for callers

**Nothing.** Both public APIs keep their exact signatures and return types:

| Function | Signature | Return type | Error contract |
|----------|-----------|-------------|----------------|
| `runAgent()` | `(payload: RunnerPayload, supabase) → Promise<RunAgentResult>` | `{ status: "streaming", streamResult } \| { status: "queued" }` | Throws on failure |
| `runAutopilot()` | `({ clientId, threadId, supabase }) → Promise<RunAutopilotResult>` | `{ status: "completed" } \| { status: "skipped_busy" } \| { status: "failed", error }` | Never throws |

### Caller matrix (all unchanged)

- `app/api/chat/route.ts` — calls `runAgent()`
- `app/api/webhook/telegram/route.ts` — calls `runAgent()`
- `src/lib/approvals/continue-after-approval.ts` — calls `runAgent()`
- `src/lib/triggers/executor.ts` — calls `runAutopilot()` (pulse), `runAgent()` (non-pulse)
- `src/lib/runner/drain-and-continue.ts` — calls `runAgent()`
- `src/lib/runner/tools/triggers/manage-triggers.ts` — calls `runAgent()`

---

## What changes for tests

**Minimal.** Existing `run-agent.test.ts` tests all pass unchanged — we're only adding behavior for `triggerType: "pulse"`, not changing existing behavior.

`run-autopilot.test.ts` needs updates because the internals are now a wrapper. Tests that mock `generateText` or internal autopilot logic need to instead mock `runAgent` and verify the wrapper's translation.

| File | Change |
|------|--------|
| `src/lib/runner/__tests__/run-agent.test.ts` | Add tests for pulse-specific behavior (no enqueue, no user message) |
| `src/lib/runner/__tests__/run-autopilot.test.ts` | Rewrite to test wrapper (mock `runAgent`, verify contract translation) |
| `src/lib/runner/schemas.ts` | Schema test if one exists (add `instructions` field) |

No changes to: `run-agent-crm-config.test.ts`, `run-agent-tool-error-path.test.ts`, `serialization.test.ts`, `stale-cleanup.test.ts`. These test `runAgent` internals that don't change.

---

## Drift from references

| Pattern | Dorabot | Sunder (proposed) | Drift? |
|---------|---------|-------------------|--------|
| Runner function | One (`streamAgent`) | One (`runAgent`) + thin wrapper | Minimal — wrapper only translates error contract and consumes stream |
| Pulse invocation | Same function, different params | Same function, different params | Aligned |
| Streaming for pulse | `streamAgent` yields to nobody | `streamText` streams to nobody, wrapper awaits `consumeStream({ onError })` | Aligned — same pattern |

---

## Previous approaches considered and rejected

### v1-v2: Extract `executeRun()` into a new file

Created a 150-line `execute-run.ts` with an `ExecuteRunConfig` type. Required updating 6+ test files and restructuring all mocks. Review found the config type was incomplete (7 differences was actually 13), the doc was internally inconsistent, and the test rewrite was bigger than estimated.

**Why rejected:** Over-engineered. The simpler approach (make autopilot call `runAgent`) achieves the same deduplication with ~10 lines of changes instead of ~300.

---

## AI SDK v6 note

**Critical:** `streamText` returns a `StreamTextResult`. The `.text` promise resolves when all steps complete, but **before `onFinish` fires**. This is because `.text` is derived from `._steps.resolve()` (stream-text.ts:1100), which fires before `await notify({ onFinish })` (stream-text.ts:1105).

To wait for `onFinish` (and thus `finalizeRun`) to complete, use `consumeStream({ onError })`:

```typescript
// WRONG — resolves before onFinish:
await streamResult.text;

// WRONG — waits for flush() but silently swallows errors from onFinish:
await streamResult.consumeStream();

// CORRECT — waits for full flush() including onFinish AND detects errors:
let streamError: unknown = null;
await streamResult.consumeStream({
  onError: (error: unknown) => { streamError = error; },
});
if (streamError) { /* handle failure */ }
```

`consumeStream()` (stream-text.ts:2305) awaits the `fullStream`, which doesn't complete until the TransformStream's `flush()` function returns — and `flush()` includes the `await notify({ onFinish })` call. However, bare `consumeStream()` silently swallows errors (consume-stream.ts:26 catches reader errors and only calls an optional `onError` callback). Always pass `onError` when you need to detect failures.

This was verified by reading the AI SDK source at `node_modules/ai/src/generate-text/stream-text.ts`.
