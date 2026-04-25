---
title: "refactor: mobile responsive app"
type: refactor
status: proposed
date: 2026-04-25
origin: "impeccable responsive audit"
---

# refactor: mobile responsive app

## Overview

Make Sunder's authenticated app usable and trustworthy on phones without turning the desktop product into a mobile-first compromise. The refactor should keep the current App Router, ShadCN/Radix primitives, Flexoki semantic tokens, TanStack Table, and CRM workspace architecture. The main change is to stop treating phone layouts as narrower desktop layouts.

Tailwind guidance from Context7 confirms the direction: use mobile-first unprefixed utilities, override upward at `sm` / `md` / `lg`, and use container queries where component width matters more than viewport width.

## Audit Evidence

Live checks on April 25, 2026, using the local authenticated QA account:

| Route | 390px Phone Result | Desktop Result |
| --- | --- | --- |
| `/chat` | No page overflow, but primary controls are 28-32px touch targets. | No page overflow; desktop sidebar controls are intentionally dense. |
| `/customers/people` | Document overflow: `790px`; table width about `1172px`. | Still overflows by about `44px` at 1440px because table total width exceeds content area. |
| `/customers/deals` | Document overflow: `770px`; table width about `1152px`. | Still overflows by about `24px` at 1440px. |
| `/automations` | No page overflow, but switches are 32x18 and rows compress metadata. | No page overflow. |
| `/settings/profile` | No page overflow; settings mobile nav exists. | No page overflow. |

Static code evidence:

- `src/components/layout/app-layout.tsx` has a mobile header, but `SidebarTrigger` is `size="icon-sm"` via `src/components/ui/sidebar.tsx`, producing a 28px button.
- `src/components/ui/button.tsx`, `src/components/ui/toggle.tsx`, and `src/components/ui/sidebar.tsx` default to compact desktop sizes below the 44px touch target threshold.
- `src/components/ui/list-table.tsx` only offers horizontal scroll for small screens; it has no mobile row/card renderer.
- `src/components/crm/crm-workspace-shell.tsx` puts view picker, view toggle, filters, search, and actions into a wrapping toolbar that becomes crowded on phone.
- `src/components/crm/record-drawer/record-drawer.tsx` switches to a bottom sheet on mobile, but the sheet content does not define a durable phone height contract.
- `src/components/crm/kanban-board.tsx` uses a horizontally scrolling lane layout and pointer drag behavior that is desktop-oriented.
- `src/components/automations/automations-list.tsx` is structurally responsive but exposes tiny switch targets and cramped metadata.
- `src/components/chat/chat-composer.tsx` and `src/components/chat/chat-welcome.tsx` keep 32px composer buttons and dense category tabs on phone.

## Problem Statement

The app has responsive pieces, but they are not governed by one product-wide mobile contract. Current behavior falls into three buckets:

1. **CRM is desktop-only on phone.** People and Deals expose full TanStack tables inside a horizontal scroll container. That technically preserves access, but it fails the actual workflow: scan a record, open detail, edit a field, move on.
2. **Touch targets are too small.** Buttons, sidebar triggers, toggles, switches, table sort controls, composer controls, and automation switches frequently render below 44px.
3. **Mobile patterns are inconsistent.** Settings uses a proper mobile sheet. CRM uses table overflow. Record detail uses a bottom sheet. Filters use a side dialog. Kanban uses horizontal lanes. Chat uses desktop-sized composer controls.

## Refactor Principles

- **Authenticated product first.** Fix chat, CRM, automations, settings, skills, meetings, and pricing before public marketing pages.
- **Keep desktop density.** Add responsive variants instead of globally enlarging every desktop control.
- **Use shared primitives.** Most fixes should land in `Button`, `Toggle`, `Sidebar`, `FilterBar`, `ListTable`, `RecordDrawer`, and CRM shell components.
- **No new table engine.** Keep TanStack Table for desktop and data semantics; add a mobile renderer path beside it.
- **Phone workflows need native structure.** Use cards, sheets, full-height drawers, and progressive disclosure. Do not rely on horizontal table scrolling for core CRM work.

## Proposed PR Sequence

### PR M1: Responsive Primitive Contract

Goal: establish the mobile baseline every route inherits.

Scope:

- Add touch-aware size variants or responsive classes for `Button`, `Toggle`, `SidebarMenuButton`, `SidebarTrigger`, `DropdownMenuItem`, `TabsTrigger`, and related shared controls.
- Make mobile app header 48-52px tall with 44px sidebar/search actions.
- Keep desktop control density at current sizes.
- Add a shared `touch-target` utility or component-level convention instead of ad hoc `h-11` patches.
- Ensure `PageHeader` actions wrap full-width or move below title on phone.

Files:

- `src/components/ui/button.tsx`
- `src/components/ui/toggle.tsx`
- `src/components/ui/toggle-group.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/page-header.tsx`
- `app/globals.css`

Acceptance:

- On 390px, global sidebar trigger is at least 44x44.
- Primary action buttons on phone are at least 44px tall.
- Desktop side nav and CRM rows keep current compact density.
- No new raw Tailwind palette colors in authenticated dashboard components.

### PR M2: CRM Mobile List Mode

Goal: make People, Companies, Deals, and Tasks usable on phone without horizontal table scanning.

Scope:

- Extend `ListTable` with an optional `mobileCardRenderer` or `mobileRowRenderer`.
- Render cards below `md`, keep TanStack table at `md+`.
- Add entity-specific mobile cards:
  - People: name, type, company, phone/email, last updated, row actions.
  - Companies: name, relationship counts, website/phone, last updated.
  - Deals: name/address, amount, stage, company/contact, last updated.
  - Tasks: title, status, due date, linked record.
- Move row actions into a 44px menu button on mobile.
- Keep table column resize handles desktop-only.
- Reset route-level document overflow to zero on phone for CRM list pages.

Files:

- `src/components/ui/list-table.tsx`
- `app/(dashboard)/customers/people/page.tsx`
- `app/(dashboard)/customers/companies/page.tsx`
- `app/(dashboard)/customers/deals/page.tsx`
- `app/(dashboard)/tasks/page.tsx`
- `src/components/crm/crm-inline-cells.tsx`
- `src/components/ui/row-actions.tsx`

Acceptance:

- `/customers/people`, `/customers/companies`, `/customers/deals`, and `/tasks` have no document-level horizontal overflow at 390px.
- Mobile users can open detail, delete where supported, and paginate without needing horizontal scroll.
- Desktop tables remain TanStack-powered and keep sorting/resizing behavior.

### PR M3: CRM Toolbar, Filters, And Detail Sheets

Goal: make the CRM control plane phone-native.

Scope:

- Split `CrmWorkspaceShell` toolbar into mobile-specific rows:
  - row 1: saved view picker + count
  - row 2: search full width
  - row 3: filter/view/action controls
- Convert dense view toggles to icon-first 44px controls on phone.
- Make `FilterOverlay` a bottom sheet on phone and side panel on desktop.
- Give `RecordDrawer` mobile mode a stable `max-h-[90dvh]` / full-height contract with pinned header/footer behavior.
- Ensure `RecordDetailPanelShell` tab bar remains scrollable with 44px tab hit areas on phone.

Files:

- `src/components/crm/crm-workspace-shell.tsx`
- `src/components/crm/view-picker.tsx`
- `src/components/crm/view-toggle.tsx`
- `src/components/ui/filter-bar.tsx`
- `src/components/ui/filter-overlay.tsx`
- `src/components/crm/record-drawer/record-drawer.tsx`
- `src/components/crm/record-drawer/record-detail-panel-shell.tsx`

Acceptance:

- Search, filter, saved view, view toggle, and New action are all reachable without crowding on 390px.
- Record detail bottom sheet does not exceed viewport or hide close/actions under browser chrome.
- Filter apply/clear controls remain visible after scrolling filter options.

### PR M4: Mobile Kanban And Calendar Workflows

Goal: prevent non-table CRM views from becoming desktop-only escape hatches.

Scope:

- For `KanbanBoard`, add a phone layout:
  - either one column per screen with horizontal snap, or a stage selector that shows one lane at a time
  - disable drag-and-drop on phone unless the gesture is proven reliable
  - expose "Move to stage" through card actions or a bottom sheet
- Review `CrmTasksCalendar` for 390px usability, including day cards, event density, and drill-in behavior.
- Keep tablet/desktop current board layout.

Files:

- `src/components/crm/kanban-board.tsx`
- `src/components/crm/deal-kanban-card.tsx`
- `src/components/crm/task-kanban-view.tsx`
- `src/components/crm/task-calendar-view.tsx`
- `src/components/crm/crm-tasks-calendar.tsx`

Acceptance:

- Deals board is usable at 390px without precision drag.
- Moving a deal stage remains possible on phone.
- Task calendar does not require horizontal page scrolling.

### PR M5: Chat, Automations, Settings, And Pricing Polish

Goal: finish high-frequency non-CRM surfaces.

Scope:

- Chat:
  - make composer icon buttons 44px on phone
  - reduce `ChatWelcome` top padding on phone
  - make category tabs horizontally scrollable with 44px hit areas
  - keep message content constrained and wrapping for code/artifacts/spec views
- Automations:
  - give switches a 44px wrapper target
  - stack row metadata under the automation name on phone
  - keep sticky launcher composer within safe-area padding
- Settings:
  - audit all settings subpages for 44px phone controls
  - keep existing mobile settings sheet pattern
- Pricing:
  - re-run authenticated navigation after billing route timeout is resolved
  - verify plan cards and checkout actions at 390px

Files:

- `src/components/chat/chat-composer.tsx`
- `src/components/chat/chat-welcome.tsx`
- `src/components/chat/message-list.tsx`
- `src/components/chat/message-bubble.tsx`
- `src/components/automations/automations-list.tsx`
- `src/components/automations/automation-launcher-composer.tsx`
- `app/settings/**`
- `app/(dashboard)/pricing/page.tsx`

Acceptance:

- Chat send/attach/stop/model controls are touch-safe on phone.
- Automations rows can be opened and toggled without accidental taps.
- Settings and pricing have no document overflow at 390px.

### PR M6: Responsive QA Harness

Goal: keep regressions from returning.

Scope:

- Add a Playwright responsive route matrix using `QA_USER_EMAIL` / `QA_USER_PASSWORD`.
- Test widths: 390, 768, 1024, 1440.
- Assert:
  - no document-level horizontal overflow on authenticated routes
  - known internal scroll regions are allowed only by selector
  - top-level interactive controls meet 44px on phone, with explicit allowlist for desktop-only dense controls
- Save screenshots for failed routes only.
- Add unit tests for mobile renderer branches where cheap.

Files:

- `scripts/qa/`
- `docs/qa/README.md`
- `docs/qa/01-auth-and-landing.md`
- `docs/qa/04-crm-pages.md`
- `docs/qa/08-triggers-and-automations.md`
- `docs/qa/16-crm-working-surfaces.md`

Acceptance:

- `pnpm` QA script can run the responsive route matrix locally.
- The script fails on CRM's current phone overflow before fixes and passes after PR M2/M3.
- QA docs include mobile viewport checks for every affected surface.

## Out Of Scope

- Replacing ShadCN/Radix primitives.
- Replacing TanStack Table.
- Rebuilding CRM data modeling.
- Reworking public landing-page art direction in the same PR sequence.
- Creating a native mobile app.

## Open Questions

1. Should the mobile app shell remain a hamburger/sidebar sheet only, or should we add a bottom navigation bar for the top 4-5 routes after the first responsive pass?
2. Should CRM cards expose inline quick edit on phone, or should phone edits always happen inside the record detail sheet?
3. Should mobile Kanban support true drag-and-drop, or should "Move to stage" be the canonical phone interaction?
4. Should pricing remain inside dashboard chrome on phone, or should it use a focused full-screen checkout layout?

## Verification Checklist

- `pnpm lint`
- targeted Vitest for touched components
- Playwright responsive route matrix
- Manual phone viewport pass at 390x844:
  - `/chat`
  - `/customers/people`
  - `/customers/companies`
  - `/customers/deals`
  - `/tasks`
  - `/automations`
  - `/skills`
  - `/meetings`
  - `/settings/profile`
  - `/settings/workspace/messaging-channels`
  - `/pricing`

