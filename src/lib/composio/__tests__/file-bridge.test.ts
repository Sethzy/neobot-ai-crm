/**
 * Tests for Composio file bridge helpers — download detection, storage persistence, upload resolution.
 * @module lib/composio/__tests__/file-bridge
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockReadFile, mockUnlink, mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      readFile: mockReadFile,
      unlink: mockUnlink,
      mkdir: mockMkdir,
      writeFile: mockWriteFile,
    },
    readFile: mockReadFile,
    unlink: mockUnlink,
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  };
});

import { bridgeDownloadedFile, findDownloadedFile, resolveAgentPathForUpload } from "../file-bridge";

describe("findDownloadedFile", () => {
  it("returns null for non-object data", () => {
    expect(findDownloadedFile(null)).toBeNull();
    expect(findDownloadedFile(undefined)).toBeNull();
    expect(findDownloadedFile("string")).toBeNull();
    expect(findDownloadedFile(42)).toBeNull();
  });

  it("returns null when no file download fields present", () => {
    expect(findDownloadedFile({ success: true, data: "some text" })).toBeNull();
  });

  it("detects top-level file download result", () => {
    const result = findDownloadedFile({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result).toEqual({
      uri: "/tmp/composio/report.xlsx",
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("detects one-level nested file download result", () => {
    const result = findDownloadedFile({
      response_data: {
        uri: "/tmp/composio/photo.jpg",
        file_downloaded: true,
        s3url: "https://s3.example.com/photo.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result).toEqual({
      uri: "/tmp/composio/photo.jpg",
      file_downloaded: true,
      s3url: "https://s3.example.com/photo.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("returns the shape even when file_downloaded is false", () => {
    const result = findDownloadedFile({
      uri: "",
      file_downloaded: false,
      s3url: "https://s3.example.com/file.xlsx",
      mimeType: "application/octet-stream",
    });

    expect(result).not.toBeNull();
    expect(result!.file_downloaded).toBe(false);
  });

  it("returns null when uri is missing", () => {
    expect(findDownloadedFile({
      file_downloaded: true,
      s3url: "https://s3.example.com/file.xlsx",
    })).toBeNull();
  });
});

describe("bridgeDownloadedFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads file to agent storage and returns agent path", async () => {
    const mockBuffer = Buffer.from("file content");
    mockReadFile.mockResolvedValue(mockBuffer);
    mockUnlink.mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/report.xlsx",
        downloadUrl: "https://signed-url",
      }),
    };

    const result = await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/1711792800-report.xlsx",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      fileClient: mockFileClient as never,
      getSandbox: () => null,
    });

    expect(result).toBe("/agent/home/1711792800-report.xlsx");
    expect(mockFileClient.uploadArtifact).toHaveBeenCalledWith({
      path: "home/1711792800-report.xlsx",
      content: mockBuffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      expiresInSeconds: 604800,
    });
    expect(mockUnlink).toHaveBeenCalledWith("/tmp/composio/1711792800-report.xlsx");
  });

  it("pushes file to sandbox when sandbox is active", async () => {
    const mockBuffer = Buffer.from("file content");
    mockReadFile.mockResolvedValue(mockBuffer);
    mockUnlink.mockResolvedValue(undefined);

    const mockSandbox = { writeFiles: vi.fn().mockResolvedValue(undefined) };
    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/data.csv",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/data.csv",
        file_downloaded: true,
        s3url: "https://s3.example.com/data.csv",
        mimeType: "text/csv",
      },
      fileClient: mockFileClient as never,
      getSandbox: () => mockSandbox as never,
    });

    expect(mockSandbox.writeFiles).toHaveBeenCalledWith([{
      path: "/vercel/sandbox/workspace/agent/home/data.csv",
      content: mockBuffer,
    }]);
  });

  it("skips sandbox push when sandbox is null", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("content"));
    mockUnlink.mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/file.txt",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/file.txt",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.txt",
        mimeType: "text/plain",
      },
      fileClient: mockFileClient as never,
      getSandbox: () => null,
    });

    expect(mockFileClient.uploadArtifact).toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("cleans up temp file even if upload fails", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("content"));
    mockUnlink.mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockRejectedValue(new Error("upload failed")),
    };

    await expect(bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/file.txt",
        file_downloaded: true,
        s3url: "https://s3.example.com/file.txt",
        mimeType: "text/plain",
      },
      fileClient: mockFileClient as never,
      getSandbox: () => null,
    })).rejects.toThrow("upload failed");

    expect(mockUnlink).toHaveBeenCalledWith("/tmp/composio/file.txt");
  });

  it("falls back to application/octet-stream when mimeType is empty", async () => {
    mockReadFile.mockResolvedValue(Buffer.from("binary"));
    mockUnlink.mockResolvedValue(undefined);

    const mockFileClient = {
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "home/unknown.bin",
        downloadUrl: "https://signed-url",
      }),
    };

    await bridgeDownloadedFile({
      fileData: {
        uri: "/tmp/composio/unknown.bin",
        file_downloaded: true,
        s3url: "https://s3.example.com/unknown.bin",
        mimeType: "",
      },
      fileClient: mockFileClient as never,
      getSandbox: () => null,
    });

    expect(mockFileClient.uploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/octet-stream" }),
    );
  });
});

describe("resolveAgentPathForUpload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads from storage and writes to temp path", async () => {
    const mockBuffer = new ArrayBuffer(8);
    const mockFileClient = {
      downloadBinary: vi.fn().mockResolvedValue({
        buffer: mockBuffer,
        mimeType: "application/pdf",
      }),
    };
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const tempPath = await resolveAgentPathForUpload({
      agentPath: "/agent/home/report.pdf",
      fileClient: mockFileClient as never,
    });

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("home/report.pdf");
    expect(mockMkdir).toHaveBeenCalledWith("/tmp/composio-uploads", { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/composio-uploads/report.pdf",
      expect.any(Buffer),
    );
    expect(tempPath).toBe("/tmp/composio-uploads/report.pdf");
  });

  it("strips /agent/ prefix correctly for uploads path", async () => {
    const mockFileClient = {
      downloadBinary: vi.fn().mockResolvedValue({
        buffer: new ArrayBuffer(4),
        mimeType: "text/csv",
      }),
    };
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await resolveAgentPathForUpload({
      agentPath: "/agent/uploads/1711792800-deals.csv",
      fileClient: mockFileClient as never,
    });

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("uploads/1711792800-deals.csv");
  });

  it("throws if path does not start with /agent/", async () => {
    const mockFileClient = { downloadBinary: vi.fn() };

    await expect(resolveAgentPathForUpload({
      agentPath: "/tmp/some-file.txt",
      fileClient: mockFileClient as never,
    })).rejects.toThrow("must start with /agent/");

    expect(mockFileClient.downloadBinary).not.toHaveBeenCalled();
  });
});
