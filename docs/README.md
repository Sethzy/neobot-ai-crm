# docs/

Working documents for active implementation, split by workstream. For product specs and architecture decisions, see `roadmap docs/Sunder - Source of Truth/`.

## Structure

```
docs/
├── product/                 ← Sunder AI agent (the SaaS product)
│   ├── plans/
│   │   ├── ...implementation-phasing-plan.json   ← Checkable task list (48 PRs, 5 phases)
│   │   └── ...implementation-phasing-plan.md     ← Prose version (superseded by JSON)
│   └── tasks/               ← (future product task lists go here)
│
├── landing/                 ← Public site: property pages, marketing, data pipeline
│   ├── plans/
│   │   ├── property-data-plan.md                 ← Data pipeline (CEA, HDB, URA ingestion)
│   │   └── property-ui-handover.md               ← Property pages polish spec
│   ├── tasks/
│   │   ├── 2026-03-01-market-data-hub-tasklist.md ← Market hub restructure
│   │   └── 2026-02-25-nextjs-performance-optimization-tasklist.md
│   ├── competitor-reference/                     ← OpenAgent.sg feature parity targets
│   └── ux-audit/                                 ← Current UI state screenshots
│
└── README.md               ← You are here
```

## How this relates to `roadmap docs/`

| Folder | Purpose | Audience |
|--------|---------|----------|
| `roadmap docs/Sunder - Source of Truth/` | Product spec, architecture decisions, reference materials | Product + architecture decisions |
| `docs/product/` | Sunder AI implementation plans and task lists | Day-to-day product dev |
| `docs/landing/` | Property pages, marketing site, data pipeline | Day-to-day landing page dev |

Authority chain: App Spec > Architecture Decisions JSON > Implementation Plan > Everything else. See `roadmap docs/Sunder - Source of Truth/00-START-HERE (PM-Friendly).md` for the full read order.
