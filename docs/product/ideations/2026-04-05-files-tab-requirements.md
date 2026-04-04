---
date: 2026-04-05
topic: files-tab
---

# Files Tab on CRM Record Drawers

## Problem Frame

Advisory sales practitioners deal with documents constantly — property brochures, contracts, valuations, policy documents, portfolio statements. Today, Sunder has no way to attach files to CRM records. Users can share files in chat, but those attachments live on the conversation thread, not on the contact/company/deal they relate to. When a user opens a deal drawer, they should see the relevant documents right there.

Twenty CRM ships a Files tab with upload, download, rename, delete, drag-and-drop, and preview. We want to clone this closely.

## Requirements

- R1. **Files tab on record drawers** — Contact, Company, and Deal drawers each get a "Files" tab (with Paperclip icon) in the tab bar. Clicking it shows all files attached to that record.

- R2. **File upload via button** — "+ Add file" button opens a native file picker. V1 accepted types match our existing `attachment-config.ts` exactly: images (JPEG, PNG, WebP), PDF, Office docs (DOC/DOCX, PPT/PPTX, XLS/XLSX), CSV, and text formats (TXT, MD, HTML, XML, JSON). No archive/audio/video in V1. Max size: 10 MB per file. Multiple file selection supported; uploads run sequentially.

- R3. **File upload via drag-and-drop** — Dragging files over the Files tab content area shows a drop zone overlay ("Upload files / Drag and Drop Here"). Dropping uploads the files. Uses `react-dropzone`.

- R4. **Attachment list** — Shows all attached files ordered by `created_at DESC` (newest first). Each row displays: file category icon (color-coded), filename (clickable), creation date, and a 3-dot context menu.

- R5. **File category icons** — V1 supports the categories we already have tokens for: PDF, Document (doc/docx), Spreadsheet (xls/xlsx/csv), Presentation (ppt/pptx), and Image (jpg/png/webp). All other extensions render as "Other" with `text-muted-foreground`. Add image token (`text-filetype-image`) to `color-maps.ts`. Archive/audio/video tokens are deferred — added when we expand accepted upload types.

- R6. **Download** — Context menu "Download" item fetches the file and saves via `file-saver` (`saveAs`). Also triggered by clicking the filename. The existing `/api/files/download` route must be extended to allow the `attachments/` path prefix (currently restricted to `uploads/` and `home/`). Use Supabase `createSignedUrl` with the `download` option set to the DB `filename` so renamed files download under their display name, not the storage key.

- R7. **Rename** — Context menu "Rename" item enables inline filename editing. Extension is preserved automatically. Save on blur/Enter. **Metadata-only**: updates the `filename` column in `record_attachments` — does NOT move or rename the storage object. The storage path uses a UUID key, making it filename-agnostic. Downloads use the DB `filename` via signed URL `download` option (see R6).

- R8. **Delete** — Context menu "Delete" item (danger style) removes both the Supabase Storage file and the database record. No confirmation modal — matches Twenty's behavior.

- R9. **Empty state** — When no files are attached, show a centered empty state with icon, "No Files" heading, "There are no associated files with this record." subtitle, and "+ Add file" button. Match Twenty's layout.

- R10. **Storage convention** — Files stored in Supabase Storage bucket `agent-files` at path: `{clientId}/attachments/{record_type}/{record_id}/{uuid}`. The key is filename-agnostic (UUID only) so renames are metadata-only. Original filename stored in the DB `filename` column. Reuse existing `agent-files.ts` utilities for upload and signed URL generation.

- R11. **Database table** — New `record_attachments` table with: `attachment_id` (UUID PK), `client_id` (FK), `record_type` (contact/company/deal), `record_id` (UUID), `filename`, `storage_path`, `content_type` (MIME), `file_size` (bytes), `file_category`, timestamps. RLS with standard 4-policy pattern. Index on `(client_id, record_type, record_id)`.

- R12. **Upload API route** — `POST /api/crm/attachments/upload` accepts multipart form data (file + record_type + record_id). Authenticates, validates file type/size, uploads to storage, inserts DB record, returns attachment + signed URL.

- R13. **Realtime updates** — Attachment list refreshes via Supabase realtime subscription on the `record_attachments` table, same pattern as `use-record-notes.ts`.

## Success Criteria

- User can upload a file to a contact/company/deal via button or drag-and-drop, see it appear in the list, download it, rename it, and delete it
- Files persist across sessions and are scoped to the correct record
- Multiple files per record, ordered newest-first
- Visual design closely matches Twenty's Files tab (empty state, list layout, row layout, drop zone)

## Scope Boundaries

- **No document preview** — Download-only for V1. Preview (PDF viewer, image lightbox, CSV table) is a follow-up. The reference doc catalogs Twenty's preview stack for when we add it.
- **No agent tool integration** — Agent can't attach files to records yet. This is additive and ships separately (similar to how multi-note agent tools are a stretch goal).
- **No task drawer** — Tasks don't get a Files tab. Only contact, company, deal.
- **No file size/count limits beyond 10 MB per file** — No per-record storage quota.

## Key Decisions

- **`record_type + record_id` over polymorphic FKs**: Twenty uses separate nullable FK columns per target type. We use the same `record_type + record_id` pattern as `record_notes`. Simpler, extensible, matches our convention.
- **Defer preview to follow-up**: `@cyntler/react-doc-viewer` adds bundle weight. Download covers the core need. The storage model supports preview without changes — it's purely a frontend addition later.
- **Reuse existing storage infra**: Our `agent-files` bucket and `agent-files.ts` utilities already handle uploads, signed URLs, and client-scoped paths. New prefix, same plumbing. Extend `/api/files/download` route to allow `attachments/` prefix.
- **Sequential upload (not parallel)**: Matches Twenty's behavior. Avoids race conditions and provides clearer UX feedback.
- **Rename is metadata-only**: Storage key uses UUID, not filename. Rename only updates the DB `filename` column. Signed URLs use the `download` option to serve the correct display name. No storage move required.
- **V1 file types = current `attachment-config.ts` set**: No archive/audio/video. File category icons cover PDF, Document, Spreadsheet, Presentation, Image, and Other. Add `text-filetype-image` token to `color-maps.ts`; skip tokens for categories we don't accept yet.

## Dependencies / Assumptions

- `react-dropzone` and `file-saver` packages need to be added (check if already present)
- Existing `attachment-config.ts` can be reused for file type validation
- `agent-files.ts` `uploadArtifact()` can handle CRM attachment uploads (may need a thin wrapper for the new path convention)

## Outstanding Questions

### Deferred to Planning

- [Affects R10][Needs research] Verify that `uploadArtifact()` in `agent-files.ts` can be called from an API route with the right Supabase client context, or if we need a new upload helper.
- [Affects R12][Technical] Decide whether the upload route should return a signed URL for immediate display or if the list component should generate its own signed URLs on fetch.

## Reference

Full implementation analysis with file-by-file mapping, component tree, data flows, and drift documentation:

**`roadmap docs/Sunder - Source of Truth/references/twenty-crm/files-tab-reference.md`**

## Next Steps

`/plan` for structured implementation planning
