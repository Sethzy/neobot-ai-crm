/**
 * Tests for SessionChatTransport — custom AI SDK v6 transport that uses
 * `/api/chat/send` + `/api/chat/stream` behind a feature flag.
 *
 * @module components/chat/__tests__/session-chat-transport.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage, UIMessageChunk } from "ai";

import { SessionChatTransport } from "../session-chat-transport";

// ---------------------------------------------------------------------------
// Helpers — build SSE payloads the way the real stream route emits them
// ---------------------------------------------------------------------------

/** Format a UIMessageChunk as an SSE `data:` line (mirrors JsonToSseTransformStream). */
function sseData(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/** SSE stream-end sentinel. */
function sseDone(): string {
  return "data: [DONE]\n\n";
}

/** Build a source-event-id marker the stream route emits before each Anthropic event. */
function sourceMarker(id: string): string {
  return sseData({ type: "data-source-event-id", data: { id } });
}

/** Build a minimal text-delta chunk. */
function textDelta(id: string, delta: string): string {
  return sseData({ type: "text-delta", id, delta });
}

/** Build a finish chunk the stream route emits on session idle. */
function finishChunk(): string {
  return sseData({ type: "finish", finishReason: "stop" });
}

/**
 * Create a mock fetch that returns an SSE stream body for GET requests
 * and { ok: true } for POST requests.
 */
function mockFetchWithSse(sseLines: string[]) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // POST /api/chat/send → 200 OK
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // GET /api/chat/stream → SSE body
    if (url.includes("/api/chat/stream")) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const line of sseLines) {
            controller.enqueue(encoder.encode(line));
          }
          controller.close();
        },
      });

      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return new Response("Not found", { status: 404 });
  });
}

/** Drain a ReadableStream into an array of chunks. */
async function drainStream<T>(
  stream: ReadableStream<T>,
): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

/** Build minimal sendMessages options for the transport. */
function makeSendOptions(text = "hello"): Parameters<SessionChatTransport["sendMessages"]>[0] {
  const message: UIMessage = {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
  return {
    trigger: "submit-message" as const,
    chatId: "thread-1",
    messageId: undefined,
    messages: [message],
    abortSignal: undefined,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionChatTransport", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("basic send + receive", () => {
    it("POSTs to /api/chat/send and returns chunks from the SSE stream", async () => {
      globalThis.fetch = mockFetchWithSse([
        sourceMarker("evt_1"),
        sseData({ type: "text-start", id: "evt_1" }),
        textDelta("evt_1", "Hi there"),
        sseData({ type: "text-end", id: "evt_1" }),
        sourceMarker("evt_2"),
        finishChunk(),
        sseDone(),
      ]);

      const transport = new SessionChatTransport("thread-1");
      try {
        const stream = await transport.sendMessages(makeSendOptions());
        const chunks = await drainStream(stream);

        // Should have text-start, text-delta, text-end, finish
        expect(chunks).toHaveLength(4);
        expect(chunks[0]).toEqual({ type: "text-start", id: "evt_1" });
        expect(chunks[1]).toEqual({
          type: "text-delta",
          id: "evt_1",
          delta: "Hi there",
        });
        expect(chunks[2]).toEqual({ type: "text-end", id: "evt_1" });
        expect(chunks[3]).toEqual({ type: "finish", finishReason: "stop" });

        // Verify POST was made to /api/chat/send
        const postCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          (c) => (c[1] as RequestInit | undefined)?.method === "POST",
        );
        expect(postCalls).toHaveLength(1);
        expect(postCalls[0][0]).toBe("/api/chat/send");
      } finally {
        transport.destroy();
      }
    });
  });

  describe("event dedup", () => {
    it("drops events with an already-seen source event id on reconnect replay", async () => {
      // Simulate a stream that replays evt_1 (already seen from a prior
      // connection) followed by a fresh evt_2.
      const sseLines = [
        // Replayed event (already in the seenSourceEventIds set)
        sourceMarker("evt_1"),
        textDelta("evt_1", "duplicate"),
        // Fresh event
        sourceMarker("evt_2"),
        sseData({ type: "text-start", id: "evt_2" }),
        textDelta("evt_2", "new text"),
        sseData({ type: "text-end", id: "evt_2" }),
        sourceMarker("evt_3"),
        finishChunk(),
        sseDone(),
      ];

      globalThis.fetch = mockFetchWithSse(sseLines);

      const transport = new SessionChatTransport("thread-1");
      // Pre-seed the dedup set to simulate a prior connection.
      // @ts-expect-error — accessing private for testing
      transport.seenSourceEventIds.add("evt_1");

      try {
        const stream = await transport.sendMessages(makeSendOptions());
        const chunks = await drainStream(stream);

        // Only the fresh event's chunks should appear (no "duplicate" delta).
        const types = chunks.map((c) => (c as { type: string }).type);
        expect(types).toEqual([
          "text-start",
          "text-delta",
          "text-end",
          "finish",
        ]);
        // Verify the text-delta is from evt_2, not evt_1
        expect((chunks[1] as { delta: string }).delta).toBe("new text");
      } finally {
        transport.destroy();
      }
    });

    it("replays a partially-delivered event on reconnect (deferred finalization)", async () => {
      // Simulate: evt_1 marker delivered + partial delta, then SSE drops.
      // On reconnect, evt_1 should NOT be in the seen set (only pending),
      // so the full replay is accepted.
      const sseLines = [
        sourceMarker("evt_1"),
        sseData({ type: "text-start", id: "evt_1" }),
        textDelta("evt_1", "hello"),
        sseData({ type: "text-end", id: "evt_1" }),
        sourceMarker("evt_2"),
        finishChunk(),
        sseDone(),
      ];

      globalThis.fetch = mockFetchWithSse(sseLines);

      const transport = new SessionChatTransport("thread-1");
      // Simulate: evt_1 was "pending" (marker seen, but NOT finalized
      // into seenSourceEventIds because the SSE dropped before the next
      // marker). On reconnect, pendingSourceEventId was reset to null.
      // So evt_1 is NOT in the seen set — the replay is accepted.
      // This is the default state (no pre-seeding), which is correct.

      try {
        const stream = await transport.sendMessages(makeSendOptions());
        const chunks = await drainStream(stream);

        // evt_1's chunks should appear (NOT skipped)
        const types = chunks.map((c) => (c as { type: string }).type);
        expect(types).toEqual([
          "text-start",
          "text-delta",
          "text-end",
          "finish",
        ]);
      } finally {
        transport.destroy();
      }
    });

    it("passes through events without a source-event-id marker", async () => {
      // Events like error or start-step may arrive without a source marker.
      const sseLines = [
        sseData({ type: "error", errorText: "something went wrong" }),
        sourceMarker("evt_1"),
        finishChunk(),
        sseDone(),
      ];

      globalThis.fetch = mockFetchWithSse(sseLines);

      const transport = new SessionChatTransport("thread-1");
      try {
        const stream = await transport.sendMessages(makeSendOptions());
        const chunks = await drainStream(stream);

        expect(chunks).toHaveLength(2);
        expect((chunks[0] as { type: string }).type).toBe("error");
        expect((chunks[1] as { type: string }).type).toBe("finish");
      } finally {
        transport.destroy();
      }
    });
  });

  describe("finish chunk handling", () => {
    it("closes the per-turn stream when a finish chunk arrives", async () => {
      globalThis.fetch = mockFetchWithSse([
        sourceMarker("evt_1"),
        textDelta("evt_1", "hello"),
        sourceMarker("evt_2"),
        finishChunk(),
        // Events after finish should not be enqueued (controller is closed)
        sourceMarker("evt_3"),
        textDelta("evt_3", "should not appear"),
        sseDone(),
      ]);

      const transport = new SessionChatTransport("thread-1");
      try {
        const stream = await transport.sendMessages(makeSendOptions());
        const chunks = await drainStream(stream);

        const types = chunks.map((c) => (c as { type: string }).type);
        expect(types).toEqual(["text-delta", "finish"]);
        // "should not appear" delta is NOT in the output
      } finally {
        transport.destroy();
      }
    });
  });

  describe("reconnectToStream", () => {
    it("returns null (SSE handles reconnection internally)", async () => {
      const transport = new SessionChatTransport("thread-1");
      try {
        const result = await transport.reconnectToStream({
          chatId: "thread-1",
        });
        expect(result).toBeNull();
      } finally {
        transport.destroy();
      }
    });
  });

  describe("approval detection", () => {
    it("POSTs { approval } instead of { message } for approval continuations", async () => {
      globalThis.fetch = mockFetchWithSse([
        sourceMarker("evt_1"),
        finishChunk(),
        sseDone(),
      ]);

      const transport = new SessionChatTransport("thread-1");
      try {
        // Build messages with an approval-responded tool invocation part.
        const assistantMessage: UIMessage = {
          id: "msg-assistant",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation" as const,
              toolCallId: "evt_42",
              toolName: "bash",
              state: "approval-responded",
              args: { command: "rm -rf /" },
              approval: { approved: true },
            } as never,
          ],
        };
        const options = {
          trigger: "submit-message" as const,
          chatId: "thread-1",
          messageId: undefined,
          messages: [assistantMessage],
          abortSignal: undefined,
        };

        await transport.sendMessages(options);

        // Find the POST call
        const postCalls = (
          globalThis.fetch as ReturnType<typeof vi.fn>
        ).mock.calls.filter(
          (c) => (c[1] as RequestInit | undefined)?.method === "POST",
        );
        expect(postCalls).toHaveLength(1);

        const postBody = JSON.parse(
          (postCalls[0][1] as RequestInit).body as string,
        );
        // Should contain approval, not message
        expect(postBody).toEqual({
          threadId: "thread-1",
          approval: { toolUseId: "evt_42", result: "allow" },
        });
        expect(postBody.message).toBeUndefined();
      } finally {
        transport.destroy();
      }
    });
  });

  describe("destroy", () => {
    it("prevents further SSE reconnection after destroy", async () => {
      globalThis.fetch = mockFetchWithSse([sseDone()]);

      const transport = new SessionChatTransport("thread-1");
      transport.destroy();

      // @ts-expect-error — accessing private for testing
      expect(transport.alive).toBe(false);
      // @ts-expect-error — accessing private for testing
      expect(transport.sseConnected).toBe(false);
    });
  });
});
