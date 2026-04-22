# Approval Gate Rework Implementation Plan

**Goal:** Ship a real approval gate for destructive CRM actions so the agent pauses on `request_approval`, waits for Allow or Deny, then resumes asynchronously without draining a long-lived HTTP response.

**Architecture:** Add a new managed-agent custom tool, `request_approval`, and treat it as a deferred custom tool instead of a normal immediate-result tool. The session runner will validate the tool input, persist a pending `approval_events` row, emit an approval-requested tool part, and then stop on `requires_action` without sending `user.custom_tool_result`. The existing Anthropic webhook route at `app/api/webhook/anthropic/route.ts` will handle the two async follow-ups: reconcile pending approvals when the session first idles for human input, and finalize the resumed run after `/api/tool-confirm` or Telegram sends the decision back to Anthropic.

**Tech Stack:** Next.js 15 App Router, React 19, AI SDK v6 chat UI, `@anthropic-ai/sdk` Managed Agents beta, Supabase Postgres + RLS, Telegram via `grammy`, Vitest.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" - Step
- "Run it to make sure it fails" - Step
- "Write the minimal code to make the test pass" - Step
- "Run the tests and make sure they pass" - Step
- "Commit" - Step

## Execution Notes

- Use official Anthropic sources only for Managed Agents behavior. Re-check the current cookbook and docs before changing API-shape assumptions.
- Use `claude-haiku-4-5` for every Managed Agents manual or ad-hoc test. Do not use Sonnet or Opus for testing.
- Do not rename the existing webhook route. The repo already has `app/api/webhook/anthropic/route.ts`; extend it instead of creating `app/api/webhooks/anthropic/route.ts`.
- Do not break the existing connection-permission card. `manage_activated_tools_for_connections` is a separate UI path and stays intact in this tasklist.
- Do not add a new database table or approval rules engine in v0. Reuse `approval_events`.
- Ask for `@requesting-code-review` after Task 3 and again after Task 6 before moving on.

## Source Docs

- Design requirements: `docs/product/ideations/2026-04-22-approval-gate-rework-requirements.md`
- Current implementation plan: `docs/product/plans/2026-04-22-003-feat-approval-gate-rework-plan.md`
- Existing webhook recovery plan: `docs/product/plans/2026-04-13-001-feat-session-recovery-webhook-plan.md`
- Official Anthropic cookbook: `https://platform.claude.com/cookbook/managed-agents-cma-operate-in-production`
- Official Anthropic cookbook: `https://platform.claude.com/cookbook/managed-agents-sre-incident-responder`
- Official Anthropic docs: `https://platform.claude.com/docs/en/managed-agents/events-and-streaming`

## Relevant Files

**Create:**
- `src/lib/managed-agents/tools/approvals/request-approval.ts`
- `src/lib/managed-agents/tools/approvals/index.ts`
- `src/lib/managed-agents/reconcile-pending-approvals.ts`
- `src/lib/managed-agents/submit-approval-decision.ts`
- `src/lib/managed-agents/gated-action-types.ts`
- `src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts`
- `src/lib/managed-agents/__tests__/submit-approval-decision.test.ts`
- `app/api/webhook/anthropic/__tests__/route.test.ts`

**Modify:**
- `src/lib/managed-agents/tools/declarations.ts`
- `src/lib/managed-agents/dispatcher.ts`
- `src/lib/managed-agents/types.ts`
- `src/lib/managed-agents/session-runner.ts`
- `src/lib/managed-agents/dispatch-event-to-callbacks.ts`
- `src/lib/managed-agents/events-to-assistant-parts.ts`
- `src/lib/managed-agents/recover-orphaned-run.ts`
- `app/api/webhook/anthropic/route.ts`
- `app/api/tool-confirm/route.ts`
- `app/api/chat/route.ts`
- `app/api/webhook/telegram/route.ts`
- `src/components/chat/chat-panel.tsx`
- `src/components/chat/tool-call-inline.tsx`
- `src/lib/channels/telegram/approvals.ts`
- `scripts/managed-agents/create-agent.ts`
- `src/lib/managed-agents/adapter.ts`
- `src/lib/managed-agents/event-translator.ts`
- `src/lib/managed-agents/event-types.ts`

**Tests:**
- `src/lib/managed-agents/tools/__tests__/declarations.test.ts`
- `src/lib/managed-agents/__tests__/dispatcher.test.ts`
- `src/lib/managed-agents/__tests__/session-runner.test.ts`
- `src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts`
- `src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts`
- `src/lib/managed-agents/__tests__/event-translator.test.ts`
- `app/api/tool-confirm/__tests__/route.test.ts`
- `app/api/chat/__tests__/route.test.ts`
- `app/api/webhook/telegram/__tests__/route.test.ts`
- `src/components/chat/tool-call-inline.test.tsx`
- `src/components/chat/chat-panel.test.tsx`
- `src/lib/channels/telegram/approvals.test.ts`
- `scripts/managed-agents/__tests__/create-agent-system.test.ts`

## Task Structure

### Task 1: Add `request_approval` and make custom-tool dispatch defer correctly

**Files:**
- Create: `src/lib/managed-agents/tools/approvals/request-approval.ts`
- Create: `src/lib/managed-agents/tools/approvals/index.ts`
- Modify: `src/lib/managed-agents/tools/declarations.ts`
- Modify: `src/lib/managed-agents/dispatcher.ts`
- Modify: `src/lib/managed-agents/types.ts`
- Modify: `src/lib/managed-agents/session-runner.ts`
- Test: `src/lib/managed-agents/tools/__tests__/declarations.test.ts`
- Test: `src/lib/managed-agents/__tests__/dispatcher.test.ts`
- Test: `src/lib/managed-agents/__tests__/session-runner.test.ts`

**Step 1: Write the failing declaration test**

Add this test to `src/lib/managed-agents/tools/__tests__/declarations.test.ts`:

```ts
it("publishes request_approval for destructive-action gating", () => {
  expect(MANAGED_AGENT_TOOL_NAMES).toContain("request_approval");
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/__tests__/declarations.test.ts
```

Expected: `FAIL` because `request_approval` is not in `MANAGED_AGENT_TOOL_NAMES`.

**Step 3: Write the minimal tool declaration**

Create `src/lib/managed-agents/tools/approvals/request-approval.ts`:

```ts
/**
 * request_approval tool for managed agents.
 * This tool is intercepted by the managed-agents dispatcher and runner.
 *
 * @module lib/managed-agents/tools/approvals/request-approval
 */
import { z } from "zod";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  summary: z.string().min(1).describe("Short human-readable summary shown on the approval card."),
  action_type: z.string().min(1).describe("Stable action identifier such as crm.delete_records."),
  payload_preview: z.record(z.string(), z.unknown()).optional().describe(
    "Optional sanitized preview of the payload to show the user.",
  ),
});

export type RequestApprovalInput = z.infer<typeof inputSchema>;

export const requestApprovalTool: ManagedAgentTool<
  RequestApprovalInput,
  { success: true; status: "deferred" }
> = {
  name: "request_approval",
  description:
    "Ask the user to approve a destructive action before you continue. " +
    "Call this before delete_records or configure_crm.",
  inputSchema,
  chatOnly: true,
  // The dispatcher intercepts this tool before execute() is used.
  execute: async () => ({ success: true, status: "deferred" as const }),
};
```

Create `src/lib/managed-agents/tools/approvals/index.ts`:

```ts
export { requestApprovalTool } from "./request-approval";
export type { RequestApprovalInput } from "./request-approval";
```

Register it in `src/lib/managed-agents/tools/declarations.ts`:

```ts
import { requestApprovalTool } from "./approvals";

export const MANAGED_AGENT_TOOL_DECLARATIONS = [
  askUserQuestionTool,
  attachFileToRecordTool,
  browseWebsiteTool,
  calculateDriveTimeTool,
  configureCrmTool,
  createConnectionTool,
  createInteractionTool,
  createRecordTool,
  createTaskTool,
  deleteConnectionTool,
  deleteRecordAttachmentTool,
  deleteRecordsTool,
  executeComposioToolTool,
  getAgentDbSchemaTool,
  getCrmConfigTool,
  linkRecordsTool,
  listComposioToolsTool,
  listConnectionsTool,
  listTodoTool,
  manageActiveTriggersTool,
  manageTodoTool,
  manageViewsTool,
  readRecordAttachmentTool,
  reauthorizeConnectionTool,
  renameChatTool,
  requestApprovalTool,
  runSqlTool,
  search99coTool,
  searchCrmTool,
  searchMarketDataTool,
  searchMeetingsTool,
  searchPropertyGuruTool,
  searchTriggersTool,
  sendMessageTool,
  setupTriggerTool,
  storageReadTool,
  storageWriteTool,
  updateRecordTool,
  updateTaskTool,
  webScrapeTool,
  webSearchTool,
] as const;
```

**Step 4: Run the declaration test to verify it passes**

Run:

```bash
pnpm vitest run src/lib/managed-agents/tools/__tests__/declarations.test.ts
```

Expected: `PASS`.

**Step 5: Write the failing dispatcher test for deferred custom-tool handling**

Add this test to `src/lib/managed-agents/__tests__/dispatcher.test.ts`:

```ts
it("returns a deferred result for request_approval instead of a custom tool result payload", async () => {
  const result = await dispatchCustomTool(
    {
      type: "agent.custom_tool_use",
      id: "toolu_request_1",
      name: "request_approval",
      input: {
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
      },
    },
    {
      supabase: {} as never,
      clientId: "client-1",
      threadId: "thread-1",
      isChatContext: true,
    },
  );

  expect(result).toEqual({
    kind: "deferred",
    toolUseId: "toolu_request_1",
    toolName: "request_approval",
    toolInput: {
      summary: "Delete 3 duplicate contacts",
      action_type: "crm.delete_records",
    },
  });
});
```

**Step 6: Run the dispatcher test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/dispatcher.test.ts
```

Expected: `FAIL` because `dispatchCustomTool()` currently always returns immediate `user.custom_tool_result` content.

**Step 7: Add the minimal deferred-dispatch union**

Modify `src/lib/managed-agents/types.ts`:

```ts
export type DispatchCustomToolResult =
  | {
      kind: "result";
      payload: CustomToolResultContent;
    }
  | {
      kind: "deferred";
      toolUseId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
    };
```

Modify `src/lib/managed-agents/dispatcher.ts`:

```ts
import type {
  CustomToolResultContent,
  CustomToolUseEvent,
  DispatchContext,
  DispatchCustomToolResult,
  ToolResult,
} from "./types";

export async function dispatchCustomTool(
  event: CustomToolUseEvent,
  context: DispatchContext,
): Promise<DispatchCustomToolResult> {
  const internalToolName = toInternalManagedAgentToolName(event.name);
  const tool = (MANAGED_AGENT_TOOLS as unknown as Record<string, RegistryEntry>)[internalToolName];

  // existing unknown-tool / chatOnly / schema-validation code stays

  if (internalToolName === "request_approval") {
    return {
      kind: "deferred",
      toolUseId: event.id,
      toolName: internalToolName,
      toolInput: parsed.data as Record<string, unknown>,
    };
  }

  const result = (await tool.execute(parsed.data, context)) as ToolResult;
  return {
    kind: "result",
    payload: asContent(result, event.id, result.success === false),
  };
}
```

**Step 8: Write the failing session-runner test for deferred approvals**

Add this test to `src/lib/managed-agents/__tests__/session-runner.test.ts`:

```ts
it("persists request_approval and does not send user.custom_tool_result immediately", async () => {
  (dispatchCustomTool as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    kind: "deferred",
    toolUseId: "toolu_request_1",
    toolName: "request_approval",
    toolInput: {
      summary: "Delete 3 duplicate contacts",
      action_type: "crm.delete_records",
    },
  });

  stubIteration([
    customToolUseEvent("toolu_request_1", "request_approval", {
      summary: "Delete 3 duplicate contacts",
      action_type: "crm.delete_records",
    }),
    statusIdleEvent("evt_idle", "requires_action", ["toolu_request_1"]),
  ]);

  const result = await consumeAnthropicSession({
    anthropic: fakeAnthropic(),
    sessionId: "sess_1",
    runId: "run_1",
    context: baseContext(),
  });

  expect(createApprovalEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      approvalId: "toolu_request_1",
      toolUseId: "toolu_request_1",
      toolName: "request_approval",
    }),
  );
  expect(sendEvent).not.toHaveBeenCalledWith(
    "sess_1",
    expect.objectContaining({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "user.custom_tool_result" }),
      ]),
    }),
    expect.anything(),
  );
  expect(result.reason).toBe("requires_action");
});
```

**Step 9: Run the session-runner test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/session-runner.test.ts
```

Expected: `FAIL` because deferred custom tools are not handled yet.

**Step 10: Write the minimal session-runner implementation**

Modify `src/lib/managed-agents/session-runner.ts` inside the `result.customToolCall` branch:

```ts
const dispatchResult = await dispatchCustomTool(
  {
    type: "agent.custom_tool_use",
    id: result.customToolCall.id,
    name: result.customToolCall.name,
    input: result.customToolCall.input,
  },
  options.context,
);

if (dispatchResult.kind === "deferred") {
  const approvalId = dispatchResult.toolUseId;
  const persistedApproval = await createApprovalEvent(options.context.supabase, {
    clientId: options.context.clientId,
    threadId: options.context.threadId ?? "",
    runId: options.runId,
    toolName: dispatchResult.toolName,
    toolInput: dispatchResult.toolInput,
    approvalId,
    sessionId: options.sessionId,
    toolUseId: dispatchResult.toolUseId,
  });

  if (!persistedApproval.success) {
    throw new Error(`Failed to persist approval event ${approvalId}: ${persistedApproval.error}`);
  }

  approvalEventIds.push(approvalId);
  continue;
}

await anthropic.beta.sessions.events.send(
  options.sessionId,
  { events: [{ type: "user.custom_tool_result", ...dispatchResult.payload }] } as never,
  CHAT_ANTHROPIC_REQUEST_OPTIONS,
);
dispatchedCustomToolIds.add(result.customToolCall.id);
```

Important: do **not** add deferred tool ids to `dispatchedCustomToolIds`. The runner must treat the following `requires_action` as a real human pause.

**Step 11: Run the targeted tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/lib/managed-agents/tools/__tests__/declarations.test.ts \
  src/lib/managed-agents/__tests__/dispatcher.test.ts \
  src/lib/managed-agents/__tests__/session-runner.test.ts
```

Expected: all three files `PASS`.

**Step 12: Commit**

Run:

```bash
git add \
  src/lib/managed-agents/tools/approvals/request-approval.ts \
  src/lib/managed-agents/tools/approvals/index.ts \
  src/lib/managed-agents/tools/declarations.ts \
  src/lib/managed-agents/dispatcher.ts \
  src/lib/managed-agents/types.ts \
  src/lib/managed-agents/session-runner.ts \
  src/lib/managed-agents/tools/__tests__/declarations.test.ts \
  src/lib/managed-agents/__tests__/dispatcher.test.ts \
  src/lib/managed-agents/__tests__/session-runner.test.ts
git commit -m "feat(prXX): add deferred request_approval tool flow"
```

### Task 2: Persist and stream `request_approval` as an approval-requested tool part

**Files:**
- Modify: `src/lib/managed-agents/dispatch-event-to-callbacks.ts`
- Modify: `src/lib/managed-agents/events-to-assistant-parts.ts`
- Test: `src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts`
- Test: `src/lib/managed-agents/__tests__/dispatch-event-to-callbacks.test.ts`

**Step 1: Write the failing persistence test**

Add this test to `src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts`:

```ts
it("persists request_approval as an approval-requested tool part", () => {
  const parts = buildAssistantPartsFromEvents([
    customToolUseEvent("toolu_request_1", "request_approval", {
      summary: "Delete 3 duplicate contacts",
      action_type: "crm.delete_records",
      payload_preview: { record_ids: ["c1", "c2", "c3"] },
    }),
  ] as never);

  expect(parts).toEqual([
    {
      type: "tool-request_approval",
      toolCallId: "toolu_request_1",
      state: "approval-requested",
      input: {
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
        payload_preview: { record_ids: ["c1", "c2", "c3"] },
      },
      approval: { id: "toolu_request_1" },
    },
  ]);
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts
```

Expected: `FAIL` because `agent.custom_tool_use` currently persists as `input-available`.

**Step 3: Write the minimal persistence change**

Modify `src/lib/managed-agents/events-to-assistant-parts.ts`:

```ts
if (event.type === "agent.custom_tool_use") {
  const internalToolName = toInternalManagedAgentToolName(event.name);

  if (internalToolName === "request_approval") {
    parts.push({
      type: "tool-request_approval",
      toolCallId: event.id,
      state: "approval-requested",
      input: event.input,
      approval: { id: event.id },
    });
    continue;
  }

  parts.push({
    type: `tool-${internalToolName}`,
    toolCallId: event.id,
    state: "input-available",
    input: event.input,
  });
  continue;
}
```

**Step 4: Write the failing callback-dispatch test**

Add this test to `src/lib/managed-agents/__tests__/dispatch-event-to-callbacks.test.ts`:

```ts
it("routes request_approval custom tools through onApprovalRequired", async () => {
  const onApprovalRequired = vi.fn();
  const onAgentToolUse = vi.fn();

  await dispatchEventToCallbacks(
    {
      id: "toolu_request_1",
      type: "agent.custom_tool_use",
      name: "request_approval",
      input: {
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
      },
    },
    { onApprovalRequired, onAgentToolUse },
  );

  expect(onApprovalRequired).toHaveBeenCalledWith(
    expect.objectContaining({ id: "toolu_request_1" }),
    "toolu_request_1",
  );
  expect(onAgentToolUse).not.toHaveBeenCalled();
});
```

**Step 5: Run the callback test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/dispatch-event-to-callbacks.test.ts
```

Expected: `FAIL` because `agent.custom_tool_use` currently always goes to `onAgentToolUse`.

**Step 6: Write the minimal callback-dispatch change**

Modify `src/lib/managed-agents/dispatch-event-to-callbacks.ts`:

```ts
import { toInternalManagedAgentToolName } from "./tool-name-aliases";

} else if (eventType === "agent.custom_tool_use") {
  const typed = event as { id: string; name: string };
  const internalToolName = toInternalManagedAgentToolName(typed.name);

  if (internalToolName === "request_approval") {
    handler = "onApprovalRequired";
    await callbacks.onApprovalRequired?.(event, typed.id);
  } else {
    handler = "onAgentToolUse";
    await callbacks.onAgentToolUse?.(event);
  }
}
```

**Step 7: Run the targeted tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts \
  src/lib/managed-agents/__tests__/dispatch-event-to-callbacks.test.ts
```

Expected: both files `PASS`.

**Step 8: Commit**

Run:

```bash
git add \
  src/lib/managed-agents/dispatch-event-to-callbacks.ts \
  src/lib/managed-agents/events-to-assistant-parts.ts \
  src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts \
  src/lib/managed-agents/__tests__/dispatch-event-to-callbacks.test.ts
git commit -m "feat(prXX): render request_approval as approval-requested"
```

### Task 3: Extend the existing Anthropic webhook to reconcile pending approvals and finalize resumed runs

**Files:**
- Create: `src/lib/managed-agents/reconcile-pending-approvals.ts`
- Modify: `app/api/webhook/anthropic/route.ts`
- Modify: `src/lib/managed-agents/recover-orphaned-run.ts`
- Test: `src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts`
- Test: `src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts`
- Test: `app/api/webhook/anthropic/__tests__/route.test.ts`

**Step 1: Write the failing reconciliation helper test**

Create `src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { reconcilePendingApprovals } from "../reconcile-pending-approvals";

describe("reconcilePendingApprovals", () => {
  it("upserts unresolved request_approval events for a session", async () => {
    const createApprovalEvent = vi.fn().mockResolvedValue({
      success: true,
      status: "created",
    });

    vi.doMock("@/lib/approvals/queries", () => ({ createApprovalEvent }));

    const anthropic = {
      beta: {
        sessions: {
          events: {
            list: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "toolu_request_1",
                  type: "agent.custom_tool_use",
                  name: "request_approval",
                  input: {
                    summary: "Delete 3 duplicate contacts",
                    action_type: "crm.delete_records",
                  },
                },
              ],
            }),
          },
        },
      },
    } as never;

    await reconcilePendingApprovals({
      supabase: {} as never,
      anthropic,
      run: {
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        sessionId: "sess_1",
        model: "claude-haiku-4-5",
      },
    });

    expect(createApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        approvalId: "toolu_request_1",
        toolUseId: "toolu_request_1",
        toolName: "request_approval",
      }),
    );
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts
```

Expected: `FAIL` because the helper does not exist.

**Step 3: Write the minimal reconciliation helper**

Create `src/lib/managed-agents/reconcile-pending-approvals.ts`:

```ts
/**
 * Reconciles unresolved request_approval calls from a session's event log.
 *
 * @module lib/managed-agents/reconcile-pending-approvals
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createApprovalEvent } from "@/lib/approvals/queries";
import type { Database } from "@/types/database";

import type { AnthropicEvent } from "./event-types";
import type { OrphanedRunInfo } from "./recover-orphaned-run";

export async function reconcilePendingApprovals(input: {
  supabase: SupabaseClient<Database>;
  anthropic: Anthropic;
  run: OrphanedRunInfo;
}): Promise<{ reconciled: number }> {
  const page = await input.anthropic.beta.sessions.events.list(input.run.sessionId);
  const events = Array.isArray((page as { data?: unknown[] }).data)
    ? ((page as { data: AnthropicEvent[] }).data)
    : [];

  const resolvedToolIds = new Set(
    events
      .filter((event): event is Extract<AnthropicEvent, { type: "user.custom_tool_result" }> =>
        event.type === "user.custom_tool_result",
      )
      .map((event) => event.custom_tool_use_id),
  );

  const pendingApprovals = events.filter(
    (event): event is Extract<AnthropicEvent, { type: "agent.custom_tool_use" }> =>
      event.type === "agent.custom_tool_use" &&
      event.name === "request_approval" &&
      !resolvedToolIds.has(event.id),
  );

  for (const event of pendingApprovals) {
    await createApprovalEvent(input.supabase, {
      clientId: input.run.clientId,
      threadId: input.run.threadId,
      runId: input.run.runId,
      toolName: "request_approval",
      toolInput: event.input as Record<string, unknown>,
      approvalId: event.id,
      sessionId: input.run.sessionId,
      toolUseId: event.id,
    });
  }

  return { reconciled: pendingApprovals.length };
}
```

**Step 4: Write the failing webhook route test for `requires_action`**

Create `app/api/webhook/anthropic/__tests__/route.test.ts` with this first test:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhookSignature = vi.fn().mockReturnValue(true);
const recoverOrphanedRun = vi.fn();
const reconcilePendingApprovals = vi.fn();
const createAdminClient = vi.fn();
const getAnthropicClient = vi.fn().mockReturnValue({});
const afterMock = vi.fn((fn: () => unknown) => void fn());

vi.mock("@/lib/managed-agents/webhook-verify", () => ({
  verifyWebhookSignature,
}));
vi.mock("@/lib/managed-agents/recover-orphaned-run", () => ({
  recoverOrphanedRun,
}));
vi.mock("@/lib/managed-agents/reconcile-pending-approvals", () => ({
  reconcilePendingApprovals,
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient,
}));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient,
}));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => afterMock(fn),
}));

import { POST } from "../route";

describe("POST /api/webhook/anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      run_id: "run_1",
                      thread_id: "thread_1",
                      client_id: "client_1",
                      status: "running",
                      model: "claude-haiku-4-5",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
  });

  it("reconciles pending approvals when the session idles for requires_action", async () => {
    const body = JSON.stringify({
      type: "session.status_idled",
      data: {
        session_id: "sess_1",
        stop_reason: { type: "requires_action" },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/webhook/anthropic", {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "webhook-id": "msg_1",
          "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          "webhook-signature": "v1,fake",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(reconcilePendingApprovals).toHaveBeenCalled();
    expect(recoverOrphanedRun).not.toHaveBeenCalled();
  });
});
```

**Step 5: Run the webhook route test to verify it fails**

Run:

```bash
pnpm vitest run app/api/webhook/anthropic/__tests__/route.test.ts
```

Expected: `FAIL` because the route only knows orphaned-run recovery today.

**Step 6: Write the minimal webhook-route change**

Modify `app/api/webhook/anthropic/route.ts`:

```ts
import { reconcilePendingApprovals } from "@/lib/managed-agents/reconcile-pending-approvals";

after(async () => {
  try {
    const anthropic = getAnthropicClient();
    const run = {
      runId: runRow.run_id,
      threadId: runRow.thread_id,
      clientId: runRow.client_id,
      sessionId,
      model: runRow.model ?? "claude-sonnet-4-6",
    };

    if (stopReasonType === "requires_action") {
      const result = await reconcilePendingApprovals({
        supabase,
        anthropic,
        run,
      });
      console.log(`[anthropic-webhook] reconciled approvals count=${result.reconciled}`);
      return;
    }

    const result = await recoverOrphanedRun({
      supabase,
      anthropic,
      run,
      stopReasonType: stopReasonType ?? "unknown",
    });
    console.log(`[anthropic-webhook] recovery: recovered=${result.recovered} reason=${result.reason}`);
  } catch (error) {
    console.error("[anthropic-webhook] background work failed:", error);
  }
});
```

Keep the existing route path and HMAC verification exactly where they are.

**Step 7: Add the resumed-approval recovery test**

Add this test to `src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts`:

```ts
it("finalizes a resumed approval turn when the session later ends", async () => {
  const anthropic = fakeAnthropicWithEvents([
    userMessageEvent("user_1", "Delete the duplicates"),
    customToolUseEvent("toolu_request_1", "request_approval", {
      summary: "Delete 3 duplicate contacts",
      action_type: "crm.delete_records",
    }),
    statusIdleEvent("idle_1", "requires_action", ["toolu_request_1"]),
    customToolResultEvent("result_1", "toolu_request_1", {
      decision: "approved",
    }),
    agentMessageTextEvent("assistant_1", "Deleted the duplicate contacts."),
    statusIdleEvent("idle_2", "end_turn"),
  ]);

  const result = await recoverOrphanedRun({
    supabase: createMockSupabaseClient(),
    anthropic,
    run: {
      runId: "run_1",
      threadId: "thread_1",
      clientId: "client_1",
      sessionId: "sess_1",
      model: "claude-haiku-4-5",
    },
    stopReasonType: "end_turn",
  });

  expect(result).toEqual({
    recovered: true,
    reason: "full recovery completed",
  });
});
```

**Step 8: Run the targeted tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts \
  src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts \
  app/api/webhook/anthropic/__tests__/route.test.ts
```

Expected: all three files `PASS`.

**Step 9: Commit**

Run:

```bash
git add \
  src/lib/managed-agents/reconcile-pending-approvals.ts \
  src/lib/managed-agents/__tests__/reconcile-pending-approvals.test.ts \
  src/lib/managed-agents/recover-orphaned-run.ts \
  src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts \
  app/api/webhook/anthropic/route.ts \
  app/api/webhook/anthropic/__tests__/route.test.ts
git commit -m "feat(prXX): extend anthropic webhook for approval lifecycle"
```

### Task 4: Replace stream-draining approval resolution with a send-only helper

**Files:**
- Create: `src/lib/managed-agents/submit-approval-decision.ts`
- Test: `src/lib/managed-agents/__tests__/submit-approval-decision.test.ts`
- Modify: `app/api/tool-confirm/route.ts`
- Modify: `app/api/webhook/telegram/route.ts`
- Test: `app/api/tool-confirm/__tests__/route.test.ts`
- Test: `app/api/webhook/telegram/__tests__/route.test.ts`

**Step 1: Write the failing helper test**

Create `src/lib/managed-agents/__tests__/submit-approval-decision.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimApprovalResolution = vi.fn();
const releaseApprovalResolutionClaim = vi.fn();
const patchApprovalPartState = vi.fn();

vi.mock("@/lib/approvals/queries", () => ({
  claimApprovalResolution,
  releaseApprovalResolutionClaim,
  patchApprovalPartState,
}));

import { submitApprovalDecision } from "../submit-approval-decision";

describe("submitApprovalDecision", () => {
  const send = vi.fn();
  const anthropic = {
    beta: { sessions: { events: { send } } },
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    claimApprovalResolution.mockResolvedValue({
      success: true,
      status: "claimed",
      claimedStatus: "approved",
      claimedResolvedAt: "2026-04-22T10:00:00.000Z",
      event: {
        thread_id: "thread_1",
        run_id: "run_1",
        session_id: "sess_1",
        tool_use_id: "toolu_request_1",
      },
    });
    send.mockResolvedValue(undefined);
    patchApprovalPartState.mockResolvedValue({ success: true, status: "updated" });
  });

  it("claims the approval row and sends user.custom_tool_result", async () => {
    const result = await submitApprovalDecision({
      anthropic,
      supabase: {} as never,
      clientId: "client_1",
      approvalId: "toolu_request_1",
      approved: true,
    });

    expect(send).toHaveBeenCalledWith(
      "sess_1",
      expect.objectContaining({
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: "toolu_request_1",
            content: [
              { type: "text", text: JSON.stringify({ decision: "approved" }) },
            ],
          },
        ],
      }),
      expect.anything(),
    );
    expect(result).toEqual({ status: "updated", threadId: "thread_1" });
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/submit-approval-decision.test.ts
```

Expected: `FAIL` because the helper does not exist.

**Step 3: Write the minimal send-only helper**

Create `src/lib/managed-agents/submit-approval-decision.ts`:

```ts
/**
 * Sends a user.custom_tool_result decision for request_approval.
 *
 * @module lib/managed-agents/submit-approval-decision
 */
import type Anthropic from "@anthropic-ai/sdk";

import {
  claimApprovalResolution,
  patchApprovalPartState,
  releaseApprovalResolutionClaim,
} from "@/lib/approvals/queries";

import { CHAT_ANTHROPIC_REQUEST_OPTIONS } from "./chat-request-options";
import type { ManagedSupabaseClient } from "./types";

export async function submitApprovalDecision(input: {
  anthropic: Anthropic;
  supabase: ManagedSupabaseClient;
  clientId: string;
  approvalId: string;
  approved: boolean;
  denyMessage?: string;
}): Promise<
  | { status: "updated"; threadId: string }
  | { status: "missing" }
  | { status: "already_resolved"; threadId: string }
  | { status: "error"; error: string }
> {
  const claimResult = await claimApprovalResolution(input.supabase, {
    clientId: input.clientId,
    approvalId: input.approvalId,
    approved: input.approved,
  });

  if (!claimResult.success && claimResult.status === "missing") {
    return { status: "missing" };
  }

  if (claimResult.success && claimResult.status === "already_resolved") {
    return { status: "already_resolved", threadId: claimResult.event.thread_id };
  }

  if (!claimResult.success || claimResult.status !== "claimed") {
    return { status: "error", error: claimResult.error };
  }

  const { session_id, tool_use_id, thread_id } = claimResult.event;
  if (!session_id || !tool_use_id) {
    return { status: "error", error: "Approval event missing session_id or tool_use_id." };
  }

  try {
    await input.anthropic.beta.sessions.events.send(
      session_id,
      {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: tool_use_id,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  input.approved
                    ? { decision: "approved" }
                    : {
                        decision: "denied",
                        ...(input.denyMessage ? { reason: input.denyMessage } : {}),
                      },
                ),
              },
            ],
          },
        ],
      } as never,
      CHAT_ANTHROPIC_REQUEST_OPTIONS,
    );
  } catch (error) {
    await releaseApprovalResolutionClaim(input.supabase, {
      clientId: input.clientId,
      approvalId: input.approvalId,
      claimedStatus: claimResult.claimedStatus,
      claimedResolvedAt: claimResult.claimedResolvedAt,
    });
    return { status: "error", error: error instanceof Error ? error.message : "Failed to send decision." };
  }

  await patchApprovalPartState(input.supabase, {
    clientId: input.clientId,
    threadId: thread_id,
    approvalId: input.approvalId,
    approved: input.approved,
  });

  return { status: "updated", threadId: thread_id };
}
```

**Step 4: Run the helper test to verify it passes**

Run:

```bash
pnpm vitest run src/lib/managed-agents/__tests__/submit-approval-decision.test.ts
```

Expected: `PASS`.

**Step 5: Write the failing `/api/tool-confirm` route test**

Update `app/api/tool-confirm/__tests__/route.test.ts` so the success test expects the new helper and no `after()` drain:

```ts
expect(mockSubmitApprovalDecision).toHaveBeenCalledWith(
  expect.objectContaining({
    clientId: "client-1",
    approvalId: "toolu_abc123",
    approved: true,
  }),
);
expect(mockAfter).not.toHaveBeenCalled();
```

**Step 6: Run the route test to verify it fails**

Run:

```bash
pnpm vitest run app/api/tool-confirm/__tests__/route.test.ts
```

Expected: `FAIL` because the route still uses `resumeManagedAgentFromApproval()` and `after()`.

**Step 7: Write the minimal route changes**

Modify `app/api/tool-confirm/route.ts`:

```ts
import { submitApprovalDecision } from "@/lib/managed-agents/submit-approval-decision";

// remove: import { after } from "next/server";
// remove: drainStream()

const result = await submitApprovalDecision({
  anthropic,
  supabase: auth.supabase,
  clientId,
  approvalId: parsedBody.data.approvalId,
  approved: parsedBody.data.approved,
  denyMessage: parsedBody.data.denyMessage,
});

if (result.status === "missing") {
  return jsonError("Approval not found.", 404);
}
if (result.status === "already_resolved") {
  return Response.json({ success: true, status: "already_resolved" });
}
if (result.status === "error") {
  return jsonError(result.error, 500);
}

return Response.json({ success: true, status: "updated" });
```

**Step 8: Switch Telegram callbacks to the same helper**

Modify `app/api/webhook/telegram/route.ts`:

```ts
import { submitApprovalDecision } from "@/lib/managed-agents/submit-approval-decision";

const result = await submitApprovalDecision({
  anthropic,
  supabase: ctx.supabase,
  clientId: mapping.client_id,
  approvalId: input.approvalId,
  approved,
});

if (result.status === "missing") {
  await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Approval not found." });
  return;
}

if (result.status === "already_resolved") {
  await editTelegramCallbackMessage(ctx.bot, callbackQuery, "Already resolved");
  await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Already resolved." });
  return;
}

if (result.status === "error") {
  await ctx.bot.api.answerCallbackQuery(callbackId, { text: "Failed to process." });
  return;
}

await editTelegramCallbackMessage(
  ctx.bot,
  callbackQuery,
  approved ? "✅ Approved" : "❌ Denied",
);
await ctx.bot.api.answerCallbackQuery(callbackId, {
  text: approved ? "Approved — agent continuing" : "Denied",
});
```

Delete the old stream-drain code entirely.

**Step 9: Run the targeted tests to verify they pass**

Run:

```bash
pnpm vitest run \
  src/lib/managed-agents/__tests__/submit-approval-decision.test.ts \
  app/api/tool-confirm/__tests__/route.test.ts \
  app/api/webhook/telegram/__tests__/route.test.ts
```

Expected: all three files `PASS`.

**Step 10: Commit**

Run:

```bash
git add \
  src/lib/managed-agents/submit-approval-decision.ts \
  src/lib/managed-agents/__tests__/submit-approval-decision.test.ts \
  app/api/tool-confirm/route.ts \
  app/api/tool-confirm/__tests__/route.test.ts \
  app/api/webhook/telegram/route.ts \
  app/api/webhook/telegram/__tests__/route.test.ts
git commit -m "feat(prXX): make approval resolution send-only"
```

### Task 5: Add a dedicated `request_approval` card in web chat and improve Telegram approval copy

**Files:**
- Modify: `src/components/chat/tool-call-inline.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/lib/channels/telegram/approvals.ts`
- Test: `src/components/chat/tool-call-inline.test.tsx`
- Test: `src/components/chat/chat-panel.test.tsx`
- Test: `src/lib/channels/telegram/approvals.test.ts`

**Step 1: Write the failing web-card test**

Add this test to `src/components/chat/tool-call-inline.test.tsx`:

```ts
it("renders a dedicated approval card for request_approval", () => {
  render(
    <ToolCallInline
      name="request_approval"
      state="approval-requested"
      input={{
        summary: "Delete 3 duplicate contacts",
        action_type: "crm.delete_records",
        payload_preview: { record_ids: ["c1", "c2", "c3"] },
      }}
      approvalId="toolu_request_1"
      onToolApproval={vi.fn()}
    />,
  );

  expect(screen.getByText("Delete 3 duplicate contacts")).toBeInTheDocument();
  expect(screen.getByText("crm.delete_records")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
  expect(screen.getByText(/record_ids/i)).toBeInTheDocument();
});
```

**Step 2: Run the UI test to verify it fails**

Run:

```bash
pnpm vitest run src/components/chat/tool-call-inline.test.tsx
```

Expected: `FAIL` because `request_approval` is rendered as a generic tool call today.

**Step 3: Write the minimal approval-card UI**

Modify `src/components/chat/tool-call-inline.tsx`:

```ts
interface ManagedApprovalInput {
  summary: string;
  action_type: string;
  payload_preview?: Record<string, unknown>;
}

function isManagedApprovalRequest(
  toolName: string,
  input: unknown,
): input is ManagedApprovalInput {
  return (
    toolName === "request_approval" &&
    input !== null &&
    typeof input === "object" &&
    typeof (input as Record<string, unknown>).summary === "string" &&
    typeof (input as Record<string, unknown>).action_type === "string"
  );
}

function ApprovalRequestCard({
  input,
  state,
  output,
  approvalId,
  onToolApproval,
}: {
  input: ManagedApprovalInput;
  state: ToolPartState;
  output?: unknown;
  approvalId?: string;
  onToolApproval?: (approvalId: string, approved: boolean) => void;
}) {
  const decision =
    typeof output === "object" && output !== null && "decision" in (output as Record<string, unknown>)
      ? (output as { decision?: string }).decision
      : null;

  const isAwaitingApproval = state === "approval-requested";
  const isApproved = decision === "approved";
  const isDenied = decision === "denied" || state === "output-denied";

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{input.summary}</p>
        <p className="text-xs text-muted-foreground">{input.action_type}</p>
      </div>

      {input.payload_preview ? (
        <details className="text-xs text-muted-foreground">
          <summary>Payload preview</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-background/80 p-2">
            {JSON.stringify(input.payload_preview, null, 2)}
          </pre>
        </details>
      ) : null}

      {isAwaitingApproval && onToolApproval && approvalId ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => onToolApproval(approvalId, true)}>
            Allow
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onToolApproval(approvalId, false)}>
            Deny
          </Button>
        </div>
      ) : null}

      {isApproved ? <Badge variant="outline">Approved</Badge> : null}
      {isDenied ? <Badge variant="outline">Denied</Badge> : null}
    </div>
  );
}
```

Render it before the existing `PermissionCard` branch:

```ts
const managedApprovalRequest = isManagedApprovalRequest(name, input) ? input : null;

if (managedApprovalRequest) {
  return (
    <ApprovalRequestCard
      input={managedApprovalRequest}
      state={state}
      output={output}
      approvalId={approvalId}
      onToolApproval={onToolApproval}
    />
  );
}
```

Do **not** delete `PermissionCard`.

**Step 4: Wire the web approval buttons to `/api/tool-confirm`**

Modify `src/components/chat/chat-panel.tsx`:

```ts
const { messages, sendMessage, stop, status, error, setMessages } = useChat({
  // remove addToolApprovalResponse from the destructure
});

const handleToolApproval = useCallback(
  async (approvalId: string, approved: boolean) => {
    const response = await fetch("/api/tool-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, approved }),
    });

    if (!response.ok) {
      throw new Error("Failed to resolve approval.");
    }
  },
  [],
);
```

Update `src/components/chat/chat-panel.test.tsx` so it no longer expects `addToolApprovalResponse` wiring. Instead, assert that clicking an approval button calls `fetch("/api/tool-confirm", ...)`.

**Step 5: Improve Telegram approval text for `request_approval`**

Modify `src/lib/channels/telegram/approvals.ts`:

```ts
function isRequestApprovalInput(input: Record<string, unknown>): input is {
  summary: string;
  action_type: string;
  payload_preview?: Record<string, unknown>;
} {
  return typeof input.summary === "string" && typeof input.action_type === "string";
}

export function buildApprovalText(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === "request_approval" && isRequestApprovalInput(input)) {
    const payloadText = input.payload_preview
      ? JSON.stringify(input.payload_preview, null, 2).slice(0, 500)
      : null;

    return [
      "⚠️ <b>Approval Required</b>",
      "",
      `<b>${escapeHtml(input.summary)}</b>`,
      `<code>${escapeHtml(input.action_type)}</code>`,
      payloadText ? `<pre>${escapeHtml(payloadText)}</pre>` : "",
    ].filter(Boolean).join("\n");
  }

  const inputText = JSON.stringify(input, null, 2).slice(0, 500);
  return [
    "⚠️ <b>Approval Required</b>",
    "",
    `Tool: <b>${escapeHtml(toolName)}</b>`,
    `<pre>${escapeHtml(inputText)}</pre>`,
  ].join("\n");
}
```

**Step 6: Run the targeted UI and Telegram tests**

Run:

```bash
pnpm vitest run \
  src/components/chat/tool-call-inline.test.tsx \
  src/components/chat/chat-panel.test.tsx \
  src/lib/channels/telegram/approvals.test.ts
```

Expected: all three files `PASS`.

**Step 7: Commit**

Run:

```bash
git add \
  src/components/chat/tool-call-inline.tsx \
  src/components/chat/tool-call-inline.test.tsx \
  src/components/chat/chat-panel.tsx \
  src/components/chat/chat-panel.test.tsx \
  src/lib/channels/telegram/approvals.ts \
  src/lib/channels/telegram/approvals.test.ts
git commit -m "feat(prXX): add request_approval cards for web and telegram"
```

### Task 6: Gate destructive CRM actions in the agent system prompt and test only with Haiku first

**Files:**
- Create: `src/lib/managed-agents/gated-action-types.ts`
- Modify: `scripts/managed-agents/create-agent.ts`
- Test: `scripts/managed-agents/__tests__/create-agent-system.test.ts`

**Step 1: Write the failing system-prompt test**

Add this test to `scripts/managed-agents/__tests__/create-agent-system.test.ts`:

```ts
it("instructs the agent to call request_approval before destructive CRM actions", async () => {
  const system = buildManagedAgentSystem("- sample skill: example");

  expect(system).toContain("request_approval");
  expect(system).toContain("delete_records");
  expect(system).toContain("configure_crm");
  expect(system).toContain('Do not call delete_records or configure_crm unless request_approval returned {"decision":"approved"}');
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run scripts/managed-agents/__tests__/create-agent-system.test.ts
```

Expected: `FAIL` because the current system prompt only mentions generic approval behavior.

**Step 3: Write the minimal gated-action constant**

Create `src/lib/managed-agents/gated-action-types.ts`:

```ts
/**
 * Destructive action identifiers that require request_approval in v0.
 *
 * @module lib/managed-agents/gated-action-types
 */
export const GATED_ACTION_TYPES = [
  "crm.delete_records",
  "crm.configure_crm",
] as const;
```

**Step 4: Update the managed-agent system prompt**

Modify `scripts/managed-agents/create-agent.ts`:

```ts
import { GATED_ACTION_TYPES } from "@/lib/managed-agents/gated-action-types";

const gatedActionsText = GATED_ACTION_TYPES.join(", ");

export function buildManagedAgentSystem(skillsList: string): string {
  return `\
...
## Destructive CRM actions

The following destructive actions require explicit approval in chat turns: ${gatedActionsText}.

Before calling delete_records or configure_crm:
- First call request_approval with:
  - summary: one short sentence explaining what will happen
  - action_type: the stable action identifier
  - payload_preview: a small sanitized preview if useful
- Wait for the tool result.
- Do not call delete_records or configure_crm unless request_approval returned {"decision":"approved"}.

In trigger runs, do not call request_approval.
...
`;
}
```

Keep `send_message` and other external actions out of scope in this tasklist.

**Step 5: Run the prompt test to verify it passes**

Run:

```bash
pnpm vitest run scripts/managed-agents/__tests__/create-agent-system.test.ts
```

Expected: `PASS`.

**Step 6: Publish a new Haiku dev agent version**

Run:

```bash
pnpm tsx scripts/managed-agents/create-agent.ts --model claude-haiku-4-5
```

Expected: the script prints the Haiku agent id and a new agent version number.

**Step 7: Update the dev Haiku version pin and redeploy dev**

Manual step:
- Update `ANTHROPIC_AGENT_VERSION_HAIKU` in the dev environment to the new version printed in Step 6.
- Redeploy the dev environment so new sessions pin to that version.

Expected: new dev chat threads use the updated Haiku agent version.

**Step 8: Run manual Haiku-only verification**

Manual test in dev:

1. Send: `Delete these 3 duplicate contacts`.
2. Confirm the agent calls `request_approval` before deleting anything.
3. Click `Allow`.
4. Confirm the Anthropic webhook logs a `session.status_idled` event and the session later resumes and finishes.
5. Repeat with `Deny`.
6. Confirm the agent acknowledges the denial and does not call `delete_records`.
7. Repeat for `configure_crm`.

Expected:
- Exactly one approval card.
- No `ask_user_question` precursor.
- No Sonnet or Opus usage during testing.

**Step 9: Commit**

Run:

```bash
git add \
  src/lib/managed-agents/gated-action-types.ts \
  scripts/managed-agents/create-agent.ts \
  scripts/managed-agents/__tests__/create-agent-system.test.ts
git commit -m "feat(prXX): gate destructive crm actions behind request_approval"
```

**Step 10: Request review**

Use `@requesting-code-review` before continuing to cleanup and promotion.

### Task 7: Remove the old approval-resume plumbing and run the final regression + rollout

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `src/lib/managed-agents/adapter.ts`
- Modify: `src/lib/managed-agents/event-translator.ts`
- Modify: `src/lib/managed-agents/event-types.ts`
- Modify: `src/components/chat/chat-panel.tsx`
- Test: `app/api/chat/__tests__/route.test.ts`
- Test: `src/lib/managed-agents/__tests__/adapter.test.ts`
- Test: `src/lib/managed-agents/__tests__/event-translator.test.ts`

**Step 1: Replace the old `/api/chat` approval-resume test**

In `app/api/chat/__tests__/route.test.ts`, remove the old tests that assert `resumeManagedAgentFromApproval()` is called. Add this regression test instead:

```ts
it("always delegates the latest user message to runManagedAgent", async () => {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "t1",
        messages: [
          {
            id: "m1",
            role: "assistant",
            parts: [
              {
                type: "tool-request_approval",
                toolCallId: "toolu_request_1",
                state: "approval-responded",
                approval: { approved: true },
              },
            ],
          },
          {
            id: "m2",
            role: "user",
            parts: [{ type: "text", text: "thanks" }],
          },
        ],
      }),
    }),
  );

  expect(runManagedAgent).toHaveBeenCalledWith(
    expect.objectContaining({ input: "thanks" }),
  );
  expect(response.status).toBe(200);
});
```

**Step 2: Run the chat-route test to verify it fails**

Run:

```bash
pnpm vitest run app/api/chat/__tests__/route.test.ts
```

Expected: `FAIL` because the route still checks `extractApprovalContinuation()` and routes approval responses specially.

**Step 3: Delete the old approval-resume branch**

Modify `app/api/chat/route.ts`:

```ts
// remove:
// - ApprovalContinuation interface
// - extractApprovalContinuation()
// - resumeManagedAgentFromApproval import
// - getAnthropicClient import
// - the approval branch before rate limit / runManagedAgent
```

The route should become plain chat input only.

**Step 4: Delete the old streaming approval adapter**

Modify `src/lib/managed-agents/adapter.ts`:

```ts
// remove:
// - ResumeManagedAgentFromApprovalInput
// - ResumeManagedAgentResult
// - resumeManagedAgentFromApproval()
```

Keep `finalizeRun()` and `runManagedAgent()` intact.

Update `src/lib/managed-agents/__tests__/adapter.test.ts` to remove tests that target `resumeManagedAgentFromApproval()`.

**Step 5: Remove the stale built-in approval-detection branch**

Modify `src/lib/managed-agents/event-types.ts` and `src/lib/managed-agents/event-translator.ts`:

```ts
// event-types.ts
readonly evaluated_permission: "allow" | "deny";

// event-translator.ts
// remove the agent.tool_use / agent.mcp_tool_use branch that emits approvalRequest
// keep terminal handling and normal tool-result handling
```

We keep `dispatch-event-to-callbacks.ts` because it now carries `request_approval`.

**Step 6: Run the grep guards**

Run:

```bash
rg "resumeManagedAgentFromApproval|extractApprovalContinuation|addToolApprovalResponse" app src
rg 'evaluated_permission.*"ask"|evaluated_permission === "ask"' app src
rg "needsApproval" app src
```

Expected:
- first command: zero hits in `app/` and `src/`
- second command: zero hits in `app/` and `src/`
- third command: zero hits in `app/` and `src/`

**Step 7: Run the final regression suite**

Run:

```bash
pnpm vitest run \
  app/api/chat/__tests__/route.test.ts \
  app/api/tool-confirm/__tests__/route.test.ts \
  app/api/webhook/anthropic/__tests__/route.test.ts \
  app/api/webhook/telegram/__tests__/route.test.ts \
  src/lib/managed-agents/__tests__/dispatcher.test.ts \
  src/lib/managed-agents/__tests__/session-runner.test.ts \
  src/lib/managed-agents/__tests__/events-to-assistant-parts.test.ts \
  src/lib/managed-agents/__tests__/recover-orphaned-run.test.ts \
  src/components/chat/tool-call-inline.test.tsx \
  src/components/chat/chat-panel.test.tsx \
  src/lib/channels/telegram/approvals.test.ts \
  scripts/managed-agents/__tests__/create-agent-system.test.ts
```

Expected: every file `PASS`.

**Step 8: Commit**

Run:

```bash
git add \
  app/api/chat/route.ts \
  app/api/chat/__tests__/route.test.ts \
  src/lib/managed-agents/adapter.ts \
  src/lib/managed-agents/__tests__/adapter.test.ts \
  src/lib/managed-agents/event-translator.ts \
  src/lib/managed-agents/event-types.ts \
  src/lib/managed-agents/__tests__/event-translator.test.ts \
  src/components/chat/chat-panel.tsx \
  src/components/chat/chat-panel.test.tsx
git commit -m "refactor(prXX): remove legacy approval resume plumbing"
```

**Step 9: Request final review**

Use `@requesting-code-review`.

**Step 10: Promote after review**

After review is approved and the branch is merged:

1. Publish the production agents:

```bash
pnpm tsx scripts/managed-agents/create-agent.ts --model claude-sonnet-4-6
pnpm tsx scripts/managed-agents/create-agent.ts --model claude-opus-4-6
```

2. Update production env pins:
- `ANTHROPIC_AGENT_VERSION_SONNET`
- `ANTHROPIC_AGENT_VERSION_OPUS`

3. Redeploy production.

4. Smoke-test production with one Allow and one Deny flow.

Expected:
- Sonnet and Opus now use the reviewed prompt/tool set.
- The code path is identical to the Haiku-validated one.

## Final Manual QA Checklist

- Web chat: `delete_records` asks for approval exactly once.
- Web chat: `configure_crm` asks for approval exactly once.
- Web chat: Deny path does not execute the destructive tool.
- Telegram: approval request uses the agent-written summary, not raw JSON-only copy.
- Telegram: buttons are removed or message is edited after resolution.
- Webhook logs:
  - `requires_action` idle reconciles pending approvals.
  - later `end_turn` idle finalizes the resumed run.
- Reloading the chat after the pause shows the approval card from persisted message parts.
- Existing connection-permission card still renders for connection activation flows.

## Out of Scope

- Gating `send_message`, browser write actions, or Composio write tools.
- Four-choice approval UI.
- Per-client approval rules.
- New database tables.
- Renaming webhook routes.

## Rollback Plan

- Revert the code changes.
- Re-publish the previous Haiku, Sonnet, and Opus agent versions if needed.
- Re-pin `ANTHROPIC_AGENT_VERSION_*` env vars to the last known-good versions.
- Because sessions are version-pinned at creation time, old sessions keep their old behavior; only new sessions follow the new pin.
