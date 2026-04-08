# CRM Guardrails Tracker

> Inspired by crm.cli's "enforces structure, then gets out of the way" philosophy.
> Tracking what's done and what's proposed for Sunder's CRM data quality layer.
>
> Source column: **cli** = found in crm.cli source, **ours** = identified from Sunder audit

## Shipped

| # | Guardrail | Date | Source | Notes |
|---|-----------|------|--------|-------|
| 1 | **Phone normalisation (E.164)** | 2026-04-07 | cli | All phone numbers stored in canonical +XXXXXXXXXXX format. DB CHECK constraint as safety net. |
| 2 | **Multi-signal duplicate detection** | 2026-04-07 | cli | create_record checks name OR email OR phone before creating contacts/companies. Blocks with candidates. |

---

## Proposed

### Tier 1 — High value, low effort, prevents real data rot

#### P1. Email format validation `[cli]`

**Problem today:** The agent can save `email: "not an email"` and Sunder stores it. No format check anywhere.

**What crm.cli does:** `validateEmail()` in `helpers.ts:163` — checks string contains `@` and doesn't start/end with it. Emails are lowercased for all dedup comparisons.

**What we should do:** Add `z.string().email()` to Zod schemas for contacts and companies. Lowercase before storage. DB CHECK as safety net.

**User experience:** Agent tries to save bad email → gets a clear error instead of silently storing junk.

---

#### P2. Email uniqueness across contacts `[cli]`

**Problem today:** Two contacts can have the same email. The multi-signal dedup (shipped) surfaces matches, but doesn't hard-block it — and doesn't check on updates.

**What crm.cli does:** `checkDupeEmail()` in `helpers.ts:169` — scans all contacts, case-insensitive. Hard-blocks with "already belongs to {name} ({id})". Runs on both add and edit.

**What we should do:** Soft-block: when creating or updating a contact with an email already belonging to another contact, return the existing record. Agent decides whether to update, merge, or force-create.

**User experience:** "Jane Smith, jane@acme.com" blocked if "Jane Doe, jane@acme.com" already exists. Agent is told who owns that email.

---

#### P3. Delete warns about linked records `[ours]`

**Problem today:** Deleting a contact silently cascade-deletes `deal_contacts`. Interactions orphaned. No warning.

**What crm.cli does:** `confirmOrForce()` in `helpers.ts:58` — requires `--force` flag or interactive `[y/N]` confirmation. Non-interactive calls are rejected outright. On contact delete (`contact.ts:418-431`), all deals are scanned and the contact ID is removed from their arrays.

**What we should do:** Before deleting, count linked deals/interactions/tasks/notes. Return the count in the tool response. Agent surfaces it to user via `ask_user_question`.

**User experience:** Agent told "this contact is linked to 3 deals and 12 interactions" before proceeding.

---

#### P4. Website / URL normalisation `[cli]`

**Problem today:** URLs stored verbatim. `https://www.acme.com/` and `acme.com` are different.

**What crm.cli does:** `normalizeWebsite()` in `normalize.ts:92` uses `normalize-url` with: `stripProtocol`, `stripWWW`, `removeQueryParameters`, `stripHash`, `removeSingleSlash`. Preserves path (because `globex.com/research` ≠ `globex.com/consulting`). Company dedup (`checkDupeWebsite()` in `helpers.ts:211`) enforces uniqueness.

**What we should do:** Same normalisation on company `website` field, create and update paths.

---

#### P5. Shared email domain as dedup signal `[cli]`

**Problem today:** Our dedup checks exact name match OR exact email OR exact phone. Two people at the same company with similar names aren't flagged.

**What crm.cli does:** `contactDupeReasons()` in `dupes.ts:158-181` — if two contacts have similar names (score ≥ 0.3) AND share a corporate email domain (excluding gmail, yahoo, hotmail, outlook), it's flagged as a signal. Weighted at +0.15.

**What we should do:** Add to our dedup logic: if the incoming email shares a domain with an existing contact (and that domain isn't a free provider), and name similarity is above threshold, flag it.

**User experience:** Agent adds "J. Smith, jsmith@acme.com" when "Jane Smith, jane@acme.com" already exists → flagged as possible duplicate (shared domain + similar name).

---

### Tier 2 — Medium value, medium effort

#### P6. Social handle extraction from URLs `[cli]`

**Problem today:** Agent stores `linkedin: "https://linkedin.com/in/janedoe"` as-is. Can't match against `janedoe`.

**What crm.cli does:** `normalizeSocialHandle()` in `normalize.ts:113` — 4 regex patterns for LinkedIn, X, Bluesky, Telegram. Extracts handle from URL, strips `@`. Uniqueness enforced via SQLite UNIQUE indexes per platform. `checkDupeSocial()` in `helpers.ts:230` prevents duplicate handles.

**What we should do:** Add normalisation for LinkedIn/X custom fields. Extract handle from URL, strip `@`, lowercase.

---

#### P7. Phone digit-based fallback matching `[cli]`

**Problem today:** Our dedup uses exact E.164 comparison. If the incoming number isn't parseable (no country code, unusual format), it misses the match entirely.

**What crm.cli does:** `phoneMatchesByDigits()` in `normalize.ts:76` — if E.164 lookup fails, extracts raw digits and checks if last 7+ digits match. So `555-1234` finds `+12125551234`. Used in `resolveContact()` as a fallback after strict E.164 matching.

**What we should do:** Add digit-based fallback to our dedup phone comparison. If `normalizePhone()` returns null (unparseable), extract digits and try suffix matching against stored E.164 values.

---

#### P8. Custom field validation against definitions `[ours]`

**Problem today:** CRM config defines fields with types (`text`, `select`, `date`, `number`) and valid options. None enforced. Agent can set `property_type: "mansion"` when options are `["hdb", "condo", "landed"]`.

**What crm.cli does:** Doesn't enforce this either. Custom fields are untyped `json:` prefix only.

**What we should do:** On create/update, validate custom field values against their type definitions and options. Reject with available options listed.

---

#### P9. Required custom field enforcement `[ours]`

**Problem today:** `required: true` flag in custom field definitions does nothing. Agent creates records with required fields missing.

**What crm.cli does:** Doesn't enforce this.

**What we should do:** On creation, check required custom fields. Return validation error listing missing fields. Don't block updates.

---

#### P10. Stage transition auto-logging `[cli]`

**Problem today:** Deal stage changes fire PostHog analytics. No CRM-visible history.

**What crm.cli does:** `deal move` in `deal.ts:389-406` — creates an activity with `type: 'stage-change'` and `body: "from {old} to {new}"`. `dealDetail()` in `helpers.ts:368-386` reconstructs full `stage_history` from these activity records. Reports (`computeVelocity`, `computeConversion`) query these activities for pipeline metrics.

**What we should do:** When `update_record` changes a deal's stage, auto-create an interaction: "Stage changed from {old} to {new}". Timeline captures this already, but it's not in the CRM interaction history.

---

#### P11. Interaction immutability `[cli]`

**Problem today:** No update tool for interactions exists (correct), but there's no guard preventing one from being added.

**What crm.cli does:** Activities have no `updated_at` column. No edit command. Design decision documented in `data-model.md:71-77` — prevents retroactive audit trail corruption.

**What we should do:** Document as policy. Don't add an `update_interaction` tool.

---

### Tier 3 — Revisit later

#### P12. Entity merge capability `[cli]`

**What crm.cli does:** `contact merge` in `contact.ts:435-526` — combines arrays (emails, phones, companies, tags) with Set dedup. Merges custom fields (winner overrides on conflict). Social handles: winner preferred. **Critical step:** clears loser's social handles to avoid UNIQUE constraint conflict (line 466-470). Relinks all deals and activities to winner. Deletes loser. Rebuilds search index.

**What we should do:** Not yet. Our dedup is now stronger. Revisit if duplicates slip through.

---

#### P13. Pre-flight FK existence checks `[ours]`

**Problem today:** Agent links contact to non-existent deal → raw Postgres FK violation error.

**What we should do:** Verify IDs exist before linking. Return clear error. Low priority.

---

#### P14. Deal value/probability bounds on update `[cli gap]`

**Problem today (both codebases):** `deal add` validates value ≥ 0 and probability 0–100. `deal edit` doesn't. crm.cli has this same gap (`deal.ts:57-65` validates on add, lines 255-280 skip on edit).

**What we should do:** Add bounds validation in `update_record` for deals. Small.

---

## What we're NOT doing (and why)

| Idea | Source | Why skip |
|------|--------|----------|
| **FUSE / filesystem mount** | cli | Cloud-first (Supabase). No local filesystem. |
| **Pre/post mutation hooks** | cli | Our `agent_triggers` + approval gate already covers this. |
| **SQLite / single-file DB** | cli | Multi-tenant cloud with RLS at our scale. |
| **Valid stage transition graph** | cli | Advisory sales doesn't have rigid pipelines. Any → any is correct. |
| **Hard-block on all duplicates** | cli | Soft-block with candidates is better for an agent. |
| **Flexible entity resolution by any signal** | cli | Interesting pattern (`resolve.ts` — lookup by email, phone, social URL, digits, handle). Our agent uses UUIDs from search results. Not needed while the agent mediates all access. Worth revisiting if we expose CRM to external integrations. |
| **Auto-create on link** | cli | `getOrCreateCompanyId` auto-creates companies when linked by name. Our agent should explicitly create, not implicitly. Implicit creation = surprise records in the CRM. |
