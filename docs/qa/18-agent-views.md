# QA Surface 18: Agent-Generated Views

> **PRs covered:** 42a (inline views via json-render + show_view tool)
> **Dogfoodable:** Partial (requires specific prompts to trigger show_view)
> **Time estimate:** 15-20 min manual

---

## Prerequisites

- Logged in with working chat
- CRM has data: 5+ deals across stages, 5+ contacts, 5+ tasks with varying status/dates
- Chat Advanced (Surface 9) passing — tool output rendering works

---

## Dogfood Checklist (automated browser pass)

- [ ] Agent can generate inline views in chat (not raw JSON)
- [ ] View cards render inside message bubbles (not collapsed in tool pills)
- [ ] Charts render (bar, donut, funnel panels)
- [ ] No console errors when views render
- [ ] Views look correct on mobile viewport

---

## Manual QA Scenarios

### 18.1 Deals pipeline view

1. In chat: "Show me my deals pipeline"
2. **Expected:** Agent queries CRM tools, then calls `show_view`
3. **Expected:** Inline view renders in chat with deal cards grouped by stage
4. **Expected:** View renders outside the tool pill (not collapsed)
5. **Expected:** Deal cards show address, price, stage

**Notes / failures:**

---

### 18.2 Stat metrics

1. "Give me a quick summary of my CRM — how many contacts, deals, and tasks do I have?"
2. **Expected:** Agent calls CRM tools, then `show_view` with StatMetric components
3. **Expected:** Inline stat cards render with counts
4. **Expected:** Clean, compact layout

**Notes / failures:**

---

### 18.3 Chart panels — bar chart

1. "Show me a breakdown of my deals by stage as a bar chart"
2. **Expected:** Agent calls `show_view` with BarChartPanel
3. **Expected:** Bar chart renders inline with stage labels and deal counts
4. **Expected:** Max 8 data points (compact snapshot)

**Notes / failures:**

---

### 18.4 Chart panels — donut chart

1. "Show me my contact types as a pie chart"
2. **Expected:** Agent calls `show_view` with DonutChartPanel
3. **Expected:** Donut chart renders inline with type labels

**Notes / failures:**

---

### 18.5 Chart panels — funnel

1. "Show me my deals funnel — how many at each stage from prospecting to closed?"
2. **Expected:** Agent calls `show_view` with FunnelChartPanel
3. **Expected:** Funnel renders inline with stage progression

**Notes / failures:**

---

### 18.6 Task list view

1. "Show me my overdue tasks"
2. **Expected:** Agent queries tasks, calls `show_view` with TaskItem components
3. **Expected:** Task items render with title, due date, status

**Notes / failures:**

---

### 18.7 Contact cards

1. "Show me my top contacts"
2. **Expected:** Agent calls `show_view` with ContactCard components
3. **Expected:** Contact cards render with name, type, subtitle

**Notes / failures:**

---

### 18.8 View persists in thread

1. After generating a view (18.1-18.7), scroll up
2. **Expected:** View still rendered (not disappeared)
3. Refresh the page
4. **Expected:** View re-renders from persisted tool call data

**Notes / failures:**

---

### 18.9 Agent chooses plain text when appropriate

1. "What's Sarah's phone number?"
2. **Expected:** Agent answers in plain text (no show_view for simple lookups)
3. "How many deals do I have?"
4. **Expected:** May use text or a simple stat — agent doesn't over-use views

**Notes / failures:**

---

## Edge Cases

- [ ] Agent tries to use a component not in the catalog — validation rejects, agent retries
- [ ] View output exceeds 4KB — tool returns error, agent simplifies
- [ ] Chart with > 8 data points — tool enforces limit
- [ ] Empty CRM (no data) — agent generates empty state or explains, not a broken view
- [ ] Multiple views in one response — all render inline
- [ ] View on mobile — responsive layout, charts scale down

---

## Pass / Fail Criteria

- **Pass:** Agent generates compact CRM views inline in chat. Deal cards, stat metrics, charts, task items, and contact cards render correctly. Views bypass tool pill UI. Catalog validation prevents invalid components. Agent uses views appropriately (not for everything).
- **Fail:** Views render as raw JSON. Charts don't render. Views stuck inside collapsed tool pills. Agent generates views for simple text answers. Validation doesn't catch invalid specs.
