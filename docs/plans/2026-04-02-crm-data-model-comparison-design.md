# CRM Data Model Comparison: Fixed Schema vs Meta-Schema

**Date:** 2026-04-02
**Purpose:** Decision support — evaluate whether to move toward a meta-schema CRM in a future phase
**Drivers:** (1) Potential expansion beyond real estate into other advisory verticals, (2) Understanding the cost of our current fixed-schema approach before it becomes urgent

---

## 1. Context & Motivation

Sunder's CRM currently uses a fixed Postgres schema — hardcoded tables for contacts, companies, deals, tasks, and interactions. This works well for our launch vertical (Singapore real estate advisory), but creates friction if we want to:

- Expand into other advisory verticals (insurance, financial planning) where the core entities differ (Policies, Portfolios, Claims)
- Let power users model domain-specific concepts without waiting on us to ship code

This doc compares our data model to two meta-schema CRMs (Attio/Twenty and DenchClaw) and evaluates three options for increasing flexibility — from a lightweight extension to a full architectural shift.

---

## 2. How the Three Approaches Work

### Sunder (Fixed Schema + Configurable Fields)

Real Postgres tables per entity (`contacts`, `deals`, `companies`). Relationships are hardcoded FKs and a junction table (`deal_contacts`). Each entity has a `custom_fields` JSONB column for per-client extras. A `crm_config` row per client stores vocabulary (stages, types, roles) and `FieldDefinition[]` arrays that control column visibility, order, labels, and types. The agent manages all config via the `configure_crm` tool. Adding a new entity type requires a migration, Zod schemas, agent tools, and UI — roughly a full PR.

Key files:
- `src/lib/crm/config.ts` — CrmVocabConfig, resolveCrmConfig()
- `src/lib/crm/field-definitions.ts` — FieldDefinition type, tiers, defaults
- `src/lib/crm/schemas.ts` — Zod validators for all CRM tables
- `src/lib/crm/build-columns.ts` — buildColumnsFromConfig()
- `src/lib/runner/tools/crm/configure-crm.ts` — agent configurability tool

### DenchClaw (Full Meta-Schema / EAV)

Three core tables: `objects` (entity registry), `fields` (field definitions per object), `entries` + `entry_fields` (EAV data storage — all values stored as VARCHAR strings). Relationships are first-class `relation` fields with `related_object_id` and `relationship_type`. No migrations needed to add entities or fields — just insert rows. Auto-generated PIVOT views flatten the EAV into tabular format for queries. Filesystem YAML projections mirror DB state for local-first sidebar rendering.

Key tables:
- `objects` — entity type registry (name, icon, default_view)
- `fields` — field definitions per object (type, enum_values, related_object_id, relationship_type)
- `entries` — generic records keyed by object_id
- `entry_fields` — EAV data (entry_id, field_id, value as VARCHAR)

### Attio/Twenty (Full Meta-Schema / Normalized)

Similar to DenchClaw conceptually — `objects`, `fields`, `records` tables — but typically stores data in typed columns or JSONB rather than pure EAV. More mature query engines, built-in computed fields, and user-facing schema editors.

---

## 3. Tradeoff Analysis

| Dimension | Fixed Schema (Sunder) | Meta-Schema (DenchClaw / Attio) |
|---|---|---|
| **Adding a new entity** | Migration + schemas + tools + UI (~1 PR) | Insert rows into `objects` + `fields` (minutes, zero deploy) |
| **Query performance** | Direct table scans, standard indexes, Postgres does the work | EAV requires JOINs or PIVOT views; degrades with field count. Attio mitigates with materialized views |
| **Type safety** | Full — Zod schemas, TypeScript types, Supabase codegen | Weak — all values are strings, validation lives in app layer |
| **Filtering & sorting** | PostgREST native operators, index-backed | Custom query builder needed; EAV filtering is complex (DenchClaw solves with PIVOT views) |
| **RLS / tenant isolation** | `client_id` on every table, Postgres RLS policies | Must apply RLS across `objects`, `fields`, `entries`, `entry_fields` — more surface area for bugs |
| **Schema consistency** | Guaranteed — every client has the same tables | Drift risk — each client's object graph can diverge, making cross-client analytics harder |
| **Multi-vertical support** | Requires us to anticipate and ship each entity type | Users/agent creates entity types on demand |
| **Data integrity** | FK constraints, NOT NULL, CHECK constraints at DB level | App-level validation only — DB sees VARCHAR everywhere |
| **Migration complexity** | Standard Supabase migrations | No migrations for schema changes, but PIVOT views must be regenerated |
| **Agent tool surface** | One tool per operation per entity (manageable) | Generic CRUD tools work for any object (simpler tool set, but less type-safe tool descriptions) |

The core tension: **fixed schema trades flexibility for safety and performance.** Meta-schema trades the reverse.

---

## 4. Three Options for Sunder

### Option 1 — Lightweight Flex (~3-4 PRs)

Keep contacts, companies, and deals as real tables. Add a single `custom_records` table with JSONB data, keyed by a `custom_entity_type_id` that references a new entry in `crm_config`. Users define new entity types (e.g. "Properties", "Policies") through the agent via `configure_crm`, which stores the entity name, icon, and a `FieldDefinition[]` array — the same system we already use.

The UI renders custom entities using `buildColumnsFromConfig()` with a generic list page. Relations from custom entities to core entities (and to other custom entities) use a `custom_record_relations` junction table.

**What you get:** Users can model additional entity types per vertical with relations to core and custom entities. **Engineering lift:** Smallest delta from where we are — the FieldDefinition work we just shipped is the foundation.

### Option 2 — Hybrid Meta-Schema (~8-12 PRs)

Core entities stay as real tables. Alongside them, add `objects`, `object_fields`, and `records` tables (DenchClaw-style). Custom entities live in the meta-schema; core entities are registered in `objects` but their data stays in real tables. A unified relation system links anything to anything. Agent tools become generic (`create_record`, `update_record`) for custom entities while core entity tools stay typed.

**What you get:** Unlimited custom entities, cross-entity relations, a single query/filter system. **What you don't get:** The performance and type safety of real tables for custom entities.

### Option 3 — Full Meta-Schema (~20-30 PRs)

Migrate everything into `objects` / `fields` / `records`. All entities — including contacts, companies, deals — become rows in a generic system. Essentially a ground-up CRM rewrite with data migration for existing clients.

---

## 5. Recommendation

**Option 1 (Lightweight Flex)** is the right next step. Three reasons:

1. **We already built the hard part.** The `FieldDefinition` system, `buildColumnsFromConfig()`, field renderers, and `configure_crm` tool are all in place. A `custom_records` table with JSONB + a generic list page is a natural extension — not a new system.

2. **We don't have user signal yet.** We haven't launched multi-vertical. Building a full meta-schema before we know whether users actually need 2 custom entities or 20 is premature. Option 1 lets us ship, learn, and upgrade to Option 2 later if needed.

3. **The migration path is clean.** If Option 1 proves insufficient, the `custom_records` table maps directly onto the `records` table in Option 2. Field definitions are already normalized. Moving from Option 1 to Option 2 is additive, not a rewrite.

**When to revisit:** If we see 3+ customers asking for entity types we can't serve with the fixed schema + custom entities, or if we decide to build a self-serve schema editor UI, that's the trigger for Option 2.

---

## 6. Unresolved Questions

- Should custom entities support the same `custom_fields` JSONB escape hatch that core entities have, or is the `FieldDefinition` array sufficient?
- How do we handle custom entity data in the agent's system prompt context? (today we inject CRM config for core entities only)
- Do custom entities need their own detail drawer, or can we reuse the contact/deal drawer pattern with a generic renderer?
- Should `configure_crm` manage custom entity types, or do we want a separate `create_object_type` tool?
