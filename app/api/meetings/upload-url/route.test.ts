/**
 * Tests for the meeting audio signed upload route.
 * @module app/api/meetings/upload-url/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockJsonError,
  mockResolveClientId,
  mockCreateSignedUploadUrl,
  mockFrom,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockJsonError: vi.fn((message: string, status: number) =>
    Response.json({ error: message }, { status })),
  mockResolveClientId: vi.fn(),
  mockCreateSignedUploadUrl: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (...args: unknown[]) => mockJsonError(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { POST } from "./route";

describe("POST /api/meetings/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("12345678-1234-5678-9abc-123456789abc");

    mockFrom.mockReturnValue({
      createSignedUploadUrl: mockCreateSignedUploadUrl,
    });

    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {
        storage: {
          from: mockFrom,
        },
      },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/upload",
        token: "signed-upload-token",
      },
      error: null,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/meetings/upload-url", {
        method: "POST",
        body: JSON.stringify({
          filename: "meeting.webm",
          contentType: "audio/webm",
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 for unsupported audio formats", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/upload-url", {
        method: "POST",
        body: JSON.stringify({
          filename: "meeting.txt",
          contentType: "text/plain",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported audio format",
    });
  });

  it("returns a signed upload payload for supported audio", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/upload-url", {
        method: "POST",
        body: JSON.stringify({
          filename: "meeting.webm",
          contentType: "audio/webm",
          durationSeconds: 90,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploadUrl: "https://storage.example.com/upload",
      storagePath: "client-1/meetings/raw/12345678-1234-5678-9abc-123456789abc.webm",
      token: "signed-upload-token",
    });
    expect(mockResolveClientId).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: {
          from: mockFrom,
        },
      }),
      "user-1",
    );
    expect(mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      "client-1/meetings/raw/12345678-1234-5678-9abc-123456789abc.webm",
    );
  });
});
