# docs/

Working documents for active implementation. For product specs and architecture decisions, see `roadmap docs/Sunder - Source of Truth/`.

## Source of Truth

> **`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`** — The canonical PR-by-PR execution checklist (30 PRs, 5 phases). This wins on scope, implementation details, and phasing. Check here first for what to build and what's done.

## Structure

```
docs/
├── product/                 ← Sunder AI agent (the SaaS product)
│   ├── plans/               ← Phasing plans
│   │   └── 2026-03-05-implementation-phasing-plan-v2.json  ← SOURCE OF TRUTH
│   ├── tasks/               ← All PR tasklists
│   │   ├── phase-1/         ← PRs 1–12a (done)
│   │   ├── phase-2/         ← PRs 13–20 (done)
│   │   └── *.md             ← Phase 3+ tasklists (in progress / upcoming)
│   ├── designs/             ← Design docs and handover notes per PR
│   ├── references/          ← Architecture comparisons, tool inventories
│   └── reviews/             ← Code reviews
│
├── landing/                 ← Public site: property pages, marketing, data pipeline
│   ├── plans/
│   ├── tasks/
│   ├── competitor-reference/
│   └── ux-audit/
│
└── qa/                      ← Manual QA checklists
```

## Authority Chain

1. **v2 phasing plan** (`docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`) — wins on scope and implementation
2. **App Spec** (`roadmap docs/Sunder - Source of Truth/product-dev/01-App Spec.md`) — product vision/rationale
3. **Architecture Decisions JSON** (`roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`) — technical rationale
4. **Tasklet reference** (`roadmap docs/Sunder - Source of Truth/references/tasklet/`) — default patterns when plan is silent
