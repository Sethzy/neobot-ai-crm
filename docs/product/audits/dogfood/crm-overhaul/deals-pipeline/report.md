# Dogfood Report: Sunder Deals Pipeline

| Field | Value |
|-------|-------|
| **Date** | 2026-03-10 |
| **App URL** | http://localhost:3002/customers/deals/pipeline |
| **Session** | crm-overhaul-dogfood |
| **Scope** | Deals pipeline page (/customers/deals/pipeline) |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 0 |
| **Total** | **1** |

## Issues

### ISSUE-001: Desktop header search field is pushed off-screen by board overflow

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual / ux |
| **URL** | http://localhost:3002/customers/deals/pipeline |
| **Repro Video** | N/A |

**Description**

On first load, the kanban board overflows the viewport horizontally and drags the page header with it. The pipeline search input is partially clipped off the right edge of the screen instead of staying fully visible in the header. The board should scroll inside its own area without breaking the header layout.

**Repro Steps**

1. Navigate to http://localhost:3002/customers/deals/pipeline.
   ![Step 1](screenshots/initial.png)

2. **Observe:** the search field in the top-right header is cut off because the entire page is wider than the viewport.
   ![Result](screenshots/initial.png)

---

## Retest

- 2026-03-10: Retested after constraining the shared kanban scroll region and adding `min-w-0` to the app shell content pane. The pipeline header now stays inside the viewport and the board scrolls independently.
- Evidence: `screenshots/retest-003.png`
