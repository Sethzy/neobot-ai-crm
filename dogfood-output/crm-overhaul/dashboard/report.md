# Dogfood Report: Sunder Customers Dashboard

| Field | Value |
|-------|-------|
| **Date** | 2026-03-10 |
| **App URL** | http://localhost:3002/customers |
| **Session** | crm-overhaul-dogfood |
| **Scope** | Customers dashboard landing page (/customers) |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |
| **Total** | **2** |

## Issues

<!-- Copy this block for each issue found. Interactive issues need video + step-by-step screenshots. Static issues (typos, visual glitches) only need a single screenshot -- set Repro Video to N/A. -->

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | visual / functional / ux / content / performance / console / accessibility |
| **URL** | {page URL where issue was found} |
| **Repro Video** | {path to video, or N/A for static issues} |

**Description**

{What is wrong, what was expected, and what actually happened.}

**Repro Steps**

<!-- Each step has a screenshot. A reader should be able to follow along visually. -->

1. Navigate to http://localhost:3002/customers
   ![Step 1](screenshots/issue-001-step-1.png)

2. {Action -- e.g., click "Settings" in the sidebar}
   ![Step 2](screenshots/issue-001-step-2.png)

3. {Action -- e.g., type "test" in the search field and press Enter}
   ![Step 3](screenshots/issue-001-step-3.png)

4. **Observe:** {what goes wrong -- e.g., the page shows a blank white screen instead of search results}
   ![Result](screenshots/issue-001-result.png)

---


### ISSUE-002: Pipeline stage drill-down opens the deals page without applying the selected stage filter

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | http://localhost:3002/customers |
| **Repro Video** | videos/issue-002-repro.webm |

**Description**

Each stage row in the dashboard pipeline overview links to `/customers/deals?stage=...`, but the deals page ignores that query parameter and renders the full unfiltered table. The URL suggests a filtered drill-down, but the page shows all five seeded deals instead of only the selected stage.

**Repro Steps**

1. Navigate to http://localhost:3002/customers
   ![Step 1](screenshots/issue-002-step-1.png)

2. Click the `Negotiation` row in the Pipeline Overview panel.
   ![Step 2](screenshots/issue-002-step-2.png)

3. **Observe:** the browser lands on `/customers/deals?stage=negotiation`, but the deals table still shows every deal stage instead of just negotiation deals.
   ![Result](screenshots/issue-002-result.png)

---


## Retest

2026-03-10 follow-up pass after fixes:
- CTA labels in the dashboard section headers now stay on one line (`screenshots/desktop-retest.png`).
- Pipeline stage drill-down now applies the selected stage filter on the deals page (`screenshots/issue-002-retest.png`).
- No additional dashboard-specific issues were found in the follow-up pass.
