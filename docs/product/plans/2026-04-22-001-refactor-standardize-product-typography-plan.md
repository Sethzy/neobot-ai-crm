---
title: Standardize product typography hierarchy across authenticated pages
type: refactor
status: active
date: 2026-04-22
---

# Standardize product typography hierarchy across authenticated pages

## Overview

Create one consistent typography hierarchy for the authenticated product and apply it across every current app surface.

This is not a font swap and it is not a visual redesign. The main problem is that the product already has a typography token system, but page-level surfaces, shared components, and dense workspaces still choose sizes and weights locally. The result is that each page communicates importance differently.

This plan standardizes:

- top-level page titles
- compact workspace headers
- section titles
- body copy
- supporting/meta text
- dense table and list text
- search/filter/control text

The intended result is simple: users should be able to move between pages without re-learning what the most important text looks like.

## User Experience Outcome

### Before

- Some pages feel large and hero-like.
- Some pages feel compressed and small.
- Some search bars and controls visually compete with the page title.
- Dense pages like People, Companies, Deals, and Meetings feel like they belong to a different product than Tasks, Automations, or Agent.
- Users can still use the app, but the product feels uneven and less finished than it should.

### After

- Every authenticated page has a recognizable text hierarchy.
- Users can tell immediately what page they are on and what to look at first.
- Supporting text reads as supporting text everywhere.
- Dense pages still feel efficient, but not undersized.
- Search bars, filters, tabs, and utility controls stop shouting over the page itself.
- The product feels calmer, more deliberate, and more trustworthy without changing core behavior.

## What We Learned

### 1. The token system exists, but it is incomplete for app surfaces

`app/globals.css` already defines `caption`, `meta`, `body`, `subhead`, `title`, and `display` tokens, plus a few helper classes (`type-kicker`, `type-heading`, `type-display`).

Relevant files:

- `app/globals.css`

Problem:

- The current scale jumps from `subhead` (20px) to `title` (32px).
- That leaves no canonical size for the most common authenticated app title style.
- Product pages then fall back to raw Tailwind sizes like `text-lg` and `text-2xl`.

### 2. The lint guard does not enforce semantic hierarchy strongly enough

`scripts/lint-typography.ts` blocks arbitrary sizes like `text-[13px]`, inline typography style literals, and deprecated font imports.

Problem:

- It does **not** block standard raw size utilities like `text-sm`, `text-lg`, `text-2xl`, etc.
- That means the codebase can claim to have a semantic typography system while page authors still bypass it freely.

Relevant files:

- `scripts/lint-typography.ts`

### 3. Page identity is inconsistent across major workspaces

Current examples:

- `app/(dashboard)/tasks/page.tsx` uses a large page title (`text-2xl`)
- `app/(dashboard)/automations/page.tsx` uses the same large page title
- `app/(dashboard)/skills/page.tsx` uses a similar but slightly softer treatment
- `app/(dashboard)/meetings/page.tsx` uses a much smaller toolbar title (`text-lg`)
- `src/components/crm/crm-list-panel-layout.tsx` uses a very small header title (`text-sm`)
- `src/components/chat/chat-welcome.tsx` uses a centered hero-like title that visually belongs to a different hierarchy

This is the core reason the product feels typographically unstable even before users read the content.

### 4. Shared controls are louder than they should be

Current examples:

- `src/components/ui/input.tsx` defaults to `text-body`
- page-level search bars often enlarge inputs via height/padding without establishing a quieter text role
- dense views like Skills and CRM tables use multiple small tiers at once (`text-base`, `text-sm`, `text-xs`, `text-caption`) with no stable limit

Relevant files:

- `src/components/ui/input.tsx`
- `src/components/ui/filter-bar.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/crm/crm-tasks-table.tsx`
- `app/(dashboard)/skills/skills-catalog.tsx`
- `app/(dashboard)/skills/predefined-card.tsx`

### 5. The problem is product-wide, not CRM-only

The screenshots and code confirm this is not isolated to one feature area. The same inconsistency appears across:

- Agent / chat welcome
- Tasks
- Automations
- Skills
- People
- Companies
- Deals
- Meetings
- shared chrome like sidebar, search, tables, and row lists

Relevant files:

- `src/components/layout/app-sidebar.tsx`
- `src/components/automations/automations-list.tsx`
- `src/components/meetings/meeting-row.tsx`

## Problem Statement / Motivation

Sunder currently communicates information importance inconsistently across authenticated pages.

That inconsistency hurts:

- scan speed
- perceived polish
- confidence in dense operational screens
- consistency of future page work

This matters because the product is increasingly multi-surface. As more pages ship, local typography choices compound into a product-level quality problem.

The fix should be systemic, not a one-off polish pass. We need clear roles, clear enforcement, and a complete route audit.

## Scope

### In scope

All authenticated product surfaces and shared authenticated chrome, including:

- `/agent`
- `/chat/[threadId]`
- `/tasks`
- `/automations`
- `/skills`
- `/customers/people`
- `/customers/companies`
- `/customers/deals`
- `/meetings`
- authenticated settings pages
- authenticated admin/product utility pages such as pricing and evaluator/admin surfaces
- shared app sidebar, table, filter, form-control, row-list, and empty/error states used by the pages above

### Out of scope

- landing pages
- public market pages
- auth entry flows (`/login`, `/register`, password reset, etc.)
- intentional editorial/marketing typography treatments

Reason:

Those surfaces have a different job. Flattening them into the operational product hierarchy would be a regression, not a cleanup.

## Proposed Solution

Standardize typography in four layers.

### Layer 1: Complete the app scale

Add missing semantic roles for authenticated product use cases.

The current system is too editorial and does not fully represent operational product needs. We should introduce explicit roles for:

- page title
- compact workspace title
- section title
- control text
- supporting/meta text

These roles should map to named semantics, not raw size utilities.

### Layer 2: Standardize shared primitives

Update the shared components that quietly set text tone for the whole app:

- text input
- filter/search bars
- table headers and cells
- dense list rows
- compact badges/meta rows
- sidebar and utility navigation text

Once these defaults are corrected, individual pages will need fewer overrides.

### Layer 3: Normalize page shells

Introduce explicit rules for:

- full-page workspace headers
- compact split-panel headers
- hero-only chat welcome header

This avoids the current situation where Tasks, Meetings, CRM, and Agent each invent their own title logic.

### Layer 4: Enforce and audit

Strengthen the typography lint rule so authenticated product surfaces cannot freely use raw size utilities except in tightly controlled allowlisted files.

Then run an exhaustive route audit to ensure the product is actually uniform, not just “more tokenized.”

## Implementation Plan

### Phase 1: Define the authenticated product hierarchy

Update `app/globals.css` to define a complete set of typography roles for the authenticated app.

Expected outcome:

- page headers have a canonical role
- compact workspace headers have a canonical role
- control text has a canonical role
- support/meta text has a canonical role

Key decisions:

- Keep existing editorial roles (`title`, `display`) for intentional hero/editorial use.
- Add app-specific roles instead of forcing normal product pages to borrow landing/editorial sizes.
- Do not change font families in this pass. The issue is hierarchy discipline, not font selection.

Likely files:

- `app/globals.css`

### Phase 2: Tighten enforcement

Upgrade `scripts/lint-typography.ts` so authenticated product surfaces cannot casually use raw size classes like:

- `text-xs`
- `text-sm`
- `text-base`
- `text-lg`
- `text-xl`
- `text-2xl`

outside of approved shared primitives or explicit allowlists.

Key decisions:

- The goal is not zero exceptions. The goal is to make typography choices deliberate and reviewable.
- Landing/editorial illustrations and other known exceptions remain allowlisted.
- Shared primitive files may still need tightly scoped exceptions where third-party behavior or special rendering makes semantic classes impractical.

Likely files:

- `scripts/lint-typography.ts`

### Phase 3: Normalize shared primitives

Adjust shared component defaults before patching every page.

Priority components:

- `src/components/ui/input.tsx`
- `src/components/ui/filter-bar.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/crm/crm-tasks-table.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/automations/automations-list.tsx`
- `src/components/meetings/meeting-row.tsx`

Expected outcome:

- search bars no longer out-rank page headers
- table headers and body rows feel like one system
- compact rows use the same title/meta pattern across product areas
- navigation and utility text feel quieter and more consistent

### Phase 4: Normalize top-level workspaces

Apply the new roles to the main authenticated pages first.

Priority route files:

- `app/(dashboard)/tasks/page.tsx`
- `app/(dashboard)/automations/page.tsx`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/meetings/page.tsx`
- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `src/components/crm/crm-list-panel-layout.tsx`
- `src/components/chat/chat-welcome.tsx`

Expected outcome:

- Tasks, Automations, Skills, and Meetings share a recognizable page-title pattern
- CRM surfaces no longer feel undersized relative to the rest of the app
- Agent remains intentionally prominent, but is clearly treated as the sole hero-style exception

### Phase 5: Exhaustive authenticated route audit

After the headline pages are corrected, inspect every authenticated page still in the product.

Audit targets include:

- settings pages
- pricing/billing pages
- admin utility pages
- thread headers and chat empty/error states
- detail pages such as meeting record views
- drawer/tab shells that establish their own local hierarchy

This is required because the goal is product-wide uniformity, not improvement only on the pages from the screenshots.

### Phase 6: Verification and sign-off

Verify the final hierarchy across:

- desktop widths
- narrow desktop / tablet widths
- empty, loading, and error states
- table, list, board, and composer-heavy views

Verification should include:

- manual route-by-route review
- screenshot comparison for top-level workspaces
- `pnpm lint` with the updated typography guard
- `pnpm typecheck`
- targeted UI smoke checks to ensure no layout regressions from text-size changes

## Technical Considerations

- This is primarily a CSS class, token, and component-default change. No data model or API changes are expected.
- The highest regression risk is layout breakage from altered text sizes in dense views, especially tables, filters, tab rows, and split-panel headers.
- The lint rule needs careful scoping. If it becomes too strict too quickly, it will create noise in shared primitives and low-value exceptions.
- The route audit matters as much as the token work. Without it, the product will remain partially migrated.

## System-Wide Impact

- **Interaction graph**: No backend interaction graph changes expected. The primary flow is `globals.css` role definitions -> shared component defaults -> page-level usage -> lint enforcement.
- **Error propagation**: Minimal. Failures should appear mostly as visual regressions or lint failures, not runtime errors.
- **State lifecycle risks**: Low. No persistent state or database lifecycle changes are introduced.
- **API surface parity**: None required. This is a presentation-system refactor.
- **Integration test scenarios**: Dense tables, split-panel CRM pages, chat welcome, and compact list pages should all be visually re-checked because small typography changes can alter wrapping, row height, truncation, and toolbar balance.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| We standardize tokens but leave too many raw page overrides in place | High | Tighten lint after the new roles exist; do a full authenticated route audit before sign-off |
| Dense CRM pages become too airy and lose efficiency | Medium | Use a dedicated compact workspace title role instead of forcing CRM into the same scale as hero/full-page workspaces |
| Shared input and table changes cause wrapping or clipping regressions | Medium | Update primitives first, then manually verify row height, truncation, and toolbar balance on core pages |
| Agent loses its intentional prominence if normalized too aggressively | Medium | Treat chat welcome as an explicit exception with documented rules rather than an accidental one-off |
| The pass expands into a full UI redesign | Medium | Keep scope limited to hierarchy, weights, and size roles; no feature redesign, no layout reinvention |

## Acceptance Criteria

- [ ] The authenticated product has one documented typography hierarchy with named roles for page titles, compact workspace titles, section titles, body text, meta text, and control text.
- [ ] Tasks, Automations, Skills, Meetings, People, Companies, Deals, and Agent each use the new hierarchy intentionally rather than raw local size choices.
- [ ] CRM list surfaces no longer use undersized page headers that read like secondary chrome.
- [ ] Search bars, filters, and utility controls no longer visually outrank page identity.
- [ ] Table headers and dense row text follow one consistent pattern across CRM and non-CRM workspaces.
- [ ] `pnpm lint` fails when new authenticated product code uses disallowed raw text-size utilities outside the approved allowlist.
- [ ] Shared authenticated chrome, including sidebar and common dense list rows, matches the new hierarchy.
- [ ] The final pass includes a route-by-route audit of current authenticated pages, not only the pages shown in the original screenshots.

## Suggested Delivery Sequence

1. Create and document the missing app-specific typography roles.
2. Update the lint guard to support the stricter model.
3. Normalize shared primitives.
4. Normalize top-level workspace pages.
5. Audit remaining authenticated routes.
6. Run verification and capture screenshots for sign-off.

## Out of Scope

- changing the brand font stack
- redesigning layouts unrelated to hierarchy
- changing colors, spacing tokens, or motion unless needed to preserve readability after typography changes
- unifying landing, auth, and public market pages into the same operational hierarchy

## Sources

- Typography tokens and utilities: `app/globals.css`
- Typography guard: `scripts/lint-typography.ts`
- Tasks page: `app/(dashboard)/tasks/page.tsx`
- Automations page: `app/(dashboard)/automations/page.tsx`
- Skills page: `app/(dashboard)/skills/page.tsx`
- Meetings page: `app/(dashboard)/meetings/page.tsx`
- Agent welcome: `src/components/chat/chat-welcome.tsx`
- CRM header shell: `src/components/crm/crm-list-panel-layout.tsx`
- Shared input: `src/components/ui/input.tsx`
- Shared filter/search bar: `src/components/ui/filter-bar.tsx`
- Shared data table: `src/components/ui/data-table.tsx`
- CRM tasks table: `src/components/crm/crm-tasks-table.tsx`
- Automations list rows: `src/components/automations/automations-list.tsx`
- Meetings rows: `src/components/meetings/meeting-row.tsx`
- Sidebar chrome: `src/components/layout/app-sidebar.tsx`
- Related design parity reference: `docs/product/designs/crm-visual-parity-handover.md`
- Audit note for typography guard: `docs/product/audits/2026-04-21-pre-prod-audit.md`
