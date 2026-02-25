---
name: 4-onboard-processors
description: Create ExtendAI processors for each document type (Phase 3). Called by orchestrator.
---

# Create ExtendAI Processors

## Overview

Creates ExtendAI processors via API for each document type that needs extraction. Updates the client config file with processor IDs and adds JSDoc documentation. Fully automated.

**Phase covered:** 3 from Client-Setup-SOP

**Announce at start:** "I'm using the 4-onboard-processors skill to create ExtendAI processors."

---

## Prerequisites

Before running this skill:

- [ ] `EXTEND_API_KEY` is set in `.env.local`
- [ ] Client config file exists at `/src/config/clients/{client-id}.ts`
- [ ] All tags have `extendProcessorId: null` (ready to be filled)

---

## Inputs Required

The orchestrator (or user) must provide:

- **client-id**: kebab-case identifier
- **client-name**: Display name
- **tags**: List of tags that need extraction (exclude "other")

---

## The Process

### Step 1: Verify Prerequisites

1. Check `EXTEND_API_KEY` exists in environment:
   ```bash
   echo $EXTEND_API_KEY
   ```

2. Read config file: `/src/config/clients/{client-id}.ts`

3. Extract tags that need extraction:
   - Filter out "other" (never extract)
   - Get tag IDs and display names

**Verification:** Confirm at least 1 tag needs extraction.

If no tags need extraction, report and exit early (this is valid for some clients).

---

### Step 2: Create Processors via API

For each tag that needs extraction:

**API call:**
```bash
curl -X POST https://api.extend.ai/v1/processors \
  -H "Authorization: Bearer $EXTEND_API_KEY" \
  -H "x-extend-api-version: 2025-04-21" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "{Client Name} - {Tag Display Name}",
    "type": "EXTRACT",
    "config": {
      "schema": {
        "type": "object",
        "properties": {}
      }
    }
  }'
```

**Expected response:**
```json
{
  "success": true,
  "processor": {
    "id": "dp_{processor_id}",
    "name": "{Client Name} - {Tag Name}",
    "type": "EXTRACT",
    "createdAt": "2025-12-29T..."
  }
}
```

**CRITICAL:** Save the `processor.id` value for each tag.

**Error handling:**
- If API call fails, STOP immediately and report error
- If response doesn't have `processor.id`, STOP and report malformed response
- Retry once on network errors, then STOP

---

### Step 3: Update Config with Processor IDs

**File:** `/src/config/clients/{client-id}.ts`

For each tag, update the `extendProcessorId` field:

**Before:**
```typescript
{
  id: "medical_expense",
  displayName: "Medical Expense",
  classificationHint: "...",
  extendProcessorId: null, // TODO: Fill in Phase 3
}
```

**After:**
```typescript
{
  id: "medical_expense",
  displayName: "Medical Expense",
  classificationHint: "...",
  /** @see https://dashboard.extend.ai/processors/dp_abc123xyz */
  extendProcessorId: "dp_abc123xyz",
}
```

**IMPORTANT:**
- Add JSDoc comment with dashboard link
- Use exact processor ID from API response
- Case-sensitive match

---

### Step 4: Add Processor Reference Table to File Header

Update the file-level JSDoc to include processor ID reference table:

**Add to header (after "Document Types" section):**
```typescript
/**
 * @file {Client Name} client configuration
 * ...
 *
 * ## Processor ID Reference
 * | Tag ID          | Processor ID    | ExtendAI Dashboard Link                                  |
 * |-----------------|-----------------|----------------------------------------------------------|
 * | medical_expense | dp_abc123xyz    | https://dashboard.extend.ai/processors/dp_abc123xyz      |
 * | medical_report  | dp_def456uvw    | https://dashboard.extend.ai/processors/dp_def456uvw      |
 * | other           | null            | N/A - no extraction                                      |
 *
 * @see https://docs.extend.ai/product/extraction/quick-start-5-minutes
 */
```

**Format:**
- Use markdown table
- Include all tags (including "other")
- Dashboard links for extractable tags, "N/A" for "other"

---

### Step 5: Verify TypeScript Compiles

Run:
```bash
pnpm test src/config
```

**Expected:** All tests pass, no TypeScript errors.

If errors occur:
- Check processor IDs are strings, not null
- Verify no typos in processor IDs
- Confirm JSDoc formatting is valid

**Do NOT proceed if tests fail.**

---

### Step 6: Verify Processor IDs in IDE

Use LSP hover to verify JSDoc appears:

For each `extendProcessorId` field:
- Hover in IDE should show dashboard link
- Link format: `https://dashboard.extend.ai/processors/dp_{id}`

This confirms IntelliSense is working correctly.

---

### Step 7: Report Output

Display:

```
✅ ExtendAI processors created successfully!

Processors created:
- {Tag Display Name}: dp_{processor_id}
  → https://dashboard.extend.ai/processors/dp_{processor_id}
- {Tag Display Name}: dp_{processor_id}
  → https://dashboard.extend.ai/processors/dp_{processor_id}

(Repeat for each tag)

Files modified:
- /src/config/clients/{client-id}.ts (updated with processor IDs)

Test results: ✅ All tests passing

Next: Manual checkpoint - Build schemas in ExtendAI Dashboard (Phase 4)
```

Include dashboard links so user can easily click through.

---

## Error Handling

### EXTEND_API_KEY not set
**Stop and report:** "EXTEND_API_KEY not found in environment. Add to .env.local and restart."

### API call fails (4xx/5xx)
**Display error response and STOP.** Common issues:
- Invalid API key (401)
- Rate limit exceeded (429)
- Malformed request (400)

### Processor ID not in response
**Stop and report:** "API response missing processor.id. Response: {show JSON}"

### Config file not found
**Stop and report:** "Config file not found. Run setup-client-config first."

### TypeScript compilation fails
**Display error and STOP.** Likely issues:
- Processor ID has typo
- JSDoc syntax error
- Missing import

---

## Processor Naming Convention

Processor names follow this format:
```
{Client Name} - {Tag Display Name}
```

Examples:
- "Hoh Law - Medical Expense"
- "Hoh Law - Medical Report"
- "Acme Corp - Purchase Order"

**Why this format:**
- Easy to identify in ExtendAI Dashboard
- Groups all processors for same client
- Includes tag name for clarity

---

## Remember

- Check EXTEND_API_KEY first
- Create processors one at a time (serial, not parallel)
- Save processor ID from each response
- Update config with IDs AND JSDoc links
- Add reference table to file header
- Run tests before reporting success
- STOP on any API error

---

## Integration

**Called by:** `2-client-onboarding` skill (orchestrator) after client config is created and registered.

**Prerequisites:**
- Phase 1-2 must be complete (config file exists and is registered)
- Client config file at `/src/config/clients/{client-id}.ts` with tags defined
- All extractable tags have `extendProcessorId: null` (ready to be populated)
- `EXTEND_API_KEY` must be set in `.env.local`

**Can only be called at:**
- Phase 3 of onboarding workflow
- After `3-onboard-config` skill has completed successfully
- Before Phase 4 manual checkpoint (schema building in dashboard)

**Workflow position:** Second automated step, between config creation and manual schema building.
