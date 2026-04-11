import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { searchMeetingsTool } from "../search-meetings";

function createMockSupabase(
  data: unknown[] | null = [],
  error: { message: string } | null = null,
  transcripts: Record<string, string> = {},
  pagedData: unknown[][] = [data ?? []],
) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const range = vi.fn((from: number) => {
    const pageIndex = Math.floor(from / 50);
    return Promise.resolve({
      data: pagedData[pageIndex] ?? [],
      error,
    });
  });
  const order = vi.fn().mockReturnValue({ limit, range });
  const gte = vi.fn().mockReturnValue({ order, limit, range });
  const lte = vi.fn().mockReturnValue({ order, limit, range });
  function eq() {
    return { eq: vi.fn(eq), gte, lte, order, limit, range };
  }
  const select = vi.fn().mockReturnValue({ eq: vi.fn(eq) });
  const download = vi.fn(async (path: string) => {
    const transcript = transcripts[path];

    if (!transcript) {
      return { data: null, error: { message: "Not found" } };
    }

    return {
      data: { text: async () => transcript },
      error: null,
    };
  });

  return {
    from: vi.fn().mockReturnValue({ select }),
    storage: {
      from: vi.fn().mockReturnValue({ download }),
    },
  };
}

function makeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("searchMeetingsTool", () => {
  it("applies the explicit client_id filter and returns meetings", async () => {
    const supabase = createMockSupabase([
      {
        meeting_record_id: "m1",
        title: "Standup",
        summary: "- daily sync",
        duration_seconds: 600,
        notes: null,
        created_at: "2026-04-06T09:00:00Z",
        status: "completed",
      },
    ]);

    const result = await searchMeetingsTool.execute({ limit: 10 }, makeContext(supabase));

    expect(result).toEqual({
      success: true,
      entity: [
        {
          meeting_record_id: "m1",
          title: "Standup",
          summary: "- daily sync",
          duration_seconds: 600,
          notes: null,
          created_at: "2026-04-06T09:00:00Z",
          status: "completed",
        },
      ],
    });
    const eqCalls = supabase.from.mock.results[0]?.value.select.mock.results[0]?.value.eq.mock.calls;
    expect(eqCalls[0]).toEqual(["client_id", "client-1"]);
  });

  it("returns errors from Supabase", async () => {
    const supabase = createMockSupabase(null, { message: "DB error" });

    const result = await searchMeetingsTool.execute({ limit: 10 }, makeContext(supabase));

    expect(result).toEqual({ success: false, error: "DB error" });
  });

  it("searches transcript content across pages", async () => {
    const firstPageMeetings = Array.from({ length: 50 }, (_, index) => ({
      meeting_record_id: `recent-${index}`,
      title: "Standup",
      summary: "- daily sync",
      duration_seconds: 600,
      notes: null,
      created_at: "2026-04-06T09:00:00Z",
      status: "completed",
      transcript_path: `home/meetings/recent-${index}.md`,
    }));
    const olderMeeting = {
      meeting_record_id: "older-match",
      title: "Old call",
      summary: "- no orchard mention",
      duration_seconds: 600,
      notes: null,
      created_at: "2026-03-01T09:00:00Z",
      status: "completed",
      transcript_path: "home/meetings/older-match.md",
    };
    const supabase = createMockSupabase(
      [],
      null,
      {
        "client-1/home/meetings/older-match.md":
          "# Meeting\n\n## Transcript\nThis older transcript mentions Orchard Towers",
      },
      [firstPageMeetings, [olderMeeting], []],
    );

    const result = await searchMeetingsTool.execute(
      { query: "orchard", limit: 1 },
      makeContext(supabase),
    );

    expect(result).toEqual({
      success: true,
      entity: [
        {
          meeting_record_id: "older-match",
          title: "Old call",
          summary: "- no orchard mention",
          duration_seconds: 600,
          notes: null,
          created_at: "2026-03-01T09:00:00Z",
          status: "completed",
        },
      ],
    });
  });
});
