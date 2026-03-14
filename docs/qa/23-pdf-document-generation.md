# QA Surface 23: PDF Document Generation

> **PRs covered:** PR 42a-pdf
> **Dogfoodable:** Partial (requires agent to call `generate_pdf` tool via natural language prompt)
> **Time estimate:** 15-20 min manual
> **v2 tools:** `generate_pdf`, `search_crm`

---

## Prerequisites

- Logged in with working chat
- CRM has data: 3+ contacts (mix of buyer/seller), 3+ deals with addresses and prices
- Supabase Storage bucket `client-files` exists and is accessible
- Chat core (Surface 2) passing — tool call rendering works
- `@json-render/react-pdf` package installed

---

## Dogfood Checklist (automated browser pass)

- [ ] Agent calls `generate_pdf` tool when asked for a document
- [ ] Tool pill shows with spinner during generation
- [ ] Download link appears below the tool pill (always visible, not inside expandable)
- [ ] Clicking download link downloads a valid PDF file
- [ ] PDF opens and contains structured content (headings, text, tables)
- [ ] No console errors during PDF generation flow

---

## Manual QA Scenarios

### 23.1 Basic PDF generation (happy path)

1. In chat: **"Make me a client brief for John Tan. He's a buyer looking for a 3BR condo in Bishan, budget $1.5M."**
2. **Expected:** Agent calls `generate_pdf` tool — tool pill appears with spinner
3. **Expected:** After 3-10 seconds, tool completes and a download link appears below the pill
4. **Expected:** Download link shows a filename ending in `.pdf`
5. Click the download link
6. **Expected:** A valid PDF file downloads and opens
7. **Expected:** PDF contains structured content: headings, client details, budget info

**Notes / failures:**

---

### 23.2 PDF with CRM data lookup

1. Ensure a contact "Sarah Lee" exists in CRM with type "seller"
2. In chat: **"Generate a deal summary report for Sarah Lee's properties"**
3. **Expected:** Agent first calls `search_crm` to look up Sarah Lee and her deals
4. **Expected:** Agent then calls `generate_pdf` with the real CRM data in the description
5. **Expected:** Download link appears with a sanitized filename
6. Download and open the PDF
7. **Expected:** PDF contains Sarah Lee's actual data from CRM (not placeholder text)

**Notes / failures:**

---

### 23.3 Custom filename

1. In chat: **"Create a property comparison report and name the file bishan-comparison"**
2. **Expected:** Agent calls `generate_pdf` with `filename: "bishan-comparison"` (or similar)
3. **Expected:** Download link shows `bishan-comparison.pdf`
4. Download the file
5. **Expected:** File is named `bishan-comparison.pdf` (sanitized, lowercase, no spaces)

**Notes / failures:**

---

### 23.4 Auto-generated filename from description

1. In chat: **"Make me a transaction checklist for 10 Bishan Street 15 #12-34"**
2. **Expected:** Agent calls `generate_pdf` without specifying a filename
3. **Expected:** Download link shows a sanitized filename derived from the description (e.g., `transaction-checklist-for-10-bishan-street-15-12-34.pdf`)
4. **Expected:** No spaces, uppercase, or special characters in filename

**Notes / failures:**

---

### 23.5 Download link is always visible (not inside expandable)

1. After any successful `generate_pdf` call (use scenario 23.1)
2. **Expected:** Download link is visible below the tool pill without clicking to expand
3. Click the tool pill to expand details
4. **Expected:** Full JSON output (with `success`, `download_url`, `filename`) visible in expanded view
5. Collapse the tool pill
6. **Expected:** Download link remains visible

**Notes / failures:**

---

### 23.6 Agent gathers data before generating PDF

1. In chat: **"Make me a monthly activity report"**
2. **Expected:** Agent first queries CRM for recent interactions, deals, tasks
3. **Expected:** Agent then calls `generate_pdf` with the gathered data included in the description
4. **Expected:** The PDF description is specific (contains real names, dates, counts), not generic

**Notes / failures:**

---

### 23.7 PDF generation failure handling

1. If the inner LLM produces an invalid spec (hard to trigger manually — verify via unit tests)
2. **Expected:** Tool returns `{ success: false, error: "..." }`
3. **Expected:** Agent communicates the failure to the user in natural language
4. **Expected:** No crash or unhandled error in the chat UI

**Notes / failures:**

---

### 23.8 Simple document request

1. In chat: **"Make me a blank meeting agenda template"**
2. **Expected:** Agent calls `generate_pdf` with a simple description
3. **Expected:** PDF generates successfully with basic structure (headings, sections)
4. **Expected:** Download link works

**Notes / failures:**

---

### 23.9 Agent does not use generate_pdf for simple text answers

1. In chat: **"What's John Tan's phone number?"**
2. **Expected:** Agent answers in plain text — does NOT call `generate_pdf`
3. In chat: **"How many deals do I have?"**
4. **Expected:** Agent answers in text or uses an inline view — does NOT generate a PDF

**Notes / failures:**

---

### 23.10 PDF content quality

1. Generate a PDF with rich content: **"Create a property comparison report for these two properties: 10 Bishan St 15 #12-34 at $1.45M (3BR, 1200 sqft) and 20 Bishan St 22 #08-12 at $1.52M (3BR, 1350 sqft)"**
2. Download and open the PDF
3. **Expected:** PDF has clear headings and sections
4. **Expected:** Data is presented in a structured format (table or organized layout)
5. **Expected:** No emoji characters in the PDF (Helvetica font limitation)
6. **Expected:** Content fits within page margins — no clipping or overflow

**Notes / failures:**

---

## Edge Cases

- [ ] Very long description (500+ chars) — tool handles without error, filename truncated to 60 chars
- [ ] Description with special characters (Chinese, symbols) — filename sanitized to alphanumeric
- [ ] Rapid consecutive PDF requests — both complete without interference
- [ ] PDF with no meaningful content ("make me an empty document") — generates minimal valid PDF
- [ ] Network interruption during inner LLM call — timeout triggers, error returned gracefully
- [ ] Supabase Storage quota exceeded — error message returned, not a crash
- [ ] Very large PDF (10+ pages of content) — renders within `maxDuration` timeout

---

## Pass / Fail Criteria

- **Pass:** Agent calls `generate_pdf` when asked for documents, briefs, or reports. Agent gathers CRM data first and passes it in the description. Download link appears always-visible below the tool pill. Clicking the link downloads a valid, well-structured PDF. Filenames are sanitized. Agent does not use `generate_pdf` for simple text answers. Failures are communicated gracefully.
- **Fail:** Download link missing or buried inside expandable. PDF is empty or contains only placeholder text when CRM data exists. Agent generates PDFs for simple questions. Filename contains spaces or special characters. Tool errors crash the chat UI. Generated PDF has broken layout or emoji rendering artifacts.
