/**
 * Tests for memory bootstrap behavior.
 * @module lib/memory/__tests__/bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapMemoryFiles, ensureClientBootstrap } from "../bootstrap";
import {
  DEFAULT_GROWTH_PLAN_MD,
  DEFAULT_KEY_DECISIONS_MD,
  DEFAULT_MEMORY_MD,
  DEFAULT_PATTERNS_MD,
  DEFAULT_PREFERENCES_MD,
  DEFAULT_SOUL_MD,
  DEFAULT_USER_MD,
} from "../templates";

const { mockBootstrapSkills } = vi.hoisted(() => ({
  mockBootstrapSkills: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runner/skills/skill-bootstrap", () => ({
  bootstrapSkills: mockBootstrapSkills,
}));

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
    mock = createMockStorage();
  });

  it("bootstraps bundled instruction skills after memory files", async () => {
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

    expect(mockBootstrapSkills).toHaveBeenCalledWith(mock.client, CLIENT_ID);
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

  it("throws when a storage list call fails", async () => {
    mock.mockList
      .mockResolvedValueOnce({ data: null, error: { message: "storage unavailable" } })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(bootstrapMemoryFiles(mock.client, CLIENT_ID)).rejects.toThrow(
      "storage unavailable",
    );
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

describe("ensureClientBootstrap", () => {
  let mock: ReturnType<typeof createMockStorage>;

  function createMockClientWithDb(opts: { isBootstrapped: boolean }) {
    mock = createMockStorage();

    if (!opts.isBootstrapped) {
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
    }

    const mockSingle = vi.fn().mockResolvedValue({
      data: { is_bootstrapped: opts.isBootstrapped },
      error: null,
    });

    let updateError: { message: string } | null = null;
    const updateEq = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: null, error: updateError }),
    );
    const update = vi.fn(() => ({ eq: updateEq }));
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: mockSingle }),
    });

    const mockFrom = vi.fn((table: string) => {
      if (table === "clients") return { select, update };
      return {};
    });

    const client = {
      ...mock.client,
      from: mockFrom,
    } as unknown as SupabaseClient;

    return {
      client, mockFrom, mockSingle, update, updateEq,
      setUpdateError: (msg: string) => { updateError = { message: msg }; },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips bootstrap when is_bootstrapped is true", async () => {
    const { client } = createMockClientWithDb({ isBootstrapped: true });

    await ensureClientBootstrap(client, CLIENT_ID);

    expect(mock.mockList).not.toHaveBeenCalled();
    expect(mock.mockUpload).not.toHaveBeenCalled();
  });

  it("runs bootstrap and sets flag when is_bootstrapped is false", async () => {
    const { client, update } = createMockClientWithDb({ isBootstrapped: false });

    await ensureClientBootstrap(client, CLIENT_ID);

    expect(mock.mockList).toHaveBeenCalled();
    expect(mockBootstrapSkills).toHaveBeenCalledWith(client, CLIENT_ID);
    expect(update).toHaveBeenCalledWith({ is_bootstrapped: true });
  });

  it("does not set is_bootstrapped if bootstrap throws", async () => {
    const { client, update } = createMockClientWithDb({ isBootstrapped: false });
    mock.mockList.mockReset();
    mock.mockList.mockResolvedValueOnce({
      data: null,
      error: { message: "storage down" },
    });

    await expect(ensureClientBootstrap(client, CLIENT_ID)).rejects.toThrow("storage down");
    expect(update).not.toHaveBeenCalled();
  });

  it("throws when the UPDATE to set is_bootstrapped fails", async () => {
    const db = createMockClientWithDb({ isBootstrapped: false });
    db.setUpdateError("connection lost");

    await expect(ensureClientBootstrap(db.client, CLIENT_ID)).rejects.toThrow(
      "connection lost",
    );
  });
});
