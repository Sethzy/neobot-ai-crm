/**
 * Tests for agent-files storage helper.
 * @module lib/storage/__tests__/agent-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentFileClient } from "../agent-files";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

type StorageItem = {
  name: string;
  id: string | null;
};

function createDownloadPayload(content: string) {
  return {
    text: vi.fn().mockResolvedValue(content),
  };
}

function createBinaryDownloadPayload(bytes: Uint8Array, mimeType: string) {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ),
    type: mimeType,
  };
}

function createMockSupabase() {
  const mockDownload = vi.fn();
  const mockList = vi.fn();
  const mockUpload = vi.fn();
  const mockRemove = vi.fn();

  const mockFrom = vi.fn(() => ({
    download: mockDownload,
    list: mockList,
    upload: mockUpload,
    remove: mockRemove,
  }));

  return {
    client: {
      storage: {
        from: mockFrom,
      },
    } as unknown as SupabaseClient,
    mockFrom,
    mockDownload,
    mockList,
    mockUpload,
    mockRemove,
  };
}

describe("createAgentFileClient", () => {
  const toolOptions = { toolCallId: "tool-call", messages: [] } as never;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
  });

  it("downloads file content from the client-scoped path", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: createDownloadPayload("hello memory"),
      error: null,
    });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    const result = await client.downloadFile("MEMORY.md");

    expect(result).toBe("hello memory");
    expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(supabase.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/MEMORY.md`);
    expect(toolOptions).toBeDefined();
  });

  it("normalizes leading slashes while preserving client scoping", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: createDownloadPayload("abc"),
      error: null,
    });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.downloadFile("/memory/preferences.md");

    expect(supabase.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/memory/preferences.md`);
  });

  it("downloads binary content from the client-scoped path", async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    supabase.mockDownload.mockResolvedValue({
      data: createBinaryDownloadPayload(bytes, "image/png"),
      error: null,
    });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    const result = await client.downloadBinary("vault/photo.png");

    expect(result.mimeType).toBe("image/png");
    expect(Array.from(new Uint8Array(result.buffer))).toEqual(Array.from(bytes));
    expect(supabase.mockDownload).toHaveBeenCalledWith(`${CLIENT_ID}/vault/photo.png`);
  });

  it("surfaces storage download errors for binary files", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await expect(client.downloadBinary("vault/missing.png")).rejects.toThrow(
      'Failed to read file "vault/missing.png": Object not found',
    );
  });

  it("rejects traversal attempts in any operation path", async () => {
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await expect(client.downloadFile("../other-client/MEMORY.md")).rejects.toThrow(
      "Invalid path",
    );
    await expect(client.uploadFile("memory/../../etc/passwd", "x")).rejects.toThrow(
      "Invalid path",
    );
  });

  it("lists directories recursively with files first, then folders", async () => {
    const rootItems: StorageItem[] = [
      { name: "skills", id: null },
      { name: "USER.md", id: "f2" },
      { name: "MEMORY.md", id: "f1" },
      { name: "memory", id: null },
    ];
    const memoryItems: StorageItem[] = [
      { name: "patterns.md", id: "f3" },
      { name: "preferences.md", id: "f4" },
    ];
    const skillsItems: StorageItem[] = [{ name: "gmail.md", id: "f5" }];

    supabase.mockList
      .mockResolvedValueOnce({ data: rootItems, error: null })
      .mockResolvedValueOnce({ data: memoryItems, error: null })
      .mockResolvedValueOnce({ data: skillsItems, error: null });

    const client = createAgentFileClient(supabase.client, CLIENT_ID);
    const result = await client.listDirectory("");

    expect(supabase.mockList).toHaveBeenNthCalledWith(
      1,
      CLIENT_ID,
      expect.objectContaining({ sortBy: { column: "name", order: "asc" } }),
    );
    expect(result).toBe(
      [
        "MEMORY.md",
        "USER.md",
        "memory/",
        "  patterns.md",
        "  preferences.md",
        "skills/",
        "  gmail.md",
      ].join("\n"),
    );
  });

  it("uploads with upsert and text content type", async () => {
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.uploadFile("memory/preferences.md", "Prefers concise summaries.");

    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/preferences.md`,
      "Prefers concise summaries.",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("edits by replacing a unique match", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: createDownloadPayload("hello world"),
      error: null,
    });
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    const result = await client.editFile("notes.md", "world", "sunder");

    expect(result).toBe("hello sunder");
    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/notes.md`,
      "hello sunder",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("fails edit when old string appears multiple times and replaceAll is false", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: createDownloadPayload("foo bar foo"),
      error: null,
    });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await expect(client.editFile("notes.md", "foo", "baz")).rejects.toThrow("multiple times");
  });

  it("supports replaceAll edit mode", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: createDownloadPayload("foo bar foo baz"),
      error: null,
    });
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    const result = await client.editFile("notes.md", "foo", "qux", true);

    expect(result).toBe("qux bar qux baz");
  });

  it("deletes a client-scoped file path", async () => {
    supabase.mockRemove.mockResolvedValue({ data: [{ name: "old.md" }], error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.deleteFile("memory/old.md");

    expect(supabase.mockRemove).toHaveBeenCalledWith([`${CLIENT_ID}/memory/old.md`]);
  });

  it("allows writes to SOUL.md (unlocked for onboarding)", async () => {
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.uploadFile("SOUL.md", "new personality");

    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/SOUL.md`,
      "new personality",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("allows writes to user skill paths", async () => {
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.uploadFile("skills/call-prep/SKILL.md", "overwrite");
    await client.uploadFile("skills/my-custom-skill/references/guide.md", "allowed");

    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/skills/call-prep/SKILL.md`,
      "overwrite",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/skills/my-custom-skill/references/guide.md`,
      "allowed",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("blocks writes to protected system and connection skill paths", async () => {
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await expect(
      client.uploadFile("skills/connections/conn-1/SKILL.md", "overwrite"),
    ).rejects.toThrow("read-only");
    await expect(
      client.uploadFile("skills/system/creating-connections/SKILL.md", "overwrite"),
    ).rejects.toThrow("read-only");
  });

  it("blocks malformed writes at the skills root", async () => {
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await expect(client.uploadFile("skills/call-prep", "overwrite")).rejects.toThrow("read-only");
    await expect(client.uploadFile("skills/system", "overwrite")).rejects.toThrow("read-only");
    await expect(client.uploadFile("skills/connections", "overwrite")).rejects.toThrow("read-only");
  });

  it("does not block similarly named nested files", async () => {
    supabase.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
    const client = createAgentFileClient(supabase.client, CLIENT_ID);

    await client.uploadFile("memory/SOUL.md", "allowed");

    expect(supabase.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/SOUL.md`,
      "allowed",
      { upsert: true, contentType: "text/plain; charset=utf-8" },
    );
  });
});
