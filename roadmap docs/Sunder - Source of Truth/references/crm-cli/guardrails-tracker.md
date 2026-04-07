# CRM Guardrails Tracker

> Inspired by crm.cli's "enforces structure, then gets out of the way" philosophy.
> Tracking what's done and what's proposed for Sunder's CRM data quality layer.

## Shipped

| # | Guardrail | Date | Notes |
|---|-----------|------|-------|
| 1 | **Phone normalisation (E.164)** | 2026-04-07 | All phone numbers stored in canonical +XXXXXXXXXXX format. DB CHECK constraint as safety net. |
| 2 | **Multi-signal duplicate detection** | 2026-04-07 | create_record checks name OR email OR phone before creating contacts/companies. Blocks with candidates. |

---

## Proposed

### Tier 1 — High value, low effort, prevents real data rot

#### P1. Email format validation

**Problem today:** The agent can save `email: "not an email"` or `email: "jane doe"` and Sunder stores it without question. No format check anywhere — not in the tool, not in the Zod schema, not in the database.

**What crm.cli does:** Basic check that the string contains `@` and doesn't start/end with it. Case-normalises for dedup matching.

**What we should do:** Add `z.string().email()` to the Zod schemas for contacts and companies, and lowercase emails before storage. This catches obvious garbage from the agent without being overly strict. DB CHECK constraint on format as a safety net.

**User experience:** Agent tries to save a bad email → gets a clear error instead of silently storing junk that later breaks email integrations or matching.

---

#### P2. Email dedup on contact creation

**Problem today:** Two contacts can have the same email address. If someone is added twice with different names but the same email, both records are created. Our multi-signal dedup (shipped today) checks email on create, but doesn't block if names differ significantly — and doesn't enforce email uniqueness at all on updates.

**What crm.cli does:** Hard-blocks duplicate emails across all contacts (case-insensitive). You physically cannot have two people with the same email.

**What we should do:** Add a soft-block: when creating a contact with an email that already belongs to another contact, return the existing record and let the agent decide whether to update or force-create. Similar to how we already return `possible_duplicates`.

**User experience:** Agent tries to add "Jane Smith, jane@acme.com" but "Jane Doe, jane@acme.com" already exists → agent is told "this email already belongs to someone" instead of silently creating a duplicate.

---

#### P3. Delete warns about linked records before proceeding

**Problem today:** The agent can delete a contact that's linked to 10 deals and has 50 interactions. All the `deal_contacts` rows are silently cascade-deleted by the database. The interactions are orphaned. Nobody is warned.

**What crm.cli does:** Pre-delete hooks can reject the operation. Activities referencing a deleted contact keep the orphaned ID (intentional — preserves history).

**What we should do:** Before deleting, count linked records (deals, interactions, tasks, notes) and return a summary in the tool response: "This contact is linked to 3 deals and 12 interactions. Confirm?" The agent can then use `ask_user_question` to confirm with the user, or proceed if it has context. No hard block — just visibility.

**User experience:** Agent deletes a contact → instead of silent cascade, gets told "this will affect 3 deals and 12 interactions, proceed?" The agent can surface this to the user.

---

#### P4. Website / URL normalisation

**Problem today:** The agent stores URLs exactly as entered: `https://www.acme.com/`, `acme.com`, `http://acme.com` are all different records. Can't search or dedup reliably.

**What crm.cli does:** `normalize-url` strips protocol, `www.`, query params, trailing slash, hash. `acme.com` is the canonical form.

**What we should do:** Normalise the `website` field on company create/update, same pattern as phone normalisation. Use `normalize-url` or a lightweight equivalent.

**User experience:** Agent saves `https://www.acme.com/?utm=blah` → stored as `acme.com`. Later when checking for duplicates, matching works.

---

### Tier 2 — Medium value, medium effort, prevents subtle problems

#### P5. Social handle extraction from URLs

**Problem today:** If the agent saves `linkedin: "https://linkedin.com/in/janedoe"`, that's exactly what gets stored as a text string. It can't be matched against a later reference to `janedoe` or `linkedin.com/in/jane-doe`.

**What crm.cli does:** Regex patterns extract the handle from full URLs for LinkedIn, X, Bluesky, and Telegram. `https://linkedin.com/in/janedoe` → `janedoe`. Strips leading `@`. Stores canonical handles with UNIQUE indexes per platform.

**What we should do:** Add normalisation for LinkedIn and X URLs in custom fields or dedicated columns. Extract handle from URL, strip `@`, lowercase. If we don't have dedicated columns for social handles yet, this is lower priority — but when we do, normalise from day one.

**User experience:** Agent saves a LinkedIn profile URL → stored as clean handle → searchable, matchable, no duplicates.

---

#### P6. Custom field validation against definitions

**Problem today:** CRM config defines custom fields with types (`text`, `select`, `date`, `number`) and for select fields, a list of valid options. None of this is enforced. The agent can set a "select" custom field to any value, set a "date" field to "banana", set a "number" field to "hello".

**What crm.cli does:** Custom fields are typed via a `json:` prefix for parsing, but no schema validation against definitions. They got this wrong too.

**What we should do:** On create/update, if the client's CRM config defines custom fields, validate values against their types and options. Select fields must match an option. Date fields must look like dates. Number fields must be numeric. Reject with a clear error.

**User experience:** Agent tries to set `property_type: "mansion"` but the configured options are `["hdb", "condo", "landed"]` → gets told the valid options instead of storing an invalid value.

---

#### P7. Required custom field enforcement

**Problem today:** Custom field definitions have a `required: true` flag. It does nothing. The agent can create a record with required custom fields missing.

**What crm.cli does:** Doesn't enforce this either.

**What we should do:** On record creation, check if any custom fields marked `required: true` are missing from the input. If so, return a validation error listing which fields are needed. Don't block updates (only creation).

**User experience:** Agent creates a deal without filling in `expected_commission` (marked required) → gets told which fields it missed. Prevents incomplete records from entering the CRM.

---

#### P8. Interaction immutability (append-only)

**Problem today:** Interactions (calls, meetings, emails logged to CRM) can theoretically be updated after creation. There's no update tool for them currently, but there's no guard preventing one from being added later. The audit trail can be rewritten.

**What crm.cli does:** Activities have no `updated_at` column. No edit command exists. Enforced by schema design.

**What we should do:** This is already the de facto state (no update tool for interactions). The guardrail is: don't add one. If corrections are needed, the pattern should be "add a correction note" rather than "edit the original". Document this as a design decision.

**User experience:** No change — just a documented commitment. If someone asks "can we edit past interactions?", the answer is "no, by design."

---

### Tier 3 — Nice to have, revisit later

#### P9. Stage transition logging

**Problem today:** When a deal moves from "leads" to "proposal", we capture a PostHog analytics event. But there's no CRM-visible record of stage changes. You can't look at a deal's history and see "it moved from X to Y on this date."

**What crm.cli does:** Every stage change is automatically logged as an `activity` with type `stage-change`. This creates a full audit trail visible in the CRM.

**What we should do:** When `update_record` changes a deal's stage, auto-create an interaction record: "Stage changed from {old} to {new}". Timeline already captures this, but it's not visible in the CRM's interaction history.

**User experience:** Looking at a deal → can see every stage transition as a timestamped event, not just the current stage.

---

#### P10. Entity merge capability

**Problem today:** If duplicates slip through (despite the improved detection), there's no way to merge them. You have to manually transfer data, relink deals, and delete one. The agent has no merge tool.

**What crm.cli does:** `crm merge` combines two records — merges arrays, picks the best values, relinks every deal/activity/reference to the surviving entity, then deletes the loser.

**What we should do:** Not yet — our duplicate detection is now much stronger. Revisit if we see duplicates actually slipping through in practice. A merge tool is complex (reference relinking, conflict resolution) and premature until there's evidence of the problem.

---

#### P11. Pre-flight FK existence checks

**Problem today:** The agent can try to link a contact to a deal that doesn't exist (typo'd UUID). The database catches it with a foreign key error, but the error message is a raw Postgres constraint violation — not a clear "this deal doesn't exist."

**What we should do:** Before linking records, verify both IDs exist in the same client. Return a clear error. Low priority because the agent rarely gets UUIDs wrong.

---

## What we're NOT doing (and why)

| Idea | Why skip |
|------|----------|
| **FUSE / filesystem mount** | We're cloud-first (Supabase). There's no local filesystem. |
| **Pre/post mutation hooks** | Our `agent_triggers` system + approval gate already cover this. |
| **SQLite / single-file DB** | Multi-tenant cloud with RLS is the right call at our scale. |
| **Valid stage transition graph** | Advisory sales doesn't have rigid pipelines. Any stage → any stage is correct for our users. |
| **Hard-block on all duplicates** | Soft-block with candidate surfacing is better for an agent. Hard blocks create friction on edge cases. |
