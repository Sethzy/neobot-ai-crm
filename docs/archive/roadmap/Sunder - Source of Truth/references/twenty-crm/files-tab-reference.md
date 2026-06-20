# Twenty CRM — Files Tab Reference

> Reference analysis for cloning Twenty's Files/Attachment feature into Sunder.
> Date: 2026-04-05

---

## 1. What Twenty Builds

Every record (Person, Company, Opportunity, Task, Note) has a **Files** tab in its detail drawer. Users can:

- Upload files via button click or drag-and-drop
- View a list of attached files with filename, date, and category icon
- Rename files inline
- Download files
- Preview supported file types (images, PDFs, Office docs, CSV) in a modal
- Delete files

Each file creates an `Attachment` record in the database, linked to the target record via a polymorphic FK. Files are stored in object storage (S3-compatible) and referenced by path/URL.

---

## 2. Twenty's Architecture

### 2.1 Data Model: Attachment Entity

**File:** `packages/twenty-server/src/modules/attachment/standard-objects/attachment.workspace-entity.ts`

```
Attachment
├── id: UUID
├── name: string                    # Original filename
├── fullPath: string                # Storage path (legacy)
├── type: string                    # MIME type
├── fileCategory: AttachmentFileCategory  # Derived category
├── file: FileOutput[]              # NEW: structured file data [{fileId, label, extension, url}]
├── createdBy: ActorMetadata        # Who uploaded
├── updatedBy: ActorMetadata
├── author: WorkspaceMember         # FK
├── authorId: UUID
│
│  # Polymorphic target relations (one per object type)
├── targetPersonId: UUID
├── targetCompanyId: UUID
├── targetOpportunityId: UUID
├── targetTaskId: UUID
├── targetNoteId: UUID
├── targetDashboardId: UUID
├── targetWorkflowId: UUID
└── custom: CustomObject            # For custom objects
```

**AttachmentFileCategory enum:**
```
ARCHIVE | AUDIO | IMAGE | PRESENTATION | SPREADSHEET | TEXT_DOCUMENT | VIDEO | OTHER
```

### 2.2 File Category Mapping

**File:** `packages/twenty-front/src/modules/activities/files/utils/getFileType.ts`

| Category | Extensions |
|----------|-----------|
| TEXT_DOCUMENT | doc, docx, pdf, txt, odt, rtf |
| SPREADSHEET | xls, xlsx, csv, ods, tsv |
| PRESENTATION | ppt, pptx, odp, key |
| IMAGE | png, jpg, jpeg, svg, gif, webp, tif, bmp |
| VIDEO | mp4, avi, mov, wmv, mpg, mpeg |
| AUDIO | mp3, wav, ogg, wma |
| ARCHIVE | zip, tar, iso, gz, rar, 7z |

### 2.3 Upload Flow

```
User clicks "Add file" or drags file
  ↓
FilesCard.handleFileChange(files[])
  ↓
useUploadAttachmentFile.uploadAttachmentFile(file, targetRecord)
  ├── Step 1: Upload binary to storage
  │   └── GraphQL mutation: uploadFile → returns { path, id, url }
  ├── Step 2: Create Attachment record
  │   └── createOneAttachment({
  │         name: file.name,
  │         fileCategory: getFileType(file.name),
  │         [targetFieldId]: targetRecord.id,  // e.g. targetPersonId
  │         file: [{ fileId, label: file.name }]
  │       })
  └── Returns { attachmentAbsoluteURL, attachmentFileId }
```

### 2.4 Query/Fetch Flow

**File:** `packages/twenty-front/src/modules/activities/files/hooks/useAttachments.tsx`

```typescript
const { records: attachments } = useFindManyRecords<Attachment>({
  objectNameSingular: 'attachment',
  filter: { [targetFieldId]: { eq: targetRecord.id } },
  orderBy: [{ createdAt: 'DescNullsFirst' }],
});
```

### 2.5 Download Flow

**File:** `packages/twenty-front/src/modules/activities/files/utils/downloadFile.ts`

```typescript
// Uses file-saver library
fetch(fullPath)
  .then(resp => resp.blob())
  .then(blob => saveAs(blob, fileName));
```

### 2.6 Preview Flow

**File:** `packages/twenty-front/src/modules/activities/files/components/DocumentViewer.tsx`

- Uses `@cyntler/react-doc-viewer` for PDF/image/Office documents
- Uses `papaparse` for CSV (renders table with headers + 50 rows)
- MS Office files on private URLs fall back to download button
- Non-previewable files show "Preview Not Available" + download

**Previewable extensions:**
```
bmp, csv, odt, doc, docx, gif, htm, html, jpg, jpeg, pdf, png, ppt, pptx, tiff, txt, xls, xlsx, mp4, webp
```

---

## 3. Twenty's Frontend Components

### 3.1 Component Tree

```
FileWidget (page-layout widget wrapper)
└── FilesCard (main entry point)
    ├── [Empty State]
    │   ├── AnimatedPlaceholder (file cabinet illustration)
    │   ├── "No Files" heading
    │   ├── "There are no associated files with this record." subtitle
    │   ├── DropZone (shown when dragging)
    │   └── "+ Add file" Button
    │
    └── [With Attachments]
        ├── AttachmentList
        │   ├── Header: "All {count}" + "+ Add file" button
        │   ├── DropZone (overlay when dragging)
        │   └── List of AttachmentRow
        │       ├── Left: FileIcon + editable filename (link)
        │       └── Right: date + AttachmentDropdown (3-dot menu)
        │
        └── DocumentViewer Modal (lazy loaded)
            ├── CSV → table preview
            ├── PDF/Image/Office → react-doc-viewer
            └── Other → "Preview not available" + download
```

### 3.2 File-by-File Reference

#### FilesCard — Main entry point
**File:** `packages/twenty-front/src/modules/activities/files/components/FilesCard.tsx`

- Gets target record via `useTargetRecord()` context
- Manages `isDraggingFile` state for DropZone overlay
- Hidden `<input type="file" multiple />` triggered by button click
- Permission-gated: checks `canUpdateObjectRecords` AND `UPLOAD_FILE` flag
- Iterates files sequentially: `for (const file of files) { await onUploadFile(file); }`

#### AttachmentList — List with header
**File:** `packages/twenty-front/src/modules/activities/files/components/AttachmentList.tsx`

Props:
```typescript
{
  targetableObject: ActivityTargetableObject;
  title: string;           // "All"
  attachments: Attachment[];
  button?: ReactElement;   // "+ Add file" button
}
```

- Shows title with count: `"All {attachments.length}"`
- Maps attachments → `AttachmentRow`
- Manages preview modal state (`previewedAttachment`)
- Opens `DocumentViewer` in modal on row click
- Download button in modal header

#### AttachmentRow — Individual file row
**File:** `packages/twenty-front/src/modules/activities/files/components/AttachmentRow.tsx`

Props:
```typescript
{
  attachment: Attachment;
  onPreview?: (attachment: Attachment) => void;
}
```

Layout:
```
┌──────────────────────────────────────────────────────┐
│ [FileIcon] filename.pdf              Mar 5  [⋮]     │
└──────────────────────────────────────────────────────┘
```

- **FileIcon**: color-coded by category (uses `useFileIconColors()`)
- **Filename**: clickable link — normal click opens preview, Cmd/Ctrl+click opens in new tab
- **Inline rename**: triggered from dropdown, uses `SettingsTextInput`, preserves extension
- **Date**: formatted creation date with calendar icon
- **Dropdown**: 3-dot menu with Download / Rename / Delete

Rename saves both `name` AND `file[0].label` fields.

#### DropZone — Drag-and-drop overlay
**File:** `packages/twenty-front/src/modules/activities/files/components/DropZone.tsx`

- Uses `react-dropzone` library
- Shows only when user is dragging files over the area
- `noClick: true, noKeyboard: true, multiple: true`
- Respects `maxFileSize` from config
- Renders upload icon + "Upload files" + "Drag and Drop Here"

#### AttachmentDropdown — Context menu
**File:** `packages/twenty-front/src/modules/activities/files/components/AttachmentDropdown.tsx`

Props:
```typescript
{
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  attachmentId: string;
  hasDownloadPermission: boolean;
}
```

Three menu items: Download (if permitted), Rename, Delete (danger style).

#### DocumentViewer — Preview modal
**File:** `packages/twenty-front/src/modules/activities/files/components/DocumentViewer.tsx`

- Lazy-loaded inside preview modal
- CSV: parses with PapaParse (50 rows preview), renders `<table>`
- Previewable files: uses `@cyntler/react-doc-viewer` with `DocViewerRenderers`
- MS Office on private URLs: falls back to download
- Non-previewable: "Preview Not Available" message + download button

### 3.3 External Dependencies

| Package | Purpose | npm |
|---------|---------|-----|
| `react-dropzone` | Drag-and-drop file input | `react-dropzone` |
| `file-saver` | Download via `saveAs()` | `file-saver` |
| `@cyntler/react-doc-viewer` | PDF/Office/image preview | `@cyntler/react-doc-viewer` |
| `papaparse` | CSV parsing for preview | `papaparse` |

---

## 4. Where We Drift (and Why)

### 4.1 Polymorphic FK → record_type + record_id

**Twenty:** Separate nullable FK columns per target type (`targetPersonId`, `targetCompanyId`, etc.). This comes from their generic GraphQL workspace entity system.

**Sunder:** Use `record_type TEXT + record_id UUID` pattern — same as our `record_notes` table. Simpler, extensible without schema changes, matches our existing conventions.

**Reason:** We don't have Twenty's workspace entity framework. Adding N nullable FK columns for N object types creates schema bloat. The `record_type + record_id` pattern is standard, already proven in our codebase, and avoids needing a migration every time we add a new object type.

### 4.2 Apollo/GraphQL → Supabase Client + TanStack Query

**Twenty:** `useFindManyRecords()`, `createOneRecord()`, `destroyOneRecord()` via Apollo GraphQL.

**Sunder:** Direct Supabase client calls wrapped in TanStack Query hooks. Follow the pattern from `use-record-notes.ts` / `use-crm-tasks.ts`.

**Reason:** We don't use GraphQL. Zero drift in behavior — only the data access layer changes.

### 4.3 @linaria styled-components → Tailwind + ShadCN

**Twenty:** Styled components with `@linaria/react`, theme constants.

**Sunder:** Tailwind CSS classes + ShadCN components + Flexoki semantic tokens. Map Twenty's visual design to our design system tokens.

**Reason:** Different styling stack. Visual output should match Twenty closely; implementation uses our existing system.

### 4.4 Feature flag migration paths → Clean implementation

**Twenty:** Has `IS_ATTACHMENT_MIGRATED` and `IS_FILES_FIELD_MIGRATED` flags with dual code paths everywhere. Every component has `if (isMigrated) { ... } else { ... }` branching.

**Sunder:** Build the clean version directly. No legacy paths, no migration flags. Use the "new" data model from day one.

**Reason:** We're building fresh, not migrating an existing attachment system. The migration code in Twenty is technical debt — we skip it entirely.

### 4.5 Supabase Storage → Supabase Storage (same!)

**Twenty:** Uploads via GraphQL mutation → S3-compatible storage.

**Sunder:** Uploads via API route → Supabase Storage (`agent-files` bucket). We already have `src/lib/storage/agent-files.ts` with `uploadArtifact()`, signed URL generation, and client-scoped paths.

**Reason:** No drift needed — we already have the storage layer. CRM attachments get a new path prefix: `{clientId}/attachments/{record_type}/{record_id}/{timestamp}-{filename}`.

### 4.6 Permissions → RLS (simpler)

**Twenty:** Granular permission flags (`UPLOAD_FILE`, `DOWNLOAD_FILE`) + object-level `canUpdateObjectRecords`.

**Sunder:** RLS policies on the `record_attachments` table (same 4-policy pattern: select/insert/update/delete by `client_id`). All authenticated users within a client can upload/download.

**Reason:** Sunder is for solo practitioners, not teams with role-based permissions. RLS tenant isolation is sufficient.

### 4.7 @lingui i18n → Hardcoded English

**Twenty:** All strings wrapped in `t` macro from `@lingui/react`.

**Sunder:** Plain English strings. We don't have i18n.

**Reason:** No i18n layer in our app.

### 4.8 Document preview — Defer

**Twenty:** Full `DocumentViewer` with `@cyntler/react-doc-viewer` + PapaParse CSV tables.

**Sunder:** Start with download-only. Add preview as a follow-up if needed.

**Reason:** `react-doc-viewer` adds bundle weight and complexity. Download covers the core use case. Preview is polish we can add later without any data model changes. The agent already handles file viewing in chat.

---

## 5. Sunder Implementation Mapping

### 5.1 Data Model

```sql
CREATE TABLE public.record_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('contact', 'company', 'deal')),
  record_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- Supabase Storage path (relative to bucket)
  content_type TEXT NOT NULL,          -- MIME type
  file_size INTEGER NOT NULL,          -- bytes
  file_category TEXT NOT NULL DEFAULT 'OTHER',  -- matches Twenty's categories
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_record_attachments_lookup
  ON public.record_attachments(client_id, record_type, record_id);

-- RLS (standard 4-policy pattern)
-- Trigger: update_updated_at_column()
```

### 5.2 Storage Path Convention

```
agent-files/{clientId}/attachments/{record_type}/{record_id}/{timestamp}-{uuid}-{filename}
```

Example: `agent-files/abc123/attachments/contact/c-1/1712300000-9f8e-proposal.pdf`

### 5.3 Files to Create / Modify

| File | Action | Maps to Twenty |
|------|--------|----------------|
| `supabase/migrations/YYYYMMDD_create_record_attachments.sql` | New | Attachment workspace entity |
| `src/types/database.ts` | Regenerate | — |
| `src/lib/crm/schemas.ts` | Add `recordAttachmentSchema` | Attachment type |
| `src/lib/crm/file-categories.ts` | New — file category mapping | `getFileType.ts` |
| `src/hooks/use-record-attachments.ts` | New — fetch + CRUD hooks | `useAttachments.tsx`, `useUploadAttachmentFile.tsx` |
| `app/api/crm/attachments/upload/route.ts` | New — upload endpoint | Twenty's upload mutation |
| `src/components/crm/record-drawer/drawer-files-tab.tsx` | New — main Files tab component | `FilesCard.tsx` + `AttachmentList.tsx` |
| `src/components/crm/record-drawer/attachment-row.tsx` | New — individual file row | `AttachmentRow.tsx` |
| `src/components/crm/record-drawer/attachment-drop-zone.tsx` | New — drag-drop overlay | `DropZone.tsx` |
| `src/components/crm/record-drawer/contact-drawer-content.tsx` | Add "files" tab | — |
| `src/components/crm/record-drawer/company-drawer-content.tsx` | Add "files" tab | — |
| `src/components/crm/record-drawer/deal-drawer-content.tsx` | Add "files" tab | — |

### 5.4 Component Mapping (Twenty → Sunder)

| Twenty Component | Sunder Component | Key Differences |
|-----------------|------------------|-----------------|
| `FilesCard` | `DrawerFilesTab` | Uses TanStack Query, not Apollo. Props: `recordType, recordId` |
| `AttachmentList` | Inline in `DrawerFilesTab` | Simpler — no separate component needed for our scale |
| `AttachmentRow` | `AttachmentRow` | ShadCN + Tailwind styling. No migration branching |
| `DropZone` | `AttachmentDropZone` | Same `react-dropzone` usage |
| `AttachmentDropdown` | ShadCN `DropdownMenu` | Use existing ShadCN dropdown, not custom |
| `DocumentViewer` | Deferred | Start without preview. Download-only |
| `FileWidget` | Not needed | We render directly in drawer tabs, not via widget system |
| `useAttachments` | `useRecordAttachments` | Supabase query + TanStack Query |
| `useUploadAttachmentFile` | `useUploadAttachment` | Supabase Storage upload |
| `getFileType` | `getFileCategory` | Copy the mapping exactly |
| `downloadFile` | `downloadAttachment` | Use `file-saver` (same as Twenty) |

### 5.5 Hook Signatures

```typescript
// src/hooks/use-record-attachments.ts

// Query key factory
export const recordAttachmentKeys = { ... };

// Fetch all attachments for a record
export function useRecordAttachments(recordType: string, recordId: string) → {
  data: RecordAttachment[];
  isLoading: boolean;
}

// Upload a file and create attachment record
export function useUploadAttachment() → {
  uploadAttachment: (file: File, recordType: string, recordId: string) => Promise<RecordAttachment>;
  isUploading: boolean;
}

// Rename an attachment
export function useUpdateAttachment(attachmentId: string) → {
  mutateAsync: (update: { filename: string }) => Promise<void>;
}

// Delete an attachment (removes storage file + DB record)
export function useDeleteAttachment() → {
  deleteAttachment: (attachmentId: string, storagePath: string) => Promise<void>;
}
```

### 5.6 Upload API Route

```typescript
// app/api/crm/attachments/upload/route.ts
// POST — multipart form data
// Body: file (File), record_type (string), record_id (string)
// Returns: { attachment: RecordAttachment, url: string }
//
// Flow:
// 1. Authenticate + resolve clientId
// 2. Validate file (type, size ≤ 10MB) — reuse attachment-config.ts
// 3. Upload to Supabase Storage: agent-files/{clientId}/attachments/{type}/{id}/{ts}-{uuid}-{name}
// 4. Insert record_attachments row
// 5. Return attachment record + signed URL
```

### 5.7 Tab Integration

Add `"files"` tab to all 3 drawer content components:

```typescript
// Tab definition (same pattern as notes)
{ id: "files", label: "Files", icon: <Paperclip className="h-4 w-4" /> }

// Tab content
{activeTab === "files" ? (
  <DrawerFilesTab recordType="contact" recordId={contactId} />
) : null}
```

### 5.8 DrawerFilesTab Layout (matching Twenty)

```
[Empty State]
┌─────────────────────────────────────┐
│                                     │
│         (file cabinet icon)         │
│                                     │
│           No Files                  │
│  There are no associated files      │
│     with this record.               │
│                                     │
│         [+ Add file]                │
│                                     │
└─────────────────────────────────────┘

[With Attachments]
All 3                      [+ Add file]
─────────────────────────────────────
┌─────────────────────────────────────┐
│ [PDF] proposal.pdf     Mar 5   [⋮] │
├─────────────────────────────────────┤
│ [IMG] photo.jpg        Mar 3   [⋮] │
├─────────────────────────────────────┤
│ [XLS] budget.xlsx      Feb 28  [⋮] │
└─────────────────────────────────────┘

[⋮] Menu: Download | Rename | Delete

[Drag State]
┌─────────────────────────────────────┐
│          ⬆ Upload files             │
│        Drag and Drop Here           │
└─────────────────────────────────────┘
```

---

## 6. Dependencies to Add

| Package | Purpose | Already in project? |
|---------|---------|-------------------|
| `react-dropzone` | Drag-and-drop file input | Check `package.json` |
| `file-saver` | Download via `saveAs()` | Check `package.json` |
| `@types/file-saver` | TypeScript types | — |

**Not needed (deferred):**
- `@cyntler/react-doc-viewer` — preview deferred
- `papaparse` — CSV preview deferred

---

## 7. File Category Icon Mapping

Copy Twenty's mapping for `FileIcon`. Map to Lucide icons (already in our project):

| Category | Lucide Icon | Color (Flexoki token) |
|----------|------------|----------------------|
| TEXT_DOCUMENT | `FileText` | `text-filetype-doc` |
| SPREADSHEET | `FileSpreadsheet` | `text-filetype-xls` |
| PRESENTATION | `Presentation` | `text-filetype-ppt` |
| IMAGE | `FileImage` | `text-filetype-img` |
| VIDEO | `FileVideo` | `text-filetype-vid` |
| AUDIO | `FileAudio` | `text-filetype-aud` |
| ARCHIVE | `FileArchive` | `text-filetype-zip` |
| OTHER | `File` | `text-muted-foreground` |
| PDF | `FileText` | `text-filetype-pdf` |

---

## 8. What We Copy Exactly (Zero Drift)

These pieces should be identical to Twenty:

1. **File category mapping** (`getFileType` → `getFileCategory`) — same extension → category mapping
2. **Previewable extensions list** — same set
3. **Download mechanism** — `fetch → blob → saveAs` via `file-saver`
4. **DropZone behavior** — `react-dropzone` with `noClick, noKeyboard, multiple`
5. **AttachmentRow layout** — icon + filename link + date + 3-dot menu
6. **Dropdown menu items** — Download, Rename, Delete (danger)
7. **Inline rename** — edit filename, preserve extension, save on blur/enter
8. **Empty state** — illustration + "No Files" + subtitle + "+ Add file" button
9. **List header** — "All {count}" left + "+ Add file" right
10. **Upload flow** — sequential per-file upload (not parallel)

---

## 9. Summary of Drift

| Area | Twenty | Sunder | Reason |
|------|--------|--------|--------|
| Target linking | Polymorphic FK columns | `record_type + record_id` | Matches our convention, simpler |
| Data access | Apollo/GraphQL | Supabase + TanStack Query | Our stack |
| Styling | @linaria styled-components | Tailwind + ShadCN | Our stack |
| Migration flags | 2 feature flags, dual paths | Clean single path | Building fresh |
| Permissions | Granular flags | RLS only | Solo practitioner product |
| i18n | @lingui | Hardcoded English | No i18n layer |
| Document preview | Full DocumentViewer | Deferred (download-only) | Bundle weight, low priority |
| Widget system | FileWidget in PageLayout | Direct tab render | No widget framework |
