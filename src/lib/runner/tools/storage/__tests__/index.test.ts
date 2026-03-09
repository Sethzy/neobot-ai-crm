/**
 * Tests for runner storage tools.
 * @module lib/runner/tools/storage/__tests__/index
 */
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAgentFileClient,
  mockNormalizeWorkspacePath,
  mockFileClient,
} = vi.hoisted(() => ({
  mockCreateAgentFileClient: vi.fn(),
  mockNormalizeWorkspacePath: vi.fn((inputPath: string) => {
    const normalized = inputPath.replaceAll("\\", "/").replace(/^\/+/, "");
    const segments = normalized.split("/").filter((segment) => segment.length > 0);
    return segments.join("/");
  }),
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

import { createStorageTools } from "../index";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;
const TINY_TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

function toArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function createExifRotatedJpegArrayBuffer(): Promise<ArrayBuffer> {
  const bytes = await sharp({
    create: {
      width: 2,
      height: 1,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function createOpaqueJpegArrayBuffer(): Promise<ArrayBuffer> {
  const bytes = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createSupabaseMock() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteBuilder = {
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  deleteBuilder.then = (resolve: (value: unknown) => void) =>
    Promise.resolve({ data: null, error: null }).then(resolve);

  const deleteRows = vi.fn(() => deleteBuilder);
  const from = vi.fn(() => ({ upsert, delete: deleteRows }));

  return {
    supabase: { from },
    upsert,
    deleteRows,
    eq: deleteBuilder.eq,
    from,
  };
}

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

  it("describes image reads and negative line indices to the model", () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    expect(tools.read_file.description).toContain("Image files are displayed directly");
    expect(tools.read_file.description).toContain("negative");
  });

  it("read_file reads file content by default", async () => {
    mockFileClient.downloadFile.mockResolvedValue("line1\nline2\nline3");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "MEMORY.md" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("MEMORY.md");
    expect(result).toEqual({
      success: true,
      path: "/agent/MEMORY.md",
      content: "line1\nline2\nline3",
    });
  });

  it("read_file reads directory tree for paths ending with /", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "memory/" }, EXECUTION_OPTIONS);

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toEqual({
      success: true,
      path: "/agent/memory/",
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

    expect(result).toEqual({ success: true, path: "/agent/MEMORY.md", content: "b\nc" });
  });

  it("read_file rejects start_line: 0", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "MEMORY.md", start_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("start_line cannot be 0");
  });

  it("read_file rejects start_line: 0 for directory reads", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "memory/", start_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("start_line cannot be 0");
  });

  it("read_file rejects end_line: 0 for image reads", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "vault/photo.png", end_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("end_line cannot be 0");
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
      path: "/agent/memory",
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

  it("strips /agent/ prefix before reading text files and returns canonical output paths", async () => {
    mockFileClient.downloadFile.mockResolvedValue("content");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/memory/MEMORY.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadFile).toHaveBeenCalledWith("memory/MEMORY.md");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/MEMORY.md",
      content: "content",
    });
  });

  it("strips /agent/ prefix for directory paths", async () => {
    mockFileClient.listDirectory.mockResolvedValue("preferences.md\npatterns.md");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/memory/" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.listDirectory).toHaveBeenCalledWith("memory");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/",
      content: "preferences.md\npatterns.md",
    });
  });

  it("strips /agent/ prefix for image paths", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/vault/photo.png" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/photo.png");
    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/photo.png",
    });
  });

  it("returns canonical /agent/ paths even when given a relative read input", async () => {
    mockFileClient.downloadFile.mockResolvedValue("content");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "memory/MEMORY.md" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/MEMORY.md",
    });
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
      path: "/agent/memory/preferences.md",
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
      path: "/agent/notes.md",
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
      path: "/agent/memory/old.md",
      path_kind: "general",
    });
  });

  it("strips /agent/ prefix before storage writes and returns canonical paths", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const { supabase } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      {
        op: "write",
        path: "/agent/memory/preferences.md",
        content: "prefers short replies",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith(
      "memory/preferences.md",
      "prefers short replies",
    );
    expect(result).toMatchObject({
      success: true,
      op: "write",
      path: "/agent/memory/preferences.md",
    });
  });

  it("returns canonical /agent/ paths for vault write ops", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const { supabase } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "/agent/vault/notes.md", content: "vault content" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith("vault/notes.md", "vault content");
    expect(result).toMatchObject({
      success: true,
      path: "/agent/vault/notes.md",
      path_kind: "vault",
    });
  });

  it("returns canonical /agent/ paths for edit ops", async () => {
    mockFileClient.editFile.mockResolvedValue("updated content");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      {
        op: "edit",
        path: "/agent/MEMORY.md",
        old_string: "old",
        new_string: "new",
      },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.editFile).toHaveBeenCalledWith("MEMORY.md", "old", "new", false);
    expect(result).toMatchObject({
      success: true,
      op: "edit",
      path: "/agent/MEMORY.md",
    });
  });

  it("returns canonical /agent/ paths for delete ops", async () => {
    mockFileClient.deleteFile.mockResolvedValue(undefined);
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "delete", path: "/agent/state/draft.md" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.deleteFile).toHaveBeenCalledWith("state/draft.md");
    expect(result).toMatchObject({
      success: true,
      op: "delete",
      path: "/agent/state/draft.md",
    });
  });

  it("returns canonical /agent/ paths even when given relative write input", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.write_file.execute(
      { op: "write", path: "memory/preferences.md", content: "content" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/memory/preferences.md",
    });
  });

  it("write_file classifies vault and skills paths for path-aware handling", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const { supabase } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

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
      path: "/agent/vault/lead-notes.md",
      path_kind: "vault",
    });
    expect(skillResult).toEqual({
      success: true,
      op: "write",
      path: "/agent/skills/gmail/SKILL.md",
      path_kind: "skills",
    });
  });

  it("write_file syncs vault metadata on write", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const { supabase, upsert, from } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    await tools.write_file.execute(
      { op: "write", path: "vault/Lead Notes.md", content: "prefers WhatsApp follow-up" },
      EXECUTION_OPTIONS,
    );

    expect(from).toHaveBeenCalledWith("vault_files");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        filename: "Lead Notes.md",
        storage_path: "vault/Lead Notes.md",
        title: "lead-notes",
        content: "prefers WhatsApp follow-up",
        needs_reprocess: true,
      }),
      { onConflict: "client_id,storage_path" },
    );
  });

  it("write_file normalizes vault paths before storage write and metadata sync", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);
    const { supabase, upsert } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    await tools.write_file.execute(
      { op: "write", path: "//vault\\\\Lead Notes.md", content: "prefers WhatsApp follow-up" },
      EXECUTION_OPTIONS,
    );

    expect(mockFileClient.uploadFile).toHaveBeenCalledWith(
      "vault/Lead Notes.md",
      "prefers WhatsApp follow-up",
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_path: "vault/Lead Notes.md",
      }),
      { onConflict: "client_id,storage_path" },
    );
  });

  it("write_file retries transient vault metadata upsert failures", async () => {
    mockFileClient.uploadFile.mockResolvedValue(undefined);

    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "connection reset by peer" } })
      .mockResolvedValueOnce({ data: null, error: { message: "network timeout" } })
      .mockResolvedValueOnce({ data: null, error: null });

    const supabase = {
      from: vi.fn(() => ({ upsert })),
    };
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    await expect(
      tools.write_file.execute(
        { op: "write", path: "vault/lead-notes.md", content: "..." },
        EXECUTION_OPTIONS,
      ),
    ).resolves.toEqual({
      success: true,
      op: "write",
      path: "/agent/vault/lead-notes.md",
      path_kind: "vault",
    });

    expect(upsert).toHaveBeenCalledTimes(3);
  });

  it("write_file removes vault metadata row on delete", async () => {
    mockFileClient.deleteFile.mockResolvedValue(undefined);
    const { supabase, deleteRows, eq } = createSupabaseMock();
    const tools = createStorageTools(supabase as never, CLIENT_ID);

    await tools.write_file.execute(
      { op: "delete", path: "vault/obsolete.md" },
      EXECUTION_OPTIONS,
    );

    expect(deleteRows).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(eq).toHaveBeenCalledWith("storage_path", "vault/obsolete.md");
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

  it("read_file returns an image result for .png paths", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });
    mockFileClient.downloadFile.mockResolvedValue("not-image-content");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/photo.png" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/photo.png");
    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/photo.png",
    });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("mediaType");
  });

  it("read_file detects image extensions case-insensitively", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: toArrayBuffer(TINY_TRANSPARENT_PNG_BASE64),
      mimeType: "image/png",
    });
    mockFileClient.downloadFile.mockResolvedValue("not-image-content");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/PHOTO.PNG" }, EXECUTION_OPTIONS);

    expect(mockFileClient.downloadBinary).toHaveBeenCalledWith("vault/PHOTO.PNG");
    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/PHOTO.PNG",
    });
  });

  it("read_file re-encodes opaque image inputs as jpeg", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: await createOpaqueJpegArrayBuffer(),
      mimeType: "image/jpeg",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/photo.jpg" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/photo.jpg",
      mediaType: "image/jpeg",
    });
  });

  it("read_file auto-orients exif-rotated images before returning them to the model", async () => {
    mockFileClient.downloadBinary.mockResolvedValue({
      buffer: await createExifRotatedJpegArrayBuffer(),
      mimeType: "image/jpeg",
    });
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute({ path: "vault/photo.jpg" }, EXECUTION_OPTIONS);

    expect(result).toMatchObject({
      success: true,
      type: "image",
      path: "/agent/vault/photo.jpg",
      mediaType: "image/jpeg",
    });

    const metadata = await sharp(Buffer.from(result.data, "base64")).metadata();

    expect(metadata.width).toBe(1);
    expect(metadata.height).toBe(2);
  });

  it("read_file recovers stored image tool artifacts as image outputs", async () => {
    mockFileClient.downloadFile.mockResolvedValue(
      JSON.stringify({
        success: true,
        path: "vault/photo.png",
        type: "image",
        data: TINY_TRANSPARENT_PNG_BASE64,
        mediaType: "image/png",
      }),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "toolcalls/call-1/result.json" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      path: "/agent/vault/photo.png",
      type: "image",
      data: TINY_TRANSPARENT_PNG_BASE64,
      mediaType: "image/png",
    });
  });

  it("prefixes search_knowledge storage_path values with /agent/", async () => {
    const mockSearchSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            textSearch: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve({
                  data: [
                    {
                      filename: "notes.md",
                      storage_path: "vault/notes.md",
                      title: "notes",
                      summary: "Some notes",
                    },
                  ],
                  error: null,
                })
              ),
            })),
          })),
        })),
      })),
    };
    const tools = createStorageTools(mockSearchSupabase as never, CLIENT_ID);

    const result = await tools.search_knowledge.execute(
      { query: "notes" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({
      success: true,
      query: "notes",
      results: [
        {
          filename: "notes.md",
          storage_path: "/agent/vault/notes.md",
          title: "notes",
          summary: "Some notes",
        },
      ],
    });
  });
});

describe("read_file toModelOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("returns image-data content for image outputs", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.toModelOutput?.({
      toolCallId: "call-1",
      input: { path: "vault/photo.png" },
      output: {
        success: true,
        type: "image",
        path: "vault/photo.png",
        data: "base64encodeddata",
        mediaType: "image/png",
      },
    });

    expect(result).toEqual({
      type: "content",
      value: [{ type: "image-data", data: "base64encodeddata", mediaType: "image/png" }],
    });
  });

  it("returns explicit json output for text results", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.toModelOutput?.({
      toolCallId: "call-2",
      input: { path: "MEMORY.md" },
      output: {
        success: true,
        path: "MEMORY.md",
        content: "hello",
      },
    });

    expect(result).toEqual({
      type: "json",
      value: {
        success: true,
        path: "MEMORY.md",
        content: "hello",
      },
    });
  });

  it("returns explicit json output for directory results", async () => {
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.toModelOutput?.({
      toolCallId: "call-3",
      input: { path: "memory/" },
      output: {
        success: true,
        path: "memory/",
        content: "preferences.md",
      },
    });

    expect(result).toEqual({
      type: "json",
      value: {
        success: true,
        path: "memory/",
        content: "preferences.md",
      },
    });
  });
});

describe("read_file negative line indices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue(mockFileClient);
  });

  it("reads the last 3 lines when start_line is negative", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -3 },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, path: "/agent/file.txt", content: "c\nd\ne" });
  });

  it("supports mixed positive and negative line indices", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: 2, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, path: "/agent/file.txt", content: "b\nc\nd\ne" });
  });

  it("supports selecting only the last line", async () => {
    mockFileClient.downloadFile.mockResolvedValue("first\nsecond\nthird");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "file.txt", start_line: -1, end_line: -1 },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, path: "/agent/file.txt", content: "third" });
  });

  it("rejects end_line: 0", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute({ path: "file.txt", end_line: 0 }, EXECUTION_OPTIONS),
    ).rejects.toThrow("end_line cannot be 0");
  });

  it("rejects ranges where normalized end_line is before start_line", async () => {
    mockFileClient.downloadFile.mockResolvedValue("a\nb\nc\nd\ne");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute(
        { path: "file.txt", start_line: -1, end_line: -2 },
        EXECUTION_OPTIONS,
      ),
    ).rejects.toThrow("end_line must be greater than or equal to start_line");
  });
});
