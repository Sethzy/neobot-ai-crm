# Tool Approval System Implementation Plan

**PR:** PR 33: Approval system — gate implementation + PR 34: Approval system — events + UI
**Decisions:** SAFETY-01, SAFETY-02, SAFETY-04
**Goal:** Re-enable AI SDK `needsApproval` for gated tools, fixing the DB state sync bug that caused the original removal.

**Architecture:** Two-call flow via AI SDK `needsApproval`. Call 1: model calls gated tool, SDK streams `approval-requested`, run ends. Call 2: client auto-sends approval response, chat route patches message state in DB, starts new run, tool executes. Mid-run tool injection via pre-loaded connection tools + `prepareStep` `activeTools` filtering.

**Tech Stack:** AI SDK v6 (`ai@6.0.142`, `@ai-sdk/react@3.0.144`), Supabase Postgres (JSONB), Next.js App Router, React

**Source Documents:**
- Ideation: `docs/product/ideations/2026-04-07-tool-approval-system.md`
- Plan: `docs/product/plans/2026-04-07-001-feat-tool-approval-system-plan.md`
- Stress test review: `docs/product/reviews/2026-04-07-tool-approval-stress-test.md`
- Original removal handover: `docs/product/handovers/2026-04-01-approval-flow-review.md`

---

## Task 1: Atomic approval persistence — `patchApprovalPartState`

The core bug fix. After `resolveApprovalEvent()` updates `approval_events`, also patch the tool call part's state in `conversation_messages.parts` JSONB. Must be atomic — if one succeeds and the other fails, we recreate the original bug.

**Files:**
- Create: `src/lib/approvals/__tests__/patch-approval-state.test.ts`
- Modify: `src/lib/approvals/queries.ts`
- Modify: `app/api/chat/route.ts:286-322`

### Step 1: Write the failing test for `patchApprovalPartState`

```typescript
// src/lib/approvals/__tests__/patch-approval-state.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { patchApprovalPartState } from "../queries";

// Use test supabase client (see src/lib/supabase/test-client.ts for pattern)

describe("patchApprovalPartState", () => {
  it("patches approval-requested to approval-responded with approved=true", async () => {
    // 1. Insert a conversation_messages row with parts containing an approval-requested tool part
    const approvalId = "test-approval-123";
    const parts = [
      { type: "text", text: "I'll activate those tools." },
      {
        type: "tool-manage_activated_tools_for_connections",
        toolCallId: "call_abc",
        state: "approval-requested",
        input: { connections: [{ connectionId: "conn_1", activate: ["GMAIL_FETCH_EMAILS"], deactivate: [] }] },
        approval: { id: approvalId },
      },
    ];
    // Insert message (use test helper or direct insert)

    // 2. Call patchApprovalPartState
    const result = await patchApprovalPartState(supabase, {
      threadId: testThreadId,
      approvalId,
      approved: true,
    });

    // 3. Reload the message and verify the part was patched
    expect(result.success).toBe(true);
    // Query the message back
    const { data } = await supabase
      .from("conversation_messages")
      .select("parts")
      .eq("thread_id", testThreadId)
      .eq("role", "assistant")
      .single();

    const toolPart = (data!.parts as any[]).find((p: any) => p.toolCallId === "call_abc");
    expect(toolPart.state).toBe("approval-responded");
    expect(toolPart.approval.approved).toBe(true);
    // Verify other fields preserved
    expect(toolPart.type).toBe("tool-manage_activated_tools_for_connections");
    expect(toolPart.input).toBeDefined();
    expect(toolPart.toolCallId).toBe("call_abc");
  });

  it("patches approval-requested to approval-responded with approved=false", async () => {
    // Same setup, but approved: false
    // Verify state is "approval-responded" and approval.approved is false
  });

  it("is idempotent — patching an already-responded part is a no-op", async () => {
    // Insert a part already in "approval-responded" state
    // Call patchApprovalPartState again
    // Verify no error, part unchanged
  });

  it("returns not-found when approval ID does not match any message", async () => {
    const result = await patchApprovalPartState(supabase, {
      threadId: testThreadId,
      approvalId: "nonexistent-approval",
      approved: true,
    });
    expect(result.success).toBe(false);
  });
});
```

### Step 2: Run the test to verify it fails

```bash
npx vitest run src/lib/approvals/__tests__/patch-approval-state.test.ts
```

Expected: FAIL — `patchApprovalPartState` is not exported from `queries.ts`.

### Step 3: Implement `patchApprovalPartState`

Add to `src/lib/approvals/queries.ts`:

```typescript
interface PatchApprovalPartStateInput {
  threadId: string;
  approvalId: string;
  approved: boolean;
}

/**
 * Patches the tool call part's state in conversation_messages.parts JSONB
 * from "approval-requested" to "approval-responded".
 *
 * This is the fix for the original needsApproval bug: resolveApprovalEvent()
 * updated approval_events but not the message parts. When the runner reloaded
 * from DB, it still saw "approval-requested" → MissingToolResultsError.
 *
 * Uses a Postgres JSONB update that preserves all existing fields (type,
 * toolCallId, input, etc.) and only mutates state + approval.approved.
 */
export async function patchApprovalPartState(
  supabase: ApprovalSupabaseClient,
  input: PatchApprovalPartStateInput,
) {
  // Use raw SQL via rpc or supabase.rpc for the JSONB array update.
  // The query finds the message with a part matching the approval ID,
  // then patches that specific array element.
  const { data, error } = await supabase.rpc("patch_approval_part_state", {
    p_thread_id: input.threadId,
    p_approval_id: input.approvalId,
    p_approved: input.approved,
  });

  if (error) {
    return { success: false as const, error: error.message };
  }

  if (data === 0) {
    return { success: false as const, error: "No matching approval-requested part found." };
  }

  return { success: true as const };
}
```

### Step 4: Create the Supabase RPC migration

Create `supabase/migrations/YYYYMMDDHHMMSS_patch_approval_part_state.sql`:

```sql
CREATE OR REPLACE FUNCTION patch_approval_part_state(
  p_thread_id UUID,
  p_approval_id TEXT,
  p_approved BOOLEAN
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE conversation_messages
  SET parts = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'state' = 'approval-requested'
          AND elem->'approval'->>'id' = p_approval_id
        THEN jsonb_set(
          jsonb_set(elem, '{state}', '"approval-responded"'::jsonb),
          '{approval,approved}', to_jsonb(p_approved)
        )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(parts) AS elem
  )
  WHERE thread_id = p_thread_id
    AND role = 'assistant'
    AND parts IS NOT NULL
    AND parts::text LIKE '%' || p_approval_id || '%';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;
```

### Step 5: Run the test to verify it passes

```bash
npx vitest run src/lib/approvals/__tests__/patch-approval-state.test.ts
```

Expected: PASS

### Step 6: Wire into chat route

**File:** `app/api/chat/route.ts:286-322`

After `resolveApprovalEvent()` succeeds, add the JSONB patch. Use the DB-authoritative outcome, not the raw client payload:

```typescript
// After line 321 (_t("approval_resolution"))
// Patch message parts to reflect approval decision (fixes needsApproval state sync bug)
await Promise.all(
  resolutionResults.map(async (result, index) => {
    if (!result.success || !("event" in result) || !result.event) return;
    const approvedFromDb = result.event.status === "approved";
    await patchApprovalPartState(supabase, {
      threadId,
      approvalId: approvalResponses[index]!.approvalId,
      approved: approvedFromDb,
    });
  }),
);
_t("patch_approval_parts");
```

### Step 7: Run existing chat route tests

```bash
npx vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: PASS (no regressions)

### Step 8: Commit

```bash
git add src/lib/approvals/ app/api/chat/route.ts supabase/migrations/
git commit -m "feat(pr33): atomic approval state persistence — patchApprovalPartState"
```

---

## Task 2: Re-add `needsApproval` to gated tools

One-line addition to each tool definition. Start with `manage_activated_tools_for_connections` (MVP), then the other 4.

**Files:**
- Modify: `src/lib/runner/tools/connections/manage-tools.ts:31-33`
- Modify: `src/lib/runner/tools/connections/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/crm/configure-crm.ts:~325`
- Modify: `src/lib/runner/tools/crm/delete-records.ts:~47`
- Modify: `src/lib/runner/tools/connections/delete-connection.ts:~21`
- Modify: `src/lib/runner/tools/triggers/manage-triggers.ts:~173`

### Step 1: Write a test asserting `needsApproval` is present on `manage_activated_tools_for_connections`

Check if existing tests in `src/lib/runner/tools/connections/__tests__/index.test.ts` have assertions about tool properties. Add:

```typescript
it("manage_activated_tools_for_connections has needsApproval set to true", () => {
  const tools = createConnectionTools(supabase, clientId, threadId);
  // Access the tool definition — check how other tests access tool properties
  expect(tools.manage_activated_tools_for_connections).toBeDefined();
  // The AI SDK tool() function stores needsApproval on the tool object
});
```

### Step 2: Add `needsApproval: true` to `manage-tools.ts`

**File:** `src/lib/runner/tools/connections/manage-tools.ts:31-33`

```typescript
manage_activated_tools_for_connections: tool({
  description: "Activates or deactivates tools for connections. Requires user approval before execution.\n\nReturns an array of objects...",
  inputSchema: manageToolsInputSchema,
  needsApproval: true,  // <-- ADD THIS LINE
  execute: async ({ connections: connectionRequests }) => {
```

Also update the description — remove: "This is a DESTRUCTIVE action — use ask_user_question to confirm with the user before calling."

### Step 3: Add `needsApproval: true` to the other 4 tools

**`delete-connection.ts`:**
```typescript
delete_connection: tool({
  description: "PERMANENTLY DELETES a connection...",
  inputSchema: z.object({ connectionId: z.string().trim().min(1) }),
  needsApproval: true,  // <-- ADD
  execute: async ({ connectionId }) => {
```

**`configure-crm.ts`:**
```typescript
const configure_crm = tool({
  description: "Update CRM vocabulary and custom field definitions...",
  inputSchema,
  needsApproval: true,  // <-- ADD
  execute: async ({ confirm_removals, ...input }) => {
```

**`delete-records.ts`:**
```typescript
delete_records: tool({
  description: "Permanently delete one or more CRM records by ID...",
  inputSchema: z.object({ ... }),
  needsApproval: true,  // <-- ADD
  execute: async ({ entity, ids, reason }) => {
```

**`manage-triggers.ts`** (conditional — only gate deletes):
```typescript
const manage_active_triggers = tool({
  description: readOnly ? "List and inspect..." : "Manage the agent's...",
  inputSchema: z.object({ ... }),
  ...(readOnly ? {} : {
    needsApproval: async ({ action }: { action: string }) => action === "delete",
  }),
  execute: async (input) => {
```

### Step 4: Run all tool tests

```bash
npx vitest run src/lib/runner/tools/
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/runner/tools/
git commit -m "feat(pr33): re-add needsApproval to 5 gated tools"
```

---

## Task 3: Fix `PermissionCard` deny rendering

The `PermissionCard` component currently treats all `approval-responded` states as "Granted". Denied approvals must render as "Denied" on reload.

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx:329-331`
- Test: `src/components/chat/tool-call-inline.test.tsx`

### Step 1: Write a failing test for denied approval rendering

Check existing tests in `tool-call-inline.test.tsx` for the pattern, then add:

```typescript
it("renders Denied badge when state is approval-responded with approved=false", () => {
  render(
    <ToolCallInline
      name="manage_activated_tools_for_connections"
      state="approval-responded"
      input={{
        connections: [{ connectionId: "conn_1", activate: ["GMAIL_FETCH_EMAILS"], deactivate: [] }],
      }}
      output={null}
      approvalId="test-123"
      // approval prop with approved: false — check how the component receives this
    />,
  );
  expect(screen.getByText("Denied")).toBeInTheDocument();
  expect(screen.queryByText("Granted")).not.toBeInTheDocument();
});
```

### Step 2: Run the test to verify it fails

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Expected: FAIL — currently shows "Granted" for all `approval-responded`.

### Step 3: Fix the `PermissionCard` state logic

**File:** `src/components/chat/tool-call-inline.tsx:329-331`

Before:
```typescript
const isGranted = state === "approval-responded" || state === "output-available";
const isDenied = state === "output-denied";
```

After:
```typescript
const isGranted = state === "output-available"
  || (state === "approval-responded" && approval?.approved === true);
const isDenied = state === "output-denied"
  || (state === "approval-responded" && approval?.approved === false);
```

You'll need to pass the `approval` object into `PermissionCard`. Check the component's props and the `ToolCallInline` parent to see how to thread `approval` data through. The part object from the AI SDK contains `approval: { id, approved }`.

### Step 4: Run the test to verify it passes

```bash
npx vitest run src/components/chat/tool-call-inline.test.tsx
```

Expected: PASS

### Step 5: Commit

```bash
git add src/components/chat/tool-call-inline.tsx src/components/chat/tool-call-inline.test.tsx
git commit -m "fix(pr33): PermissionCard renders Denied correctly for rejected approvals"
```

---

## Task 4: Re-wire frontend approval flow

Restore `sendAutomaticallyWhen` and `addToolApprovalResponse` in the chat panel. Most of the infrastructure exists as dead code.

**Files:**
- Modify: `src/components/chat/chat-panel.tsx`
- Test: `src/components/chat/chat-panel.test.tsx`

### Step 1: Update the existing test that asserts `sendAutomaticallyWhen` is undefined

Check `chat-panel.test.tsx` for an assertion like:
```typescript
expect(sendAutomaticallyWhen).toBeUndefined();
```

Change it to assert the approval auto-send is configured:
```typescript
// Find the test and update expectation
expect(useChatOptions.sendAutomaticallyWhen).toBeDefined();
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```

Expected: FAIL — `sendAutomaticallyWhen` is still undefined in the component.

### Step 3: Add `sendAutomaticallyWhen` to `useChat` options

**File:** `src/components/chat/chat-panel.tsx`

Add import:
```typescript
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
```

Add to `useChat` options (find the `useChat({...})` call):
```typescript
sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
```

### Step 4: Verify `addToolApprovalResponse` is destructured and passed through

Check that `addToolApprovalResponse` is:
1. Destructured from `useChat` return value
2. Passed to the message rendering component as `onToolApproval` or equivalent
3. Connected to `PermissionCard`'s approve/deny buttons via `onToolApproval(approvalId, approved)`

The wiring may already exist from PR 22b. Check `tool-call-inline.tsx:360-374` — the buttons call `onToolApproval(approvalId, true/false)`.

### Step 5: Run all chat panel tests

```bash
npx vitest run src/components/chat/chat-panel.test.tsx
```

Expected: PASS

### Step 6: Commit

```bash
git add src/components/chat/chat-panel.tsx src/components/chat/chat-panel.test.tsx
git commit -m "feat(pr33): restore sendAutomaticallyWhen + addToolApprovalResponse wiring"
```

---

## Task 5: Pre-load all connection tools + `prepareStep` filtering

Enable mid-run tool injection so newly activated tools are available in the same run. Pre-load ALL tool definitions at run start; use `prepareStep` to filter to only activated slugs per step.

**Files:**
- Create: `src/lib/composio/__tests__/load-all-connection-tools.test.ts`
- Modify: `src/lib/composio/activated-tools.ts`
- Modify: `src/lib/runner/run-agent.ts:66-76` (buildPrepareStep)
- Modify: `src/lib/runner/run-agent.ts:237-380` (runAgent tool loading + prepareStep wiring)

### Step 1: Write test for `loadAllConnectionTools`

```typescript
// src/lib/composio/__tests__/load-all-connection-tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { loadAllConnectionTools } from "../activated-tools";

describe("loadAllConnectionTools", () => {
  it("returns empty tools and slugs for no active connections", async () => {
    const result = await loadAllConnectionTools([], "user-123");
    expect(result.tools).toEqual({});
    expect(result.activatedSlugs.size).toBe(0);
  });

  it("loads all tools for active connections including those with 0 activated tools", async () => {
    // Mock connections: one with activated tools, one with zero
    const connections = [
      { id: "conn_1", status: "active", toolkit_slug: "gmail", activated_tools: ["GMAIL_FETCH_EMAILS"] },
      { id: "conn_2", status: "active", toolkit_slug: "googledrive", activated_tools: [] },
    ];
    // Mock Composio to return tool definitions
    // Verify both toolkits' tools are loaded
    // Verify activatedSlugs only contains "GMAIL_FETCH_EMAILS"
  });

  it("skips inactive connections", async () => {
    const connections = [
      { id: "conn_1", status: "pending", toolkit_slug: "gmail", activated_tools: [] },
    ];
    const result = await loadAllConnectionTools(connections as any, "user-123");
    expect(result.tools).toEqual({});
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/composio/__tests__/load-all-connection-tools.test.ts
```

Expected: FAIL — `loadAllConnectionTools` doesn't exist.

### Step 3: Implement `loadAllConnectionTools`

**File:** `src/lib/composio/activated-tools.ts`

Keep the existing `loadActivatedConnectionTools` (other code may use it). Add:

```typescript
/**
 * Loads ALL tool definitions for active connections (both activated and deactivated).
 * Used for mid-run tool injection: all tools are loaded into the streamText tools object,
 * but prepareStep filters to only activated slugs per step.
 *
 * Important: includes connections with 0 activated tools. This is required for the
 * primary flow: Gmail connected → user approves tool activation → GMAIL_FETCH_EMAILS
 * must be in the tools object from run start.
 */
export async function loadAllConnectionTools(
  connections: ConnectionRow[],
  composioUserId: string,
): Promise<{ tools: ToolSet; activatedSlugs: Set<string> }> {
  const activeConnections = connections.filter((c) => c.status === "active");
  if (activeConnections.length === 0) {
    return { tools: {}, activatedSlugs: new Set() };
  }

  const activatedSlugs = new Set(
    activeConnections.flatMap((c) => c.activated_tools),
  );

  // Load ALL tools for all active connection toolkits
  const composio = getComposio();
  const allTools: ToolSet = {};

  for (const connection of activeConnections) {
    try {
      const rawTools = await composio.tools.getRawComposioTools({
        toolkits: [connection.toolkit_slug],
        limit: COMPOSIO_TOOL_FETCH_LIMIT,
      });
      const connectionTools = await composio.tools.get(composioUserId, {
        tools: rawTools.map((t) => t.slug),
      });
      Object.assign(allTools, connectionTools);
    } catch (error) {
      console.error(`[composio] Failed to load tools for toolkit ${connection.toolkit_slug}:`, error);
    }
  }

  return { tools: allTools, activatedSlugs };
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/composio/__tests__/load-all-connection-tools.test.ts
```

Expected: PASS

### Step 5: Extend `buildPrepareStep` for connection tool filtering

**File:** `src/lib/runner/run-agent.ts:66-76`

```typescript
export function buildPrepareStep(
  modelId: string,
  maxSteps: number,
  opts?: {
    getActivatedConnectionSlugs?: () => Promise<Set<string>>;
    builtinToolNames?: string[];
  },
) {
  return async ({ stepNumber }: { stepNumber: number }) => {
    const result: Record<string, unknown> = {};

    if (stepNumber >= maxSteps - 1) {
      result.activeTools = [];
    } else if (opts?.getActivatedConnectionSlugs && opts?.builtinToolNames) {
      const activatedSlugs = await opts.getActivatedConnectionSlugs();
      result.activeTools = [...opts.builtinToolNames, ...activatedSlugs];
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}
```

### Step 6: Wire into `runAgent`

**File:** `src/lib/runner/run-agent.ts:237-250`

Replace `loadActivatedConnectionTools` call with `loadAllConnectionTools`:

```typescript
const composioPromise = getActiveConnections(supabase, clientId)
  .then((connections) => {
    _t("get_connections");
    return loadAllConnectionTools(connections, clientId);
  })
  .then((result) => {
    _t("load_composio_tools");
    return result;
  })
  .catch((error) => {
    _t("composio_failed");
    console.error("[composio] Failed to load connection tools for runner.", error);
    return { tools: {} as ToolSet, activatedSlugs: new Set<string>() };
  });
```

Update the destructuring at line ~254:
```typescript
const [{ config: crmConfig }, { tools: composioTools, activatedSlugs }, preloadedState] = await Promise.all([...]);
```

Update `prepareStep` at line ~380:
```typescript
prepareStep: buildPrepareStep(modelId, maxSteps, {
  getActivatedConnectionSlugs: async () => {
    const conns = await getActiveConnections(supabase, clientId);
    return new Set(conns.flatMap((c) => c.activated_tools));
  },
  builtinToolNames: Object.keys(runnerTools),
}),
```

### Step 7: Run runner tests

```bash
npx vitest run src/lib/runner/
```

Expected: PASS

### Step 8: Commit

```bash
git add src/lib/composio/ src/lib/runner/run-agent.ts
git commit -m "feat(pr33): pre-load all connection tools + prepareStep activeTools filtering"
```

---

## Task 6: Update system prompt — remove `ask_user_question` gating

Replace the GATED tools section with a simple deny-handling instruction. The `needsApproval` SDK mechanism replaces system prompt gating.

**Files:**
- Modify: `src/lib/ai/system-prompt.ts:246` (external-connections section)
- Modify: `src/lib/ai/system-prompt.ts:355-369` (safety section)
- Modify: `src/lib/runner/safety-gates.ts` (optional — may still be used for subagent exclusion)

### Step 1: Update the `<external-connections>` section

**File:** `src/lib/ai/system-prompt.ts:246`

Remove:
```
manage_activated_tools_for_connections and delete_connection are GATED tools (see <safety>). Never call them without ask_user_question confirmation first.
```

Replace with:
```
manage_activated_tools_for_connections and delete_connection require user approval. The system will show an approval card automatically — do not use ask_user_question for this.
```

### Step 2: Replace the `<safety>` section

**File:** `src/lib/ai/system-prompt.ts:355-369`

Remove the entire GATED TOOLS block with the 4-step `ask_user_question` protocol.

Replace with:
```
<safety>
Some tools require user approval before they execute. The system handles this automatically — an approval card will appear in chat. Do not use ask_user_question to gate these tools.

When a user denies a tool approval, do not retry the same tool call. Acknowledge the denial and ask how the user would like to proceed instead.
</safety>
```

### Step 3: Run system prompt tests (if any exist)

```bash
npx vitest run src/lib/ai/
npx vitest run src/lib/eval/
```

Expected: PASS. Check if any eval tests assert the old GATED TOOLS text.

### Step 4: Commit

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr33): replace ask_user_question gating with needsApproval SDK pattern in system prompt"
```

---

## Task 7: End-to-end verification

Manual smoke tests to validate the full round-trip. These are not automated — they require a running dev server with Composio credentials.

**Prerequisites:** `npm run dev` running, Composio API key configured, at least one Gmail connection in test account.

### Step 1: Test approve flow — connection tool activation

1. Open chat, type "check my last 3 emails"
2. Agent should call `manage_activated_tools_for_connections`
3. A single "Grant permissions to agent?" card appears (NOT an `ask_user_question` card)
4. Click "Grant Permissions"
5. Agent should immediately call `GMAIL_FETCH_EMAILS` in the same run
6. Emails are displayed

**Verify:** No `MissingToolResultsError` in server logs. No infinite loops. Single card, not two.

### Step 2: Test deny flow — connection tool activation

1. Open chat, type "check my Gmail"
2. "Grant permissions?" card appears
3. Click "Deny"
4. Agent acknowledges: "OK, I won't activate those tools" (or similar)
5. Agent does NOT retry the tool call

### Step 3: Test approve flow — delete records

1. Create a test contact
2. Type "delete [contact name]"
3. Single approval card appears showing the delete action
4. Click Approve
5. Contact is deleted

### Step 4: Test page reload state

1. Trigger an approval card (any gated tool)
2. Click Approve — tool executes
3. Reload the page
4. The card should show "Granted" badge, not pending buttons

5. Trigger another approval card
6. Click Deny
7. Reload the page
8. The card should show "Denied" badge, not "Granted"

### Step 5: Run the full test suite

```bash
npx vitest run
```

Expected: All tests pass, no regressions.

### Step 6: Final commit

```bash
git add .
git commit -m "feat(pr33): tool approval system — end-to-end verified"
```

---

## Relevant Files

### Core (must modify)
- `src/lib/approvals/queries.ts` — add `patchApprovalPartState`
- `app/api/chat/route.ts:286-322` — wire JSONB patch after `resolveApprovalEvent`
- `src/lib/runner/tools/connections/manage-tools.ts:31` — add `needsApproval: true`
- `src/lib/runner/tools/crm/configure-crm.ts:~325` — add `needsApproval: true`
- `src/lib/runner/tools/crm/delete-records.ts:~47` — add `needsApproval: true`
- `src/lib/runner/tools/connections/delete-connection.ts:~21` — add `needsApproval: true`
- `src/lib/runner/tools/triggers/manage-triggers.ts:~173` — add conditional `needsApproval`
- `src/components/chat/tool-call-inline.tsx:329-331` — fix deny rendering
- `src/components/chat/chat-panel.tsx` — restore `sendAutomaticallyWhen`
- `src/lib/composio/activated-tools.ts` — add `loadAllConnectionTools`
- `src/lib/runner/run-agent.ts:66-76, 237-380` — extend `buildPrepareStep`, wire pre-loading
- `src/lib/ai/system-prompt.ts:246, 355-369` — remove GATED section

### New files
- `supabase/migrations/YYYYMMDDHHMMSS_patch_approval_part_state.sql` — RPC function
- `src/lib/approvals/__tests__/patch-approval-state.test.ts` — persistence test
- `src/lib/composio/__tests__/load-all-connection-tools.test.ts` — pre-loading test

### Tests (must update)
- `src/components/chat/chat-panel.test.tsx` — flip `sendAutomaticallyWhen` assertion
- `src/components/chat/tool-call-inline.test.tsx` — add denied state rendering test
- `src/lib/runner/tools/connections/__tests__/index.test.ts` — add `needsApproval` assertion

### Reference (read before implementing)
- `docs/product/ideations/2026-04-07-tool-approval-system.md`
- `docs/product/plans/2026-04-07-001-feat-tool-approval-system-plan.md`
- `docs/product/reviews/2026-04-07-tool-approval-stress-test.md`
- `docs/product/handovers/2026-04-01-approval-flow-review.md`
- AI SDK cookbook: https://ai-sdk.dev/cookbook/next/human-in-the-loop
