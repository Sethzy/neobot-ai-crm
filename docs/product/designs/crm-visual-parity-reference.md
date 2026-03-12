# CRM Visual Parity Reference — Mercato vs Sunder

> **Purpose:** Gap analysis with screenshots so a dev can iterate our CRM pages until they visually match the Mercato reference. Each section shows the target (Mercato), our current state (Sunder), and an itemized list of visual gaps to close.

## Screenshot Locations

### Mercato Reference (target)
- `screenshots/mercato-reference/mercato-people.png` — People list page
- `screenshots/mercato-reference/mercato-companies.png` — Companies list page
- `screenshots/mercato-reference/mercato-deals.png` — Deals list page
- `screenshots/mercato-reference/mercato-pipeline.png` — Sales Pipeline (kanban)

### Sunder Current (ours)
- `screenshots/sunder-current/sunder-people.png` — People list page
- `screenshots/sunder-current/sunder-companies.png` — Companies list page
- `screenshots/sunder-current/sunder-deals.png` — Deals list page
- `screenshots/sunder-current/sunder-pipeline.png` — Pipeline (kanban)

> **NOTE:** Sunder screenshots need to be re-captured. Save them to the paths above.

---

## 1. People List Page

### Reference: `mercato-reference/mercato-people.png`
### Current: `sunder-current/sunder-people.png`

| # | Gap | Mercato (Target) | Sunder (Current) | Priority |
|---|-----|-------------------|-------------------|----------|
| P1 | **Status column with icon + colored dot** | Each row shows an icon (e.g. person icon) + status text + colored dot indicator (green for Active) | Plain text status, no icon, no colored dot | HIGH |
| P2 | **Lifecycle stage with icon + colored dot** | Icon + "Customer" / "Prospect" text + colored dot (green for Customer, orange for Prospect) | Plain text, no icon, no colored status dot | HIGH |
| P3 | **Source column with icon + colored dot** | Each source type has a unique icon (calendar for "Industry event", thumbs-up for "Customer referral", etc.) + colored dot | Plain text only | HIGH |
| P4 | **Filters + Perspectives toolbar** | Two buttons: "Filters" (with filter icon) and "Perspectives" (with sliders icon), left-aligned below page title | Single "Filter" button, right-aligned next to search | HIGH |
| P5 | **Export button** | "Export" button in top-right action bar alongside the "New Person" button | No Export button | MEDIUM |
| P6 | **Three-dot menu (⋯) in action bar** | Overflow menu icon between Refresh and Export | No overflow menu | LOW |
| P7 | **Refresh icon button** | Circular arrow icon button (no text label) | "Refresh" text button with icon | LOW |
| P8 | **Row checkboxes** | Checkbox column on the left for bulk selection | No checkboxes visible | MEDIUM |
| P9 | **Bulk action bar** | "Set normal priority" action appears when rows are selectable | Not present | LOW |
| P10 | **Row actions (⋯) per row** | Three-dot menu on the right of each row | Three-dot menu present (good) — verify alignment matches | LOW |
| P11 | **Column header styling** | Column headers in sentence case, consistent font weight | Column headers are sentence case but appear lighter/thinner | LOW |
| P12 | **Search bar width/position** | Search bar right-aligned, moderate width, with placeholder text | Full-width search bar spanning most of the content area | MEDIUM |
| P13 | **Breadcrumb navigation** | "Dashboard / People" breadcrumb at top of page | No breadcrumb visible (page title only) | MEDIUM |
| P14 | **Type column with colored badge** | "Buyer" shows as a colored badge/pill (blue background) | "Buyer" as colored badge — verify styling matches | LOW |

### Key Pattern Notes
Mercato uses a consistent **icon + text + colored dot** pattern across Status, Lifecycle stage, and Source columns. This is the single biggest visual gap — it gives the table richness and scannability that our plain-text columns lack.

---

## 2. Companies List Page

### Reference: `mercato-reference/mercato-companies.png`
### Current: `sunder-current/sunder-companies.png`

| # | Gap | Mercato (Target) | Sunder (Current) | Priority |
|---|-----|-------------------|-------------------|----------|
| C1 | **Status column: icon + colored dot** | Person/building icon + "Active"/"Customer" text + green/blue dot | Plain text status | HIGH |
| C2 | **Lifecycle stage: icon + colored dot** | Stage-specific icon + text + colored dot (green for Customer, orange for Prospect) | Plain text | HIGH |
| C3 | **Source: icon + colored dot** | Source-specific icon (calendar, thumbs-up, megaphone) + text + colored dot | Plain text | HIGH |
| C4 | **Relationship health column** | Text labels: "healthy", "monitor" — no extra styling needed | Not present as a column — may need to add if in schema | MEDIUM |
| C5 | **Renewal column** | Shows Q1/Q2/Q3/Q4 values | Not present — may need to add if in schema | LOW |
| C6 | **Next interaction column** | Shows "Not set" consistently | Not present as a column | MEDIUM |
| C7 | **Filters + Perspectives buttons** | Two separate left-aligned buttons with icons | Single "Filter" button right-aligned | HIGH |
| C8 | **Export + New Company actions** | Both buttons in top-right | Only "Refresh" button present | MEDIUM |
| C9 | **Industry column as colored badge** | "Property Agency" displayed as blue text badge/pill | Present — verify styling parity | LOW |
| C10 | **Search bar positioning** | Right-aligned, moderate width | Full-width search spanning content area | MEDIUM |
| C11 | **Breadcrumb** | "Dashboard / Companies" | Not present | MEDIUM |

---

## 3. Deals List Page

### Reference: `mercato-reference/mercato-deals.png`
### Current: `sunder-current/sunder-deals.png`

| # | Gap | Mercato (Target) | Sunder (Current) | Priority |
|---|-----|-------------------|-------------------|----------|
| D1 | **Status column: icon + colored dot** | Trophy/circle/flag icon + "Win"/"Open"/"In progress"/"Loose" text + colored dot (green/blue/orange/red) | Plain text stage badge ("Leads") | HIGH |
| D2 | **Pipeline stage: icon + colored dot** | Stage-specific icon + text + colored dot | Not separated — we show "Stage" as a badge | HIGH |
| D3 | **Value column formatting** | Dollar values formatted with commas: "$96,000.00" | Dollar values present — verify formatting matches | LOW |
| D4 | **Probability column** | Percentage display: "100%", "40%", "65%" | Not present as a column | MEDIUM |
| D5 | **Expected close column** | Date formatted: "2/13/2026" | Not present — we show "Updated" instead | MEDIUM |
| D6 | **Companies column** | Shows linked company name as a pill/badge | Not present as a column | MEDIUM |
| D7 | **Filters + Perspectives** | Two buttons, left-aligned with icons | Single "Filter" button right-aligned | HIGH |
| D8 | **Export + New deal + Pipeline toggle** | "Export" button, "New deal" button, "Pipeline" toggle button | "Refresh" + "Pipeline" buttons | MEDIUM |
| D9 | **Contact column** | Shows associated contact name | Shows "CONTACT" column (verify matches) | LOW |
| D10 | **Breadcrumb** | "Dashboard / Deals" | Not present | MEDIUM |
| D11 | **Search bar** | Right-aligned, moderate width | Full-width spanning content area | MEDIUM |

---

## 4. Pipeline / Kanban View

### Reference: `mercato-reference/mercato-pipeline.png`
### Current: `sunder-current/sunder-pipeline.png`

| # | Gap | Mercato (Target) | Sunder (Current) | Priority |
|---|-----|-------------------|-------------------|----------|
| K1 | **Stage header styling** | Clean text headers: "Opportunity", "Marketing Qualified Lead", etc. with "Deals: 0" count below | Colored stage labels as pills/badges with colored top borders: "Leads", "Negotiation", "Offer", "Closing" | HIGH |
| K2 | **Pipeline selector / tabs** | "Pipeline" label + "Default Pipeline" tab selector + "Manage stages" link | "Back to Deals" link + "By Stage 1" text | MEDIUM |
| K3 | **Sort dropdown** | "Sort by" label + "Probability (high to low)" dropdown | "Filter", "Sort", "Options" text links | MEDIUM |
| K4 | **Empty state** | Clean "No deals in this stage yet." message in a bordered card area | "No items" text | LOW |
| K5 | **Card design (when populated)** | N/A in Mercato screenshot (all empty) | Card shows address, price, date, notes, contact avatar — overall looks decent | LOW |
| K6 | **Column count + total** | "Deals: 0" count per column | Count shown next to stage name + total value ("1 $1M") | LOW |
| K7 | **Page title + subtitle** | "Sales Pipeline" + "Track deals by pipeline stage and drag them between lanes to update progress." | "Pipeline" + "Scan deal movement by stage without leaving the customers workspace." | LOW |
| K8 | **Stage names** | "Opportunity", "Marketing Qualified Lead", "Sales Qualified Lead", "Offering" | "Leads", "Negotiation", "Offer", "Closing", "Lost" — different stages (data-driven, may be fine) | LOW |
| K9 | **Colored top borders on columns** | No colored borders — clean white/gray cards | Each column has a colored top border (yellow, orange, green, pink) | MEDIUM |
| K10 | **Search bar in kanban** | Not visible in Mercato pipeline view | Search bar present at top | LOW |

---

## Cross-Cutting Gaps (Apply to ALL Pages)

| # | Gap | Mercato (Target) | Sunder (Current) | Priority |
|---|-----|-------------------|-------------------|----------|
| X1 | **Icon + colored dot pattern in table cells** | Nearly every categorical column uses: icon + text + small colored dot. This is THE defining visual pattern. | Plain text columns throughout | **CRITICAL** |
| X2 | **Filters + Perspectives dual toolbar** | All list pages have both "Filters" and "Perspectives" buttons left-aligned with icons below the page title/subtitle | Single "Filter" button, right-aligned next to search | HIGH |
| X3 | **Search bar size/position** | Right-aligned, moderate width (~250px), doesn't dominate the layout | Full-width search bar spanning the entire content area | HIGH |
| X4 | **Export action button** | All list pages have an "Export" button in the top-right action area | No export functionality visible | MEDIUM |
| X5 | **Breadcrumb navigation** | "Dashboard / [Page]" breadcrumb at the top of every page | No breadcrumbs | MEDIUM |
| X6 | **Refresh as icon-only button** | Circular arrow icon, no text label | "Refresh" text + icon button | LOW |
| X7 | **Pagination footer format** | "Showing 1 to N of N results in Xms" on left, "Previous / Page X of Y / Next" on right | Same pattern present — verify exact format matches | LOW |

---

## Implementation Priority Order

### Batch 1 — CRITICAL (biggest visual impact)
1. **X1: Icon + colored dot pattern** — Build a reusable `StatusCell` / `IconDotCell` component that renders icon + text + colored dot. Apply to Status, Lifecycle stage, and Source columns across People, Companies, and Deals pages.
2. **X2: Filters + Perspectives toolbar** — Add "Perspectives" button alongside existing "Filters". Left-align both below page title.
3. **X3: Search bar resize** — Shrink search bar, right-align it, matching Mercato proportions.

### Batch 2 — HIGH (structural parity)
4. **X4: Export button** — Add to all list page action bars.
5. **X5: Breadcrumbs** — Add "Dashboard / [Page]" breadcrumb to all CRM pages.
6. **K1 + K9: Kanban header cleanup** — Match Mercato's clean stage headers (remove colored pill badges and top borders if they don't match).

### Batch 3 — MEDIUM (column + layout parity)
7. Add missing columns where data supports it (Probability, Expected close, Companies on deals; Relationship health on companies).
8. Adjust any remaining layout/spacing inconsistencies.

### Batch 4 — LOW (polish)
9. Fine-tune pagination format, three-dot menus, refresh icon, empty states.

---

## Dev Workflow

1. Open each Mercato screenshot side-by-side with the running Sunder app
2. Work through Batch 1 gaps first — these account for ~70% of the visual difference
3. After each batch, take fresh screenshots and compare
4. PR when all HIGH+ gaps are closed

---

## File References

### Existing handover docs (context only — this doc is the visual gap spec)
- `docs/product/designs/crm-aesthetic-overhaul-handover.md` — original implementation handover
- `docs/product/designs/crm-aesthetic-overhaul-decisions.md` — 8 decisions with ASCII layouts
- `docs/product/designs/crm-aesthetic-overhaul.md` — goals and phasing

### Key source files to modify
- `src/components/ui/data-table.tsx` — shared DataTable component
- `src/components/ui/filter-bar.tsx` — filter toolbar
- `app/(dashboard)/crm/contacts/page.tsx` — People list page (route: `/customers/people`)
- `app/(dashboard)/crm/companies/page.tsx` — Companies list page
- `app/(dashboard)/crm/deals/page.tsx` — Deals list page
- `src/components/crm/kanban-board.tsx` — Pipeline kanban view
