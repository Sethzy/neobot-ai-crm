/**
 * @file Tests for Google Files API utilities.
 * @description Tests upload, polling, and pipeline functions for Gemini file processing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions so they're available when vi.mock is called
const { mockUpload, mockGet, mockDelete } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
}));

// Mock the @google/genai module
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      files = {
        upload: mockUpload,
        get: mockGet,
        delete: mockDelete,
      };
    },
  };
});

import {
  uploadToGoogleFiles,
  waitForFileProcessing,
  uploadAndWaitForFile,
  downloadFileFromUrl,
  prepareFileForGemini,
  deleteGoogleFile,
} from "./gemini-files";

describe("uploadToGoogleFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads file buffer to Google Files API and returns file metadata", async () => {
    const mockFileResponse = {
      name: "files/abc123",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "application/pdf",
      state: "ACTIVE",
    };
    mockUpload.mockResolvedValue(mockFileResponse);

    const fileBuffer = Buffer.from("fake pdf content");
    const result = await uploadToGoogleFiles({
      fileBuffer,
      mimeType: "application/pdf",
      displayName: "test-document.pdf",
      apiKey: "test-api-key",
    });

    expect(result).toEqual(mockFileResponse);
    expect(mockUpload).toHaveBeenCalledWith({
      file: expect.any(Blob),
      config: {
        mimeType: "application/pdf",
        displayName: "test-document.pdf",
      },
    });
  });
});

describe("waitForFileProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns immediately when file state is ACTIVE", async () => {
    const activeFile = {
      name: "files/abc123",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "application/pdf",
      state: "ACTIVE",
    };
    mockGet.mockResolvedValue(activeFile);

    const result = await waitForFileProcessing({
      fileName: "files/abc123",
      apiKey: "test-api-key",
    });

    expect(result).toEqual(activeFile);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("polls until file state becomes ACTIVE", async () => {
    const processingFile = { name: "files/abc123", state: "PROCESSING" };
    const activeFile = {
      name: "files/abc123",
      state: "ACTIVE",
      uri: "https://...",
      mimeType: "application/pdf",
    };

    mockGet
      .mockResolvedValueOnce(processingFile)
      .mockResolvedValueOnce(processingFile)
      .mockResolvedValueOnce(activeFile);

    const result = await waitForFileProcessing({
      fileName: "files/abc123",
      apiKey: "test-api-key",
      pollIntervalMs: 10, // Fast for testing
    });

    expect(result.state).toBe("ACTIVE");
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("throws error when file state is FAILED", async () => {
    const failedFile = { name: "files/abc123", state: "FAILED" };
    mockGet.mockResolvedValue(failedFile);

    await expect(
      waitForFileProcessing({
        fileName: "files/abc123",
        apiKey: "test-api-key",
      })
    ).rejects.toThrow("File processing failed");
  });

  it("throws error after max attempts exceeded", async () => {
    const processingFile = { name: "files/abc123", state: "PROCESSING" };
    mockGet.mockResolvedValue(processingFile);

    await expect(
      waitForFileProcessing({
        fileName: "files/abc123",
        apiKey: "test-api-key",
        pollIntervalMs: 10,
        maxAttempts: 3,
      })
    ).rejects.toThrow("File processing timed out");
  });
});

describe("uploadAndWaitForFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads file and waits for ACTIVE state", async () => {
    const uploadedFile = {
      name: "files/abc123",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "application/pdf",
      state: "PROCESSING",
    };
    const activeFile = { ...uploadedFile, state: "ACTIVE" };

    mockUpload.mockResolvedValue(uploadedFile);
    mockGet.mockResolvedValue(activeFile);

    const fileBuffer = Buffer.from("fake pdf content");
    const result = await uploadAndWaitForFile({
      fileBuffer,
      mimeType: "application/pdf",
      displayName: "test-document.pdf",
      apiKey: "test-api-key",
      pollIntervalMs: 10,
    });

    expect(result.state).toBe("ACTIVE");
    expect(mockUpload).toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalled();
  });

  it("returns immediately if upload returns ACTIVE state", async () => {
    const activeFile = {
      name: "files/abc123",
      uri: "https://...",
      mimeType: "application/pdf",
      state: "ACTIVE",
    };

    mockUpload.mockResolvedValue(activeFile);

    const fileBuffer = Buffer.from("fake pdf content");
    const result = await uploadAndWaitForFile({
      fileBuffer,
      mimeType: "application/pdf",
      displayName: "test-document.pdf",
      apiKey: "test-api-key",
    });

    expect(result.state).toBe("ACTIVE");
    expect(mockUpload).toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled(); // No polling needed
  });
});

describe("downloadFileFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("downloads file from URL and returns buffer", async () => {
    const mockArrayBuffer = new ArrayBuffer(8);
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const result = await downloadFileFromUrl("https://example.com/file.pdf");

    expect(result).toBeInstanceOf(Buffer);
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/file.pdf");
  });

  it("throws error when fetch fails", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    await expect(
      downloadFileFromUrl("https://example.com/file.pdf")
    ).rejects.toThrow("Failed to download file: 404 Not Found");
  });
});

describe("prepareFileForGemini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("downloads from URL, uploads to Google, and returns ACTIVE file", async () => {
    // Mock download
    const mockArrayBuffer = new ArrayBuffer(8);
    const mockDownloadResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockDownloadResponse
    );

    // Mock upload and polling
    const activeFile = {
      name: "files/abc123",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
      mimeType: "application/pdf",
      state: "ACTIVE",
    };
    mockUpload.mockResolvedValue(activeFile);

    const result = await prepareFileForGemini({
      sourceUrl: "https://supabase.com/storage/file.pdf",
      mimeType: "application/pdf",
      displayName: "document.pdf",
      apiKey: "test-api-key",
    });

    expect(result.uri).toBe(
      "https://generativelanguage.googleapis.com/v1beta/files/abc123"
    );
    expect(result.state).toBe("ACTIVE");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://supabase.com/storage/file.pdf"
    );
    expect(mockUpload).toHaveBeenCalled();
  });
});

describe("deleteGoogleFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes file from Google Files API", async () => {
    mockDelete.mockResolvedValue(undefined);

    await deleteGoogleFile({
      fileName: "files/abc123",
      apiKey: "test-api-key",
    });

    expect(mockDelete).toHaveBeenCalledWith({ name: "files/abc123" });
  });

  it("does not throw on delete failure (silent cleanup)", async () => {
    mockDelete.mockRejectedValue(new Error("File not found"));

    // Should not throw
    await expect(
      deleteGoogleFile({
        fileName: "files/abc123",
        apiKey: "test-api-key",
      })
    ).resolves.not.toThrow();
  });
});
