# Add `boolean` as a CRM custom field type

**Date:** 2026-04-25
**Owner:** TBD
**Status:** Proposed

## Context

The CRM today supports five custom-field types: `text | number | currency | date | select`. There is no boolean / yes-no / checkbox type. Surfaced during the QA tool sweep on `feat/twenty-aesthetic-clone` (T02) — `configure_crm` rejected `boolean` with a Zod error and the agent worked around it by modelling the field as `select` with options `["true","false"]`. That works, but it's a UX papercut for a common pattern (e.g., "VIP", "Do not contact", "Newsletter opt-in") and the agent has to do extra reasoning to translate "boolean" → select-string.

Good news: the renderer, icon, column width, and database storage already accept boolean. The gap is the type enum + a handful of switch arms.

See the QA finding repro: `/tmp/sunder-qa/issues/T02-no-boolean-type.md`.

## Goal

Add `boolean` to `customFieldTypeValues` and wire it through every CRM surface so that:

1. The agent can call `configure_crm` with `type: "boolean"` and the field is created.
2. `create_record` / `update_record` accept `true | false | null` for the field.
3. The People / Companies / Deals / Tasks tables render the value as "Yes" / "No".
4. The row inspector / drawer lets the user toggle the value with a checkbox.
5. Saved views can filter on the field with `is true` / `is false` / `any`.

## Out of scope

- New filter operators beyond is/is-not.
- Bulk-edit UI for booleans across many records.
- Migrating existing `select(["true","false"])` fields to native boolean (data migration is opt-in only — keep it manual for now).
- A "checkbox cell" that toggles inline from the table without opening the drawer (could be a fast follow).

## Critical files (already mapped, all paths from repo root)

### Already supports boolean — leave alone
- `src/lib/crm/field-renderers.tsx:46-69, 76-147` — `formatFieldDisplay` and `renderFieldCell` both have boolean cases that render "Yes" / "No".
- `src/lib/crm/column-widths.ts:24` — `boolean: 100`.
- `src/lib/crm/field-icons.ts:79` — `boolean: ToggleLeft` (lucide).
- `supabase/migrations/20260307100000_crm_configurability.sql:49-53` — custom_fields stored as JSONB; native JSON booleans pass through.
- `src/types/database.ts:798-858` — `Json` type accepts boolean values.
- `src/components/ui/filter-overlay.tsx:402-427` — three-state checkbox filter UI already exists; `formatFilterValueLabel` already prints "Yes" / "No" at lines 206-208.

### The actual change set (small)

| # | File | Change |
|---|---|---|
| 1 | `src/lib/crm/config.ts:18-24` | Add `"boolean"` to the `customFieldTypeValues` tuple. |
| 2 | `src/lib/crm/config.ts:223-250` (`buildConfiguredFieldSchema`) | Add `case "boolean": return z.boolean().nullable();`. |
| 3 | `src/lib/crm/custom-field-validation.ts:27-68` | Add `case "boolean":` that accepts `typeof value === "boolean"` (and `null`). |
| 4 | `src/lib/crm/display.ts:145-158` (`formatCustomFieldValue`) | Add a boolean branch returning `"true" \| "false" \| ""` for the edit-input shape. |
| 5 | `src/lib/crm/display.ts:161-181` (`parseCustomFieldInputValue`) | Add a boolean branch: `"true"|"yes"|"1"` → `true`, `"false"|"no"|"0"|""` → `false` (or `null` for empty). Reject anything else. |
| 6 | `src/components/crm/record-drawer/custom-field-editors.tsx:21-35` (`toInlineEditType`) | Add `if (type === "boolean") return "boolean" as const;`. |
| 7 | `src/components/crm/inline-edit-field.tsx:37` | Extend `InlineEditType` union with `"boolean"`. Add a read-mode arm (renders "Yes"/"No" with the `ToggleLeft` icon) and an edit-mode arm (popover with three buttons: Yes / No / Clear, autosaves on click). |
| 8 | `src/components/crm/quick-edit-cell.tsx:44, 120-130, 159-191, 348-509` | Extend `QuickEditCellType` with `"boolean"`. Update `toDraftValue`, `defaultParseValue`, and `renderEditor` (popover + mobile dialog). Auto-commit on selection. |
| 9 | List pages that build filter defs — `app/(dashboard)/crm/contacts/page.tsx`, `companies/page.tsx`, `deals/page.tsx` | When a custom field has `type === "boolean"`, push a `FilterDef` with `type: "checkbox"` (the FilterOverlay code already handles checkbox; only the wiring is new). |

That's it for product code. **Nine files, all 1–10 line edits except the InlineEditField/QuickEditCell editors which need a small new render arm each.**

### Tests to add

| File | What to test |
|---|---|
| `src/lib/crm/__tests__/config.test.ts` | `customFieldDefinitionSchema` accepts `{ type: "boolean", name: "vip" }` without `options`; `buildConfiguredFieldSchema` returns a Zod schema that accepts `true`, `false`, `null` and rejects strings. |
| `src/lib/crm/__tests__/custom-field-validation.test.ts` (create if absent) | `validateCustomFields` accepts boolean values and rejects non-boolean inputs for boolean fields. |
| `src/lib/crm/__tests__/field-renderers.test.ts` | Already covers boolean format; add a render test that the cell shows "Yes" / "No". |
| `src/components/crm/__tests__/inline-edit-field.test.tsx` | Render with `type="boolean" value={true}` → shows "Yes". Click → opens popover. Click "No" → autosaves with `false`. Click "Clear" → autosaves with `null`. |
| `src/components/crm/__tests__/quick-edit-cell.test.tsx` | Same three behaviors as above for the table-cell variant. |
| `src/components/ui/__tests__/filter-overlay.test.tsx` | Boolean field filter shows three-state control; selecting "Yes" emits `true`, "No" emits `false`, blank emits no filter. |
| `src/lib/managed-agents/tools/crm/__tests__/configure-crm.test.ts` | `configure_crm` accepts `{ type: "boolean", name: "vip" }`. |
| `src/lib/managed-agents/tools/crm/__tests__/create-record.test.ts`, `update-record.test.ts` | Accepts `{ vip: true }` and `{ vip: false }` for a boolean field. |

### Agent-side documentation

- The tool's `inputSchema` description for `configure_crm` should list the supported types so the model picks the right one without a round-trip. Audit the description string in `src/lib/managed-agents/tools/crm/configure-crm.ts` and add `boolean` to whatever enumeration appears there.
- No system-prompt change needed unless the system prompt explicitly enumerates types (it doesn't today, per the explorer pass).
- After this ships, the Anthropic agent must be republished for each model (Haiku, Sonnet, Opus) via `scripts/managed-agents/create-agent.ts` because the tool input schema changed. Per CLAUDE.md: "If tools, system prompt, or managed-agent behavior changes, the Anthropic agent must be republished for the affected model."

## Order of work (suggested PRs)

1. **PR 1 — schema + validation + tests.** Files 1–5 above + the corresponding unit tests + the `configure_crm` tool test. Smallest possible diff; the agent can already create boolean fields after this lands but the UI will fall through to the text editor.
2. **PR 2 — drawer editor.** Files 6 + 7 + their tests. Boolean fields now editable inline.
3. **PR 3 — table quick-edit + filters.** File 8 + 9 + their tests. Boolean fields now toggleable from the row and filterable from saved views.
4. **PR 4 — agent republish + tool description tweak.** Update tool description, run `scripts/managed-agents/create-agent.ts` for Haiku, Sonnet, Opus. Note the new agent IDs in env.

Splitting this way keeps each PR < 200 lines, lets us ship the agent-facing capability first, and means the QA sweep can use `boolean` from PR 1 onwards (UI catches up over the next two PRs).

## Verification

End-to-end pass via the same QA sweep that surfaced this:

1. Re-run `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json` test T02 unmodified ("Add a custom field on the People object named `qa_test_flag`, type boolean, default false."). Expect the first `configure_crm` call to succeed without a retry.
2. Re-run T04 ("Set QA Bot's `qa_test_flag` to true.") and confirm the value lands as native boolean (inspect via `run_sql` and check the JSONB cell stores `true`, not `"true"`).
3. Open `/crm/people` → QA Bot row → drawer. Toggle the field. Reload. Value persists.
4. On `/crm/people`, build a saved view filtered to `vip = Yes`. Confirm only matching rows show.
5. Republished agent: send the same prompt with Haiku, Sonnet, Opus — all three should succeed on the first call.

## Risk

- **Existing `select(["true","false"])` fields keep working.** No data migration; users can convert manually.
- **JSONB column unchanged.** No schema migration needed, so no rollback risk on the database side.
- **Agent republish is the only deployment-coupled step.** If we forget, the Sonnet/Opus agents won't know about the new type and will keep falling back to `select`. Solution: gate PR 4 on `scripts/managed-agents/create-agent.ts` having run for all three models.
- **Search / filter operators.** This plan only adds the equality (is/is-not) operator for booleans. Anything more (e.g., "is empty") is out of scope.

## Estimate

Half a day for an engineer who already knows the CRM module — most of the diff is mechanical pattern-matching off the existing `select` and `date` arms.
