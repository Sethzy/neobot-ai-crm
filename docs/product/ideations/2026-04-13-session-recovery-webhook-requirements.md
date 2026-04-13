---
date: 2026-04-13
topic: session-recovery-webhook
---

# Session Recovery via Anthropic Webhook

## Problem Frame

When a built-in agent tool (bash, read, etc.) runs long enough to exceed the Vercel function timeout (300s), the SSE stream dies. The Anthropic session continues and eventually completes, but nobody is listening. The assistant message is never persisted, the run is stuck in "running," and the user sees a frozen chat with no recovery path.

This affects any turn where the agent's built-in tools take >5 minutes total — rare but real (e.g., xlsx generation with recalc.py, long browser automation sessions, multi-file code generation).

## Requirements

- R1. **Server-side recovery via webhook.** Register an Anthropic `session.status_idled` webhook. When it fires and the corresponding run is still in "running" status, fetch all events from Anthropic's events API, persist the assistant message, download session files, and mark the run complete. If the run is already complete (SSE handler finalized it), no-op.

- R2. **Idempotent persistence.** All webhook persistence operations must be safe to run concurrently with or after the SSE handler. The existing `source_event_id` upsert key on `conversation_messages` provides this. `completeRun` on an already-completed run must not corrupt data.

- R3. **Graceful browser transition.** When the SSE stream drops unexpectedly (no clean terminal event), the chat UI auto-transitions to a "Claude is still working on this" recovery state. No user action required. The indicator is subtle (not a full-page error).

- R4. **Live message delivery via Supabase Realtime.** While in the recovery state, the browser subscribes to Realtime changes on the thread's `conversation_messages`. When the webhook persists the assistant message, the subscription fires and the message renders immediately via static injection (same as auto-resume).

- R5. **30-minute client-side timeout.** If no message arrives within 30 minutes of entering recovery state, show a failure state: "Something went wrong. Try sending your message again." This covers the case where Anthropic's session itself fails to terminate.

- R6. **Navigate-away recovery.** If the user leaves the page during the gap and returns later, the existing `useAutoResume` hook handles it — it polls the DB and finds the webhook-persisted message. No new work needed for this case.

- R7. **Approval-pause awareness.** The webhook must not finalize runs that are in `requires_action` state (approval pause). Those are handled by the existing approval-resume path.

## Success Criteria

- A chat turn where a built-in tool hangs >5 minutes still results in a persisted assistant message and a completed run, without the user refreshing or resending.
- The user sees a brief "still working" indicator, then the message appears.
- Normal turns (95%+ of traffic) are completely unaffected — the webhook fires and no-ops.

## Scope Boundaries

- The SSE streaming path is not modified. This is additive.
- The session runner (`consumeAnthropicSession`) is not modified.
- No changes to the Anthropic agent configuration or session creation.
- No Vercel Workflow SDK adoption — this is a targeted webhook-based fix.
- The `interruptSession()` utility is not wired in as part of this work (could be a future enhancement to proactively kill hung tools before Vercel dies).

## Key Decisions

- **Webhook over polling/workflow:** Anthropic pushes to us when the session settles. No polling infra, no new dependencies. Matches the production pattern recommended in Anthropic's cookbooks.
- **Supabase Realtime over polling for browser notification:** Push all the way through. Anthropic pushes to server, server writes to DB, Realtime pushes to browser. Zero polling.
- **Static inject for recovered messages:** Same pattern as auto-resume. No fake streaming animation.
- **30-minute timeout:** Trust Anthropic's orchestration to resolve sessions. Only show failure after 30 minutes of nothing.
- **session_id backfill on runs table:** The chat adapter must write `session_id` to the run record after session creation so the webhook can look up orphaned runs by Anthropic session ID.

## Dependencies / Assumptions

- Anthropic Console webhook registration is a manual one-time setup step (URL + `whsec_` secret).
- The `session.status_idled` webhook event includes the `session_id` and `stop_reason.type` in its payload. (Confirmed in Anthropic cookbooks and docs.)
- `createAdminClient()` (service-role Supabase) is available for the webhook handler since there is no user session context.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Needs research] Exact webhook payload shape for `session.status_idled` — confirm field names by inspecting the Standard Webhooks spec or testing with a real webhook delivery.
- [Affects R3][Technical] Best hook into useChat's error/disconnect state — need to check if `onError` fires reliably when the SSE stream breaks vs. when the API returns an error response.
- [Affects R4][Technical] Supabase Realtime subscription setup — confirm whether we subscribe to inserts on `conversation_messages` filtered by `thread_id`, and how to clean up the subscription.

## Next Steps

-> `/plan` for structured implementation planning
