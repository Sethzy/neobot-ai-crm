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
  mockCaptureServerEvent,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockCaptureServerEvent: vi.fn(),
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
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
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
    expect(mockCaptureServerEvent).toHaveBeenCalledWith({
      distinctId: "client-1",
      event: "file_uploaded",
      properties: {
        file_type: "image/png",
        size_bytes: 5000,
      },
    });
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
