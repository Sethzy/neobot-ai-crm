# CRM Tool Consolidation: 28 → 11 Tools

**Status:** Design
**Date:** 2026-03-09
**Scope:** CRM tools only (`src/lib/runner/tools/crm/`). Other tool categories untouched.

---

## Executive Summary

Consolidate 28 CRM tools into 11 using a **two-tier architecture**: structured safe-path tools (Tier 1) for common operations + a read-only SQL escape hatch (Tier 2) for complex queries. Move `describe_crm_schema` to passive system-reminder context. Leave `configure_crm` unchanged.

**Tool count:** 28 CRM tools → 11 (9 new + `configure_crm` unchanged + `describe_crm_schema` becomes passive context)

---

## Design Justifications

### Why consolidate? (Evidence chain)

| Principle | Source | Application |
|-----------|--------|-------------|
| **Addition by subtraction** | Vercel d0: removed 80% of tools → 100% success rate (was 80%), 3.5x faster, 37% fewer tokens | 28 CRM tools is ~54% of our 52-tool inventory. Consolidating to 10 cuts total tools to 34, well under the ~25 "worry threshold" from our architecture checklist (#9). |
| **Primitives over integrations** | Agent Harness article: Claude Code uses ~18 primitives. Same model scores 42% vs 78% depending on harness quality. Checklist #7. | `search_companies`, `search_contacts`, `search_deals` are the same operation with different table names. One `search_crm` primitive replaces all three plus 4 `get_*` tools. |
| **Two-tier pattern is universal** | Nicolas Bustamante Excel agents: Microsoft (2 raw tools), Shortcut (1+10 hybrid), Claude (14 structured + 1 `execute_office_js`). Every mature agent uses safe-path + escape-hatch. | Tier 1: structured tools with validation, duplicate detection, custom fields. Tier 2: `crm_sql` for JOINs, aggregations, complex filters the structured tools can't express. |
| **Tool-enforced safety > behavioral safety** | Nicolas Bustamante: "If safety-critical behavior depends on model choosing to do it, eventually it won't." | Duplicate detection stays baked into `create_record` (tool-enforced). Not moved to prompt instruction. `crm_sql` is read-only by construction (SQL validation + RPC). |
| **Passive context beats active retrieval** | Vercel AGENTS.md study: 100% success vs 53-79% for skills. "No decision point" principle. Tasklet analysis: system-reminder = dynamic passive context. | `describe_crm_schema` moves from a callable tool to system-reminder injection. Agent never has to decide "should I check the schema?" — it's always there. |
| **40% rule / context budget** | Dex Horthy, 12 Factor Agents: past 40% of context window → "dumb zone". Context engineering landscape: Cursor achieved 46.9% token reduction with lazy loading. | Fewer tools = smaller tool definition block in context. 28 tool definitions consume ~3-4K tokens; 10 tool definitions consume ~1.5K tokens. Every token saved is attention budget preserved. |
| **Auto-verification for free** | Nicolas Bustamante: Claude Excel's `formula_results` pattern — include verification data in every response. | All mutating tools return the full created/updated record. Agent can verify the write succeeded without a follow-up read. |

### What NOT to do (and why)

| Rejected approach | Why |
|---|---|
| **"Just SQL" for everything** (pure Vercel d0 style) | Vercel d0 worked because their semantic layer was good documentation AND they only needed reads. CRM needs writes with validation, duplicate detection, custom fields, and FK constraints. Raw INSERT/UPDATE SQL bypasses all of these. |
| **Keep all 28 tools** | Fails checklist #8 (lean tools, no overlap) and #9 (worry past ~25). Every tool is a decision point for the model. 28 CRM tools means the model must distinguish `link_contact_to_company` from `link_deal_to_company` from `link_contact_to_deal` — all of which are "link two things." |
| **Collapse to 2 tools** (one read, one write) | Too coarse. Loses type safety on parameters. A single `write_crm` with `action: "create" | "update" | "link" | "unlink"` makes the input schema huge and ambiguous. The Nicolas Bustamante analysis shows Claude's 14-tool structured approach outperformed Microsoft's 2-tool raw approach on safety metrics. |

---

## The 11 Tools

### Tier 1: Structured Safe-Path (8 tools)

#### 1. `search_crm`

**Replaces:** `search_companies`, `search_contacts`, `search_deals`, `search_interactions`, `search_tasks`, `get_deal_contacts`, `get_contact_deals`, `get_company_contacts`, `get_company_deals` (9 tools → 1)

```typescript
search_crm = tool({
  description:
    "Search CRM records. Specify the entity type and optional filters. " +
    "Returns matching records sorted by relevance. " +
    "For relationships: use entity 'deal_contacts' with a deal_id or contact_id filter, " +
    "or filter contacts/deals by company_id. " +
    "Use this before creating records to check for duplicates.",
  inputSchema: z.object({
    entity: z.enum([
      "contacts", "companies", "deals",
      "interactions", "tasks", "deal_contacts",
    ]).describe("CRM entity type to search."),
    query: z.string().trim().min(1).optional()
      .describe("Free-text search term. Searches name/address/title/summary fields depending on entity."),
    filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .describe(
        "Key-value filters applied as equality matches. " +
        "Common filters: { stage: '...', type: '...', status: '...', " +
        "company_id: '...', contact_id: '...', deal_id: '...' }. " +
        "For date ranges on interactions: use occurred_after / occurred_before."
      ),
    limit: z.number().int().min(1).max(50).optional()
      .describe("Maximum results. Defaults to 20."),
  }),
})
```

**Response shape:**
```typescript
{ success: true, records: Record[], count: number }
| { success: false, error: string }
```

**Implementation notes:**
- Route to the correct table based on `entity`
- For `deal_contacts`: join to `contacts` or `deals` table to include related fields (same as current `get_deal_contacts` / `get_contact_deals`)
- `query` maps to ILIKE search across entity-specific columns (reuse existing `buildSearchExpression`)
- `filters` maps to `.eq()` calls. Special-case `occurred_after` / `occurred_before` for interactions (reuse `normalizeDateString` / `normalizeDateUpperBound`)
- Always scoped by `client_id` (injected from closure, never in schema)
- Sort: interactions by `occurred_at` desc, tasks by `due_date` asc, others by `created_at` desc

**Why one tool, not five:** The 5 search tools + 4 get_* tools all do the same operation: filter rows from a table and return them. The model must currently choose between 9 tools that differ only in table name. A single `search_crm` with an `entity` discriminator eliminates 8 decision points. This follows the Vercel d0 principle — the model is better at specifying *what* it wants than choosing *which tool* gets it there.

---

#### 2. `create_record`

**Replaces:** `create_company`, `create_contact`, `create_deal`, `batch_create_companies`, `batch_create_contacts`, `batch_create_deals` (6 tools → 1)

```typescript
create_record = tool({
  description:
    "Create one or more CRM records. Specify the entity type and field values. " +
    "Has built-in duplicate detection — if matching records exist, returns " +
    "possible_duplicates instead of creating. Set force_create: true to override. " +
    "Supports batch creation (up to 50 records per call). " +
    "Data Modification Warning: Only create records when the user has explicitly asked.",
  inputSchema: z.object({
    entity: z.enum(["contacts", "companies", "deals"])
      .describe("CRM entity type to create."),
    records: z.array(z.record(z.string(), z.unknown())).min(1).max(50)
      .describe(
        "Array of records to create. Required fields by entity: " +
        "contacts: { first_name, last_name }. " +
        "companies: { name }. " +
        "deals: { address }. " +
        "Optional fields vary by entity — use the CRM schema in system context " +
        "to see available fields, types, industries, stages, and custom fields."
      ),
    force_create: z.boolean().optional()
      .describe("Skip duplicate detection. Default false."),
  }),
})
```

**Response shape:**
```typescript
// Success (single)
{ success: true, record: Record }
// Success (batch)
{ success: true, records: Record[], count: number }
// Duplicate detected
{ success: false, reason: "possible_duplicates", possible_duplicates: Record[], message: string }
| { success: false, error: string }
```

**Implementation notes:**
- Validate `records` array against entity-specific Zod schema at runtime (contact requires `first_name` + `last_name`, company requires `name`, deal requires `address`)
- Duplicate detection: contacts by first+last name, companies by name, deals by address (reuse existing `findDuplicate*` functions)
- Batch dedup: intra-batch duplicate check (same as current `batch_create_contacts`) + per-entry DB check
- Custom fields: validate against config-driven schema (reuse `buildCustomFieldsSchema`)
- If `records.length === 1`: return `{ record }`. If `> 1`: return `{ records, count }`.
- Enum validation (contact types, industries, stages) happens via the entity-specific Zod schema

**Why merge single + batch:** The model already has to decide "is this 1 record or many?" before calling. With separate tools, it must also choose between `create_contact` and `batch_create_contacts` — a distinction that doesn't help the model think. One tool handles both, and the implementation dispatches internally.

---

#### 3. `update_record`

**Replaces:** `update_company`, `update_contact`, `update_deal` (3 tools → 1)

```typescript
update_record = tool({
  description:
    "Update one or more CRM records by ID. Only provided fields are changed. " +
    "Pass null to clear a nullable field. Omit fields to leave them unchanged. " +
    "Custom fields are deep-merged (existing keys not in the patch are preserved). " +
    "Supports batch updates (up to 50 records per call) — all records must be the same entity type. " +
    "Data Modification Warning: Only update records when the user has explicitly asked.",
  inputSchema: z.object({
    entity: z.enum(["contacts", "companies", "deals"])
      .describe("CRM entity type to update."),
    updates: z.array(z.object({
      id: z.string().uuid()
        .describe("UUID of the record to update. Use search_crm to find this."),
      fields: z.record(z.string(), z.unknown())
        .describe(
          "Partial field patch. Only included fields are updated. " +
          "Use the CRM schema in system context to see available fields. " +
          "Pass null to clear nullable fields."
        ),
    })).min(1).max(50)
      .describe("Array of { id, fields } patches. All must be the same entity type."),
  }),
})
```

**Response shape:**
```typescript
// Single update
{ success: true, record: Record }
// Batch update
{ success: true, records: Record[], count: number }
// Partial failure
{ success: false, error: string, results: Array<{ id: string, success: boolean, record?: Record, error?: string }> }
```

**Implementation notes:**
- Route to correct table + primary key column based on `entity` (`contact_id`, `company_id`, `deal_id`)
- Validate each `fields` object against entity-specific Zod update schema at runtime
- Custom fields deep-merge: reuse `mergeCustomFields()` — fetch existing, merge patch, write back
- Always filter by `client_id` (RLS + application-level double-lock)
- If `updates.length === 1`: return `{ record }`. If `> 1`: return `{ records, count }`.
- Batch updates are executed sequentially (not transactional) — if one fails mid-batch, return partial results with per-item success/error
- Returns full updated records for auto-verification

**Why batch:** "Move all 15 leads-stage deals to viewing" is a real agent workflow. Without batch, this is 15 sequential tool calls eating 15 steps of `maxSteps`. With batch: `search_crm` → get IDs → `update_record` with 15 patches = 2 tool calls.

---

#### 4. `link_records`

**Replaces:** `link_contact_to_deal`, `unlink_contact_from_deal`, `link_contact_to_company`, `unlink_contact_from_company`, `link_deal_to_company`, `unlink_deal_from_company` (6 tools → 1)

```typescript
link_records = tool({
  description:
    "Create or remove a relationship between two CRM records. " +
    "Supported relationships: " +
    "contact↔deal (many-to-many via junction table, with role and primary flag), " +
    "contact→company (FK on contact), " +
    "deal→company (FK on deal). " +
    "Data Modification Warning: Only link/unlink when the user has explicitly asked.",
  inputSchema: z.object({
    action: z.enum(["link", "unlink"])
      .describe("Whether to create or remove the relationship."),
    relationship: z.enum(["contact_deal", "contact_company", "deal_company"])
      .describe("Which relationship to modify."),
    source_id: z.string().uuid()
      .describe("UUID of the source record (contact_id for contact_deal and contact_company, deal_id for deal_company)."),
    target_id: z.string().uuid().optional()
      .describe("UUID of the target record (deal_id, company_id). Required for 'link'. Omit for 'unlink' on FK relationships."),
    role: z.string().optional()
      .describe("Role for contact↔deal links (e.g., buyer, seller, tenant). See CRM schema for valid roles."),
    is_primary: z.boolean().optional()
      .describe("Whether this is the primary contact for display. Only for contact↔deal links."),
  }),
})
```

**Response shape:**
```typescript
// Link success
{ success: true, link: Record }
// Unlink success
{ success: true, removed: Record }
// Error
{ success: false, error: string }
```

**Implementation notes:**
- `contact_deal`: junction table operations (insert/delete on `deal_contacts`). Link requires `target_id`, `role` (defaults from config), `is_primary`. Unlink requires both `source_id` (contact) and `target_id` (deal).
- `contact_company`: FK update on `contacts.company_id`. Link sets it, unlink nulls it.
- `deal_company`: FK update on `deals.company_id`. Link sets it, unlink nulls it.
- Validate `role` against `config.deal_contact_roles` enum when relationship is `contact_deal`
- For FK relationships (`contact_company`, `deal_company`): unlink doesn't need `target_id` (just null the FK)

**Why one tool, not six:** "Link contact to deal" and "link contact to company" are conceptually identical operations — "associate A with B." The model currently must navigate 6 near-identical tools. One `link_records` with a `relationship` discriminator is a single decision: "which two things am I connecting?" This matches checklist #8: "lean tools, no overlap."

---

#### 5. `create_interaction`

**Stays separate.** Not merged into `create_record`.

```typescript
create_interaction = tool({
  description:
    "Record a CRM interaction (call, email, meeting, etc.). Interactions are append-only. " +
    "Data Modification Warning: Only record interactions when the user has explicitly asked.",
  inputSchema: z.object({
    contact_id: z.string().uuid()
      .describe("UUID of the contact. Use search_crm to find this."),
    deal_id: z.string().uuid().optional()
      .describe("UUID of the deal, if applicable."),
    type: z.string()
      .describe("Interaction type. See CRM schema in system context for valid types."),
    summary: z.string().optional()
      .describe("Interaction summary."),
    occurred_at: z.string().optional()
      .describe("ISO-8601 timestamp or YYYY-MM-DD. Defaults to now."),
  }),
})
```

**Response shape:**
```typescript
{ success: true, interaction: Record }
| { success: false, error: string }
```

**Why separate:** Interactions are semantically different from CRUD entities. They're append-only event logs, not updateable records. They require a `contact_id` (not optional). The model's mental model is "log what happened" not "create a row." Merging into `create_record` would muddy the intent and require special-casing the required `contact_id`.

---

#### 6. `create_task`

**Stays separate.** Not merged into `create_record`.

```typescript
create_task = tool({
  description:
    "Create a CRM follow-up task. " +
    "Data Modification Warning: Only create tasks when the user has explicitly asked.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Task title."),
    description: z.string().optional().describe("Task description."),
    status: z.enum(["open", "completed"]).optional()
      .describe("Task status. Defaults to 'open'."),
    due_date: z.string().optional()
      .describe("ISO-8601 timestamp or YYYY-MM-DD due date."),
    contact_id: z.string().uuid().optional()
      .describe("UUID of the related contact."),
    deal_id: z.string().uuid().optional()
      .describe("UUID of the related deal."),
    custom_fields: z.record(z.string(), z.unknown()).optional()
      .describe("Custom fields. See CRM schema in system context."),
  }),
})
```

**Response shape:**
```typescript
{ success: true, task: Record }
| { success: false, error: string }
```

---

#### 7. `update_task`

**Stays separate.** Not merged into `update_record`.

```typescript
update_task = tool({
  description:
    "Update an existing CRM task by ID. Only provided fields are changed. " +
    "Data Modification Warning: Only update tasks when the user has explicitly asked.",
  inputSchema: z.object({
    task_id: z.string().uuid()
      .describe("UUID of the task to update."),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: z.enum(["open", "completed"]).optional(),
    due_date: z.string().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    deal_id: z.string().uuid().nullable().optional(),
    custom_fields: z.record(z.string(), z.unknown()).optional(),
  }),
})
```

**Response shape:**
```typescript
{ success: true, task: Record }
| { success: false, error: string }
```

**Why tasks stay separate:** Tasks are user-facing follow-ups with their own lifecycle (open → completed). They're the primary artifact the agent creates autonomously (e.g., "follow up with Mrs. Tan next Tuesday"). Keeping them as dedicated tools makes the agent's most common write operation (task creation/completion) zero-ambiguity — no `entity` discriminator needed, no schema lookup required.

---

#### 8. `delete_records`

**New tool.** No current equivalent — the existing system has no delete tools.

```typescript
delete_records = tool({
  description:
    "Permanently delete one or more CRM records by ID. This is irreversible. " +
    "Supports batch deletion (up to 50 records per call). " +
    "For deal_contacts links, use link_records with action 'unlink' instead. " +
    "DESTRUCTIVE: This action requires user approval before execution.",
  inputSchema: z.object({
    entity: z.enum(["contacts", "companies", "deals", "interactions", "tasks"])
      .describe("CRM entity type to delete."),
    ids: z.array(z.string().uuid()).min(1).max(50)
      .describe("Array of UUIDs to delete."),
    reason: z.string()
      .describe("Why these records are being deleted. Logged for audit."),
  }),
})
```

**Response shape:**
```typescript
// All deleted
{ success: true, deleted_count: number, ids: string[] }
// Partial failure
{ success: false, error: string, deleted_count: number, failed_ids: string[] }
```

**Implementation notes:**
- Delete from correct table based on `entity` (maps to `contacts`, `companies`, `deals`, `interactions`, `crm_tasks`)
- Always filter by `client_id` (RLS + application-level double-lock)
- `reason` is logged for audit trail but not used in execution — forces the model to articulate intent before destructive action
- Cascade behavior: deleting a contact removes its `deal_contacts` junction rows (DB CASCADE). Deleting a company nulls `company_id` on linked contacts/deals (DB SET NULL). These are standard FK behaviors, not application logic.
- Deal-contact links are NOT deleted via this tool — use `link_records(action: "unlink")` instead. This avoids accidentally deleting the contact when you meant to unlink it from a deal.

**Why this is safe despite being destructive:**
1. **Approval gate is the safety layer.** Our safety model has two tiers: internal work auto-runs, external/destructive actions require user approval. Delete is gated at the approval layer, not the tool-availability layer. This follows Nicolas Bustamante's principle: "tool-enforced safety > behavioral safety." The enforcement is structural (approval gate blocks execution until confirmed), not behavioral (hoping the model won't call it).
2. **`reason` field creates friction.** The model must articulate *why* before deleting. This is the same pattern as `crm_sql`'s `purpose` field — it slows down the fast path and creates an audit trail.
3. **Batch cap at 50** prevents runaway mass deletion.
4. **RLS** ensures the agent can only delete within its own tenant, even if it tried to pass another client's IDs.

---

### Tier 2: SQL Escape Hatch (1 tool)

#### 9. `crm_sql`

**New tool.** Extends the existing `run_agent_memory_sql` pattern to CRM tables specifically.

```typescript
crm_sql = tool({
  description:
    "Run a read-only SQL query against CRM tables. Use for complex queries that " +
    "search_crm cannot express: multi-table JOINs, aggregations (COUNT, SUM, AVG), " +
    "GROUP BY, HAVING, subqueries, date arithmetic, complex WHERE clauses. " +
    "Only SELECT and CTE (WITH) queries allowed. " +
    "Available tables: contacts, companies, deals, interactions, crm_tasks, deal_contacts. " +
    "All tables have client_id — RLS enforces tenant isolation automatically. " +
    "Prefer search_crm for simple lookups. Use crm_sql when you need JOINs or aggregations.",
  inputSchema: z.object({
    query: z.string().min(1)
      .describe("SQL SELECT/CTE query. Single statement only, no semicolons."),
    purpose: z.string()
      .describe("Brief description of what this query answers. Logged for audit."),
  }),
})
```

**Response shape:**
```typescript
{ success: true, rows: Record[], row_count: number }
| { success: false, error: string }
```

**Implementation notes:**
- Reuse existing `run_readonly_sql` RPC (same as `run_agent_memory_sql`)
- Validate: must start with SELECT/WITH, no semicolons, single statement
- `purpose` field is logged but not used in execution — provides audit trail and helps the model articulate intent before writing SQL
- RLS on all CRM tables enforces `client_id` scoping at the DB layer — the agent cannot access other tenants' data even with raw SQL
- Add a `row_count` field to responses for auto-verification (the model can sanity-check "I expected ~5 results, got 147")

**Why a separate `crm_sql` vs reusing `run_agent_memory_sql`:**
1. Different description optimized for CRM context (lists CRM tables, suggests JOINs/aggregations)
2. `purpose` field for audit trail on CRM data access
3. Could later add CRM-specific guardrails (e.g., table allowlist) without affecting the utility SQL tool
4. Keeps CRM tooling self-contained — another dev managing the utility tools doesn't need to worry about CRM concerns

**Why not just SQL for everything:** The Vercel d0 team's semantic layer was read-only documentation. Our CRM has writes. Nicolas Bustamante's analysis of Excel agents shows that Claude's 14-structured-tool approach achieved the strongest safety profile specifically because mutations go through validated, typed tools. Raw SQL INSERT/UPDATE would bypass: duplicate detection, custom field schema validation, Zod type checking, the `force_create` safety gate, and the audit-friendly response shapes. The escape hatch is read-only by design — all writes go through Tier 1.

---

### Unchanged (2 tools)

#### 10. `configure_crm` (setup mode only)

No changes. Only available when `crmMode === "setup"`. Replaces all CRM read/write tools. Has its own removal-impact checking logic. Out of scope for this consolidation.

#### 11. `describe_crm_schema` → **Moved to system-reminder**

No longer a callable tool. The CRM schema (stages, types, roles, industries, custom fields) is injected into the system-reminder block on every turn, following the Vercel AGENTS.md pattern.

**System-reminder format:**
```
CRM schema:
- Deal stages: leads, viewing, negotiation, closed_won, closed_lost
- Contact types: buyer, seller, tenant, landlord, other
- Interaction types: call, email, meeting, whatsapp, viewing, note
- Deal-contact roles: buyer, seller, tenant, landlord, agent
- Company industries: developer, agency, bank, legal, other
- Custom fields: contacts(source, preferred_language), deals(property_type, tenure)
```

This is ~200 bytes of passive context. The current `describe_crm_schema` tool definition + response costs ~500+ tokens when called. Passive injection is cheaper AND more reliable (100% availability vs. model deciding whether to call it).

---

## Migration Map

| Current Tool | → New Tool | Notes |
|---|---|---|
| `search_companies` | `search_crm(entity: "companies")` | |
| `search_contacts` | `search_crm(entity: "contacts")` | |
| `search_deals` | `search_crm(entity: "deals")` | |
| `search_interactions` | `search_crm(entity: "interactions")` | |
| `search_tasks` | `search_crm(entity: "tasks")` | |
| `get_deal_contacts` | `search_crm(entity: "deal_contacts", filters: { deal_id })` | |
| `get_contact_deals` | `search_crm(entity: "deal_contacts", filters: { contact_id })` | |
| `get_company_contacts` | `search_crm(entity: "contacts", filters: { company_id })` | |
| `get_company_deals` | `search_crm(entity: "deals", filters: { company_id })` | |
| `create_company` | `create_record(entity: "companies", records: [...])` | |
| `create_contact` | `create_record(entity: "contacts", records: [...])` | |
| `create_deal` | `create_record(entity: "deals", records: [...])` | |
| `batch_create_companies` | `create_record(entity: "companies", records: [...])` | Same tool, array > 1 |
| `batch_create_contacts` | `create_record(entity: "contacts", records: [...])` | Same tool, array > 1 |
| `batch_create_deals` | `create_record(entity: "deals", records: [...])` | Same tool, array > 1 |
| `update_company` | `update_record(entity: "companies", id, fields)` | |
| `update_contact` | `update_record(entity: "contacts", id, fields)` | |
| `update_deal` | `update_record(entity: "deals", id, fields)` | |
| `link_contact_to_deal` | `link_records(action: "link", relationship: "contact_deal")` | |
| `unlink_contact_from_deal` | `link_records(action: "unlink", relationship: "contact_deal")` | |
| `link_contact_to_company` | `link_records(action: "link", relationship: "contact_company")` | |
| `unlink_contact_from_company` | `link_records(action: "unlink", relationship: "contact_company")` | |
| `link_deal_to_company` | `link_records(action: "link", relationship: "deal_company")` | |
| `unlink_deal_from_company` | `link_records(action: "unlink", relationship: "deal_company")` | |
| `create_interaction` | `create_interaction` | Unchanged |
| `create_task` | `create_task` | Unchanged |
| `update_task` | `update_task` | Unchanged |
| *(no equivalent)* | `delete_records` | **New** — approval-gated destructive action |
| `describe_crm_schema` | System-reminder injection | No longer a tool |

---

## Safety Features Preserved

| Safety Feature | Current | After Consolidation |
|---|---|---|
| **Duplicate detection** | Built into each `create_*` tool | Built into `create_record` — same logic, dispatched by entity |
| **`force_create` override** | Per-tool boolean param | Same param on `create_record` |
| **Intra-batch dedup** | `batch_create_contacts` checks within array | `create_record` checks within array for all entities |
| **Custom field validation** | Config-driven Zod schemas per entity | Same — dispatched by entity inside `create_record` / `update_record` |
| **Custom field deep-merge** | `mergeCustomFields()` on update | Same — called inside `update_record` |
| **Enum validation** | Zod enums (stages, types, roles, industries) | Same — entity-specific schemas applied at runtime |
| **Tenant isolation** | `client_id` in closure + RLS | Unchanged. `crm_sql` adds RLS-only (no application filter needed) |
| **Read-only SQL** | `run_agent_memory_sql` validates SELECT/CTE only | `crm_sql` uses same validation |
| **No delete capability** | Deliberately omitted | Now available via `delete_records` — gated by approval system |
| **Approval gate for destructive actions** | Safety model: external/destructive → requires approval | `delete_records` is approval-gated. `reason` field forces intent articulation + audit trail. Batch cap at 50. |
| **Data Modification Warning** | In every write tool description | In `create_record`, `update_record`, `delete_records`, `link_records`, `create_interaction`, `create_task`, `update_task` |
| **Auto-verification** | All tools return full created/updated record | Same pattern in all new tools. `delete_records` returns deleted IDs + count. |

---

## Impact on Tool Count

| Category | Before | After | Change |
|---|---|---|---|
| CRM Read | 10 | 1 (`search_crm`) + passive schema | -9 |
| CRM Write | 18 | 7 (`create_record` + `update_record` + `delete_records` + `link_records` + `create_interaction` + `create_task` + `update_task`) | -11 |
| CRM SQL | 0 | 1 (`crm_sql`) | +1 |
| CRM Setup | 1 (`configure_crm`) | 1 (unchanged) | 0 |
| **CRM subtotal** | **29** | **10** (+1 passive) | **-19** |
| Other categories | 23 | 23 (untouched) | 0 |
| **Total agent tools** | **52** | **33** | **-19** |

33 total tools is comfortably under the ~25 "worry" threshold for CRM-specific tools (now 10), while keeping the full agent toolset well within the range of proven harnesses (Claude Code: ~18, Manus: ~29).

---

## Implementation Order

1. **System-reminder schema injection** — add CRM config to system-reminder builder. Remove `describe_crm_schema` from tool registration.
2. **`search_crm`** — implement with entity routing. Write tests. Remove 9 old search/get tools.
3. **`create_record`** — implement with per-entity validation + dedup + batch. Write tests. Remove 6 old create/batch tools.
4. **`update_record`** — implement with per-entity validation + custom field merge + batch. Write tests. Remove 3 old update tools.
5. **`delete_records`** — implement with approval gate integration + audit logging. Write tests.
6. **`link_records`** — implement with relationship routing. Write tests. Remove 6 old link/unlink tools.
7. **`crm_sql`** — implement as CRM-scoped wrapper around `run_readonly_sql`. Write tests.
8. **Update system prompt** — adjust tool usage instructions to reference new tool names.
9. **Update `index.ts` factory** — wire new tools into the registration/gating logic.

Steps 2-6 can be done as a single PR or split into 2 PRs (read tools + write tools).
