/**
 * Tests for the on-demand file download route.
 * @module app/api/files/download/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockFrom,
  mockCreateSignedUrl,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: mockFrom.mockImplementation(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

import { GET } from "./route";

describe("GET /api/files/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/report.csv?token=signed",
      },
      error: null,
    });
  });

  it("returns 307 redirect with a signed URL for a valid workspace path", async () => {
    const response = await GET(
      new Request("http://localhost/api/files/download?path=uploads/report.csv"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "https://storage.example.com/agent-files/client-1/uploads/report.csv?token=signed",
    );
    expect(mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("client-1/uploads/report.csv", 3600);
  });

  it("allows attachment downloads and forwards the display filename", async () => {
    const response = await GET(
      new Request("http://localhost/api/files/download?path=attachments/contact/c-1/uuid-1&filename=brief.pdf"),
    );

    expect(response.status).toBe(307);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "client-1/attachments/contact/c-1/uuid-1",
      3600,
      { download: "brief.pdf" },
    );
  });

  it("returns 400 when path is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/files/download"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing path." });
  });

  it("returns 400 for directory traversal attempts", async () => {
    const response = await GET(
      new Request("http://localhost/api/files/download?path=../other-client/secrets.txt"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid path." });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });

    const response = await GET(
      new Request("http://localhost/api/files/download?path=uploads/report.csv"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 500 when signed URL generation fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "sign failed" } });

    const response = await GET(
      new Request("http://localhost/api/files/download?path=uploads/report.csv"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to download file." });
  });
});
