# QA Surface 3: CRM Tools via Chat

> **PRs covered:** 5 (schema), 6 (CRM tools), 15c (configurability + custom fields), 15d (companies), 15e (read parity + introspection), 15f (configurable columns), CRM consolidation (28→8 tools), 48 (CRM config mode — time-limited activation from Settings), 67 (saved views — manage_views tool), 2026-04-23 KISS CRM UX foundation (state-based saved workspaces + SQL read views)
> **Dogfoodable:** Partial (via chat UI)
> **Time estimate:** 35-45 min manual (lots of agent prompts)
> **v2 tools:** `search_crm`, `create_record`, `update_record`, `delete_records`, `link_records`, `create_interaction`, `create_task`, `update_task`, `configure_crm`, `manage_views`

---

## Prerequisites

- Logged in with a working chat
- Empty or known CRM state (optionally clear test data first)
- Supabase dashboard open to verify DB writes

---

## Dogfood Checklist (automated browser pass)

- [ ] Chat loads, agent responds to CRM-related prompts
- [ ] Tool call pills appear for CRM operations
- [ ] Tool call pills expand to show arguments and results
- [ ] No console errors during CRM tool execution

---

## Manual QA Scenarios

### 3.1 The Demo Moment — contact + deal creation

1. New thread. Type: **"I just met Sarah Lim at 88 Tanjong Pagar. She's a buyer interested in the 2BR unit, price around $1.8M."**
2. **Expected tool calls:** `create_record` (entity: contacts, Sarah Lim, type: buyer), `create_record` (entity: deals, 88 Tanjong Pagar, stage: lead, price: 1800000), `link_records` (relationship: contact_deal)
3. **Expected:** Agent confirms creation in natural language
4. **Verify in Supabase:** `contacts` row exists with correct fields, `deals` row exists, `deal_contacts` junction row links them
5. **Expected:** Duplicate detection did NOT fire (first-time creation)

**Notes / failures:**

---

### 3.2 Contact CRUD

1. **Create:** "Add a new contact — James Tan, seller, phone 9123-4567, email james@example.com"
2. **Expected:** `create_record` with entity: contacts, records: [{first_name: "James", last_name: "Tan", ...}]
3. **Update:** "Update James Tan's phone to 9876-5432"
4. **Expected:** `search_crm` (entity: contacts, query: "James Tan") → `update_record` (entity: contacts, updates: [{id, fields: {phone: "9876-5432"}}])
5. **Search:** "Find all my buyer contacts"
6. **Expected:** `search_crm` with entity: contacts, filters: {type: "buyer"}, returns Sarah from 3.1

**Notes / failures:**

---

### 3.3 Deal CRUD

1. **Create:** "New deal at 42 Robertson Walk, asking $2.5M, stage is viewing"
2. **Expected:** `create_record` with entity: deals, records: [{address, price, stage}]
3. **Update:** "Move the Robertson Walk deal to negotiation stage"
4. **Expected:** `search_crm` (entity: deals) → `update_record` (entity: deals). May trigger `deal_stage_changed` analytics event.
5. **Search:** "Show me all deals in negotiation"
6. **Expected:** `search_crm` with entity: deals, filters: {stage: "negotiation"}

**Notes / failures:**

---

### 3.4 Task CRUD

1. **Create:** "Remind me to follow up with Sarah Lim next Monday about the viewing"
2. **Expected:** `create_task` with title, due_date (next Monday), contact_id linked to Sarah. Agent may call `search_crm` first to find Sarah's ID.
3. **Search:** "What tasks do I have this week?"
4. **Expected:** `search_crm` with entity: tasks. `run_sql` is also acceptable for date-range queries.
5. **Update:** "Mark the Sarah follow-up task as done"
6. **Expected:** `search_crm` (entity: tasks) → `update_task` with status: "completed"

**Notes / failures:**

---

### 3.5 Company CRUD (PR 15d)

1. **Create:** "Add a company — PropNex Realty, industry: real estate brokerage, website propnex.com"
2. **Expected:** `create_record` with entity: companies
3. **Link:** "Link Sarah Lim to PropNex"
4. **Expected:** `search_crm` (may call once or twice for contact + company) → `link_records` with relationship: contact_company
5. **Link deal:** "Link the Tanjong Pagar deal to PropNex as well"
6. **Expected:** `search_crm` → `link_records` with relationship: deal_company
7. **Read back:** "Show me all contacts and deals for PropNex"
8. **Expected:** `search_crm` with entity: contacts + filters: {company_id}, and `search_crm` with entity: deals + filters: {company_id}. Or `run_sql` with JOINs.

**Notes / failures:**

---

### 3.6 Interactions

1. **Create:** "I just had a phone call with Sarah Lim about the Tanjong Pagar unit. She's very interested and wants to view this Saturday."
2. **Expected:** `create_interaction` with contact_id, type (from config enum), summary. Agent may call `search_crm` first to find contact_id.
3. **Search (PR 15e):** "What were my last 3 interactions with Sarah?"
4. **Expected:** `search_crm` with entity: interactions, filters: {contact_id}. Returns chronological results.

**Notes / failures:**

---

### 3.7 CRM configurability (PR 15c, PR 48)

**Prerequisite:** CRM configuration mode must be activated from Settings (or via `POST /api/settings/crm-config-mode`) before the agent can use `configure_crm`. The QA runner handles this automatically for scenarios with `activateCrmConfigMode: true`.

1. **Reconfigure:** "I'm actually an insurance agent. Change my deal stages to: lead, quoted, underwriting, bound, lost. And call deals 'policies'."
2. **Expected:** `configure_crm` tool call updating deal_stages and deal_label
3. **Verify:** "What are my current CRM stages?"
4. **Expected:** Agent answers from `<crm-vocabulary>` in system-reminder context. No tool call needed (describe_crm_schema was removed in v2).
5. **Custom fields:** "I need to track 'policy number' and 'coverage amount' on my policies"
6. **Expected:** `configure_crm` adding custom fields to deal_custom_fields
7. **Use custom fields:** "Create a new policy — policy number INS-2026-001, coverage $500K, client James Tan"
8. **Expected:** `create_record` with entity: deals, includes custom_fields with policy_number and coverage_amount

**Notes / failures:**

---

### 3.8 Schema introspection

1. "What fields do I track on contacts?"
2. **Expected:** Agent answers from `<crm-vocabulary>` injected in system-reminder. No tool call needed.
3. "How is my CRM configured?"
4. **Expected:** Agent answers from context — returns full config including labels, stages, types, custom fields.

**Notes / failures:**

---

### 3.9 Relationship reads

1. "What deals is Sarah Lim involved in?"
2. **Expected:** `search_crm` with entity: deal_contacts and filters: {contact_id}. Returns linked deals with role info.
3. "Show me all contacts at PropNex"
4. **Expected:** `search_crm` with entity: contacts, filters: {company_id}. Or `run_sql` with JOINs.

**Notes / failures:**

---

### 3.10 Batch company creation (PR 15d)

1. "Add these companies: ERA Realty, OrangeTee & Tie, Huttons Asia"
2. **Expected:** `create_record` with entity: companies, records array of 3 (batch support built in, up to 50 per call)
3. **Expected:** Built-in duplicate detection checks each record
4. **Verify:** All three appear in Supabase `companies` table

**Notes / failures:**

---

### 3.11 Config-driven column management (PR 15f)

**Prerequisite:** CRM configuration mode must be activated from Settings before the agent can use `configure_crm`.

1. **Add a custom column:** "I need to track 'budget' on my contacts"
2. **Expected:** `configure_crm` adding a field to contact_fields with key: "budget", type: "number", source: "custom", tier: "custom", visible: true
3. **Verify:** Refresh People page — Budget column appears
4. **Hide a default column:** "Hide the city column from contacts"
5. **Expected:** `configure_crm` setting visible: false on the city field entry
6. **Verify:** Refresh People page — City column gone, but data still in DB
7. **Rename a column:** "Rename Email to Work Email on contacts"
8. **Expected:** `configure_crm` updating label to "Work Email" on the emails field entry
9. **Verify:** Refresh People page — column header says "Work Email"
10. **Try to hide Name:** "Hide the name column from contacts"
11. **Expected:** Agent refuses — tier enforcement blocks hiding indestructible fields
12. **Bulk onboarding configure:** "I'm an insurance advisor. Set up my CRM for insurance — rename deals to policies, change stages to quote/application/underwriting/bound/lost, add policy_number and coverage_amount fields"
13. **Expected:** `configure_crm` with bulk updates to deal_label, deal_stages, and deal_fields
14. **Verify:** Deals page now shows "Policies" with new stages and custom columns

**Notes / failures:**

---

### 3.12 Create a saved view via manage_views (PR 67)

1. "Create a view called 'Hot leads' for deals in the leads stage"
2. **Expected:** Agent calls `manage_views` with operation: create, entity_type: deals, filters: { stage: "leads" }
3. **Verify in Supabase:** `crm_views` row exists with correct client_id, entity_type, legacy `filters`, and populated `state`
4. **Verify in UI:** Navigate to `/customers/deals` — "Hot leads" pill tab appears

**Notes / failures:**

---

### 3.13 List and delete saved views (PR 67)

1. "List my saved views for deals"
2. **Expected:** Agent calls `manage_views` with operation: list, entity_type: deals — returns seeded + user-created views
3. "Delete the Hot leads view"
4. **Expected:** Agent calls `manage_views` with operation: delete, view_id: <uuid>
5. **Verify in UI:** "Hot leads" pill disappears from `/customers/deals`

**Notes / failures:**

---

### 3.14 manage_views rejects invalid filter keys (PR 67)

1. "Create a view for contacts where hasEmail is true"
2. **Expected:** `manage_views` returns error — `hasEmail` not in allowed filter keys for contacts
3. Agent explains valid filter keys or rephrases using a valid filter

**Notes / failures:**

---

### 3.15 configure_crm warns about affected saved workspaces

1. Create a contacts view that filters on `type = buyer`
2. Ask: "Remove buyer from my contact types"
3. **Expected:** `configure_crm` returns a warning mentioning affected saved views
4. **Expected:** Warning references saved-view filters or saved workspace fields that now need review

**Notes / failures:**

---

### 3.16 get_agent_db_schema + run_sql expose CRM read views

1. Ask: "Show me the SQL schema I can query"
2. **Expected:** `get_agent_db_schema` includes `crm_contacts_index_v`, `crm_companies_index_v`, `crm_deals_index_v`, and `crm_tasks_index_v`
3. Ask: "Use SQL to list my deals with company and primary contact names"
4. **Expected:** Agent can query `crm_deals_index_v` directly through `run_sql`
5. Ask: "Use SQL to show my overdue tasks with contact and company names"
6. **Expected:** Agent can query `crm_tasks_index_v` directly through `run_sql`

**Notes / failures:**

---

## Edge Cases

- [ ] manage_views with symbolic date tokens ($today, $week_start) — creates view successfully, filters resolve at query time
- [ ] manage_views update with invalid sort column — returns validation error
- [ ] manage_views create/update with `state.viewType`, `state.columns`, `state.openMode` — persists into `crm_views.state`
- [ ] Saved view still works when caller uses legacy top-level `filters` / `sort`
- [ ] Create view with duplicate name on same entity — unique constraint error handled gracefully
- [ ] Create contact with minimal info (just a name) — should succeed (first_name + last_name minimum)
- [ ] Create deal with no price — should succeed (price is optional, address is required)
- [ ] Search with no results — agent says "no results found" gracefully
- [ ] Update non-existent entity — agent handles the "not found" error
- [ ] Duplicate contact creation — `create_record` returns possible_duplicates. Set `force_create: true` to override.
- [ ] Custom field with invalid type (e.g., pass text to a number field) — validation catches it
- [ ] Very long notes field (1000+ chars) — stores and retrieves correctly
- [ ] Configure CRM back to real estate defaults — verify everything reverts
- [ ] search_crm with free-text query — "find tasks about viewing"
- [ ] Batch create with intra-batch duplicates (same name twice) — returns error with duplicate list
- [ ] update_record with custom_fields — deep merge preserves existing keys not in patch
- [ ] link_records unlink action — removes relationship (junction delete for contact_deal, null FK for contact_company/deal_company)
- [ ] Configure CRM to add a field, then remove it — warning about data exists, requires confirm_removals
- [ ] Config history snapshot saved — check crm_config_history table after configure_crm call

---

## Pass / Fail Criteria

- **Pass:** All CRUD operations work for contacts, deals, tasks, companies, and interactions via consolidated v2 tools. CRM configurability changes vocabulary and custom fields. Relationship reads via search_crm with entity: deal_contacts work. Schema info is available from system-reminder context. `manage_views` creates/lists/updates/deletes saved workspaces, validates filter keys against entity whitelist, and persists the richer `state` shape. `run_sql` and `get_agent_db_schema` expose the CRM read views for flatter reporting queries.
- **Fail:** Tool calls fail silently, data not persisted to DB, configurability doesn't propagate to tool schemas, relationship reads return wrong data. `manage_views` loses compatibility with legacy `filters` / `sort`, accepts invalid filter keys, or fails to persist workspace state. `get_agent_db_schema` omits the new CRM read views.
