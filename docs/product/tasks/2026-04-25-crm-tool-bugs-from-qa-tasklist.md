# CRM Tool Bugs — Surfaced by Tool-Sweep QA on 2026-04-25

**Source of bugs:** `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json` (T01–T10 portion of the run)
**Repros:** `/tmp/sunder-qa/issues/T02-no-boolean-type.md`, `T03-create-record-silent-data-loss.md`, `T05-search-by-name-empty.md`, `T09-update-task-no-status-field.md`, `T10-manage-views-no-custom-fields.md`

**Goal:** Fix the cluster of CRM-tool bugs found while exercising the managed-agent tools end-to-end via chat (Haiku 4.5 only). Without these, less-capable models can silently corrupt CRM data, and even Haiku has to manually patch around several broken tools mid-conversation.

**The pattern:** Five fails are not five unrelated bugs. They are **two systemic gaps**:
1. **Tool input schemas drift from the actual data model.** T02, T09, T10, and half of T03 are all the same shape — Zod schemas were written once, the columns/features moved on, schemas didn't follow.
2. **Custom fields are a half-finished feature.** Storage (JSONB) shipped, but neither the type system (T02 — no boolean) nor the query/filter layer (T10 — saved views ignore custom_fields) was completed.

Plus one separate area: **contacts search/dedup plumbing** (T03 false-positive dedup + T05 name search broken).

**Architecture:** Everything sits in `src/lib/managed-agents/tools/crm/**` plus the People-table query layer and the People row inspector. The SSE runner, chat UI, and approval gate are otherwise fine (one separate small bug there — see PR-D).

**Test rule (from CLAUDE.md):** All managed-agent verification uses `claude-haiku-4-5` only. Sonnet/Opus are reserved for production runs.

---

## Status update — 2026-04-26

A first pass was taken at this tasklist. **3 of 4 PRs are partially done; PR-A still needs the bulk of the work.** Detail:

- **PR-A.1 (boolean type in configure_crm):** ✅ Schema + validator + tool description shipped. Verified end-to-end via T02 retry under Haiku v8. Outstanding: unit test (A.1.4).
- **PR-A.2 (create_record silent drop):** ⏳ Not started. Still highest priority.
- **PR-A.3 (update_task missing status):** ⏳ Not started.
- **PR-A.4 (manage_views allowlist):** ⏳ Not started.
- **PR-B (search + dedup):** ⏳ Not started.
- **PR-C (custom-field render + filter):** ⏳ Not started. Boolean renderer is needed even though the type enum is in — there's still no checkbox in the People row inspector.
- **PR-D.2 (action_type description):** ✅ Shipped via the description-enumeration alternative (commit eba39289). Outstanding: D.1 (Zod accept-both) and D.3 (UI hardening — Allow card should not render when request_approval itself errored).
- **PR-E (NEW — tool description hardening):** ⏳ Surfaced during the T02 retry. Worth auditing other CRM tools for similar ambiguities.

**Commits that landed:**
- `eba39289 fix(managed-agents/approvals): enumerate action_type values in tool description` — closes PR-D.2 (alternative path).
- `a6bf6ecb fix(managed-agents/crm): forbid updates-wrapper in configure_crm description` — closes the new PR-E sub-finding.
- `6aca4382 refactor(managed-agents/triggers): lazy-import spawnTriggerRun` — pre-req infra so the publish CLI can `import` the tool barrel without pulling `server-only`. Not a bug fix; needed to republish Haiku v7/v8.
- `d6fcc9da chore(scripts): add server-only shim for tsx CLI scripts` — same pre-req infra for the republish flow.
- `85501469 docs(qa): record 2026-04-25 tool-sweep run and follow-up plans` — checks in this tasklist + the QA run JSON.
- (boolean type itself is in `src/lib/crm/config.ts:23` — added in an earlier commit on this branch.)

**One non-blocking eval finding** captured in T02 notes: `[eval] SAFETY GATE BYPASS detected` fires even when `request_approval` did precede the gated call — the eval doesn't recognize the chain across runs. Filed for follow-up, not blocking.

---

## Suggested PR split

- **PR-A — CRM tool input schema sweep** *(must ship first)*
  Fixes T02 enum, T03 silent drop, T09 missing status field, T10 missing custom-field filter keys. All in `src/lib/managed-agents/tools/crm/**`. Pure schema + handler aliasing work, low risk, very high value (4 fails closed).

- **PR-B — Contacts search + dedup** *(independent of PR-A; can ship in parallel)*
  Fixes T03 false-positive dedup and T05 name-search-broken. Touches `create-record.ts` dedup query + `search.ts` query + the contacts search-index trigger.

- **PR-C — Custom fields: render + filter end-to-end** *(depends on PR-A merging first)*
  Adds the checkbox renderer for the new `boolean` type (so T02's fix is visible in the People row inspector + table), and wires `custom_fields` filters into the People-table query layer so the saved-view keys allowed by PR-A actually filter rows at query time.

- **PR-D — request_approval action_type enum mismatch** *(independent, very small)*
  Surfaced as a side-effect during T02 retry. Tool input requires `action_type: "crm.configure_crm"` (with prefix) but the LLM consistently sends `"configure_crm"` (no prefix), causing the approval gate to break. Either accept both or update the tool description to make the canonical form obvious.

Order: PR-A and PR-B in parallel → PR-C after PR-A → PR-D any time. Re-run the matching QA tests after each PR.

---

## PR-A — CRM tool input schema sweep

### A.1 — `configure_crm` is missing `boolean` type (T02)

**Symptom:** Adding a `boolean` custom field fails with `Invalid input ... expected one of "text"|"number"|"currency"|"date"|"select"`. Users have to model boolean fields as `select` with options `["true","false"]`.

- [x] **A.1.1** ~~Locate the `type` enum in `src/lib/managed-agents/tools/crm/configure-crm.ts`. Add `"boolean"` to it.~~ Done — added to `customFieldTypeValues` at `src/lib/crm/config.ts:23`.
- [x] **A.1.2** ~~Update the runtime field validator (the one that checks values against field definitions) to accept `true` / `false`, and also the strings `"true"` / `"false"` (LLMs will send strings sometimes).~~ Done — `case "boolean": return z.boolean()` at `src/lib/crm/config.ts:237`. (Note: only accepts real booleans, not the strings `"true"`/`"false"`. Verify this is acceptable for Haiku — if Haiku sends strings, add a `z.coerce.boolean()` or pre-parse.)
- [x] **A.1.3** ~~Update the tool description string so the LLM knows `boolean` is available.~~ Done — `configure-crm.ts:463` lists boolean in the tool description; per-field `.describe()` calls at lines 57–60 also list it.
- [ ] **A.1.4** Unit test: configure_crm accepts `{ type: "boolean", default: false }` and round-trips through `get_crm_config`.

> The matching renderer/UI for the new boolean type lives in **PR-C**.

### A.2 — `create_record` silently drops `name` and `emails` (T03 part 2)

**Symptom:** `{ entity: "contacts", records: [{ name: "QA Bot", emails: ["qa@bot.test"] }] }` returns `success: true`, but the new row has `first_name: ""`, `last_name: ""`, `email: null`. Fields the LLM naturally sends don't map to the actual columns and are silently dropped.

- [ ] **A.2.1** Read `src/lib/managed-agents/tools/crm/create-record.ts`. Identify the Zod schema for `records[]` items and the mapping step before the Supabase insert.
- [ ] **A.2.2** Add aliases in the Zod schema: `name: z.string().optional()` and `emails: z.array(z.string()).optional()`. After parse, normalise: split `name` on first space → `first_name`/`last_name` (single-word names → `last_name = ""`); take `emails[0]` → `email`.
- [ ] **A.2.3** Reject ambiguous combos: if both `name` AND `first_name` are supplied, error out with a clear message. Same for `emails` AND `email`.
- [ ] **A.2.4** Update the tool description to list canonical column names and mention the aliases.
- [ ] **A.2.5** Unit tests: (a) `name: "QA Bot"` splits correctly, (b) `emails: ["x@y.z"]` writes `email`, (c) canonical fields still work, (d) post-create read-back shows the supplied values, (e) ambiguous combo errors out.

### A.3 — `update_task` has no `status` field (T09)

**Symptom:** "Mark this task as done" fails. `update_task` accepts only `task_id` + `description`. Haiku gives up, sets `description: "Completed"` as a useless proxy. Real `status` column on the `tasks` table is untouched.

- [ ] **A.3.1** Open `src/lib/managed-agents/tools/crm/tasks.ts`. Find the `update_task` tool definition.
- [ ] **A.3.2** Add `status` to the Zod schema as an enum matching the actual `tasks.status` values in the migration (likely `todo` | `in_progress` | `done` | `cancelled` — confirm against the migration before hardcoding).
- [ ] **A.3.3** Wire `status` through to the Supabase update.
- [ ] **A.3.4** Update the tool description so the LLM knows `status` is updatable.
- [ ] **A.3.5** Unit test: `update_task({ task_id, status: "done" })` returns the task with `status === "done"`.
- [ ] **A.3.6** Cleanup: clear out the bogus `description: "Completed"` left on QA test task `4f7ee9d7-984b-4e25-a878-c942743a5753` (or just delete it).

### A.4 — `manage_views` filter allowlist excludes custom_fields (T10)

**Symptom:** Saving a view that filters on `qa_test_flag` fails: `"Invalid filter keys for contacts: qa_test_flag. Allowed: type, company_id, created_at_after, created_at_before"`. Custom fields are configurable but un-filterable in saved views.

- [ ] **A.4.1** Open `src/lib/managed-agents/tools/crm/manage-views.ts`. Find the hardcoded filter-key allowlist for each entity type.
- [ ] **A.4.2** Make the allowlist dynamic: load `crm_config.contact_custom_fields` (and the equivalent for deals/tasks/companies) and union those keys into the allowlist at validation time.
- [ ] **A.4.3** Update the rejection error from "Invalid filter keys" to something the model can act on, e.g. `"Allowed filter keys (including configured custom fields): {list}"`.
- [ ] **A.4.4** Unit test: with `qa_test_flag` configured, manage_views accepts `state.filters.qa_test_flag = "true"` and persists the saved view.

> Actually applying custom-field filters at query time on `/crm/people` is **PR-C**. PR-A only fixes the input gate.

### PR-A verification

- [ ] **A.5** Re-run T02 / T03 / T09 / T10 from the QA checklist via `agent-browser` on Haiku 4.5:
  - **T02:** "Add a boolean custom field qa_bool to People." → single configure_crm call, success, no select fallback.
  - **T03:** "Create a person named QA Bot Two with email qa-two@bot.test." → single create_record call, no field drop, no false dedup (note: dedup fix is in PR-B; if PR-B hasn't shipped, skip the dedup half of T03).
  - **T09:** "Mark task 4f7ee9d7 as done." → single update_task call, returned task has `status: "done"`.
  - **T10:** "Save a People view called QA Hot filtering qa_bool == true." → single manage_views call, view created.
- [ ] **A.6** Flip T02, T03, T09, T10 entries in `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json` to `result: "pass"` with a note "Re-tested after PR-A — clean."

---

## PR-B — Contacts search + dedup

### B.1 — `create_record` dedup is wildly oversensitive (T03 part 1)

**Symptom:** "Create QA Bot, qa@bot.test" returns `possible_duplicates` listing ~10 contacts ("New Contact", "David Lee", "Michelle Ong", "Sarah Tan"…) that share **nothing** with the input. Matcher is returning a broad slice of contacts rather than fuzzy-matching name/email.

- [ ] **B.1.1** Locate the dedup query inside `create-record.ts` (or wherever it's helper'd out). Confirm the WHERE clause.
- [ ] **B.1.2** Replace with a real similarity check. Minimum bar: `WHERE client_id = $1 AND ((LOWER(email) = LOWER($input_email)) OR (LOWER(first_name) = LOWER($input_first) AND LOWER(last_name) = LOWER($input_last)))`. Optionally `pg_trgm` later, but exact-email + exact-name is enough.
- [ ] **B.1.3** If no input email AND no input name → skip dedup entirely.
- [ ] **B.1.4** Unit tests: (a) creating "QA Bot"/"qa@bot.test" against a DB seeded with "Sarah Tan"/"sarah@example.com" returns no duplicates, (b) creating an exact-email duplicate IS flagged, (c) creating an exact name (case-insensitive) IS flagged, (d) creating with no name AND no email is allowed.

### B.2 — `search_crm` returns nothing when querying contact name (T05)

**Symptom:** "Find QA Bot" → `search_crm` returns 0 results. Searching by email finds the contact. Yet the contact exists with `first_name: "QA"`, `last_name: "Bot"`. Two candidate root causes — verify both.

- [ ] **B.2.1** Read `src/lib/managed-agents/tools/crm/search.ts`. Identify the WHERE clause(s) for contact name search.
- [ ] **B.2.2** Fix the query: when the search term contains a space, split it and try `(first_name ILIKE $first OR last_name ILIKE $last) OR ((first_name || ' ' || last_name) ILIKE $full)`. When it's a single word, ILIKE against either column.
- [ ] **B.2.3** Find the migration that defines any tsvector / generated search column on `contacts`. If a trigger maintains it, confirm it fires on UPDATE too (not just INSERT). If it's INSERT-only, add a migration making it UPDATE-aware — or switch to a `GENERATED ALWAYS AS (...) STORED` column that auto-updates.
- [ ] **B.2.4** Unit test for the query layer: (a) "QA Bot" finds a contact with `first_name='QA', last_name='Bot'`, (b) "qa" (lowercase, partial) finds it via ILIKE, (c) email-only search still works (no regression).

### PR-B verification

- [ ] **B.3** Re-run T03 (dedup half) and T05 on Haiku 4.5:
  - **T03:** "Create a person named QA Bot Three with email qa-three@bot.test." → no false-positive dedup. (Field-drop half is in PR-A.)
  - **T05:** "Find QA Bot." → single search_crm call returns the record on first try, no email-fallback round-trip needed.
- [ ] **B.4** Update T03 and T05 entries in `checklist.json`: `result: "pass"`, append note "Re-tested after PR-B — dedup correct, name search returns the record on first call."

---

## PR-C — Custom fields: render + filter end-to-end *(depends on PR-A)*

### C.1 — Boolean type renderer in People row inspector (T02)

- [ ] **C.1.1** Find the existing custom-field renderers in `src/components/crm/people/**` (or wherever the row inspector lives — likely a switch on `field.type`). Add a new arm for `boolean` rendering as a checkbox / Switch.
- [ ] **C.1.2** Add a checkbox / pill renderer for the People table cell view too (if custom fields are surfaced as columns).
- [ ] **C.1.3** Render tests for both the row-inspector and table-cell paths.

### C.2 — Apply `custom_fields` filters at query time (T10)

- [ ] **C.2.1** Locate the People-table query layer that applies saved-view filters (look for where `state.filters` is read on `/crm/people`). Probably a TanStack Query hook + a Supabase query builder.
- [ ] **C.2.2** When a filter key isn't in the core column list, treat it as a custom_fields filter and apply a JSONB operator: `custom_fields->>'qa_test_flag' = 'true'` (use eq for select/text/number, range for date/currency).
- [ ] **C.2.3** Make sure RLS still applies — the JSONB filter must be ANDed with the existing `client_id` predicate, not replace it.
- [ ] **C.2.4** Integration test: create a saved view with a custom-field filter, load `/crm/people` with that view selected, confirm only matching rows render.

### PR-C verification

- [ ] **C.3** On `/crm/people`, switch to the "QA Hot" view created in T10 — verify only rows where `qa_test_flag = "true"` show. Verify the new boolean field renders as a checkbox in the row inspector for QA Bot.
- [ ] **C.4** Append note to T02 and T10 entries in `checklist.json`: "Renderer + filter applied end-to-end after PR-C — verified on /crm/people."
- [ ] **C.5** Revert the QA prompt rewordings in T04 and T10 of `checklist.json` (they were patched to use the string `"true"` workaround — change back to a real boolean once PR-A's `boolean` type ships).

---

## PR-D — `request_approval` action_type enum prefix mismatch *(small, independent)*

**Symptom (surfaced during T02 retry on 2026-04-26):** Haiku calls `request_approval({ action_type: "configure_crm", summary: "..." })`. Tool errors with `Invalid input for request_approval ... expected one of "crm.delete_records"|"crm.configure_crm"`. The Allow card still renders, user clicks Allow, agent reports "Approved", but the underlying action never fires and the run hangs.

- [x] **D.1** ~~Open the `request_approval` tool definition (likely in `src/lib/managed-agents/tools/approvals/request-approval.ts`). Find the `action_type` enum.~~ Done — found at `src/lib/managed-agents/tools/approvals/request-approval.ts:25`.
- [x] **D.2** ~~Pick a fix~~ Shipped via the **Alternative** path in commit `eba39289`: tool description and field-level description now enumerate the exact valid values (`"crm.delete_records"`, `"crm.configure_crm"`) and explicitly state `The "crm." prefix is required.` Verified working — Haiku v7+ formats the input correctly. Recommended path (Zod accept-both with transform) was NOT taken; revisit if a future model still gets it wrong.
- [ ] **D.3** *(STILL OPEN — UI hardening not done.)* When `request_approval` itself returns an error, the Allow card should NOT render (or should render in an error state with no Allow button). Currently it renders Allow, the user clicks, the agent reports "Approved", the underlying action never fires, and the run hangs forever. This is the bug that blocked the T02 retry until eba39289 fixed the input side. Inputs are now valid most of the time, but D.3 is still a real footgun for any future schema mismatch.
- [ ] **D.4** Unit + integration test: (a) action_type without prefix is accepted and normalised — *(only relevant if D.1's recommended path is taken later)*, (b) when request_approval returns an error, no approval card is rendered — *(test for D.3)*.
- [ ] **D.5** Repro reference: see the T02 notes in `checklist.json` (line ~126).

---

## PR-E — Tool description hardening *(NEW — surfaced 2026-04-26)*

### E.1 — `configure_crm` description rewritten to forbid `updates:` wrapper

**Symptom (during T02 retry):** Even after D.2 fixed the approval gate, configure_crm still failed because Haiku wrapped its input in `{ updates: { contact_custom_fields: [...] } }` instead of passing fields flat at the top level. Root cause: the old description said "Accepts partial updates...", and Haiku anchored on the word "updates" and invented the wrapper.

- [x] **E.1.1** ~~Rewrite the configure_crm tool description to make the flat shape explicit and forbid the wrapper.~~ Done in commit `a6bf6ecb`. New description includes: `"Pass changed fields directly at the top level (e.g. contact_custom_fields, deal_stages). DO NOT wrap them in an updates object — there is no updates parameter."`

### E.2 — Audit other tool descriptions for similar ambiguity *(PARTIAL — definition sweep done)*

The configure_crm wrapper bug is a category, not a one-off. Models will anchor on any English word that suggests structure (`updates`, `payload`, `params`, `body`) and invent matching nested shapes. This needs a pre-emptive sweep before more bugs ship.

- [x] **E.2.1** ~~Audit every tool in `src/lib/managed-agents/tools/**` for descriptions containing the words "updates", "payload", "params", "body", "input", "request", "wrapper" — anywhere those words could be misread as a parameter name.~~ Done — swept model-facing descriptions and field descriptions in `src/lib/managed-agents/tools/**`.
- [x] **E.2.2** ~~For each match, either (a) reword to remove the noun, or (b) add an explicit "DO NOT wrap them in a `<word>` object" sentence like configure_crm now has.~~ Done — added explicit top-level shape / no-wrapper language to `update_record`, `setup_trigger`, `manage_active_triggers`, `manage_todo`, `request_approval`, `execute_composio_tool`, `list_composio_tools`, and `send_message`; rewrote trigger-discovery wording so returned schemas map to `setup_trigger.params` / `manage_active_triggers.edit_params`.
- [x] **E.2.3** ~~Add a project-wide JSDoc/lint rule (or a comment in `MANAGED_AGENT_TOOL_DECLARATIONS`) reminding future tool authors to describe input shape explicitly and avoid wrapper-suggesting nouns.~~ Done — added a tool-authoring rule in `src/lib/managed-agents/tools/declarations.ts`.
- [x] **E.2.4** ~~Re-run a quick sanity spike on Haiku 4.5: pick the 5 most-used CRM tools, send a natural-language prompt for each, confirm none of them get the args wrapped.~~ Done after republishing Haiku as `ANTHROPIC_AGENT_VERSION_HAIKU=9`. Live UI thread `Haiku PR-E check` (`thread_id=7c2635ed-faf5-4dad-ab25-ccc8fd52c60b`, `session_id=sesn_011CaQkJnyK3HfnanbbHPaDE`) ran `get_crm_config`, `search_crm`, `update_record`, `create_task`, and `update_task` on Haiku 4.5. Persisted tool inputs were flat: `update_record` used `{ entity, updates: [{ id, fields }] }`, `create_task` used `{ title, due_date }`, and `update_task` used `{ task_id, status }`; no invented `payload`, `params`, `body`, or `request` wrapper. Screenshot: `/tmp/sunder-qa/PR-E-haiku-v9-wrapper-sanity.png`. Browser console had no red errors; only Fast Refresh logs and the existing Supabase auth warning.

### PR-E verification

- [x] **E.3** configure_crm verified working end-to-end via T02 retry under Haiku v8 (see checklist.json T02 notes).
- [ ] **E.4** Once E.2 sweep is done, re-run T01–T10 of the QA checklist on Haiku to confirm no regressions from description rewords.

---

## Definition of done (whole tasklist)

- [ ] PR-A, PR-B, PR-C, PR-D all merged or have a documented "won't fix" decision.
- [ ] T02, T03, T05, T09, T10 in `docs/qa/runs/2026-04-25-twenty-aesthetic-clone-tool-sweep/checklist.json` re-tested under Haiku 4.5 and flipped to `result: "pass"`.
- [ ] All five repro files in `/tmp/sunder-qa/issues/` deleted (or moved to `docs/qa/runs/2026-04-25-.../issues/` for archival).
- [ ] Existing unit tests still green (`pnpm test`).
- [ ] No console errors on `/crm/people`, `/tasks`, `/chat` after each fix.

## Out of scope

- The remainder of the QA tool sweep (T11–T43, page checks PG01–PG07). That continues separately on the same QA branch once these bugs are fixed.
- Any redesign of the create-record / search vocabulary (e.g. switching to a unified `Person` upsert API). YAGNI — fix the dropped fields, fix the search, ship.
- Backfilling the search index for existing patched contacts. The QA contact (`951b6e64`) can stay broken — it's a test record. New rows under the fixed trigger will Just Work.
- Adding `pg_trgm` fuzzy matching for dedup. Exact email + exact name (case-insensitive) is the floor; fuzzy can come later.
