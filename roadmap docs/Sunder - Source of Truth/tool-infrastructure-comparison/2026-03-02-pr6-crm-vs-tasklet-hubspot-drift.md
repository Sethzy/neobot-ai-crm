# PR6 CRM Tools vs Tasklet HubSpot Tools — Side-by-Side Drift Comparison

> Generated 2026-03-02. All Sunder descriptions extracted from `src/lib/runner/tools/crm/*.ts`.
> All Tasklet descriptions extracted from `roadmap docs/.../01-static-vs-pipedream-verbatim-comparison.md`.

---

## 1. Tool Inventory Comparison

| # | Tasklet HubSpot Tool | Sunder CRM Equivalent | Gap? |
|---|----------------------|----------------------|------|
| 1 | `hubspot_search_objects` | `search_contacts`, `search_deals`, `search_tasks` (3 separate tools) | **Structural drift** — Tasklet uses ONE generic search across all object types; Sunder splits into per-entity tools |
| 2 | `hubspot_batch_create_objects` | `create_contact`, `create_deal`, `create_interaction`, `create_task` (single-record only) | **Missing batch** — Tasklet creates N objects in 1 call; Sunder needs N tool calls |
| 3 | `hubspot_batch_read_objects` | _(none)_ | **Missing** — No way to fetch multiple records by ID in one call |
| 4 | `hubspot_batch_update_objects` | `update_contact`, `update_deal`, `update_task` (single-record only) | **Missing batch** — Same as create |
| 5 | `hubspot_list_objects` | _(covered by search tools with no query)_ | **Partial** — `search_deals` allows empty query, but `search_contacts` requires `query.min(1)` |
| 6 | `hubspot_get_schemas` | _(none)_ | **Missing** — LLM cannot discover available fields/types at runtime |
| 7 | `hubspot_batch_create_associations` | _(implicit via foreign keys)_ | **Structural drift** — Sunder uses `contact_id` FK on deals/tasks; no explicit association tools |
| 8 | `hubspot_get_association_definitions` | _(none)_ | **Missing** — LLM cannot discover relationship types |
| 9 | `hubspot_list_associations` | _(covered by search with FK filter)_ | **Partial** — `search_deals({ contact_id })` achieves this but less discoverable |
| 10 | `hubspot_get_lists` | _(none)_ | **Missing** — No list/segment concept in v1 CRM |
| 11 | `hubspot_get_list_memberships` | _(none)_ | **Missing** — No list concept |
| 12 | `hubspot_update_list_memberships` | _(none)_ | **Missing** — No list concept |
| 13 | `hubspot_create_list` | _(none)_ | **Missing** — No list concept |
| 14 | `hubspot_batch_delete_objects` | _(none)_ | **Missing** — No delete operations at all |
| 15 | `hubspot_batch_delete_associations` | _(none)_ | **Missing** — No delete/unlink operations |
| — | _(none)_ | `create_interaction` | **Sunder-only** — Tasklet logs interactions as HubSpot notes/calls/meetings objects; Sunder has a dedicated interaction entity |

### Summary

| Metric | Tasklet HubSpot | Sunder CRM |
|--------|----------------|------------|
| Total tools | 15 | 10 |
| Search tools | 1 (generic) | 3 (per-entity) |
| Create tools | 1 (batch, generic) | 4 (single-record, per-entity) |
| Read tools | 1 (batch by ID) | 0 |
| Update tools | 1 (batch, generic) | 3 (single-record, per-entity) |
| Delete tools | 2 (objects + associations) | 0 |
| Schema/discovery tools | 2 (schemas + association defs) | 0 |
| List/segment tools | 4 | 0 |
| Association tools | 3 | 0 (uses FK filters) |

---

## 2. Search Tools — Verbatim Description Comparison

### Tasklet: `hubspot_search_objects`

```
Performs advanced filtered searches across HubSpot object types using complex
criteria. Supports complex boolean logic through filter groups. Use this for
targeted data retrieval when exact filtering criteria are known. Filter groups
are combined with OR logic (ANY can match), while filters within a group are
combined with AND logic (ALL must match).
```

**Parameter `objectType`:**
```
The type of HubSpot object to search (e.g., contacts, companies, deals,
tickets, notes, tasks, calls, meetings, emails, products, line_items, quotes,
or custom objects, use objectTypeId (e.g., "2-123456") or fullyQualifiedName
(e.g., "p123_pets") from hubspot_get_schemas.
```

### Sunder: `search_contacts`

```
Search contacts by name, email, or phone. Optionally filter by contact type.
```

**Parameter `query`:**
```
Search term for name, email, or phone.
```

**Parameter `type`:**
```
Optional contact type filter.
```

**Parameter `limit`:**
```
Maximum results to return. Defaults to 20.
```

### Sunder: `search_deals`

```
Search deals by address or notes. Optionally filter by stage or contact id.
```

**Parameter `query`:**
```
Search term for address and notes.
```

### Sunder: `search_tasks`

```
Search CRM tasks. Optionally filter by status, contact id, or deal id.
```

### Why Tasklet's is better

| Dimension | Tasklet | Sunder | Recommendation |
|-----------|---------|--------|----------------|
| **Scope** | One tool searches ALL object types — LLM picks `objectType` | 3 separate tools — LLM must pick the right tool | Keep per-entity (simpler for our DB), but add cross-tool references in descriptions |
| **Boolean logic** | Explains OR/AND filter group semantics in plain language | No filter logic explanation | Add "searches across first_name, last_name, email, phone using OR matching" to description |
| **Cross-tool refs** | References `hubspot_get_schemas` for field discovery | No cross-references | Add "Use search_contacts first to get contact_id before creating deals" |
| **Inline examples** | Lists every searchable object type with examples | No examples | Add example queries: "e.g., 'John', 'john@gmail.com', '+6591234567'" |
| **When to use** | "Use this for targeted data retrieval when exact filtering criteria are known" | No usage guidance | Add "Use this to find existing contacts before creating new ones" |
| **Parameter descriptions** | Rich — lists all valid values, references other tools, shows format variants | Minimal — "Search term for name, email, or phone" | Expand parameter descriptions with examples and valid values |

---

## 3. Create Tools — Verbatim Description Comparison

### Tasklet: `hubspot_batch_create_objects`

```
Creates multiple HubSpot objects of the same objectType in a single API call,
optimizing for bulk operations. Data Modification Warning: This tool modifies
HubSpot data. Only use when the user has explicitly requested to update their
CRM.
```

### Sunder: `create_contact`

```
Create a new contact. Use this when the user shares details about a new person.
```

**Parameters:**
```
first_name — "Contact first name."
last_name  — "Contact last name."
email      — "Contact email address."
phone      — "Contact phone number."
type       — "Contact classification."
notes      — "Free-form contact notes."
```

### Sunder: `create_deal`

```
Create a new deal. Use this for new listings or opportunities.
```

**Parameters:**
```
address    — "Property address."
stage      — "Deal stage."
price      — "Deal price in whole units."
contact_id — "Associated contact id."
notes      — "Deal notes."
```

### Sunder: `create_interaction`

```
Record a CRM interaction such as a call, meeting, email, message, viewing, or note.
```

**Parameters:**
```
contact_id  — "Contact id linked to the interaction."
deal_id     — "Optional deal id linked to the interaction."
type        — "Interaction type."
summary     — "Interaction summary."
occurred_at — "ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."
```

### Sunder: `create_task`

```
Create a new CRM follow-up task.
```

**Parameters:**
```
title       — "Task title."
description — "Task description."
status      — "Task status."
due_date    — "ISO-8601 due timestamp or YYYY-MM-DD date."
contact_id  — "Associated contact id."
deal_id     — "Associated deal id."
```

### Why Tasklet's is better

| Dimension | Tasklet | Sunder | Recommendation |
|-----------|---------|--------|----------------|
| **Data modification warning** | Explicit: "Data Modification Warning: This tool modifies HubSpot data. Only use when the user has explicitly requested to update their CRM." | **None** — LLM can speculatively create records without user intent | **Add guard rail to ALL create/update tools**: "Data Modification Warning: Only create/update records when the user has explicitly asked to do so." |
| **Batch support** | Creates N objects in 1 tool call | 1 record per call — importing 10 contacts burns 10 of 8 max steps | Consider batch variants for v1.1; for now, document the limitation |
| **Parameter descriptions** | Generic but the schema discovery tool (`get_schemas`) provides field-level detail | Terse — "Contact first name." tells the LLM nothing about format, length, or valid values | Expand: `"Contact first name. Required. Example: 'John'."` |
| **Cross-tool refs** | N/A (generic tool) | `create_deal` doesn't mention searching for `contact_id` first | Add: "Use search_contacts to find the contact_id. If the contact doesn't exist, use create_contact first." |
| **When to use** | Implicit via guard rail | `create_contact` says "Use this when the user shares details about a new person" — good but only on one tool | Add contextual hints to all create tools |
| **occurred_at / due_date** | N/A (uses standard HubSpot timestamp fields) | Accepts ISO-8601 or YYYY-MM-DD, normalizes to UTC midnight | Add to description: "If only a date is given (YYYY-MM-DD), it defaults to midnight UTC. For Singapore timezone, pass full ISO-8601." |

---

## 4. Update Tools — Verbatim Description Comparison

### Tasklet: `hubspot_batch_update_objects`

_(No verbatim description available in reference docs — same pattern as batch_create with data modification warning.)_

### Sunder: `update_contact`

```
Update an existing contact by id. Use this after finding the contact via search_contacts.
```

**Parameters:**
```
contact_id — "UUID of the contact to update."
first_name — "Updated first name."
last_name  — "Updated last name."
email      — "Updated email or null to clear."
phone      — "Updated phone or null to clear."
type       — "Updated contact type."
notes      — "Updated notes or null to clear."
```

### Sunder: `update_deal`

```
Update an existing deal by id. Use this after finding the deal via search_deals.
```

### Sunder: `update_task`

```
Update an existing CRM task by id.
```

### Why Tasklet's is better

| Dimension | Tasklet | Sunder | Recommendation |
|-----------|---------|--------|----------------|
| **Data modification warning** | Present (assumed, same pattern as create) | **None** | Add guard rail |
| **Cross-tool reference** | N/A | `update_contact` says "Use this after finding the contact via search_contacts" — **this is good**, follows Tasklet's cross-ref pattern | Extend to `update_deal` ("after finding via search_deals") and `update_task` ("after finding via search_tasks") |
| **Null semantics** | Not documented in our reference | "Updated email or null to clear" — **this is good**, tells LLM how to clear fields | Keep this pattern |
| **Partial update docs** | Not documented | No mention that only provided fields are updated; omitted fields are untouched | Add: "Only provided fields are updated. Omit fields you don't want to change. Pass null to clear a field." |

---

## 5. Delete & Schema Tools — Gap Analysis

### Tasklet has, Sunder doesn't:

| Tool | What it does | Do we need it for v1? |
|------|-------------|----------------------|
| `hubspot_batch_delete_objects` | Delete multiple CRM records | **Decide explicitly.** If no — document as intentional v1 omission. If yes — add with strong guard rail ("DESTRUCTIVE: permanently deletes records"). |
| `hubspot_batch_delete_associations` | Remove links between objects | **No** — Sunder uses FK columns; "unlinking" = `update_deal({ contact_id: null })` |
| `hubspot_get_schemas` | Discover available fields and object types at runtime | **No for v1** — our schema is fixed and small. The tool descriptions should list valid values inline instead. |
| `hubspot_get_association_definitions` | Discover relationship types | **No** — relationships are implicit via FKs |
| `hubspot_get_lists` / `create_list` / memberships (4 tools) | Manage static lists/segments | **No** — not in v1 product scope |

---

## 6. Description Quality — Pattern Comparison

### Pattern: Behavioral Guidance (Tasklet has, Sunder doesn't)

**Tasklet example** (from `gmail_search_threads`, same philosophy applies to HubSpot):
```
<search-strategy>
  Query Construction:
  - Keyword searches may be overly restrictive. For time-based tasks, prefer
    date ranges...
  - When keywords are needed, use OR operators...

  Search Iteration:
  - Be thorough with your searches. If initial search doesn't find necessary
    information, try different approaches
  - You should be willing to try up to 5 different queries before giving up

  Completeness:
  - Remember to retrieve and use ALL relevant results from searches
</search-strategy>
```

**Sunder equivalent:** Nothing. Our search tools have zero behavioral guidance.

**Recommendation:** Add a `<search-strategy>` block to `search_contacts`:
```
Search contacts by name, email, or phone. Optionally filter by contact type.
Searches across first_name, last_name, email, and phone using OR matching
(any field can match).

<search-strategy>
- Try the person's name first. If no results, try email or phone.
- Partial matches work (e.g., "John" matches "Johnson").
- If unsure whether a contact exists, search before creating a new one.
- Use type filter to narrow results (e.g., type: "buyer", "seller", "landlord").
</search-strategy>
```

### Pattern: Guard Rails (Tasklet has, Sunder mostly doesn't)

**Tasklet:**
```
Data Modification Warning: This tool modifies HubSpot data. Only use when the
user has explicitly requested to update their CRM.
```

**Sunder — `create_contact`:**
```
Create a new contact. Use this when the user shares details about a new person.
```
This is close but weaker — "when the user shares details" is ambiguous (does mentioning someone in passing count?).

**Sunder — `create_deal`, `create_task`, `create_interaction`:** No guard rails at all.

**Recommendation:** Standardize across all write tools:
```
[Existing description]. Only create/update records when the user has explicitly
asked to do so or confirmed the action.
```

### Pattern: Cross-Tool References (Tasklet has, Sunder mostly doesn't)

**Tasklet `hubspot_search_objects` → `objectType` parameter:**
```
...use objectTypeId (e.g., "2-123456") or fullyQualifiedName (e.g., "p123_pets")
from hubspot_get_schemas.
```

**Sunder:** Only `update_contact` cross-references `search_contacts`. No other cross-tool references exist.

**Recommendation:** Add to every tool that takes a UUID FK:
- `create_deal.contact_id`: "UUID of the contact. Use search_contacts to find this."
- `create_interaction.contact_id`: "UUID of the contact. Use search_contacts to find this."
- `create_interaction.deal_id`: "UUID of the deal. Use search_deals to find this."
- `create_task.contact_id`: "UUID of the contact. Use search_contacts to find this."
- `create_task.deal_id`: "UUID of the deal. Use search_deals to find this."

### Pattern: Inline Examples (Tasklet has, Sunder doesn't)

**Tasklet `hubspot_search_objects` → `objectType`:**
```
(e.g., contacts, companies, deals, tickets, notes, tasks, calls, meetings,
emails, products, line_items, quotes, or custom objects...)
```

**Sunder `search_contacts` → `query`:**
```
Search term for name, email, or phone.
```

No examples. The LLM doesn't know what a good search query looks like.

**Recommendation:** Add inline examples to every parameter:
- `query`: "Search term matching first_name, last_name, email, or phone (e.g., 'John', 'john@example.com', '+6591234567')."
- `type`: "Contact classification (e.g., 'buyer', 'seller', 'landlord', 'tenant', 'agent')."
- `stage`: "Deal stage (e.g., 'prospect', 'negotiation', 'closed_won', 'closed_lost')."
- `contact_id`: "UUID of the contact. Use search_contacts to find this (e.g., '550e8400-e29b-41d4-a716-446655440000')."

### Pattern: Performance Hints (Tasklet has, Sunder doesn't)

**Tasklet `gmail_search_threads` → `readMask`:**
```
Only include bodyFull or bodyHtml if you need to read the complete message content.
```

**Sunder:** All search tools return `SELECT *`. No guidance on when to use limits or what fields cost more.

**Recommendation:** Add to search tools:
```
Results are capped at 50. Use limit to control result size — start with 5-10
for quick lookups, use 20-50 when the user needs a comprehensive list.
```

---

## 7. Prioritized Fix List

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| **P0** | Add data modification warning to all 7 write tools | 30 min | Prevents speculative CRM writes — safety critical |
| **P0** | Add cross-tool references to all FK parameters (`contact_id`, `deal_id`, `task_id`) | 30 min | Prevents invalid UUID errors and wasted tool calls |
| **P1** | Expand all tool descriptions with behavioral guidance, inline examples | 1 hr | Dramatically improves LLM tool selection and argument quality |
| **P1** | Add `client_id` filter on all SELECT queries (defense-in-depth) | 15 min | Prevents data leaks if RLS is misconfigured |
| **P2** | Fix `search_contacts` requiring `query.min(1)` — should allow empty query for listing | 5 min | Matches Tasklet's `list_objects` capability |
| **P2** | Expand parameter descriptions with format examples and valid enum values | 45 min | Reduces LLM errors on first attempt |
| **P2** | Make explicit decision on delete tools (intentional omission vs gap) | 5 min | Closes ambiguity in scope |
| **P3** | Add `<search-strategy>` blocks to search tools | 30 min | Teaches LLM to retry and iterate on searches |
| **P3** | Consider batch create/update for v1.1 | 2 hr | Reduces step consumption for bulk CRM operations |
| **Defer** | Schema discovery tool | — | Not needed while schema is small and fixed |
| **Defer** | List/segment tools | — | Not in v1 product scope |
| **Defer** | Association tools | — | FK filters are sufficient for v1 |
