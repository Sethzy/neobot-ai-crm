---
date: 2026-04-22
topic: approval-gate-rework
---

# Approval Gate Rework (Managed Agents Era)

## Problem Frame

Sunder's approval gate is inert. The architecture doc claims *"external-facing actions require approval"* but nothing enforces this today. `scripts/managed-agents/create-agent.ts:252` publishes every built-in tool with `permission_policy: "always_allow"`, so Anthropic never emits the `evaluated_permission: "ask"` event our runner watches for. Sunder's custom tools (`delete_records`, `configure_crm`, `send_message`, etc.) have no approval mechanism at all.

The current workaround is system-prompt gating via `ask_user_question` — the agent is told to ask a clarifying question before destructive actions. This produces a **double-interruption UX**: user sees a generic question card ("Approve deleting these records?"), then sees the actual tool execute. Two cards, two clicks, for what should be one approve-and-go.

A prior ideation (`2026-04-07-tool-approval-system.md`) proposed re-enabling the Vercel AI SDK's `needsApproval` property. That approach was invalidated by the April 9 Managed Agents migration — there is no `convertToModelMessages`, no `prepareStep`, no `streamText` anymore. The mechanics don't apply. This ideation supersedes it.

**Why it matters:** the SME trust story ("nothing external leaves Sunder without your OK, and Sunder learns your preferences") is the headline GTM motion. It requires a real, enforceable gate. Destructive CRM gating is not the full pitch, but it establishes the architecture that the external-comms gate will extend from.

## Requirements

- **R1.** Introduce a `request_approval` custom tool following the Anthropic cookbook pattern (`CMA_gate_human_in_the_loop.ipynb`, `sre_incident_responder.ipynb`). Agent calls it before gated actions; session goes idle with `requires_action`; application resolves the approval and POSTs `user.custom_tool_result` back.
- **R2.** System prompt enumerates gated actions and instructs the agent: *"Call `request_approval` first. Do not execute the action unless the result is `approved`."*
- **R3.** Gated tools in v0 are destructive CRM actions only: `delete_records` and `configure_crm` (schema changes).
- **R4.** The gated-tools list is a constant in code (one file). Per-client override is a documented extension, not shipped in v0.
- **R5.** Session resume after approval is driven by the `session.status_idled` Anthropic webhook per the production cookbook. In-process `after()` drain in `/api/tool-confirm/route.ts` is removed.
- **R6.** Web chat renders an approval card with binary choices: Allow / Deny. The card shows the agent's natural-language summary, not raw tool args.
- **R7.** Telegram renders the same approval via existing inline-keyboard plumbing: Allow / Deny. No 3-button "always allow" in v0.
- **R8.** Enforcement is prompt-only. No dispatcher belt-and-suspenders check. If the agent skips the gate, it's a prompt-calibration bug to fix — not a runtime guard.
- **R9.** Obsolete approval infrastructure from the pre-migration attempt is deleted: the `evaluated_permission` detection path in `event-translator.ts:113-137`, dead `needsApproval` references, orphaned `PermissionCard` wiring, etc.

## Success Criteria

- User says *"delete these three contacts"* in web chat → single approval card appears with agent summary → click Allow → deletion happens → UI updates. Zero `ask_user_question` precursor.
- Same flow in Telegram: single inline-keyboard prompt → tap Allow → deletion happens.
- Deny path: user clicks Deny → tool does not execute → agent acknowledges naturally (*"OK, I won't delete those."*).
- `/api/webhooks/anthropic` handles `session.status_idled` → pending `request_approval` events are enqueued to DB → UI / Telegram render from DB, not from an open HTTP connection.
- Zero references to `evaluated_permission` or `needsApproval` in source. Zero `after()` drains in the approval resolution path.
- No regression on non-gated `ask_user_question` flows (the tool remains for its primary purpose: clarifying questions).

## Scope Boundaries

- **No external-comms gating** (`send_message`, Composio write tools, browser actions). Documented as extension path.
- **No Composio `request_connection`** (OAuth auth cards stay on current path). Documented as extension.
- **No `ask_user_question` changes** — remains for clarifying questions.
- **No per-client settings UI** — gated tools list is code-level in v0.
- **No four-choice UI** — binary only. "Always allow this pattern" rules table deferred.
- **No approval timeout / expiration** — card persists until acted on.
- **No pending-approvals drawer** — page reload rehydrates existing cards via message history.
- **No unified `session_interrupts` primitive** — v0 keeps `approval_events` dedicated; unification considered when Composio and ask_user_question migrate under the same pattern.

## Key Decisions

- **Agent-called custom tool, not metadata flag.** Wholesale adoption of the Anthropic cookbook pattern. The approval *is* a tool the agent calls with a natural-language summary. No `needsApproval` metadata on other tools. Prompt discipline, not infra interception.
- **Prompt-only enforcement.** Cookbook-pure. The SRE cookbook's line *"Never call `merge_pull_request` unless `request_approval` returned 'approved'"* is the entire enforcement mechanism. Belt-and-suspenders dispatcher checks are explicitly rejected for v0 to keep the architecture simple and match Anthropic's reference.
- **Webhook from day one.** `session.status_idled` handler is v0 scope, not deferred. Retrofitting later is more work than doing it now, and it's the decoupling that unlocks async approvals (Telegram, hours-later) when we extend.
- **Binary UI.** Always-allow pattern caching is only useful once routine external actions are gated. Destructive CRM actions should confirm every time.
- **Channel parity.** Web + Telegram both render approval in v0 using existing plumbing (no 3-button extension yet).
- **Supersedes April 7 ideation.** That doc targeted Vercel AI SDK mechanics that were orphaned by the Managed Agents migration.

## Extension Paths (design should accommodate, not ship)

These are out of scope for v0 but the architecture must not block them. Documented here so planning keeps the seams clean.

- **Composio OAuth via `request_connection`.** Same agent-called custom-tool pattern. Schema: `{ service_name, reason, required_scopes? }`. Result shape `{ status: "connected" | "skipped" | "failed" }`. Composio OAuth callback triggers `sessions.events.send` with the result. Reuses the same webhook/idle machinery as `request_approval`.
- **External-comms gating** (`send_message`, Composio write tools, browser actions). The actual SME-pitch unlock. Requires four-choice UI, `client_approval_rules` table, Telegram 3-button inline keyboard, pattern-matching rules engine. Biggest downstream work; v0 is the foundation.
- **Per-client gated-tools list.** ~Half-day extension: `clients.gated_tools` column (text[]) or settings row → inject into the kickoff `user.message` (Sunder already does per-run context assembly) → system prompt reads session-scoped list. Keep system prompt language generic so this drops in cleanly.
- **Unified `session_interrupts` primitive.** Merge approval + connection + ask_user_question under one type-discriminated table with one webhook handler and one UI component that switches render style on `kind`. Worth doing when all three interrupt types migrate to the agent-called-tool pattern.

## Dependencies / Assumptions

- Anthropic Console exposes webhook registration for `session.status_idled` (confirmed via `CMA_operate_in_production.ipynb`).
- HMAC signing secret stored in env var, FastAPI-equivalent handler implementable on Vercel Functions.
- Existing Telegram approval plumbing (`src/lib/channels/telegram/approvals.ts`) is reusable for binary Allow/Deny.
- Existing `approval_events` table schema is a reasonable starting point (planner decides reuse vs replace).

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Needs research] Exact schema for `request_approval` tool input: single `summary` string (SRE cookbook) vs separate `{ summary, action_type, payload_preview }` fields. SRE ships summary-only. Decide during planning after reviewing both patterns.
- [Affects R5][Technical] Migration path for `/api/tool-confirm`: does the endpoint stay (serving the UI button-click path) or is all resolution webhook-driven? Most likely hybrid — UI clicks still POST to `/api/tool-confirm` which then calls `sessions.events.send`, while `session.status_idled` webhook handles agent-idle notification.
- [Affects R9][Technical] Dead-code audit: which pieces from the April 7 trail are deleted vs kept as scaffolding. Candidates to review: `approval_events` table + RLS, `PermissionCard`, `Confirmation` component, `resolveApprovalEvent`, `extractApprovalRequests`, `createApprovalEvent`, `addToolApprovalResponse` wiring in `chat-panel.tsx`.
- [Affects R3][Technical] Sequencing: system prompt currently gates via `ask_user_question`. Swap to `request_approval` instructions must happen atomically with the tool landing — or a brief window exists where neither gate is active. Planner to sequence.
- [Affects R5][Needs research] Webhook HMAC verification signature format. Anthropic production cookbook shows FastAPI pattern — verify equivalent Vercel Functions signature-check is correct before committing.

## Pitch Tie-in

V0 does not directly ship the SME headline (*"nothing external leaves Sunder without your OK"*) — destructive CRM is internal-only. But it establishes the exact pattern that the external-comms gate will extend from: agent-called approval tool, webhook-driven resume, approval card with natural-language summary. Without this foundation, the pitch extension is blocked.

When v0 is live, the extension work to land the pitch headline is scoped as: expand gated-tools list + add four-choice UI + `client_approval_rules` table + 3-button Telegram keyboard. All additive, none breaking.

## Next Steps

→ `/plan` for structured implementation planning.
