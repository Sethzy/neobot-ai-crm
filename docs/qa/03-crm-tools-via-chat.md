# QA Surface 3: CRM Tools via Chat

> **PRs covered:** 5 (schema), 6 (CRM tools), 15c (configurability + custom fields), 15d (companies), 15e (read parity + introspection)
> **Dogfoodable:** Partial (via chat UI)
> **Time estimate:** 30-40 min manual (lots of agent prompts)

---

## Prerequisites

- Logged in with a working chat
- `RUNNER_ENABLE_CRM_WRITE_TOOLS=1` in env
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
2. **Expected tool calls:** `create_contact` (Sarah Lim, type: buyer), `create_deal` (88 Tanjong Pagar, stage: lead, price: 1800000), `link_contact_to_deal`
3. **Expected:** Agent confirms creation in natural language
4. **Verify in Supabase:** `contacts` row exists with correct fields, `deals` row exists, `deal_contacts` junction row links them

**Notes / failures:**

---

### 3.2 Contact CRUD

1. **Create:** "Add a new contact — James Tan, seller, phone 9123-4567, email james@example.com"
2. **Expected:** `create_contact` tool call with all fields
3. **Update:** "Update James Tan's phone to 9876-5432"
4. **Expected:** `search_contacts` (finds James) → `update_contact` (updates phone)
5. **Search:** "Find all my buyer contacts"
6. **Expected:** `search_contacts` with type filter, returns Sarah from 3.1

**Notes / failures:**

---

### 3.3 Deal CRUD

1. **Create:** "New deal at 42 Robertson Walk, asking $2.5M, stage is viewing"
2. **Expected:** `create_deal` with address, price, stage
3. **Update:** "Move the Robertson Walk deal to negotiation stage"
4. **Expected:** `search_deals` → `update_deal` with stage change
5. **Search:** "Show me all deals in negotiation"
6. **Expected:** `search_deals` with stage filter

**Notes / failures:**

---

### 3.4 Task CRUD

1. **Create:** "Remind me to follow up with Sarah Lim next Monday about the viewing"
2. **Expected:** `create_task` with title, due_date (next Monday), linked to Sarah's contact_id
3. **Search:** "What tasks do I have this week?"
4. **Expected:** `search_tasks` with date range or status filter
5. **Update:** "Mark the Sarah follow-up task as done"
6. **Expected:** `search_tasks` → `update_task` with status change

**Notes / failures:**

---

### 3.5 Company CRUD (PR 15d)

1. **Create:** "Add a company — PropNex Realty, industry: real estate brokerage, website propnex.com"
2. **Expected:** `create_company` tool call
3. **Link:** "Link Sarah Lim to PropNex"
4. **Expected:** `search_contacts` + `search_companies` → `link_contact_to_company`
5. **Link deal:** "Link the Tanjong Pagar deal to PropNex as well"
6. **Expected:** `link_deal_to_company`
7. **Read back:** "Show me all contacts and deals for PropNex"
8. **Expected:** `search_companies` → `get_company_contacts` + `get_company_deals`

**Notes / failures:**

---

### 3.6 Interactions

1. **Create:** "I just had a phone call with Sarah Lim about the Tanjong Pagar unit. She's very interested and wants to view this Saturday."
2. **Expected:** `create_interaction` with type: call, summary, linked to contact and deal
3. **Search (PR 15e):** "What were my last 3 interactions with Sarah?"
4. **Expected:** `search_interactions` with contact_id filter, returns chronological results

**Notes / failures:**

---

### 3.7 CRM configurability (PR 15c)

1. **Reconfigure:** "I'm actually an insurance agent. Change my deal stages to: lead, quoted, underwriting, bound, lost. And call deals 'policies'."
2. **Expected:** `configure_crm` tool call updating deal_stages and deal_label
3. **Verify:** "What are my current CRM stages?"
4. **Expected:** `describe_crm_schema` (PR 15e) returns the new config
5. **Custom fields:** "I need to track 'policy number' and 'coverage amount' on my policies"
6. **Expected:** `configure_crm` adding custom fields to deal_custom_fields
7. **Use custom fields:** "Create a new policy — policy number INS-2026-001, coverage $500K, client James Tan"
8. **Expected:** `create_deal` includes custom_fields with policy_number and coverage_amount

**Notes / failures:**

---

### 3.8 Schema introspection (PR 15e)

1. "What fields do I track on contacts?"
2. **Expected:** `describe_crm_schema` returns contact field definitions including any custom fields
3. "How is my CRM configured?"
4. **Expected:** Returns full config — labels, stages, types, custom fields

**Notes / failures:**

---

### 3.9 Relationship reads (PR 15e)

1. "What deals is Sarah Lim involved in?"
2. **Expected:** `get_contact_deals` returns linked deals with role info
3. "Show me all contacts at PropNex"
4. **Expected:** `get_company_contacts` returns linked contacts

**Notes / failures:**

---

### 3.10 Batch company creation (PR 15d)

1. "Add these companies: ERA Realty, OrangeTee & Tie, Huttons Asia"
2. **Expected:** `batch_create_companies` creates all three
3. **Verify:** All three appear in Supabase `companies` table

**Notes / failures:**

---

## Edge Cases

- [ ] Create contact with minimal info (just a name) — should succeed
- [ ] Create deal with no price — should succeed (price is optional)
- [ ] Search with no results — agent says "no results found" gracefully
- [ ] Update non-existent entity — agent handles the "not found" error
- [ ] Duplicate contact creation — agent should detect or handle gracefully
- [ ] Custom field with invalid type (e.g., pass text to a number field) — validation catches it
- [ ] Very long notes field (1000+ chars) — stores and retrieves correctly
- [ ] Configure CRM back to real estate defaults — verify everything reverts
- [ ] search_tasks with free-text query (PR 15e) — "find tasks about viewing"

---

## Pass / Fail Criteria

- **Pass:** All CRUD operations work for contacts, deals, tasks, companies, and interactions. CRM configurability changes vocabulary and custom fields. Relationship tools return correct linked data. Schema introspection reflects current config.
- **Fail:** Tool calls fail silently, data not persisted to DB, configurability doesn't propagate to tool schemas, relationship reads return wrong data.
