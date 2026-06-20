# Twenty CRM Reference — CRM Configurability Patterns

> **Purpose:** Reference document for PR 15c (CRM Configurability). Documents how Twenty CRM implements configurable fields, SELECT options, dynamic schemas, and field rendering — and maps those patterns to each Sunder task.
>
> **Twenty repo:** `https://github.com/twentyhq/twenty` (local clone: `/Users/sethlim/Documents/twenty`)
>
> **Date:** 2026-03-07

---

## Table of Contents

1. [Twenty Architecture Overview](#1-twenty-architecture-overview)
2. [Key Twenty Files by Feature](#2-key-twenty-files-by-feature)
3. [Pattern Deep Dives](#3-pattern-deep-dives)
4. [Task-by-Task Mapping](#4-task-by-task-mapping)
5. [Drift Analysis](#5-drift-analysis)
6. [Code to Copy](#6-code-to-copy)

---

## 1. Twenty Architecture Overview

### Metadata-Driven CRM

Twenty uses a **two-schema architecture**:

- **Metadata schema** (`_metadata`): stores object definitions (`objectMetadata`) and field definitions (`fieldMetadata`). These are the "config" — what fields exist, what type they are, what options are available.
- **Workspace data schemas** (per-tenant): actual record tables (`company`, `person`, `opportunity`, `task`). Schema shape is driven by metadata.

This is fundamentally heavier than what Sunder needs. Twenty supports arbitrary custom objects and custom fields on any object. Sunder only needs vocabulary swaps (deal stages, contact types, etc.) and JSONB-based custom fields.

### Field Metadata Entity

```
packages/twenty-server/src/engine/metadata-modules/field-metadata/field-metadata.entity.ts
```

Key columns on `FieldMetadataEntity`:

| Column | Type | Purpose |
|--------|------|---------|
| `type` | `FieldMetadataType` (varchar) | Field data type (TEXT, SELECT, NUMBER, CURRENCY, etc.) |
| `options` | `JSONB` | SELECT/MULTI_SELECT option arrays |
| `settings` | `JSONB` | Type-specific settings (display format, etc.) |
| `defaultValue` | `JSONB` | Default value for the field |
| `isCustom` | `boolean` | Whether user-created (vs standard) |
| `isActive` | `boolean` | Whether field is active |
| `isNullable` | `boolean` | Whether field accepts null |

### Option Storage Shape

Twenty stores SELECT/MULTI_SELECT options as JSONB arrays of objects:

```typescript
// packages/twenty-shared/src/types/FieldMetadataOptions.ts

export type TagColor =
  | 'green' | 'turquoise' | 'sky' | 'blue' | 'purple'
  | 'pink' | 'red' | 'orange' | 'yellow' | 'gray';

export class FieldMetadataDefaultOption {
  id?: string;       // UUID — stable identifier for diffing
  position: number;  // display order
  label: string;     // human-readable display text
  value: string;     // machine-readable value stored in records
}

export class FieldMetadataComplexOption extends FieldMetadataDefaultOption {
  color: TagColor;   // badge/tag color
}
```

Example (Opportunity stages):
```json
[
  { "id": "20202020-8e01-...", "value": "NEW", "label": "New", "position": 0, "color": "red" },
  { "id": "20202020-e685-...", "value": "SCREENING", "label": "Screening", "position": 1, "color": "purple" },
  { "id": "20202020-dde9-...", "value": "MEETING", "label": "Meeting", "position": 2, "color": "sky" },
  { "id": "20202020-696e-...", "value": "PROPOSAL", "label": "Proposal", "position": 3, "color": "turquoise" },
  { "id": "20202020-0bb5-...", "value": "CUSTOMER", "label": "Customer", "position": 4, "color": "yellow" }
]
```

### Standard Objects and Defaults

Twenty defines "standard" objects with hardcoded default field metadata. Relevant to Sunder:

| Twenty Object | Sunder Equivalent | Default SELECT Options |
|---------------|-------------------|----------------------|
| Opportunity | Deal | NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER |
| Task | CRM Task | TODO, IN_PROGRESS, DONE |
| Person | Contact | (no type SELECT field by default) |
| Company | (no equivalent) | — |

File: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-opportunity-standard-flat-field-metadata.util.ts`

---

## 2. Key Twenty Files by Feature

### Option Definition & Validation

| File | What It Does |
|------|-------------|
| `packages/twenty-shared/src/types/FieldMetadataOptions.ts` | Option type definitions (`FieldMetadataDefaultOption`, `FieldMetadataComplexOption`, `TagColor`) |
| `packages/twenty-server/src/engine/metadata-modules/field-metadata/utils/validate-options-for-type.util.ts` | Validates options at definition time: must be array, values must be unique, each option validated via class-validator |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/compare-two-flat-field-metadata-enum-options.util.ts` | Diffs old vs new options by stable UUID: detects created/updated/deleted |

### Runtime Schema Generation (Zod)

| File | What It Does |
|------|-------------|
| `packages/twenty-server/src/engine/core-modules/record-crud/zod-schemas/record-properties.zod-schema.ts` | **THE key file.** Builds Zod schemas from field metadata at runtime. SELECT fields use `z.enum(enumValues as [string, ...string[]])`. Nullable fields get `.optional()`. Final shape wrapped in `z.object(shape)`. |

### Database-Level Enforcement

| File | What It Does |
|------|-------------|
| `packages/twenty-server/src/engine/twenty-orm/workspace-schema-manager/services/workspace-schema-enum-manager.service.ts` | PostgreSQL ENUM type CRUD. Handles `CREATE TYPE`, `ALTER TYPE ADD VALUE`, `ALTER TYPE RENAME VALUE`. Migration of existing data via SQL CASE statements. |
| `packages/twenty-server/src/engine/workspace-manager/workspace-migration/workspace-migration-runner/action-handlers/field/services/update-field-action-handler.service.ts` | Orchestrates field updates. Builds `oldToNewEnumOptionMap` by matching options by UUID, calls `alterEnumValues`. |

### Side Effects on Option Changes

| File | What It Does |
|------|-------------|
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/handle-enum-flat-field-metadata-update-side-effects.util.ts` | When SELECT options change: recomputes view filters (delete/update) and kanban groups (create/update/delete) |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/recompute-view-filters-on-flat-field-metadata-options-update.util.ts` | Filters referencing deleted option values are removed |
| `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/recompute-view-groups-on-flat-field-metadata-options-update.util.ts` | Kanban columns for deleted stages are removed; new stages get new columns |

### Frontend Field Rendering

| File | What It Does |
|------|-------------|
| `packages/twenty-front/src/modules/object-record/record-field/ui/components/FieldInput.tsx` | Type-guard dispatching: `isFieldSelect(def) ? <SelectFieldInput /> : ...` |
| `packages/twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/SelectFieldInput.tsx` | Wires hooks + options filtering, delegates to `<SelectInput>` |
| `packages/twenty-front/src/modules/ui/input/components/SelectInput.tsx` | Dropdown renderer: search bar + `MenuItemSelectTag` list + "add option" button |
| `packages/twenty-front/src/modules/ui/field/display/components/SelectDisplay.tsx` | Cell display: renders a colored `<Tag>` |
| `packages/twenty-ui/src/components/tag/Tag.tsx` | The colored pill/badge primitive. Uses `ThemeColor` for background/text CSS variables. |

### Color System

| File | What It Does |
|------|-------------|
| `packages/twenty-ui/src/theme/utils/getNextThemeColor.ts` | Sequential color cycling through `MAIN_COLOR_NAMES` (25 colors). `getNextThemeColor(current)` returns the next color. |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/select/utils/generateNewSelectOption.ts` | Auto-generates a new option: next color, UUID, label ("Option N"), position at end. |

### Admin Settings UI

| File | What It Does |
|------|-------------|
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectForm.tsx` | React Hook Form + Controller, DnD reordering, bulk text edit mode |
| `packages/twenty-front/src/modules/settings/data-model/fields/forms/select/components/SettingsDataModelFieldSelectFormOptionRow.tsx` | Per-option row: drag handle, API value, color picker, label, actions menu |

---

## 3. Pattern Deep Dives

### 3.1 Runtime Zod Schema Generation

This is the pattern we are directly copying.

**Twenty's approach** (from `record-properties.zod-schema.ts`):

```typescript
case FieldMetadataType.SELECT: {
  const enumValues = field.options?.map(
    (option: { value: string }) => option.value
  ) || [];
  if (enumValues.length > 0) {
    fieldSchema = z.enum(enumValues as [string, ...string[]]);
  } else {
    fieldSchema = z.string();
  }
  break;
}
case FieldMetadataType.NUMBER:
case FieldMetadataType.CURRENCY:
  fieldSchema = z.number();
  break;
case FieldMetadataType.DATE:
  fieldSchema = z.string(); // ISO date string
  break;
default:
  fieldSchema = z.string();

// Nullable handling:
if (field.isNullable) {
  fieldSchema = fieldSchema.optional();
}

shape[field.name] = fieldSchema;
// ...
return z.object(shape);
```

**Sunder's `buildCustomFieldsSchema` is a direct translation of this pattern:**

```typescript
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
      fieldSchema = z.string().date();
      break;
    default:
      fieldSchema = z.string();
  }
  const isOptional = mode === "update" || !field.required;
  shape[field.key] = isOptional ? fieldSchema.optional() : fieldSchema;
}
return z.object(shape);
```

**Alignment:** Near-identical. The `z.enum()` cast, the switch, the nullable/optional handling are all the same. Our only addition is the `mode` param for create/update semantics (Twenty handles this differently via separate create/update DTOs).

### 3.2 Option Validation at Definition Time

**Twenty's approach** (from `validate-options-for-type.util.ts`):

```typescript
// 1. Must be an array
if (!Array.isArray(options)) throw ...;

// 2. Values must be unique
const values = options.map(({ value }) => value);
if (new Set(values).size !== options.length) throw ...;

// 3. Each option validated via class-validator (whitelist mode)
const isValid = options.every((option) =>
  validators.some((validator) => {
    const instance = plainToInstance(validator, option);
    return validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }).length === 0;
  }),
);
```

**Sunder's equivalent** (in `configure_crm` tool):

```typescript
// Vocabulary validation via Zod
const vocabArraySchema = z.array(z.string().min(2)).min(1).max(30);

// Deduplication (instead of throwing on duplicates)
function deduplicateArray(arr: string[]): string[];

// Custom field definitions validated via customFieldDefinitionSchema (Zod)
```

**Alignment:** Same principles (uniqueness, type validation) but Sunder uses Zod instead of class-validator because the rest of the stack is Zod. Sunder deduplicates rather than throwing on duplicates — a UX choice for AI-driven configuration (the agent might accidentally repeat a value).

### 3.3 Option Change Diffing

**Twenty's approach** (from `compare-two-flat-field-metadata-enum-options.util.ts`):

```typescript
// Keyed by stable UUID (id), not value or label
const fromOptionsMap = new Map(fromOptions.map(opt => [opt.id, opt]));

for (const newOption of toOptions) {
  const oldOption = fromOptionsMap.get(newOption.id);
  if (!oldOption) {
    differences.created.push(newOption);   // New option
  } else if (oldOption.value !== newOption.value) {
    differences.updated.push({ from: oldOption, to: newOption });  // Renamed
  }
}

// Deleted: in fromOptions but not in toOptions
for (const oldOption of fromOptions) {
  if (!toOptionsMap.has(oldOption.id)) {
    differences.deleted.push(oldOption);
  }
}
```

**Sunder's approach:** Sunder doesn't need UUID-keyed diffing because vocabulary values are simple strings (not objects with separate `value`/`label`/`id`). Instead, `checkInUseValues` does a simpler set-difference:

```typescript
const removedValues = currentValues.filter(v => !newValues.includes(v));
```

**Drift reason:** Twenty's options are objects with stable UUIDs to support renaming (changing `value` while keeping `id`). Sunder's vocabulary is plain `string[]` — a rename is just removing the old value and adding the new one. The UUID-keyed diff is unnecessary complexity for our simpler model.

### 3.4 Data Migration on Option Changes

**Twenty's approach:**

When a SELECT option's `value` changes, Twenty auto-migrates all existing records:

1. Rename existing PostgreSQL ENUM type to `*_old`
2. Create new ENUM type with updated values
3. Migrate data via SQL CASE:

```sql
-- Atomic (SELECT):
UPDATE schema.table
SET new_column =
  CASE old_column::text
    WHEN 'oldValue1' THEN 'newValue1'::schema.new_enum
    WHEN 'oldValue2' THEN 'newValue2'::schema.new_enum
  END
WHERE old_column IS NOT NULL
  AND old_column::text IN ('oldValue1', 'oldValue2');

-- Array (MULTI_SELECT):
UPDATE schema.table
SET new_column = (
  SELECT array_agg(
    CASE unnest_value::text
      WHEN 'oldValue1' THEN 'newValue1'::schema.new_enum
      ELSE unnest_value::text::schema.new_enum
    END
  )
  FROM unnest(old_column) AS unnest_value
)
WHERE old_column IS NOT NULL;
```

4. Drop old column and old ENUM type

**Sunder's approach:** No data migration needed. Sunder stores vocabulary values as plain strings in `TEXT` columns (no PostgreSQL ENUM types). When a vocabulary value is removed, existing records retain the old value — they just won't match any configured option. The `configure_crm` tool warns about in-use values before removal.

**Drift reason:** Twenty uses PostgreSQL ENUM types for database-level enforcement. Sunder uses `TEXT` columns with app-layer validation (Zod schemas in tools). This is a deliberate simplification: PostgreSQL ENUMs are painful to alter (requires DDL), and Sunder's validation at the tool/API layer is sufficient for our use case.

### 3.5 Frontend Color System

**Twenty's approach:**

- 25 theme colors from Radix UI palette (red, ruby, crimson, tomato, orange, amber, yellow, lime, grass, green, jade, mint, turquoise, cyan, sky, blue, iris, violet, purple, plum, pink, bronze, gold, brown, gray)
- Sequential cycling via `getNextThemeColor(currentColor)`: finds current color in array, returns `(index + 1) % length`
- Each color maps to CSS variables for background + text: `themeCssVariables.tag.background[color]`

**Sunder's approach:**

- Smaller palette (mapped in `display.ts` as badge variants)
- Deterministic color from string hash (`hashString(value) % palette.length`) for unknown values
- Fallback variant for values not in the map

**Drift reason:** Twenty's color system is designed for user-assignable colors per option (the admin picks a color). Sunder's is designed for auto-assignment — the agent configures vocabulary, not colors. A deterministic hash gives consistent colors without needing color metadata on each vocabulary value.

### 3.6 View/Filter Side Effects

**Twenty's approach:** When options change, Twenty automatically:
- Deletes view filters that reference removed option values
- Updates view filters that reference renamed option values
- Creates/deletes kanban groups (view groups) for added/removed options
- Handles `isNullable` changes for the "No value" kanban column

**Sunder's approach:** Sunder's kanban (deals page) renders columns from the config dynamically. No separate "view group" entities to manage. If a stage is removed, deals with that stage simply won't appear in any kanban column (they'll be visible in table view). The `configure_crm` in-use warning addresses this UX concern.

**Drift reason:** Twenty has a view management system with persistent filter/group entities. Sunder renders views dynamically from config — no persistent view entities to clean up.

---

## 4. Task-by-Task Mapping

### Task 1: Database Migration

**Twenty reference:**
- `field-metadata.entity.ts` — JSONB `options` column pattern (nullable, default null)
- `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/` — standard object definitions with default values

**What to copy:**
- JSONB column shape for options: `JSONB NOT NULL DEFAULT '[]'::jsonb` (for custom field definitions) and `JSONB` nullable (for vocabulary arrays)
- Nothing to copy directly — our migration is Supabase SQL, theirs is TypeORM entities

**Drift:**
- Twenty uses PostgreSQL ENUM types + metadata tables. Sunder uses `TEXT` columns + JSONB config. This is the foundational drift — documented and intentional.
- Twenty uses per-workspace schemas. Sunder uses RLS on shared tables.

### Task 2: CRM Config Types, Defaults, and Schema

**Twenty reference:**
- `FieldMetadataOptions.ts` — option type definitions
- `compute-opportunity-standard-flat-field-metadata.util.ts` — default stages

**What to copy:**
- **Type shape:** Our `CustomFieldDefinition` is a simplified version of `FieldMetadataComplexOption`. Copy the `key`, `label`, `type` pattern. We drop `id` (UUID), `position`, and `color` — unnecessary for our JSONB-based approach.
- **Default values:** Twenty's Opportunity defaults (NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER) map to our real-estate defaults (leads, negotiation, offer, closing, lost). Our defaults are domain-specific — no need to copy Twenty's.
- **Schema validation:** Copy the Zod schema pattern from `record-properties.zod-schema.ts` for `customFieldDefinitionSchema`.

**Drift:**
- Twenty uses class-validator. Sunder uses Zod (project standard).
- Twenty options have `id`, `position`, `color`. Sunder vocabulary is plain `string[]`. Custom field definitions have `key`, `label`, `type`, `options`, `required`.

### Task 3: loadCrmConfig() — Database Loader

**Twenty reference:**
- Field metadata is loaded via TypeORM repository queries (`.findOne()`, etc.)
- Standard objects are bootstrapped via `compute-*-standard-flat-field-metadata.util.ts` files

**What to copy:**
- **Fallback pattern:** Twenty bootstraps standard objects with defaults on workspace creation. Sunder's `resolveCrmConfig(null)` returns `CRM_DEFAULTS` — same idea, simpler implementation.
- Nothing to copy directly — our loader is a simple Supabase `.select().eq().maybeSingle()`.

**Drift:** None meaningful. Both load config from DB and fall back to defaults.

### Task 4: Dynamic Schema Builder (`buildCustomFieldsSchema`)

**Twenty reference:**
- **`record-properties.zod-schema.ts`** — THE file to reference. This is the exact pattern.

**What to copy — near-verbatim:**
```typescript
// Twenty:
case FieldMetadataType.SELECT: {
  const enumValues = field.options?.map(option => option.value) || [];
  if (enumValues.length > 0) {
    fieldSchema = z.enum(enumValues as [string, ...string[]]);
  } else {
    fieldSchema = z.string();
  }
  break;
}

// Sunder (our implementation):
case "select":
  fieldSchema = field.options?.length
    ? z.enum(field.options as [string, ...string[]])
    : z.string();
  break;
```

The `z.enum(values as [string, ...string[]])` cast is identical. The nullable → `.optional()` mapping is identical. The `z.object(shape)` wrapping is identical.

**Drift:**
- Sunder adds `mode` parameter ("create" vs "update") for required field handling. Twenty handles this via separate DTOs.
- Sunder returns an open record schema when no definitions exist. Twenty always has definitions (standard fields).

### Task 5: Refactor Tool Factories to Accept Config

**Twenty reference:**
- `record-properties.zod-schema.ts` — how enum values are injected into schemas at runtime
- `FieldInput.tsx` — how field definitions are consumed via context

**What to copy:**
- **Dynamic `.describe()` strings:** Twenty doesn't template descriptions, but the pattern of reading options from metadata and injecting them is the same concept.
- **`z.enum(config.xxx as [string, ...string[]])`**: Copy this cast directly. It's the same as Twenty's `z.enum(enumValues as [string, ...string[]])`.

**Drift:**
- Sunder injects config via function parameter (factory closure). Twenty injects via metadata loaded from DB and passed through context/hooks.

### Task 6: configure_crm Tool (Setup Mode Only)

**Twenty reference:**
- `validate-options-for-type.util.ts` — validation at definition time (uniqueness check)
- `compare-two-flat-field-metadata-enum-options.util.ts` — diff detection
- `handle-enum-flat-field-metadata-update-side-effects.util.ts` — side effects on change

**What to copy:**
- **Uniqueness validation:** Copy the `new Set(values).size !== values.length` check. Our `deduplicateArray` is a softer version (auto-fix instead of reject).
- **In-use detection concept:** Twenty checks view filters/groups. Sunder checks entity rows (`checkInUseValues`). Same principle, different targets.

**Drift:**
- Twenty does in a settings UI with full CRUD. Sunder does via AI agent chat in setup mode.
- Twenty throws on duplicates. Sunder deduplicates silently (better for AI-driven config).
- Twenty auto-migrates data on changes. Sunder warns about in-use values and lets the user decide.
- Twenty has no concept of "setup mode" — settings are always available. Sunder isolates config to setup mode.

### Task 6a: Setup Mode Detection

**Twenty reference:** No equivalent. Twenty's settings UI is always accessible. This is Sunder-specific.

### Task 6b: Setup System Prompt

**Twenty reference:** No equivalent. Twenty has no AI agent. This is Sunder-specific.

### Task 7: Wire Config into Context Assembly

**Twenty reference:**
- Field metadata flows through React context (`FieldContext`) to components
- Options loaded via hooks (`useFieldDefinition`, etc.)

**What to copy:**
- **Config-in-context pattern:** Twenty passes field definitions through React context. Sunder passes `CrmVocabConfig` through function parameters into `assembleContext` → `buildPlatformInstructions`. Same architectural pattern, different mechanism.

**Drift:** None conceptual. Implementation differs because Sunder's context is server-side (system prompt), not client-side (React context).

### Task 8: API Route for UI Config

**Twenty reference:**
- Twenty serves field metadata via GraphQL API (metadata workspace resolver)

**What to copy:**
- Nothing directly — our route is a simple Next.js GET endpoint that calls `loadCrmConfig`.

### Task 9: Frontend Display Helpers and UI Updates

**Twenty reference:**
- `SelectDisplay.tsx` — colored `<Tag>` component for cell display
- `Tag.tsx` — the badge/pill primitive with `ThemeColor` → CSS variable mapping
- `getNextThemeColor.ts` — sequential color cycling
- `generateNewSelectOption.ts` — auto-generation with next color

**What to copy:**
- **Badge rendering pattern:** Twenty renders SELECT values as `<Tag color={option.color} text={option.label} />`. Sunder's `<StageBadge>` is the same concept. Copy the fallback pattern (gray for unknown values).
- **Color cycling utility:** Twenty uses sequential `getNextThemeColor`. Sunder uses deterministic hash. Both are valid — document why we diverge.

**Drift:**
- Twenty has user-assignable colors per option (stored in metadata). Sunder auto-assigns colors from stage value hash.
- Twenty uses 25 Radix UI colors. Sunder uses ShadCN badge variants (fewer, simpler).
- Twenty's `Tag` component is CSS-in-JS (Linaria). Sunder uses Tailwind + ShadCN `Badge`.

### Task 10: seed.sql Update

**Twenty reference:** Not applicable. Twenty bootstraps via code, not SQL seeds.

---

## 5. Drift Analysis

### Intentional Drifts (with reasons)

| Area | Twenty Pattern | Sunder Pattern | Reason |
|------|---------------|----------------|--------|
| **Storage model** | PostgreSQL ENUM types + metadata tables | TEXT columns + JSONB config | ENUMs require DDL to alter. Sunder's JSONB+TEXT is simpler, faster to change, compatible with RLS. `[FOUND-01]` |
| **Schema enforcement** | DB-level (ENUM types) + app-level (Zod) | App-level only (Zod in tools + UI) | Single enforcement layer is simpler. RLS prevents direct DB access, so app-layer is sufficient. |
| **Option shape** | Objects: `{id, value, label, color, position}` | Plain strings: `["leads", "negotiation", ...]` | Sunder doesn't need UUID-keyed diffing, user-assigned colors, or drag-and-drop reordering. Plain strings are sufficient for AI-driven config. |
| **Data migration** | SQL CASE auto-migration on value rename | No migration — warn about in-use values | Twenty's migration is needed because ENUM types can't hold invalid values. Sunder's TEXT columns accept any string, so "orphaned" values are harmless. |
| **Color assignment** | User-picks color, stored per option | Deterministic hash from value string | No color picker in Sunder's AI-chat-based config flow. Hash gives consistent, automatic colors. |
| **Config UI** | Full settings page with DnD, color picker, bulk edit | AI agent chat (setup mode) | Sunder's UX is conversational. A traditional settings page could be added later. |
| **Validation library** | class-validator | Zod | Project standard (`FOUND-05`). All validation uses Zod. |
| **Side effects** | Auto-update view filters + kanban groups | Dynamic rendering from config | No persistent view entities in Sunder to clean up. |
| **Duplicate handling** | Throw on duplicate values | Auto-deduplicate | Better UX for AI-driven config where the agent might accidentally repeat a value. |
| **Setup isolation** | Settings always accessible | Setup mode only | No major CRM (Attio, Folk) lets AI touch schema in normal operation. Deliberate safety decision. |

### No-Drift Areas (copied directly)

| Area | Pattern | Notes |
|------|---------|-------|
| **`z.enum()` cast** | `z.enum(values as [string, ...string[]])` | Identical in both codebases. The TypeScript non-empty array assertion is the standard Zod pattern. |
| **Switch-based schema building** | `switch(type) { case "select": ... case "number": ... }` | `buildCustomFieldsSchema` mirrors Twenty's `record-properties.zod-schema.ts` almost line-for-line. |
| **Nullable → optional** | `if (isNullable) fieldSchema = fieldSchema.optional()` | Same pattern. Sunder adds `mode` param but the core logic is identical. |
| **Fallback to `z.string()`** | When SELECT has no options, fall back to `z.string()` | Identical. |
| **Uniqueness check** | `new Set(values).size !== values.length` | Used in `configure_crm` dedup logic. |
| **Config fallback to defaults** | Load from DB, merge with defaults for null fields | Same pattern as Twenty's standard object bootstrapping. |

---

## 6. Code to Copy

### 6.1 Runtime Schema Generation (Task 4)

**Copy from:** `packages/twenty-server/src/engine/core-modules/record-crud/zod-schemas/record-properties.zod-schema.ts`

**Full relevant excerpt:**

```typescript
// Twenty's approach — lines 98-142 of record-properties.zod-schema.ts
const shape: Record<string, ZodTypeAny> = {};

for (const field of fields) {
  let fieldSchema: ZodTypeAny;

  switch (field.type) {
    case FieldMetadataType.TEXT:
    case FieldMetadataType.RICH_TEXT_V2:
      fieldSchema = z.string();
      break;
    case FieldMetadataType.NUMBER:
      fieldSchema = z.number();
      break;
    case FieldMetadataType.SELECT: {
      const enumValues = field.options?.map(
        (option: { value: string }) => option.value,
      ) || [];
      if (enumValues.length > 0) {
        fieldSchema = z.enum(enumValues as [string, ...string[]]);
      } else {
        fieldSchema = z.string();
      }
      break;
    }
    // ... other types ...
    default:
      fieldSchema = z.any();
      break;
  }

  if (field.isNullable) {
    fieldSchema = fieldSchema.optional();
  }

  shape[field.name] = fieldSchema;
}

return z.object(shape);
```

**Our translation** (in `buildCustomFieldsSchema`): near-identical, with `mode` parameter added.

### 6.2 Option Validation (Task 6)

**Copy from:** `packages/twenty-server/src/engine/metadata-modules/field-metadata/utils/validate-options-for-type.util.ts`

**Relevant pattern:**

```typescript
// Uniqueness check
const values = options.map(({ value }) => value);
if (new Set(values).size !== options.length) {
  throw new FieldMetadataException(
    'Options must be unique',
    FieldMetadataExceptionCode.INVALID_FIELD_INPUT,
  );
}
```

**Our translation** (softer — deduplicate instead of throw):

```typescript
function deduplicateArray(arr: string[]): string[] {
  return [...new Set(arr)];
}
```

### 6.3 Option Diffing (Task 6)

**Copy from:** `packages/twenty-server/src/engine/metadata-modules/flat-field-metadata/utils/compare-two-flat-field-metadata-enum-options.util.ts`

**Relevant concept** (simplified for string arrays):

```typescript
// Twenty diffs by UUID:
const fromOptionsMap = new Map(fromOptions.map(opt => [opt.id, opt]));
// Sunder diffs by value (string comparison):
const removedValues = currentValues.filter(v => !newValues.includes(v));
```

### 6.4 Color Utility (Task 9)

**Copy from:** `packages/twenty-ui/src/theme/utils/getNextThemeColor.ts`

```typescript
// Twenty:
export const getNextThemeColor = (currentColor?: ThemeColor): ThemeColor => {
  if (!isDefined(currentColor)) return MAIN_COLOR_NAMES[0];
  const currentColorIndex = MAIN_COLOR_NAMES.findIndex(color => color === currentColor);
  const nextColorIndex = (currentColorIndex + 1) % MAIN_COLOR_NAMES.length;
  return MAIN_COLOR_NAMES[nextColorIndex];
};
```

**Our equivalent** (hash-based for deterministic assignment):

```typescript
// Sunder — deterministic color from string value
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getVariantForStage(stage: string): BadgeVariant {
  return BADGE_VARIANTS[hashString(stage) % BADGE_VARIANTS.length];
}
```

### 6.5 Tag/Badge Rendering (Task 9)

**Copy from:** `packages/twenty-front/src/modules/ui/field/display/components/SelectDisplay.tsx`

```typescript
// Twenty:
export const SelectDisplay = ({ color, label }) => {
  return <Tag color={color} text={label} />;
};
```

**Our equivalent** (ShadCN Badge):

```typescript
// Sunder:
export function StageBadge({ stage, config }: { stage: string; config: CrmVocabConfig }) {
  const variant = getDealStageBadgeVariant(stage, config);
  return <Badge variant={variant}>{toTitleCase(stage)}</Badge>;
}
```

---

## Appendix: Twenty File Quick-Reference Index

For developers navigating the Twenty codebase while building PR 15c:

```
twenty/
├── packages/twenty-shared/src/types/
│   └── FieldMetadataOptions.ts              ← Option types, TagColor
├── packages/twenty-server/src/engine/
│   ├── core-modules/record-crud/zod-schemas/
│   │   └── record-properties.zod-schema.ts  ← *** Runtime Zod from metadata ***
│   ├── metadata-modules/field-metadata/
│   │   ├── field-metadata.entity.ts         ← TypeORM entity (options JSONB)
│   │   └── utils/
│   │       └── validate-options-for-type.util.ts ← Option validation
│   ├── metadata-modules/flat-field-metadata/utils/
│   │   ├── compare-two-flat-field-metadata-enum-options.util.ts ← Diff
│   │   └── handle-enum-flat-field-metadata-update-side-effects.util.ts ← Side effects
│   ├── twenty-orm/workspace-schema-manager/services/
│   │   └── workspace-schema-enum-manager.service.ts ← PG ENUM CRUD + SQL CASE migration
│   └── workspace-manager/
│       ├── twenty-standard-application/utils/field-metadata/
│       │   └── compute-opportunity-standard-flat-field-metadata.util.ts ← Default stages
│       └── workspace-migration/.../update-field-action-handler.service.ts ← Orchestrator
├── packages/twenty-front/src/modules/
│   ├── object-record/record-field/ui/
│   │   └── components/FieldInput.tsx        ← Type-guard dispatcher
│   ├── ui/field/display/components/
│   │   ├── SelectDisplay.tsx                ← Cell display (Tag)
│   │   └── MultiSelectDisplay.tsx           ← Multi-select cell display
│   ├── ui/input/components/
│   │   └── SelectInput.tsx                  ← Dropdown renderer
│   └── settings/data-model/fields/forms/select/
│       ├── components/SettingsDataModelFieldSelectForm.tsx ← Admin config form
│       ├── components/SettingsDataModelFieldSelectFormOptionRow.tsx ← Option row
│       └── utils/generateNewSelectOption.ts ← Auto-generate option
└── packages/twenty-ui/src/
    ├── theme/utils/getNextThemeColor.ts      ← Color cycling
    └── components/tag/Tag.tsx               ← Badge/pill primitive
```
