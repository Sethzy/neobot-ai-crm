# QA Surface 4: CRM Pages

> **PRs covered:** 10 (contacts page), 11 (deals + tasks pages), 15c (dynamic labels + custom fields in drawers), 15d (companies page + drawers), 15f (config-driven columns), 9 (Supabase Realtime live updates)
> **Dogfoodable:** Yes — primary dogfood target
> **Time estimate:** 25-30 min manual

---

## Prerequisites

- CRM has test data (run Surface 3 first, or seed via Supabase)
- At least: 3 contacts, 3 deals, 2 tasks, 2 companies with some linked relationships
- At least one contact linked to a company, one deal linked to a company

---

## Dogfood Checklist (automated browser pass)

- [ ] `/crm` redirects or renders the tabbed CRM section
- [ ] Contacts tab: table loads with data, columns visible (name, email, phone, type, company)
- [ ] Deals tab: table loads with stage badges, price formatting
- [ ] Tasks tab: table loads with status, due date, linked contact/deal
- [ ] Companies tab: table loads with name, industry, contact count, deal count
- [ ] All tables have search/filter functionality
- [ ] Clicking a row opens a drawer (not a new page)
- [ ] Drawers render without console errors
- [ ] Responsive: tables work on tablet (768px) and mobile (375px)
- [ ] No layout overflow or horizontal scroll issues on tables
- [ ] Sidebar nav has CRM section with correct links

---

## Manual QA Scenarios

### 4.1 Contacts list page

1. Navigate to `/crm` → Contacts tab
2. **Expected:** TanStack Table with columns: name, email, phone, type, company
3. Search for "Sarah" in the search box
4. **Expected:** Filter narrows to Sarah Lim
5. Filter by contact type (e.g., "buyer")
6. **Expected:** Only buyers shown
7. Clear filters
8. **Expected:** All contacts visible again

**Notes / failures:**

---

### 4.2 Contact drawer

1. Click on Sarah Lim's row
2. **Expected:** Drawer opens showing:
   - Name, email, phone, type
   - Company field (if linked via 3.5)
   - Custom fields (if any configured in 3.7)
   - Linked deals section
   - Interaction timeline (most recent first)
3. **Verify:** Linked deals match what was created in Surface 3
4. **Verify:** Interactions show the phone call from 3.6
5. Close drawer
6. **Expected:** Returns to contacts list, no state corruption

**Notes / failures:**

---

### 4.3 Deals list page

1. Navigate to Deals tab
2. **Expected:** Table with columns: address, stage (badge), price (formatted), contact, company
3. **Expected:** Stage badges use color coding
4. Filter by stage (e.g., "negotiation")
5. **Expected:** Only deals in that stage shown
6. If CRM was reconfigured (3.7), stage filter options should reflect new config

**Notes / failures:**

---

### 4.4 Deal drawer

1. Click on a deal row
2. **Expected:** Drawer shows:
   - Address, stage badge, price
   - Linked contact(s) with role
   - Linked company (if any)
   - Custom fields (if configured — e.g., policy_number)
   - Interaction timeline for this deal
3. **Verify:** All relationships are correct

**Notes / failures:**

---

### 4.5 Tasks list page

1. Navigate to Tasks tab
2. **Expected:** Table with columns: title, status, due date, linked contact, linked deal
3. **Expected:** Overdue tasks are visually distinct (color/badge)
4. Filter by status
5. **Expected:** Correct filtering

**Notes / failures:**

---

### 4.6 Companies list page (PR 15d)

1. Navigate to Companies tab
2. **Expected:** Table with columns: name, industry, phone, website, contact count, deal count
3. Search for "PropNex"
4. **Expected:** Filter works
5. Filter by industry
6. **Expected:** Industry options come from crm_config (or real estate defaults)

**Notes / failures:**

---

### 4.7 Company drawer (PR 15d)

1. Click on PropNex row
2. **Expected:** Drawer shows:
   - Name, industry badge, website, phone, email, address, notes
   - Custom fields (if configured)
   - Related contacts list (Sarah Lim if linked in 3.5)
   - Related deals list (Tanjong Pagar deal if linked in 3.5)
3. **Verify:** Contact and deal counts in the table match the drawer lists

**Notes / failures:**

---

### 4.8 Dynamic labels (PR 15c)

1. If CRM was reconfigured in 3.7 (insurance mode):
   - **Expected:** "Deals" tab might show as "Policies" (if label propagates to tab name)
   - **Expected:** Stage filter shows insurance stages (lead, quoted, underwriting, bound, lost)
   - **Expected:** Drawers show custom fields (policy_number, coverage_amount)
2. If still in real estate mode:
   - **Expected:** Default labels and stages

**Notes / failures:**

---

### 4.9 Cross-entity navigation

1. Open a contact drawer → click on a linked deal
2. **Expected:** Navigates to deal drawer or deal detail
3. Open a company drawer → click on a related contact
4. **Expected:** Navigates to contact detail
5. Open a deal drawer → click on linked company
6. **Expected:** Navigates to company detail

**Notes / failures:**

---

### PR 9: Supabase Realtime

### 4.10 Realtime contact creation (PR 9)

1. Open CRM Contacts page in browser tab A
2. In browser tab B, open chat and say: "Create a contact named Test Realtime with email test@realtime.com"
3. **Expected:** Agent creates the contact via `create_record`
4. Switch to tab A (DO NOT refresh)
5. **Expected:** "Test Realtime" appears in the contacts table automatically without refresh
6. **Verify:** The Supabase Realtime subscription received the INSERT event

**Notes / failures:**

---

### 4.11 Realtime deal update (PR 9)

1. Open CRM Deals page in tab A
2. In tab B chat: "Move the Tanjong Pagar deal to negotiation stage"
3. **Expected:** Agent updates the deal via `update_record`
4. Switch to tab A (no refresh)
5. **Expected:** Deal's stage badge updates from previous stage to "Negotiation" automatically

**Notes / failures:**

---

### 4.12 Realtime — subscribe on mount, unsubscribe on unmount (PR 9)

1. Open CRM Contacts page
2. Navigate away to `/chat`
3. Create a contact via chat
4. Navigate back to CRM Contacts
5. **Expected:** New contact visible (fresh subscription on mount)
6. **Verify:** No console errors about stale subscriptions or memory leaks

**Notes / failures:**

---

### PR 15f: Config-driven columns

### 4.13 Config-driven column rendering

1. Open People page with default config
2. **Expected:** Columns match pre-feature layout: Name, Email, Phone, Company, Type, Updated
3. Open Companies page
4. **Expected:** Columns include Name, Website, Address, Phone, Email, Industry, Updated
5. Open Deals page
6. **Expected:** Columns include Name, Amount, Stage, Company, Address, Updated

**Notes / failures:**

---

### 4.14 Custom field columns appear after config change

1. Via agent: "Add a 'Priority' select field to contacts with options high/medium/low"
2. Refresh People page
3. **Expected:** Priority column appears as the last column with select badges
4. Via agent: "Create a contact — Alice Wong, priority high"
5. **Expected:** Alice appears with "high" badge in the Priority column

**Notes / failures:**

---

### 4.15 Column visibility toggle

1. Via agent: "Hide the Phone column from contacts"
2. Refresh People page
3. **Expected:** Phone column gone, existing phone data preserved in DB
4. Via agent: "Show the Phone column again"
5. Refresh People page
6. **Expected:** Phone column reappears with all data intact

**Notes / failures:**

---

## Edge Cases

- [ ] Empty CRM (no data) — tables show empty state, not error
- [ ] Contact with no linked deals — drawer shows empty deals section gracefully
- [ ] Deal with no linked contact — drawer handles null contact
- [ ] Company with no contacts or deals — counts show 0, drawer shows empty lists
- [ ] Very long notes in drawer — text wraps, no overflow
- [ ] 100+ contacts — table pagination or virtual scroll works
- [ ] Table sort by column — click column header, data reorders
- [ ] Drawer on mobile — renders as full-screen sheet or modal
- [ ] Realtime with slow network — update eventually appears (no silent drop)
- [ ] Rapid consecutive updates — all reflect in table (no missed events)

---

## Pass / Fail Criteria

- **Pass:** All CRM entity pages render correctly with data from agent-created records. Drawers show accurate relationships and custom fields. Search/filter works. Dynamic labels reflect CRM config. Realtime updates appear without page refresh when agent creates/updates records.
- **Fail:** Tables crash with no data, drawers show wrong relationships, custom fields missing from drawers, filters don't work, dynamic labels not applied, Realtime updates don't appear (requires refresh).
