---
name: qa-testing
description: Use when performing QA testing on client setup, verifying extraction works correctly, or running end-to-end tests after onboarding
---

# QA Testing Checklist

## Overview

Systematic end-to-end testing workflow for verifying client setup is working correctly. Use this after client onboarding is complete (Phase 8) or when testing extraction accuracy.

**Announce at start:** "I'm using the qa-testing skill to verify this client setup."

---

## Test Scenarios

### 1. Happy Path Test
**Goal:** Verify clean documents with all fields present extract correctly

**Steps:**
1. Upload a clean, high-quality sample document
2. Verify classification is correct
3. Check all required fields are extracted
4. Verify extracted values match source document
5. Confirm no validation errors

**Success criteria:**
- ✅ Document classified to correct tag
- ✅ All required fields present and accurate
- ✅ Confidence scores > 80%
- ✅ No validation failures

---

### 2. Missing Required Field Test
**Goal:** Verify validation catches missing required fields

**Steps:**
1. Upload document missing a required field (or mock the extraction)
2. Trigger validation
3. Verify validation error is raised
4. Check error message is clear

**Success criteria:**
- ✅ Validation fails with clear error
- ✅ Error identifies which field is missing
- ✅ Document flagged for HITL review

---

### 3. Low Quality Scan Test
**Goal:** Verify system flags low-confidence extractions

**Steps:**
1. Upload poor quality scan (blurry, rotated, etc.)
2. Check extraction results
3. Verify low confidence is flagged
4. Confirm document routes to HITL review

**Success criteria:**
- ✅ Extraction completes (doesn't crash)
- ✅ Low confidence scores flagged
- ✅ Document sent to review queue

---

### 4. Multi-Type PDF Test
**Goal:** Verify document splitting works correctly

**Steps:**
1. Upload PDF with multiple document types
2. Check classification results
3. Verify each section classified separately
4. Confirm extractions run on correct pages

**Success criteria:**
- ✅ PDF split into correct sections
- ✅ Each section classified correctly
- ✅ Extractions match expected page ranges

---

### 5. Unknown Document Type Test
**Goal:** Verify "other" classification works

**Steps:**
1. Upload document that doesn't match any defined tags
2. Check classification result
3. Verify classified as "other"
4. Confirm no extraction attempted

**Success criteria:**
- ✅ Classified as "other"
- ✅ No extraction errors
- ✅ Document stored without processing

---

## Verification Checklist

After running all test scenarios, verify:

- [ ] User can log in successfully
- [ ] User sees correct client config
- [ ] Upload interface works
- [ ] All document types classify correctly
- [ ] Required fields extract accurately
- [ ] Validation rules trigger appropriately
- [ ] HITL review queue populates correctly
- [ ] User can approve/reject extractions
- [ ] Database updates reflect changes
- [ ] No console errors or crashes

---

## Reporting

After testing, report:

**Extraction Accuracy:**
- Document Type 1: X/Y fields correct (Z% accuracy)
- Document Type 2: X/Y fields correct (Z% accuracy)
- etc.

**Validation Coverage:**
- Required field checks: ✅/❌
- Sanity checks: ✅/❌
- Cross-field rules: ✅/❌

**Blockers:**
- List any issues preventing production deployment
- Note any fields consistently failing extraction

**Recommendations:**
- Suggest schema improvements
- Identify documents needing more training samples

---

## Key Principles

- **Test real samples** - Use actual client documents when possible
- **Document failures** - Screenshot and save examples of extraction errors
- **Update checklist** - Track progress in `src/clients/{client-id}/checklist.json`
- **Iterate quickly** - Test → Fix → Retest cycle
- **Verify end-to-end** - Don't just test extraction, test full workflow

---

## When to Stop and Ask for Help

**STOP immediately when:**
- Unable to log in as test user
- Upload fails or crashes
- Extraction API returns errors
- Database queries fail
- Critical fields consistently wrong (< 50% accuracy)

**Ask for clarification rather than guessing.**
