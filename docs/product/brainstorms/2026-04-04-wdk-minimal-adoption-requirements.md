---
date: 2026-04-04
topic: wdk-adoption
status: waiting-for-ga
---

# WDK Adoption — Durable Steps + Approvals + Streams

## Problem Frame

Sunder's agent hits the 300s Vercel Function timeout and 12-16 step limits across the board — sandbox skills, multi-tool CRM workflows, and research+action combos all run out of runway. These limits exist because the entire agent loop runs in a single serverless function invocation.

Additionally, the approval gate (`approval_events` + `ask_user_question` + `continue-after-approval`) is fragile — it kills and restarts the run, forcing the LLM to re-derive intent from conversation history. And the Redis-based `resumable-stream` is a separate system to maintain.

By wrapping the agent in Vercel Workflow DevKit, each tool call and LLM call becomes its own serverless function. The 300s limit applies per-step, not per-run. Approvals become deterministic pause/resume (not probabilistic re-derivation). Streams are native to the workflow (no Redis dependency for this purpose).

**Scope:** Three things, all consequences of the same underlying change (wrapping the runner in WDK):

1. **Durable steps** — `"use workflow"` + `"use step"` + `DurableAgent`. Break the timeout ceiling.
2. **Approval migration** — Replace `approval_events` DB flow with `createHook()` webhook pause/resume.
3. **Stream replacement** — Replace Redis `resumable-stream` with WDK's native `getWritable()` streams.

**Timeline:** Waiting for WDK to reach GA (currently beta). Monitor stability, then execute.

## Requirements

### Core Durability

- R1. **Durable agent steps.** Each tool call and LLM call becomes a checkpointed step via `DurableAgent` + `"use step"` directives. If a run crashes mid-execution, it resumes from the last completed step.
- R2. **30-50 step ceiling.** Replace the current 12/16 step limits with 30-50 (configurable per run type). Cost and runaway protection via step budget, not architecture.
- R3. **No single-function timeout constraint.** 300s applies per-step, not per-run. Total workflow duration is unbounded.
- R4. **Existing tools unchanged.** All ~30 tools continue working. The only change per tool is adding `"use step"` to each execute function.
- R5. **Existing frontend unchanged.** `useChat()`, streaming protocol, message bubbles, tool-call-inline — all stay as-is. The frontend doesn't know the backend is durable.
- R6. **Multi-model routing preserved.** AI Gateway, Gemini Flash as Tier 1, model selection per run — all unchanged.

### Approval Migration

- R7. **Webhook-based approval pauses.** Replace the DB-based `approval_events` flow with WDK's `createHook()`. When the agent hits an approval-gated action, the workflow pauses at that exact step. When the user approves/denies, the workflow resumes from that step — no fresh function invocation, no context reload, no LLM re-derivation.
- R8. **Parallel approvals.** Multiple approval gates in one run can be awaited via `Promise.all()`. User sees all approval buttons at once, clicks in any order.
- R9. **Timed approvals.** `Promise.race([approvalHook, sleep("24h")])` — if user doesn't respond in X time, the workflow can proceed with a fallback or cancel.
- R10. **Telegram approval integration.** Telegram approval handler POSTs to the hook's resume endpoint instead of going through the chat API route. Simpler wiring.

### Stream Replacement

- R11. **Native workflow streams.** Replace Redis-based `resumable-stream` with WDK's `getWritable()`. Streams persist natively in the workflow, resumable from offset via `getRun().getReadable({ startIndex })`.
- R12. **Delete Redis stream dependency.** Remove `resumable-stream` package, `setActiveStreamId()` / `getActiveStreamId()` / `clearActiveStreamId()` Redis calls, and the polling-based resume logic.

## Success Criteria

- A chat run can execute 30+ tool calls without hitting a timeout
- An autopilot run can chain 10+ CRM operations + sandbox commands in a single run
- Approval pause/resume works without a fresh function rebooting full context
- `Promise.race([approval, sleep("2h")])` correctly times out an unanswered approval
- Frontend streaming works identically — user sees no difference in the chat UI
- Stream resume works after client disconnect without Redis
- No regression in existing tool behavior, CRM operations, or sandbox skills
- Multi-model routing (Gemini Flash, Claude) still works through AI Gateway

## Scope Boundaries (Explicit Non-Goals)

- **Not replacing cron/autopilot.** Scanner + executor + claim RPCs stay as-is. Our distributed scheduling is more robust than WDK's `sleep()` in a loop.
- **Not replacing queue system.** `thread_queue_records` + `drain_thread_queue` stays as-is.
- **Not replacing run locking.** `create_run_if_idle()` stays as-is.
- **Not adding sleep-based scheduling.** Cron system stays.

## What Gets Deleted

- `approval_events` table (or repurposed for audit trail only)
- `createApprovalEvent()` / `resolveApprovalEvent()` / `expireApprovalEvent()`
- `continue-after-approval.ts`
- `stopWhen: [hasToolCall("ask_user_question")]` pattern
- Approval extraction logic in chat API route (`getApprovalResponses()`)
- `resumable-stream` npm package
- `setActiveStreamId()` / `getActiveStreamId()` / `clearActiveStreamId()` Redis calls
- Polling-based stream resume in `/api/chat/[id]/stream/route.ts`

## Key Decisions

- **`DurableAgent` wraps existing `streamText()`.** The agent loop doesn't change — DurableAgent is a drop-in that adds step checkpointing to each LLM call internally.
- **`experimental_context` for tool scoping.** Per the Slack agent template pattern, pass `{ supabase, clientId }` via `experimental_context` instead of closure injection.
- **`finalizeRun()` moves from `onFinish` to after workflow completion.** Same logic, different trigger point.
- **Approval via `createHook()` with deterministic tokens.** Token format: `approval:${runId}:${toolCallId}`. Resume via `POST /api/hooks/approval` calling `resumeHook(token, data)`.
- **Two-runner escape hatch not needed.** All runs go through the workflow path.
- **Wait for GA.** WDK is in beta. Per-step latency is ~200ms today, targeting ~20-50ms. Monitor stability via GitHub issues and changelog before committing.

## Latency Profile (as of 2026-04-04)

| Metric | Current | Target |
|---|---|---|
| Per-step overhead | ~200ms | ~20-50ms (PR #1338) |
| Median API response | 17ms | — |
| Region | `iad1` only | Multi-region planned |
| Event log replay at step 50 | ~1-2s | Improving |

For a typical 4-step CRM interaction, ~800ms overhead at 200ms/step. At 50ms/step (upcoming): ~200ms overhead. Acceptable given LLM first-token latency is already 500ms+.

**Deploy in `iad1`** — WDK backend is there. Cross-region adds latency to every step.

## Dependencies / Assumptions

- WDK reaches GA with stable API
- `DurableAgent` supports all `streamText()` options Sunder uses: `stopWhen`, `prepareStep`, `experimental_transform`, `providerOptions`
- `withWorkflow()` compiler plugin is compatible with Next.js 15 + Turbopack
- All tool execute functions return JSON-serializable outputs (required for step caching)
- CRM create tools are idempotent or need idempotency guards for retry safety
- `createHook()` + `resumeHook()` pattern works with Telegram's webhook delivery

## Known Risks

- **Compiler plugin opacity.** `withWorkflow()` modifies the Next.js build. Debugging conflicts is harder.
- **Per-step latency overhead.** ~200ms/step today. Improves with each release. Monitor before adopting.
- **DurableAgent API surface.** Need to verify full compatibility with Sunder's `streamText()` options.
- **Retry idempotency.** `create-record` CRM tool may create duplicates if retried. Audit each tool.
- **Event log replay scaling.** At 50 steps, replay adds ~1-2s. Acceptable but monitor.

## Outstanding Questions

### Deferred to Planning (after GA)

- [R2] What step budgets per run type? Suggest: chat=30, cron/autopilot=50, subagent=15.
- [R4] Full `DurableAgent` compatibility audit against Sunder's `streamText()` config.
- [R4] `experimental_context` interaction with `DurableAgent` — confirm pattern with AI SDK v6.
- [R1] How does `finalizeRun()` wire up post-workflow?
- [R1] Tool idempotency audit — which tools need guards? CRM creates are the main concern.
- [R7] Approval hook token naming convention and Telegram integration wiring.
- [R11] WDK stream compatibility with `createUIMessageStreamResponse()`.

## Reference Implementations

| # | Repo | What to study |
|---|---|---|
| 1 | [`slack-agent-template`](https://github.com/vercel-partner-solutions/slack-agent-template) | 21-line workflow, real tools with `"use step"` + `experimental_context`, approval hooks |
| 2 | [`call-summary-agent`](https://github.com/vercel-labs/call-summary-agent-with-sandbox) | Workflow + Sandbox + bash tool, webhook-triggered background agent |
| 3 | [`lead-agent`](https://github.com/vercel-labs/lead-agent) | Multi-step pipeline with conditional branching + human approval |

### Key Files

1. `slack-agent-template/server/lib/ai/workflows/chat.ts` — 21-line durable workflow
2. `slack-agent-template/server/lib/ai/tools.ts` — tools with `"use step"` + `experimental_context`
3. `call-summary-agent/workflows/gong-summary/index.ts` — webhook-triggered background workflow
4. `call-summary-agent/lib/agent.ts` — ToolLoopAgent + Sandbox + bash
5. `lead-agent/workflows/inbound/index.ts` — conditional pipeline with human approval

## Talks / Reference Material

- `docs/talks/2026-04-04-vercel-workflow-dev-kit-keynote.md` — Renee's keynote (3 examples + Mandolin healthcare demo)
- `docs/talks/2026-04-04-vercel-workflow-dev-kit-workshop.md` — Hands-on workshop (coding agent → workflow agent, full Q&A)

## Next Steps

→ Monitor WDK for GA announcement. When stable, `/plan` for structured implementation.
