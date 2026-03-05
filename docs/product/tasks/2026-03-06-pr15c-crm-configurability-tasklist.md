# CRM Configurability — Dynamic Vocabulary + Custom Fields

**PR:** PR 15c: CRM configurability — dynamic vocabulary + custom fields
**Decisions:** (none listed — informed by Attio/HubSpot MCP comparison, depends on PRs 5, 6, 15)
**Goal:** Make CRM vocabulary (deal stages, contact types, interaction types, deal-contact roles) and entity labels configurable per client, and add custom fields (JSONB) to contacts, deals, and tasks.

**Architecture:** Two-layer configurability. Layer 1: vocabulary swaps via `crm_config` — deal stages, contact types, etc. are stored as JSONB arrays and loaded once per runner invocation, replacing hardcoded `as const` enums. Layer 2: custom fields via JSONB columns on entity tables — field definitions (key, label, type, options) live in `crm_config`, values live in `custom_fields JSONB` on each row. Real-estate defaults serve as zero-config fallback. A `configure_crm` tool lets the agent update config via chat. The CRM UI reads config from an API route and adapts columns, badges, and kanban boards at runtime.

**Tech Stack:** Supabase (Postgres JSONB), Zod 3 runtime schema builders, Vercel AI SDK `tool()`, TanStack Query, TanStack Table, ShadCN UI, Tailwind CSS

---

## Relevant Files

### Create
- `supabase/migrations/20260306100000_crm_configurability.sql` — migration
- `src/lib/crm/config.ts` — CRM config types, defaults, loader, dynamic schema helpers
- `src/lib/crm/__tests__/config.test.ts` — tests for config module
- `src/lib/runner/tools/crm/configure-crm.ts` — configure_crm tool
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts` — tests
- `app/api/crm/config/route.ts` — GET endpoint for UI
- `src/hooks/use-crm-config.ts` — TanStack Query hook

### Modify
- `src/types/database.ts` — regenerate after migration
- `src/lib/crm/schemas.ts` — extend crmConfigSchema, add custom field types
- `src/lib/runner/tools/crm/contacts.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/deals.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/interactions.ts` — accept config, dynamic schemas
- `src/lib/runner/tools/crm/tasks.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/deal-contacts.ts` — accept config, dynamic schemas
- `src/lib/runner/tools/crm/index.ts` — pass config to all factories
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/deals.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/interactions.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/index.test.ts` — update for config param
- `src/lib/runner/run-agent.ts` — load config before tool creation
- `src/lib/ai/platform-instructions.ts` — template vocabulary
- `src/lib/crm/display.ts` — make badge/tone maps dynamic with fallback
- `src/components/crm/stage-badge.tsx` — accept dynamic stages
- `src/components/crm/interaction-timeline.tsx` — accept dynamic types
- `src/components/crm/record-drawer/deal-drawer-content.tsx` — dynamic stage select, custom fields
- `src/components/crm/record-drawer/contact-drawer-content.tsx` — dynamic type select, custom fields
- `src/components/crm/record-drawer/task-drawer-content.tsx` — custom fields
- `app/(dashboard)/crm/contacts/page.tsx` — dynamic type filter
- `app/(dashboard)/crm/deals/page.tsx` — dynamic kanban columns
- `src/hooks/use-contacts.ts` — accept dynamic ContactType

### Test
- `src/lib/crm/__tests__/config.test.ts`
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/index.test.ts`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260306100000_crm_configurability.sql`
- Modify: `src/types/database.ts` (regenerate)

**Context:** The `crm_config` table already exists with `deal_stages`, `task_types`, `interaction_types` JSONB columns. We need to add vocabulary columns for contact types and deal-contact roles, a deal label text column, and custom field definition columns. We also need `custom_fields JSONB` on the three entity tables.

**Step 1: Write the migration SQL**

```sql
-- PR 15c: CRM configurability — dynamic vocabulary + custom fields

-- Layer 1: Extend crm_config with additional vocabulary columns
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS contact_types JSONB,
  ADD COLUMN IF NOT EXISTS deal_contact_roles JSONB,
  ADD COLUMN IF NOT EXISTS deal_label TEXT NOT NULL DEFAULT 'Deal';

-- Layer 2: Custom field definitions in crm_config
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS deal_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS task_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Layer 2: Custom field values on entity tables
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
```

**Step 2: Apply the migration locally**

```bash
npx supabase db reset
```

Expected: Migration applies without errors. All new columns visible in Supabase Studio.

**Step 3: Regenerate database types**

```bash
npx supabase gen types --lang=typescript --local > src/types/database.ts
```

Expected: `database.ts` now includes `custom_fields`, `contact_types`, `deal_contact_roles`, `deal_label`, `deal_custom_fields`, `contact_custom_fields`, `task_custom_fields` on the relevant tables.

**Step 4: Verify existing tests still pass**

```bash
npm run test:run
```

Expected: All existing tests PASS. The migration only adds nullable/default columns, so no existing code breaks.

**Step 5: Commit**

```bash
git add supabase/migrations/20260306100000_crm_configurability.sql src/types/database.ts
git commit -m "feat(pr15c): migration — add custom_fields columns and extend crm_config"
```

---

## Task 2: CRM Config Types, Defaults, and Schema

**Files:**
- Create: `src/lib/crm/config.ts`
- Create: `src/lib/crm/__tests__/config.test.ts`
- Modify: `src/lib/crm/schemas.ts`

**Context:** We need TypeScript types for the config vocabulary, real-estate default values, a Zod schema for validating config from the database, and a Zod schema for custom field definitions. The existing `crmConfigSchema` in `schemas.ts` uses a generic `jsonValueSchema` — we need to replace it with properly typed fields.

### Step 1: Write the failing test for default config

```typescript
// src/lib/crm/__tests__/config.test.ts
import { describe, expect, it } from "vitest";

import {
  CRM_DEFAULTS,
  type CrmVocabConfig,
  type CustomFieldDefinition,
} from "../config";

describe("CRM_DEFAULTS", () => {
  it("provides real-estate vocabulary as default", () => {
    expect(CRM_DEFAULTS.deal_stages).toEqual([
      "leads",
      "negotiation",
      "offer",
      "closing",
      "lost",
    ]);
    expect(CRM_DEFAULTS.contact_types).toEqual([
      "buyer",
      "seller",
      "landlord",
      "tenant",
      "agent",
      "other",
    ]);
    expect(CRM_DEFAULTS.interaction_types).toEqual([
      "call",
      "meeting",
      "email",
      "message",
      "viewing",
      "note",
    ]);
    expect(CRM_DEFAULTS.deal_contact_roles).toEqual([
      "buyer",
      "seller",
      "agent",
      "other",
    ]);
  });

  it("defaults deal_label to 'Deal'", () => {
    expect(CRM_DEFAULTS.deal_label).toBe("Deal");
  });

  it("defaults custom field definitions to empty arrays", () => {
    expect(CRM_DEFAULTS.deal_custom_fields).toEqual([]);
    expect(CRM_DEFAULTS.contact_custom_fields).toEqual([]);
    expect(CRM_DEFAULTS.task_custom_fields).toEqual([]);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `Cannot find module '../config'`

### Step 3: Write minimal implementation — types and defaults

```typescript
// src/lib/crm/config.ts
/**
 * CRM configuration types, defaults, and loader.
 * @module lib/crm/config
 */

/** Definition of a single custom field for contacts, deals, or tasks. */
export interface CustomFieldDefinition {
  /** Machine-readable key used in the custom_fields JSONB object. */
  key: string;
  /** Human-readable display label. */
  label: string;
  /** Field data type. */
  type: "text" | "number" | "currency" | "date" | "select";
  /** Available options for select-type fields. */
  options?: string[];
  /** Whether this field is required when creating/updating an entity. */
  required?: boolean;
}

/** Resolved CRM vocabulary and custom field configuration for a client. */
export interface CrmVocabConfig {
  deal_label: string;
  deal_stages: string[];
  contact_types: string[];
  interaction_types: string[];
  deal_contact_roles: string[];
  deal_custom_fields: CustomFieldDefinition[];
  contact_custom_fields: CustomFieldDefinition[];
  task_custom_fields: CustomFieldDefinition[];
}

/** Real-estate defaults — used when crm_config row is missing or fields are null. */
export const CRM_DEFAULTS: CrmVocabConfig = {
  deal_label: "Deal",
  deal_stages: ["leads", "negotiation", "offer", "closing", "lost"],
  contact_types: ["buyer", "seller", "landlord", "tenant", "agent", "other"],
  interaction_types: ["call", "meeting", "email", "message", "viewing", "note"],
  deal_contact_roles: ["buyer", "seller", "agent", "other"],
  deal_custom_fields: [],
  contact_custom_fields: [],
  task_custom_fields: [],
};
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 5: Write the failing test for customFieldDefinitionSchema

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
import { customFieldDefinitionSchema } from "../config";

describe("customFieldDefinitionSchema", () => {
  it("validates a text field definition", () => {
    const field = { key: "policy_number", label: "Policy Number", type: "text" };
    expect(customFieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("validates a select field with options", () => {
    const field = {
      key: "priority",
      label: "Priority",
      type: "select",
      options: ["low", "medium", "high"],
      required: true,
    };
    expect(customFieldDefinitionSchema.parse(field)).toEqual(field);
  });

  it("rejects a field with invalid type", () => {
    const field = { key: "test", label: "Test", type: "boolean" };
    expect(() => customFieldDefinitionSchema.parse(field)).toThrow();
  });

  it("rejects a field without a key", () => {
    const field = { label: "Test", type: "text" };
    expect(() => customFieldDefinitionSchema.parse(field)).toThrow();
  });
});
```

### Step 6: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `customFieldDefinitionSchema is not exported`

### Step 7: Implement customFieldDefinitionSchema

Add to `src/lib/crm/config.ts`:

```typescript
import { z } from "zod";

const customFieldTypeValues = ["text", "number", "currency", "date", "select"] as const;

/** Zod schema for validating a custom field definition from crm_config. */
export const customFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(customFieldTypeValues),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 9: Write the failing test for resolveCrmConfig

This function merges a raw DB row with defaults — null fields fall back to defaults.

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
import { resolveCrmConfig, type CrmConfigRow } from "../config";

describe("resolveCrmConfig", () => {
  it("returns defaults when row is null", () => {
    const config = resolveCrmConfig(null);
    expect(config).toEqual(CRM_DEFAULTS);
  });

  it("returns defaults when all fields are null", () => {
    const row: CrmConfigRow = {
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      deal_label: "Deal",
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.deal_stages).toEqual(CRM_DEFAULTS.deal_stages);
    expect(config.contact_types).toEqual(CRM_DEFAULTS.contact_types);
  });

  it("uses custom values when provided", () => {
    const row: CrmConfigRow = {
      deal_stages: ["lead", "quoted", "underwriting", "bound", "lost"],
      contact_types: ["prospect", "client", "partner"],
      interaction_types: null,
      deal_contact_roles: null,
      deal_label: "Policy",
      deal_custom_fields: [
        { key: "policy_number", label: "Policy Number", type: "text" },
      ],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.deal_label).toBe("Policy");
    expect(config.deal_stages).toEqual(["lead", "quoted", "underwriting", "bound", "lost"]);
    expect(config.contact_types).toEqual(["prospect", "client", "partner"]);
    expect(config.interaction_types).toEqual(CRM_DEFAULTS.interaction_types);
    expect(config.deal_custom_fields).toHaveLength(1);
    expect(config.deal_custom_fields[0].key).toBe("policy_number");
  });

  it("filters out invalid custom field definitions", () => {
    const row: CrmConfigRow = {
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      deal_label: "Deal",
      deal_custom_fields: [
        { key: "valid", label: "Valid", type: "text" },
        { key: "", label: "Invalid", type: "text" },
      ] as CustomFieldDefinition[],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.deal_custom_fields).toHaveLength(1);
    expect(config.deal_custom_fields[0].key).toBe("valid");
  });
});
```

### Step 10: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `resolveCrmConfig is not exported`

### Step 11: Implement resolveCrmConfig

Add to `src/lib/crm/config.ts`:

```typescript
/** Raw crm_config row shape from the database (nullable vocabulary fields). */
export interface CrmConfigRow {
  deal_label: string;
  deal_stages: unknown;
  contact_types: unknown;
  interaction_types: unknown;
  deal_contact_roles: unknown;
  deal_custom_fields: unknown;
  contact_custom_fields: unknown;
  task_custom_fields: unknown;
}

/**
 * Safely parses a JSONB value as a non-empty string array.
 * Returns null if the value is not a valid non-empty string array.
 */
function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const strings = value.filter((v): v is string => typeof v === "string" && v.length > 0);
  return strings.length > 0 ? strings : null;
}

/**
 * Safely parses a JSONB value as an array of CustomFieldDefinition.
 * Invalid entries are silently filtered out.
 */
function parseCustomFields(value: unknown): CustomFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => customFieldDefinitionSchema.safeParse(item).success) as CustomFieldDefinition[];
}

/**
 * Merges a raw crm_config row with CRM_DEFAULTS.
 * Null vocabulary fields fall back to real-estate defaults.
 */
export function resolveCrmConfig(row: CrmConfigRow | null): CrmVocabConfig {
  if (!row) return { ...CRM_DEFAULTS };

  return {
    deal_label: row.deal_label || CRM_DEFAULTS.deal_label,
    deal_stages: parseStringArray(row.deal_stages) ?? CRM_DEFAULTS.deal_stages,
    contact_types: parseStringArray(row.contact_types) ?? CRM_DEFAULTS.contact_types,
    interaction_types: parseStringArray(row.interaction_types) ?? CRM_DEFAULTS.interaction_types,
    deal_contact_roles: parseStringArray(row.deal_contact_roles) ?? CRM_DEFAULTS.deal_contact_roles,
    deal_custom_fields: parseCustomFields(row.deal_custom_fields),
    contact_custom_fields: parseCustomFields(row.contact_custom_fields),
    task_custom_fields: parseCustomFields(row.task_custom_fields),
  };
}
```

### Step 12: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 13: Update crmConfigSchema in schemas.ts

Update `src/lib/crm/schemas.ts` to use properly typed fields for the new columns. Replace the existing `crmConfigSchema` and `crmConfigInsertSchema` with versions that include the new columns, while keeping backward compatibility.

```typescript
// In src/lib/crm/schemas.ts — replace crmConfigSchema block (lines 210-230)
/** Full `crm_config` row validator with typed vocabulary fields. */
export const crmConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  deal_label: z.string(),
  deal_stages: jsonValueSchema.nullable(),
  contact_types: jsonValueSchema.nullable(),
  interaction_types: jsonValueSchema.nullable(),
  deal_contact_roles: jsonValueSchema.nullable(),
  task_types: jsonValueSchema.nullable(),
  deal_custom_fields: jsonValueSchema,
  contact_custom_fields: jsonValueSchema,
  task_custom_fields: jsonValueSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

/** Insert payload validator for `crm_config` (id/timestamps omitted). */
export const crmConfigInsertSchema = z.object({
  client_id: z.string().uuid(),
  deal_label: z.string().optional(),
  deal_stages: jsonValueSchema.nullable().optional(),
  contact_types: jsonValueSchema.nullable().optional(),
  interaction_types: jsonValueSchema.nullable().optional(),
  deal_contact_roles: jsonValueSchema.nullable().optional(),
  task_types: jsonValueSchema.nullable().optional(),
  deal_custom_fields: jsonValueSchema.optional(),
  contact_custom_fields: jsonValueSchema.optional(),
  task_custom_fields: jsonValueSchema.optional(),
});
```

Also add `custom_fields` to the entity schemas. In `contactSchema` add:
```typescript
custom_fields: z.record(z.string(), jsonValueSchema).default({}),
```
Same for `dealSchema` and `crmTaskSchema`. And optional in insert schemas:
```typescript
custom_fields: z.record(z.string(), jsonValueSchema).optional(),
```

### Step 14: Run all tests

```bash
npm run test:run
```

Expected: PASS — existing schema tests may need minor fixture updates for the new `custom_fields` field.

### Step 15: Commit

```bash
git add src/lib/crm/config.ts src/lib/crm/__tests__/config.test.ts src/lib/crm/schemas.ts
git commit -m "feat(pr15c): CRM config types, defaults, and resolveCrmConfig"
```

---

## Task 3: loadCrmConfig() — Database Loader

**Files:**
- Modify: `src/lib/crm/config.ts`
- Modify: `src/lib/crm/__tests__/config.test.ts`

**Context:** `loadCrmConfig()` fetches the `crm_config` row for a client from Supabase and passes it through `resolveCrmConfig()`. Called once at runner start in `run-agent.ts`. This is the function that connects the database to the dynamic config.

### Step 1: Write the failing test for loadCrmConfig

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

import type { Database } from "@/types/database";
import { loadCrmConfig } from "../config";

describe("loadCrmConfig", () => {
  const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

  function createMockClient(result: { data: unknown; error: unknown }) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;
  }

  it("returns defaults when no crm_config row exists", async () => {
    const client = createMockClient({ data: null, error: null });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config).toEqual(CRM_DEFAULTS);
  });

  it("returns merged config when row exists with partial data", async () => {
    const row = {
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      task_types: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const client = createMockClient({ data: row, error: null });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config.deal_label).toBe("Policy");
    expect(config.deal_stages).toEqual(["lead", "quoted", "bound"]);
    expect(config.contact_types).toEqual(CRM_DEFAULTS.contact_types);
  });

  it("returns defaults when query errors", async () => {
    const client = createMockClient({ data: null, error: { message: "timeout" } });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config).toEqual(CRM_DEFAULTS);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `loadCrmConfig is not exported`

### Step 3: Implement loadCrmConfig

Add to `src/lib/crm/config.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Loads the CRM vocabulary config for a client.
 * Returns real-estate defaults if no config row exists or on query error.
 * Called once per runner invocation in run-agent.ts.
 */
export async function loadCrmConfig(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<CrmVocabConfig> {
  const { data, error } = await supabase
    .from("crm_config")
    .select(
      "deal_label, deal_stages, contact_types, interaction_types, deal_contact_roles, deal_custom_fields, contact_custom_fields, task_custom_fields",
    )
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) {
    return { ...CRM_DEFAULTS };
  }

  return resolveCrmConfig(data as CrmConfigRow);
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/crm/config.ts src/lib/crm/__tests__/config.test.ts
git commit -m "feat(pr15c): loadCrmConfig — database loader with defaults fallback"
```

---

## Task 4: Dynamic Schema Builders

**Files:**
- Modify: `src/lib/crm/config.ts`
- Modify: `src/lib/crm/__tests__/config.test.ts`

**Context:** Currently tools use static `z.enum(contactTypeValues)`. We need helper functions that create Zod schemas from config arrays at runtime. These are pure functions — no database access, no side effects.

### Step 1: Write the failing test for buildStringEnum

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
import { buildStringEnum, buildCustomFieldsSchema } from "../config";

describe("buildStringEnum", () => {
  it("creates a Zod enum from string array", () => {
    const schema = buildStringEnum(["a", "b", "c"]);
    expect(schema.parse("a")).toBe("a");
    expect(schema.parse("b")).toBe("b");
    expect(() => schema.parse("d")).toThrow();
  });

  it("works with single-element array", () => {
    const schema = buildStringEnum(["only"]);
    expect(schema.parse("only")).toBe("only");
    expect(() => schema.parse("other")).toThrow();
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `buildStringEnum is not exported`

### Step 3: Implement buildStringEnum

Add to `src/lib/crm/config.ts`:

```typescript
/**
 * Creates a Zod enum schema from a runtime string array.
 * Used by tool factories to build dynamic vocabulary constraints.
 */
export function buildStringEnum(values: string[]): z.ZodEnum<[string, ...string[]]> {
  return z.enum(values as [string, ...string[]]);
}
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 5: Write the failing test for buildCustomFieldsSchema

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
describe("buildCustomFieldsSchema", () => {
  it("returns undefined schema when no custom fields defined", () => {
    const schema = buildCustomFieldsSchema([]);
    expect(schema).toBeUndefined();
  });

  it("validates custom field values against definitions", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "policy_number", label: "Policy Number", type: "text" },
      { key: "coverage", label: "Coverage Amount", type: "number" },
    ];
    const schema = buildCustomFieldsSchema(definitions)!;
    expect(schema).toBeDefined();

    // Valid input
    const result = schema.parse({ policy_number: "POL-001", coverage: 50000 });
    expect(result.policy_number).toBe("POL-001");
    expect(result.coverage).toBe(50000);

    // Extra keys are stripped (not in definitions)
    const withExtra = schema.parse({ policy_number: "POL-001", unknown: "val" });
    expect(withExtra).not.toHaveProperty("unknown");
  });

  it("enforces required fields", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "policy_number", label: "Policy Number", type: "text", required: true },
    ];
    const schema = buildCustomFieldsSchema(definitions)!;

    // Missing required field — should fail
    expect(() => schema.parse({})).toThrow();

    // Provided — should pass
    expect(schema.parse({ policy_number: "POL-001" })).toEqual({ policy_number: "POL-001" });
  });

  it("validates select-type fields against options", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"] },
    ];
    const schema = buildCustomFieldsSchema(definitions)!;

    expect(schema.parse({ priority: "low" })).toEqual({ priority: "low" });
    expect(() => schema.parse({ priority: "urgent" })).toThrow();
  });
});
```

### Step 6: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `buildCustomFieldsSchema is not exported`

### Step 7: Implement buildCustomFieldsSchema

Add to `src/lib/crm/config.ts`:

```typescript
/** Primitive value types stored in custom_fields JSONB. */
type CustomFieldValue = string | number | null;

/**
 * Builds a Zod object schema for custom field validation.
 * Returns undefined if no custom fields are defined (tool schemas should omit the field).
 */
export function buildCustomFieldsSchema(
  definitions: CustomFieldDefinition[],
): z.ZodObject<Record<string, z.ZodTypeAny>> | undefined {
  if (definitions.length === 0) return undefined;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of definitions) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case "select":
        fieldSchema = field.options?.length
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
        break;
      case "number":
      case "currency":
        fieldSchema = z.number();
        break;
      case "date":
        fieldSchema = z.string();
        break;
      default:
        fieldSchema = z.string();
    }

    shape[field.key] = field.required ? fieldSchema : fieldSchema.optional();
  }

  return z.object(shape).strict();
}
```

### Step 8: Run test to verify it passes

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: PASS

### Step 9: Commit

```bash
git add src/lib/crm/config.ts src/lib/crm/__tests__/config.test.ts
git commit -m "feat(pr15c): dynamic schema builders — buildStringEnum and buildCustomFieldsSchema"
```

---

## Task 5: Refactor Tool Factories to Accept Config

**Files:**
- Modify: `src/lib/runner/tools/crm/contacts.ts`
- Modify: `src/lib/runner/tools/crm/deals.ts`
- Modify: `src/lib/runner/tools/crm/interactions.ts`
- Modify: `src/lib/runner/tools/crm/tasks.ts`
- Modify: `src/lib/runner/tools/crm/deal-contacts.ts`
- Modify: `src/lib/runner/tools/crm/index.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/contacts.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts`

**Context:** Each tool factory currently imports static enum values from `schemas.ts` and uses them in `z.enum()` and `.describe()` strings. We need to:
1. Add `config: CrmVocabConfig` parameter to each factory
2. Replace `z.enum(contactTypeValues)` with `buildStringEnum(config.contact_types)`
3. Replace hardcoded `.describe()` strings with templates using config values
4. Add optional `custom_fields` parameter to create/update tools
5. Return `custom_fields` in search results
6. Update all existing tests to pass the config parameter

**Important:** This is the largest task. Work through one factory at a time: contacts → deals → interactions → tasks → deal-contacts → index barrel.

### Step 1: Update existing contact tool tests to pass config

Every existing test needs to pass `CRM_DEFAULTS` as the third argument. This is a mechanical change — update `createContactTools(client, CLIENT_ID)` to `createContactTools(client, CLIENT_ID, CRM_DEFAULTS)` throughout the test file.

```typescript
// At the top of src/lib/runner/tools/crm/__tests__/contacts.test.ts, add import:
import { CRM_DEFAULTS } from "@/lib/crm/config";

// Then find-and-replace all:
//   createContactTools(client, CLIENT_ID)
// with:
//   createContactTools(client, CLIENT_ID, CRM_DEFAULTS)
```

### Step 2: Run tests to verify they fail

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts
```

Expected: FAIL — `createContactTools` does not accept a third argument (TypeScript error) or ignores it

### Step 3: Update createContactTools signature and use dynamic schemas

In `src/lib/runner/tools/crm/contacts.ts`:

1. Add import:
```typescript
import { type CrmVocabConfig, buildStringEnum, buildCustomFieldsSchema } from "@/lib/crm/config";
```

2. Change signature:
```typescript
export function createContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig,
) {
```

3. At the top of the function body, build dynamic schemas:
```typescript
  const contactTypeEnum = buildStringEnum(config.contact_types);
  const customFieldsSchema = buildCustomFieldsSchema(config.contact_custom_fields);
```

4. Replace all `z.enum(contactTypeValues)` with `contactTypeEnum`

5. Replace hardcoded `.describe()` strings with templates:
```typescript
// Before:
.describe("Contact type filter (buyer, seller, landlord, tenant, agent, other).")
// After:
.describe(`Contact type filter (${config.contact_types.join(", ")}).`)
```

6. Add `custom_fields` to `create_contact` and `update_contact` inputSchema:
```typescript
custom_fields: customFieldsSchema
  ? customFieldsSchema.optional().describe("Custom field values. Check platform instructions for available fields.")
  : z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional().describe("Custom field values."),
```

7. Pass `custom_fields` through to insert/update:
```typescript
// In create_contact execute, in the insert object:
custom_fields: custom_fields ?? {},
// In update_contact execute, add custom_fields to the updates object when provided
```

8. Remove the `import { contactTypeValues } from "@/lib/crm/schemas";` line (no longer needed).

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts
```

Expected: PASS — all existing tests pass because `CRM_DEFAULTS` matches the old static values

### Step 5: Write a test for custom config vocabulary

```typescript
// Append to contacts.test.ts
describe("create_contact with custom config", () => {
  it("accepts custom contact types from config", async () => {
    const customConfig = {
      ...CRM_DEFAULTS,
      contact_types: ["prospect", "client", "partner"],
    };
    const created = { contact_id: "abc", first_name: "Jane", last_name: "Doe", type: "prospect", custom_fields: {} };
    const { client } = createMockSupabase({
      contacts: [
        { data: [], error: null },
        { data: created, error: null },
      ],
    });
    const tools = createContactTools(client, CLIENT_ID, customConfig);

    const result = await tools.create_contact.execute(
      { first_name: "Jane", last_name: "Doe", type: "prospect" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
  });
});
```

### Step 6: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/contacts.test.ts
```

Expected: PASS

### Step 7: Repeat for deals.ts

Same pattern:
1. Update test file — add `CRM_DEFAULTS` import, pass as third arg
2. Update `createDealTools(supabase, clientId, config: CrmVocabConfig)`
3. Replace `z.enum(dealStageValues)` with `buildStringEnum(config.deal_stages)`
4. Template `.describe()` strings with config values
5. Add `custom_fields` to create_deal, update_deal, batch_create_deals
6. Use `config.deal_label` in tool descriptions: `` `Create a new ${config.deal_label.toLowerCase()}.` ``
7. Run tests

### Step 8: Repeat for interactions.ts

Same pattern:
1. Update test file
2. Update `createInteractionTools(supabase, clientId, config: CrmVocabConfig)`
3. Replace `z.enum(interactionTypeValues)` with `buildStringEnum(config.interaction_types)`
4. Template `.describe()` strings
5. Run tests

### Step 9: Repeat for tasks.ts

Same pattern:
1. Update test file
2. Update `createTaskTools(supabase, clientId, config: CrmVocabConfig)`
3. Add `custom_fields` to create_task, update_task
4. Run tests

### Step 10: Repeat for deal-contacts.ts

Same pattern:
1. Update test file
2. Update `createDealContactTools(supabase, clientId, config: CrmVocabConfig)`
3. Replace `z.enum(dealContactRoleValues)` with `buildStringEnum(config.deal_contact_roles)`
4. Template `.describe()` strings
5. Run tests

### Step 11: Update the index barrel to pass config through

In `src/lib/runner/tools/crm/index.ts`:

```typescript
import type { CrmVocabConfig } from "@/lib/crm/config";

interface CreateCrmToolsOptions {
  allowWriteTools?: boolean;
}

export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig,
  options?: CreateCrmToolsOptions,
) {
  const { allowWriteTools = true } = options ?? {};

  const contactTools = createContactTools(supabase, clientId, config);
  const dealTools = createDealTools(supabase, clientId, config);
  const dealContactTools = createDealContactTools(supabase, clientId, config);
  const interactionTools = createInteractionTools(supabase, clientId, config);
  const taskTools = createTaskTools(supabase, clientId, config);

  // ... rest unchanged
}
```

### Step 12: Update index.test.ts

Pass `CRM_DEFAULTS` as the third argument to all `createCrmTools()` calls.

### Step 13: Run all CRM tool tests

```bash
npx vitest run src/lib/runner/tools/crm/
```

Expected: ALL PASS

### Step 14: Commit

```bash
git add src/lib/runner/tools/crm/
git commit -m "feat(pr15c): refactor tool factories — accept CrmVocabConfig, dynamic schemas, custom fields"
```

---

## Task 6: configure_crm Tool

**Files:**
- Create: `src/lib/runner/tools/crm/configure-crm.ts`
- Create: `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- Modify: `src/lib/runner/tools/crm/index.ts` — register the new tool

**Context:** The agent needs a tool to update `crm_config` via chat. This is an upsert — if no row exists for the client, insert one; otherwise update. Accepts partial updates (e.g., change only deal_stages without affecting contact_types). Validates against the config schema.

### Step 1: Write the failing test

```typescript
// src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
import { describe, expect, it } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

import { createConfigureCrmTool } from "../configure-crm";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("configure_crm", () => {
  it("upserts deal_stages to crm_config", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Deal",
      deal_stages: ["lead", "quoted", "bound"],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const { client, builders } = createMockSupabase({
      crm_config: { data: updatedRow, error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      { deal_stages: ["lead", "quoted", "bound"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
    expect(builders.crm_config.upsert).toHaveBeenCalled();
  });

  it("rejects empty deal_stages array", async () => {
    const { client } = createMockSupabase();
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      { deal_stages: [] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: false });
  });

  it("accepts partial updates (only deal_label)", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const { client } = createMockSupabase({
      crm_config: { data: updatedRow, error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      { deal_label: "Policy" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
  });

  it("validates custom field definitions", async () => {
    const { client } = createMockSupabase({
      crm_config: { data: {}, error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      {
        deal_custom_fields: [
          { key: "policy_number", label: "Policy Number", type: "text" },
        ],
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

Expected: FAIL — `Cannot find module '../configure-crm'`

### Step 3: Implement configure_crm tool

```typescript
// src/lib/runner/tools/crm/configure-crm.ts
/**
 * CRM configuration tool — allows the agent to update CRM vocabulary via chat.
 * @module lib/runner/tools/crm/configure-crm
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { customFieldDefinitionSchema } from "@/lib/crm/config";
import type { Database } from "@/types/database";

const nonEmptyStringArray = z.array(z.string().min(1)).min(1);

/**
 * Creates the configure_crm tool.
 * Upserts crm_config for the given client with partial updates.
 */
export function createConfigureCrmTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const configure_crm = tool({
    description:
      "Update CRM vocabulary and custom field definitions. Accepts partial updates — " +
      "only provided fields are changed. Use this when the user wants to customize their CRM " +
      "(e.g., different deal stages, contact types, or custom fields). " +
      "Data Modification Warning: Only configure CRM when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_label: z.string().min(1).optional()
        .describe("Display label for deals (e.g., 'Policy', 'Project', 'Deal')."),
      deal_stages: nonEmptyStringArray.optional()
        .describe("Ordered list of deal pipeline stages (e.g., ['lead', 'quoted', 'bound', 'lost'])."),
      contact_types: nonEmptyStringArray.optional()
        .describe("Available contact type classifications (e.g., ['prospect', 'client', 'partner'])."),
      interaction_types: nonEmptyStringArray.optional()
        .describe("Available interaction types (e.g., ['call', 'meeting', 'email', 'note'])."),
      deal_contact_roles: nonEmptyStringArray.optional()
        .describe("Roles a contact can have on a deal (e.g., ['buyer', 'seller', 'agent'])."),
      deal_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for deals."),
      contact_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for contacts."),
      task_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for tasks."),
    }),
    execute: async (input) => {
      const updates = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update." };
      }

      const { data, error } = await supabase
        .from("crm_config")
        .upsert(
          { client_id: clientId, ...updates },
          { onConflict: "client_id" },
        )
        .select()
        .single();

      if (error) {
        return { success: false as const, error: error.message };
      }

      return {
        success: true as const,
        config: data,
        message: "CRM configuration updated. Changes take effect on the next message.",
      };
    },
  });

  return { configure_crm };
}
```

**Note:** Add `upsert` to the mock-supabase `CHAIN_METHOD_NAMES` array in `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`:

```typescript
const CHAIN_METHOD_NAMES = [
  "select",
  "insert",
  "update",
  "upsert",  // ← add this
  "delete",
  // ...
];
```

### Step 4: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

Expected: PASS

### Step 5: Register configure_crm in the index barrel

In `src/lib/runner/tools/crm/index.ts`, import and add:

```typescript
import { createConfigureCrmTool } from "./configure-crm";

// Inside createCrmTools(), after the other factory calls:
const configTools = createConfigureCrmTool(supabase, clientId);

// Add to the write tools return:
return {
  ...readTools,
  // ... existing write tools ...
  configure_crm: configTools.configure_crm,
};
```

### Step 6: Update index.test.ts to expect the new tool

Add `"configure_crm"` to the expected tool list when writes are enabled.

### Step 7: Run all CRM tool tests

```bash
npx vitest run src/lib/runner/tools/crm/
```

Expected: ALL PASS

### Step 8: Commit

```bash
git add src/lib/runner/tools/crm/configure-crm.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts src/lib/runner/tools/crm/index.ts src/lib/runner/tools/crm/__tests__/index.test.ts src/lib/runner/tools/crm/__tests__/mock-supabase.ts
git commit -m "feat(pr15c): configure_crm tool — agent updates CRM vocabulary via chat"
```

---

## Task 7: Wire Config into Runner + Platform Instructions

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/ai/platform-instructions.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts` (if mock needs updating)

**Context:** The runner needs to `loadCrmConfig()` once at the start of each run and pass it to `createCrmTools()`. Platform instructions need a new `<crm-vocabulary>` section that templates the current config so the LLM knows valid values without making tool calls.

### Step 1: Update run-agent.ts to load config

In `src/lib/runner/run-agent.ts`:

1. Add import:
```typescript
import { loadCrmConfig } from "@/lib/crm/config";
```

2. After `assembleContext()` (line ~78), add:
```typescript
const crmConfig = await loadCrmConfig(supabase, clientId);
```

3. Update `createCrmTools` call:
```typescript
const crmTools = createCrmTools(supabase, clientId, crmConfig, {
  allowWriteTools: true,
});
```

### Step 2: Create buildCrmVocabularyBlock function

In `src/lib/ai/platform-instructions.ts`, add a function that generates the vocabulary block:

```typescript
import type { CrmVocabConfig } from "@/lib/crm/config";

/**
 * Builds the CRM vocabulary block for platform instructions.
 * Injected so the LLM knows valid enum values without tool calls.
 */
export function buildCrmVocabularyBlock(config: CrmVocabConfig): string {
  const lines = [
    "<crm-vocabulary>",
    `Entity label: ${config.deal_label}`,
    `Deal stages: ${config.deal_stages.join(", ")}`,
    `Contact types: ${config.contact_types.join(", ")}`,
    `Interaction types: ${config.interaction_types.join(", ")}`,
    `Deal-contact roles: ${config.deal_contact_roles.join(", ")}`,
  ];

  const allCustomFields = [
    ...config.deal_custom_fields.map((f) => `${config.deal_label} → ${f.label} (${f.type}${f.required ? ", required" : ""})`),
    ...config.contact_custom_fields.map((f) => `Contact → ${f.label} (${f.type}${f.required ? ", required" : ""})`),
    ...config.task_custom_fields.map((f) => `Task → ${f.label} (${f.type}${f.required ? ", required" : ""})`),
  ];

  if (allCustomFields.length > 0) {
    lines.push("Custom fields:");
    for (const field of allCustomFields) {
      lines.push(`  - ${field}`);
    }
  }

  lines.push("</crm-vocabulary>");
  return lines.join("\n");
}
```

### Step 3: Update PLATFORM_INSTRUCTIONS to accept config

Change `PLATFORM_INSTRUCTIONS` from a static string to a function:

```typescript
/**
 * Builds platform instructions with dynamic CRM vocabulary.
 * Falls back to a static version (no vocab block) when config is not provided.
 */
export function buildPlatformInstructions(config?: CrmVocabConfig): string {
  const vocabBlock = config ? "\n\n" + buildCrmVocabularyBlock(config) : "";
  return `<platform-instructions>
<tasks>
...existing content unchanged...
</tasks>
...existing sections unchanged...
</platform-instructions>${vocabBlock}`;
}

/** @deprecated Use buildPlatformInstructions(config) instead. */
export const PLATFORM_INSTRUCTIONS = buildPlatformInstructions();
```

### Step 4: Update assembleContext to accept and use config

In the context assembly function (wherever `PLATFORM_INSTRUCTIONS` is used), pass the config through so the vocabulary block is included in the system prompt.

Check `src/lib/runner/context.ts` — update it to accept `crmConfig?: CrmVocabConfig` and call `buildPlatformInstructions(crmConfig)`.

### Step 5: Update run-agent.ts to pass config to context assembly

```typescript
const { system, messages } = await assembleContext({
  supabase,
  threadId,
  currentMessage: "",
  clientId,
  crmConfig,  // ← pass config here
});
```

### Step 6: Run all tests

```bash
npm run test:run
```

Expected: PASS — may need to update mocks in run-agent.test.ts for the new loadCrmConfig call.

### Step 7: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/ai/platform-instructions.ts src/lib/runner/context.ts
git commit -m "feat(pr15c): wire CRM config into runner + platform instructions vocabulary"
```

---

## Task 8: CRM Config API Route + useCrmConfig Hook

**Files:**
- Create: `app/api/crm/config/route.ts`
- Create: `src/hooks/use-crm-config.ts`

**Context:** The CRM pages need to read the client's config to display dynamic labels, stages, and custom field columns. An API route fetches the config (or returns defaults), and a TanStack Query hook caches it on the frontend.

### Step 1: Create the API route

```typescript
// app/api/crm/config/route.ts
/**
 * GET /api/crm/config — returns resolved CRM config for the authenticated client.
 * @module app/api/crm/config/route
 */
import { NextResponse } from "next/server";

import { loadCrmConfig } from "@/lib/crm/config";
import { createRouteClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createRouteClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("client_id")
    .eq("user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const config = await loadCrmConfig(supabase, client.client_id);
  return NextResponse.json(config);
}
```

### Step 2: Create the useCrmConfig hook

```typescript
// src/hooks/use-crm-config.ts
/**
 * TanStack Query hook for CRM vocabulary configuration.
 * @module hooks/use-crm-config
 */
"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { CRM_DEFAULTS, type CrmVocabConfig } from "@/lib/crm/config";

export const crmConfigKeys = {
  all: ["crm-config"] as const,
};

async function fetchCrmConfig(): Promise<CrmVocabConfig> {
  const response = await fetch("/api/crm/config");
  if (!response.ok) return CRM_DEFAULTS;
  return response.json();
}

export function crmConfigQueryOptions() {
  return queryOptions({
    queryKey: crmConfigKeys.all,
    queryFn: fetchCrmConfig,
    staleTime: 5 * 60 * 1000, // 5 minutes — config changes rarely
  });
}

/**
 * Returns the client's CRM vocabulary config, falling back to real-estate defaults.
 */
export function useCrmConfig(): CrmVocabConfig {
  const { data } = useQuery(crmConfigQueryOptions());
  return data ?? CRM_DEFAULTS;
}
```

### Step 3: Verify the build compiles

```bash
npx next build
```

Expected: No TypeScript errors.

### Step 4: Commit

```bash
git add app/api/crm/config/route.ts src/hooks/use-crm-config.ts
git commit -m "feat(pr15c): CRM config API route + useCrmConfig hook"
```

---

## Task 9: Dynamic CRM Pages

**Files:**
- Modify: `src/lib/crm/display.ts`
- Modify: `src/components/crm/stage-badge.tsx`
- Modify: `src/components/crm/interaction-timeline.tsx`
- Modify: `app/(dashboard)/crm/contacts/page.tsx`
- Modify: `app/(dashboard)/crm/deals/page.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/task-drawer-content.tsx`

**Context:** The CRM pages currently use static enum arrays and hardcoded label/badge/tone maps. We need to make them read from config and handle unknown values gracefully. The approach is:
1. Make badge/tone lookup functions accept any string with sensible fallbacks
2. Components accept config-derived value arrays
3. Pages call `useCrmConfig()` and pass dynamic data down

### Step 1: Update display.ts — dynamic badge/tone helpers

Replace the static `Record<>` maps with lookup functions that handle unknown values:

```typescript
// src/lib/crm/display.ts — add these new dynamic helpers

/** Ordered color palette for dynamically assigned badge variants. */
const BADGE_VARIANT_CYCLE: BadgeVariant[] = [
  "secondary", "info", "warning", "success", "destructive", "outline",
];

/** Returns a badge variant for a string value, using static maps when available. */
export function getDealStageBadgeVariant(stage: string): BadgeVariant {
  return (dealStageBadgeVariantMap as Record<string, BadgeVariant>)[stage]
    ?? BADGE_VARIANT_CYCLE[Math.abs(hashString(stage)) % BADGE_VARIANT_CYCLE.length];
}

/** Returns a badge variant for a contact type, using static maps when available. */
export function getContactTypeBadgeVariant(type: string): BadgeVariant {
  return (contactTypeBadgeVariantMap as Record<string, BadgeVariant>)[type]
    ?? BADGE_VARIANT_CYCLE[Math.abs(hashString(type)) % BADGE_VARIANT_CYCLE.length];
}

/** Ordered tone class palette for dynamically assigned kanban columns. */
const TONE_CLASS_CYCLE = [
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
];

const TOP_BORDER_CYCLE = [
  "border-t-amber-400",
  "border-t-orange-400",
  "border-t-violet-400",
  "border-t-emerald-400",
  "border-t-rose-400",
  "border-t-sky-400",
];

/** Returns a tone class for a stage/status string. */
export function getDealStageToneClass(stage: string): string {
  return (dealStageToneClassMap as Record<string, string>)[stage]
    ?? TONE_CLASS_CYCLE[Math.abs(hashString(stage)) % TONE_CLASS_CYCLE.length];
}

/** Returns a top-border class for a stage/status string. */
export function getDealStageTopBorder(stage: string): string {
  return (dealStageTopBorderMap as Record<string, string>)[stage]
    ?? TOP_BORDER_CYCLE[Math.abs(hashString(stage)) % TOP_BORDER_CYCLE.length];
}

/** Simple string hash for deterministic color assignment. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/** Title-cases a string (first letter uppercase, rest lowercase). */
export function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
```

### Step 2: Update StageBadge to accept any stage string

```typescript
// src/components/crm/stage-badge.tsx
import { Badge } from "@/components/ui/badge";
import { getDealStageBadgeVariant, toTitleCase } from "@/lib/crm/display";

interface StageBadgeProps {
  stage: string;
}

export function StageBadge({ stage }: StageBadgeProps) {
  return <Badge variant={getDealStageBadgeVariant(stage)}>{toTitleCase(stage)}</Badge>;
}
```

### Step 3: Update contacts page — dynamic type filter

```typescript
// app/(dashboard)/crm/contacts/page.tsx
// Replace:
import { contactTypeValues } from "@/lib/crm/schemas";

// With:
import { useCrmConfig } from "@/hooks/use-crm-config";

// Inside ContactsPage:
const config = useCrmConfig();

// Replace the Select dropdown items:
{config.contact_types.map((contactType) => (
  <SelectItem key={contactType} value={contactType}>
    {toTitleCase(contactType)}
  </SelectItem>
))}
```

### Step 4: Update deals page — dynamic kanban columns

```typescript
// app/(dashboard)/crm/deals/page.tsx
import { useCrmConfig } from "@/hooks/use-crm-config";
import {
  getDealStageTopBorder,
  getDealStageToneClass,
  toTitleCase,
} from "@/lib/crm/display";

// Inside DealsPage:
const config = useCrmConfig();

// Replace the static dealStageColumns with:
const dealStageColumns = config.deal_stages.map((stage) => ({
  key: stage,
  label: toTitleCase(stage),
  toneClassName: getDealStageToneClass(stage),
  topBorderClassName: getDealStageTopBorder(stage),
}));
```

### Step 5: Update deal drawer — dynamic stage select + custom fields

In `src/components/crm/record-drawer/deal-drawer-content.tsx`:

```typescript
import { useCrmConfig } from "@/hooks/use-crm-config";
import { toTitleCase } from "@/lib/crm/display";

// Inside DealDrawerContent:
const config = useCrmConfig();

// Replace the stage InlineEditField options:
options={config.deal_stages.map((stage) => ({ value: stage, label: toTitleCase(stage) }))}

// After existing fields, render custom fields:
{config.deal_custom_fields.map((field) => (
  <InlineEditField
    key={field.key}
    label={field.label}
    value={deal.custom_fields?.[field.key] ?? ""}
    type={field.type === "select" ? "select" : field.type === "date" ? "date" : "text"}
    options={field.options?.map((opt) => ({ value: opt, label: toTitleCase(opt) }))}
    onSave={async (nextValue) => {
      await updateDeal.mutateAsync({
        custom_fields: { ...deal.custom_fields, [field.key]: nextValue || null },
      });
    }}
  />
))}
```

### Step 6: Update contact drawer — dynamic type select + custom fields

Same pattern as deal drawer but using `config.contact_types` and `config.contact_custom_fields`.

### Step 7: Update task drawer — custom fields

Same pattern using `config.task_custom_fields`.

### Step 8: Update interaction timeline — dynamic type labels

```typescript
// In interaction-timeline.tsx, replace static maps with dynamic lookup:
const label = toTitleCase(interaction.type);
```

The icon map can remain static for known types with a fallback icon for unknown types.

### Step 9: Run the full test suite

```bash
npm run test:run
```

Expected: PASS — some component tests may need updates if they render CRM components.

### Step 10: Manual verification

Start the dev server and verify:
1. Default real-estate vocabulary works (no crm_config row needed)
2. All CRM pages load correctly
3. Deal kanban shows correct stages
4. Contact type filter shows correct types
5. Drawers show correct inline edit options

```bash
npm run dev
```

### Step 11: Commit

```bash
git add src/lib/crm/display.ts src/components/crm/ app/(dashboard)/crm/ src/hooks/use-crm-config.ts
git commit -m "feat(pr15c): dynamic CRM pages — config-driven labels, badges, kanban columns, custom fields"
```

---

## Final Integration Test Checklist

Before marking PR 15c complete, verify these end-to-end scenarios:

- [ ] **Zero-config:** New user with no `crm_config` row → all tools use real-estate defaults, all pages render correctly
- [ ] **Vocabulary swap:** Tell agent "I sell insurance, my stages are lead/quoted/underwriting/bound/lost" → agent calls `configure_crm` → all tools and UI reflect new vocabulary on next message
- [ ] **Custom fields:** Tell agent "I need to track policy number and coverage amount on deals" → agent adds custom fields → `create_deal` accepts them → deal drawer shows new fields
- [ ] **Partial update:** `configure_crm` with only `deal_stages` → contact_types and interaction_types remain unchanged
- [ ] **Search results include custom_fields:** `search_contacts`, `search_deals`, `search_tasks` return `custom_fields` in response
- [ ] **Platform instructions reflect config:** System prompt includes `<crm-vocabulary>` block with current vocabulary
- [ ] **All existing tests pass:** `npm run test:run` — no regressions

---

## Notes

- **crmTaskStatusValues (open/completed) are NOT configurable.** Task status is binary and not industry-specific. The plan does not mention making it configurable.
- **Badge styling for custom stages uses deterministic color cycling.** Unknown stages get colors from a cycling palette based on string hash. This means the same stage name always gets the same color, even if it's not in the default real-estate vocabulary.
- **Custom field validation is best-effort.** The Zod schema validates types at tool call time. Values already stored in the database are not retroactively validated if field definitions change.
- **Config is loaded once per runner invocation**, not per tool call. This means config changes take effect on the next message (acceptable for vocabulary that changes infrequently).
- **The `task_types` column on crm_config is preserved but unused.** It was created in PR 5 and is not part of PR 15c's vocabulary. Kept for potential future use.
