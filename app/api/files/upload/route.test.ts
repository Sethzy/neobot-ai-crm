/**
 * Tests for the chat attachment upload route.
 * @module app/api/files/upload/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockFrom,
  mockUpload,
  mockCreateSignedUrl,
  mockThreadMaybeSingle,
  mockAttachFileToSession,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockFrom: vi.fn(),
  mockUpload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockThreadMaybeSingle: vi.fn(),
  mockAttachFileToSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table !== "conversation_threads") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockThreadMaybeSingle,
            }),
          }),
        }),
      };
    }),
    storage: {
      from: mockFrom.mockImplementation(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/managed-agents/attach-session-file", () => ({
  attachFileToSession: (...args: unknown[]) => mockAttachFileToSession(...args),
}));

import { POST } from "./route";

function createFileRequest(file: File) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("filename", file.name);

  return new Request("http://localhost/api/files/upload", {
    method: "POST",
    body: formData,
  });
}

function createFileRequestWithThread(file: File, threadId: string) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("filename", file.name);
  formData.append("threadId", threadId);

  return new Request("http://localhost/api/files/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/files/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("deadbeef-dead-beef-dead-beefdeadbeef");

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockResolveClientId.mockResolvedValue("client-1");
    mockThreadMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockAttachFileToSession.mockResolvedValue({
      attached: true,
      anthropicFileId: "file_123",
    });
    mockUpload.mockResolvedValue({
      data: { path: "client-1/uploads/1700000000000-deadbeef-screenshot.png" },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-screenshot.png?token=signed",
      },
      error: null,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });

    const response = await POST(
      createFileRequest(new File(["x"], "photo.jpg", { type: "image/jpeg" })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 when no file is provided", async () => {
    const response = await POST(
      new Request("http://localhost/api/files/upload", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No file uploaded" });
  });

  it("accepts PDF uploads", async () => {
    mockUpload.mockResolvedValue({
      data: {
        path: "client-1/uploads/1700000000000-deadbeef-brief.pdf",
      },
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-brief.pdf?token=signed",
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(new File(["pdf-data"], "brief.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-brief.pdf?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-brief.pdf",
      pathname: "brief.pdf",
      contentType: "application/pdf",
    });
  });

  it("accepts DOCX uploads", async () => {
    mockUpload.mockResolvedValue({
      data: {
        path: "client-1/uploads/1700000000000-deadbeef-proposal.docx",
      },
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-proposal.docx?token=signed",
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(
        new File(["docx-data"], "proposal.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-proposal.docx?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-proposal.docx",
      pathname: "proposal.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it.each([
    ["image/webp", "floorplan.webp"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "listing-deck.pptx"],
    ["text/plain", "notes.txt"],
  ])("accepts %s uploads", async (contentType, filename) => {
    mockUpload.mockResolvedValue({
      data: { path: `client-1/uploads/1700000000000-deadbeef-${filename}` },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: `https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-${filename}?token=signed`,
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(new File(["file-data"], filename, { type: contentType })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: `https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-${filename}?token=signed`,
      storagePath: `uploads/1700000000000-deadbeef-${filename}`,
      pathname: filename,
      contentType,
    });
  });

  it("accepts files up to 10MB", async () => {
    mockUpload.mockResolvedValue({
      data: {
        path: "client-1/uploads/1700000000000-deadbeef-big.pdf",
      },
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-big.pdf?token=signed",
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(
        new File([new ArrayBuffer(10 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }),
      ),
    );

    expect(response.status).toBe(200);
  });

  it("returns 400 when the file exceeds 10MB", async () => {
    const response = await POST(
      createFileRequest(
        new File([new ArrayBuffer(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File size should be less than 10MB",
    });
  });

  it("returns 400 for unsupported file types", async () => {
    const response = await POST(
      createFileRequest(new File(["x"], "archive.zip", { type: "application/zip" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File type is not supported for chat uploads",
    });
  });

  it("uploads valid images and returns the public metadata contract", async () => {
    const response = await POST(
      createFileRequest(new File(["image-data"], "screenshot.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-screenshot.png?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-screenshot.png",
      pathname: "screenshot.png",
      contentType: "image/png",
    });
    expect(mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-screenshot.png",
      expect.objectContaining({ byteLength: 10 }),
      {
        contentType: "image/png",
        upsert: false,
      },
    );
  });

  it("uploads valid spreadsheet attachments and preserves their content type", async () => {
    mockUpload.mockResolvedValue({
      data: {
        path: "client-1/uploads/1700000000000-deadbeef-deals.csv",
      },
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-deals.csv?token=signed",
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(new File(["a,b\n1,2"], "deals.csv", { type: "text/csv" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-deals.csv?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-deals.csv",
      pathname: "deals.csv",
      contentType: "text/csv",
    });
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-deals.csv",
      expect.anything(),
      {
        contentType: "text/csv",
        upsert: false,
      },
    );
  });

  it("returns 500 when the storage upload fails", async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: "storage full" } });

    const response = await POST(
      createFileRequest(new File(["image-data"], "photo.jpg", { type: "image/jpeg" })),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Upload failed" });
  });

  it("preserves sanitized original filename with short uuid for collision safety", async () => {
    mockUpload.mockResolvedValue({
      data: {
        path: "client-1/uploads/1700000000000-deadbeef-deals_report.csv",
      },
      error: null,
    });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-deals_report.csv?token=signed",
      },
      error: null,
    });

    const response = await POST(
      createFileRequest(new File(["a,b\n1,2"], "deals report.csv", { type: "text/csv" })),
    );

    expect(response.status).toBe(200);
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/uploads/1700000000000-deadbeef-deals_report.csv",
      expect.anything(),
      expect.anything(),
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/1700000000000-deadbeef-deals_report.csv?token=signed",
      storagePath: "uploads/1700000000000-deadbeef-deals_report.csv",
      pathname: "deals report.csv",
      contentType: "text/csv",
    });
  });

  it("ignores threadId during upload; session attachment now happens after run acceptance", async () => {
    const response = await POST(
      createFileRequestWithThread(
        new File(["image-data"], "screenshot.png", { type: "image/png" }),
        "thread-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockThreadMaybeSingle).not.toHaveBeenCalled();
    expect(mockAttachFileToSession).not.toHaveBeenCalled();
  });
});
