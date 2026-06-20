# Dogfood Report: Sunder Deal Detail

| Field | Value |
|-------|-------|
| **Date** | 2026-03-10 |
| **App URL** | http://localhost:3002/customers/deals/bec33d31-1d45-4f6d-ae37-b8cb15e1ed31 |
| **Session** | crm-overhaul-dogfood |
| **Scope** | Deal detail page (/customers/deals/[dealId]) |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 0 |
| **Total** | **2** |

## Issues

### ISSUE-001: Mobile deal title truncates instead of wrapping

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual / responsive |
| **URL** | http://localhost:3002/customers/deals/bec33d31-1d45-4f6d-ae37-b8cb15e1ed31 |
| **Repro Video** | N/A |

**Description**

On mobile, the deal address heading is cut off with an ellipsis even though the page has vertical room to wrap it naturally. That makes the primary identity of the record harder to read and drifts from the intended Mercato-style detail header.

**Repro Steps**

1. Open the deal detail page on a narrow mobile viewport.
   ![Step 1](screenshots/mobile.png)

2. **Observe:** the address title truncates to `123 Bishan Street 13 #0...` instead of wrapping to multiple lines.
   ![Result](screenshots/mobile.png)

---

### ISSUE-002: Details section shows raw numeric deal price instead of formatted currency

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual / data presentation |
| **URL** | http://localhost:3002/customers/deals/bec33d31-1d45-4f6d-ae37-b8cb15e1ed31 |
| **Repro Video** | N/A |

**Description**

The detail header formats the price correctly as currency, but the editable price field in the lower Details grid renders `1850000` as a raw integer. The mismatch looks broken and weakens trust in the record formatting.

**Repro Steps**

1. Open the deal detail page.
   ![Step 1](screenshots/initial.png)

2. Scroll to the Details section.
   ![Step 2](screenshots/initial.png)

3. **Observe:** the Price field displays `1850000` instead of a formatted currency value.
   ![Result](screenshots/activity-tab.png)

---

## Retest

- 2026-03-10: Retested after updating the shared inline-edit primitive to support separate display and edit values, and after allowing hide-label title fields to wrap on narrow viewports.
- ISSUE-001 resolved: the deal title now wraps cleanly on mobile.
- ISSUE-002 resolved: both price surfaces now display formatted currency while still opening with a numeric edit control.
- Evidence: `screenshots/retest-001.png`, `screenshots/price-edit.png`, `screenshots/mobile-retest.png`
