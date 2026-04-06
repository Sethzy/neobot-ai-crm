/**
 * Tests for the meeting ingest route.
 * @module app/api/meetings/ingest/route.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockJsonError,
  mockResolveClientId,
  mockTranscribeAudio,
  mockRunMeetingFollowUp,
  mockCreateMessage,
  mockStorageFrom,
  mockCreateSignedUrl,
  mockUpload,
  mockMeetingRecordMaybeSingle,
  mockMeetingRecordInsertSingle,
  mockMeetingRecordUpdateEq,
  mockMeetingRecordsFrom,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockJsonError: vi.fn((message: string, status: number) =>
    Response.json({ error: message }, { status })),
  mockResolveClientId: vi.fn(),
  mockTranscribeAudio: vi.fn(),
  mockRunMeetingFollowUp: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockUpload: vi.fn(),
  mockMeetingRecordMaybeSingle: vi.fn(),
  mockMeetingRecordInsertSingle: vi.fn(),
  mockMeetingRecordUpdateEq: vi.fn(),
  mockMeetingRecordsFrom: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (...args: unknown[]) => mockJsonError(...args),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/transcription/groq-whisper", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

vi.mock("@/lib/runner/run-meeting-followup", () => ({
  runMeetingFollowUp: (...args: unknown[]) => mockRunMeetingFollowUp(...args),
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
}));

import { POST } from "./route";

function createMeetingRecordQueryMock() {
  const maybeSingleEqClient = vi.fn().mockReturnValue({
    maybeSingle: mockMeetingRecordMaybeSingle,
  });
  const maybeSingleEqIdempotency = vi.fn().mockReturnValue({
    eq: maybeSingleEqClient,
  });
  const select = vi.fn().mockReturnValue({
    eq: maybeSingleEqIdempotency,
  });
  const insertSelect = vi.fn().mockReturnValue({
    single: mockMeetingRecordInsertSingle,
  });
  const insert = vi.fn().mockReturnValue({
    select: insertSelect,
  });
  const update = vi.fn().mockReturnValue({
    eq: mockMeetingRecordUpdateEq,
  });

  mockMeetingRecordsFrom.mockReturnValue({
    select,
    insert,
    update,
  });

  return {
    select,
    insert,
    insertSelect,
    update,
    maybeSingleEqIdempotency,
    maybeSingleEqClient,
  };
}

describe("POST /api/meetings/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T09:30:00.000Z"));

    createMeetingRecordQueryMock();

    mockStorageFrom.mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
      upload: mockUpload,
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "meeting_records") {
            return mockMeetingRecordsFrom();
          }

          throw new Error(`Unexpected table: ${table}`);
        }),
        storage: {
          from: mockStorageFrom,
        },
      },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockMeetingRecordMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockMeetingRecordInsertSingle.mockResolvedValue({
      data: {
        meeting_record_id: "770e8400-e29b-41d4-a716-446655440000",
      },
      error: null,
    });
    mockMeetingRecordUpdateEq.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/audio?token=signed",
      },
      error: null,
    });
    mockTranscribeAudio.mockResolvedValue({
      text: "Met with Sarah about the Orchard deal.",
    });
    mockUpload.mockResolvedValue({ data: { path: "client-1/home/meetings/..." }, error: null });
    mockCreateMessage.mockResolvedValue({
      message_id: "message-1",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      role: "user",
      content: "[Meeting recorded: 3 min, 2 notes]",
      parts: [],
      created_at: new Date().toISOString(),
    });
    mockRunMeetingFollowUp.mockResolvedValue({ status: "completed" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns deduplicated success when the idempotency key already finished processing", async () => {
    mockMeetingRecordMaybeSingle.mockResolvedValue({
      data: {
        meeting_record_id: "existing-meeting-id",
        status: "completed",
        transcript_path: "home/meetings/existing.md",
      },
      error: null,
    });

    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "Line one\nLine two",
          threadId: "660e8400-e29b-41d4-a716-446655440000",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      meetingRecordId: "existing-meeting-id",
      transcriptPath: "home/meetings/existing.md",
      deduplicated: true,
    });
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockRunMeetingFollowUp).not.toHaveBeenCalled();
  });

  it("creates the meeting record, saves the transcript, and triggers follow-up processing", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "Call back Thursday\nSend pricing",
          threadId: "660e8400-e29b-41d4-a716-446655440000",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
      transcriptPath: "home/meetings/2026-04-06-meeting-770e8400.md",
    });
    expect(mockTranscribeAudio).toHaveBeenCalledWith({
      audioUrl: "https://storage.example.com/audio?token=signed",
    });
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/home/meetings/2026-04-06-meeting-770e8400.md",
      expect.stringContaining("## Transcript\nMet with Sarah about the Orchard deal."),
      {
        contentType: "text/markdown",
        upsert: true,
      },
    );
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        role: "user",
        content: "[Meeting recorded: 3 min, 2 notes]",
      }),
    );
    expect(mockRunMeetingFollowUp).toHaveBeenCalledWith({
      clientId: "client-1",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      meetingRecordId: "770e8400-e29b-41d4-a716-446655440000",
      transcriptPath: "home/meetings/2026-04-06-meeting-770e8400.md",
      notes: "Call back Thursday\nSend pricing",
      durationMinutes: 3,
      supabase: expect.anything(),
    });
  });

  it("rejects storage paths outside the caller's tenant prefix", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "other-client/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "",
          threadId: "660e8400-e29b-41d4-a716-446655440000",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid meeting audio path",
    });
  });
});
