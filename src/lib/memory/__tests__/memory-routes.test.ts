/**
 * Contract tests for memory API routes.
 * @module lib/memory/__tests__/memory-routes
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateClient,
  mockResolveClientId,
  mockListMemoryFiles,
  mockBootstrapMemoryFiles,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockListMemoryFiles: vi.fn(),
  mockBootstrapMemoryFiles: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/memory/loader", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/memory/loader")>();
  return {
    ...original,
    listMemoryFiles: mockListMemoryFiles,
  };
});

vi.mock("@/lib/memory/bootstrap", () => ({
  bootstrapMemoryFiles: mockBootstrapMemoryFiles,
}));

import { GET as getMemoryFile } from "../../../../app/api/memory/file/route";
import { GET as getMemoryFiles } from "../../../../app/api/memory/files/route";
import { PUT as putMemoryFile } from "../../../../app/api/memory/file/route";

function createSupabaseMock() {
  const mockGetUser = vi.fn();
  const mockDownload = vi.fn();
  const mockUpload = vi.fn();
  const mockFrom = vi.fn(() => ({ download: mockDownload, upload: mockUpload }));

  return {
    client: {
      auth: { getUser: mockGetUser },
      storage: { from: mockFrom },
    },
    mockGetUser,
    mockDownload,
    mockUpload,
    mockFrom,
  };
}

describe("memory routes", () => {
  const clientId = "660e8400-e29b-41d4-a716-446655440000";
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    supabaseMock = createSupabaseMock();
    mockCreateClient.mockResolvedValue(supabaseMock.client);
    mockResolveClientId.mockResolvedValue(clientId);
    mockBootstrapMemoryFiles.mockResolvedValue(undefined);
    supabaseMock.mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns 401 for unauthenticated /api/memory/files", async () => {
    supabaseMock.mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "missing auth" },
    });

    const response = await getMemoryFiles();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns file metadata list from /api/memory/files", async () => {
    mockListMemoryFiles.mockResolvedValueOnce([
      { name: "SOUL.md", path: "SOUL.md", updatedAt: "2026-03-05T00:00:00Z" },
    ]);

    const response = await getMemoryFiles();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      files: [{ name: "SOUL.md", path: "SOUL.md", updatedAt: "2026-03-05T00:00:00Z" }],
    });
    expect(mockResolveClientId).toHaveBeenCalledWith(supabaseMock.client, "user-1");
    expect(mockBootstrapMemoryFiles).toHaveBeenCalledWith(supabaseMock.client, clientId);
    expect(mockListMemoryFiles).toHaveBeenCalledWith(supabaseMock.client, clientId);
  });

  it("returns 500 when /api/memory/files listing fails", async () => {
    mockListMemoryFiles.mockRejectedValueOnce(new Error("boom"));

    const response = await getMemoryFiles();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load memory files." });
  });

  it("returns 401 for unauthenticated /api/memory/file GET", async () => {
    supabaseMock.mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "missing auth" },
    });

    const request = new Request("http://localhost/api/memory/file?path=SOUL.md");
    const response = await getMemoryFile(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns 401 for unauthenticated /api/memory/file PUT", async () => {
    supabaseMock.mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "missing auth" },
    });

    const request = new Request("http://localhost/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "USER.md", content: "x" }),
    });
    const response = await putMemoryFile(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("rejects non-memory paths in /api/memory/file GET", async () => {
    const request = new Request("http://localhost/api/memory/file?path=vault/secret.md");

    const response = await getMemoryFile(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid request.",
    });
  });

  it("rejects traversal paths in /api/memory/file GET", async () => {
    const attempts = [
      "../SOUL.md",
      "memory/../SOUL.md",
      "..%2FSOUL.md",
    ];

    for (const path of attempts) {
      const request = new Request(
        `http://localhost/api/memory/file?path=${encodeURIComponent(path)}`,
      );
      const response = await getMemoryFile(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid request." });
    }
  });

  it("reads one allowed memory file", async () => {
    supabaseMock.mockDownload.mockResolvedValueOnce({
      data: { text: vi.fn().mockResolvedValue("# User profile") },
      error: null,
    });

    const request = new Request("http://localhost/api/memory/file?path=USER.md");
    const response = await getMemoryFile(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      path: "USER.md",
      content: "# User profile",
    });
    expect(mockBootstrapMemoryFiles).toHaveBeenCalledWith(supabaseMock.client, clientId);
    expect(supabaseMock.mockDownload).toHaveBeenCalledWith(`${clientId}/USER.md`);
  });

  it("returns 404 for missing memory file", async () => {
    supabaseMock.mockDownload.mockResolvedValueOnce({
      data: null,
      error: { message: "Object not found", status: 404, statusCode: "404" },
    });

    const request = new Request("http://localhost/api/memory/file?path=SOUL.md");
    const response = await getMemoryFile(request);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "File not found." });
  });

  it("returns generic 500 when /api/memory/file GET fails unexpectedly", async () => {
    supabaseMock.mockDownload.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied", status: 500, statusCode: "500" },
    });

    const request = new Request("http://localhost/api/memory/file?path=SOUL.md");
    const response = await getMemoryFile(request);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load memory file." });
  });

  it("rejects invalid JSON body in /api/memory/file PUT", async () => {
    const request = new Request("http://localhost/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });

    const response = await putMemoryFile(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body." });
  });

  it("rejects disallowed path in /api/memory/file PUT", async () => {
    const request = new Request("http://localhost/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "vault/hidden.md", content: "x" }),
    });

    const response = await putMemoryFile(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body." });
  });

  it("rejects traversal paths in /api/memory/file PUT", async () => {
    const attempts = [
      "../USER.md",
      "memory/../preferences.md",
      "..%2FUSER.md",
    ];

    for (const path of attempts) {
      const request = new Request("http://localhost/api/memory/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: "x" }),
      });
      const response = await putMemoryFile(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid request body." });
    }
  });

  it("writes allowed memory file and normalizes path", async () => {
    supabaseMock.mockUpload.mockResolvedValueOnce({ data: { path: "ok" }, error: null });

    const request = new Request("http://localhost/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/memory/preferences.md", content: "pref" }),
    });

    const response = await putMemoryFile(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, path: "memory/preferences.md" });
    expect(supabaseMock.mockUpload).toHaveBeenCalledWith(
      `${clientId}/memory/preferences.md`,
      "pref",
      {
        upsert: true,
        contentType: "text/plain; charset=utf-8",
      },
    );
  });

  it("returns generic 500 when /api/memory/file PUT fails unexpectedly", async () => {
    supabaseMock.mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied", status: 500, statusCode: "500" },
    });

    const request = new Request("http://localhost/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "memory/preferences.md", content: "pref" }),
    });
    const response = await putMemoryFile(request);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to save memory file." });
  });
});
