# Sunder Agent Harness Fixes — Deep Agents Reference

**Status:** Design doc (discussion complete, not yet implemented)
**Date:** 2026-03-23
**Reference codebase:** [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) (local: `/Users/sethlim/Documents/deepagents`)
**Related audit:** `docs/product/references/2026-03-23-sunder-vs-deepagents-agent-architecture-audit.md`
**Scope:** Three unjustified drifts from Deep Agents patterns that are independent of the context pipeline redesign (see `01-context-pipeline-design-doc.md` for that work).

---

## Executive Summary

Three fixes, all small, all independent of each other. Can be shipped as one PR.

| Fix | Effort | Risk if not fixed |
|-----|--------|-------------------|
| Collapse `runAgent` / `runAutopilot` into one runner | Half-day refactor | Policy drift between chat and autopilot; duplicated maintenance |
| Exclude todo tools from subagents | One line | Subagent accidentally reads/modifies parent's task list |
| Swap approval persistence order | Swap two blocks | User sees approve button that silently fails |

---

## Fix 1: Collapse Duplicated Runner

### Deep Agents Pattern

**File:** `libs/deepagents/deepagents/graph.py` (lines 83-332)

Deep Agents has one composition root: `create_deep_agent()`. It returns a compiled graph. The caller decides how to invoke it:

```python
# Streaming
async for chunk in agent.astream({"messages": [HumanMessage("hello")]}):
    ...

# Non-streaming
result = agent.invoke({"messages": [HumanMessage("hello")]})
```

The orchestration logic (middleware assembly, tool registration, subagent setup, caching placement) is written exactly once. Execution mode is the caller's concern, not the graph's.

### Current Sunder Code

Two separate files with ~60% shared logic:

**`src/lib/runner/run-agent.ts`** — interactive chat runs (streaming)
**`src/lib/runner/run-autopilot.ts`** — background trigger runs (non-streaming)

#### Duplicated operations (identical logic, written twice)

| Operation | `run-agent.ts` | `run-autopilot.ts` |
|-----------|---------------|-------------------|
| `markStaleRunsFailed()` | line 176 | line 48 |
| `createRun()` | line 179 | line 50 |
| `assembleContext()` | line 240 | line 56 |
| Composio tool loading | lines 215-228 (parallel) | lines 72-77 (sequential) |
| Tool combination (`{...runner, ...subagent, ...composio}`) | lines 269-273 | lines 96-100 |
| CRM config loading | lines 230-236 | implicit in assembleContext |

#### Actual differences (5 things, all small)

| Concern | `runAgent` (chat) | `runAutopilot` (trigger) |
|---------|-------------------|-------------------------|
| Model call | `streamText()` | `generateText()` |
| On busy thread | Enqueue message, return `"queued"` | Return `"skipped_busy"` (no queue) |
| User message | Created in DB before model call | None |
| Quota | Consumed (with rollback guard) | Not consumed |
| Finalization | In `onFinish` callback (async) | Directly after `generateText()` returns |

### Proposed Fix

One `runAgent()` function with a config object for the 5 differences:

```typescript
interface RunConfig {
  // Required
  clientId: string
  threadId: string
  supabase: SupabaseClient

  // Mode flags (the 5 differences)
  streaming: boolean          // streamText vs generateText
  queueOnBusy: boolean        // enqueue vs skip
  consumeQuota: boolean       // quota consumption + rollback
  createUserMessage: boolean  // persist inbound message to DB
  instructions?: string       // override system prompt (autopilot)

  // Existing payload fields
  input: string
  triggerType: TriggerType
  channel: Channel
  fileParts?: FilePart[]
  crmMode?: CrmMode
  includeConfigTool?: boolean
  modelId?: string
}
```

The shared logic (lock acquisition, context assembly, tool creation, Composio loading, finalization) is written once. The 5 differences become conditional branches:

```typescript
async function runAgent(config: RunConfig): Promise<RunAgentResult> {
  // 1. Quota (conditional)
  if (config.consumeQuota) {
    await consumeMessageQuota(config.supabase, config.clientId)
  }

  // 2. Lock (shared)
  await markStaleRunsFailed(config.supabase, { threadId: config.threadId })
  const lockResult = await createRun(config.supabase, { ... })

  if (!lockResult.created) {
    // 3. Busy handling (conditional)
    if (config.queueOnBusy) {
      await enqueueMessage(config.supabase, { ... })
      return { status: "queued" }
    }
    return { status: "skipped_busy" }
  }

  // 4. User message (conditional)
  if (config.createUserMessage) {
    await createMessages(config.supabase, [{ ... }])
  }

  // 5. Context + tools (shared)
  const [crmConfig, composioTools] = await loadExecutionDeps(config)
  const { system, messages } = await assembleContext({ ... })
  const tools = buildToolSet(config, crmConfig, composioTools)

  // 6. Model call (conditional)
  if (config.streaming) {
    return streamingRun(system, messages, tools, config)
  } else {
    return blockingRun(system, messages, tools, config)
  }
}
```

`runAutopilot()` becomes a thin wrapper:

```typescript
export async function runAutopilot(opts: AutopilotOpts): Promise<RunAgentResult> {
  return runAgent({
    ...opts,
    streaming: false,
    queueOnBusy: false,
    consumeQuota: false,
    createUserMessage: false,
    instructions: AUTOPILOT_INSTRUCTION_PROMPT,
    triggerType: "pulse",
  })
}
```

### Drift from Deep Agents

None. This aligns us with their single-composition-root pattern. The only structural difference is that we branch on `streaming` at call time (because we're serverless) vs. their caller-picks-invocation-style pattern (because they return a graph). Same principle.

### Files to Touch

| File | Change |
|------|--------|
| `src/lib/runner/run-agent.ts` | Refactor to accept `RunConfig`, absorb shared logic |
| `src/lib/runner/run-autopilot.ts` | Reduce to thin wrapper calling `runAgent()` with autopilot config |
| `app/api/chat/route.ts` | Update `runAgent()` call signature |
| `app/api/webhook/telegram/route.ts` | Update `runAgent()` call signature |
| `src/lib/runner/run-autopilot.ts` callers | Search for `runAutopilot` imports, verify they still work with wrapper |

### Tests

- [ ] Chat run: `streaming: true`, quota consumed, user message created, queues on busy
- [ ] Autopilot run: `streaming: false`, no quota, no message, skips on busy
- [ ] Composio failure doesn't block either mode
- [ ] Lock contention handled correctly in both modes
- [ ] `onFinish` / direct finalization both call `finalizeRun()` with same arguments

---

## Fix 2: Subagent Todo Isolation

### Deep Agents Pattern

**File:** `libs/deepagents/deepagents/middleware/subagents.py` (line 127)

```python
_EXCLUDED_STATE_KEYS = {"messages", "todos", "structured_response",
                        "skills_metadata", "memory_contents"}
```

Before invoking a subagent, parent state is filtered:

```python
# line 426
subagent_state = {k: v for k, v in runtime.state.items()
                  if k not in _EXCLUDED_STATE_KEYS}
subagent_state["messages"] = [HumanMessage(content=description)]
```

After subagent completes, result is filtered:

```python
# line 412
state_update = {k: v for k, v in result.items()
                if k not in _EXCLUDED_STATE_KEYS}
```

**Test validation** (`tests/unit_tests/test_subagents.py`, line 545):
```python
assert "todos" not in result, "Parent agent state should not contain todos key"
```

Todos are explicitly excluded in both directions. The subagent has its own `TodoListMiddleware` instance — its todos live and die within the subagent's execution.

### Current Sunder Code

**File:** `src/lib/runner/tools/subagents/run-subagent.ts` (line 53)

```typescript
const { runId } = await createSubagentRun(supabase, {
  threadId,      // ← parent's threadId passed through
  clientId,
  parentRunId: options.parentRunId,
});
```

**File:** `src/lib/runner/tools/utility/todo.ts` (line 170)

```typescript
let query = supabase
  .from("agent_todo")
  .select("*")
  .eq("thread_id", threadId)   // ← parent's threadId
  .eq("client_id", clientId)
```

The subagent reads and writes the same `agent_todo` rows as the parent. If the subagent creates a todo during its 9-step execution, it appears in the parent's todo list. If the subagent marks a parent todo as done, the parent loses it.

This is a scratchpad leak. Shared memory files (SOUL.md, USER.md) are intentional — the subagent needs user context. Shared todos are not.

### Proposed Fix

Exclude todo tools from subagent tool sets entirely.

**File:** `src/lib/runner/tool-registry.ts`

```typescript
// Current (todo tools always included):
const todoTools = createTodoTools(supabase, clientId, threadId);

// Fix (exclude for subagents):
const todoTools = isSubagent ? {} : createTodoTools(supabase, clientId, threadId);
```

One line. A subagent running for 9 steps doesn't need a persistent task list. Any planning happens in chain-of-thought.

### Why not give subagents their own todo scope?

We considered passing a synthetic `threadId` (e.g., the subagent's `runId`) so todos are scoped to the subagent only. But this adds complexity for no benefit — the todos would be orphaned after the run completes. Deep Agents' approach (exclude entirely) is simpler and correct.

### Drift from Deep Agents

None. We're aligning with their explicit exclusion of `todos` from subagent state.

### Files to Touch

| File | Change |
|------|--------|
| `src/lib/runner/tool-registry.ts` | Exclude todo tools when `isSubagent: true` |

### Tests

- [ ] Subagent tool set does not include `manage_todo` or `search_todos`
- [ ] Parent todo list unchanged after subagent execution
- [ ] Subagent still has access to CRM tools, storage tools, utility tools (minus todo)

---

## Fix 3: Approval Persistence Order

### Deep Agents Pattern

**File:** `libs/deepagents/deepagents/graph.py` (lines 300-301)
**Test:** `libs/evals/tests/evals/test_hitl.py` (lines 46-102)

Deep Agents uses LangGraph checkpointing. When an interrupt fires, the entire agent state (messages + interrupt metadata) is checkpointed atomically. There's no separate "approval record" — the interrupt IS the state. Can't have an orphaned UI card without a backing record because they're the same thing.

Resume is equally atomic:
```python
agent.invoke(Command(resume={"decisions": [{"action": "approve"}]}),
             config={"configurable": {"thread_id": thread_id}})
```

The checkpointer retrieves the interrupted state, applies the decision, and continues. No race condition possible.

### Current Sunder Code

**File:** `src/lib/runner/run-persistence.ts` (lines 147-210)

Two separate database writes in `finalizeRun()`:

```
Step 1 (line 147): Insert assistant message with approval-requested tool parts
Step 2 (line 159): Insert approval_events rows (one per gated tool call)
Step 3 (line 210): Mark run as completed
```

The failure scenario:

1. Step 1 succeeds — assistant message saved to `conversation_messages`. Chat UI renders the message, including the approval card (rendered from the `approval-requested` tool part).
2. Step 2 fails — `approval_events` row not created. Could be network timeout, constraint violation, etc.
3. User sees the approval card in the chat UI. Clicks "Approve."
4. `resolveApprovalEvent()` queries `approval_events` for the approval ID. Finds nothing.
5. Silent failure. The button does nothing.

The code partially handles this — it catches the error and marks the run as `"partial"` instead of `"completed"` (line 186-192). But the user-facing experience is broken.

### Proposed Fix

Swap the persistence order: create approval events BEFORE the assistant message.

```
Step 1: Insert approval_events rows (status: "pending")
Step 2: Insert assistant message (with approval-requested tool parts)
Step 3: Mark run as completed
```

**Why this is safe:**

- If Step 1 fails → no approval row, no message saved → user sees nothing → no orphan. Clean failure.
- If Step 2 fails → orphan approval row with no matching UI card → harmless. A pending approval with no visible card is invisible to the user. It either expires or gets cleaned up. The user never sees a broken button.

The harmful failure mode (orphaned UI card with no backing record) becomes the harmless one (orphaned DB row with no visible card).

### Alternatives Considered

**Supabase RPC (single transaction):** A stored function that inserts both atomically. Correct but adds stored proc maintenance overhead. Overkill for this fix.

**Retry with backoff:** Retry the approval event insert if it fails. Doesn't eliminate the window — just narrows it. Also masks underlying failures.

### Drift from Deep Agents

We're not adopting their checkpointer model (justified — we chose follow-up-run approvals for our stack). But we're fixing the persistence order to eliminate the inconsistency window that their atomic checkpointing avoids naturally.

### Files to Touch

| File | Change |
|------|--------|
| `src/lib/runner/run-persistence.ts` | In `finalizeRun()`, move approval event creation before message persistence |

### Tests

- [ ] Approval events exist in DB before assistant message is persisted
- [ ] If approval event insert fails, assistant message is NOT persisted
- [ ] If message insert fails after approval events succeed, orphan approval rows are harmless (can be cleaned up or expire)
- [ ] Happy path unchanged: approval card renders, user clicks approve, continuation works

---

## Implementation Order

These three fixes are independent. They can be done in any order within the same PR. Suggested order (least to most invasive):

1. **Fix 2: Subagent todo isolation** — one line change, zero risk
2. **Fix 3: Approval persistence order** — swap two blocks, low risk
3. **Fix 1: Collapse duplicated runner** — refactor, medium risk (most code moved)

Commit message: `fix: agent harness — runner dedup, subagent isolation, approval persistence`

---

## Deep Agents Reference Files

| File | Relevant Pattern | Lines |
|------|-----------------|-------|
| `libs/deepagents/deepagents/graph.py` | Single composition root | 83-332 |
| `libs/deepagents/deepagents/middleware/subagents.py` | `_EXCLUDED_STATE_KEYS`, state filtering | 127, 402-428 |
| `libs/evals/tests/evals/test_hitl.py` | Atomic checkpoint interrupt/resume | 46-102 |
| `libs/deepagents/tests/unit_tests/test_subagents.py` | Todo exclusion test | 545 |
