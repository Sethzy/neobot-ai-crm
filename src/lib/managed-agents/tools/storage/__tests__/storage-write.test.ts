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

import { storageWriteTool } from "../storage-write";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeContext(): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: {} as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("storageWriteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("writes file content through the agent file client", async () => {
    const result = await storageWriteTool.execute(
      {
        op: "write",
        path: "/agent/memory/topic.md",
        content: "hello world",
      },
      makeContext(),
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith("memory/topic.md", "hello world");
    expect(result).toEqual({
      success: true,
      op: "write",
      path: "/agent/memory/topic.md",
      path_kind: "general",
    });
  });

  it("edits file content and returns the updated content", async () => {
    mockFileClient.editFile.mockResolvedValue("updated text");

    const result = await storageWriteTool.execute(
      {
        op: "edit",
        path: "/agent/memory/topic.md",
        old_string: "old",
        new_string: "updated",
      },
      makeContext(),
    );

    expect(mockFileClient.editFile).toHaveBeenCalledWith(
      "memory/topic.md",
      "old",
      "updated",
      false,
    );
    expect(result).toEqual({
      success: true,
      op: "edit",
      path: "/agent/memory/topic.md",
      content: "updated text",
      path_kind: "general",
    });
  });

  it("deletes files", async () => {
    const result = await storageWriteTool.execute(
      {
        op: "delete",
        path: "/agent/home/note.md",
      },
      makeContext(),
    );

    expect(mockFileClient.deleteFile).toHaveBeenCalledWith("home/note.md");
    expect(result).toEqual({
      success: true,
      op: "delete",
      path: "/agent/home/note.md",
      path_kind: "general",
    });
  });

  it("rejects write without content", async () => {
    await expect(
      storageWriteTool.execute(
        { op: "write", path: "/agent/memory/topic.md" },
        makeContext(),
      ),
    ).rejects.toThrow("write op requires content.");
  });
});
