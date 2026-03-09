# Handover: CRM Tool Consolidation

**Date:** 2026-03-09
**Author:** Seth + Claude
**For:** Reviewer with zero context on this project

---

## What this is

A design to consolidate 28 CRM agent tools down to 11 (10 callable + 1 moved to passive context). The agent is an AI assistant for solo real estate agents in Singapore. It has a CRM (contacts, companies, deals, tasks, interactions) and the LLM interacts with it via tools.

The current 28 CRM tools have massive overlap — e.g., `search_companies`, `search_contacts`, `search_deals` are the same operation with different table names. This hurts model performance (more tools = more decision points = worse accuracy).

---

## The design doc

**Read this first:**
- `docs/designs/crm-tool-consolidation.md` — full design with tool schemas, response shapes, justifications, migration map, safety analysis, and implementation order

---

## Current implementation (what's being replaced)

All under `src/lib/runner/tools/crm/`:

| File | Tools | What it does |
|------|-------|-------------|
| `companies.ts` | `search_companies`, `create_company`, `update_company`, `batch_create_companies` | CRUD for companies |
| `contacts.ts` | `search_contacts`, `create_contact`, `update_contact`, `batch_create_contacts` | CRUD for contacts, with intra-batch dedup |
| `deals.ts` | `search_deals`, `create_deal`, `update_deal`, `batch_create_deals` | CRUD for deals |
| `interactions.ts` | `search_interactions`, `create_interaction` | Append-only interaction log |
| `tasks.ts` | `search_tasks`, `create_task`, `update_task` | CRM follow-up tasks |
| `deal-contacts.ts` | `link_contact_to_deal`, `unlink_contact_from_deal`, `get_deal_contacts`, `get_contact_deals` | Many-to-many deal↔contact junction table |
| `company-links.ts` | `link_contact_to_company`, `unlink_contact_from_company`, `link_deal_to_company`, `unlink_deal_from_company`, `get_company_contacts`, `get_company_deals` | FK-based company links |
| `schema.ts` | `describe_crm_schema` | Returns CRM config (stages, types, custom fields) — no DB access |
| `configure-crm.ts` | `configure_crm` | Setup-mode-only schema configuration — **untouched by this consolidation** |
| `index.ts` | — | Factory orchestration, mode/permission gating |
| `filter-utils.ts` | — | Shared ILIKE, date normalization, search expression builders |
| `custom-fields.ts` | — | Deep-merge logic for custom field patches |

Supporting files:
- `src/lib/crm/config.ts` — CRM vocabulary config (stages, types, industries, custom field schemas)
- `src/lib/crm/schemas.ts` — Zod validators for all CRM tables
- `src/lib/crm/postgrest-filters.ts` — PostgREST ILIKE/search expression builders
- `src/lib/runner/tools/utility/sql.ts` — existing read-only SQL tool (`run_agent_memory_sql`) — the `crm_sql` tool extends this pattern
- `docs/agent-tools-inventory.md` — full inventory of all 52 agent tools (not just CRM)

---

## Reference material that informed the design

These are the articles and analysis docs we read to arrive at the two-tier architecture. The design doc traces specific decisions back to these sources.

### Vercel references (`roadmap docs/Sunder - Source of Truth/references/vercel/`)

| File | Key takeaway |
|------|-------------|
| `00-agents-md-outperforms-skills-verbatim.md` | Passive context (AGENTS.md) achieves 100% success vs 53-79% for active skill retrieval. "No decision point" principle. → This is why `describe_crm_schema` moves to system-reminder instead of staying a tool. |
| `01-analysis-tasklet-already-does-this.md` | Analysis of how our reference product (Tasklet) already uses the passive context pattern via system-reminders. Maps Vercel's findings to our architecture. |
| `02-removed-80pct-agent-tools-verbatim.md` | Vercel d0 case study: removed 80% of tools → 100% success (was 80%), 3.5x faster, 37% fewer tokens. "Addition by subtraction is real." → Primary motivation for consolidation. |

### Fintool / Nicolas Bustamante (`roadmap docs/Sunder - Source of Truth/references/Fintool/`)

| File | Key takeaway |
|------|-------------|
| `nicbustamante-reverse-engineering-excel-ai-agents-FULL.md` | Reverse-engineering of Microsoft, Shortcut, and Claude Excel agents. **Critical article for the final design decision.** Findings: (1) Two-tier pattern (safe structured tools + escape hatch) is universal across all mature agents. (2) "Tool-enforced safety > behavioral safety" — if safety depends on the model choosing to do it, eventually it won't. (3) Auto-verification: bake verification data into tool responses. → This is why we use structured Tier 1 tools for writes (not raw SQL), and why `crm_sql` is read-only. |

### Agent SDKs and harnesses (`roadmap docs/Sunder - Source of Truth/references/agent SDKs and harnesses/`)

| File | Key takeaway |
|------|-------------|
| `agent-harness-is-the-real-product.md` | Survey of Claude Code (~18 tools), Cursor, Manus (~29 tools), SWE-Agent. Same model scores 42% vs 78% depending on harness. "Primitives over integrations." → Why we consolidate to fewer, more general tools. |
| `context-engineering-landscape.md` | Manus KV-cache patterns, Cursor's 46.9% token reduction with lazy loading, the 40% context window "dumb zone" rule. → Why fewer tool definitions = better attention budget. |
| `agent-architecture-checklist.md` | 69-item checklist. Key items: #7 (primitives over integrations), #8 (lean tools, no overlap), #9 (tool count — worry past ~25), #10 (consistent naming). → Direct checklist items that the consolidation addresses. |
| `how-to-be-a-world-class-agentic-engineer.md` | "Less is more", context is everything, strip dependencies. |
| `openai-harness-engineering-codex-agent-first.md` | AGENTS.md as table of contents not encyclopedia, progressive disclosure. |
| `Harness-Model Coupling — Research and Contingency Plan.md` | Confirms Vercel AI SDK is correct for our CRM workloads. |

---

## Key design decisions to validate

1. **28 → 11 tools via two-tier pattern.** Tier 1: structured tools with validation/dedup/custom fields. Tier 2: read-only SQL escape hatch. Is this the right split? Are there CRM operations that fall through both tiers?

2. **`search_crm` replaces 9 tools.** Single tool with `entity` discriminator + `filters` record. Does the `filters: Record<string, string | number | boolean | null>` approach lose important type safety vs. per-entity typed params?

3. **`create_record` and `update_record` use `z.record(z.string(), z.unknown())` for fields.** Validation happens at runtime by dispatching to entity-specific Zod schemas. This trades compile-time type safety for fewer tools. Is this acceptable?

4. **`delete_records` is new (no current equivalent).** Justified by approval gates — destructive actions require user confirmation. Is the `reason` field + batch cap at 50 + approval gate sufficient safety, or do we need additional guardrails (e.g., soft-delete, undo window)?

5. **`describe_crm_schema` → system-reminder passive context.** CRM config injected every turn instead of being a callable tool. This is ~200 bytes of always-on context. Is the tradeoff worth it?

6. **`crm_sql` is separate from `run_agent_memory_sql`.** Could we just improve the existing SQL tool's description instead of adding a new tool? The design argues for separation (different description, `purpose` audit field, future CRM-specific guardrails). Is this justified?

7. **Tasks stay as dedicated `create_task` / `update_task` instead of merging into `create_record` / `update_record`.** Rationale: tasks are the agent's most common autonomous action. Is the 2-tool overhead justified for zero-ambiguity?

---

## Project context (if you need it)

- **Product:** Sunder — AI orchestration SaaS for solo real estate agents in Singapore
- **Tech stack:** Next.js 15 + Vercel AI SDK v6 + Supabase (Postgres + RLS)
- **Source of truth:** `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
- **CLAUDE.md** at repo root has full conventions
- **Current phase:** Phase 1 complete (13 PRs done), Phase 2 in progress
