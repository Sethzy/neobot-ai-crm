# Configurable CRM Columns

**Date:** 2026-04-01  
**Status:** Design  
**Context:** CRM tables (People, Companies, Deals) have hardcoded columns. Users can't add, hide, rename, or reorder them. The AI agent has `configure_crm` which can manage custom fields, but these don't show up in the table UI. We want all columns — core and custom — to be config-driven so the agent (or user) can fully configure their CRM layout. Field definitions modeled after Twenty CRM's data model, adapted for solo advisory sales practitioners.

---

## Entity Field Definitions

Fields are classified into three tiers:

- **Indestructible** — always visible, cannot be hidden or deleted. This is the record's identity.
- **Default but hideable** — ships visible, can be hidden/renamed/reordered, cannot be deleted from config. Data always persists in DB regardless of visibility.
- **Custom** (`source: "custom"`) — user/agent-created fields stored in JSONB. Fully mutable. Can be deleted (with confirmation if data exists).

### People (Contacts)

**Indestructible:**

| key | label | type | source | notes |
|-----|-------|------|--------|-------|
| `name` | Name | full_name | column | first_name + last_name. The record identity. |

**Default but hideable:**

| key | label | type | source | We have today? | Twenty has it? |
|-----|-------|------|--------|---------------|---------------|
| `emails` | Email | email | column | Yes (as `email`) | Yes |
| `phones` | Phone | phone | column | Yes (as `phone`) | Yes |
| `city` | City | text | column | **No — add** | Yes |
| `company_id` | Company | relation | column | Yes | Yes |
| `job_title` | Job Title | text | column | **No — add** | Yes |
| `type` | Type | select | column | Yes | No (Sunder-specific) |
| `linkedin` | Linkedin | url | column | **No — add** | Yes |
| `x_link` | X | url | column | **No — add** | Yes |
| `created_at` | Created | date | column | Yes | Yes |
| `updated_at` | Updated | date | column | Yes | Yes |
| `created_by` | Created by | text | column | **No — add** | Yes (actor type) |

**New DB columns needed:** `city`, `job_title`, `linkedin`, `x_link`, `created_by`

**Sidebar associations (detail page, not configurable — hardcoded sections):**

| Association | Relation | We have today? |
|-------------|----------|---------------|
| Company | many-to-one | Yes |
| Deals | one-to-many (via deal_contacts) | Yes |
| Tasks | one-to-many | Yes |
| Interactions | one-to-many | Yes |
| Notes | one-to-many | **No — follow-up** |
| Files/Attachments | one-to-many | **No — follow-up** |

---

### Companies

**Indestructible:**

| key | label | type | source | notes |
|-----|-------|------|--------|-------|
| `name` | Name | text | column | The record identity. |

**Default but hideable:**

| key | label | type | source | We have today? | Twenty has it? |
|-----|-------|------|--------|---------------|---------------|
| `website` | Website | url | column | Yes | Yes ("Domain Name") |
| `address` | Address | text | column | Yes | Yes |
| `industry` | Industry | select | column | Yes | No (Twenty has ICP boolean — we keep industry) |
| `linkedin` | Linkedin | url | column | **No — add** | Yes |
| `created_at` | Created | date | column | Yes | Yes |
| `updated_at` | Updated | date | column | Yes | Yes |

**New DB columns needed:** `linkedin`

**Sidebar associations (detail page):**

| Association | Relation | We have today? |
|-------------|----------|---------------|
| People (contacts at company) | one-to-many | Yes |
| Deals | one-to-many | Yes |
| Tasks | one-to-many | Yes |
| Interactions | one-to-many | Yes |
| Notes | one-to-many | **No — follow-up** |
| Files/Attachments | one-to-many | **No — follow-up** |

---

### Deals (Opportunities)

**Migration note:** Currently the deal identity field is `address` (real-estate-centric). Changing to a generic `name` field so the system works across industries. `address` becomes a default-but-hideable field. Real estate users keep it visible via onboarding config; insurance advisors hide it and add their own fields.

**Indestructible:**

| key | label | type | source | notes |
|-----|-------|------|--------|-------|
| `name` | Name | text | column | **New field** — replaces `address` as identity. Generic deal name. |

**Default but hideable:**

| key | label | type | source | We have today? | Twenty has it? |
|-----|-------|------|--------|---------------|---------------|
| `amount` | Amount | currency | column | Yes (as `price` — rename) | Yes |
| `close_date` | Close date | date | column | **No — add** | Yes |
| `stage` | Stage | select | column | Yes | Yes |
| `company_id` | Company | relation | column | Yes | Yes |
| `point_of_contact` | Point of Contact | relation | column | **No — add** | Yes (→ contacts) |
| `address` | Address | text | column | Yes (currently the identity — demote to hideable) | No |
| `created_at` | Created | date | column | Yes | Yes |
| `updated_at` | Updated | date | column | Yes | Yes |

**New DB columns needed:** `name`, `close_date`, `point_of_contact_id`  
**Rename:** `price` → `amount`  
**Demote:** `address` from identity to hideable default

**Sidebar associations (detail page):**

| Association | Relation | We have today? |
|-------------|----------|---------------|
| Contacts (linked to deal) | many-to-many (via deal_contacts) | Yes |
| Company | many-to-one | Yes |
| Tasks | one-to-many | Yes |
| Interactions | one-to-many | Yes |
| Notes | one-to-many | **No — follow-up** |
| Files/Attachments | one-to-many | **No — follow-up** |

---

## Data Model

Every entity type gets a `fields` array in CRM config, replacing the current separate `*_custom_fields` arrays. Each field entry:

```ts
interface FieldDefinition {
  key: string              // "email", "budget", etc.
  label: string            // "Email", "WhatsApp Number"
  type: FieldType          // see below
  source: "column" | "custom"  // DB column vs custom_fields JSONB
  tier: "indestructible" | "default" | "custom"  // protection level
  visible: boolean
  order: number
  width?: number           // column width in px (optional, auto if omitted)
  editable: boolean
  required: boolean
  options?: string[]        // for select/tags types
  related_entity?: string   // for relation type: "contacts" | "companies" | "deals"
}

type FieldType =
  | "text"
  | "full_name"
  | "number"
  | "currency"
  | "email"
  | "phone"
  | "url"
  | "date"
  | "boolean"
  | "select"
  | "tags"
  | "richtext"
  | "file"
  | "relation"
```

Config structure per entity in `crm_config`:

```ts
{
  contact_fields: FieldDefinition[]
  company_fields: FieldDefinition[]
  deal_fields: FieldDefinition[]
}
```

**Tier enforcement rules:**
- `indestructible`: cannot be hidden (`visible` always true), cannot be deleted, `key`/`type`/`source` immutable
- `default`: can be hidden, renamed, reordered. Cannot be deleted. `key`/`type`/`source` immutable.
- `custom`: fully mutable. Can be deleted (with data-exists warning + confirmation).

---

## Frontend: Dynamic Column Generation

A shared function replaces all three page-specific hardcoded column arrays:

```ts
// src/lib/crm/build-columns.tsx

function buildColumnsFromConfig(
  fields: FieldDefinition[],
  entityType: "contacts" | "companies" | "deals",
  helpers: ColumnHelpers
): ColumnDef[]
```

This function:
1. Filters to `visible: true`, sorted by `order`
2. Picks a cell renderer per `type`:
   - `text` — plain text, truncated
   - `full_name` — first + last name, linked to detail page
   - `email` — `mailto:` link
   - `phone` — `tel:` link
   - `url` — clickable link, new tab
   - `number` — formatted number
   - `currency` — formatted with currency symbol
   - `date` — formatted date string
   - `boolean` — checkbox or yes/no label
   - `select` — DictionaryValue with icon tile
   - `tags` — row of small badges
   - `relation` — linked entity name, clickable to detail page
   - `richtext` — plain text preview (stripped markdown/HTML)
   - `file` — filename with icon
3. Reads value from `row[key]` for `source: "column"`, `row.custom_fields?.[key]` for `source: "custom"`
4. Wraps in `QuickEditCell` if `editable: true`
5. Sets column width from `width` if provided

---

## Column Reordering (Drag-and-Drop)

Column headers are draggable via `@dnd-kit/sortable`:
- Wrap `<thead>` headers in a `SortableContext`
- On drag end, recompute `order` values and persist to CRM config via API
- TanStack Table's `columnOrder` state controls render order

## Column Width Persistence

Column headers have a resize handle (small draggable right border):
- On resize end, save width to the field's `width` property in config
- TanStack Table's `columnSizing` state controls widths
- Debounced save to avoid excessive API calls

---

## Agent Integration

The existing `configure_crm` tool expands to manage the full `fields` array:

**Operations the agent can perform:**
- **Add a field:** Appends to fields array with `source: "custom"`, `tier: "custom"`, `visible: true`, next `order` value
- **Hide a field:** Sets `visible: false` (works on `default` and `custom` tiers, blocked on `indestructible`)
- **Show a field:** Sets `visible: true`
- **Rename a field:** Updates `label` (works on all tiers)
- **Reorder fields:** Updates `order` values
- **Remove a custom field:** Deletes the entry (warns if data exists, requires confirmation)
- **Change field type:** Only for `tier: "custom"` fields
- **Bulk configure:** Onboarding scenario — rename entities, update stages, add/hide fields in one call

**Constraints enforced by the tool:**
- `tier: "indestructible"` fields: cannot be hidden or deleted
- `tier: "default"` fields: cannot be deleted, `key`/`type`/`source` immutable
- `tier: "custom"` with `type: "select"` or `type: "tags"`: must have `options` array
- `tier: "custom"` with `type: "relation"`: must have `related_entity`
- Removal of custom fields with existing data requires `confirm_removals: true`

---

## Config Safety

**Config version history:**
- `crm_config_history` table stores snapshots before every config write
- Keeps last 20 versions per client
- Agent can restore a previous version ("undo the last CRM config change")
- "Reset to defaults" action available (restores original field definitions)

**Data safety:**
- Hiding a column never deletes data — it only sets `visible: false`
- Removing a custom field warns if records have data in that field
- Core DB columns are never dropped — only the config entry controls visibility

---

## Migration

**DB schema changes:**
- Contacts: add `city`, `job_title`, `linkedin`, `x_link`, `created_by` columns
- Companies: add `linkedin` column
- Deals: add `name`, `close_date`, `point_of_contact_id` columns; rename `price` → `amount`; demote `address` from identity to regular field
- New table: `crm_config_history` (client_id, config_snapshot JSONB, created_at)

**Config migration for existing users:**
1. Read current hardcoded defaults + any `*_custom_fields` from config
2. Build unified `fields` arrays with defaults (including tier) first, custom fields appended
3. Write to `contact_fields`, `company_fields`, `deal_fields` in crm_config
4. Existing `deal.address` data preserved — field just becomes hideable instead of identity
5. Old `*_custom_fields` keys left in place (harmless), cleaned up later

**For new users:**
- `crm_config` seed includes default `fields` arrays from the start

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/crm/config.ts` | Add `FieldDefinition` type with tier, update config schema, seed defaults |
| `src/lib/crm/schemas.ts` | Add field type enum, validation for field definitions |
| `src/lib/crm/build-columns.tsx` | **New file** — shared column generator from field config |
| `src/lib/crm/field-renderers.tsx` | **New file** — cell renderer per field type |
| `app/(dashboard)/customers/people/page.tsx` | Replace hardcoded columns with `buildColumnsFromConfig` |
| `app/(dashboard)/customers/companies/page.tsx` | Same |
| `app/(dashboard)/customers/deals/page.tsx` | Same |
| `src/hooks/use-crm-config.ts` | Expose `fields` arrays from config |
| `src/lib/runner/tools/crm/configure-crm.ts` | Expand to manage full `fields` array with tier enforcement |
| `src/components/ui/data-table.tsx` | Add column reorder + resize support |
| `app/api/crm/config/route.ts` | Handle new fields config shape |
| Supabase migration | New columns on contacts/companies/deals + `crm_config_history` table + seed defaults |

---

## Follow-up Work (Not in Scope)

- **Notes association** — new `notes` table with `contact_id`, `company_id`, `deal_id` foreign keys. Show as sidebar section on all entity detail pages. Agent can create/read notes via a new `create_note` tool.
- **Files/Attachments association** — link Supabase Storage files to specific entity records. New `attachments` table or file metadata linking. Show as sidebar section on detail pages.
- New entity types (contacts/companies/deals only for now)
- Conditional field logic ("show if X = Y")
- Computed/formula fields
- Saved views / perspectives
- Field-level permissions

---

## Verification

1. Open People page — columns render from config, not hardcoded
2. Ask agent "add a Budget field to deals" — column appears in Deals table
3. Ask agent "hide the Phone column from contacts" — column disappears
4. Ask agent "rename Email to Work Email" — header text updates
5. Ask agent "I don't need city" — city column hides
6. Ask agent "set up my CRM for insurance" — bulk reconfigure works
7. Try to hide the Name column — agent refuses (indestructible)
8. Drag a column header to reorder — persists on refresh
9. Resize a column — persists on refresh
10. Existing data and inline editing still work
11. New user signup gets sensible defaults
12. Config history saves before each change — rollback works
