/**
 * Tests for runner storage tools.
 * @module lib/runner/tools/storage/__tests__/index
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAgentFileClient,
  mockFileClient,
} = vi.hoisted(() => ({
  mockCreateAgentFileClient: vi.fn(),
  mockFileClient: {
    downloadFile: vi.fn(),
    listDirectory: vi.fn(),
    uploadFile: vi.fn(),
    editFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
}));

import { createStorageTools } from "../index";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("createStorageTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("creates read_file and write_file tools", () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    expect(mockCreateAgentFileClient).toHaveBeenCalledWith("mock-supabase", CLIENT_ID);
    expect(tools.read_file).toBeDefined();
    expect(tools.write_file).toBeDefined();
  });

  it("read_file reads file content by default", async () => {
    mockFileClient.downloadFile.mockResolvedValue("line1\nline2\nline3");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "MEMORY.md" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("MEMORY.md");
    expect(result).toEqual({ success: true, path: "MEMORY.md", content: "line1\nline2\nline3" });
  });

  it("read_file reads directory tree for paths ending with /", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "memory/" }, EXECUTION_OPTIONS);

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toEqual({
      success: true,
      path: "memory/",
      content: "preferences.md\npatterns.md",
    });
  });

  it("read_file supports start_line and end_line slicing", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "MEMORY.md", start_line: 2, end_line: 3 },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, path: "MEMORY.md", content: "b\nc" });
  });

  it("read_file rejects non-positive line numbers", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "MEMORY.md", start_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("start_line must be >= 1");
  });

  it("read_file falls back to directory listing for bare directory paths", async () => {
    mockFileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file "memory": Object not found'),
    );
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "memory" }, EXECUTION_OPTIONS);

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toEqual({
      success: true,
      path: "memory",
      content: "preferences.md\npatterns.md",
    });
  });

  it("read_file does not fallback to directory listing for non-not-found file errors", async () => {
    mockFileClient.downloadFile.mockRejectedValue(new Error("Permission denied"));
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "MEMORY.md" }, EXECUTION_OPTIONS),
    ).rejects.toThrow("Permission denied");
    expect(mockFileClient.listDirectory).not.toHaveBeenCalled();
  });

  it("write_file write op uploads content", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "memory/preferences.md", content: "prefers short replies" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith(
      "memory/preferences.md",
      "prefers short replies",
    );
    expect(result).toEqual({
      success: true,
      op: "write",
      path: "memory/preferences.md",
      path_kind: "general",
    });
  });

  it("write_file edit op delegates to file client", async () => {
    mockFileClient.editFile.mockResolvedValue("updated");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      {
        op: "edit",
        path: "notes.md",
        old_string: "foo",
        new_string: "bar",
        replace_all: true,
      },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.editFile).toHaveBeenCalledWith("notes.md", "foo", "bar", true);
    expect(result).toEqual({
      success: true,
      op: "edit",
      path: "notes.md",
      content: "updated",
      path_kind: "general",
    });
  });

  it("write_file delete op removes file", async () => {
    mockFileClient.deleteFile.mockResolvedValue(undefined);
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "delete", path: "memory/old.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.deleteFile).toHaveBeenCalledWith("memory/old.md");
    expect(result).toEqual({
      success: true,
      op: "delete",
      path: "memory/old.md",
      path_kind: "general",
    });
  });

  it("write_file classifies vault and skills paths for path-aware handling", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const vaultResult = await tools.write_file.execute(
      { op: "write", path: "vault/lead-notes.md", content: "..." },
      EXECUTION_OPTIONS,
    );
    const skillResult = await tools.write_file.execute(
      { op: "write", path: "skills/gmail/SKILL.md", content: "..." },
      EXECUTION_OPTIONS,
    );

    expect(vaultResult).toEqual({
      success: true,
      op: "write",
      path: "vault/lead-notes.md",
      path_kind: "vault",
    });
    expect(skillResult).toEqual({
      success: true,
      op: "write",
      path: "skills/gmail/SKILL.md",
      path_kind: "skills",
    });
  });

  it("bubbles protected-file errors from write operations", async () => {
    mockFileClient.uploadFile.mockRejectedValue(
      new Error("SOUL.md is read-only and cannot be modified by the agent."),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.write_file.execute({ op: "write", path: "SOUL.md", content: "hack" }, EXECUTION_OPTIONS),
    ).rejects.toThrow("read-only");
  });
});
