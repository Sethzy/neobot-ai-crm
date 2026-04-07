---
title: "feat: Re-enable AI SDK tool approval system"
type: feat
status: active
date: 2026-04-07
origin: docs/product/ideations/2026-04-07-tool-approval-system.md
---

# feat: Re-enable AI SDK Tool Approval System

## Overview

Restore the AI SDK's native `needsApproval` pattern for gated tools, replacing the current `ask_user_question` workaround. The original implementation was removed (2026-04-01) due to a state sync bug — the approval response was never persisted to the conversation messages table, so the runner reloaded stale state. The fix is a single missing DB write in the chat route, plus re-wiring existing dead code.

Primary motivation: the `manage_activated_tools_for_connections` flow currently takes ~10 tool calls and two approval widgets. With this fix, it's one "Grant permissions?" card — matching the Tasklet reference implementation.

## Problem Statement

(see origin: `docs/product/ideations/2026-04-07-tool-approval-system.md`)

Gated tools (`manage_activated_tools_for_connections`, `delete_records`, `configure_crm`, `delete_connection`, `manage_active_triggers` with delete) are currently gated by system prompt instructions that require the model to call `ask_user_question` before the gated tool. This creates double interruptions: a question card followed by tool execution. The AI SDK has a native `needsApproval` pattern that shows a single approval card, but it was removed due to a DB state sync bug.

**Root cause of the original bug:** `resolveApprovalEvent()` in the chat route updated the `approval_events` table but did NOT update the tool call part's state in `conversation_messages.parts`. When the runner reloaded from DB, the part still said `approval-requested`, causing `MissingToolResultsError` and infinite loops.

## Proposed Solution

### Phase 1: Fix the persistence bug + restore `needsApproval` (MVP)

Add a JSONB patch in the chat route that updates the tool call part's state in `conversation_messages` after `resolveApprovalEvent()`. Re-add `needsApproval: true` to the 5 tool files. Re-wire the frontend approval flow. Test with `manage_activated_tools_for_connections` first.

### Phase 2: Mid-run tool injection for connection tools

Pre-load all connection tools at run start (not just activated ones). Use `prepareStep` to filter to only activated slugs. After `manage_activated_tools_for_connections` activates new tools, `prepareStep` includes them on the next step.

### Phase 3: Cleanup

Remove `ask_user_question` gating from system prompt. Update tool descriptions. Clean up dead approval infrastructure that's no longer needed.

## Technical Approach

### Phase 1: Persistence fix + `needsApproval` restoration

#### 1a. JSONB patch in chat route

**File:** `app/api/chat/route.ts:286-322`

After `resolveApprovalEvent()` succeeds, update the `conversation_messages.parts` JSONB column to patch the tool call part's state from `approval-requested` to `approval-responded`.

```typescript
// After resolveApprovalEvent() at line 296...
// Atomically resolve + patch in a single RPC to prevent partial failure
for (const response of approvalResponses) {
  const resolved = resolutionResults.find(
    (r) => r.success && "event" in r && r.event?.approval_id === response.approvalId
  );
  // Use the DB-authoritative outcome, not the raw client payload.
  // This prevents races where user double-submits or sends conflicting decisions.
  const approvedFromDb = resolved?.event?.status === "approved";

  await patchApprovalPartState(supabase, {
    threadId,
    approvalId: response.approvalId,
    approved: approvedFromDb,
  });
}
```

**New function `patchApprovalPartState`** (in `src/lib/approvals/queries.ts`):

Uses a Postgres JSONB update to find the part with matching `approval.id` and update its `state` to `approval-responded` and set `approval.approved` to the decision. This is a targeted JSONB path update — it preserves all existing fields (`type`, `toolCallId`, `input`, etc.) and only mutates `state` and `approval.approved`.

```sql
UPDATE conversation_messages
SET parts = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'state' = 'approval-requested'
        AND elem->'approval'->>'id' = $approval_id
      THEN jsonb_set(
        jsonb_set(elem, '{state}', '"approval-responded"'),
        '{approval,approved}', $approved::jsonb
      )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(parts) AS elem
)
WHERE thread_id = $thread_id
  AND role = 'assistant'
  AND parts @> $approval_id_filter;
```

**Atomicity requirement (from stress test review):** `resolveApprovalEvent` and `patchApprovalPartState` must succeed or fail together. If `resolveApprovalEvent` succeeds but the JSONB patch fails, `approval_events` says "approved" while `conversation_messages` still says "approval-requested" — recreating the original bug. Options:
- Wrap both in a Supabase RPC that runs them in a single transaction
- Or make `patchApprovalPartState` idempotent and retry on failure

**Use DB outcome as source of truth (from stress test review):** The JSONB patch must use the resolved `approval_events.status` value, NOT the raw `approved` boolean from the client request. This prevents race conditions where the user double-submits or sends conflicting approve/deny decisions.

**Verified (from stress test):**
- `convertToModelMessages()` correctly handles `approval-responded` parts. It emits: assistant `tool-call` + assistant `tool-approval-request` + tool `tool-approval-response`. Source: `node_modules/ai/src/ui/convert-to-model-messages.ts:178-199, 263-277`.
- `streamText()` then executes approved tools before step 0. Source: `node_modules/ai/src/generate-text/stream-text.ts:1348-1500`.
- `ignoreIncompleteToolCalls: true` does NOT interfere — it only drops `input-streaming` and `input-available` states, not approval states.
- Approved tool execution does NOT consume a model step — call 2 gets the full step budget.

#### 1b. Re-add `needsApproval` to 5 tool files

One-line addition to each tool definition, after `inputSchema`:

| File | Line | Change |
|------|------|--------|
| `src/lib/runner/tools/connections/manage-tools.ts` | 33 | Add `needsApproval: true,` |
| `src/lib/runner/tools/crm/configure-crm.ts` | ~325 | Add `needsApproval: true,` |
| `src/lib/runner/tools/crm/delete-records.ts` | ~47 | Add `needsApproval: true,` |
| `src/lib/runner/tools/connections/delete-connection.ts` | ~21 | Add `needsApproval: true,` |
| `src/lib/runner/tools/triggers/manage-triggers.ts` | ~173 | Add `needsApproval: async ({ action }) => action === "delete",` (conditional) |

#### 1c. Re-wire frontend approval flow

**File:** `src/components/chat/chat-panel.tsx`

The approval detection logic already exists (lines 90-95, 132-150). What needs restoration:

1. Import and configure `sendAutomaticallyWhen` from `ai`:
   ```typescript
   import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
   ```
   Add to `useChat` options:
   ```typescript
   sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
   ```

2. Ensure `addToolApprovalResponse` is destructured from `useChat` and passed to message rendering.

3. Verify `PermissionCard` in `tool-call-inline.tsx:317-377` receives `onToolApproval` prop wired to `addToolApprovalResponse`.

**Verified (from stress test):** AI SDK #11423 is fixed in `ai@6.0.117` (installed: 6.0.142). Additionally, the repo transport at `chat-panel.tsx:127-152` already manually injects `selectedChatModel` in `prepareSendMessagesRequest()` for approval continuations.

**Known pitfall (AI SDK #13307):** Duplicate `toolCallId` on message rehydration. Sunder persists and reloads messages from DB. Add deduplication if this surfaces in testing.

#### 1d. Fix `PermissionCard` deny rendering

**File:** `src/components/chat/tool-call-inline.tsx:329-331`

Current logic treats all `approval-responded` as granted:
```typescript
const isGranted = state === "approval-responded" || state === "output-available";
const isDenied = state === "output-denied";
```

Fix: check `approval.approved` for `approval-responded` state:
```typescript
const isGranted = state === "output-available" || (state === "approval-responded" && part.approval?.approved === true);
const isDenied = state === "output-denied" || (state === "approval-responded" && part.approval?.approved === false);
```

This ensures denied approvals render as "Denied" both during live streaming and after page reload from DB.

#### 1e. Persist final approval state after call 2

After call 2 executes the approved tool, `finalizeRun()` persists the new assistant message with tool results. But the ORIGINAL approval card (from call 1) still shows `approval-responded` in DB. For correct reload rendering, patch it to `output-available` (if approved and executed) or `output-denied` (if denied).

This can be done in `finalizeRun()` by checking if any step's response messages contain approval results, and patching the original message's part state accordingly. Alternatively, handle this as a post-run cleanup.

#### 1f. Remove tool description references to `ask_user_question`

**File:** `src/lib/runner/tools/connections/manage-tools.ts:33`

Current description says: "This is a DESTRUCTIVE action — use ask_user_question to confirm with the user before calling."

Update to: "Activates or deactivates tools for connections. Requires user approval before execution."

Similar updates for `delete-connection.ts`, `delete-records.ts`, `configure-crm.ts`.

### Phase 2: Mid-run tool injection

#### 2a. Modify `loadActivatedConnectionTools` to load all tools

**File:** `src/lib/composio/activated-tools.ts:15-31`

Current: loads only activated tool slugs.

New: load ALL tools for active connections. Return both the `ToolSet` and the set of activated slugs.

```typescript
export async function loadAllConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<{ tools: ToolSet; activatedSlugs: Set<string> }> {
  const activeConnections = connections.filter((c) => c.status === "active");
  if (activeConnections.length === 0) {
    return { tools: {}, activatedSlugs: new Set() };
  }

  const activatedSlugs = new Set(
    activeConnections.flatMap((c) => c.activated_tools)
  );

  // Load ALL tools for active connection toolkits
  const allToolSlugs = await getAllToolSlugsForConnections(activeConnections);
  if (allToolSlugs.length === 0) {
    return { tools: {}, activatedSlugs };
  }

  const composio = getComposio();
  const tools = await composio.tools.get(composioUserId, {
    tools: allToolSlugs,
  });

  return { tools, activatedSlugs };
}
```

**Concern:** Loading 60+ Gmail tools + 89 Google Drive tools = 149 tool definitions adds startup latency (~1-2s for Composio API call).

**Important (from stress test review):** Must pre-load ALL active connections, including those with 0 activated tools. The primary flow — Gmail connected but no tools activated yet, user says "check my emails", model calls `manage_activated_tools_for_connections`, user approves, model calls `GMAIL_FETCH_EMAILS` — requires the Gmail tools to be in the `tools` object from run start. Skipping 0-activated connections breaks this path.

**Token cost is not an issue:** `prepareStep` returns `activeTools` which filters what gets sent to the model. Tools excluded by `activeTools` cost 0 prompt tokens. They only cost server-side memory and Composio API fetch time. Typical prompt impact: 4 active tools = ~800-2,000 tokens, not 149 tools worth.

#### 2b. Extend `buildPrepareStep` for connection tool filtering

**File:** `src/lib/runner/run-agent.ts:66-76`

Extend to accept activated slugs and filter connection tools each step:

```typescript
export function buildPrepareStep(
  modelId: string,
  maxSteps: number,
  getActivatedConnectionSlugs: () => Promise<Set<string>>,
  builtinToolNames: string[],
) {
  return async ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= maxSteps - 1) {
      result.activeTools = [];
    } else {
      // Re-query activated slugs each step (catches mid-run activations)
      const activatedSlugs = await getActivatedConnectionSlugs();
      const activeTools = [
        ...builtinToolNames,
        ...activatedSlugs,
      ];
      result.activeTools = activeTools;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}
```

**Where `getActivatedConnectionSlugs` comes from:** A closure that queries `connections` table for current `activated_tools` arrays. ~1ms DB query, negligible relative to LLM call time.

#### 2c. Wire into `runAgent`

**File:** `src/lib/runner/run-agent.ts:237-380`

Change the tool loading at line 237-250:

```typescript
// Before: loadActivatedConnectionTools(connections, clientId)
// After:  loadAllConnectionTools(connections, clientId)
const { tools: composioTools, activatedSlugs: initialActivatedSlugs } =
  await loadAllConnectionTools(connections, clientId);
```

Pass to `buildPrepareStep` at line 380:

```typescript
prepareStep: buildPrepareStep(
  modelId,
  maxSteps,
  async () => {
    // Re-query from DB each step
    const conns = await getActiveConnections(supabase, clientId);
    return new Set(conns.flatMap((c) => c.activated_tools));
  },
  Object.keys(runnerTools),
),
```

### Phase 3: System prompt cleanup

#### 3a. Remove GATED tools section from system prompt

**File:** `src/lib/ai/system-prompt.ts:355-369`

Remove the entire `<safety>` block that lists GATED TOOLS and the 4-step `ask_user_question` protocol. The `needsApproval` SDK mechanism replaces it.

Add a simpler instruction:

```
<safety>
Some tools require your approval before they run. When you see a tool approval card, review the action and approve or deny. If the user denies a tool call, acknowledge it and do not retry the same action.
</safety>
```

#### 3b. Remove `manage_activated_tools_for_connections` from `<external-connections>` gating

**File:** `src/lib/ai/system-prompt.ts:246`

Remove: "manage_activated_tools_for_connections and delete_connection are GATED tools (see <safety>). Never call them without ask_user_question confirmation first."

Replace with: "manage_activated_tools_for_connections requires user approval (the SDK will prompt automatically)."

#### 3c. Add deny-handling instruction

Add to system prompt:

```
When a user denies a tool approval, do not retry the same tool call. Acknowledge the denial and ask how the user would like to proceed instead.
```

## System-Wide Impact

### Interaction Graph

1. Model emits tool call → AI SDK checks `needsApproval` → streams `approval-requested` part
2. `finalizeRun()` persists assistant message with `approval-requested` parts + creates `approval_events` rows
3. Client `PermissionCard` renders → user clicks Approve/Deny → `addToolApprovalResponse()` called
4. `sendAutomaticallyWhen` triggers new request → chat route `POST` handler
5. `getApprovalResponses()` extracts decisions → `resolveApprovalEvent()` updates `approval_events` → **NEW: `patchApprovalPartState()` patches `conversation_messages.parts`**
6. `runAgent()` starts new run → `assembleContext()` loads patched messages → `streamText()` sees `approval-responded` → executes tool

### Error Propagation

- If `patchApprovalPartState()` fails: chat route returns 500, approval not processed. User can retry.
- If `convertToModelMessages()` can't interpret patched state: `streamText` may skip the tool or error. This is the #1 risk — must test before shipping.
- If Composio tool pre-loading fails: graceful fallback to empty `ToolSet` (existing pattern at `run-agent.ts:246-250`).

### State Lifecycle Risks

- **Partial failure between `resolveApprovalEvent` and `patchApprovalPartState`:** approval_events says "approved" but conversation_messages still says "approval-requested". Runner would see stale state. **Mitigation: wrap both in a Supabase RPC / single transaction. Or make `patchApprovalPartState` idempotent with retry.**
- **Race condition on double-submit:** User clicks Approve, network retries, two requests hit the chat route. **Mitigation: patch from DB-authoritative outcome (`approval_events.status`), not raw client payload. `resolveApprovalEvent` already handles `already_resolved` status.**
- **Stale UI after page reload:** Approval card shows `approval-responded` but should show `output-available` (approved+executed) or `output-denied`. **Mitigation: post-call-2 patch in `finalizeRun()` to update original approval part state (see 1e).**
- **User clicks Approve after the thread's run lock is stale:** `createRun()` handles this — the approval continuation queues if another run is active.

### API Surface Parity

- Web chat: full approval flow (this PR)
- Telegram: NOT included. Telegram approval was a separate `continue-after-approval.ts` handler. Defer to follow-up.
- Subagents: excluded from gated tools (existing restriction, unchanged)

## Acceptance Criteria

### Functional
- [ ] `manage_activated_tools_for_connections` shows a single "Grant permissions?" card (no `ask_user_question` precursor)
- [ ] User clicks Approve → tools activate → agent uses newly activated tools in the same run
- [ ] User clicks Deny → agent acknowledges, does not retry
- [ ] `delete_records`, `configure_crm`, `delete_connection` each show a single approval card
- [ ] `manage_active_triggers` with `action: "delete"` shows approval; other actions execute immediately
- [ ] No `MissingToolResultsError` or infinite loops on approval flow
- [ ] Approval cards render correctly for both pending and resolved states

### Non-Functional
- [ ] Run startup latency increase from pre-loading connection tools is <2s
- [ ] No regression on existing tests (939 tests)
- [ ] Gemini Flash 3 works without `thought_signature` errors (the SDK upgrade that fixed this is already in place)

### Quality Gates
- [ ] End-to-end test: connect Gmail → "check my emails" → single permission card → emails shown
- [ ] End-to-end test: "delete this contact" → single approval card → approved → deleted
- [ ] End-to-end test: "delete this contact" → denied → agent acknowledges
- [ ] Unit test: `patchApprovalPartState` correctly updates JSONB parts
- [ ] Unit test: `buildPrepareStep` filters connection tools based on activated slugs

## Dependencies & Prerequisites

- AI SDK version ≥ 6.0.142 (already installed — upgraded during the removal PR)
- `@ai-sdk/react` version ≥ 3.0.144 (already installed)
- Verify AI SDK issue #11423 (`sendAutomaticallyWhen` body forwarding) is fixed in current version
- No migration needed — `approval_events` table and `conversation_messages.parts` column already exist

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|------------|--------|
| `convertToModelMessages()` doesn't handle `approval-responded` | ~~Medium~~ | ~~Blocker~~ | ~~Test with single tool first~~ | **Verified GO** — stress test confirmed it works |
| Pre-loading connection tools blows up context tokens | Low | Performance | `activeTools` filtering means inactive tools cost 0 prompt tokens. Only server-side fetch cost. | **Resolved** — not a token issue |
| `sendAutomaticallyWhen` doesn't forward body options | ~~Medium~~ | ~~Bug~~ | ~~Check SDK version~~ | **Verified GO** — fixed in ai@6.0.117, repo already has workaround |
| Partial failure between resolve + patch | Medium | Bug (recreates original issue) | Wrap in transaction or RPC | **NEW — from stress test** |
| Denied approvals render as "Granted" on reload | High | UX bug | Fix `PermissionCard` state check (see 1d) | **NEW — from stress test** |
| Duplicate `toolCallId` on rehydration (AI SDK #13307) | Low | Bug | Add deduplication in `assembleContext()` if it surfaces | Unchanged |
| Gemini `thought_signature` errors return | Low | Bug | SDK already upgraded past the fix. Monitor. | Unchanged |

## Implementation Order

1. **Phase 1 MVP — `manage_activated_tools_for_connections` only**
   - Implement `patchApprovalPartState()` with atomicity (transaction or RPC with `resolveApprovalEvent`)
   - Patch from DB-authoritative outcome, not raw client payload
   - Add `needsApproval: true` to `manage-tools.ts`
   - Fix `PermissionCard` deny rendering (check `approval.approved`, not just state string)
   - Re-wire `sendAutomaticallyWhen` + `addToolApprovalResponse` in chat-panel
   - Update `chat-panel` test that asserts `sendAutomaticallyWhen` is `undefined`
   - Test the full round-trip: connect → activate tools → approve → use tools
   - Test deny round-trip: activate tools → deny → agent acknowledges → reload shows "Denied"
   - **This validates the entire pattern before touching other tools**

2. **Phase 1 — remaining 4 tools**
   - Add `needsApproval` to `configure-crm.ts`, `delete-records.ts`, `delete-connection.ts`, `manage-triggers.ts`
   - Update tool descriptions (remove `ask_user_question` references)
   - Test each tool's approval flow

3. **Phase 2 — mid-run tool injection**
   - Modify `loadActivatedConnectionTools` → `loadAllConnectionTools` (load ALL active connections, including 0 activated tools)
   - Extend `buildPrepareStep` for dynamic `activeTools` filtering
   - Wire into `runAgent`
   - Test: approve tool activation → use activated tools in same run (the Gmail flow)

4. **Phase 2b — post-approval state persistence**
   - After call 2 executes an approved tool, update the original approval part in DB to `output-available` or `output-denied`
   - Ensures correct rendering on page reload

5. **Phase 3 — cleanup**
   - Update system prompt: remove GATED section, add deny-handling instruction
   - Remove `safety-gates.ts` if no longer referenced (or repurpose for subagent exclusion)
   - Clean up dead approval infrastructure (optional, low priority)

## Sources & References

### Origin
- **Origin document:** [docs/product/ideations/2026-04-07-tool-approval-system.md](docs/product/ideations/2026-04-07-tool-approval-system.md) — Key decisions: two-call flow via AI SDK `needsApproval`, persist-then-resume for DB state sync, pre-load all connection tools with `prepareStep` filtering.

### Stress Test Review
- **Review document:** `docs/product/reviews/2026-04-07-tool-approval-stress-test.md` — 7-item verdict matrix, exact JSONB format, deny-state rendering bug, atomicity requirement, pre-load strategy correction.

### Internal References
- Approval removal handover: `docs/product/handovers/2026-04-01-approval-flow-review.md`
- Original design: `docs/product/designs/approval-system-pr33-34-35.md`
- Chat route approval handling: `app/api/chat/route.ts:106-322`
- `PermissionCard` component: `src/components/chat/tool-call-inline.tsx:317-377`
- `buildPrepareStep`: `src/lib/runner/run-agent.ts:66-76`
- `loadActivatedConnectionTools`: `src/lib/composio/activated-tools.ts:15-31`
- `assembleContext` message loading: `src/lib/runner/context.ts:374-500`
- `finalizeRun` persistence: `src/lib/runner/run-persistence.ts:67-211`

### External References
- AI SDK HITL cookbook: https://ai-sdk.dev/cookbook/next/human-in-the-loop
- AI SDK tool approval docs: https://ai-sdk.dev/docs/concepts/tool-calling#tool-execution-approval
- Known issue — duplicate toolCallId: https://github.com/vercel/ai/issues/13307
- Known issue — sendAutomaticallyWhen body: https://github.com/vercel/ai/issues/11423
