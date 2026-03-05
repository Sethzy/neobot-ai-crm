/**
 * Tests for memory bootstrap behavior.
 * @module lib/memory/__tests__/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { _resetBootstrapCache, bootstrapMemoryFiles } from "../bootstrap";
import {
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_KEY_DECISIONS_MD,
  DEFAULT_MEMORY_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_PREFERENCES_MD,
  DEFAULT_SOUL_MD,
  DEFAULT_USER_MD,
} from "../templates";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

/** Simulates a file entry returned by `bucket.list()`. */
function fileEntry(name: string) {
  return { id: name, name, updated_at: "2026-03-05T00:00:00Z" };
}

function createMockStorage() {
  const mockList = vi.fn();
  const mockUpload = vi.fn();
  const mockFrom = vi.fn(() => ({
    list: mockList,
    upload: mockUpload,
  }));

  return {
    client: { storage: { from: mockFrom } } as unknown as SupabaseClient,
    mockList,
    mockUpload,
    mockFrom,
  };
}

describe("bootstrapMemoryFiles", () => {
  let mock: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetBootstrapCache();
    mock = createMockStorage();
  });

  it("creates only files that are missing", async () => {
    // Root dir has SOUL.md only — USER.md and MEMORY.md are missing.
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("SOUL.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });
    mock.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockUpload).toHaveBeenCalledTimes(2);
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/USER.md`,
      DEFAULT_USER_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/MEMORY.md`,
      DEFAULT_MEMORY_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("throws when an upload fails", async () => {
    // Only SOUL.md missing in root, all topic files present.
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });
    mock.mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    });

    await expect(bootstrapMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "Failed to bootstrap SOUL.md",
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/SOUL.md`,
      DEFAULT_SOUL_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("treats upload conflict as idempotent success", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });
    mock.mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "The resource already exists", status: 409, statusCode: "409" },
    });

    await expect(bootstrapMemoryFiles(mock.client, CLIENT_ID)).resolves.toBeUndefined();
  });

  it("does nothing when all required files already exist", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("SOUL.md"), fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockUpload).not.toHaveBeenCalled();
  });

  it("creates topic files when root files exist but topic files are missing", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("SOUL.md"), fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    mock.mockUpload.mockResolvedValue({ data: { path: "ok" }, error: null });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockUpload).toHaveBeenCalledTimes(4);
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/preferences.md`,
      DEFAULT_PREFERENCES_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/growth-plan.md`,
      DEFAULT_GROWTH_PLAN_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/patterns.md`,
      DEFAULT_PATTERNS_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
    expect(mock.mockUpload).toHaveBeenCalledWith(
      `${CLIENT_ID}/memory/key-decisions.md`,
      DEFAULT_KEY_DECISIONS_MD,
      { upsert: false, contentType: "text/plain; charset=utf-8" },
    );
  });

  it("skips storage calls on warm invocations (process cache)", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("SOUL.md"), fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);
    mock.mockList.mockClear();

    // Second call should skip entirely.
    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockList).not.toHaveBeenCalled();
    expect(mock.mockUpload).not.toHaveBeenCalled();
  });

  it("uses parallel list calls (root + topic dirs)", async () => {
    mock.mockList
      .mockResolvedValueOnce({
        data: [fileEntry("SOUL.md"), fileEntry("USER.md"), fileEntry("MEMORY.md")],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          fileEntry("preferences.md"),
          fileEntry("growth-plan.md"),
          fileEntry("patterns.md"),
          fileEntry("key-decisions.md"),
        ],
        error: null,
      });

    await bootstrapMemoryFiles(mock.client, CLIENT_ID);

    expect(mock.mockList).toHaveBeenCalledTimes(2);
    expect(mock.mockList).toHaveBeenCalledWith(CLIENT_ID);
    expect(mock.mockList).toHaveBeenCalledWith(`${CLIENT_ID}/memory`);
  });
});
