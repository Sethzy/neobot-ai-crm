import { describe, expect, it, vi } from "vitest";

import { createMeetingTools } from "../index";

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
      return {
        data: null,
        error: { message: "Not found" },
      };
    }

    return {
      data: {
        text: async () => transcript,
      },
      error: null,
    };
  });

  return {
    from: vi.fn().mockReturnValue({ select }),
    storage: {
      from: vi.fn().mockReturnValue({ download }),
    },
  } as any;
}

describe("search_meetings tool", () => {
  it("returns meetings for the given client", async () => {
    const mockMeetings = [
      {
        meeting_record_id: "m1",
        title: "Standup",
        summary: "- daily sync",
        duration_seconds: 600,
        notes: null,
        created_at: "2026-04-06T09:00:00Z",
        status: "completed",
      },
    ];
    const supabase = createMockSupabase(mockMeetings);
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute(
      { limit: 10 },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({ success: true, entity: mockMeetings });
  });

  it("returns error on Supabase failure", async () => {
    const supabase = createMockSupabase(null, { message: "DB error" });
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute(
      { limit: 10 },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).toEqual({ success: false, error: "DB error" });
  });

  it("searches transcript content when the query is not in title, notes, or summary", async () => {
    const mockMeetings = [
      {
        meeting_record_id: "m1",
        title: "Standup",
        summary: "- daily sync",
        duration_seconds: 600,
        notes: null,
        created_at: "2026-04-06T09:00:00Z",
        status: "completed",
        transcript_path: "home/meetings/2026-04-06-meeting-m1.md",
      },
    ];
    const supabase = createMockSupabase(
      mockMeetings,
      null,
      {
        "client-1/home/meetings/2026-04-06-meeting-m1.md":
          "# Meeting\n\n## Transcript\nClient asked about Orchard pricing",
      },
    );
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute(
      { query: "orchard", limit: 10 },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

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
  });

  it("keeps paging transcript candidates until it finds older matches", async () => {
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
    const tools = createMeetingTools(supabase, "client-1");

    const result = await tools.search_meetings.execute(
      { query: "orchard", limit: 1 },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
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
