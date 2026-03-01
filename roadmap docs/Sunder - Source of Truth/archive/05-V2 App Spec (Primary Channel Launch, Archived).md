# Sunder - AI Orchestration SaaS (v2) App Specification

> **Version:** 2.1 (Channel Expansion Spec)
> **Last Updated:** February 23, 2026
> **Status:** Approved Direction, Ready for Build
> **Related specs:** `01-V1 App Spec (Primary Baseline).md`, `03-V3 App Spec (Primary Growth Expansion).md`

---

## Table of Contents

1. [Overview](#overview)
2. [What the Product Is](#what-the-product-is)
3. [Who It Is For](#who-it-is-for)
4. [Release Boundary (Locked)](#release-boundary-locked)
5. [User Experience](#user-experience)
6. [v2 Scope and Release Waves](#v2-scope-and-release-waves)
7. [End-to-End Architecture](#end-to-end-architecture)
8. [Technical Architecture (Providers and SDKs)](#technical-architecture-providers-and-sdks)
9. [Tasklet Reference Alignment (Source-of-Truth)](#tasklet-reference-alignment-source-of-truth)
10. [Request Lifecycle (Technical Flow)](#request-lifecycle-technical-flow)
11. [Technical Trade-Offs and Best Practices](#technical-trade-offs-and-best-practices)
12. [Core System Components](#core-system-components)
13. [Data and State Design](#data-and-state-design)
14. [Safety and Approval Rules](#safety-and-approval-rules)
15. [Cost and Performance Strategy](#cost-and-performance-strategy)
16. [Implementation Plan](#implementation-plan)
17. [Testing and Launch Gates](#testing-and-launch-gates)
18. [Operational Considerations](#operational-considerations)
19. [Risks and Mitigations](#risks-and-mitigations)
20. [Unresolved Questions](#unresolved-questions)

---

## Overview

Sunder v2 is the **channel expansion release**.

The product goal is simple: make Sunder available where users already work every day, starting with:

1. **WhatsApp Business Platform**
2. **Telegram Bot**

The key product shift in v2 is:

- We are **not** building a second assistant architecture.
- We are keeping the **same runner and same safety model**, with additive channel entities on top of the v1 data model.
- We are adding **thin channel adapters** so users can use Sunder from common chat apps.

### Core success criteria for v2

1. Existing v1 users can use Sunder from WhatsApp and Telegram with no workflow rewrite.
2. Channel messages map reliably into the same runner and tools.
3. Outbound sends remain controlled, auditable, and policy-compliant.
4. Unit economics remain healthy with the same cost discipline standards from v1, including the `<$20` monthly target per active paid user.

---

## Release Boundary (Locked)

This section exists to prevent scope drift and mixed build direction.

1. This v2 spec is the build contract for **channel expansion launch only** (WhatsApp + Telegram).
2. Work that is not required for channel launch must not block launch.
3. Non-launch growth initiatives (for example: managed lead-generation pipelines, mobile discovery) are tracked in:
   - `03-V3 App Spec (Primary Growth Expansion).md`
4. If a backlog initiative changes runner behavior, data boundaries, safety policy, or cost policy, it requires a separate architecture approval before build.

---

## What the Product Is

In plain language, Sunder v2 is the same assistant from v1, now reachable through messaging apps.

Sunder should feel like:

- "I can message Sunder from WhatsApp or Telegram and get the same quality."
- "I do not need to open a separate dashboard for normal work."
- "I can trust what Sunder sends and when it sends it."

Core behavior is unchanged:

1. User asks naturally.
2. Sunder runs workflows.
3. Low-risk work executes.
4. High-risk actions pause for approval.
5. Outcomes are persisted and visible in Mission Control.

---

## Who It Is For

### Primary users (v2)

1. Same v1 wedge: solo real estate agents in Singapore.
2. Existing v1 users who prefer messaging-native workflows.
3. New users in the same wedge who are easier to activate through familiar chat apps than web-first flows.

### Why this wedge

1. Messaging channels reduce behavior change requirements.
2. User response latency improves when Sunder meets users in their daily chat apps.
3. Accessibility improves for on-the-go users who avoid dashboard-heavy workflows.

### Not in v2 first release

1. Rebuilding core runner logic for each channel.
2. Full multi-channel campaign automation.
3. Additional channels beyond WhatsApp and Telegram.
4. Managed lead-generation pipeline expansion work.
5. Mobile app discovery and mobile app build work.

---

## User Experience

## Onboarding flow (channel expansion)

1. User has an active Sunder account.
2. User connects at least one channel: WhatsApp or Telegram.
3. Sunder validates channel linkage.
4. User sends first message in that channel.
5. Sunder responds with normal assistant behavior.

No new workflow builder or channel-specific app UI is introduced in this release.

### Web shell alignment with v1 (locked)

1. v2 keeps the same web navigation model defined in v1 + Mission Control UX spec:
   - Chat (Home)
   - Mission Control
   - Tasks
   - CRM
   - Knowledge
   - Memory
   - Automations
   - Documents
   - Channels
   - Settings
2. Mission Control remains two-tab only: `Overview` and `Queue`.
3. Tasks remains one unified surface (CRM-linked, manual, and Autopilot-created work).
4. Automations remains one surface for Scheduled jobs + Autopilot controls.
5. v2 change: `Channels` moves from placeholder state to active operational surface.
6. Documents remains the file-extraction surface (Gemini + ExtendAI pipeline); meeting transcripts remain Knowledge/CRM/Tasks inputs.

### Channel setup: WhatsApp

1. User starts from logged-in web app: `Settings -> Channels -> Connect WhatsApp`.
2. Sunder shows a one-time linking code with short expiry (for example, 10 minutes).
3. User messages that code to Sunder's official WhatsApp business number.
4. Sunder verifies the code, expiry, and account ownership, then links the WhatsApp identity to the correct Sunder account.
5. User receives confirmation in both web and WhatsApp, then continues in normal conversational flow.

### Channel setup: Telegram

1. User starts from logged-in web app: `Settings -> Channels -> Connect Telegram`.
2. Sunder opens Telegram with a one-time linking token (or short linking code).
3. User confirms link in Telegram.
4. Sunder verifies token ownership and links the Telegram identity to the correct Sunder account.
5. User receives confirmation in both web and Telegram, then continues in normal conversational flow.

## Daily usage flow

1. User sends message from WhatsApp or Telegram.
2. Sunder routes message to the same runner.
3. Sunder executes tools and workflows as in v1.
4. Sunder returns response to the same channel.
5. Mission Control Queue, Channels page, and activity logs reflect the interaction and run metadata.

## Product behavior standards

1. Channel replies must clearly state what was done.
2. Approval prompts must stay explicit and plain language.
3. Channel-specific constraints (for example, WhatsApp messaging windows) must be enforced automatically.

---

## v2 Scope and Release Waves

### Scope precedence rule (locked)

1. `01-V1 App Spec (Primary Baseline).md` remains the base behavior for runner, data, safety, and costs.
2. This v2 spec defines only approved expansion behavior for channels.
3. If there is conflict, this v2 spec governs channel behavior and v1 spec governs core runtime behavior.
4. Connection type policy is inherited from v1 unless explicitly overridden here: `integrations`, `mcp`, and `direct_api` remain first-class, and v1 managed-allowlist gating for `mcp`/`direct_api` remains in force.
5. `../ux-and-pm/01-Mission Control UX Spec (Draft).md` remains the UI behavior contract; v2 implements channel capability inside that shell without creating parallel surfaces.

### v1 -> v2 delta summary (locked)

| Domain | v1 status | v2 launch status |
| --- | --- | --- |
| Runner path | One runner | Inherited unchanged |
| Safety/approval model | Mixed autonomy + explicit approvals | Inherited unchanged, extended to channel sends |
| Task surfaces | Unified Tasks + Mission Control Queue | Inherited unchanged |
| Memory policy | Shared memory, auto-write during conversations, synthesis pulse for cleanup/review | Inherited unchanged (`UserMemories` is naming layer only) |
| Thread identity + queueing + replay | Defined and required | Inherited unchanged |
| Channel capability | Placeholder in UI | Activated for WhatsApp + Telegram |
| Data model | Core entities defined | Core inherited; channel-specific entities added only |

## Foundation (build first, hidden from users)

1. Channel gateway abstraction layer.
2. Channel identity mapping and dedupe model.
3. Webhook ingestion security and signature verification.
4. Channel-specific policy engine (especially for WhatsApp send eligibility).
5. Channel delivery telemetry and retry model.
6. User memory contract (what is stored, when it updates, and how it is used every run).

## Wave 1 (first v2 ship)

1. **WhatsApp Business Platform adapter (Cloud API + webhooks)**.
2. **Telegram Bot adapter (Bot API + webhooks)**.
3. Text-first inbound and outbound messaging.
4. Channel message persistence in Supabase.
5. Approval enforcement for outbound high-risk sends.
6. Basic channel health visibility in Mission Control.
7. `UserMemories` contract live in production (created during onboarding, read on every run).

## Wave 2 (fast follow-on)

1. Richer message types (media-first responses where useful).
2. WhatsApp template management workflow for proactive sends.
3. Improved channel onboarding and recovery UX.
4. Better per-channel analytics and delivery diagnostics.

## Wave 3 (deferred)

1. Additional channels (if approved after v2 adoption data).
2. Advanced campaign workflows across channels.
3. Partner/tenant-owned sender expansion if needed.
4. Growth initiatives from `03-V3 App Spec (Primary Growth Expansion).md` if separately approved.

---

## End-to-End Architecture

v2 keeps the same three-layer model and adds a channel transport edge.

## Layer 1: Control Layer (Central Platform)

Responsibilities:

1. Channel webhook ingestion and verification.
2. Channel identity mapping to `client_id`.
3. Routing channel events to the same runner.
4. Approval checks and audit logging for channel sends.

## Layer 2: Execution Layer (Per-Client Storage + On-Demand Sandbox)

Unchanged from v1:

1. Workflow files (Supabase Storage).
2. Subagent files (Supabase Storage).
3. Runtime logs and checkpoints (Supabase Storage + DB).
4. Tool execution environment (Vercel Sandbox — on-demand).

## Layer 3: Data Layer (Supabase)

Expanded from v1 to include:

1. Channel identities and linkage state.
2. Channel thread and message metadata.
3. Delivery status and retry records.
4. Channel policy state (for example, WhatsApp customer-service-window state).

## Core runtime principle

The runner remains single-path. Channels are transport adapters only.

---

## Technical Architecture (Providers and SDKs)

### v2 channel decision (locked)

1. **WhatsApp channel:** WhatsApp Business Platform Cloud API.
2. **Telegram channel:** Telegram Bot API.
3. **No Baileys in v2** for production channel transport.
4. Keep one internal channel adapter interface so business logic does not depend on vendor-specific payload shape.

### Core product stack (unchanged)

1. Frontend: React + Vite + Tailwind + ShadCN + TanStack Router + TanStack Query.
2. Backend/control API: Node.js + TypeScript.
3. Structured data/auth: Supabase.
4. Per-client files: Supabase Storage. Code execution: Vercel Sandbox.
5. Billing: Stripe.

### Provider and SDK matrix (v2 additions)

| Capability | Provider | SDK/Access Method | v2 Status |
| --- | --- | --- | --- |
| WhatsApp messaging | Meta WhatsApp Business Platform | Cloud API + webhooks | Launch |
| Telegram messaging | Telegram | Bot API + webhooks | Launch |
| Channel policy control | Internal | Channel policy engine | Launch |
| Channel observability | Internal + Supabase | Event logs + status records | Launch |

### Channel architecture rules (locked)

1. All inbound events normalize into one internal message envelope.
2. All outbound sends go through channel policy checks before transport.
3. All delivery statuses are captured and persisted.
4. Idempotency keys are required for inbound and outbound operations, using a deterministic key pattern:
   - inbound: `provider + provider_account_id + provider_message_id`
   - outbound: `provider + client_id + run_id + outbound_step_id`

### Account-linking ownership proof (locked)

1. Channel link must start from an authenticated web session inside Sunder.
2. Sunder must issue a one-time link challenge with short expiry.
3. Channel link completes only after the user proves possession of that one-time challenge in WhatsApp or Telegram.
4. Link completion must be idempotent, auditable, and tied to `client_id` + provider identity.
5. Expired or already-used challenges must fail safely with a clear retry prompt.

### Out-of-scope growth initiatives (non-blocking for v2 launch)

1. Managed lead-generation pipeline work is moved to `03-V3 App Spec (Primary Growth Expansion).md`.
2. Mobile discovery and mobile app planning are moved to `03-V3 App Spec (Primary Growth Expansion).md`.
3. These initiatives are explicitly not part of v2 launch acceptance criteria.

---

## Tasklet Reference Alignment (Source-of-Truth)

This remains locked from v1:

1. Runner behavior, tool calling, and state boundaries still follow Tasklet-aligned architecture.
2. Channel work must not create parallel orchestration paths.
3. Any channel-specific deviation must be documented in `../architecture/01-Tasklet Delta Register.md`.

### Connection inheritance rule (v2 lock)

1. v2 channels do not change connection lifecycle order from v1 (check existing -> verify -> activate -> create only if needed -> reauthorize on auth failure).
2. v2 does not silently broaden connection onboarding scope; managed-allowlist policy for `mcp` and `direct_api` stays unchanged unless a new v2 approval explicitly relaxes it.

### v2-specific alignment rule

1. Channels are **contact methods** and transport layers, not new agent runtimes.
2. Existing skill/subagent/tool contracts remain unchanged unless a channel-specific limitation requires adaptation.
3. User customization remains skills-first and bounded: guided interview, explicit approval, no silent activation, and auditable change records.

### Session continuity and memory inheritance rule (v2 lock)

1. v2 inherits the full v1 continuity contract for thread identity, per-thread queueing, replay/reconnect, shared-memory policy, and long-thread compaction.
2. Channel identities must resolve into the same durable thread identity contract used by web chat (`thread_key` -> `thread_id`).
3. One active run per thread remains required; additional same-thread messages queue in arrival order.
4. Shared memory remains app-scoped and cross-thread/cross-channel for the same client unless a future spec explicitly introduces private-thread mode.
5. Channel expansion inherits the v1 auto-write memory model. Memory auto-writes from channel conversations follow the same taxonomy and version tracking as web chat. No separate memory write path for channels.

---

## Request Lifecycle (Technical Flow)

This is the v2 channel flow on top of the v1 runner.

1. User sends message in WhatsApp or Telegram.
2. Channel webhook arrives at control API.
3. Webhook signature/token is verified.
4. Event is deduped using provider message ID.
5. Channel identity is resolved to `client_id`.
6. Channel message resolves to stable thread identity (`thread_key`, `thread_id`) using channel + chat type + chat ID.
7. Per-thread execution lock is enforced:
   - if thread is active, message is queued in arrival order,
   - if thread is idle, run starts immediately.
8. Request is normalized and sent to runner.
9. Runner executes normal tool loop using v1 context order and continuity rules (shared memory load, thread context load, and compaction policy).
10. Outbound intent is passed to channel policy engine.
11. If allowed, adapter sends message to channel provider.
12. Delivery status and stream replay events are recorded and linked to run metadata.
13. Mission Control reflects status and audit events.
14. After run completion, queued messages for that same thread are processed automatically until queue is empty.

---

## Technical Trade-Offs and Best Practices

### Why this design

1. Keeps architecture simple: one runner, multiple transports.
2. Limits regression risk: core workflow code stays untouched.
3. Makes future channels easier: adapter pattern is reusable.

### Trade-offs we accept in v2

1. Channel policies add operational complexity at send-time.
2. WhatsApp proactive sends require stricter handling than Telegram.
3. Text-first launch defers richer UX to later waves.

### Best-practice rules

1. Never call provider APIs directly from business logic.
2. Keep channel adapters stateless and retry-safe.
3. Always persist raw webhook payloads for debugging.
4. Enforce explicit approval for risky outbound actions.
5. Keep per-channel error mapping deterministic and user-readable.

---

## Core System Components

## 1) Runner Engine (single orchestration loop)

Unchanged from v1 and shared by web chat + channels.

## 2) Channel Gateway

Responsibilities:

1. Accept and verify webhooks.
2. Normalize payloads.
3. Route to runner.
4. Dispatch outbound sends.

## 3) Channel Policy Engine

Responsibilities:

1. Enforce send eligibility by channel.
2. Enforce outbound safety and approval rules.
3. Return clear block reasons and next valid action.

## 4) Delivery and Retry Manager

Responsibilities:

1. Persist send attempts.
2. Process delivery/read/failure updates.
3. Retry transient failures with bounded backoff.

## 5) Mission Control Channel Surfaces

1. Mission Control keeps the same operating shape from v1: `Overview` and `Queue`.
2. Queue includes channel-originated approvals, failed sends, and blocked actions with direct open/retry controls.
3. Channels page shows linkage status, thread history, delivery diagnostics, and outbound audit trail.
4. Tasks/CRM/Knowledge/Automations surfaces remain unchanged and consume the same shared backend models from v1.

## 6) Guided Channel Onboarding Skills

1. Link channel identity to client account.
2. Validate connectivity.
3. Provide first successful reply quickly.
4. Offer recovery steps when linkage fails.

## 7) Personalization continuity (inherited)

1. Keep a `UserMemories` profile so the assistant remembers key user preferences and working style.
2. Memory auto-writes during conversations are inherited from v1 — agent captures observations to `memory/*.md` files in real-time across all channels. Synthesis pulse provides periodic cleanup/review.
3. Skill changes remain `recommend-only` — no skill change is applied without explicit user approval. Memory writes are exempt from this gate (auto-write model).

### Bounded customization contract (locked)

1. Keep one stable core runner; user customization happens through skills, memory, and workflow artifacts.
2. Allowed customization scope: channel/workflow preferences, trigger timing, output style, and approved reusable workflow behavior.
3. Disallowed user-level scope: channel policy engine rules, high-risk safety gates, tenant-isolation controls, audit logging requirements, and core internal tool schemas.
4. Reusable customization flow is fixed: guided interview -> plain-language plan preview -> explicit user approval -> apply -> verification summary.
5. No silent create/activate: reusable skills remain recommendation-only until the user explicitly approves creation and activation.
6. Every approved customization must persist who approved, what changed, expected outcome, and rollback note.

---

## Data and State Design

### Data classes in Supabase (v2 channel additions only)

v1 already defines core threads, queueing, replay, compaction, and shared-memory history.  
v2 adds only channel-specific entities:

1. Channel links (`client_id`, `provider`, `external_account_id`, `link_status`, `linked_at`).
2. Channel link challenges (one-time code/token, expiry, used_at, failure_reason).
3. Channel messages (`provider_message_id`, direction, timestamps, delivery_status, normalized envelope snapshot).
4. Webhook event ledger (raw payload, signature verification result, dedupe key).
5. Channel delivery events (sent/delivered/read/failed timeline with provider codes).
6. Channel policy state (for example, eligibility windows and template requirements).
7. Channel-to-run and channel-to-approval link records for Queue deep-linking.
8. Channel health snapshots for Channels page status cards.

No duplicate table family should be created for:
1. thread identity,
2. per-thread queueing,
3. replay cursors/events,
4. long-thread compaction,
5. shared memory version history.

### UI-to-backend mapping contract (v2 channel delta)

1. `Channels` page reads channel link status, recent thread activity, delivery outcomes, and policy blocks.
2. `Mission Control > Queue` reads pending approvals and failures across both web and channel actions using shared IDs.
3. Channel events must link back to the same run/task/approval IDs used by v1 surfaces.
4. `Tasks` source labels remain `CRM`, `Manual`, and `Autopilot` in v2; channel transport must not introduce a new task-source category.
5. `Automations` behavior is unchanged: Scheduled jobs + Autopilot remain one scheduler path.
6. Channel conversations must map to the same durable thread identity model used by web chat.
7. Reconnect flows must replay missed events from cursor before live stream resumes.
8. UI must surface queued-in-thread state when same-thread messages are waiting behind an active run.

### UserMemories contract (locked)

1. v2 does not introduce a separate memory system.
2. `UserMemories` is the product label for the same shared-memory contract inherited from v1.
3. The assistant reads `MEMORY.md` index at the start of every run so behavior stays consistent. Detailed `memory/*.md` files are loaded on-demand based on conversation need.
4. Agent auto-writes memory observations during conversations to appropriate `memory/*.md` files in real-time. No approval gate for memory writes. This applies equally to web, WhatsApp, and Telegram conversations.
5. `SOUL.md` and `USER.md` remain manual-edit only (assistant cannot auto-edit them).
6. Every write keeps version history, change summary, write source, and rollback context.
7. `UserMemories` is shared across the same client's web and channel threads.
8. Prompt assembly must read `MEMORY.md` index before recent thread turns. System-reminder advertises memory state each turn.
9. Memory synthesis pulse periodically presents auto-written entries for user cleanup/review.

### Design intent

1. Preserve full traceability per message.
2. Keep channel failures easy to diagnose.
3. Keep core business entities separate from transport metadata.

---

## Safety and Approval Rules

v2 keeps the same trust model and extends it to channels.

### Auto-run (low risk)

1. Inbound replies and normal assistant responses.
2. Non-destructive status updates.
3. Internal summarization and organization.

### Approval-required (high risk)

1. Proactive outbound communication that could affect customer trust.
2. Bulk or repeated external sends.
3. Irreversible external actions linked from channel flows.

### Required safeguards

1. Sender identity verification and linkage checks.
2. Idempotent message processing.
3. Policy checks before outbound sends.
4. Full audit trail for all external delivery actions.
5. One active run per thread; additional same-thread messages are queued in order.
6. Replay cursor + dedupe are required for reconnect reliability.
7. Memory auto-writes are versioned for rollback and reviewed via synthesis pulse. `SOUL.md` and `USER.md` remain manual-edit only.

### Memory and skill update policy (locked)

1. The assistant auto-writes memory observations during conversations (no approval gate). Skill changes remain recommendation-only — the assistant may suggest reusable skills but cannot activate them without explicit user approval.
2. User approval is required before creating or activating a reusable skill.
3. Every recommendation must show clear reason and expected outcome in plain language.

---

## Cost and Performance Strategy

### Cost guardrails

1. Keep the one-runner model from v1.
2. Keep v1 financial guardrail: monthly cost target remains `<$20` per active paid user.
3. Monitor cost per channel send path.
4. Prefer low-cost eligible messaging paths where possible.
5. Alert on unusual outbound volume spikes.
6. Budget enforcement at per-client level.
7. Enforce long-thread compaction thresholds to prevent context-cost blowups.
8. Bound replay-event retention windows to control storage and replay query costs.

### Performance strategy

1. Fast webhook ack path.
2. One-at-a-time execution per thread with parallelism across different threads.
3. Async processing for heavy operations.
4. Bounded retries for transient provider failures.
5. Fast cursor-based replay on reconnect.
6. Clear user-facing fallback on unrecoverable channel failures.

### Financial intent

v2 must stay under the v1 cost target (`<$20` per active paid user monthly) while improving activation and retention through channel accessibility.

---

## Implementation Plan

## Sprint 1: Channel foundation

1. Implement channel gateway abstraction.
2. Add Supabase channel schema.
3. Add webhook verification and dedupe layer.
4. Add one-time channel link challenge flow (issue, verify, expire, safe retry).
5. Add channel observability primitives.
6. Implement `UserMemories` auto-write contract for channel conversations (same taxonomy and version tracking as web chat) and inject `MEMORY.md` index at the start of every run.
7. Implement bounded customization policy checks for channel-era skill suggestions and activations.
8. Implement channel-to-thread identity mapping contract (`thread_key`, `thread_id`) compatible with v1 continuity rules.
9. Implement per-thread queueing and ordered message execution.
10. Implement stream-event replay cursor persistence and reconnect replay flow.
11. Implement long-thread compaction policy and summary persistence for channel-heavy threads.

## Sprint 2: WhatsApp adapter

1. Implement inbound webhook parsing and routing.
2. Implement outbound send adapter.
3. Add send eligibility policy checks.
4. Add delivery status ingestion and mapping.

## Sprint 3: Telegram adapter

1. Implement bot webhook parsing and routing.
2. Implement outbound send adapter.
3. Add channel identity linkage and recovery flows.
4. Add delivery and failure telemetry.

## Sprint 4: Hardening and launch readiness

1. End-to-end failure recovery paths.
2. Approval UX polish for channel sends.
3. Operational dashboard updates.
4. Pilot rollout and incident playbooks.
5. Add bounded customization audit surfaces in Mission Control (change summary, approver, verification status, rollback note).
6. Run UI/backend parity pass against `../ux-and-pm/01-Mission Control UX Spec (Draft).md` for Channels activation states and Queue actions.

---

## Testing and Launch Gates

v2 should not launch unless these are true:

1. End-to-end channel messaging works for WhatsApp and Telegram.
2. Duplicate inbound processing rate is near zero.
3. Unauthorized outbound sends are zero.
4. Delivery status coverage is complete and auditable.
5. Monthly cost remains under `<$20` per active paid user while channel usage grows.
6. No unapproved memory or skill changes occur in production.

### Test categories

1. Channel onboarding and linkage tests.
2. Webhook verification and dedupe tests.
3. One-time ownership proof tests (expired code, reused code, wrong-account code, successful linking).
4. Inbound/outbound adapter integration tests.
5. Approval and policy enforcement tests.
6. Retry and failure-mode recovery tests.
7. Cost and volume regression tests.
8. `UserMemories` auto-write contract tests (channel conversations write to same taxonomy files as web chat, version tracking, daily changelog includes channel activity).
9. Bounded customization guardrail tests (blocked policy-surface edits, explicit approval checks, and audit-record completeness).
10. UI/backend contract tests (Channels activation state, Queue deep-link actions, and unchanged Tasks source model).
11. Session continuity tests (stable thread identity, same-thread queue ordering, and cross-thread parallelism).
12. Replay/reconnect tests (cursor replay correctness, dedupe behavior, and no missed events after reconnect).
13. Cross-channel memory continuity tests (memory written in one channel is available in other channels and web chat for same client).
14. Long-thread compaction tests (key-fact retention and source transcript preservation).

### Required continuity acceptance tests (channels + shared memory)

1. Stable thread identity: same channel chat maps to one thread across reconnects.
2. Ordered same-thread execution: concurrent same-thread messages execute in arrival order.
3. Cross-thread parallelism: different threads can run concurrently without state collisions.
4. Replay recovery: reconnect from cursor replays missed events exactly once.
5. Shared memory continuity: memory auto-written in one channel is available in another channel and web chat for same client.
6. Memory auto-write consistency: auto-written entries from channel conversations use the same taxonomy, version tracking, and rollback mechanisms as web chat.
7. Compaction quality: long-thread compaction preserves key facts, decisions, and open tasks.
8. Compaction safety: source transcript remains durable after compaction.

### Rollout strategy

1. Phase 1: internal dogfooding on both channels.
2. Phase 2: pilot users on WhatsApp + Telegram.
3. Phase 3: broad rollout after reliability and safety gates are stable.

---

## Operational Considerations

1. Per-channel health dashboards.
2. Dead-letter handling for failed events.
3. Provider status monitoring and alerting.
4. Fast disable switches per channel.
5. On-call runbook for channel incidents.

---

## Risks and Mitigations

## Risk 1: Channel policy violations

Mitigation:

1. Pre-send policy checks.
2. Opt-in and consent enforcement.
3. Conservative defaults for outbound communication.

## Risk 2: Delivery inconsistency across channels

Mitigation:

1. Unified internal envelope.
2. Channel-specific adapters with contract tests.
3. Delivery status reconciliation jobs.

## Risk 3: Duplicate or out-of-order webhook events

Mitigation:

1. Idempotency keys.
2. Ordered processing per thread.
3. Retry-safe handlers.

## Risk 4: Cost drift from outbound usage

Mitigation:

1. Per-client channel usage metering.
2. Budget thresholds and alerts.
3. Approval requirements for high-volume sends.

## Risk 5: Architectural drift

Mitigation:

1. Keep one runner.
2. Keep channel adapters thin.
3. Reject channel-specific orchestration forks.

---

## Unresolved Questions

1. Final policy matrix per channel action type.
2. Exact template and proactive messaging strategy for WhatsApp after launch.
3. Final channel-level pricing and limits in user plans.
4. Priority order for post-launch rich media support.
5. Criteria for adding third channel after WhatsApp and Telegram.
6. Launch scope for memory privacy controls: shared-across-threads default only, or include optional private-thread mode in v2.

---

## Final Direction Summary

Sunder v2 will ship as a **channel expansion release** with:

1. One unchanged orchestration core.
2. Two launch channels: WhatsApp and Telegram.
3. Strong trust and approval controls.
4. Practical, low-risk adapter-first architecture.

This is the fastest path to make Sunder more accessible without rebuilding core systems.
