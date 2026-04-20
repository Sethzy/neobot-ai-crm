---
title: "feat: Simplify connection management for launch"
type: feat
status: active
date: 2026-04-19
origin: docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md
---

# feat: Simplify Connection Management for Launch

## Overview

Implement the launch connection model defined in the origin requirements doc: a Goose-like `connect -> authorize -> use` flow with an inline auth card, next-message availability, and a drastically smaller connection-management surface. This is a launch simplification on top of the current Composio-backed implementation, not a native MCP migration. (See origin: `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`)

## Problem Statement / Motivation

The current managed-agent connection surface is still shaped by the older PR26 connection architecture: integration discovery, capability inspection, tool activation, and connection-scoped instruction plumbing. In the current codebase that complexity is not only high-friction, it is also partially mismatched with runtime behavior:

- The managed agent currently publishes a large connection-related surface in `src/lib/managed-agents/tools/declarations.ts`, including `search_integrations`, `get_integration_capabilities`, `get_connection_details`, `manage_activated_tools_for_connections`, `list_composio_tools`, and `execute_composio_tool`.
- The auth card copy in `src/components/chat/tool-call-inline.tsx` still tells the user "The agent only gets access after you approve the tools it should use," which conflicts with the intended launch model.
- The system skill in `src/lib/runner/system-skills.ts` still references stale tool names (`search_for_integrations`, `get_integrations_capabilities`) and an activation-heavy workflow.
- The per-turn reminder in `src/lib/runner/system-reminder.ts` still injects active connection details and activated-tool counts into every run.
- The execution wrapper path already does not truly enforce activation: `src/lib/managed-agents/tools/connections/execute-composio-tool.ts` only checks for an active connection, not `activated_tools`.

For launch, the desired behavior is simpler and more honest: if a provider is connected, it is usable. The product should feel like setup, not infrastructure management. (See origin: `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`)

## Proposed Solution

### Product Direction

Adopt the launch model from the origin doc:

- The user asks to connect a supported provider directly.
- The agent shows an inline auth card.
- The user completes OAuth.
- The thread shows a lightweight connected event.
- The provider is usable on the next message.

### Technical Strategy

Do this by collapsing the **management** surface while keeping the current Composio-backed **execution** path temporarily intact:

1. Reduce connection management to four primary actions:
   - connect a provider
   - list current connections
   - reauthorize a provider
   - disconnect a provider
2. Remove discovery and activation-era management tools from the published managed-agent surface for new agent versions.
3. Preserve the current execution wrappers (`list_composio_tools`, `execute_composio_tool`) as a temporary compatibility layer so launch is not blocked on native MCP or first-class provider tool publication.
4. Remove product copy, prompt instructions, and per-turn context that imply a second activation step.
5. Treat `activated_tools` as a compatibility artifact rather than a user-facing lifecycle concept.

This matches the origin decisions:

- product workflow over LLM workflow
- inline auth card as the core primitive
- next-message availability over same-run injection
- no separate activation layer in v1
- one connection per provider in v1
- no per-turn connection-context injection for ordinary use

(See origin: `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`)

## Technical Considerations

- **Backend path stays Composio for launch.** This plan deliberately does not implement `docs/tasks/2026-04-13-native-mcp-connections-tasklist.md`. Native MCP remains a follow-up.
- **Execution surface is temporarily separate from management surface.** The plan simplifies connection management first. It does not attempt to solve the long-term "generic execution wrapper vs. real provider schemas" decision in the same PR.
- **Reauthorization must become boring and durable.** Earlier review documented that failed reauth callbacks can delete valid rows. In the launch model, failed reauth should leave the connection visible as needing reauth or error, not disappear.
- **One connection per provider remains the launch constraint.** The existing schema and UX already lean this way. Reconnecting a provider should not silently create account-routing ambiguity.
- **The auth card component is worth reusing.** The current card already has a realtime status subscription keyed by `composio_connected_account_id`; the plan should reuse that behavior, not replace it with a second widget system.
- **Prompt and reminder cleanup matter as much as tool cleanup.** If the model is still told to search, inspect, and activate tools, reducing the tool surface alone will not produce the intended UX.

## System-Wide Impact

- **Interaction graph:** user message -> connection tool call -> inline auth card -> OAuth callback route -> `connections` row update -> realtime card update -> provider usable on next message.
- **Error propagation:** OAuth failures and reauth failures must land as visible connection states (`error` / `needs reauth`) instead of deleting or orphaning rows.
- **State lifecycle risks:** pending and active rows already drive the chat card status via realtime. Reauth must preserve that lifecycle rather than creating a separate approval or activation state machine.
- **API surface parity:** chat and settings should share the same core connection semantics even if chat is the primary launch surface.
- **Integration test scenarios:** connect success, connect failure, reauth failure, reconnect-while-already-connected, disconnect, and provider use on the next message without any activation step.

## Implementation Phases

### Phase 1: Collapse the Published Connection-Management Surface

**Goal:** New managed-agent versions expose a KISS connection-management surface instead of the old discovery/activation workflow.

#### 1a. Publish only the primary management tools

Update `src/lib/managed-agents/tools/declarations.ts` so the connection-management surface for new agent versions is limited to:

- `create_connection` as the connect-provider action for v1
- `list_connections`
- `reauthorize_connection`
- `delete_connection`

Remove these activation/discovery-era tools from the published managed-agent declaration list:

- `search_integrations`
- `get_integration_capabilities`
- `get_connection_details`
- `manage_activated_tools_for_connections`

#### 1b. Keep the temporary execution compatibility layer

Keep these two tools for launch:

- `list_composio_tools`
- `execute_composio_tool`

Rationale: removing them would force a broader runtime redesign or native MCP cutover. They are not part of the v1 connection-management lifecycle and should be treated as temporary execution plumbing.

#### 1c. Simplify the connect tool contract

Update `src/lib/managed-agents/tools/browser-side/create-connection.ts` so it no longer teaches or relies on activation semantics:

- `toolsToActivate` should become a backward-compatible ignored field or be removed from the schema for new agent versions.
- The description should stop promising post-connect activation state and instead describe one-step provider connection.
- The tool description should list the supported providers (launch set: Gmail, Google Calendar, Google Drive, Notion) so the model doesn't hallucinate slugs. Unknown slugs return a clear "not supported" error.
- The description should tell the agent that after calling this tool, the user completes OAuth in the card and the provider is usable on their next message — so the agent should end the turn rather than attempting same-run use.
- If a row already exists for that provider, return a plain "already connected" error. Reconnects go through reauthorize; account switching goes through disconnect-then-connect.

#### 1d. Simplify list and delete semantics

Update:

- `src/lib/managed-agents/tools/connections/list-connections.ts`
- `src/lib/managed-agents/tools/connections/delete-connection.ts`
- `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`

Changes:

- `list_connections` should return provider/account/status data without activated-tool counts as a primary concept.
- `delete_connection` should be framed as "disconnect/remove provider" rather than "remove tools vs delete connection" branching.
- `reauthorize_connection` should reflect the same core lifecycle as initial connect.

### Phase 2: Align the Auth Card and Connection Lifecycle UI

**Goal:** The chat UI should visually match the launch behavior from the origin doc.

#### 2a. Rewrite the card copy and state model

Update `src/components/chat/tool-call-inline.tsx`:

- Remove copy that implies a second tool-permission step.
- Keep the inline auth card as the primary UX primitive.
- Standardize card states around the origin requirements:
  - ready to connect
  - connecting / awaiting login
  - connected
  - failed
  - needs reauthorization

#### 2b. Preserve realtime status updates

Keep the current realtime subscription pattern so the card updates when the OAuth callback writes back to the `connections` row.

#### 2c. Success is the card's terminal state — no separate thread event

OAuth success is shown by the card's final `connected` state. No separate thread message. One surface for connection status.

#### 2d. Reuse the same visual pattern for reauthorization

Reauth should not introduce a separate permission-management UI. It should reuse the same card semantics as initial connect, with different copy for expired credentials.

#### 2e. Update UI tests

Update `src/components/chat/tool-call-inline.test.tsx` to cover:

- connect card copy
- connect state transitions
- reauth state copy
- absence of permission-card flows for connection setup

### Phase 3: Make Connection State Durable and Simple

**Goal:** The stored `connections` lifecycle should support the simplified UX without hidden destructive edge cases.

#### 3a. Preserve rows on reauth failure

Follow the earlier review finding around failed reauthorization callbacks. The launch lifecycle requires that failed reauth does **not** delete or permanently strand the connection row. The row should remain visible with a recoverable state such as `error` or `needs reauth`.

Relevant files:

- `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`
- `app/api/connections/callback/route.ts`

#### 3b. Demote `activated_tools` to compatibility-only state

Do not use `activated_tools` as a user-facing lifecycle concept in v1:

- no activation UI
- no activation prompt instructions
- no reminder copy based on activated tool counts
- no connection list fields optimized around activation

The column can remain in the schema temporarily as a compatibility artifact until the broader execution-surface redesign happens.

#### 3c. Preserve one-provider-one-connection semantics

Keep the current launch rule from the origin doc: one active connection per provider per user. `create_connection` (Phase 1c) rejects a second connect attempt against the same provider and directs the user to reauthorize or disconnect first. Reauth refreshes credentials on the same account; it is not an account-switching primitive.

### Phase 4: Remove Activation-Era Prompting and Context Engineering

**Goal:** The model should stop being taught the old connection workflow.

#### 4a. Rewrite the system skill content

Update `src/lib/runner/system-skills.ts`:

- fix stale tool names
- remove `search_for_integrations` / `get_integrations_capabilities` references
- remove `toolsToActivate` guidance
- remove connection-scoped skill-file assumptions from the standard launch path
- teach the direct `connect -> authorize -> use` model, including that the turn ends after `create_connection` returns

#### 4b. Simplify the per-turn reminder

Update `src/lib/runner/system-reminder.ts` so per-turn context no longer injects active connection summaries and activated-tool counts. The launch model does not need connection lifecycle context engineered into every turn.

Preferred launch direction:

- keep current time
- drop the active-connections block entirely

This matches the origin boundary of no per-turn connection-context injection for ordinary use.

#### 4c. Scrub activation wording from tool descriptions

Update remaining descriptions and in-repo instructional text so they stop referring to:

- activation after connect
- grant-permissions flow for connection readiness
- connection skill files as part of the default path

Relevant files include:

- `src/lib/managed-agents/tools/browser-side/create-connection.ts`
- `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`
- `src/lib/managed-agents/tools/connections/list-composio-tools.ts`
- `src/lib/managed-agents/tools/connections/execute-composio-tool.ts`
- any surviving connection-related help text in tests or docs

### Phase 5: Verification and Rollout

**Goal:** Validate the launch behavior end-to-end and document what remains intentionally deferred.

#### 5a. Unit and integration coverage

Add or update coverage for:

- managed-agent tool declarations
- `create_connection` and `list_connections` response shapes
- reauth failure preserving the row
- connection card copy and state transitions
- system reminder output after connection-context removal
- stale system-skill content replacement

#### 5b. Browser and chat verification

Verify the launch flow end-to-end in the web chat:

- connect Notion
- connect Gmail
- disconnect a provider
- force a reauth scenario
- confirm that no tool-activation card appears
- confirm provider use works on the next message after connect

If any managed-agent test run is needed during implementation, use `claude-haiku-4-5` per repo policy.

#### 5c. Explicit follow-up list

Document these as deferred follow-ups, not hidden omissions:

- native MCP migration
- execution-surface redesign (`execute_composio_tool` replacement or removal)
- same-provider multi-account support
- long-tail provider discovery
- admin/governance controls for least-privilege connection policy

## Acceptance Criteria

- [ ] A supported provider can be connected directly from a user request without requiring discovery or capability-inspection tools. (R1, R2)
- [ ] Connection setup renders an inline auth card with clear provider copy and simple status states. (R3, R4)
- [ ] OAuth success produces a lightweight connected confirmation in the thread. (R5)
- [ ] A successfully connected provider is usable on the next message without a separate activation or grant-permissions step. (R6, R9)
- [ ] The user-facing connection-management lifecycle is reduced to connect, list, reauthorize, and disconnect. (R7, R8)
- [ ] Approvals remain attached to genuinely external or destructive actions, not connection readiness. (R10)
- [ ] v1 continues to enforce one provider connection per user rather than introducing multi-account routing. (R11)
- [ ] The user can inspect a simple connected-services list with provider/account/status information. (R12)
- [ ] Unsupported providers fail clearly rather than entering a broad integration-discovery workflow. (R13)
- [ ] Prompt copy, reminder copy, and UI copy no longer teach the activation-heavy lifecycle. (R14 + scope boundaries)
- [ ] `create_connection` rejects unsupported and already-connected providers with a clear error. (R11, R13)
- [ ] After `create_connection`, the agent ends the turn and does not attempt same-run provider use. (R6)

## Success Metrics

- Fewer connection-management tool calls are needed to complete a standard connect flow.
- Users can complete a connection in one short chat flow and proceed to useful work immediately after.
- Connection-related prompt/context overhead is reduced relative to the old activation-oriented model.
- Reauth failures no longer result in disappearing connections or stranded pending states that require manual cleanup.

## Dependencies & Risks

- **Curated provider scope must be explicit.** Assume the launch set is Gmail, Google Calendar, Google Drive, and Notion unless product decides otherwise.
- **Execution wrappers remain for launch.** This means the final tool surface is simpler than today but not yet as clean as a native MCP or direct-provider-tool architecture.
- **Older docs and tests assume activation exists.** The cleanup work spans UI copy, tool descriptions, tests, and system skill content.
- **Dropping per-turn connection reminders may increase `list_connections` usage.** This is acceptable if it simplifies the model and reduces prompt clutter.
- **Reauth lifecycle bugs are real.** The earlier code review documented destructive failure modes that must be fixed as part of this simplification, not left behind.

## Resolved Decisions (Previously Deferred from Origin)

- **Chat vs settings surface.** Chat only for launch. Settings is out of scope.
- **Success event copy.** The card's `connected` / `failed` / `needs reauth` states are the confirmation. No separate thread event.
- **Same-provider different-account reconnect.** `create_connection` rejects a duplicate with an "already connected, disconnect first" message. No silent account swap.
- **Backward compatibility for old threads.** Not solved in this plan. Accept that older threads may show stale tool-call renders; address if it actually breaks something.

## Sources & References

- **Origin document:** `docs/product/ideations/2026-04-19-kiss-connection-management-requirements.md`
- Existing approval-heavy direction to explicitly supersede for launch: `docs/product/ideations/2026-04-07-tool-approval-system.md`
- Native MCP follow-up, intentionally deferred here: `docs/tasks/2026-04-13-native-mcp-connections-tasklist.md`
- Current declaration surface: `src/lib/managed-agents/tools/declarations.ts`
- Current chat auth card UI: `src/components/chat/tool-call-inline.tsx`
- Current connection system skill copy: `src/lib/runner/system-skills.ts`
- Current per-turn connection reminder: `src/lib/runner/system-reminder.ts`
- Current connect/list/reauth/delete tools:
  - `src/lib/managed-agents/tools/browser-side/create-connection.ts`
  - `src/lib/managed-agents/tools/browser-side/reauthorize-connection.ts`
  - `src/lib/managed-agents/tools/connections/list-connections.ts`
  - `src/lib/managed-agents/tools/connections/delete-connection.ts`
- Temporary execution compatibility layer:
  - `src/lib/managed-agents/tools/connections/list-composio-tools.ts`
  - `src/lib/managed-agents/tools/connections/execute-composio-tool.ts`
