# docs/

Working documents for active implementation. For historical product specs and architecture decisions, see `docs/archive/roadmap/Sunder - Source of Truth/`.

## Source of Truth

> **`docs/product/plans/2026-04-13-PR-list-sunder-current.json`** — Current PR/workstream inventory for shipped and remaining product work. Check here first for current state.
>
> **`docs/product/plans/2026-03-05-implementation-phasing-plan-v2-deprecate.json`** is historical and retained for context only.

## Structure

```
docs/
├── product/                 ← Sunder AI agent (the SaaS product)
│   ├── plans/               ← Current PR inventory and historical phasing plans
│   │   └── 2026-04-13-PR-list-sunder-current.json  ← SOURCE OF TRUTH
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
├── archive/                 ← Historical roadmap/reference material
│
└── qa/                      ← Manual QA checklists
```

## Authority Chain

1. **Current PR inventory** (`docs/product/plans/2026-04-13-PR-list-sunder-current.json`) — wins on current scope and implementation state
2. **Deprecated v2 phasing plan** (`docs/product/plans/2026-03-05-implementation-phasing-plan-v2-deprecate.json`) — historical context only
3. **Archived App Spec** (`docs/archive/roadmap/Sunder - Source of Truth/product-dev/01-App Spec.md`) — product vision/rationale
4. **Archived Architecture Decisions JSON** (`docs/archive/roadmap/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`) — technical rationale
