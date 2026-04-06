/**
 * Tests for the meeting follow-up background runner wrapper.
 * @module lib/runner/__tests__/run-meeting-followup
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent, mockBuildMeetingInstructions } = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockBuildMeetingInstructions: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/ai/meeting-prompt", () => ({
  buildMeetingInstructions: mockBuildMeetingInstructions,
}));

import { runMeetingFollowUp } from "../run-meeting-followup";

function createSupabaseMock() {
  const updateCalls: Array<Record<string, unknown>> = [];
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    updateCalls.push(payload);
    return { eq };
  });
  const from = vi.fn().mockReturnValue({ update });

  return {
    supabase: { from } as never,
    updateCalls,
    from,
    update,
    eq,
  };
}

describe("runMeetingFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildMeetingInstructions.mockReturnValue("meeting instructions");
  });

  it("marks the meeting as processing, consumes the stream, and completes successfully", async () => {
    const { supabase, updateCalls } = createSupabaseMock();
    const consumeStream = vi.fn().mockResolvedValue(undefined);
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: { consumeStream },
    });

    const result = await runMeetingFollowUp({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
      transcriptPath: "home/meetings/meeting.md",
      notes: "Call back Thursday",
      durationMinutes: 45,
      supabase,
    });

    expect(result).toEqual({ status: "completed" });
    expect(mockBuildMeetingInstructions).toHaveBeenCalledWith({
      transcriptPath: "home/meetings/meeting.md",
      notes: "Call back Thursday",
      durationMinutes: 45,
    });
    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: "550e8400-e29b-41d4-a716-446655440000",
        threadId: "660e8400-e29b-41d4-a716-446655440000",
        input: "",
        triggerType: "pulse",
        channel: "web",
        consumeMessageQuota: false,
        instructions: "meeting instructions",
      },
      supabase,
    );
    expect(consumeStream).toHaveBeenCalledOnce();
    expect(updateCalls[0]).toMatchObject({ status: "processing" });
    expect(updateCalls[1]).toMatchObject({ status: "completed" });
  });

  it("marks the meeting as failed when stream consumption reports an error", async () => {
    const { supabase, updateCalls } = createSupabaseMock();
    mockRunAgent.mockResolvedValue({
      status: "streaming",
      streamResult: {
        consumeStream: vi.fn().mockImplementation(async ({ onError }) => {
          onError(new Error("Stream died"));
        }),
      },
    });

    const result = await runMeetingFollowUp({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
      transcriptPath: "home/meetings/meeting.md",
      notes: "",
      durationMinutes: 30,
      supabase,
    });

    expect(result).toEqual({ status: "failed", error: "Stream died" });
    expect(updateCalls[0]).toMatchObject({ status: "processing" });
    expect(updateCalls[1]).toMatchObject({ status: "failed" });
  });

  it("resets the meeting back to transcribed when the thread is busy", async () => {
    const { supabase, updateCalls } = createSupabaseMock();
    mockRunAgent.mockResolvedValue({ status: "queued" });

    const result = await runMeetingFollowUp({
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
      transcriptPath: "home/meetings/meeting.md",
      notes: "",
      durationMinutes: 30,
      supabase,
    });

    expect(result).toEqual({ status: "skipped_busy" });
    expect(updateCalls[0]).toMatchObject({ status: "processing" });
    expect(updateCalls[1]).toMatchObject({ status: "transcribed" });
  });
});
