/**
 * Tests for the chat attachment upload route.
 * @module app/api/files/upload/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUser,
  mockResolveClientId,
  mockUpload,
  mockGetPublicUrl,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
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

describe("POST /api/files/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("deadbeef-dead-beef-dead-beefdeadbeef");

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockResolveClientId.mockResolvedValue("client-1");
    mockUpload.mockResolvedValue({ data: { path: "client-1/1700000000000-deadbeef.png" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl: "https://storage.example.com/chat-attachments/client-1/1700000000000-deadbeef.png",
      },
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

  it("returns 400 when the file exceeds 5MB", async () => {
    const response = await POST(
      createFileRequest(
        new File([new ArrayBuffer(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File size should be less than 5MB",
    });
  });

  it("returns 400 for unsupported file types", async () => {
    const response = await POST(
      createFileRequest(new File(["x"], "doc.pdf", { type: "application/pdf" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "File type should be JPEG, PNG, XLSX, XLS, or CSV",
    });
  });

  it("uploads valid images and returns the public metadata contract", async () => {
    const response = await POST(
      createFileRequest(new File(["image-data"], "screenshot.png", { type: "image/png" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/chat-attachments/client-1/1700000000000-deadbeef.png",
      pathname: "screenshot.png",
      contentType: "image/png",
    });
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/1700000000000-deadbeef.png",
      expect.objectContaining({ byteLength: 10 }),
      {
        contentType: "image/png",
        upsert: false,
      },
    );
  });

  it("uploads valid spreadsheet attachments and preserves their content type", async () => {
    mockUpload.mockResolvedValue({ data: { path: "client-1/1700000000000-deadbeef.csv" }, error: null });
    mockGetPublicUrl.mockReturnValue({
      data: {
        publicUrl: "https://storage.example.com/chat-attachments/client-1/1700000000000-deadbeef.csv",
      },
    });

    const response = await POST(
      createFileRequest(new File(["a,b\n1,2"], "deals.csv", { type: "text/csv" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://storage.example.com/chat-attachments/client-1/1700000000000-deadbeef.csv",
      pathname: "deals.csv",
      contentType: "text/csv",
    });
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/1700000000000-deadbeef.csv",
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
});
