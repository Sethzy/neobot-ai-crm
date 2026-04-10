# CRM Guardrails Phase 1 Implementation Plan

**Goal:** Ship 14 CRM data quality guardrails sourced from crm.cli and Twenty CRM audits — validation, dedup, custom field enforcement, and metadata enrichment — without structural schema changes.

**Architecture:** All changes are additive improvements to three existing tools (`create_record`, `update_record`, `configure_crm`). Most are (a) new Zod validation helpers invoked at tool entry, (b) row-builder transformations (lowercasing, URL normalisation), or (c) expanded dedup queries. No new tools. No new tables. One tiny column addition (for stage transition logging).

**Tech Stack:** Next.js 15 App Router, Supabase (PostgREST), AI SDK v6 tools, Zod v4, Vitest, TypeScript, libphonenumber-js (already installed), normalize-url (new), psl (new).

## Bite-Sized Step Granularity

Each step is one action (2–5 minutes):

- "Write the failing test" — step
- "Run it to confirm it fails for the right reason" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and confirm they pass" — step
- "Commit" — step

## Scope

This tasklist covers the "no harm, only good" items from `roadmap docs/Sunder - Source of Truth/references/crm-cli/guardrails-tracker.md`. Three items are **excluded** because they require structural changes and deserve their own plans:

- **P15 (Soft delete / trash)** — schema change, every existing CRM query needs a `deleted_at IS NULL` filter. High value but risky rollout.
- **P17 (Multi-phone / multi-email)** — schema overhaul affecting tools, queries, and UI.
- **P18 (Participant matching)** — depends on P17.

Two items are **deferred** to a later phase:

- **P22 (Actor source on records)** — needs a schema migration and has unclear value until we actually build trust-calibration features.
- **P6 (Social handle extraction)** — needs dedicated columns first (custom fields today, columns tomorrow).

## Conventions

- **TDD, always.** Write the failing test first. Watch it fail for the right reason before writing production code.
- **One commit per task.** `feat(crm-guardrails): ...` for additions, `fix(crm-guardrails): ...` for bug fixes.
- **Tests co-located.** Use `src/**/__tests__/` directories next to files under test.
- **Skills to consult when stuck:** @1-test-driven-development for TDD mechanics, @nextjs-best-practices if anything touches the frontend.

## Relevant Files

### Will be modified

- `src/lib/runner/tools/crm/create-record.ts` — dedup queries, row builders, new validation
- `src/lib/runner/tools/crm/update-record.ts` — update path validation
- `src/lib/runner/tools/crm/configure-crm.ts` — custom field config validation
- `src/lib/crm/normalize.ts` — extend with website + domain helpers
- `src/lib/crm/config.ts` — custom field helpers (already exports `matchVocabularyValue`)
- `package.json` — add `normalize-url` and `psl`

### Will be created

- `src/lib/crm/free-email-providers.ts` — set of ~4,000 free/consumer email domains (imported verbatim from Twenty CRM)
- `src/lib/crm/custom-field-validation.ts` — validators keyed by custom field type
- `src/lib/crm/__tests__/normalize.test.ts` — covers new normalisation helpers
- `src/lib/crm/__tests__/custom-field-validation.test.ts` — new

### Tests to extend

- `src/lib/runner/tools/crm/__tests__/create-record.test.ts`
- `src/lib/runner/tools/crm/__tests__/update-record.test.ts`
- `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`

---

# Phase A — Pure bugfixes (XS, ~30 min total)

## Task 1: Deal amount/probability bounds on update (P14)

**Why:** `create_record` already validates `amount >= 0` and `probability 0–100`. `update_record` doesn't. Agent can set `probability: 500` on an edit. Same bug exists in crm.cli.

**Files:**

- Modify: `src/lib/runner/tools/crm/update-record.ts` (inside `updateOne`, after vocabulary normalisation block around line 173)
- Test: `src/lib/runner/tools/crm/__tests__/update-record.test.ts`

**Step 1: Write the failing tests**

Add to `update-record.test.ts`:

```ts
it("rejects deal updates with negative amount", async () => {
  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "deals",
    updates: [{ id: existingDealId, fields: { amount: -100 } }],
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/amount.*non-negative/i);
  }
});

it("rejects deal updates with probability above 100", async () => {
  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "deals",
    updates: [{ id: existingDealId, fields: { probability: 150 } }],
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/probability.*0.*100/i);
  }
});
```

**Step 2: Run — confirm failure**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/update-record.test.ts
```

Expected: both new tests fail with `expected false to be true`.

**Step 3: Implement**

In `updateOne`, after the vocabulary normalisation block:

```ts
// Deal numeric bounds — mirror create_record's validation.
if (entity === "deals") {
  if (typeof updates.amount === "number" && updates.amount < 0) {
    return { success: false, error: "amount must be non-negative" };
  }
  if (typeof updates.probability === "number") {
    if (updates.probability < 0 || updates.probability > 100) {
      return { success: false, error: "probability must be between 0 and 100" };
    }
  }
}
```

**Step 4: Run — confirm pass**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/update-record.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/update-record.test.ts
git commit -m "fix(crm-guardrails): enforce deal amount/probability bounds on update (P14)"
```

---

## Task 2: NaN / Infinity rejection on number fields (P20)

**Why:** JavaScript allows `NaN`, `Infinity`, `-Infinity` as valid numbers. `amount >= 0` catches `NaN` (returns false) but `Infinity >= 0` is `true` — `Infinity` passes. One-line fix.

**Files:**

- Modify: `src/lib/runner/tools/crm/create-record.ts` (in `buildDealRow` around line 180)
- Modify: `src/lib/runner/tools/crm/update-record.ts` (same bounds block from Task 1)
- Test: both test files

**Step 1: Write the failing tests**

```ts
it("rejects deal amount of Infinity on create", async () => {
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "deals",
    records: [{ address: "123 Finite St", amount: Infinity }],
  });
  expect(result.success).toBe(false);
});

it("rejects deal amount of NaN on update", async () => {
  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "deals",
    updates: [{ id: existingDealId, fields: { amount: Number.NaN } }],
  });
  expect(result.success).toBe(false);
});
```

**Step 2: Run — confirm failure**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

Expected: both tests fail.

**Step 3: Implement**

Replace `value < 0` checks with `!Number.isFinite(value) || value < 0`:

```ts
// create-record.ts — buildDealRow or the pre-build validation
if (typeof record.amount === "number") {
  if (!Number.isFinite(record.amount) || record.amount < 0) {
    throw new Error("amount must be a finite non-negative number");
  }
}
```

And in `update-record.ts`, update the block added in Task 1:

```ts
if (typeof updates.amount === "number") {
  if (!Number.isFinite(updates.amount) || updates.amount < 0) {
    return { success: false, error: "amount must be a finite non-negative number" };
  }
}
if (typeof updates.probability === "number") {
  if (!Number.isFinite(updates.probability) || updates.probability < 0 || updates.probability > 100) {
    return { success: false, error: "probability must be a finite number between 0 and 100" };
  }
}
```

**Step 4: Run — confirm pass**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/
git commit -m "fix(crm-guardrails): reject NaN/Infinity on deal numeric fields (P20)"
```

---

## Task 3: Select option uniqueness in configure_crm (P21)

**Why:** When a client defines a custom select field, nothing stops duplicate options like `["HDB", "HDB", "Condo"]`. Downstream validation against options would be ambiguous.

**Files:**

- Modify: `src/lib/runner/tools/crm/configure-crm.ts` (wherever custom field definitions are validated)
- Test: `src/lib/runner/tools/crm/__tests__/configure-crm.test.ts`

**Step 1: Write the failing test**

```ts
it("rejects custom select field with duplicate options", async () => {
  const { configure_crm } = createConfigureCrmTool(supabase, clientId);
  const result = await configure_crm.execute({
    action: "set_custom_field",
    entity: "deals",
    field: {
      key: "property_type",
      label: "Property Type",
      type: "select",
      options: ["HDB", "HDB", "Condo"],
    },
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/duplicate/i);
  }
});
```

(Adjust the action name/field shape to match the actual `configure_crm` tool surface — read the file first.)

**Step 2: Run — confirm failure**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
```

**Step 3: Implement**

In the custom field validation path:

```ts
if (field.type === "select" && Array.isArray(field.options)) {
  const unique = new Set(field.options);
  if (unique.size !== field.options.length) {
    return {
      success: false,
      error: `Duplicate options in select field "${field.key}". Each option must be unique.`,
    };
  }
}
```

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/configure-crm.ts src/lib/runner/tools/crm/__tests__/configure-crm.test.ts
git commit -m "feat(crm-guardrails): reject duplicate options in custom select fields (P21)"
```

---

# Phase B — Email and URL normalisation (S, ~2 hours)

## Task 4: Install normalize-url and psl

**Why:** Required for P4 (website normalisation) and P5/P16 (domain extraction).

**Step 1: Install**

```bash
npm install normalize-url psl --legacy-peer-deps
npm install -D @types/psl --legacy-peer-deps
```

(The `--legacy-peer-deps` flag is needed due to an existing peer dependency conflict in this repo.)

**Step 2: Verify imports work**

Create a throwaway test file or use `node -e`:

```bash
node -e "console.log(require('normalize-url')('HTTPS://WWW.Acme.com/?utm=x'))"
```

Expected output: `https://acme.com`

```bash
node -e "console.log(require('psl').parse('mail.acme.co.uk'))"
```

Expected output: object with `domain: 'acme.co.uk'`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(crm-guardrails): add normalize-url and psl for URL/domain normalisation"
```

---

## Task 5: Website URL normalisation helper + wire-in (P4)

**Why:** `https://www.acme.com/?tracking=x`, `acme.com`, `http://acme.com` all stored differently today. Dedup breaks.

**Files:**

- Modify: `src/lib/crm/normalize.ts` (add `normalizeWebsite`)
- Create: `src/lib/crm/__tests__/normalize.test.ts` (if it doesn't exist)
- Modify: `src/lib/runner/tools/crm/create-record.ts` (`buildCompanyRow` — website field)
- Modify: `src/lib/runner/tools/crm/update-record.ts` (update path, alongside phone normalisation)

**Step 1: Write the failing test**

```ts
// src/lib/crm/__tests__/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeWebsite } from "../normalize";

describe("normalizeWebsite", () => {
  it("strips protocol and www", () => {
    expect(normalizeWebsite("https://www.acme.com")).toBe("acme.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeWebsite("https://acme.com/")).toBe("acme.com");
  });

  it("strips query parameters", () => {
    expect(normalizeWebsite("https://acme.com?utm_source=x")).toBe("acme.com");
  });

  it("preserves path case-sensitively", () => {
    expect(normalizeWebsite("https://acme.com/Products")).toBe("acme.com/Products");
  });

  it("returns null on unparseable input", () => {
    expect(normalizeWebsite("not a url")).toBe(null);
  });

  it("returns null on null/empty input", () => {
    expect(normalizeWebsite(null)).toBe(null);
    expect(normalizeWebsite("")).toBe(null);
  });
});
```

**Step 2: Run — confirm failure**

```bash
npx vitest run src/lib/crm/__tests__/normalize.test.ts
```

Expected: `normalizeWebsite is not a function` or import error.

**Step 3: Implement the helper**

In `src/lib/crm/normalize.ts`, add:

```ts
import normalizeUrl from "normalize-url";

const NORMALIZE_URL_OPTS = {
  stripProtocol: true,
  stripHash: true,
  removeQueryParameters: true,
  stripWWW: true,
  removeSingleSlash: true,
} as const;

/**
 * Normalises a website URL to a canonical form for storage and dedup.
 *
 *   - `https://www.acme.com/?utm=x` → `acme.com`
 *   - `http://acme.com/Products`    → `acme.com/Products`  (path preserved)
 *
 * Returns `null` on unparseable input. Callers should fall back to storing
 * the raw value rather than rejecting outright.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return normalizeUrl(trimmed, NORMALIZE_URL_OPTS);
  } catch {
    return null;
  }
}
```

**Step 4: Run — confirm tests pass**

```bash
npx vitest run src/lib/crm/__tests__/normalize.test.ts
```

**Step 5: Wire into `buildCompanyRow` and `updateOne`**

In `create-record.ts` `buildCompanyRow`:

```ts
website: normalizeWebsite(record.website as string | null) ?? (record.website as string | null) ?? null,
```

In `update-record.ts` `updateOne`, next to the phone normalisation block:

```ts
if (entity === "companies" && typeof updates.website === "string") {
  updates.website = normalizeWebsite(updates.website) ?? updates.website;
}
```

**Step 6: Write integration test**

In `create-record.test.ts`:

```ts
it("normalises company website on create", async () => {
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "companies",
    records: [{ name: "Acme", website: "https://www.acme.com/?utm=test" }],
  });
  expect(result.success).toBe(true);
  if (result.success && "record" in result) {
    expect((result.record as { website: string }).website).toBe("acme.com");
  }
});
```

**Step 7: Run all related tests**

```bash
npx vitest run src/lib/crm/__tests__/normalize.test.ts src/lib/runner/tools/crm/__tests__/
```

**Step 8: Commit**

```bash
git add src/lib/crm/normalize.ts src/lib/crm/__tests__/normalize.test.ts src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/
git commit -m "feat(crm-guardrails): normalise company website URLs to canonical form (P4)"
```

---

## Task 6: Email format validation and lowercasing (P1)

**Why:** Agent can save `email: "not-an-email"`. No format check anywhere. Also, casing is inconsistent (`Jane@Acme.com` vs `jane@acme.com`) which breaks dedup.

**Files:**

- Modify: `src/lib/runner/tools/crm/create-record.ts` (add pre-build validation; lowercase in row builders)
- Modify: `src/lib/runner/tools/crm/update-record.ts` (lowercase in update block)
- Test: `create-record.test.ts`, `update-record.test.ts`

**Step 1: Write the failing tests**

```ts
it("rejects invalid email format on contact create", async () => {
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Jane", last_name: "Doe", email: "not-an-email" }],
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/invalid email/i);
  }
});

it("lowercases email on store", async () => {
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Jane", last_name: "Doe", email: "Jane@Acme.COM" }],
  });
  expect(result.success).toBe(true);
  if (result.success && "record" in result) {
    expect((result.record as { email: string }).email).toBe("jane@acme.com");
  }
});

it("lowercases email on update", async () => {
  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "contacts",
    updates: [{ id: existingContactId, fields: { email: "BOB@ACME.COM" } }],
  });
  expect(result.success).toBe(true);
  if (result.success && "record" in result) {
    expect((result.record as { email: string }).email).toBe("bob@acme.com");
  }
});
```

**Step 2: Run — confirm failure**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

**Step 3: Implement validation helper**

In `create-record.ts` (or a new small helper file):

```ts
import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Validates and lowercases an email string.
 * Returns the canonical form or throws with a clear message.
 */
function normalizeEmail(raw: unknown, fieldLabel = "email"): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  const result = emailSchema.safeParse(lowered);
  if (!result.success) {
    throw new Error(`Invalid ${fieldLabel} format: "${raw}"`);
  }
  return lowered;
}
```

Wire into `buildContactRow` and `buildCompanyRow`:

```ts
email: normalizeEmail(record.email),
```

Catch throws in `execute`:

```ts
let rows;
try {
  rows = records.map((record) => { /* existing switch */ });
} catch (error) {
  return {
    success: false as const,
    error: error instanceof Error ? error.message : "Validation failed",
  };
}
```

In `update-record.ts`, add near the phone normalisation block:

```ts
if (
  (entity === "contacts" || entity === "companies") &&
  typeof updates.email === "string"
) {
  try {
    updates.email = normalizeEmail(updates.email) ?? updates.email;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Invalid email" };
  }
}
```

**Step 4: Run — confirm pass**

```bash
npx vitest run src/lib/runner/tools/crm/__tests__/
```

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/
git commit -m "feat(crm-guardrails): validate email format and lowercase on store (P1)"
```

---

## Task 7: Email uniqueness soft-block (P2)

**Why:** Two contacts can share the same email. The shipped multi-signal dedup surfaces it on create but: (a) doesn't block if names differ significantly, (b) doesn't check at all on update.

**Files:**

- Modify: `src/lib/runner/tools/crm/create-record.ts` (strengthen existing dedup — already OR-matches email, this just ensures the block happens regardless of name similarity)
- Modify: `src/lib/runner/tools/crm/update-record.ts` (add uniqueness check on email updates)
- Test: both test files

**Step 1: Write the failing test**

```ts
it("blocks update when email already belongs to another contact", async () => {
  // Arrange: two contacts
  await seedContact({ first_name: "Alice", last_name: "A", email: "alice@acme.com" });
  const bob = await seedContact({ first_name: "Bob", last_name: "B", email: "bob@acme.com" });

  // Act: try to set Bob's email to Alice's
  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "contacts",
    updates: [{ id: bob.contact_id, fields: { email: "alice@acme.com" } }],
  });

  // Assert
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/email.*already/i);
  }
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

In `update-record.ts` `updateOne`, after email lowercasing:

```ts
if (
  entity === "contacts" &&
  typeof updates.email === "string" &&
  updates.email.length > 0
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conflict } = await (supabase as any)
    .from("contacts")
    .select("contact_id, first_name, last_name")
    .eq("client_id", clientId)
    .eq("email", updates.email)
    .neq("contact_id", recordId)
    .maybeSingle();

  if (conflict) {
    return {
      success: false,
      error: `Email "${updates.email}" already belongs to ${conflict.first_name} ${conflict.last_name} (${conflict.contact_id}).`,
    };
  }
}
```

For `create_record`, verify the existing OR-match dedup already covers this. (It does — the email clause in `findDuplicateContacts` returns the conflicting record, which blocks creation via the existing `possible_duplicates` path.)

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/update-record.test.ts
git commit -m "feat(crm-guardrails): soft-block email reuse across contacts on update (P2)"
```

---

## Task 8: Phone digit fallback matching in dedup (P7)

**Why:** Our dedup uses exact E.164 comparison. If the incoming number is unparseable (no country code, unusual format), `normalizePhone()` returns `null` and the phone clause in the dedup query silently skips. A partial number like `555-1234` never matches `+12125551234`.

**Files:**

- Modify: `src/lib/crm/normalize.ts` (add `extractPhoneDigits` and `phoneMatchesByDigits`)
- Modify: `src/lib/runner/tools/crm/create-record.ts` (in `findDuplicateContacts` / `findDuplicateCompanies`, add digit fallback)
- Test: `src/lib/crm/__tests__/normalize.test.ts`

**Step 1: Write the failing test for the helpers**

```ts
// normalize.test.ts
import { extractPhoneDigits, phoneMatchesByDigits } from "../normalize";

describe("extractPhoneDigits", () => {
  it("strips non-digits", () => {
    expect(extractPhoneDigits("(212) 555-1234")).toBe("2125551234");
  });
});

describe("phoneMatchesByDigits", () => {
  it("matches suffix against E.164", () => {
    expect(phoneMatchesByDigits("+12125551234", "5551234")).toBe(true);
  });
  it("matches full E.164 digits", () => {
    expect(phoneMatchesByDigits("+12125551234", "2125551234")).toBe(true);
  });
  it("does not match unrelated digits", () => {
    expect(phoneMatchesByDigits("+12125551234", "9998888")).toBe(false);
  });
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

In `src/lib/crm/normalize.ts`:

```ts
/** Strips everything except digits from a string. */
export function extractPhoneDigits(input: string): string {
  return input.replace(/[^\d]/g, "");
}

/**
 * Fallback matcher for unparseable phone input against a stored E.164 value.
 * Returns true if one value's digits are a suffix of the other.
 */
export function phoneMatchesByDigits(e164: string, digits: string): boolean {
  const stored = extractPhoneDigits(e164);
  if (stored.length === 0 || digits.length === 0) return false;
  return stored.endsWith(digits) || digits.endsWith(stored);
}
```

**Step 4: Wire into dedup**

In `create-record.ts` `findDuplicates`, when `normalizePhone()` returns null for the input phone, fall back to a digit scan:

```ts
case "contacts": {
  const rawPhone = record.phone ? String(record.phone) : null;
  const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;

  // Primary OR-match query (existing logic)
  const primaryMatches = await findDuplicateContacts(
    supabase,
    clientId,
    String(record.first_name ?? ""),
    String(record.last_name ?? ""),
    record.email ? String(record.email).toLowerCase() : null,
    normalizedPhone,
  );

  // Digit fallback — only if we couldn't normalise
  if (!normalizedPhone && rawPhone) {
    const digits = extractPhoneDigits(rawPhone);
    if (digits.length >= 7) {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("client_id", clientId);
      const digitMatches = (data ?? []).filter((c: { phone?: string | null }) =>
        c.phone ? phoneMatchesByDigits(c.phone, digits) : false,
      );
      return [...(primaryMatches ?? []), ...digitMatches];
    }
  }

  return primaryMatches;
}
```

(Do the same for `companies`.)

**Step 5: Integration test**

```ts
it("catches duplicate contact by phone digit fallback when input lacks country code", async () => {
  await seedContact({
    first_name: "Jane",
    last_name: "Doe",
    phone: "+12125551234",
  });

  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Jane", last_name: "Smith", phone: "555-1234" }],
  });

  expect(result.success).toBe(false);
  if (!result.success && "possible_duplicates" in result) {
    expect(result.possible_duplicates.length).toBeGreaterThan(0);
  }
});
```

**Step 6: Run — confirm pass**

**Step 7: Commit**

```bash
git add src/lib/crm/normalize.ts src/lib/crm/__tests__/normalize.test.ts src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/__tests__/create-record.test.ts
git commit -m "feat(crm-guardrails): digit-based phone fallback in dedup (P7)"
```

---

# Phase C — Domain-aware dedup (M, ~2 hours)

## Task 9: Import free email providers list

**Why:** Required for P5 (shared domain dedup must exclude free providers) and P16 (work-email → company suggestion).

**Files:**

- Create: `src/lib/crm/free-email-providers.ts`

**Step 1: Copy the list from Twenty**

```bash
cp /Users/sethlim/Documents/twenty/packages/twenty-server/src/utils/email-providers.ts \
   /Users/sethlim/Documents/sunder-next-migration-20260225/src/lib/crm/free-email-providers.ts
```

**Step 2: Adapt exports**

Open the new file. Replace any Twenty-specific imports, and ensure it exports a `Set<string>`:

```ts
// src/lib/crm/free-email-providers.ts
// Source: vendored from Twenty CRM (twenty-server/src/utils/email-providers.ts).
// A set of ~4,000 free, disposable, and consumer email providers used to
// decide whether an email is a "work email" (corporate) vs a "free email".
//
// Used by:
//   - P5 shared email domain dedup signal
//   - P16 auto-suggest company from work email

const freeEmailProviders = `
0.pl
0-00.usa.cc
... (rest of the list)
`.trim().split("\n");

export const FREE_EMAIL_PROVIDERS: ReadonlySet<string> = new Set(freeEmailProviders);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_PROVIDERS.has(domain.toLowerCase());
}
```

**Step 3: Add a smoke test**

```ts
// src/lib/crm/__tests__/free-email-providers.test.ts
import { describe, it, expect } from "vitest";
import { isFreeEmailDomain, FREE_EMAIL_PROVIDERS } from "../free-email-providers";

describe("isFreeEmailDomain", () => {
  it("identifies gmail as free", () => {
    expect(isFreeEmailDomain("gmail.com")).toBe(true);
  });
  it("identifies acme.com as not free", () => {
    expect(isFreeEmailDomain("acme.com")).toBe(false);
  });
  it("is case insensitive", () => {
    expect(isFreeEmailDomain("GMAIL.COM")).toBe(true);
  });
  it("has a reasonable number of providers", () => {
    expect(FREE_EMAIL_PROVIDERS.size).toBeGreaterThan(100);
  });
});
```

**Step 4: Run — confirm pass**

```bash
npx vitest run src/lib/crm/__tests__/free-email-providers.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/crm/free-email-providers.ts src/lib/crm/__tests__/free-email-providers.test.ts
git commit -m "feat(crm-guardrails): vendor free email providers list from Twenty CRM"
```

---

## Task 10: Domain extraction helper (prep for P5 + P16)

**Why:** P5 and P16 both need "extract the registrable domain from an email address". Naive `split('@')[1]` breaks on `jane@mail.acme.co.uk` (should return `acme.co.uk`, not `co.uk`). Use PSL (Public Suffix List) for correctness.

**Files:**

- Modify: `src/lib/crm/normalize.ts` (add `extractEmailDomain`)
- Test: `normalize.test.ts`

**Step 1: Write the failing tests**

```ts
describe("extractEmailDomain", () => {
  it("returns registrable domain for simple email", () => {
    expect(extractEmailDomain("jane@acme.com")).toBe("acme.com");
  });
  it("handles subdomains", () => {
    expect(extractEmailDomain("jane@mail.acme.com")).toBe("acme.com");
  });
  it("handles country-code TLDs", () => {
    expect(extractEmailDomain("jane@mail.acme.co.uk")).toBe("acme.co.uk");
  });
  it("lowercases the domain", () => {
    expect(extractEmailDomain("jane@ACME.COM")).toBe("acme.com");
  });
  it("returns null for invalid input", () => {
    expect(extractEmailDomain("not-an-email")).toBe(null);
    expect(extractEmailDomain("")).toBe(null);
    expect(extractEmailDomain(null)).toBe(null);
  });
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

```ts
// normalize.ts
import psl from "psl";

/**
 * Extracts the registrable domain from an email address using the Public
 * Suffix List (PSL).
 *
 *   - `jane@acme.com`          → `acme.com`
 *   - `jane@mail.acme.co.uk`   → `acme.co.uk`
 *   - `not-an-email`           → `null`
 */
export function extractEmailDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const at = input.indexOf("@");
  if (at < 1 || at === input.length - 1) return null;
  const rawDomain = input.slice(at + 1).toLowerCase().trim();
  if (!rawDomain) return null;
  try {
    const parsed = psl.parse(rawDomain);
    if ("domain" in parsed && parsed.domain) {
      return parsed.domain;
    }
    return null;
  } catch {
    return null;
  }
}
```

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/crm/normalize.ts src/lib/crm/__tests__/normalize.test.ts
git commit -m "feat(crm-guardrails): add PSL-based email domain extraction helper"
```

---

## Task 11: Shared email domain dedup signal (P5)

**Why:** Today our dedup requires exact match on name OR email OR phone. Two contacts with similar names at the same corporate domain (e.g. "Jane Smith jsmith@acme.com" and "J. Smith jane@acme.com") aren't flagged. Adding a "similar name + shared corporate domain" signal catches these.

**Files:**

- Modify: `src/lib/runner/tools/crm/create-record.ts` (extend `findDuplicates` for contacts)
- Test: `create-record.test.ts`

**Step 1: Write the failing test**

```ts
it("flags similar-name contact with same corporate email domain as possible duplicate", async () => {
  await seedContact({
    first_name: "Jane",
    last_name: "Smith",
    email: "jane@acme.com",
  });

  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "J", last_name: "Smith", email: "jsmith@acme.com" }],
  });

  expect(result.success).toBe(false);
  if (!result.success && "possible_duplicates" in result) {
    expect(result.possible_duplicates.length).toBeGreaterThan(0);
  }
});

it("does NOT flag shared gmail.com as duplicate signal", async () => {
  await seedContact({
    first_name: "Jane",
    last_name: "Smith",
    email: "jane@gmail.com",
  });

  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Different", last_name: "Person", email: "other@gmail.com" }],
  });

  // Should succeed — gmail.com is a free provider, not a dedup signal
  expect(result.success).toBe(true);
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement the domain-scan extension**

After the primary OR-match dedup query in `findDuplicates`:

```ts
// Shared corporate domain signal — only when:
//   1. Email is provided
//   2. Domain is a work domain (not in free provider list)
//   3. At least one existing contact shares the domain AND has a similar name
import { extractEmailDomain } from "@/lib/crm/normalize";
import { isFreeEmailDomain } from "@/lib/crm/free-email-providers";

const email = record.email ? String(record.email).toLowerCase() : null;
const domain = email ? extractEmailDomain(email) : null;

if (domain && !isFreeEmailDomain(domain)) {
  const firstName = String(record.first_name ?? "").toLowerCase();
  const lastName = String(record.last_name ?? "").toLowerCase();

  // Load contacts at this domain via email LIKE pattern.
  const { data: domainMatches } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .ilike("email", `%@${domain}`)
    .limit(20);

  const similar = (domainMatches ?? []).filter((c: { first_name?: string | null; last_name?: string | null }) => {
    const cf = (c.first_name ?? "").toLowerCase();
    const cl = (c.last_name ?? "").toLowerCase();
    // Loose similarity: either last name matches exactly, or first-name
    // initial matches plus any first-name overlap.
    if (cl === lastName && lastName.length > 0) return true;
    if (cf && firstName && (cf[0] === firstName[0] || cf.includes(firstName) || firstName.includes(cf))) {
      return true;
    }
    return false;
  });

  return [...(primaryMatches ?? []), ...similar];
}
```

Dedup the merged list by `contact_id` to avoid returning the same record twice.

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/__tests__/create-record.test.ts
git commit -m "feat(crm-guardrails): shared corporate email domain as dedup signal (P5)"
```

---

# Phase D — Custom field enforcement (M, ~2 hours)

## Task 12: Custom field value validation framework (P8)

**Why:** CRM config defines custom fields with types (`text`, `select`, `date`, `number`) and for select fields, a list of valid options. None enforced. Agent can set a "select" field to any string.

**Files:**

- Create: `src/lib/crm/custom-field-validation.ts`
- Create: `src/lib/crm/__tests__/custom-field-validation.test.ts`
- Modify: `src/lib/runner/tools/crm/create-record.ts` (invoke validator before insert)
- Modify: `src/lib/runner/tools/crm/update-record.ts` (invoke validator before update)

**Step 1: Write the failing tests**

```ts
// custom-field-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateCustomFields } from "../custom-field-validation";
import type { CustomFieldDefinition } from "@/lib/crm/config";

const defs: CustomFieldDefinition[] = [
  { key: "priority", label: "Priority", type: "select", options: ["low", "high"], required: false },
  { key: "close_date", label: "Close Date", type: "date", required: false },
  { key: "score", label: "Score", type: "number", required: false },
];

describe("validateCustomFields", () => {
  it("accepts valid values", () => {
    const result = validateCustomFields(
      { priority: "high", score: 42, close_date: "2026-04-10" },
      defs,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects select value not in options", () => {
    const result = validateCustomFields({ priority: "medium" }, defs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/priority.*low.*high/i);
  });

  it("rejects non-numeric score", () => {
    const result = validateCustomFields({ score: "hello" }, defs);
    expect(result.ok).toBe(false);
  });

  it("rejects unparseable date", () => {
    const result = validateCustomFields({ close_date: "banana" }, defs);
    expect(result.ok).toBe(false);
  });

  it("accepts unknown keys (passthrough)", () => {
    // Unknown custom fields are allowed — the config defines known ones,
    // but the agent may write to undefined keys which we don't validate.
    const result = validateCustomFields({ some_unknown: "value" }, defs);
    expect(result.ok).toBe(true);
  });
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement the validator**

```ts
// src/lib/crm/custom-field-validation.ts
import type { CustomFieldDefinition } from "./config";

type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validates a custom fields JSON object against a set of custom field
 * definitions. Returns `{ ok: true }` if all defined fields pass, or
 * `{ ok: false, error }` with a clear message on the first failure.
 *
 * Unknown keys (not in the definitions) are accepted — the agent may write
 * to undefined fields; only defined fields are constrained.
 */
export function validateCustomFields(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
): ValidationResult {
  const defsByKey = new Map(definitions.map((d) => [d.key, d]));

  for (const [key, value] of Object.entries(values)) {
    const def = defsByKey.get(key);
    if (!def) continue; // Unknown key — passthrough.
    if (value === null || value === undefined) continue; // Null is always allowed.

    switch (def.type) {
      case "select": {
        const options = (def as { options?: string[] }).options ?? [];
        if (typeof value !== "string" || !options.includes(value)) {
          return {
            ok: false,
            error: `Invalid value for "${def.label}" (${def.key}): "${String(value)}". Valid options: ${options.join(", ")}`,
          };
        }
        break;
      }
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return {
            ok: false,
            error: `Invalid value for "${def.label}" (${def.key}): must be a finite number`,
          };
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          return {
            ok: false,
            error: `Invalid value for "${def.label}" (${def.key}): must be a parseable date string`,
          };
        }
        break;
      }
      case "text":
      default: {
        if (typeof value !== "string") {
          return {
            ok: false,
            error: `Invalid value for "${def.label}" (${def.key}): must be a string`,
          };
        }
      }
    }
  }

  return { ok: true };
}
```

**Step 4: Run — confirm pass**

**Step 5: Wire into create_record and update_record**

In `create-record.ts` `execute`, before the row build step:

```ts
// Custom field validation
const customFieldDefs = getCustomFieldDefinitions(config, entity);
for (const record of records) {
  const custom = (record.custom_fields as Record<string, unknown>) ?? {};
  const validation = validateCustomFields(custom, customFieldDefs);
  if (!validation.ok) {
    return { success: false as const, error: validation.error };
  }
}
```

(Add `getCustomFieldDefinitions` to `config.ts` if it doesn't already exist — it should return the per-entity custom field list.)

Same pattern in `update-record.ts` `updateOne` for any update touching `custom_fields`.

**Step 6: Run all related tests**

```bash
npx vitest run src/lib/crm/__tests__/custom-field-validation.test.ts src/lib/runner/tools/crm/__tests__/
```

**Step 7: Commit**

```bash
git add src/lib/crm/custom-field-validation.ts src/lib/crm/__tests__/custom-field-validation.test.ts src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/update-record.ts src/lib/runner/tools/crm/__tests__/
git commit -m "feat(crm-guardrails): validate custom field values against type definitions (P8)"
```

---

## Task 13: Required custom field enforcement on create (P9)

**Why:** Custom field definitions have a `required: true` flag. Today it's ignored. Agent creates records with required fields missing.

**Files:**

- Modify: `src/lib/crm/custom-field-validation.ts` (add `checkRequiredCustomFields`)
- Modify: `src/lib/runner/tools/crm/create-record.ts` (invoke on create only, not update)

**Step 1: Write the failing test**

```ts
it("rejects create when required custom field is missing", async () => {
  // Arrange: configure a required custom field on deals
  await configureCustomField({
    entity: "deals",
    key: "commission_rate",
    label: "Commission Rate",
    type: "number",
    required: true,
  });

  // Act: create a deal without the required field
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "deals",
    records: [{ address: "123 Main St" }],
  });

  // Assert
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error).toMatch(/commission_rate/i);
    expect(result.error).toMatch(/required/i);
  }
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

In `custom-field-validation.ts`:

```ts
export function checkRequiredCustomFields(
  values: Record<string, unknown>,
  definitions: CustomFieldDefinition[],
): ValidationResult {
  const missing: string[] = [];
  for (const def of definitions) {
    if (!def.required) continue;
    const v = values[def.key];
    if (v === null || v === undefined || v === "") {
      missing.push(`${def.label} (${def.key})`);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Required custom fields missing: ${missing.join(", ")}`,
    };
  }
  return { ok: true };
}
```

Wire into `create_record` (not update — we only require on creation):

```ts
for (const record of records) {
  const custom = (record.custom_fields as Record<string, unknown>) ?? {};
  const requiredCheck = checkRequiredCustomFields(custom, customFieldDefs);
  if (!requiredCheck.ok) {
    return { success: false as const, error: requiredCheck.error };
  }
}
```

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/crm/custom-field-validation.ts src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/__tests__/create-record.test.ts
git commit -m "feat(crm-guardrails): enforce required custom fields on create (P9)"
```

---

# Phase E — Record enrichment (M, ~2 hours)

## Task 14: Stage transition auto-logging (P10)

**Why:** When a deal moves from "leads" to "proposal", we fire a PostHog analytics event, but there's no CRM-visible audit of the move. Users can't look at a deal and see its stage history. crm.cli auto-logs every stage transition as an activity.

**Files:**

- Modify: `src/lib/runner/tools/crm/update-record.ts` (in `updateOne`, after the existing `deal_stage_changed` analytics capture)

**Step 1: Write the failing test**

```ts
it("auto-creates an interaction when a deal stage changes", async () => {
  const deal = await seedDeal({ stage: "leads", address: "123 Pipeline Rd" });

  const { update_record } = createUpdateRecordTool(supabase, clientId);
  const result = await update_record.execute({
    entity: "deals",
    updates: [{ id: deal.deal_id, fields: { stage: "proposal" } }],
  });
  expect(result.success).toBe(true);

  // The stage change should have created an interaction.
  const { data: interactions } = await supabase
    .from("interactions")
    .select("*")
    .eq("client_id", clientId)
    .eq("deal_id", deal.deal_id)
    .eq("type", "stage_change");

  expect(interactions).toHaveLength(1);
  expect(interactions![0].summary).toMatch(/leads.*proposal/i);
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

In `updateOne`, after the existing `deal_stage_changed` analytics block:

```ts
// Auto-log stage transition as an interaction (P10 — mirror crm.cli).
if (entity === "deals" && updates.stage && previousStage && previousStage !== data.stage) {
  await supabase.from("interactions").insert({
    client_id: clientId,
    deal_id: recordId,
    type: "stage_change",
    summary: `Stage changed from ${previousStage} to ${data.stage}`,
    occurred_at: new Date().toISOString(),
  });
}
```

**Note:** `stage_change` needs to be a valid interaction type in the CRM config vocabulary. If the existing `interaction_types` enum doesn't include it, add it in the default config:

```ts
// src/lib/crm/config.ts — in CRM_DEFAULTS
interaction_types: [..., "stage_change"],
```

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/update-record.ts src/lib/crm/config.ts src/lib/runner/tools/crm/__tests__/update-record.test.ts
git commit -m "feat(crm-guardrails): auto-log deal stage transitions as interactions (P10)"
```

---

## Task 15: Work email → suggest company (P16)

**Why:** Today when the agent creates a contact with `jane@acmecorp.com`, it doesn't know to also create or link the "Acme Corp" company. The practitioner often has to prompt it separately. Twenty automatically does this.

**Files:**

- Modify: `src/lib/runner/tools/crm/create-record.ts` (in `execute`, after successful contact creation, auto-link company by domain)

**Step 1: Write the failing test**

```ts
it("suggests linking an existing company when contact is created with work email", async () => {
  const company = await seedCompany({ name: "Acme Corp", website: "acme.com" });

  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Jane", last_name: "Doe", email: "jane@acme.com" }],
  });

  expect(result.success).toBe(true);
  if (result.success && "record" in result) {
    const contact = result.record as { company_id?: string | null };
    expect(contact.company_id).toBe(company.company_id);
  }
});

it("does not link company for free email providers", async () => {
  const { create_record } = createCreateRecordTool(supabase, clientId);
  const result = await create_record.execute({
    entity: "contacts",
    records: [{ first_name: "Jane", last_name: "Doe", email: "jane@gmail.com" }],
  });

  expect(result.success).toBe(true);
  if (result.success && "record" in result) {
    const contact = result.record as { company_id?: string | null };
    expect(contact.company_id).toBeFalsy();
  }
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement**

After a successful single-contact create in `execute`:

```ts
// After successful contact insert, if email is a work email and no company
// is explicitly set, look up a company by matching website domain and link.
if (entity === "contacts" && data && !data.company_id) {
  const email = data.email as string | null;
  const domain = email ? extractEmailDomain(email) : null;
  if (domain && !isFreeEmailDomain(domain)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matches } = await (supabase as any)
      .from("companies")
      .select("company_id, website")
      .eq("client_id", clientId)
      .or(`website.eq.${domain},website.eq.www.${domain}`)
      .limit(1);

    const company = (matches ?? [])[0];
    if (company?.company_id) {
      await supabase
        .from("contacts")
        .update({ company_id: company.company_id })
        .eq("contact_id", data.contact_id)
        .eq("client_id", clientId);
      // Update the returned data so the tool reflects the linkage.
      data.company_id = company.company_id;
    }
  }
}
```

**Note:** This only **links** to an existing company, it does **not** auto-create one. Auto-creation would surprise users. If no matching company exists, the contact is created without a company (current behaviour). If the agent wants to create the company too, it can do so explicitly.

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/create-record.ts src/lib/runner/tools/crm/__tests__/create-record.test.ts
git commit -m "feat(crm-guardrails): auto-link existing company by work email domain (P16)"
```

---

# Phase F — Polish

## Task 16: Flexible date input (P23)

**Why:** Our `flexibleTimestampSchema` only accepts ISO-8601 or YYYY-MM-DD. Agents sometimes output `"April 10, 2026"`, `"10/04/2026"`, `"2026.04.10"`. These currently fail silently or with unhelpful errors.

**Files:**

- Modify: `src/lib/runner/tools/crm/filter-utils.ts` (or wherever `normalizeDateString` lives)
- Test: existing date-handling tests

**Step 1: Write the failing tests**

```ts
it("parses common date formats", () => {
  expect(normalizeDateString("2026-04-10")).toBe("2026-04-10T00:00:00Z");
  expect(normalizeDateString("04/10/2026")).toBe("2026-04-10T00:00:00Z");
  expect(normalizeDateString("April 10, 2026")).toBe("2026-04-10T00:00:00Z");
  expect(normalizeDateString("10 Apr 2026")).toBe("2026-04-10T00:00:00Z");
});
```

**Step 2: Run — confirm failure**

**Step 3: Implement with date-fns**

(date-fns is already a transitive dep — check `package.json`. If not, `npm install date-fns --legacy-peer-deps`.)

```ts
import { parse, isValid, formatISO } from "date-fns";

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "MM-dd-yyyy",
  "dd-MM-yyyy",
  "MMMM d, yyyy",
  "MMM d, yyyy",
  "d MMM yyyy",
  "d MMMM yyyy",
];

export function normalizeDateString(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  // Try ISO-8601 first.
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  // Try each format.
  for (const fmt of DATE_FORMATS) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed)) {
      return formatISO(parsed);
    }
  }

  return value; // Fall through; let downstream handling deal with it.
}
```

**Step 4: Run — confirm pass**

**Step 5: Commit**

```bash
git add src/lib/runner/tools/crm/filter-utils.ts src/lib/runner/tools/crm/__tests__/
git commit -m "feat(crm-guardrails): accept flexible date formats via date-fns (P23)"
```

---

## Task 17: Update the guardrails tracker — mark shipped

**Why:** Keep the tracker synced with reality.

**Files:**

- Modify: `roadmap docs/Sunder - Source of Truth/references/crm-cli/guardrails-tracker.md`

**Step 1: Move completed items from Proposed to Shipped**

Update the Shipped table at the top of the tracker with each completed item and today's date. Remove corresponding entries from the Proposed section.

**Step 2: Commit**

```bash
git add "roadmap docs/Sunder - Source of Truth/references/crm-cli/guardrails-tracker.md"
git commit -m "docs(crm-guardrails): mark phase 1 items as shipped in tracker"
```

---

# Verification — full test suite

After all tasks are complete, run the full suite to catch regressions:

```bash
npx vitest run
```

Expected: all tests pass. If any unrelated test fails, investigate — the changes in this plan should not affect non-CRM code paths.

Then type-check:

```bash
npx tsc --noEmit
```

Expected: no errors.

---

# Out of scope (for this phase)

The following guardrails from the tracker are deliberately **not** in this plan and should be handled separately:

| # | Why not |
|---|---------|
| **P3 (delete warnings)** | Mostly superseded by P15 (soft delete). Revisit after P15 ships. |
| **P6 (social handle extraction)** | Needs dedicated social columns first. Today we'd be normalising into custom fields, which is premature. |
| **P15 (soft delete / trash)** | Schema change, migration risk, every query needs `deleted_at IS NULL` filter. Deserves its own plan. |
| **P17 (multi-phone / multi-email)** | Schema overhaul. Tools, queries, UI all affected. Own plan. |
| **P18 (participant matching)** | Depends on P17. |
| **P19 (blocklist)** | Only relevant when email/calendar integration ships. File now, build later. |
| **P22 (actor source on records)** | Requires migration, unclear value until we build trust-calibration features. Phase 2. |
| **P12 (entity merge)** | Revisit only if duplicates actually slip through the improved dedup. |
| **P13 (pre-flight FK checks)** | Low priority — DB already catches it with worse error messages. |

---

# Summary

14 guardrails across 17 tasks. All are additive, none require schema upheaval, and each ships in an independent commit with full test coverage. Total estimated effort: **6–8 hours of focused work** for a developer with context on the codebase, **2–3 days** for someone starting fresh.

The ordering is chosen so each phase builds on the previous one: bugfixes first (no dependencies), then normalisation (new packages), then domain-aware logic (uses normalisation), then custom field enforcement (uses validation patterns), then enrichment (uses everything). Each task is independently committable and reviewable.
