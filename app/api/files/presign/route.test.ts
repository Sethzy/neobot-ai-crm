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
    await expect(response.json()).resolves.toEqual({
      signedUrl:
        "https://storage.example.com/agent-files/upload/sign/client-1/uploads/1700000000000-deadbeef-screenshot.png",
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
