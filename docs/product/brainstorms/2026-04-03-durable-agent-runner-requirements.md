---
date: 2026-04-03
topic: durable-agent-runner
---

# Durable Agent Runner

## Problem Frame

Sunder's autonomous autopilot vision requires multi-step workflows that exceed the current serverless architecture's ceiling. The agent hits step limits (12-16) and function timeouts (300s) across the board — sandbox skills, CRM workflows, and research+action combos all run out of runway before the work is done.

Without durable execution, the path forward is a platform migration to persistent processes (Claude Agent SDK on containers, Temporal, etc.) — losing multi-model support, `useChat()` streaming, Vercel zero-ops, and 3-4 weeks of rebuild.

**Durable serverless is how we get autonomous agents without leaving Vercel.** By wrapping the existing runner in a durable orchestration layer, each tool call becomes a checkpointed step. The 300s timeout applies per-step, not per-run. Runs can be 30-50 steps, take 20+ minutes, survive crashes, and pause for human approval — all on Vercel Functions.

The approach is an **incremental wrap**: keep the existing AI SDK runner, tools, streaming, and frontend intact. Add durability around them.

## Requirements

### Core Durability

- R1. **Durable agent steps.** Each tool call and LLM call in the runner becomes a checkpointed step. If a run crashes or times out mid-execution, it resumes from the last completed step — not from scratch.
- R2. **30-50 step ceiling.** Runs support up to 50 steps (configurable per run type). The current 12/16 limits are replaced. Cost and runaway protection remain via step budget, not architecture.
- R3. **No single-function timeout constraint.** The 300s Vercel Function limit applies per-step, not per-run. A 50-step run taking 20 minutes is fine because no individual step exceeds 300s.
- R4. **Existing tools unchanged.** All ~30 tools (CRM, file I/O, sandbox/bash, messaging, triggers) continue working. The only change is adding a step marker to each tool's execute function.
- R5. **Existing frontend unchanged.** `useChat()`, the streaming protocol, message bubbles, tool-call-inline rendering — all stay as-is. The frontend doesn't know the backend is durable.
- R6. **Multi-model routing preserved.** AI Gateway, Gemini Flash as Tier 1, model selection per run — all unchanged. No model lock-in.

### Streaming & Resumption

- R7. **Resumable streams.** If the user disconnects mid-run (closes tab, loses connection), they can reconnect and pick up the stream from where it left off. Replaces the current Redis-based `resumable-stream` + polling approach with the workflow's native stream resumption.

### Autopilot & Scheduling

- R8. **Autopilot runs use the same durable path.** Cron/pulse/trigger runs go through the same workflow orchestration as chat runs. No separate execution mode. Autopilot runs also get crash recovery and longer step budgets.
- R9. **Sleep for scheduled work.** The workflow can `sleep()` for hours/days between actions — enabling patterns like "check emails every morning" as a single long-lived workflow rather than repeated cron invocations. Zero compute while sleeping.

### Observability & Reliability

- R10. **Built-in observability.** Each step is visible in the workflow inspection UI (inputs, outputs, timing, retries). Supplements Langfuse tracing, not replaces it.
- R11. **Automatic retry on step failure.** If a tool call fails (network error, transient Supabase issue), the step retries automatically before marking the run as failed. Configurable retry count per step.

### Approval Flow

- R12. **Migrate approval flow to workflow pause/resume.** Replace the current (broken) DB-based `approval_events` flow with the workflow's native webhook/pause primitive. When the agent hits an approval-gated action, the workflow pauses at that exact step. When the user approves/denies, the workflow resumes from that step — no fresh function invocation, no context reload.

## Success Criteria

- A chat run can execute 30+ tool calls without hitting a timeout
- An autopilot run can research 5 contacts, update CRM records, and draft follow-ups in a single run
- A crashed run resumes from the last completed step (verified by killing a run mid-execution)
- Approval pause/resume works without a fresh function rebooting full context
- Frontend streaming works identically — user sees no difference in the chat UI
- No regression in existing tool behavior, CRM operations, or sandbox skills

## Scope Boundaries

- **Not changing the sandbox.** Vercel Sandbox, 5-minute timeout, lazy init, artifact sync — all unchanged. Sandbox durability (persistent VMs across steps) is a separate concern.
- **Not adding inter-agent communication.** Subagent orchestration stays as-is.
- **Not building a custom durable engine.** We use Vercel Workflow DevKit (or Trigger.dev/Inngest as fallback), not a hand-rolled checkpoint system.
- **Not changing the queue system.** `thread_queue_records` + `drain_thread_queue` stays. The workflow wraps the run, not the queue.

## Key Decisions

- **Incremental wrap, not full rearchitect.** Existing runner, tools, streaming, and frontend are preserved. Durability is added as an orchestration layer around them.
- **Vercel Workflow DevKit as primary choice.** Trigger.dev and Inngest are fallback alternatives if the beta isn't stable enough. All three provide the same durable-step pattern.
- **Approval flow migrated.** The current DB-based approval system is broken in practice. Rather than fixing it, migrate to the workflow's native pause/resume — a cleaner pattern that's a natural consequence of durability.
- **30-50 steps is the target.** Enough for autonomous CRM workflows, bounded enough for cost/safety control.

## Dependencies / Assumptions

- Vercel Workflow DevKit (beta) is stable enough for production use, or Trigger.dev/Inngest provides equivalent functionality
- Workflow DevKit's `DurableAgent` class is compatible with AI SDK v6's `streamText()` and tool-calling protocol
- Workflow's stream resumption is compatible with the `useChat()` frontend hook (or can be adapted with minimal frontend changes)
- Per-step serverless function invocations don't introduce meaningful latency overhead compared to the current single-function model

## Outstanding Questions

### Resolve Before Planning

All resolved. See reference implementation: [vercel/workflow-examples/flight-booking-app](https://github.com/vercel/workflow-examples/tree/main/flight-booking-app)

- ~~[Affects R1, R5] Can `DurableAgent` wrap AI SDK's `streamText()`?~~ **Yes.** `DurableAgent` from `@workflow/ai/agent` is a durable wrapper around `streamText`. Same tool shape (`{ description, inputSchema, execute }`), same model config. Tools just add `'use step'` inside execute.
- ~~[Affects R7, R5] Does stream resumption work with `useChat()`?~~ **Yes.** Via `WorkflowChatTransport` from `@workflow/ai`, passed as the `transport` option to `useChat()`. Reconnection uses `prepareReconnectToStreamRequest` to hit `GET /api/chat/[id]/stream?startIndex=N`. Response uses `createUIMessageStreamResponse` — same AI SDK helper.
- ~~[Affects R12] How does approval pause/resume surface to the frontend?~~ **Via `defineHook()` + API endpoint.** Define a hook with Zod schema, `await hook` pauses the workflow, frontend calls `POST /api/hooks/approval` with `hook.resume(token, data)`. No URL generation needed — goes through your own API routes. ~10 lines total.

### Deferred to Planning

- [Affects R2][Technical] What's the right step budget per run type (chat vs autopilot vs cron)? Needs cost modeling.
- [Affects R8, R9][Technical] How to migrate existing cron scanner + trigger executor to workflow-based scheduling. May be phased.
- [Affects R10][Technical] How Workflow DevKit's observability integrates alongside Langfuse — separate dashboards or unified.
- [Affects R11][Technical] Retry policy per tool type — CRM writes should be idempotent, sandbox commands may not be.
- [Affects R1][Needs research] Evaluate Trigger.dev and Inngest as alternatives if Workflow DevKit beta stability is insufficient.

## Reference Implementations (Ranked by Relevance)

| # | Repo | Pattern | Key Takeaway for Sunder |
|---|---|---|---|
| 1 | [`vercel-partner-solutions/slack-agent-template`](https://github.com/vercel-partner-solutions/slack-agent-template) | DurableAgent + real API tools + approval hooks + tenant-scoped `experimental_context` | **Production agent.** 21-line workflow. Tools use `"use step"` + dynamic imports. Approval via `defineHook()`. Closest architecture to Sunder. |
| 2 | [`vercel-labs/call-summary-agent-with-sandbox`](https://github.com/vercel-labs/call-summary-agent-with-sandbox) | Workflow + Vercel Sandbox + bash tool + ToolLoopAgent | **Workflow + Sandbox in one.** Background agent triggered by webhook. Agent uses bash in sandbox as durable steps. Closest to Sunder's autopilot/cron pattern. |
| 3 | [`vercel-labs/lead-agent`](https://github.com/vercel-labs/lead-agent) | Workflow + AI research agent + Slack approval pipeline | **Multi-step pipeline with conditional branching.** Research → qualify → write email → human approval. Closest to Sunder's CRM autopilot workflows. |

### Key Files to Read (in order)

1. `slack-agent-template/server/lib/ai/workflows/chat.ts` — 21-line durable workflow
2. `slack-agent-template/server/lib/ai/tools.ts` — real tools with `"use step"` + `experimental_context` + approval hooks
3. `call-summary-agent/workflows/gong-summary/index.ts` — webhook-triggered background workflow
4. `call-summary-agent/lib/agent.ts` — ToolLoopAgent + Sandbox + bash tool
5. `lead-agent/workflows/inbound/index.ts` — conditional pipeline with human approval

## Next Steps

→ All blocking questions resolved. Reference implementations confirmed. Ready for `/plan`.
