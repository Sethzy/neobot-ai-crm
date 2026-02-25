# ExtendAI Schema Patterns

## Overview

Complete reference for all ExtendAI JSON Schema field types. Use these exact patterns - deviation causes extraction failures.

## Basic Types

### String (Nullable)
```json
{
  "field_name": {
    "type": ["string", "null"],
    "description": "Detailed description of what this field contains..."
  }
}
```

### Number (Nullable)
```json
{
  "quantity": {
    "type": ["number", "null"],
    "description": "The quantity of items. Can be whole number or decimal."
  }
}
```

### Integer (Nullable)
```json
{
  "page_count": {
    "type": ["integer", "null"],
    "description": "Total number of pages in the document. Always a whole number."
  }
}
```

> **Number vs Integer - When to Use Which**
>
> | Type | Allows | Use For | Examples |
> |------|--------|---------|----------|
> | `integer` | Whole numbers only | Counts, IDs, page numbers, quantities | `1`, `42`, `-5` |
> | `number` | Decimals allowed | Measurements, percentages, prices* | `3.14`, `36.5`, `0.95` |
>
> *For monetary amounts, prefer `extend:type: "currency"` instead of raw `number`.
>
> **Rule of thumb:** If it can NEVER have a decimal point, use `integer`. Otherwise use `number`.

### Boolean (Nullable)
```json
{
  "is_paid": {
    "type": ["boolean", "null"],
    "description": "Whether the invoice has been paid. True if marked as paid, false otherwise."
  }
}
```

## Extended Types (extend:type)

### Date
**Returns ISO format: `yyyy-mm-dd`**

```json
{
  "invoice_date": {
    "type": ["string", "null"],
    "extend:type": "date",
    "description": "The date the invoice was issued. Often found near the top of the document, labeled as 'Invoice Date', 'Date', 'Issued On', or similar. Format varies (MM/DD/YYYY, DD-MMM-YYYY, etc.) but will be normalized."
  }
}
```

### Currency
**MUST use this exact structure:**

```json
{
  "total_amount": {
    "type": "object",
    "extend:type": "currency",
    "description": "The final total amount due on this invoice, including all taxes and fees. Usually the most prominent monetary value, often at bottom right. May be labeled 'Total', 'Amount Due', 'Balance Due', 'Grand Total'.",
    "properties": {
      "amount": {
        "type": ["number", "null"]
      },
      "iso_4217_currency_code": {
        "type": ["string", "null"]
      }
    },
    "required": ["amount", "iso_4217_currency_code"],
    "additionalProperties": false
  }
}
```

**Output example:**
```json
{
  "total_amount": {
    "amount": 1250.50,
    "iso_4217_currency_code": "USD"
  }
}
```

### Signature
**MUST use this exact structure:**

```json
{
  "authorization_signature": {
    "type": "object",
    "extend:type": "signature",
    "description": "The signature authorizing this document. Usually found at the bottom of the document in a signature block.",
    "properties": {
      "printed_name": {
        "type": ["string", "null"],
        "description": "The printed name of the signer, often below or beside the signature."
      },
      "signature_date": {
        "type": ["string", "null"],
        "extend:type": "date",
        "description": "The date the signature was applied."
      },
      "is_signed": {
        "type": ["boolean", "null"],
        "description": "Whether a signature is present (handwritten, digital, or stamp)."
      },
      "title_or_role": {
        "type": ["string", "null"],
        "description": "The title or role of the signer (e.g., 'Manager', 'Director', 'Authorized Representative')."
      }
    },
    "required": ["printed_name", "signature_date", "is_signed", "title_or_role"],
    "additionalProperties": false
  }
}
```

## Enum Type

### Basic Enum
```json
{
  "payment_status": {
    "enum": ["PAID", "PENDING", "OVERDUE", null],
    "extend:descriptions": [
      "Payment has been received in full",
      "Payment is expected but not yet received",
      "Payment is past the due date",
      ""
    ],
    "description": "The current payment status of this invoice."
  }
}
```

**Note:** `extend:descriptions` provides hints for each enum value. Must match order of `enum` array.

### Enum for Document Classification
```json
{
  "document_type": {
    "enum": ["INVOICE", "RECEIPT", "QUOTE", "CREDIT_NOTE", null],
    "extend:descriptions": [
      "A request for payment for goods or services",
      "Proof of payment received",
      "An estimate or price quotation",
      "A document reducing the amount owed",
      ""
    ],
    "description": "The type of financial document."
  }
}
```

## Complex Types

### Array of Objects (Line Items)
```json
{
  "line_items": {
    "type": "array",
    "description": "Individual products, services, or charges listed on this invoice. Each row in the itemized section represents one line item. May be presented as a table or list.",
    "items": {
      "type": "object",
      "properties": {
        "description": {
          "type": ["string", "null"],
          "description": "Description of the product or service. Usually the first or largest column in the line items table."
        },
        "quantity": {
          "type": ["number", "null"],
          "description": "Number of units, hours, or items. May be labeled 'Qty', 'Quantity', 'Units', 'Hours'."
        },
        "unit_price": {
          "type": ["number", "null"],
          "description": "Price per single unit before multiplication by quantity. May be labeled 'Unit Price', 'Rate', 'Price Each'."
        },
        "amount": {
          "type": ["number", "null"],
          "description": "Total for this line item (typically quantity × unit price). May be labeled 'Amount', 'Total', 'Line Total', 'Extended Price'."
        }
      },
      "required": ["description", "quantity", "unit_price", "amount"],
      "additionalProperties": false
    }
  }
}
```

### Array of Objects with Currency
```json
{
  "charges": {
    "type": "array",
    "description": "Individual charges or fees on this bill.",
    "items": {
      "type": "object",
      "properties": {
        "charge_type": {
          "type": ["string", "null"],
          "description": "The type or category of charge."
        },
        "amount": {
          "type": "object",
          "extend:type": "currency",
          "description": "The monetary amount for this charge.",
          "properties": {
            "amount": { "type": ["number", "null"] },
            "iso_4217_currency_code": { "type": ["string", "null"] }
          },
          "required": ["amount", "iso_4217_currency_code"],
          "additionalProperties": false
        }
      },
      "required": ["charge_type", "amount"],
      "additionalProperties": false
    }
  }
}
```

### Nested Object (Address)
```json
{
  "billing_address": {
    "type": "object",
    "description": "The address where the invoice should be sent or where the customer is located. Usually in a 'Bill To' section.",
    "properties": {
      "company_name": {
        "type": ["string", "null"],
        "description": "Company or organization name."
      },
      "street_address": {
        "type": ["string", "null"],
        "description": "Street address including unit/suite number."
      },
      "city": {
        "type": ["string", "null"],
        "description": "City name."
      },
      "state_province": {
        "type": ["string", "null"],
        "description": "State, province, or region."
      },
      "postal_code": {
        "type": ["string", "null"],
        "description": "ZIP code, postal code, or postcode."
      },
      "country": {
        "type": ["string", "null"],
        "description": "Country name or code."
      }
    },
    "required": ["street_address", "city", "country"],
    "additionalProperties": false
  }
}
```

## Array of Simple Types (Primitives)

> **When to Use Primitive Arrays**
>
> | Type | Use When | Example Use Case |
> |------|----------|------------------|
> | `array<string>` | List of text values | Container numbers, findings, names |
> | `array<number>` | List of decimal measurements | Temperatures, dimensions, percentages |
> | `array<integer>` | List of whole number counts | Page numbers, quantities, scores |
> | `array<boolean>` | **Almost never** - see warning below | — |

### Array of Strings
```json
{
  "container_numbers": {
    "type": "array",
    "items": { "type": "string" },
    "description": "List of shipping container numbers. Format: 4 letters + 7 digits (e.g., MAEU1234567)."
  }
}
```

### Array of Numbers
```json
{
  "temperature_readings": {
    "type": "array",
    "items": { "type": "number" },
    "description": "Body temperature readings in Celsius from multiple measurements."
  }
}
```

### Array of Integers
```json
{
  "page_references": {
    "type": "array",
    "items": { "type": "integer" },
    "description": "Page numbers referenced in the document."
  }
}
```

### Array of Booleans

> **⚠️ Avoid `array<boolean>` - Use Boolean Inside Objects Instead**
>
> A list of `[true, false, true]` is meaningless without context. You won't know what each value refers to.
>
> **Bad - no context:**
> ```json
> "is_abnormal": [true, false, true]  // Which findings? No idea.
> ```
>
> **Good - boolean as property inside array<object>:**
> ```json
> "findings": [
>   { "region": "Bones", "is_abnormal": true },
>   { "region": "Menisci", "is_abnormal": false }
> ]
> ```
>
> If you need multiple true/false values, use `array<object>` with a boolean property, or use individual named boolean fields.

## Optional Properties

### extend:name (Display Name Override)
```json
{
  "inv_num": {
    "type": ["string", "null"],
    "extend:name": "Invoice Number",
    "description": "The unique invoice identifier..."
  }
}
```

## Complete Root Schema Example

```json
{
  "type": "object",
  "properties": {
    "invoice_number": {
      "type": ["string", "null"],
      "description": "..."
    },
    "invoice_date": {
      "type": ["string", "null"],
      "extend:type": "date",
      "description": "..."
    },
    "total_amount": {
      "type": "object",
      "extend:type": "currency",
      "description": "...",
      "properties": {
        "amount": { "type": ["number", "null"] },
        "iso_4217_currency_code": { "type": ["string", "null"] }
      },
      "required": ["amount", "iso_4217_currency_code"],
      "additionalProperties": false
    }
  },
  "required": ["invoice_number", "total_amount"],
  "additionalProperties": false
}
```

## Common Mistakes

| Mistake | Correct |
|---------|---------|
| `"type": "string"` | `"type": ["string", "null"]` |
| Currency as `"type": "number"` | Currency as object with `extend:type` |
| Date as `"type": "string"` | Date with `"extend:type": "date"` |
| Missing `additionalProperties: false` | Always include on objects |
| Missing `description` | EVERY field needs description |
| `required` with wrong field names | Field names must match exactly |
