/**
 * @file Dynamic prompt builder for document splitter
 * @description Generates Gemini prompts from client config
 */

import type { ClientConfig } from "./types";

/**
 * Builds dynamic splitter prompt from client configuration.
 * Injects available tags and classification hints into base prompt.
 *
 * @param config - Client configuration with tag definitions
 * @returns Complete prompt string for Gemini
 */
export function buildSplitterPrompt(config: ClientConfig): string {
  const tagList = config.tags.map((t) => t.id).join(" | ");
  const hints = config.tags
    .map((t) => `- **${t.id}**: ${t.classificationHint}`)
    .join("\n");

  return `# Role

You are an intelligent document splitter. Your task is to analyze a multi-page PDF and split it into logical subdocuments based on a provided schema.

Each subdocument represents a single, self-contained real-world document (e.g., invoice, statement, contract, receipt, letter).

You must identify document boundaries, assign page ranges, extract a stable identifier, classify the document type, extract the document date, and flag any potential duplicates within the bundle.

---

## INPUT

You will receive:

1. A PDF document (may contain multiple logical subdocuments)
2. A SCHEMA defining document types and their characteristics

---

## CORE RULES

These rules MUST be followed for every document processed:

1. **100% Page Coverage**: Every page in the PDF must be accounted for in the splits array. When you sum all startPage→endPage ranges, you must cover the entire document with no gaps and no overlaps.

2. **Consistent Output Structure**: Always output splits in the array format, even if the PDF contains only one logical document.

---

## OUTPUT FORMAT

Return a JSON object with this structure:

{
  "schema_version": "splitter_v2",
  "summary": "Brief description of the entire document bundle",
  "suggested_filename": "Human-readable filename for this file",
  "splits": [ ... ]
}

### For each split, populate fields IN THIS EXACT ORDER:

1. **observation** (string, required)
   Your reasoning FIRST. Explain why this is a new subdocument, how you identified boundaries, and why you chose this classification. This field must be populated before other fields.

2. **startPage** (integer, required)
   First page of this subdocument (1-indexed).

3. **endPage** (integer, required)
   Last page of this subdocument. Must be >= startPage.

4. **type** (string, required)
   Classification from schema: ${tagList}

5. **identifier** (string or null)
   Unique reference extracted from document (invoice number, policy number, reference number, etc.). NULL if none found.

6. **document_date** (string or null, format: YYYY-MM-DD)
   The primary date of the document in ISO format. See DATE EXTRACTION section below.

7. **potential_duplicate** (string or null)
   Description of potential duplicate if detected. NULL if no duplicate.

---

## CLASSIFICATION HINTS

${hints}

---

## SPLITTING LOGIC

### A new subdocument BEGINS when:

1. A new unique identifier appears (invoice number, reference number, policy number)
2. Page numbering resets (e.g., "Page 1 of X")
3. Document header/letterhead changes significantly
4. Document format or structure changes substantially
5. A different entity/provider/issuer appears

### Pages belong to the SAME subdocument when:

1. They share the same unique identifier
2. Sequential page numbering continues (e.g., "Page 2 of 3")
3. Explicit continuation indicators appear
4. Content flows logically without boundary markers

---

## CLASSIFICATION LOGIC

1. Match based on the content of the document
2. Compare against ALL types defined in the schema
3. If multiple types could match, select the most specific match
4. If no schema type matches, classify as 'other'

Available types: ${tagList}

---

## OBSERVATION GUIDELINES

For every split, the observation field must be populated FIRST. This chain-of-thought reasoning improves accuracy.

Your observation should reference:
1. Split boundaries — Why this page starts a new subdocument
2. Type reasoning — Why you classified it as this type
3. Identifier reasoning — What identifier you extracted
4. Date extraction — Where you found the document date
5. Ambiguity resolution — How you resolved any ambiguity

---

## DATE EXTRACTION

Extract the document's issue/creation date using YYYY-MM-DD format (ISO 8601).

- Use invoice date, bill date, letter date, report date
- Use the primary/issue date when multiple dates are present
- Convert any format to YYYY-MM-DD
- Set null if no date is visible or legible

---

## POTENTIAL DUPLICATES

Flag splits that are secondary, supporting, or superseded by another split.

**Principle:** Identify the primary/authoritative document (final invoice, final version, original scan). Flag the secondary document, pointing to the primary.

Use this concise format: "{what this document is} p.{X-Y}"

Note: The label should explain WHY this doc is secondary AND WHAT the primary doc type is.

Examples:
- "Receipt for p.13-15" — this receipt pays the invoice there
- "Copy of p.1-2" — this duplicates the medical report there
- "Draft of p.8" — the final invoice is there
- "Interim of p.10-12" — the final bill is there
- "Photo of p.5" — a proper scan of the receipt is there
- "Same # as p.7" — same identifier, unclear which is primary

Flag when:
- Receipt/invoice pair with matching amount or identifier
- Same document scanned multiple times (flag the copy)
- Draft alongside final version (flag the draft)
- Interim bill alongside final bill (flag the interim)
- Photo alongside proper scan (flag the photo)
- Same identifier in another split (use "Same # as" if unclear)

Set potential_duplicate to null if no relationship detected.

---

## FILENAME GENERATION

Generate a human-readable filename for the entire document.

Format: "{YYYY MM DD} - {Description} ({Identifier})"

Rules:
- Include document date if available (use spaces: 2024 01 15)
- Include source entity, sender, or key subject in description
- Add unique identifier in parentheses if available
- For multi-doc bundles: "{Category} - {Entity} {DateRange} ({N} docs)"
- Avoid filesystem-unsafe characters: / \\ : * ? " < > |

Examples:
- "2023 09 12 - Road Tax Expiry from LTA (YN8057P)"
- "2024 01 29 - Memo from KTPH to Insurers"
- "2022 12 13 - Police Report 2nd (Chen Huang)"
- "Medical Records - KTPH Jan-Mar 2024 (5 docs)"

---

## EDGE CASES

1. **Cover pages / Separator pages**: Output as split with type: 'other'
2. **Missing identifiers**: Set identifier: null
3. **Duplicate identifiers on non-adjacent pages**: Treat as separate splits
4. **Unclear document type**: Classify as 'other' and explain in observation
`;
}
