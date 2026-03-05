/**
 * Tests for chat stream reconnect endpoint.
 * @module lib/ai/__tests__/chat-stream-route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateClient,
  mockResolveClientId,
  mockGetActiveStreamId,
  mockClearActiveStreamId,
  mockCreateResumableStreamContext,
  mockResumeExistingStream,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockGetActiveStreamId: vi.fn(),
  mockClearActiveStreamId: vi.fn(),
  mockCreateResumableStreamContext: vi.fn(),
  mockResumeExistingStream: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/redis", () => ({
  getActiveStreamId: mockGetActiveStreamId,
  clearActiveStreamId: mockClearActiveStreamId,
}));

vi.mock("resumable-stream", () => ({
  createResumableStreamContext: mockCreateResumableStreamContext,
}));

import { GET } from "../../../../app/api/chat/[id]/stream/route";

const threadId = "770e8400-e29b-41d4-a716-446655440000";

function createParams() {
  return { params: Promise.resolve({ id: threadId }) };
}

function createThreadLookup(threadExists: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: threadExists ? { thread_id: threadId } : null,
    error: null,
  });
  const thirdEq = vi.fn(() => ({ maybeSingle }));
  const secondEq = vi.fn(() => ({ eq: thirdEq }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));
  return vi.fn(() => ({ select }));
}

describe("GET /api/chat/[id]/stream", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSupabase.from = createThreadLookup(true);

    mockResolveClientId.mockResolvedValue("client-456");
    mockGetActiveStreamId.mockResolvedValue(null);
    mockResumeExistingStream.mockResolvedValue(null);
    mockCreateResumableStreamContext.mockReturnValue({
      resumeExistingStream: mockResumeExistingStream,
    });
  });

  it("returns 204 when no resumable stream is available", async () => {
    const response = await GET(new Request("http://localhost/api/chat/thread/stream"), createParams());

    expect(response.status).toBe(204);
    expect(mockGetActiveStreamId).toHaveBeenCalledWith(threadId);
    expect(mockResolveClientId).not.toHaveBeenCalled();
  });

  it("clears stale active stream id when redis points to a missing stream", async () => {
    mockGetActiveStreamId.mockResolvedValue("stream-123");
    mockResumeExistingStream.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/chat/thread/stream"), createParams());

    expect(response.status).toBe(204);
    expect(mockClearActiveStreamId).toHaveBeenCalledWith(threadId);
  });

  it("returns 204 when stream context is unavailable", async () => {
    mockGetActiveStreamId.mockResolvedValue("stream-123");
    mockCreateResumableStreamContext.mockImplementation(() => {
      throw new Error("stream context unavailable");
    });

    const response = await GET(new Request("http://localhost/api/chat/thread/stream"), createParams());

    expect(response.status).toBe(204);
  });

  it("returns 200 and UI stream headers when a resumable stream exists", async () => {
    const resumedStream = new ReadableStream();
    mockGetActiveStreamId.mockResolvedValue("stream-123");
    mockResumeExistingStream.mockResolvedValue(resumedStream);

    const response = await GET(new Request("http://localhost/api/chat/thread/stream"), createParams());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(mockClearActiveStreamId).not.toHaveBeenCalled();
  });

  it("returns 204 when user is unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const response = await GET(new Request("http://localhost/api/chat/thread/stream"), createParams());

    expect(response.status).toBe(204);
    expect(mockResolveClientId).not.toHaveBeenCalled();
  });
});
