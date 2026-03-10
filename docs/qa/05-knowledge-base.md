# QA Surface 5: Knowledge Base

> **PRs covered:** 12a (vault_files schema + knowledge base pages)
> **Dogfoodable:** Yes
> **Time estimate:** 15 min manual

---

## Prerequisites

- Logged in with a working session
- A few test files to upload (PDF, TXT, DOCX — vary the types)
- Supabase dashboard open to check `vault_files` table and Storage bucket

---

## Dogfood Checklist (automated browser pass)

- [ ] Knowledge Base appears in sidebar navigation under DATABASE section
- [ ] `/knowledge` page loads without errors
- [ ] Page shows file browser / list view
- [ ] Upload button is visible and functional
- [ ] Search box is visible
- [ ] Responsive: page works on mobile viewport (375px)

---

## Manual QA Scenarios

### 5.1 File upload (happy path)

1. Navigate to Knowledge Base page
2. Click upload button
3. Select a PDF file (< 10MB)
4. **Expected:** Upload progress indicator shown
5. **Expected:** File appears in the list after upload
6. **Verify in Supabase:** `vault_files` row created with correct filename, content_type, size, storage_path
7. **Verify:** File exists in Supabase Storage bucket

**Notes / failures:**

---

### 5.2 Multiple file types

1. Upload a `.txt` file
2. Upload a `.docx` file (if supported)
3. **Expected:** Both appear in the list with correct content types
4. **Verify:** `vault_files` rows have correct `content_type`

**Notes / failures:**

---

### 5.3 Full-text search

1. Upload a text file containing the phrase "District 10 property market analysis"
2. Wait for indexing (may need a moment)
3. Search for "District 10" in the search box
4. **Expected:** The uploaded file appears in results
5. Search for "nonexistent gibberish term"
6. **Expected:** No results, graceful empty state

**Notes / failures:**

---

### 5.4 Agent can reference knowledge base

1. Upload a file with specific content (e.g., a property listing sheet)
2. In chat, ask: "What documents do I have in my knowledge base?"
3. **Expected:** Agent uses `run_agent_memory_sql` or reads vault_files to answer
4. Ask: "Search my knowledge base for [term from the uploaded file]"
5. **Expected:** Agent finds and references the uploaded document

**Notes / failures:**

---

### 5.5 File list display

1. With 3+ files uploaded, check the list view
2. **Expected:** Each row shows filename, content type, size, upload date
3. **Expected:** Files are sorted (most recent first or alphabetical)

**Notes / failures:**

---

## Edge Cases

- [ ] Upload very large file (> 10MB if there's a limit) — graceful error
- [ ] Upload file with special characters in name (spaces, unicode) — handled correctly
- [ ] Upload duplicate filename — handled (overwrites or renames)
- [ ] Empty knowledge base — shows helpful empty state, not error
- [ ] Search with special characters — doesn't crash
- [ ] Delete a file (if delete is supported) — removed from list and storage

---

## Pass / Fail Criteria

- **Pass:** Can upload files, they appear in the list, full-text search works, agent can find uploaded documents.
- **Fail:** Upload fails silently, files don't index for search, agent can't access knowledge base.
