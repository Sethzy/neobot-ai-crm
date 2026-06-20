# Tasklet Delta Register - Sunder (v1/v2)

> **Version:** 1.2
> **Last Updated:** February 21, 2026
> **Scope:** Sunder v1, v2, and v3 architecture and implementation decisions
> **Primary Source Specs:** `../product-dev/01-V1 App Spec (Primary Baseline).md`, `../product-dev/02-V2 App Spec (Primary Channel Launch).md`
> **Next-phase Source Spec:** `../product-dev/03-V3 App Spec (Primary Growth Expansion).md`

---

## Why This Document Exists (Plain Language)

This is a simple change log between **Tasklet baseline behavior** and **Sunder behavior**.

If we follow Tasklet exactly, we do not need a delta entry.
If we do something different, we must record it here so the team can:

1. Remember why the change was made.
2. See what risk it introduces.
3. Roll back quickly if it causes issues.
4. Re-check the decision on a fixed date.

### Golden rule

If this register and the Sunder spec are silent on a behavior, follow Tasklet references by default.

---

## How To Read Each Entry

Every delta entry includes:

1. **Tasklet baseline**: what Tasklet does.
2. **Sunder change**: what we do differently.
3. **Reason**: why this change exists.
4. **Risk**: what might break or degrade.
5. **Early warning signals**: how we detect trouble quickly.
6. **Rollback**: exact way to return closer to Tasklet behavior.
7. **Review date**: when to revisit with real data.
8. **Status**: `active`, `proposed`, `retired`.

---

## Summary Table (Current Known Deltas)

| Delta ID | Area | Status | Risk Level | Review Date |
| --- | --- | --- | --- | --- |
| DELTA-001 | LLM routing and SDK gateway | active | medium | 2026-03-31 |
| DELTA-002 | Channel strategy (web chat first) | active | medium | 2026-04-15 |
| DELTA-003 | Structured data store (Supabase-first) | active | high | 2026-03-31 |
| DELTA-004 | Connection execution stack (hybrid: Composio + MCP + Direct API) | active | medium | 2026-03-31 |
| DELTA-005 | Tool surface shape (v1 reduced/custom layer) | active | high | 2026-03-31 |
| DELTA-006 | Trigger implementation details | active | medium | 2026-03-31 |
| DELTA-007 | System prompt adaptation for vertical product | active | medium | 2026-03-24 |
| DELTA-008 | Skills packaging and loading method | active | medium | 2026-03-24 |
| DELTA-009 | Search/browser provider mix | active | medium | 2026-03-31 |
| DELTA-010 | Outbound message channel implementation | active | medium | 2026-04-15 |
| DELTA-011 | Cost hard ceiling policy | active | medium | 2026-03-31 |
| DELTA-012 | Vertical scope and wave gating | active | low | 2026-04-15 |
| DELTA-013 | Artifact rollback/versioning policy | proposed | medium | 2026-03-24 |
| DELTA-014 | Run observability schema depth | active | medium | 2026-03-31 |
| DELTA-015 | v2 personalization memory + recommend-only skill compounding | active | medium | 2026-05-15 |
| DELTA-016 | Bounded customization contract (skills-first, policy-guarded) | active | medium | 2026-05-31 |

---

## Detailed Delta Entries

### DELTA-001 - LLM Routing and SDK Gateway

- **Area:** LLM invocation path
- **Status:** active
- **Tasklet baseline:** Tasklet runs stateless invocations and tool-calling, but does not lock users into one public router strategy.
- **Sunder change:** Use one router in v1: OpenRouter with a named-model set routed by `llm-gateway.ts` (no `openrouter/auto` in production).
- **Reason:** KISS for speed. One integration path lowers engineering overhead while launching.
- **Risk:** Escalation thresholds may choose heavier models too often, causing cost spikes or latency swings.
- **Early warning signals:**
  1. Per-run cost trend rises for routine CRM tasks.
  2. P95 response latency drifts above chat UX target.
  3. Quality inconsistency across similar requests.
- **Rollback plan:**
  1. Tighten routing thresholds and reduce Tier 3 usage behind the same gateway wrapper.
  2. If still unstable, introduce profile-level routing (`cheap-ops`, `deep-reasoning`).
  3. If still unstable, move selected workloads to direct provider endpoints.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/core-architecture/01-core-runtime-model.md`
  - `references/tasklet/core-architecture/06-cost-model-and-optimization.md`

### DELTA-002 - Channel Strategy (Web Chat First)

- **Area:** User-facing channel rollout
- **Status:** active
- **Tasklet baseline:** Tasklet has built-in contact and message primitives supporting email/text-style delivery and autonomous notices.
- **Sunder change:** Launch with web chat first; WhatsApp channel comes later after core quality is stable.
- **Reason:** Reduce delivery-channel instability and debug complexity in v1.
- **Risk:** Slower adoption for users who prefer messaging-native workflows from day one.
- **Early warning signals:**
  1. Activation drop-off due to channel mismatch.
  2. Pilot users repeatedly ask for WhatsApp early.
- **Rollback plan:**
  1. Add WhatsApp as a thin adapter into the same runner.
  2. Keep runner unchanged; only add channel transport and mapping.
- **Review date:** 2026-04-15
- **Tasklet references:**
  - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`

### DELTA-003 - Structured Data Store (Supabase-First)

- **Area:** Persistent structured state
- **Status:** active
- **Tasklet baseline:** Agent uses built-in SQL memory surface via tool contracts managed inside Tasklet runtime pattern.
- **Sunder change:** Use Supabase as primary structured data system (CRM entities, run metadata, triggers, approvals) with tenant isolation.
- **Reason:** Product dashboard and SaaS operations need shared SQL analytics and multi-tenant controls.
- **Risk:** Cross-tenant leakage if policy configuration is wrong; operational complexity is higher than local isolated DB.
- **Early warning signals:**
  1. Any RLS policy test failure.
  2. Dashboard/report mismatches vs run logs.
  3. Elevated query latency at peak usage.
- **Rollback plan:**
  1. Move sensitive workflow caches to per-client runtime DB/files.
  2. Keep Supabase for core product entities only.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/core-architecture/02-state-surfaces-system-vs-agent.md`
  - `references/tasklet/persistence-and-cron/01-persistence-model.md`

### DELTA-004 - Connection Execution Stack (Hybrid: Composio + MCP + Direct API)

- **Area:** Third-party app connectivity
- **Status:** active
- **Tasklet baseline:** Built-in connection lifecycle tools (discover, create, activate tools with approval, reauthorize).
- **Sunder change:** Keep Tasklet connection lifecycle and type model (`integrations`, `mcp`, `direct_api`) with Composio as integration marketplace plus managed allowlist paths for MCP and Direct API in v1.
- **Reason:** Preserve near-zero lifecycle drift while reducing v1 security/reliability risk from arbitrary endpoints.
- **Risk:** Allowlist ops overhead can slow long-tail service coverage.
- **Early warning signals:**
  1. Rising count of blocked connection requests due to missing allowlist entries.
  2. Increased time-to-first-success for users needing unsupported tools.
  3. High auth failure or reauth loops on approved providers.
- **Rollback plan:**
  1. Expand allowlist coverage via templated MCP/Direct API packs.
  2. For critical flows, add direct provider adapters with strict contracts.
  3. If guardrails prove stable, graduate selected low-risk categories to self-serve in v2.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/tools/built-in/23-list_users_connections.md`
  - `references/tasklet/tools/built-in/24-get_details_for_connections.md`
  - `references/tasklet/tools/built-in/27-manage_activated_tools_for_connections.md`
  - `references/tasklet/tools/built-in/28-reauthorize_connection.md`
  - `references/tasklet/tools/built-in/30-create_new_connections.md`
  - `references/tasklet/skills-system/03-creating-connections-skill.md`

### DELTA-005 - Tool Surface Shape (v1 Reduced/Custom Layer)

- **Area:** Tool list and naming compatibility
- **Status:** active
- **Tasklet baseline:** 30 built-in + connection tools with explicit schema contracts and conventions.
- **Sunder change:** v1 starts with a smaller custom tool bridge focused on required business capabilities, then expands.
- **Reason:** Ship faster while covering MVP workflows.
- **Risk:** Losing portability of Tasklet prompt patterns if semantics drift too far.
- **Early warning signals:**
  1. Prompt instructions become tool-name brittle.
  2. Repeated failures from schema mismatch.
  3. New workflows require many ad hoc tool exceptions.
- **Rollback plan:**
  1. Align Sunder tool names and schemas to Tasklet-equivalent contracts.
  2. Add compatibility aliases for legacy names.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/tools/00-complete-tasklet-tool-definitions-verbatim.md`
  - `references/tasklet/core-architecture/03-tool-system-and-execution-flow.md`

### DELTA-006 - Trigger Implementation Details

- **Area:** Scheduler and trigger mechanics
- **Status:** active
- **Tasklet baseline:** Trigger lifecycle uses discover -> setup -> manage (including simulate), each firing a fresh invocation.
- **Sunder change:** Internal scheduler and trigger storage are implemented in Sunder services, but behavior should mimic Tasklet semantics.
- **Reason:** Own control plane and SaaS-level observability.
- **Risk:** Team forgets to preserve simulate/test and preflight sequence, reducing reliability.
- **Early warning signals:**
  1. Triggers fail immediately after setup.
  2. No reproducible simulation path.
- **Rollback plan:**
  1. Add explicit API endpoints mirroring Tasklet trigger operations.
  2. Enforce setup checklist gate before activation.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/persistence-and-cron/03-cron-trigger-execution-semantics.md`
  - `references/tasklet/tools/built-in/15-search_triggers.md`
  - `references/tasklet/tools/built-in/16-setup_trigger.md`
  - `references/tasklet/tools/built-in/17-manage_active_triggers.md`

### DELTA-007 - System Prompt Adaptation For Vertical Product

- **Area:** System prompt content
- **Status:** active
- **Tasklet baseline:** Prompt includes strict sections for context management, subagents, triggers, notifications, and task-driven working style.
- **Sunder change:** Prompt is adapted for real-estate workflows, product policy, cost constraints, and Sunder provider stack. v1 also locks a simple identity/profile/memory contract:
  1. One `SOUL.md` per client workspace (assistant personality only).
  2. One `USER.md` per client workspace (stable user profile/preferences only).
  3. `MEMORY.md` + `memory/*.md` remain evolving facts/history only.
  4. If `SOUL.md` is missing, use default personality.
  5. If `USER.md` is missing, use empty profile fallback.
  6. `SOUL.md` and `USER.md` are manual-edit only (no assistant auto-edit).
- **Reason:** Product-specific behavior and trust standards.
- **Risk:** Accidentally dropping critical baseline sections (for example truncation recovery behavior), or mixing ownership boundaries between personality, user profile, and memory.
- **Early warning signals:**
  1. Agent ignores/forgets recovery paths during large tool outputs.
  2. More policy failures in autonomous runs.
  3. Personality drift or user-profile drift across runs/clients.
- **Rollback plan:**
  1. Keep a section-by-section parity checklist against Tasklet wholesale prompt.
  2. Restore missing baseline sections first, then re-apply Sunder-specific content.
  3. Fall back to default personality + empty profile contract and disable custom `SOUL.md`/`USER.md` loading if drift incidents spike.
- **Review date:** 2026-03-24
- **Tasklet references:**
  - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`

### DELTA-008 - Skills Packaging and Loading Method

- **Area:** Skills deployment
- **Status:** active
- **Tasklet baseline:** Read-only skills live in a structured filesystem path and guide behavior.
- **Sunder change:** Same concept, but skills are managed through Sunder repo/runtime packaging and mounted into client runtime.
- **Reason:** CI/CD and versioned release process.
- **Risk:** Runtime path mismatches or stale skill versions across clients.
- **Early warning signals:**
  1. Client runtimes show different behavior under same release tag.
  2. Missing skill file incidents in production.
- **Rollback plan:**
  1. Force a single canonical skills bundle with checksum verification.
  2. Fall back to exact Tasklet path conventions in runtime.
- **Review date:** 2026-03-24
- **Tasklet references:**
  - `references/tasklet/skills-system/01-skills-system-overview.md`
  - `references/tasklet/skills-system/02-building-preview-apps-skill.md`
  - `references/tasklet/skills-system/03-creating-connections-skill.md`

### DELTA-009 - Search/Browser Provider Mix

- **Area:** Web retrieval and browser automation
- **Status:** active
- **Tasklet baseline:** Built-in search/scrape primitives and optional connection-based tools.
- **Sunder change:** Explicit provider stack: Brave + Exa + Browserbase + Firecrawl (per current v1 policy).
- **Reason:** Better control over quality/cost for targeted workflows.
- **Risk:** Vendor coupling and uneven failure patterns across providers.
- **Early warning signals:**
  1. Frequent provider-specific outages.
  2. Significant quality variance across the same query class.
- **Rollback plan:**
  1. Route non-critical queries through alternate provider path.
  2. Reduce dependency by narrowing default provider set.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/core-architecture/03-tool-system-and-execution-flow.md`

### DELTA-010 - Outbound Message Channel Implementation

- **Area:** Autonomous user notifications and outbound sends
- **Status:** active
- **Tasklet baseline:** Strong built-in primitives for owner/contact messaging and clear autonomous-notify policy.
- **Sunder change:** Product-level channel implementation is staged; some outbound channels are deferred by wave.
- **Reason:** Keep launch scope manageable while avoiding unsafe sends.
- **Risk:** Silent failure if notification channel is not consistently available.
- **Early warning signals:**
  1. Trigger failures without user-visible notices.
  2. Support tickets indicating missed automation.
- **Rollback plan:**
  1. Implement minimum guaranteed owner-notify path first.
  2. Block autonomous trigger activation unless fail-notify channel is configured.
- **Review date:** 2026-04-15
- **Tasklet references:**
  - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`

### DELTA-011 - Cost Hard Ceiling Policy

- **Area:** Unit economics governance
- **Status:** active
- **Tasklet baseline:** Cost optimization patterns are recommended but no product-specific margin target is enforced by default.
- **Sunder change:** Hard monthly cost ceiling target under $20 per active paid user.
- **Reason:** SaaS viability at planned price point.
- **Risk:** Over-aggressive cost controls may reduce output quality.
- **Early warning signals:**
  1. Quality regressions after cost tuning changes.
  2. Escalation rates spike for manual correction.
- **Rollback plan:**
  1. Relax budget caps for high-value workflows.
  2. Introduce dual routing profile with explicit quality lanes.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/core-architecture/06-cost-model-and-optimization.md`

### DELTA-012 - Vertical Scope and Wave Gating

- **Area:** Product scope
- **Status:** active
- **Tasklet baseline:** General-purpose automation platform pattern.
- **Sunder change:** Vertical-first real-estate scope with wave-based capability rollout governed by built-in services roadmap.
- **Reason:** Faster path to PMF and easier onboarding narrative.
- **Risk:** Attempting too many wave-1 capabilities can still slow launch.
- **Early warning signals:**
  1. Sprint slip due to integration breadth.
  2. Pilot completion rate misses target.
- **Rollback plan:**
  1. Keep architecture broad but narrow pilot capability activation.
  2. Phase-gate non-core automations behind feature flags.
- **Review date:** 2026-04-15
- **Tasklet references:**
  - `references/tasklet/core-architecture/10-summary-mental-model.md`

### DELTA-013 - Artifact Rollback/Versioning Policy

- **Area:** Change safety for skills/config/subagents
- **Status:** proposed
- **Tasklet baseline:** No native rollback guarantee if runtime artifacts are overwritten.
- **Sunder change:** Add product-level artifact versioning and rollback process (Git-backed or snapshot-backed).
- **Reason:** Production support needs safe, fast reversions.
- **Risk:** Extra process overhead if implemented poorly.
- **Early warning signals:**
  1. Hotfixes cause regressions with no quick restore path.
  2. Team avoids updates due to fear of breaking runs.
- **Rollback plan:**
  1. If full versioning is delayed, enforce nightly snapshots + restore script as stopgap.
- **Review date:** 2026-03-24
- **Tasklet references:**
  - `references/tasklet/core-architecture/08-feedback-loop-and-fix-cycle.md`
  - `references/tasklet/core-architecture/09-non-goals-and-limitations.md`

### DELTA-014 - Run Observability Schema Depth

- **Area:** Run logs and status model
- **Status:** active
- **Tasklet baseline:** Recommends detailed run sequence logs and terminal status including `success`, `partial`, `failed`.
- **Sunder change:** Mission Control will expose expanded run health views and ops-oriented diagnostics for SaaS operations.
- **Reason:** Multi-client support requires stronger operational visibility than ad hoc logs.
- **Risk:** If schema is inconsistent, dashboards become noisy or misleading.
- **Early warning signals:**
  1. Unknown/uncategorized failures increase over time.
  2. Support cannot map incidents to run records quickly.
- **Rollback plan:**
  1. Collapse logs to minimal canonical fields until consistency is restored.
  2. Re-expand only after schema contract tests pass.
- **Review date:** 2026-03-31
- **Tasklet references:**
  - `references/tasklet/complex-multi-integration-workflow/05-trigger-run-execution-trace.md`
  - `references/tasklet/complex-multi-integration-workflow/06-edge-case-and-partial-failure-policy.md`

### DELTA-015 - v2 Personalization Memory + Recommend-Only Skill Compounding

- **Area:** Personalization behavior and user-specific automation growth
- **Status:** active
- **Tasklet baseline:** Tasklet provides persistent files/SQL/skills patterns, but does not prescribe a strict product-level policy requiring recommendation-first approvals for memory and skill updates.
- **Sunder change:** In v2, Sunder uses a `UserMemories` contract (read every run), a weekly pattern detector, and a strict `recommend-only` policy. Memory edits and new reusable skills require explicit user approval before create/activate.
- **Reason:** Increase personalization and retention while keeping user trust and control high.
- **Risk:** If recommendation UX is weak, users may ignore suggestions and personalization quality may stagnate.
- **Early warning signals:**
  1. Low user approval rate on memory/skill recommendations.
  2. Repeat questions from users that should have been captured in memory.
  3. User complaints about too many recommendations or low recommendation quality.
- **Rollback plan:**
  1. Reduce cadence from weekly to bi-weekly for low-engagement users.
  2. Limit recommendations to memory edits first; keep skill creation manual until quality improves.
  3. Keep `recommend-only` guardrail in place (no silent auto-updates).
- **Review date:** 2026-05-15
- **Tasklet references:**
  - `references/tasklet/persistence-and-cron/01-persistence-model.md`
  - `references/tasklet/skills-system/01-skills-system-overview.md`
  - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`
- **Sunder reference inspirations:**
  - `references/Fintool/Fintool Patterns and Features - PM Master List.md`

### DELTA-016 - Bounded Customization Contract (Skills-First, Policy-Guarded)

- **Area:** User-level customization model
- **Status:** active
- **Tasklet baseline:** Tasklet provides system skills and artifact-driven workflow patterns, but does not impose a product-level bounded-customization contract for end-user requested changes.
- **Sunder change:** Sunder allows user customization through guided skills and workflow artifacts, but blocks user-level modification of core runtime/policy surfaces. Reusable customizations require guided interview, plain-language preview, explicit approval, verification summary, and auditable change records.
- **Reason:** Keep the core engine manageable and auditable while still giving users meaningful flexibility.
- **Risk:** If too strict, user customization adoption may stall. If too loose, policy drift and unsafe behavior can increase.
- **Early warning signals:**
  1. Low completion rate for approved customization requests.
  2. Frequent user requests for changes in disallowed policy surfaces.
  3. Incidents where customization bypasses expected approval/audit paths.
- **Rollback plan:**
  1. If adoption is too low, widen allowed customization scope incrementally behind feature flags.
  2. If safety incidents increase, tighten to recommendation-only + manual operator activation for all reusable skills.
- **Review date:** 2026-05-31
- **Tasklet references:**
  - `references/tasklet/skills-system/01-skills-system-overview.md`
  - `references/tasklet/first-run-lifecycle/01-first-run-instructions-and-decision-path.md`
  - `references/tasklet/system-prompt-wholesale/00-system-prompt-wholesale-verbatim.md`
- **Sunder reference inspirations:**
  - `references/openclaw/OpenClaw Patterns and Features - PM Master List.md`

---

## Areas We Intend To Keep Very Close To Tasklet (No Planned Delta)

These are explicitly expected to stay near Tasklet behavior in v1:

1. **Stateless invocation model** (rediscovery over memory).
2. **Subagent execution pattern** (fresh context, final-response-only return).
3. **Trigger fresh-invocation semantics** for recurring automation.
4. **Context truncation recovery behavior** using toolcall artifact recovery.
5. **Determinism hardening approach** (artifacts + deterministic scripts for fragile logic).

If any of the above diverges during implementation, add a new delta entry immediately.

---

## Update Process (Team Rule)

When adding or editing a delta:

1. Add or update the detailed entry first.
2. Update the summary table row.
3. Set a concrete review date.
4. Link the related PR or implementation ticket.
5. If the delta is removed, mark status as `retired` (do not delete history).
