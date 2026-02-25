---
name: 5-onboard-schemas
description: Pull schemas from ExtendAI and write validation functions (Phases 5-6). Called by orchestrator. References schema-procedures.md and validation-guide.md.
---

# Setup Client Schemas

## Overview

Pulls extraction schemas from ExtendAI Dashboard (after user builds them in Phase 4), saves to `clients/` as AI agent reference material, and writes validation functions. Dashboard remains source of truth for runtime.

**Phases covered:** 5-6 from Client-Setup-SOP

**Announce at start:** "I'm using the 5-onboard-schemas skill to pull schemas and write validation."

**References:** Loaded on-demand at relevant steps below.

---

## Prerequisites

Before running this skill:

- [ ] `EXTEND_API_KEY` is set in `.env.local`
- [ ] Client config file exists with processor IDs filled in
- [ ] Schemas built in ExtendAI Dashboard (Phase 4 complete)
- [ ] Intake brief has validation rules in Section 3.2

---

## Inputs Required

The orchestrator (or user) must provide:

- **client-id**: kebab-case identifier
- **processor-ids**: Map of tag_id → processor_id
- **validation-rules**: From intake brief Section 3.2

---

## The Process

### Step 1: Read Config and Intake Brief

1. Read config file: `/src/config/clients/{client-id}.ts`
2. Extract processor IDs for each tag
3. Read intake brief: `src/clients/{client-id}/intake-brief.md`
4. Extract validation rules from Section 3.2

**Verification:** Confirm all extractable tags have non-null processor IDs.

---

### Step 2: Create Schema Directory

```bash
mkdir -p src/clients/{client-id}/schemas
```

**Verification:** Directory created successfully.

---

### Step 3: Fetch Schemas via API

> **Required:** Before calling ExtendAI API, read `references/schema-procedures.md` for API patterns and version handling.

For each tag with extraction (has processor ID):

#### Step 3a: List Processor Versions

**API call:**
```bash
curl --request GET \
  --url https://api.extend.ai/processors/dp_{processor_id}/versions \
  --header "Authorization: Bearer $EXTEND_API_KEY" \
  --header "x-extend-api-version: 2025-04-21"
```

**Expected response:**
```json
{
  "success": true,
  "versions": [
    {
      "object": "document_processor_version",
      "id": "processor_version_5678",
      "processorId": "dp_{processor_id}",
      "version": "1.2",
      "config": { ... },
      "createdAt": "2024-03-01T14:00:00Z"
    },
    {
      "object": "document_processor_version",
      "id": "processor_version_5677",
      "version": "0.1",
      "config": { ... },
      "createdAt": "2024-02-15T10:00:00Z"
    }
  ]
}
```

#### Step 3b: Find Latest Published Version

**Logic:**
1. Iterate through `versions` array
2. Skip any version where `version === "draft"` (unpublished changes)
3. Take the first non-draft version (array is sorted newest-first)
4. Extract the `id` field (e.g., `processor_version_5678`)

**Error handling:**
- If no published versions exist (only draft), STOP: "No published versions found. Publish the processor in ExtendAI Dashboard first."

#### Step 3c: Fetch Full Config

**API call (using version ID from Step 3b):**
```bash
curl --request GET \
  --url https://api.extend.ai/processors/dp_{processor_id}/versions/{version_id} \
  --header "Authorization: Bearer $EXTEND_API_KEY" \
  --header "x-extend-api-version: 2025-04-21"
```

**Expected response:**
```json
{
  "success": true,
  "version": {
    "object": "document_processor_version",
    "id": "dpv_MRJE0L4gJ5j3I6BsVLXWU",
    "version": "1.0",
    "description": "finalised schema\n",
    "processorType": "EXTRACT",
    "processorId": "dp_pKFvcN7cRNNDqPQz0X-V3",
    "processorName": "Hoh Law - Income Document",
    "config": {
      "type": "EXTRACT",
      "baseProcessor": "extraction_light",
      "baseVersion": "3.4.0",
      "schema": {
        "type": "object",
        "required": ["field1", "field2"],
        "properties": {
          "field_name": {
            "type": ["string", "null"],
            "description": "Field description"
          }
        },
        "additionalProperties": false
      },
      "advancedOptions": {
        "modelReasoningInsightsEnabled": true,
        "citationsEnabled": true,
        "arrayCitationStrategy": "item",
        "chunkingOptions": {},
        "advancedFigureParsingEnabled": true
      }
    },
    "createdAt": "2025-12-29T11:03:27.387Z",
    "updatedAt": "2025-12-29T11:03:27.387Z"
  }
}
```

**Extract (ALL are required):**
- `version.config.baseProcessor` - Base processor type (extraction_light or extraction_performance)
- `version.config.baseVersion` - Version string (e.g., "3.4.0")
- `version.config.schema` - The JSON Schema
- `version.config.advancedOptions` - Advanced options object

**Additional fields available:**
- `version.object` - Always "document_processor_version"
- `version.description` - Version description from dashboard
- `version.processorType` - Always "EXTRACT"
- `version.processorName` - Human-readable processor name
- `version.createdAt` / `version.updatedAt` - Timestamps

**Optional:**
- `version.config.extractionRules` - Custom extraction rules (may not be present)

**Error handling:**
- If API fails, STOP and report error
- If schema is empty or malformed, STOP (Phase 4 incomplete)
- If baseProcessor or baseVersion missing, STOP and report

---

### Step 3d: 🛑 PRE-FLIGHT CONFIG VALIDATION

**CRITICAL: Validate config before saving to codebase.**

For each processor config pulled from API, verify these settings are correct:

| Field | Required Value | Why |
|-------|----------------|-----|
| `baseProcessor` | `"extraction_light"` | Performance tier - light is cost-effective |
| `baseVersion` | Non-empty string | Must be set |
| `advancedOptions.modelReasoningInsightsEnabled` | `true` | Enables reasoning for debugging |
| `advancedOptions.citationsEnabled` | `true` | Required for source verification |
| `advancedOptions.arrayCitationStrategy` | `"item"` | Per-item citations for arrays |
| `advancedOptions.advancedFigureParsingEnabled` | `true` | Better figure/table extraction |

**Optional (warn if missing, don't fail):**
- `extractionRules` - Custom rules, can be empty

**If ANY validation fails:**

Display:
```
🛑 CONFIG VALIDATION FAILED
═══════════════════════════

The following processors have misconfigured settings in ExtendAI Dashboard:

{list all errors}

Please fix these in the ExtendAI Dashboard before continuing:
1. Open processor in dashboard
2. Go to Settings/Advanced Options
3. Fix the incorrect settings
4. Publish a new version
5. Re-run this step

STOP - Do NOT proceed until all configs pass validation.
```

**If ALL validations pass:**

Display:
```
✅ Config validation passed for all processors

Processor: {name}
- baseProcessor: extraction_light ✓
- baseVersion: {version} ✓
- modelReasoningInsightsEnabled: true ✓
- citationsEnabled: true ✓
- arrayCitationStrategy: item ✓
- advancedFigureParsingEnabled: true ✓

Proceeding to save schemas...
```

---

### Step 4: Save Schema Files

For each tag, create schema file:

**File:** `src/clients/{client-id}/schemas/{tag-id}.json`

**Template:** Save entire API response verbatim + add `_meta.pulledAt`:

```json
{
  "_meta": {
    "pulledAt": "{ISO_TIMESTAMP}"
  },
  "id": "{version.id}",
  "version": "{version.version}",
  "description": "{version.description}",
  "processorType": "{version.processorType}",
  "processorId": "{version.processorId}",
  "processorName": "{version.processorName}",
  "config": {
    "type": "EXTRACT",
    "baseProcessor": "...",
    "baseVersion": "...",
    "schema": {...},
    "extractionRules": "...",
    "advancedOptions": {...}
  },
  "createdAt": "{version.createdAt}",
  "updatedAt": "{version.updatedAt}"
}
```

**Implementation:** `JSON.stringify({ _meta: { pulledAt: new Date().toISOString() }, ...response.version }, null, 2)`

**Naming conventions:**
- File: `{tag-id}.json` (kebab-case)

**CRITICAL:**
- Save entire API response verbatim
- Add `_meta.pulledAt` for tracking when pulled
- Use today's ISO timestamp

---

### Step 5: Import Schemas + Write Validation Functions

#### Step 5a: Add JSON Imports to Config File

At the top of `/src/config/clients/{client-id}.ts`, add imports for each schema:

**Template:**
```typescript
import type { ClientConfig, ValidationFailure, TagDefinition } from "../types.js";

// Import extraction configs from JSON schemas (pulled from ExtendAI Dashboard)
// ESM requires import attributes for JSON files
import {tag1}Schema from "../../clients/{client-id}/schemas/{tag-1}.json" with { type: "json" };
import {tag2}Schema from "../../clients/{client-id}/schemas/{tag-2}.json" with { type: "json" };
// ... for each extractable tag

/**
 * Helper to cast JSON config to proper extractionConfig type.
 * JSON imports have `type: string` but our interface needs `type: "EXTRACT"` literal.
 */
function asExtractionConfig(config: unknown): TagDefinition["extractionConfig"] {
  return config as TagDefinition["extractionConfig"];
}
```

**Example for hoh-law:**
```typescript
import medicalExpenseSchema from "../../clients/hoh-law/schemas/medical-expense.json" with { type: "json" };
import medicalReportSchema from "../../clients/hoh-law/schemas/medical-report.json" with { type: "json" };
import incomeDocumentSchema from "../../clients/hoh-law/schemas/income-document.json" with { type: "json" };
```

#### Step 5b: Add extractionConfig to Each Tag

For each tag with extraction (has `extendProcessorId`), add `extractionConfig`:

```typescript
{
  id: "{tag_id}",
  displayName: "{Tag Name}",
  classificationHint: "...",
  extendProcessorId: "dp_{processor_id}",
  extractionConfig: asExtractionConfig({tagId}Schema.config),  // ← ADD THIS LINE
  validate: (data) => { ... },
},
```

**IMPORTANT:**
- Only add `extractionConfig` to tags with `extendProcessorId` (not "other")
- The import variable name should be camelCase: `medical_expense` → `medicalExpenseSchema`
- Access `.config` property from the JSON (not the whole object)
- Use `asExtractionConfig()` helper for type casting

#### Step 5c: Write Validation Functions

> **Required:** Before writing validation rules, read `references/validation-guide.md` for validation patterns and business rationale guidelines.

For each tag with extraction:

1. Read validation rules from intake brief Section 3.2 (includes Message and Description columns)
2. Add `validate` function to tag in config file
3. Include `description` field with business rationale (80+ chars)

**File:** `/src/config/clients/{client-id}.ts`

**Add to tag definition:**
```typescript
{
  id: "{tag_id}",
  displayName: "{Tag Name}",
  classificationHint: "...",
  extendProcessorId: "dp_{processor_id}",
  extractionConfig: asExtractionConfig({tagId}Schema.config),
  /**
   * Validates extracted {tag_id} data.
   *
   * Required fields: {list from schema.required}
   * Sanity checks: {list from intake brief}
   *
   * @param data - Extracted fields from ExtendAI
   * @returns Array of validation failures (empty = valid)
   */
  validate: (data) => {
    const failures: ValidationFailure[] = [];

    // === Required field checks ===
    // (Generate from schema.required array)

    // === Sanity checks ===
    // (Generate from intake brief validation rules)

    return failures;
  },
},
```

**Validation rule types (from intake brief):**
1. **Required fields** - Check `!data.field_name`, set `field: "field_name"`
2. **Positive numbers** - Check `data.amount > 0`, set `field: "amount"`
3. **Date constraints** - Check valid date format, set `field: "date_field"`
4. **Cross-field rules** - Check relationships, set `field` to the primary field being validated
5. **Composite fields (currency, address)** - Set `field` to parent only. Children inherit the badge automatically via prefix matching. Example: `field: "medisave_amount"` (NOT `["medisave_amount.amount", "medisave_amount.iso_4217_currency_code"]`)
6. **Currency field checks** - Use `typeof amount === "number"` NOT null checks. See pattern below.

**Currency field validation pattern (REQUIRED for all currency fields):**
```typescript
// Helper to check if currency field has a valid amount
const hasAmount = (field: unknown): boolean => {
  if (!field || typeof field !== "object") return false;
  const currency = field as { amount?: number | null };
  return typeof currency.amount === "number";
};

// Usage - validates against both null (ExtendAI) and "" (user cleared)
if (!hasAmount(data.medisave_amount)) {
  failures.push({ ruleId: "medisave_not_claimed", ... });
}
```

**Why `typeof === "number"`:** ExtendAI returns `null` for missing fields, but UI edits can produce `""` (empty string). Null checks like `!== null` pass for `""`, causing validation to incorrectly pass when user clears a field.

**ValidationFailure structure:**
```typescript
{
  ruleId: "field_name_required",      // Unique identifier, snake_case
  ruleName: "Field Name required",    // Human-readable for UI
  message: "field_name field is missing",  // Technical: what failed
  description: "Insurance claims require this field for reimbursement calculation. Without it, the claim cannot be processed.",  // Business: why it matters (80+ chars)
  field: "field_name"                 // For UI field highlighting
}
```

**REQUIRED fields:**
- `ruleId` - Unique identifier (snake_case)
- `ruleName` - Human-readable name
- `message` - Technical description (what failed)
- `description` - Business rationale (why it matters, 80+ chars) - See best practices for writing guidelines
- `field` - Field name for UI filtering

**IMPORTANT:**
- Group related checks with comments
- `description` must explain business impact, not just repeat `message`
- `description` should be 80-200 chars (see best practices for guidelines)
- Use descriptive ruleId (snake_case)
- "other" tag should NOT have validate function

---

### Step 6: Verify TypeScript Compiles

Run:
```bash
pnpm test src/config
```

**Expected:** All tests pass, validation functions work correctly.

If errors occur:
- Check validation function syntax
- Verify field names match schema

**Do NOT proceed if tests fail.**

---

### Step 7: Verify JSON Files

Confirm JSON files are valid and contain expected fields:

```bash
cat src/clients/{client-id}/schemas/{tag-id}.json | jq '._meta'
```

**Expected:** Shows `pulledAt` timestamp.

---

### Step 8: Report Output

Display:

```
✅ Schemas pulled and validation configured!

Schema files created:
- src/clients/{client-id}/schemas/{tag-id-1}.json
- src/clients/{client-id}/schemas/{tag-id-2}.json
(List all)

Files modified:
- /src/config/clients/{client-id}.ts (validation functions added)

Test results: ✅ All tests passing

Next: Manual checkpoint - Create user in Supabase Dashboard (Phase 7.1)
```

---

## Error Handling

### EXTEND_API_KEY not set
**Stop and report:** "EXTEND_API_KEY not found in environment."

### API call fails
**Display error and STOP.** Common issues:
- Processor not found (404) - Phase 3 incomplete
- Schema not ready (empty properties) - Phase 4 incomplete
- Invalid API key (401)

### Schema malformed
**Stop and report:** "Schema missing required fields. Phase 4 incomplete - build schema in dashboard first."

### Validation rules missing from intake brief
**Stop and report:** "Section 3.2 incomplete. Re-run process-client-transcripts to add validation rules."

### TypeScript compilation fails
**Display error and STOP.** Common issues:
- Validation function syntax error
- Missing field reference in validation

---

## Dashboard-First Architecture Notes

**After this phase:**
- Dashboard schemas are SOURCE OF TRUTH for extraction
- Codebase schemas are REFERENCE for AI agents (validation, doc gen)
- Changes in dashboard are pulled via `/update-schema` skill

**Flow:**
```
Dashboard config → ExtendAI API (uses processorId) → Database
Codebase JSON → AI agent reference (validation rules, documentation)
```

**Maintenance:** Edit in dashboard → publish → run `/update-schema` to sync codebase.

---

## Remember

- Pull schemas AFTER Phase 4 (dashboard building) is complete
- Save entire API response as JSON with `_meta.pulledAt`
- Generate validation from intake brief rules
- "other" tag has no schema or validation
- Run tests before reporting success
- STOP on any error

## Schema Design Constraints

**Array fields MUST contain only primitive values in each object.** Do NOT create arrays with nested objects inside array items.

```json
// ✅ GOOD - array items have primitive values only
"injuries": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "severity": { "type": ["string", "null"] },
      "description": { "type": ["string", "null"] }
    }
  }
}

// ❌ BAD - array items have nested objects
"injuries": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "details": {
        "type": "object",
        "properties": { ... }  // Nested object inside array item
      }
    }
  }
}
```

**Why:** The extraction review UI's `ArrayFieldEditor` renders arrays as editable tables. Nested objects within array items cannot be edited inline and will display as `[object Object]`.

---

## Integration

**Called by:** `2-client-onboarding` skill (orchestrator) after user confirms Phase 4 (schema building) is complete.

**Prerequisites:**
- Phase 4 MANUAL CHECKPOINT must be complete (user typed 'done')
- Schemas built in ExtendAI Dashboard with 80%+ accuracy
- All extractable tags have processor IDs in config file
- Intake brief Section 3.2 has validation rules defined
- `EXTEND_API_KEY` must be set in `.env.local`

**Can only be called at:**
- Phase 5-6 of onboarding workflow
- After Phase 4 manual checkpoint is confirmed complete
- Before Phase 7 (user creation and assignment)

**Workflow position:** Third automated step, after manual schema building and before user setup.
