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
  mockGenerateObject,
  mockBuildSummaryPrompt,
  mockGateway,
  mockStorageFrom,
  mockCreateSignedUrl,
  mockUpload,
  mockMeetingRecordInsert,
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
  mockGenerateObject: vi.fn(),
  mockBuildSummaryPrompt: vi.fn(),
  mockGateway: vi.fn().mockReturnValue("mock-model"),
  mockStorageFrom: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockUpload: vi.fn(),
  mockMeetingRecordInsert: vi.fn(),
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

vi.mock("@/lib/transcription/rev-ai", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock("@/lib/meetings/summary-prompt", () => ({
  buildSummaryPrompt: (...args: unknown[]) => mockBuildSummaryPrompt(...args),
}));

vi.mock("@/lib/ai/gateway", () => ({
  gateway: (...args: unknown[]) => mockGateway(...args),
  gatewayProviderOptions: {},
  COMPACTION_MODEL: "google/gemini-2.5-flash-lite", // not used by ingest anymore
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
  mockMeetingRecordInsert.mockReturnValue({
    select: insertSelect,
  });
  const update = vi.fn().mockReturnValue({
    eq: mockMeetingRecordUpdateEq,
  });

  mockMeetingRecordsFrom.mockReturnValue({
    select,
    insert: mockMeetingRecordInsert,
    update,
  });
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
      segments: [
        { start: 0, end: 2.5, text: "Met with Sarah.", speaker: 1 },
        { start: 2.5, end: 6.1, text: "About the Orchard deal.", speaker: 2 },
      ],
    });
    mockUpload.mockResolvedValue({ data: { path: "client-1/home/meetings/..." }, error: null });
    mockBuildSummaryPrompt.mockReturnValue("test prompt");
    mockGenerateObject.mockResolvedValue({
      object: {
        title: "Portfolio Review with Sarah",
        key_discussion_points: ["Discussed the Orchard deal"],
        action_items: ["Send pricing by Thursday"],
        client_concerns: [],
        personal_details: [],
        next_steps: ["Follow up Thursday"],
      },
    });
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
        title: null,
        summary: null,
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
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      meetingRecordId: "existing-meeting-id",
      transcriptPath: "home/meetings/existing.md",
      title: null,
      summary: null,
      deduplicated: true,
    });
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("creates the meeting record, transcribes, auto-summarizes, and returns the result", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "Call back Thursday\nSend pricing",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meetingRecordId).toBe("770e8400-e29b-41d4-a716-446655440000");
    expect(body.transcriptPath).toBe("home/meetings/2026-04-06-meeting-770e8400.md");
    expect(body.title).toBe("Portfolio Review with Sarah");
    const parsedSummary = JSON.parse(body.summary);
    expect(parsedSummary.key_discussion_points).toEqual(["Discussed the Orchard deal"]);
    expect(parsedSummary.action_items).toEqual(["Send pricing by Thursday"]);
    expect(parsedSummary.next_steps).toEqual(["Follow up Thursday"]);
    expect(mockTranscribeAudio).toHaveBeenCalledWith({
      audioUrl: "https://storage.example.com/audio?token=signed",
    });
    expect(mockBuildSummaryPrompt).toHaveBeenCalledWith(
      "[00:00] Speaker 1: Met with Sarah.\n[00:02] Speaker 2: About the Orchard deal.",
      "Call back Thursday\nSend pricing",
    );
    expect(mockGateway).toHaveBeenCalledWith("google/gemini-2.5-flash-lite");
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        prompt: "test prompt",
        providerOptions: {},
      }),
    );
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/home/meetings/2026-04-06-meeting-770e8400.md",
      expect.stringContaining("## Transcript\n[00:00] Speaker 1: Met with Sarah.\n[00:02] Speaker 2: About the Orchard deal."),
      {
        contentType: "text/markdown",
        upsert: true,
      },
    );
    expect(mockMeetingRecordInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: null,
      }),
    );
  });

  it("rejects storage paths outside the caller's tenant prefix", async () => {
    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "other-client/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid meeting audio path",
    });
  });

  it("fails when persisting a meeting status update fails", async () => {
    mockMeetingRecordUpdateEq
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "update failed" } });

    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "Call back Thursday\nSend pricing",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Meeting ingest failed",
    });
  });

  it("skips summarization and returns default title when transcript is too short", async () => {
    mockTranscribeAudio.mockResolvedValue({
      text: "...",
      segments: [
        { start: 0, end: 1, text: "...", speaker: 1 },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 5,
          notes: "",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe("Untitled Recording");
    expect(body.summary).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("still returns the structured error response when marking the meeting as failed also errors", async () => {
    mockMeetingRecordUpdateEq.mockResolvedValue({ error: { message: "write failed" } });

    const response = await POST(
      new Request("http://localhost/api/meetings/ingest", {
        method: "POST",
        body: JSON.stringify({
          storagePath: "client-1/meetings/raw/uploaded.webm",
          durationSeconds: 180,
          notes: "Call back Thursday\nSend pricing",
          idempotencyKey: "880e8400-e29b-41d4-a716-446655440000",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Meeting ingest failed",
    });
  });
});
