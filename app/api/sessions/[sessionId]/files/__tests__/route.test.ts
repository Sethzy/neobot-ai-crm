import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDownloadSessionFiles,
  mockAuthenticate,
  mockResolveClientId,
} = vi.hoisted(() => ({
  mockDownloadSessionFiles: vi.fn(),
  mockAuthenticate: vi.fn(),
  mockResolveClientId: vi.fn(),
}));

vi.mock("@/lib/managed-agents/download-session-files", () => ({
  downloadSessionFiles: mockDownloadSessionFiles,
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: mockAuthenticate,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

import { GET } from "../route";

describe("GET /api/sessions/[sessionId]/files", () => {
  beforeEach(() => {
    mockDownloadSessionFiles.mockReset();
    mockAuthenticate.mockResolvedValue({
      kind: "ok",
      supabase: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { session_id: "session_abc" },
                }),
              }),
            }),
          }),
        }),
      },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
  });

  it("returns the mirrored file list on success", async () => {
    mockDownloadSessionFiles.mockResolvedValue([
      {
        anthropicFileId: "f1",
        filename: "out.pdf",
        storagePath: "sessions/session_abc/out.pdf",
        signedUrl: "https://s.example",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/sessions/session_abc/files"),
      { params: Promise.resolve({ sessionId: "session_abc" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          anthropicFileId: "f1",
          filename: "out.pdf",
          storagePath: "sessions/session_abc/out.pdf",
          signedUrl: "https://s.example",
        },
      ],
    });
  });

  it("returns 401 on auth failure", async () => {
    mockAuthenticate.mockResolvedValue({
      kind: "error",
      response: new Response("unauth", { status: 401 }),
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/session_abc/files"),
      { params: Promise.resolve({ sessionId: "session_abc" }) },
    );

    expect(response.status).toBe(401);
  });
});
