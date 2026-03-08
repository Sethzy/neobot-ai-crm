# Company Object (CRM Triad) Implementation Plan

**PR:** PR 15d: Company object — complete the CRM triad  
**Status:** Ready for implementation review  
**Decisions:** DATA-01 (Postgres), DATA-03 (RLS tenant isolation), DATA-09 (CRM table schema pattern)  
**Goal:** Add Company as the third standard CRM object, completing the universal Company-Contact-Deal triad.

**Architecture:** Company follows the existing PR 15c CRM configurability model. Company vocabulary and custom fields live in `crm_config`; tools and UI must read runtime config with real-estate defaults as fallback. Contacts and deals get direct nullable `company_id` FKs with `ON DELETE SET NULL`.

**Tech Stack:** Supabase (Postgres + RLS), Zod, Vercel AI SDK `tool()`, TanStack Query, TanStack Table, ShadCN UI

**Reference:** `roadmap docs/Sunder - Source of Truth/references/twenty-crm/company-object-reference.md`

**Depends on:** PR 5 (CRM schema), PR 6 (CRM tools), PR 15c (CRM configurability)  
**Dependency note:** PR 15c is complete. Do not add any "skip if 15c is not merged" logic to this tasklist.

## Non-Negotiables

1. **TDD is mandatory.** For every feature or behavior change: write the failing test first, verify the red state, then implement the minimum code to pass.
2. **Stay inside PR 15d scope.** Do not pull in the deferred dynamic custom-field table-column work from PR 15c. That remains a follow-up micro-PR if still needed.
3. **Do not add extra runner tools beyond the v2 plan.** `get_company_contacts` and `get_company_deals` are out of scope for the runner. Company relations are fetched via UI hooks.
4. **Use existing CRM conventions.** RLS must use `public.get_my_client_id()`. `updated_at` triggers must use `update_updated_at_column()`. Do not introduce `auth.uid()`-based CRM policies or a new trigger helper.
5. **No inline company creation inside contact/deal drawers in PR 15d.** The drawer field is "select existing company or clear link", not "create while selecting".
6. **Config-driven company behavior is required.** Do not hardcode `companyIndustryValues` into tools or page filters. Hardcoded defaults belong in `CRM_DEFAULTS` only.

---

## Relevant Files

### Create
- `supabase/migrations/20260307000000_add_companies_table.sql`
- `supabase/migrations/__tests__/companies-migration.test.ts`
- `src/lib/runner/tools/crm/companies.ts`
- `src/lib/runner/tools/crm/company-links.ts`
- `src/lib/runner/tools/crm/__tests__/companies.test.ts`
- `src/lib/runner/tools/crm/__tests__/company-links.test.ts`
- `src/hooks/use-companies.ts`
- `src/hooks/use-update-company.ts`
- `src/hooks/use-company-relations.ts`
- `src/hooks/__tests__/use-companies.test.ts`
- `src/hooks/__tests__/use-update-company.test.ts`
- `app/(dashboard)/crm/companies/page.tsx`
- `app/(dashboard)/crm/companies/__tests__/page.test.tsx`
- `src/components/crm/companies-table.tsx`
- `src/components/crm/__tests__/companies-table.test.tsx`
- `src/components/crm/record-drawer/company-drawer-content.tsx`
- `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx`

### Modify
- `src/types/database.ts`
- `src/lib/crm/config.ts`
- `src/lib/crm/schemas.ts`
- `src/lib/crm/display.ts`
- `src/lib/crm/__tests__/config.test.ts`
- `src/lib/crm/__tests__/schemas-configurable.test.ts`
- `src/lib/runner/tools/crm/index.ts`
- `src/lib/runner/tools/crm/configure-crm.ts`
- `src/lib/runner/tools/crm/__tests__/index.test.ts`
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- `src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts`
- `src/components/crm/record-drawer/record-drawer.tsx`
- `src/components/crm/record-drawer/contact-drawer-content.tsx`
- `src/components/crm/record-drawer/deal-drawer-content.tsx`
- `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- `src/components/crm/contacts-table.tsx`
- `src/components/crm/deals-table.tsx`
- `src/components/crm/__tests__/contacts-table.test.tsx`
- `src/components/crm/__tests__/deals-table.test.tsx`
- `src/hooks/use-contacts.ts`
- `src/hooks/use-deals.ts`
- `src/hooks/use-update-contact.ts`
- `src/hooks/use-update-deal.ts`
- `src/hooks/__tests__/use-contacts.test.tsx`
- `src/hooks/__tests__/use-deals.test.tsx`
- `src/hooks/use-crm-config.ts`
- `src/hooks/__tests__/use-crm-config.test.tsx`
- `app/(dashboard)/crm/layout.tsx`
- `app/(dashboard)/crm/__tests__/layout.test.tsx`
- `supabase/seed.sql`

---

## Task 1: Migration — companies table, FKs, crm_config extension, contract test

**Files:**
- Create: `supabase/migrations/20260307000000_add_companies_table.sql`
- Create: `supabase/migrations/__tests__/companies-migration.test.ts`

### Step 1: Write the migration SQL

Create `supabase/migrations/20260307000000_add_companies_table.sql`:

```sql
-- PR 15d: Add Company as standard CRM object (CRM triad completion).
-- Decision refs: DATA-01, DATA-03, DATA-09.

CREATE TABLE public.companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_client_id ON public.companies(client_id);
CREATE INDEX idx_companies_client_name ON public.companies(client_id, name);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.contacts
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);

ALTER TABLE public.deals
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_deals_company_id ON public.deals(company_id);

ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS company_industries JSONB,
  ADD COLUMN IF NOT EXISTS company_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_label TEXT NOT NULL DEFAULT 'Company';

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select_own ON public.companies
  FOR SELECT USING (client_id = public.get_my_client_id());

CREATE POLICY companies_insert_own ON public.companies
  FOR INSERT WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY companies_update_own ON public.companies
  FOR UPDATE USING (client_id = public.get_my_client_id())
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY companies_delete_own ON public.companies
  FOR DELETE USING (client_id = public.get_my_client_id());
```

### Step 2: Add a migration contract test

Create `supabase/migrations/__tests__/companies-migration.test.ts` asserting that the migration:

- creates `public.companies`
- adds `company_id` to `contacts`
- adds `company_id` to `deals`
- adds `company_industries`, `company_custom_fields`, and `company_label` to `crm_config`
- enables RLS with `public.get_my_client_id()`
- uses `update_updated_at_column()`
- does **not** use `auth.uid()` or `handle_updated_at()`

### Step 3: Run the migration test first

```bash
npx vitest run supabase/migrations/__tests__/companies-migration.test.ts
```

Expected: FAIL before the migration and test exist, then PASS after implementation.

### Step 4: Apply the migration locally

```bash
npx supabase db reset
```

### Step 5: Verify schema with `psql`

```bash
psql 'postgresql://postgres:postgres@localhost:54322/postgres' -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies' ORDER BY ordinal_position;"
```

Expected: 12 columns (`company_id`, `client_id`, `name`, `industry`, `website`, `phone`, `email`, `address`, `notes`, `custom_fields`, `created_at`, `updated_at`).

---

## Task 2: Runtime config, schemas, defaults, and generated types

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/crm/config.ts`
- Modify: `src/lib/crm/schemas.ts`
- Modify: `src/lib/crm/display.ts`
- Modify: `src/lib/crm/__tests__/config.test.ts`
- Modify: `src/lib/crm/__tests__/schemas-configurable.test.ts`

### Step 1: Regenerate database types

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Verify:

- `public.Tables.companies` exists
- `contacts` and `deals` now include nullable `company_id`
- `crm_config` now includes `company_industries`, `company_custom_fields`, and `company_label`

### Step 2: Extend `src/lib/crm/config.ts`

Update:

- `CrmVocabConfig`
- `CrmConfigRow`
- `CRM_DEFAULTS`
- `resolveCrmConfig`
- `loadCrmConfig`

Add:

- `company_label: "Company"`
- `company_industries: ["property_agency", "developer", "law_firm", "bank", "government", "other"]`
- `company_custom_fields: []`

Requirements:

- company vocabulary uses the same parsing and fallback rules as existing configurable arrays
- company custom fields use the same parsing rules as other custom-field collections
- no new helper abstraction unless existing parsing patterns become repetitive enough to justify extraction

### Step 3: Extend `src/lib/crm/schemas.ts`

Add:

- `companySchema`
- `companyInsertSchema`
- `Company`
- `CompanyInsert`

Update existing row schemas so persisted entities match the new DB shape:

- `contactSchema` includes `company_id: z.string().uuid().nullable()`
- `dealSchema` includes `company_id: z.string().uuid().nullable()`

Important:

- `company.industry` should be a configurable vocabulary string, not a hardcoded enum
- do **not** introduce `companyIndustryValues` into persistence schemas

### Step 4: Update display helpers

Add `companyIndustryBadgeVariantMap` for the default real-estate industries only:

```typescript
export const companyIndustryBadgeVariantMap: Record<string, BadgeVariant> = {
  property_agency: "info",
  developer: "success",
  law_firm: "warning",
  bank: "secondary",
  government: "outline",
  other: "secondary",
};
```

Unknown configured industries must fall back to `"secondary"` at render time.

### Step 5: Add tests first

Add/extend tests covering:

- `CRM_DEFAULTS` includes company defaults
- `resolveCrmConfig()` resolves/falls back company fields correctly
- `loadCrmConfig()` selects and returns company fields
- `crmConfigSchema` / `crmConfigInsertSchema` accept the extended config shape
- `companySchema` / `companyInsertSchema` parse correctly
- `contactSchema` / `dealSchema` accept nullable `company_id`

### Step 6: Verify type-check

```bash
npx tsc --noEmit
```

---

## Task 3: Company tools — config-driven CRUD with custom fields (TDD)

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/companies.test.ts`
- Create: `src/lib/runner/tools/crm/companies.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts`

### Step 1: Write failing tests first

Create `src/lib/runner/tools/crm/__tests__/companies.test.ts`.

Cover:

- `search_companies` searches by `name`, `website`, and `notes`
- `search_companies` applies `industry` filter
- `create_company` detects duplicates by name
- `create_company` respects `force_create`
- `update_company` errors on empty patch
- `batch_create_companies` detects intra-batch duplicates
- `batch_create_companies` returns possible duplicates when existing companies match
- create/update default nullable scalar fields to `null`
- create/update persist `custom_fields`
- update merges `custom_fields` patches instead of replacing the whole object

Also extend `src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts` to prove:

- `createCompanyTools` accepts `config: CrmVocabConfig`
- company tool schemas use `config.company_industries`
- company tool schemas reject out-of-config industries
- company tool schemas validate `config.company_custom_fields`
- company descriptions use `config.company_label`

### Step 2: Run the failing tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/companies.test.ts src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts
```

### Step 3: Implement `src/lib/runner/tools/crm/companies.ts`

Requirements:

- signature matches existing pattern:

```typescript
export function createCompanyTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig = CRM_DEFAULTS,
)
```

- use `config.company_industries` for search/create/update schemas
- use `config.company_custom_fields` with `buildCustomFieldsSchema()`
- use `mergeCustomFields()` for updates
- use `config.company_label` in tool descriptions where helpful
- keep duplicate detection best-effort, like contacts/deals
- do not add extra tools beyond:
  - `search_companies`
  - `create_company`
  - `update_company`
  - `batch_create_companies`

### Step 4: Re-run the tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/companies.test.ts src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts
```

---

## Task 4: Company link/unlink tools only (TDD)

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/company-links.test.ts`
- Create: `src/lib/runner/tools/crm/company-links.ts`

### Step 1: Write failing tests first

Cover only the four scoped tools:

- `link_contact_to_company`
- `unlink_contact_from_company`
- `link_deal_to_company`
- `unlink_deal_from_company`

Each test should verify:

- the correct table is updated
- `company_id` is set or cleared correctly
- `client_id` scoping is enforced in the query
- Supabase errors are returned cleanly

Do **not** add tests for `get_company_contacts` or `get_company_deals`; those tools are out of scope.

### Step 2: Run the failing tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/company-links.test.ts
```

### Step 3: Implement `src/lib/runner/tools/crm/company-links.ts`

Implement exactly four tools:

- `link_contact_to_company`
- `unlink_contact_from_company`
- `link_deal_to_company`
- `unlink_deal_from_company`

No additional read tools.

### Step 4: Re-run the tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/company-links.test.ts
```

---

## Task 5: CRM barrel + configure_crm extension (TDD)

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tools/crm/configure-crm.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`

### Step 1: Update barrel tests first

Update `src/lib/runner/tools/crm/__tests__/index.test.ts` to match the scoped tool set:

- read tools:
  - `search_contacts`
  - `search_deals`
  - `search_tasks`
  - `get_deal_contacts`
  - `search_companies`
- write tools:
  - existing 11
  - `create_company`
  - `update_company`
  - `batch_create_companies`
  - `link_contact_to_company`
  - `unlink_contact_from_company`
  - `link_deal_to_company`
  - `unlink_deal_from_company`

Expected full tool count after PR 15d: **23**

### Step 2: Extend configure_crm tests first

Update `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts` to cover:

- `company_industries`
- `company_custom_fields`
- `company_label`
- removal warnings for company industries still in use
- removal warnings for populated company custom fields
- partial updates that touch company fields only

### Step 3: Run the failing tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

### Step 4: Implement barrel and configure_crm updates

Update `src/lib/runner/tools/crm/index.ts`:

- import and instantiate `createCompanyTools(supabase, clientId, config)`
- import and instantiate `createCompanyLinkTools(supabase, clientId)`
- add only `search_companies` to `readTools`
- add the four link/unlink tools and three CRUD tools to write tools

Update `src/lib/runner/tools/crm/configure-crm.ts`:

- extend input schema with `company_industries`, `company_custom_fields`, and `company_label`
- extend removal-check maps for:
  - `company_industries -> companies.industry`
  - `company_custom_fields -> companies.custom_fields`
- extend `crm_config` upsert + select to include company fields

### Step 5: Re-run the tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

---

## Task 6: TanStack Query hooks — companies, counts, update, relations

**Files:**
- Create: `src/hooks/use-companies.ts`
- Create: `src/hooks/use-update-company.ts`
- Create: `src/hooks/use-company-relations.ts`
- Create: `src/hooks/__tests__/use-companies.test.ts`
- Create: `src/hooks/__tests__/use-update-company.test.ts`

### Step 1: Write hook tests first

Cover:

- `useCompanies()` search + industry filter
- `useCompanies()` returns company list rows with `contactCount` and `dealCount`
- `useCompany()` fetches one company
- `useUpdateCompany()` invalidates company queries
- `useUpdateCompany()` merges custom-field patches
- `useCompanyContacts()` fetches related contacts
- `useCompanyDeals()` fetches related deals

### Step 2: Implement `src/hooks/use-companies.ts`

Requirements:

- filter type is config-driven string, not a hardcoded company enum type
- list rows include:
  - company base fields
  - `contactCount`
  - `dealCount`

Count strategy for PR 15d:

- do **not** create a DB view or RPC for counts
- use lightweight client-side aggregation from narrow `company_id` relation queries
- keep the implementation explicit and local to the companies hook/page

### Step 3: Implement `src/hooks/use-update-company.ts`

Requirements:

- mirror `use-update-contact.ts` / `use-update-deal.ts`
- include `custom_fields` in update type
- use `mergeCustomFieldPatch()` before update

### Step 4: Implement `src/hooks/use-company-relations.ts`

Requirements:

- `useCompanyContacts(companyId)`
- `useCompanyDeals(companyId)`
- realtime invalidation for related contacts and deals

### Step 5: Re-run hook tests

```bash
npx vitest run src/hooks/__tests__/use-companies.test.ts src/hooks/__tests__/use-update-company.test.ts
```

---

## Task 7: Companies page, table, and CRM nav

**Files:**
- Create: `app/(dashboard)/crm/companies/page.tsx`
- Create: `app/(dashboard)/crm/companies/__tests__/page.test.tsx`
- Create: `src/components/crm/companies-table.tsx`
- Create: `src/components/crm/__tests__/companies-table.test.tsx`
- Modify: `app/(dashboard)/crm/layout.tsx`
- Modify: `app/(dashboard)/crm/__tests__/layout.test.tsx`

### Step 1: Write component/page tests first

Cover:

- companies tab renders in CRM layout
- companies page uses config-driven industry filters
- companies page empty/error states
- companies table renders required columns:
  - `Name`
  - `Industry`
  - `Phone`
  - `Website`
  - `Contacts`
  - `Deals`
- row click opens the drawer

### Step 2: Implement `src/components/crm/companies-table.tsx`

Requirements:

- columns must match the v2 plan:
  - `Name`
  - `Industry`
  - `Phone`
  - `Website`
  - `Contacts`
  - `Deals`
- do not replace required counts with `Last Updated`
- industry badge uses `companyIndustryBadgeVariantMap` with fallback to `secondary`
- format industry labels with `formatCrmEnumLabel()`

### Step 3: Implement `app/(dashboard)/crm/companies/page.tsx`

Requirements:

- use `useCrmConfig()` for:
  - page label copy
  - industry filter options
- use `CRM_DEFAULTS.company_industries` as fallback when config is absent
- no static `companyIndustryValues`
- use `RecordDrawer` with `objectType="company"`

### Step 4: Add the Companies tab

Update `app/(dashboard)/crm/layout.tsx`:

- add `/crm/companies`
- keep it in the existing CRM tab shell

---

## Task 8: Company drawer with custom fields and related records

**Files:**
- Create: `src/components/crm/record-drawer/company-drawer-content.tsx`
- Create: `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/record-drawer.tsx`

### Step 1: Write drawer tests first

Cover:

- company detail fields render
- configured company custom fields render
- custom field edits call `useUpdateCompany()`
- related contacts list renders
- related deals list renders
- company drawer routes through `RecordDrawer`

### Step 2: Implement `company-drawer-content.tsx`

Requirements:

- render:
  - `name`
  - industry badge
  - `website`
  - `phone`
  - `email`
  - `address`
  - `notes`
- include a `Custom Fields` section using the same `CustomFieldEditors` pattern as contact/deal drawers
- use `useCrmConfig()` for company custom-field definitions and industry options
- use `useUpdateCompany()` for scalar fields and custom fields
- render related contacts and related deals
- do **not** add an interaction timeline in PR 15d

### Step 3: Wire `RecordDrawer`

Update `src/components/crm/record-drawer/record-drawer.tsx`:

- add `"company"` to `RecordObjectType`
- route `"company"` to `CompanyDrawerContent`

---

## Task 9: Contact/deal integration — joins, editable company field, regression tests

**Files:**
- Modify: `src/hooks/use-contacts.ts`
- Modify: `src/hooks/use-deals.ts`
- Modify: `src/hooks/use-update-contact.ts`
- Modify: `src/hooks/use-update-deal.ts`
- Modify: `src/components/crm/contacts-table.tsx`
- Modify: `src/components/crm/deals-table.tsx`
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/__tests__/contacts-table.test.tsx`
- Modify: `src/components/crm/__tests__/deals-table.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`
- Modify: `src/hooks/__tests__/use-contacts.test.tsx`
- Modify: `src/hooks/__tests__/use-deals.test.tsx`

### Step 1: Write regression tests first

Cover:

- contacts query joins company name
- deals query joins company name
- contacts table shows company column
- deals table shows company column
- contact drawer allows selecting a company
- deal drawer allows selecting a company
- both drawers allow clearing the company link

### Step 2: Update queries and types

`src/hooks/use-contacts.ts`

- join company name in list + detail queries
- export `ContactWithCompany`

`src/hooks/use-deals.ts`

- join company name in list + detail queries
- extend `DealWithContact` with company summary

### Step 3: Update mutation hooks

`src/hooks/use-update-contact.ts`

- include `company_id` in the update type

`src/hooks/use-update-deal.ts`

- include `company_id` in the update type

### Step 4: Update tables

Add a `Company` column to:

- `src/components/crm/contacts-table.tsx`
- `src/components/crm/deals-table.tsx`

### Step 5: Update drawers

Use a simple existing-company select pattern, not inline create.

Requirements:

- use `useCompanies({})` or equivalent preloaded company options
- include a sentinel option such as `"No company"` to support unlinking
- save via `company_id`
- keep this explicit; do not build a new search/create abstraction for PR 15d

---

## Task 10: Seed data and broadened test coverage

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `src/hooks/use-crm-config.ts`
- Modify: `src/hooks/__tests__/use-crm-config.test.tsx`

### Step 1: Update local seed data

Add sample companies and linked relationships to `supabase/seed.sql`:

- at least 3 sample companies
- some contacts linked to companies
- some deals linked to companies
- `crm_config` includes:
  - `company_label`
  - `company_industries`
  - `company_custom_fields`

### Step 2: Update config hook contract tests

Extend `src/hooks/__tests__/use-crm-config.test.tsx` so the expected config payload includes company fields.

### Step 3: Verify full targeted CRM coverage

Run:

```bash
npx vitest run supabase/migrations/__tests__/companies-migration.test.ts
npx vitest run src/lib/crm/__tests__/config.test.ts src/lib/crm/__tests__/schemas-configurable.test.ts
npx vitest run src/lib/runner/tools/crm/__tests__/companies.test.ts src/lib/runner/tools/crm/__tests__/company-links.test.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts src/lib/runner/tools/crm/__tests__/dynamic-config.test.ts src/lib/runner/tools/crm/__tests__/index.test.ts
npx vitest run src/hooks/__tests__/use-companies.test.ts src/hooks/__tests__/use-update-company.test.ts src/hooks/__tests__/use-contacts.test.tsx src/hooks/__tests__/use-deals.test.tsx src/hooks/__tests__/use-crm-config.test.tsx
npx vitest run app/(dashboard)/crm/__tests__/layout.test.tsx app/(dashboard)/crm/companies/__tests__/page.test.tsx
npx vitest run src/components/crm/__tests__/companies-table.test.tsx src/components/crm/__tests__/contacts-table.test.tsx src/components/crm/__tests__/deals-table.test.tsx src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx
```

---

## Task 11: Final verification and end-to-end checks

### Step 1: Type-check

```bash
npx tsc --noEmit
```

### Step 2: Run the full test suite

```bash
npx vitest run
```

### Step 3: Manual verification against PR 15d criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Agent creates a company via chat -> appears in `/crm/companies` | Chat "create a company called PropNex", then check `/crm/companies` |
| 2 | Agent links a contact to a company -> contact drawer shows company, company drawer shows contact | Link from chat or UI, then verify both drawers |
| 3 | Agent links a deal to a company -> deal drawer shows company, company drawer shows deal | Link from chat or UI, then verify both drawers |
| 4 | `search_companies` by name and industry filter work | Run tool test + verify UI search/filter manually |
| 5 | Company industries configurable via `configure_crm` | Reconfigure industries, confirm tool schemas and company page filter update |
| 6 | Default real-estate industries work with zero config | Delete `crm_config` row locally, confirm fallback behavior |
| 7 | Deleting a company `SET NULL`s `company_id` on related contacts and deals | Delete a company row directly, confirm related contacts/deals remain with `company_id = null` |

### Step 4: Commit the PR work

Use a single PR-level commit unless the implementation naturally needs multiple checkpoints:

```bash
git add -A
git commit -m "feat(pr15d): add company object and complete CRM triad"
```

---

## Summary

- Company is fully config-driven and inherits PR 15c behavior.
- Runner scope stays minimal: no extra company relation read tools.
- UI scope matches the v2 plan: counts in the list page, custom fields in the drawer, editable company field in contact/deal drawers.
- Tests are expanded across migration, config, tools, hooks, components, and seed data.
- Deferred PR 15c dynamic custom-field table columns remain out of scope for PR 15d.
