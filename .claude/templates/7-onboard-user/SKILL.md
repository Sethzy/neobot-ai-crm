---
name: 7-onboard-user
description: Assign client config to user in Supabase (Phase 7). Called by orchestrator.
---

# Assign Client User

## Overview

Retrieves user UUID from Supabase auth.users and links them to their client config in user_profiles table. SQL automation after manual user creation.

**Phases covered:** 7.2-7.4 from Client-Setup-SOP

**Prerequisite:** User must be created manually in Supabase Dashboard (Phase 7.1) - MCP cannot create users.

**Announce at start:** "I'm using the 7-onboard-user skill to link the user to their config."

---

## Inputs Required

The orchestrator (or user) must provide:

- **user-email**: Email address of user created in Phase 7.1
- **client-id**: kebab-case client identifier

---

## The Process

### Step 1: Verify User Exists

Query Supabase to confirm user was created:

**SQL:**
```sql
SELECT id, email, created_at
FROM auth.users
WHERE email = '{user_email}';
```

**Expected output:**
```
id                                   | email              | created_at
-------------------------------------|--------------------|-----------
{uuid}                               | {user_email}       | {timestamp}
```

**Save the UUID** for Step 2.

**Error handling:**
- If no rows returned: STOP and report "User not found. Create user in Supabase Dashboard first (Phase 7.1)."
- If multiple rows: STOP and report "Multiple users with same email - database error."

---

### Step 2: Check Existing Assignment

Query user_profiles to see if user already has a config:

**SQL:**
```sql
SELECT id, client_config_id, created_at, updated_at
FROM public.user_profiles
WHERE id = '{user_uuid}';
```

**Possible outcomes:**

**A) No row exists** (new user):
- Proceed to Step 3 (insert)

**B) Row exists with different config**:
- Ask user: "User already assigned to '{existing_config_id}'. Reassign to '{client-id}'? (yes/no)"
- If yes: Proceed to Step 3 (upsert will update)
- If no: STOP and report

**C) Row exists with same config**:
- Report: "User already assigned to '{client-id}'. No changes needed."
- Skip to Step 4 (verification)

---

### Step 3: Assign Client Config

Insert or update user_profiles to link user to config:

**SQL:**
```sql
INSERT INTO public.user_profiles (id, client_config_id)
VALUES (
  '{user_uuid}',      -- UUID from Step 1
  '{client-id}'       -- Client config ID
)
ON CONFLICT (id) DO UPDATE SET
  client_config_id = EXCLUDED.client_config_id,
  updated_at = now()
RETURNING id, client_config_id, created_at, updated_at;
```

**Expected output:**
```
id                                   | client_config_id | created_at          | updated_at
-------------------------------------|------------------|---------------------|--------------------
{user_uuid}                          | {client-id}      | {timestamp}         | {timestamp}
```

**Verification:**
- `RETURNING` clause shows the inserted/updated row
- `client_config_id` matches the input
- `updated_at` is recent (just now)

**Error handling:**
- If query fails: STOP and display full error message
- If no row returned: STOP and report "Insert failed - check database permissions"

---

### Step 4: Verify Assignment

Query to confirm the link was created correctly:

**SQL:**
```sql
SELECT u.email, p.client_config_id, p.updated_at
FROM auth.users u
JOIN public.user_profiles p ON u.id = p.id
WHERE u.email = '{user_email}';
```

**Expected output:**
```
email              | client_config_id | updated_at
-------------------|------------------|--------------------
{user_email}       | {client-id}      | {timestamp}
```

**Verification:**
- Email matches input
- client_config_id matches input
- Row exists (join succeeded)

**Error handling:**
- If no rows: STOP and report "Verification failed - link not found after insert"
- If multiple rows: STOP and report "Multiple profiles for user - database error"
- If client_config_id doesn't match: STOP and report "Wrong config assigned - data mismatch"

---

### Step 5: Verify Config Exists in Codebase

Confirm the client config is registered in the loader:

**Read file:** `/src/config/loader.ts`

**Check:**
- `configs` object has entry for `"{client-id}"`
- Import statement exists for this config

**Error handling:**
- If config not found in loader: STOP and report "Config '{client-id}' not registered in loader.ts - user will get default config"

This is a critical check to prevent runtime errors.

---

### Step 6: Report Output

Display:

```
✅ User assigned to client config successfully!

User details:
- Email: {user_email}
- UUID: {user_uuid}
- Config: {client-id}
- Status: {new assignment | updated from {old_config_id}}

Database verification: ✅ Link confirmed via join query

Next: Manual checkpoint - End-to-end testing (Phase 8)
```

---

## Error Handling

### User not found in auth.users
**Stop and report:** "User '{user_email}' not found. Create user in Supabase Dashboard first (Phase 7.1)."

**Guidance:** User must click "Invite user" in Supabase Dashboard → Authentication → Users.

### Client config not registered in loader.ts
**Stop and report:** "Config '{client-id}' not found in loader.ts. User will get default config. Run setup-client-config first."

### Database permission error
**Stop and display error.** Common issues:
- MCP server doesn't have INSERT permission on user_profiles
- Row-level security policy blocking insert
- Database connection lost

### Multiple users with same email
**Stop and report:** "Database error - multiple auth.users with email '{user_email}'. Contact database admin."

This should never happen in Supabase (email is unique).

### Verification query returns wrong config
**Stop and report:** "Data mismatch - user assigned to '{actual_config_id}' instead of '{client-id}'. Check database state."

---

## MCP Limitation Note

**IMPORTANT:** Supabase MCP server cannot create users in auth.users table.

**Why:** User creation requires special Supabase Admin API calls with:
- Email invitation sending
- Password reset flow
- Email confirmation tokens

**Workaround:** Phase 7.1 requires manual user creation via Supabase Dashboard.

**This skill handles:** Only the linking step (user_profiles table), which MCP CAN do.

---

## Database Schema Reference

**auth.users** (Supabase managed):
- `id` - UUID primary key
- `email` - Unique email address
- `created_at` - Timestamp

**public.user_profiles** (app managed):
- `id` - UUID primary key, foreign key to auth.users(id)
- `client_config_id` - String, references config ID in loader.ts
- `created_at` - Timestamp (auto)
- `updated_at` - Timestamp (auto)

**Constraint:** `user_profiles.id` must exist in `auth.users.id` (foreign key).

---

## Remember

- User MUST be created manually first (Phase 7.1)
- Always query auth.users to get UUID
- Check existing assignment before upsert
- Verify with join query after insert
- Confirm config exists in loader.ts
- STOP on any verification failure

---

## Integration

**Called by:** `2-client-onboarding` skill (orchestrator) after user is created in Supabase Dashboard (Phase 7.1).

**Prerequisites:**
- Phase 7.1 MANUAL CHECKPOINT must be complete (user created, UUID noted)
- User account exists in Supabase `auth.users` table
- User email is known and provided to this skill
- Client config is registered in `/src/config/loader.ts`
- MCP Supabase server must be configured and accessible

**Can only be called at:**
- Phase 7.2-7.4 of onboarding workflow
- After Phase 7.1 manual checkpoint (user creation) is confirmed complete
- Before Phase 8 (end-to-end testing)

**Workflow position:** Fourth automated step, after user creation and before E2E testing.
