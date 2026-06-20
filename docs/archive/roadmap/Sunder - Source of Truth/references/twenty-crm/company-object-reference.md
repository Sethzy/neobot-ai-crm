# Company Object Reference — The CRM Holy Trinity

> **Purpose:** Reference document for adding Company as a standard object to Sunder's CRM, completing the Company-Contact-Deal triad that is universal across CRM systems.
>
> **References:** Twenty CRM (open source), Attio (commercial), HubSpot (commercial)
>
> **Date:** 2026-03-07

---

## 1. Why Company is Required

Every major CRM has the same three core objects:

| CRM | Company Entity | Contact/Person Entity | Deal/Opportunity Entity |
|-----|---------------|----------------------|------------------------|
| **Twenty** | `company` | `person` | `opportunity` |
| **Attio** | Companies | People | Deals |
| **HubSpot** | Companies | Contacts | Deals |
| **Salesforce** | Account | Contact | Opportunity |
| **Folk** | Companies | Contacts | — (uses lists) |
| **Sunder** | **Missing** | `contacts` | `deals` |

Without Company, Sunder is missing the organizational grouping that every CRM user expects. This limits TAM to solo practitioners who only track individuals. Adding Company opens Sunder to:

- Insurance brokers (policies per company)
- Property managers (units per building/management company)
- B2B consultants (engagements per client firm)
- Any industry where contacts belong to organizations

---

## 2. Standard Fields — Cross-CRM Consensus

### What Twenty and Attio agree on (the market standard)

| Field | Twenty | Attio | Type | Required |
|-------|--------|-------|------|----------|
| Name | `name` (TEXT) | `name` (text) | TEXT | Yes (core identifier) |
| Domain/Website | `domainName` (LINKS) | `domains` (domain, unique) | TEXT | No |
| Address | `address` (ADDRESS) | `primary_location` (location) | TEXT | No |
| Industry | — | `categories` (multi-select) | SELECT | No |
| Employees | `employees` (NUMBER) | `employee_range` (select) | TEXT/NUMBER | No |
| LinkedIn | `linkedinLink` (LINKS) | `linkedin` (text) | TEXT | No |
| Notes/Description | — | `description` (text) | TEXT | No |
| Phone | — | — | TEXT | No |
| Email | — | — | TEXT | No |

### What Sunder should adopt (pragmatic subset)

For a solo real-estate agent's CRM, we don't need employee count, ARR, or social links. We need:

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `company_id` | UUID PK | No | Auto-generated |
| `client_id` | UUID FK | No | Tenant isolation (RLS) |
| `name` | TEXT | No | Company name — the core identifier |
| `industry` | TEXT | Yes | Configurable via `crm_config.company_industries` |
| `website` | TEXT | Yes | Company website |
| `phone` | TEXT | Yes | Main company phone |
| `email` | TEXT | Yes | Main company email |
| `address` | TEXT | Yes | Company address (free text for Singapore format) |
| `notes` | TEXT | Yes | Free-form notes |
| `custom_fields` | JSONB | No (default `{}`) | Same pattern as contacts/deals/tasks |
| `created_at` | TIMESTAMPTZ | No | Auto-set |
| `updated_at` | TIMESTAMPTZ | No | Auto-set |

**Deliberately excluded** (YAGNI for v1):
- Employee count — not useful for real estate
- ARR/funding — not relevant
- Social links (LinkedIn, Twitter) — can be captured in notes or custom fields
- Logo/avatar — deferred
- ICP (Ideal Customer Profile) — enterprise B2B concept

---

## 3. Relationship Design

### 3.1 Company ↔ Contact

**Market consensus:**
- Twenty: direct FK `companyId` on `person` (MANY_TO_ONE, SET_NULL)
- Attio: record-reference (effectively many-to-many)
- HubSpot: association (many-to-many)

**Sunder recommendation: Direct FK on contacts (Twenty's pattern)**

```sql
ALTER TABLE public.contacts
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);
```

Rationale:
- A contact typically belongs to one company at a time (for a real-estate agent: "John from ABC Property Agency")
- Many-to-many adds junction table complexity with no real-estate use case
- Twenty's approach is simpler and sufficient
- `ON DELETE SET NULL` — deleting a company doesn't delete its contacts, just unlinks them

### 3.2 Company ↔ Deal

**Market consensus:**
- Twenty: direct FK `companyId` on `opportunity` (MANY_TO_ONE, SET_NULL)
- Attio: record-reference `associated_company` (many-to-one from deal side)
- HubSpot: association (many-to-many)

**Sunder recommendation: Direct FK on deals (Twenty's pattern)**

```sql
ALTER TABLE public.deals
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_deals_company_id ON public.deals(company_id);
```

Rationale:
- A deal is typically associated with one company (e.g., "this sale is with PropNex")
- Our existing `deal_contacts` junction handles the many-to-many contact↔deal relationship with roles
- Company on deal is additional organizational context, not a replacement for deal_contacts

### 3.3 Relationship Summary

```
Company (ONE)
  ├── contacts [ONE_TO_MANY]  ←→  Contact.company_id [FK, SET NULL]
  └── deals    [ONE_TO_MANY]  ←→  Deal.company_id    [FK, SET NULL]

Contact (MANY)
  ├── company_id → Company    [MANY_TO_ONE, optional]
  └── deal_contacts           [existing junction table — unchanged]

Deal (MANY)
  ├── company_id → Company    [MANY_TO_ONE, optional]
  └── deal_contacts           [existing junction table — unchanged]
```

This matches Twenty's pattern exactly. All FKs are nullable with `ON DELETE SET NULL`.

---

## 4. CRM Configurability Integration

Company fits into the PR 15c configurability framework with zero architectural changes:

| Config Field | Location | Purpose |
|-------------|----------|---------|
| `company_industries` | `crm_config` JSONB column | Configurable industry vocabulary (like `deal_stages`) |
| `company_custom_fields` | `crm_config` JSONB column | Custom field definitions (like `deal_custom_fields`) |
| `company_label` | `crm_config` TEXT column | Display label override (e.g., "Agency", "Firm", "Organization") |

Default industries for real estate:
```typescript
company_industries: ["property_agency", "developer", "law_firm", "bank", "government", "other"]
```

---

## 5. Tool Design

Following the existing factory pattern in `src/lib/runner/tools/crm/`:

### search_companies

```typescript
search_companies: tool({
  description: "Search companies by name, industry, or website.",
  inputSchema: z.object({
    query: z.string().optional(),
    industry: z.enum(config.company_industries as [string, ...string[]]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async ({ query, industry, limit }) => { ... },
})
```

### create_company

```typescript
create_company: tool({
  description: "Create a new company. Has built-in duplicate detection by name.",
  inputSchema: z.object({
    name: z.string().min(1),
    industry: z.enum(config.company_industries as [string, ...string[]]).optional(),
    website: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    custom_fields: buildCustomFieldsSchema(config.company_custom_fields, "create").optional(),
    force_create: z.boolean().optional(),
  }),
  execute: async ({ name, ...fields }) => { ... },
})
```

### update_company

```typescript
update_company: tool({
  description: "Update an existing company by id.",
  inputSchema: z.object({
    company_id: z.string().uuid(),
    name: z.string().min(1).optional(),
    industry: z.enum(config.company_industries as [string, ...string[]]).optional(),
    // ... all nullable fields optional
    custom_fields: buildCustomFieldsSchema(config.company_custom_fields, "update").optional(),
  }),
  execute: async ({ company_id, ...fields }) => { ... },
})
```

### link_contact_to_company / unlink_contact_from_company

```typescript
link_contact_to_company: tool({
  description: "Link a contact to a company. Sets the contact's company_id.",
  inputSchema: z.object({
    contact_id: z.string().uuid(),
    company_id: z.string().uuid(),
  }),
  execute: async ({ contact_id, company_id }) => {
    // UPDATE contacts SET company_id = $1 WHERE contact_id = $2 AND client_id = $3
  },
})
```

---

## 6. UI Pages

### Companies List Page (`app/(dashboard)/crm/companies/page.tsx`)

- Table view with columns: Name, Industry, Phone, Website, Contacts (count), Deals (count)
- Industry filter (from config)
- Search by name
- Click → Company drawer

### Company Drawer (`src/components/crm/record-drawer/company-drawer-content.tsx`)

- Header: Company name, industry badge
- Details: website, phone, email, address, notes
- Custom fields section
- Related contacts list (contacts where `company_id` = this company)
- Related deals list (deals where `company_id` = this company)
- Interaction timeline (interactions for contacts at this company)

### Updates to Existing Pages

- **Contact drawer:** Add "Company" field (select from existing companies or create)
- **Deal drawer:** Add "Company" field (select from existing companies)
- **Contacts table:** Add "Company" column (company name, linked)
- **Deals table:** Add "Company" column (company name, linked)

---

## 7. Migration SQL

```sql
-- PR 15d: Add Company as standard CRM object

-- Step A: Create companies table
CREATE TABLE public.companies (
  company_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  industry    TEXT,
  website     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.companies
  USING (client_id = auth.uid()::uuid)
  WITH CHECK (client_id = auth.uid()::uuid);

-- Indexes
CREATE INDEX idx_companies_client_id ON public.companies(client_id);
CREATE INDEX idx_companies_client_name ON public.companies(client_id, name);

-- Step B: Add company_id FK to contacts
ALTER TABLE public.contacts
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_contacts_company_id ON public.contacts(company_id);

-- Step C: Add company_id FK to deals
ALTER TABLE public.deals
  ADD COLUMN company_id UUID REFERENCES public.companies(company_id) ON DELETE SET NULL;

CREATE INDEX idx_deals_company_id ON public.deals(company_id);

-- Step D: Extend crm_config for company vocabulary
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS company_industries JSONB,
  ADD COLUMN IF NOT EXISTS company_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_label TEXT NOT NULL DEFAULT 'Company';

-- Step E: updated_at trigger for companies
CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

---

## 8. Drift Analysis vs Twenty

| Area | Twenty | Sunder | Drift Reason |
|------|--------|--------|-------------|
| **Fields** | name, domainName (LINKS), address (ADDRESS), employees, linkedinLink, xLink, ARR, ICP, position, searchVector | name, industry, website, phone, email, address, notes, custom_fields | Sunder targets solo agents, not enterprise. Simpler field set. Social/financial fields not needed. |
| **Relationships** | company→people (ONE_TO_MANY), company→opportunities (ONE_TO_MANY), both via direct FK, SET_NULL | Same pattern exactly. `company_id` FK on contacts and deals, SET_NULL | **No drift.** Copied directly. |
| **Industry field** | No standard industry field | `industry` TEXT, configurable via `crm_config.company_industries` | Sunder-specific. Useful for classifying property agencies, developers, banks. |
| **Search** | `searchVector` (TS_VECTOR, STORED generated column) | ILIKE on name (same as existing contact/deal search) | Full-text search is a future optimization. ILIKE is sufficient for v1 volumes. |
| **Duplicate detection** | No built-in dedup on Company | `findDuplicateCompanies` by name (same pattern as contacts) | Sunder-specific. Prevents AI agent from creating duplicate companies. |
| **Account owner** | `accountOwner` (MANY_TO_ONE → workspaceMember) | Not applicable | Sunder is single-user — no team assignment needed. |
| **Position** | `position` (for drag-and-drop ordering) | Not implemented | No manual ordering in Sunder's table view. |

---

## 9. Implementation Order

**Prerequisite:** PR 15c (CRM configurability) should land first. Company then gets configurability for free.

**PR 15d scope:**

1. Migration — create `companies` table, add `company_id` FK to contacts + deals, extend `crm_config`
2. Types — regenerate `database.ts`, add Zod schemas (`companySchema`, `companyInsertSchema`)
3. Config — add `company_industries`, `company_custom_fields`, `company_label` to `CrmVocabConfig` and `CRM_DEFAULTS`
4. Tools — `createCompanyTools` factory (search, create, update, batch_create) + link/unlink tools
5. Tool wiring — add to `createCrmTools` index barrel, pass config
6. UI — Companies page, company drawer, company field on contact/deal drawers, company column on tables
7. Tests — tool tests, config tests, UI component tests

Estimated: ~same scope as the original contacts PR (PR 5). One focused PR.

---

## Appendix: Twenty Company Source Files

```
twenty/packages/twenty-server/src/engine/workspace-manager/
  twenty-standard-application/utils/field-metadata/
    compute-company-standard-flat-field-metadata.util.ts    ← All Company fields + relations
  twenty-standard-application/utils/index/
    compute-company-standard-flat-index-metadata.util.ts    ← Company indexes

twenty/packages/twenty-server/src/modules/company/
  standard-objects/company.workspace-entity.ts              ← TypeORM entity class

twenty/packages/twenty-server/src/engine/workspace-manager/
  twenty-standard-application/utils/field-metadata/
    compute-person-standard-flat-field-metadata.util.ts     ← Person.company relation (FK side)
    compute-opportunity-standard-flat-field-metadata.util.ts ← Opportunity.company relation (FK side)
```
