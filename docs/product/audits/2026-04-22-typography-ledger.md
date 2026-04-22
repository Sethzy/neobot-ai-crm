# Typography Ledger

Date: 2026-04-22

## Scope

- Source of truth: `app/globals.css`, `app/layout.tsx`, route entrypoints under `app/**/page.tsx`, and the shared components that actually render text.
- Live verification: one runtime pass on `localhost:3001/tasks` through the Computer Use plugin. The visible sidebar, page header, controls, and table shell matched the code-defined typography roles.
- Dynamic CRM/task/chat content is documented by text role, not by every runtime database value. Static UI copy is listed explicitly where it exists in code.

## Font Families

| Role | Source | Notes |
| --- | --- | --- |
| UI sans | `--font-ui` | Local Figtree, mapped to `--font-sans` in `app/layout.tsx` and `app/globals.css` |
| Display serif | `--font-display` | Local Fraunces, mapped to `--font-serif` and `--font-editorial` |
| Mono | `--font-geist-mono` | Geist Mono |

## Semantic Typography Tokens

Defined in `app/globals.css`.

| Token | Font size | Line height | Tracking | Weight | Primary role |
| --- | --- | --- | --- | --- | --- |
| `text-caption` | `0.75rem` / 12px | `1rem` / 16px | `0.08em` | `500` | table headings, meta labels, tiny badges |
| `text-meta` | `0.875rem` / 14px | `1.25rem` / 20px | default | `400` | secondary body text, row metadata |
| `text-body` | `1rem` / 16px | `1.5rem` / 24px | default | `400` | paragraph copy |
| `text-control` | `0.875rem` / 14px | `1.25rem` / 20px | `-0.01em` | `500` | buttons, inputs, tabs, controls |
| `text-toolbar` | `1.125rem` / 18px | `1.5rem` / 24px | `-0.015em` | `600` | compact workspace titles |
| `text-page` | `1.5rem` / 24px | `1.875rem` / 30px | `-0.03em` | `600` | full page titles |
| `text-subhead` | `1.25rem` / 20px | `1.75rem` / 28px | `-0.01em` | `600` | secondary headings |
| `text-title` | `2rem` / 32px | `2.25rem` / 36px | `-0.04em` | `600` | hero/auth titles |
| `text-display` | `clamp(2.5rem, 5vw, 4rem)` | `1.02` | `-0.05em` | `500` | large marketing display |

## Semantic Utility Classes

Also defined in `app/globals.css`.

| Utility | Backing token(s) | Meaning |
| --- | --- | --- |
| `type-page-title` | `text-page` | top-level app page titles |
| `type-page-description` | `text-meta` | page descriptions and page meta rows |
| `type-toolbar-title` | `text-toolbar` | dense workspace titles |
| `type-toolbar-description` | `text-meta` | dense workspace descriptions |
| `type-section-title` | `text-body` + `font-semibold` | card or section headers |
| `type-control` | `text-control` | actionable labels |
| `type-control-muted` | `text-control` | subdued controls |
| `type-row-title` | `text-meta` + `font-medium` | row titles |
| `type-row-meta` | `text-caption` | row metadata |
| `type-table-heading` | `text-caption` + uppercase | grid/list headings |
| `type-empty-title` | `text-body` + `font-semibold` | empty state title |
| `type-empty-copy` | `text-meta` | empty state description |
| `type-hero-title` | `text-title` + `font-semibold` | chat hero heading |
| `type-heading` | `font-serif text-title` | serif heading |
| `type-display` | `font-serif text-display` | serif display heading |

## Raw Tailwind Text Utilities Still In Use

These were confirmed against Tailwind's default scale.

| Utility | Font size | Line height |
| --- | --- | --- |
| `text-xs` | `0.75rem` / 12px | `1rem` / 16px |
| `text-sm` | `0.875rem` / 14px | `1.25rem` / 20px |
| `text-base` | `1rem` / 16px | `1.5rem` / 24px |
| `text-lg` | `1.125rem` / 18px | `1.75rem` / 28px |
| `text-xl` | `1.25rem` / 20px | `1.75rem` / 28px |
| `text-2xl` | `1.5rem` / 24px | `2rem` / 32px |
| `text-3xl` | `1.875rem` / 30px | `2.25rem` / 36px |
| `text-4xl` | `2.25rem` / 36px | `2.5rem` / 40px |
| `text-5xl` | `3rem` / 48px | `1` |

## Shared Primitive Inventory

| Primitive | Typography contract |
| --- | --- |
| `PageHeader` | `page` variant = `type-page-title` + `type-page-description`; `workspace`/`panel` = `type-toolbar-title` + `type-toolbar-description` |
| `Button` | base text is `text-control` |
| `Input` | base text is `text-control`; file label is `text-caption` |
| `Label` | base text is `text-meta font-medium` |
| `Badge` | base text is `text-caption font-medium` |
| `Table` | base table text is `text-meta`; `TableHead` uses `type-table-heading` |
| `CardTitle` | raw `text-base` by default; often overridden on settings/public surfaces |
| `CardDescription` | raw `text-sm` |
| `Alert` | raw `text-sm`; `AlertDescription` is `text-sm` |
| `SidebarMenuButton` | raw `text-sm`; this is the main remaining drift in the app shell |
| `DropdownMenuItem` | raw `text-sm` unless overridden |

## Sidebar Word Ledger

This section documents the visible left-rail words from the live `Tasks` page and the sidebar source code.

| Visible word or text role | Source | Typography |
| --- | --- | --- |
| `neobot` | `Logo` wordmark | raw `text-lg font-semibold tracking-tight` = 18px / 28px |
| `Search` | sidebar search row | `SidebarMenuButton` raw `text-sm` = 14px / 20px |
| `Agent` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `New Task` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Tasks` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Automations` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Skills` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `People` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Companies` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Deals` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Meetings` | primary nav | `SidebarMenuButton` raw `text-sm` |
| `Chats` | chats section label | `type-control-muted` = 14px / 20px |
| chat thread titles | recent threads list | `SidebarMenuButton` raw `text-sm`; overflow popover rows use `type-control` |
| `All chats` | overflow row | `SidebarMenuButton` raw `text-sm` in rail, popover title rows use `type-control` |
| `Settings` | footer settings row | `SidebarMenuButton` raw `text-sm` |
| visible user email | footer user row | inner email span explicitly `type-control` = 14px / 20px |
| dropdown email line | user dropdown | `text-caption` = 12px / 16px |
| `Sign out` | user dropdown item | `DropdownMenuItem` raw `text-sm` |

## Route Ledger

### Authenticated SaaS Routes

| Route | Static copy | Typography map | Notes |
| --- | --- | --- | --- |
| `/agent` | chat thread surface plus optional `Connect Telegram` banner | banner uses raw `text-sm`; underlying chat thread inherits chat typography | Same thread surface as `/chat/[threadId]` |
| `/chat` | `What can I do for you?`, `Sales`, `Operations`, `Research`, `Marketing`, `Describe a task or responsibility` | hero `type-hero-title`; tabs `type-control`; template titles `type-row-title`; template descriptions `text-meta`; composer controls use `Button`/`Input` primitives | New-thread welcome surface |
| `/chat/[threadId]` | automation breadcrumb when applicable: `Automations`, trigger name, thread title | breadcrumb `type-control-muted`; right-side trigger card title `type-row-title`; schedule line `type-row-meta`; message composer and pills use shared chat primitives | Dense thread header is consistent with workspace scale |
| `/tasks` | `Tasks`, description, `Search tasks by title or description...`, `Table`, `Board`, `Calendar`, `New`, error and empty states | header `PageHeader(page)`; input `text-control`; toggle/buttons `text-control`; table headers in `CrmTasksTable` use `text-caption`; cells `text-meta`; empty title `type-empty-title` | Live-verified in Chrome |
| `/automations` | `Automations`, description, empty and error states | header `PageHeader(page)`; list section labels `type-table-heading`; row names `type-row-title`; cadence and countdown `type-row-meta` | Good system alignment |
| `/automations/[triggerId]` | `Automations`, trigger name, `Schedule`, `Instructions`, `Runs`, `Run`, `Automation not found.` | breadcrumb `type-control-muted`; main header `PageHeader(page)` through `AutomationHeader`; panel heading `type-toolbar-title`; tab labels `type-control`; runs empty state `type-empty-*` | Detail surface stays on shared system |
| `/skills` | `Skills`, description, `Installed`, `Recommended`, search placeholder | header `PageHeader(page)`; section headings `type-section-title`; helper copy `type-control-muted`; search input `text-control`; skill rows use `type-row-title` + `type-row-meta` | Good system alignment |
| `/skills/[slug]` | skill name, description, `Installed` or `Recommended`, `Skill slug`, `Back`, `Definition` | header `PageHeader(page)`; meta uses `type-row-meta`; back link `type-control`; section title `type-section-title` | Good system alignment |
| `/meetings` | `Meetings`, `New Meeting`, grouped labels like `Today` / `Yesterday`, empty state | header `PageHeader(workspace)`; loading `type-control-muted`; day labels `type-table-heading`; row title `type-row-title`; duration/time `type-row-meta` | Correctly uses compact workspace title scale |
| `/meetings/[id]` | `Meetings`, meeting title, date and duration meta, `Notes`, loading and not-found states | back link `type-control-muted`; header `PageHeader(page)`; summary sections use `type-control` and `text-meta`; transcript toggle `type-control`; transcript body `text-meta`; notes heading `type-toolbar-title`; note body `text-body` | Detail page is mostly aligned |
| `/pricing` | `Plans & Billing`, plan status badges, notices, plan names, price, trial labels, feature lists | header `PageHeader(page)`; status badges `text-caption`; price uses `text-title`; helper rows `type-control-muted` and `type-row-meta`; feature list `text-meta` | Good alignment |
| `/admin/scores` | `Evaluator scores`, empty copy, table headings `Day`, `Evaluator`, `Score type`, `Average`, `Runs` | header `PageHeader(page)`; code pill uses `text-caption`; empty copy `type-empty-copy`; table headings `type-table-heading`; table body `text-meta` | Good alignment |
| `/customers/people` | `People`, CRM shell actions, shared `Filters`, `Perspectives`, search placeholder | header `PageHeader(workspace)` via `CrmListPanelLayout`; toolbar controls `text-control`; table headings `type-table-heading`; cells `text-meta`; empty state `type-empty-*` | Route shell aligned; column labels come from CRM config |
| `/customers/companies` | `Companies`, CRM shell actions, shared `Filters`, `Perspectives`, search placeholder | same as `/customers/people` | Route shell aligned |
| `/customers/deals` | `Deals`, `Filters`, `Perspectives`, `Table`, `Board`, sort labels, empty/error states | header `PageHeader(workspace)`; filter/search/toggles `text-control`; sort label uses `type-control-muted`; table headings `type-table-heading`; kanban cards use `type-row-title` + `type-row-meta` | Route shell aligned |
| `/settings/profile` | `Profile`, description, `Connect Telegram`, `Default messaging agent`, form labels, save states | page header uses system tokens, but inner cards drift: card titles raw `text-2xl`; body copy and labels mostly raw `text-sm`; select field raw `text-sm`; buttons use `text-control` | Settings internals are not fully normalized |
| `/settings/agent/general` | `General`, description, `Autopilot`, `Pulse every`, `Timezone`, `Quiet hours`, save states | page header uses system tokens, but `AutopilotCard` title is raw `text-2xl`; body, labels, helper text, time inputs, clear link are raw `text-sm` / `text-xs` | Clear typography drift inside the card |
| `/settings/agent/memory` | `Memory`, description, `Client profile`, `User preferences`, count pills, save states | page header uses system tokens; card titles use `font-serif text-subhead`; helper copy `text-body`; count pills `text-caption`; footer save/help copy raw `text-sm` | Closest of settings pages to the semantic system, but footer messages still raw `text-sm` |
| `/settings/agent/connections` | `Connections`, description, `Coming soon`, note copy | `SettingsStubPage` uses `PageHeader(page)` but card title is raw `text-xl`; card body is raw `text-sm` | Stub page drift |
| `/settings/notifications` | `Notifications`, description, `Coming soon`, note copy | same `SettingsStubPage` pattern | Stub page drift |
| `/settings/workspace/billing` | `Billing`, description, `Current plan`, plan name, status badge, portal CTA | page header uses system tokens; card description is raw `text-sm`; card title overridden to `type-section-title`; content body `text-meta` | Mostly aligned |
| `/settings/workspace/usage` | `Usage`, description, `Coming soon`, note copy | same `SettingsStubPage` pattern | Stub page drift |

### Redirect-Only Routes

These routes do not own persistent typography. They immediately redirect.

| Route | Redirect target |
| --- | --- |
| `/settings` | `/settings/profile` |
| `/settings/billing` | `/settings/workspace/billing` |
| `/settings/agent-context` | `/settings/agent/memory` |
| `/settings/workspace/messaging-channels` | `/settings/profile` |
| `/crm` | `/customers` |
| `/crm/contacts` | `/customers/people` |
| `/crm/contacts/[contactId]` | `/customers/people/[contactId]` |
| `/crm/companies` | `/customers/companies` |
| `/crm/companies/[companyId]` | `/customers/companies/[companyId]` |
| `/crm/deals` | `/customers/deals` |
| `/crm/deals/[dealId]` | `/customers/deals/[dealId]` |
| `/customers/deals/pipeline` | `/customers/deals?view=kanban` |

### Auth Routes

| Route | Static copy | Typography map | Notes |
| --- | --- | --- | --- |
| `/login` | `Sign in to your account`, description, `Sign in with Google`, `Or`, `Email address`, `Password`, `Forgot password?`, `Sign in`, footer link | `AuthShell` title uses `font-serif text-title sm:text-display`; description `text-body`; brand `sunder` uses `font-serif text-subhead`; mode pill `text-caption`; error banner `text-meta`; labels `text-meta`; inputs `text-control`; button text `text-control`; helper link `text-meta` | Good auth consistency |
| `/register` | `Get started for free`, success state `Check your email`, `Sign up with Google`, `Or`, field labels, footer link | same `AuthShell` system; error banners `text-meta`; back button uses `Button` | Good auth consistency |
| `/forgot-password` | `Reset your password`, success state `Check your email`, `Send reset link` | same `AuthShell` system | Good auth consistency |
| `/update-password` | `Set new password`, `New password`, `Confirm password`, `Update password` | same `AuthShell` system | Good auth consistency |
| `/auth/confirm` | `Confirming your email...`, `Email confirmed!`, `Confirmation failed`, helper footer | same `AuthShell` system | Good auth consistency |

### Public Marketing and Market Data Routes

| Route | Static copy | Typography map | Notes |
| --- | --- | --- | --- |
| `/` | landing page composed from `Header`, `Hero`, `UseCases`, `PrimaryFeatures`, `SecondaryFeatures`, `Differentiator`, `Testimonials`, `Pricing`, `Faqs`, `Footer` | separate `landing-page` typography system; hero uses `font-serif text-title sm:text-display`; many downstream sections use raw `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`, plus `text-caption` badges | Marketing stack is intentionally separate from authenticated SaaS |
| `/demo` | `See NeoBot Handle Your Workflows`, supporting copy, three benefit rows | raw marketing scale: heading `font-serif text-4xl sm:text-5xl`; paragraph `text-lg`; list item titles `text-lg font-semibold`; descriptions raw default paragraph text | Separate public page system |
| `/market` | `Free for Agents`, `Singapore Property Market Data`, supporting paragraph | `text-caption` badge, `font-serif text-title md:text-display`, paragraph `text-body md:text-subhead` | This page is closer to the semantic system |
| `/market/agents` | `Singapore Property Agent Profiles`, search box, stats strip | raw `text-2xl sm:text-3xl` heading, raw `text-base` paragraph, raw `text-sm` stats strip | Public market list pattern |
| `/market/agencies` | `Singapore Property Agencies`, search box, stats strip | same raw `text-2xl sm:text-3xl` + `text-base` + `text-sm` pattern | Public market list pattern |
| `/market/areas` | `Singapore Property Areas`, search box, stats strip | same raw list-page pattern | Public market list pattern |
| `/market/properties` | `Singapore Private Property Profiles`, search box, stats strip | same raw list-page pattern | Public market list pattern |
| `/market/hdb` | `HDB Resale Streets`, search box, stats strip | same raw list-page pattern | Public market list pattern |
| `/market/agents/[regNo]` | `Back to agents`, agent name, agency chip, status chip, summary meta | back link raw `text-sm font-medium`; heading raw `text-2xl sm:text-3xl`; chips raw `text-xs`; summary row raw `text-sm` | Detail page is outside SaaS system |
| `/market/agencies/[slug]` | `Back to agencies`, agency name, top-agent table | back link raw `text-sm font-medium`; heading `font-serif text-3xl sm:text-4xl`; table headers raw `text-xs uppercase`; table cells raw `text-sm` | Detail page is outside SaaS system |
| `/market/areas/[slug]` | `Back to areas`, area name, stat bar and tables | back link raw `text-sm font-medium`; heading `font-serif text-3xl sm:text-4xl`; downstream data tables are public-surface specific | Detail page is outside SaaS system |
| `/market/properties/[slug]` | `Back to properties`, property/project name, district chips | back link raw `text-sm font-medium`; heading `font-serif text-3xl sm:text-4xl`; chips raw `text-xs`; downstream tables/charts are public-surface specific | Detail page is outside SaaS system |
| `/market/hdb/[town]/[slug]` | `Back to HDB streets`, street name, town chips | back link raw `text-sm font-medium`; heading `font-serif text-3xl sm:text-4xl`; chips raw `text-xs`; downstream tables/charts are public-surface specific | Detail page is outside SaaS system |

## File-Level Drift Summary

The product is no longer fragmented at the top-level app headers, but it is not yet typography-uniform everywhere.

| Area | Current drift |
| --- | --- |
| `src/components/ui/sidebar.tsx` | `SidebarMenuButton` is still raw `text-sm` instead of a semantic utility |
| `src/components/settings/settings-nav.tsx` | back link and nav items are raw `text-sm` |
| `src/components/settings/settings-mobile-nav.tsx` | current page label is raw `text-sm font-medium` |
| `src/components/settings/settings-stub-page.tsx` | card title raw `text-xl`; card body raw `text-sm` |
| `src/components/settings/profile/default-messaging-agent-form.tsx` | card title raw `text-2xl`; labels/body/messages/select all raw `text-sm` |
| `src/components/settings/messaging-channels/channel-row.tsx` | title inherits browser default weight; description raw `text-sm` |
| `src/components/settings/messaging-channels/telegram-connect-row.tsx` | most body and helper text is raw `text-sm` / `text-xs` |
| `src/components/settings/autopilot-card.tsx` | card title raw `text-2xl`; labels and helpers raw `text-sm` / `text-xs` |
| `src/components/settings/agent-context-form.tsx` | footer helper and save message remain raw `text-sm` |
| Public market pages | still use raw Tailwind sizes (`text-2xl` through `text-5xl`) rather than the product semantic scale |
| Landing/demo pages | intentionally separate marketing system; not normalized to dashboard tokens |

## Verification Notes

- Computer Use check on `localhost:3001/tasks` confirmed the current live app matches the code-backed mapping for:
  - sidebar word inventory
  - `Tasks` page title and description
  - search field
  - table view toggle and `New` button
  - table heading row
- I did not rely on a fragile one-off screenshot diff for the rest of the product. The ledger above is route-backed and component-backed.
- The report is exhaustive at the route level. Dynamic runtime records, chat titles, and CRM row contents are documented by typography role rather than by every possible database string.
