# Sunder CRM Tools vs Tasklet HubSpot Tools — Final Diff

> Updated 2026-03-04 after PR6b (batch tools, deal_contacts join table, description polish).
> Sunder source: `src/lib/runner/tools/crm/*.ts` (15 tools)
> Tasklet source: `02-hubspot-tools-full-schema.json` (15 tools)

---

## Status

All P0 and P1 fixes from the original comparison are **applied**. Batch create tools are **shipped**. The deal_contacts many-to-many join table replaces the old `deals.contact_id` FK. This doc now reflects the final state of both systems.

---

## 1. Tool Inventory (15 vs 15)

| Category | Tasklet HubSpot | Sunder CRM | Match? |
|----------|----------------|------------|--------|
| **Search** | `hubspot_search_objects` (1 generic) | `search_contacts` + `search_deals` + `search_tasks` (3 per-entity) | Equivalent — different pattern |
| **Batch Create** | `hubspot_batch_create_objects` (1 generic, 100/call) | `create_contact` + `create_deal` + `create_interaction` + `create_task` + `batch_create_contacts` + `batch_create_deals` (6 tools, singles + 50/call batches) | Equivalent — Sunder has more tools but same capability |
| **Batch Read** | `hubspot_batch_read_objects` | _(none)_ | Gap — intentional |
| **Batch Update** | `hubspot_batch_update_objects` | `update_contact` + `update_deal` + `update_task` (3 single-record) | Gap — no batch update |
| **List/Browse** | `hubspot_list_objects` | _(folded into search tools — all accept empty query)_ | Equivalent |
| **Schema Discovery** | `hubspot_get_schemas` | _(none — fixed 4-entity schema)_ | Gap — intentional |
| **Associations** | `hubspot_batch_create_associations` + `hubspot_get_association_definitions` + `hubspot_list_associations` (3 tools) | `link_contact_to_deal` + `unlink_contact_from_deal` + `get_deal_contacts` (3 tools) | Equivalent — typed join table vs generic associations |
| **Lists/Segments** | `hubspot_get_lists` + `hubspot_get_list_memberships` + `hubspot_update_list_memberships` + `hubspot_create_list` (4 tools) | _(none)_ | Gap — intentional, out of scope |
| **Delete** | `hubspot_batch_delete_objects` + `hubspot_batch_delete_associations` (2 tools) | _(none)_ | Gap — intentional, deferred to PR 33 |
| **Interactions** | _(uses generic objectType: notes/calls/meetings)_ | `create_interaction` (dedicated tool) | Sunder-only |

---

## 2. Tool-by-Tool Diff

### 2.1 SEARCH

#### Tasklet: `hubspot_search_objects`

```
Description: "Performs advanced filtered searches across HubSpot object types using
complex criteria. Supports complex boolean logic through filter groups. Use this for
targeted data retrieval when exact filtering criteria are known. Filter groups are
combined with OR logic (ANY can match), while filters within a group are combined
with AND logic (ALL must match)."

Args: objectType, query, limit (max 100), after (cursor), properties, sorts, filterGroups
```

#### Sunder: `search_contacts`

```
Description: "Search contacts by name, email, or phone. Use this before creating a
new contact to avoid duplicates. Omit query to list all contacts. Searches across
first_name, last_name, email, and phone using OR matching."

Args:
  query?  z.string().trim().min(1).optional()  "Search term for name, email, or phone. Omit to list all contacts."
  type?   z.enum([buyer,seller,landlord,tenant,agent,other]).optional()  "Contact type filter (buyer, seller, landlord, tenant, agent, other)."
  limit?  z.number().int().min(1).max(50).optional()  "Maximum results to return. Defaults to 20."
```

#### Sunder: `search_deals`

```
Description: "Search deals by address or notes. Optionally filter by stage. Omit
query to list all deals. Use get_deal_contacts to find contacts linked to a deal."

Args:
  query?  z.string().trim().min(1).optional()  "Search term for address and notes. Omit to list all deals."
  stage?  z.enum([leads,viewing,offer,negotiation,otp,completion,lost]).optional()  "Deal pipeline stage filter (leads, viewing, offer, negotiation, otp, completion, lost)."
  limit?  z.number().int().min(1).max(50).optional()  "Maximum results to return. Defaults to 20."
```

#### Sunder: `search_tasks`

```
Description: "Search CRM tasks. Optionally filter by status, contact, or deal.
Results are sorted by due date (earliest first). Use this to find tasks before
updating them."

Args:
  status?      z.enum([open,completed]).optional()  "Task status filter (open, completed)."
  contact_id?  z.string().uuid().optional()  "Filter by contact UUID. Use search_contacts to find this."
  deal_id?     z.string().uuid().optional()  "Filter by deal UUID. Use search_deals to find this."
  limit?       z.number().int().min(1).max(50).optional()  "Maximum results to return. Defaults to 20."
```

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Pattern | 1 generic tool, objectType param | 3 per-entity tools with Zod-typed schemas | Sunder: stronger type safety. Tasklet: fewer tools. |
| Query | Text search across "default searchable properties" | ILIKE OR across specific named columns | Sunder: explicit about what fields are searched. |
| Filters | `filterGroups` with complex boolean logic (5 groups x 6 filters) | Simple `.eq()` on 1-2 typed enum fields | Tasklet: far more powerful. Sunder: sufficient for 4 entities. |
| Pagination | Cursor-based (`after`) | None — capped at 50 | **Gap.** Acceptable for solo agent CRM. |
| Field selection | `properties` param | Always `SELECT *` | **Gap.** Low priority — entities are small. |
| Sorting | `sorts` param | `search_tasks` sorts by due_date ASC; others unsorted | **Gap.** Low priority. |
| List-all | Separate `list_objects` tool | Query is optional on all 3 search tools | Equivalent. |
| When-to-use guidance | "Use this for targeted data retrieval when exact filtering criteria are known" | "Use this before creating a new contact to avoid duplicates" / "Use this to find tasks before updating them" | Both good. Different guidance per context. |
| Cross-tool refs on FK args | References `hubspot_get_schemas` | `search_tasks` refs `search_contacts` and `search_deals` on FK args | Both good. |

---

### 2.2 CREATE (single record)

#### Tasklet: `hubspot_batch_create_objects` (also covers batch — see 2.3)

```
Description: "Creates multiple HubSpot objects of the same objectType in a single
API call, optimizing for bulk operations. Data Modification Warning: This tool
modifies HubSpot data. Only use when the user has explicitly requested to update
their CRM."

Args: objectType, inputs (array, max 100)
```

#### Sunder: `create_contact`

```
Description: "Create a new contact. Use search_contacts first to avoid duplicates.
Data Modification Warning: Only create contacts when the user has explicitly asked
to do so."

Args:
  first_name   z.string().min(1)  "Contact first name."
  last_name    z.string().min(1)  "Contact last name."
  email?       z.string().email().optional()  "Contact email address."
  phone?       z.string().min(1).optional()  "Contact phone number."
  type?        z.enum([buyer,seller,landlord,tenant,agent,other]).optional()  "Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'."
  notes?       z.string().optional()  "Free-form contact notes."
```

#### Sunder: `create_deal`

```
Description: "Create a new deal. Use this for new listings or opportunities. Use
link_contact_to_deal after creating to associate contacts. Data Modification
Warning: Only create deals when the user has explicitly asked to do so."

Args:
  address    z.string().min(1)  "Property address."
  stage?     z.enum([leads,viewing,offer,negotiation,otp,completion,lost]).optional()  "Deal pipeline stage (leads, viewing, offer, negotiation, otp, completion, lost). Defaults to 'leads'."
  price?     z.number().int().nonnegative().optional()  "Deal price in whole units."
  notes?     z.string().optional()  "Deal notes."
```

#### Sunder: `create_interaction`

```
Description: "Record a CRM interaction such as a call, meeting, email, message,
viewing, or note. Data Modification Warning: Only record interactions when the
user has explicitly asked to do so."

Args:
  contact_id    z.string().uuid()  "UUID of the contact. Use search_contacts to find this."
  deal_id?      z.string().uuid().optional()  "UUID of the deal. Use search_deals to find this."
  type          z.enum([call,meeting,email,message,viewing,note])  "Interaction type (call, meeting, email, message, viewing, note)."
  summary?      z.string().optional()  "Interaction summary."
  occurred_at?  z.union([datetime, YYYY-MM-DD]).optional()  "ISO-8601 timestamp or YYYY-MM-DD date when the interaction occurred."
```

#### Sunder: `create_task`

```
Description: "Create a new CRM follow-up task. Data Modification Warning: Only
create tasks when the user has explicitly asked to do so."

Args:
  title         z.string().min(1)  "Task title."
  description?  z.string().optional()  "Task description."
  status?       z.enum([open,completed]).optional()  "Task status (open, completed). Defaults to 'open'."
  due_date?     z.union([datetime, YYYY-MM-DD]).optional()  "ISO-8601 due timestamp or YYYY-MM-DD date."
  contact_id?   z.string().uuid().optional()  "UUID of the contact. Use search_contacts to find this."
  deal_id?      z.string().uuid().optional()  "UUID of the deal. Use search_deals to find this."
```

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Pattern | 1 generic tool, untyped `inputs` array | 4 per-entity tools with Zod schemas | Sunder: compile-time validation, inline enum docs. Tasklet: fewer tools. |
| Data mod warning | "Data Modification Warning: This tool modifies HubSpot data. Only use when the user has explicitly requested to update their CRM." | All 4 tools have entity-specific warnings (e.g., "Only create contacts when the user has explicitly asked to do so.") | **Parity.** Both present. |
| Cross-tool refs | None on create | `create_contact` → `search_contacts`; `create_deal` → `link_contact_to_deal`; `create_task`/`create_interaction` → `search_contacts`/`search_deals` on FK args | **Sunder better.** |
| Inline enums | Not applicable (generic) | All enum fields list values inline | **Sunder better.** |
| Interaction logging | Uses generic objectType (notes, calls, meetings) — LLM must know correct type | Dedicated `create_interaction` with typed enum | **Sunder better.** |

---

### 2.3 BATCH CREATE

#### Tasklet: `hubspot_batch_create_objects`

```
(Same tool as create — supports array of max 100 per call)
```

#### Sunder: `batch_create_contacts`

```
Description: "Create multiple contacts in a single call. Use this for bulk imports
(e.g., CSV, spreadsheet). Use search_contacts first to check for duplicates. Data
Modification Warning: Only create contacts when the user has explicitly asked to
do so."

Args:
  contacts  z.array(z.object({
    first_name, last_name, email?, phone?, type?, notes?
  })).min(1).max(50)  "Array of contacts to create (1-50 per call)."
```

#### Sunder: `batch_create_deals`

```
Description: "Create multiple deals in a single call. Use this for bulk imports
(e.g., open house leads, CSV). Use link_contact_to_deal after creating to associate
contacts with each deal. Data Modification Warning: Only create deals when the user
has explicitly asked to do so."

Args:
  deals  z.array(z.object({
    address, stage?, price?, notes?
  })).min(1).max(50)  "Array of deals to create (1-50 per call)."
```

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Batch size | 100 per call | 50 per call | Tasklet: 2x capacity. |
| Entity coverage | All object types (contacts, deals, tasks, etc.) | Contacts and deals only | **Gap.** No batch for tasks/interactions. Acceptable — bulk task/interaction import is rare. |
| Type safety | Untyped `inputs` array | Zod-typed per-entity schemas | **Sunder better.** |
| Cross-tool refs | None | Both reference pre-check and post-link tools | **Sunder better.** |

---

### 2.4 BATCH READ (by ID)

#### Tasklet: `hubspot_batch_read_objects`

```
Description: "Retrieves multiple HubSpot objects of the same object type by their
IDs in a single batch operation. Use this tool to retrieve objects when the object
IDs are known."

Args: objectType, inputs (IDs, max 100), properties?, propertiesWithHistory?
```

#### Sunder: _(none)_

#### Diff

**Intentional gap.** Sunder search tools return full records on create/update. The LLM already has the data from the previous tool call. A get-by-ID tool only matters for multi-step workflows passing IDs across turns — rare for a solo agent CRM.

---

### 2.5 UPDATE

#### Tasklet: `hubspot_batch_update_objects`

```
Description: "Updates multiple existing HubSpot objects of the same objectType in a
single API call. Data Modification Warning: This tool modifies HubSpot data. Only
use when the user has explicitly requested to update their CRM."

Args: objectType, inputs (array, max 100)
```

#### Sunder: `update_contact`

```
Description: "Update an existing contact by id. Use this after finding the contact
via search_contacts. Only provided fields are updated. Omit fields you don't want
to change. Pass null to clear a nullable field. Data Modification Warning: Only
update contacts when the user has explicitly asked to do so."

Args:
  contact_id   z.string().uuid()  "UUID of the contact to update. Use search_contacts to find this."
  first_name?  z.string().min(1).optional()
  last_name?   z.string().min(1).optional()
  email?       z.string().email().nullable().optional()  "Updated email or null to clear."
  phone?       z.string().min(1).nullable().optional()  "Updated phone or null to clear."
  type?        z.enum([...]).optional()
  notes?       z.string().nullable().optional()
```

#### Sunder: `update_deal`

```
Description: "Update an existing deal by id. Use this after finding the deal via
search_deals. Only provided fields are updated. Omit fields you don't want to
change. Pass null to clear a nullable field. Data Modification Warning: Only update
deals when the user has explicitly asked to do so."

Args:
  deal_id   z.string().uuid()  "UUID of the deal to update. Use search_deals to find this."
  address?  z.string().min(1).optional()
  stage?    z.enum([...]).optional()
  price?    z.number().int().nonnegative().nullable().optional()
  notes?    z.string().nullable().optional()
```

#### Sunder: `update_task`

```
Description: "Update an existing CRM task by id. Use this after finding the task
via search_tasks. Only provided fields are updated. Omit fields you don't want to
change. Pass null to clear a nullable field. Data Modification Warning: Only update
tasks when the user has explicitly asked to do so."

Args:
  task_id       z.string().uuid()  "UUID of the task to update. Use search_tasks to find this."
  title?        z.string().min(1).optional()
  description?  z.string().nullable().optional()
  status?       z.enum([open,completed]).optional()
  due_date?     z.union([datetime, YYYY-MM-DD]).nullable().optional()
  contact_id?   z.string().uuid().nullable().optional()  "Updated contact UUID or null. Use search_contacts to find this."
  deal_id?      z.string().uuid().nullable().optional()  "Updated deal UUID or null. Use search_deals to find this."
```

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Pattern | 1 generic batch (100/call) | 3 per-entity single-record | **Gap.** No batch update. Acceptable — bulk updates are rare for solo agent. |
| Data mod warning | Present | Present on all 3 | **Parity.** |
| Null-to-clear docs | Not documented | "Pass null to clear a nullable field" + per-arg "or null to clear" | **Sunder better.** |
| Partial update docs | Not documented | "Only provided fields are updated. Omit fields you don't want to change." | **Sunder better.** |
| Cross-tool refs | None | All 3 reference their search tool. FK args reference search tools. | **Sunder better.** |

---

### 2.6 ASSOCIATIONS (Deal-Contact Links)

#### Tasklet (3 tools)

```
hubspot_batch_create_associations:
  "Establishes relationships between HubSpot objects, linking records across different
  object types, by creating associations between objects in batch. Data Modification
  Warning: This tool modifies HubSpot data. Only use when the user has explicitly
  requested to update their CRM."
  Args: fromObjectType, toObjectType, types, inputs (max 100)

hubspot_get_association_definitions:
  "Retrieves valid association types between specific HubSpot object types. Always
  use before creating associations to ensure valid relationship types or to help
  troubleshoot association creation errors."
  Args: fromObjectType, toObjectType

hubspot_list_associations:
  "Retrieves existing relationships between a specific object and other objects of a
  particular type. For example, you can find all companies that a contact is
  associated with, all deals related to a company, or discover which customers have
  an open ticket."
  Args: objectType, objectId, toObjectType, after
```

#### Sunder (3 tools)

```
link_contact_to_deal:
  "Link a contact to a deal with a role (buyer, seller, agent, other). A deal can
  have multiple contacts. Each contact-deal pair must be unique. Use search_contacts
  and search_deals to find IDs first. Data Modification Warning: Only link contacts
  when the user has explicitly asked to do so."
  Args:
    deal_id      z.string().uuid()  "UUID of the deal. Use search_deals to find this."
    contact_id   z.string().uuid()  "UUID of the contact. Use search_contacts to find this."
    role?        z.enum([buyer,seller,agent,other]).optional()  "Contact's role in the deal (buyer, seller, agent, other). Defaults to 'buyer'."
    is_primary?  z.boolean().optional()  "Whether this is the primary contact for display. Defaults to false."

unlink_contact_from_deal:
  "Remove a contact from a deal. This permanently deletes the link. Use
  get_deal_contacts to see current links first. Data Modification Warning: Only
  unlink contacts when the user has explicitly asked to do so."
  Args:
    deal_id     z.string().uuid()  "UUID of the deal."
    contact_id  z.string().uuid()  "UUID of the contact to unlink."

get_deal_contacts:
  "Get all contacts linked to a deal with their roles (buyer, seller, agent, other)
  and primary status. Returns contact details (name, email, phone) for each link.
  Use this to see who is involved in a deal before linking or unlinking contacts."
  Args:
    deal_id  z.string().uuid()  "UUID of the deal."
```

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Scope | Any-to-any object type associations | Deal-to-contact only (via join table) | Sunder: narrower scope, but covers the only relationship solo agents need. |
| Pattern | Generic batch (100/call) with type discovery | Typed per-relationship with role enum + is_primary | **Sunder better** for this specific relationship — richer data model. |
| Data model | HubSpot association types (labels, no extra fields) | `deal_contacts` join table with `role` and `is_primary` columns | **Sunder better** — role and primary contact are first-class fields. |
| Discoverability | `get_association_definitions` discovers valid types at runtime | Enum values listed inline in description | Equivalent — Sunder's fixed schema doesn't need runtime discovery. |
| Batch | 100 links per call | Single link per call | **Gap.** Acceptable — linking is typically 1-3 contacts per deal. |
| Contact details | `list_associations` returns IDs only — requires separate read | `get_deal_contacts` returns full contact details (name, email, phone) | **Sunder better** — one call instead of two. |
| Data mod warning | Present on create/delete | Present on link/unlink | **Parity.** |
| Destructive warning | `batch_delete_associations`: "permanently removes relationships" | `unlink_contact_from_deal`: "This permanently deletes the link." | **Parity.** |

---

### 2.7 DELETE

#### Tasklet (2 tools)

```
hubspot_batch_delete_objects:
  "Archives (soft-deletes) multiple HubSpot objects of the same type in a single
  batch operation. Archived objects can be restored from the HubSpot UI within 90
  days. Data Modification Warning: This tool permanently archives objects and should
  be used with extreme caution. Only use when the user has explicitly requested to
  delete/archive objects."
  Args: objectType, inputs (IDs, max 100)

hubspot_batch_delete_associations:
  "Removes associations (relationships) between HubSpot objects in batch. Data
  Modification Warning: This tool permanently removes relationships between objects.
  Only use when the user has explicitly requested to remove associations."
  Args: fromObjectType, toObjectType, inputs (max 100)
```

#### Sunder: _(none — intentional)_

Object deletion is omitted in v1. Handled through Supabase dashboard until the approval gate (PR 33) ships. `unlink_contact_from_deal` covers association removal.

#### Diff

| Aspect | Tasklet | Sunder | Delta |
|--------|---------|--------|-------|
| Object delete | Soft-delete with 90-day restore | No delete tool | **Intentional gap.** Deletion is high-risk for solo agent CRM. Dashboard-only until approval gate. |
| Association delete | Batch delete associations | `unlink_contact_from_deal` (single) | **Parity** for deal-contact links. No other associations to delete. |
| Guard rail escalation | "should be used with extreme caution" (strongest warning) | N/A | Will adopt same pattern when delete tools ship. |

---

### 2.8 SCHEMA DISCOVERY

#### Tasklet: `hubspot_get_schemas`

```
Description: "Retrieves all custom object schemas defined in the HubSpot account.
Use before working with custom objects to understand available object types, their
properties, and associations."
Args: (none)
```

#### Sunder: _(none — intentional)_

**Not needed.** Sunder has 4 fixed entities (contacts, deals, interactions, tasks) with all fields and enums documented inline in tool descriptions. HubSpot needs this because it supports custom objects with dynamic schemas.

---

### 2.9 LISTS / SEGMENTS

#### Tasklet (4 tools): `hubspot_get_lists`, `hubspot_get_list_memberships`, `hubspot_update_list_memberships`, `hubspot_create_list`

#### Sunder: _(none — intentional)_

**Not in scope.** Lists/segments are a HubSpot feature for sales teams running campaigns. Solo agents don't segment contacts into marketing lists.

---

## 3. Description Quality Comparison

### Patterns present in both systems

| Pattern | Tasklet Example | Sunder Example |
|---------|----------------|----------------|
| Data modification warning | "Data Modification Warning: This tool modifies HubSpot data. Only use when the user has explicitly requested to update their CRM." | "Data Modification Warning: Only create contacts when the user has explicitly asked to do so." |
| Cross-tool references | `objectType` references `hubspot_get_schemas` | `contact_id` → "Use search_contacts to find this." |
| When-to-use guidance | "Use this for targeted data retrieval when exact filtering criteria are known" | "Use this before creating a new contact to avoid duplicates" |

### Patterns only Sunder has

| Pattern | Example |
|---------|---------|
| Null-to-clear documentation | "Pass null to clear a nullable field." / "Updated email or null to clear." |
| Partial update semantics | "Only provided fields are updated. Omit fields you don't want to change." |
| Inline enum values in descriptions | "Contact classification (buyer, seller, landlord, tenant, agent, other). Defaults to 'other'." |
| Closure-based tenant isolation | `clientId` captured in factory — LLM can never override tenant identity |
| Typed Zod schemas | Compile-time validation; invalid enum values rejected before DB call |
| Dedicated interaction tool | `create_interaction` with typed enum vs HubSpot's generic objectType approach |
| Join table with metadata | `deal_contacts` has `role` + `is_primary` vs HubSpot's flat associations |
| Response shape documentation | `get_deal_contacts`: "Returns contact details (name, email, phone) for each link." |

### Patterns only Tasklet has

| Pattern | Example |
|---------|---------|
| Cursor pagination | `after` param on search/list tools |
| Field selection | `properties` param — LLM requests only needed fields |
| Advanced filter logic | `filterGroups` with boolean AND/OR trees |
| Custom sort | `sorts` param on search |
| Runtime schema discovery | `hubspot_get_schemas` for dynamic object types |
| Soft-delete with restore window | "Archived objects can be restored within 90 days" |
| Escalating guard rail severity | Writes: "Only use when explicitly requested" → Deletes: "should be used with extreme caution" |

---

## 4. Remaining Gaps (ordered by priority)

| Pri | Gap | Tasklet Has | Sunder Status | Action |
|-----|-----|------------|---------------|--------|
| **P2** | Batch update | `hubspot_batch_update_objects` (100/call) | Single-record only | Defer. Bulk updates rare for solo agent. |
| **P2** | Batch read by ID | `hubspot_batch_read_objects` (100/call) | None | Defer. Search tools return full records. |
| **P3** | Cursor pagination | `after` param on all search/list tools | None — capped at 50 | Defer. Solo agents rarely exceed 50 contacts/deals. |
| **P3** | Delete tools | `hubspot_batch_delete_objects` (soft-delete) | None | Ships with PR 33 (approval gate). |
| **Defer** | Field selection (`properties`) | Available on search/read | Always `SELECT *` | Not needed — entities are small. |
| **Defer** | Advanced filters (`filterGroups`) | Boolean AND/OR filter trees | Simple `.eq()` filters | Not needed for 4-entity schema. |
| **Defer** | Custom sorting | `sorts` param | `search_tasks` only (due_date ASC) | Not needed. |
| **Defer** | Schema discovery | `hubspot_get_schemas` | None | Not needed — fixed 4-entity schema. |
| **Skip** | Lists/segments (4 tools) | Full CRUD | None | Out of product scope. |

---

## 5. Summary

**Sunder wins on:** type safety (Zod schemas), description quality (null-to-clear, partial update, inline enums, cross-tool refs), tenant isolation (closure pattern), interaction logging (dedicated tool), deal-contact model (role + is_primary metadata), response richness (get_deal_contacts returns full contact details).

**Tasklet wins on:** flexibility (generic tools work with any object type), power features (advanced filters, sorting, pagination, field selection), batch capacity (100 vs 50), schema discovery (dynamic objects), and delete with restore.

**Net assessment:** For a solo real estate agent CRM with 4 fixed entities, Sunder's per-entity typed approach provides better LLM guidance and safer operations. The remaining gaps (batch update, pagination, delete) are low-priority for the target use case and scheduled for future PRs.
