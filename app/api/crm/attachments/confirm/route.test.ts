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
    await expect(response.json()).resolves.toEqual({
      attachment: {
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
      url: "https://storage.example.com/signed-url",
    });
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
