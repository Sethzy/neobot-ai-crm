---
date: 2026-04-20
topic: blocking-create-connection
---

# Blocking `create_connection` for Same-Run Confirmation

## Problem Frame

Today, when the user asks Sunder to connect a provider, the agent calls `create_connection`, the tool returns immediately with a pending card, and the agent ends its turn. After the user completes OAuth, the connection card flips to "Connected" via realtime — but the agent is silent until the user types a new message. The reference UX we want (Tasklet v2, shown in `tasklet tools/built-in/v2/25-create_new_connections.md`) is a single run where the agent's confirmation ("Your Notion is connected — what would you like to do?") streams in right after OAuth succeeds, with no user prod needed.

This ideation picks an approach that matches Tasklet v2's single-run behavior without adopting their full async-background architecture.

## Requirements

- R1. `create_connection` blocks until one of three resolutions:
  - the user completes OAuth and the connection's row flips to `active`,
  - OAuth explicitly fails and the row flips to `error`,
  - ~120 seconds elapse with no terminal status (timeout).
- R2. The connect card renders as soon as `create_connection` starts. The user must be able to see the card, read what's being connected, and click Connect while the tool is still "running" — they should never wait for a spinner before the card appears.
- R3. On `active` resolution, the agent continues in the same run and emits one short confirmation message naming the provider. No jargon (`OAuth`, `auth card`, `authorize`).
- R4. On `error` or timeout resolution, the agent acknowledges gracefully and ends the turn. User can retry by asking again, or continue on the next message.
- R5. If the user closes the tab mid-OAuth, the run dies, OAuth still completes in the background, the DB row still lands as `active`, and on return the card reflects Connected and the next user message continues normally. No broken or stranded state.
- R6. The tool result shape carries enough information for the agent to distinguish the three resolutions (success / failure / timeout) so the system skill can teach the right follow-up behavior per case.

## Success Criteria

- After a successful OAuth, a confirmation message streams into the thread within ~2 seconds of the DB row flipping, with no user action in between.
- The connect card is visible and interactive within ~500ms of the tool call starting.
- Closing the tab during OAuth does not leave the user with a broken view on return — the card shows Connected, and a fresh message from the user resumes work without re-authorization.
- Agent replies never contain `OAuth`, `auth card`, `authorize`, or similar jargon (inherits R14 from the launch KISS requirements doc).

## Scope Boundaries

- **Not moving to async/background runtime.** We stay on the synchronous SSE model in `/api/chat`. GTM's tab-independent pattern is deferred.
- **Not making provider tools mid-run available.** The agent still cannot call Notion/Gmail/etc. tools in the same run that connected them. Only the *confirmation message* streams in the same run. R6 of the launch KISS doc (next-message tool availability) is preserved.
- **Not changing reauthorization in this scope.** The same blocking pattern could apply later to `reauthorize_connection`; out of scope here.
- **Not supporting multi-account per provider.** R11 of the launch KISS doc still holds.
- **Not touching the Composio execution wrappers** (`list_composio_tools`, `execute_composio_tool`).
- **No catalog discovery fallback.** Unsupported providers still return a clean "not supported" error from Phase 1c of the launch KISS plan.

## Key Decisions

- **Single blocking tool, mirroring Tasklet v2.** Not a two-tool split (`create_connection` + `wait_for_connection`). The Tasklet tool definition at `roadmap docs/.../tasklet/tasklet tools/built-in/v2/25-create_new_connections.md` returns `userAction: created | skipped` — one call, one round-trip. We use the same shape, translated to our three states (`active | error | timeout`).
- **UI hydrates the card from the pending `connections` row, not from the tool result.** The tool inserts the pending row up front (as it does today), the UI subscribes to rows for the current `clientId` with `status = 'pending'`, and renders the card as soon as the row appears. This makes the card visible while the tool blocks, without requiring the tool to partial-emit (which Anthropic custom tools do not support).
- **Timeout at 120 seconds.** Safely under Vercel's `maxDuration = 300` for `/api/chat`, and long enough that normal OAuth flows (30–60s) complete well inside the window with headroom.
- **Tool result shape follows Tasklet's single-field discriminator pattern.** Something like `{ status: "active" | "error" | "timeout", connectionId, displayName, accountIdentifier? }` so the system skill can branch cleanly.
- **No new blocking primitive for reauth, ever, until this pattern is proven.** Ship it for initial connect only.

## Dependencies / Assumptions

- The `connections` table has RLS permitting the current user to subscribe to their own `pending`/`active` rows. Already true today; the card uses this subscription.
- Anthropic managed-agent custom tools return exactly once. No partial emission, no streaming tool output. (Why we need the DB-hydrated card pattern.)
- Supabase Realtime delivers row-change events to a subscribed client within ~1–2 seconds in steady state.
- Vercel Node runtime holds the `/api/chat` function open through the blocking tool wait. Serverless concurrency budget is sufficient for one long-running connection wait per active chat session.
- OAuth callback at `/api/connections/callback` already writes the terminal status to the `connections` row on success, and (per Phase 3a of the launch KISS plan) preserves rows on reauth failure. Behavior on initial-connect failure: the pending row is marked `error` rather than deleted. If current code deletes, that becomes an incidental fix in planning — called out below.

## Outstanding Questions

### Resolve Before Planning

*(none — all product decisions are in R1–R6 and Key Decisions)*

### Deferred to Planning

- [Affects R1][Technical] Does the blocking handler wait via a Supabase Realtime subscription inside the Vercel function, or via short polling (e.g., `SELECT status` every 1–2s)? Realtime is lower-latency but requires validating that the Supabase client holds a working realtime socket inside a serverless function for the full 120s window. If it doesn't, polling is the fallback.
- [Affects R2][Technical] Does the UI need a new `pending connections` query/subscription, or can it reuse an existing hook? The current auth-card render is keyed off tool-result data, not a standalone DB subscription — planning needs to decide whether to add a dedicated `useUserPendingConnections()` hook or extend what's there.
- [Affects R4][Technical] On initial-connect failure (not reauth), does the OAuth callback currently delete the pending row or mark it `error`? If it deletes, we need to change that as part of this work so the blocking tool can observe the `error` status. Check `app/api/connections/callback/route.ts`.
- [Affects R5][Needs research] Can the Supabase realtime subscription on the card gracefully handle the card component re-mounting after a tab reopen mid-OAuth and correctly reflect the post-OAuth row state? Validate that reconnecting mid-subscription doesn't drop the final status transition.
- [Affects R3][Technical] System skill copy for the success / error / timeout branches — worked out during planning alongside the new tool result shape.

## Next Steps

→ `/plan` for structured implementation planning
