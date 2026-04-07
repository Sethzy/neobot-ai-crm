---
date: 2026-04-07
topic: tool-approval-system
---

# Tool Approval System (Human-in-the-Loop)

## Problem Frame

Sunder's agent has tools that require user confirmation before execution — activating connection tools, deleting records, modifying CRM schema. Today these are gated by a clunky workaround: the system prompt instructs the model to call `ask_user_question` (a generic Q&A widget) before calling the gated tool. This creates a double-interruption flow where the user sees a question card ("Approve activating Gmail tools?") followed by the actual tool execution — two steps where the competitor (Tasklet) has one.

The root cause: Sunder previously implemented the AI SDK's native `needsApproval: true` pattern but removed it (PR reviewed 2026-04-01, see `docs/product/handovers/2026-04-01-approval-flow-review.md`). The removal was driven by a state sync bug — the client sent approval responses, but the stateful runner reloaded messages from DB where the approval wasn't persisted yet, causing `MissingToolResultsError` and infinite loops.

The `ask_user_question` replacement works mechanically but produces a bad UX, especially for `manage_activated_tools_for_connections` where the flow is: ask_user_question → user approves → agent calls manage tool → tools activate → agent tries to use tools → tools not available (loaded at run start). The user sees ~10 tool calls and multiple approval widgets for what should be a one-click "Grant permissions" card.

**Tasklet comparison:** User says "check my emails" → agent calls `manage_activated_tools_for_connections` → single "Grant permissions to agent?" card with tool badges → user clicks Grant → tools activate → agent immediately uses `GMAIL_FETCH_EMAILS`. Two steps, one card, same run.

## Requirements

- R1. **Re-enable `needsApproval` on gated tools.** The AI SDK's native `needsApproval: true` property is restored on: `manage_activated_tools_for_connections`, `delete_records`, `delete_connection`, `configure_crm`, and `manage_active_triggers` (conditional: only when `action === "delete"`). The SDK handles streaming `approval-requested` parts to the client automatically.
- R2. **Approval persistence in the chat route.** When the client sends an approval response (call 2 of the two-call flow), `app/api/chat/route.ts` persists the approval decision to DB before starting a new runner invocation. The runner reloads from DB and finds the complete tool call with its result. No race condition.
- R3. **Single-card UX.** Each gated tool call produces exactly one approval UI card in chat. No `ask_user_question` precursor. The card shows what the tool will do and provides Approve/Deny buttons. For `manage_activated_tools_for_connections`, the existing `PermissionCard` component (currently dead code at `tool-call-inline.tsx:317-377`) is revived.
- R4. **Mid-run tool injection after approval.** After `manage_activated_tools_for_connections` is approved and executes, newly activated connection tools are available in the same run. The runner reloads `loadActivatedConnectionTools()` between steps (not once at run start).
- R5. **Deny handling.** When the user clicks Deny, the tool result reflects the denial (`userAction: 'skipped'`). The model sees this and responds appropriately ("OK, I won't activate those tools"). The system prompt includes instructions to not retry denied tool calls.
- R6. **Remove `ask_user_question` gating.** The `<safety>` section of `system-prompt.ts` is updated: gated tools no longer require `ask_user_question` confirmation. Tool descriptions that reference `ask_user_question` are updated. The `ask_user_question` tool itself remains for its primary purpose (asking the user clarifying questions).
- R7. **Subagent exclusion preserved.** Subagents cannot call gated tools. This existing restriction in `tool-registry.ts` is unchanged.

## Success Criteria

- User says "connect my Gmail" → OAuth card → connected. User says "check my last 3 emails" → single "Grant permissions?" card → user clicks Grant → emails displayed. Total: 2 approval cards, 0 `ask_user_question` widgets.
- `delete_records`, `configure_crm`, `delete_connection` each show a single confirmation card before executing.
- No `MissingToolResultsError` or infinite loops on approval flow.
- Newly activated connection tools are usable in the same run (no "tool not found" after approval).

## Scope Boundaries

- **No manual filter UI for approvals.** The card shows the tool's input; users approve or deny. No editing the input before approving.
- **No approval persistence table changes.** The existing `approval_events` table (dead code) may be reused or removed. Approval state is persisted as normal tool call + tool result messages in the thread's message history.
- **No Telegram approval flow.** Telegram channel approval is a separate follow-up. Web chat only.
- **No "remember my choice" / auto-approve.** Every gated tool call requires explicit approval. Auto-approve is a future enhancement.
- **No approval timeout.** The approval card stays active until the user acts. No server-side expiration.

## Key Decisions

### Two-call flow via AI SDK `needsApproval` (not blocking tools)

The AI SDK's `needsApproval` pattern is a two-call flow:
1. **Call 1:** `streamText` → model calls tool → SDK intercepts, streams `approval-requested` → run ends.
2. **Call 2:** Client sends approval response → `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-triggers → server persists approval, starts new run → tool executes.

We considered a "blocking tool" pattern (tool holds execution open until user acts) but this is incompatible with serverless compute (Vercel Functions have timeouts). The two-call flow is the SDK's designed pattern and works natively with `streamText`, `useChat`, and `toUIMessageStreamResponse()`.

### Persist-then-resume (fixing the original bug)

The original bug: call 2 hit the chat route, the runner reloaded from DB, but the approval response wasn't in DB yet. Fix: the chat route handler detects incoming approval responses, persists them to DB as tool result messages, THEN starts the runner. The runner reloads from DB and finds everything.

### Tool injection: pre-load all, gate via `prepareStep`

`prepareStep` can only **filter** the tools already passed to `streamText({ tools })` — it cannot add new ones. This means mid-run tool injection by reloading connection tools in `prepareStep` won't work.

**Solution:** At run start, `loadActivatedConnectionTools()` loads ALL tools for active connections (both activated and deactivated), but `prepareStep` filters to only the currently-activated slugs. After `manage_activated_tools_for_connections` executes and activates new tools in DB, the next `prepareStep` call re-queries activated slugs and includes them. The tools were already in the `tools` object — they're just newly unfiltered.

This adds ~1-2s to run startup (loading ~60 Gmail tools instead of ~4) but is the only way to enable mid-run tool availability without restructuring the runner from `streamText` to a manual step loop.

## Architecture

```
Call 1 (user sends message):
  chat route → runAgent() → streamText({
    tools: { ..., manage_activated_tools: { needsApproval: true } },
    // ALL connection tools pre-loaded (activated + deactivated)
    // prepareStep gates to only activated slugs
  })
    → model calls manage_activated_tools
    → SDK sees needsApproval → streams approval-requested part
    → run ends → finalizeRun() persists messages to DB
    → client renders PermissionCard with Approve/Deny buttons

Call 2 (auto-sent after user clicks Approve):
  chat route receives approval response in message array
    → getApprovalResponses() extracts decisions    [ALREADY IMPLEMENTED]
    → resolveApprovalEvent() updates approval_events table  [ALREADY IMPLEMENTED]
    → starts new runAgent() with input: ""          [ALREADY IMPLEMENTED]
    → runner loads ALL connection tools (activated + deactivated)  [NEW]
    → assembleContext() loads messages from DB
    → streamText starts — SDK sees approved tool call in history
    → SDK executes manage_activated_tools_for_connections
    → tool activates tools in DB
    → prepareStep re-queries activated slugs → newly activated tools now unfiltered  [NEW]
    → model sees tool result, calls GMAIL_FETCH_EMAILS (now available)
```

### What's already implemented (not dead code)

The chat route (`app/api/chat/route.ts:106-322`) already handles the full approval continuation flow:
- `getApprovalResponses()` extracts approval responses from the client's message array
- `isApprovalContinuation` flag triggers empty-input run
- `resolveApprovalEvent()` persists to `approval_events` table before starting runner
- `runAgent()` called with `input: ""`

### What's actually needed

1. **Re-add `needsApproval: true`** to the 5 tool files (one-line change each)
2. **Re-wire frontend**: restore `sendAutomaticallyWhen`, `addToolApprovalResponse` in `chat-panel.tsx`
3. **Pre-load all connection tools**: change `loadActivatedConnectionTools()` to load ALL tools for active connections
4. **`prepareStep` filtering**: query activated slugs each step, return `activeTools` to gate connection tools
5. **Verify message format**: ensure `assembleContext()` reconstructs messages with approval state that `streamText` can process in call 2
6. **Remove `ask_user_question` gating**: update system prompt and tool descriptions

## Dependencies / Assumptions

- AI SDK v6 `needsApproval` works with `streamText` + `stopWhen: stepCountIs(N)`. Need to verify the step counter behavior when an approval interrupts the loop.
- `toUIMessageStreamResponse()` correctly streams `approval-requested` parts. Already confirmed in AI SDK docs.
- `addToolApprovalResponse` from `useChat` is already destructured in `chat-panel.tsx` (dead code). Needs to be re-wired.
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` was previously in `chat-panel.tsx` and removed. Needs to be restored.
- The `PermissionCard` component in `tool-call-inline.tsx` renders based on `state === "approval-requested"`. This will work once `needsApproval` is back.
- `prepareStep` in `streamText` can modify the tool set between steps. Need to verify this supports adding new tools (not just filtering `activeTools`).

## Outstanding Questions

### Resolved by stress test

- [Affects R2][RESOLVED] Chat route approval handling is **already implemented** (`route.ts:106-322`). `getApprovalResponses()`, `resolveApprovalEvent()`, and `isApprovalContinuation` flow all work.
- [Affects R4][RESOLVED] `prepareStep` can only **filter** existing tools via `activeTools`, not add new ones. Solution: pre-load ALL connection tools at run start, gate via `prepareStep` filtering. See "Key Decisions" section.
- [Affects R4][RESOLVED] Call 2 starts a fresh `runAgent()` → fresh `streamText()` → step count resets to 0. It's a completely new run, not a continuation.
- [Affects R2][RESOLVED — ROOT CAUSE FOUND] **Message format compatibility.** `resolveApprovalEvent()` updates the `approval_events` table but does NOT update the tool call part's state in `conversation_messages`. When `assembleContext()` reloads, the part still says `state: "approval-requested"`. **Fix:** After `resolveApprovalEvent()` in the chat route, add a JSONB update on the `conversation_messages.parts` column to patch the tool part state from `approval-requested` to `approval-responded` (with approval decision). This is the single missing write that caused the original bug.

### Still needs verification during implementation

- [Affects R2][Must verify] After patching the message part state in DB, does `convertToModelMessages()` correctly handle `approval-responded` parts? i.e., does `streamText` recognize "this tool was approved, execute it now" from the loaded messages? Test with one tool before wiring all 5.
- [Affects R4][Measure] **Pre-loading cost.** Loading ALL tools for active connections (e.g., 60 Gmail + 89 Google Drive = 149 tools) at every run start adds latency and token overhead. Measure startup time and context token cost. Cap: only pre-load for connections that have ≥1 activated tool.
- [Affects R1][Known pitfall] AI SDK issue #13307: duplicate `toolCallId` on message rehydration. Need deduplication logic or format that avoids this.
- [Affects R1][Known pitfall] AI SDK issue #11423: `sendAutomaticallyWhen` may not send custom `body` options. Verify with latest SDK version.
- [Affects R5][Needs testing] When user denies, what state does the SDK produce? Test the deny flow end-to-end.

### Deferred to planning

- [Affects R4][Optimization] Alternative to pre-loading: make `manage_activated_tools_for_connections` a `stopWhen` trigger so it never executes in call 1. Call 2 starts fresh with newly activated tools already loaded. Eliminates pre-loading but adds complexity.
- [Affects R6][Technical] System prompt changes: remove `<safety>` GATED section for these tools, update tool descriptions, add "do not retry denied tool calls" instruction.

## Existing Infrastructure (Dead Code to Revive)

From the previous `needsApproval` implementation (removed 2026-04-01):

| Component | Location | Status |
|-----------|----------|--------|
| `PermissionCard` | `src/components/chat/tool-call-inline.tsx:317-377` | Dead code — renders but never triggered (no `approval-requested` state) |
| `addToolApprovalResponse` | `src/components/chat/chat-panel.tsx` | Destructured from `useChat` but unused |
| `sendAutomaticallyWhen` | `src/components/chat/chat-panel.tsx` | Removed — needs restoration |
| `approval_events` table | `supabase/migrations/20260310...` | Dead table — decide: reuse or drop |
| `createApprovalEvent` / `resolveApprovalEvent` | `src/lib/approvals/queries.ts` | Dead code |
| `extractApprovalRequests` | `src/lib/runner/run-persistence.ts` | Dead code |
| `Confirmation` component | `src/components/ai-elements/confirmation.tsx` | Dead code (separate from PermissionCard) |
| Tool `needsApproval` properties | 5 tool files in `src/lib/runner/tools/` | Removed — needs restoration |

## AI SDK Reference

- Cookbook: https://ai-sdk.dev/cookbook/next/human-in-the-loop
- Tool calling docs: https://ai-sdk.dev/docs/concepts/tool-calling#tool-execution-approval
- `useChat` reference: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Known issues: #13307 (duplicate toolCallId), #11423 (sendAutomaticallyWhen body), #10980 (streaming bugs with approval)

## Verdict: GO

The AI SDK `needsApproval` pattern works with Sunder's stateful runner. The original bug was a single missing DB write: `resolveApprovalEvent()` updated `approval_events` but not `conversation_messages.parts`. The fix is a JSONB patch in the chat route.

Most infrastructure already exists as dead code from the previous attempt. Net-new work is small:

| Work item | Effort | Risk |
|-----------|--------|------|
| Re-add `needsApproval: true` to 5 tool files | Trivial (one-line each) | None |
| JSONB patch in chat route after `resolveApprovalEvent()` | Small | **#1 risk** — must verify `convertToModelMessages()` handles patched state correctly |
| Restore `sendAutomaticallyWhen` + `addToolApprovalResponse` in `chat-panel.tsx` | Small | SDK issue #11423 (body options) — verify with latest version |
| Pre-load all connection tools + `prepareStep` filtering | Medium | Token/latency cost of 149 tool definitions — measure |
| Update system prompt + tool descriptions | Small | None |
| Test round-trip with `manage_activated_tools_for_connections` | Medium | End-to-end validation |

## Next Steps

→ `/plan` for structured implementation planning. Start with `manage_activated_tools_for_connections` as the proof-of-concept (highest UX impact, validates the full round-trip). Wire other gated tools after the pattern is proven.
