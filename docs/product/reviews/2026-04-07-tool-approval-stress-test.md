# Tool Approval Stress Test

Date: 2026-04-07

Reviewed against:
- `docs/product/ideations/2026-04-07-tool-approval-system.md`
- `docs/product/plans/2026-04-07-001-feat-tool-approval-system-plan.md`
- Installed AI SDK: `ai@6.0.142`, `@ai-sdk/react@3.0.144`

Method:
- Read the relevant repo code paths and AI SDK source in `node_modules/ai/src/**`.
- Verified approval behavior with direct local reproductions using `MockLanguageModelV3` from `ai/test`.
- Ran focused repo tests:
  - `src/components/chat/chat-panel.test.tsx`
  - `src/components/chat/tool-call-inline.test.tsx`
  - `src/lib/ai/__tests__/chat-route.test.ts`
  - `src/lib/runner/__tests__/run-persistence.test.ts`
  - Result: `101/101` passing.

## Verdict Matrix

| Item | Verdict | Decision |
|---|---|---|
| 1. `convertToModelMessages()` + `approval-responded` | Go | The plan assumption is correct. `approval-responded` becomes an assistant `tool-call` + `tool-approval-request`, followed by a tool message with `tool-approval-response`. `streamText()` then executes approved tools before step 0. |
| 2. Patched JSONB format | Go | The required structure is straightforward, but the patch must preserve the existing tool part and only mutate `state` and `approval`. |
| 3. `sendAutomaticallyWhen` + custom body | Go | Issue #11423 is fixed in the installed SDK. Even without that fix, the repo transport already injects `selectedChatModel` manually for approval continuations. |
| 4. `prepareStep` + dynamic tool reveal | No-Go | The SDK part works, but the plan’s proposed mitigation to skip connections with `0` activated tools breaks the primary Gmail-first-activation path. |
| 5. Step counter across two-call flow | Go | Step counting resets on the second `streamText()` call, and the approval-triggered tool execution does not consume a model step. |
| 6. Deny flow | Go | Denials do not execute the tool. The model sees a synthetic `execution-denied` tool result before step 0. |
| 7. Dead-code compatibility | No-Go | Most of the old path still fits, but persisted denied approvals will rehydrate incorrectly with the current `PermissionCard` logic. |

## 1. `convertToModelMessages()` And `approval-responded`

Go.

What the SDK does:
- `convertToModelMessages()` only drops `input-streaming` and `input-available` when `ignoreIncompleteToolCalls: true` is set. It does not drop `approval-requested`, `approval-responded`, or `output-denied`. Source: `node_modules/ai/src/ui/convert-to-model-messages.ts:54-64`.
- For a tool part with `approval-responded`, it emits:
  - assistant `tool-call`
  - assistant `tool-approval-request`
  - tool `tool-approval-response`
  Source: `node_modules/ai/src/ui/convert-to-model-messages.ts:178-199` and `:263-277`.
- `streamText()` collects approval responses only when the last message is a tool message, then:
  - executes approved local tools immediately
  - synthesizes `tool-output-denied` and `execution-denied` results for denied tools
  Source: `node_modules/ai/src/generate-text/collect-tool-approvals.ts:30-115` and `node_modules/ai/src/generate-text/stream-text.ts:1348-1500`.

What I verified locally:
- Approved reproduction: persisted `approval-responded` caused the tool `execute` function to run.
- Denied reproduction: `execute` was not called; the model prompt received a synthetic tool result with output `{ type: "execution-denied" }`.
- Missing-patch reproduction: persisted `approval-requested` still fails with `MissingToolResultsError`, even with `ignoreIncompleteToolCalls: true`.

Implication:
- The proposed DB patch is sufficient to unblock call 2.
- `ignoreIncompleteToolCalls` does not silently discard approved tools and does not solve the original bug.

## 2. Exact JSONB Format Required

Go.

Exact static-tool shape from the SDK UI types:

```json
{
  "type": "tool-manage_activated_tools_for_connections",
  "toolCallId": "call_123",
  "state": "approval-responded",
  "input": {
    "connections": [
      {
        "connectionId": "conn_123",
        "activate": ["GMAIL_FETCH_EMAILS"],
        "deactivate": []
      }
    ]
  },
  "approval": {
    "id": "approval_123",
    "approved": true
  }
}
```

Optional fields that must be preserved if present:
- `approval.reason`
- `providerExecuted`
- `title`
- `callProviderMetadata` if you ever start persisting it

For a dynamic tool, the shape is the same except `type: "dynamic-tool"` and a `toolName` field.

Important:
- The plan’s example object is only correct if it means “patch these fields on the existing part”.
- It is not correct as a full replacement object, because the SDK also needs the original `type`, `toolCallId`, and `input`.

Relevant source:
- `node_modules/ai/src/ui/ui-messages.ts:247-310`
- `src/lib/runner/message-utils.ts:158-208`
- `src/lib/runner/message-utils.ts:324-338`

## 3. `sendAutomaticallyWhen` And Custom Body Options

Go.

Status of issue #11423:
- Fixed in `ai@6.0.117` via changelog entry `d23121f: add optional ChatRequestOptions to addToolApprovalResponse and addToolOutput`.
- Installed version here is `ai@6.0.142`, so the fix is present.
- Source confirms `addToolApprovalResponse()` now passes `...options` into the automatic `makeRequest()` call. Source: `node_modules/ai/src/ui/chat.ts:513-526`.

Repo-specific behavior:
- The app already works around stale-body risk in `prepareSendMessagesRequest()` by always constructing the approval-continuation body manually with `selectedChatModel`. Source: `src/components/chat/chat-panel.tsx:127-152`.
- Existing unit tests already verify that approval continuations include `selectedChatModel`. Source: `src/components/chat/chat-panel.test.tsx`.

Conclusion:
- This is not a blocker.
- Re-enabling `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` should be safe on the current SDK.

Reference:
- GitHub issue: <https://github.com/vercel/ai/issues/11423>

## 4. `prepareStep` And Dynamic Tool Reveal

No-Go as currently written.

What the SDK supports:
- `prepareStep` can change `activeTools` on every step.
- The SDK re-filters from the full `tools` object each step; it does not permanently drop tools that were hidden earlier.
- So a tool can be hidden on step 1 and revealed on step 3, as long as it was in `tools` from the start.
- Source: `node_modules/ai/src/generate-text/stream-text.ts:1553-1586` and `node_modules/ai/src/prompt/prepare-tools-and-tool-choice.ts:32-78`.

What does not work in the current plan:
- The plan says to skip pre-loading connections with `0` activated tools as a cost mitigation.
- That breaks the main target flow:
  1. Gmail connection exists and is `active`
  2. `activated_tools = []`
  3. user asks “check my last 3 emails”
  4. model calls `manage_activated_tools_for_connections`
  5. user approves
  6. same run must call `GMAIL_FETCH_EMAILS`
- If the Gmail toolkit was skipped at run start because it had `0` activated tools, `GMAIL_FETCH_EMAILS` is not in `tools`, so `prepareStep` cannot reveal it later.

Required plan change:
- Pre-load tool definitions for all active connections that the manage tool is allowed to mutate, including connections with `0` activated tools.
- `activeTools` should still filter the model-visible set to built-ins + currently activated slugs.

Token and latency nuance:
- Inactive preloaded tools do not add prompt tokens if they are filtered out by `activeTools`.
- They do still add startup/network cost because you must fetch and hold their definitions server-side.

## 5. Step Counter Across The Two-Call Flow

Go.

Verified from source:
- `recordedSteps` starts as `[]` inside each `streamText()` call. Source: `node_modules/ai/src/generate-text/stream-text.ts:830`.
- The approval execution path runs before `streamStep()`. Source: `node_modules/ai/src/generate-text/stream-text.ts:1348-1500`.
- `prepareStep` receives `stepNumber: recordedSteps.length`, so the first actual model step in call 2 starts at `0`. Source: `node_modules/ai/src/generate-text/stream-text.ts:1553-1558`.

Important detail:
- The approved tool execution itself does not consume one of the 12 model steps.
- So call 2 is stronger than the plan assumes: it gets the full step budget after the approved tool has already run.

## 6. Deny Flow

Go.

What the SDK does:
- `addToolApprovalResponse({ approved: false })` produces a UI tool part in `approval-responded` state with `approval.approved = false`. Source: `node_modules/ai/src/ui/chat.ts:488-499`.
- `convertToModelMessages()` converts that to a tool approval response message. Source: `node_modules/ai/src/ui/convert-to-model-messages.ts:269-277`.
- `streamText()` classifies it as a denied approval and synthesizes:
  - a UI chunk `tool-output-denied`
  - a model-visible tool result with output `{ type: "execution-denied", reason? }`
  Source: `node_modules/ai/src/generate-text/stream-text.ts:1389-1493`.

Implication:
- The model does not see a special “denied state”. It sees a normal tool result representing denial.
- That is enough for the model to respond naturally with “OK, I won’t do that.”
- The system prompt instruction to not retry denied tools is still worth keeping.

## 7. Existing Dead Code Compatibility

No-Go without one more change.

What still works:
- `PermissionCard` still matches live SDK `approval-requested` parts. Source: `src/components/chat/tool-call-inline.tsx:323-380`.
- `isToolPermissionRequest()` still matches the current `manage_activated_tools_for_connections` input schema. Source: `src/components/chat/tool-call-inline.tsx:117-126` and `src/lib/runner/tools/connections/manage-tools.ts:13-18`.
- `getApprovalResponses()` still matches the current `addToolApprovalResponse()` output format. Source: `app/api/chat/route.ts:111-158` and `node_modules/ai/src/ui/chat.ts:488-499`.
- `extractApprovalRequests()` and `createApprovalEvent()` still fit SDK `approval-requested` parts. Source: `src/lib/runner/run-persistence.ts:53-60`, `src/lib/runner/message-utils.ts:324-338`, and `src/lib/approvals/queries.ts:43-67`.

What does not work cleanly:
- `PermissionCard` treats all `approval-responded` states as granted:
  - `isGranted = state === "approval-responded" || state === "output-available"`
  - `isDenied = state === "output-denied"`
  Source: `src/components/chat/tool-call-inline.tsx:335-348`.
- If you only patch DB state to `approval-responded` with `approved: false`, a reloaded denied approval will render as `Granted`, not `Denied`.

Additional persistence gap:
- `finalizeRun()` persists from `buildAssistantPartsFromSteps(steps)`. Source: `src/lib/runner/run-persistence.ts:79-84`.
- But approval-follow-up tool results are stored in `steps[i].response.messages`, not in `steps[i].content`.
- I verified this locally:
  - `steps[0].content` only contained the assistant text
  - `steps[0].response.messages[0]` contained the synthetic tool result for the approved or denied approval
- So after call 2, DB history will not reflect `output-available` or `output-denied` for the original approval card unless you explicitly persist that state.

Conclusion:
- Live streaming behavior is fine.
- Rehydrated behavior after page reload is not fully correct, especially for deny.

## Required Plan Changes

1. Make approval resolution and message patching atomic.
   - Do not resolve `approval_events` and patch `conversation_messages.parts` as separate best-effort writes.
   - Use one SQL function / RPC or another transactional path.
   - Otherwise you can recreate the same side-table/history divergence under partial failure.

2. Patch using the authoritative DB outcome, not the raw client payload.
   - `already_resolved` is currently treated as success in the route.
   - If the user double-submits or races Approve vs Deny, patching from the raw request body can flip the message state away from the already-recorded DB outcome.
   - Patch from the resolved event status instead.

3. Pre-load tool definitions for all active connections, including those with `0` activated tools.
   - The “skip zero-activated connections” optimization is incompatible with the primary Gmail/Drive first-activation flow.

4. Decide how to persist final post-approval state after call 2.
   - Minimum viable fix:
     - patch to `approval-responded` before call 2
     - update UI rendering so `approval-responded` with `approved: false` renders as denied
   - Better fix:
     - after call 2, persist the original approval card to `output-available` or `output-denied` using `steps[].response.messages`, so DB history matches the live UI

5. Update tests during implementation.
   - Current `chat-panel` test intentionally asserts that `sendAutomaticallyWhen` is `undefined`.
   - Re-enabling the SDK approval path will require flipping that expectation.

## Token Cost Estimate

There are two different costs here:

1. Prompt token cost
   - Only tools that survive `activeTools` filtering are sent to the model.
   - So inactive preloaded tools cost `0` prompt tokens.
   - Worst case, if all `149` tools are active at once:
     - `149 * 200` tokens ≈ `29,800`
     - `149 * 500` tokens ≈ `74,500`
   - More realistic subsets:
     - `4` active tools ≈ `800-2,000`
     - `10` active tools ≈ `2,000-5,000`

2. Startup/network cost
   - Pre-loading all candidate tool definitions still costs one or more Composio fetches at run start.
   - That cost remains even when `activeTools` hides most of them from the model.
   - This is the real tradeoff of the proposed same-run activation strategy.

## Recommended Test Sequence

1. SDK-level proof first.
   - Persist one `approval-requested` part.
   - Patch it to `approval-responded`.
   - Load with `convertToModelMessages()`.
   - Run `streamText()`.
   - Assert the tool executes.

2. Deny path second.
   - Same setup, but `approved: false`.
   - Assert `execute` is not called.
   - Assert the model receives an `execution-denied` tool result.

3. Atomic route test.
   - Add a route-level test for “resolve approval + patch message state”.
   - Include duplicate submit / opposite-decision replay and make sure the DB outcome wins.

4. Same-run connection activation E2E.
   - Use an existing active connection with `activated_tools = []`.
   - Approve `manage_activated_tools_for_connections`.
   - Verify the next step can call a newly activated tool in the same run.
   - This is the highest-risk product path.

5. Reload-state test.
   - Deny a tool, reload the thread, and verify the card still shows denied.
   - Approve a tool, reload the thread, and verify the card does not regress to pending.

6. Only after that, wire the other gated tools.
   - `delete_records`
   - `configure_crm`
   - `delete_connection`
   - `manage_active_triggers` delete branch

## Bottom Line

The core resume assumption is correct: patching the persisted tool part to `approval-responded` is enough to make call 2 work with the current AI SDK.

The plan is not ready to implement unchanged. Two issues need to be fixed in the design first:
- the Composio preload strategy must include active connections with `0` activated tools
- deny-state persistence / rehydration needs an explicit answer, because the current dead UI path will misrender persisted denied approvals
