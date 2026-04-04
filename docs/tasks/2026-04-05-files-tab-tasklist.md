# Files Tab Implementation Plan

**Goal:** Add a Files tab to CRM record drawers (contact, company, deal) that lets users upload, download, rename, and delete file attachments on any record — cloning Twenty CRM's Files tab.

**Architecture:** New `record_attachments` Postgres table with `record_type + record_id` pattern (same as `record_notes`). Files stored in the existing `agent-files` Supabase Storage bucket under `{clientId}/attachments/{record_type}/{record_id}/{uuid}`. Upload via new API route. TanStack Query hooks for CRUD. Frontend components follow the drawer-notes-tab pattern.

**Tech Stack:** Supabase (Postgres + Storage + RLS + Realtime), TanStack Query, React, Tailwind + ShadCN, Zod, `react-dropzone`, `file-saver`.

## Bite-Sized Step Granularity

**Each Step is one action (2-5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install react-dropzone and file-saver**

```bash
pnpm add react-dropzone file-saver
pnpm add -D @types/file-saver
```

**Step 2: Verify installation**

```bash
pnpm ls react-dropzone file-saver
```

Expected: Both packages listed with versions.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-dropzone and file-saver dependencies"
```

---

## Task 2: Database migration — `record_attachments` table

**Files:**
- Create: `supabase/migrations/20260405100000_create_record_attachments.sql`

**Step 1: Write the migration file**

```sql
-- Record-level file attachments for contacts, companies, and deals.
CREATE TABLE public.record_attachments (
  attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('contact', 'company', 'deal')),
  record_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_category TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by parent record.
CREATE INDEX idx_record_attachments_lookup
  ON public.record_attachments(client_id, record_type, record_id);

-- Auto-update timestamp.
CREATE TRIGGER update_record_attachments_updated_at
  BEFORE UPDATE ON public.record_attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row-level security (standard 4-policy pattern).
ALTER TABLE public.record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_attachments_select_own
  ON public.record_attachments FOR SELECT
  USING (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_insert_own
  ON public.record_attachments FOR INSERT
  WITH CHECK (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_update_own
  ON public.record_attachments FOR UPDATE
  USING (client_id = public.get_my_client_id());

CREATE POLICY record_attachments_delete_own
  ON public.record_attachments FOR DELETE
  USING (client_id = public.get_my_client_id());
```

**Step 2: Apply the migration locally**

```bash
supabase db reset
```

Expected: Migration applies without errors.

**Step 3: Regenerate database types**

```bash
supabase gen types typescript --local > src/types/database.ts
```

Expected: `record_attachments` table appears in `src/types/database.ts` with correct columns.

**Step 4: Commit**

```bash
git add supabase/migrations/20260405100000_create_record_attachments.sql src/types/database.ts
git commit -m "feat: add record_attachments table with RLS"
```

---

## Task 3: Zod schema + file category utility

**Files:**
- Modify: `src/lib/crm/schemas.ts`
- Create: `src/lib/crm/file-categories.ts`
- Create: `src/lib/crm/file-categories.test.ts`

**Step 1: Write the failing test for `getFileCategory`**

Create `src/lib/crm/file-categories.test.ts`:

```typescript
/**
 * Tests file extension → category mapping.
 * @module lib/crm/file-categories.test
 */
import { describe, expect, it } from "vitest";

import { getFileCategory } from "./file-categories";

describe("getFileCategory", () => {
  it("returns 'pdf' for .pdf files", () => {
    expect(getFileCategory("report.pdf")).toBe("pdf");
  });

  it("returns 'document' for .docx files", () => {
    expect(getFileCategory("proposal.docx")).toBe("document");
  });

  it("returns 'document' for .doc files", () => {
    expect(getFileCategory("old-file.doc")).toBe("document");
  });

  it("returns 'spreadsheet' for .xlsx files", () => {
    expect(getFileCategory("budget.xlsx")).toBe("spreadsheet");
  });

  it("returns 'spreadsheet' for .csv files", () => {
    expect(getFileCategory("data.csv")).toBe("spreadsheet");
  });

  it("returns 'presentation' for .pptx files", () => {
    expect(getFileCategory("deck.pptx")).toBe("presentation");
  });

  it("returns 'image' for .jpg files", () => {
    expect(getFileCategory("photo.jpg")).toBe("image");
  });

  it("returns 'image' for .png files", () => {
    expect(getFileCategory("screenshot.png")).toBe("image");
  });

  it("returns 'image' for .webp files", () => {
    expect(getFileCategory("hero.webp")).toBe("image");
  });

  it("returns 'other' for unknown extensions", () => {
    expect(getFileCategory("archive.zip")).toBe("other");
  });

  it("returns 'other' for files without extensions", () => {
    expect(getFileCategory("README")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(getFileCategory("REPORT.PDF")).toBe("pdf");
    expect(getFileCategory("image.JPG")).toBe("image");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/crm/file-categories.test.ts
```

Expected: FAIL — `Cannot find module './file-categories'`

**Step 3: Write minimal implementation**

Create `src/lib/crm/file-categories.ts`:

```typescript
/**
 * Maps file extensions to display categories for CRM attachments.
 * Categories match the V1 set from our design system tokens.
 * @module lib/crm/file-categories
 */

/** V1 file categories — matches our existing Flexoki filetype tokens. */
export type FileCategory =
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "other";

const EXTENSION_TO_CATEGORY: Record<string, FileCategory> = {
  // PDF
  pdf: "pdf",
  // Documents
  doc: "document",
  docx: "document",
  txt: "document",
  md: "document",
  rtf: "document",
  odt: "document",
  // Spreadsheets
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ods: "spreadsheet",
  tsv: "spreadsheet",
  // Presentations
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  key: "presentation",
  // Images
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
};

/**
 * Returns the display category for a filename based on its extension.
 * Falls back to "other" for unknown or missing extensions.
 */
export function getFileCategory(filename: string): FileCategory {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension) return "other";
  return EXTENSION_TO_CATEGORY[extension] ?? "other";
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/crm/file-categories.test.ts
```

Expected: PASS — all 12 tests green.

**Step 5: Add Zod schema to schemas.ts**

Modify `src/lib/crm/schemas.ts`. After the `recordNoteSchema` block (~line 230), add:

```typescript
/** Supported CRM record types that can own file attachments. */
export const recordAttachmentTypeValues = ["contact", "company", "deal"] as const;

/** File category values for CRM attachments. */
export const fileCategoryValues = ["pdf", "document", "spreadsheet", "presentation", "image", "other"] as const;

/** Full `record_attachments` row validator. */
export const recordAttachmentSchema = z.object({
  attachment_id: z.string().uuid(),
  client_id: z.string().uuid(),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
  filename: z.string(),
  storage_path: z.string(),
  content_type: z.string(),
  file_size: z.number().int(),
  file_category: z.enum(fileCategoryValues),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type RecordAttachment = z.infer<typeof recordAttachmentSchema>;
```

**Step 6: Add image token to color-maps.ts**

Modify `src/lib/ui/color-maps.ts`. Add entries to `FILETYPE_COLOR_CLASSES` and `FILETYPE_ICON_CLASSES`:

In `FILETYPE_COLOR_CLASSES` add:

```typescript
  jpg:  "text-filetype-image",
  jpeg: "text-filetype-image",
  png:  "text-filetype-image",
  webp: "text-filetype-image",
  gif:  "text-filetype-image",
  svg:  "text-filetype-image",
  bmp:  "text-filetype-image",
  tif:  "text-filetype-image",
  tiff: "text-filetype-image",
```

In `FILETYPE_ICON_CLASSES` add:

```typescript
  Image: "bg-filetype-image/10 text-filetype-image",
```

> **Note for implementer:** Verify that `text-filetype-image` is defined in your Tailwind/Flexoki theme. If not, add it to the CSS variables in `app/globals.css` using the same pattern as `text-filetype-pdf`. Use a suitable Flexoki accent color (e.g., cyan or blue).

**Step 7: Commit**

```bash
git add src/lib/crm/file-categories.ts src/lib/crm/file-categories.test.ts src/lib/crm/schemas.ts src/lib/ui/color-maps.ts
git commit -m "feat: add file category utility, RecordAttachment schema, and image filetype token"
```

---

## Task 4: Upload API route

**Files:**
- Create: `app/api/crm/attachments/upload/route.ts`
- Modify: `app/api/files/download/route.ts` (extend allowed paths)

**Step 1: Write the upload API route**

Create `app/api/crm/attachments/upload/route.ts`:

```typescript
/**
 * Uploads a file attachment to a CRM record.
 * Stores the binary in Supabase Storage, creates a record_attachments row,
 * and returns the attachment metadata with a signed download URL.
 * @module app/api/crm/attachments/upload/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";
import { getFileCategory } from "@/lib/crm/file-categories";

const BUCKET_ID = "agent-files";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    typeof value.size === "number" &&
    "type" in value &&
    typeof value.type === "string" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

const uploadSchema = z.object({
  file: z
    .custom<Blob>(isBlobLike, { message: "Invalid file" })
    .refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, {
      message: "File size must be under 10 MB",
    })
    .refine((file) => ALLOWED_UPLOAD_TYPES.has(file.type), {
      message: "File type not supported",
    }),
  record_type: z.enum(["contact", "company", "deal"]),
  record_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const recordType = formData.get("record_type");
    const recordId = formData.get("record_id");

    if (fileEntry === null || typeof fileEntry === "string") {
      return jsonError("No file uploaded", 400);
    }

    const validated = uploadSchema.safeParse({
      file: fileEntry,
      record_type: recordType,
      record_id: recordId,
    });

    if (!validated.success) {
      return jsonError(
        validated.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }

    const clientId = await resolveClientId(supabase, userId);
    const filename = (fileEntry as File).name || "upload";
    const fileCategory = getFileCategory(filename);
    const storageKey = crypto.randomUUID();
    const storagePath = `${clientId}/attachments/${validated.data.record_type}/${validated.data.record_id}/${storageKey}`;

    // Step 1: Upload binary to storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ID)
      .upload(storagePath, await fileEntry.arrayBuffer(), {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      return jsonError("Upload failed", 500);
    }

    // Step 2: Create attachment record
    const { data: attachment, error: insertError } = await supabase
      .from("record_attachments")
      .insert({
        client_id: clientId,
        record_type: validated.data.record_type,
        record_id: validated.data.record_id,
        filename,
        storage_path: storagePath,
        content_type: fileEntry.type,
        file_size: fileEntry.size,
        file_category: fileCategory,
      })
      .select()
      .single();

    if (insertError || !attachment) {
      // Clean up orphaned storage file
      await supabase.storage.from(BUCKET_ID).remove([storagePath]);
      return jsonError("Failed to create attachment record", 500);
    }

    // Step 3: Generate signed URL
    const { data: signedUrlData } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS, {
        download: filename,
      });

    return Response.json({
      attachment,
      url: signedUrlData?.signedUrl ?? null,
    });
  } catch {
    return jsonError("Failed to process upload", 500);
  }
}
```

**Step 2: Extend the download route to allow `attachments/` path prefix**

Modify `app/api/files/download/route.ts` line 37. Change:

```typescript
  if (firstSegment !== "uploads" && firstSegment !== "home") {
    return jsonError("Downloads are restricted to uploads/ and home/.", 403);
  }
```

To:

```typescript
  if (firstSegment !== "uploads" && firstSegment !== "home" && firstSegment !== "attachments") {
    return jsonError("Downloads are restricted to uploads/, home/, and attachments/.", 403);
  }
```

**Step 3: Commit**

```bash
git add app/api/crm/attachments/upload/route.ts app/api/files/download/route.ts
git commit -m "feat: add CRM attachment upload route and extend download path"
```

---

## Task 5: TanStack Query hooks — `use-record-attachments.ts`

**Files:**
- Create: `src/hooks/__tests__/use-record-attachments.test.tsx`
- Create: `src/hooks/use-record-attachments.ts`

**Step 1: Write the failing test for query key factory and fetch hook**

Create `src/hooks/__tests__/use-record-attachments.test.tsx`:

```typescript
/**
 * Tests for record attachment hooks.
 * @module hooks/__tests__/use-record-attachments
 */
import { describe, expect, it } from "vitest";

import { recordAttachmentKeys } from "../use-record-attachments";

describe("recordAttachmentKeys", () => {
  it("builds a list key for a specific record", () => {
    const key = recordAttachmentKeys.list("contact", "c-1");
    expect(key).toEqual(["record-attachments", "list", "contact", "c-1"]);
  });

  it("builds a detail key for a specific attachment", () => {
    const key = recordAttachmentKeys.detail("att-1");
    expect(key).toEqual(["record-attachments", "detail", "att-1"]);
  });

  it("all keys share the same prefix", () => {
    expect(recordAttachmentKeys.all).toEqual(["record-attachments"]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/use-record-attachments.test.tsx
```

Expected: FAIL — `Cannot find module '../use-record-attachments'`

**Step 3: Write minimal implementation**

Create `src/hooks/use-record-attachments.ts`:

```typescript
/**
 * TanStack Query hooks for CRM record attachments.
 * Follows the same pattern as use-record-notes.ts.
 * @module hooks/use-record-attachments
 */
"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useClientId } from "@/hooks/use-client-id";
import { useRealtimeTable } from "@/hooks/use-realtime";
import { type RecordAttachment } from "@/lib/crm/schemas";
import { supabase } from "@/lib/supabase";

type RecordType = RecordAttachment["record_type"];

/**
 * Query key factory for record attachment queries.
 */
export const recordAttachmentKeys = {
  all: ["record-attachments"] as const,
  lists: () => [...recordAttachmentKeys.all, "list"] as const,
  list: (recordType: RecordType, recordId: string) =>
    [...recordAttachmentKeys.lists(), recordType, recordId] as const,
  details: () => [...recordAttachmentKeys.all, "detail"] as const,
  detail: (attachmentId: string) =>
    [...recordAttachmentKeys.details(), attachmentId] as const,
};

async function fetchRecordAttachments(
  recordType: RecordType,
  recordId: string,
): Promise<RecordAttachment[]> {
  const { data, error } = await supabase
    .from("record_attachments")
    .select("*")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RecordAttachment[];
}

export function recordAttachmentsQueryOptions(recordType: RecordType, recordId: string) {
  return queryOptions({
    queryKey: recordAttachmentKeys.list(recordType, recordId),
    queryFn: () => fetchRecordAttachments(recordType, recordId),
  });
}

/**
 * Returns attachments for a CRM record with realtime invalidation.
 */
export function useRecordAttachments(recordType: RecordType, recordId: string) {
  const { data: clientId } = useClientId();

  useRealtimeTable({
    table: "record_attachments",
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    queryKeys: [recordAttachmentKeys.list(recordType, recordId)],
    enabled: Boolean(clientId && recordId),
  });

  return useQuery({
    ...recordAttachmentsQueryOptions(recordType, recordId),
    enabled: Boolean(recordId),
  });
}

interface UploadAttachmentVariables {
  file: File;
  recordType: RecordType;
  recordId: string;
}

/**
 * Uploads a file to the CRM attachment upload route and returns the created attachment.
 */
export function useUploadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      recordType,
      recordId,
    }: UploadAttachmentVariables): Promise<RecordAttachment> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("record_type", recordType);
      formData.append("record_id", recordId);

      const response = await fetch("/api/crm/attachments/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          (errorBody as { error?: string }).error ?? "Upload failed",
        );
      }

      const result = await response.json() as { attachment: RecordAttachment };
      return result.attachment;
    },
    onSuccess: (attachment) => {
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
    },
  });
}

/**
 * Renames an attachment (metadata-only — does not move the storage object).
 */
export function useRenameAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attachmentId,
      filename,
    }: {
      attachmentId: string;
      filename: string;
    }): Promise<RecordAttachment> => {
      const { data, error } = await supabase
        .from("record_attachments")
        .update({ filename })
        .eq("attachment_id", attachmentId)
        .select()
        .single();

      if (error) throw error;
      return data as RecordAttachment;
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<RecordAttachment[]>(
        recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
        (existing) =>
          (existing ?? []).map((a) =>
            a.attachment_id === attachment.attachment_id ? attachment : a,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
    },
  });
}

/**
 * Deletes an attachment — removes both the storage file and the DB record.
 */
export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      attachmentId,
      storagePath,
    }: {
      attachmentId: string;
      storagePath: string;
    }): Promise<RecordAttachment> => {
      // Delete DB record first to get the full row back
      const { data, error } = await supabase
        .from("record_attachments")
        .delete()
        .eq("attachment_id", attachmentId)
        .select()
        .single();

      if (error) throw error;

      // Delete storage file (best-effort — DB record already gone)
      await supabase.storage.from("agent-files").remove([storagePath]);

      return data as RecordAttachment;
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<RecordAttachment[]>(
        recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
        (existing) =>
          (existing ?? []).filter((a) => a.attachment_id !== attachment.attachment_id),
      );
      void queryClient.invalidateQueries({
        queryKey: recordAttachmentKeys.list(attachment.record_type, attachment.record_id),
      });
    },
  });
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/__tests__/use-record-attachments.test.tsx
```

Expected: PASS — all 3 key factory tests green.

**Step 5: Commit**

```bash
git add src/hooks/use-record-attachments.ts src/hooks/__tests__/use-record-attachments.test.tsx
git commit -m "feat: add record attachment TanStack Query hooks with realtime"
```

---

## Task 6: AttachmentRow component

**Files:**
- Create: `src/components/crm/record-drawer/__tests__/attachment-row.test.tsx`
- Create: `src/components/crm/record-drawer/attachment-row.tsx`

**Step 1: Write the failing test**

Create `src/components/crm/record-drawer/__tests__/attachment-row.test.tsx`:

```typescript
/**
 * Tests for the AttachmentRow component.
 * @module components/crm/record-drawer/__tests__/attachment-row
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttachmentRow } from "../attachment-row";

const baseAttachment = {
  attachment_id: "att-1",
  client_id: "cl-1",
  record_type: "contact" as const,
  record_id: "c-1",
  filename: "proposal.pdf",
  storage_path: "cl-1/attachments/contact/c-1/uuid-1",
  content_type: "application/pdf",
  file_size: 1024,
  file_category: "pdf" as const,
  created_at: "2026-04-01T00:00:00+00:00",
  updated_at: "2026-04-01T00:00:00+00:00",
};

describe("AttachmentRow", () => {
  it("renders filename and formatted date", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    // formatDistanceToNow will show something like "X days ago"
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it("renders a file icon", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // The icon should be present (rendered as SVG)
    const row = screen.getByText("proposal.pdf").closest("[data-testid='attachment-row']");
    expect(row).toBeInTheDocument();
  });

  it("renders the dropdown trigger button", () => {
    render(
      <AttachmentRow
        attachment={baseAttachment}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /options/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/attachment-row.test.tsx
```

Expected: FAIL — `Cannot find module '../attachment-row'`

**Step 3: Write minimal implementation**

Create `src/components/crm/record-drawer/attachment-row.tsx`:

```typescript
/**
 * Single file row in the Files tab attachment list.
 * Displays file icon, filename (clickable for download), date, and a 3-dot context menu.
 * @module components/crm/record-drawer/attachment-row
 */
"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Calendar,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  MoreVertical,
  Pencil,
  Presentation,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type RecordAttachment } from "@/lib/crm/schemas";
import { FILETYPE_COLOR_CLASSES } from "@/lib/ui/color-maps";
import { cn } from "@/lib/utils";

interface AttachmentRowProps {
  attachment: RecordAttachment;
  onDownload: (attachment: RecordAttachment) => void;
  onRename: (attachmentId: string, newFilename: string) => void;
  onDelete: (attachment: RecordAttachment) => void;
}

const CATEGORY_ICONS: Record<string, typeof File> = {
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: FileImage,
  other: File,
};

function getFilenameAndExtension(filename: string): { name: string; extension: string } {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return { name: filename, extension: "" };
  return { name: filename.slice(0, lastDot), extension: filename.slice(lastDot) };
}

export function AttachmentRow({ attachment, onDownload, onRename, onDelete }: AttachmentRowProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const { name: baseName, extension } = getFilenameAndExtension(attachment.filename);
  const Icon = CATEGORY_ICONS[attachment.file_category] ?? File;
  const colorClass =
    FILETYPE_COLOR_CLASSES[extension.replace(".", "").toLowerCase()] ?? "text-muted-foreground";

  const handleStartRename = () => {
    setRenameValue(baseName);
    setIsRenaming(true);
  };

  const handleCommitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== baseName) {
      onRename(attachment.attachment_id, `${trimmed}${extension}`);
    }
    setIsRenaming(false);
  };

  return (
    <div
      data-testid="attachment-row"
      className="group flex items-center gap-3 rounded-lg border border-border/30 px-3 py-2 transition-colors hover:border-border"
    >
      <Icon className={cn("h-5 w-5 shrink-0", colorClass)} />

      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            className="h-7 text-sm"
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="block max-w-full truncate text-left text-sm font-medium text-foreground/90 hover:underline"
            onClick={() => onDownload(attachment)}
          >
            {attachment.filename}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
        <span>{formatDistanceToNow(new Date(attachment.created_at), { addSuffix: true })}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Options"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onDownload(attachment)}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleStartRename}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(attachment)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/attachment-row.test.tsx
```

Expected: PASS — all 3 tests green.

**Step 5: Commit**

```bash
git add src/components/crm/record-drawer/attachment-row.tsx src/components/crm/record-drawer/__tests__/attachment-row.test.tsx
git commit -m "feat: add AttachmentRow component with icon, rename, and dropdown"
```

---

## Task 7: DrawerFilesTab component

**Files:**
- Create: `src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx`
- Create: `src/components/crm/record-drawer/drawer-files-tab.tsx`

**Step 1: Write the failing test**

Create `src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx`:

```typescript
/**
 * Tests for DrawerFilesTab component.
 * @module components/crm/record-drawer/__tests__/drawer-files-tab
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrawerFilesTab } from "../drawer-files-tab";

const mockAttachments = [
  {
    attachment_id: "att-1",
    client_id: "cl-1",
    record_type: "contact",
    record_id: "c-1",
    filename: "proposal.pdf",
    storage_path: "cl-1/attachments/contact/c-1/uuid-1",
    content_type: "application/pdf",
    file_size: 1024,
    file_category: "pdf",
    created_at: "2026-04-01T00:00:00+00:00",
    updated_at: "2026-04-01T00:00:00+00:00",
  },
  {
    attachment_id: "att-2",
    client_id: "cl-1",
    record_type: "contact",
    record_id: "c-1",
    filename: "budget.xlsx",
    storage_path: "cl-1/attachments/contact/c-1/uuid-2",
    content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    file_size: 2048,
    file_category: "spreadsheet",
    created_at: "2026-03-28T00:00:00+00:00",
    updated_at: "2026-03-28T00:00:00+00:00",
  },
];

vi.mock("@/hooks/use-record-attachments", () => ({
  useRecordAttachments: () => ({
    data: mockAttachments,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUploadAttachment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useRenameAttachment: () => ({
    mutateAsync: vi.fn(),
  }),
  useDeleteAttachment: () => ({
    mutateAsync: vi.fn(),
  }),
}));

describe("DrawerFilesTab", () => {
  it("renders the header with count and add button", () => {
    render(<DrawerFilesTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add file/i })).toBeInTheDocument();
  });

  it("renders attachment rows for each file", () => {
    render(<DrawerFilesTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("proposal.pdf")).toBeInTheDocument();
    expect(screen.getByText("budget.xlsx")).toBeInTheDocument();
  });
});

describe("DrawerFilesTab empty state", () => {
  beforeAll(() => {
    vi.doMock("@/hooks/use-record-attachments", () => ({
      useRecordAttachments: () => ({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }),
      useUploadAttachment: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
      }),
      useRenameAttachment: () => ({
        mutateAsync: vi.fn(),
      }),
      useDeleteAttachment: () => ({
        mutateAsync: vi.fn(),
      }),
    }));
  });

  it("shows empty state when no attachments exist", async () => {
    // Re-import to get the updated mock
    const { DrawerFilesTab: FreshTab } = await import("../drawer-files-tab");
    render(<FreshTab recordType="contact" recordId="c-1" />);

    expect(screen.getByText("No Files")).toBeInTheDocument();
    expect(screen.getByText(/no associated files/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx
```

Expected: FAIL — `Cannot find module '../drawer-files-tab'`

**Step 3: Write minimal implementation**

Create `src/components/crm/record-drawer/drawer-files-tab.tsx`:

```typescript
/**
 * Files tab for CRM record drawers.
 * Upload, list, download, rename, and delete file attachments.
 * Clones Twenty CRM's Files tab layout.
 * @module components/crm/record-drawer/drawer-files-tab
 */
"use client";

import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { saveAs } from "file-saver";
import { Paperclip, Plus, Upload } from "lucide-react";

import { AttachmentRow } from "@/components/crm/record-drawer/attachment-row";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteAttachment,
  useRecordAttachments,
  useRenameAttachment,
  useUploadAttachment,
} from "@/hooks/use-record-attachments";
import { ALLOWED_UPLOAD_TYPES, CHAT_ATTACHMENT_ACCEPT, MAX_UPLOAD_SIZE_BYTES } from "@/lib/chat/attachment-config";
import { type RecordAttachment } from "@/lib/crm/schemas";

interface DrawerFilesTabProps {
  recordType: RecordAttachment["record_type"];
  recordId: string;
}

export function DrawerFilesTab({ recordType, recordId }: DrawerFilesTabProps) {
  const { data: attachments = [], isLoading, isError, refetch } = useRecordAttachments(recordType, recordId);
  const uploadAttachment = useUploadAttachment();
  const renameAttachment = useRenameAttachment();
  const deleteAttachment = useDeleteAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await uploadAttachment.mutateAsync({ file, recordType, recordId });
      }
    },
    [uploadAttachment, recordType, recordId],
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void handleUploadFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDownload = async (attachment: RecordAttachment) => {
    const response = await fetch(
      `/api/files/download?path=attachments/${attachment.record_type}/${attachment.record_id}/${attachment.storage_path.split("/").pop()}`,
    );
    if (response.ok) {
      const blob = await response.blob();
      saveAs(blob, attachment.filename);
    }
  };

  const handleRename = (attachmentId: string, newFilename: string) => {
    void renameAttachment.mutateAsync({ attachmentId, filename: newFilename });
  };

  const handleDelete = (attachment: RecordAttachment) => {
    void deleteAttachment.mutateAsync({
      attachmentId: attachment.attachment_id,
      storagePath: attachment.storage_path,
    });
  };

  const { getRootProps, getInputProps: getDropzoneInputProps } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    maxSize: MAX_UPLOAD_SIZE_BYTES,
    accept: Object.fromEntries(
      Array.from(ALLOWED_UPLOAD_TYPES).map((type) => [type, []]),
    ),
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onDrop: () => setIsDragging(false),
    onDropAccepted: (files) => {
      void handleUploadFiles(files);
      setIsDragging(false);
    },
  });

  const addFileButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => inputRef.current?.click()}
      disabled={uploadAttachment.isPending}
    >
      <Plus className="mr-1 h-3.5 w-3.5" />
      Add file
    </Button>
  );

  // Hidden file input
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={CHAT_ATTACHMENT_ACCEPT}
      className="hidden"
      onChange={handleFileChange}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-7 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Failed to load files.</p>
        <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>
          Retry
        </Button>
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div {...getRootProps()}>
        <input {...getDropzoneInputProps()} />
        {fileInput}
        {isDragging ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-16 text-center">
            <Upload className="h-6 w-6 text-primary/60" />
            <p className="text-sm font-medium text-foreground">Upload files</p>
            <p className="text-xs text-muted-foreground">Drag and Drop Here</p>
          </div>
        ) : (
          <Empty className="border-border/50 bg-card/30">
            <EmptyContent>
              <EmptyMedia variant="icon">
                <Paperclip className="h-4 w-4" />
              </EmptyMedia>
              <EmptyTitle>No Files</EmptyTitle>
              <EmptyDescription>There are no associated files with this record.</EmptyDescription>
              {addFileButton}
            </EmptyContent>
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div {...getRootProps()} className="space-y-3">
      <input {...getDropzoneInputProps()} />
      {fileInput}

      {isDragging ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-16 text-center">
          <Upload className="h-6 w-6 text-primary/60" />
          <p className="text-sm font-medium text-foreground">Upload files</p>
          <p className="text-xs text-muted-foreground">Drag and Drop Here</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span>All</span>
              <span className="text-muted-foreground">{attachments.length}</span>
            </div>
            {addFileButton}
          </div>

          <div className="space-y-2">
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.attachment_id}
                attachment={attachment}
                onDownload={handleDownload}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx
```

Expected: PASS — all tests green.

**Step 5: Commit**

```bash
git add src/components/crm/record-drawer/drawer-files-tab.tsx src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx
git commit -m "feat: add DrawerFilesTab with upload, download, rename, delete, and drop zone"
```

---

## Task 8: Integrate Files tab into drawers

**Files:**
- Modify: `src/components/crm/record-drawer/contact-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/company-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/deal-drawer-content.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx`
- Modify: `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx`

**Step 1: Write failing test — contact drawer shows Files tab**

In `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx`, add to the "renders the tabbed side-panel navigation" test:

```typescript
expect(screen.getByText("Files")).toBeInTheDocument();
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: Files`

**Step 3: Update contact-drawer-content.tsx**

Add import at top:

```typescript
import { Paperclip } from "lucide-react";
import { DrawerFilesTab } from "./drawer-files-tab";
```

Add `"files"` to the tab union type:

```typescript
type ContactDrawerTab = "home" | "timeline" | "tasks" | "notes" | "files";
```

Add files tab to the tabs array (after notes):

```typescript
{ id: "files", label: "Files", icon: <Paperclip className="h-4 w-4" /> },
```

Add the tab content (after the notes tab block):

```typescript
{activeTab === "files" ? (
  <DrawerFilesTab recordType="contact" recordId={contactId} />
) : null}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx
```

Expected: PASS.

**Step 5: Repeat for company-drawer-content.tsx**

Same changes:
- Import `Paperclip` and `DrawerFilesTab`
- Add `"files"` to `CompanyDrawerTab` type
- Add files tab to tabs array
- Add files tab content rendering

Update `company-drawer-content.test.tsx` to assert `Files` tab text.

**Step 6: Run company test**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx
```

Expected: PASS.

**Step 7: Repeat for deal-drawer-content.tsx**

Same changes. Deal now has 6 tabs: Home, Contacts, Timeline, Tasks, Notes, Files. With `maxVisibleTabs=4`, two tabs go to the overflow menu.

Update `deal-drawer-content.test.tsx`:
- The overflow dropdown now says "+2 More" (was "+1 More")

**Step 8: Run deal test**

```bash
npx vitest run src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx
```

Expected: PASS.

**Step 9: Run all drawer tests together**

```bash
npx vitest run src/components/crm/record-drawer/
```

Expected: All tests green (ignore pre-existing task-drawer failure).

**Step 10: Commit**

```bash
git add src/components/crm/record-drawer/contact-drawer-content.tsx \
  src/components/crm/record-drawer/company-drawer-content.tsx \
  src/components/crm/record-drawer/deal-drawer-content.tsx \
  src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx \
  src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx
git commit -m "feat: integrate Files tab into contact, company, and deal drawers"
```

---

## Task 9: End-to-end verification

**Step 1: Run full test suite for affected areas**

```bash
npx vitest run src/components/crm/record-drawer/ src/hooks/__tests__/use-record-attachments.test.tsx src/lib/crm/file-categories.test.ts
```

Expected: All tests pass.

**Step 2: Start dev server and manually verify**

```bash
pnpm dev
```

Verify:
1. Open People page -> click a contact -> see Files tab in drawer
2. Click Files tab -> see "No Files" empty state
3. Click "+ Add file" -> file picker opens
4. Upload a file -> appears in list with correct icon and date
5. Click filename -> file downloads
6. Click 3-dot menu -> Download, Rename, Delete all work
7. Drag a file over the tab -> drop zone overlay appears
8. Drop the file -> uploads successfully
9. Repeat for Companies and Deals pages

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete Files tab for CRM record drawers"
```

---

## Relevant Files Summary

| File | Action |
|------|--------|
| `package.json` | Modify — add react-dropzone, file-saver |
| `supabase/migrations/20260405100000_create_record_attachments.sql` | Create |
| `src/types/database.ts` | Regenerate |
| `src/lib/crm/schemas.ts` | Modify — add RecordAttachment schema |
| `src/lib/crm/file-categories.ts` | Create |
| `src/lib/crm/file-categories.test.ts` | Create |
| `src/lib/ui/color-maps.ts` | Modify — add image filetype tokens |
| `app/api/crm/attachments/upload/route.ts` | Create |
| `app/api/files/download/route.ts` | Modify — allow `attachments/` path |
| `src/hooks/use-record-attachments.ts` | Create |
| `src/hooks/__tests__/use-record-attachments.test.tsx` | Create |
| `src/components/crm/record-drawer/attachment-row.tsx` | Create |
| `src/components/crm/record-drawer/__tests__/attachment-row.test.tsx` | Create |
| `src/components/crm/record-drawer/drawer-files-tab.tsx` | Create |
| `src/components/crm/record-drawer/__tests__/drawer-files-tab.test.tsx` | Create |
| `src/components/crm/record-drawer/contact-drawer-content.tsx` | Modify — add files tab |
| `src/components/crm/record-drawer/company-drawer-content.tsx` | Modify — add files tab |
| `src/components/crm/record-drawer/deal-drawer-content.tsx` | Modify — add files tab |
| `src/components/crm/record-drawer/__tests__/contact-drawer-content.test.tsx` | Modify |
| `src/components/crm/record-drawer/__tests__/company-drawer-content.test.tsx` | Modify |
| `src/components/crm/record-drawer/__tests__/deal-drawer-content.test.tsx` | Modify |

## Reference Docs

- Requirements: `docs/product/ideations/2026-04-05-files-tab-requirements.md`
- Twenty reference: `roadmap docs/Sunder - Source of Truth/references/twenty-crm/files-tab-reference.md`
- Existing patterns to follow: `src/hooks/use-record-notes.ts`, `src/components/crm/record-drawer/drawer-notes-tab.tsx`
