/**
 * Tests for the CRM attachment upload route.
 * @module app/api/crm/attachments/upload/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockUploadArtifact,
  mockRemove,
  mockFrom,
  mockInsert,
  mockSelect,
  mockSingle,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockUploadArtifact: vi.fn(),
  mockRemove: vi.fn(),
  mockFrom: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: {
      from: vi.fn().mockImplementation(() => ({
        remove: mockRemove,
      })),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/storage/agent-files", () => ({
  AGENT_FILES_BUCKET: "agent-files",
  createAgentFileClient: () => ({
    uploadArtifact: mockUploadArtifact,
  }),
}));

import { POST } from "./route";

const validRecordId = "123e4567-e89b-42d3-a456-426614174000";

function createFileRequest(file: File, recordType = "contact", recordId = validRecordId) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("filename", file.name);
  formData.append("record_type", recordType);
  formData.append("record_id", recordId);

  return new Request("http://localhost/api/crm/attachments/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/crm/attachments/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1");

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockResolveClientId.mockResolvedValue("client-1");
    mockUploadArtifact.mockResolvedValue({
      storagePath: `client-1/attachments/contact/${validRecordId}/uuid-1`,
      downloadUrl: "https://storage.example.com/signed-url",
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
        file_size: 8,
        file_category: "pdf",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
      },
      error: null,
    });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });
    mockRemove.mockResolvedValue({ data: [], error: null });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });

    const response = await POST(
      createFileRequest(new File(["x"], "brief.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();
    formData.append("record_type", "contact");
    formData.append("record_id", validRecordId);

    const response = await POST(
      new Request("http://localhost/api/crm/attachments/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No file uploaded" });
  });

  it("uploads an attachment and creates the metadata row", async () => {
    const response = await POST(
      createFileRequest(new File(["pdf-data"], "brief.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
        attachment: {
          attachment_id: "att-1",
          client_id: "client-1",
          record_type: "contact",
          record_id: validRecordId,
          filename: "brief.pdf",
          storage_path: `attachments/contact/${validRecordId}/uuid-1`,
          content_type: "application/pdf",
          file_size: 8,
          file_category: "pdf",
          created_at: "2026-04-05T00:00:00Z",
          updated_at: "2026-04-05T00:00:00Z",
      },
      url: "https://storage.example.com/signed-url",
    });
    expect(mockUploadArtifact).toHaveBeenCalledWith({
      path: `attachments/contact/${validRecordId}/uuid-1`,
      content: expect.objectContaining({ byteLength: 8 }),
      contentType: "application/pdf",
      expiresInSeconds: 3600,
      downloadFilename: "brief.pdf",
    });
    expect(mockInsert).toHaveBeenCalledWith({
      client_id: "client-1",
      record_type: "contact",
      record_id: validRecordId,
      filename: "brief.pdf",
      storage_path: `attachments/contact/${validRecordId}/uuid-1`,
      content_type: "application/pdf",
      file_size: 8,
      file_category: "pdf",
    });
  });

  it("cleans up the uploaded file when the metadata insert fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "insert failed" } });

    const response = await POST(
      createFileRequest(new File(["pdf-data"], "brief.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to create attachment record" });
    expect(mockRemove).toHaveBeenCalledWith([
      `client-1/attachments/contact/${validRecordId}/uuid-1`,
    ]);
  });
});
