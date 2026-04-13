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
    await expect(response.json()).resolves.toEqual({
      signedUrl: "https://storage.example.com/upload/sign/path",
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
