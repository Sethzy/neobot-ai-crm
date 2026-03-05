/**
 * Tests for memory file listing helper.
 * @module lib/memory/__tests__/list-memory-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listMemoryFiles } from "../loader";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createMockStorageList() {
  const mockList = vi.fn();
  const mockFrom = vi.fn(() => ({ list: mockList }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockList,
    mockFrom,
  };
}

describe("listMemoryFiles", () => {
  let mock: ReturnType<typeof createMockStorageList>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = createMockStorageList();
  });

  it("returns root memory files and topic files", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [
          { id: "1", name: "SOUL.md", updated_at: "2026-03-05T00:00:00Z" },
          { id: "2", name: "USER.md", updated_at: "2026-03-05T01:00:00Z" },
          { id: "3", name: "MEMORY.md", updated_at: "2026-03-05T02:00:00Z" },
          { id: null, name: "memory" },
          { id: "99", name: "some-other-file.txt", updated_at: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "4", name: "preferences.md", updated_at: "2026-03-05T03:00:00Z" },
          { id: "5", name: "growth-plan.md", updated_at: "2026-03-05T04:00:00Z" },
          { id: "6", name: "patterns.md", updated_at: "2026-03-05T05:00:00Z" },
          { id: "7", name: "key-decisions.md", updated_at: "2026-03-05T06:00:00Z" },
          { id: "8", name: "notes.txt", updated_at: "2026-03-05T07:00:00Z" },
        ],
        error: null,
      });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toEqual([
      { name: "SOUL.md", path: "SOUL.md", updatedAt: "2026-03-05T00:00:00Z" },
      { name: "USER.md", path: "USER.md", updatedAt: "2026-03-05T01:00:00Z" },
      { name: "MEMORY.md", path: "MEMORY.md", updatedAt: "2026-03-05T02:00:00Z" },
      { name: "growth-plan.md", path: "memory/growth-plan.md", updatedAt: "2026-03-05T04:00:00Z" },
      { name: "key-decisions.md", path: "memory/key-decisions.md", updatedAt: "2026-03-05T06:00:00Z" },
      { name: "patterns.md", path: "memory/patterns.md", updatedAt: "2026-03-05T05:00:00Z" },
      { name: "preferences.md", path: "memory/preferences.md", updatedAt: "2026-03-05T03:00:00Z" },
    ]);

    expect(mock.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mock.mockList).toHaveBeenCalledWith(CLIENT_ID, expect.any(Object));
    expect(mock.mockList).toHaveBeenCalledWith(`${CLIENT_ID}/memory`, expect.any(Object));
  });

  it("filters out non-memory root files and directory entries", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [
          { id: "1", name: "SOUL.md", updated_at: "2026-03-05T00:00:00Z" },
          { id: "99", name: "random.txt", updated_at: "2026-01-01T00:00:00Z" },
          { id: null, name: "memory" },
          { id: null, name: "vault" },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("SOUL.md");
  });

  it("returns empty array when no files exist", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await listMemoryFiles(mock.client, CLIENT_ID);

    expect(result).toEqual([]);
  });

  it("throws when root listing fails", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: null,
        error: { message: "permission denied" },
      })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(listMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "permission denied",
    );
  });

  it("throws when memory topic listing fails", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "bucket not found" },
      });

    await expect(listMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "bucket not found",
    );
  });
});
