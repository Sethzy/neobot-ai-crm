# Schema Procedures

## Overview

This document covers the procedures for pulling ExtendAI schemas from the dashboard API into the codebase. The ExtendAI Dashboard is the source of truth for extraction schemas; the codebase stores them as reference material for AI agents.

**Architecture:**
```
Dashboard config → ExtendAI API (uses processorId) → Database
Codebase JSON → AI agent reference (validation rules, documentation)
```

---

## Prerequisites

Before running schema procedures:

- [ ] `EXTEND_API_KEY` is set in `.env.local`
- [ ] Processor ID configured in client config file
- [ ] Schema published in ExtendAI Dashboard (not draft)

---

## Pull Schema from ExtendAI API

### Step 1: List Processor Versions

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
    }
  ]
}
```

### Step 2: Find Latest Published Version

**Logic:**
1. Iterate through `versions` array
2. Skip any version where `version === "draft"` (unpublished changes)
3. Take the first non-draft version (array is sorted newest-first)
4. Extract the `id` field (e.g., `processor_version_5678`)

**Error handling:**
- If no published versions exist (only draft), STOP: "No published versions found. Publish the processor in ExtendAI Dashboard first."

### Step 3: Fetch Full Config

**API call (using version ID from Step 2):**
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
        "properties": { ... },
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

**Optional:**
- `version.config.extractionRules` - Custom extraction rules (may not be present)

---

## Config Validation (Pre-Flight Check)

**CRITICAL: Validate config before saving to codebase.**

| Field | Required Value | Why |
|-------|----------------|-----|
| `baseProcessor` | `"extraction_light"` | Performance tier - light is cost-effective |
| `baseVersion` | Non-empty string | Must be set |
| `advancedOptions.modelReasoningInsightsEnabled` | `true` | Enables reasoning for debugging |
| `advancedOptions.citationsEnabled` | `true` | Required for source verification |
| `advancedOptions.arrayCitationStrategy` | `"item"` | Per-item citations for arrays |
| `advancedOptions.advancedFigureParsingEnabled` | `true` | Better figure/table extraction |

**If ANY validation fails:**
```
🛑 CONFIG VALIDATION FAILED

Please fix these in the ExtendAI Dashboard before continuing:
1. Open processor in dashboard
2. Go to Settings/Advanced Options
3. Fix the incorrect settings
4. Publish a new version
5. Re-run this step

STOP - Do NOT proceed until all configs pass validation.
```

---

## Save Schema File

**File location:** `src/clients/{client-id}/schemas/{tag-id}.json`

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
  "config": { ... },
  "createdAt": "{version.createdAt}",
  "updatedAt": "{version.updatedAt}"
}
```

**Implementation:**
```typescript
JSON.stringify({ _meta: { pulledAt: new Date().toISOString() }, ...response.version }, null, 2)
```

---

## Register Schema in Client Config

### Add JSON Imports

At the top of `/src/config/clients/{client-id}.ts`:

```typescript
import type { ClientConfig, ValidationFailure, TagDefinition } from "../types.js";

// Import extraction configs from JSON schemas (pulled from ExtendAI Dashboard)
import medicalExpenseSchema from "../../clients/{client-id}/schemas/medical-expense.json" with { type: "json" };
import medicalReportSchema from "../../clients/{client-id}/schemas/medical-report.json" with { type: "json" };

/**
 * Helper to cast JSON config to proper extractionConfig type.
 */
function asExtractionConfig(config: unknown): TagDefinition["extractionConfig"] {
  return config as TagDefinition["extractionConfig"];
}
```

### Add extractionConfig to Tag

```typescript
{
  id: "{tag_id}",
  displayName: "{Tag Name}",
  classificationHint: "...",
  extendProcessorId: "dp_{processor_id}",
  extractionConfig: asExtractionConfig({tagId}Schema.config),  // ADD THIS
  validate: (data) => { ... },
},
```

**IMPORTANT:**
- Only add `extractionConfig` to tags with `extendProcessorId` (not "other")
- Import variable name should be camelCase: `medical_expense` → `medicalExpenseSchema`
- Access `.config` property from the JSON (not the whole object)
- Use `asExtractionConfig()` helper for type casting

---

## Verify Schema File

```bash
cat src/clients/{client-id}/schemas/{tag-id}.json | jq '._meta'
```

**Expected:** Shows `pulledAt` timestamp.

---

## Error Handling

| Error | Action |
|-------|--------|
| EXTEND_API_KEY not set | STOP: "EXTEND_API_KEY not found in environment." |
| Processor not found (404) | STOP: Processors not created yet |
| Schema not ready (empty properties) | STOP: Schema not built in dashboard |
| Invalid API key (401) | STOP: Check API key |
| No published versions | STOP: "Publish the processor in dashboard first." |

---

## Maintenance Workflow

After initial setup, schema updates follow this flow:

1. **Edit in Dashboard** - Open processor, modify schema/descriptions
2. **Test in Dashboard** - Use "Run" tab with sample documents
3. **Publish Version** - Click "Publish" (minor for descriptions, major for structure)
4. **Pull to Codebase** - Run `/maintain-schema` skill
5. **Update Validation** - If schema structure changed, update validation rules

**Dashboard link:** `https://dashboard.extend.ai/processors/{processor_id}`
