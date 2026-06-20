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
| 3 | Email format validation | 2026-04-11 | cli |
| 4 | Deal value/probability bounds on update | 2026-04-11 | cli gap |
| 5 | NaN/Infinity rejection on number fields | 2026-04-11 | twenty |
| 6 | Email uniqueness across contacts | 2026-04-11 | cli |
| 7 | Website URL normalisation | 2026-04-11 | cli |
| 8 | Select option uniqueness on custom field config | 2026-04-11 | twenty |
| 9 | Phone digit-based fallback matching in dedup | 2026-04-11 | cli |
| 10 | Shared email domain as dedup signal | 2026-04-11 | cli |
| 11 | Custom field value validation against definitions | 2026-04-11 | ours |
| 12 | Required custom field enforcement on create | 2026-04-11 | ours |
| 13 | Stage transition auto-logging as interaction | 2026-04-11 | cli |
| 14 | Auto-suggest company from work email domain | 2026-04-11 | twenty |
| 15 | Flexible date input (multiple formats) | 2026-04-11 | twenty |

---

## Build list — ranked by value vs effort

| Rank | # | Guardrail | Source | Effort | Why this order |
|------|---|-----------|--------|--------|----------------|
| 1 | P15 | Soft delete / trash with restore | twenty | L | Biggest UX win. Makes P3 mostly redundant. Schema change. |
| 2 | P3 | Delete warns about linked records | ours | M | Pre-query count before delete. Partially superseded by P15. |
| 3 | P22 | Actor source on records (agent/manual/import) | twenty | M | Stamp how each record was created. Trust calibration. |
| 4 | P6 | Social handle extraction from URLs | cli | M | LinkedIn URL → clean handle. Needs dedicated columns. |
| 5 | P18 | Participant auto-matching (email → contact) | twenty | L | Link meeting/email participants to CRM contacts automatically. |
| 6 | P17 | Multiple phones and emails per contact | twenty | XL | Schema change. Right model. Not now. |
| 7 | P12 | Entity merge | cli | L | Revisit when duplicates slip through. Not yet. |
| 8 | P19 | Blocklist of emails/domains | twenty | M | Only relevant when we add email/calendar integration. |
| 9 | P11 | Interaction immutability (policy) | cli | — | Already the case. Document, don't build. |
| 10 | P13 | Pre-flight FK existence checks | ours | S | Low priority — DB already catches it. |

---

## Proposals (full detail)

### P3. Delete warns about linked records `[ours]`

**Problem:** Deleting a contact silently cascade-deletes `deal_contacts`. Interactions orphaned. No warning.

**Partially superseded by P15** (soft delete makes this less critical). If P15 is built first, this becomes "show count in the trash confirmation" rather than a hard requirement.

**Fix (standalone):** Before deleting, count linked deals/interactions/tasks/notes and return the count. Agent surfaces it via `ask_user_question`.

---

### P6. Social handle extraction from URLs `[cli]`

**Problem:** `linkedin: "https://linkedin.com/in/janedoe"` stored verbatim. Can't match against `janedoe`.

**Fix:** Regex extraction for LinkedIn, X, Instagram on write. Strip `@`. Store canonical handle. Requires dedicated columns (not custom fields) to enforce uniqueness. Lower priority until social columns are added to the schema.

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

### P15. Soft delete / trash with restore `[twenty]`

**Problem:** Deleting a record is permanent. Wrong delete = lost history.

**Fix:** Add `deleted_at` to contacts, companies, deals. Soft-delete by default (set `deleted_at`, exclude from queries). Expose `restore_record` tool. Nightly cron hard-deletes records older than 30 days. Also handles P3 — if deletion is reversible, warnings matter less.

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

### P22. Actor source on records `[twenty]`

**Problem:** We know who created a record (timeline captures agent vs user), but the record itself doesn't carry that information. Can't easily query "all contacts created by the agent vs manually by the user."

**Fix:** Add a `created_by` field to contacts, companies, deals — values: `"agent"`, `"user"`, `"import"`. Populate in the tool layer. Enables future trust-calibration features ("the agent created this contact, treat it as unverified until the user confirms").

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
