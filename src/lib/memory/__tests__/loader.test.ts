/**
 * Tests for loading memory context from storage.
 * @module lib/memory/__tests__/loader
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMemoryContext } from "../loader";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createDownloadPayload(content: string) {
  return { text: vi.fn().mockResolvedValue(content) };
}

function createMockStorage() {
  const mockDownload = vi.fn();
  const mockFrom = vi.fn(() => ({ download: mockDownload }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockDownload,
    mockFrom,
  };
}

describe("loadMemoryContext", () => {
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockStorage();
  });

  it("loads SOUL.md, USER.md, and MEMORY.md", async () => {
    mock.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("soul content"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("user content"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("memory content"), error: null });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    expect(result).toEqual({
      soul: "soul content",
      user: "user content",
      memory: "memory content",
    });
  });

  it("truncates MEMORY.md to the first 200 lines", async () => {
    const longMemory = Array.from({ length: 220 }, (_, index) => `Line ${index + 1}`).join("\n");

    mock.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("soul"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload("user"), error: null })
      .mockResolvedValueOnce({ data: createDownloadPayload(longMemory), error: null });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);
    const lines = result.memory.split("\n");

    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe("Line 1");
    expect(lines[199]).toBe("Line 200");
  });

  it("returns empty strings when files are missing or unreadable", async () => {
    mock.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const result = await loadMemoryContext(mock.client, CLIENT_ID);

    expect(result).toEqual({
      soul: "",
      user: "",
      memory: "",
    });
  });
});
