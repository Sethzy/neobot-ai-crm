---
title: "feat: Blocking create_connection for same-run confirmation"
type: feat
status: active
date: 2026-04-20
origin: docs/product/ideations/2026-04-20-blocking-create-connection-requirements.md
---

# feat: Blocking `create_connection` for Same-Run Confirmation

## Overview

Make `create_connection` block inside its handler until the user completes OAuth (row flips to `active`), OAuth fails (row flips to `error`), or ~120 seconds elapse (timeout). The agent loop stays open through that wait, so after a successful OAuth the agent continues in the same run and streams a short confirmation message into the thread — matching Tasklet v2's single-run UX. The connect card itself must appear *before* the tool returns, which requires a small UI change to hydrate the card from the pending `connections` row rather than from the tool result.

This is the "middle change" chosen during ideation. It inherits the KISS connection-management launch shape from the previous plan (connect/list/reauth/disconnect) and does not touch the execution surface. (See origin: `docs/product/ideations/2026-04-20-blocking-create-connection-requirements.md`.)

## Problem Statement / Motivation

Today, `create_connection` returns immediately with a pending card, the agent emits one short sentence, and the turn ends. When the user finishes OAuth, the card flips to "Connected" via realtime but the agent is silent until the user types. The reference UX — Tasklet v2, `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/25-create_new_connections.md` — is a single run where the tool blocks until the user clicks Connect or Skip (it returns `userAction: "created" | "skipped"`). The agent's confirmation message falls out naturally in the next reasoning step, in the same run.

The gap between our behavior and the reference is the turn boundary. Users perceive our flow as "the agent stopped talking mid-setup," which they read as the agent losing context. Closing that gap without moving to a full async/background runtime (GTM's pattern) is the goal.

## Proposed Solution

### Product Direction

Single blocking tool, Tasklet-style. One `create_connection` call, one round-trip. The return discriminates three resolutions:

- `active` — user completed OAuth; agent follows up with a brief confirmation and asks what's next.
- `error` — OAuth failed or Composio returned a non-active status; agent acknowledges and ends the turn.
- `timeout` — 120 seconds passed with no terminal status; agent tells the user they can finish signing in and send their next message when ready.

### Technical Strategy

Four moving pieces:

1. **Tool handler blocks on the `connections` row.** After inserting the pending row and kicking off the OAuth flow (current behavior), the handler waits for a terminal status on that row, with a 120-second timeout. Poll every ~1 second in a simple `while` loop or use a Supabase realtime subscription inside the Node runtime — choose during implementation based on a short spike (see Deferred Questions in origin).
2. **UI hydrates the card from the pending row, not the tool result.** A new render branch triggers when `create_connection` is in `input-available` / `input-streaming` state. The component looks up pending `connections` rows matching the input's toolkit slugs and renders the connect card with a Connect button. The button opens the stored redirect URL.
3. **Redirect URL stored on the row.** Since the UI needs the redirect URL before the tool returns, add a nullable `pending_redirect_url TEXT` column to `connections`. Written when the tool inserts the pending row. Cleared when the row flips to `active` or `error`.
4. **OAuth callback preserves failed rows.** Today the callback *deletes* pending rows on initial-connect failure (`app/api/connections/callback/route.ts:119, 141`). With a blocking tool watching for `status = 'error'`, deletion becomes a hang until timeout. Change those branches to mark `status = 'error'` instead — aligns with the Phase 3a durability fix from the KISS launch plan for reauth, applied to initial connect too.

The tool result shape:

```ts
// Successful connection(s)
{
  success: true,
  message: string,  // guidance to the agent (keep terse, end-turn-friendly for error/timeout)
  results: Array<
    | { integrationId, displayName, status: "active", connectionId, accountIdentifier?: string }
    | { integrationId, displayName, status: "error", connectionId, error: string }
    | { integrationId, displayName, status: "timeout", connectionId }
    | { integrationId, displayName, status: "rejected", error: string }  // pre-OAuth rejections (unsupported/duplicate/infra)
  >
}
```

`rejected` covers the cases that already short-circuit before any pending row exists (unsupported provider, already-connected provider, Composio error). `active`/`error`/`timeout` all imply a pending row was created and then resolved.

### Reference: Tasklet v2's shape (for inspiration, not literal copy)

Tasklet v2's `create_new_connections` returns:

```json
{ "userAction": "created" | "skipped", "connectionId": "...", "tools": { ... } }
```

A single-field discriminator that the agent branches on. Our `status` field plays the same role but carries our three real states (`active` / `error` / `timeout`) plus a `rejected` bucket for pre-OAuth failures — Tasklet's `skipped` state doesn't have a direct analog because we don't expose a Skip button in v1. (See reference: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/25-create_new_connections.md`.)

## Technical Considerations

- **The Vercel Node runtime already supports the hold.** `app/api/chat/route.ts:23` sets `maxDuration = 300`. A 120-second tool block is well inside the budget even with the agent's reasoning time on either side.
- **Supabase realtime inside a serverless function is unverified at this duration.** Run a spike before committing to realtime. If the subscription drops or misses the first row-change event, fall back to polling. Polling at 1-second intervals is 120 DB reads worst-case per blocked connection — negligible.
- **The OAuth callback deletion bug must be fixed first or in parallel.** With the blocking tool in place, a deletion at the callback layer would leave the tool polling a non-existent row until timeout. Treat this as a hard prerequisite — either land the callback fix first as its own PR, or ship both together and make sure the tool tolerates a missing row by treating `null` as terminal error.
- **The UI card must render from tool-input state.** Today, `isConnectionCreation()` in `src/components/chat/tool-call-inline.tsx:111-122` only returns true when `output` is defined. That check runs in `output-available`. For this plan, a parallel check runs in `input-streaming` / `input-available` and drives a placeholder card that looks the same as the resolved card but reads the redirect URL and row status from the DB. The existing realtime subscription in `ConnectionRow` (`tool-call-inline.tsx:206-264`) is the right shape — extend it to also subscribe before the tool returns.
- **Reauth stays non-blocking in this scope.** Reauthorization has its own card today and a different callback path. Applying the same blocking pattern there is a worthwhile follow-up but is explicitly out of scope (see origin: Scope Boundaries).
- **Timeout semantics for the agent.** The system skill must teach the agent that `timeout` is *not* a failure — it means the user hasn't finished yet. The right assistant reply is friendly and open: "No rush — send me a message when you're done and we'll continue."
- **Migration cost is one nullable column.** `pending_redirect_url TEXT` on `connections`. Trivial RLS implication: existing row-level policies already scope by `client_id`, so the new column inherits correct access.

## System-Wide Impact

- **Interaction graph:** user message → tool call `create_connection` → pending row insert + `pending_redirect_url` write → UI reads pending row via realtime, renders card → user clicks Connect → OAuth popup → `/api/connections/callback` → row flipped to `active`/`error` → blocking handler observes terminal status → tool returns `status: active|error|timeout` → agent emits confirmation → turn ends.
- **Error propagation:** (1) Composio `initiateOAuthFlow` throw → pre-OAuth `rejected` result, no pending row. (2) OAuth fail on callback → row flipped to `error` → handler returns `status: error`. (3) Handler timeout at 120s → tool returns `status: timeout`, row left as `pending` for the user to finish (the callback will still flip it to active when OAuth completes). (4) Tool handler crash → dispatcher returns error tool result, UI shows error card.
- **State lifecycle risks:** A timeout followed by OAuth completion leaves the row `active` but the *agent* thinks `timeout` (it already returned). That's OK — the user's next message starts a new run where `list_connections` will correctly show `active`. The pending `pending_redirect_url` column must be cleared on any terminal transition (`active` or `error`) to avoid stale URLs lingering. A never-resolved pending row (user abandons OAuth and the callback never fires) is garbage; a background cleanup job is out of scope, but the row remains invisible to product features that filter on `status = 'active'`.
- **API surface parity:** Chat is the only surface today. Settings is deferred (per prior KISS plan). No other interface needs an equivalent change. The Composio webhook path (`/api/connections/callback/route.ts`) is the only other writer to the `status` column and is updated as part of this plan.
- **Integration test scenarios (unit tests with mocks will not catch these):**
  1. Tool call starts → pending row appears in DB with redirect URL → UI subscribes and renders card → user clicks → callback flips `active` → tool returns within ~2s → agent streams confirmation.
  2. Tool call starts → OAuth callback fires with failure status → row flipped to `error` → tool returns within ~2s → agent acknowledges.
  3. Tool call starts → user closes tab before OAuth → serverless function keeps running → OAuth still completes → row lands `active` → tool return is delivered to a dead SSE connection (agent reasoning discarded). On next chat open, card is `Connected`, new user message works normally.
  4. Tool call starts → user takes too long → 120s elapses → tool returns `timeout` → agent says "no rush" → user finishes OAuth off-screen → next message succeeds normally because `list_connections` shows `active`.
  5. Unsupported provider slug → tool returns `rejected` without ever inserting a row → agent acknowledges with the "not supported in v1" copy.

## Implementation Phases

### Phase 1: Schema and Callback Durability Prerequisites

**Goal:** The DB shape and callback behavior support the blocking tool.

- 1a. Add a migration: `ALTER TABLE connections ADD COLUMN pending_redirect_url TEXT;`. Nullable, no default, no constraint. RLS inherits from the table.
- 1b. Regenerate Supabase types (per repo convention). Update `src/lib/connections/queries.ts` types where they reference the row shape.
- 1c. Fix `app/api/connections/callback/route.ts` so pending rows are marked `status = 'error'` on failed callback outcomes instead of deleted. Specifically: the branches at lines 119 and 141 that currently call `deleteConnection` for pending rows must switch to an `updateConnection` call with `status: 'error'`. Preserve the successful-callback path untouched.
- 1d. In the same callback patch, clear `pending_redirect_url` on every terminal transition (`active` or `error`).

### Phase 2: Blocking Tool Handler

**Goal:** `create_connection` blocks until the DB row reaches a terminal status, times out, or fails pre-OAuth.

- 2a. Update `src/lib/managed-agents/tools/browser-side/create-connection.ts`:
  - On successful OAuth initiation, include `pending_redirect_url: redirectUrl` in the pending row insert.
  - After the insert, begin the wait loop: poll the `connections` row by `id` every ~1s, looking for `status ∈ {'active', 'error'}`. Abort at 120s. Wrap the loop in a helper so it's testable. Prefer a clean polling implementation; move to realtime only if a spike shows reliable behavior in the Vercel Node runtime (see origin: Deferred Questions).
  - Translate the terminal row into the new per-integration result shape: `active` → `{ status: "active", connectionId, displayName, accountIdentifier }`, `error` → `{ status: "error", connectionId, displayName, error: <row error or generic> }`, timeout → `{ status: "timeout", connectionId, displayName }`.
  - Keep pre-OAuth failures as `{ status: "rejected", ... }` — unsupported provider, duplicate-provider guard, Composio init failure, insert failure.
- 2b. Rewrite the tool `description` and the top-level `message` field to stop instructing the agent to end its turn after the tool returns. Replace with branch guidance by status. Keep the no-jargon copy rule from the KISS launch plan (never say `auth card`, `OAuth`, `authorize`).
- 2c. Update `src/lib/managed-agents/tools/browser-side/__tests__/create-connection.test.ts`:
  - Rewrite existing tests to assert the new shape (`status: 'active' | 'rejected'` in the happy path and rejection paths).
  - Add tests for `error` resolution (row flips to error mid-wait) and `timeout` (row stays pending beyond timeout).
  - Mock time with `vi.useFakeTimers()` for the timeout case.
  - Make sure the mock-supabase helper can simulate a mid-test row update (may require a small extension of `createMockSupabase` or a targeted fake).

### Phase 3: UI Card from Pending Row

**Goal:** The connect card renders as soon as the tool call starts — before the tool returns.

- 3a. In `src/components/chat/tool-call-inline.tsx`, add a new branch that fires in `input-streaming` / `input-available` state when `name === 'create_connection'`. This branch reads the input's `integrations` array and renders a placeholder `ConnectionCard`. Each row shows the display name (via `getSupportedProviderDisplayName`) and a "Looking up sign-in link…" state while it queries the pending `connections` row.
- 3b. Extract / extend the realtime subscription in `ConnectionRow` to accept a discovery key — instead of `composio_connected_account_id` (unknown before the tool returns), key on `(clientId, toolkit_slug, status = 'pending')`. Once the pending row appears, latch onto its `id` and switch to subscribing by `id`. Reads `pending_redirect_url` for the Connect button.
- 3c. Keep the existing post-return branch working for backwards compatibility with old thread renders (historical tool-result payloads still include `redirectUrl` on the result). Planning note: this may require a small refactor so the row can be rendered in either "pending-row" or "tool-result" mode.
- 3d. Update `src/components/chat/tool-call-inline.test.tsx`:
  - Add a test for input-available rendering: card appears with "Looking up sign-in link…" placeholder when the tool is running but no output is present.
  - Add a test for the placeholder transitioning to the full card once the mocked pending-row query resolves.
  - Keep existing post-return tests working against the same card component.

### Phase 4: System Skill Branches

**Goal:** The agent knows how to react to each of `active` / `error` / `timeout` without calling anything else.

- 4a. Update `src/lib/runner/system-skills.ts` `creating-connections/SKILL.md`:
  - Replace the "call create_connection, end your turn" flow with "call create_connection — the tool blocks until the user signs in or 120 seconds pass."
  - Add three branches:
    - **active**: one short sentence confirming the provider is connected and asking what's next. End the turn.
    - **error**: one short sentence acknowledging that sign-in didn't finish and offering to try again. End the turn.
    - **timeout**: one short, patient sentence saying they can take their time and reply when they're done. End the turn.
  - Keep the no-jargon rule from the launch plan.
- 4b. Add/update a test (or extend `src/lib/runner/__tests__/system-skills.test.ts` if it exists) asserting the three branches are present in the skill content and the old "end your turn after" phrasing is gone.

### Phase 5: Verification and Rollout

**Goal:** Validate end-to-end, deploy the new agent version, document what's deferred.

- 5a. End-to-end browser walk-through:
  - Connect Notion; observe the card appears immediately; complete OAuth; observe the confirmation message streams in without a user action.
  - Trigger a failure (close the OAuth tab without completing → Composio posts the failure); observe the agent's error branch fires.
  - Let the timer run past 120s without action; observe the timeout branch.
  - Close the tab mid-OAuth; finish OAuth; reopen the thread; observe Connected state and that a new user message continues normally.
- 5b. Bump `ANTHROPIC_AGENT_VERSION` and redeploy the managed-agent version via `scripts/managed-agents/create-agent.ts`. The tool input and description changed — new agents must see the new version.
- 5c. Note deferred follow-ups explicitly:
  - Apply the same blocking pattern to `reauthorize_connection`.
  - Background cleanup for stuck pending rows (user abandons OAuth completely, callback never fires).
  - Move to GTM-style async background runtime if tab-close resilience becomes a priority.

## Acceptance Criteria

- [ ] `create_connection` blocks inside its handler until the tracked `connections` row flips to `active` / `error`, or 120 seconds elapse. (R1)
- [ ] The connect card renders from `input-available` state and is interactive (redirect URL known) within ~500ms of the tool call starting. (R2)
- [ ] On `status: "active"`, the agent emits a brief confirmation message in the same run with no user action in between. Copy avoids `OAuth` / `auth card` / `authorize`. (R3, R6 from origin)
- [ ] On `status: "error"` or `status: "timeout"`, the agent acknowledges the state appropriately and ends the turn; user can continue on the next message. (R4)
- [ ] Closing the tab during OAuth does not leave broken state: OAuth still completes, the row lands `active`, the connect card on reopen reflects Connected, and the next user message proceeds normally. (R5)
- [ ] The tool result shape carries a single `status` discriminator with values `active` / `error` / `timeout` / `rejected` per integration. (R6)
- [ ] OAuth callback preserves failed pending rows by marking them `status = 'error'` instead of deleting. (Phase 1c, derived from blocking-tool precondition)
- [ ] System skill covers all three resolved states with branch-specific copy guidance.
- [ ] `pending_redirect_url` is cleared on every terminal transition.
- [ ] Existing launch-KISS acceptance criteria from `docs/product/plans/2026-04-19-001-feat-kiss-connection-management-plan.md` still hold (no regressions in supported-provider allowlist, duplicate-provider rejection, or the four-action management surface).

## Success Metrics

- Time-to-confirmation after OAuth success: **p95 < 2s** from row flip to agent message streaming.
- Connect-card first-paint: **p95 < 500ms** from tool call start.
- Zero regressions in the KISS launch acceptance criteria.
- Tab-close-during-OAuth path: **zero stranded** rows across a week of dogfooding (all pending rows either flip to `active`/`error` or remain discoverable for manual cleanup).

## Dependencies & Risks

- **Supabase realtime behavior inside Vercel Node runtime is unverified for this duration.** If the spike fails, polling is the fallback. The choice is deferred to implementation; both paths satisfy the product requirements.
- **The callback-deletion fix is a hard prerequisite.** If Phase 1c does not ship alongside Phase 2, the blocking tool will mis-behave (hang until timeout on failed OAuth).
- **New `pending_redirect_url` column adds minor compatibility surface.** Existing callers of `list_connections` already ignore unknown columns; type regeneration must be run before deploy.
- **Dispatcher timeout assumptions.** The runner assumes tool handlers return. If Anthropic's managed-agent SSE has an internal timeout shorter than 120s on custom-tool-use events, realign: either shrink the timeout or stream keepalive events from the handler. To be validated early in Phase 2.
- **Reauth stays non-blocking.** Users who hit reauth will not see the new same-run confirmation until the follow-up work ships. Accept for now.
- **Visible thread-open race.** If the user reopens the thread *after* OAuth but *before* the blocking tool returns (e.g., very fast reconnect), the card may briefly show "Connecting…" before flipping to "Connected." Acceptable — the existing realtime path handles this correctly.

## Key Decisions (Carried from Origin)

- **Single blocking tool, not a two-tool split.** Matches Tasklet v2 directly; one call, one round-trip. (See origin: Key Decisions)
- **UI hydrates card from the pending row, not from the tool result.** The Anthropic custom-tool protocol has no partial emission, so the card must be driven by DB state to appear before the tool returns. (See origin: Key Decisions)
- **Timeout = 120s.** Safely under `maxDuration = 300`; long enough for typical 30–60s OAuth flows with headroom. (See origin: Key Decisions)
- **Status discriminator on the tool result.** `active | error | timeout | rejected`. Derived from Tasklet's `userAction` pattern, adjusted for our states. (See origin: Key Decisions)
- **Reauth stays non-blocking in this scope.** Out of scope; revisit later. (See origin: Scope Boundaries)
- **No catalog discovery fallback.** Unsupported providers still reject cleanly, same as the KISS launch plan. (See origin: Scope Boundaries)
- **Approval still lives on the call, not on connection setup.** No change from the KISS launch plan. (Implicit in origin; confirmed here.)

## Deferred Questions Carried from Origin

- Realtime vs polling inside the tool handler — pick during implementation based on a short spike.
- Where exactly in the UI component hierarchy the new pending-row subscription lives — pending-card branch in `tool-call-inline.tsx` vs a dedicated hook.
- Exact status semantics to preserve if the callback now marks `error` instead of deleting — checked against existing tests during Phase 1.
- Mid-subscription reconnect behavior when the card component re-mounts after a tab reopen — tested in the dogfooding pass in Phase 5a.
- Concrete copy for the three branches — finalized in Phase 4 alongside the shape.

## Sources & References

### Origin

- **Origin document:** `docs/product/ideations/2026-04-20-blocking-create-connection-requirements.md` — Key decisions carried forward: single blocking tool (Tasklet v2 shape), UI hydrates from pending row, 120s timeout, status discriminator with three resolutions.

### Internal References

- Prior plan this builds on: `docs/product/plans/2026-04-19-001-feat-kiss-connection-management-plan.md` (already shipped).
- Current `create_connection` tool: `src/lib/managed-agents/tools/browser-side/create-connection.ts` (to modify in Phase 2).
- Current card render + realtime subscription: `src/components/chat/tool-call-inline.tsx:111-328` (to extend in Phase 3; `ConnectionRow:206-264` realtime subscription is the pattern to reuse).
- OAuth callback: `app/api/connections/callback/route.ts:108-142` (delete-on-pending-failure branches; fix in Phase 1c).
- System skill: `src/lib/runner/system-skills.ts` `creating-connections/SKILL.md` (branches updated in Phase 4).
- Supported providers allowlist: `src/lib/managed-agents/tools/supported-providers.ts` (unchanged).
- Chat runtime: `app/api/chat/route.ts:22-23` (`runtime = 'nodejs'`, `maxDuration = 300`).

### Reference for Inspiration

- Tasklet v2 tool definition: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/25-create_new_connections.md` — source of the blocking-tool pattern and single-field discriminator shape.
- Tasklet execution trace: `roadmap docs/Sunder - Source of Truth/references/tasklet/complex-multi-integration-workflow/00-source-complex-workflow-verbatim.md:137-153` — shows the `userAction: "created" | "skipped"` round-trip in a real run.
- Tasklet system prompt v2: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/system-prompt-wholesale/01-v2-system-prompt-verbatim.md` — for tone/copy alignment on confirmation messages.
