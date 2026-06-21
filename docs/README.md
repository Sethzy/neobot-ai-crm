# docs/

Working documents for active implementation. The historical archive still uses
the former Sunder name in some paths because those files preserve original
planning context.

## Source of Truth

> **`docs/product/plans/2026-04-13-PR-list-neobot-current.json`** — Current PR/workstream inventory for shipped and remaining product work. Check here first for current state.
>
> **`docs/product/plans/2026-03-05-implementation-phasing-plan-v2-deprecate.json`** is historical and retained for context only.

## Structure

```
docs/
├── product/                 ← NeoBot AI CRM workspace
│   ├── plans/               ← Current PR inventory and selected historical plans
│   │   └── 2026-04-13-PR-list-neobot-current.json  ← SOURCE OF TRUTH
│   ├── tasks/               ← PR tasklists
│   │   ├── phase-1/         ← PRs 1–12a (done)
│   │   ├── phase-2/         ← PRs 13–20 (done)
│   │   └── *.md             ← Phase 3+ tasklists (in progress / upcoming)
│   ├── designs/             ← Design docs and handover notes per PR
│   ├── references/          ← Architecture comparisons, tool inventories
│   └── reviews/             ← Code reviews
│
├── landing/                 ← Public site: property pages and data pipeline
│   ├── plans/
│   ├── tasks/
│   └── competitor-reference/
│
├── archive/                 ← Historical roadmap/reference material, non-authoritative
│
└── qa/                      ← Manual QA checklists
```

## Authority Chain

1. **Current PR inventory** (`docs/product/plans/2026-04-13-PR-list-neobot-current.json`) — wins on current scope and implementation state.
2. **Runtime architecture** (`docs/architecture.md` and `../AGENTS.md`) — wins on current runtime boundaries, compatibility names, and deployment assumptions.
3. **Current product docs** (`docs/product/tasks/`, `docs/product/designs/`, `docs/product/audits/`, `docs/qa/`) — implementation evidence and QA state.
4. **Historical archive** (`docs/archive/`) — rationale and old research only. It does not override shipped code or the current PR inventory.
