# Configurable CRM Columns Implementation Plan

**PR:** Out-of-plan (extends deferred work from PR 15c-10: "dynamic custom-field table columns move to a standalone micro-PR")
**Decisions:** TOOL-01, TOOL-02, DATA-01, DATA-09, SAFETY-04
**Goal:** Make all CRM table columns config-driven so the agent (or user) can add, hide, rename, reorder, and resize columns — replacing three hardcoded column arrays with a single `buildColumnsFromConfig()` function.

**Architecture:** Unified `FieldDefinition` interface with three protection tiers (indestructible / default / custom). Fields live in `contact_fields`, `company_fields`, `deal_fields` arrays inside `crm_config`. The existing `configure_crm` tool expands to manage the full fields array with tier enforcement. DB columns for new default fields (city, job_title, linkedin, etc.) are added via migration. Column reorder uses `@dnd-kit/sortable`; column widths persist via debounced config writes. Config version history provides rollback safety.

**Tech Stack:** Next.js 15, React 19, TanStack Table, TanStack Query, @dnd-kit/sortable, Zod 4, Supabase, Vitest

**Design doc:** `docs/plans/2026-04-01-configurable-crm-columns-design.md`

---

## Important: Verify Before Implementing

This tasklist is **advisory**. Before implementing each task:
1. **Verify file paths** — grep the codebase to find exact files. Paths here may be slightly off.
2. **Match repo conventions** — use existing route helpers, test patterns, and component structures.
3. **Check current schemas** — `src/lib/crm/config.ts` and `src/lib/crm/schemas.ts` may have changed since this plan was written.
4. **Read the design doc** — `docs/plans/2026-04-01-configurable-crm-columns-design.md` is the source of truth for field definitions, tiers, and behavior.

---

## Relevant Files

**Create:**
- `src/lib/crm/field-definitions.ts` — FieldDefinition type, FieldType enum, tier constants, default field arrays
- `src/lib/crm/__tests__/field-definitions.test.ts`
- `src/lib/crm/build-columns.tsx` — shared column generator from field config
- `src/lib/crm/__tests__/build-columns.test.tsx`
- `src/lib/crm/field-renderers.tsx` — cell renderer per field type
- `src/lib/crm/__tests__/field-renderers.test.tsx`
- `supabase/migrations/20260401000000_add_crm_field_columns.sql`
- `supabase/migrations/20260401000001_add_crm_config_history.sql`

**Modify:**
- `src/lib/crm/config.ts` — add field definition schema, update CrmVocabConfig, seed defaults
- `src/lib/crm/schemas.ts` — add field type enum, FieldDefinition validation
- `src/hooks/use-crm-config.ts` — expose `fields` arrays from config
- `src/lib/runner/tools/crm/configure-crm.ts` — expand to manage full fields array with tier enforcement
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- `app/(dashboard)/customers/people/page.tsx` — replace hardcoded columns with buildColumnsFromConfig
- `app/(dashboard)/customers/companies/page.tsx` — same
- `app/(dashboard)/customers/deals/page.tsx` — same
- `app/api/crm/config/route.ts` — handle new fields config shape
- `src/components/ui/data-table.tsx` — add column reorder + resize support
- `src/types/database.ts` — regenerate after migration

---

## Batch 1 — FieldDefinition type + validation schema

### Task 1: FieldDefinition type and Zod schema

**Files:**
- Create: `src/lib/crm/field-definitions.ts`
- Create: `src/lib/crm/__tests__/field-definitions.test.ts`
- Modify: `src/lib/crm/config.ts` (add fieldDefinitionSchema export)

**Step 1: Write failing tests for FieldDefinition schema validation**

Create `src/lib/crm/__tests__/field-definitions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  fieldDefinitionSchema,
  fieldTypeValues,
  type FieldDefinition,
  CONTACT_DEFAULT_FIELDS,
  COMPANY_DEFAULT_FIELDS,
  DEAL_DEFAULT_FIELDS,
} from "../field-definitions";

describe("fieldTypeValues", () => {
  it("includes all expected field types", () => {
    expect(fieldTypeValues).toContain("text");
    expect(fieldTypeValues).toContain("full_name");
    expect(fieldTypeValues).toContain("number");
    expect(fieldTypeValues).toContain("currency");
    expect(fieldTypeValues).toContain("email");
    expect(fieldTypeValues).toContain("phone");
    expect(fieldTypeValues).toContain("url");
    expect(fieldTypeValues).toContain("date");
    expect(fieldTypeValues).toContain("boolean");
    expect(fieldTypeValues).toContain("select");
    expect(fieldTypeValues).toContain("tags");
    expect(fieldTypeValues).toContain("richtext");
    expect(fieldTypeValues).toContain("file");
    expect(fieldTypeValues).toContain("relation");
  });
});

describe("fieldDefinitionSchema", () => {
  it("accepts a valid text field", () => {
    const field: FieldDefinition = {
      key: "city",
      label: "City",
      type: "text",
      source: "column",
      tier: "default",
      visible: true,
      order: 3,
      editable: true,
      required: false,
    };
    expect(fieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("accepts a select field with options", () => {
    const field: FieldDefinition = {
      key: "type",
      label: "Type",
      type: "select",
      source: "column",
      tier: "default",
      visible: true,
      order: 5,
      editable: true,
      required: false,
      options: ["buyer", "seller", "agent"],
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.options).toEqual(["buyer", "seller", "agent"]);
  });

  it("rejects select field without options", () => {
    const field = {
      key: "status",
      label: "Status",
      type: "select",
      source: "custom",
      tier: "custom",
      visible: true,
      order: 10,
      editable: true,
      required: false,
      // missing options
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });

  it("accepts a relation field with related_entity", () => {
    const field: FieldDefinition = {
      key: "company_id",
      label: "Company",
      type: "relation",
      source: "column",
      tier: "default",
      visible: true,
      order: 4,
      editable: true,
      required: false,
      related_entity: "companies",
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.related_entity).toBe("companies");
  });

  it("rejects relation field without related_entity", () => {
    const field = {
      key: "linked",
      label: "Linked",
      type: "relation",
      source: "custom",
      tier: "custom",
      visible: true,
      order: 10,
      editable: true,
      required: false,
      // missing related_entity
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });

  it("accepts optional width", () => {
    const field: FieldDefinition = {
      key: "name",
      label: "Name",
      type: "full_name",
      source: "column",
      tier: "indestructible",
      visible: true,
      order: 0,
      editable: false,
      required: true,
      width: 200,
    };
    const parsed = fieldDefinitionSchema.parse(field);
    expect(parsed.width).toBe(200);
  });

  it("rejects invalid tier value", () => {
    const field = {
      key: "name",
      label: "Name",
      type: "text",
      source: "column",
      tier: "protected", // invalid
      visible: true,
      order: 0,
      editable: false,
      required: true,
    };
    expect(() => fieldDefinitionSchema.parse(field)).toThrow();
  });
});

describe("default field arrays", () => {
  it("CONTACT_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = CONTACT_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
    expect(nameField!.type).toBe("full_name");
    expect(nameField!.visible).toBe(true);
  });

  it("CONTACT_DEFAULT_FIELDS has email as default tier", () => {
    const emailField = CONTACT_DEFAULT_FIELDS.find((f) => f.key === "emails");
    expect(emailField).toBeDefined();
    expect(emailField!.tier).toBe("default");
    expect(emailField!.source).toBe("column");
  });

  it("COMPANY_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = COMPANY_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
  });

  it("DEAL_DEFAULT_FIELDS has name as indestructible", () => {
    const nameField = DEAL_DEFAULT_FIELDS.find((f) => f.key === "name");
    expect(nameField).toBeDefined();
    expect(nameField!.tier).toBe("indestructible");
    expect(nameField!.type).toBe("text");
  });

  it("DEAL_DEFAULT_FIELDS has address as default (demoted from identity)", () => {
    const addressField = DEAL_DEFAULT_FIELDS.find((f) => f.key === "address");
    expect(addressField).toBeDefined();
    expect(addressField!.tier).toBe("default");
  });

  it("all default field arrays have sequential order values", () => {
    for (const fields of [CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS]) {
      const orders = fields.map((f) => f.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    }
  });

  it("all default field arrays pass schema validation", () => {
    for (const fields of [CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS]) {
      for (const field of fields) {
        expect(() => fieldDefinitionSchema.parse(field)).not.toThrow();
      }
    }
  });
});
```

- [ ] Create the test file
- [ ] Run `npx vitest run src/lib/crm/__tests__/field-definitions.test.ts` — FAIL (module not found)

**Step 2: Implement FieldDefinition type and default field arrays**

Create `src/lib/crm/field-definitions.ts`:

```typescript
/**
 * Unified field definition system for config-driven CRM columns.
 * Three protection tiers: indestructible (always visible), default (hideable), custom (fully mutable).
 * @module lib/crm/field-definitions
 */
import { z } from "zod";

/** All supported field types for CRM columns. */
export const fieldTypeValues = [
  "text",
  "full_name",
  "number",
  "currency",
  "email",
  "phone",
  "url",
  "date",
  "boolean",
  "select",
  "tags",
  "richtext",
  "file",
  "relation",
] as const;

export type FieldType = (typeof fieldTypeValues)[number];

/** Protection tiers for field definitions. */
export const fieldTierValues = ["indestructible", "default", "custom"] as const;
export type FieldTier = (typeof fieldTierValues)[number];

/** Where the field data lives. */
export const fieldSourceValues = ["column", "custom"] as const;
export type FieldSource = (typeof fieldSourceValues)[number];

/**
 * Zod schema for a single field definition.
 * Enforces: select/tags require options, relation requires related_entity.
 */
export const fieldDefinitionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(fieldTypeValues),
    source: z.enum(fieldSourceValues),
    tier: z.enum(fieldTierValues),
    visible: z.boolean(),
    order: z.number().int().min(0),
    editable: z.boolean(),
    required: z.boolean(),
    width: z.number().int().positive().optional(),
    options: z.array(z.string()).optional(),
    related_entity: z.enum(["contacts", "companies", "deals"]).optional(),
  })
  .refine(
    (f) => {
      if (f.type === "select" || f.type === "tags") {
        return Array.isArray(f.options) && f.options.length > 0;
      }
      return true;
    },
    { message: "select and tags fields require a non-empty options array" },
  )
  .refine(
    (f) => {
      if (f.type === "relation") {
        return typeof f.related_entity === "string";
      }
      return true;
    },
    { message: "relation fields require a related_entity" },
  );

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

// ---------------------------------------------------------------------------
// Default field arrays — one per entity type.
// See design doc: docs/plans/2026-04-01-configurable-crm-columns-design.md
// ---------------------------------------------------------------------------

/** Contacts: default fields shipped with every new client. */
export const CONTACT_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
  { key: "emails", label: "Email", type: "email", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
  { key: "phones", label: "Phone", type: "phone", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false },
  { key: "city", label: "City", type: "text", source: "column", tier: "default", visible: false, order: 3, editable: true, required: false },
  { key: "company_id", label: "Company", type: "relation", source: "column", tier: "default", visible: true, order: 4, editable: true, required: false, related_entity: "companies" },
  { key: "job_title", label: "Job Title", type: "text", source: "column", tier: "default", visible: false, order: 5, editable: true, required: false },
  { key: "type", label: "Type", type: "select", source: "column", tier: "default", visible: true, order: 6, editable: true, required: false, options: ["buyer", "seller", "landlord", "tenant", "agent", "other"] },
  { key: "linkedin", label: "Linkedin", type: "url", source: "column", tier: "default", visible: false, order: 7, editable: true, required: false },
  { key: "x_link", label: "X", type: "url", source: "column", tier: "default", visible: false, order: 8, editable: true, required: false },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 9, editable: false, required: false },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 10, editable: false, required: false },
  { key: "created_by", label: "Created by", type: "text", source: "column", tier: "default", visible: false, order: 11, editable: false, required: false },
];

/** Companies: default fields shipped with every new client. */
export const COMPANY_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "text", source: "column", tier: "indestructible", visible: true, order: 0, editable: true, required: true },
  { key: "website", label: "Website", type: "url", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
  { key: "address", label: "Address", type: "text", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false },
  { key: "industry", label: "Industry", type: "select", source: "column", tier: "default", visible: true, order: 3, editable: true, required: false, options: ["property_agency", "insurance", "financial_services", "legal", "other"] },
  { key: "linkedin", label: "Linkedin", type: "url", source: "column", tier: "default", visible: false, order: 4, editable: true, required: false },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 5, editable: false, required: false },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 6, editable: false, required: false },
];

/** Deals: default fields shipped with every new client. */
export const DEAL_DEFAULT_FIELDS: FieldDefinition[] = [
  { key: "name", label: "Name", type: "text", source: "column", tier: "indestructible", visible: true, order: 0, editable: true, required: true },
  { key: "amount", label: "Amount", type: "currency", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
  { key: "close_date", label: "Close date", type: "date", source: "column", tier: "default", visible: false, order: 2, editable: true, required: false },
  { key: "stage", label: "Stage", type: "select", source: "column", tier: "default", visible: true, order: 3, editable: true, required: false, options: ["leads", "negotiation", "offer", "closing", "lost"] },
  { key: "company_id", label: "Company", type: "relation", source: "column", tier: "default", visible: true, order: 4, editable: true, required: false, related_entity: "companies" },
  { key: "point_of_contact", label: "Point of Contact", type: "relation", source: "column", tier: "default", visible: false, order: 5, editable: true, required: false, related_entity: "contacts" },
  { key: "address", label: "Address", type: "text", source: "column", tier: "default", visible: true, order: 6, editable: true, required: false },
  { key: "created_at", label: "Created", type: "date", source: "column", tier: "default", visible: false, order: 7, editable: false, required: false },
  { key: "updated_at", label: "Updated", type: "date", source: "column", tier: "default", visible: true, order: 8, editable: false, required: false },
];
```

- [ ] Create the implementation file
- [ ] Run `npx vitest run src/lib/crm/__tests__/field-definitions.test.ts` — PASS

**Step 3: Commit**

```bash
git add src/lib/crm/field-definitions.ts src/lib/crm/__tests__/field-definitions.test.ts
git commit -m "feat(crm-columns): add FieldDefinition type, schema, and default field arrays"
```

- [ ] Commit

**Checkpoint: Batch 1 done.** FieldDefinition type exists with Zod validation and three default field arrays (contacts, companies, deals).

---

## Batch 2 — DB migration (new columns + config_history table)

### Task 2: Add new DB columns to contacts, companies, deals

**Files:**
- Create: `supabase/migrations/20260401000000_add_crm_field_columns.sql`

**Step 1: Write migration SQL**

Create `supabase/migrations/20260401000000_add_crm_field_columns.sql`:

```sql
-- Configurable CRM Columns: add new default-hideable columns per design doc.
-- These columns always exist in DB; visibility is controlled by field config.

-- Contacts: add city, job_title, linkedin, x_link, created_by
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS linkedin text,
  ADD COLUMN IF NOT EXISTS x_link text,
  ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.contacts.city IS 'Contact city (default-hideable field)';
COMMENT ON COLUMN public.contacts.job_title IS 'Contact job title (default-hideable field)';
COMMENT ON COLUMN public.contacts.linkedin IS 'LinkedIn profile URL';
COMMENT ON COLUMN public.contacts.x_link IS 'X/Twitter profile URL';
COMMENT ON COLUMN public.contacts.created_by IS 'Who created this contact (agent or user)';

-- Companies: add linkedin
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS linkedin text;

COMMENT ON COLUMN public.companies.linkedin IS 'Company LinkedIn page URL';

-- Deals: add name, close_date, point_of_contact_id; rename price -> amount
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS close_date date,
  ADD COLUMN IF NOT EXISTS point_of_contact_id uuid REFERENCES public.contacts(contact_id);

COMMENT ON COLUMN public.deals.name IS 'Generic deal name (replaces address as identity)';
COMMENT ON COLUMN public.deals.close_date IS 'Expected close date';
COMMENT ON COLUMN public.deals.point_of_contact_id IS 'Primary contact for this deal';

-- Rename price -> amount on deals (keep old column as alias during migration)
-- Check if price column exists before renaming to avoid errors on re-run
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.deals RENAME COLUMN price TO amount;
  END IF;
END $$;
```

- [ ] Create the migration file
- [ ] Run `npx supabase db push` and confirm columns are added without errors

**Step 2: Write config_history migration**

Create `supabase/migrations/20260401000001_add_crm_config_history.sql`:

```sql
-- CRM config version history: stores snapshots before every config write.
-- Keeps last 20 versions per client for rollback safety.

CREATE TABLE IF NOT EXISTS public.crm_config_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  config_snapshot jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS: clients can only see their own config history
ALTER TABLE public.crm_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own config history"
  ON public.crm_config_history FOR SELECT
  USING (client_id = (SELECT client_id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage config history"
  ON public.crm_config_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_crm_config_history_client_id
  ON public.crm_config_history (client_id, created_at DESC);

COMMENT ON TABLE public.crm_config_history IS 'Stores CRM config snapshots before each write. Last 20 per client.';
```

- [ ] Create the migration file
- [ ] Run `npx supabase db push` and confirm table is created

**Step 3: Regenerate database types**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

- [ ] Run type generation
- [ ] Confirm `city`, `job_title`, `linkedin`, `x_link`, `created_by` appear in contacts type
- [ ] Confirm `linkedin` appears in companies type
- [ ] Confirm `name`, `close_date`, `point_of_contact_id`, `amount` appear in deals type
- [ ] Confirm `crm_config_history` table type exists

**Step 4: Commit**

```bash
git add supabase/migrations/ src/types/database.ts
git commit -m "feat(crm-columns): add new DB columns and config_history table"
```

- [ ] Commit

**Checkpoint: Batch 2 done.** DB has all new columns and the config_history table.

---

## Batch 3 — Update CrmVocabConfig with field arrays

### Task 3: Add field arrays to CRM config

**Files:**
- Modify: `src/lib/crm/config.ts`
- Modify: `src/hooks/use-crm-config.ts`
- Modify: `app/api/crm/config/route.ts`

**Step 1: Write failing tests for fields in config**

Add to the existing config tests (create `src/lib/crm/__tests__/config.test.ts` if not exists):

```typescript
import { describe, expect, it } from "vitest";

import { resolveCrmConfig, type CrmConfigRow } from "../config";
import { CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS } from "../field-definitions";

describe("resolveCrmConfig — field arrays", () => {
  it("returns default field arrays when config row is null", () => {
    const config = resolveCrmConfig(null);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
    expect(config.company_fields).toEqual(COMPANY_DEFAULT_FIELDS);
    expect(config.deal_fields).toEqual(DEAL_DEFAULT_FIELDS);
  });

  it("returns default field arrays when config row has no field arrays", () => {
    const row: CrmConfigRow = { deal_stages: ["a", "b"] };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
    expect(config.company_fields).toEqual(COMPANY_DEFAULT_FIELDS);
    expect(config.deal_fields).toEqual(DEAL_DEFAULT_FIELDS);
  });

  it("uses stored field arrays when present in config row", () => {
    const customContactFields = [
      { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
      { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: true, order: 1, editable: true, required: false },
    ];
    const row: CrmConfigRow = {
      contact_fields: customContactFields,
    };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toHaveLength(2);
    expect(config.contact_fields[1].key).toBe("budget");
  });

  it("falls back to defaults when stored field arrays are malformed", () => {
    const row: CrmConfigRow = {
      contact_fields: "not an array",
    };
    const config = resolveCrmConfig(row);
    expect(config.contact_fields).toEqual(CONTACT_DEFAULT_FIELDS);
  });
});
```

- [ ] Write the test file
- [ ] Run `npx vitest run src/lib/crm/__tests__/config.test.ts` — FAIL (contact_fields not in CrmVocabConfig)

**Step 2: Add field arrays to CrmVocabConfig and resolveCrmConfig**

In `src/lib/crm/config.ts`, add to the `CrmVocabConfig` interface:

```typescript
import { type FieldDefinition, fieldDefinitionSchema, CONTACT_DEFAULT_FIELDS, COMPANY_DEFAULT_FIELDS, DEAL_DEFAULT_FIELDS } from "./field-definitions";

// Add to CrmVocabConfig interface:
export interface CrmVocabConfig {
  // ... existing fields ...
  contact_fields: FieldDefinition[];
  company_fields: FieldDefinition[];
  deal_fields: FieldDefinition[];
}
```

In `resolveCrmConfig()`, add field array resolution:

```typescript
function parseFieldArray(value: unknown, defaults: FieldDefinition[]): FieldDefinition[] {
  if (!Array.isArray(value)) return defaults;
  try {
    return value.map((f) => fieldDefinitionSchema.parse(f));
  } catch {
    return defaults;
  }
}

// Inside resolveCrmConfig, add:
contact_fields: parseFieldArray(row?.contact_fields, CONTACT_DEFAULT_FIELDS),
company_fields: parseFieldArray(row?.company_fields, COMPANY_DEFAULT_FIELDS),
deal_fields: parseFieldArray(row?.deal_fields, DEAL_DEFAULT_FIELDS),
```

Also update `CRM_DEFAULTS` to include field arrays:

```typescript
export const CRM_DEFAULTS: CrmVocabConfig = {
  // ... existing defaults ...
  contact_fields: CONTACT_DEFAULT_FIELDS,
  company_fields: COMPANY_DEFAULT_FIELDS,
  deal_fields: DEAL_DEFAULT_FIELDS,
};
```

- [ ] Update `src/lib/crm/config.ts`
- [ ] Run `npx vitest run src/lib/crm/__tests__/config.test.ts` — PASS

**Step 3: Commit**

```bash
git add src/lib/crm/config.ts src/lib/crm/__tests__/config.test.ts
git commit -m "feat(crm-columns): add field arrays to CrmVocabConfig"
```

- [ ] Commit

**Checkpoint: Batch 3 done.** `CrmVocabConfig` includes `contact_fields`, `company_fields`, `deal_fields` with defaults and runtime parsing.

---

## Batch 4 — Field renderers + buildColumnsFromConfig

### Task 4: Field renderer components

**Files:**
- Create: `src/lib/crm/field-renderers.tsx`
- Create: `src/lib/crm/__tests__/field-renderers.test.tsx`

**Step 1: Write failing tests for field renderers**

Create `src/lib/crm/__tests__/field-renderers.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";

import { getFieldValue, formatFieldDisplay } from "../field-renderers";

describe("getFieldValue", () => {
  it("reads column source from row directly", () => {
    const row = { email: "test@example.com", custom_fields: {} };
    expect(getFieldValue(row, "email", "column")).toBe("test@example.com");
  });

  it("reads custom source from custom_fields", () => {
    const row = { custom_fields: { budget: 500000 } };
    expect(getFieldValue(row, "budget", "custom")).toBe(500000);
  });

  it("returns undefined for missing column value", () => {
    const row = { name: "Test" };
    expect(getFieldValue(row, "phone", "column")).toBeUndefined();
  });

  it("returns undefined for missing custom field", () => {
    const row = { custom_fields: {} };
    expect(getFieldValue(row, "nonexistent", "custom")).toBeUndefined();
  });

  it("handles null custom_fields gracefully", () => {
    const row = { custom_fields: null };
    expect(getFieldValue(row, "budget", "custom")).toBeUndefined();
  });
});

describe("formatFieldDisplay", () => {
  it("formats currency values", () => {
    expect(formatFieldDisplay("currency", 1500000)).toBe("$1,500,000");
  });

  it("formats date values", () => {
    const result = formatFieldDisplay("date", "2026-04-01T00:00:00Z");
    expect(result).toContain("Apr");
    expect(result).toContain("2026");
  });

  it("formats boolean true", () => {
    expect(formatFieldDisplay("boolean", true)).toBe("Yes");
  });

  it("formats boolean false", () => {
    expect(formatFieldDisplay("boolean", false)).toBe("No");
  });

  it("returns text as-is for text type", () => {
    expect(formatFieldDisplay("text", "hello")).toBe("hello");
  });

  it("returns null for null/undefined values", () => {
    expect(formatFieldDisplay("text", null)).toBeNull();
    expect(formatFieldDisplay("text", undefined)).toBeNull();
  });
});
```

- [ ] Create the test file
- [ ] Run `npx vitest run src/lib/crm/__tests__/field-renderers.test.tsx` — FAIL (module not found)

**Step 2: Implement field renderers**

Create `src/lib/crm/field-renderers.tsx`:

```typescript
/**
 * Cell value extractors and display formatters for config-driven CRM columns.
 * Used by buildColumnsFromConfig to render table cells per field type.
 * @module lib/crm/field-renderers
 */
import type { FieldSource, FieldType } from "./field-definitions";

/**
 * Extract the raw value from a row based on field key and source.
 * Column fields read directly from the row; custom fields read from the JSONB custom_fields column.
 */
export function getFieldValue(
  row: Record<string, unknown>,
  key: string,
  source: FieldSource,
): unknown {
  if (source === "custom") {
    const cf = row.custom_fields;
    if (cf && typeof cf === "object" && !Array.isArray(cf)) {
      return (cf as Record<string, unknown>)[key];
    }
    return undefined;
  }
  return row[key];
}

/**
 * Format a field value for display in a table cell.
 * Returns null if value is null/undefined.
 */
export function formatFieldDisplay(type: FieldType, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  switch (type) {
    case "currency": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
    }
    case "number": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      return new Intl.NumberFormat("en-US").format(num);
    }
    case "date": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "text":
    case "full_name":
    case "email":
    case "phone":
    case "url":
    case "select":
    case "richtext":
    case "file":
    case "relation":
    case "tags":
    default:
      return String(value);
  }
}
```

- [ ] Create the implementation file
- [ ] Run `npx vitest run src/lib/crm/__tests__/field-renderers.test.tsx` — PASS

**Step 3: Commit**

```bash
git add src/lib/crm/field-renderers.tsx src/lib/crm/__tests__/field-renderers.test.tsx
git commit -m "feat(crm-columns): add field value extractors and display formatters"
```

- [ ] Commit

### Task 5: buildColumnsFromConfig function

**Files:**
- Create: `src/lib/crm/build-columns.tsx`
- Create: `src/lib/crm/__tests__/build-columns.test.tsx`

**Step 1: Write failing tests for buildColumnsFromConfig**

Create `src/lib/crm/__tests__/build-columns.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "../field-definitions";
import { buildColumnsFromConfig } from "../build-columns";

const minimalFields: FieldDefinition[] = [
  { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
  { key: "email", label: "Email", type: "email", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
  { key: "hidden_field", label: "Hidden", type: "text", source: "column", tier: "default", visible: false, order: 2, editable: true, required: false },
  { key: "budget", label: "Budget", type: "currency", source: "custom", tier: "custom", visible: true, order: 3, editable: true, required: false },
];

describe("buildColumnsFromConfig", () => {
  it("only includes visible fields", () => {
    const columns = buildColumnsFromConfig(minimalFields, "contacts");
    const ids = columns.map((c) => c.id ?? (c as any).accessorKey);
    expect(ids).toContain("name");
    expect(ids).toContain("email");
    expect(ids).toContain("budget");
    expect(ids).not.toContain("hidden_field");
  });

  it("sorts by order value", () => {
    const unorderedFields: FieldDefinition[] = [
      { key: "b", label: "B", type: "text", source: "column", tier: "default", visible: true, order: 2, editable: true, required: false },
      { key: "a", label: "A", type: "text", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false },
      { key: "c", label: "C", type: "text", source: "column", tier: "default", visible: true, order: 1, editable: true, required: false },
    ];
    const columns = buildColumnsFromConfig(unorderedFields, "contacts");
    const ids = columns.map((c) => c.id ?? (c as any).accessorKey);
    expect(ids).toEqual(["a", "c", "b"]);
  });

  it("returns empty array for no visible fields (except indestructible)", () => {
    const allHidden: FieldDefinition[] = [
      { key: "name", label: "Name", type: "full_name", source: "column", tier: "indestructible", visible: true, order: 0, editable: false, required: true },
    ];
    const columns = buildColumnsFromConfig(allHidden, "contacts");
    expect(columns.length).toBe(1);
  });

  it("sets column width when field has width property", () => {
    const fieldsWithWidth: FieldDefinition[] = [
      { key: "name", label: "Name", type: "text", source: "column", tier: "default", visible: true, order: 0, editable: true, required: false, width: 200 },
    ];
    const columns = buildColumnsFromConfig(fieldsWithWidth, "contacts");
    expect(columns[0].size).toBe(200);
  });
});
```

- [ ] Create the test file
- [ ] Run `npx vitest run src/lib/crm/__tests__/build-columns.test.tsx` — FAIL (module not found)

**Step 2: Implement buildColumnsFromConfig**

Create `src/lib/crm/build-columns.tsx`:

```typescript
/**
 * Generates TanStack Table ColumnDefs from a FieldDefinition array.
 * Replaces all three page-specific hardcoded column arrays.
 * @module lib/crm/build-columns
 */
import type { ColumnDef } from "@tanstack/react-table";

import type { FieldDefinition } from "./field-definitions";
import { getFieldValue, formatFieldDisplay } from "./field-renderers";

type EntityType = "contacts" | "companies" | "deals";

/**
 * Build TanStack Table columns from a field definition array.
 * Filters to visible fields, sorts by order, picks cell renderer per type.
 */
export function buildColumnsFromConfig<TData extends Record<string, unknown>>(
  fields: FieldDefinition[],
  _entityType: EntityType,
): ColumnDef<TData, unknown>[] {
  return fields
    .filter((f) => f.visible)
    .sort((a, b) => a.order - b.order)
    .map((field) => ({
      id: field.key,
      accessorFn: (row: TData) => getFieldValue(row as Record<string, unknown>, field.key, field.source),
      header: field.label,
      size: field.width,
      cell: ({ getValue }) => {
        const value = getValue();
        const display = formatFieldDisplay(field.type, value);
        return display ?? "";
      },
    }));
}
```

- [ ] Create the implementation file
- [ ] Run `npx vitest run src/lib/crm/__tests__/build-columns.test.tsx` — PASS

**Step 3: Commit**

```bash
git add src/lib/crm/build-columns.tsx src/lib/crm/__tests__/build-columns.test.tsx
git commit -m "feat(crm-columns): add buildColumnsFromConfig column generator"
```

- [ ] Commit

**Checkpoint: Batch 4 done.** Field renderers and dynamic column builder exist and are tested.

---

## Batch 5 — Expand configure_crm tool with tier enforcement

### Task 6: Tier enforcement in configure_crm

**Files:**
- Modify: `src/lib/runner/tools/crm/configure-crm.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`

**Step 1: Write failing tests for field operations**

Add to `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`:

```typescript
describe("configure_crm — field operations", () => {
  it("adds a custom field to contact_fields", async () => {
    // Setup: seed config with default fields
    // Action: call configure_crm with contact_fields containing a new custom field appended
    // Assert: returned config includes the new field with tier "custom"
  });

  it("hides a default-tier field", async () => {
    // Action: call configure_crm with contact_fields where emails.visible = false
    // Assert: emails field has visible: false in response
  });

  it("rejects hiding an indestructible field", async () => {
    // Action: call configure_crm with contact_fields where name.visible = false
    // Assert: error response mentioning indestructible
  });

  it("rejects deleting a default-tier field", async () => {
    // Action: call configure_crm with contact_fields that omits the emails field
    // Assert: error response mentioning cannot delete default fields
  });

  it("allows deleting a custom field with confirm_removals", async () => {
    // Setup: config has a custom field "budget"
    // Action: call configure_crm with contact_fields that omits budget, confirm_removals: true
    // Assert: success, budget field gone
  });

  it("warns before deleting a custom field with data", async () => {
    // Setup: config has custom field "budget", some contacts have budget data
    // Action: call configure_crm with contact_fields that omits budget (no confirm_removals)
    // Assert: warning response with count of records that have data
  });

  it("saves config snapshot to crm_config_history before write", async () => {
    // Action: call configure_crm with any valid change
    // Assert: crm_config_history has a new row with the previous config
  });

  it("renames a field label", async () => {
    // Action: call configure_crm with contact_fields where emails.label = "Work Email"
    // Assert: emails field label is "Work Email"
  });

  it("reorders fields via order values", async () => {
    // Action: call configure_crm with contact_fields with reordered order values
    // Assert: fields come back in new order
  });
});
```

Note: These are test descriptions. The implementing developer should write the full test bodies following the existing patterns in `configure-crm.test.ts` (mock supabase, create tool, call execute). Each test should follow the Arrange-Act-Assert pattern with the mock supabase chain pattern used in existing tests.

- [ ] Write the full test bodies following existing test patterns
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts` — FAIL (new field operation params not recognized)

**Step 2: Expand configure_crm input schema**

In `src/lib/runner/tools/crm/configure-crm.ts`, add field array params to the input schema:

```typescript
// Add to the existing z.object in the tool's parameters:
contact_fields: z.array(fieldDefinitionSchema).optional()
  .describe("Full contact field definitions array. Include ALL fields (defaults + custom). Omitting a custom field removes it."),
company_fields: z.array(fieldDefinitionSchema).optional()
  .describe("Full company field definitions array."),
deal_fields: z.array(fieldDefinitionSchema).optional()
  .describe("Full deal field definitions array."),
```

**Step 3: Implement tier enforcement logic**

Add validation in the tool's execute function:

```typescript
/**
 * Validate field array changes against tier rules.
 * Returns error message if invalid, null if OK.
 */
function validateFieldChanges(
  incoming: FieldDefinition[],
  defaults: FieldDefinition[],
  entityName: string,
): string | null {
  // 1. Indestructible fields cannot be hidden
  for (const field of incoming) {
    if (field.tier === "indestructible" && !field.visible) {
      return `Cannot hide indestructible field "${field.label}" on ${entityName}`;
    }
  }

  // 2. Default-tier fields cannot be deleted (must all be present)
  const defaultKeys = new Set(defaults.filter((f) => f.tier !== "custom").map((f) => f.key));
  const incomingKeys = new Set(incoming.map((f) => f.key));
  for (const key of defaultKeys) {
    if (!incomingKeys.has(key)) {
      return `Cannot delete default field "${key}" on ${entityName}. You can hide it instead.`;
    }
  }

  // 3. Default fields: key, type, source immutable
  for (const field of incoming) {
    const original = defaults.find((d) => d.key === field.key);
    if (original && original.tier !== "custom") {
      if (field.type !== original.type) return `Cannot change type of default field "${field.key}"`;
      if (field.source !== original.source) return `Cannot change source of default field "${field.key}"`;
    }
  }

  return null;
}
```

Also add config history snapshot before each write:

```typescript
// Before upserting to crm_config, save snapshot:
const { data: currentConfig } = await supabase
  .from("crm_config")
  .select("*")
  .eq("client_id", clientId)
  .maybeSingle();

if (currentConfig) {
  await supabase.from("crm_config_history").insert({
    client_id: clientId,
    config_snapshot: currentConfig,
  });

  // Trim to last 20 versions
  const { data: history } = await supabase
    .from("crm_config_history")
    .select("id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (history && history.length > 20) {
    const idsToDelete = history.slice(20).map((h) => h.id);
    await supabase.from("crm_config_history").delete().in("id", idsToDelete);
  }
}
```

- [ ] Implement the changes
- [ ] Run `npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts` — PASS

**Step 4: Commit**

```bash
git add src/lib/runner/tools/crm/configure-crm.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
git commit -m "feat(crm-columns): expand configure_crm with field arrays and tier enforcement"
```

- [ ] Commit

**Checkpoint: Batch 5 done.** Agent can manage field definitions via configure_crm with safety tier enforcement and config history.

---

## Batch 6 — Replace hardcoded columns in CRM pages

### Task 7: Refactor People page to use buildColumnsFromConfig

**Files:**
- Modify: `app/(dashboard)/customers/people/page.tsx`

**Step 1: Replace hardcoded columns**

In `app/(dashboard)/customers/people/page.tsx`:

1. Import `buildColumnsFromConfig` from `@/lib/crm/build-columns`
2. Replace the manual `useMemo` columns array with:

```typescript
const baseColumns = useMemo(
  () => buildColumnsFromConfig(crmConfig.contact_fields, "contacts"),
  [crmConfig.contact_fields],
);
```

3. Where `crmConfig` comes from the existing `useCrmConfig()` hook (already used in the page).

**Important:** The `buildColumnsFromConfig` produces generic columns. For specialized cell renderers (like `ContactCompanyCell` with company selector, or `QuickEditCell` wrappers), add a post-processing step that enhances specific columns:

```typescript
const columns = useMemo(() => {
  const cols = buildColumnsFromConfig<ContactWithCompany>(
    crmConfig.contact_fields,
    "contacts",
  );
  // Enhance specific columns with custom cell renderers
  return cols.map((col) => {
    const field = crmConfig.contact_fields.find((f) => f.key === col.id);
    if (!field) return col;
    // Override cell renderer for relation, select, etc. based on field.key
    // This preserves existing QuickEditCell, DictionaryValue, and company selector behavior
    return col;
  });
}, [crmConfig.contact_fields]);
```

Note: The implementing developer should preserve all existing inline-edit behavior from `QuickEditCell` components. The `buildColumnsFromConfig` provides the base; per-entity cell overrides maintain the existing Airtable-style editing UX.

- [ ] Refactor the page to use config-driven columns
- [ ] Manually verify People page renders correctly with all visible columns
- [ ] Verify inline editing still works

### Task 8: Refactor Companies page

**Files:**
- Modify: `app/(dashboard)/customers/companies/page.tsx`

Same pattern as Task 7: replace hardcoded columns with `buildColumnsFromConfig(crmConfig.company_fields, "companies")` and preserve inline-edit overrides.

- [ ] Refactor the page
- [ ] Manually verify Companies page renders correctly

### Task 9: Refactor Deals page

**Files:**
- Modify: `app/(dashboard)/customers/deals/page.tsx`

Same pattern. Note: Deals page also has a Kanban board view — column changes only affect the table view. The Kanban card renderer (`DealBoardCard`) is separate and unaffected.

- [ ] Refactor the page
- [ ] Manually verify Deals table and Kanban views both work

**Step 2: Commit**

```bash
git add "app/(dashboard)/customers/people/page.tsx" "app/(dashboard)/customers/companies/page.tsx" "app/(dashboard)/customers/deals/page.tsx"
git commit -m "feat(crm-columns): replace hardcoded columns with config-driven buildColumnsFromConfig"
```

- [ ] Commit

**Checkpoint: Batch 6 done.** All three CRM pages render columns from config instead of hardcoded arrays.

---

## Batch 7 — Column reorder (drag-and-drop)

### Task 10: Add column reorder to DataTable

**Files:**
- Modify: `src/components/ui/data-table.tsx`

**Step 1: Install @dnd-kit/sortable if not present**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] Install dependencies

**Step 2: Add drag-and-drop column reorder**

In `src/components/ui/data-table.tsx`:

1. Add new props to `DataTableProps`:

```typescript
/** Called when columns are reordered via drag-and-drop. Returns new column order (array of column IDs). */
onColumnReorder?: (columnOrder: string[]) => void;
```

2. Wrap `<thead>` headers in a `SortableContext` from `@dnd-kit/sortable`
3. Each column header becomes a `SortableItem` with drag handle
4. On `DragEnd`, compute new column order and call `onColumnReorder`
5. Use TanStack Table's `columnOrder` state to control render order

Note: Only enable drag-and-drop when `onColumnReorder` is provided. This keeps DataTable backwards-compatible for non-CRM usages.

- [ ] Implement column reorder in DataTable
- [ ] Manually verify drag-and-drop works in People page

**Step 3: Wire up reorder persistence in CRM pages**

In each CRM page, add an `onColumnReorder` handler that:
1. Maps the new column order to updated `order` values in the field definitions
2. Calls `PATCH /api/crm/config` to persist the updated config

- [ ] Implement reorder persistence
- [ ] Verify reorder persists on page refresh

**Step 4: Commit**

```bash
git add src/components/ui/data-table.tsx "app/(dashboard)/customers/people/page.tsx" "app/(dashboard)/customers/companies/page.tsx" "app/(dashboard)/customers/deals/page.tsx" package.json package-lock.json
git commit -m "feat(crm-columns): add drag-and-drop column reorder with persistence"
```

- [ ] Commit

**Checkpoint: Batch 7 done.** Columns can be reordered via drag-and-drop and the order persists.

---

## Batch 8 — Column width persistence

### Task 11: Add column resize persistence

**Files:**
- Modify: `src/components/ui/data-table.tsx`

**Step 1: Add resize props to DataTable**

```typescript
/** Called when a column is resized. Returns column ID and new width in px. */
onColumnResize?: (columnId: string, width: number) => void;
```

**Step 2: Enable TanStack Table column sizing**

1. Enable `columnResizing` in TanStack Table options
2. Add resize handles to column headers (small draggable right border)
3. On resize end, debounce (300ms) and call `onColumnResize`

**Step 3: Wire up resize persistence in CRM pages**

Each page's `onColumnResize` handler:
1. Updates the field's `width` property in config
2. Debounced `PATCH /api/crm/config` to persist

- [ ] Implement column resize
- [ ] Verify resize handle works and width persists on refresh

**Step 4: Commit**

```bash
git add src/components/ui/data-table.tsx "app/(dashboard)/customers/people/page.tsx" "app/(dashboard)/customers/companies/page.tsx" "app/(dashboard)/customers/deals/page.tsx"
git commit -m "feat(crm-columns): add column resize with debounced width persistence"
```

- [ ] Commit

**Checkpoint: Batch 8 done.** Column widths can be resized and persist.

---

## Batch 9 — Config API: PATCH route for field config updates

### Task 12: Add PATCH endpoint for CRM config

**Files:**
- Modify: `app/api/crm/config/route.ts`

**Step 1: Write failing test for PATCH route**

Create `app/api/crm/config/__tests__/route.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

describe("PATCH /api/crm/config", () => {
  it("updates field arrays in crm_config", async () => {
    // Mock: authenticated request with contact_fields in body
    // Assert: upserts to crm_config, returns updated config
  });

  it("saves snapshot to crm_config_history before writing", async () => {
    // Assert: crm_config_history.insert called with previous config
  });

  it("rejects unauthenticated requests", async () => {
    // Assert: 401
  });
});
```

- [ ] Write full test bodies
- [ ] Run tests — FAIL (PATCH handler not defined)

**Step 2: Implement PATCH handler**

In `app/api/crm/config/route.ts`, add:

```typescript
export async function PATCH(request: Request) {
  // 1. Authenticate
  // 2. Parse body — expect partial config with field arrays
  // 3. Snapshot current config to crm_config_history
  // 4. Upsert new config to crm_config
  // 5. Return updated resolved config
}
```

- [ ] Implement PATCH handler
- [ ] Run tests — PASS

**Step 3: Commit**

```bash
git add app/api/crm/config/route.ts app/api/crm/config/__tests__/route.test.ts
git commit -m "feat(crm-columns): add PATCH /api/crm/config for field config updates"
```

- [ ] Commit

**Checkpoint: Batch 9 done.** Frontend can persist field config changes via PATCH API.

---

## Batch 10 — Config migration for existing users

### Task 13: Migration script for existing crm_config rows

**Files:**
- Create: `supabase/migrations/20260401000002_migrate_crm_config_fields.sql`

**Step 1: Write migration that builds field arrays from existing config**

```sql
-- For existing crm_config rows that don't have *_fields arrays yet,
-- build them from defaults + any existing custom fields.
-- This is a one-time migration.

-- NOTE: This is a data migration. The implementing developer should:
-- 1. Read existing *_custom_fields arrays from crm_config
-- 2. Build contact_fields = CONTACT_DEFAULT_FIELDS + custom fields (appended, tier: custom)
-- 3. Same for company_fields and deal_fields
-- 4. Write the fields arrays back to crm_config
-- 5. Leave old *_custom_fields intact (harmless, cleaned up later)

-- This can be done as a PL/pgSQL function or as an application-level migration script.
-- Prefer application-level (Node script) for easier testing and rollback.
```

The implementing developer should decide between SQL-level or app-level migration based on complexity. For testability, an app-level script in `scripts/migrate-crm-fields.ts` may be preferable.

- [ ] Write the migration script
- [ ] Test against local DB with existing crm_config data
- [ ] Verify fields arrays are correctly built from existing config

**Step 2: Commit**

```bash
git add supabase/migrations/ scripts/
git commit -m "feat(crm-columns): add config migration for existing users"
```

- [ ] Commit

**Checkpoint: Batch 10 done.** Existing users get field arrays built from their current config.

---

## Batch 11 — Integration verification

### Task 14: End-to-end verification

**Step 1: Verify all CRM pages render from config**

- [ ] Open People page — columns render from config, not hardcoded
- [ ] Open Companies page — same
- [ ] Open Deals page — same (table and kanban)

**Step 2: Verify agent field operations**

- [ ] Ask agent "add a Budget field to deals" — column appears in Deals table
- [ ] Ask agent "hide the Phone column from contacts" — column disappears
- [ ] Ask agent "rename Email to Work Email" — header text updates
- [ ] Try to hide the Name column — agent refuses (indestructible)

**Step 3: Verify column interactions**

- [ ] Drag a column header to reorder — persists on refresh
- [ ] Resize a column — persists on refresh
- [ ] Existing inline editing still works
- [ ] Row click still opens detail panel

**Step 4: Verify safety**

- [ ] Config history saves before each change
- [ ] New user signup gets default fields

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(crm-columns): configurable CRM columns — complete implementation"
```

- [ ] Commit

---

## Notes

### Out-of-scope (per design doc)
- Notes and Files/Attachments associations — follow-up work
- New entity types beyond contacts/companies/deals
- Conditional field logic ("show if X = Y")
- Computed/formula fields
- Saved views / perspectives
- Field-level permissions

### Known migration risk
The `price` → `amount` rename on deals will break any code that references `deal.price`. The implementing developer should grep for `price` across CRM code and update all references before the migration commit.

### react-resizable-panels v4 gotcha
Numeric size values in react-resizable-panels v4 are **pixels**, not percentages. Always use strings like `"35%"` for percentage-based sizing. (See commit `b5c20ad` for the fix.)
