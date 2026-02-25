# Validation Rules Best Practices

## Overview

Validation rules enforce business logic on extracted data. Each rule has two audiences:

1. **Engineers** - Need technical details to debug and maintain
2. **End Users** - Need business context to understand WHY something failed

**Core principle:** Every validation rule must explain both WHAT is wrong (technical) and WHY it matters (business). The business rationale should be detailed enough that anyone can understand the impact at a glance.

---

## Validation Scope - Iron Rules

Understanding where validation fits in the document processing pipeline:

| Stage | Scope | Examples |
|-------|-------|----------|
| **Splitter** | Page-level duplicate detection | Same invoice scanned twice, duplicate pages |
| **Validation Rules** | Single document, single/multi field | Required fields, sum checks, format validation |
| **DocGen** | Cross-document logic | No duplicate providers, date consistency across docs |

### Rule 1: Validation = Single Document Only

Validation rules receive ONE document's extracted data. They **cannot** access other documents.

```typescript
// validate() only sees THIS document's data
validate: (data) => {
  // data = { total: 100, cash: 80, insurance: 20 }
  // Cannot see other documents in the case
}
```

### Rule 2: Multi-Field Validation is OK

A single rule can check relationships between multiple fields **in the same document**:

```typescript
// Sum check - involves 3 fields
if (data.cash + data.insurance !== data.total) {
  failures.push({
    ruleId: "payment_sum_mismatch",
    ruleName: "Payment breakdown doesn't match total",
    message: "cash + insurance should equal total",
    description: "The payment breakdown components should add up to the total bill amount...",
    field: ["cash_amount", "insurance_amount", "total_amount"], // Array for multi-field!
  });
}
```

### Rule 3: Cross-Document Logic = DocGen Stage

Any validation requiring data from **multiple documents** belongs in DocGen:
- Duplicate invoice detection (same provider, same date, same amount)
- Date consistency (medical report date vs incident date)
- Missing document types for a case
- Aggregation across documents

---

## Lifecycle: Where Validation Rules Are Used

| Phase | File | Purpose |
|-------|------|---------|
| **1. Client Call** | (transcript) | Business requirements captured verbally |
| **2. Intake Brief** | `1-process-transcript/SKILL.md` | Section 3.2 validation table generated |
| **3. Client Setup** | `5-onboard-schemas/SKILL.md` | `validate()` function generated in client config |
| **4. Maintenance** | `maintain-validation/SKILL.md` | Rules added/updated post-onboarding |
| **5. Runtime** | `src/config/validator.ts` | Rules executed on extraction output |
| **6. Case Display** | `validation-rules-section.tsx` | Rules shown in case-level Rules tab |
| **7. Field Display** | `extraction-field.tsx` | Failures shown on individual fields |

---

## The Two Components

Every validation failure needs:

### 1. MESSAGE - Technical description (for debugging)

- What field failed?
- What was the technical check?
- What value was expected vs found?

**Examples:**
- `"total_amount_before_deductions field is missing"`
- `"cash_amount must be >= 0"`
- `"patient_name field is missing"`

### 2. DESCRIPTION - Business rationale (for users)

- Why does this rule exist?
- What business process depends on this?
- What happens if this data is wrong?
- What should the user do about it?

**The description should be detailed enough that a non-technical user immediately understands the business impact.**

**Examples (verbose):**
- `"Insurance companies require the full bill amount (before any deductions) to calculate reimbursement. Without this, the claim cannot be processed and will be returned for correction - causing weeks of delay."`
- `"A negative cash amount indicates a data entry error or OCR misread. Cash represents what the patient paid out-of-pocket - this value should never be negative. Please verify against the original document."`
- `"Patient identity must be confirmed to link this document to the correct legal case. Without a name match, this medical report cannot be used as evidence in the claim."`

---

## Writing for Non-Technical Users

When writing descriptions, follow these principles:

### 1. Explain Consequences, Not Just Requirements

**Bad:** `"Total amount is required for processing"`

**Good:** `"Insurance companies require the full bill amount to calculate how much they will reimburse. Without this, the claim cannot be processed and will be returned for correction - delaying settlement by weeks."`

### 2. Include Timeframes and Impact

**Bad:** `"Date is required"`

**Good:** `"The bill date is needed to track settlement timelines and verify the expense occurred after the incident. Missing dates can delay claim submission while the team contacts the provider for clarification."`

### 3. Use Plain Language, No Jargon

**Bad:** `"OCR confidence threshold not met - manual verification required"`

**Good:** `"The system couldn't read this value clearly from the scanned document. Please check the original and correct if needed."`

### 4. Answer "So What?" For Every Rule

Ask yourself: If this validation fails, what happens next? Who is affected? How long will it take to resolve?

**Bad:** `"Medisave not claimed"`

**Good:** `"No Medisave deduction appears on this bill. If the patient is eligible for Medisave, claiming it could reduce their out-of-pocket expenses significantly. Check if the patient has a CPF Medisave account and whether this treatment qualifies."`

### 5. Provide Actionable Guidance

**Bad:** `"Insurance not claimed - verify coverage"`

**Good:** `"No insurance deduction found. This means either (1) the patient has no insurance, (2) they didn't present their insurance card, or (3) the claim hasn't been processed yet. Check with the patient about their coverage status - unclaimed insurance benefits may affect the final damages calculation."`

---

## Formula for Good Validation Rules

```
message: "[field] [technical requirement]"
description: "[What this field is for]. [What depends on it]. [What happens if wrong/missing]. [What to do about it]."
```

---

## ValidationFailure Interface

```typescript
interface ValidationFailure {
  ruleId: string;              // Unique identifier: "field_ruletype" (e.g., "amount_required")
  ruleName: string;            // Human-readable: "Amount required"
  message: string;             // Technical: what failed (for engineers)
  description: string;         // Business: why it matters (for users)
  field: string | string[];    // Field name(s) for UI highlighting
}
```

**When to use `string` vs `string[]` for `field`:**
- `string` - Single-field rules (required, format, range)
- `string[]` - Multi-field rules (sum checks, field matching)

---

## Examples: Bad vs Good

### Required Field

**BAD:**
```typescript
{
  ruleId: "total_required",
  ruleName: "Total amount required",
  message: "total_amount_before_deductions field is missing",
  field: "total_amount_before_deductions"
  // No description - user doesn't know WHY this matters
}
```

**GOOD:**
```typescript
{
  ruleId: "total_required",
  ruleName: "Total amount required",
  message: "total_amount_before_deductions field is missing",
  description: "Insurance companies require the full bill amount (before any deductions) to calculate reimbursement. Without this, the claim cannot be processed and will be returned for correction - causing weeks of delay.",
  field: "total_amount_before_deductions"
}
```

### Range Validation

**BAD:**
```typescript
{
  ruleId: "amount_positive",
  ruleName: "Amount must be positive",
  message: "amount must be > 0",
  field: "amount"
}
```

**GOOD:**
```typescript
{
  ruleId: "amount_positive",
  ruleName: "Amount must be positive",
  message: "amount must be > 0",
  description: "A negative or zero amount indicates an OCR misread (e.g., '$1,250' read as '$1.25' or '-$125'). This would cause incorrect reimbursement calculations. Please verify the amount against the original document and correct if needed.",
  field: "amount"
}
```

### Conditional/Advisory Rule

**BAD:**
```typescript
{
  ruleId: "medisave_not_claimed",
  ruleName: "Medisave not claimed",
  message: "No Medisave deduction",
  field: "medisave_amount"
}
```

**GOOD:**
```typescript
{
  ruleId: "medisave_not_claimed",
  ruleName: "Medisave not claimed",
  message: "No Medisave deduction found in payment breakdown",
  description: "No Medisave deduction appears on this bill. If the patient is a Singapore citizen or PR with a CPF account, they may be eligible to use Medisave for this medical expense. Claiming Medisave could significantly reduce their out-of-pocket costs. Check with the patient about their eligibility.",
  field: "medisave_amount"
}
```

---

## Rule Categories

### 1. Required Field Rules

For fields that MUST be present.

| Rule Type | ruleId Pattern | Example Message | Example Description |
|-----------|---------------|-----------------|---------------------|
| Required | `{field}_required` | "{field} field is missing" | "[What this field is for]. [Who needs it and why]. [What happens without it]." |

### 2. Range/Value Rules

For fields with valid ranges.

| Rule Type | ruleId Pattern | Example Message | Example Description |
|-----------|---------------|-----------------|---------------------|
| Positive | `{field}_positive` | "{field} must be > 0" | "A [negative/zero] value indicates [error type]. This would cause [consequence]. Please [action]." |
| Non-negative | `{field}_non_negative` | "{field} must be >= 0" | "[Field] can be zero if [condition], but negative values indicate [error]. Please [action]." |
| Range | `{field}_range` | "{field} must be between X and Y" | "[Business context for limits]. Values outside this range typically indicate [error type]." |

### 3. Format Rules

For fields with expected formats.

| Rule Type | ruleId Pattern | Example Message | Example Description |
|-----------|---------------|-----------------|---------------------|
| Format | `{field}_format` | "{field} must match [pattern]" | "[System/process] requires this specific format for [reason]. [How to fix]." |
| Date | `{field}_valid_date` | "{field} is not a valid date" | "A valid date is needed for [purpose]. Invalid dates will [consequence]. Please verify against the original document." |

### 4. Cross-Field Rules

For rules involving multiple fields **within the same document**.

> **IMPORTANT:** Use `field: string[]` when multiple fields are involved. This enables the UI to highlight all related fields.

| Rule Type | ruleId Pattern | Example Message |
|-----------|---------------|-----------------|
| Sum | `{category}_sum_mismatch` | "Payment breakdown doesn't match total" |
| Match | `{field1}_{field2}_match` | "Patient name doesn't match payer" |

**Example - Sum Validation:**

```typescript
{
  ruleId: "payment_sum_mismatch",
  ruleName: "Payment breakdown doesn't match total",
  message: "cash + medisave + insurance should equal total_amount_before_deductions",
  description: "The payment breakdown components should add up to the total bill amount. Discrepancies indicate extraction errors or missing payment methods. Verify against the payment summary section.",
  field: ["cash_amount", "medisave_amount", "insurance_amount", "total_amount_before_deductions"]  // Array!
}
```

**Example - Field Match:**

```typescript
{
  ruleId: "patient_payer_match",
  ruleName: "Patient and payer should match",
  message: "patient_name does not match payer_name",
  description: "For personal injury claims, the patient and payer are usually the same person. Mismatches may indicate a billing error or third-party payment that needs documentation.",
  field: ["patient_name", "payer_name"]  // Array!
}
```

### 5. Advisory Rules (Warnings)

For conditions that need attention but aren't necessarily errors.

| Rule Type | ruleId Pattern | Example Message | Example Description |
|-----------|---------------|-----------------|---------------------|
| Missing optional | `{field}_not_claimed` | "No {field} found" | "This [benefit/deduction] wasn't applied. [Why it might be missing]. [What to check]. [Potential impact if missed]." |
| Flagged value | `{field}_flagged` | "{field} contains [condition]" | "[What this condition means]. [Business implication]. [Who should review]. [What action to take]." |

### 6. Composite Object Rules (Currency, Address, etc.)

For fields with nested properties (like currency amounts with `amount` + `iso_4217_currency_code`), validation rules target the **parent field**. The UI automatically shows the badge on all nested fields via prefix matching.

**Keep it simple:**
```typescript
{
  ruleId: "medisave_required",
  ruleName: "Medisave amount required",
  message: "medisave_amount is missing",
  description: "...",
  field: "medisave_amount"  // Just the parent - children inherit automatically
}
```

**Do NOT list every sub-field:**
```typescript
// ❌ Unnecessary - prefix matching handles this
field: ["medisave_amount.amount", "medisave_amount.iso_4217_currency_code"]
```

**How it works:** When a rule has `field: "medisave_amount"`, the UI shows "Needs review" badge on:
- `medisave_amount` (parent)
- `medisave_amount.amount` (child - matches prefix)
- `medisave_amount.iso_4217_currency_code` (child - matches prefix)

### 7. Currency Field Validation

Currency fields from ExtendAI have the structure `{ amount: number | null, iso_4217_currency_code: string | null }`. When users edit and clear a field via the UI, the value becomes `""` (empty string), not `null`.

**CRITICAL:** Use `typeof amount === "number"` check, NOT null/undefined checks.

**Helper pattern for multiple currency fields:**
```typescript
// Helper to check if currency field has a valid amount (must be a number)
const hasAmount = (field: unknown): boolean => {
  if (!field || typeof field !== "object") return false;
  const currency = field as { amount?: number | null };
  return typeof currency.amount === "number";
};

// Usage
if (!hasAmount(data.medisave_amount)) {
  failures.push({
    ruleId: "medisave_not_claimed",
    ruleName: "Medisave not claimed",
    message: "No Medisave deduction - verify if patient is eligible",
    description: "...",
    field: "medisave_amount",
  });
}
```

**Why `typeof === "number"` is required:**
- ExtendAI returns `null` for missing fields
- UI editing can produce `""` (empty string) when user clears a field
- `!== null && !== undefined` passes for `""` → validation incorrectly passes
- `typeof === "number"` correctly rejects both `null` and `""`

**Single currency field (simpler):**
```typescript
if (typeof data.total_amount?.amount !== "number") {
  failures.push({ ... });
}
```

---

## Domain-Specific Examples

### Medical Expenses (Singapore)

```typescript
// Required field - with full context
{
  ruleId: "provider_required",
  ruleName: "Provider required",
  message: "provider_name field is missing",
  description: "Insurance companies require the healthcare provider name to verify the bill is legitimate and the treatment was provided by an approved facility. Without this, the claim will be rejected. Please check the bill header or letterhead for the provider name.",
  field: "provider_name"
}

// Advisory - missing scheme (detailed guidance)
{
  ruleId: "medishield_not_claimed",
  ruleName: "MediShield not claimed",
  message: "No MediShield Life deduction found",
  description: "No MediShield Life deduction appears on this hospital bill. MediShield Life is mandatory insurance for Singapore citizens and PRs - if the patient is eligible, this should typically show a deduction. Check if: (1) this is an outpatient bill (MediShield only covers hospitalization), (2) the claim is still being processed, or (3) there's an eligibility issue.",
  field: "medishield_amount"
}

// Sanity check - with clear action
{
  ruleId: "total_positive",
  ruleName: "Total must be positive",
  message: "total_amount_before_deductions must be > 0",
  description: "A zero or negative total indicates the system misread the amount from the scanned document. Common OCR errors include reading '$1,250' as '$125' or adding a minus sign. Please compare this value against the original bill and correct if needed.",
  field: "total_amount_before_deductions"
}
```

### Medical Reports

```typescript
// Required field - with legal context
{
  ruleId: "patient_required",
  ruleName: "Patient name required",
  message: "patient_name field is missing",
  description: "Patient identity must be confirmed to link this medical report to the correct legal case. Without a patient name, the document cannot be used as evidence in the claim. Check the report header, patient information section, or demographic block for the patient's full name.",
  field: "patient_name"
}

// Completeness check - with business reasoning
{
  ruleId: "summary_incomplete",
  ruleName: "Summary findings incomplete",
  message: "Medical report has fewer than 3 summary findings",
  description: "Thorough medical documentation strengthens personal injury claims. Reports with minimal findings may not provide sufficient evidence of injury extent. Review the full report to ensure all relevant findings have been captured, or note if this is genuinely a minor injury with limited findings.",
  field: "summary_findings"
}

// Alert for serious condition - with escalation path
{
  ruleId: "serious_finding_flagged",
  ruleName: "Serious finding detected",
  message: "Report contains findings marked as serious",
  description: "This medical report contains findings flagged as serious (e.g., permanent injury, significant disability, or life-altering condition). Serious findings typically increase claim value significantly and may affect settlement strategy. Please escalate this case to the legal team for review before proceeding.",
  field: "anatomical_findings"
}
```

### Income Documents

```typescript
// Required field - with claim impact
{
  ruleId: "gross_salary_required",
  ruleName: "Gross salary required",
  message: "gross_salary field is missing",
  description: "Gross salary is essential for calculating loss of income in personal injury claims. Without proof of pre-injury earnings, the claim for lost wages cannot be substantiated. Check the payslip for 'Gross Pay', 'Total Earnings', or similar fields - this is the amount before CPF and tax deductions.",
  field: "gross_salary"
}

// Sanity check - with common error examples
{
  ruleId: "gross_salary_positive",
  ruleName: "Gross salary must be positive",
  message: "gross_salary must be > 0",
  description: "A negative or zero gross salary indicates a data extraction error. This could be an OCR misread (e.g., reading a minus sign that isn't there) or the system reading from the wrong field. Please verify against the original payslip - gross salary should always be a positive amount.",
  field: "gross_salary"
}
```

---

## Writing Descriptions from Client Requirements

When converting client requirements to validation rules, expand the **Business Reason** column into a full description:

**From intake brief:**
| Field | Rule | Business Reason |
|-------|------|-----------------|
| total_amount | Required | Can't process bill without total |

**Generated code (expanded):**
```typescript
{
  ruleId: "total_amount_required",
  ruleName: "Total amount required",
  message: "total_amount field is missing",
  description: "Insurance companies require the full bill amount (before any deductions) to calculate reimbursement. Without this, the claim cannot be processed and will be returned for correction - causing weeks of delay. Check the payment summary section of the bill for the total.",
  field: "total_amount"
}
```

**From intake brief:**
| Field | Rule | Business Reason |
|-------|------|-----------------|
| total_amount | Must be > 0 | Sanity check for OCR errors |

**Generated code (expanded):**
```typescript
{
  ruleId: "total_amount_positive",
  ruleName: "Total must be positive",
  message: "total_amount must be > 0",
  description: "A zero or negative total indicates the system misread the amount from the scanned document. Common OCR errors include reading '$1,250' as '$125' or adding a minus sign. Please compare this value against the original bill and correct if needed.",
  field: "total_amount"
}
```

---

## Description Length Guidelines

| Rule Importance | Minimum | Recommended |
|-----------------|---------|-------------|
| Critical (required fields, legal) | 80 chars | 120-180 chars |
| Standard (range checks, format) | 60 chars | 100-150 chars |
| Advisory (warnings, flags) | 80 chars | 120-200 chars |

**Rule of thumb:** If your description is under 80 characters, it's probably too vague to be helpful.

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No description | User doesn't know why rule exists | Always include business context |
| Repeating message as description | No new information | Explain business impact, not technical details |
| Too short | User can't understand impact | Expand to explain who, what, why, and what to do |
| Too technical | User can't relate to system internals | Focus on business process/outcome in plain language |
| Too vague | "This field is important" | Be specific: WHO needs this, for WHAT, consequences |
| No action guidance | User doesn't know what to do | Add "verify...", "check...", "escalate...", "compare..." |
| No context | Why does this matter for THIS type of document? | Include domain-specific reasoning |

---

## Template

Use this template for consistent validation rules:

```typescript
{
  ruleId: "{field}_{rule_type}",  // snake_case
  ruleName: "{Field} {rule description}",  // Title Case
  message: "{field} {technical requirement}",  // Technical (short)
  description: "[What this field is]. [Who/what needs it]. [What happens if wrong/missing]. [What to do about it].",  // Business (verbose)
  field: "{field_name}"
}
```

---

## Testing Your Rules

Ask yourself:

1. Does the `message` tell an engineer exactly what technical check failed?
2. Does the `description` tell a business user why this matters in plain language?
3. Would someone unfamiliar with the domain understand the business impact?
4. Is there clear guidance on what action to take if validation fails?
5. Is the description at least 80 characters?

If any answer is "no", improve the rule before proceeding.
