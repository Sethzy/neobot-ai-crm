/**
 * Tests for SessionChatTransport idle-aware reconnect behavior.
 *
 * Uses happy-dom for proper Web Streams API support (jsdom's
 * Response.body returns null for ReadableStream bodies).
 *
 * @vitest-environment happy-dom
 *
 * @module components/chat/session-chat-transport.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

type FetchCall = { url: string };
let fetchCalls: FetchCall[] = [];
let fetchResponders: Array<(url: string) => Response | null> = [];

function mockFetchImpl(url: string | URL | Request, _init?: RequestInit): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  fetchCalls.push({ url: urlStr });

  for (const responder of fetchResponders) {
    const resp = responder(urlStr);
    if (resp) return Promise.resolve(resp);
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

vi.stubGlobal("fetch", mockFetchImpl);

// ---------------------------------------------------------------------------
// Mock EventSourceParserStream — parse `data: ...\n\n` into objects
// ---------------------------------------------------------------------------

vi.mock("eventsource-parser/stream", () => ({
  EventSourceParserStream: class extends TransformStream<string, { data: string; event: string; id: string }> {
    constructor() {
      let buffer = "";
      super({
        transform(chunk, controller) {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            for (const line of part.split("\n")) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                controller.enqueue({ data: trimmed.slice(6), event: "", id: "" });
              }
            }
          }
        },
        flush(controller) {
          if (buffer.trim()) {
            for (const line of buffer.split("\n")) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                controller.enqueue({ data: trimmed.slice(6), event: "", id: "" });
              }
            }
          }
        },
      });
    }
  },
}));

import { SessionChatTransport } from "./session-chat-transport";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an SSE Response from event objects. */
function sseResponse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Wait for async stream processing to settle. */
function settle(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("SessionChatTransport — idle-aware reconnect", () => {
  beforeEach(() => {
    fetchCalls = [];
    fetchResponders = [];
  });

  afterEach(() => {
    fetchResponders = [];
  });

  it("does NOT auto-reconnect after a clean turn end (finish chunk received)", async () => {
    fetchResponders.push((url) => {
      if (url.includes("/api/chat/stream")) {
        return sseResponse([
          { type: "text-delta", textDelta: "hello" },
          { type: "finish", finishReason: "stop" },
        ]);
      }
      return null;
    });

    const transport = new SessionChatTransport("thread-1");

    // Wait for SSE to be consumed
    await settle(200);
    const callCountAfterInitial = fetchCalls.length;

    // Wait past the 1000ms reconnect delay
    await settle(1500);

    // No new fetch calls — reconnect was suppressed
    expect(fetchCalls.length).toBe(callCountAfterInitial);

    transport.destroy();
  });

  it("DOES auto-reconnect after a dirty close (no finish chunk)", async () => {
    let sseCallCount = 0;
    fetchResponders.push((url) => {
      if (url.includes("/api/chat/stream")) {
        sseCallCount++;
        return sseResponse([
          { type: "text-delta", textDelta: "partial" },
        ]);
      }
      return null;
    });

    const transport = new SessionChatTransport("thread-1");

    // Wait for dirty close + reconnect (1000ms delay)
    await settle(1500);

    expect(sseCallCount).toBeGreaterThanOrEqual(2);

    transport.destroy();
  });

  it("reconnects lazily in sendMessages after a clean turn end", async () => {
    let sseCallCount = 0;
    fetchResponders.push((url) => {
      if (url.includes("/api/chat/stream")) {
        sseCallCount++;
        return sseResponse([{ type: "finish", finishReason: "stop" }]);
      }
      if (url.includes("/api/chat/send")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return null;
    });

    const transport = new SessionChatTransport("thread-1");

    // Wait for initial SSE to complete (clean turn end)
    await settle(200);
    expect(sseCallCount).toBe(1);

    // Wait past reconnect window — should NOT reconnect
    await settle(1500);
    expect(sseCallCount).toBe(1);

    // Now send a message — should trigger lazy reconnect
    const stream = await transport.sendMessages({
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hello" }] },
      ] as never,
      abortSignal: new AbortController().signal,
      requestMetadata: {} as never,
    });

    await settle(100);

    expect(sseCallCount).toBe(2);
    const sendCalls = fetchCalls.filter((c) => c.url.includes("/api/chat/send"));
    expect(sendCalls.length).toBe(1);
    expect(stream).toBeInstanceOf(ReadableStream);

    transport.destroy();
  });
});
