# Multimodal Chat — Image Attachments Implementation Plan

**PR:** PR 22a: Multimodal chat — image attachments
**Decisions:** (none — follows vercel/chatbot reference patterns)
**Goal:** Users can attach images to chat messages, see previews before sending, and the AI model receives and responds to those images. Users can also stop streaming responses.

**Architecture:** Follows the vercel/chatbot upload→attach→send→render pipeline exactly, with one justified drift: Supabase Storage instead of Vercel Blob.

- **Upload-on-select:** Files uploaded immediately to `/api/files/upload` on file selection or paste, exactly matching `MultimodalInput` in vercel/chatbot.
- **Own attachment state:** `ChatComposer` manages its own `attachments[]` + `uploadQueue[]` (does NOT use PromptInput's built-in attachment system). Matches how `MultimodalInput` manages state.
- **Hidden file input:** `<input type="file" ref={fileInputRef}>` triggered by paperclip button, same pattern as reference.
- **Paste handler:** Native `addEventListener` on textarea ref, same as reference.
- **Parts-based send:** `sendMessage({ role: "user", parts: [...fileParts, textPart] })`, same as reference.
- **Stop button:** `PromptInputSubmit`'s `onStop` prop wired to `useChat().stop`.

**Reference repo:** `/Users/sethlim/Documents/chatbot` (vercel/chatbot clone)
**Reference doc:** `roadmap docs/Sunder - Source of Truth/references/vercel-chatbot/multimodal-reference.md`

**Tech Stack:** Vercel AI SDK v6 (`useChat`, `sendMessage`, `convertToModelMessages`), Supabase Storage, Zod 4, Next.js App Router, ShadCN UI, Tailwind 4, Vitest + React Testing Library

**Prerequisite:** PR 22b (tool rendering + approval UI) is complete. All code below accounts for PR 22b's changes to `chat-panel.tsx`, `message-bubble.tsx`, `message-list.tsx`, `steps-summary.tsx`, and `tool-call-inline.tsx`.

---

## Relevant Files

### Create
- `supabase/migrations/20260307040000_create_chat_attachments_bucket.sql` — storage bucket + RLS policies
- `app/api/files/upload/route.ts` — file upload API route
- `app/api/files/upload/__tests__/route.test.ts` — upload route unit tests
- `src/components/chat/preview-attachment.tsx` — reusable image preview component
- `src/components/chat/__tests__/preview-attachment.test.tsx` — preview component tests
- `src/components/chat/__tests__/chat-composer-multimodal.test.tsx` — multimodal composer tests
- `src/components/chat/__tests__/message-bubble-files.test.tsx` — file rendering tests
- `src/lib/runner/__tests__/run-agent-multimodal.test.ts` — multimodal runner tests

### Modify
- `src/components/chat/chat-composer.tsx` — full rewrite: own attachment state, upload-on-select, hidden file input, paste handler, paperclip button, preview area
- `src/components/chat/chat-panel.tsx` — add `stop` to useChat destructuring (alongside existing `addToolApprovalResponse`), parts-based `sendMessage`, pass `onStop` to ChatComposer
- `src/components/chat/message-bubble.tsx` — render file parts as image previews in user messages (alongside existing tool approval rendering)
- `app/api/chat/route.ts` — extract and forward file parts to runner
- `src/lib/runner/schemas.ts` — extend `RunnerPayload` to accept file parts
- `src/lib/runner/run-agent.ts` — include file parts in user message persistence and model context

---

## Task 1: Migration — `chat-attachments` storage bucket

**Files:**
- Create: `supabase/migrations/20260307040000_create_chat_attachments_bucket.sql`

### Step 1: Write the migration SQL

Create the migration file following the `agent-files` bucket pattern (`supabase/migrations/20260302130000_create_agent_files_bucket.sql`).

```sql
-- PR22a: public storage bucket for chat image attachments.
-- Images uploaded via /api/files/upload, stored under {client_id}/ prefix.
-- Public bucket so URLs render directly in <img> tags.

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Idempotent policy replacement for local dev resets.
DROP POLICY IF EXISTS "chat_attachments_select_public" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_insert_own_prefix" ON storage.objects;

-- Anyone can read (public bucket — URLs used in <img src>).
CREATE POLICY "chat_attachments_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'chat-attachments');

-- Authenticated users can upload to their own {client_id}/ prefix only.
CREATE POLICY "chat_attachments_insert_own_prefix"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = public.get_my_client_id()::text
  );
```

### Step 2: Apply migration locally

```bash
npx supabase db reset
```

Expected: Migration applies without error. The `chat-attachments` bucket is created.

### Step 3: Commit

```bash
git add supabase/migrations/20260307040000_create_chat_attachments_bucket.sql
git commit -m "feat(pr22a): create chat-attachments storage bucket"
```

---

## Task 2: File upload API route

**Pattern:** Matches `chatbot/app/(chat)/api/files/upload/route.ts` exactly. Only drift: Supabase Storage + Supabase Auth instead of Vercel Blob + NextAuth. Same API contract: POST FormData → `{ url, pathname, contentType }`.

**Files:**
- Create: `app/api/files/upload/route.ts`
- Create: `app/api/files/upload/__tests__/route.test.ts`

### Step 1: Write the failing test

Create `app/api/files/upload/__tests__/route.test.ts`:

```typescript
/**
 * @module app/api/files/upload/__tests__/route.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Supabase mock ---
const mockGetUser = vi.fn();
const mockResolveClientId = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

import { POST } from "../route";

function createFileRequest(file: Blob, filename = "photo.jpg") {
  const formData = new FormData();
  formData.append("file", file, filename);
  return new Request("http://localhost/api/files/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/files/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockResolveClientId.mockResolvedValue("client-1");
    mockUpload.mockResolvedValue({ data: { path: "client-1/photo.jpg" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example.com/chat-attachments/client-1/photo.jpg" },
    });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });

    const blob = new Blob(["x"], { type: "image/jpeg" });
    const response = await POST(createFileRequest(blob));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when no file is provided", async () => {
    const request = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: new FormData(),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when file exceeds 5MB", async () => {
    const bigBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)], { type: "image/jpeg" });
    const response = await POST(createFileRequest(bigBlob));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("5MB");
  });

  it("returns 400 for unsupported file type", async () => {
    const blob = new Blob(["x"], { type: "application/pdf" });
    const response = await POST(createFileRequest(blob, "doc.pdf"));

    expect(response.status).toBe(400);
  });

  it("uploads valid image and returns url, pathname, contentType", async () => {
    const blob = new Blob(["image-data"], { type: "image/png" });
    const response = await POST(createFileRequest(blob, "screenshot.png"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      url: "https://storage.example.com/chat-attachments/client-1/photo.jpg",
      pathname: expect.stringContaining("screenshot"),
      contentType: "image/png",
    });
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it("returns 500 when storage upload fails", async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: "storage full" } });

    const blob = new Blob(["image-data"], { type: "image/jpeg" });
    const response = await POST(createFileRequest(blob));

    expect(response.status).toBe(500);
  });
});
```

### Step 2: Verify tests fail

```bash
npx vitest run app/api/files/upload/__tests__/route.test.ts
```

Expected: Fails because `app/api/files/upload/route.ts` does not exist.

### Step 3: Implement the upload route

Create `app/api/files/upload/route.ts` — adapted from `chatbot/app/(chat)/api/files/upload/route.ts`:

```typescript
/**
 * File upload API route — uploads images to Supabase Storage.
 * Returns { url, pathname, contentType } matching vercel/chatbot contract.
 * @module app/api/files/upload/route
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveClientId } from "@/lib/chat/client-id";
import { createClient } from "@/lib/supabase/server";

const BUCKET_ID = "chat-attachments";

// Matches reference: 5MB max, JPEG/PNG only
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = (formData.get("file") as File).name;
    const clientId = await resolveClientId(supabase, user.id);
    const ext = filename.split(".").pop() ?? "jpg";
    const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const storagePath = `${clientId}/${uniqueName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_ID)
        .upload(storagePath, await file.arrayBuffer(), {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET_ID).getPublicUrl(storagePath);

      return NextResponse.json({
        url: publicUrl,
        pathname: uniqueName,
        contentType: file.type,
      });
    } catch {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
```

### Step 4: Verify tests pass

```bash
npx vitest run app/api/files/upload/__tests__/route.test.ts
```

Expected: All 6 tests pass.

### Step 5: Commit

```bash
git add app/api/files/upload/route.ts app/api/files/upload/__tests__/route.test.ts
git commit -m "feat(pr22a): file upload API route with Supabase Storage"
```

---

## Task 3: PreviewAttachment component

**Pattern:** Copied from `chatbot/components/preview-attachment.tsx`. Adapted: plain `<img>` instead of Next.js `Image` (Supabase Storage URLs not configured in next.config.js). Our `Spinner` instead of their `Loader`. Our `Button` + icon.

**Files:**
- Create: `src/components/chat/preview-attachment.tsx`
- Create: `src/components/chat/__tests__/preview-attachment.test.tsx`

### Step 1: Write the failing test

Create `src/components/chat/__tests__/preview-attachment.test.tsx`:

```typescript
/**
 * @module components/chat/__tests__/preview-attachment.test
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { PreviewAttachment } from "../preview-attachment";

describe("PreviewAttachment", () => {
  const imageAttachment = {
    name: "photo.jpg",
    url: "https://storage.example.com/photo.jpg",
    contentType: "image/jpeg",
  };

  it("renders image thumbnail for image content type", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://storage.example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "photo.jpg");
  });

  it("renders file name label", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });

  it("shows loading overlay when isUploading is true", () => {
    render(
      <PreviewAttachment
        attachment={{ name: "uploading.jpg", url: "", contentType: "" }}
        isUploading
      />,
    );

    expect(screen.getByTestId("input-attachment-loader")).toBeInTheDocument();
  });

  it("shows remove button on hover when onRemove is provided", () => {
    const onRemove = vi.fn();
    render(<PreviewAttachment attachment={imageAttachment} onRemove={onRemove} />);

    const removeButton = screen.getByRole("button");
    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("does not show remove button when onRemove is not provided", () => {
    render(<PreviewAttachment attachment={imageAttachment} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders generic file fallback for non-image content type", () => {
    render(
      <PreviewAttachment
        attachment={{ name: "doc.pdf", url: "/doc.pdf", contentType: "application/pdf" }}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  });
});
```

### Step 2: Verify tests fail

```bash
npx vitest run src/components/chat/__tests__/preview-attachment.test.tsx
```

Expected: Fails because `preview-attachment.tsx` does not exist.

### Step 3: Implement PreviewAttachment

Create `src/components/chat/preview-attachment.tsx` — adapted from `chatbot/components/preview-attachment.tsx`:

```typescript
/**
 * Reusable image/file attachment preview thumbnail.
 * Used in both ChatComposer (with onRemove) and MessageBubble (without onRemove).
 * Adapted from chatbot/components/preview-attachment.tsx.
 * @module components/chat/preview-attachment
 */

import { XIcon } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}

export function PreviewAttachment({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) {
  const { name, url, contentType } = attachment;

  return (
    <div
      className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
      data-testid="input-attachment-preview"
    >
      {contentType?.startsWith("image") ? (
        <img
          alt={name ?? "An image attachment"}
          className="size-full object-cover"
          height={64}
          src={url}
          width={64}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
          File
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-4 text-white" />
        </div>
      )}

      {onRemove && !isUploading && (
        <Button
          className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemove}
          size="sm"
          variant="destructive"
        >
          <XIcon className="size-2" />
        </Button>
      )}

      <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
        {name}
      </div>
    </div>
  );
}
```

### Step 4: Verify tests pass

```bash
npx vitest run src/components/chat/__tests__/preview-attachment.test.tsx
```

Expected: All 6 tests pass.

### Step 5: Commit

```bash
git add src/components/chat/preview-attachment.tsx src/components/chat/__tests__/preview-attachment.test.tsx
git commit -m "feat(pr22a): PreviewAttachment component"
```

---

## Task 4: ChatComposer multimodal + ChatPanel parts-based messaging + stop button

This task upgrades both `ChatComposer` and `ChatPanel` together since they are tightly coupled.

**Pattern:** Follows `chatbot/components/multimodal-input.tsx` exactly:
- Own `attachments[]` + `uploadQueue[]` state (does NOT use PromptInput's attachment system)
- Hidden `<input type="file" ref={fileInputRef}>` triggered by paperclip button
- `uploadFile()` POSTs to `/api/files/upload` immediately on selection
- `handlePaste` via native `addEventListener` on textarea (same as reference)
- `submitForm` builds parts from already-uploaded attachments
- Stop via `PromptInputSubmit`'s `onStop` prop (our component already supports this)

**Post-22b state:** `chat-panel.tsx` already destructures `addToolApprovalResponse` and has `handleToolApproval`. We add `stop` to the same destructuring line.

**Files:**
- Modify: `src/components/chat/chat-composer.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Create: `src/components/chat/__tests__/chat-composer-multimodal.test.tsx`

### Step 1: Write the failing tests

Create `src/components/chat/__tests__/chat-composer-multimodal.test.tsx`:

```typescript
/**
 * @module components/chat/__tests__/chat-composer-multimodal.test
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { ChatComposer } from "../chat-composer";

// Minimal mock for PromptInput internals
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ChatComposer multimodal", () => {
  it("renders paperclip attachment button", () => {
    render(<ChatComposer status="ready" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("attachments-button")).toBeInTheDocument();
  });

  it("renders stop button when streaming", () => {
    const onStop = vi.fn();
    render(<ChatComposer status="streaming" onSubmit={vi.fn()} onStop={onStop} />);
    expect(screen.getByLabelText("Stop")).toBeInTheDocument();
  });

  it("renders hidden file input for images", () => {
    render(<ChatComposer status="ready" onSubmit={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.multiple).toBe(true);
  });

  it("disables send button when no text and no attachments", () => {
    render(<ChatComposer status="ready" onSubmit={vi.fn()} />);
    const submit = screen.getByTestId("send-button");
    expect(submit).toBeDisabled();
  });
});
```

### Step 2: Verify tests fail

```bash
npx vitest run src/components/chat/__tests__/chat-composer-multimodal.test.tsx
```

Expected: Fails — no paperclip button, no `onStop` prop, no hidden file input.

### Step 3: Implement ChatComposer multimodal upgrade

Replace `src/components/chat/chat-composer.tsx`. This follows `chatbot/components/multimodal-input.tsx` line-by-line, adapted to our component library.

```typescript
/**
 * Chat input composer with multimodal image attachments and stop support.
 * Follows chatbot/components/multimodal-input.tsx pattern: upload-on-select,
 * own attachment state, hidden file input with ref, paste via addEventListener.
 * @module components/chat/chat-composer
 */
"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { PaperclipIcon } from "@/components/icons/lucide-compat";
import { Button } from "@/components/ui/button";
import type { ChatStatus } from "@/types/chat";

import { type Attachment, PreviewAttachment } from "./preview-attachment";

/** Shape of a file part ready for sendMessage parts[]. */
export interface ChatFilePart {
  type: "file";
  url: string;
  name: string;
  mediaType: string;
}

interface ChatComposerProps {
  status: ChatStatus;
  onSubmit: (text: string, fileParts: ChatFilePart[]) => void;
  onStop?: () => void;
}

/**
 * Uploads a single File to the server immediately.
 * Returns Attachment with persistent server URL, or undefined on failure.
 * Matches chatbot uploadFile() pattern.
 */
async function uploadFile(file: File): Promise<Attachment | undefined> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const { url, pathname, contentType } = await response.json();
      return { url, name: pathname, contentType };
    }

    const { error } = await response.json();
    toast.error(error);
  } catch {
    toast.error("Failed to upload file, please try again!");
  }
}

export function ChatComposer({ status, onSubmit, onStop }: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const isSendDisabled = !hasContent || isLoading || uploadQueue.length > 0;

  /** Handles file input change — uploads immediately on selection. Matches chatbot handleFileChange. */
  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const results = await Promise.all(uploadPromises);
        const successful = results.filter(
          (a): a is Attachment => a !== undefined,
        );

        setAttachments((curr) => [...curr, ...successful]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [],
  );

  /** Handles paste — uploads image files immediately from clipboard. Matches chatbot handlePaste. */
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/"),
      );

      if (imageItems.length === 0) return;

      event.preventDefault();
      setUploadQueue((prev) => [...prev, "Pasted image"]);

      try {
        const uploadPromises = imageItems
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null)
          .map((file) => uploadFile(file));

        const results = await Promise.all(uploadPromises);
        const successful = results.filter(
          (a): a is Attachment => a !== undefined,
        );

        setAttachments((curr) => [...curr, ...successful]);
      } catch (error) {
        console.error("Error uploading pasted images:", error);
        toast.error("Failed to upload pasted image(s)");
      } finally {
        setUploadQueue([]);
      }
    },
    [],
  );

  // Native addEventListener on textarea — matches chatbot pattern exactly
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  /** Builds parts from already-uploaded attachments + text, calls onSubmit. Matches chatbot submitForm. */
  const submitForm = useCallback(() => {
    if (!value.trim() && attachments.length === 0) return;
    if (isLoading) {
      toast.error("Please wait for the model to finish its response!");
      return;
    }

    const fileParts: ChatFilePart[] = attachments.map((a) => ({
      type: "file",
      url: a.url,
      name: a.name,
      mediaType: a.contentType,
    }));

    const text = value.trim();
    setAttachments([]);
    setValue("");
    onSubmit(text, fileParts);
  }, [value, attachments, isLoading, onSubmit]);

  return (
    <div className="px-4 pb-4">
      <div className="mx-auto max-w-2xl">
        {/* Hidden file input — triggered by paperclip button. Matches chatbot pattern. */}
        <input
          className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />

        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            submitForm();
          }}
        >
          {/* Attachment previews — matches chatbot attachments-preview area */}
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div
              className="flex flex-row items-end gap-2 overflow-x-auto px-3 pt-3"
              data-testid="attachments-preview"
            >
              {attachments.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={attachment}
                  onRemove={() => {
                    setAttachments((curr) =>
                      curr.filter((a) => a.url !== attachment.url),
                    );
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              ))}
              {uploadQueue.map((filename) => (
                <PreviewAttachment
                  key={filename}
                  attachment={{ url: "", name: filename, contentType: "" }}
                  isUploading
                />
              ))}
            </div>
          )}

          <PromptInputTextarea
            placeholder="Send a message..."
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            disabled={isLoading}
            ref={textareaRef}
          />

          <PromptInputFooter>
            <PromptInputTools>
              <Button
                className="size-8 rounded-lg p-1 transition-colors hover:bg-accent"
                data-testid="attachments-button"
                disabled={status !== "ready"}
                onClick={(event) => {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }}
                variant="ghost"
              >
                <PaperclipIcon className="size-3.5" />
              </Button>
            </PromptInputTools>
            <PromptInputSubmit
              data-testid="send-button"
              status={status}
              disabled={isSendDisabled}
              onStop={onStop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
```

**Note:** This requires `PromptInputTextarea` to accept a `ref` prop (forwardRef). If it currently doesn't forward refs, add `React.forwardRef` to the `PromptInputTextarea` component in `src/components/ai-elements/prompt-input.tsx`. Alternatively, wrap the textarea area in a div with its own ref for the paste listener — but the forwardRef approach matches the vercel/chatbot pattern where `textareaRef` is passed directly.

Also note: `PromptInput`'s `onSubmit` is called with a native form event (not a `PromptInputMessage`). If the current PromptInput passes a `PromptInputMessage`, adapt accordingly — the key behavior is that `submitForm()` is called, which reads from component state, not from the event.

### Step 4: Update ChatPanel for parts-based messaging + stop

Modify `src/components/chat/chat-panel.tsx`. Post-22b, this file already destructures `addToolApprovalResponse` and has `handleToolApproval`. Changes:

1. Add `stop` to the existing `useChat()` destructuring
2. Update `handleSubmit` signature to `(text: string, fileParts: ChatFilePart[])`
3. Switch from `sendMessage({ text })` to `sendMessage({ role: "user", parts: [...] })`
4. Pass `onStop={stop}` to `ChatComposer`

```diff
// 1. Import ChatFilePart
-import { ChatComposer } from "./chat-composer";
+import { ChatComposer, type ChatFilePart } from "./chat-composer";

// 2. Add `stop` to useChat destructuring (alongside existing addToolApprovalResponse)
-const { messages, sendMessage, status, error, resumeStream, setMessages, addToolApprovalResponse } = useChat({
+const { messages, sendMessage, status, error, resumeStream, setMessages, addToolApprovalResponse, stop } = useChat({

// 3. Update handleSubmit
 const handleSubmit = useCallback(
-  (text: string) => {
-    if (text.length === 0 || isLoading) {
+  (text: string, fileParts: ChatFilePart[]) => {
+    if ((text.length === 0 && fileParts.length === 0) || isLoading) {
       return;
     }

     if (typeof window !== "undefined" && window.location.pathname === "/chat") {
       window.history.pushState({}, "", `/chat/${chatId}`);
     }

-    sendMessage({ text });
+    sendMessage({
+      role: "user",
+      parts: [
+        ...fileParts.map((fp) => ({
+          type: "file" as const,
+          url: fp.url,
+          name: fp.name,
+          mediaType: fp.mediaType,
+        })),
+        ...(text.length > 0 ? [{ type: "text" as const, text }] : []),
+      ],
+    });
   },
   [chatId, isLoading, sendMessage],
 );

// 4. Pass onStop to ChatComposer
-<ChatComposer status={status} onSubmit={handleSubmit} />
+<ChatComposer status={status} onSubmit={handleSubmit} onStop={stop} />
```

### Step 5: Verify tests pass

```bash
npx vitest run src/components/chat/__tests__/chat-composer-multimodal.test.tsx
```

Expected: All 4 tests pass.

### Step 6: Commit

```bash
git add src/components/chat/chat-composer.tsx src/components/chat/chat-panel.tsx src/components/chat/__tests__/chat-composer-multimodal.test.tsx
git commit -m "feat(pr22a): multimodal ChatComposer + parts-based messaging + stop button"
```

---

## Task 5: MessageBubble file part rendering

**Pattern:** Matches `chatbot/components/message.tsx` — extracts file parts from `message.parts`, renders `PreviewAttachment` for each.

**Post-22b state:** `message-bubble.tsx` already has `onToolApproval` prop and tool rendering via `StepsSummary`. User message branch is unchanged by 22b — we add file rendering there.

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Create: `src/components/chat/__tests__/message-bubble-files.test.tsx`

### Step 1: Write the failing test

Create `src/components/chat/__tests__/message-bubble-files.test.tsx`:

```typescript
/**
 * @module components/chat/__tests__/message-bubble-files.test
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { MessageBubble } from "../message-bubble";

describe("MessageBubble file parts", () => {
  it("renders file attachment images in user messages", () => {
    const message = {
      id: "msg-1",
      role: "user" as const,
      parts: [
        {
          type: "file" as const,
          url: "https://storage.example.com/photo.jpg",
          mediaType: "image/jpeg",
          filename: "photo.jpg",
        },
        { type: "text" as const, text: "What is in this image?" },
      ],
    };

    render(<MessageBubble message={message} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://storage.example.com/photo.jpg");
    expect(screen.getByText("What is in this image?")).toBeInTheDocument();
  });

  it("renders multiple file attachments", () => {
    const message = {
      id: "msg-2",
      role: "user" as const,
      parts: [
        {
          type: "file" as const,
          url: "https://storage.example.com/a.jpg",
          mediaType: "image/jpeg",
          filename: "a.jpg",
        },
        {
          type: "file" as const,
          url: "https://storage.example.com/b.png",
          mediaType: "image/png",
          filename: "b.png",
        },
        { type: "text" as const, text: "Compare these" },
      ],
    };

    render(<MessageBubble message={message} />);

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
  });

  it("renders text-only user message without attachment area", () => {
    const message = {
      id: "msg-3",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Hello" }],
    };

    render(<MessageBubble message={message} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders assistant message without file part changes (22b intact)", () => {
    const message = {
      id: "msg-4",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "I can see a cat." }],
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText("I can see a cat.")).toBeInTheDocument();
  });
});
```

### Step 2: Verify tests fail

```bash
npx vitest run src/components/chat/__tests__/message-bubble-files.test.tsx
```

Expected: Fails — user messages don't render file parts.

### Step 3: Update MessageBubble to render file parts

Modify `src/components/chat/message-bubble.tsx`. Only the user message branch changes — assistant rendering (from 22b) stays intact.

Add import:

```typescript
import { PreviewAttachment } from "./preview-attachment";
```

Replace the user message branch. Current (post-22b):

```typescript
if (isUserMessage) {
  return (
    <div data-testid="message-bubble" className="flex w-full justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-sm leading-normal">
        <p className="whitespace-pre-wrap">{getMessageText(message)}</p>
      </div>
    </div>
  );
}
```

New — matches `chatbot/components/message.tsx` file part rendering pattern:

```typescript
if (isUserMessage) {
  const fileParts = message.parts.filter(
    (part) => part.type === "file",
  );
  const text = getMessageText(message);

  return (
    <div data-testid="message-bubble" className="flex w-full flex-col items-end gap-2">
      {fileParts.length > 0 && (
        <div className="flex flex-row justify-end gap-2" data-testid="message-attachments">
          {fileParts.map((part) => (
            <PreviewAttachment
              key={part.url}
              attachment={{
                name: (part as { filename?: string }).filename ?? "file",
                contentType: part.mediaType,
                url: part.url,
              }}
            />
          ))}
        </div>
      )}
      {text.length > 0 && (
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-sm leading-normal">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </div>
  );
}
```

### Step 4: Verify tests pass

```bash
npx vitest run src/components/chat/__tests__/message-bubble-files.test.tsx
```

Expected: All 4 tests pass.

### Step 5: Verify existing 22b tests still pass

```bash
npx vitest run src/components/chat/__tests__/
```

Expected: All chat tests pass (no regression on tool approval rendering).

### Step 6: Commit

```bash
git add src/components/chat/message-bubble.tsx src/components/chat/__tests__/message-bubble-files.test.tsx
git commit -m "feat(pr22a): render file part images in MessageBubble"
```

---

## Task 6: runAgent file parts forwarding

**Files:**
- Modify: `src/lib/runner/schemas.ts` — add `fileParts` to `RunnerPayload`
- Modify: `app/api/chat/route.ts` — extract and forward file parts
- Modify: `src/lib/runner/run-agent.ts` — include file parts in user message persistence
- Create: `src/lib/runner/__tests__/run-agent-multimodal.test.ts`

### Step 1: Write the failing test

Create `src/lib/runner/__tests__/run-agent-multimodal.test.ts`:

```typescript
/**
 * @module lib/runner/__tests__/run-agent-multimodal.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      toUIMessageStream: vi.fn(),
    }),
  };
});
vi.mock("@/lib/ai/gateway", () => ({
  gateway: vi.fn(),
  TIER_1_MODEL: "test-model",
}));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/runner/context", () => ({
  assembleContext: vi.fn().mockResolvedValue({ system: "test", messages: [] }),
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: vi.fn().mockResolvedValue({ created: true, runId: "run-1" }),
  completeRun: vi.fn(),
  markStaleRunsFailed: vi.fn(),
}));
vi.mock("@/lib/runner/run-persistence", () => ({
  finalizeRun: vi.fn(),
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: vi.fn().mockReturnValue({}),
  createStorageTools: vi.fn().mockReturnValue({}),
  createWebTools: vi.fn().mockReturnValue({}),
  createUtilityTools: vi.fn().mockReturnValue({}),
  createTriggerTools: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: vi.fn(),
}));

import { createMessages } from "@/lib/chat/messages";
import { runAgent } from "../run-agent";

const mockSupabase = {} as Parameters<typeof runAgent>[1];

describe("runAgent multimodal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists user message with file parts when fileParts is provided", async () => {
    const fileParts = [
      {
        type: "file" as const,
        url: "https://storage.example.com/photo.jpg",
        name: "photo.jpg",
        mediaType: "image/jpeg",
      },
    ];

    await runAgent(
      {
        clientId: "client-1",
        threadId: "thread-1",
        triggerType: "chat",
        input: "What is in this image?",
        fileParts,
      },
      mockSupabase,
    );

    expect(createMessages).toHaveBeenCalledWith(
      mockSupabase,
      [
        expect.objectContaining({
          thread_id: "thread-1",
          role: "user",
          content: "What is in this image?",
          parts: expect.arrayContaining([
            { type: "file", url: "https://storage.example.com/photo.jpg", name: "photo.jpg", mediaType: "image/jpeg" },
            { type: "text", text: "What is in this image?" },
          ]),
        }),
      ],
    );
  });

  it("persists user message with text-only parts when no fileParts", async () => {
    await runAgent(
      {
        clientId: "client-1",
        threadId: "thread-1",
        triggerType: "chat",
        input: "Hello",
      },
      mockSupabase,
    );

    expect(createMessages).toHaveBeenCalledWith(
      mockSupabase,
      [
        expect.objectContaining({
          parts: [{ type: "text", text: "Hello" }],
        }),
      ],
    );
  });
});
```

### Step 2: Verify tests fail

```bash
npx vitest run src/lib/runner/__tests__/run-agent-multimodal.test.ts
```

Expected: Fails — `RunnerPayload` doesn't have `fileParts`.

### Step 3: Extend RunnerPayload schema

Modify `src/lib/runner/schemas.ts` — add optional `fileParts` field:

```diff
+export const filePartSchema = z.object({
+  type: z.literal("file"),
+  url: z.string().url(),
+  name: z.string().min(1),
+  mediaType: z.string().min(1),
+});
+
 export const runnerPayloadSchema = z.object({
   clientId: z.string().uuid(),
   threadId: z.string().uuid(),
   triggerType: z.enum(triggerTypeValues),
   input: z.string(),
+  fileParts: z.array(filePartSchema).optional(),
 });
```

### Step 4: Update runAgent to include file parts in persistence

Modify `src/lib/runner/run-agent.ts` — update the user message creation block. Current:

```typescript
if (payload.triggerType !== "cron") {
  await createMessages(supabase, [
    {
      thread_id: threadId,
      role: "user",
      content: input,
      parts: [{ type: "text", text: input }] as Json,
    },
  ]);
}
```

New:

```typescript
if (payload.triggerType !== "cron") {
  const parts: Json[] = [
    ...(payload.fileParts ?? []).map((fp) => ({
      type: "file",
      url: fp.url,
      name: fp.name,
      mediaType: fp.mediaType,
    })),
    { type: "text", text: input },
  ];

  await createMessages(supabase, [
    {
      thread_id: threadId,
      role: "user",
      content: input,
      parts: parts as Json,
    },
  ]);
}
```

### Step 5: Update chat route to extract and forward file parts

Modify `app/api/chat/route.ts`. Add a helper to extract file parts from the user message, then pass them to `runAgent`.

Add helper function (after existing `getLatestUserInput`):

```typescript
interface FilePart {
  type: "file";
  url: string;
  name: string;
  mediaType: string;
}

/** Extracts file parts from a UIMessage, matching the chatbot pattern. */
function getFilePartsFromMessage(message: UIMessage): FilePart[] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter(
      (part): part is { type: "file"; url: string; filename?: string; name?: string; mediaType: string } =>
        part.type === "file" &&
        "url" in part &&
        typeof (part as { url?: unknown }).url === "string",
    )
    .map((part) => ({
      type: "file" as const,
      url: part.url,
      name: part.name ?? part.filename ?? "file",
      mediaType: part.mediaType,
    }));
}
```

Update the `runAgent` call:

```diff
+    const fileParts = body.message
+      ? getFilePartsFromMessage(body.message as UIMessage)
+      : [];

     const result = await runAgent(
       {
         clientId,
         threadId,
         triggerType: "chat",
         input,
+        ...(fileParts.length > 0 ? { fileParts } : {}),
       },
       supabase,
     );
```

### Step 6: Verify tests pass

```bash
npx vitest run src/lib/runner/__tests__/run-agent-multimodal.test.ts
```

Expected: Both tests pass.

### Step 7: Run existing runner tests to verify no regressions

```bash
npx vitest run src/lib/runner/__tests__/
```

Expected: All existing runner tests still pass.

### Step 8: Commit

```bash
git add src/lib/runner/schemas.ts src/lib/runner/run-agent.ts app/api/chat/route.ts src/lib/runner/__tests__/run-agent-multimodal.test.ts
git commit -m "feat(pr22a): forward file parts through runner to model"
```

---

## Verification Checklist

After all tasks are complete, verify the full flow end-to-end:

- [ ] User clicks paperclip → file picker opens → selecting image uploads immediately → preview thumbnail appears in input area
- [ ] User pastes image from clipboard → uploads immediately → preview thumbnail appears
- [ ] User can remove attachment by hovering and clicking X before sending
- [ ] User sends message with image → image appears in sent message bubble → model responds about image content
- [ ] User sends text-only message → still works as before (no regression)
- [ ] Stop button appears during streaming → clicking it cancels the stream
- [ ] File validation: rejects files over 5MB, rejects non-JPEG/PNG files (server-side)
- [ ] Tool approval buttons still work (22b not regressed)

### Test Criteria (from v2 plan)

1. User clicks paperclip, selects image, sees preview thumbnail in input area
2. User pastes image from clipboard, sees preview thumbnail
3. User sends message with image, image appears in message bubble
4. Model receives image and responds about its content
5. User can remove attachment before sending
6. Stop button cancels streaming response
