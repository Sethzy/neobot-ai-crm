---
name: 3-onboard-config
description: Create client config file and register in loader (Phases 1-2). Called by orchestrator.
---

# Setup Client Config

## Overview

Creates a new client configuration file with document type definitions (tags) and registers it in the loader. Fully automated based on intake brief.

**Phases covered:** 1-2 from Client-Setup-SOP

**Announce at start:** "I'm using the 3-onboard-config skill to create the config file."

---

## Inputs Required

The orchestrator (or user) must provide:

- **client-id**: kebab-case identifier (e.g., "hoh-law")
- **client-name**: Display name (e.g., "Hoh Law")
- **tags**: Array of document types from intake brief Section 3.2

Each tag must include:
- `id` (snake_case)
- `displayName` (human-readable)
- `classificationHint` (2-3 sentences)

---

## The Process

### Step 1: Read Intake Brief

1. Read `src/clients/{client-id}/intake-brief.md`
2. Extract from Section 3.1:
   - `clientId`
   - `clientName`
3. Extract from Section 3.2:
   - All tag definitions
   - Classification hints
   - Field lists (for JSDoc comments)

**Verification:** Confirm intake brief has all required sections.

If missing, STOP and report error.

---

### Step 2: Create Config File

**File:** `/src/config/clients/{client-id}.ts`

Use the config template below with these requirements:

**File-level JSDoc:**
```typescript
/**
 * @file {Client Name} client configuration
 * @description Document types and extraction config for {Client Name}.
 *
 * {Brief description from intake brief Section 1.1}
 *
 * ## Document Types
 * - {Tag Name}: {Description from intake brief}
 * - {Tag Name}: {Description from intake brief}
 * - Other: Catch-all for unclassifiable documents (no extraction)
 *
 * ## Processor ID Reference
 * (Will be filled in by create-extendai-processors skill)
 *
 * @see /src/config/types.ts for type definitions
 */
```

**Export name:** `{clientId}Config` (camelCase + "Config")

**Tag structure:**
```typescript
{
  id: "{tag_id}",
  displayName: "{Tag Name}",
  classificationHint: "{2-3 sentence hint from intake brief}",
  extendProcessorId: null, // Filled in Phase 3
}
```

**CRITICAL:**
- Add JSDoc comment above each tag documenting what it extracts
- "other" tag MUST be last in array
- "other" tag always has `extendProcessorId: null`
- Use exact classification hints from intake brief

**Example JSDoc for tag:**
```typescript
/**
 * Medical Expense documents - hospital bills and clinic invoices.
 * Extraction captures: amount, date, provider, invoice_number, gst
 */
{
  id: "medical_expense",
  displayName: "Medical Expense",
  classificationHint: "Hospital bills, clinic invoices...",
  extendProcessorId: null,
}
```

---

### Step 3: Register in Loader

**File:** `/src/config/loader.ts`

**Add import at top:**
```typescript
import { {clientId}Config } from "./clients/{client-id}.js";
```

**Add to configs registry:**
```typescript
const configs: Record<string, ClientConfig> = {
  default: defaultConfig,
  "{client-id}": {clientId}Config, // ADD THIS LINE
};
```

**Placement:** Add after existing configs, maintain alphabetical order if possible.

---

### Step 4: Verify TypeScript Compiles

Run:
```bash
pnpm test src/config
```

**Expected:** All tests pass, no TypeScript errors.

If errors occur:
- Check import paths use `.js` extension
- Verify tag IDs are unique
- Confirm "other" is last in array
- Check camelCase export name matches import

**Do NOT proceed if tests fail.** Report error and STOP.

---

### Step 5: Report Output

Display:

```
✅ Client config created successfully!

Files modified:
- /src/config/clients/{client-id}.ts (created)
- /src/config/loader.ts (updated)

Config details:
- Client ID: {client-id}
- Client Name: {Client Name}
- Tags: {count} total ({list tag IDs})
- Export: {clientId}Config

Test results: ✅ All tests passing

Next: Orchestrator will create ExtendAI processors (Phase 3)
```

---

## Error Handling

### Intake brief missing or malformed
**Stop and report:** "Intake brief not found or incomplete. Section 3.2 must define all tags."

### Config file already exists
**Ask user:** "Config file already exists. Overwrite? (yes/no)"
- If yes: Overwrite and warn about losing manual changes
- If no: STOP and report

### TypeScript compilation fails
**Report error details and STOP.** Common issues:
- Missing import `.js` extension
- Duplicate tag IDs
- Invalid camelCase export name
- "other" tag not last

### Tests fail
**Display test output and STOP.** Do not proceed to Phase 3 until tests pass.

---

## Documentation Standards

All code MUST follow these standards:

- **File-level JSDoc** - Describe client and use case
- **Inline JSDoc per tag** - List extracted fields
- **Assume junior developer audience** - Over-explain
- **Optimize for IDE IntelliSense** - Hover should show helpful info

---

## Remember

- Read intake brief for all inputs
- Use exact classification hints from intake brief
- "other" tag is always last
- Run tests before reporting success
- STOP on any error, don't guess

---

## Integration

**Called by:** `2-client-onboarding` skill (orchestrator) after intake brief is validated and client ID is confirmed.

**Prerequisites:**
- Intake brief must exist at `src/clients/{client-id}/intake-brief.md`
- Intake brief Section 3.2 must define all document types (tags)
- `EXTEND_API_KEY` must be set in `.env.local` (for downstream phases)

**Can only be called at:**
- The beginning of the onboarding workflow (Phase 1-2)
- After Step 1 (intake brief validation) is complete
- Before any ExtendAI processors are created

**Workflow position:** First automated step in client onboarding after intake brief generation.
