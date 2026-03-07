# CRM Configurability — Dynamic Vocabulary + Custom Fields

**PR:** PR 15c: CRM configurability — dynamic vocabulary + custom fields
**Decisions:** TOOL-01, TOOL-02, TOOL-03, TOOL-08, RUNNER-03, RUNNER-09, DATA-01, DATA-09, SAFETY-04
**Goal:** Make CRM vocabulary (deal stages, contact types, interaction types, deal-contact roles) and entity labels configurable per client, and add custom fields (JSONB) to contacts, deals, and tasks.

**Architecture:** Two-layer configurability following `TOOL-08` (runtime schema modification) and `RUNNER-09` (platform instructions injection). Layer 1: vocabulary swaps via `crm_config` — deal stages, contact types, etc. are stored as JSONB arrays and loaded once per runner invocation, replacing hardcoded `as const` enums (`TOOL-01` strict Zod contracts, dynamically modified). Layer 2: custom fields via JSONB columns on entity tables — field definitions (key, label, type, options) live in `crm_config`, values live in `custom_fields JSONB` on each row (`DATA-01`, `DATA-09`). CRM vocabulary is injected into platform instructions at position #0 (`RUNNER-03`) so the LLM knows valid values without tool calls. Real-estate defaults serve as zero-config fallback. The `configure_crm` tool is isolated to setup mode only (`SAFETY-04` — external-facing config requires approval context).

**Setup mode:** CRM configuration is a setup-time concern, not a runtime concern. The `configure_crm` tool is **never loaded into the daily agent's toolset**. Instead, configuration happens in a dedicated setup mode:
- **Auto-triggered** on first run when no `crm_config` row exists — agent asks about the user's business and proposes vocabulary.
- **User-triggered** via "reconfigure my CRM" or similar — agent enters setup mode, proposes changes with before/after, user confirms, then returns to normal mode.
- **Two toolsets:** Setup mode loads only `configure_crm` (+ guardrails). Normal mode loads all CRM tools without `configure_crm`. The daily agent literally cannot reconfigure because the tool isn't in its context.

This is a deliberate design decision informed by industry research (Attio, Folk) — no major CRM lets AI touch schema configuration. We allow it via chat but isolate it from daily operations.

**Tech Stack:** Supabase (Postgres JSONB), Zod 4 runtime schema builders, Vercel AI SDK v6 `tool()`, TanStack Query, TanStack Table, ShadCN UI, Tailwind 4

**Reference:** `roadmap docs/Sunder - Source of Truth/references/twenty-crm/crm-configurability-reference.md` — Twenty CRM pattern analysis with task-by-task mapping and drift analysis

> **Review amendments (2026-03-06):** This tasklist was reviewed against the codebase and the following changes were agreed:
> 1. **Migration must DROP static CHECK constraints** on `contacts.type`, `deals.stage`, `interactions.type`, `deal_contacts.role` — otherwise custom vocabulary is rejected by Postgres. Validation moves to app layer (tools + UI).
> 2. **Normalize legacy object-array config data to `string[]`** in the migration. Existing `crm_config` rows store `[{id, name, color}, ...]` — these must be migrated to `["leads", "negotiation", ...]` so `parseStringArray()` works correctly.
> 3. **Custom field schema fixes:** `.strict()` → strip (match test intent), separate create vs update schemas (`mode` param), enforce unique keys in definitions, validate dates with `z.string().date()`.
> 4. **Runner wiring fix:** Load config BEFORE `assembleContext()`, not after. Sequence: `loadCrmConfig → assembleContext(crmConfig) → createCrmTools(crmConfig)`.
> 5. **UI scope adjustment:** Include update hooks (`use-update-contact.ts`, `use-update-deal.ts`, `use-update-crm-task.ts`) to accept `custom_fields`. Defer table column rendering for custom fields to a separate PR.
> 6. **Freshness model:** Keep `staleTime: 30s` (lowered from 5min). No realtime subscription on `crm_config` — config changes are rare. Manual invalidation can be added later if needed.
> 7. **Pattern fixes:** Use `createClient` from `server.ts` (not nonexistent `createRouteClient`). Reuse `createMockSupabase` helper in tests. Higher test bar: add loader normalization tests (legacy object shapes), route auth/fallback tests, platform-instruction output assertions.
>
> **Review amendments (2026-03-07):** Second review round — architectural changes and code quality fixes:
> 8. **configure_crm isolated to setup mode.** The tool is NOT loaded in the daily agent's toolset. Setup mode is triggered on first run (no crm_config row) or on-demand ("reconfigure my CRM"). Two separate toolsets — setup mode gets only configure_crm, normal mode gets all CRM tools without it. Industry research (Attio, Folk) confirms no major CRM lets AI touch schema config in normal operation.
> 9. **configure_crm guardrails.** Add in-use value check before allowing removal of vocabulary values (e.g., "12 deals use 'negotiation' — remove anyway?"). Echo full resulting config after changes. Add semantic validation: `.max(30)` on arrays, `z.string().min(2)` on individual values, deduplicate arrays.
> 10. **seed.sql must use string arrays.** After `db reset`, migrations run before seed — the normalization UPDATE finds no rows (fresh DB), then seed inserts old object-array format. Seed must be updated to match the new string-array format.
> 11. **Inline `buildStringEnum`.** One-liner wrapper adds indirection without value. Use `z.enum(values as [string, ...string[]])` directly at call sites.
> 12. **`buildCustomFieldsSchema` must always return a schema.** Returning `undefined` forces ternary repetition at every call site. When definitions are empty, return `z.record(z.string(), z.union([z.string(), z.number(), z.null()]))` instead.
> 13. **Fix `toTitleCase` for underscored values.** `"follow_up"` → `"Follow_up"` is wrong. Replace underscores with spaces before title-casing.
> 14. **Add `console.warn` for corrupted config data.** `resolveCrmConfig` silently falls back to defaults — add warnings when `parseStringArray` or `parseCustomFields` filters out entries.
> 15. **`parseCustomFields` must use parsed values.** Current code runs `safeParse` for validation but uses the original item. Use `safeParse().data` to get the parsed result.
> 16. **Task 7 (context.ts) must be explicit.** Spell out exact changes to `AssembleContextParams`, `buildSystemPrompt`, and the `PLATFORM_INSTRUCTIONS` → `buildPlatformInstructions()` migration in `context.ts`.
> 17. **Task 9 needs tests.** Add tests for `getDealStageBadgeVariant` with unknown stages, `toTitleCase` with underscores, `hashString` determinism. Add API route tests (401, 404, 200 with defaults, 200 with custom config).
> 18. **Fix drawer custom field race condition.** `{ ...deal.custom_fields, [field.key]: nextValue }` spreads from stale query cache. Use optimistic updates via `onMutate` or local state merge.
> 19. **New tasks added:** Task 6a (setup mode detection), Task 6b (setup system prompt), Task 10 (seed.sql fix).

---

## Relevant Files

### Create
- `supabase/migrations/20260306100000_crm_configurability.sql` — migration
- `src/lib/crm/config.ts` — CRM config types, defaults, loader, dynamic schema helpers
- `src/lib/crm/__tests__/config.test.ts` — tests for config module
- `src/lib/crm/__tests__/display.test.ts` — tests for dynamic display helpers
- `src/lib/runner/tools/crm/configure-crm.ts` — configure_crm tool (setup mode only)
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts` — tests
- `app/api/crm/config/route.ts` — GET endpoint for UI
- `app/api/crm/config/__tests__/route.test.ts` — API route tests (auth, fallback, happy path)
- `src/hooks/use-crm-config.ts` — TanStack Query hook

### Modify
- `src/types/database.ts` — regenerate after migration
- `src/lib/crm/schemas.ts` — extend crmConfigSchema, add custom field types
- `src/lib/runner/tools/crm/contacts.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/deals.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/interactions.ts` — accept config, dynamic schemas
- `src/lib/runner/tools/crm/tasks.ts` — accept config, dynamic schemas, custom fields
- `src/lib/runner/tools/crm/deal-contacts.ts` — accept config, dynamic schemas
- `src/lib/runner/tools/crm/index.ts` — pass config to all factories, setup/normal mode switch
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/deals.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/interactions.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts` — update for config param
- `src/lib/runner/tools/crm/__tests__/index.test.ts` — update for config param + setup mode
- `src/lib/runner/run-agent.ts` — load config, detect setup mode, select toolset
- `src/lib/runner/context.ts` — accept crmConfig, use buildPlatformInstructions()
- `src/lib/ai/platform-instructions.ts` — convert to buildPlatformInstructions(config) function
- `src/lib/ai/system-prompt.ts` — setup mode prompt variant
- `src/lib/crm/display.ts` — make badge/tone maps dynamic with fallback, fix toTitleCase
- `src/components/crm/stage-badge.tsx` — accept dynamic stages
- `src/components/crm/interaction-timeline.tsx` — accept dynamic types
- `src/components/crm/record-drawer/deal-drawer-content.tsx` — dynamic stage select, custom fields
- `src/components/crm/record-drawer/contact-drawer-content.tsx` — dynamic type select, custom fields
- `src/components/crm/record-drawer/task-drawer-content.tsx` — custom fields
- `app/(dashboard)/crm/contacts/page.tsx` — dynamic type filter
- `app/(dashboard)/crm/deals/page.tsx` — dynamic kanban columns
- `src/hooks/use-contacts.ts` — accept dynamic ContactType
- `supabase/seed.sql` — update crm_config insert to use string arrays
- `src/hooks/use-update-contact.ts` — accept custom_fields in mutation payload
- `src/hooks/use-update-deal.ts` — accept custom_fields in mutation payload
- `src/hooks/use-update-crm-task.ts` — accept custom_fields in mutation payload

### Test
- `src/lib/crm/__tests__/config.test.ts`
- `src/lib/crm/__tests__/display.test.ts`
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- `src/lib/runner/tools/crm/__tests__/contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/deals.test.ts`
- `src/lib/runner/tools/crm/__tests__/interactions.test.ts`
- `src/lib/runner/tools/crm/__tests__/tasks.test.ts`
- `src/lib/runner/tools/crm/__tests__/deal-contacts.test.ts`
- `src/lib/runner/tools/crm/__tests__/index.test.ts`
- `app/api/crm/config/__tests__/route.test.ts`
- `src/lib/ai/__tests__/platform-instructions.test.ts`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260306100000_crm_configurability.sql`
- Modify: `src/types/database.ts` (regenerate)

**Context:** The `crm_config` table already exists with `deal_stages`, `task_types`, `interaction_types` JSONB columns. We need to: (1) drop static CHECK constraints on configurable fields so dynamic vocabulary works, (2) normalize legacy object-array config data to `string[]`, (3) add vocabulary columns for contact types and deal-contact roles, a deal label text column, and custom field definition columns, (4) add `custom_fields JSONB` on the three entity tables.

**Step 1: Write the migration SQL**

```sql
-- PR 15c: CRM configurability — dynamic vocabulary + custom fields

-- Step A: Drop static CHECK constraints so configurable fields accept dynamic values.
-- Validation moves to app layer (tool schemas + UI).
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_type_check;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_type_check;
ALTER TABLE public.deal_contacts DROP CONSTRAINT IF EXISTS deal_contacts_role_check;

-- Step B: Normalize legacy object-array config data to string[].
-- Existing rows store [{id, name, color}, ...] — extract id values to plain strings.
UPDATE public.crm_config
SET deal_stages = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(deal_stages) AS elem
)
WHERE deal_stages IS NOT NULL
  AND jsonb_typeof(deal_stages) = 'array'
  AND jsonb_array_length(deal_stages) > 0
  AND jsonb_typeof(deal_stages->0) = 'object';

UPDATE public.crm_config
SET interaction_types = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(interaction_types) AS elem
)
WHERE interaction_types IS NOT NULL
  AND jsonb_typeof(interaction_types) = 'array'
  AND jsonb_array_length(interaction_types) > 0
  AND jsonb_typeof(interaction_types->0) = 'object';

UPDATE public.crm_config
SET task_types = (
  SELECT jsonb_agg(elem->>'id')
  FROM jsonb_array_elements(task_types) AS elem
)
WHERE task_types IS NOT NULL
  AND jsonb_typeof(task_types) = 'array'
  AND jsonb_array_length(task_types) > 0
  AND jsonb_typeof(task_types->0) = 'object';

-- Step C: Extend crm_config with additional vocabulary columns
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS contact_types JSONB,
  ADD COLUMN IF NOT EXISTS deal_contact_roles JSONB,
  ADD COLUMN IF NOT EXISTS deal_label TEXT NOT NULL DEFAULT 'Deal';

-- Step D: Custom field definitions in crm_config
ALTER TABLE public.crm_config
  ADD COLUMN IF NOT EXISTS deal_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS task_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Step E: Custom field values on entity tables
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

  it("extracts ids from legacy object-array shapes", () => {
    const row: CrmConfigRow = {
      deal_stages: [
        { id: "leads", name: "Leads", color: "#94a3b8" },
        { id: "closing", name: "Closing", color: "#34d399" },
      ],
      contact_types: null,
      interaction_types: [
        { id: "call", name: "Call" },
        { id: "email", name: "Email" },
      ],
      deal_contact_roles: null,
      deal_label: "Deal",
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.deal_stages).toEqual(["leads", "closing"]);
    expect(config.interaction_types).toEqual(["call", "email"]);
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

  it("deduplicates custom field definitions by key (last wins)", () => {
    const row: CrmConfigRow = {
      deal_stages: null,
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      deal_label: "Deal",
      deal_custom_fields: [
        { key: "amount", label: "Old Label", type: "text" },
        { key: "amount", label: "New Label", type: "number" },
      ],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const config = resolveCrmConfig(row);
    expect(config.deal_custom_fields).toHaveLength(1);
    expect(config.deal_custom_fields[0].label).toBe("New Label");
    expect(config.deal_custom_fields[0].type).toBe("number");
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
 * Handles both string[] and legacy object-array [{id, name, ...}] shapes.
 * Returns null if the value is not a valid non-empty array.
 * Logs a warning when entries are filtered out (corrupted data).
 */
function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const inputLength = value.length;
  const strings = value
    .map((v) => {
      if (typeof v === "string" && v.length > 0) return v;
      if (v && typeof v === "object" && "id" in v && typeof (v as Record<string, unknown>).id === "string")
        return (v as Record<string, unknown>).id as string;
      return null;
    })
    .filter((v): v is string => v !== null);
  if (strings.length < inputLength) {
    console.warn(`[crm-config] parseStringArray: filtered ${inputLength - strings.length} invalid entries`);
  }
  return strings.length > 0 ? strings : null;
}

/**
 * Safely parses a JSONB value as an array of CustomFieldDefinition.
 * Invalid entries are logged and filtered out. Duplicate keys are deduplicated (last wins).
 * Uses safeParse().data to preserve any schema transformations.
 */
function parseCustomFields(value: unknown): CustomFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  const results = value.map((item) => customFieldDefinitionSchema.safeParse(item));
  const invalid = results.filter((r) => !r.success);
  if (invalid.length > 0) {
    console.warn(`[crm-config] parseCustomFields: filtered ${invalid.length} invalid field definitions`);
  }
  const valid = results.filter((r) => r.success).map((r) => r.data as CustomFieldDefinition);
  // Deduplicate by key — last definition wins
  const byKey = new Map<string, CustomFieldDefinition>();
  for (const field of valid) byKey.set(field.key, field);
  return Array.from(byKey.values());
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

Update `src/lib/crm/schemas.ts` to use properly typed fields for the new columns. Replace the existing `crmConfigSchema` and `crmConfigInsertSchema` with versions that include the new columns, while keeping backward compatibility. **Note:** vocabulary array fields use `jsonValueSchema.nullable()` (not typed arrays) because `resolveCrmConfig()` handles parsing/normalization — the row schema just validates the DB shape.

Also widen the configurable enum fields on entity schemas from static `z.enum()` to `z.string().min(1)` so persisted rows with custom vocabulary pass validation:

```typescript
// In src/lib/crm/schemas.ts:
// Replace: const contactTypeSchema = z.enum(contactTypeValues);
// With: (keep contactTypeValues for backward compat, but don't use in row schemas)

// contactSchema.type, dealSchema.stage, interactionSchema.type, dealContactSchema.role
// all become z.string().min(1) instead of z.enum(...)
```

```typescript
// In src/lib/crm/schemas.ts — replace crmConfigSchema block
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

Also add `custom_fields` to the entity row schemas (`contactSchema`, `dealSchema`, `crmTaskSchema`):
```typescript
custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
```
And optional in insert schemas (`contactInsertSchema`, `dealInsertSchema`, `crmTaskInsertSchema`):
```typescript
custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
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
// Reuse the existing createMockSupabase helper (do NOT roll a new mock).
import { loadCrmConfig } from "../config";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

describe("loadCrmConfig", () => {
  const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

  it("returns defaults when no crm_config row exists", async () => {
    const { client } = createMockSupabase({
      crm_config: { data: null, error: null },
    });
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
    const { client } = createMockSupabase({
      crm_config: { data: row, error: null },
    });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config.deal_label).toBe("Policy");
    expect(config.deal_stages).toEqual(["lead", "quoted", "bound"]);
    expect(config.contact_types).toEqual(CRM_DEFAULTS.contact_types);
  });

  it("returns defaults when query errors", async () => {
    const { client } = createMockSupabase({
      crm_config: { data: null, error: { message: "timeout" } },
    });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config).toEqual(CRM_DEFAULTS);
  });

  it("normalizes legacy object-array shapes from DB", async () => {
    const row = {
      deal_label: "Deal",
      deal_stages: [
        { id: "leads", name: "Leads", color: "#94a3b8" },
        { id: "closing", name: "Closing", color: "#34d399" },
      ],
      contact_types: null,
      interaction_types: null,
      deal_contact_roles: null,
      task_types: null,
      deal_custom_fields: [],
      contact_custom_fields: [],
      task_custom_fields: [],
    };
    const { client } = createMockSupabase({
      crm_config: { data: row, error: null },
    });
    const config = await loadCrmConfig(client, CLIENT_ID);
    expect(config.deal_stages).toEqual(["leads", "closing"]);
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

## Task 4: Dynamic Schema Builder

**Files:**
- Modify: `src/lib/crm/config.ts`
- Modify: `src/lib/crm/__tests__/config.test.ts`

**Context:** Currently tools use static `z.enum(contactTypeValues)`. We need a helper function that creates a Zod object schema from custom field definitions at runtime. This is a pure function — no database access, no side effects.

**Note:** No `buildStringEnum` wrapper — it's a one-liner (`z.enum(values as [string, ...string[]])`) that should be inlined at call sites. Adding a named function for this creates indirection without value.

### Step 1: Write the failing test for buildCustomFieldsSchema

```typescript
// Append to src/lib/crm/__tests__/config.test.ts
import { buildCustomFieldsSchema } from "../config";

describe("buildCustomFieldsSchema", () => {
  it("returns open record schema when no custom fields defined", () => {
    const schema = buildCustomFieldsSchema([]);
    // When no definitions exist, accepts any string/number/null values
    const result = schema.parse({ anything: "goes", count: 42 });
    expect(result).toEqual({ anything: "goes", count: 42 });
  });

  it("validates custom field values against definitions", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "policy_number", label: "Policy Number", type: "text" },
      { key: "coverage", label: "Coverage Amount", type: "number" },
    ];
    const schema = buildCustomFieldsSchema(definitions);

    // Valid input
    const result = schema.parse({ policy_number: "POL-001", coverage: 50000 });
    expect(result.policy_number).toBe("POL-001");
    expect(result.coverage).toBe(50000);

    // Extra keys are stripped (not in definitions)
    const withExtra = schema.parse({ policy_number: "POL-001", unknown: "val" });
    expect(withExtra).not.toHaveProperty("unknown");
  });

  it("enforces required fields in create mode", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "policy_number", label: "Policy Number", type: "text", required: true },
    ];
    const schema = buildCustomFieldsSchema(definitions, "create");

    // Missing required field — should fail
    expect(() => schema.parse({})).toThrow();

    // Provided — should pass
    expect(schema.parse({ policy_number: "POL-001" })).toEqual({ policy_number: "POL-001" });
  });

  it("makes all fields optional in update mode (PATCH semantics)", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "policy_number", label: "Policy Number", type: "text", required: true },
      { key: "coverage", label: "Coverage", type: "number" },
    ];
    const schema = buildCustomFieldsSchema(definitions, "update");

    // Empty object is valid in update mode — no required fields
    expect(schema.parse({})).toEqual({});

    // Partial update with just one field
    expect(schema.parse({ coverage: 50000 })).toEqual({ coverage: 50000 });
  });

  it("validates select-type fields against options", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"] },
    ];
    const schema = buildCustomFieldsSchema(definitions);

    expect(schema.parse({ priority: "low" })).toEqual({ priority: "low" });
    expect(() => schema.parse({ priority: "urgent" })).toThrow();
  });

  it("validates date fields as ISO date strings", () => {
    const definitions: CustomFieldDefinition[] = [
      { key: "expiry", label: "Expiry Date", type: "date" },
    ];
    const schema = buildCustomFieldsSchema(definitions);

    expect(schema.parse({ expiry: "2026-12-31" })).toEqual({ expiry: "2026-12-31" });
    expect(() => schema.parse({ expiry: "not-a-date" })).toThrow();
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/crm/__tests__/config.test.ts
```

Expected: FAIL — `buildCustomFieldsSchema is not exported`

### Step 3: Implement buildCustomFieldsSchema

Add to `src/lib/crm/config.ts`:

```typescript
/** Open record schema for custom_fields when no definitions exist. Accepts any string/number/null values. */
const OPEN_CUSTOM_FIELDS_SCHEMA = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

/**
 * Builds a Zod schema for custom field validation.
 * Always returns a schema — when no definitions exist, returns an open record schema.
 * This avoids ternary repetition at every call site.
 *
 * @param mode - "create" enforces required fields; "update" makes all fields optional (PATCH semantics).
 */
export function buildCustomFieldsSchema(
  definitions: CustomFieldDefinition[],
  mode: "create" | "update" = "create",
): z.ZodTypeAny {
  if (definitions.length === 0) return OPEN_CUSTOM_FIELDS_SCHEMA;

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
        fieldSchema = z.string().date(); // ISO date string (YYYY-MM-DD)
        break;
      default:
        fieldSchema = z.string();
    }

    // In "update" mode, all fields are optional (PATCH). In "create", required fields are enforced.
    const isOptional = mode === "update" || !field.required;
    shape[field.key] = isOptional ? fieldSchema.optional() : fieldSchema;
  }

  // Strip unknown keys (don't use .strict() — we want to silently ignore unknown fields)
  return z.object(shape);
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
git commit -m "feat(pr15c): buildCustomFieldsSchema — dynamic field validation with create/update modes"
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
2. Replace `z.enum(contactTypeValues)` with inline `z.enum(config.contact_types as [string, ...string[]])` (no wrapper function — it's a one-liner)
3. Replace hardcoded `.describe()` strings with templates using config values
4. Add optional `custom_fields` parameter to create/update tools using `buildCustomFieldsSchema(defs, mode).optional()` (always returns a schema, no ternaries needed)
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
import { type CrmVocabConfig, buildCustomFieldsSchema } from "@/lib/crm/config";
```

2. Change signature:
```typescript
export function createContactTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig,
) {
```

3. Replace all `z.enum(contactTypeValues)` with inline enum cast — no wrapper function:
```typescript
z.enum(config.contact_types as [string, ...string[]])
```

4. Replace hardcoded `.describe()` strings with templates:
```typescript
// Before:
.describe("Contact type filter (buyer, seller, landlord, tenant, agent, other).")
// After:
.describe(`Contact type filter (${config.contact_types.join(", ")}).`)
```

5. Add `custom_fields` to `create_contact` and `update_contact` inputSchema. Since `buildCustomFieldsSchema` always returns a schema (open record when no definitions), no ternary needed:
```typescript
// In create_contact:
custom_fields: buildCustomFieldsSchema(config.contact_custom_fields, "create")
  .optional().describe("Custom field values."),

// In update_contact (PATCH — all fields optional):
custom_fields: buildCustomFieldsSchema(config.contact_custom_fields, "update")
  .optional().describe("Custom field values to update."),
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
3. Replace `z.enum(dealStageValues)` with `z.enum(config.deal_stages as [string, ...string[]])`
4. Template `.describe()` strings with config values
5. Add `custom_fields` using `buildCustomFieldsSchema(config.deal_custom_fields, mode).optional()` — no ternary
6. Use `config.deal_label` in tool descriptions: `` `Create a new ${config.deal_label.toLowerCase()}.` ``
7. Run tests

### Step 8: Repeat for interactions.ts

Same pattern:
1. Update test file
2. Update `createInteractionTools(supabase, clientId, config: CrmVocabConfig)`
3. Replace `z.enum(interactionTypeValues)` with `z.enum(config.interaction_types as [string, ...string[]])`
4. Template `.describe()` strings
5. Run tests

### Step 9: Repeat for tasks.ts

Same pattern:
1. Update test file
2. Update `createTaskTools(supabase, clientId, config: CrmVocabConfig)`
3. Add `custom_fields` using `buildCustomFieldsSchema(config.task_custom_fields, mode).optional()` — no ternary
4. Run tests

### Step 10: Repeat for deal-contacts.ts

Same pattern:
1. Update test file
2. Update `createDealContactTools(supabase, clientId, config: CrmVocabConfig)`
3. Replace `z.enum(dealContactRoleValues)` with `z.enum(config.deal_contact_roles as [string, ...string[]])`
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

## Task 6: configure_crm Tool (Setup Mode Only)

**Files:**
- Create: `src/lib/runner/tools/crm/configure-crm.ts`
- Create: `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`
- Modify: `src/lib/runner/tools/crm/__tests__/mock-supabase.ts` — add `upsert`, `maybeSingle`

**Context:** The agent needs a tool to update `crm_config` via chat. This tool is **only loaded in setup mode** — it is never part of the daily agent's toolset (see Task 6a for mode detection, Task 5 Step 11 for index barrel wiring). It performs an upsert: if no row exists for the client, insert one; otherwise update. Accepts partial updates (e.g., change only deal_stages without affecting contact_types).

**Guardrails (review amendment 9):**
- **In-use value check:** Before removing vocabulary values, query entities that use them and warn the agent (e.g., "12 deals use 'negotiation' — remove anyway?"). The agent can proceed by re-calling with `confirm_removals: true`.
- **Semantic validation:** `.max(30)` on vocabulary arrays (sane upper bound), `z.string().min(2)` on individual values (no single-char stages), deduplicate arrays before writing.
- **Echo full config:** Always return the full resolved config after changes so the agent can confirm.

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

  it("deduplicates vocabulary arrays before writing", async () => {
    const { client, builders } = createMockSupabase({
      crm_config: { data: { deal_stages: ["lead", "quoted"] }, error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      { deal_stages: ["lead", "quoted", "lead"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
    // Verify upsert was called with deduplicated array
    const upsertCall = builders.crm_config.upsert.mock.calls[0][0];
    expect(upsertCall.deal_stages).toEqual(["lead", "quoted"]);
  });

  it("warns when removing vocabulary values that are in use", async () => {
    // Mock: current config has "negotiation", deals table has rows using it
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          deal_stages: ["leads", "negotiation", "closing"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          deal_label: "Deal",
          deal_custom_fields: [],
          contact_custom_fields: [],
          task_custom_fields: [],
        },
        error: null,
      },
      deals: { data: [{ deal_id: "d1" }, { deal_id: "d2" }], error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    // Remove "negotiation" from stages
    const result = await tool.configure_crm.execute(
      { deal_stages: ["leads", "closing"] },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: false,
      reason: "values_in_use",
    });
    expect(result).toHaveProperty("in_use_values");
  });

  it("allows removal of in-use values with confirm_removals: true", async () => {
    const { client } = createMockSupabase({
      crm_config: {
        data: {
          deal_stages: ["leads", "negotiation", "closing"],
          contact_types: null,
          interaction_types: null,
          deal_contact_roles: null,
          deal_label: "Deal",
          deal_custom_fields: [],
          contact_custom_fields: [],
          task_custom_fields: [],
        },
        error: null,
      },
      deals: { data: [{ deal_id: "d1" }], error: null },
    });
    const tool = createConfigureCrmTool(client, CLIENT_ID);

    const result = await tool.configure_crm.execute(
      { deal_stages: ["leads", "closing"], confirm_removals: true },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({ success: true });
  });

  it("returns full resolved config after update", async () => {
    const updatedRow = {
      config_id: "cfg-1",
      client_id: CLIENT_ID,
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
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
      { deal_label: "Policy", deal_stages: ["lead", "quoted", "bound"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolved_config).toBeDefined();
      expect(result.resolved_config.deal_label).toBe("Policy");
    }
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

Expected: FAIL — `Cannot find module '../configure-crm'`

### Step 3: Add `upsert` and `maybeSingle` to mock-supabase

In `src/lib/runner/tools/crm/__tests__/mock-supabase.ts`, add to `CHAIN_METHOD_NAMES`:

```typescript
const CHAIN_METHOD_NAMES = [
  "select",
  "insert",
  "update",
  "upsert",       // ← add for configure_crm
  "maybeSingle",  // ← add for loadCrmConfig
  "delete",
  // ...existing methods...
];
```

### Step 4: Implement configure_crm tool

```typescript
// src/lib/runner/tools/crm/configure-crm.ts
/**
 * CRM configuration tool — setup-mode-only tool for updating CRM vocabulary via chat.
 * Never loaded in the daily agent's toolset. See run-agent.ts setup mode detection.
 * @module lib/runner/tools/crm/configure-crm
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { customFieldDefinitionSchema, resolveCrmConfig, type CrmConfigRow } from "@/lib/crm/config";
import type { Database } from "@/types/database";

/**
 * Vocabulary array schema with guardrails:
 * - Min 1 value (can't have empty stages)
 * - Max 30 values (sane upper bound)
 * - Each value min 2 chars (no single-char stages like "a")
 */
const vocabArraySchema = z.array(z.string().min(2)).min(1).max(30);

/** Mapping of vocabulary field → entity table + column for in-use checks. */
const VOCAB_ENTITY_MAP: Record<string, { table: string; column: string }> = {
  deal_stages: { table: "deals", column: "stage" },
  contact_types: { table: "contacts", column: "type" },
  interaction_types: { table: "interactions", column: "type" },
  deal_contact_roles: { table: "deal_contacts", column: "role" },
};

/** Deduplicates an array preserving order (first occurrence wins). */
function deduplicateArray(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * Checks which removed vocabulary values are still in use by entity rows.
 * Returns a map of { removed_value: count } for values with active references.
 */
async function checkInUseValues(
  supabase: SupabaseClient<Database>,
  clientId: string,
  fieldName: string,
  currentValues: string[],
  newValues: string[],
): Promise<Record<string, number>> {
  const mapping = VOCAB_ENTITY_MAP[fieldName];
  if (!mapping) return {};

  const removedValues = currentValues.filter((v) => !newValues.includes(v));
  if (removedValues.length === 0) return {};

  const inUse: Record<string, number> = {};

  for (const value of removedValues) {
    const { count, error } = await supabase
      .from(mapping.table as "deals")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq(mapping.column as "stage", value);

    if (!error && count && count > 0) {
      inUse[value] = count;
    }
  }

  return inUse;
}

/**
 * Creates the configure_crm tool.
 * This tool is ONLY loaded in setup mode — never in the daily agent's toolset.
 * Upserts crm_config for the given client with partial updates.
 */
export function createConfigureCrmTool(
  supabase: SupabaseClient<Database>,
  clientId: string,
) {
  const configure_crm = tool({
    description:
      "Update CRM vocabulary and custom field definitions. Accepts partial updates — " +
      "only provided fields are changed. Always echoes the full resulting config. " +
      "If removing values that are in use by existing records, returns a warning with counts. " +
      "Re-call with confirm_removals: true to proceed. " +
      "Data Modification Warning: Only configure CRM when the user has explicitly asked to do so.",
    inputSchema: z.object({
      deal_label: z.string().min(1).optional()
        .describe("Display label for deals (e.g., 'Policy', 'Project', 'Deal')."),
      deal_stages: vocabArraySchema.optional()
        .describe("Ordered list of deal pipeline stages (e.g., ['lead', 'quoted', 'bound', 'lost'])."),
      contact_types: vocabArraySchema.optional()
        .describe("Available contact type classifications (e.g., ['prospect', 'client', 'partner'])."),
      interaction_types: vocabArraySchema.optional()
        .describe("Available interaction types (e.g., ['call', 'meeting', 'email', 'note'])."),
      deal_contact_roles: vocabArraySchema.optional()
        .describe("Roles a contact can have on a deal (e.g., ['buyer', 'seller', 'agent'])."),
      deal_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for deals."),
      contact_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for contacts."),
      task_custom_fields: z.array(customFieldDefinitionSchema).optional()
        .describe("Custom field definitions for tasks."),
      confirm_removals: z.boolean().optional()
        .describe("Set to true to confirm removal of vocabulary values that are in use by existing records."),
    }),
    execute: async (input) => {
      const { confirm_removals, ...fields } = input;
      const updates = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );

      if (Object.keys(updates).length === 0) {
        return { success: false as const, error: "No fields to update." };
      }

      // Deduplicate vocabulary arrays
      for (const key of Object.keys(updates)) {
        if (Array.isArray(updates[key]) && key in VOCAB_ENTITY_MAP) {
          updates[key] = deduplicateArray(updates[key] as string[]);
        }
      }

      // In-use value check (unless confirm_removals is true)
      if (!confirm_removals) {
        // Load current config to compare
        const { data: currentRow } = await supabase
          .from("crm_config")
          .select("deal_stages, contact_types, interaction_types, deal_contact_roles, deal_label, deal_custom_fields, contact_custom_fields, task_custom_fields")
          .eq("client_id", clientId)
          .maybeSingle();

        if (currentRow) {
          const allInUse: Record<string, Record<string, number>> = {};

          for (const [fieldName, newValues] of Object.entries(updates)) {
            if (fieldName in VOCAB_ENTITY_MAP && Array.isArray(newValues)) {
              const currentValues = (currentRow as Record<string, unknown>)[fieldName];
              if (Array.isArray(currentValues)) {
                const inUse = await checkInUseValues(
                  supabase, clientId, fieldName,
                  currentValues as string[], newValues as string[],
                );
                if (Object.keys(inUse).length > 0) {
                  allInUse[fieldName] = inUse;
                }
              }
            }
          }

          if (Object.keys(allInUse).length > 0) {
            const warnings = Object.entries(allInUse).map(([field, values]) => {
              const items = Object.entries(values)
                .map(([v, count]) => `"${v}" (${count} records)`)
                .join(", ");
              return `${field}: ${items}`;
            });

            return {
              success: false as const,
              reason: "values_in_use" as const,
              in_use_values: allInUse,
              message: `Removing values that are in use: ${warnings.join("; ")}. Re-call with confirm_removals: true to proceed.`,
            };
          }
        }
      }

      // Upsert the config
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

      // Echo full resolved config so the agent can confirm
      const resolvedConfig = resolveCrmConfig(data as CrmConfigRow);

      return {
        success: true as const,
        resolved_config: resolvedConfig,
        message: "CRM configuration updated. Changes take effect on the next message.",
      };
    },
  });

  return { configure_crm };
}
```

### Step 5: Run test to verify it passes

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

Expected: PASS

### Step 6: Commit

```bash
git add src/lib/runner/tools/crm/configure-crm.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts src/lib/runner/tools/crm/__tests__/mock-supabase.ts
git commit -m "feat(pr15c): configure_crm tool — setup-mode-only with guardrails and in-use checks"
```

---

## Task 6a: Setup Mode Detection

**Files:**
- Modify: `src/lib/runner/tools/crm/index.ts` — setup/normal mode switch
- Modify: `src/lib/runner/tools/crm/__tests__/index.test.ts` — setup mode tests
- Modify: `src/lib/crm/config.ts` — add `hasCrmConfig()` check

**Context:** The daily agent must never have access to `configure_crm`. Setup mode is detected automatically (no crm_config row on first run) or triggered on demand by the user ("reconfigure my CRM"). The index barrel switches toolsets based on mode.

### Step 1: Add `hasCrmConfig` check to config.ts

Add to `src/lib/crm/config.ts`:

```typescript
/**
 * Checks whether a crm_config row exists for a client.
 * Used by the runner to detect first-run → setup mode.
 */
export async function hasCrmConfig(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("crm_config")
    .select("config_id")
    .eq("client_id", clientId)
    .maybeSingle();
  return !error && data !== null;
}
```

### Step 2: Update the index barrel with setup/normal mode switch

In `src/lib/runner/tools/crm/index.ts`:

```typescript
import { createConfigureCrmTool } from "./configure-crm";
import type { CrmVocabConfig } from "@/lib/crm/config";

type ToolsetMode = "normal" | "setup";

interface CreateCrmToolsOptions {
  allowWriteTools?: boolean;
  mode?: ToolsetMode;
}

export function createCrmTools(
  supabase: SupabaseClient<Database>,
  clientId: string,
  config: CrmVocabConfig,
  options?: CreateCrmToolsOptions,
) {
  const { allowWriteTools = true, mode = "normal" } = options ?? {};

  // Setup mode: only configure_crm, no CRM entity tools
  if (mode === "setup") {
    const configTools = createConfigureCrmTool(supabase, clientId);
    return { configure_crm: configTools.configure_crm };
  }

  // Normal mode: all CRM entity tools, NO configure_crm
  const contactTools = createContactTools(supabase, clientId, config);
  const dealTools = createDealTools(supabase, clientId, config);
  const dealContactTools = createDealContactTools(supabase, clientId, config);
  const interactionTools = createInteractionTools(supabase, clientId, config);
  const taskTools = createTaskTools(supabase, clientId, config);

  // ... rest unchanged (read/write split as before, but NO configure_crm)
}
```

### Step 3: Write tests for mode switching

Append to `src/lib/runner/tools/crm/__tests__/index.test.ts`:

```typescript
describe("createCrmTools — setup mode", () => {
  it("returns only configure_crm in setup mode", () => {
    const { client } = createMockSupabase();
    const tools = createCrmTools(client, CLIENT_ID, CRM_DEFAULTS, { mode: "setup" });

    expect(tools).toHaveProperty("configure_crm");
    expect(tools).not.toHaveProperty("search_contacts");
    expect(tools).not.toHaveProperty("create_deal");
  });

  it("does not include configure_crm in normal mode", () => {
    const { client } = createMockSupabase();
    const tools = createCrmTools(client, CLIENT_ID, CRM_DEFAULTS, { mode: "normal" });

    expect(tools).not.toHaveProperty("configure_crm");
    expect(tools).toHaveProperty("search_contacts");
  });

  it("defaults to normal mode when mode is not specified", () => {
    const { client } = createMockSupabase();
    const tools = createCrmTools(client, CLIENT_ID, CRM_DEFAULTS);

    expect(tools).not.toHaveProperty("configure_crm");
    expect(tools).toHaveProperty("search_contacts");
  });
});
```

### Step 4: Run tests

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/index.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/runner/tools/crm/index.ts src/lib/runner/tools/crm/__tests__/index.test.ts src/lib/crm/config.ts
git commit -m "feat(pr15c): setup mode detection — configure_crm isolated from daily toolset"
```

---

## Task 6b: Setup System Prompt

**Files:**
- Modify: `src/lib/ai/system-prompt.ts` — add setup mode prompt variant

**Context:** When in setup mode, the agent needs different instructions — it should ask about the user's business, propose vocabulary, and use `configure_crm`. The normal system prompt talks about CRM tools that aren't available in setup mode, which would confuse the model.

### Step 1: Add setup prompt to system-prompt.ts

```typescript
// In src/lib/ai/system-prompt.ts, add:

/**
 * System prompt for CRM setup mode.
 * Used on first run (no crm_config) or when the user asks to reconfigure.
 * The agent asks about the user's business and proposes vocabulary.
 */
export const SETUP_SYSTEM_PROMPT = `You are setting up the user's CRM for the first time.

Your goal: understand what industry the user is in and configure their CRM vocabulary to match their business.

Ask about:
- What they call their pipeline stages (e.g., leads → negotiation → offer → closing → lost)
- What types of contacts they work with (e.g., buyer, seller, landlord, tenant)
- What types of interactions they track (e.g., calls, meetings, viewings)
- Whether they need custom fields on contacts, deals, or tasks
- What they want to call their deals (e.g., "Deal", "Policy", "Project")

After gathering this information, use the configure_crm tool to set up their vocabulary.
Confirm the configuration with the user before finishing.

Keep it conversational and concise — don't overwhelm with too many questions at once.
Real estate defaults are pre-loaded, so if they're a real estate agent, minimal changes are needed.`;
```

### Step 2: Wire into run-agent.ts

The setup prompt replaces the normal system prompt when in setup mode. In `run-agent.ts`:

```typescript
import { SETUP_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

// In the setup mode branch:
if (isSetupMode) {
  // Use setup prompt instead of normal system prompt
  // assembleContext still builds memory/compaction layers, but
  // instructions param gets SETUP_SYSTEM_PROMPT prepended
}
```

The exact wiring is handled in Task 7 (run-agent.ts modifications).

### Step 3: Commit

```bash
git add src/lib/ai/system-prompt.ts
git commit -m "feat(pr15c): setup system prompt for CRM configuration mode"
```

---

## Task 7: Wire Config into Runner + Platform Instructions

**Files:**
- Modify: `src/lib/runner/run-agent.ts`
- Modify: `src/lib/runner/context.ts`
- Modify: `src/lib/ai/platform-instructions.ts`
- Create: `src/lib/ai/__tests__/platform-instructions.test.ts`
- Modify: `src/lib/runner/__tests__/run-agent.test.ts` (if mock needs updating)

**Context:** The runner needs to `loadCrmConfig()` once at the start of each run and pass it to both `assembleContext()` (for the `<crm-vocabulary>` prompt block) and `createCrmTools()` (for dynamic schemas). Platform instructions need a new `<crm-vocabulary>` section that templates the current config so the LLM knows valid values without making tool calls.

**Important:** Config must be loaded BEFORE both context assembly and tool creation. The sequence is:
1. `loadCrmConfig()` + `hasCrmConfig()` → get config + detect setup mode
2. `assembleContext(..., crmConfig)` → config injects vocab block into system prompt
3. `createCrmTools(..., crmConfig, { mode })` → config drives dynamic tool schemas

### Step 1: Update run-agent.ts to load config, detect setup mode, select toolset

In `src/lib/runner/run-agent.ts`:

1. Add imports:
```typescript
import { loadCrmConfig, hasCrmConfig } from "@/lib/crm/config";
import { SETUP_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
```

2. **Before** `assembleContext()`, add:
```typescript
// Load CRM config + detect setup mode
const [crmConfig, hasConfig] = await Promise.all([
  loadCrmConfig(supabase, clientId),
  hasCrmConfig(supabase, clientId),
]);

// Setup mode: first run (no config row) or on-demand reconfigure
// TODO: on-demand detection (check if currentMessage matches reconfigure intent) is deferred
const isSetupMode = !hasConfig;
```

3. Update `assembleContext` call:
```typescript
const { system, messages } = await assembleContext({
  supabase,
  threadId,
  currentMessage,
  clientId,
  crmConfig,
  instructions: isSetupMode ? SETUP_SYSTEM_PROMPT : undefined,
});
```

4. Update `createCrmTools` call:
```typescript
const crmTools = createCrmTools(supabase, clientId, crmConfig, {
  allowWriteTools: true,
  mode: isSetupMode ? "setup" : "normal",
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

### Step 4: Update context.ts to accept and use CRM config

In `src/lib/runner/context.ts`, make these exact changes:

1. **Add import:**
```typescript
import type { CrmVocabConfig } from "@/lib/crm/config";
```

2. **Remove old import** (line 8):
```typescript
// REMOVE: import { PLATFORM_INSTRUCTIONS } from "@/lib/ai/platform-instructions";
// REPLACE WITH:
import { buildPlatformInstructions } from "@/lib/ai/platform-instructions";
```

3. **Add `crmConfig` to `AssembleContextParams`** (line 25-31):
```typescript
interface AssembleContextParams {
  supabase: ChatSupabaseClient;
  threadId: string;
  currentMessage: string;
  clientId?: string;
  instructions?: string;
  crmConfig?: CrmVocabConfig;  // ← add this
}
```

4. **Add `crmConfig` to `BuildSystemPromptOptions`** (line 53-58):
```typescript
interface BuildSystemPromptOptions {
  memory?: MemoryContext;
  compactionSummary?: string;
  systemReminder?: string;
  instructions?: string;
  crmConfig?: CrmVocabConfig;  // ← add this
}
```

5. **Update `buildSystemPrompt` function** — replace the line that pushes `PLATFORM_INSTRUCTIONS` (line 75):
```typescript
// BEFORE:
sections.push(PLATFORM_INSTRUCTIONS);
// AFTER:
sections.push(buildPlatformInstructions(crmConfig));
```

Also add `crmConfig` to the destructured parameters:
```typescript
function buildSystemPrompt({
  memory,
  compactionSummary,
  systemReminder,
  instructions,
  crmConfig,  // ← add this
}: BuildSystemPromptOptions): string {
```

6. **Update `assembleContext`** — destructure `crmConfig` and pass it through (line 110-116):
```typescript
export async function assembleContext({
  supabase,
  threadId,
  currentMessage,
  clientId,
  instructions,
  crmConfig,  // ← add this
}: AssembleContextParams): Promise<AssembledContext> {
```

And in the return statement (line 174):
```typescript
return {
  system: buildSystemPrompt({
    memory: memoryContext,
    compactionSummary: compactionState?.compaction_summary,
    systemReminder,
    instructions,
    crmConfig,  // ← add this
  }),
  messages: [...historyMessages, ...currentMessageTurn],
};
```

### Step 6: Add test for buildCrmVocabularyBlock output

Add to `src/lib/ai/__tests__/platform-instructions.test.ts` (or the existing test file):

```typescript
import { buildCrmVocabularyBlock } from "../platform-instructions";
import { CRM_DEFAULTS } from "@/lib/crm/config";

describe("buildCrmVocabularyBlock", () => {
  it("includes all vocabulary dimensions", () => {
    const block = buildCrmVocabularyBlock(CRM_DEFAULTS);
    expect(block).toContain("<crm-vocabulary>");
    expect(block).toContain("</crm-vocabulary>");
    expect(block).toContain("Deal stages: leads, negotiation, offer, closing, lost");
    expect(block).toContain("Contact types: buyer, seller, landlord, tenant, agent, other");
  });

  it("includes custom fields when defined", () => {
    const config = {
      ...CRM_DEFAULTS,
      deal_custom_fields: [
        { key: "policy_number", label: "Policy Number", type: "text" as const, required: true },
      ],
    };
    const block = buildCrmVocabularyBlock(config);
    expect(block).toContain("Custom fields:");
    expect(block).toContain("Deal → Policy Number (text, required)");
  });

  it("omits custom fields section when none defined", () => {
    const block = buildCrmVocabularyBlock(CRM_DEFAULTS);
    expect(block).not.toContain("Custom fields:");
  });
});
```

### Step 7: Run all tests

```bash
npm run test:run
```

Expected: PASS — may need to update mocks in run-agent.test.ts for the new loadCrmConfig call.

### Step 8: Commit

```bash
git add src/lib/runner/run-agent.ts src/lib/ai/platform-instructions.ts src/lib/runner/context.ts src/lib/ai/__tests__/platform-instructions.test.ts
git commit -m "feat(pr15c): wire CRM config into runner + platform instructions vocabulary"
```

---

## Task 8: CRM Config API Route + useCrmConfig Hook + Route Tests

**Files:**
- Create: `app/api/crm/config/route.ts`
- Create: `app/api/crm/config/__tests__/route.test.ts`
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
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

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

### Step 2: Write API route tests

```typescript
// app/api/crm/config/__tests__/route.test.ts
/**
 * Tests for GET /api/crm/config.
 */
import { describe, expect, it, vi } from "vitest";

import { CRM_DEFAULTS } from "@/lib/crm/config";

// Mock createClient before importing the route
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/crm/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/config")>();
  return {
    ...actual,
    loadCrmConfig: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { loadCrmConfig } from "@/lib/crm/config";
import { GET } from "../route";

function mockSupabase(overrides: {
  user?: { id: string } | null;
  client?: { client_id: string } | null;
}) {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: overrides.user ?? null },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: overrides.client ?? null,
            error: null,
          }),
        }),
      }),
    }),
  };
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(supabase);
  return supabase;
}

describe("GET /api/crm/config", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabase({ user: null });

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when client not found", async () => {
    mockSupabase({ user: { id: "user-1" }, client: null });

    const response = await GET();

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Client not found");
  });

  it("returns defaults when no crm_config row exists", async () => {
    mockSupabase({ user: { id: "user-1" }, client: { client_id: "client-1" } });
    (loadCrmConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ ...CRM_DEFAULTS });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deal_stages).toEqual(CRM_DEFAULTS.deal_stages);
    expect(body.contact_types).toEqual(CRM_DEFAULTS.contact_types);
  });

  it("returns custom config when crm_config row exists", async () => {
    mockSupabase({ user: { id: "user-1" }, client: { client_id: "client-1" } });
    const customConfig = {
      ...CRM_DEFAULTS,
      deal_label: "Policy",
      deal_stages: ["lead", "quoted", "bound"],
    };
    (loadCrmConfig as ReturnType<typeof vi.fn>).mockResolvedValue(customConfig);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deal_label).toBe("Policy");
    expect(body.deal_stages).toEqual(["lead", "quoted", "bound"]);
  });
});
```

### Step 3: Run route tests

```bash
npx vitest run app/api/crm/config/__tests__/route.test.ts
```

Expected: PASS

### Step 4: Create the useCrmConfig hook

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
    staleTime: 30 * 1000, // 30 seconds — config changes rarely but should reflect reasonably fast
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

### Step 5: Verify the build compiles

```bash
npx next build
```

Expected: No TypeScript errors.

### Step 6: Commit

```bash
git add app/api/crm/config/route.ts app/api/crm/config/__tests__/route.test.ts src/hooks/use-crm-config.ts
git commit -m "feat(pr15c): CRM config API route + useCrmConfig hook + route tests"
```

---

## Task 9: Dynamic CRM Pages

**Files:**
- Modify: `src/lib/crm/display.ts`
- Create: `src/lib/crm/__tests__/display.test.ts`
- Modify: `src/components/crm/stage-badge.tsx`
- Modify: `src/components/crm/interaction-timeline.tsx`
- Modify: `app/(dashboard)/crm/contacts/page.tsx`
- Modify: `app/(dashboard)/crm/deals/page.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/task-drawer-content.tsx`
- Modify: `src/hooks/use-update-contact.ts` — accept custom_fields
- Modify: `src/hooks/use-update-deal.ts` — accept custom_fields
- Modify: `src/hooks/use-update-crm-task.ts` — accept custom_fields

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

/**
 * Title-cases a string. Replaces underscores with spaces first so
 * "follow_up" → "Follow Up" (not "Follow_up").
 */
export function toTitleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/(?:^|\s)\w/g, (char) => char.toUpperCase());
}
```

### Step 1a: Write display helper tests

```typescript
// src/lib/crm/__tests__/display.test.ts
/**
 * Tests for dynamic CRM display helpers.
 */
import { describe, expect, it } from "vitest";

import {
  getDealStageBadgeVariant,
  getContactTypeBadgeVariant,
  getDealStageToneClass,
  getDealStageTopBorder,
  toTitleCase,
} from "../display";

describe("getDealStageBadgeVariant", () => {
  it("returns known variant for default stages", () => {
    // "leads" should hit the static map
    const variant = getDealStageBadgeVariant("leads");
    expect(typeof variant).toBe("string");
    expect(variant.length).toBeGreaterThan(0);
  });

  it("returns a deterministic fallback for unknown stages", () => {
    const variant1 = getDealStageBadgeVariant("underwriting");
    const variant2 = getDealStageBadgeVariant("underwriting");
    expect(variant1).toBe(variant2); // Same string → same variant

    // Different string → potentially different variant
    const variant3 = getDealStageBadgeVariant("quoting");
    expect(typeof variant3).toBe("string");
  });
});

describe("getContactTypeBadgeVariant", () => {
  it("returns a variant for unknown contact types", () => {
    const variant = getContactTypeBadgeVariant("prospect");
    expect(typeof variant).toBe("string");
  });
});

describe("getDealStageToneClass / getDealStageTopBorder", () => {
  it("returns deterministic class strings for unknown stages", () => {
    const tone1 = getDealStageToneClass("custom_stage");
    const tone2 = getDealStageToneClass("custom_stage");
    expect(tone1).toBe(tone2);
    expect(tone1).toContain("bg-");

    const border1 = getDealStageTopBorder("custom_stage");
    const border2 = getDealStageTopBorder("custom_stage");
    expect(border1).toBe(border2);
    expect(border1).toContain("border-t-");
  });
});

describe("toTitleCase", () => {
  it("capitalizes single word", () => {
    expect(toTitleCase("leads")).toBe("Leads");
  });

  it("handles underscored values", () => {
    expect(toTitleCase("follow_up")).toBe("Follow Up");
  });

  it("handles multi-underscore values", () => {
    expect(toTitleCase("in_progress_review")).toBe("In Progress Review");
  });

  it("handles already title-cased values", () => {
    expect(toTitleCase("Deal")).toBe("Deal");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});
```

### Step 1b: Run display tests

```bash
npx vitest run src/lib/crm/__tests__/display.test.ts
```

Expected: PASS

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

**Race condition fix (review amendment 18):** The pattern `{ ...deal.custom_fields, [field.key]: nextValue }` spreads from `deal` which comes from the query cache. If a user edits two custom fields in quick succession, the second edit's spread may use a stale cache (before the first mutation's refetch completes), dropping the first field's change. Fix with optimistic updates in the mutation hook's `onMutate`:

```typescript
// In the updateDeal mutation (use-update-deal.ts), add onMutate for optimistic cache update:
onMutate: async (variables) => {
  // Cancel outgoing refetches so they don't overwrite our optimistic update
  await queryClient.cancelQueries({ queryKey: dealKeys.detail(dealId) });
  // Snapshot previous value for rollback
  const previous = queryClient.getQueryData(dealKeys.detail(dealId));
  // Optimistically update the cache
  queryClient.setQueryData(dealKeys.detail(dealId), (old: Deal | undefined) =>
    old ? { ...old, ...variables } : old,
  );
  return { previous };
},
onError: (_err, _variables, context) => {
  // Rollback on error
  if (context?.previous) {
    queryClient.setQueryData(dealKeys.detail(dealId), context.previous);
  }
},
onSettled: () => {
  // Refetch to ensure server state is synced
  queryClient.invalidateQueries({ queryKey: dealKeys.detail(dealId) });
},
```

Apply the same pattern to `use-update-contact.ts` and `use-update-crm-task.ts`.

### Step 6: Update contact drawer — dynamic type select + custom fields

Same pattern as deal drawer but using `config.contact_types` and `config.contact_custom_fields`.

### Step 7: Update task drawer — custom fields

Same pattern using `config.task_custom_fields`.

### Step 8: Update mutation hooks to accept custom_fields

The three update hooks currently don't include `custom_fields` in their mutation payloads, which means drawer custom field edits won't persist.

In `src/hooks/use-update-contact.ts`, `src/hooks/use-update-deal.ts`, and `src/hooks/use-update-crm-task.ts`:
- Add `custom_fields?: Record<string, string | number | null>` to the mutation input type
- Pass it through to the Supabase `.update()` call

This is a one-line change per hook — add `custom_fields` to the update payload type and the update call.

**Note:** Table column rendering for custom fields is deferred to a separate PR (needs design decisions about which fields appear in table vs. drawer).

### Step 9: Update interaction timeline — dynamic type labels

```typescript
// In interaction-timeline.tsx, replace static maps with dynamic lookup:
const label = toTitleCase(interaction.type);
```

The icon map can remain static for known types with a fallback icon for unknown types.

### Step 10: Run the full test suite

```bash
npm run test:run
```

Expected: PASS — some component tests may need updates if they render CRM components.

### Step 11: Manual verification

Start the dev server and verify:
1. Default real-estate vocabulary works (no crm_config row needed)
2. All CRM pages load correctly
3. Deal kanban shows correct stages
4. Contact type filter shows correct types
5. Drawers show correct inline edit options
6. Custom field edits in drawers persist correctly

```bash
npm run dev
```

### Step 12: Commit

```bash
git add src/lib/crm/display.ts src/components/crm/ app/(dashboard)/crm/ src/hooks/use-crm-config.ts src/hooks/use-update-contact.ts src/hooks/use-update-deal.ts src/hooks/use-update-crm-task.ts
git commit -m "feat(pr15c): dynamic CRM pages — config-driven labels, badges, kanban columns, custom fields"
```

---

## Task 10: Update seed.sql to String Arrays

**Files:**
- Modify: `supabase/seed.sql`

**Context (review amendment 10):** After `db reset`, migrations run before seed data inserts. The migration's normalization UPDATE (Step B) finds no rows on a fresh DB — then seed inserts old object-array format like `[{"id": "leads", "name": "Leads", "color": "#94a3b8"}, ...]`. Since the normalization already ran, these object arrays persist permanently until the next reset. Seed must be updated to use the post-migration string-array format.

### Step 1: Update seed.sql

Find the `INSERT INTO public.crm_config` statement in `supabase/seed.sql` and update the JSONB values from object arrays to string arrays:

```sql
-- BEFORE (object arrays):
-- deal_stages = '[{"id": "leads", "name": "Leads", "color": "#94a3b8"}, ...]'::jsonb
-- interaction_types = '[{"id": "call", "name": "Call"}, ...]'::jsonb

-- AFTER (string arrays):
-- deal_stages = '["leads", "negotiation", "offer", "closing", "lost"]'::jsonb
-- interaction_types = '["call", "meeting", "email", "message", "viewing", "note"]'::jsonb
-- task_types = '["follow_up", "viewing", "admin", "other"]'::jsonb
```

Also add the new columns introduced by the migration:
```sql
-- contact_types = '["buyer", "seller", "landlord", "tenant", "agent", "other"]'::jsonb
-- deal_contact_roles = '["buyer", "seller", "agent", "other"]'::jsonb
-- deal_label = 'Deal'
-- deal_custom_fields = '[]'::jsonb
-- contact_custom_fields = '[]'::jsonb
-- task_custom_fields = '[]'::jsonb
```

### Step 2: Verify with a fresh reset

```bash
npx supabase db reset
```

Expected: No errors. Seed data has string arrays. Verify in Supabase Studio that `crm_config.deal_stages` is `["leads", "negotiation", ...]` not `[{"id": "leads", ...}]`.

### Step 3: Commit

```bash
git add supabase/seed.sql
git commit -m "fix(pr15c): seed.sql — use string arrays for crm_config vocabulary"
```

---

## Final Integration Test Checklist

Before marking PR 15c complete, verify these end-to-end scenarios:

- [ ] **Zero-config:** New user with no `crm_config` row → setup mode activates → agent asks about business → configures vocabulary → all tools and UI reflect new vocabulary
- [ ] **Setup mode isolation:** In setup mode, only `configure_crm` is available. Agent cannot search/create/update CRM entities until setup is complete.
- [ ] **Normal mode isolation:** After setup, `configure_crm` is NOT in the toolset. Agent has all CRM entity tools.
- [ ] **Vocabulary swap:** Tell agent "I sell insurance, my stages are lead/quoted/underwriting/bound/lost" → agent calls `configure_crm` → all tools and UI reflect new vocabulary on next message
- [ ] **In-use value guardrail:** Try to remove a stage that has deals → agent warns with counts → confirm_removals: true allows it
- [ ] **Custom fields:** Tell agent "I need to track policy number and coverage amount on deals" → agent adds custom fields → `create_deal` accepts them → deal drawer shows new fields
- [ ] **Partial update:** `configure_crm` with only `deal_stages` → contact_types and interaction_types remain unchanged
- [ ] **Search results include custom_fields:** `search_contacts`, `search_deals`, `search_tasks` return `custom_fields` in response
- [ ] **Platform instructions reflect config:** System prompt includes `<crm-vocabulary>` block with current vocabulary
- [ ] **seed.sql:** `npx supabase db reset` → seed data uses string arrays → app works correctly with seeded config
- [ ] **All existing tests pass:** `npm run test:run` — no regressions

---

## Notes

- **crmTaskStatusValues (open/completed) are NOT configurable.** Task status is binary and not industry-specific. The plan does not mention making it configurable.
- **configure_crm is setup-mode only.** The daily agent never has access to this tool. Setup mode auto-triggers on first run (no crm_config row) or on-demand via user intent. Industry research (Attio, Folk) confirms no major CRM lets AI touch schema config in normal operation.
- **Two separate toolsets.** Setup mode loads only `configure_crm`. Normal mode loads all CRM entity tools without `configure_crm`. The daily agent literally cannot reconfigure because the tool isn't in its context.
- **In-use value guardrails.** `configure_crm` checks for entity rows using removed vocabulary values and warns with counts before allowing removal. `confirm_removals: true` overrides.
- **Badge styling for custom stages uses deterministic color cycling.** Unknown stages get colors from a cycling palette based on string hash. This means the same stage name always gets the same color, even if it's not in the default real-estate vocabulary.
- **Custom field validation is best-effort.** The Zod schema validates types at tool call time with separate create/update modes. Values already stored in the database are not retroactively validated if field definitions change.
- **`buildCustomFieldsSchema` always returns a schema.** When no definitions exist, returns an open `z.record()` schema. This eliminates ternary repetition at call sites.
- **No `buildStringEnum` wrapper.** Inline `z.enum(values as [string, ...string[]])` at call sites — one-liner wrappers add indirection without value.
- **Config is loaded once per runner invocation**, not per tool call. This means config changes take effect on the next message (acceptable for vocabulary that changes infrequently).
- **The `task_types` column on crm_config is preserved but unused.** It was created in PR 5 and is not part of PR 15c's vocabulary. Kept for potential future use.
- **Static CHECK constraints have been removed** from `contacts.type`, `deals.stage`, `interactions.type`, `deal_contacts.role`. Validation is now app-layer only (tool schemas + UI). This is intentional — it keeps vocabulary extensibility simple.
- **Legacy object-array config data is normalized** in the migration. `parseStringArray()` also handles both shapes at runtime as a safety net, with `console.warn` logging for filtered entries.
- **Persisted row schemas use `z.string().min(1)`** for configurable fields (not `z.enum()`). Dynamic enum validation only lives in tool input schemas via inline `z.enum()` cast.
- **`toTitleCase` handles underscores.** `"follow_up"` → `"Follow Up"`, not `"Follow_up"`.
- **Drawer custom fields use optimistic updates** to avoid race conditions when editing multiple fields in quick succession.
- **Table column rendering for custom fields is deferred** to a separate PR. This PR covers drawers, badges, kanban, and filters.
- **API route uses `createClient` from `server.ts`**, not `createRouteClient` (which does not exist).
- **seed.sql updated to match post-migration format.** String arrays instead of object arrays, includes new columns.
