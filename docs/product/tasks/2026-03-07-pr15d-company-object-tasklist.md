# Company Object (CRM Triad) Implementation Plan

**PR:** PR 15d: Company object — complete the CRM triad
**Decisions:** DATA-01 (Postgres), DATA-03 (RLS tenant isolation), DATA-09 (CRM table schema pattern)
**Goal:** Add Company as the third standard CRM object, completing the universal Company-Contact-Deal triad.

**Architecture:** Company uses the same vocabulary-swap pattern as existing CRM objects. Direct FK `company_id` on contacts and deals (`ON DELETE SET NULL`) — copied from Twenty. Configurable `company_industries` vocabulary via `crm_config`. Same factory-pattern tools, TanStack Query hooks, and drawer system as contacts/deals.

**Tech Stack:** Supabase (Postgres + RLS), Zod, Vercel AI SDK `tool()`, TanStack Query, TanStack Table, ShadCN UI

**Reference:** `roadmap docs/Sunder - Source of Truth/references/twenty-crm/company-object-reference.md`

**Depends on:** PR 5 (CRM schema), PR 6 (CRM tools), PR 15c (CRM configurability)

---

## Relevant Files

### Create
- `supabase/migrations/20260307000000_add_companies_table.sql`
- `src/lib/runner/tools/crm/companies.ts`
- `src/lib/runner/tools/crm/company-links.ts`
- `src/lib/runner/tools/crm/__tests__/companies.test.ts`
- `src/lib/runner/tools/crm/__tests__/company-links.test.ts`
- `src/hooks/use-companies.ts`
- `src/hooks/use-update-company.ts`
- `src/hooks/use-company-relations.ts`
- `app/(dashboard)/crm/companies/page.tsx`
- `src/components/crm/companies-table.tsx`
- `src/components/crm/record-drawer/company-drawer-content.tsx`
- `src/components/crm/industry-badge.tsx`

### Modify
- `src/types/database.ts` — add `companies` table types, add `company_id` to contacts + deals
- `src/lib/crm/schemas.ts` — add `companySchema`, `companyInsertSchema`, `companyIndustryValues`
- `src/lib/crm/display.ts` — add `companyIndustryBadgeVariantMap`
- `src/lib/runner/tools/crm/index.ts` — wire `createCompanyTools` + `createCompanyLinkTools`
- `src/lib/runner/tools/crm/__tests__/index.test.ts` — update tool count assertions
- `src/components/crm/record-drawer/record-drawer.tsx` — add `"company"` to `RecordObjectType`
- `src/components/crm/record-drawer/contact-drawer-content.tsx` — add Company field
- `src/components/crm/record-drawer/deal-drawer-content.tsx` — add Company field
- `src/components/crm/contacts-table.tsx` — add Company column
- `src/components/crm/deals-table.tsx` — add Company column
- `src/hooks/use-contacts.ts` — join company name in fetch
- `src/hooks/use-deals.ts` — join company name in fetch
- `app/(dashboard)/crm/layout.tsx` — add Companies tab

---

## Task 1: Migration — Create companies table and add company_id FKs

**Files:**
- Create: `supabase/migrations/20260307000000_add_companies_table.sql`

> This task creates the database schema for the Company object: the companies table, FK columns on contacts and deals, RLS policy, indexes, crm_config extension, and updated_at trigger.

### Step 1: Write the migration SQL

Create `supabase/migrations/20260307000000_add_companies_table.sql`:

```sql
-- PR 15d: Add Company as standard CRM object (CRM triad completion)

-- Step A: Create companies table
CREATE TABLE public.companies (
  company_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  industry      TEXT,
  website       TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS — tenant isolation (matches contacts/deals pattern)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.companies
  USING (client_id = auth.uid()::uuid)
  WITH CHECK (client_id = auth.uid()::uuid);

-- Indexes
CREATE INDEX idx_companies_client_id ON public.companies(client_id);
CREATE INDEX idx_companies_client_name ON public.companies(client_id, name);

-- updated_at trigger (reuses existing handle_updated_at function)
CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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
```

### Step 2: Apply migration locally

```bash
npx supabase db reset
```

Expected: Migration applies without errors. Tables and columns created.

### Step 3: Verify schema in Supabase dashboard

Run a quick SQL check:
```bash
npx supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies' ORDER BY ordinal_position;"
```

Expected: All 12 columns listed (company_id, client_id, name, industry, website, phone, email, address, notes, custom_fields, created_at, updated_at).

### Step 4: Commit

```bash
git add supabase/migrations/20260307000000_add_companies_table.sql
git commit -m "feat(pr15d): add companies table, company_id FK on contacts/deals, crm_config extension"
```

---

## Task 2: Types and Schemas — database.ts, Zod schemas, company industry defaults

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/crm/schemas.ts`
- Modify: `src/lib/crm/display.ts`

> This task regenerates the TypeScript database types, adds Zod schemas for companies, adds industry badge variants, and defines default company industries.

### Step 1: Regenerate database types

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

Expected: `src/types/database.ts` now includes `companies` table with all columns, and `contacts`/`deals` include `company_id`.

### Step 2: Verify the generated types include companies

Open `src/types/database.ts` and verify that `public.Tables.companies` exists with `Row`, `Insert`, and `Update` types.

### Step 3: Add company schemas to `src/lib/crm/schemas.ts`

Add after the existing `crmConfigSchema` section at the bottom of the file, before the final exports:

```typescript
/** Default company industry classifications. */
export const companyIndustryValues = [
  "property_agency",
  "developer",
  "law_firm",
  "bank",
  "government",
  "other",
] as const;

const companyIndustrySchema = z.enum(companyIndustryValues);

/** Full `companies` row validator. */
export const companySchema = z.object({
  company_id: z.string().uuid(),
  client_id: z.string().uuid(),
  name: z.string().min(1),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  custom_fields: z.record(z.string(), jsonValueSchema).default({}),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `companies` (id/timestamps omitted). */
export const companyInsertSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), jsonValueSchema).optional(),
});

export type Company = z.infer<typeof companySchema>;
export type CompanyInsert = z.infer<typeof companyInsertSchema>;
```

> **Note:** `jsonValueSchema` is already defined in the same file (line ~20). `isoDateTimeSchema` is also already defined (line ~8). No new imports needed.

### Step 4: Add industry badge variant map to `src/lib/crm/display.ts`

Add the import at the top:
```typescript
import { crmTaskStatusValues, companyIndustryValues, dealStageValues } from "@/lib/crm/schemas";
```

Add after the `dealStageBadgeVariantMap`:
```typescript
/** Badge variants for company industry chips. */
export const companyIndustryBadgeVariantMap: Record<string, BadgeVariant> = {
  property_agency: "info",
  developer: "success",
  law_firm: "warning",
  bank: "secondary",
  government: "outline",
  other: "secondary",
};
```

### Step 5: Verify TypeScript compilation

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 6: Commit

```bash
git add src/types/database.ts src/lib/crm/schemas.ts src/lib/crm/display.ts
git commit -m "feat(pr15d): add company Zod schemas, industry values, and badge variant map"
```

---

## Task 3: Company tools — search, create, update, batch_create

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/companies.test.ts`
- Create: `src/lib/runner/tools/crm/companies.ts`

> This task builds the company CRUD tool factory following the exact same pattern as `contacts.ts` and `deals.ts`. TDD: write tests first, then implement.

### Step 1: Write the failing tests

Create `src/lib/runner/tools/crm/__tests__/companies.test.ts`:

```typescript
/**
 * Tests for CRM company tools.
 * @module lib/runner/tools/crm/__tests__/companies.test
 */
import { describe, expect, it } from "vitest";

import { createCompanyTools } from "../companies";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_companies", () => {
  it("returns matching companies for a query", async () => {
    const companies = [
      {
        company_id: "550e8400-e29b-41d4-a716-446655440000",
        name: "PropNex Realty",
        industry: "property_agency",
        website: "https://propnex.com",
        phone: "+6562201000",
        email: "info@propnex.com",
        address: "480 Lorong 6 Toa Payoh",
        notes: null,
        custom_fields: {},
      },
    ];
    const { client, builders } = createMockSupabase({
      companies: { data: companies, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.search_companies.execute(
      { query: "PropNex" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, companies, count: 1 });
    expect(builders.companies.or).toHaveBeenCalledWith(
      expect.stringContaining("PropNex"),
    );
  });

  it("applies industry filter when provided", async () => {
    const { client, builders } = createMockSupabase({
      companies: { data: [], error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    await tools.search_companies.execute(
      { query: "test", industry: "property_agency" },
      EXECUTION_OPTIONS,
    );

    expect(builders.companies.eq).toHaveBeenCalledWith(
      "industry",
      "property_agency",
    );
  });

  it("defaults to limit 20", async () => {
    const { client, builders } = createMockSupabase({
      companies: { data: [], error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    await tools.search_companies.execute({ query: "test" }, EXECUTION_OPTIONS);

    expect(builders.companies.limit).toHaveBeenCalledWith(20);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      companies: { data: null, error: { message: "connection timeout" } },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.search_companies.execute(
      { query: "test" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "connection timeout" });
  });

  it("lists all companies when query is omitted", async () => {
    const { client, builders } = createMockSupabase({
      companies: { data: [], error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    await tools.search_companies.execute({}, EXECUTION_OPTIONS);

    expect(builders.companies.or).not.toHaveBeenCalled();
  });
});

describe("create_company", () => {
  it("creates and returns a company when no duplicates found", async () => {
    const created = {
      company_id: "550e8400-e29b-41d4-a716-446655440001",
      client_id: CLIENT_ID,
      name: "ERA Realty",
      industry: "property_agency",
      website: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      custom_fields: {},
      created_at: "2026-03-07T00:00:00Z",
      updated_at: "2026-03-07T00:00:00Z",
    };
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty", industry: "property_agency" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: created });
    expect(builderHistory.companies[0].ilike).toHaveBeenCalledWith(
      "name",
      "%ERA Realty%",
    );
    expect(builderHistory.companies[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        name: "ERA Realty",
        industry: "property_agency",
      }),
    );
  });

  it("returns possible_duplicates when matching company exists", async () => {
    const existing = [
      {
        company_id: "existing-1",
        name: "ERA Realty",
        industry: "property_agency",
      },
    ];
    const { client } = createMockSupabase({
      companies: { data: existing, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: false,
      reason: "possible_duplicates",
      possible_duplicates: existing,
      message: expect.stringContaining("ERA Realty"),
    });
  });

  it("skips dedup when force_create is true", async () => {
    const created = {
      company_id: "new-1",
      client_id: CLIENT_ID,
      name: "ERA Realty",
    };
    const { client, from } = createMockSupabase({
      companies: { data: created, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty", force_create: true },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: created });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("falls through to insert when dedup search errors", async () => {
    const created = {
      company_id: "new-2",
      client_id: CLIENT_ID,
      name: "ERA Realty",
    };
    const { client } = createMockSupabase({
      companies: [
        { data: null, error: { message: "timeout" } },
        { data: created, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: created });
  });

  it("defaults nullable fields to null", async () => {
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: {}, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    await tools.create_company.execute(
      { name: "Minimal Corp" },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.companies[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        industry: null,
        website: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
      }),
    );
  });

  it("returns errors from Supabase insert", async () => {
    const { client } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: null, error: { message: "constraint violation" } },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.create_company.execute(
      { name: "ERA Realty" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "constraint violation" });
  });
});

describe("update_company", () => {
  it("updates and returns a company", async () => {
    const updated = {
      company_id: "550e8400-e29b-41d4-a716-446655440002",
      client_id: CLIENT_ID,
      name: "ERA Realty Updated",
      industry: "property_agency",
      website: "https://era.com.sg",
      phone: null,
      email: null,
      address: null,
      notes: null,
      custom_fields: {},
      created_at: "2026-03-07T00:00:00Z",
      updated_at: "2026-03-07T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      companies: { data: updated, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.update_company.execute(
      {
        company_id: "550e8400-e29b-41d4-a716-446655440002",
        name: "ERA Realty Updated",
        website: "https://era.com.sg",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, company: updated });
    expect(builders.companies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ERA Realty Updated",
        website: "https://era.com.sg",
      }),
    );
    expect(builders.companies.eq).toHaveBeenCalledWith(
      "company_id",
      "550e8400-e29b-41d4-a716-446655440002",
    );
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.update_company.execute(
      { company_id: "550e8400-e29b-41d4-a716-446655440002" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      companies: { data: null, error: { message: "Row not found" } },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.update_company.execute(
      {
        company_id: "550e8400-e29b-41d4-a716-446655440002",
        name: "Ghost",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });
});

describe("batch_create_companies", () => {
  it("creates multiple companies when no duplicates found", async () => {
    const created = [
      {
        company_id: "aaa",
        client_id: CLIENT_ID,
        name: "PropNex",
        industry: "property_agency",
      },
      {
        company_id: "bbb",
        client_id: CLIENT_ID,
        name: "DBS Bank",
        industry: "bank",
      },
    ];
    const { client, builderHistory } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.batch_create_companies.execute(
      {
        companies: [
          { name: "PropNex", industry: "property_agency" },
          { name: "DBS Bank", industry: "bank" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, companies: created, count: 2 });
    expect(builderHistory.companies[2].insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ client_id: CLIENT_ID, name: "PropNex" }),
        expect.objectContaining({ client_id: CLIENT_ID, name: "DBS Bank" }),
      ]),
    );
  });

  it("returns possible_duplicates when existing companies match", async () => {
    const existing = [{ company_id: "existing-1", name: "PropNex" }];
    const { client } = createMockSupabase({
      companies: [
        { data: existing, error: null },
        { data: [], error: null },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.batch_create_companies.execute(
      {
        companies: [
          { name: "PropNex" },
          { name: "DBS Bank" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
    });
  });

  it("detects intra-batch duplicates", async () => {
    const { client } = createMockSupabase();
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.batch_create_companies.execute(
      {
        companies: [
          { name: "PropNex" },
          { name: "propnex" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "possible_duplicates",
      message: expect.stringContaining("Intra-batch"),
    });
  });

  it("skips dedup when force_create is true", async () => {
    const created = [{ company_id: "aaa", name: "PropNex" }];
    const { client, from } = createMockSupabase({
      companies: { data: created, error: null },
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.batch_create_companies.execute(
      {
        companies: [{ name: "PropNex" }],
        force_create: true,
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, companies: created, count: 1 });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      companies: [
        { data: [], error: null },
        { data: null, error: { message: "batch insert failed" } },
      ],
    });
    const tools = createCompanyTools(client, CLIENT_ID);

    const result = await tools.batch_create_companies.execute(
      { companies: [{ name: "PropNex" }] },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "batch insert failed" });
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/companies.test.ts
```

Expected: All tests FAIL with `Cannot find module '../companies'`.

### Step 3: Implement `src/lib/runner/tools/crm/companies.ts`

```typescript
/**
 * CRM company tools for the runner.
 * @module lib/runner/tools/crm/companies
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { companyIndustryValues } from "@/lib/crm/schemas";
import type { Database } from "@/types/database";

import { buildIlikePattern, buildSearchExpression, DEFAULT_CRM_RESULT_LIMIT } from "./filter-utils";

const COMPANY_SEARCH_COLUMNS = ["name", "website", "notes"];

/**
 * Searches for existing companies matching name (case-insensitive).
 * Returns matched rows or `null` on query error (best-effort — callers should fall through on null).
 */
async function findDuplicateCompanies(
  supabase: SupabaseClient<Database>,
  name: string,
): Promise<unknown[] | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .ilike("name", buildIlikePattern(name))
    .limit(10);

  if (error) return null;
  return data ?? [];
}

/**
 * Creates company-related CRM tools.
 *
 * The factory closes over `clientId` so the LLM never provides tenant identity.
 */
export function createCompanyTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const search_companies = tool({
    description:
      "Search companies by name, website, or notes. Optionally filter by industry. " +
      "Omit query to list all companies. Searches across name, website, and notes using OR matching.",
    inputSchema: z.object({
      query: z.string().trim().min(1).optional().describe("Search term for name, website, or notes. Omit to list all companies."),
      industry: z.enum(companyIndustryValues).optional().describe("Company industry filter."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum results to return. Defaults to 20."),
    }),
    execute: async ({ query, industry, limit }) => {
      const maxResults = limit ?? DEFAULT_CRM_RESULT_LIMIT;

      let queryBuilder = supabase
        .from("companies")
        .select("*");

      if (query) {
        queryBuilder = queryBuilder.or(buildSearchExpression(query, COMPANY_SEARCH_COLUMNS));
      }

      if (industry) {
        queryBuilder = queryBuilder.eq("industry", industry);
      }

      const { data, error } = await queryBuilder.limit(maxResults);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const companies = data ?? [];

      return {
        success: true as const,
        companies,
        count: companies.length,
      };
    },
  });

  const create_company = tool({
    description:
      "Create a new company. Has built-in duplicate detection — if a company with a matching name already exists, " +
      "returns possible_duplicates instead of creating. Review the candidates and use update_company on the existing " +
      "record, or re-call with force_create: true to override. " +
      "Data Modification Warning: Only create companies when the user has explicitly asked to do so.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Company name."),
      industry: z.enum(companyIndustryValues).optional().describe("Company industry classification."),
      website: z.string().optional().describe("Company website URL."),
      phone: z.string().optional().describe("Company phone number."),
      email: z.string().email().optional().describe("Company email address."),
      address: z.string().optional().describe("Company address."),
      notes: z.string().optional().describe("Free-form company notes."),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection and create the company regardless."),
    }),
    execute: async ({ name, industry, website, phone, email, address, notes, force_create }) => {
      if (!force_create) {
        const duplicates = await findDuplicateCompanies(supabase, name);
        if (duplicates && duplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: duplicates,
            message: `Found ${duplicates.length} existing company/companies matching "${name}". Review and use update_company, or re-call with force_create: true.`,
          };
        }
      }

      const { data, error } = await supabase
        .from("companies")
        .insert({
          client_id: clientId,
          name,
          industry: industry ?? null,
          website: website ?? null,
          phone: phone ?? null,
          email: email ?? null,
          address: address ?? null,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        company: data,
      };
    },
  });

  const update_company = tool({
    description:
      "Update an existing company by id. Use this after finding the company via search_companies. " +
      "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a nullable field. " +
      "Data Modification Warning: Only update companies when the user has explicitly asked to do so.",
    inputSchema: z.object({
      company_id: z.string().uuid().describe("UUID of the company to update. Use search_companies to find this."),
      name: z.string().min(1).optional().describe("Updated company name."),
      industry: z.enum(companyIndustryValues).nullable().optional().describe("Updated industry or null to clear."),
      website: z.string().nullable().optional().describe("Updated website or null to clear."),
      phone: z.string().nullable().optional().describe("Updated phone or null to clear."),
      email: z.string().email().nullable().optional().describe("Updated email or null to clear."),
      address: z.string().nullable().optional().describe("Updated address or null to clear."),
      notes: z.string().nullable().optional().describe("Updated notes or null to clear."),
    }),
    execute: async ({ company_id, ...fields }) => {
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update" };
      }

      const { data, error } = await supabase
        .from("companies")
        .update(updates)
        .eq("company_id", company_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        company: data,
      };
    },
  });

  const batch_create_companies = tool({
    description:
      "Create multiple companies in a single call. Has built-in duplicate detection — checks for intra-batch " +
      "duplicates (same name appearing twice) and existing records with matching names. If any duplicates found, " +
      "returns possible_duplicates for all entries without inserting. Use force_create: true to override. " +
      "Data Modification Warning: Only create companies when the user has explicitly asked to do so.",
    inputSchema: z.object({
      companies: z
        .array(
          z.object({
            name: z.string().min(1).describe("Company name."),
            industry: z.enum(companyIndustryValues).optional().describe("Company industry classification."),
            website: z.string().optional().describe("Company website URL."),
            phone: z.string().optional().describe("Company phone number."),
            email: z.string().email().optional().describe("Company email address."),
            address: z.string().optional().describe("Company address."),
            notes: z.string().optional().describe("Free-form company notes."),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of companies to create (1-50 per call)."),
      force_create: z.boolean().optional().describe("Set to true to skip duplicate detection for the entire batch."),
    }),
    execute: async ({ companies, force_create }) => {
      if (!force_create) {
        const nameKeys = companies.map((c) => c.name.toLowerCase());
        const seen = new Set<string>();
        const intraDupes: string[] = [];
        for (const key of nameKeys) {
          if (seen.has(key)) {
            intraDupes.push(key);
          }
          seen.add(key);
        }

        if (intraDupes.length > 0) {
          const dupeNames = [...new Set(intraDupes)];
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: [],
            message: `Intra-batch duplicates detected: ${dupeNames.join(", ")}. Remove duplicates or use force_create: true.`,
          };
        }

        const allDuplicates: Array<{ input: { name: string }; existing: unknown[] }> = [];
        for (const company of companies) {
          const duplicates = await findDuplicateCompanies(supabase, company.name);
          if (duplicates && duplicates.length > 0) {
            allDuplicates.push({ input: { name: company.name }, existing: duplicates });
          }
        }

        if (allDuplicates.length > 0) {
          return {
            success: false as const,
            reason: "possible_duplicates" as const,
            possible_duplicates: allDuplicates,
            message: `Found existing companies matching ${allDuplicates.length} entries. Review and use update_company, or re-call with force_create: true.`,
          };
        }
      }

      const rows = companies.map((c) => ({
        client_id: clientId,
        name: c.name,
        industry: c.industry ?? null,
        website: c.website ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
        notes: c.notes ?? null,
      }));

      const { data, error } = await supabase
        .from("companies")
        .insert(rows)
        .select();

      if (error) {
        return { success: false as const, error: error.message };
      }

      const created = data ?? [];

      return {
        success: true as const,
        companies: created,
        count: created.length,
      };
    },
  });

  return {
    search_companies,
    create_company,
    update_company,
    batch_create_companies,
  };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/companies.test.ts
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/crm/companies.ts src/lib/runner/tools/crm/__tests__/companies.test.ts
git commit -m "feat(pr15d): add company CRUD tools with tests (search, create, update, batch_create)"
```

---

## Task 4: Company link/unlink tools — link/unlink contacts and deals to companies

**Files:**
- Create: `src/lib/runner/tools/crm/__tests__/company-links.test.ts`
- Create: `src/lib/runner/tools/crm/company-links.ts`

> These tools manage the company_id FK on contacts and deals. Simpler than deal-contacts (no junction table — just a direct FK UPDATE).

### Step 1: Write the failing tests

Create `src/lib/runner/tools/crm/__tests__/company-links.test.ts`:

```typescript
/**
 * Tests for CRM company link/unlink tools.
 * @module lib/runner/tools/crm/__tests__/company-links.test
 */
import { describe, expect, it } from "vitest";

import { createCompanyLinkTools } from "../company-links";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const COMPANY_ID = "aaa-bbb-ccc";
const CONTACT_ID = "ddd-eee-fff";
const DEAL_ID = "ggg-hhh-iii";

describe("link_contact_to_company", () => {
  it("updates contact with company_id and returns success", async () => {
    const updated = { contact_id: CONTACT_ID, company_id: COMPANY_ID };
    const { client, builders } = createMockSupabase({
      contacts: { data: updated, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_company.execute(
      { contact_id: CONTACT_ID, company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: updated });
    expect(builders.contacts.update).toHaveBeenCalledWith({ company_id: COMPANY_ID });
    expect(builders.contacts.eq).toHaveBeenCalledWith("contact_id", CONTACT_ID);
    expect(builders.contacts.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      contacts: { data: null, error: { message: "not found" } },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.link_contact_to_company.execute(
      { contact_id: CONTACT_ID, company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "not found" });
  });
});

describe("unlink_contact_from_company", () => {
  it("sets contact company_id to null", async () => {
    const updated = { contact_id: CONTACT_ID, company_id: null };
    const { client, builders } = createMockSupabase({
      contacts: { data: updated, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.unlink_contact_from_company.execute(
      { contact_id: CONTACT_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contact: updated });
    expect(builders.contacts.update).toHaveBeenCalledWith({ company_id: null });
  });
});

describe("link_deal_to_company", () => {
  it("updates deal with company_id and returns success", async () => {
    const updated = { deal_id: DEAL_ID, company_id: COMPANY_ID };
    const { client, builders } = createMockSupabase({
      deals: { data: updated, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.link_deal_to_company.execute(
      { deal_id: DEAL_ID, company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal: updated });
    expect(builders.deals.update).toHaveBeenCalledWith({ company_id: COMPANY_ID });
    expect(builders.deals.eq).toHaveBeenCalledWith("deal_id", DEAL_ID);
    expect(builders.deals.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      deals: { data: null, error: { message: "not found" } },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.link_deal_to_company.execute(
      { deal_id: DEAL_ID, company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "not found" });
  });
});

describe("unlink_deal_from_company", () => {
  it("sets deal company_id to null", async () => {
    const updated = { deal_id: DEAL_ID, company_id: null };
    const { client, builders } = createMockSupabase({
      deals: { data: updated, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.unlink_deal_from_company.execute(
      { deal_id: DEAL_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deal: updated });
    expect(builders.deals.update).toHaveBeenCalledWith({ company_id: null });
  });
});

describe("get_company_contacts", () => {
  it("returns contacts linked to a company", async () => {
    const contacts = [
      { contact_id: "c1", first_name: "John", last_name: "Smith", company_id: COMPANY_ID },
    ];
    const { client, builders } = createMockSupabase({
      contacts: { data: contacts, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_contacts.execute(
      { company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, contacts, count: 1 });
    expect(builders.contacts.eq).toHaveBeenCalledWith("company_id", COMPANY_ID);
  });
});

describe("get_company_deals", () => {
  it("returns deals linked to a company", async () => {
    const deals = [
      { deal_id: "d1", address: "123 Main St", company_id: COMPANY_ID },
    ];
    const { client, builders } = createMockSupabase({
      deals: { data: deals, error: null },
    });
    const tools = createCompanyLinkTools(client, CLIENT_ID);

    const result = await tools.get_company_deals.execute(
      { company_id: COMPANY_ID },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, deals, count: 1 });
    expect(builders.deals.eq).toHaveBeenCalledWith("company_id", COMPANY_ID);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/company-links.test.ts
```

Expected: All tests FAIL with `Cannot find module '../company-links'`.

### Step 3: Implement `src/lib/runner/tools/crm/company-links.ts`

```typescript
/**
 * CRM company linking tools for the runner.
 * @module lib/runner/tools/crm/company-links
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates company link/unlink tools.
 *
 * These tools manage the direct FK `company_id` on contacts and deals.
 * Unlike deal_contacts (many-to-many junction table), company linking
 * is a simple UPDATE on the child table's company_id column.
 */
export function createCompanyLinkTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const link_contact_to_company = tool({
    description:
      "Link a contact to a company by setting the contact's company_id. " +
      "A contact can belong to at most one company. Linking to a new company replaces the previous link. " +
      "Data Modification Warning: Only link contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact. Use search_contacts to find this."),
      company_id: z.string().uuid().describe("UUID of the company. Use search_companies to find this."),
    }),
    execute: async ({ contact_id, company_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update({ company_id })
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, contact: data };
    },
  });

  const unlink_contact_from_company = tool({
    description:
      "Remove a contact from its company by clearing the company_id. " +
      "Data Modification Warning: Only unlink contacts when the user has explicitly asked to do so.",
    inputSchema: z.object({
      contact_id: z.string().uuid().describe("UUID of the contact to unlink."),
    }),
    execute: async ({ contact_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update({ company_id: null })
        .eq("contact_id", contact_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, contact: data };
    },
  });

  const link_deal_to_company = tool({
    description:
      "Link a deal to a company by setting the deal's company_id. " +
      "A deal can belong to at most one company. Linking to a new company replaces the previous link. " +
      "Data Modification Warning: Only link deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal. Use search_deals to find this."),
      company_id: z.string().uuid().describe("UUID of the company. Use search_companies to find this."),
    }),
    execute: async ({ deal_id, company_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .update({ company_id })
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal: data };
    },
  });

  const unlink_deal_from_company = tool({
    description:
      "Remove a deal from its company by clearing the company_id. " +
      "Data Modification Warning: Only unlink deals when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_id: z.string().uuid().describe("UUID of the deal to unlink."),
    }),
    execute: async ({ deal_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .update({ company_id: null })
        .eq("deal_id", deal_id)
        .eq("client_id", clientId)
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, deal: data };
    },
  });

  const get_company_contacts = tool({
    description:
      "Get all contacts linked to a company. Returns contact details for each linked contact.",
    inputSchema: z.object({
      company_id: z.string().uuid().describe("UUID of the company."),
    }),
    execute: async ({ company_id }) => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("company_id", company_id);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const contacts = data ?? [];

      return {
        success: true as const,
        contacts,
        count: contacts.length,
      };
    },
  });

  const get_company_deals = tool({
    description:
      "Get all deals linked to a company. Returns deal details for each linked deal.",
    inputSchema: z.object({
      company_id: z.string().uuid().describe("UUID of the company."),
    }),
    execute: async ({ company_id }) => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("company_id", company_id);

      if (error) {
        return { success: false as const, error: error.message };
      }

      const deals = data ?? [];

      return {
        success: true as const,
        deals,
        count: deals.length,
      };
    },
  });

  return {
    link_contact_to_company,
    unlink_contact_from_company,
    link_deal_to_company,
    unlink_deal_from_company,
    get_company_contacts,
    get_company_deals,
  };
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/company-links.test.ts
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/lib/runner/tools/crm/company-links.ts src/lib/runner/tools/crm/__tests__/company-links.test.ts
git commit -m "feat(pr15d): add company link/unlink tools with tests"
```

---

## Task 5: Wire company tools into CRM barrel

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts`

> Wire the new company tools into the `createCrmTools` barrel so the runner can register them in `streamText({ tools })`.

### Step 1: Read existing barrel test to understand current tool counts

The existing test at `src/lib/runner/tools/crm/__tests__/index.test.ts` asserts:
- Read tools: 4 (search_contacts, search_deals, search_tasks, get_deal_contacts)
- Full tools: 15 (4 read + 11 write)

After adding company tools, the new counts will be:
- Read tools: 4 + 3 = 7 (add search_companies, get_company_contacts, get_company_deals)
- Write tools: 11 + 8 = 19 (add create_company, update_company, batch_create_companies, link_contact_to_company, unlink_contact_from_company, link_deal_to_company, unlink_deal_from_company)
- Full tools: 7 + 19 = 26

### Step 2: Update the barrel test

In `src/lib/runner/tools/crm/__tests__/index.test.ts`, update the tool count assertions and add company-specific tool name checks. The exact changes depend on the current test structure. Update:
- Read tools count: 4 → 7
- Full tools count: 15 → 26
- Add `search_companies`, `get_company_contacts`, `get_company_deals` to read tools assertion
- Add `create_company`, `update_company`, `batch_create_companies`, `link_contact_to_company`, `unlink_contact_from_company`, `link_deal_to_company`, `unlink_deal_from_company` to write tools assertion

### Step 3: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
```

Expected: FAIL — counts don't match.

### Step 4: Update `src/lib/runner/tools/crm/index.ts`

Add imports:
```typescript
import { createCompanyTools } from "./companies";
import { createCompanyLinkTools } from "./company-links";
```

Add factory calls inside `createCrmTools`:
```typescript
const companyTools = createCompanyTools(supabase, clientId);
const companyLinkTools = createCompanyLinkTools(supabase, clientId);
```

Add to `readTools` object:
```typescript
search_companies: companyTools.search_companies,
get_company_contacts: companyLinkTools.get_company_contacts,
get_company_deals: companyLinkTools.get_company_deals,
```

Add to write tools return (the `return { ...readTools, ... }` block):
```typescript
create_company: companyTools.create_company,
update_company: companyTools.update_company,
batch_create_companies: companyTools.batch_create_companies,
link_contact_to_company: companyLinkTools.link_contact_to_company,
unlink_contact_from_company: companyLinkTools.unlink_contact_from_company,
link_deal_to_company: companyLinkTools.link_deal_to_company,
unlink_deal_from_company: companyLinkTools.unlink_deal_from_company,
```

### Step 5: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
```

Expected: All tests PASS.

### Step 6: Run all CRM tool tests to verify nothing is broken

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

Expected: All tests PASS across contacts, deals, companies, company-links, and index.

### Step 7: Commit

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tools/crm/__tests__/index.test.ts
git commit -m "feat(pr15d): wire company tools into CRM barrel (26 total tools)"
```

---

## Task 6: TanStack Query hooks — useCompanies, useCompany, useUpdateCompany, useCompanyRelations

**Files:**
- Create: `src/hooks/use-companies.ts`
- Create: `src/hooks/use-update-company.ts`
- Create: `src/hooks/use-company-relations.ts`

> These hooks follow the exact patterns from `use-contacts.ts`, `use-update-contact.ts`, and `use-contact-relations.ts`. They provide data fetching, realtime invalidation, and mutation for company records.

### Step 1: Create `src/hooks/use-companies.ts`

```typescript
/**
 * TanStack Query hooks for CRM companies.
 * @module hooks/use-companies
 */
"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { buildSearchExpression } from "@/lib/crm/postgrest-filters";
import { companyIndustryValues, type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

export type CompanyIndustry = (typeof companyIndustryValues)[number];

export interface CompanyFilters {
  search?: string;
  industry?: CompanyIndustry;
}

/**
 * Query key factory for company list and detail queries.
 */
export const companyKeys = {
  all: ["companies"] as const,
  lists: () => [...companyKeys.all, "list"] as const,
  list: (filters: CompanyFilters) => [...companyKeys.lists(), filters] as const,
  details: () => [...companyKeys.all, "detail"] as const,
  detail: (companyId: string) => [...companyKeys.details(), companyId] as const,
};

async function fetchCompanies({ search, industry }: CompanyFilters): Promise<Company[]> {
  let query = supabase.from("companies").select("*").order("updated_at", { ascending: false });

  if (search?.trim()) {
    query = query.or(buildSearchExpression(search, ["name", "website", "notes"]));
  }

  if (industry) {
    query = query.eq("industry", industry);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as Company[];
}

export function companiesQueryOptions(filters: CompanyFilters) {
  return queryOptions({
    queryKey: companyKeys.list(filters),
    queryFn: () => fetchCompanies(filters),
  });
}

export function companyDetailQueryOptions(companyId: string) {
  return queryOptions({
    queryKey: companyKeys.detail(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("company_id", companyId)
        .single();

      if (error) {
        throw error;
      }

      return data as Company;
    },
  });
}

/**
 * Subscribes to company row changes and returns companies list query state.
 */
export function useCompanies(filters: CompanyFilters) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyKeys.all],
    enabled: Boolean(clientId),
  });

  return useQuery({
    ...companiesQueryOptions(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Returns a single company by id.
 */
export function useCompany(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "companies",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyKeys.detail(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    ...companyDetailQueryOptions(companyId),
    enabled: Boolean(companyId),
  });
}
```

### Step 2: Create `src/hooks/use-update-company.ts`

```typescript
/**
 * Mutation hook for updating CRM company fields.
 * @module hooks/use-update-company
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { companyKeys } from "@/hooks/use-companies";
import { type Company } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type CompanyUpdate = Partial<
  Pick<Company, "name" | "industry" | "website" | "phone" | "email" | "address" | "notes">
>;

/**
 * Returns a mutation for updating one company row.
 */
export function useUpdateCompany(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: CompanyUpdate) => {
      const { error } = await supabase.from("companies").update(updates).eq("company_id", companyId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export type { CompanyUpdate };
```

### Step 3: Create `src/hooks/use-company-relations.ts`

```typescript
/**
 * TanStack Query hooks for company-linked contacts and deals.
 * @module hooks/use-company-relations
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { type Contact, type Deal } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

/**
 * Query key factory for company relation queries.
 */
export const companyRelationKeys = {
  all: ["company-relations"] as const,
  contacts: (companyId: string) => [...companyRelationKeys.all, "contacts", companyId] as const,
  deals: (companyId: string) => [...companyRelationKeys.all, "deals", companyId] as const,
};

/**
 * Returns contacts linked to a company (contacts where company_id matches).
 */
export function useCompanyContacts(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "contacts",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyRelationKeys.contacts(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    queryKey: companyRelationKeys.contacts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Contact[];
    },
    enabled: Boolean(companyId),
  });
}

/**
 * Returns deals linked to a company (deals where company_id matches).
 */
export function useCompanyDeals(companyId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "deals",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [companyRelationKeys.deals(companyId)],
    enabled: Boolean(clientId && companyId),
  });

  return useQuery({
    queryKey: companyRelationKeys.deals(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as Deal[];
    },
    enabled: Boolean(companyId),
  });
}
```

### Step 4: Verify TypeScript compilation

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 5: Commit

```bash
git add src/hooks/use-companies.ts src/hooks/use-update-company.ts src/hooks/use-company-relations.ts
git commit -m "feat(pr15d): add TanStack Query hooks for companies (list, detail, update, relations)"
```

---

## Task 7: Companies list page and table

**Files:**
- Create: `app/(dashboard)/crm/companies/page.tsx`
- Create: `src/components/crm/companies-table.tsx`
- Modify: `app/(dashboard)/crm/layout.tsx` — add Companies tab

> These files follow the exact patterns from the contacts page and contacts table.

### Step 1: Create `src/components/crm/companies-table.tsx`

```typescript
/**
 * CRM companies table with sortable columns and row navigation.
 * @module components/crm/companies-table
 */
"use client";

import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { useMemo, useState, type MouseEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { companyIndustryBadgeVariantMap, formatCrmDate } from "@/lib/crm/display";
import type { Company } from "@/lib/crm/schemas";

const columnHelper = createColumnHelper<Company>();

interface CompaniesTableProps {
  companies: Company[];
  /** Called when a user clicks a row outside inline link/button controls. */
  onRowClick?: (companyId: string) => void;
}

export function CompaniesTable({ companies, onRowClick }: CompaniesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Name",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("industry", {
        header: "Industry",
        cell: (info) => {
          const industry = info.getValue();
          if (!industry) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <Badge variant={companyIndustryBadgeVariantMap[industry] ?? "secondary"}>
              {industry.replace(/_/g, " ")}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("phone", {
        header: "Phone",
        cell: (info) => {
          const phone = info.getValue();
          if (!phone) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <a
              href={`tel:${phone}`}
              className="text-foreground/80 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {phone}
            </a>
          );
        },
      }),
      columnHelper.accessor("website", {
        header: "Website",
        cell: (info) => {
          const website = info.getValue();
          if (!website) {
            return <span className="text-muted-foreground">—</span>;
          }

          return (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {website.replace(/^https?:\/\//, "")}
            </a>
          );
        },
      }),
      columnHelper.accessor("updated_at", {
        header: "Last Updated",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatCrmDate(info.getValue())}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: companies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, companyId: string) => {
    if ((event.target as HTMLElement).closest("a,button,[role='button']")) {
      return;
    }

    onRowClick?.(companyId);
  };

  if (companies.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground">No companies yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/40 bg-card shadow-sm">
      <table className="w-full">
        <thead className="border-b border-border/40 bg-muted/20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/70 md:px-5 md:py-4"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? null}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t border-border/30 transition-colors hover:bg-muted/40"
              onClick={(event) => handleRowClick(event, row.original.company_id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-3 text-[13px] text-foreground/80 md:px-5 md:py-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 2: Create `app/(dashboard)/crm/companies/page.tsx`

```typescript
/**
 * CRM companies list page with search/filter controls.
 * @module app/(dashboard)/crm/companies/page
 */
"use client";

import { useMemo, useState } from "react";

import { AppIcon } from "@/components/icons/app-icons";
import { RecordDrawer } from "@/components/crm/record-drawer";
import { CompaniesTable } from "@/components/crm/companies-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanies, type CompanyIndustry } from "@/hooks/use-companies";
import { useRecordDrawer } from "@/hooks/use-record-drawer";
import { companyIndustryValues } from "@/lib/crm/schemas";

const allIndustries = "all";

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>(allIndustries);
  const { isOpen, recordId, open, close } = useRecordDrawer();

  const companyFilters = useMemo(() => {
    const normalizedSearch = search.trim();
    const hasIndustryFilter = industryFilter !== allIndustries;

    return {
      search: normalizedSearch.length > 0 ? normalizedSearch : undefined,
      industry: hasIndustryFilter ? (industryFilter as CompanyIndustry) : undefined,
    };
  }, [search, industryFilter]);

  const { data: companies = [], isLoading, isError, refetch } = useCompanies(companyFilters);

  return (
    <div className="overflow-auto px-4 py-6 md:px-12 md:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Companies</h1>
        <p className="mt-2 text-sm text-muted-foreground/80">
          Browse and inspect companies created by your AI agent.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <AppIcon
            name="search"
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, website, or notes..."
            className="h-12 w-full border-border/50 pl-11 shadow-sm focus-visible:ring-1"
          />
        </div>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="h-12 w-full border-border/50 shadow-sm sm:w-48">
            <SelectValue placeholder="All industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={allIndustries}>All industries</SelectItem>
            {companyIndustryValues.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
            <p className="text-sm text-destructive">Unable to load companies</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-10 text-center shadow-sm md:p-20">
            <AppIcon name="building" className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-6 text-muted-foreground">
              {companyFilters.search || companyFilters.industry
                ? "No companies match your filters"
                : "No companies yet"}
            </p>
          </div>
        ) : (
          <CompaniesTable companies={companies} onRowClick={open} />
        )}
      </div>

      <RecordDrawer isOpen={isOpen} recordId={recordId} objectType="company" onClose={close} />
    </div>
  );
}
```

> **Note:** The `AppIcon name="building"` may need to be mapped in your icon registry. Check `src/components/icons/app-icons.tsx` for available icon names and add `"building"` if missing. If not available, use `"crm"` or `"contacts"` as a fallback.

### Step 3: Add Companies tab to `app/(dashboard)/crm/layout.tsx`

Add a third `<Link>` for companies and its active state check:

```typescript
const isCompaniesActive = pathname.startsWith("/crm/companies");
```

Add the Link element after the Deals link:
```typescript
<Link
  href="/crm/companies"
  className={[
    "border-b-2 px-1 pb-2 text-sm transition-colors",
    isCompaniesActive
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  ].join(" ")}
>
  Companies
</Link>
```

### Step 4: Verify the page renders locally

```bash
npm run dev
```

Navigate to `http://localhost:3000/crm/companies`. Expected: Page renders with search bar, industry filter, and empty state.

### Step 5: Commit

```bash
git add app/(dashboard)/crm/companies/page.tsx src/components/crm/companies-table.tsx app/(dashboard)/crm/layout.tsx
git commit -m "feat(pr15d): add companies list page with table, search, and industry filter"
```

---

## Task 8: Company drawer content

**Files:**
- Create: `src/components/crm/record-drawer/company-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/record-drawer.tsx`

> The company drawer shows company details, linked contacts, and linked deals. Follows the same pattern as `contact-drawer-content.tsx`.

### Step 1: Create `src/components/crm/record-drawer/company-drawer-content.tsx`

```typescript
/**
 * Company-specific record drawer body.
 * @module components/crm/record-drawer/company-drawer-content
 */
"use client";

import { InlineEditField } from "@/components/crm/inline-edit-field";
import { StageBadge } from "@/components/crm/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/hooks/use-companies";
import { useCompanyContacts, useCompanyDeals } from "@/hooks/use-company-relations";
import { useUpdateCompany } from "@/hooks/use-update-company";
import { companyIndustryBadgeVariantMap, formatContactFullName, formatCrmDate, formatCrmPrice, toNullableValue } from "@/lib/crm/display";
import { companyIndustryValues } from "@/lib/crm/schemas";

import { DrawerSection } from "./drawer-section";

interface CompanyDrawerContentProps {
  /** Company id selected in the drawer. */
  companyId: string;
}

/**
 * Renders company details, linked contacts, and linked deals.
 */
export function CompanyDrawerContent({ companyId }: CompanyDrawerContentProps) {
  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: linkedContacts = [] } = useCompanyContacts(companyId);
  const { data: linkedDeals = [] } = useCompanyDeals(companyId);
  const updateCompany = useUpdateCompany(companyId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (isError || !company) {
    return <div className="p-6 text-sm text-destructive">Failed to load company.</div>;
  }

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{company.name}</h2>
        {company.industry ? (
          <Badge variant={companyIndustryBadgeVariantMap[company.industry] ?? "secondary"}>
            {company.industry.replace(/_/g, " ")}
          </Badge>
        ) : null}
      </header>

      <DrawerSection title="Details">
        <div className="space-y-0.5">
          <InlineEditField
            label="Name"
            value={company.name}
            onSave={async (nextValue) => {
              const trimmed = nextValue.trim();
              if (trimmed.length > 0) {
                await updateCompany.mutateAsync({ name: trimmed });
              }
            }}
          />
          <InlineEditField
            label="Industry"
            value={company.industry}
            type="select"
            options={companyIndustryValues.map((industry) => ({
              value: industry,
              label: industry.replace(/_/g, " "),
            }))}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ industry: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Website"
            value={company.website}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ website: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Phone"
            value={company.phone}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ phone: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Email"
            value={company.email}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ email: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Address"
            value={company.address}
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ address: toNullableValue(nextValue) });
            }}
          />
          <InlineEditField
            label="Notes"
            value={company.notes}
            type="textarea"
            onSave={async (nextValue) => {
              await updateCompany.mutateAsync({ notes: toNullableValue(nextValue) });
            }}
          />
        </div>
      </DrawerSection>

      <DrawerSection title="Contacts">
        {linkedContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked contacts.</p>
        ) : (
          <div className="space-y-2">
            {linkedContacts.map((contact) => (
              <div
                key={contact.contact_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground/90">
                  {formatContactFullName(contact)}
                </span>
                <Badge variant="secondary">{contact.type}</Badge>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Deals">
        {linkedDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked deals.</p>
        ) : (
          <div className="space-y-2">
            {linkedDeals.map((deal) => (
              <div
                key={deal.deal_id}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground/90">{deal.address}</span>
                  {deal.price ? (
                    <span className="text-xs text-muted-foreground">{formatCrmPrice(deal.price)}</span>
                  ) : null}
                </div>
                <StageBadge stage={deal.stage} />
              </div>
            ))}
          </div>
        )}
      </DrawerSection>
    </div>
  );
}
```

### Step 2: Update `src/components/crm/record-drawer/record-drawer.tsx`

Add import:
```typescript
import { CompanyDrawerContent } from "./company-drawer-content";
```

Update `RecordObjectType`:
```typescript
export type RecordObjectType = "contact" | "deal" | "task" | "company";
```

Add company routing after the task line:
```typescript
{objectType === "company" ? <CompanyDrawerContent companyId={recordId} /> : null}
```

### Step 3: Verify the drawer renders locally

Navigate to `/crm/companies`, create a test company via chat, click a row. Expected: drawer opens with company details.

### Step 4: Commit

```bash
git add src/components/crm/record-drawer/company-drawer-content.tsx src/components/crm/record-drawer/record-drawer.tsx
git commit -m "feat(pr15d): add company drawer with details, linked contacts, and linked deals"
```

---

## Task 9: Update contact/deal drawers and tables to show Company

**Files:**
- Modify: `src/hooks/use-contacts.ts` — join company name
- Modify: `src/hooks/use-deals.ts` — join company name
- Modify: `src/components/crm/contacts-table.tsx` — add Company column
- Modify: `src/components/crm/deals-table.tsx` — add Company column
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx` — show company name
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx` — show company name

> Contacts and deals now have a `company_id` FK. This task surfaces the company name in tables and drawers.

### Step 1: Update `src/hooks/use-contacts.ts` to join company name

Update the `fetchContacts` function select to include company:

```typescript
let query = supabase
  .from("contacts")
  .select("*, companies!contacts_company_id_fkey(company_id, name)")
  .order("updated_at", { ascending: false });
```

Add a type for the joined result:

```typescript
export type ContactWithCompany = Contact & {
  companies: { company_id: string; name: string } | null;
};
```

Update the return type of `fetchContacts` to `ContactWithCompany[]` and cast accordingly.

Do the same for `contactDetailQueryOptions` — update the select to include the company join.

### Step 2: Update `src/hooks/use-deals.ts` to join company name

Update the `fetchDeals` function select to include company:

```typescript
let query = supabase
  .from("deals")
  .select("*, deal_contacts!deal_contacts_deal_id_fkey(contact_id, role, is_primary, contacts!deal_contacts_contact_id_fkey(first_name, last_name)), companies!deals_company_id_fkey(company_id, name)")
  .order("updated_at", { ascending: false });
```

Update `DealWithContact` type:
```typescript
export type DealWithContact = Deal & {
  deal_contacts: DealContactJoin[];
  companies: { company_id: string; name: string } | null;
};
```

Do the same for `fetchDeal`.

### Step 3: Add Company column to `src/components/crm/contacts-table.tsx`

Add a display column after the `type` column:

```typescript
columnHelper.display({
  id: "company",
  header: "Company",
  cell: ({ row }) => {
    const company = (row.original as ContactWithCompany).companies;
    if (!company) {
      return <span className="text-muted-foreground">—</span>;
    }
    return <span className="text-foreground/80">{company.name}</span>;
  },
}),
```

Update the import to bring in `ContactWithCompany` from `use-contacts` and update the props type accordingly.

### Step 4: Add Company column to `src/components/crm/deals-table.tsx`

Same pattern — add a display column for company name. Use `(row.original as DealWithContact).companies?.name`.

### Step 5: Update `src/components/crm/record-drawer/contact-drawer-content.tsx` — show company

Add a read-only company display in the Details section. Show the company name if the contact has a `company_id`. Use the joined data from `useContact`:

```typescript
{contact.companies ? (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm text-muted-foreground">Company</span>
    <span className="text-sm font-medium text-foreground/90">{contact.companies.name}</span>
  </div>
) : null}
```

### Step 6: Update `src/components/crm/record-drawer/deal-drawer-content.tsx` — show company

Same pattern as contact drawer — show company name if deal has one.

### Step 7: Verify TypeScript compilation and visual check

```bash
npx tsc --noEmit
npm run dev
```

Navigate to `/crm/contacts` and `/crm/deals`. Expected: Company column visible. Drawer shows company name.

### Step 8: Commit

```bash
git add src/hooks/use-contacts.ts src/hooks/use-deals.ts src/components/crm/contacts-table.tsx src/components/crm/deals-table.tsx src/components/crm/record-drawer/contact-drawer-content.tsx src/components/crm/record-drawer/deal-drawer-content.tsx
git commit -m "feat(pr15d): surface company name in contact/deal tables and drawers"
```

---

## Task 10: Final verification and type-check

**Files:** None new — this is a verification-only task.

> Run all tests, type-check, and verify the 7 test criteria from the implementation plan.

### Step 1: Run all CRM tool tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

Expected: All tests PASS (contacts, deals, companies, company-links, index, deal-contacts, interactions, tasks).

### Step 2: Run full type-check

```bash
npx tsc --noEmit
```

Expected: No type errors.

### Step 3: Run full test suite

```bash
npx vitest run
```

Expected: All tests PASS.

### Step 4: Verify test criteria manually

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Agent creates a company via chat → appears in /crm/companies page | Chat "create a company called PropNex", check /crm/companies |
| 2 | Agent links a contact to a company → contact drawer shows company, company drawer shows contact | Chat "link John to PropNex", check both drawers |
| 3 | Agent links a deal to a company → deal drawer shows company, company drawer shows deal | Chat "link 123 Main St deal to PropNex", check both drawers |
| 4 | search_companies by name and industry filter work correctly | Chat "search for property agency companies" |
| 5 | Company industries configurable via configure_crm tool | (This depends on PR 15c landing — skip if 15c not merged yet) |
| 6 | Default real-estate industries work with zero configuration | Check search_companies industry enum defaults |
| 7 | Deleting a company SET NULLs company_id on related contacts and deals | Delete company row in Supabase dashboard, verify contacts/deals still exist with null company_id |

### Step 5: Final commit (if any fixups needed)

```bash
git add -A
git commit -m "fix(pr15d): final verification fixes"
```

---

## Summary

| Task | Description | Files | Tests |
|------|-------------|-------|-------|
| 1 | Migration SQL | 1 created | Manual verification |
| 2 | Types + Schemas + Display | 3 modified | TypeScript check |
| 3 | Company CRUD tools | 2 created | 19 unit tests |
| 4 | Company link/unlink tools | 2 created | 10 unit tests |
| 5 | Tool barrel wiring | 2 modified | Updated counts |
| 6 | TanStack Query hooks | 3 created | TypeScript check |
| 7 | Companies page + table | 2 created, 1 modified | Visual verification |
| 8 | Company drawer | 1 created, 1 modified | Visual verification |
| 9 | Contact/deal integration | 6 modified | Visual verification |
| 10 | Final verification | — | All test criteria |

**Total new files:** 11
**Total modified files:** 12
**Total unit tests:** ~29 new test cases
