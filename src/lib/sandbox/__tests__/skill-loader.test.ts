/**
 * Tests for loading user skill files into a Sprite-ready bundle.
 * @module lib/sandbox/__tests__/skill-loader
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadSkillFilesForSandbox } from "../skill-loader";

function createMockSupabase() {
  const mockList = vi.fn();
  const mockDownload = vi.fn();
  const mockFrom = vi.fn(() => ({
    list: mockList,
    download: mockDownload,
  }));

  return {
    client: {
      storage: {
        from: mockFrom,
      },
    } as const,
    mockFrom,
    mockList,
    mockDownload,
  };
}

function createDownloadPayload(content: string) {
  return {
    text: vi.fn().mockResolvedValue(content),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(content).buffer),
  };
}

describe("loadSkillFilesForSandbox", () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
  });

  it("returns an empty array when the skill directory is empty or missing", async () => {
    supabase.mockList.mockResolvedValue({ data: [], error: null });

    await expect(
      loadSkillFilesForSandbox(supabase.client as never, "client-1", "re-analyst"),
    ).resolves.toEqual([]);
  });

  it("throws when listing the skill directory fails", async () => {
    supabase.mockList.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(
      loadSkillFilesForSandbox(supabase.client as never, "client-1", "re-analyst"),
    ).rejects.toThrow(
      'Failed to list sandbox skill directory "client-1/skills/re-analyst": permission denied',
    );
  });

  it("loads SKILL.md plus nested reference files with Sprite-relative paths", async () => {
    supabase.mockList
      .mockResolvedValueOnce({
        data: [
          { name: "SKILL.md", id: "skill-file" },
          { name: "references", id: null },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: "style-guide.md", id: "ref-file" }],
        error: null,
      });

    supabase.mockDownload
      .mockResolvedValueOnce({
        data: createDownloadPayload("---\nname: x\n---\nBody"),
        error: null,
      })
      .mockResolvedValueOnce({ data: createDownloadPayload("# Reference"), error: null });

    const files = await loadSkillFilesForSandbox(
      supabase.client as never,
      "client-1",
      "re-analyst",
    );

    expect(files).toEqual([
      { path: "re-analyst/SKILL.md", content: "---\nname: x\n---\nBody" },
      { path: "re-analyst/references/style-guide.md", content: "# Reference" },
    ]);
    expect(supabase.mockFrom).toHaveBeenCalledWith("agent-files");
    expect(supabase.mockList).toHaveBeenNthCalledWith(1, "client-1/skills/re-analyst");
    expect(supabase.mockList).toHaveBeenNthCalledWith(
      2,
      "client-1/skills/re-analyst/references",
    );
  });

  it("throws when downloading a listed skill file fails", async () => {
    supabase.mockList.mockResolvedValue({
      data: [
        { name: "SKILL.md", id: "skill-file" },
        { name: "notes.md", id: "notes-file" },
      ],
      error: null,
    });

    supabase.mockDownload
      .mockResolvedValueOnce({ data: createDownloadPayload("skill body"), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "missing" } });

    await expect(
      loadSkillFilesForSandbox(supabase.client as never, "client-1", "re-analyst"),
    ).rejects.toThrow(
      'Failed to download sandbox skill file "client-1/skills/re-analyst/notes.md": missing',
    );
  });
});
