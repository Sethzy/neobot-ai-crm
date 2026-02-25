---
name: maintain-validation
description: Add or update validation rules for a client's document type post-onboarding. Use when adding new business rules or fixing validation logic. References validation-guide.md.
---

# Update Validation Rules

## Overview

Standalone skill for adding, updating, or removing validation rules on an existing client config.
**NOT part of onboarding workflow** - used for post-onboarding maintenance only.

**Key principle:** Validation rules enforce business logic captured during client onboarding. Each rule has:
- `message` - Technical description (for engineers)
- `description` - Business rationale (for end users)

**Announce at start:** "I'm using the maintain-validation skill to update validation rules."

---

## Validation Scope - Iron Rules

| Stage | Scope | Examples |
|-------|-------|----------|
| **Splitter** | Page-level duplicate detection | Same invoice scanned twice |
| **Validation Rules** | Single document, single/multi field | Required fields, sum checks, format |
| **DocGen** | Cross-document logic | Duplicate providers, date consistency |

**Iron Rules:**
1. **Single document only** - `validate(data)` receives one document's extracted data
2. **Multi-field OK** - Rules can check relationships between fields in same document
3. **Cross-doc = DocGen** - Anything requiring multiple documents belongs in DocGen stage

**When to use `field: string[]`:**
- Sum/total checks (cash + insurance = total)
- Field matching (patient name = payer name)
- Any rule involving relationships between multiple fields

---

## Prerequisites

Before running this skill:

- [ ] Client fully onboarded (config exists at `src/config/clients/{client-id}.ts`)
- [ ] Tag exists with `validate` function (or will be added)
- [ ] Intake brief exists at `src/clients/{client-id}/intake-brief.md` (for business context)

---

## Inputs Required

User provides via command:

- **client-id**: kebab-case identifier (e.g., `hoh-law`)
- **tag-id**: snake_case tag ID (e.g., `medical_expense`)
- **action**: `add` | `update` | `remove` | `list`

Example: `/maintain-validation hoh-law medical_expense add`

---

## The Process

### Step 1: Read Best Practices

> **Required:** Before continuing, read `references/validation-guide.md` for validation patterns and business rationale guidelines.

**Key guidelines:**
- `message` = technical (what failed)
- `description` = business rationale (why it matters, 80-200 chars)
- Descriptions must explain consequences, provide action guidance, use plain language

---

### Step 2: Read Current Config

Read the client config file and extract current validation rules for the tag:

```bash
cat /src/config/clients/{client-id}.ts
```

**Locate the tag's `validate` function:**
- Find `id: "{tag_id}"`
- Extract the `validate: (data) => { ... }` function body
- List all existing rules with their `ruleId`, `ruleName`, `message`, and `description`

**Display current rules:**

```
CURRENT VALIDATION RULES
═══════════════════════

Tag: {tag_id}
Config: src/config/clients/{client-id}.ts

| # | ruleId | ruleName | Has Description? |
|---|--------|----------|------------------|
| 1 | total_required | Total amount required | Yes (142 chars) |
| 2 | date_required | Date required | No |
| 3 | amount_positive | Amount must be positive | Yes (98 chars) |

Total: 3 rules, 1 missing description
```

---

### Step 3: Read Intake Brief (for context)

Read the client's intake brief for business context:

```bash
cat /src/clients/{client-id}/intake-brief.md
```

**Look for Section 3.2** - Validation rules table with Business Reason column.

This provides the source business rationale that should be expanded into full descriptions.

---

### Step 4: Handle Action

#### If action = `list`

Display the rules table from Step 2 and exit.

#### If action = `add`

Proceed to Step 5.

#### If action = `update`

Ask which rule to update:

```
Which rule would you like to update?
Enter the ruleId (e.g., "total_required") or rule number:
```

Then proceed to Step 5.

#### If action = `remove`

Ask which rule to remove:

```
Which rule would you like to remove?
Enter the ruleId (e.g., "total_required") or rule number:
```

Skip to Step 6 with remove confirmation.

---

### Step 5: 🛑 CHECKPOINT - Gather Rule Details

**For `add` action:**

Prompt user for rule details:

```
NEW VALIDATION RULE
═══════════════════

Field name (snake_case, e.g., "patient_id_number"):
>

Rule type:
  1. required - Field must be present
  2. positive - Value must be > 0
  3. non_negative - Value must be >= 0
  4. format - Value must match pattern
  5. advisory - Warning/flag (not blocking)
  6. custom - Other validation logic
>

Message (technical, what failed):
>

Description (business rationale, 80+ chars):
Why does this rule exist? What depends on it? What happens if wrong?
>
```

**Validate the description:**

- Count characters
- If < 80 chars, prompt: "Description is too short ({n} chars). Please expand to at least 80 chars with more business context."
- If < 60 chars, REJECT and explain why verbose descriptions matter

**For `update` action:**

Show current values and prompt for new values:

```
UPDATING RULE: {ruleId}
═══════════════════════

Current values:
  ruleName: "{current_ruleName}"
  message: "{current_message}"
  description: "{current_description or 'MISSING'}"

Enter new values (press Enter to keep current):

ruleName [{current}]:
>

message [{current}]:
>

description [{current or 'REQUIRED'}]:
>
```

---

### Step 6: Generate Code

**For `add` action:**

Generate the `failures.push()` block:

```typescript
// {ruleName}
if ({validation_condition}) {
  failures.push({
    ruleId: "{field}_{rule_type}",
    ruleName: "{Rule Name}",
    message: "{field} {technical requirement}",
    description: "{Business rationale with full context and action guidance}",
    field: "{field}",
  });
}
```

**Show the generated code:**

```
GENERATED VALIDATION RULE
═════════════════════════

Add this inside the validate() function for tag "{tag_id}":

┌─────────────────────────────────────────────────────────────────────────┐
│ // Patient ID required                                                   │
│ if (!data.patient_id_number) {                                          │
│   failures.push({                                                       │
│     ruleId: "patient_id_required",                                      │
│     ruleName: "Patient ID required",                                    │
│     message: "patient_id_number field is missing",                      │
│     description: "Patient identity must be confirmed to link this      │
│       document to the correct legal case. Without NRIC/FIN, the        │
│       document cannot be matched to the claimant's records.",          │
│     field: "patient_id_number",                                         │
│   });                                                                   │
│ }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**For `update` action:**

Show the diff:

```
VALIDATION RULE UPDATE
══════════════════════

File: src/config/clients/{client-id}.ts
Rule: {ruleId}

BEFORE:
┌─────────────────────────────────────────────────────────────────────────┐
│ failures.push({                                                         │
│   ruleId: "total_required",                                            │
│   ruleName: "Total amount required",                                   │
│   message: "total_amount field is missing",                            │
│   field: "total_amount",                                               │
│ });                                                                     │
└─────────────────────────────────────────────────────────────────────────┘

AFTER:
┌─────────────────────────────────────────────────────────────────────────┐
│ failures.push({                                                         │
│   ruleId: "total_required",                                            │
│   ruleName: "Total amount required",                                   │
│   message: "total_amount field is missing",                            │
│   description: "Insurance companies require the full bill amount...",  │
│   field: "total_amount",                                               │
│ });                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**For `remove` action:**

Show the code to delete:

```
VALIDATION RULE REMOVAL
═══════════════════════

The following code will be REMOVED from validate() function:

┌─────────────────────────────────────────────────────────────────────────┐
│ if (!data.old_field) {                                                  │
│   failures.push({                                                       │
│     ruleId: "old_field_required",                                      │
│     ...                                                                │
│   });                                                                   │
│ }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 7: 🛑 CHECKPOINT - Apply Changes

**Present options to user:**

```
APPLY CHANGES?
══════════════

Type one of the following:

  'apply'  → Apply changes to src/config/clients/{client-id}.ts
  'edit'   → I'll manually edit the file
  'cancel' → Cancel this operation

>
```

**If user types 'apply':**

1. Read client config: `src/config/clients/{client-id}.ts`
2. Locate the `validate` function for this tag
3. Apply changes:
   - For `add`: Insert the new `failures.push()` block
   - For `update`: Replace the existing block
   - For `remove`: Delete the block
4. Write the updated file
5. Continue to Step 8

**If user types 'edit':**

Display: "Please edit the file manually. Run tests when done: `npm test -- --testPathPattern={client-id}`"

Skip to Step 9.

**If user types 'cancel':**

Display: "Operation cancelled. No changes made."

Exit skill.

---

### Step 8: Run Tests

```bash
npm test -- --testPathPattern="{client-id}" --watch=false
```

**If tests pass:**

Continue to Step 9.

**If tests fail:**

Display error details and offer to revert:

```
TESTS FAILED
════════════

{test error output}

Would you like to:
  'revert' → Revert changes
  'keep'   → Keep changes and fix manually

>
```

---

### Step 9: Report Output

Display summary:

```
VALIDATION RULES UPDATED
════════════════════════

Tag: {tag_id}
Config: src/config/clients/{client-id}.ts

Action: {add/update/remove}

{For add:}
Added rule:
  ruleId: "{ruleId}"
  ruleName: "{ruleName}"
  description: "{description}" ({n} chars)

{For update:}
Updated rule: {ruleId}
  + Added description ({n} chars)

{For remove:}
Removed rule: {ruleId}

Tests: {PASS/FAIL}

Next steps:
- Review the change in the config file
- Commit: git add src/config/clients/{client-id}.ts && git commit -m "feat({client-id}): {add/update/remove} {ruleName} validation rule"
```

---

## Validation Rule Patterns

Reference patterns from existing client configs:

### Required field check

```typescript
if (!data.field_name) {
  failures.push({
    ruleId: "field_name_required",
    ruleName: "Field Name required",
    message: "field_name field is missing",
    description: "[Why this field is needed]. [What depends on it]. [What happens without it]. [What to check].",
    field: "field_name",
  });
}
```

### Positive number check

```typescript
if (typeof data.amount === "number" && data.amount <= 0) {
  failures.push({
    ruleId: "amount_positive",
    ruleName: "Amount must be positive",
    message: "amount must be > 0",
    description: "[What a negative/zero value indicates]. [Common OCR errors]. [What to verify].",
    field: "amount",
  });
}
```

### Non-negative check

```typescript
if (typeof data.value === "number" && data.value < 0) {
  failures.push({
    ruleId: "value_non_negative",
    ruleName: "Value must be non-negative",
    message: "value must be >= 0",
    description: "[Field] can be zero if [condition], but negative values indicate [error]. [What to check].",
    field: "value",
  });
}
```

### Null-aware required check (for fields that can be 0)

```typescript
if (data.cash_amount === undefined || data.cash_amount === null) {
  failures.push({
    ruleId: "cash_required",
    ruleName: "Cash amount required",
    message: "cash_amount field is missing",
    description: "[Why this field matters even if zero]. [What it represents]. [Impact on claim].",
    field: "cash_amount",
  });
}
```

### Advisory rule (warning, not blocking)

```typescript
if (!hasAmount(data.medisave_amount)) {
  failures.push({
    ruleId: "medisave_not_claimed",
    ruleName: "Medisave not claimed",
    message: "No Medisave deduction found in payment breakdown",
    description: "[What this benefit is]. [Who might be eligible]. [What to check]. [Potential impact if missed].",
    field: "medisave_amount",
  });
}
```

### Flagged value (escalation needed)

```typescript
const hasSerious = findings.some((f) => f["is serious"] === true);
if (hasSerious) {
  failures.push({
    ruleId: "serious_finding_flagged",
    ruleName: "Serious finding detected",
    message: "Report contains findings marked as serious",
    description: "[What this means clinically]. [Impact on claim value]. [Who should review]. [Action to take].",
    field: "findings",
  });
}
```

### Sum/Total check (Multi-Field)

For rules that check relationships between multiple fields. Use `field: string[]` to highlight all involved fields in the UI.

```typescript
// Payment breakdown must equal total
const expectedTotal = (data.cash_amount?.amount ?? 0) +
                      (data.medisave_amount?.amount ?? 0) +
                      (data.insurance_amount?.amount ?? 0);
if (data.total_amount_before_deductions &&
    Math.abs(expectedTotal - data.total_amount_before_deductions) > 0.01) {
  failures.push({
    ruleId: "payment_sum_mismatch",
    ruleName: "Payment breakdown doesn't match total",
    message: "Sum of payment methods doesn't equal total_amount_before_deductions",
    description: "The payment breakdown (cash + medisave + insurance) should equal the total bill amount. Discrepancies indicate extraction errors or missing payment methods.",
    field: ["cash_amount", "medisave_amount", "insurance_amount", "total_amount_before_deductions"],  // Array!
  });
}
```

### Field matching (Multi-Field)

```typescript
// Patient and payer names should match
if (data.patient_name && data.payer_name && data.patient_name !== data.payer_name) {
  failures.push({
    ruleId: "patient_payer_mismatch",
    ruleName: "Patient and payer names don't match",
    message: "patient_name does not equal payer_name",
    description: "For personal injury claims, patient and payer are usually the same. Mismatches may indicate third-party payment requiring documentation.",
    field: ["patient_name", "payer_name"],  // Array!
  });
}
```

---

## Error Handling

### Client config not found

**Stop:** "Client config not found at src/config/clients/{client-id}.ts. Has this client been onboarded?"

### Tag not found

**Stop:** "Tag '{tag_id}' not found in client config. Available tags: {list}"

### No validate function

**Stop:** "Tag '{tag_id}' has no validate function. Add one first or use 5-onboard-schemas skill."

### Description too short

**Warn:** "Description is only {n} chars. Minimum is 80 chars. Please expand with more business context."

### Tests fail after apply

**Offer revert:** Display errors and ask if user wants to revert changes.

---

## Remember

- **Read best practices first** - ensures consistent, verbose descriptions
- **Business rationale is required** - descriptions must be 80+ chars
- **User must approve** - always checkpoint before applying changes
- **Run tests** - verify changes don't break existing functionality
- **This is maintenance only** - for new clients, use 5-onboard-schemas skill
- **Descriptions explain WHY** - not just what failed, but why it matters

---

## Integration

**Not part of onboarding workflow.** This skill is for post-onboarding validation rule maintenance.

**Prerequisites:**

- Client fully onboarded (5-onboard-schemas complete)
- Config file exists with validate functions

**Use when:**

- Adding new validation rules after onboarding
- Adding descriptions to existing rules (backfill)
- Updating rule messages or descriptions
- Removing obsolete rules
- Fixing validation bugs found in production
