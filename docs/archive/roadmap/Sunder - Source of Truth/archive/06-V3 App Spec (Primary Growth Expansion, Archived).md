# Sunder - AI Orchestration SaaS (v3) App Specification

> **Version:** 3.0 (Growth Expansion Spec)
> **Last Updated:** February 23, 2026
> **Status:** Primary Growth Direction (Post-v2)
> **Depends on:** `01-V1 App Spec (Primary Baseline).md`, `02-V2 App Spec (Primary Channel Launch).md`

---

## Purpose

This document defines the **post-v2 growth direction**.

1. v3 work must not silently change v1/v2 core runtime contracts.
2. v3 initiatives should start only after explicit approval and owner assignment.
3. v3 initiatives should be phased so they do not destabilize live v2 channel operations.

---

## v3 Scope Boundary

1. v3 is growth scope after the v2 channel launch baseline is stable.
2. v3 initiatives are not launch blockers for v2.
3. If a v3 initiative changes core runner behavior, safety policy, data boundaries, or cost policy, architecture review is required first.

---

## Growth Pillar A: Managed Lead-Generation Pipeline

### Why it exists

Some high-volume lead-generation requests are too large for normal chat runs.

### User experience goal

1. User requests a large lead-generation job in chat.
2. Sunder gathers scope with a short intake form.
3. User reviews and approves scope and limits.
4. Job runs in background.
5. User sees progress and final delivery summary in the same product surfaces.

### Execution backbone

The v1 three-lane scraping architecture (documented in `BUILT-IN-SERVICES.md`) provides the infrastructure for managed lead-gen:
- **Lane 1 (known-site scrapers):** Apify/RapidAPI for high-volume scraping of known platforms (LinkedIn, PropertyGuru, directories).
- **Lane 2 (open-ended scraping):** Scrapling + flat-rate LLM (MiniMax) in Vercel Sandbox for arbitrary sites. Background job via Trigger.dev.
- **Lane 3 (interactive browser):** Stagehand + Browserbase for form fills and login-gated automation.

Managed lead-gen jobs compose across these lanes — e.g., scrape a directory (Lane 2), enrich profiles via LinkedIn (Lane 1), then fill application forms (Lane 3).

### Guardrails (must hold)

1. This is not a second assistant architecture.
2. Core assistant behavior remains unchanged.
3. Results must map back to existing run, task, and approval visibility.
4. Every run must be auditable with clear scope, source, and outcome records.

---

## Growth Pillar B: Mobile Discovery

### Why it exists

Mobile may improve responsiveness for users who work on the go.

### Discovery output required before build

1. Clear mobile use cases that cannot be met well in messaging channels.
2. Minimal feature cut for pilot.
3. Auth/session flow aligned with current web behavior.
4. Cost and support impact estimate.
5. Go/no-go recommendation with success metrics.

### Guardrails (must hold)

1. Mobile must use the same core backend, approvals, and data rules as web and channels.
2. Mobile must not create a parallel orchestration path.

---

## Growth Pillar C: Personalization Growth Loop

### Why it exists

Users may benefit from suggestions based on repeated behavior over time. v1 already auto-writes memory observations during conversations and uses the synthesis pulse for cleanup/review. v3 extends this by adding proactive skill suggestions based on accumulated memory and behavioral patterns.

### User experience goal

1. Sunder's synthesis pulse (already running) detects higher-order patterns across daily changelogs and memory entries.
2. When patterns suggest a reusable workflow, Sunder suggests a skill with clear reasoning.
3. User reviews skill suggestions in plain language.
4. User approves or declines each skill suggestion.
5. Memory auto-writes continue as in v1/v2 — no approval gate for memory. Skill activation is the only approval-gated action.

### Guardrails (must hold)

1. Memory auto-writes remain ungated (established in v1). Skill suggestions remain recommendation-only.
2. Explicit user approval required before skill create/activate.
3. Full audit record for every approved skill change.

---

## Growth Pillar D: Skills Marketplace and Community Workflows

### Why it exists

Domain expertise is the real moat — not the model, not the harness. Shortcut AI's skills library (reverse-engineered by Fintool, Feb 2026) demonstrates compounding adoption: community-created workflows encoding years of domain knowledge that make the agent better at narrow tasks than a general-purpose agent ever could. Install counts create trust signals that drive further adoption.

Sunder v1/v2 already has the bones: bounded customization, guided interviews, explicit approval, reusable skills, and auditable change records. What's missing is the marketplace layer — discovery, sharing, and community validation on top.

### Reference

`../references/Fintool/nicbustamante-reverse-engineering-excel-ai-agents-FULL.md` — section on Shortcut's Skills Marketplace.

### User experience goal

1. Users discover and install pre-built domain workflows (e.g., property valuation templates, lease comparison checklists, client follow-up sequences).
2. Users can publish their own approved skills for community use.
3. Install counts and usage metrics create trust signals for new users.
4. Skills encode domain-specific knowledge as structured, reusable agent workflows — not just prompt templates.

### What makes this defensible

1. Each skill encodes domain expertise that took years to develop.
2. Install counts compound: more installs → more validation → more adoption.
3. User data compounds: formatting conventions, templates, workflow patterns.
4. Switching cost increases with every skill a user depends on.

### Guardrails (must hold)

1. Skills must go through the same bounded customization contract from v1/v2: guided review, explicit approval, no silent activation.
2. Community skills must be auditable and sandboxed — no access to safety policy, channel policy, or core tool schemas.
3. Skills must not create parallel orchestration paths or bypass the single-runner model.
4. Publish flow requires review gate before community visibility.

---

## Entry Criteria for Any v3 Initiative

An initiative can move from planning to active build only when all are true:

1. Clear user problem and expected outcome are documented.
2. Owner and success metrics are assigned.
3. Scope is split into safe phases.
4. Risk and rollback plan are documented.
5. Explicit approval is recorded in source-of-truth docs.

---

## Suggested v3 Sequencing

1. Phase 1: managed lead-generation pilot with strict approval and audit controls.
2. Phase 2: mobile discovery decision package (go/no-go).
3. Phase 3: personalization growth loop rollout with recommendation-only defaults.
4. Phase 4: skills marketplace discovery and community workflow layer.

---

## Coherence Rules Across v1, v2, v3

1. v1 remains the core baseline for runtime contracts unless v2/v3 explicitly override with approval.
2. v2 remains the active channel launch behavior contract.
3. v3 extends product scope without introducing a second assistant architecture.
4. Any Tasklet deviation introduced by v3 must be added to `../architecture/01-Tasklet Delta Register.md`.
