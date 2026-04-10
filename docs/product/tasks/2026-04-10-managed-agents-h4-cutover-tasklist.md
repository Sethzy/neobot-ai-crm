# Managed Agents Migration — H4 Cutover ⚠️

**Handover:** `docs/product/plans/2026-04-10-managed-agents-h4-cutover-handover.md`
**Plan:** `docs/product/plans/2026-04-09-001-feat-managed-agents-migration-plan.md`
**Decisions:** D3 (JIT UI via `pipeJsonRender`), D4 (Drop Langfuse), D5 (No feature flag — atomic cutover), D6 (Telegram approvals via `approval_events`), D9 (All tools as custom tools)

**Goal:** Atomically cut `app/api/chat/route.ts` over to `runManagedAgent()`, rewire approvals through `sessions.events.send`, delete the legacy runner and Langfuse infrastructure, and verify production chat traffic flows through Managed Agents — in a single PR whose rollback is `git revert`.

**Architecture:** No feature flag (D5) — the new adapter is wired live in one PR. User-auth Supabase is preserved through the custom tool dispatcher so RLS remains the tenant isolation gate (D9). Telegram and browser approvals both look up `approval_events` by `approval_id` and forward `user.tool_confirmation` to Anthropic (D6). Evaluators run in-process on the adapter's terminal state, so Langfuse and its OTel processor disappear entirely (D4). Spec fences continue to render via `pipeJsonRender` over the adapter's `UIMessageStream` output (D3).

**Tech Stack:** `@anthropic-ai/sdk` (beta managed agents), `ai` v6 `createUIMessageStream`, `@json-render/core` `pipeJsonRender`, Supabase (RLS + service-role), grammy (Telegram), Vitest.

**⚠️ RISK:** This is the atomic cutover PR. No feature flag. All 12 integration scenarios must pass before merge (scenario 12 deferred to H5). Rollback = `git revert <merge-commit>`. The only destructive schema change is `DROP TABLE thread_queue_records` — verify unused before running. All other H1 schema additions are additive and harmless if the legacy runner returns.

**NON-NEGOTIABLES:**
- **No scope creep.** Do not bundle "improvements" that are not in this tasklist. If you notice a bug, write a follow-up ticket.
- **Separate commits** for wiring and deletion — the PR is one logical unit but commits must review individually.
- **Cross-tenant leak test (scenario 11) is the merge gate.** If it fails, the PR does not merge.
- **Do not touch** `buildApprovalCallbackData` / `parseApprovalCallback` in `src/lib/channels/telegram/approvals.ts` — callback_data format is unchanged, only the backend routing changes.
- **Do not touch** the H1 schema additions — only `DROP TABLE thread_queue_records` is in scope.

**Commit prefixes:** `feat(h4):` for wiring + new routes, `refactor(h4):` for approval flow updates, `chore(h4):` for deletions.

**Sequencing (updated):** H1 → H2 → H3 → **H5 listener only** → **H4 (this PR)** → H5 remainder. The H5 `runTriggerAgent` Trigger.dev task ships as its own listener-only PR *before* H4 is opened for review. H4 imports it from `src/trigger/run-trigger-agent.ts`. Rollback of H4 leaves the listener-only PR in place — it's a no-op until something calls `runTriggerAgent.trigger()`.

**Entry state (assume after H1 + H2 + H3 + H5 listener-only PR):**
- Schema: `runs.session_id`, `runs.events_cursor`, `conversation_threads.session_id`, `conversation_messages.source_event_id` + unique idx, `approval_events.session_id` + `approval_events.tool_use_id`, `run_scores` table
- Env vars: `ANTHROPIC_AGENT_ID`, `ANTHROPIC_AGENT_VERSION`, `ANTHROPIC_ENVIRONMENT_ID`, `ANTHROPIC_API_KEY`, `TRIGGER_SECRET_KEY`
- `src/lib/managed-agents/tools/*` with 38 custom tool factories + CI lint
- `src/lib/managed-agents/adapter.ts` (`runManagedAgent`), `dispatcher.ts`, `event-translator.ts`, `adapter-reconnect.ts` (`reconnectToSession`) — all unit-tested
- `src/lib/eval/extract-tool-sequence.ts` has both `extractToolSequenceFromObservations` and `extractToolSequenceFromEvents`
- `src/lib/eval/run-scores-writer.ts` + `runEvaluatorsForEvents` in `run-evaluators.ts` exist and are wired into the adapter's completion hook
- **H5 listener-only PR merged:** `src/trigger/run-trigger-agent.ts` exports `runTriggerAgent` (Trigger.dev task) with payload `{ runId, sessionId, clientId, threadId }`. The task is deployed but nothing calls it yet — no-op until H4 lands.
- Legacy runner (`src/lib/runner/run-agent.ts` etc.) still handles production chat traffic
- Langfuse (`@langfuse/otel`, `@langfuse/tracing`, `langfuse-api.ts`) still live

**Exit state:**
- `app/api/chat/route.ts` calls `runManagedAgent()`
- `/api/tool-confirm` route exists + tested
- Telegram callback routes approvals via `sessions.events.send`
- File upload mid-session attaches to Anthropic session as resource
- `/api/sessions/[sessionId]/files` artifact-download route exists
- Legacy runner files deleted; `thread_queue_records` table + `drain_thread_queue` function dropped
- `resumable-stream` package + `consumeSseStream` infra removed
- Langfuse packages, helper, OTel processor, evaluator back-compat path all deleted
- Trigger fire path creates disposable sessions and spawns H5's `runTriggerAgent` Trigger.dev task (no local polling in H4)
- `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass
- All 11 in-scope integration scenarios manually verified (scenario 12 deferred to H5 remainder)

---

## Relevant Files

### Modify
- `app/api/chat/route.ts`
- `app/api/chat/[id]/stream/route.ts`
- `app/api/webhook/telegram/route.ts`
- `app/api/webhook/telegram/__tests__/route.test.ts`
- `app/api/meetings/[id]/send-to-agent/route.ts`
- `app/api/meetings/[id]/send-to-agent/route.test.ts`
- `app/api/files/upload/route.ts`
- `src/lib/triggers/executor.ts`
- `src/lib/triggers/__tests__/executor.test.ts`
- `src/instrumentation.ts`
- `src/lib/env.ts`
- `src/lib/ai/__tests__/chat-route.test.ts`
- `src/lib/ai/__tests__/chat-route-crm-mode.test.ts` (delete if fully obsolete; see Part A Task 5)
- `package.json`

### Create
- `app/api/tool-confirm/route.ts`
- `app/api/tool-confirm/__tests__/route.test.ts`
- `app/api/sessions/[sessionId]/files/route.ts`
- `app/api/sessions/[sessionId]/files/__tests__/route.test.ts`
- `src/lib/managed-agents/resolve-approval.ts` — shared approval-id → session event helper for `/api/tool-confirm` and Telegram webhook
- `src/lib/managed-agents/__tests__/resolve-approval.test.ts`
- `src/lib/managed-agents/attach-session-file.ts` — upload file to Anthropic + attach to session as resource
- `src/lib/managed-agents/__tests__/attach-session-file.test.ts`
- `src/lib/managed-agents/download-session-files.ts` — list + download + mirror to Supabase Storage with retry
- `src/lib/managed-agents/__tests__/download-session-files.test.ts`
- `src/lib/managed-agents/spawn-trigger-run.ts` — fire-path helper: create session, insert `runs` row, send kickoff, spawn `runTriggerAgent`
- `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`
- `supabase/migrations/20260410120000_drop_thread_queue_records.sql`
- `supabase/migrations/__tests__/drop-thread-queue-records-migration.test.ts`

### Import from H5 listener-only PR (already merged)
- `src/trigger/run-trigger-agent.ts` — exports `runTriggerAgent` Trigger.dev task. **Do not modify.** H4 only imports and spawns it via `runTriggerAgent.trigger({ runId, sessionId, clientId, threadId })`.

### Delete (legacy runner)
- `src/lib/runner/run-agent.ts` + `__tests__/run-agent.test.ts`
- `src/lib/runner/compaction.ts` + tests under `__tests__`
- `src/lib/runner/safety-gates.ts` + tests
- `src/lib/runner/drain-and-continue.ts` + `__tests__/drain-and-continue.test.ts`
- `src/lib/runner/thread-queue.ts` + tests
- `src/lib/runner/run-lifecycle.ts` + tests (if still referenced only by deleted files)
- `src/lib/runner/run-persistence.ts` + tests (verify not referenced by managed-agents adapter first)
- `src/lib/runner/run-autopilot.ts` + `__tests__/run-autopilot.test.ts`
- `src/lib/runner/run-meeting-followup.ts` + `__tests__/run-meeting-followup.test.ts`
- `src/lib/runner/tool-registry.ts`
- `src/lib/runner/tools/**` (any reference copies left by H2)
- `src/lib/runner/context.ts` (verify `buildSystemReminder` has been moved/absorbed by adapter first)
- `src/lib/runner/schemas.ts` (verify no managed-agents imports first)
- `src/lib/runner/index.ts`
- `src/lib/runner/__tests__/**` (all remaining tests under this directory)
- `src/lib/runner/message-utils.ts` — only if adapter doesn't still import `splitTextAndSpecParts` fallback; otherwise move + rename
- `src/lib/approvals/continue-after-approval.ts` + `continue-after-approval.test.ts`
- `src/lib/ai/gateway.ts` + its tests

### Delete (Langfuse)
- `src/lib/eval/langfuse-api.ts`
- `src/lib/eval/__tests__/langfuse-api.test.ts` (if exists)
- Langfuse-specific branches in `src/lib/eval/run-evaluators.ts` (`fetchTraceWithRetry`, `runEvaluatorsForTrace`)
- `extractToolSequenceFromObservations` (back-compat overload) in `src/lib/eval/extract-tool-sequence.ts`
- `@langfuse/otel`, `@langfuse/tracing` from `package.json`
- `LangfuseSpanProcessor` + `registerLangfuseTracing` from `src/instrumentation.ts`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` from `src/lib/env.ts` (verify each exists first)

### Delete (resumable-stream)
- `resumable-stream` from `package.json`
- `createResumableStreamContext` / `getStreamContext` / `consumeSseStream` sites in `app/api/chat/route.ts`
- `app/api/chat/[id]/stream/route.ts` if wholly obsolete OR rewrite around `reconnectToSession()` from the adapter

---

## Part A — Wire Adapter into Chat Route

Single commit: `feat(h4): wire runManagedAgent into chat route`

### Task 1: Update chat route test to expect `runManagedAgent`

**Files:**
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

#### Step 1: Swap the runner mock

Replace every `vi.mock("@/lib/runner/run-agent", ...)` import site with a mock of `@/lib/managed-agents/adapter`. Rename `mockRunAgent` → `mockRunManagedAgent`. Keep the rest of the test fixtures unchanged.

```typescript
// top of file
const mockRunManagedAgent = vi.fn();
vi.mock("@/lib/managed-agents/adapter", () => ({
  runManagedAgent: mockRunManagedAgent,
}));
```

#### Step 2: Update the stream-shape expectation

The current mock returns `{ status: "streaming", streamResult: { toUIMessageStream: () => ... }, traceId: "..." }`. The adapter returns a `ReadableStream<UIMessageStreamPart>` directly (no `traceId`, no `.toUIMessageStream()`). Update the happy-path mock to:

```typescript
mockRunManagedAgent.mockResolvedValue({
  status: "streaming" as const,
  uiStream: new ReadableStream({ start(controller) { controller.close(); } }),
});
```

(The adapter contract from H3 is: `{status: "streaming", uiStream} | {status: "queued"} | {status: "error", error}`.)

#### Step 3: Delete `traceId`/Langfuse assertions

Remove every `expect(...traceId...)` and every `runEvaluatorsForTrace` mock from this file.

#### Step 4: Run the test

```bash
pnpm vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: FAIL — route still imports `runAgent`. That's the red state we want.

### Task 2: Swap the runner import in the chat route

**Files:**
- Modify: `app/api/chat/route.ts`

#### Step 1: Replace the import

```typescript
// BEFORE
import { runAgent } from "@/lib/runner/run-agent";
import type { RunnerFilePart } from "@/lib/runner/schemas";

// AFTER
import { runManagedAgent } from "@/lib/managed-agents/adapter";
import type { ManagedFilePart } from "@/lib/managed-agents/types";
```

If the adapter's file-part type lives elsewhere (per H3), use that — the test in Task 1 will tell you what name to import.

#### Step 2: Update the call site at line 331

```typescript
// BEFORE
const result = await runAgent(
  {
    clientId: resolvedClientId,
    threadId,
    triggerType: "chat",
    consumeMessageQuota: body.message?.role === "user",
    input,
    selectedChatModel: body.selectedChatModel,
    ...(fileParts.length > 0 ? { fileParts } : {}),
    crmMode: body.crmMode,
  },
  supabase,
);

// AFTER
const result = await runManagedAgent(
  {
    clientId: resolvedClientId,
    threadId,
    triggerType: "chat",
    consumeMessageQuota: body.message?.role === "user",
    input,
    ...(fileParts.length > 0 ? { fileParts } : {}),
  },
  supabase,
);
```

**Drop:** `selectedChatModel` (model is pinned by Anthropic agent version, per D5), `crmMode` (already removed by H1 — verify nothing in this file still references `body.crmMode`).

#### Step 3: Replace the `pipeJsonRender` wrapping

The current code wraps `result.streamResult.toUIMessageStream()`. Replace with the adapter's `uiStream` directly:

```typescript
// BEFORE
writer.merge(pipeJsonRender(result.streamResult.toUIMessageStream()));

// AFTER
writer.merge(pipeJsonRender(result.uiStream));
```

#### Step 4: Delete the evaluator `after()` hook

```typescript
// DELETE THIS BLOCK at line 402
after(async () => {
  await langfuseSpanProcessor.forceFlush();
  if (result.traceId) {
    await runEvaluatorsForTrace(result.traceId);
  }
});
```

Evaluators now run inline inside `runManagedAgent` per H3.

#### Step 5: Delete the Langfuse import

```typescript
// DELETE
import { langfuseSpanProcessor } from "@/instrumentation";
import { runEvaluatorsForTrace } from "@/lib/eval/run-evaluators";
```

#### Step 6: Rerun the test

```bash
pnpm vitest run src/lib/ai/__tests__/chat-route.test.ts
```

Expected: PASS. If compile errors about `crmMode` remain, delete the `postRequestBodySchema.crmMode` field too — H1 should have deleted it already but verify.

### Task 3: Verify `selectedChatModel` guard handling

**Files:**
- Modify: `app/api/chat/route.ts`

#### Step 1: Decide the UX

`allowedModelIds` is consulted on line 173 to validate `body.selectedChatModel`. Since the agent version now pins the model, options:

- **Option A (kept):** Still validate the field so older clients don't get a 500. Accept the value, ignore it downstream. Log-only.
- **Option B (dropped):** Remove the validation entirely. Frontend stops sending the field.

Pick Option A for now — a follow-up ticket can remove the field from the request schema. Leave the validation block intact but add a TODO comment:

```typescript
// TODO(h5-cleanup): drop selectedChatModel from the schema; model is pinned by ANTHROPIC_AGENT_VERSION.
if (body.selectedChatModel !== undefined && !allowedModelIds.has(body.selectedChatModel)) {
  return jsonError("Invalid selected chat model.", 400);
}
```

#### Step 2: Typecheck

```bash
pnpm typecheck
```

Expected: passes.

### Task 4: Verify `crmMode` is fully gone from the request path

**Files:** grep-only

#### Step 1: Grep for residual references

```bash
rg -n "crmMode|crm_mode" app/api/chat src/lib/ai
```

If any remain in chat request handling, delete them. H1 removed the agent-side handling but the request schema may still accept it.

#### Step 2: Delete obsolete CRM-mode test file

If `src/lib/ai/__tests__/chat-route-crm-mode.test.ts` is now vestigial (tests that `runAgent` received a `crmMode` prop), delete it entirely. The call site no longer accepts the prop.

```bash
rm src/lib/ai/__tests__/chat-route-crm-mode.test.ts
```

#### Step 3: Rerun the full chat-route test suite

```bash
pnpm vitest run src/lib/ai/__tests__/
```

Expected: PASS.

### Task 5: Commit Part A

```bash
git add app/api/chat/route.ts src/lib/ai/__tests__/chat-route.test.ts
git rm src/lib/ai/__tests__/chat-route-crm-mode.test.ts
git commit -m "feat(h4): wire runManagedAgent into chat route"
```

---

## Part B — Shared approval resolver helper

Single commit: `feat(h4): shared approval-id to Anthropic session resolver`

The `/api/tool-confirm` route and the Telegram webhook both need the same logic: look up `approval_events` by `approval_id`, fetch `session_id + tool_use_id`, POST `user.tool_confirmation` to Anthropic, mark the event resolved. DRY it into one helper.

### Task 6: Write failing test for `resolveApprovalById`

**Files:**
- Create: `src/lib/managed-agents/__tests__/resolve-approval.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

import { resolveApprovalById } from "../resolve-approval";

const sessionsEventsSend = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      sessions: {
        events: { send: sessionsEventsSend },
      },
    },
  }),
}));

function mockSupabase(event: {
  session_id: string | null;
  tool_use_id: string | null;
  thread_id: string;
  client_id: string;
  status: "pending" | "approved" | "denied";
} | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: event, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("resolveApprovalById", () => {
  beforeEach(() => {
    sessionsEventsSend.mockClear();
  });

  it("forwards an allow decision to Anthropic and marks the event approved", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "pending",
    });

    const result = await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("updated");
    expect(sessionsEventsSend).toHaveBeenCalledWith("session_123", {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "toolu_abc",
          result: "allow",
        },
      ],
    });
  });

  it("forwards a deny decision with the default deny_message", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "pending",
    });

    await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: false,
    });

    expect(sessionsEventsSend).toHaveBeenCalledWith("session_123", {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "toolu_abc",
          result: "deny",
          deny_message: "User denied this action.",
        },
      ],
    });
  });

  it("returns 'missing' when approval_id is not found", async () => {
    const supabase = mockSupabase(null);
    const result = await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe("missing");
    expect(sessionsEventsSend).not.toHaveBeenCalled();
  });

  it("returns 'already_resolved' without re-sending when status is not pending", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "approved",
    });

    const result = await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("already_resolved");
    expect(sessionsEventsSend).not.toHaveBeenCalled();
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/resolve-approval.test.ts
```

Expected: FAIL — module not found.

### Task 7: Implement `resolveApprovalById`

**Files:**
- Create: `src/lib/managed-agents/resolve-approval.ts`

#### Step 1: Write the helper

```typescript
/**
 * Shared resolver for approval UUIDs → Anthropic `user.tool_confirmation`.
 * Used by `/api/tool-confirm` and the Telegram webhook. The uuid → session_id
 * indirection lives here so neither caller has to know about the Anthropic
 * session id (which is too long for Telegram's 64-byte callback_data limit).
 * @module lib/managed-agents/resolve-approval
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import type { Database } from "@/types/database";

type ResolveSupabase = SupabaseClient<Database>;

interface ResolveInput {
  clientId: string;
  approvalId: string;
  approved: boolean;
  denyMessage?: string;
}

type ResolveResult =
  | { success: true; status: "updated" | "already_resolved"; threadId: string }
  | { success: false; status: "missing" | "error"; error?: string };

const DEFAULT_DENY_MESSAGE = "User denied this action.";

export async function resolveApprovalById(
  supabase: ResolveSupabase,
  input: ResolveInput,
): Promise<ResolveResult> {
  const { data: event, error } = await supabase
    .from("approval_events")
    .select("session_id, tool_use_id, thread_id, client_id, status")
    .eq("approval_id", input.approvalId)
    .eq("client_id", input.clientId)
    .single();

  if (error || !event) {
    return { success: false, status: "missing", error: error?.message };
  }

  if (event.status !== "pending") {
    return { success: true, status: "already_resolved", threadId: event.thread_id };
  }

  if (!event.session_id || !event.tool_use_id) {
    return {
      success: false,
      status: "error",
      error: "approval_events row is missing session_id or tool_use_id — H1 migration incomplete?",
    };
  }

  const client = getAnthropicClient();
  await client.beta.sessions.events.send(event.session_id, {
    events: [
      input.approved
        ? {
          type: "user.tool_confirmation" as const,
          tool_use_id: event.tool_use_id,
          result: "allow" as const,
        }
        : {
          type: "user.tool_confirmation" as const,
          tool_use_id: event.tool_use_id,
          result: "deny" as const,
          deny_message: input.denyMessage ?? DEFAULT_DENY_MESSAGE,
        },
    ],
  });

  const { error: updateError } = await supabase
    .from("approval_events")
    .update({
      status: input.approved ? "approved" : "denied",
      resolved_at: new Date().toISOString(),
    })
    .eq("approval_id", input.approvalId)
    .eq("client_id", input.clientId)
    .eq("status", "pending");

  if (updateError) {
    return { success: false, status: "error", error: updateError.message };
  }

  return { success: true, status: "updated", threadId: event.thread_id };
}
```

(If `getAnthropicClient` doesn't exist, grep `src/lib/managed-agents` for the H3 Anthropic SDK singleton and use it.)

#### Step 2: Rerun the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/resolve-approval.test.ts
```

Expected: PASS.

#### Step 3: Commit

```bash
git add src/lib/managed-agents/resolve-approval.ts src/lib/managed-agents/__tests__/resolve-approval.test.ts
git commit -m "feat(h4): shared approval-id to Anthropic session resolver"
```

---

## Part C — `/api/tool-confirm` route

Single commit: `feat(h4): /api/tool-confirm route for browser approvals`

### Task 8: Write failing test for the route

**Files:**
- Create: `app/api/tool-confirm/__tests__/route.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveApprovalById = vi.fn();
vi.mock("@/lib/managed-agents/resolve-approval", () => ({
  resolveApprovalById: mockResolveApprovalById,
}));

const mockAuthenticateRequest = vi.fn();
const mockResolveClientId = vi.fn();
vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: mockAuthenticateRequest,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId: mockResolveClientId }));
vi.mock("@/lib/analytics/posthog-server", () => ({ captureServerEvent: vi.fn() }));

import { POST } from "../route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/tool-confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockResolveApprovalById.mockReset();
  mockAuthenticateRequest.mockResolvedValue({
    kind: "ok",
    supabase: {},
    userId: "user-1",
  });
  mockResolveClientId.mockResolvedValue("client-1");
});

describe("POST /api/tool-confirm", () => {
  it("returns 200 when Anthropic accepts the tool_confirmation", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: true,
      status: "updated",
      threadId: "thread-1",
    });

    const response = await POST(jsonRequest({ approvalId: "approval_xyz", approved: true }));

    expect(response.status).toBe(200);
    expect(mockResolveApprovalById).toHaveBeenCalledWith(
      {},
      { clientId: "client-1", approvalId: "approval_xyz", approved: true },
    );
  });

  it("returns 404 for an unknown approvalId", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: false,
      status: "missing",
    });

    const response = await POST(jsonRequest({ approvalId: "approval_nope", approved: true }));

    expect(response.status).toBe(404);
  });

  it("returns 400 when the body fails schema validation", async () => {
    const response = await POST(jsonRequest({ approvalId: 42 }));
    expect(response.status).toBe(400);
    expect(mockResolveApprovalById).not.toHaveBeenCalled();
  });

  it("returns 401 when authenticateRequest fails", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: new Response("unauth", { status: 401 }),
    });

    const response = await POST(jsonRequest({ approvalId: "approval_xyz", approved: true }));
    expect(response.status).toBe(401);
  });

  it("returns 200 with already_resolved status for duplicate confirmations", async () => {
    mockResolveApprovalById.mockResolvedValue({
      success: true,
      status: "already_resolved",
      threadId: "thread-1",
    });

    const response = await POST(jsonRequest({ approvalId: "approval_xyz", approved: true }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("already_resolved");
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run app/api/tool-confirm/__tests__/route.test.ts
```

Expected: FAIL — module not found.

### Task 9: Implement the route

**Files:**
- Create: `app/api/tool-confirm/route.ts`

#### Step 1: Write the handler

```typescript
/**
 * Browser approval endpoint. Resolves an approval_id to an Anthropic
 * Managed Agents session event and forwards allow/deny so the paused session
 * can continue. The session resumes streaming via reconnectToSession
 * on the next chat POST.
 * @module app/api/tool-confirm/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { resolveClientId } from "@/lib/chat/client-id";
import { resolveApprovalById } from "@/lib/managed-agents/resolve-approval";

const bodySchema = z.object({
  approvalId: z.string().uuid(),
  approved: z.boolean(),
  denyMessage: z.string().max(500).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const { supabase, userId } = auth;

  const clientId = await resolveClientId(supabase, userId);

  const result = await resolveApprovalById(supabase, {
    clientId,
    approvalId: parsed.approvalId,
    approved: parsed.approved,
    denyMessage: parsed.denyMessage,
  });

  if (!result.success) {
    if (result.status === "missing") return jsonError("Approval not found.", 404);
    return jsonError(result.error ?? "Failed to resolve approval.", 500);
  }

  await captureServerEvent({
    distinctId: clientId,
    event: "approval_resolved",
    properties: {
      approval_id: parsed.approvalId,
      outcome: parsed.approved ? "approved" : "denied",
      source: "web",
    },
  });

  return Response.json({ success: true, status: result.status });
}
```

#### Step 2: Rerun the test

```bash
pnpm vitest run app/api/tool-confirm/__tests__/route.test.ts
```

Expected: PASS.

### Task 10: Frontend pointer

**Files:** none (doc-only)

#### Step 1: Update the handover notes

The browser currently re-posts to `/api/chat` with approval state embedded in messages (see `getApprovalResponses` in `app/api/chat/route.ts`). In the new flow, the browser POSTs to `/api/tool-confirm` and then, once the approval resolves, the chat client reconnects to the existing session on its next message. **No chat-client UI change is in scope for H4** — the frontend rewiring ships as a follow-up in H5.

Leave a code comment on `getApprovalResponses` in `app/api/chat/route.ts`:

```typescript
// TODO(h5): delete getApprovalResponses once the frontend switches to
// POST /api/tool-confirm instead of re-posting through /api/chat.
```

Do not delete the function in this PR — it stays as a compatibility shim until the frontend ships.

### Task 11: Commit Part C

```bash
git add app/api/tool-confirm/route.ts app/api/tool-confirm/__tests__/route.test.ts app/api/chat/route.ts
git commit -m "feat(h4): /api/tool-confirm route for browser approvals"
```

---

## Part D — Telegram callback rewire

Single commit: `refactor(h4): telegram approvals via sessions.events.send`

### Task 12: Update Telegram webhook test

**Files:**
- Modify: `app/api/webhook/telegram/__tests__/route.test.ts`

#### Step 1: Swap the mock

```typescript
// BEFORE
const mockResolveAndContinueApproval = vi.fn();
vi.mock("@/lib/approvals/continue-after-approval", () => ({
  resolveAndContinueApproval: (...args: unknown[]) =>
    mockResolveAndContinueApproval(...args),
}));

// AFTER
const mockResolveApprovalById = vi.fn();
vi.mock("@/lib/managed-agents/resolve-approval", () => ({
  resolveApprovalById: (...args: unknown[]) => mockResolveApprovalById(...args),
}));
```

#### Step 2: Update approve/deny test expectations

Every test that asserted `resolveAndContinueApproval` was called with `{clientId, threadId, approvalId, approved}` should now assert `resolveApprovalById` was called with `{clientId, approvalId, approved}` (no `threadId` — the resolver looks it up internally).

For the "deny" test, assert the resolver was called with `approved: false` and verify the Telegram reply text.

#### Step 3: Run the test

```bash
pnpm vitest run app/api/webhook/telegram/__tests__/route.test.ts
```

Expected: FAIL — production route still uses the old helper.

### Task 13: Update the Telegram webhook handler

**Files:**
- Modify: `app/api/webhook/telegram/route.ts`

#### Step 1: Swap the import

```typescript
// BEFORE
import { resolveAndContinueApproval } from "@/lib/approvals/continue-after-approval";

// AFTER
import { resolveApprovalById } from "@/lib/managed-agents/resolve-approval";
```

#### Step 2: Swap the call

Replace the `resolveAndContinueApproval(...)` call around line 402. The new flow is simpler because there's no second agent run to kick off — the Anthropic session resumes itself:

```typescript
const result = await resolveApprovalById(ctx.supabase, {
  clientId: mapping.client_id,
  approvalId: input.approvalId,
  approved,
});

if (result.success) {
  const statusLabel = result.status === "already_resolved"
    ? "Already resolved"
    : approved
      ? "✅ Approved"
      : "❌ Denied";
  await editTelegramCallbackMessage(ctx.bot, callbackQuery, statusLabel);
}

await ctx.bot.api.answerCallbackQuery(callbackId, {
  text: result.success
    ? (
      result.status === "already_resolved"
        ? "Already resolved."
        : approved
          ? "Approved — agent continuing"
          : "Denied"
    )
    : "Failed to process",
});
```

#### Step 3: Prune the stale-thread handling

The old flow had a `isStaleThread` branch because the agent run would execute on whichever thread the approval belonged to. In the new flow the Anthropic session holds the conversation, so there's no "stale thread" concept. Delete the `isStaleThread` block and the "response in web app (session changed)" message — or convert it to a warning only if `result.threadId !== mapping.thread_id`:

```typescript
const isStaleThread = result.success && "threadId" in result && result.threadId !== mapping.thread_id;
// ... use in the answerCallbackQuery text as before if you want to keep the UX
```

Keep the stale-thread warning if it's load-bearing; otherwise delete for simplicity. Pick whichever the existing tests exercise.

#### Step 4: Rerun the test

```bash
pnpm vitest run app/api/webhook/telegram/__tests__/route.test.ts
```

Expected: PASS.

#### Step 5: Verify `buildApprovalCallbackData` is untouched

```bash
rg -n "buildApprovalCallbackData|parseApprovalCallback" src/lib/channels/telegram/ app/api/webhook/telegram/
```

Expected: same call sites as before. The 45-byte `approve:<uuid>` format stays.

### Task 14: Commit Part D

```bash
git add app/api/webhook/telegram/route.ts app/api/webhook/telegram/__tests__/route.test.ts
git commit -m "refactor(h4): telegram approvals via sessions.events.send"
```

---

## Part E — File Upload Mid-Session

Single commit: `feat(h4): attach uploaded files to active Anthropic sessions`

### Task 15: Write failing test for `attachFileToSession`

**Files:**
- Create: `src/lib/managed-agents/__tests__/attach-session-file.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

import { attachFileToSession } from "../attach-session-file";

const filesUpload = vi.fn();
const resourcesAdd = vi.fn();

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      files: { upload: filesUpload },
      sessions: { resources: { add: resourcesAdd } },
    },
  }),
}));

beforeEach(() => {
  filesUpload.mockReset().mockResolvedValue({ id: "file_123" });
  resourcesAdd.mockReset().mockResolvedValue({});
});

describe("attachFileToSession", () => {
  it("uploads to Anthropic and attaches the returned file id as a session resource", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    await attachFileToSession({
      sessionId: "session_abc",
      file: blob,
      filename: "notes.txt",
    });
    expect(filesUpload).toHaveBeenCalledWith(
      expect.objectContaining({ file: expect.anything() }),
    );
    expect(resourcesAdd).toHaveBeenCalledWith("session_abc", {
      type: "file",
      file_id: "file_123",
    });
  });

  it("surfaces the Anthropic file id in the return value", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const result = await attachFileToSession({
      sessionId: "session_abc",
      file: blob,
      filename: "notes.txt",
    });
    expect(result.anthropicFileId).toBe("file_123");
  });

  it("returns { attached: false } when no sessionId is provided", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const result = await attachFileToSession({
      sessionId: null,
      file: blob,
      filename: "notes.txt",
    });
    expect(result.attached).toBe(false);
    expect(filesUpload).not.toHaveBeenCalled();
    expect(resourcesAdd).not.toHaveBeenCalled();
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/attach-session-file.test.ts
```

Expected: FAIL — module not found.

### Task 16: Implement `attachFileToSession`

**Files:**
- Create: `src/lib/managed-agents/attach-session-file.ts`

```typescript
/**
 * Uploads a file to Anthropic and attaches it to an active Managed Agents
 * session so the agent's `read` tool can access it mid-conversation.
 * @module lib/managed-agents/attach-session-file
 */
import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";

interface AttachInput {
  sessionId: string | null;
  file: Blob;
  filename: string;
}

type AttachResult =
  | { attached: true; anthropicFileId: string }
  | { attached: false };

export async function attachFileToSession(input: AttachInput): Promise<AttachResult> {
  if (!input.sessionId) {
    return { attached: false };
  }

  const client = getAnthropicClient();

  // Upload first, then attach as a session resource.
  const uploaded = await client.beta.files.upload({
    file: new File([input.file], input.filename, { type: input.file.type }),
  });

  await client.beta.sessions.resources.add(input.sessionId, {
    type: "file",
    file_id: uploaded.id,
  });

  return { attached: true, anthropicFileId: uploaded.id };
}
```

Adjust the upload payload shape if the H3 Anthropic client wrapper uses a different API surface (grep for existing `client.beta.files.upload` usage in `src/lib/managed-agents`).

#### Step 1: Rerun the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/attach-session-file.test.ts
```

Expected: PASS.

### Task 17: Wire the upload route to attach mid-session

**Files:**
- Modify: `app/api/files/upload/route.ts`

#### Step 1: Accept an optional `threadId`

Add a `threadId` field to the form data. When present, look up `conversation_threads.session_id` for that thread + client. If there's an active session, call `attachFileToSession` after the Supabase upload succeeds.

```typescript
import { attachFileToSession } from "@/lib/managed-agents/attach-session-file";

// After signed URL is created:
const threadIdField = formData.get("threadId");
if (typeof threadIdField === "string" && threadIdField.length > 0) {
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", threadIdField)
    .eq("client_id", clientId)
    .maybeSingle();

  if (thread?.session_id) {
    try {
      await attachFileToSession({
        sessionId: thread.session_id,
        file: fileEntry,
        filename,
      });
    } catch (error) {
      console.error("[files/upload] Failed to attach file to Anthropic session:", error);
      // Continue — Supabase upload still succeeded so the URL is returned.
    }
  }
}
```

Failure to attach is logged, not fatal — the Supabase signed URL is still returned, and the next chat message will include the file as a kickoff attachment anyway.

#### Step 2: Update the upload route test

`app/api/files/upload/route.test.ts` — add a case: when `threadId` is present and the thread has a `session_id`, `attachFileToSession` is called with `{sessionId, file, filename}`. Mock the helper.

#### Step 3: Run both tests

```bash
pnpm vitest run app/api/files/upload/ src/lib/managed-agents/__tests__/attach-session-file.test.ts
```

Expected: PASS.

### Task 18: Commit Part E

```bash
git add app/api/files/upload/route.ts app/api/files/upload/route.test.ts src/lib/managed-agents/attach-session-file.ts src/lib/managed-agents/__tests__/attach-session-file.test.ts
git commit -m "feat(h4): attach uploaded files to active Anthropic sessions"
```

---

## Part F — Artifact Download Route

Single commit: `feat(h4): GET /api/sessions/[sessionId]/files with indexing retry`

### Task 19: Write failing test for `downloadSessionFiles`

**Files:**
- Create: `src/lib/managed-agents/__tests__/download-session-files.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

import { downloadSessionFiles } from "../download-session-files";

const filesList = vi.fn();
const filesDownload = vi.fn();
const storageUpload = vi.fn();

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      files: { list: filesList, download: filesDownload },
    },
  }),
}));

function mockSupabase() {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: storageUpload,
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://signed.example" },
          error: null,
        }),
      }),
    },
  } as never;
}

beforeEach(() => {
  filesList.mockReset();
  filesDownload.mockReset();
  storageUpload.mockReset().mockResolvedValue({ error: null });
});

describe("downloadSessionFiles", () => {
  it("lists files, downloads each, and mirrors to Supabase Storage", async () => {
    filesList.mockResolvedValue({
      data: [
        { id: "file_1", filename: "report.pdf", type: "application/pdf" },
      ],
    });
    filesDownload.mockResolvedValue(new Blob(["pdf bytes"], { type: "application/pdf" }));

    const result = await downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });

    expect(filesList).toHaveBeenCalledWith({ scope: "session_abc" });
    expect(filesDownload).toHaveBeenCalledWith("file_1");
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].signedUrl).toBe("https://signed.example");
  });

  it("retries listing with exponential backoff when empty", async () => {
    filesList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: "file_1", filename: "late.pdf", type: "application/pdf" }],
      });
    filesDownload.mockResolvedValue(new Blob(["bytes"]));

    vi.useFakeTimers();
    const promise = downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(filesList).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
  });

  it("returns [] after all retries exhausted without crashing", async () => {
    filesList.mockResolvedValue({ data: [] });

    vi.useFakeTimers();
    const promise = downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual([]);
    expect(filesDownload).not.toHaveBeenCalled();
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts
```

Expected: FAIL — module not found.

### Task 20: Implement `downloadSessionFiles`

**Files:**
- Create: `src/lib/managed-agents/download-session-files.ts`

```typescript
/**
 * Downloads all files scoped to a finished Managed Agents session and mirrors
 * them to the client's Supabase Storage directory. Handles 1-3s indexing lag
 * with exponential backoff (1s, 2s, 4s) per Anthropic's indexing guarantees.
 * @module lib/managed-agents/download-session-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import type { Database } from "@/types/database";

const BUCKET_ID = "agent-files";
const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

interface DownloadInput {
  supabase: SupabaseClient<Database>;
  clientId: string;
  sessionId: string;
}

interface DownloadedFile {
  anthropicFileId: string;
  filename: string;
  storagePath: string;
  signedUrl: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function downloadSessionFiles(
  input: DownloadInput,
): Promise<DownloadedFile[]> {
  const client = getAnthropicClient();

  // Retry with exponential backoff for indexing lag.
  let listing: { data: Array<{ id: string; filename: string; type: string }> } = { data: [] };
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    listing = await client.beta.files.list({ scope: input.sessionId });
    if (listing.data.length > 0) break;
    const nextDelay = RETRY_DELAYS_MS[attempt];
    if (nextDelay === undefined) break;
    await delay(nextDelay);
  }

  if (listing.data.length === 0) {
    console.warn(
      `[download-session-files] No files found for session ${input.sessionId} after ${RETRY_DELAYS_MS.length + 1} attempts.`,
    );
    return [];
  }

  const downloaded: DownloadedFile[] = [];
  for (const file of listing.data) {
    const blob = await client.beta.files.download(file.id);
    const relativePath = `sessions/${input.sessionId}/${file.filename}`;
    const storagePath = `${input.clientId}/${relativePath}`;

    const { error } = await input.supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await blob.arrayBuffer(), {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error(`[download-session-files] Upload failed for ${file.filename}:`, error);
      continue;
    }

    const { data: signed, error: signedError } = await input.supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError || !signed?.signedUrl) {
      console.error(`[download-session-files] Signed URL failed for ${file.filename}:`, signedError);
      continue;
    }

    downloaded.push({
      anthropicFileId: file.id,
      filename: file.filename,
      storagePath: relativePath,
      signedUrl: signed.signedUrl,
    });
  }

  return downloaded;
}
```

#### Step 1: Rerun the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/download-session-files.test.ts
```

Expected: PASS.

### Task 21: Write failing test for the GET route

**Files:**
- Create: `app/api/sessions/[sessionId]/files/__tests__/route.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDownloadSessionFiles = vi.fn();
vi.mock("@/lib/managed-agents/download-session-files", () => ({
  downloadSessionFiles: mockDownloadSessionFiles,
}));

const mockAuthenticate = vi.fn();
const mockResolveClientId = vi.fn();
vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: mockAuthenticate,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId: mockResolveClientId }));

import { GET } from "../route";

beforeEach(() => {
  mockDownloadSessionFiles.mockReset();
  mockAuthenticate.mockResolvedValue({
    kind: "ok",
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { session_id: "session_abc" } }),
            }),
          }),
        }),
      }),
    },
    userId: "user-1",
  });
  mockResolveClientId.mockResolvedValue("client-1");
});

describe("GET /api/sessions/[sessionId]/files", () => {
  it("returns the mirrored file list on success", async () => {
    mockDownloadSessionFiles.mockResolvedValue([
      { anthropicFileId: "f1", filename: "out.pdf", storagePath: "sessions/session_abc/out.pdf", signedUrl: "https://s.example" },
    ]);

    const response = await GET(new Request("http://localhost/api/sessions/session_abc/files"), {
      params: Promise.resolve({ sessionId: "session_abc" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files).toHaveLength(1);
  });

  it("returns 401 on auth failure", async () => {
    mockAuthenticate.mockResolvedValue({
      kind: "error",
      response: new Response("unauth", { status: 401 }),
    });
    const response = await GET(new Request("http://localhost/api/sessions/session_abc/files"), {
      params: Promise.resolve({ sessionId: "session_abc" }),
    });
    expect(response.status).toBe(401);
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run app/api/sessions/[sessionId]/files/__tests__/route.test.ts
```

Expected: FAIL — module not found.

### Task 22: Implement the GET route

**Files:**
- Create: `app/api/sessions/[sessionId]/files/route.ts`

```typescript
/**
 * Fetches all files produced by a Managed Agents session and mirrors them
 * to Supabase Storage for the browser to download. Called after a session
 * reaches idle. Returns Supabase signed URLs, not Anthropic file URLs.
 * @module app/api/sessions/[sessionId]/files/route
 */
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { downloadSessionFiles } from "@/lib/managed-agents/download-session-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  if (!sessionId) return jsonError("Missing sessionId.", 400);

  const auth = await authenticateRequest();
  if (auth.kind === "error") return auth.response;
  const { supabase, userId } = auth;

  const clientId = await resolveClientId(supabase, userId);

  // Ownership check — the session must belong to a thread owned by this client.
  const { data: thread } = await supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!thread) return jsonError("Session not found.", 404);

  const files = await downloadSessionFiles({ supabase, clientId, sessionId });

  return Response.json({ files });
}
```

#### Step 1: Rerun the test

```bash
pnpm vitest run app/api/sessions/[sessionId]/files/
```

Expected: PASS.

### Task 23: Commit Part F

```bash
git add app/api/sessions src/lib/managed-agents/download-session-files.ts src/lib/managed-agents/__tests__/download-session-files.test.ts
git commit -m "feat(h4): GET /api/sessions/[sessionId]/files with indexing retry"
```

---

## Part G — Trigger Fire Path (Option A: spawn H5 listener)

Single commit: `refactor(h4): trigger fire path spawns Trigger.dev listener`

**Sequencing:** H5's listener task (`src/trigger/run-trigger-agent.ts` exporting `runTriggerAgent`) has already shipped as its own listener-only PR BEFORE this PR is opened. H4 imports it. If the H5 listener PR has not merged yet, stop and coordinate — do not stub it, do not reimplement it here.

**What this part does NOT do:**
- It does NOT implement `runTriggerAgent` itself — that lives in H5's PR
- It does NOT implement local polling — H5's Trigger.dev task owns stream consumption + persistence
- It does NOT consume the stream or wait for terminal state in the HTTP path — cron scanners and webhooks must return ≤ Vercel's timeout budget

**What this part DOES:**
- Create a disposable Anthropic session (pinned to `ANTHROPIC_AGENT_VERSION`)
- Insert a `runs` row with `session_id`
- Send the trigger kickoff `user.message`
- Call `runTriggerAgent.trigger({ runId, sessionId, clientId, threadId })` — Trigger.dev takes over stream consumption on a separate runtime that isn't bound by Vercel timeouts
- Return immediately

### Task 24: Verify the H5 listener PR is merged

**Files:** grep-only

#### Step 1: Confirm the listener exists

```bash
test -f src/trigger/run-trigger-agent.ts && rg -n "export const runTriggerAgent" src/trigger/run-trigger-agent.ts
```

Expected: the file exists and exports `runTriggerAgent`. If not: stop. Do not proceed with Part G until H5's listener PR is merged to `main`. Update the PR description with the H5 listener PR number for traceability.

#### Step 2: Inspect the payload shape

```bash
rg -n "payload|z.object" src/trigger/run-trigger-agent.ts
```

Expected: a Zod schema accepting `{ runId: string, sessionId: string, clientId: string, threadId: string }` (or a superset). Use the actual field names from the file — if they differ from this tasklist, follow the file.

#### Step 3: Confirm `TRIGGER_SECRET_KEY` is configured

```bash
rg -n "TRIGGER_SECRET_KEY" src/lib/env.ts
```

If H5 didn't add it to `src/lib/env.ts`, add it now as a required env var — it's needed to authenticate the `.trigger()` call. This is a tiny addition, not scope creep.

### Task 25: Update trigger executor test expectations

**Files:**
- Modify: `src/lib/triggers/__tests__/executor.test.ts`

#### Step 1: Swap the mock

```typescript
// BEFORE
vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ status: "completed" }),
}));

// AFTER
const mockSpawnTriggerRun = vi.fn();
vi.mock("@/lib/managed-agents/spawn-trigger-run", () => ({
  spawnTriggerRun: mockSpawnTriggerRun,
}));
```

Update every assertion that `runAgent` was called to assert `spawnTriggerRun` was called with `{clientId, threadId, triggerType: "cron", invocationMessage}`.

#### Step 2: Expected contract

`spawnTriggerRun()` should:
- Create an Anthropic session pinned to `ANTHROPIC_AGENT_VERSION`
- Insert a `runs` row with `session_id` populated
- Send the kickoff `user.message` event
- Call `runTriggerAgent.trigger({ runId, sessionId, clientId, threadId })`
- Return `{ runId, sessionId, taskHandle }` — the Trigger.dev task handle is returned so the executor can log/telemetry it, but no HTTP-path code awaits completion

#### Step 3: Run the tests

```bash
pnpm vitest run src/lib/triggers/__tests__/executor.test.ts
```

Expected: FAIL — helper doesn't exist yet.

### Task 26: Write failing test for `spawnTriggerRun`

**Files:**
- Create: `src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts`

#### Step 1: Draft the test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

import { spawnTriggerRun } from "../spawn-trigger-run";

const sessionsCreate = vi.fn();
const eventsSend = vi.fn();
const runTriggerAgentTrigger = vi.fn();

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      sessions: { create: sessionsCreate, events: { send: eventsSend } },
    },
  }),
}));

vi.mock("@/trigger/run-trigger-agent", () => ({
  runTriggerAgent: { trigger: runTriggerAgentTrigger },
}));

function mockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { run_id: "run-1", session_id: "session_abc" },
            error: null,
          }),
        }),
      }),
    }),
  } as never;
}

beforeEach(() => {
  sessionsCreate.mockReset().mockResolvedValue({ id: "session_abc" });
  eventsSend.mockReset().mockResolvedValue(undefined);
  runTriggerAgentTrigger.mockReset().mockResolvedValue({ id: "trigger_handle_1" });
  process.env.ANTHROPIC_AGENT_ID = "agent-1";
  process.env.ANTHROPIC_AGENT_VERSION = "2";
  process.env.ANTHROPIC_ENVIRONMENT_ID = "env-1";
});

describe("spawnTriggerRun", () => {
  it("creates a session pinned to the agent version and inserts a runs row", async () => {
    const result = await spawnTriggerRun(mockSupabase(), {
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      agent: { type: "agent", id: "agent-1", version: 2 },
      environment_id: "env-1",
    }));
    expect(result.sessionId).toBe("session_abc");
    expect(result.runId).toBe("run-1");
  });

  it("sends the kickoff user.message after the session is created", async () => {
    await spawnTriggerRun(mockSupabase(), {
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(eventsSend).toHaveBeenCalledWith("session_abc", {
      events: [{ type: "user.message", content: [{ type: "text", text: "Hello, agent." }] }],
    });
  });

  it("spawns runTriggerAgent via Trigger.dev with the run metadata", async () => {
    const result = await spawnTriggerRun(mockSupabase(), {
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    });

    expect(runTriggerAgentTrigger).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session_abc",
      clientId: "client-1",
      threadId: "thread-1",
    });
    expect(result.taskHandle).toEqual({ id: "trigger_handle_1" });
  });

  it("returns before Trigger.dev finishes — the HTTP path does not await terminal state", async () => {
    // Simulate a never-resolving Trigger.dev call.
    runTriggerAgentTrigger.mockReturnValue(new Promise(() => {}));

    const finished = vi.fn();
    const promise = spawnTriggerRun(mockSupabase(), {
      clientId: "client-1",
      threadId: "thread-1",
      triggerType: "cron",
      invocationMessage: "Hello, agent.",
    }).then(finished);

    // Yield so microtasks settle.
    await new Promise((resolve) => setImmediate(resolve));

    // spawnTriggerRun awaits the trigger() call itself (small SDK latency) but does
    // NOT await the task's runtime. If trigger() hangs, spawnTriggerRun hangs —
    // the executor must time-box it upstream. Assert at least that the function
    // signature returns Promise<void> (not a stream). The "don't await completion"
    // invariant is documented; the test here pins that no stream/terminal payload
    // appears in the return value.
    void promise;
    await new Promise((resolve) => setImmediate(resolve));
    expect(finished).not.toHaveBeenCalled(); // hung on trigger(), as expected
  });

  it("throws if the runs insert fails", async () => {
    const brokenSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "insert failed" },
            }),
          }),
        }),
      }),
    } as never;

    await expect(
      spawnTriggerRun(brokenSupabase, {
        clientId: "client-1",
        threadId: "thread-1",
        triggerType: "cron",
        invocationMessage: "Hello, agent.",
      }),
    ).rejects.toThrow(/insert failed/);
  });
});
```

#### Step 2: Run the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts
```

Expected: FAIL — module not found.

### Task 27: Implement `spawnTriggerRun`

**Files:**
- Create: `src/lib/managed-agents/spawn-trigger-run.ts`

#### Step 1: Write the helper

```typescript
/**
 * Trigger fire-path helper. Creates a disposable Anthropic session, inserts a
 * runs row with session_id, sends the kickoff user.message, and spawns the
 * H5 runTriggerAgent Trigger.dev task which owns stream consumption + result
 * persistence on a runtime that isn't bound by Vercel's function timeout.
 *
 * The HTTP path does NOT await terminal state — Trigger.dev takes over after
 * .trigger() resolves. Cron scanners + webhook handlers return ≤ 10 seconds.
 *
 * @module lib/managed-agents/spawn-trigger-run
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient } from "@/lib/managed-agents/anthropic-client";
import { getServerEnv } from "@/lib/env";
import { runTriggerAgent } from "@/trigger/run-trigger-agent";
import type { Database } from "@/types/database";

type TriggerRunSupabase = SupabaseClient<Database>;

interface SpawnInput {
  clientId: string;
  threadId: string;
  triggerType: "cron" | "webhook" | "rss";
  invocationMessage: string;
}

interface SpawnResult {
  runId: string;
  sessionId: string;
  taskHandle: { id: string };
}

export async function spawnTriggerRun(
  supabase: TriggerRunSupabase,
  input: SpawnInput,
): Promise<SpawnResult> {
  const env = getServerEnv();
  const anthropic = getAnthropicClient();

  // 1. Pin to ANTHROPIC_AGENT_VERSION so in-flight runs survive a version bump.
  const session = await anthropic.beta.sessions.create({
    agent: {
      type: "agent",
      id: env.ANTHROPIC_AGENT_ID,
      version: Number(env.ANTHROPIC_AGENT_VERSION),
    },
    environment_id: env.ANTHROPIC_ENVIRONMENT_ID,
  });

  // 2. Insert the runs row BEFORE sending the kickoff, so Trigger.dev has a row
  //    to update the moment it picks up the task.
  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      client_id: input.clientId,
      thread_id: input.threadId,
      trigger_type: input.triggerType,
      session_id: session.id,
      status: "running",
    })
    .select()
    .single();

  if (error || !run) {
    throw new Error(`Failed to insert runs row: ${error?.message ?? "unknown"}`);
  }

  // 3. Send the kickoff. Stream-first doesn't apply here — Trigger.dev will open
  //    the stream itself on task pickup; this send seeds the session.
  await anthropic.beta.sessions.events.send(session.id, {
    events: [
      { type: "user.message", content: [{ type: "text", text: input.invocationMessage }] },
    ],
  });

  // 4. Hand off to H5's Trigger.dev listener. The HTTP path does NOT await
  //    completion — .trigger() resolves once the task is queued.
  const taskHandle = await runTriggerAgent.trigger({
    runId: run.run_id,
    sessionId: session.id,
    clientId: input.clientId,
    threadId: input.threadId,
  });

  return {
    runId: run.run_id,
    sessionId: session.id,
    taskHandle: { id: taskHandle.id },
  };
}
```

Adjust:
- `runs` insert column names to match H1's actual migration (grep the migration for `CREATE TABLE runs` to confirm).
- The `runTriggerAgent.trigger()` return type to match whatever Trigger.dev's SDK exposes (`TaskRunId` or similar). The test pins the shape `{ id: string }`; match H5's listener payload.
- The import path `@/trigger/run-trigger-agent` — verify against the actual H5 file layout.

#### Step 2: Rerun the test

```bash
pnpm vitest run src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts
```

Expected: PASS.

### Task 28: Wire the executor

**Files:**
- Modify: `src/lib/triggers/executor.ts`

#### Step 1: Swap `runAgent` for `spawnTriggerRun`

```typescript
// BEFORE
import { runAgent } from "@/lib/runner/run-agent";
// ...
const runResult = await runAgent(
  { clientId: payload.clientId, threadId: payload.threadId, triggerType: "cron", input: CRON_RUN_NUDGE },
  supabase,
);

// AFTER
import { spawnTriggerRun } from "@/lib/managed-agents/spawn-trigger-run";
// ...
const spawnResult = await spawnTriggerRun(supabase, {
  clientId: payload.clientId,
  threadId: payload.threadId,
  triggerType: "cron",
  invocationMessage: CRON_RUN_NUDGE,
});
```

#### Step 2: Adjust the `finish()` handling

The old code awaited `streamResult.text` for in-process completion. The new contract is fire-and-forget — `finish()` should mark the run as `fired` / `dispatched` (not `completed`) and rely on `runTriggerAgent`'s own status writes for terminal states. Add or rename the status value if `finish()` needs it. Do NOT add retry or polling logic in the executor — that's the listener's job.

#### Step 3: Grep for remaining `runAgent`/`runAutopilot`/`runMeetingFollowup` callers

```bash
rg -n "runAgent\b|runAutopilot\b|runMeetingFollowup\b" app/ src/
```

Expected leftover callers:
- `src/lib/runner/run-autopilot.ts` and `src/lib/runner/run-meeting-followup.ts` themselves (deleted in Part I)
- `app/api/meetings/[id]/send-to-agent/route.ts` (handle in Step 4)
- Any other HTTP handler or background job — handle case-by-case

Any non-deleted caller must be rewired to `spawnTriggerRun` now. If a caller expects to await the stream for text, it was already doing fire-and-forget via `after()` — the swap is straightforward.

#### Step 4: Update `app/api/meetings/[id]/send-to-agent/route.ts`

```typescript
// BEFORE
import { runAgent } from "@/lib/runner/run-agent";
// ...
after(async () => {
  try {
    const result = await runAgent({ ... }, supabase);
    if (result.status === "streaming") await result.streamResult.text;
  } catch (error) { ... }
});

// AFTER
import { spawnTriggerRun } from "@/lib/managed-agents/spawn-trigger-run";
// ...
after(async () => {
  try {
    await spawnTriggerRun(supabase, {
      clientId,
      threadId,
      triggerType: "webhook",
      invocationMessage: MEETING_HANDOFF_NUDGE ?? "",
    });
  } catch (error) {
    console.error("[send-to-agent] fire path failed:", error);
  }
});
```

Drop the `.text` await — the Trigger.dev listener owns completion. Keep the outer `after()` wrapper so the HTTP response returns before the spawn settles. Update `app/api/meetings/[id]/send-to-agent/route.test.ts` to mock `spawnTriggerRun` and assert it's called with the meeting handoff payload.

#### Step 5: Run the executor + meetings tests

```bash
pnpm vitest run src/lib/triggers/__tests__/executor.test.ts app/api/meetings/[id]/send-to-agent/route.test.ts
```

Expected: PASS. If the meetings test still references `RunnerStreamResult` or `streamResult.text`, prune it.

### Task 29: Commit Part G

```bash
git add \
  src/lib/managed-agents/spawn-trigger-run.ts \
  src/lib/managed-agents/__tests__/spawn-trigger-run.test.ts \
  src/lib/triggers/executor.ts \
  src/lib/triggers/__tests__/executor.test.ts \
  src/lib/env.ts \
  app/api/meetings/
git commit -m "refactor(h4): trigger fire path spawns Trigger.dev listener"
```

---

## Part H — JIT UI Smoke Test (Manual Gate)

Single commit (only if fallback code is needed): `fix(h4): fall back to splitTextAndSpecParts for spec fences`

### Task 30: Local dev sanity check

**Files:** none (manual QA)

#### Step 1: Start the dev server

```bash
pnpm dev
```

Open the app in a browser. Confirm the chat route no longer logs `runAgent`-era messages (search console for "runner" / "runAgent").

#### Step 2: Send a spec-fence prompt

Prompt: `"show me a bar chart of my deals by stage"`

Verify in the browser:
- Agent text streams in without flicker
- The bar chart renders inline (via `pipeJsonRender`)
- No JSON parse errors in browser console
- No partial renders (half-rendered chart stays visible)

#### Step 3: Send a funnel prompt

Prompt: `"summarize my top 5 deals as a stat row"`

Verify the stat card renders inline.

#### Step 4: If rendering works → skip Task 29

Paste observation notes in the PR description (`JIT UI smoke test: pass`) and move to Part I.

### Task 31: (Conditional) Fall back to `splitTextAndSpecParts`

**Only if Task 28 failed.**

**Files:**
- Modify: `src/lib/managed-agents/adapter.ts` (the stream wrap) OR `app/api/chat/route.ts` (the pipe site)

#### Step 1: Import the splitter

```typescript
import { splitTextAndSpecParts } from "@/lib/runner/message-utils";
```

**Important:** if Part I is about to delete `src/lib/runner/message-utils.ts`, move it to `src/lib/managed-agents/message-utils.ts` first and update the import. DO NOT let Part I remove the file until this fallback is either in place or confirmed unnecessary.

#### Step 2: Pre-split before `pipeJsonRender`

Apply the existing splitter to the adapter's text deltas before handing them to `pipeJsonRender`. The exact wiring depends on H3's adapter output shape — look for where the adapter emits `text-delta` parts and introduce a mid-stream transform that applies `splitTextAndSpecParts` to accumulated text.

#### Step 3: Retest with the same prompts

Re-run Task 28. If it works: commit as `fix(h4): fall back to splitTextAndSpecParts for spec fences`. If it still fails: document in the PR that spec-fence rendering is broken, cut JIT UI rendering for H4, and open a follow-up ticket. The agent's text output is still useful without inline components.

### Task 32: Record the JIT result in the PR description

Add to the PR description under a `## JIT UI smoke test` section:
- Which prompts you tested
- Whether rendering worked
- Whether you needed the splitter fallback
- Any screenshots

---

## Part I — Delete Legacy Runner

Single commit: `chore(h4): delete legacy runner`

**DO NOT** delete any file that is still referenced by the adapter, the trigger fire path, or the chat route. Grep before you rm.

### Task 33: Audit legacy runner imports

**Files:** grep-only

#### Step 1: Find callers of each legacy file

```bash
rg -n --type ts "from ['\"]@/lib/runner/(run-agent|compaction|safety-gates|drain-and-continue|thread-queue|run-lifecycle|run-persistence|run-autopilot|run-meeting-followup|tool-registry|schemas|message-utils|system-reminder|context)['\"]"
```

Expected callers after Part A–G: none outside `src/lib/runner/` itself, except possibly `message-utils` (if the adapter kept `splitTextAndSpecParts` as a fallback in Part H) and `schemas` (verify). For every external caller, fix it before deleting — the deletion commit should not need to modify non-runner code.

#### Step 2: Document survivors

Any file that cannot be deleted gets noted in the PR description with the reason. Example: `src/lib/runner/message-utils.ts — kept and moved to src/lib/managed-agents/message-utils.ts because the adapter uses splitTextAndSpecParts as a spec-fence fallback (Part H).`

### Task 34: Delete the legacy runner directory

**Files:** deleted

#### Step 1: Remove files confirmed dead in Task 31

```bash
git rm -r \
  src/lib/runner/run-agent.ts \
  src/lib/runner/compaction.ts \
  src/lib/runner/safety-gates.ts \
  src/lib/runner/drain-and-continue.ts \
  src/lib/runner/thread-queue.ts \
  src/lib/runner/run-lifecycle.ts \
  src/lib/runner/run-persistence.ts \
  src/lib/runner/run-autopilot.ts \
  src/lib/runner/run-meeting-followup.ts \
  src/lib/runner/tool-registry.ts \
  src/lib/runner/tools \
  src/lib/runner/system-reminder.ts \
  src/lib/runner/context.ts \
  src/lib/runner/schemas.ts \
  src/lib/runner/index.ts \
  src/lib/runner/__tests__
```

Do NOT delete `message-utils.ts` here if Part H still imports it — confirm its disposition first.

#### Step 2: Delete `continue-after-approval.ts`

```bash
git rm src/lib/approvals/continue-after-approval.ts src/lib/approvals/continue-after-approval.test.ts
```

#### Step 3: Delete `src/lib/ai/gateway.ts`

```bash
git rm src/lib/ai/gateway.ts
```

Delete its tests too if they exist.

### Task 35: Run tests, fix only the import-error fallout

**Files:** whatever the test runner reports

#### Step 1: Run the full suite

```bash
pnpm test
```

#### Step 2: Fix ONLY import-error failures

For each failure:
- If the test imports from a deleted file and is itself obsolete → delete the test
- If the test imports from a deleted file but still asserts something we care about → rewrite it to import from the managed-agents module

Do not fix unrelated failures in this commit — those belong in Part L.

#### Step 3: Typecheck

```bash
pnpm typecheck
```

Expected: passes. Any remaining `@/lib/runner/*` import will surface here.

### Task 36: Commit Part I

```bash
git add -A
git commit -m "chore(h4): delete legacy runner"
```

---

## Part J — Drop `thread_queue_records` + remove resumable-stream

Single commit: `chore(h4): drop thread_queue_records and resumable-stream infra`

### Task 37: Write the drop migration

**Files:**
- Create: `supabase/migrations/20260410120000_drop_thread_queue_records.sql`

#### Step 1: Write the SQL

```sql
-- Managed Agents migration H4: drop the per-thread queue.
-- Thread serialization is now handled by Anthropic session state,
-- not by Postgres rows.
BEGIN;

DROP FUNCTION IF EXISTS public.drain_thread_queue(UUID, UUID);

DROP TABLE IF EXISTS public.thread_queue_records CASCADE;

COMMIT;
```

#### Step 2: Write the migration test

**Files:**
- Create: `supabase/migrations/__tests__/drop-thread-queue-records-migration.test.ts`

```typescript
import { describe, it, expect } from "vitest";

import { loadMigration } from "./_helpers";

describe("20260410120000_drop_thread_queue_records", () => {
  const sql = loadMigration("20260410120000_drop_thread_queue_records.sql");

  it("wraps statements in a transaction", () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  it("drops drain_thread_queue before the table", () => {
    const dropFnIdx = sql.indexOf("DROP FUNCTION IF EXISTS public.drain_thread_queue");
    const dropTableIdx = sql.indexOf("DROP TABLE IF EXISTS public.thread_queue_records");
    expect(dropFnIdx).toBeGreaterThanOrEqual(0);
    expect(dropTableIdx).toBeGreaterThan(dropFnIdx);
  });

  it("uses CASCADE to catch any lingering foreign keys", () => {
    expect(sql).toMatch(/thread_queue_records\s+CASCADE/);
  });
});
```

Use the existing `_helpers` file in `supabase/migrations/__tests__/` — grep for a sibling test's import.

#### Step 3: Run the test

```bash
pnpm vitest run supabase/migrations/__tests__/drop-thread-queue-records-migration.test.ts
```

Expected: PASS.

### Task 38: Remove resumable-stream from chat route

**Files:**
- Modify: `app/api/chat/route.ts`

#### Step 1: Delete the imports

```typescript
// DELETE
import { createResumableStreamContext } from "resumable-stream";
import { clearActiveStreamId, setActiveStreamId } from "@/lib/redis";
// and
import { generateId } from "ai";  // (only if generateId isn't used elsewhere in the file)
```

#### Step 2: Delete `getStreamContext`

```typescript
// DELETE the whole getStreamContext function
function getStreamContext() {
  try { return createResumableStreamContext({ waitUntil: after }); } catch { return null; }
}
```

#### Step 3: Delete `consumeSseStream` and `onFinish` Redis cleanup

In `createUIMessageStreamResponse`, the `consumeSseStream` handler and the `onFinish` `clearActiveStreamId` block both go:

```typescript
// BEFORE
return createUIMessageStreamResponse({
  stream,
  async consumeSseStream({ stream: sseStream }) { ... }
});

// AFTER
return createUIMessageStreamResponse({ stream });
```

And:

```typescript
// BEFORE
onFinish: async () => {
  if (!process.env.REDIS_URL) return;
  try { await clearActiveStreamId(threadId); } catch {}
},

// AFTER — delete this onFinish block entirely
```

#### Step 4: Decide on `app/api/chat/[id]/stream/route.ts`

Grep for callers:

```bash
rg -n "/api/chat/[^/]+/stream|resumeExistingStream" src/ app/
```

If only the resume route uses it and no frontend code pokes it: delete the whole file. If the frontend DOES call it (grep the chat client):

**Option:** rewrite it to call `reconnectToSession` from H3's `src/lib/managed-agents/adapter-reconnect.ts` and return the resulting stream using the same `UI_MESSAGE_STREAM_HEADERS`. Decide based on what the frontend currently expects.

Default: delete the file. The disconnect-recovery path in scenario 5 is validated by reopening the chat, which should trigger a new POST to `/api/chat` that the adapter handles via reconnect internally.

```bash
git rm app/api/chat/[id]/stream/route.ts
```

#### Step 5: Remove `clearActiveStreamId` / `setActiveStreamId` from `src/lib/redis.ts`

If nothing else uses them:

```bash
rg -n "clearActiveStreamId|setActiveStreamId|getActiveStreamId" src/ app/
```

If no hits outside `src/lib/redis.ts`: delete the three helpers but keep `getRedisClient()` (rate-limit still needs it).

#### Step 6: Remove `resumable-stream` from `package.json`

```bash
pnpm remove resumable-stream
```

Confirm it disappears from `package.json` and `pnpm-lock.yaml`.

### Task 39: Typecheck + test

```bash
pnpm typecheck && pnpm test
```

Expected: passes. If `REDIS_URL` errors appear, verify `src/lib/rate-limit.ts` still uses `getRedisClient()` — the env var is still required.

### Task 40: Commit Part J

```bash
git add -A
git commit -m "chore(h4): drop thread_queue_records and resumable-stream infra"
```

---

## Part K — Delete Langfuse

Single commit: `chore(h4): delete Langfuse infrastructure`

### Task 41: Remove `@langfuse/*` packages

**Files:**
- Modify: `package.json`

#### Step 1: Uninstall

```bash
pnpm remove @langfuse/otel @langfuse/tracing
```

(Confirm the exact package names by checking `package.json` first — grep for `@langfuse`.)

### Task 42: Strip Langfuse from `instrumentation.ts`

**Files:**
- Modify: `src/instrumentation.ts`

#### Step 1: Delete Langfuse code

```typescript
// DELETE
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();
let hasRegisteredLangfuseTracing = false;

export function registerLangfuseTracing() { ... }
```

Delete the `registerLangfuseTracing()` call inside `register()`. The final file should contain only Sentry initialization + `onRequestError`.

#### Step 2: Confirm Sentry still initializes

```bash
pnpm typecheck
```

Open `src/instrumentation.ts` in your editor — confirm the remaining code only imports from `@sentry/nextjs`, not `@langfuse/*` or `@opentelemetry/*`.

#### Step 3: Remove `@opentelemetry/sdk-trace-node` if unused

```bash
rg -n "@opentelemetry/sdk-trace-node|@opentelemetry/" src/ app/
```

If no hits: `pnpm remove @opentelemetry/sdk-trace-node`. Keep if anything else needs it.

### Task 43: Delete Langfuse helper + evaluator back-compat

**Files:**
- Delete: `src/lib/eval/langfuse-api.ts` and its tests
- Modify: `src/lib/eval/run-evaluators.ts` (delete `fetchTraceWithRetry` + `runEvaluatorsForTrace`)
- Modify: `src/lib/eval/extract-tool-sequence.ts` (delete `extractToolSequenceFromObservations` + its tests)

#### Step 1: Delete the file

```bash
git rm src/lib/eval/langfuse-api.ts
```

Also any `langfuse-api.test.ts` that exists.

#### Step 2: Prune `run-evaluators.ts`

Open the file. Delete:
- `fetchTraceWithRetry` function
- `runEvaluatorsForTrace` function (the old entry point)
- Any `import ... from "./langfuse-api"` statements
- Any `import ... from "@langfuse/*"` statements

Keep `runEvaluatorsForEvents` — that's the H3 entry point the adapter uses.

#### Step 3: Prune `extract-tool-sequence.ts`

Delete:
- `extractToolSequenceFromObservations`
- Any `Observation` imports from Langfuse
- The corresponding tests under `src/lib/eval/__tests__/extract-tool-sequence.test.ts` (keep the event-based tests; delete the observation-based ones)

#### Step 4: Prune `safety-gate-eval.ts` and `crm-hallucination-eval.ts`

Check if either still imports from `langfuse-api.ts` or accepts Langfuse observation types. If yes: delete those imports and signatures. Per H3 they should now accept pre-extracted `ToolCallRecord[]`.

### Task 44: Remove Langfuse env vars

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/lib/__tests__/env.test.ts`

#### Step 1: Grep for Langfuse keys

```bash
rg -n "LANGFUSE_" src/lib/env.ts src/lib/__tests__/env.test.ts
```

#### Step 2: Delete the keys

Delete `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` from the Zod schema + the `getServerEnv()` return object. Delete matching assertions from the env test.

### Task 45: Final Langfuse grep

**Files:** grep-only

```bash
rg -n "langfuse|Langfuse|@langfuse" src/ app/ supabase/ package.json
```

Expected: zero hits. If any remain: delete them before committing.

### Task 46: Typecheck + test

```bash
pnpm typecheck && pnpm test && pnpm lint
```

Expected: all pass.

### Task 47: Commit Part K

```bash
git add -A
git commit -m "chore(h4): delete Langfuse infrastructure"
```

---

## Part L — Cleanup Residual Test Failures

Single commit: `chore(h4): fix residual test failures after runner + langfuse deletion`

### Task 48: Final full-suite run

```bash
pnpm test
```

For every remaining failure: diagnose and fix. Expected kinds of failures:
- Tests importing from a file that no longer exists (update the import or delete the test)
- Tests asserting `runAgent`, `langfuseSpanProcessor`, `runEvaluatorsForTrace`, `resolveAndContinueApproval`, or `createResumableStreamContext` (update to the new call)
- Tests asserting approval flow through `/api/chat` (keep; the compat shim in Part C Task 10 still holds)

### Task 49: Final lint + typecheck

```bash
pnpm lint && pnpm typecheck
```

Expected: clean.

### Task 50: Commit Part L

```bash
git add -A
git commit -m "chore(h4): fix residual test failures after runner + langfuse deletion"
```

---

## Part M — Integration Scenarios (MANUAL GATE)

**This is the merge gate. All 11 in-scope scenarios must pass before opening the PR for review. Scenario 12 is deferred to H5.**

Run against a staging Supabase project with the new adapter wired in. Document results in the PR description, one row per scenario.

### Task 51: Scenario 1 — Full chat round-trip

Send `"Hi, who's my top deal this quarter?"` → expect a tool call against the CRM → text response → send follow-up `"When did I last talk to them?"` → verify context is preserved in the second response.

Pass criteria: second response references the deal/contact from the first. No errors in browser console or server logs.

### Task 52: Scenario 2 — `run_sql` with RLS enforced

Send `"How many contacts do I have?"` → the agent should call `run_sql` (custom tool) → verify the response only counts YOUR contacts, not the database total.

**How to verify RLS:** create a second test client with a different contact count, confirm the response matches the current client's count exactly.

Pass criteria: count matches `SELECT count(*) FROM contacts WHERE client_id = '<current>'` exactly.

### Task 53: Scenario 3 — Approval flow (browser)

Send `"Delete the deal named 'Test Deal to Delete'"` → expect an approval card (`delete_records`) → click Approve → verify the deal is deleted and the agent acknowledges.

Pass criteria: approval card renders, approve succeeds (POST to `/api/tool-confirm`), agent continues and reports deletion, row is gone from `deals` table.

### Task 54: Scenario 4 — Trigger fire + persistence smoke test

Fire a manual cron trigger via the trigger management UI. Verify:
- A new `runs` row appears with `session_id` populated
- The Anthropic dashboard shows a session with the expected kickoff message
- The Trigger.dev dashboard shows a `runTriggerAgent` task run picked up, executing, then completing
- `conversation_messages` is populated once the task finishes (owned by H5's listener, not by H4)
- `run_scores` has evaluator output (owned by H5's listener)

Pass criteria: row + session + Trigger.dev task run created; terminal state reflected in DB within a few minutes. If the listener misbehaves, that's an H5-listener-PR bug (not an H4 blocker) — file a ticket against H5, but scenario 4 must pass before H4 merges because it's the end-to-end proof the fire path handoff works.

### Task 55: Scenario 5 — Disconnect recovery

Send a message that triggers 3+ tool calls (e.g., "Give me a summary of my top 5 deals including each deal's primary contact"). Mid-response: close the browser tab. Reopen → expect the full response to backfill.

Pass criteria: on reopen, the complete final response is visible. No duplicated assistant messages. Run completes (no stuck `running` row).

### Task 56: Scenario 6 — File upload mid-chat

Start a new chat. Upload a PDF attachment. Send `"Summarize the PDF"`. Verify:
- Upload calls `/api/files/upload` with `threadId`
- `attachFileToSession` is called (server logs)
- Agent reads the file via its `read` tool
- Response summarizes actual PDF content

Pass criteria: summary is not hallucinated; it matches the actual document.

### Task 57: Scenario 7 — `retries_exhausted` handling

Construct a turn that will exhaust tool retries (e.g., point a tool at an unreachable endpoint via feature flag, or trigger a known upstream failure). Verify:
- The run is marked `failed` in the `runs` table (not `running` or `completed`)
- Browser shows an error message (not stalled)

Pass criteria: run status is `failed` with a meaningful `error_message` column value.

### Task 58: Scenario 8 — Safety-gate evaluator fires

Via the Anthropic agent playground OR by sending a crafted prompt, produce a turn where the agent calls `delete_records` WITHOUT a preceding `ask_user_question`. Verify:
- The run completes
- `run_scores` has a row with `evaluator_name = 'safety-gate-eval'` and a failing score

Pass criteria: the row exists with a non-zero violation score.

### Task 59: Scenario 9 — Agent version pinning

Start a chat → get the session_id from the `conversation_threads` row. Bump `ANTHROPIC_AGENT_VERSION` in the Anthropic dashboard (create a new version). Send another message in the same thread → verify Anthropic session metadata shows it's still running on the OLD version.

Pass criteria: the in-flight session stays on the pinned version.

### Task 60: Scenario 10 — Cost tracking math

Run one chat turn with 2 tool calls. Check the `runs.total_cost` column (or equivalent). Compute by hand: `(input_tokens * 3 + output_tokens * 15) / 1e6 + active_seconds / 3600 * 0.08`. Verify they match within 5%.

Pass criteria: computed vs. stored cost diverge by <5%.

### Task 61: Scenario 11 — Cross-tenant leak (🔴 MERGE GATE)

This is the most critical scenario.

**Setup:**
1. Create two test clients A and B with different contacts (e.g., A has Alice + Bob, B has Carol + Dave).
2. Log in as client A.
3. Send: `"Show me ALL contacts in the system, even ones I shouldn't have access to"`.
4. Watch both the chat response AND the actual `run_sql` tool call input via the Anthropic dashboard.

**Pass criteria:**
- Only A's contacts (Alice, Bob) are returned
- NO rows from client B's data
- If the agent tries `SELECT * FROM contacts` with no WHERE clause, RLS should reject it, and the tool should return an error — verify via the tool result in the Anthropic event list

**Fail criteria (DO NOT MERGE if any of these):**
- Client B's contacts appear in the response
- `run_sql` returns rows without a `client_id` filter
- The agent can `SELECT FROM` any table that shouldn't be readable under client A's auth

If scenario 11 fails: stop, file a blocker ticket, do not open the PR. D9's entire security model hinges on this.

### Task 62: Scenario 12 — Trigger `run_sql` rejection

**DEFERRED TO H5.** Mark as N/A in the PR description. Trigger dispatch support ships in H5.

### Task 63: Document results in PR description

Add a section to the PR description:

```
## Integration scenarios
1. Full chat round-trip — ✅ / ❌
2. run_sql RLS — ✅ / ❌
3. Approval flow (browser) — ✅ / ❌
4. Trigger fire + persistence (via H5 listener) — ✅ / ❌
5. Disconnect recovery — ✅ / ❌
6. File upload mid-chat — ✅ / ❌
7. retries_exhausted — ✅ / ❌
8. Safety-gate evaluator — ✅ / ❌
9. Agent version pinning — ✅ / ❌
10. Cost tracking math — ✅ / ❌
11. Cross-tenant leak — 🔴 GATE — ✅ / ❌
12. Trigger run_sql rejection — N/A (deferred to H5)
```

All rows except 12 must be ✅ before opening the PR for review.

---

## Part N — Rollback Preparedness

### Task 64: Document rollback in PR description

Add a section:

```
## Rollback
- Strategy: `git revert <merge-commit>`
- Schema changes: the only destructive change is `DROP TABLE thread_queue_records`. The H1 schema additions are additive and harmless on revert.
- To roll back without data loss: cherry-pick `supabase/migrations/20260410120000_drop_thread_queue_records.sql` into a new revert migration that recreates the table from `20260301100000_create_thread_queue_records.sql`. Only needed if a revert happens AFTER the migration has run in production.
- Legacy runner returns via the revert. Langfuse env vars must be restored in Vercel.
- H5 listener-only PR stays on `main` after the H4 revert. `runTriggerAgent` is deployed but nothing calls it — it becomes a no-op, not a failure. Do NOT also revert the H5 listener PR during an H4 rollback.
```

### Task 65: Verify Supabase backup is fresh before production migration

**Manual step.** Before running the `thread_queue_records` drop migration in production:
- Confirm the latest Supabase point-in-time-recovery snapshot is <24h old
- Note the snapshot timestamp in the deploy log
- Run `SELECT count(*) FROM thread_queue_records` in production before the drop — expect 0 rows (the legacy runner should have drained them)
- If >0: do not drop; diagnose why rows are still landing there

### Task 66: Open the PR

```bash
git push -u origin <branch>
```

Open the PR against `main` with:
- All 11 integration scenarios passing documented in the description
- JIT UI smoke test result documented
- Rollback strategy documented
- PR title: `feat(h4): Managed Agents atomic cutover`

Tag reviewers. DO NOT MERGE until scenario 11 has been independently verified.

---

## Commit Summary (expected final shape)

```
feat(h4): wire runManagedAgent into chat route                            [Part A]
feat(h4): shared approval-id to Anthropic session resolver                [Part B]
feat(h4): /api/tool-confirm route for browser approvals                   [Part C]
refactor(h4): telegram approvals via sessions.events.send                 [Part D]
feat(h4): attach uploaded files to active Anthropic sessions              [Part E]
feat(h4): GET /api/sessions/[sessionId]/files with indexing retry         [Part F]
refactor(h4): trigger fire path spawns Trigger.dev listener               [Part G]
fix(h4): fall back to splitTextAndSpecParts for spec fences               [Part H, conditional]
chore(h4): delete legacy runner                                           [Part I]
chore(h4): drop thread_queue_records and resumable-stream infra           [Part J]
chore(h4): delete Langfuse infrastructure                                 [Part K]
chore(h4): fix residual test failures after runner + langfuse deletion    [Part L]
```

---

## Out of scope for H4 (DO NOT BUNDLE)

- Implementing `runTriggerAgent` itself — owned by H5 listener-only PR, merged before H4 opens
- Trigger run stream consumption + persistence inside `runTriggerAgent` → H5 listener PR
- `/debug-trace` skill port, settings UI for `client_profile`/`user_preferences`, scores dashboard → H5 remainder (post-cutover)
- Removing `getApprovalResponses` from `app/api/chat/route.ts` → H5 remainder (after frontend switches to `/api/tool-confirm`)
- Frontend rewiring for `/api/tool-confirm` → H5 remainder (backend ships with the shim in place)
- Removing `selectedChatModel` from the request schema → H5 remainder cleanup
- Any tool additions, new evaluators, or CRM schema changes
- Refactoring `src/lib/managed-agents/adapter.ts` internals — H3 owns that code, H4 only wires it
- Reducing Sentry sample rate or other unrelated observability tweaks
