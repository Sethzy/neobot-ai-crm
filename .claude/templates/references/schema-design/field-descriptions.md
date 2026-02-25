# Description Best Practices

## Overview

Field descriptions are the PRIMARY mechanism ExtendAI uses to locate and extract data. The model reads your description to understand:

- WHAT to look for
- WHERE to look
- HOW to interpret what it finds

**Core principle:** Write descriptions as if explaining to someone who has never seen this document type.

## Field Naming Conventions

Before writing descriptions, ensure your field names follow these conventions:

| Tip                                | ✓ Good                                                             | ✗ Bad                          |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| Use descriptive, consistent names  | `customer_email`, `provider_email`                                 | `email`                        |
| Avoid abbreviations                | `invoice_number`                                                   | `inv_num`                      |
| Use snake_case or camelCase        | `total_amount`, `totalAmount`                                      | `Total Amount!`                |
| Group related fields with prefixes | `selling_agent_email`, `selling_agent_phone`, `selling_agent_name` | `email`, `phone`, `agent_name` |

## The Four Components

Every good description includes:

### 1. WHAT - Define the field clearly

- What information does this field contain?
- What is its purpose/meaning?

### 2. WHERE - Location in document

- Where does this typically appear? (top, bottom, left, right)
- What section is it in? (header, footer, summary, line items)

### 3. LABELS - Alternate names

- What labels might this field have?
- Include variations: abbreviations, synonyms, different phrasings

### 4. FORMAT - Expected format

- What format is the data in?
- Any variations to expect?

## Formula for Good Descriptions

```
[WHAT it is] + [WHERE it appears] + [LABELS it might have] + [FORMAT variations]
```

## Examples: Bad vs Good

### Invoice Number

**BAD (32 chars):**

```
"The invoice number"
```

**GOOD (287 chars):**

```
"The unique identifier assigned to this invoice or billing document. This is the primary reference number for the transaction and may include numbers, letters, or special characters. Usually prominently displayed at the top of the document near the date. Common labels include 'Invoice #', 'Invoice No.', 'Bill Number', 'Reference Number', 'Document Number', or may appear as a prominent alphanumeric code without explicit label."
```

### Total Amount

**BAD:**

```
"Total amount of the invoice"
```

**GOOD:**

```
"The final amount owed by the customer, including all items, taxes, discounts, and adjustments. This is the complete payment obligation and is typically the most prominent monetary value on the document. Usually appears at the bottom right of the invoice in a summary section. May be labeled as 'Total', 'Amount Due', 'Balance Due', 'Grand Total', 'Total Due', 'Pay This Amount', or similar. Often displayed in larger or bold font."
```

### Date Fields

**BAD:**

```
"Invoice date"
```

**GOOD:**

```
"The date when this invoice was created or issued. This date is crucial for payment terms calculation and record-keeping. Typically found near the top of the document, often near the invoice number. May be labeled as 'Invoice Date', 'Date', 'Issue Date', 'Issued On', 'Dated', or may appear without explicit label near other header information. Format varies by region (MM/DD/YYYY, DD/MM/YYYY, DD-MMM-YYYY, etc.)."
```

### Vendor/Supplier Name

**BAD:**

```
"Vendor name"
```

**GOOD:**

```
"The name of the company, business, or individual issuing this invoice. This is the entity to whom payment should be made. Usually appears prominently at the top of the document, often with a logo. May be in letterhead, header section, or 'From' section. Could be labeled as 'From', 'Seller', 'Vendor', 'Supplier', 'Billed By', or appear as the company name without explicit label."
```

## Complex Extractions: Sequential Instructions

For fields that require multi-step logic, use numbered steps in your description:

**Example:**

```
"Extract the total amount due from this invoice.

Steps:
1) Locate labels like 'Total:', 'Amount Due:', or 'Balance Due:'
2) Extract the complete monetary value including currency symbol
3) Include decimal places exactly as shown (e.g., '$1,250.00')"
```

This pattern helps when:

- Multiple similar values exist (distinguish total from subtotal)
- Calculation or verification is needed
- Specific formatting must be preserved

## Domain-Specific Examples

### Medical/Healthcare

**Patient Name:**

```
"The full name of the patient who received medical services. Found in patient information section, typically near the top of the bill. May be labeled as 'Patient', 'Patient Name', 'Name', 'Member Name', 'Subscriber Name', or appear in a 'Bill To' section."
```

**Diagnosis Code:**

```
"The ICD-10 or ICD-9 diagnosis code(s) associated with the medical services. Format: Letter followed by numbers and possibly decimal (e.g., J06.9, M54.5). May be labeled as 'Diagnosis', 'DX', 'ICD Code', 'Diagnosis Code', or appear in a diagnosis section. Multiple codes may be listed."
```

### Shipping/Logistics

**Bill of Lading Number:**

```
"The unique Bill of Lading (B/L) number identifying this shipment. This is the primary tracking reference for the cargo. Usually prominently displayed at the top of the document. Format varies by carrier but typically includes carrier prefix and numbers (e.g., MAEU123456789, HLCUABC1234567). May be labeled as 'B/L No.', 'Bill of Lading Number', 'BL Number', 'Document Number', or similar."
```

**Port of Loading:**

```
"The port where the cargo was loaded onto the vessel. Found in the shipment details section. May be labeled as 'Port of Loading', 'POL', 'Load Port', 'Loading Port', 'Origin Port', or 'From'. Usually includes city name and sometimes country or port code (e.g., 'Shanghai, China', 'CNSHA')."
```

### Singapore-Specific (Medical Bills)

**Medisave Amount:**

```
"The portion of the bill paid using funds from the patient's Central Provident Fund (CPF) Medisave Account. This is a Singapore government healthcare savings scheme. Usually appears in a payment breakdown or summary section. May be labeled as 'Medisave', 'CPF Medisave', 'Medisave Deduction', 'MS', or 'CPF-MA'. Amount shown in SGD."
```

**Government Subsidy:**

```
"The amount subsidized by the Singapore government based on patient eligibility. Determined by factors like citizenship status, ward class, and means-testing. May be labeled as 'Government Subsidy', 'Govt Subsidy', 'Subsidy', 'MOH Subsidy', or show as a deduction in the payment breakdown. Related schemes include CHAS, Pioneer Generation, Merdeka Generation benefits."
```

## Tips for Specific Field Types

### Date Fields

- ExtendAI automatically converts dates to ISO format (YYYY-MM-DD)
- Describe the date's purpose (invoice date vs due date vs ship date)
- Mention regional format variations (MM/DD/YYYY, DD/MM/YYYY, DD-MMM-YYYY)
- Note where date typically appears relative to other fields

### Currency Fields

- Mention the currency symbol or code expected (USD, SGD, $, S$)
- Note where currency is indicated (symbol prefix, separate column, header)
- Describe what the amount represents (before tax, after tax, partial, total)

### Array/Line Item Fields

- Describe the table structure
- Mention column headers that might be present
- Note any row variations (subtotals, discounts mixed with items)

### Boolean Fields

- Describe what constitutes true vs false
- Mention visual indicators (checkboxes, stamps, text)

### Enum Fields

- The `extend:descriptions` handles this, but main description should explain the concept

## Fallback Logic (Optional but critical)

If a field might not always be explicitly present, add calculation instructions as a fallback.

### Guiding Principle

**"If this field is missing, can it be reliably derived from other fields that ARE likely present?"**

### When to Use

| Scenario | Example |
|----------|---------|
| Calculated from other fields | Due date = invoice date + payment terms |
| Sum of parts | Total = sum of line items |
| Inverse/complement | Net = Gross - Deductions |
| Derived from related field | Age from date of birth |
| Default when implicit | Currency = "SGD" if document is from Singapore provider |
| Inferred from context | Pay period = month of payslip date if not explicitly labeled |

### When NOT to Use

- Field is truly unknown (can't guess patient name)
- Calculation requires external data (exchange rates, lookups)
- High risk of error (complex multi-step logic)

### Example

> "We want invoice due date. Calculate invoice due date using sent date and payment terms if not present."

This tells Extend: extract directly first, but if missing, attempt the calculation.

## Description Length Guidelines

| Field Importance                 | Minimum Length | Recommended   |
| -------------------------------- | -------------- | ------------- |
| Key identifier (invoice #, ID)   | 150 chars      | 200-300 chars |
| Important field (dates, amounts) | 100 chars      | 150-250 chars |
| Standard field                   | 75 chars       | 100-150 chars |

**Rule of thumb:** If your description is under 100 characters, it's probably too short.

## Common Mistakes

| Mistake                         | Problem                               | Fix                                  |
| ------------------------------- | ------------------------------------- | ------------------------------------ |
| Using field name as description | "Invoice number" tells AI nothing new | Explain what it is, where it appears |
| Missing location                | AI doesn't know where to look         | Add "found in/at/near..."            |
| Missing alternate labels        | Misses fields with different labels   | List 3-5 common variations           |
| Being too technical             | AI may misinterpret jargon            | Explain in plain terms               |
| Assuming context                | AI doesn't know document type         | Be explicit about everything         |

## Template

Use this template for consistent descriptions:

```
"[Definition: What this field contains and its purpose]. [Location: Where it typically appears in the document]. [Labels: May be labeled as 'X', 'Y', 'Z', or similar]. [Format: Expected format or variations]."
```

## Testing Your Descriptions

Ask yourself:

1. Could someone unfamiliar with this document find this field using only my description?
2. Have I included at least 3 alternate labels?
3. Have I mentioned where in the document this appears?
4. Is my description at least 75 characters?

If any answer is "no", improve the description before proceeding.
