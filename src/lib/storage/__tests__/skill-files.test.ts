/**
 * Tests for connection-scoped skill file lookup.
 * @module lib/storage/__tests__/skill-files
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

import { getConnectionSkillContent, getConnectionSkillPath } from "../skill-files";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const CONNECTION_ID = "conn-abc-123";

function createMockStorageSupabase() {
  const mockDownload = vi.fn();
  const mockFrom = vi.fn(() => ({
    download: mockDownload,
  }));

  return {
    client: {
      storage: {
        from: mockFrom,
      },
    } as unknown as SupabaseClient<Database>,
    mockFrom,
    mockDownload,
  };
}

describe("getConnectionSkillPath", () => {
  it("returns the client-scoped connection skill path", () => {
    expect(getConnectionSkillPath(CLIENT_ID, CONNECTION_ID)).toBe(
      `${CLIENT_ID}/skills/connections/${CONNECTION_ID}/SKILL.md`,
    );
  });
});

describe("getConnectionSkillContent", () => {
  let supabase: ReturnType<typeof createMockStorageSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockStorageSupabase();
  });

  it("returns null when download fails", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const result = await getConnectionSkillContent(supabase.client, CLIENT_ID, CONNECTION_ID);

    expect(result).toBeNull();
    expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(supabase.mockDownload).toHaveBeenCalledWith(
      `${CLIENT_ID}/skills/connections/${CONNECTION_ID}/SKILL.md`,
    );
  });

  it("returns file content when the skill file exists", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: {
        text: vi.fn().mockResolvedValue("# Gmail Skills\n\nUse threads."),
      },
      error: null,
    });

    await expect(
      getConnectionSkillContent(supabase.client, CLIENT_ID, CONNECTION_ID),
    ).resolves.toBe("# Gmail Skills\n\nUse threads.");
  });

  it("returns null when data exists but an error is also returned", async () => {
    supabase.mockDownload.mockResolvedValue({
      data: {
        text: vi.fn().mockResolvedValue("content"),
      },
      error: { message: "partial error" },
    });

    await expect(
      getConnectionSkillContent(supabase.client, CLIENT_ID, CONNECTION_ID),
    ).resolves.toBeNull();
  });
});
