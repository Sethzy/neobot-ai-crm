# CRM UX Upgrade: Right Drawer, Inline Edit, View Switcher, Command Menu

**Date:** 2026-03-04
**Status:** Approved
**Inspiration:** Twenty CRM (open-source), adapted for agent-first supervisor workflow

---

## Overview & Principles

Four features, one workflow: Right Drawer, Inline Edit, View Switcher, Command Menu.

**Design principles:**

- **Agent-first, human-corrects.** All four features serve the supervisor glance-and-fix workflow. No power-user CRM features (bulk edit, drag-and-drop, saved filter views).
- **One path to detail.** Right drawer is the only way to view a record's detail. Existing full-page detail routes (`/crm/contacts/[id]`, `/crm/deals/[dealId]`) get replaced.
- **View state is simple.** Current view type per object stored in localStorage. No named views, no saved filters, no per-view column configs.
- **Progressive enhancement.** Table view ships first (already works). Kanban and Calendar are additive — same data, different layout.

**Scope explicitly excluded:**

- Drag-and-drop on Kanban or Calendar
- Saved/named views with filter persistence
- Table cell inline editing
- Command menu actions (create, delete) — navigation only
- Bulk operations

---

## 1. Right Drawer

### Behavior

- Click any row in a CRM table (or Kanban card, or Calendar item) → drawer slides in from right, 420px wide, over the main content with a subtle backdrop dim on the table area.
- URL updates to `?detail=[id]` as a query param (not a route change). Back button closes the drawer, links are shareable.
- `Esc` or `✕` button or clicking the dimmed backdrop closes the drawer.
- Only one drawer open at a time.
- On mobile (<768px), the drawer becomes a full-screen sheet sliding up from the bottom (reuse ShadCN `Sheet` component).

### Drawer Content (top to bottom)

```
┌─────────────────────────────┐
│  ✕                          │  ← close button, top-right
│                             │
│  Sarah Tan          Seller  │  ← name + type badge
│                             │
│  ── Details ──────────────  │
│  Phone     9234-5678     ✎  │  ← inline-editable fields
│  Email     sarah@me.com  ✎  │
│  Notes     Looking to... ✎  │
│                             │
│  ── Deals ────────────────  │  ← related records, read-only
│  Bishan St 22 · Offer       │     clickable → navigates to
│                             │     deals page + opens that deal
│  ── Activity ─────────────  │
│  Agent updated phone  2m    │  ← timeline, read-only
│  Agent created contact 1d   │
└─────────────────────────────┘
```

### Content by Object Type

- **Contact:** Details fields + Deals section + Activity
- **Deal:** Details fields (stage, price, address) + Contacts section + Activity
- **Task:** Details fields (status, due date, description) + linked Deal/Contact + Activity

One shared `RecordDrawer` component receives object type and ID, fetches data, and renders the appropriate field layout.

---

## 2. Inline Edit (in Drawer)

### Interaction Model — Three States Per Field

1. **Display** — Plain text value. On hover, faint pencil icon appears right-aligned and the row gets a subtle `bg-muted/30` highlight.
2. **Edit** — Click the value or the pencil icon. Text swaps to an input (same size, same position, no layout shift). Auto-focused with value pre-selected. Long text fields (Notes) swap to an auto-growing textarea.
3. **Saving** — On blur or `Enter`, value persists via Supabase update. Brief inline "Saved" checkmark fades in/out over ~1.5s. On `Esc`, reverts to original value without saving.

### Field Types and Edit Controls

| Field | Control | Notes |
|---|---|---|
| Phone, Email, Name | `<input type="text">` | Standard text input |
| Notes | `<textarea>` | Auto-growing, max 4 lines visible |
| Stage (deal) | `<Select>` | Dropdown with the 7 pipeline stages |
| Status (task) | `<Select>` | Dropdown with task statuses |
| Type (contact) | `<Select>` | Buyer/Seller/Landlord/Tenant |
| Due date (task) | Date picker | ShadCN Calendar popover |
| Price (deal) | `<input type="text">` | Formatted as currency on blur |

### Not Editable

Activity timeline, related record lists, timestamps (created/updated). These are agent-managed or system-generated.

### Validation

Minimal — phone format, email format, price must be numeric. Validation errors show as red text below the input. Invalid values are not saved on blur (input stays open with error shown).

### Implementation Pattern

A single `InlineEditField` component that takes `label`, `value`, `type`, `onSave`:

```tsx
<InlineEditField label="Phone" value={contact.phone} type="text" onSave={(v) => updateContact({ phone: v })} />
```

---

## 3. View Switcher

### UI

Icon toggle group in the page header, right-aligned. Only shows on pages with multiple views.

```
 Deals                                    [⊞ ▦ 📅]
 ────────────────────────────────────────────────────
```

Three icons: grid (table), columns (kanban), calendar. Active icon gets `bg-muted` fill. Built as a `ViewToggle` component using ShadCN `Button` variants in a `ButtonGroup`.

### View Availability by Object

| Page | Table | Kanban | Calendar |
|---|---|---|---|
| `/crm/deals` | Default | By stage (7 cols) | By expected close date |
| `/crm/contacts` | Default only | — | — |
| `/tasks` | Default | By status | By due date |

Contacts page shows no toggle (only one view).

### State

Stored in localStorage as `view-{object}` → `"table" | "kanban" | "calendar"`. Falls back to `"table"`. No server persistence.

### Kanban Layout (Read-Only)

```
┌─ Leads ──────┐ ┌─ Viewing ────┐ ┌─ Offer ──────┐ ┌─ Negotiation ─
│ 3 deals      │ │ 1 deal       │ │ 2 deals      │ │ 0 deals
│              │ │              │ │              │ │
│ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │ │
│ │Bishan 22 │ │ │ │Clementi  │ │ │ │Toa Payoh │ │ │  (empty)
│ │$1.1M     │ │ │ │$850K     │ │ │ │$1.3M     │ │ │
│ │Sarah Tan │ │ │ │John Lim  │ │ │ │Amy Chen  │ │ │
│ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │ │
│ ┌──────────┐ │ │              │ │ ┌──────────┐ │ │
│ │Ang Mo Kio│ │ │              │ │ │Bukit T.  │ │ │
│ │$920K     │ │ │              │ │ │$1.5M     │ │ │
│ │David W.  │ │ │              │ │ │Michael N │ │ │
│ └──────────┘ │ │              │ │ └──────────┘ │ │
```

- Columns scroll horizontally on overflow
- Each card: address (bold), price, primary contact name
- Click card → right drawer opens
- No drag-and-drop

### Calendar Layout (Read-Only)

```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│     │     │  1  │  2  │  3  │  4  │  5  │
│     │     │     │ ●●  │     │     │     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  6  │  7  │  8  │  9  │ 10  │ 11  │ 12  │
│     │ ●   │     │     │ ●●● │     │     │
```

- Dots for days with items
- Click a day → expands to show list of items below the calendar
- Click an item → right drawer
- Month navigation with `< March 2026 >` header
- No drag-to-reschedule, no create-by-clicking

---

## 4. Command Menu

### Trigger

- `Ctrl+K` (Windows/Linux) / `Cmd+K` (Mac) from anywhere in the app
- Search icon button in sidebar header (mobile entry point)

### UI

Centered modal, 480px wide, max 60vh tall. Dimmed backdrop. Built on ShadCN `Command` component (wraps `cmdk` library).

```
            ┌─────────────────────────────────────────────┐
            │  🔍 Search contacts, deals, tasks, threads...│
            ├─────────────────────────────────────────────┤
            │                                             │
            │  CONTACTS                                   │
            │  ▶ Sarah Tan · Seller · 9234-5678           │
            │    Samuel Lee · Buyer · 9111-2222           │
            │                                             │
            │  DEALS                                      │
            │    Bishan St 22 #12-34 · Offer · $1.2M     │
            │                                             │
            │  THREADS                                    │
            │    "Update Sarah's phone number"            │
            │    "Draft offer letter for Bishan"          │
            │                                             │
            │                          ↑↓ navigate  ⏎ go │
            └─────────────────────────────────────────────┘
```

### Behavior

- Opens with empty input, focused
- Debounced search (300ms) queries Supabase across four tables in parallel
- Results grouped by type with section headers, max 3 per group
- Arrow keys to navigate, `Enter` to select, `Esc` to close
- Empty query shows nothing (no recent/suggested)
- No results: "No results for [query]"

### Navigation on Select

| Result type | Action |
|---|---|
| Contact | Navigate to `/crm/contacts?detail=[id]` |
| Deal | Navigate to `/crm/deals?detail=[id]` |
| Task | Navigate to `/tasks?detail=[id]` |
| Thread | Navigate to `/chat/[threadId]` |

CRM records open right drawer on their list page. Threads go to the chat thread directly.

### Search Implementation

Single Supabase RPC function `search_records(query text, client_id uuid)` that runs `ILIKE` across `contacts.name`, `deals.address`, `crm_tasks.title`, `threads.title`. Returns `{ type, id, title, subtitle }[]`. RLS enforced. Can add `pg_trgm` or full-text search later if needed.

### Mobile

Full-width modal with top padding. Triggered via search icon in sidebar header.

---

## Implementation Approach

### Build Order

1. **Right Drawer** — Foundation. Everything else feeds into it.
2. **Inline Edit** — Requires drawer. Small scoped component.
3. **View Switcher + Kanban + Calendar** — Independent of drawer but cards/items click into it.
4. **Command Menu** — Independent. Navigates to drawer via query params.

### Shared Infrastructure

- **`?detail=[id]` query param pattern** — A single `useRecordDrawer` hook reads/writes this param, fetches the record, controls open/close state. Used by table row clicks, kanban card clicks, calendar item clicks, and command menu navigation.
- **`RecordDrawer` component** — `src/components/crm/record-drawer/`. Takes `objectType` and `id`. Renders inside ShadCN `Sheet`.
- **`InlineEditField` component** — `src/components/crm/inline-edit-field.tsx`. Stateless display/edit toggle. Used only inside drawer.
- **`ViewToggle` component** — `src/components/crm/view-toggle.tsx`. Switches localStorage value and re-renders.

### What We Retire

- `/crm/contacts/[contactId]/page.tsx` — replaced by drawer
- `/crm/deals/[dealId]/page.tsx` — replaced by drawer
- Full-page detail layouts and breadcrumb patterns for CRM records

### New Files (~12 component files, 1 migration, 1 hook)

Modifies ~6 existing page files. Reuses all existing TanStack Table code, data hooks (`useDeals`, `useContacts`, `useCrmTasks`), and ShadCN `Sheet` + `Command` components.

---

## Resolved Questions

1. **Task detail drawer** — Simpler than contacts/deals. Just editable fields (status, due date, title, description) + link to parent deal/contact. No related records sections, no activity timeline.
2. **Activity timeline data** — Already have `interactions` table with types (call, meeting, email, message, viewing, note) and existing `InteractionTimeline` / `ContactTimeline` components. No new migration needed. Drawer reuses these directly.
3. **Calendar library** — Custom-built month grid (~100-150 lines), cribbing Twenty's visual design and date math (`date-fns` week range calculations). Twenty's own calendar is custom flexbox with no third-party calendar library. Their implementation is too coupled to extract, but the layout pattern and date math are straightforward to replicate.
4. **Search performance** — `ILIKE` is fine for solo agent scale (hundreds of records, not millions). Flag `pg_trgm` indexes as future optimization only if needed.
5. **Kanban column order** — Derived from existing maps. Deal columns = keys of `dealStageBadgeVariantMap` in order. Task columns = task status values in order. No configurable column order — change the map to reorder.
