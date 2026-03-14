# QA Surface 18: Agent-Generated Views

> **PRs covered:** 42a (inline views via pipeJsonRender — no tool call needed), persistence fix `4c98ab1`
> **Dogfoodable:** Partial (requires specific prompts to trigger inline views)
> **Time estimate:** 15-20 min manual
> **v2 tools:** `search_crm`, `run_sql` (views are rendered inline via `pipeJsonRender()`, not via a `show_view` tool call)

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
2. **Expected:** Agent calls `search_crm` (entity: deals) to fetch data
3. **Expected:** Inline view renders in chat with deal cards grouped by stage (via ```spec fence)
4. **Expected:** View renders outside the tool pill (not collapsed)
5. **Expected:** Deal cards show address, price, stage

**Notes / failures:**

---

### 18.2 Stat metrics

1. "Give me a quick summary of my CRM — how many contacts, deals, and tasks do I have?"
2. **Expected:** Agent calls `run_sql` (or `search_crm`) to get counts
3. **Expected:** Inline stat cards render with counts (StatMetric components via ```spec fence)
4. **Expected:** Clean, compact layout

**Notes / failures:**

---

### 18.3 Chart panels — bar chart

1. "Show me a breakdown of my deals by stage as a bar chart"
2. **Expected:** Agent calls `search_crm` (entity: deals) or `run_sql`
3. **Expected:** BarChartPanel renders inline with stage labels and deal counts
4. **Expected:** Max 8 data points (compact snapshot)

**Notes / failures:**

---

### 18.4 Chart panels — donut chart

1. "Show me my contact types as a pie chart"
2. **Expected:** Agent calls `search_crm` (entity: contacts) or `run_sql`
3. **Expected:** DonutChartPanel renders inline with type labels

**Notes / failures:**

---

### 18.5 Chart panels — funnel

1. "Show me my deals funnel — how many at each stage from prospecting to closed?"
2. **Expected:** Agent calls `search_crm` or `run_sql` to get stage counts
3. **Expected:** FunnelChartPanel renders inline with stage progression

**Notes / failures:**

---

### 18.6 Task list view

1. "Show me my overdue tasks"
2. **Expected:** Agent calls `search_crm` (entity: tasks) or `run_sql`
3. **Expected:** TaskItem components render with title, due date, status

**Notes / failures:**

---

### 18.7 Contact cards

1. "Show me my top contacts"
2. **Expected:** Agent calls `search_crm` (entity: contacts)
3. **Expected:** ContactCard components render with name, type, subtitle

**Notes / failures:**

---

### 18.8 View persists after hard reload (persistence fix `4c98ab1`)

1. After generating a view (18.1-18.7), scroll up
2. **Expected:** View still rendered (not disappeared)
3. **Hard-reload the page** (Cmd+Shift+R)
4. **Expected:** View re-renders as a component, NOT as a raw ` ```spec ` code block
5. Check the message parts in the DOM — should contain `data-spec` parts, not raw fence text

**Context:** Fix commit `4c98ab1` added `splitTextAndSpecParts()` in `buildAssistantPartsFromSteps()` so new messages persist `data-spec` parts instead of raw fences.

**Notes / failures:**

---

### 18.9 Historical messages rehydrate views (persistence fix `4c98ab1`)

1. Open a **thread created before the fix** that had inline views
2. **Expected:** Views render correctly (not as code blocks)
3. Hard-reload again — still renders

**Context:** `rehydrateSpecParts()` in `normalizeMessageParts()` re-parses old text parts containing ` ```spec ` fences at load time so historical messages also render views.

**Notes / failures:**

---

### 18.10 ViewErrorBoundary catches crashes (persistence fix `4c98ab1`)

1. If a view component throws during render (e.g., bad data shape)
2. **Expected:** Styled error fallback appears: "View failed to render: ..." with a dashed red border
3. **Expected:** Rest of the chat panel remains functional — no white screen

**Notes / failures:**

---

### 18.11 Agent chooses plain text when appropriate

1. "What's Sarah's phone number?"
2. **Expected:** Agent answers in plain text (no inline view for simple lookups)
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
- [ ] View component throws during render — error boundary shows fallback, chat panel stays functional
- [ ] Thread with pre-fix messages containing raw spec fences — rehydration converts to views at load time

---

## Pass / Fail Criteria

- **Pass:** Agent generates compact CRM views inline in chat using ```spec fences after querying data via `search_crm` or `run_sql`. Deal cards, stat metrics, charts, task items, and contact cards render correctly. Catalog validation prevents invalid components. Agent uses views appropriately (not for everything). **Views survive hard-reload** — persisted as `data-spec` parts, not raw fences. Historical threads also render views via rehydration. Error boundary catches component crashes gracefully.
- **Fail:** Views render as raw JSON or ` ```spec ` code blocks after page reload. Charts don't render. Views stuck inside collapsed tool pills. Agent generates views for simple text answers. Validation doesn't catch invalid specs. Component crash takes down the entire chat panel.
