# Presigned Uploads Migration Implementation Plan

**Goal:** Replace server-relay file uploads with presigned direct-to-Supabase uploads, fixing the Vercel 4.5MB payload limit and cutting server bandwidth costs.

**Architecture:** Convert the two upload endpoints (`/api/files/upload` and `/api/crm/attachments/upload`) from FormData-relay routes into JSON "presign" routes that return a signed upload URL + token, then add "confirm" routes that record metadata. Both client callers must migrate to the 3-phase flow: chat composer and the CRM `useUploadAttachment()` hook. The download route and `PreviewAttachment` component are untouched. The chat response contract (`{ url, storagePath, pathname, contentType }`) stays the same so nothing downstream breaks. The CRM confirm route must preserve current rollback behavior by deleting the uploaded storage object if the `record_attachments` insert fails.

**Tech Stack:** Supabase Storage (`createSignedUploadUrl` / `uploadToSignedUrl`), Next.js 15 App Router, Vitest, React Testing Library

**Non-negotiable migration constraints:**
- Move the existing chat `file_uploaded` analytics event from the relay route into the new chat confirm route so analytics do not regress.
- Update existing client tests (`src/components/chat/chat-composer.test.tsx` and `src/hooks/__tests__/use-record-attachments.test.tsx`) as part of the TDD cycle, not after.
- Apply `agent-files` bucket limits via Supabase migration first, then verify via SQL/MCP. Do not rely on dashboard-only config.
- Verify that `text/plain` bucket allowlisting still accepts agent writes with `text/plain; charset=utf-8`.

---

## Task 1: Presign Route for Chat Uploads

Replace `POST /api/files/upload` (FormData relay) with `POST /api/files/presign` (JSON metadata -> signed URL).

**Files:**
- Create: `app/api/files/presign/route.ts`
- Create: `app/api/files/presign/route.test.ts`
- Reference: `app/api/files/upload/route.ts` (current implementation to mirror auth/validation patterns)
- Reference: `src/lib/chat/attachment-config.ts` (ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_SIZE_BYTES)
- Reference: `src/lib/api/route-helpers.ts` (authenticateRequest, jsonError)
- Reference: `src/lib/chat/client-id.ts` (resolveClientId)

**Step 1: Write the failing test for the presign route**

Create `app/api/files/presign/route.test.ts`:

```typescript
/**
 * Tests for the chat attachment presigned upload URL route.
 * @module app/api/files/presign/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockFrom,
  mockCreateSignedUploadUrl,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: mockFrom.mockImplementation(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { POST } from "./route";

function createPresignRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/files/presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "deadbeef-dead-beef-dead-beefdeadbeef",
    );

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl:
          "https://storage.example.com/agent-files/upload/sign/client-1/uploads/1700000000000-deadbeef-screenshot.png",
        path: "client-1/uploads/1700000000000-deadbeef-screenshot.png",
        token: "upload-token-abc",
      },
      error: null,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "no session" },
    });

    const response = await POST(
      createPresignRequest({
        filename: "photo.jpg",
        contentType: "image/jpeg",
        size: 1000,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized.",
    });
  });

  it("returns 400 when filename is missing", async () => {
    const response = await POST(
      createPresignRequest({ contentType: "image/jpeg", size: 1000 }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when contentType is missing", async () => {
    const response = await POST(
      createPresignRequest({ filename: "photo.jpg", size: 1000 }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for unsupported content types", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "archive.zip",
        contentType: "application/zip",
        size: 1000,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File type is not supported for chat uploads",
    });
  });

  it("returns 400 when declared size exceeds 10MB", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "big.pdf",
        contentType: "application/pdf",
        size: 11 * 1024 * 1024,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File size should be less than 10MB",
    });
  });

  it("returns signed upload URL and token for valid request", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "screenshot.png",
        contentType: "image/png",
        size: 5000,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      signedUrl: expect.any(String),
      token: "upload-token-abc",
      path: "client-1/uploads/1700000000000-deadbeef-screenshot.png",
      storagePath: "uploads/1700000000000-deadbeef-screenshot.png",
    });
    expect(mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-screenshot.png",
    );
  });

  it("sanitizes filenames with special characters", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "my report (final).pdf",
        contentType: "application/pdf",
        size: 1000,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-my_report__final_.pdf",
    );
  });

  it("returns 500 when Supabase fails to create signed upload URL", async () => {
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: "storage error" },
    });

    const response = await POST(
      createPresignRequest({
        filename: "photo.png",
        contentType: "image/png",
        size: 1000,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create upload URL",
    });
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
pnpm vitest run app/api/files/presign/route.test.ts
```
Expected: FAIL (module not found)

**Step 3: Implement the presign route**

Create `app/api/files/presign/route.ts`:

```typescript
/**
 * Generates a presigned upload URL for direct browser-to-Supabase file uploads.
 * The client uploads directly to Supabase Storage using the returned URL and token,
 * then confirms the upload via POST /api/files/confirm.
 * @module app/api/files/presign/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";

const BUCKET_ID = "agent-files";

function sanitizeUploadFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "upload";
}

const presignSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().min(1, "Content type is required"),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = presignSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { filename, contentType, size } = parsed.data;

    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      return jsonError("File type is not supported for chat uploads", 400);
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      return jsonError("File size should be less than 10MB", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const sanitizedFilename = sanitizeUploadFilename(filename);
    const storageFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizedFilename}`;
    const relativeStoragePath = `uploads/${storageFilename}`;
    const storagePath = `${clientId}/${relativeStoragePath}`;

    console.info("[api/files/presign] generating signed upload URL", {
      clientId,
      filename,
      sanitizedFilename,
      contentType,
      sizeBytes: size,
      storagePath: relativeStoragePath,
    });

    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return jsonError("Failed to create upload URL", 500);
    }

    return Response.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      storagePath: relativeStoragePath,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
```

**Step 4: Run the test to verify it passes**

```bash
pnpm vitest run app/api/files/presign/route.test.ts
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add app/api/files/presign/route.ts app/api/files/presign/route.test.ts
git commit -m "feat(presigned-uploads): add presign route for chat file uploads"
```

---

## Task 2: Confirm Route for Chat Uploads

Create `POST /api/files/confirm` that the client calls after a successful direct upload to generate the signed GET URL and fire analytics.

**Files:**
- Create: `app/api/files/confirm/route.ts`
- Create: `app/api/files/confirm/route.test.ts`
- Reference: `app/api/files/upload/route.ts:107-138` (signed URL generation + analytics + response shape)

**Step 1: Write the failing test for the confirm route**

Create `app/api/files/confirm/route.test.ts`:

```typescript
/**
 * Tests for the chat attachment upload confirmation route.
 * @module app/api/files/confirm/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockStorageFrom,
  mockCreateSignedUrl,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: mockStorageFrom.mockImplementation(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: vi.fn(),
}));

import { POST } from "./route";

function createConfirmRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/files/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/files/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          "https://storage.example.com/agent-files/client-1/uploads/photo.png?token=signed",
      },
      error: null,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "no session" },
    });

    const response = await POST(
      createConfirmRequest({
        storagePath: "uploads/photo.png",
        filename: "photo.png",
        contentType: "image/png",
        size: 5000,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when storagePath is missing", async () => {
    const response = await POST(
      createConfirmRequest({
        filename: "photo.png",
        contentType: "image/png",
        size: 5000,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when storagePath contains traversal", async () => {
    const response = await POST(
      createConfirmRequest({
        storagePath: "../etc/passwd",
        filename: "passwd",
        contentType: "text/plain",
        size: 100,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid storage path",
    });
  });

  it("returns 400 when storagePath is not under uploads/", async () => {
    const response = await POST(
      createConfirmRequest({
        storagePath: "home/secret.txt",
        filename: "secret.txt",
        contentType: "text/plain",
        size: 100,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid storage path",
    });
  });

  it("confirms upload and returns signed GET URL with metadata", async () => {
    const response = await POST(
      createConfirmRequest({
        storagePath: "uploads/1700000000000-deadbeef-screenshot.png",
        filename: "screenshot.png",
        contentType: "image/png",
        size: 5000,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/photo.png?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-screenshot.png",
      pathname: "screenshot.png",
      contentType: "image/png",
    });
    expect(mockStorageFrom).toHaveBeenCalledWith("agent-files");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-screenshot.png",
      3600,
    );
  });

  it("returns 500 when signed URL generation fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "storage error" },
    });

    const response = await POST(
      createConfirmRequest({
        storagePath: "uploads/photo.png",
        filename: "photo.png",
        contentType: "image/png",
        size: 5000,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Upload confirmation failed",
    });
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
pnpm vitest run app/api/files/confirm/route.test.ts
```
Expected: FAIL (module not found)

**Step 3: Implement the confirm route**

Create `app/api/files/confirm/route.ts`:

```typescript
/**
 * Confirms a direct-to-Supabase file upload, generates a signed GET URL, and fires analytics.
 * Called by the client after a successful uploadToSignedUrl().
 * @module app/api/files/confirm/route
 */
import { z } from "zod";

import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";

const BUCKET_ID = "agent-files";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

const confirmSchema = z.object({
  storagePath: z.string().min(1, "Storage path is required"),
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().min(1, "Content type is required"),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { storagePath, filename, contentType, size } = parsed.data;

    // Validate path: must be under uploads/, no traversal
    if (storagePath.includes("..") || !storagePath.startsWith("uploads/")) {
      return jsonError("Invalid storage path", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const fullPath = `${clientId}/${storagePath}`;

    const signedUrlResponse = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUrl(fullPath, SIGNED_URL_EXPIRY_SECONDS);

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      return jsonError("Upload confirmation failed", 500);
    }

    console.info("[api/files/confirm] confirmed chat upload", {
      clientId,
      filename,
      contentType,
      sizeBytes: size,
      storagePath,
    });

    await captureServerEvent({
      distinctId: clientId,
      event: "file_uploaded",
      properties: {
        file_type: contentType,
        size_bytes: size,
      },
    });

    return Response.json({
      url: signedUrlResponse.data.signedUrl,
      storagePath,
      pathname: filename,
      contentType,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
```

**Step 4: Run the test to verify it passes**

```bash
pnpm vitest run app/api/files/confirm/route.test.ts
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add app/api/files/confirm/route.ts app/api/files/confirm/route.test.ts
git commit -m "feat(presigned-uploads): add confirm route for chat file uploads"
```

---

## Task 3: Presign + Confirm Routes for CRM Attachments

Convert `POST /api/crm/attachments/upload` (FormData relay) into presign + confirm. CRM attachments additionally insert a `record_attachments` row with metadata.

**Files:**
- Create: `app/api/crm/attachments/presign/route.ts`
- Create: `app/api/crm/attachments/presign/route.test.ts`
- Create: `app/api/crm/attachments/confirm/route.ts`
- Create: `app/api/crm/attachments/confirm/route.test.ts`
- Modify: `src/hooks/use-record-attachments.ts`
- Modify: `src/hooks/__tests__/use-record-attachments.test.tsx`
- Reference: `app/api/crm/attachments/upload/route.ts` (current implementation)
- Reference: `app/api/crm/attachments/upload/route.test.ts` (existing test patterns)
- Reference: `src/lib/crm/schemas.ts:272` (`recordAttachmentTypeValues = ["contact", "company", "deal"]`)
- Reference: `src/lib/crm/file-categories.ts` (`getFileCategory`)

**Acceptance criteria additions:**
- The CRM client hook uses presign -> `uploadToSignedUrl()` -> confirm instead of posting `FormData` to `/api/crm/attachments/upload`.
- The CRM confirm route deletes the uploaded object when the `record_attachments` insert fails, matching the current relay route semantics.
- The returned attachment row shape remains unchanged for drawer consumers and TanStack Query cache updates.

**Step 1: Write the failing test for the CRM presign route**

Create `app/api/crm/attachments/presign/route.test.ts`:

```typescript
/**
 * Tests for the CRM attachment presigned upload URL route.
 * @module app/api/crm/attachments/presign/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockStorageFrom,
  mockCreateSignedUploadUrl,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: mockStorageFrom.mockImplementation(() => ({
        createSignedUploadUrl: mockCreateSignedUploadUrl,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { POST } from "./route";

const validRecordId = "123e4567-e89b-42d3-a456-426614174000";

function createPresignRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/crm/attachments/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/crm/attachments/presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1");

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/upload/sign/path",
        path: `client-1/attachments/contact/${validRecordId}/uuid-1`,
        token: "upload-token-xyz",
      },
      error: null,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "no session" },
    });

    const response = await POST(
      createPresignRequest({
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 1000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for unsupported content types", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "archive.zip",
        contentType: "application/zip",
        size: 1000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid record_type", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 1000,
        record_type: "invalid",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid record_id", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 1000,
        record_type: "contact",
        record_id: "not-a-uuid",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns signed upload URL for valid CRM attachment", async () => {
    const response = await POST(
      createPresignRequest({
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 5000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      signedUrl: expect.any(String),
      token: "upload-token-xyz",
      path: `client-1/attachments/contact/${validRecordId}/uuid-1`,
      storagePath: `attachments/contact/${validRecordId}/uuid-1`,
    });
    expect(mockStorageFrom).toHaveBeenCalledWith("agent-files");
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      `client-1/attachments/contact/${validRecordId}/uuid-1`,
    );
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
pnpm vitest run app/api/crm/attachments/presign/route.test.ts
```
Expected: FAIL (module not found)

**Step 3: Implement the CRM presign route**

Create `app/api/crm/attachments/presign/route.ts`:

```typescript
/**
 * Generates a presigned upload URL for direct browser-to-Supabase CRM attachment uploads.
 * @module app/api/crm/attachments/presign/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/chat/attachment-config";
import { recordAttachmentTypeValues } from "@/lib/crm/schemas";

const BUCKET_ID = "agent-files";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = presignSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { contentType, size, record_type, record_id } = parsed.data;

    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
      return jsonError("File type not supported", 400);
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      return jsonError("File size must be under 10 MB", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const relativeStoragePath = `attachments/${record_type}/${record_id}/${crypto.randomUUID()}`;
    const storagePath = `${clientId}/${relativeStoragePath}`;

    console.info("[crm/attachments/presign] generating signed upload URL", {
      clientId,
      record_type,
      record_id,
      contentType,
      sizeBytes: size,
      storagePath: relativeStoragePath,
    });

    const { data, error } = await supabase.storage
      .from(BUCKET_ID)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return jsonError("Failed to create upload URL", 500);
    }

    return Response.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      storagePath: relativeStoragePath,
    });
  } catch {
    return jsonError("Failed to process request", 500);
  }
}
```

**Step 4: Run the test to verify it passes**

```bash
pnpm vitest run app/api/crm/attachments/presign/route.test.ts
```
Expected: All tests PASS

**Step 5: Write the failing test for the CRM confirm route**

Create `app/api/crm/attachments/confirm/route.test.ts`:

```typescript
/**
 * Tests for the CRM attachment upload confirmation route.
 * @module app/api/crm/attachments/confirm/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockStorageFrom,
  mockCreateSignedUrl,
  mockRemove,
  mockDbFrom,
  mockInsert,
  mockSelect,
  mockSingle,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockRemove: vi.fn(),
  mockDbFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockDbFrom,
    storage: {
      from: mockStorageFrom.mockImplementation(() => ({
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { POST } from "./route";

const validRecordId = "123e4567-e89b-42d3-a456-426614174000";

function createConfirmRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/crm/attachments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/crm/attachments/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed-url" },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: {
        attachment_id: "att-1",
        client_id: "client-1",
        record_type: "contact",
        record_id: validRecordId,
        filename: "brief.pdf",
        storage_path: `attachments/contact/${validRecordId}/uuid-1`,
        content_type: "application/pdf",
        file_size: 5000,
        file_category: "pdf",
        created_at: "2026-04-13T00:00:00Z",
        updated_at: "2026-04-13T00:00:00Z",
      },
      error: null,
    });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockDbFrom.mockReturnValue({ insert: mockInsert });
    mockRemove.mockResolvedValue({ data: [], error: null });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "no session" },
    });

    const response = await POST(
      createConfirmRequest({
        storagePath: `attachments/contact/${validRecordId}/uuid-1`,
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 5000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("confirms upload, inserts attachment row, and returns metadata", async () => {
    const response = await POST(
      createConfirmRequest({
        storagePath: `attachments/contact/${validRecordId}/uuid-1`,
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 5000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachment.attachment_id).toBe("att-1");
    expect(body.url).toBe("https://storage.example.com/signed-url");
    expect(mockInsert).toHaveBeenCalledWith({
      client_id: "client-1",
      record_type: "contact",
      record_id: validRecordId,
      filename: "brief.pdf",
      storage_path: `attachments/contact/${validRecordId}/uuid-1`,
      content_type: "application/pdf",
      file_size: 5000,
      file_category: "pdf",
    });
  });

  it("cleans up storage file when DB insert fails", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const response = await POST(
      createConfirmRequest({
        storagePath: `attachments/contact/${validRecordId}/uuid-1`,
        filename: "brief.pdf",
        contentType: "application/pdf",
        size: 5000,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(500);
    expect(mockRemove).toHaveBeenCalledWith([
      `client-1/attachments/contact/${validRecordId}/uuid-1`,
    ]);
  });

  it("returns 400 when storagePath contains traversal", async () => {
    const response = await POST(
      createConfirmRequest({
        storagePath: "../etc/passwd",
        filename: "passwd",
        contentType: "text/plain",
        size: 100,
        record_type: "contact",
        record_id: validRecordId,
      }),
    );

    expect(response.status).toBe(400);
  });
});
```

**Step 6: Run the test to verify it fails**

```bash
pnpm vitest run app/api/crm/attachments/confirm/route.test.ts
```
Expected: FAIL (module not found)

**Step 7: Implement the CRM confirm route**

Create `app/api/crm/attachments/confirm/route.ts`:

```typescript
/**
 * Confirms a direct-to-Supabase CRM attachment upload.
 * Generates a signed GET URL and inserts the record_attachments metadata row.
 * @module app/api/crm/attachments/confirm/route
 */
import { z } from "zod";

import { authenticateRequest, jsonError } from "@/lib/api/route-helpers";
import { resolveClientId } from "@/lib/chat/client-id";
import { getFileCategory } from "@/lib/crm/file-categories";
import { recordAttachmentTypeValues } from "@/lib/crm/schemas";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

const confirmSchema = z.object({
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  record_type: z.enum(recordAttachmentTypeValues),
  record_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const authResult = await authenticateRequest();
  if (authResult.kind === "error") return authResult.response;
  const { supabase, userId } = authResult;

  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        parsed.error.issues.map((issue) => issue.message).join(", "),
        400,
      );
    }

    const { storagePath, filename, contentType, size, record_type, record_id } =
      parsed.data;

    if (storagePath.includes("..") || !storagePath.startsWith("attachments/")) {
      return jsonError("Invalid storage path", 400);
    }

    const clientId = await resolveClientId(supabase, userId);
    const fullPath = `${clientId}/${storagePath}`;

    console.info("[crm/attachments/confirm] confirming attachment", {
      clientId,
      filename,
      record_type,
      record_id,
      contentType,
      sizeBytes: size,
      storagePath,
    });

    const signedUrlResponse = await supabase.storage
      .from(AGENT_FILES_BUCKET)
      .createSignedUrl(fullPath, SIGNED_URL_EXPIRY_SECONDS, {
        download: filename,
      });

    if (signedUrlResponse.error || !signedUrlResponse.data?.signedUrl) {
      return jsonError("Failed to confirm upload", 500);
    }

    const { data: attachment, error: insertError } = await supabase
      .from("record_attachments")
      .insert({
        client_id: clientId,
        record_type,
        record_id,
        filename,
        storage_path: storagePath,
        content_type: contentType,
        file_size: size,
        file_category: getFileCategory(filename),
      })
      .select()
      .single();

    if (insertError || !attachment) {
      await supabase.storage.from(AGENT_FILES_BUCKET).remove([fullPath]);
      return jsonError("Failed to create attachment record", 500);
    }

    console.info("[crm/attachments/confirm] confirmed attachment", {
      clientId,
      attachmentId: attachment.attachment_id,
      filename,
      record_type,
      record_id,
      storagePath,
    });

    return Response.json({
      attachment,
      url: signedUrlResponse.data.signedUrl,
    });
  } catch {
    return jsonError("Failed to process upload", 500);
  }
}
```

**Step 8: Run the test to verify it passes**

```bash
pnpm vitest run app/api/crm/attachments/presign/route.test.ts app/api/crm/attachments/confirm/route.test.ts
```
Expected: All tests PASS

**Step 9: Commit**

```bash
git add app/api/crm/attachments/presign/ app/api/crm/attachments/confirm/
git commit -m "feat(presigned-uploads): add presign + confirm routes for CRM attachments"
```

---

## Task 4: Update Client Upload Callers to Use 3-Phase Upload Flow

Switch both client upload callers from relay POSTs to the 3-phase flow: presign -> direct upload -> confirm.

**Files:**
- Modify: `src/components/chat/chat-composer.tsx:122-156` (the `uploadFile` callback)
- Modify: `src/components/chat/chat-composer.test.tsx` (update mock fetch expectations)
- Modify: `src/hooks/use-record-attachments.ts`
- Modify: `src/hooks/__tests__/use-record-attachments.test.tsx`
- Reference: `src/lib/chat/attachment-config.ts` (ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_SIZE_BYTES for client-side pre-validation)

**Acceptance criteria additions:**
- Chat performs `POST /api/files/presign`, `uploadToSignedUrl()`, then `POST /api/files/confirm`.
- CRM attachments perform `POST /api/crm/attachments/presign`, `uploadToSignedUrl()`, then `POST /api/crm/attachments/confirm`.
- Existing user-visible behavior remains the same: previews render, submit remains blocked during uploads, and successful responses still hydrate the same attachment metadata.

**Step 1: Update the composer test for the new 3-phase flow**

The test currently mocks a single `fetch` call that returns `{ url, storagePath, pathname, contentType }`. After the change, there will be three calls: presign, uploadToSignedUrl (via Supabase client), and confirm.

However, since `uploadToSignedUrl` uses the Supabase JS client (not `fetch` directly), the simplest approach is to:
1. Mock `fetch` for presign and confirm calls
2. Mock the Supabase browser client for the direct upload

Update `src/components/chat/chat-composer.test.tsx`:

Replace the mock setup and the upload test to account for the 3-phase flow:

```typescript
// Replace the existing mockFetch pattern. The composer now makes 2 fetch calls
// (presign + confirm) and 1 Supabase client call (uploadToSignedUrl).

const mockUploadToSignedUrl = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: mockUploadToSignedUrl,
      })),
    },
  })),
}));
```

For the upload tests, configure `mockFetch` to return different responses based on URL:

```typescript
// In the "uploads a selected image" test:
mockFetch
  // Phase 1: presign
  .mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        signedUrl: "https://storage.example.com/upload/sign/path",
        token: "upload-token",
        path: "client-1/uploads/photo.png",
        storagePath: "uploads/photo.png",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  )
  // Phase 3: confirm
  .mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        url: "https://storage.example.com/agent-files/client-1/uploads/photo.png?token=signed",
        storagePath: "uploads/photo.png",
        pathname: "photo.png",
        contentType: "image/png",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

// Phase 2: direct upload
mockUploadToSignedUrl.mockResolvedValue({ data: { path: "uploads/photo.png" }, error: null });
```

> **Note for the implementer:** The exact mock wiring depends on how the Supabase browser client is imported. Check how `createClient` is imported in the composer (likely `@/lib/supabase/client`) and mock accordingly. The key change is: `fetch` is called twice (presign, confirm), and `supabase.storage.from().uploadToSignedUrl()` is called once between them.

**Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/components/chat/chat-composer.test.tsx
```
Expected: FAIL (fetch is called with wrong URL/body)

**Step 3: Update the uploadFile function in chat-composer.tsx**

Replace lines 122-156 of `src/components/chat/chat-composer.tsx`:

```typescript
const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
  try {
    // Phase 1: Get presigned upload URL
    const presignResponse = await fetch("/api/files/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });

    if (!presignResponse.ok) {
      const payload = await presignResponse.json().catch(() => null) as { error?: string } | null;
      toast.error(payload?.error ?? "Failed to prepare upload.");
      return null;
    }

    const { token, path, storagePath } = await presignResponse.json() as {
      signedUrl: string;
      token: string;
      path: string;
      storagePath: string;
    };

    // Phase 2: Upload directly to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("agent-files")
      .uploadToSignedUrl(path, token, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      toast.error("Failed to upload file.");
      return null;
    }

    // Phase 3: Confirm upload and get signed GET URL
    const confirmResponse = await fetch("/api/files/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });

    if (!confirmResponse.ok) {
      const payload = await confirmResponse.json().catch(() => null) as { error?: string } | null;
      toast.error(payload?.error ?? "Failed to confirm upload.");
      return null;
    }

    const payload = await confirmResponse.json() as {
      url: string;
      storagePath: string;
      pathname: string;
      contentType: string;
    };

    return {
      url: payload.url,
      filename: payload.pathname,
      contentType: payload.contentType,
      storagePath: payload.storagePath,
    };
  } catch {
    toast.error("Failed to upload file.");
    return null;
  }
}, [supabase]);
```

You also need to add the Supabase browser client import at the top of `chat-composer.tsx`:

```typescript
import { createClient } from "@/lib/supabase/client";
```

And create the client inside the component (or import a singleton — check how other components in `src/components/chat/` use the browser client):

```typescript
// Inside the ChatComposer component, before the uploadFile callback:
const supabase = createClient();
```

> **Note for the implementer:** Check how the Supabase browser client is created elsewhere in the codebase. Search for `createClient` imports in `src/components/` to find the pattern. It might be a hook (`useSupabase`) or a direct import. Match the existing pattern.

**Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/components/chat/chat-composer.test.tsx
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/components/chat/chat-composer.tsx src/components/chat/chat-composer.test.tsx
git commit -m "feat(presigned-uploads): switch chat composer to 3-phase presigned upload flow"
```

---

## Task 5: Delete Legacy Upload Routes

Remove the old server-relay routes now that the new presigned flow is in place.

**Files:**
- Delete: `app/api/files/upload/route.ts`
- Delete: `app/api/files/upload/route.test.ts`
- Delete: `app/api/crm/attachments/upload/route.ts`
- Delete: `app/api/crm/attachments/upload/route.test.ts`

**Step 1: Search for any remaining references to the old endpoints**

```bash
pnpm grep -r "api/files/upload" --include="*.ts" --include="*.tsx" | grep -v "presign" | grep -v "confirm" | grep -v ".test."
pnpm grep -r "api/crm/attachments/upload" --include="*.ts" --include="*.tsx" | grep -v "presign" | grep -v "confirm" | grep -v ".test."
```

> **Note for the implementer:** If any files still reference `/api/files/upload` or `/api/crm/attachments/upload`, update those references to the new presign flow before deleting. Common places: other components that upload CRM attachments (look for `FormData` + `fetch` patterns in `src/components/crm/`).

**Step 2: Delete the legacy files**

```bash
rm app/api/files/upload/route.ts app/api/files/upload/route.test.ts
rm app/api/crm/attachments/upload/route.ts app/api/crm/attachments/upload/route.test.ts
```

**Step 3: Run the full test suite to verify nothing breaks**

```bash
pnpm vitest run
```
Expected: All tests PASS (the deleted test files won't run)

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(presigned-uploads): remove legacy server-relay upload routes"
```

---

## Task 6: Supabase Bucket Configuration

Configure the `agent-files` bucket to enforce file size and MIME type limits at the infrastructure level. This is the security backstop — even if client-side validation is bypassed, Supabase rejects invalid uploads.

**Files:**
- Create: `supabase/migrations/*_lock_down_agent_files_bucket_upload_limits.sql`
- Create/Modify: `supabase/migrations/__tests__/*` (migration contract test if the repo already covers bucket migrations)

**Step 1: Check current bucket configuration**

Go to the Supabase dashboard: **Storage > agent-files bucket > Settings**

Or run via Supabase MCP / SQL:

```sql
SELECT id, name, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name = 'agent-files';
```

**Step 2: Add a migration that updates the bucket limits**

Set these values via Supabase migration and apply them with Supabase MCP:

- **Max file size:** `10485760` (10 MB in bytes)
- **Allowed MIME types:** `["image/jpeg","image/png","image/webp","application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/msword","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel","text/csv","text/plain","text/markdown","text/html","text/xml","application/json"]`

> **Important:** This list must match the `ALLOWED_UPLOAD_TYPES` set in `src/lib/chat/attachment-config.ts`. If you add or remove types there, update the bucket config too. The agent also uploads `text/plain; charset=utf-8` files via `createAgentFileClient.uploadFile()` — verify that `text/plain` in the allowed list covers this (it should, since Supabase matches the base type).

```sql
UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv','text/plain','text/markdown','text/html','text/xml',
    'application/json'
  ]
WHERE name = 'agent-files';
```

> **Caution:** The agent-files bucket is also used by the agent for writing text files (`SOUL.md`, `USER.md`, `MEMORY.md`, etc.) via `uploadFile()` in `src/lib/storage/agent-files.ts:244-256`. Those use `text/plain; charset=utf-8` content type. Supabase matches against base MIME types, so `text/plain` in the allowed list covers `text/plain; charset=utf-8`. Verify this works after applying the restriction by testing that the agent can still write memory files.

**Step 3: Verify the bucket config**

```sql
SELECT id, name, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name = 'agent-files';
```

Expected: `file_size_limit = 10485760`, `allowed_mime_types` populated with the full list.

**Step 4: Test that agent file writes still work**

Start a chat session and verify the agent can still write to SOUL.md / MEMORY.md. If `text/plain; charset=utf-8` is rejected, you'll need to also add that exact string to the allowed list, or switch the agent-files writer to use `text/plain` without the charset parameter.

---

## Task 7: End-to-End Smoke Test

Verify the full upload flow works in the browser.

**Files:**
- None (manual testing)

**Step 1: Start the dev server**

```bash
pnpm dev
```

**Step 2: Test chat file upload (happy path)**

1. Open `http://localhost:3000/chat`
2. Click the paperclip icon
3. Select a PNG image under 10MB
4. Verify the thumbnail preview appears
5. Send the message
6. Verify the image appears in the message bubble

**Step 3: Test chat file upload (edge cases)**

1. Upload a 5MB PDF - should work
2. Upload a CSV file - should work
3. Paste an image from clipboard - should work
4. Try uploading a `.zip` file - should be rejected by the file input `accept` attribute
5. Try uploading an 11MB file - should show error toast

**Step 4: Test CRM attachment upload**

1. Navigate to a CRM contact/company/deal detail page
2. Upload a file attachment
3. Verify the attachment row appears with correct filename and category icon
4. Click the download link - verify the file downloads

**Step 5: Test agent file writes**

1. Start a new chat
2. Ask the agent to "write a note to my memory"
3. Verify no storage errors in the server logs (check that `text/plain; charset=utf-8` is still accepted by the bucket config)

**Step 6: Check browser DevTools network tab**

During a file upload, verify:
- `POST /api/files/presign` returns 200 with signed URL + token (small JSON payload)
- The PUT to `supabase.co/storage/v1/upload/sign/...` sends the file bytes directly (not through your server)
- `POST /api/files/confirm` returns 200 with signed GET URL

> **Key verification:** The file bytes should NOT appear in any request to your Vercel API routes. Only JSON metadata should flow through your server.
