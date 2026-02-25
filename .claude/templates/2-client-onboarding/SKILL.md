---
name: 2-client-onboarding
description: Orchestrator for full client onboarding workflow (Phases 1-8). Use when setting up a new client from intake brief through E2E testing. Dispatches worker skills in sequence with checkpoints.
---

## Supporting Skills (dispatched by this orchestrator)

| Skill                 | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `3-onboard-config`    | Phases 1-2: Create client config file           |
| `4-onboard-processors`| Phase 3: Create ExtendAI processors             |
| `5-onboard-schemas`   | Phases 5-6: Pull schemas, write validation      |
| `6-onboard-docgen`    | Phase 6.5: Generate DocGen skill for AI reports |
| `7-onboard-user`      | Phases 7.2-7.4: Link user to config             |

# Onboard New Client

## Overview

Orchestrates the complete client onboarding workflow from intake brief to production-ready configuration. Dispatches specialized skills for each phase and pauses at manual checkpoints for human intervention.

**Activates:** When user runs `/2-onboard-client` after intake brief is complete.

**Phases:** Executes Client-Setup-SOP Phases 1-8 with automated dispatch and checkpoint management.

**Announce at start:** "I'm using the 2-client-onboarding skill to set up this client."

---

## Prerequisites

Before running this skill:

- [ ] Intake brief exists at `src/clients/{client-id}/intake-brief.md`
- [ ] Sample documents uploaded to `src/clients/{client-id}/samples/` (5-10 per tag)
- [ ] `EXTEND_API_KEY` set in `.env.local`
- [ ] `ANTHROPIC_API_KEY` set in `.env.local` (for DocGen skill upload)
- [ ] Access to ExtendAI Dashboard (for Phase 4)
- [ ] Access to Supabase Dashboard (for Phase 7.1)

---

## The Process

### Step 1: Identify Client

1. Ask user for client ID (kebab-case)
2. Verify intake brief exists: `src/clients/{client-id}/intake-brief.md`
3. Read intake brief to extract:
   - Client name
   - Document types (tags)
   - Field requirements
   - Validation rules

If intake brief doesn't exist:

- STOP and say: "Intake brief not found. Run `/1-process-transcript` first."

---

### Step 1b: Generate Progress Checklist

Create a progress tracking checklist for this client.

**Actions:**

1. Read checklist template: `.claude/templates/checklist-template.json`
2. Replace placeholders:
   - `{CLIENT_NAME}` - from intake brief
   - `{client-id}` - from Step 1
   - `{START_DATE}` - today's date
   - `{LAST_UPDATED}` - today's date
   - `{TAG_LIST}` - bullet list of all tag IDs
   - `{PROCESSOR_LIST}` - will be filled in Step 3
   - `{SCHEMA_CHECKLIST}` - will be filled in Step 4
   - `{USER_EMAIL}` - will be filled when known
3. Write to: `src/clients/{client-id}/checklist.json`
4. Mark Phase 0 checkboxes as complete (transcript and intake brief exist)

**Display:**

```
✅ Progress checklist created: src/clients/{client-id}/checklist.json

Track onboarding progress in this file. It will be updated automatically as phases complete.
```

**CRITICAL: Checklist Update Rules**

When updating the checklist throughout this workflow:

✅ **ALLOWED:**

- After thorough verification, change `"passes": false` to `"passes": true`

🚫 **FORBIDDEN - NEVER DO:**

- Remove tests or phases
- Edit test descriptions
- Modify test steps
- Combine or consolidate tests
- Reorder tests or phases
- **ONLY CHANGE THE `passes` FIELD**

---

### Step 2: Phase 1-2 - Config Setup (Automated)

Use **3-onboard-config** skill to complete this step.

**Provide to skill:**

- Client ID from Step 1
- Tags from intake brief
- Classification hints from intake brief

**Expected output:**

- `/src/config/clients/{client-id}.ts` created
- Config registered in `/src/config/loader.ts`
- Tests passing

**Verification:** Run `pnpm test src/config` and confirm all tests pass.

If skill fails, STOP and report error to user.

**Update checklist:**

- Mark Phase 1-2 checkboxes as complete
- Add timestamp
- Change Phase 1-2 status from ⬜ to ✅

---

### Step 3: Phase 3 - Create Processors (Automated)

Use **4-onboard-processors** skill to complete this step.

**Provide to skill:**

- Client ID
- Tags that need extraction (exclude "other")

**Expected output:**

- ExtendAI processors created via API
- Processor IDs updated in config file
- Processor reference table added to JSDoc

**Verification:** Check that each tag has a non-null `extendProcessorId`.

If skill fails, STOP and report error to user.

**Update checklist:**

- Fill in `{PROCESSOR_LIST}` with processor IDs and dashboard links
- Mark Phase 3 checkboxes as complete
- Change Phase 3 status from ⬜ to ✅
- Change Phase 4 status from ⬜ to 🟡 (in progress)

---

### Step 4: 🛑 MANUAL CHECKPOINT - Schema Building

**PAUSE FOR HUMAN INTERVENTION**

Display:

```
🛑 MANUAL CHECKPOINT - PHASE 4 (30-60 MIN PER TAG)
═════════════════════════════════════════════════

Build extraction schemas in ExtendAI Dashboard.

📋 Track your progress in: src/clients/{client-id}/checklist.json

For each document type, you must:

1. Open processor in ExtendAI Dashboard
2. Upload sample documents from src/clients/{client-id}/samples/
3. Define schema fields using the visual editor
4. Test extraction until 80%+ accuracy
5. Update checklist with accuracy percentage

Processor Links:
{Generate list of processors with dashboard URLs}

Field Requirements (from intake brief):
{List fields per tag from Section 3.2}

When all schemas are ready (80%+ accuracy), type 'done' to continue.
```

**Wait for user to type "done"**

Do NOT proceed until user confirms.

---

### Step 5: Phase 5-6 - Schema & Validation (Automated)

Use **5-onboard-schemas** skill to complete this step.

**Provide to skill:**

- Client ID
- Processor IDs from Step 3
- Validation rules from intake brief Section 3.2

**Expected output:**

- Schemas pulled via API and saved to `src/clients/{client-id}/schemas/`
- Validation functions written to config file
- Tests passing

**Verification:** Run `pnpm test src/config` and confirm validation functions work.

If skill fails, STOP and report error to user.

**Update checklist:**

- Mark Phase 4 status from 🟡 to ✅ (complete)
- Mark Phase 5-6 checkboxes as complete
- Change Phase 5-6 status from ⬜ to ✅

---

### Step 5.5: Generate & Upload DocGen Skill (~3 MIN, Automated)

**Prerequisites:**
- `ANTHROPIC_API_KEY` must be set in `.env.local`
- Python `anthropic` SDK installed (`pip install anthropic python-dotenv`)

If prerequisites missing, PAUSE and instruct user to set them up.

**Part A: Generate Skill Files**

Use **6-onboard-docgen** skill:

- **Input:** Client ID from Step 1
- **Output:**
  - `src/clients/{client-id}/docgen-skill/{client-id}-docgen/SKILL.md`
  - `src/clients/{client-id}/docgen-skill/{client-id}-docgen/*.py` (scripts based on client needs)

**Verification:**
```bash
python3 -m py_compile src/clients/{client-id}/docgen-skill/{client-id}-docgen/*.py
```

If skill fails, STOP and report error.

**Part B: Upload to Claude API**

```bash
python3 scripts/upload-docgen-skill.py {client-id}
```

**Expected output:**
- Skill uploads to Claude Skills API
- `src/clients/skill-registry.ts` auto-updates with skill_id
- Script outputs "Done! Skill is ready to use."

**Verification:** Confirm skill-registry.ts has a real skill_id (not null) for the client.

If upload fails (API not available), script shows manual instructions. PAUSE and inform user.

**Update checklist:**
- Mark "DocGen skill generated" checkbox as complete
- Mark "DocGen skill uploaded" checkbox as complete
- Add skill_id to checklist notes

---

### Step 6: 🛑 MANUAL CHECKPOINT - User Creation

**PAUSE FOR HUMAN INTERVENTION**

Display:

```
🛑 MANUAL CHECKPOINT - PHASE 7.1 (3 MIN)
═════════════════════════════════════════

Create user account in Supabase Dashboard.

📋 Update checklist: Fill in {USER_EMAIL} and user UUID after creation

IMPORTANT: MCP cannot create users - you MUST use the dashboard.

Steps:
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Invite user"
3. Email: {get email from intake brief or ask user}
4. Click "Send invitation"
5. Copy user UUID from dashboard
6. Update checklist: src/clients/{client-id}/checklist.json (Phase 7.1 section)

When user is created, type 'done' to continue.
```

**Wait for user to type "done"**

Do NOT proceed until user confirms.

**Update checklist:**

- Change Phase 7.1 status from ⬜ to 🟡
- User should manually fill in email and UUID in checklist

---

### Step 7: Phase 7.2-7.4 - User Assignment (Automated)

Use **7-onboard-user** skill to complete this step.

**Provide to skill:**

- User email from Step 6
- Client ID

**Expected output:**

- User UUID retrieved from auth.users
- User linked to config in user_profiles
- Assignment verified via SQL query

**Verification:** Query confirms user is linked to correct config.

If skill fails, STOP and report error to user.

**Update checklist:**

- Mark Phase 7.1 status from 🟡 to ✅
- Mark Phase 7.2-7.4 checkboxes as complete
- Change Phase 7.2-7.4 status from ⬜ to ✅

---

### Step 8: 🛑 MANUAL CHECKPOINT - E2E Testing

**PAUSE FOR HUMAN INTERVENTION**

Display:

```
🛑 MANUAL CHECKPOINT - PHASE 8 (20-30 MIN)
═══════════════════════════════════════════

End-to-end testing requires human QA judgment.

📋 Check off test scenarios in: src/clients/{client-id}/checklist.json

Test Documents:
Upload documents from src/clients/{client-id}/test-docs/ (or use real samples)

Test Scenarios (check these off in the checklist as you go):
1. Happy path - Clean doc, all fields present
2. Missing required field - Should trigger validation error
3. Low quality scan - Should flag low confidence
4. Multi-type PDF - Should split correctly
5. Unknown doc type - Should classify as "other"

Steps:
1. Log in as test user (check Supabase for magic link)
2. Create a new case
3. Upload each test document
4. Verify results match expectations
5. Check off items in checklist.json

When all tests pass, type 'done' to continue.
```

**Wait for user to type "done"**

Do NOT proceed until user confirms.

**Update checklist:**

- Mark Phase 8 status from ⬜ to 🟡 (user fills in checkboxes)
- User should check off test scenarios as they complete them

---

### Step 9: Completion Summary

**Update checklist:**

- Mark Phase 8 status from 🟡 to ✅
- Change overall status from 🟡 In Progress to 🟢 Complete
- Update Last Updated timestamp

Display:

```
✅ ONBOARDING COMPLETE!

Client: {Client Name} ({client-id})
Config: /src/config/clients/{client-id}.ts
Schemas: src/clients/{client-id}/schemas/
User: {email} → {client-id} config
Processors: {count} active

📋 Full progress report: src/clients/{client-id}/checklist.json

Next Steps:
- (Optional) Run Composer optimization for better accuracy (Phase 9)
- Monitor production usage
- Track HITL patterns via database queries
- Iterate on schemas based on user corrections

Reference: See ExtendAI Composer documentation for optimization guide.
```

---

## When to Stop and Ask for Help

**STOP immediately when:**

- Intake brief doesn't exist or is malformed
- Any skill dispatch fails or returns errors
- User types "skip" or "cancel" at a checkpoint
- Database queries fail
- User email not found in Supabase

**Ask for clarification rather than guessing.**

---

## Key Principles

- **Sequential execution** - Each phase must complete before next begins
- **Fresh sessions** - Dispatch skills via Task tool for context isolation
- **Explicit pauses** - Display checkpoint instructions and wait for "done"
- **Verification at each step** - Run tests, check database, confirm outputs
- **Clear errors** - If skill fails, report what failed and why
- **No skipping** - All phases 1-8 are mandatory

---

## Remember

- Announce skill usage at start
- Read intake brief to get all inputs
- Dispatch skills via Task tool (not inline)
- Wait for "done" at each checkpoint
- Verify outputs before proceeding
- Display completion summary at end
