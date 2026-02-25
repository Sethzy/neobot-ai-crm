# ExtendAI Extraction Schema Design

## Overview

ExtendAI extraction schemas define WHAT data to extract from documents. Poor schemas = poor extraction. Great descriptions = accurate extraction.

**Core principle:** DESCRIPTIONS are the most critical part. The AI uses descriptions to locate and interpret fields. Vague descriptions = extraction failures.

## The Iron Law

```
EVERY FIELD MUST HAVE A DETAILED, SPECIFIC DESCRIPTION
```

If a field has no description or a vague one like "The invoice number", the extraction WILL fail or be inaccurate.

## When to Use

Use for ANY ExtendAI schema work:

- Creating new extraction schemas from scratch
- Modifying existing schemas (add/remove/rename fields)
- Reviewing schemas for quality

## The Three Phases

### Phase 1: Understand Requirements

**BEFORE writing any schema:**

1. **Identify Document Type**
   - What kind of document? (invoice, bill of lading, medical bill, receipt)
   - What variations exist? (different vendors, formats, layouts)
   - What language/region? (affects field names, formats)

2. **List Target Fields**
   - What data needs to be extracted?
   - Which fields are required vs optional?
   - Are there arrays (line items, charges)?
   - Are there nested objects?

3. **Understand Field Locations**
   - Where does each field typically appear?
   - What labels might it have? (alternate names)
   - What format is it in? (date formats, currency symbols)

### Phase 2: Schema Construction

**Build the schema following ExtendAI format:**

1. **Choose Correct Types**
   - See `schema-patterns.md` for type reference
   - Use `extend:type` for currency, date, signature
   - Use nullable types: `["string", "null"]`
   - Use arrays for repeating items (line items)

2. **Write Detailed Descriptions**
   - See `field-descriptions.md` for guidelines
   - Include WHERE field appears
   - Include ALTERNATE LABELS
   - Include FORMAT expected
   - Include CONTEXT about meaning

3. **Structure Correctly**
   ```json
   {
     "type": "object",
     "properties": { ... },
     "required": ["field1", "field2"],
     "additionalProperties": false
   }
   ```

### Phase 3: Validation & Output

**Before delivering schema:**

1. **Validate Structure**
   - Root has `type: "object"`
   - All fields have `description`
   - Currency fields have correct structure
   - Arrays have `items` defined
   - `additionalProperties: false` is set

2. **Check Required Array**
   - Only truly required fields listed
   - Field names match exactly

3. **Output Clean JSON**
   - Valid JSON (no trailing commas)
   - Properly escaped strings
   - Ready for Import Schema dialog

## Schema Structure Reference

### Root Schema

```json
{
  "type": "object",
  "properties": {
    "field_name": { ... }
  },
  "required": ["field_name"],
  "additionalProperties": false
}
```

### Field Types Quick Reference

| Type      | Schema Pattern                                      |
| --------- | --------------------------------------------------- |
| String    | `"type": ["string", "null"]`                        |
| Number    | `"type": ["number", "null"]`                        |
| Integer   | `"type": ["integer", "null"]`                       |
| Boolean   | `"type": ["boolean", "null"]`                       |
| Date      | `"type": ["string", "null"], "extend:type": "date"` |
| Currency  | See `schema-patterns.md` - requires nested object   |
| Signature | See `schema-patterns.md` - requires nested object   |
| Enum      | `"enum": ["VALUE1", "VALUE2", null]`                |
| Array     | `"type": "array", "items": { ... }`                 |

## Red Flags - STOP and Revise

If you catch yourself:

- Writing a description under 50 characters
- Copying field name as description ("invoice_number" → "The invoice number")
- Omitting alternate labels
- Not specifying where field appears in document
- Using `type: "string"` without nullable (`["string", "null"]`)
- Forgetting `additionalProperties: false`
- Missing `description` on any field
- Currency field without `extend:type: "currency"`
- Date field without `extend:type: "date"`
- **Creating arrays with nested objects inside array items** (see below)

**ALL of these mean: STOP. Revise before continuing.**

### Array Field Constraint

**Array items MUST contain only primitive values.** Do NOT nest objects inside array items.

```json
// GOOD - primitives only
"line_items": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "description": { "type": ["string", "null"] },
      "amount": { "type": ["number", "null"] }
    }
  }
}

// BAD - nested object inside array item
"line_items": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "metadata": { "type": "object", "properties": { ... } }
    }
  }
}
```

**Why:** The UI renders arrays as editable tables. Nested objects in cells cannot be edited and display as `[object Object]`.

## Real-World Impact

- Good descriptions: 95%+ extraction accuracy
- Vague descriptions: 60-70% accuracy, many nulls
- Missing descriptions: Extraction fails or returns wrong data

The 2 minutes spent writing a good description saves hours of manual correction.

## Related References

- **`schema-patterns.md`** - Complete type reference with examples
- **`field-descriptions.md`** - How to write effective field descriptions
- **`../schema-procedures.md`** - Pull/push/register schemas from ExtendAI API
- **`../validation-guide.md`** - Writing validation rules for extracted data
