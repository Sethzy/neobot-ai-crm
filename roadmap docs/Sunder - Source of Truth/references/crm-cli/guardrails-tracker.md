# CRM Guardrails Tracker

> Inspired by crm.cli's "enforces structure, then gets out of the way" philosophy.
> Tracking what's done and what's proposed for Sunder's CRM data quality layer.
>
> Sources: **cli** = crm.cli source · **twenty** = Twenty CRM source · **ours** = identified from Sunder audit

---

## Shipped

| # | Guardrail | Date | Source |
|---|-----------|------|--------|
| 1 | Phone normalisation (E.164) | 2026-04-07 | cli |
| 2 | Multi-signal duplicate detection (name OR email OR phone) | 2026-04-07 | cli |

---

## Build list — ranked by value vs effort

| Rank | # | Guardrail | Source | Effort | Why this order |
|------|---|-----------|--------|--------|----------------|
| 1 | P1 | Email format validation | cli | XS | One Zod line. Prevents silently stored garbage. |
| 2 | P14 | Deal value/probability bounds on update | cli gap | XS | One block in update_record. Both codebases have the bug. |
| 3 | P20 | NaN/Infinity rejection on number fields | twenty | XS | Guard amount/probability against JS numeric edge cases. |
| 4 | P2 | Email uniqueness across contacts | cli | S | Soft-block variant of existing dedup. High dedup coverage gain. |
| 5 | P4 | Website URL normalisation | cli | S | normalize-url already installed. Wire into company row builder. |
| 6 | P21 | Select option uniqueness on custom field config | twenty | S | Prevent duplicate options in crm_config select fields. |
| 7 | P7 | Phone digit-based fallback matching in dedup | cli | S | Catches unparseable numbers in the dedup check. |
| 8 | P5 | Shared email domain as dedup signal | cli | M | Catches "same company, similar name" pairs. Needs PSL parsing. |
| 9 | P15 | Soft delete / trash with restore | twenty | L | Biggest UX win. Makes P3 mostly redundant. Schema change. |
| 10 | P3 | Delete warns about linked records | ours | M | Pre-query count before delete. Partially superseded by P15. |
| 11 | P9 | Required custom field enforcement on create | ours | M | Check required: true fields on create_record. |
| 12 | P8 | Custom field value validation against definitions | ours | M | Validate select options, date format, numeric type on write. |
| 13 | P10 | Stage transition auto-logging as interaction | cli | M | Auto-create interaction on deal stage change. Audit trail. |
| 14 | P22 | Actor source on records (agent/manual/import) | twenty | M | Stamp how each record was created. Trust calibration. |
| 15 | P16 | Auto-suggest company from work email domain | twenty | M | Parse domain from work email, suggest/link company. |
| 16 | P6 | Social handle extraction from URLs | cli | M | LinkedIn URL → clean handle. Needs dedicated columns. |
| 17 | P23 | Flexible date input (multiple formats) | twenty | S | Accept MM/dd/yyyy etc. via date-fns. Agent outputs vary. |
| 18 | P18 | Participant auto-matching (email → contact) | twenty | L | Link meeting/email participants to CRM contacts automatically. |
| 19 | P17 | Multiple phones and emails per contact | twenty | XL | Schema change. Right model. Not now. |
| 20 | P12 | Entity merge | cli | L | Revisit when duplicates slip through. Not yet. |
| 21 | P19 | Blocklist of emails/domains | twenty | M | Only relevant when we add email/calendar integration. |
| 22 | P11 | Interaction immutability (policy) | cli | — | Already the case. Document, don't build. |
| 23 | P13 | Pre-flight FK existence checks | ours | S | Low priority — DB already catches it. |

---

## Proposals (full detail)

### P1. Email format validation `[cli]`

**Problem:** Agent can save `email: "not an email"`. No format check in tool, Zod schema, or DB.

**Fix:** Add `z.string().email()` to Zod schemas for contacts and companies. Lowercase before storage. DB CHECK constraint as safety net.

---

### P2. Email uniqueness across contacts `[cli]`

**Problem:** Two contacts can share the same email. The shipped dedup surfaces matches but doesn't block — and doesn't check on updates.

**Fix:** On create and update, if email already belongs to another contact, soft-block: return existing record with "email already belongs to {name}". Agent decides whether to update or force.

---

### P3. Delete warns about linked records `[ours]`

**Problem:** Deleting a contact silently cascade-deletes `deal_contacts`. Interactions orphaned. No warning.

**Partially superseded by P15** (soft delete makes this less critical). If P15 is built first, this becomes "show count in the trash confirmation" rather than a hard requirement.

**Fix (standalone):** Before deleting, count linked deals/interactions/tasks/notes and return the count. Agent surfaces it via `ask_user_question`.

---

### P4. Website URL normalisation `[cli]`

**Problem:** `https://www.acme.com/?utm=blah` and `acme.com` stored as different values. Dedup breaks.

**Fix:** `normalize-url` on company `website` field in create and update row builders. Same pattern as phone normalisation. Strip protocol, www, query params, trailing slash. Preserve path.

---

### P5. Shared email domain as dedup signal `[cli]`

**Problem:** Two contacts with similar names and matching corporate email domain (e.g. both `@acme.com`) aren't flagged as possible duplicates.

**Fix:** In `findDuplicateContacts`, if incoming email domain matches an existing contact's email domain (excluding free providers — gmail, yahoo, hotmail, outlook), and name similarity > 0.3, surface as a dedup candidate. Use `psl` library for correct domain extraction (so `jane@mail.acme.co.uk` → `acme.co.uk`).

---

### P6. Social handle extraction from URLs `[cli]`

**Problem:** `linkedin: "https://linkedin.com/in/janedoe"` stored verbatim. Can't match against `janedoe`.

**Fix:** Regex extraction for LinkedIn, X, Instagram on write. Strip `@`. Store canonical handle. Requires dedicated columns (not custom fields) to enforce uniqueness. Lower priority until social columns are added to the schema.

---

### P7. Phone digit-based fallback in dedup `[cli]`

**Problem:** If `normalizePhone()` returns null (ambiguous number, no country code), the dedup phone check silently skips. A partial number like `555-1234` never matches.

**Fix:** If normalisation fails, extract raw digits. Match against last 7+ digits of stored E.164 values. Catches partial numbers that can't be fully parsed.

---

### P8. Custom field value validation against definitions `[ours]`

**Problem:** `crm_config` defines custom fields with types (`select`, `date`, `number`) and valid options. None enforced. Agent can set a select field to any string.

**Fix:** On create/update, build a validator from the client's custom field definitions. Select fields must match configured options. Date fields must parse as dates. Number fields must be numeric. Reject with "valid options are: [...]".

---

### P9. Required custom field enforcement on create `[ours]`

**Problem:** Custom field definitions have `required: true`. Flag is ignored. Agent creates records with required fields missing.

**Fix:** On `create_record`, check all custom fields marked `required: true` are present in input. Return validation error listing missing fields. Don't block updates (only creation).

---

### P10. Stage transition auto-logging `[cli]`

**Problem:** When a deal moves stage, we fire a PostHog event. No CRM-visible history. Can't see when a deal moved or through which stages.

**Fix:** In `update_record`, when a deal's stage changes, auto-create an interaction record: `type: "stage_change"`, `summary: "Stage changed from {old} to {new}"`. Timeline already captures this but not in interaction history.

---

### P11. Interaction immutability (policy) `[cli]`

**Already the case** — no `update_interaction` tool exists. Document this as a design decision. If corrections are needed, add a new interaction rather than editing the original.

---

### P12. Entity merge `[cli]`

When duplicates slip through, merge two records: combine arrays, pick best values, relink all deals/interactions to the winner, delete the loser. Not building yet — dedup is now much stronger. Revisit if duplicates appear in practice.

---

### P13. Pre-flight FK existence checks `[ours]`

Agent links contact to non-existent deal → raw Postgres FK error. Low priority — the DB catches it. Fix: verify both IDs exist before linking, return clear error.

---

### P14. Deal value/probability bounds on update `[cli gap]`

**Problem:** `create_record` validates `amount >= 0` and `probability 0–100`. `update_record` doesn't. Agent can set `probability: 500` on update.

**Fix:** Add same bounds checks in `update_record` for deal fields. One block, five minutes.

---

### P15. Soft delete / trash with restore `[twenty]`

**Problem:** Deleting a record is permanent. Wrong delete = lost history.

**Fix:** Add `deleted_at` to contacts, companies, deals. Soft-delete by default (set `deleted_at`, exclude from queries). Expose `restore_record` tool. Nightly cron hard-deletes records older than 30 days. Also handles P3 — if deletion is reversible, warnings matter less.

---

### P16. Auto-suggest company from work email domain `[twenty]`

**Problem:** Agent creates a contact with a work email, doesn't link a company. Practitioner has to prompt separately.

**Fix:** On `create_record` for contacts, if email is a work email (not in free-provider list), extract company domain using PSL, search for existing company by domain, suggest linking or auto-create. Free-provider list excludes gmail, yahoo, hotmail, and ~4,000 others.

---

### P17. Multiple phones and emails per contact `[twenty]`

**Problem:** One phone, one email per contact. Practitioners have clients with mobile + office, work + personal.

**Fix:** Schema change — `primary_phone` + `additional_phones` (JSON array), same for email. Not now. Right model for when we get there.

---

### P18. Participant auto-matching `[twenty]`

**Problem:** When a meeting is processed, the agent picks contact_id explicitly. Email addresses in transcripts or calendar events don't automatically resolve to CRM contacts.

**Fix:** A matching layer that, given an email address, searches contacts by primary email → returns the contact if found. Used by the meeting processing pipeline and future calendar integration. Already partly done for meetings but not generalised.

---

### P19. Blocklist of emails and domains `[twenty]`

Not relevant until email/calendar integration. When built: users can block `@competitor.com` or specific addresses from auto-importing as contacts.

---

### P20. NaN / Infinity rejection on number fields `[twenty]`

**Problem:** JavaScript allows `NaN` and `Infinity` as numbers. Our `amount` validates `>= 0` but not these edge cases. `NaN >= 0` is `false` so it's caught, but `Infinity >= 0` is `true` — `Infinity` would pass.

**Fix:** Add `Number.isFinite()` check alongside the existing bounds check. One line.

---

### P21. Select option uniqueness on custom field config `[twenty]`

**Problem:** When a client configures a custom select field, nothing prevents duplicate options: `["HDB", "HDB", "Condo"]`. Downstream validation against options would then be ambiguous.

**Fix:** In `configure_crm` tool (or CRM config validation), check `new Set(options).size === options.length`. Reject duplicates with a clear message.

---

### P22. Actor source on records `[twenty]`

**Problem:** We know who created a record (timeline captures agent vs user), but the record itself doesn't carry that information. Can't easily query "all contacts created by the agent vs manually by the user."

**Fix:** Add a `created_by` field to contacts, companies, deals — values: `"agent"`, `"user"`, `"import"`. Populate in the tool layer. Enables future trust-calibration features ("the agent created this contact, treat it as unverified until the user confirms").

---

### P23. Flexible date input `[twenty]`

**Problem:** Our `flexibleTimestampSchema` accepts ISO-8601 or YYYY-MM-DD. Agents sometimes output `"April 10, 2026"`, `"10/04/2026"`, `"2026.04.10"`. These fail silently or error.

**Fix:** Use `date-fns` `parse()` with multiple format patterns. Accept any unambiguous date string, normalise to ISO-8601 for storage.

---

## What we're NOT doing (and why)

| Idea | Source | Why |
|------|--------|-----|
| FUSE / filesystem mount | cli | Cloud-first. No local filesystem. |
| Pre/post mutation hooks | cli | `agent_triggers` + approval gate covers this. |
| SQLite / single-file DB | cli | Multi-tenant Supabase is correct at our scale. |
| Valid stage transition graph | cli | Advisory sales has no rigid pipeline order. |
| Hard-block on all duplicates | cli | Soft-block with candidates is better for an agent. |
| Flexible entity resolution by any signal | cli | Our agent uses UUIDs from search results. Revisit if we expose CRM to external integrations. |
| Auto-create on link | cli | Implicit creation = surprise records. Agent should create explicitly. |
| Phone as structured composite | twenty | Right long-term model. Deferred until P17. |
| Throttling / token bucket | twenty | Infrastructure concern, not CRM data quality. |
| GraphQL depth limiting | twenty | Architecture concern, not applicable. |
| ClickHouse audit streaming | twenty | We use Langfuse for observability. Not a gap. |
