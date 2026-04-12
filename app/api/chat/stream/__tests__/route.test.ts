/**
 * Tests for GET /api/chat/stream — the long-lived thread subscription.
 *
 * SSE endpoints are awkward to test at the response level, so we test:
 *   1. Auth and error paths at the route level (returns 400/401/404).
 *   2. The route returns a streaming response for valid threads.
 *
 * @module app/api/chat/stream/__tests__/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateRequest,
  resolveClientId,
  getAnthropicClient,
  iterateSessionEventsForever,
  buildUiStreamCallbacks,
  dispatchEventToCallbacks,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveClientId: vi.fn(),
  getAnthropicClient: vi.fn(),
  iterateSessionEventsForever: vi.fn(),
  buildUiStreamCallbacks: vi.fn(),
  dispatchEventToCallbacks: vi.fn(),
}));

const maybeSingle = vi.fn();

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest,
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}));
vi.mock("@/lib/chat/client-id", () => ({ resolveClientId }));
vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient,
}));
vi.mock("@/lib/managed-agents/session-reconnect", () => ({
  iterateSessionEventsForever,
}));
vi.mock("@/lib/managed-agents/session-stream-forwarder", () => ({
  buildUiStreamCallbacks,
}));
vi.mock("@/lib/managed-agents/dispatch-event-to-callbacks", () => ({
  dispatchEventToCallbacks,
}));

/**
 * Mock `createUIMessageStream` so we can test the execute callback without
 * actually wiring up a real stream transport.
 */
let capturedExecute: ((opts: { writer: unknown }) => Promise<void>) | null =
  null;
vi.mock("ai", () => ({
  createUIMessageStream: ({
    execute,
  }: {
    execute: (opts: { writer: unknown }) => Promise<void>;
  }) => {
    capturedExecute = execute;
    return new ReadableStream();
  },
  createUIMessageStreamResponse: ({ stream }: { stream: ReadableStream }) =>
    new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
}));

import { GET } from "../route";

describe("GET /api/chat/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedExecute = null;
    maybeSingle.mockReset();
    authenticateRequest.mockResolvedValue({
      kind: "ok",
      userId: "u1",
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle }) }),
          }),
        }),
      },
    });
    resolveClientId.mockResolvedValue("c1");
    getAnthropicClient.mockReturnValue({});
  });

  it("returns 400 when threadId is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/chat/stream"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    authenticateRequest.mockResolvedValue({
      kind: "error",
      response: new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
      }),
    });
    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when thread has no session", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when session_id is null", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: null },
      error: null,
    });
    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns a streaming response for a valid thread", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_abc" },
      error: null,
    });

    // iterateSessionEventsForever yields nothing (empty turn)
    iterateSessionEventsForever.mockImplementation(async function* () {
      // empty
    });
    buildUiStreamCallbacks.mockReturnValue({});

    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("closes the stream after emitting finish on end_turn", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_idle" },
      error: null,
    });

    const events = [
      { id: "evt_1", type: "agent.message", content: [{ type: "text", text: "hi" }] },
      { id: "evt_2", type: "session.status_idle", stop_reason: { type: "end_turn" } },
      { id: "evt_3", type: "agent.message", content: [{ type: "text", text: "never reached" }] },
    ];
    iterateSessionEventsForever.mockImplementation(async function* () {
      for (const e of events) yield e;
    });
    buildUiStreamCallbacks.mockReturnValue({});

    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(200);

    if (capturedExecute) {
      const fakeWriter = { write: vi.fn() };
      await capturedExecute({ writer: fakeWriter });

      // Should have emitted finish chunk
      expect(fakeWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: "finish", finishReason: "stop" }),
      );

      // Should have dispatched evt_1 (message) and evt_2 (idle), but NOT evt_3
      expect(dispatchEventToCallbacks).toHaveBeenCalledTimes(2);
    }
  });

  it("closes the stream after emitting finish on requires_action", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_approval" },
      error: null,
    });

    const events = [
      { id: "evt_1", type: "session.status_idle", stop_reason: { type: "requires_action" } },
      { id: "evt_2", type: "agent.message", content: [{ type: "text", text: "never reached" }] },
    ];
    iterateSessionEventsForever.mockImplementation(async function* () {
      for (const e of events) yield e;
    });
    buildUiStreamCallbacks.mockReturnValue({});

    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(200);

    if (capturedExecute) {
      const fakeWriter = { write: vi.fn() };
      await capturedExecute({ writer: fakeWriter });

      expect(fakeWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: "finish", finishReason: "tool-calls" }),
      );
      // Only the idle event itself was dispatched; evt_2 was not reached
      expect(dispatchEventToCallbacks).toHaveBeenCalledTimes(1);
    }
  });

  it("closes the stream after emitting finish on retries_exhausted", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_retry" },
      error: null,
    });

    const events = [
      { id: "evt_1", type: "session.status_idle", stop_reason: { type: "retries_exhausted" } },
      { id: "evt_2", type: "agent.message", content: [{ type: "text", text: "never reached" }] },
    ];
    iterateSessionEventsForever.mockImplementation(async function* () {
      for (const e of events) yield e;
    });
    buildUiStreamCallbacks.mockReturnValue({});

    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(200);

    if (capturedExecute) {
      const fakeWriter = { write: vi.fn() };
      await capturedExecute({ writer: fakeWriter });

      expect(fakeWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({ type: "finish", finishReason: "error" }),
      );
      // Only the idle event itself was dispatched; evt_2 was not reached
      expect(dispatchEventToCallbacks).toHaveBeenCalledTimes(1);
    }
  });

  it("wires iterateSessionEventsForever with the correct session id and abort signal", async () => {
    maybeSingle.mockResolvedValue({
      data: { session_id: "sess_xyz" },
      error: null,
    });

    const events = [
      { id: "evt_1", type: "agent.message", content: [{ type: "text", text: "hi" }] },
    ];
    iterateSessionEventsForever.mockImplementation(async function* () {
      for (const e of events) yield e;
    });
    const mockCallbacks = { onAgentMessage: vi.fn() };
    buildUiStreamCallbacks.mockReturnValue(mockCallbacks);

    const res = await GET(
      new Request("http://localhost/api/chat/stream?threadId=t1"),
    );
    expect(res.status).toBe(200);

    // Execute the captured stream callback to verify wiring
    if (capturedExecute) {
      const fakeWriter = { write: vi.fn() };
      await capturedExecute({ writer: fakeWriter });

      expect(iterateSessionEventsForever).toHaveBeenCalledWith(
        {}, // anthropic client
        "sess_xyz",
        expect.any(AbortSignal),
        { afterId: null }, // no client cursor on first connection
      );
      expect(buildUiStreamCallbacks).toHaveBeenCalledWith(fakeWriter);
      expect(dispatchEventToCallbacks).toHaveBeenCalledWith(
        events[0],
        mockCallbacks,
      );

      // Verify the route emits a data-source-event-id marker per event
      expect(fakeWriter.write).toHaveBeenCalledWith({
        type: "data-source-event-id",
        data: { id: "evt_1" },
      });
    }
  });
});
