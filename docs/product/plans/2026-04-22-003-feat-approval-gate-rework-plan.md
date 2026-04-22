---
title: "feat: Approval gate rework (Managed Agents era)"
type: feat
status: active
date: 2026-04-22
origin: docs/product/ideations/2026-04-22-approval-gate-rework-requirements.md
---

# feat: Approval gate rework (Managed Agents era)

## Overview

Replace Sunder's inert approval gate with the Anthropic Managed Agents cookbook pattern: an agent-called `request_approval` custom tool, `session.status_idled` webhook for async resume, and a binary Allow/Deny approval card in both web chat and Telegram. Destructive CRM actions (`delete_records`, `configure_crm`) are gated in v0 via prompt-only enforcement. This establishes the architecture that the external-comms gate (the SME-pitch headline) will extend from.

## Problem Statement

The current gate is inert. `scripts/managed-agents/create-agent.ts:252` publishes every built-in tool with `permission_policy: "always_allow"`, so the `evaluated_permission: "ask"` detection path in `event-translator.ts:115` never fires. Custom tools have no approval path at all. The workaround — `ask_user_question` gating in the system prompt — produces a double-interruption UX (generic question card → tool execution → two clicks for one approve-and-go).

An earlier attempt (April 7 ideation) proposed re-enabling the Vercel AI SDK's `needsApproval` property. The April 9 Managed Agents migration orphaned that approach: no more `convertToModelMessages`, no `prepareStep`, no `streamText`. See origin document for full history.

## Proposed Solution

Adopt the Anthropic cookbook pattern wholesale:

1. Agent calls a new custom tool `request_approval(summary, action_type, payload_preview)` before any destructive action.
2. Session pauses with `stop_reason.type === "requires_action"`. Our app receives a `session.status_idled` webhook from Anthropic, inspects events, enqueues pending approval to DB.
3. UI (web + Telegram) renders from DB. User clicks Allow or Deny.
4. `/api/tool-confirm` POSTs a `user.custom_tool_result` back to the session via `sessions.events.send`. Agent resumes, conditionally runs the gated action per its system prompt.
5. No in-process `after()` drain. No long-lived HTTP connection during human wait.

Reference: `CMA_gate_human_in_the_loop.ipynb`, `CMA_operate_in_production.ipynb`, `sre_incident_responder.ipynb` at `/Users/sethlim/Documents/managed_agents/`.

## Technical Approach

### Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║ 1. User sends chat msg → runner.consumeAnthropicSession()        ║
║    Agent reasons → calls request_approval(summary, ...)          ║
║    Session → status_idled + requires_action                      ║
║ 2. Anthropic → POST /api/webhooks/anthropic                      ║
║    (HMAC verified) → create row in approval_events               ║
║    → Supabase Realtime update → UI renders card                  ║
║ 3. User clicks Allow → POST /api/tool-confirm                    ║
║    → sessions.events.send({user.custom_tool_result, approved})   ║
║ 4. Agent resumes (new runner invocation or webhook-triggered)    ║
║    → Follows system prompt → calls delete_records                ║
║    → status_idled with end_turn → UI updates                     ║
╚══════════════════════════════════════════════════════════════════╝
```

### Key Resolved Questions (from origin's Deferred-to-Planning)

**Schema for `request_approval`:** three fields — `{ summary: string, action_type: string, payload_preview?: object }`. `summary` is the agent's natural-language explanation rendered on the card. `action_type` is a short enum string (e.g. `"crm.delete_records"`, `"crm.configure_crm"`) that foreshadows future pattern-rules. `payload_preview` shows the concrete payload (e.g. 3 record IDs about to be deleted).

**`/api/tool-confirm` migration:** **Hybrid**. Endpoint stays as the button-click target. Its behavior changes: instead of in-process `after(drainStream)`, it calls `anthropicClient.beta.sessions.events.send(sessionId, {type: "user.custom_tool_result", ...})` and returns. The session resumes on Anthropic's side. When it goes idle again, the `session.status_idled` webhook fires and we reconcile state back into DB.

**Dead-code audit:** Reuse the `approval_events` table + `queries.ts` infra — it's fine. Delete the `evaluated_permission` branch (5 files). The `PermissionCard` component is reused with minor input adjustments. Full list in Phase 5 below.

**System prompt sequencing:** Atomic within a commit but sequenced across deploys. New agent version must publish first (adds `request_approval` tool + updated gating instructions), then web code deploys (UI renders new path). A short window exists where old agent versions don't know the new tool — acceptable since the tool is additive and the `ask_user_question` fallback still works until the final cleanup step.

**HMAC on Vercel Functions:** Next.js App Router route handler. Read raw body via `req.text()` before JSON-parsing, compute HMAC-SHA256 with `ANTHROPIC_WEBHOOK_SECRET` env var, compare with `crypto.timingSafeEqual`. Standard pattern — see Phase 2 pseudocode.

### Implementation Phases

#### Phase 1: Tool + Handler (observable, not enforced)

Ship the new custom tool end-to-end but without yet forcing the agent to use it. Validate the event plumbing.

**Tasks:**
- [ ] Add `src/lib/managed-agents/tools/approvals/request-approval.ts` — tool declaration with Zod schema `{ summary, action_type, payload_preview? }`.
- [ ] Register the tool in `src/lib/managed-agents/tools/declarations.ts` (or equivalent registration point).
- [ ] Add dispatcher handler in `src/lib/managed-agents/dispatcher.ts` that:
  - Creates `approval_events` row via `createApprovalEvent()` (reuse existing `src/lib/approvals/queries.ts`)
  - Returns a pending marker so the session goes idle with `requires_action`
  - Does NOT execute any downstream action
- [ ] Update `scripts/managed-agents/create-agent.ts` to include `request_approval` in the agent's `tools` array. Update system prompt to *mention* the tool and its purpose, but do not yet remove the `ask_user_question` gating.
- [ ] Publish new agent version for `claude-haiku-4-5` (dev) — do NOT yet publish for Sonnet/Opus.
- [ ] Add integration test: agent can call `request_approval`, row is created, session reaches idle.

**Success criterion:** In dev, the agent is able to call `request_approval` (e.g. via a test prompt that asks it to), an `approval_events` row appears, session goes idle. Approval is not actually resolved yet — just verifying the call shape.

#### Phase 2: Webhook migration

Stand up the `session.status_idled` webhook handler. Migrate `/api/tool-confirm` to the send-only pattern. Remove in-process drain.

**Tasks:**
- [ ] Create `app/api/webhooks/anthropic/route.ts`:
  ```ts
  // pseudo
  export async function POST(req: Request) {
    const body = await req.text();
    const sig = req.headers.get("x-anthropic-signature");
    if (!verifyHmac(body, sig, process.env.ANTHROPIC_WEBHOOK_SECRET!)) {
      return new Response("unauthorized", { status: 401 });
    }
    const event = JSON.parse(body);
    if (event.event_type === "session.status_idled") {
      await reconcilePendingApprovals(event.resource_id); // sessionId
    }
    return Response.json({ ok: true });
  }
  ```
- [ ] Implement `reconcilePendingApprovals(sessionId)`:
  - `client.beta.sessions.events.list(sessionId)`
  - Find `agent.custom_tool_use` events with `name === "request_approval"` and no matching `user.custom_tool_result`
  - Upsert corresponding rows in `approval_events` (keyed on `tool_use_id`)
- [ ] Register webhook in Anthropic Console → store `whsec_...` secret in Vercel env.
- [ ] Refactor `app/api/tool-confirm/route.ts`:
  - Remove `import { after } from "next/server"`, remove `after(() => drainStream(...))`
  - On Allow/Deny, call `sessions.events.send` with `{type: "user.custom_tool_result", custom_tool_use_id, content: [{type: "text", text: JSON.stringify({decision, reason?})}]}`
  - Mark `approval_events` row as resolved atomically
  - Return immediately with the resolution status
- [ ] Refactor `src/lib/managed-agents/session-runner.ts:342-385`:
  - Remove the approval-wait branch (`options.autoDenyApprovals` path, tail-handle Mode B)
  - Runner consumes events until `session.status_idle`, then returns cleanly
  - No more `resumeManagedAgentFromApproval()` — replaced by webhook-driven flow
- [ ] Test: end-to-end approve in dev. `request_approval` → idle → webhook fires → DB row → user approves → agent receives result → agent continues.

**Success criterion:** Full round-trip works in dev with HMAC-verified webhook. No `after()` in `tool-confirm`. No runner-side wait for approval.

#### Phase 3: UI wiring (web + Telegram)

Hook the approval card to the new `request_approval` event shape.

**Tasks:**
- [ ] Update `src/components/chat/tool-call-inline.tsx`:
  - Extend `PermissionCard` (line 843) to read from `request_approval` tool input shape
  - Card displays `summary` prominently; `action_type` as subtitle/badge; `payload_preview` in a collapsed `<details>` if present
  - Binary Allow / Deny buttons call existing `onToolApproval` callback
  - Remove the old `isToolPermissionRequest()` path that targeted `manage_activated_tools_for_connections` — now handled by the new generic shape
- [ ] Update the live Supabase Realtime subscription on `approval_events` so the UI renders cards driven by webhook inserts, not only runner-emitted ones.
- [ ] Update `src/lib/channels/telegram/approvals.ts`:
  - `buildApprovalKeyboard()` stays 2-button (Allow / Deny) — no 3-button change in v0
  - Trigger for Telegram delivery: new `approval_events` row where channel is Telegram → send via existing `sendTelegramApprovalRequest()`
  - On resolution (via Telegram callback), post decision via the same `/api/tool-confirm` endpoint
  - Edit the original Telegram message to remove buttons and show outcome (currently the behavior — confirm no regression)
- [ ] Test: trigger `request_approval` in a web chat session → card renders → click Allow → session resumes → UI updates. Repeat in Telegram.

**Success criterion:** Both channels render a single, rich approval card with the agent's natural-language summary. Click Allow → action executes. Click Deny → action does not execute.

#### Phase 4: Enforce for destructive CRM

Flip the gate on. Remove `ask_user_question` gating for the two target tools.

**Tasks:**
- [ ] Define `GATED_TOOLS` constant in `src/lib/managed-agents/tools/gated-tools.ts`:
  ```ts
  export const GATED_ACTION_TYPES = [
    "crm.delete_records",
    "crm.configure_crm",
  ] as const;
  ```
- [ ] Update system prompt in `scripts/managed-agents/create-agent.ts`:
  - Remove `ask_user_question` gating for `delete_records` and `configure_crm`
  - Add explicit instruction:
    > *"Before calling `delete_records` or `configure_crm`, first call `request_approval({summary, action_type, payload_preview})` with a clear summary of what you will do and why. Do not call the destructive tool unless the approval result is `{"decision": "approved"}`."*
  - Keep trigger-run exclusions (existing: no `ask_user_question` in triggers → same applies to `request_approval`; destructive tools unreachable from triggers)
- [ ] Republish agent version for `claude-haiku-4-5` (dev) then `claude-sonnet-4-6` and `claude-opus-4-6` (prod).
- [ ] Test: `delete_records` call attempt in web chat → agent first calls `request_approval` → card renders → approve → deletion happens. Same for `configure_crm`. Both without any `ask_user_question` precursor.
- [ ] Deny-path test: agent calls `request_approval`, user denies, agent receives `{decision: "denied"}`, acknowledges and does not retry.

**Success criterion:** Single approval card for destructive CRM actions in both channels. No double-interruption. Zero regressions on non-gated `ask_user_question` flows.

#### Phase 5: Dead-code cleanup

Delete the `evaluated_permission` branch and any other orphans identified.

**Tasks:**
- [ ] Delete the `evaluated_permission: "ask"` branch:
  - `src/lib/managed-agents/event-translator.ts:113-137` (remove approvalRequest emission)
  - `src/lib/managed-agents/events-to-assistant-parts.ts:108-115` (remove approval-requested path)
  - `src/lib/managed-agents/dispatch-event-to-callbacks.ts:44-54` (remove ask detection)
  - `src/lib/managed-agents/event-types.ts:51,67` (drop `"ask"` from the `evaluated_permission` union if nothing remaining uses it)
  - Matching tests in `src/lib/managed-agents/__tests__/event-translator.test.ts`
- [ ] Audit `src/lib/managed-agents/session-runner.ts` for orphaned approval constants after Phase 2 refactor (e.g. `options.autoDenyApprovals`, `kickoffApproval` param).
- [ ] Audit and remove unused bits from the April pre-migration trail **only if proven unreferenced** (grep first, delete second):
  - `Confirmation` component at `src/components/ai-elements/confirmation.tsx`
  - `extractApprovalRequests` in `src/lib/runner/run-persistence.ts` (if the runner path is fully gone post-migration)
  - `continue-after-approval.ts` — probably dead post-migration
  - `patchApprovalParts` in `src/lib/runner/context.ts`
  - `hasApprovalContinuationState`, `addToolApprovalResponse`, `sendAutomaticallyWhen` refs in `chat-panel.tsx` (dead post-migration)
  - `pending_approval_count` in system-reminder context
- [ ] Run full test suite. Any test that asserted on the `evaluated_permission` path gets deleted or ported to the new path.

**Success criterion:** `grep -r "evaluated_permission" src/` returns zero hits in the approval-flow files. `grep -r "needsApproval" src/` stays zero (regression guard). No orphan components / helpers from prior attempt.

## Alternative Approaches Considered

Already evaluated in the origin ideation. Summary:
- **Metadata-flag approach (`requiresApproval` on tool definitions)** — rejected. Drifts from Anthropic cookbook.
- **Belt-and-suspenders dispatcher enforcement** — rejected for v0 per user's choice ("prompt-only, pure cookbook").
- **Unified `session_interrupts` primitive covering approval + Composio + ask_user_question** — deferred. V0 ships approval-only.
- **Four-choice UI + `client_approval_rules` table** — deferred to external-comms extension.
- **Keep in-process `after()` drain, defer webhook** — rejected. User chose webhook in v0 to avoid retrofit later.

## System-Wide Impact

### Interaction Graph

- A user chat message → `POST /api/chat` → `runManagedAgent()` → `consumeAnthropicSession()` → streaming events. With this change, the runner returns as soon as the session goes idle (including `requires_action`). It does not wait for approval.
- Separately: Anthropic's `session.status_idled` webhook → `POST /api/webhooks/anthropic` → writes to `approval_events` → Supabase Realtime push → UI renders card. Entirely decoupled from the chat request's HTTP lifecycle.
- User action on card → `POST /api/tool-confirm` → `sessions.events.send(user.custom_tool_result)` → Anthropic resumes the session server-side. Eventually fires `session.status_idled` again → same webhook path reconciles final state.

### Error & Failure Propagation

- **Webhook HMAC mismatch:** 401 returned. Anthropic retries per their webhook semantics — no local state written.
- **Webhook arrives for session we don't recognize:** log + ignore. Don't write.
- **User approves but `sessions.events.send` fails:** `/api/tool-confirm` returns error to UI. Approval row stays unresolved. User can retry.
- **Session times out on Anthropic side while we wait for approval:** webhook arrives with terminated status. Mark approval as expired in DB. UI renders "this approval expired — please rephrase your request." (Expiration UX is minimal in v0 — just an error state, no proactive reminder.)
- **Double-click on Allow (race):** existing `claimApprovalResolution()` pattern in `queries.ts` already guards this via DB claim-upsert. Reuse as-is.
- **Agent skips `request_approval` and calls `delete_records` directly (prompt failure):** tool executes. No infra guard in v0 (that's the prompt-only choice). Mitigation: strict system prompt language, integration tests per model, and Langfuse trace monitoring for skip incidents.

### State Lifecycle Risks

- A `request_approval` can be created but never resolved (user closes tab, session dies). Row stays `pending` forever. For v0 this is acceptable — no cleanup cron. Monitoring: count of stale `approval_events` in Langfuse / DB metrics.
- Webhook can fire before `/api/tool-confirm` commits its DB write (if user clicks Allow immediately). The `approval_events` unique constraint on `tool_use_id` + upsert semantics must handle both orders. Verify in Phase 2 testing.
- The agent version published to Anthropic is a separate state surface from the web code. A deploy that updates web code without republishing the agent = orphaned UI (new card format expected, old `evaluated_permission` events still emitted). Mitigation: republish agent first (Phase 4 ordering), then deploy web.

### API Surface Parity

- `/api/tool-confirm` is called from both web chat UI and Telegram callback handler. Both paths must produce identical `user.custom_tool_result` behavior.
- Both channels must render the same agent-written summary (not each composing their own from raw args).

### Integration Test Scenarios

1. **Happy web:** web chat → agent calls `request_approval` → card renders via webhook → user clicks Allow → `delete_records` executes → UI confirms deletion.
2. **Happy Telegram:** same flow but entirely in Telegram.
3. **Cross-channel:** request via web, approve via Telegram (or vice versa). Both surfaces must converge.
4. **Deny:** agent receives `{decision: "denied"}`, responds naturally, does NOT retry the destructive action in the same turn.
5. **Double-click race:** two rapid Allow clicks → only one `sessions.events.send` fires, second returns "already resolved."
6. **Page reload mid-approval:** pending approval rehydrates into the UI card on reload.
7. **Webhook-late:** user clicks Allow before webhook arrives (webhook retry from Anthropic was slow). Final DB state is still consistent.

## Acceptance Criteria

### Functional Requirements
- [ ] `request_approval` custom tool declared, registered, and callable by the agent.
- [ ] `session.status_idled` webhook handler at `/api/webhooks/anthropic` with HMAC verification.
- [ ] Web chat renders approval card with agent-written summary + binary Allow/Deny.
- [ ] Telegram renders approval with existing 2-button inline keyboard; outcome editing works.
- [ ] Destructive CRM actions (`delete_records`, `configure_crm`) are gated in the system prompt via `request_approval` instruction.
- [ ] `/api/tool-confirm` refactored to call `sessions.events.send` instead of `after()` drain.
- [ ] `session-runner.ts` no longer waits for approval — returns on idle.
- [ ] Zero `evaluated_permission: "ask"` references remain in the approval path.
- [ ] Zero `needsApproval` references anywhere (regression guard).
- [ ] Cross-channel test passes (request web, approve Telegram).

### Non-Functional Requirements
- [ ] HMAC signature verified for every webhook request.
- [ ] `ANTHROPIC_WEBHOOK_SECRET` stored in Vercel env, not committed.
- [ ] Approval latency from webhook arrival to UI render < 2s under normal conditions.
- [ ] No regression on `ask_user_question` flows for non-gated use cases.

### Quality Gates
- [ ] Unit tests for webhook HMAC verification (valid/invalid/missing signature).
- [ ] Integration test for full round-trip (agent → approval → resume → execute).
- [ ] Langfuse traces show the full event chain with `request_approval` + resolution.
- [ ] Code review approval before merge.

## Success Metrics

- **UX:** destructive CRM actions take exactly 1 approval click in either channel (down from 2 with `ask_user_question` + execution).
- **Correctness:** 100% of destructive CRM calls in prod preceded by an approved `request_approval` event in Langfuse (prompt-compliance measurement).
- **Reliability:** webhook endpoint 99.9% success rate, no orphaned approvals beyond the opt-in expiration case.
- **Foundation:** extension to external-comms (send_message, Composio write) is additive — no further architectural changes required.

## Dependencies & Risks

### Dependencies
- Anthropic Console webhook registration (one-time manual step).
- `ANTHROPIC_WEBHOOK_SECRET` env var on Vercel.
- Agent republish for all production models (`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`).
- Supabase Realtime subscription on `approval_events` table (may already exist from prior attempt — verify).

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent skips `request_approval` due to prompt non-compliance | Medium | Destructive action runs ungated | Strict system prompt language, per-model integration tests, Langfuse alerts on skip pattern. Belt-and-suspenders is a deliberate follow-up if this manifests. |
| Webhook retry flood from Anthropic if handler fails | Low | Noisy reconciliation | Idempotent upsert by `tool_use_id`. Fast 2xx on replay. |
| Double deploy ordering (code before agent republish) breaks UI | Medium | Stale approval cards in production | Phase 4 explicitly sequences agent publish before code deploy. |
| Cross-channel state desync (web + Telegram both acting on same approval) | Low | Confusing UX | Reuse existing `claimApprovalResolution()` race guard. |
| Composio/ask_user_question paths accidentally broken during dead-code cleanup | Low | Regression | Phase 5 grep-before-delete discipline. Full test suite gate. |

## Future Considerations

Documented in origin's Extension Paths section. Explicitly not in v0 scope:
- External-comms gating (the SME-pitch headline)
- Four-choice UI + `client_approval_rules` pattern rules
- Telegram 3-button inline keyboard with "always allow" pattern
- Composio `request_connection` tool for OAuth
- Unified `session_interrupts` primitive
- Per-client gated-tools list

All additive. None block v0.

## Sources & References

### Origin
- **Origin document:** [docs/product/ideations/2026-04-22-approval-gate-rework-requirements.md](../ideations/2026-04-22-approval-gate-rework-requirements.md)
- Key decisions carried forward:
  - Agent-called custom tool, not metadata flag
  - Prompt-only enforcement (no dispatcher belt-and-suspenders)
  - Destructive CRM tools only (`delete_records`, `configure_crm`)
  - `session.status_idled` webhook in v0
  - Binary Allow/Deny; four-choice deferred
  - Supersedes April 7 ideation (`2026-04-07-tool-approval-system.md`)

### Internal References
- Current approval detection: `src/lib/managed-agents/event-translator.ts:113-137`, `events-to-assistant-parts.ts:108-115`, `dispatch-event-to-callbacks.ts:44-54`, `event-types.ts:51,67`
- Runner approval wait: `src/lib/managed-agents/session-runner.ts:342-385`
- In-process drain to remove: `app/api/tool-confirm/route.ts:10,15,89`
- Approval UI (reuse): `src/components/chat/tool-call-inline.tsx:843-966`
- Telegram approvals (reuse): `src/lib/channels/telegram/approvals.ts:31`
- Existing event queries (reuse): `src/lib/approvals/queries.ts`
- Agent registration: `scripts/managed-agents/create-agent.ts:252`
- Current ask_user_question tool: `src/lib/managed-agents/tools/browser-side/ask-user-question.ts`

### External References
- Anthropic Managed Agents cookbooks (local): `/Users/sethlim/Documents/managed_agents/`
  - `CMA_gate_human_in_the_loop.ipynb` — approval pattern reference
  - `CMA_operate_in_production.ipynb` — webhook + HMAC pattern
  - `sre_incident_responder.ipynb` — single-tool reference
- Managed Agents docs: https://platform.claude.com/docs/en/managed-agents/overview

### Related Work
- Prior ideation (superseded): `docs/product/ideations/2026-04-07-tool-approval-system.md`
- Prior stress test (superseded): `docs/product/reviews/2026-04-07-tool-approval-stress-test.md`
- Prior handover (context on removal): `docs/product/handovers/2026-04-01-approval-flow-review.md`
- Managed Agents migration requirements: `docs/product/ideations/2026-04-09-managed-agents-migration-requirements.md`
