---
name: maintain-schema
description: Update ExtendAI schema in codebase post-onboarding. Use when client requests new fields, schema changes, or after Composer optimization. References schema-procedures.md.
---

# Update Schema from ExtendAI

## Overview

Pulls updated extraction schemas from ExtendAI Dashboard into `src/clients/` folder. All editing happens in the dashboard, then this skill syncs changes to codebase as AI agent reference.

**Key principle:** ExtendAI Dashboard = source of truth for extraction. Codebase = reference for AI agents.

**Announce at start:** "I'm using the maintain-schema skill to pull schema updates from ExtendAI."

---

## Prerequisites

Before running this skill:

- [ ] `EXTEND_API_KEY` is set in `.env.local`
- [ ] Schema file exists at `src/src/clients/{client-id}/schemas/{tag-id}.json`
- [ ] Processor ID configured in client config
- [ ] Client fully onboarded (this is for post-onboarding maintenance)
- [ ] New version published in ExtendAI Dashboard

---

## Inputs Required

User provides via command:

- **client-id**: kebab-case identifier (e.g., `hoh-law`)
- **tag-id**: snake_case tag ID (e.g., `medical_expense`)

Example: `/maintain-schema hoh-law medical_expense`

---

## The Process

### Step 1: MANUAL CHECKPOINT - Edit in Dashboard

**User action (before invoking this skill):**

Display:

```
BEFORE RUNNING THIS SKILL
══════════════════════════

1. Open processor in ExtendAI Dashboard:
   https://dashboard.extend.ai/processors/{processor_id}

2. Edit the schema in the dashboard:
   - Update field descriptions
   - Add/remove fields
   - Modify extraction rules

3. Test in the "Run" tab with sample documents

4. When satisfied, click "Publish" and choose:
   - Minor (x.Y) for description/prompt changes
   - Major (X.0) for structural/breaking changes

5. THEN run this skill to pull changes into codebase
```

**If user hasn't published yet:** Remind them to edit → test → publish in dashboard first.

---

### Step 2: Validate Prerequisites

1. Check `EXTEND_API_KEY` exists in environment
2. Parse client-id and tag-id from command
3. Read client config: `/src/config/clients/{client-id}.ts`
4. Find tag and extract `extendProcessorId`
5. Verify schema file exists: `src/src/clients/{client-id}/schemas/{tag-id}.json`

**If processor ID is null:** STOP with "Tag has no processor ID."

**If schema file doesn't exist:** STOP with "Schema file not found. Run 5-onboard-schemas first."

---

### Step 3: Pull Latest Published Version

#### Step 3a: List Processor Versions

```bash
curl --request GET \
  --url https://api.extend.ai/processors/{processor_id}/versions \
  --header "Authorization: Bearer $EXTEND_API_KEY" \
  --header "x-extend-api-version: 2025-04-21"
```

#### Step 3b: Find Latest Published Version

1. Iterate through `versions` array
2. Skip any version where `version === "draft"`
3. Take the first non-draft version (array is sorted newest-first)
4. Extract the `id` field (e.g., `dpv_xxx`)

**Error handling:**

- If no published versions exist, STOP: "No published versions found. Publish in dashboard first."

#### Step 3c: Fetch Full Config

```bash
curl --request GET \
  --url https://api.extend.ai/processors/{processor_id}/versions/{version_id} \
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
- If schema is empty or malformed, STOP
- If baseProcessor or baseVersion missing, STOP and report

---

### Step 4: 🛑 PRE-FLIGHT CONFIG VALIDATION

**CRITICAL: Validate config before saving to codebase.**

For each processor config pulled from API, verify these settings are correct:

| Field                                           | Required Value       | Why                                        |
| ----------------------------------------------- | -------------------- | ------------------------------------------ |
| `baseProcessor`                                 | `"extraction_light"` | Performance tier - light is cost-effective |
| `baseVersion`                                   | Non-empty string     | Must be set                                |
| `advancedOptions.modelReasoningInsightsEnabled` | `true`               | Enables reasoning for debugging            |
| `advancedOptions.citationsEnabled`              | `true`               | Required for source verification           |
| `advancedOptions.arrayCitationStrategy`         | `"item"`             | Per-item citations for arrays              |
| `advancedOptions.advancedFigureParsingEnabled`  | `true`               | Better figure/table extraction             |

**Optional (warn if missing, don't fail):**

- `extractionRules` - Custom rules, can be empty

**If ANY validation fails:**

Display:

```
🛑 CONFIG VALIDATION FAILED
═══════════════════════════

The following processor has misconfigured settings in ExtendAI Dashboard:

{list all errors}

Please fix these in the ExtendAI Dashboard before continuing:
1. Open processor in dashboard
2. Go to Settings/Advanced Options
3. Fix the incorrect settings
4. Publish a new version
5. Re-run this step

STOP - Do NOT proceed until config passes validation.
```

**If ALL validations pass:**

Display:

```
✅ Config validation passed

Processor: {name}
- baseProcessor: extraction_light ✓
- baseVersion: {version} ✓
- modelReasoningInsightsEnabled: true ✓
- citationsEnabled: true ✓
- arrayCitationStrategy: item ✓
- advancedFigureParsingEnabled: true ✓

Proceeding to update schema file...
```

---

### Step 5: Read Current Schema (for diff analysis)

Read current schema file and capture for comparison:

```bash
cat src/clients/{client-id}/schemas/{tag-id}.json
```

**Extract and store (for Step 8 diff):**

- `old_version` = `.version` (e.g., "1.0")
- `old_required` = `.config.schema.required` (array of field names)
- `old_properties` = `.config.schema.properties` (object with field definitions)

**Store separately:**

- List of old field names: `Object.keys(old_properties)`
- For each field: `{ name, type, description }`

---

### Step 6: Update Schema File

**File:** `src/src/clients/{client-id}/schemas/{tag-id}.json`

**Save entire API response verbatim + update `_meta.pulledAt`:**

```json
{
  "_meta": {
    "pulledAt": "{NEW_ISO_TIMESTAMP}"
  },
  "id": "{version.id}",
  "version": "{version.version}",
  "description": "{version.description}",
  "processorType": "{version.processorType}",
  "processorId": "{version.processorId}",
  "processorName": "{version.processorName}",
  "config": {...},
  "createdAt": "{version.createdAt}",
  "updatedAt": "{version.updatedAt}"
}
```

**Implementation:** `JSON.stringify({ _meta: { pulledAt: new Date().toISOString() }, ...response.version }, null, 2)`

Dashboard versioning is source of truth. We just save everything for AI agent reference.

---

### Step 7: Verify JSON File

```bash
cat src/clients/{client-id}/schemas/{tag-id}.json | jq '._meta, .version'
```

**Expected:** Shows updated `pulledAt` and new version.

---

### Step 8: Analyze Schema Changes

**Compare old schema (from Step 5) with new schema (from Step 3).**

Extract from new schema:

- `new_required` = `version.config.schema.required`
- `new_properties` = `version.config.schema.properties`

**Compute diffs:**

| Change Type           | How to Detect                                             | Validation Impact                    |
| --------------------- | --------------------------------------------------------- | ------------------------------------ |
| Added required field  | Field in `new_required` but not in `old_required`         | ADD new required field check         |
| Removed required field| Field in `old_required` but not in `new_required`         | REMOVE required check (or warn)      |
| New optional field    | Field in `new_properties` but not in `old_properties`     | Consider adding validation           |
| Removed field         | Field in `old_properties` but not in `new_properties`     | REMOVE any validation referencing it |
| Type change           | Same field name, different `type` value                   | Review validation logic              |
| Renamed field         | Field removed + similar new field (compare descriptions)  | UPDATE field references              |

**Display diff summary:**

```
SCHEMA DIFF ANALYSIS
════════════════════

Version: {old_version} → {new_version}

Required Fields:
  + Added: ["new_field_a", "new_field_b"]
  - Removed: ["old_field"]
  = Unchanged: ["existing_field"]

Properties:
  + Added: ["optional_field_x"]
  - Removed: ["deprecated_field"]
  ~ Type changed: ["amount" (string → number)]

```

**If no changes detected:**

```
✅ No schema changes detected (version {old} → {new})
   Skipping validation rule analysis.
```

Skip to Step 11.

---

### Step 9: Propose Validation Changes

> **Required:** Before proposing validation changes, read `references/validation-guide.md` for validation patterns and business rationale guidelines.

**For each detected change, generate specific code proposals.**

**ValidationFailure structure (REQUIRED fields):**
```typescript
{
  ruleId: "field_required",           // Unique identifier, snake_case
  ruleName: "Field required",         // Human-readable for UI
  message: "field field is missing",  // Technical: what failed
  description: "Business rationale explaining why this matters (80-200 chars)",  // Business: for end users
  field: "field"                      // For UI field highlighting
}
```

Read current validation function from client config:

```bash
grep -A 50 "id: \"{tag_id}\"" /src/config/clients/{client-id}.ts
```

**Generate proposals based on change type:**

#### For NEW required fields:

```typescript
// ADD: Required check for "{field_name}"
if (!data.{field_name}) {
  failures.push({
    ruleId: "{field_name}_required",
    ruleName: "{Field Name} required",
    message: "{field_name} field is missing",
    description: "{Business rationale: why this field is needed, what depends on it, what happens without it - 80-200 chars}",
    field: "{field_name}",
  });
}
```

#### For REMOVED required fields:

```typescript
// REMOVE: Check for removed field "{field_name}"
// DELETE these lines from validate():
if (!data.{field_name}) {
  failures.push({
    ruleId: "{field_name}_required",
    ...
  });
}
```

#### For TYPE changes (number fields):

```typescript
// REVIEW: Type changed for "{field_name}" ({old_type} → {new_type})
// Consider adding type-specific validation:
if (typeof data.{field_name} === "number" && data.{field_name} <= 0) {
  failures.push({
    ruleId: "{field_name}_positive",
    ruleName: "{Field Name} must be positive",
    message: "{field_name} must be > 0",
    description: "A negative or zero value indicates an OCR misread or data error. Please verify against the original document.",
    field: "{field_name}",
  });
}
```

#### For RENAMED fields:

```typescript
// UPDATE: Field renamed "{old_name}" → "{new_name}"
// Change all references:
//   data.{old_name} → data.{new_name}
//   ruleId: "{old_name}_..." → ruleId: "{new_name}_..."
```

**Display full proposal:**

```
PROPOSED VALIDATION CHANGES
═══════════════════════════

Tag: {tag_id}
Config file: /src/config/clients/{client-id}.ts

📊 Schema Changes Summary:
  - Added required: ["field_a", "field_b"]
  - Removed required: ["old_field"]
  - Type changes: ["amount" (string → number)]

📝 Proposed Changes to validate() function:

┌─────────────────────────────────────────────────────────────┐
│ 1. ADD check for new required field "field_a"               │
├─────────────────────────────────────────────────────────────┤
│ if (!data.field_a) {                                        │
│   failures.push({                                           │
│     ruleId: "field_a_required",                             │
│     ruleName: "Field A required",                           │
│     message: "field_a field is missing",                    │
│     description: "{Business rationale - 80-200 chars}",     │
│     field: "field_a",                                       │
│   });                                                       │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. REMOVE check for removed field "old_field"               │
├─────────────────────────────────────────────────────────────┤
│ // DELETE these lines from validate():                      │
│ if (!data.old_field) {                                      │
│   failures.push({                                           │
│     ruleId: "old_field_required",                           │
│     ...                                                     │
│   });                                                       │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════

```

---

### Step 10: 🛑 MANUAL CHECKPOINT - Apply Validation Changes

**Present options to user:**

```
VALIDATION UPDATE OPTIONS
═════════════════════════

Type one of the following:

  'apply'  → Apply proposed validation changes to config file
  'skip'   → Skip validation updates (schema already saved)
  'edit'   → I'll manually edit the validation rules

```

**If user types 'apply':**

1. Read client config: `/src/config/clients/{client-id}.ts`
2. Locate the `validate` function for this tag
3. Apply proposed changes:
   - Add new required field checks
   - Remove checks for removed fields
   - Update field references for renames
4. Run tests: `pnpm test src/config`
5. If tests pass → continue to Step 11
6. If tests fail → STOP with error details

**If user types 'skip' or 'edit':**

Continue to Step 11 (validation changes not applied automatically).

---

### Step 11: Report Output

Display:

```
SCHEMA UPDATE COMPLETE
═══════════════════════

Tag: {tag_id}
Processor: {processor_id}

Version update:
- Previous ExtendAI version: {old_version}
- New ExtendAI version: {new_version}
- Pulled at: {pulledAt timestamp}

Schema file updated:
- src/clients/{client-id}/schemas/{tag-id}.json

Validation changes:
- {Applied: X new checks, Y removed checks | Skipped | Manual edit}
- Config file: /src/config/clients/{client-id}.ts

Dashboard link:
https://dashboard.extend.ai/processors/{processor_id}
```

---

## Error Handling

### EXTEND_API_KEY not set

**Stop:** "EXTEND_API_KEY not found. Add to .env.local."

### Schema file not found

**Stop:** "Schema file not found at src/clients/{client-id}/schemas/{tag-id}.json. Run 5-onboard-schemas first."

### Processor ID is null

**Stop:** "Tag '{tag_id}' has no processor ID."

### No published versions

**Stop:** "No published versions found. Edit and publish in ExtendAI Dashboard first."

### Config validation fails

**Stop:** "Config has incorrect settings. Fix in dashboard and republish."

### Tests fail

**Stop:** Display error details.

---

## Validation Rule Patterns

Reference patterns from existing client configs (e.g., `hoh-law.ts`):

**Required field check:**

```typescript
if (!data.field_name) {
  failures.push({
    ruleId: "field_name_required",
    ruleName: "Field Name required",
    message: "field_name field is missing",
    description: "[Why this field is needed]. [What depends on it]. [What happens without it].",
    field: "field_name",
  });
}
```

**Positive number check:**

```typescript
if (typeof data.amount === "number" && data.amount <= 0) {
  failures.push({
    ruleId: "amount_positive",
    ruleName: "Amount must be positive",
    message: "amount must be > 0",
    description: "A negative or zero amount indicates an OCR misread. Please verify against the original document.",
    field: "amount",
  });
}
```

**Non-negative check:**

```typescript
if (typeof data.value === "number" && data.value < 0) {
  failures.push({
    ruleId: "value_non_negative",
    ruleName: "Value must be non-negative",
    message: "value must be >= 0",
    description: "[Field] can be zero if [condition], but negative values indicate data error. Please verify.",
    field: "value",
  });
}
```

**Null-aware required check (for fields that can be 0):**

```typescript
if (data.cash_amount === undefined || data.cash_amount === null) {
  failures.push({
    ruleId: "cash_required",
    ruleName: "Cash amount required",
    message: "cash_amount field is missing",
    description: "Patient out-of-pocket amount needed for claim damages calculation. Can be zero if fully covered by schemes.",
    field: "cash_amount",
  });
}
```

---

## Remember

- All editing happens in ExtendAI Dashboard
- This skill ONLY pulls (no push)
- Always validates config before saving
- Dashboard versioning is source of truth (we just sync to codebase)
- Codebase schemas are reference for AI agents (validation, doc gen)
- **Analyze schema changes and propose validation updates**
- **User must approve before validation changes are applied**
- **All validation rules MUST include `description` field** (80-200 chars, business rationale)
- **See `references/validation-guide.md`** for writing guidelines

**Related Skills:**
- `maintain-validation` - For updating validation rules without schema changes (add/update/remove rules)

---

## Integration

**Not part of onboarding workflow.** This skill is for post-onboarding schema maintenance.

**Prerequisites:**

- Client fully onboarded (Phases 1-8 complete)
- Schemas already pulled and registered (2c complete)

**Use when:**

- Updating field descriptions for better extraction
- Adding/removing fields
- Fixing extraction bugs found in testing
- Adopting Composer optimization results

**When to use related skills instead:**

| Scenario | Use This Skill | Use `maintain-validation` |
|----------|----------------|-------------------------------------|
| Schema changed in dashboard, need to sync | ✅ | |
| Add validation rule for existing field | | ✅ |
| Update validation rule description | | ✅ |
| Both schema + validation changes | ✅ (handles both) | |
| Just backfill missing descriptions | | ✅ |
