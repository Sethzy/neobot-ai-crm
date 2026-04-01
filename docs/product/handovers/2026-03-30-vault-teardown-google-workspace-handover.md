# Handover: Vault Teardown + Google Workspace + Connection Cards — Review Before Tasklist

**Date:** 2026-03-30
**From:** Design session (brainstorming → Composio research → design docs)
**To:** Next dev session
**Goal:** Review both design docs for consistency and completeness, then generate tasklists for execution.

---

## What Was Done

A brainstorming session explored how to fix the Knowledge Base (vault) feature gaps — PDF upload, text extraction, search limits, etc. The conclusion: **don't fix it, replace it.** Users already have Google Drive. Composio already provides the tools. Kill the vault, connect Google workspace, widen chat uploads.

### Artifact 1: Vault Teardown Design (PR A)
**Path:** `docs/plans/2026-03-30-vault-teardown-google-drive-design.md`

Pure deletion checklist. Covers:
- What to delete (table with 18 items: files, tools, routes, tests, sidebar link, system prompt refs)
- What to keep (memory system, subagents, skills, toolcalls — all stay)
- Drop migration for `vault_files` table
- Verification checklist

### Artifact 2: Google Workspace + Uploads + Connection Cards Design (PR B)
**Path:** `docs/plans/2026-03-30-connection-ui-cards-design.md`

All the build work, three sections:
1. **Google workspace** — no custom code. Composio provides `googledrive` (20 tools), `googledocs` (20 tools), `googlesheets` (20 tools) out of the box. Uses existing connections infrastructure from PRs 27-28.
2. **Chat upload expansion** — widen accept filter (add PDF, DOCX, PPTX, plain text, WebP), bump size to 10MB, add multi-file select. Four files to change.
3. **Connection cards** — three inline card components (ConnectionCard, ConnectionModal, PermissionCard) replacing generic tool approval pills for OAuth flows. Co-located with `tool-call-inline.tsx`.

---

## Key Decisions Made During Session

| Decision | Choice | Why |
|---|---|---|
| Fix vault vs. replace with Google Drive | Replace | Building vault to Drive parity = months. Composio gives us Drive for free. |
| Vault table — keep or drop | Drop | With vault dead and Google Drive as doc store, `vault_files` serves no purpose. `runPathAwareSync` and `search_knowledge` become dead code. |
| Narrow `read_file`/`write_file` to memory-only | **No** — keep general-purpose | They still serve subagents, skills, toolcalls, and memory. Just strip vault-specific plumbing. |
| Expose sandbox `readFile`/`writeFile` | No | `bash` is sufficient. Two file tool sets confuse the model. Design doc v2 already decided this. |
| Composio vs. hand-rolled Google APIs | Composio out of the box | Composio handles OAuth, token refresh, API execution. Hand-rolling = rebuilding auth. |
| Override Composio schemas with Tasklet definitions | No — use as-is | Composio has 60 tools across 3 Google toolkits. Good enough. Tasklet's descriptions are better but not worth the maintenance. |
| `googlesuper` (unified) vs. separate toolkits | Separate | Users add incrementally. Tighter OAuth scopes. Can consolidate later. |
| Chat upload — which file types | PDF, DOCX, DOC, PPTX, PPT, WebP + existing types | PDFs are Gemini-native. Binary Office formats go to sandbox via existing `buildPreloadFiles()`. |
| HEIC support | Deferred | Not common enough to build for now. |
| Multi-file upload | Yes | Small effort (add `multiple` attr, loop uploads). Clear UX win. |
| Connection cards approach | Tool-specific rendering in ToolCallInline | Same pattern as existing `isPdfDownload` and `isBrowserNeedsAuth`. |
| Drive approval model | Read-only auto-runs, writes need approval | Matches existing two-tier safety model. |

---

## Review Status

**Reviewed on 2026-03-30.** Five items checked, two blocking bugs found, both now addressed in the design docs.

### #1. Vault teardown completeness — UPDATED
- Original checklist missed `vault_files` in `get_client_accessible_schema()` SQL function (`supabase/migrations/20260305030001_create_sql_helper_functions.sql:43`)
- More vault-specific tests exist than originally listed
- **Fix applied:** PR A design doc updated with missed items + instruction to grep before writing tasklist

### #2. `read_file`/`write_file` after vault removal — OK
- Still needs verification at tasklist time, but no issues found in review

### #3. Chat upload — model behavior with new types — BLOCKING, FIXED
- **Confirmed:** Gemini rejects DOCX, PPTX, XLSX, XLS, DOC with `unsupported-media` hard errors. PDF succeeds.
- The current runner (`run-agent.ts`) blindly forwards all file parts to the model. Widening uploads without a filter **will crash chat**.
- **Fix applied:** PR B design doc now includes a `MODEL_VISIBLE_TYPES` allowlist (Section 4) and lists it as a prerequisite fix (Section 8). Only `image/jpeg`, `image/png`, `image/webp`, `application/pdf` go to the model. Everything else is sandbox-only with a text part telling the agent where to find it.

### #4. Connection cards — tool result shape — UPDATED
- `composioConnectedAccountId` is available at creation time — confirmed
- `account_identifier` is populated during callback — confirmed
- **But:** Raw tool metadata gives lowercase names ("googledrive") with no description. Must use `composio.toolkits.get(slug)` for proper display names.
- **But:** `src/hooks/use-realtime.ts` doesn't support `connections` table. Card needs either hook expansion or direct channel subscription.
- **Fix applied:** PR B design doc updated with metadata source correction and realtime note.

### #5. Composio Google workspace — BLOCKING, FIXED
- **Confirmed:** Tool counts are 89/35/48, not 20/20/20. Our `getRawComposioTools()` calls default to `limit: 20`, truncating results.
- This affects ALL connections, not just Google — tool counts, activation validation, and capability discovery are already incomplete today.
- Four call sites affected: `catalog.ts:35`, `manage-tools.ts:63`, `get-connection-details.ts:47`, `callback/route.ts:188`
- **Fix applied:** PR B design doc now lists this as prerequisite fix #1 (Section 8).
- **Remaining:** Manual end-to-end Google OAuth test still needed before building cards.

## What Still Needs Doing Before Tasklist

---

## Execution Order

**PR A first, PR B second.** PR A is pure deletion — low risk, cleans up before new work. PR B depends on PR A only for system prompt cleanup (removing vault refs before adding Google workspace refs).

### PR A: Vault Teardown
- Estimated size: Small (deletion only)
- Risk: Low (removing unused feature)
- Key step: Run full test suite after deletion to catch missed references

### PR B: Google Workspace + Uploads + Cards
- Estimated size: Medium (3 component builds + 4 file changes + 2 tool enrichments)
- Risk: Medium (connection cards are new UI pattern, upload expansion is low-risk)
- Key step: Test Google Drive OAuth end-to-end before building cards

---

## Reference Material

- Composio Google Drive tools (20): `curl -H "x-api-key: $COMPOSIO_API_KEY" "https://backend.composio.dev/api/v3/tools?toolkit_slug=googledrive"`
- Composio Google Docs tools (20): same URL with `toolkit_slug=googledocs`
- Composio Google Sheets tools (20): same URL with `toolkit_slug=googlesheets`
- Tasklet Google Drive reference: `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/google-drive/google-drive-tools.md` (the hand-crafted definitions we decided NOT to use)
- Existing connections code: `src/lib/runner/tools/connections/`, `src/lib/composio/`
- Existing upload flow: `app/api/files/upload/route.ts`, `src/components/chat/chat-composer.tsx`
- Existing tool approval UI: `src/components/chat/tool-call-inline.tsx`
