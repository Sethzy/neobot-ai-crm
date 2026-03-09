# PR15e — CRM read parity + schema introspection

Source of truth update for `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`.

## Goal

Close the highest-value CRM tool gaps that remain after shipped `PR15c` and shipped `PR15d`.

This PR is intentionally small and tool-focused:

- improve read-side parity for activities and relationships
- let the agent inspect the live CRM schema directly
- avoid any new generic record abstraction
- avoid any new destructive tools

## Why this PR exists

The current CRM tool surface is strong on typed writes, but still weaker than leading CRM MCP surfaces on read-side discoverability:

- **Attio MCP** exposes schema introspection (`list-attribute-definitions`)
- **HubSpot MCP** exposes activity retrieval / recent conversations
- **Sunder** can already mutate contacts, deals, tasks, companies, and links, but it still has important blind spots:
  - interactions are write-only from the agent’s perspective
  - there is no tool to inspect the resolved runtime CRM schema
  - relationship reads are asymmetric (`get_deal_contacts` exists, but the inverse directions do not)
  - post-`PR15d`, company linkage exists but is still underpowered on the read side

This PR fixes those gaps without widening scope into semantic search, delete flows, or a larger CRM model redesign.

## Scope

### In scope

1. `search_interactions`
2. `describe_crm_schema`
3. `get_contact_deals`
4. `get_company_contacts`
5. `get_company_deals`
6. `company_id` filters for `search_contacts` and `search_deals`
7. free-text `query` for `search_tasks`
8. runner wiring + tests

### Explicitly out of scope

- semantic search over CRM history
- delete/archive tools
- meetings, emails, call recordings, inbox/conversation tools
- replacing explicit per-entity tools with a generic `search-records` / `create-record` pattern
- reworking the deal data model away from `address` / `price`

## Design decisions

### 1) Keep tools explicit

Do **not** introduce a generic CRM record API. Keep the Sunder pattern of explicit, typed, per-entity tools. This is more verbose than Attio’s generic model, but it is better aligned with the codebase and with the product preference for explicitness over cleverness.

### 2) Read parity first, semantic search later

Add direct query tools for interactions and relationships first. Do **not** jump to embeddings or semantic retrieval. The immediate problem is read coverage, not retrieval sophistication.

### 3) Schema introspection should be runtime-accurate and cheap

`describe_crm_schema` should return the already-resolved `crm_config` that the runner has at startup. Do not add an unnecessary second query path unless implementation constraints force it.

### 4) Preserve setup-mode isolation

`crmMode=setup` should continue to expose only `configure_crm`. None of the new read tools should appear in setup mode.

## Implementation checklist

### PR15e-1 — `search_interactions`

Add a new CRM tool in `src/lib/runner/tools/crm/interactions.ts`.

#### Input schema

- `query?: string`
- `type?: configured interaction type enum`
- `contact_id?: string (uuid)`
- `deal_id?: string (uuid)`
- `occurred_after?: string (ISO datetime or YYYY-MM-DD)`
- `occurred_before?: string (ISO datetime or YYYY-MM-DD)`
- `limit?: number (1-50)`

#### Behavior

- search text against `summary`
- filter by `type`, `contact_id`, and `deal_id`
- filter by `occurred_at >= occurred_after` and `occurred_at <= occurred_before`
- sort by `occurred_at DESC`
- return `{ success, interactions, count }`

#### Notes

- reuse existing timestamp helpers from `filter-utils`
- keep the tool read-only and simple; no update/delete interaction work in this PR

### PR15e-2 — `describe_crm_schema`

Add a new CRM tool, ideally in a small dedicated module such as `src/lib/runner/tools/crm/schema.ts`.

#### Input schema

- no inputs

#### Output shape

Return the resolved runtime schema for the current client, including:

- `deal_label`
- `company_label`
- `deal_stages`
- `contact_types`
- `interaction_types`
- `deal_contact_roles`
- `company_industries`
- `deal_custom_fields`
- `contact_custom_fields`
- `company_custom_fields`
- `task_custom_fields`

#### Notes

- this tool should close over the `config` already passed into the CRM tool factory
- it exists to give the model a queryable source of truth instead of relying only on prompt injection

### PR15e-3 — `get_contact_deals`

Add the inverse of `get_deal_contacts` in `src/lib/runner/tools/crm/deal-contacts.ts`.

#### Input schema

- `contact_id: string (uuid)`

#### Behavior

- query `deal_contacts`
- join basic deal fields
- return:
  - deal record
  - link `role`
  - `is_primary`
- sort primary links first if easy; otherwise keep DB default and document it

#### Notes

- this closes a real symmetry gap in the current CRM tool surface

### PR15e-4 — `get_company_contacts` and `get_company_deals`

Add company relation readers in a small dedicated module such as `src/lib/runner/tools/crm/company-reads.ts`, or colocate with `company-links.ts` if that stays readable.

#### `get_company_contacts`

Input:

- `company_id: string (uuid)`
- `limit?: number (1-50)`

Behavior:

- query `contacts` by `company_id`
- return `{ success, contacts, count }`

#### `get_company_deals`

Input:

- `company_id: string (uuid)`
- `limit?: number (1-50)`

Behavior:

- query `deals` by `company_id`
- return `{ success, deals, count }`

#### Notes

- keep these as two tools, not one polymorphic `get_company_relations`
- explicit tools are easier for the model and match the existing codebase style

### PR15e-5 — extend search tools

#### `search_contacts`

File: `src/lib/runner/tools/crm/contacts.ts`

Add:

- `company_id?: string (uuid)`

Behavior:

- filter contacts by direct FK when provided

#### `search_deals`

File: `src/lib/runner/tools/crm/deals.ts`

Add:

- `company_id?: string (uuid)`

Behavior:

- filter deals by direct FK when provided

#### `search_tasks`

File: `src/lib/runner/tools/crm/tasks.ts`

Add:

- `query?: string`

Behavior:

- free-text search `title` and `description`
- preserve existing `status`, `contact_id`, `deal_id`, and `limit` filters
- preserve current due-date sort

### PR15e-6 — runner wiring

File: `src/lib/runner/tools/crm/index.ts`

Add the new tools to normal mode only:

- `search_interactions`
- `describe_crm_schema`
- `get_contact_deals`
- `get_company_contacts`
- `get_company_deals`

Keep setup mode unchanged:

- `configure_crm` only

If platform instructions or tool guidance need a small update to reflect the new read tools, keep that change minimal and focused.

### PR15e-7 — tests

Add focused tests. Prefer targeted files over broad integration churn.

#### New/updated test files

- `src/lib/runner/tools/crm/__tests__/interactions-read.test.ts`
- `src/lib/runner/tools/crm/__tests__/schema.test.ts`
- `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/company-reads.test.ts`
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- `src/lib/runner/tools/crm/__tests__/index.test.ts`

#### Minimum assertions

`search_interactions`

- query matches summary text
- `type` filter works
- `contact_id` filter works
- `deal_id` filter works
- date-range filters work
- results come back newest first

`describe_crm_schema`

- returns resolved config, not raw DB row shape
- includes company config introduced in shipped `PR15d`
- reflects custom-field definitions and vocab arrays

`get_contact_deals`

- returns linked deals
- includes `role`
- includes `is_primary`

`get_company_contacts`

- returns only contacts for the given company
- respects `limit`

`get_company_deals`

- returns only deals for the given company
- respects `limit`

Extended search tools

- `search_contacts` filters by `company_id`
- `search_deals` filters by `company_id`
- `search_tasks` searches `title` / `description`

Setup-mode regression

- `createCrmTools(..., { mode: "setup" })` still exposes only `configure_crm`

## Expected file touches

Likely files:

- `src/lib/runner/tools/crm/index.ts`
- `src/lib/runner/tools/crm/interactions.ts`
- `src/lib/runner/tools/crm/deal-contacts.ts`
- `src/lib/runner/tools/crm/contacts.ts`
- `src/lib/runner/tools/crm/deals.ts`
- `src/lib/runner/tools/crm/tasks.ts`
- `src/lib/runner/tools/crm/schema.ts` or similar
- `src/lib/runner/tools/crm/company-reads.ts` or similar
- focused test files under `src/lib/runner/tools/crm/__tests__/`

## Acceptance criteria

1. The agent can inspect live CRM schema via a tool call, including company config from shipped `PR15d`
2. The agent can read back interaction history, not just write new interactions
3. The agent can navigate relationship reads in both directions:
   - deal → contacts
   - contact → deals
   - company → contacts
   - company → deals
4. Existing search tools reflect the shipped company object where relevant
5. Setup mode remains isolated to `configure_crm`
6. Tests cover the new read surfaces and regressions

## Validation

Minimum validation before merge:

```bash
pnpm vitest run src/lib/runner/tools/crm/__tests__/*
pnpm exec tsc --noEmit --pretty false
```

If the CRM test suite is too broad/noisy, run the new targeted files explicitly first, then the broader CRM runner suite.
