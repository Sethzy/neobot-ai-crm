# CRM Guardrails Phase 2 — Re-apply to Managed Agents

**Goal:** Re-apply the essential CRM data-quality guardrails to the managed agents tool layer (`src/lib/managed-agents/tools/crm/`). The original Phase 1 work shipped against the legacy runner tools, which were deleted in `a2421a91`. The helper libraries survived (`src/lib/crm/normalize.ts`, `custom-field-validation.ts`, `config.ts`, `free-email-providers.ts`) — the gap is wiring them into the new tool handlers + adding DB-level safety nets.

**Architecture decision:** Split enforcement across two layers:

- **DB layer (migrations):** Universal invariants that protect against any writer. Deal amount bounds, email lowercasing trigger.
- **Agent tool layer:** Everything that needs runtime libraries or helpful LLM-facing error messages.

**Scope:** Trimmed to the 8 guardrails that prevent real data corruption or fix live bugs. Deferred: custom field enforcement (P8/P9 — no clients using required fields yet), corporate domain dedup (P5 — low hit rate), stage-change interaction logging (P10 — timeline_activities already covers this), company auto-linking (P16 — high complexity, unclear user value), select option uniqueness (P21 — config edge case).

## Conventions

- **TDD.** Write the failing test first against the managed agents tool test files.
- **One commit per task.** `feat(crm-guardrails-v2): ...` prefix.
- **Tests co-located** in `src/lib/managed-agents/tools/crm/__tests__/`.
- Helpers already exist — import them, don't rewrite them.

## Relevant Files

### DB migrations (will be created)

- `supabase/migrations/20260412200000_crm_deal_amount_check.sql`
- `supabase/migrations/20260412200001_crm_email_lowercase_trigger.sql`

### Tool handlers (will be modified)

- `src/lib/managed-agents/tools/crm/create-record.ts`
- `src/lib/managed-agents/tools/crm/update-record.ts`

### Shared helpers (one will be fixed)

- `src/lib/runner/tools/crm/filter-utils.ts` — `flexibleTimestampSchema`, `normalizeDateString` (to be fixed then moved)

### Existing helpers (import only — already tested)

- `src/lib/crm/normalize.ts` — `normalizePhone`, `normalizeEmail`, `normalizeWebsite`, `extractEmailDomain`, `extractPhoneDigits`, `phoneMatchesByDigits`
- `src/lib/crm/config.ts` — `matchVocabularyValue`, `CRM_DEFAULTS`
- `src/lib/crm/free-email-providers.ts` — `FREE_EMAIL_PROVIDERS` set

### Tests (will be modified)

- `src/lib/managed-agents/tools/crm/__tests__/create-record.test.ts`
- `src/lib/managed-agents/tools/crm/__tests__/update-record.test.ts`

---

# Phase A — DB safety nets (2 migrations)

## Task 1: Deal amount CHECK constraint (P14/P20)

**Why:** `deals.amount` has no DB-level bounds. Agent can write `Infinity`, `NaN` (as null from JSON), or negative values if the tool layer is bypassed.

**Migration:** `supabase/migrations/20260412200000_crm_deal_amount_check.sql`

```sql
ALTER TABLE deals
  ADD CONSTRAINT deals_amount_non_negative
  CHECK (amount IS NULL OR (amount >= 0 AND amount < 1e15))
  NOT VALID;
```

- [ ] Write migration
- [ ] Verify locally
- [ ] Commit

---

## Task 2: Email lowercase trigger (P1)

**Why:** Email casing inconsistency breaks dedup. A trigger ensures all emails are stored lowercase regardless of writer.

**Migration:** `supabase/migrations/20260412200001_crm_email_lowercase_trigger.sql`

```sql
CREATE OR REPLACE FUNCTION lowercase_email()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_lowercase_email
  BEFORE INSERT OR UPDATE OF email ON contacts
  FOR EACH ROW EXECUTE FUNCTION lowercase_email();

CREATE TRIGGER companies_lowercase_email
  BEFORE INSERT OR UPDATE OF email ON companies
  FOR EACH ROW EXECUTE FUNCTION lowercase_email();
```

- [ ] Write migration
- [ ] Verify locally
- [ ] Commit

---

# Phase B — Tool-layer validation

## Task 3: Email validation + lowercasing in tools (P1)

**Why:** The DB trigger lowercases, but the tool should also validate format and give a clear error to the agent rather than letting it hit a DB error.

**Files:** `create-record.ts`, `update-record.ts`, both test files.

**Implementation:**

In `create-record.ts` — import `normalizeEmail` from `@/lib/crm/normalize`, call it in `buildContactRow` and `buildCompanyRow`. Wrap row-building in try/catch so `normalizeEmail`'s thrown error becomes `{ success: false, error }`.

In `update-record.ts` — in `updateOne`, after the phone normalisation block:

```ts
if ((entity === "contacts" || entity === "companies") && typeof updates.email === "string") {
  try {
    updates.email = normalizeEmail(updates.email) ?? updates.email;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid email" };
  }
}
```

**Tests:** Invalid email rejected on create, invalid email rejected on update, casing normalized on both.

- [ ] Write failing tests
- [ ] Implement
- [ ] Green tests
- [ ] Commit

---

## Task 4: Deal amount bounds in tools (P14/P20)

**Why:** The DB CHECK (Task 1) catches amount < 0, but the tool should reject `Infinity`, `NaN` with a readable error instead of a raw Postgres violation. Skip probability validation — column doesn't exist in DB types.

**Files:** `create-record.ts`, `update-record.ts`, both test files.

**Implementation:**

In `update-record.ts` `updateOne`, after vocabulary normalisation:
```ts
if (entity === "deals" && typeof updates.amount === "number") {
  if (!Number.isFinite(updates.amount) || updates.amount < 0) {
    return { success: false, error: "amount must be a finite non-negative number" };
  }
}
```

In `create-record.ts` `buildDealRow`, validate before building the row (or in execute before the insert).

- [ ] Write failing tests
- [ ] Implement
- [ ] Green tests
- [ ] Commit

---

## Task 5: Website normalisation (P4)

**Why:** `normalizeWebsite` exists in `normalize.ts` but isn't called from the managed agents tools.

**Files:** `create-record.ts` (`buildCompanyRow`), `update-record.ts` (`updateOne`), both test files.

**Implementation:**

In `create-record.ts` `buildCompanyRow`:
```ts
website: normalizeWebsite(record.website as string | null) ?? (record.website as string | null) ?? null,
```

In `update-record.ts` `updateOne`:
```ts
if (entity === "companies" && typeof updates.website === "string") {
  updates.website = normalizeWebsite(updates.website) ?? updates.website;
}
```

- [ ] Write failing tests
- [ ] Implement
- [ ] Green tests
- [ ] Commit

---

## Task 6: Fix flexible date parsing (P23)

**Why:** `normalizeDateString("banana")` returns `"banana"` unchanged. This is a live bug — unparseable values pass through to the DB where they either store garbage or trigger a Postgres cast error. Used by `tasks.ts`, `interactions.ts`, `search.ts`.

**Files:** `src/lib/runner/tools/crm/filter-utils.ts`, its test file.

**Implementation:**

1. Change `normalizeDateString` line 68 to return `null` instead of `value` when no format matches.
2. Add `.refine()` to `flexibleTimestampSchema` that rejects if `normalizeDateString` returns null.

- [ ] Write failing test (`normalizeDateString("banana")` should return null)
- [ ] Fix return value
- [ ] Add `.refine()` to schema
- [ ] Verify downstream tools still pass
- [ ] Commit

---

# Phase C — Stretch (do if time permits)

## Task 7: Email uniqueness partial index (P2)

**Why:** Unique partial index on `(client_id, lower(email))` for contacts + companies. Real guarantee that the tool-layer soft-block can't be bypassed.

**Risk:** Needs a data audit first — if existing data has dupes, index creation fails.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS contacts_client_email_unique
  ON contacts (client_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_client_email_unique
  ON companies (client_id, lower(email))
  WHERE email IS NOT NULL;
```

- [ ] Audit existing data for duplicates
- [ ] Write migration
- [ ] Verify locally
- [ ] Commit

---

## Task 8: Phone digit fallback in dedup (P7)

**Why:** `findDuplicateContacts` matches phone by exact `eq`. `9123 4567` won't match `+6591234567`. Use `extractPhoneDigits` + `phoneMatchesByDigits` from `normalize.ts` for suffix matching.

**Files:** `create-record.ts`, test file.

- [ ] Write failing test
- [ ] Implement
- [ ] Green tests
- [ ] Commit

---

# Phase D — Cleanup

## Task 9: Move orphaned runner tool files

**Why:** `src/lib/runner/tools/crm/filter-utils.ts` and `custom-fields.ts` are stranded in the deleted runner path. Move to `src/lib/crm/`.

- [ ] Move files
- [ ] Update all imports
- [ ] Verify tests pass
- [ ] Delete empty runner/tools/crm directory
- [ ] Commit

---

# Summary

| Phase | Tasks | What | Layer |
|-------|-------|------|-------|
| A | 1–2 | DB safety nets: amount CHECK, email lowercase trigger | DB (migrations) |
| B | 3–6 | Email validation, deal bounds, website normalization, date fix | Agent tool + shared helper |
| C | 7–8 | Email uniqueness index, phone dedup (stretch) | DB + agent tool |
| D | 9 | Move orphaned files | Housekeeping |

**Total: 9 tasks.** A + B are the priority (6 tasks). C is stretch. D is cleanup.

### Deferred (revisit when there's a concrete user need)

- P5 (corporate domain dedup) — low hit rate
- P8/P9 (custom field enforcement) — no clients using required fields yet
- P10 (stage-change interaction logging) — timeline_activities already covers this
- P16 (work-email company auto-linking) — high complexity, surprising behavior risk
- P21 (select option uniqueness) — config edge case
