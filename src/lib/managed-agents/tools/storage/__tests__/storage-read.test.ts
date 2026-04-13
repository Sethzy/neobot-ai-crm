import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAgentFileClient,
  mockNormalizeWorkspacePath,
  mockCaptureServerEvent,
  mockFileClient,
} = vi.hoisted(() => ({
  mockCreateAgentFileClient: vi.fn(),
  mockNormalizeWorkspacePath: vi.fn((inputPath: string) => {
    const normalized = inputPath.replaceAll("\\", "/").replace(/^\/+/, "");
    return normalized
      .split("/")
      .filter((segment) => segment.length > 0)
      .join("/");
  }),
  mockCaptureServerEvent: vi.fn(),
  mockFileClient: {
    downloadFile: vi.fn(),
    downloadBinary: vi.fn(),
    listDirectory: vi.fn(),
    uploadFile: vi.fn(),
    editFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
  normalizeWorkspacePath: (...args: unknown[]) => mockNormalizeWorkspacePath(...args),
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
}));

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { storageReadTool } from "../storage-read";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const TINY_TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

function toArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("storageReadTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("reads text content and returns the canonical path", async () => {
    mockFileClient.downloadFile.mockResolvedValue("line1\nline2\nline3");

    const result = await storageReadTool.execute(
      { path: "/agent/MEMORY.md", start_line: 2, end_line: 3 },
      makeContext(),
    );

    expect(mockCreateAgentFileClient).toHaveBeenCalled();
    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("MEMORY.md");
    expect(result).toEqual({
      success: true,
      path: "/agent/MEMORY.md",
      content: "line2\nline3",
    });
  });

  it("reads directories when the path ends with /", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");

    const result = await storageReadTool.execute(
      { path: "/agent/memory/" },
      makeContext(),
    );

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toEqual({
      success: true,
      path: "/agent/memory/",
      content: "preferences.md\npatterns.md",
    });
  });

  it("reads images as binary model payloads", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });

    const result = await storageReadTool.execute(
      { path: "/agent/home/photo.png" },
      makeContext(),
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/home/photo.png",
      type: "image",
      mediaType: "image/png",
    });
  });

  it("rejects start_line: 0", async () => {
    await expect(
      storageReadTool.execute({ path: "/agent/MEMORY.md", start_line: 0 }, makeContext()),
    ).rejects.toThrow("start_line cannot be 0");
  });

  it("rejects non-/agent absolute paths with a clear error", async () => {
    await expect(
      storageReadTool.execute({ path: "/mnt/session/uploads/data.csv" }, makeContext()),
    ).rejects.toThrow("storage_read only supports durable files under /agent/");
  });
});
